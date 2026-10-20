#!/usr/bin/env node
// Downstream integration experiment: a real RAD scene, real loopback HTTP and
// the compiled Rust/WASM decoder. No mock fetch, mock decoder or browser/GPU.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import {
  decode_rad_header,
  decode_to_packedsplats,
  initSync,
} from "../../rust/spark-rs/pkg/spark_rs.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (text) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
const root = new URL("../../", import.meta.url);
const source = await readFile(
  new URL("src/PagedSplatsFetcher.ts", root),
  "utf8",
);
assert.equal(
  hash(source),
  "1f602d68c5eb0d893cc20e8c5c8799a60fbc7b8329a6b7ace1e4ee003f94087e",
);
const fixed = source.replace(
  "    return new Uint8Array(await response.arrayBuffer());",
  `    const data = new Uint8Array(await response.arrayBuffer());
    // A server may ignore Range and return the full representation with 200.
    if (
      response.status === 200 &&
      offset !== undefined &&
      bytes !== undefined
    ) {
      return data.slice(offset, offset + bytes);
    }
    return data;`,
);
// The candidate must be byte-for-byte identical to the actual draft PR source.
assert.equal(gitBlob(fixed), "e585943666ae6780895c97e714a5cae7449ca4c4");
async function loadFetcher(text) {
  const outputText = stripTypeScriptTypes(text);
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const baseline = await loadFetcher(source);
const candidate = await loadFetcher(fixed);
const wasmBytes = await readFile(
  new URL("rust/spark-rs/pkg/spark_rs_bg.wasm", root),
);
initSync({ module: wasmBytes });
const file = await readFile(
  new URL("test/browser/fixtures/furry-logo-pedestal-lod.rad", root),
);
const original = await readFile(
  new URL("test/browser/fixtures/furry-logo-pedestal.spz", root),
);
assert.equal(
  hash(original),
  "882af7282cb88085fe364949097221f53a2e5e64b8b03d6d22ff70805e635a02",
);
const { meta, chunksStart } = decode_rad_header(file);

function decodedFingerprint(bytes) {
  // Same packed decoder and unset encoding/codebooks as loadPackedSplats.
  const decoder = decode_to_packedsplats("rad", undefined, undefined);
  try {
    decoder.push(bytes);
    const result = decoder.finish(); // finish consumes the decoder.
    return {
      numSplats: result.numSplats,
      lodOpacity: result.splatEncoding.lodOpacity,
      buffers: Object.fromEntries(
        Object.entries(result)
          .filter(([, value]) => ArrayBuffer.isView(value))
          .map(([key, value]) => [
            key,
            hash(
              new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
            ),
          ]),
      ),
    };
  } finally {
    if (decoder.__wbg_ptr) decoder.free();
  }
}
const ranges = [];
for (let index = 0; index < meta.chunks.length; index++) {
  const chunk = meta.chunks[index];
  const offset = chunksStart + chunk.offset;
  const bytes = file.subarray(offset, offset + chunk.bytes);
  const separate = await readFile(
    new URL(
      `test/browser/fixtures/chunked/furry-logo-pedestal-lod-${index}.radc`,
      root,
    ),
  );
  assert.deepEqual(
    bytes,
    separate,
    `Chunk ${index}: monolithic and chunked fixtures differ`,
  );
  ranges.push({
    index,
    offset,
    bytes: chunk.bytes,
    sha256: hash(bytes),
    decoded: decodedFingerprint(bytes),
  });
}
assert.equal(
  ranges.reduce((sum, r) => sum + r.decoded.numSplats, 0),
  meta.count,
);

const requests = [];
const server = createServer((request, response) => {
  const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
  if (!match || !["/range", "/ignore"].includes(request.url)) {
    response.writeHead(400);
    response.end();
    return;
  }
  const offset = Number(match[1]);
  const end = Math.min(Number(match[2]) + 1, file.length);
  const status = request.url === "/range" ? 206 : 200;
  const body = status === 206 ? file.subarray(offset, end) : file;
  requests.push({
    status,
    range: request.headers.range,
    servedBytes: body.byteLength,
  });
  response.writeHead(status, {
    "Content-Length": body.byteLength,
    ...(status === 206
      ? { "Content-Range": `bytes ${offset}-${end - 1}/${file.length}` }
      : {}),
  });
  response.end(body);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});
const address = server.address();
assert.ok(address && typeof address !== "string");
const cases = [];
try {
  for (const [label, { UrlPagedSplatsFetcher }] of [
    ["upstream", baseline],
    ["draft-pr2", candidate],
  ]) {
    for (const endpoint of ["/range", "/ignore"]) {
      const fetcher = new UrlPagedSplatsFetcher(
        `http://127.0.0.1:${address.port}${endpoint}`,
        undefined,
        false,
      );
      for (const range of ranges) {
        const data = await fetcher.fetchRange(
          AbortSignal.timeout(15_000),
          range.offset,
          range.bytes,
        );
        let decoded = null;
        let decodeError = null;
        try {
          decoded = decodedFingerprint(data);
        } catch (error) {
          decodeError = String(error);
        }
        const bytesMatch = hash(data) === range.sha256;
        const decodedMatch =
          JSON.stringify(decoded) === JSON.stringify(range.decoded);
        const expectedMatch = label === "draft-pr2" || endpoint === "/range";
        assert.equal(
          bytesMatch,
          expectedMatch,
          `${label} ${endpoint} chunk ${range.index}: bytes`,
        );
        assert.equal(
          decodedMatch,
          expectedMatch,
          `${label} ${endpoint} chunk ${range.index}: decoder`,
        );
        assert.equal(
          decodeError,
          null,
          "All cases must reach the real decoder",
        );
        if (!expectedMatch) assert.equal(decoded.numSplats, meta.count);
        cases.push({
          label,
          endpoint,
          chunk: range.index,
          returnedBytes: data.byteLength,
          bytesMatch,
          decodedMatch,
          decodedSplats: decoded?.numSplats ?? null,
          decodeError,
          expectedMatch,
        });
      }
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
const receipt = {
  kind: "REAL_RAD_HTTP_WASM_INTEGRATION_NOT_GPU_BENCHMARK",
  createdAt: new Date().toISOString(),
  baselineSha: "ffe210dc0a45d0515a06c9235878108112827d61",
  candidateSha: "c0caf23fef4943a036e6cad6f170f24642b7d468",
  candidateSourceBlob: gitBlob(fixed),
  wasmSha256: hash(wasmBytes),
  fixture: {
    exportedArtifactId: process.env.SPARK_FIXTURE_ARTIFACT ?? null,
    sourceSpzSha256: hash(original),
    radSha256: hash(file),
    radBytes: file.length,
    count: meta.count,
    chunksStart,
    ranges,
  },
  cases,
  requests,
  positiveCases: cases.filter((c) => c.expectedMatch).length,
  detectedBaselineFailures: cases.filter((c) => !c.expectedMatch).length,
  limitations: [
    "Single generated source fixture; not a browser, network performance or physical-device result",
    "200 fallback still downloads the entire representation",
    "RAD metadata includes build timings; compare source/chunk hashes rather than assuming separately regenerated RAD file hashes match",
  ],
};
const output = path.resolve(
  process.argv[2] ?? "artifacts/rad-http-roundtrip/receipt.json",
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      output,
      positiveCases: receipt.positiveCases,
      detectedBaselineFailures: receipt.detectedBaselineFailures,
      cases,
    },
    null,
    2,
  ),
);
