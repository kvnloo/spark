import { createServer } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import { UrlPagedSplatsFetcher } from "../../src/PagedSplatsFetcher";

const source = Uint8Array.from({ length: 32 }, (_, i) => i);
const requests: { url: string | undefined; range: string | undefined }[] = [];
let base: string;
let slowRequested: (() => void) | undefined;
const server = createServer((request, response) => {
  requests.push({ url: request.url, range: request.headers.range });
  if (request.url === "/slow") {
    slowRequested?.();
    return;
  }
  if (request.url === "/error") {
    response.writeHead(503);
    response.end("unavailable");
    return;
  }
  if (request.url === "/partial" && request.headers.range) {
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range);
    if (!range) {
      response.writeHead(400);
      response.end();
      return;
    }
    const offset = Number(range[1]);
    const last = Math.min(Number(range[2]), source.length - 1);
    if (offset >= source.length) {
      response.writeHead(416, { "Content-Range": `bytes */${source.length}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      "Content-Range": `bytes ${offset}-${last}/${source.length}`,
    });
    response.end(source.slice(offset, last + 1));
    return;
  }
  // RFC 9110 section 14.2 permits a server to ignore the Range header.
  response.writeHead(200, { "Content-Length": source.length });
  response.end(source);
});

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing HTTP fixture address");
  }
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const signal = new AbortController().signal;
const ranges = [0, 1, 16, 30, 31].flatMap((offset) =>
  [1, 2, 8, 64].map((bytes) => ({ offset, bytes })),
);
for (const endpoint of ["/ignore", "/partial"]) {
  test.each(ranges)(
    `${endpoint} returns the requested bytes at offset=$offset, bytes=$bytes`,
    async ({ offset, bytes }) => {
      const fetcher = new UrlPagedSplatsFetcher(
        `${base}${endpoint}`,
        undefined,
        false,
      );
      const result = await fetcher.fetchRange(signal, offset, bytes);
      expect(result).toEqual(source.slice(offset, offset + bytes));
      expect(result.buffer.byteLength).toBe(result.byteLength);
      expect(requests[requests.length - 1].range).toBe(
        `bytes=${offset}-${offset + bytes - 1}`,
      );
    },
  );
}

test("an un-ranged chunk keeps its complete response", async () => {
  const fetcher = new UrlPagedSplatsFetcher(
    `${base}/scene-lod-0.spz`,
    undefined,
    false,
  );
  expect(await fetcher.fetchChunkById(signal, 2)).toEqual(source);
  expect(requests[requests.length - 1].range).toBeUndefined();
  expect(requests[requests.length - 1].url).toBe("/scene-lod-2.spz");
});

test("non-success responses still reject", async () => {
  const fetcher = new UrlPagedSplatsFetcher(`${base}/error`, undefined, false);
  await expect(fetcher.fetchRange(signal, 0, 2)).rejects.toThrow("503");
});

test("unsatisfiable HTTP ranges still reject", async () => {
  const fetcher = new UrlPagedSplatsFetcher(
    `${base}/partial`,
    undefined,
    false,
  );
  await expect(fetcher.fetchRange(signal, 40, 2)).rejects.toThrow("416");
});

test("abort reaches a real HTTP request", async () => {
  const controller = new AbortController();
  const requested = new Promise<void>((resolve) => {
    slowRequested = resolve;
  });
  const fetcher = new UrlPagedSplatsFetcher(`${base}/slow`, undefined, false);
  const request = fetcher.fetchRange(controller.signal, 0, 2);
  const rejected = expect(request).rejects.toMatchObject({
    name: "AbortError",
  });
  await requested;
  controller.abort();
  await rejected;
});
