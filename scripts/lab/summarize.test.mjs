import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { summarizeFrameIntervals } from "./continuity-metrics.mjs";
import { compareSortingReceipts, readReceipts, validateReceipt } from "./summarize.mjs";

function receipt(sortRadial) {
  const rawIntervals = Array.from({ length: 20 }, () => sortRadial ? 34 : 20);
  return {
    schemaVersion: 2,
    repo: { sha: "a".repeat(40), dirty: false },
    fixture: { sourceFamily: "same-master", sha256: "b".repeat(64), format: "paged" },
    scenario: { tapeSha256: "c".repeat(64), lodSplatCount: 10_000, motion: "reverse", seed: 1, sortRadial, frames: 20, targetHz: 60, replay: "frame-stepped-v2" },
    trial: { index: 0, repeatIndex: 0, retry: 0, project: "chromium" },
    environment: {
      browser: "Chrome", gpu: "SwiftShader", os: "linux", dpr: 1,
      viewport: { width: 1280, height: 720 }, canvas: { width: 256, height: 256, pixelRatio: 1 },
      instrumentation: "raf-v2", network: "local", cache: "initial-view-resident",
    },
    rawIntervals,
    metrics: summarizeFrameIntervals(rawIntervals),
    checks: { initialPixelSha256: "d".repeat(64), recoveredPixelSha256: "d".repeat(64), settledPixelsIdentical: true, initialNonBlackPixels: 100, recoveredNonBlackPixels: 100, renderCalls: 20 },
  };
}
const record = (sortRadial, runId = "run-a") => ({ runId, receipt: receipt(sortRadial) });

test("pairs exact-replay sorting modes without claiming a winner", () => {
  const pair = compareSortingReceipts([record(true), record(false)]);
  assert.equal(pair.length, 1);
  assert.equal(pair[0].state, "DIAGNOSTIC_ONLY");
  assert.equal(pair[0].deltaP95Ms, 14);
  assert.equal(pair[0].deltaP99Ms, 14);
  assert.equal(pair[0].deltaMissedIntervals, 20);
  assert.equal("winner" in pair[0], false);
});

test("never pairs independent runs", () => {
  const result = compareSortingReceipts([record(true, "run-a"), record(false, "run-b")]);
  assert.deepEqual(result.map((r) => r.state), ["UNPAIRED", "UNPAIRED"]);
});

test("duplicate modes cannot silently overwrite a valid comparison", () => {
  const result = compareSortingReceipts([record(true), record(false), record(true)]);
  assert.equal(result[0].state, "UNPAIRED");
  assert.equal(result[0].count, 3);
});

for (const key of ["index", "repeatIndex", "retry", "project"]) {
  test(`keeps separate trial ${key} strata`, () => {
    const a = record(true), b = record(false);
    b.receipt.trial[key] = key === "project" ? "firefox" : 1;
    assert.deepEqual(compareSortingReceipts([a,b]).map((r) => r.state), ["UNPAIRED", "UNPAIRED"]);
  });
}

for (const [name, change] of [
  ["source family", (r) => { r.fixture.sourceFamily = "other"; }],
  ["source checksum", (r) => { r.fixture.sha256 = "d".repeat(64); }],
  ["input tape", (r) => { r.scenario.tapeSha256 = "e".repeat(64); }],
  ["source revision", (r) => { r.repo.sha = "f".repeat(40); }],
  ["draw buffer", (r) => { r.environment.canvas.width = 512; }],
  ["browser version", (r) => { r.environment.browser = "other"; }],
]) {
  test(`rejects mismatched ${name}`, () => {
    const a=record(true), b=record(false); change(b.receipt);
    assert.throws(() => compareSortingReceipts([a,b]), /Not comparable/);
  });
}

for (const [name, change] of [
  ["missing measurements", (r) => { delete r.metrics; }],
  ["missing sample count", (r) => { delete r.metrics.samples; }],
  ["zero samples", (r) => { r.metrics.samples = 0; }],
  ["null percentile", (r) => { r.metrics.p95Ms = null; }],
  ["nonfinite percentile", (r) => { r.metrics.p99Ms = Infinity; }],
  ["negative missed count", (r) => { r.metrics.missedIntervals = -1; }],
  ["percentile ordering", (r) => { r.metrics.p99Ms = 1; }],
  ["dirty source", (r) => { r.repo.dirty = true; }],
  ["placeholder revision", (r) => { r.repo.sha = "unknown"; }],
  ["missing canvas", (r) => { delete r.environment.canvas; }],
  ["unknown GPU", (r) => { r.environment.gpu = "unknown"; }],
  ["summary tampering", (r) => { r.metrics.p95Ms += 1; r.metrics.p99Ms += 1; }],
  ["truncated raw samples", (r) => { r.rawIntervals.pop(); }],
  ["missing raw samples", (r) => { delete r.rawIntervals; }],
  ["sparse raw samples", (r) => { delete r.rawIntervals[1]; }],
  ["double render", (r) => { r.checks.renderCalls++; }],
  ["blank control", (r) => { r.checks.initialNonBlackPixels = 0; }],
  ["failed visual recovery", (r) => { r.checks.settledPixelsIdentical = false; }],
  ["non-numeric painted count", (r) => { r.checks.initialNonBlackPixels = "100"; }],
  ["impossible painted count", (r) => { r.checks.initialNonBlackPixels = 1e9; }],
  ["contradictory pixel hashes", (r) => { r.checks.recoveredPixelSha256 = "e".repeat(64); }],
  ["missing trial", (r) => { delete r.trial; }],
  ["unknown version", (r) => { r.schemaVersion = 42; }],
]) {
  test(`rejects ${name}`, () => {
    const r = receipt(true); change(r);
    assert.throws(() => validateReceipt(r));
  });
}

test("empty input is not successful evidence", () => {
  assert.throws(() => compareSortingReceipts([]), /No receipt evidence/);
});

test("nested shards with identical leaf names remain independent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "spark-receipts-"));
  try {
    for (const [shard, mode] of [["a", true], ["b", false]]) {
      const dir = path.join(root, shard, "same-name");
      await mkdir(dir, {recursive: true});
      await writeFile(path.join(dir, "trial.json"), JSON.stringify(receipt(mode)));
    }
    await writeFile(path.join(root, "summary.json"), "{\"notAReceipt\":true}");
    const records = await readReceipts(root);
    assert.equal(records.length, 2);
    assert.notEqual(records[0].runId, records[1].runId);
    assert.deepEqual(compareSortingReceipts(records).map((r) => r.state), ["UNPAIRED", "UNPAIRED"]);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("CLI fails closed on missing, empty, or incomplete evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "spark-cli-"));
  const cli = path.join(import.meta.dirname, "summarize.mjs");
  const run = (directory, expected) => spawnSync(process.execPath, [cli, directory], {encoding: "utf8", env: {...process.env, SPARK_LAB_EXPECTED: String(expected)}});
  try {
    assert.equal(run(path.join(root, "missing"), 2).status, 1);
    assert.equal(run(root, 2).status, 1);
    await writeFile(path.join(root, "radial.json"), JSON.stringify(receipt(true)));
    assert.equal(run(root, 2).status, 1);
    await writeFile(path.join(root, "depth.json"), JSON.stringify(receipt(false)));
    assert.equal(run(root, 2).status, 0);
    assert.equal(run(root, 4).status, 1);
  } finally { await rm(root, {recursive: true, force: true}); }
});
