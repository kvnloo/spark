import test from "node:test";
import assert from "node:assert/strict";
import { compareSortingReceipts } from "./summarize.mjs";

function receipt(sortRadial, overrides = {}) {
  return {
    schemaVersion: 1,
    repo: { sha: "test-sha" },
    fixture: { sourceFamily: "same-master", sha256: "fixture", format: "paged" },
    scenario: { tapeSha256: "tape-1", lodSplatCount: 10_000, motion: "reverse", seed: 1, sortRadial },
    environment: {
      browser: "Chrome", gpu: "SwiftShader", os: "linux", dpr: 1,
      viewport: { width: 256, height: 256 }, instrumentation: "raf", network: "local", cache: "warm",
    },
    metrics: { samples: 59, p95Ms: sortRadial ? 34 : 20, p99Ms: sortRadial ? 60 : 40, missedIntervals: sortRadial ? 3 : 1 },
    checks: { settledPixelsIdentical: true },
    ...overrides,
  };
}

test("pairs exact-replay sorting modes and reports deltas without a winner", () => {
  const pair = compareSortingReceipts([
    { runId: "run-a", receipt: receipt(true) },
    { runId: "run-a", receipt: receipt(false) },
  ]);
  assert.deepEqual(pair.map((x) => x.state), ["DIAGNOSTIC_ONLY"]);
  assert.equal(pair[0].deltaP95Ms, 14);
  assert.equal(pair[0].deltaP99Ms, 20);
  assert.equal(pair[0].deltaMissedIntervals, 2);
});

test("never pairs results from different runs", () => {
  const result = compareSortingReceipts([
    { runId: "run-a", receipt: receipt(true) },
    { runId: "run-b", receipt: receipt(false) },
  ]);
  assert.deepEqual(result.map((x) => x.state), ["UNPAIRED", "UNPAIRED"]);
});

test("same key with mismatched source family is rejected", () => {
  assert.throws(() => compareSortingReceipts([
    { runId: "run-a", receipt: receipt(true) },
    { runId: "run-a", receipt: receipt(false, { fixture: { sourceFamily: "other", sha256: "fixture" } }) },
  ]), /sourceFamily/);
});

test("missing measurements and duplicate modes are never paired", () => {
  assert.throws(() => compareSortingReceipts([
    { runId: "run-a", receipt: receipt(true, { metrics: { samples: 0 } }) },
  ]), /Missing frame/);
  const result = compareSortingReceipts([
    { runId: "run-a", receipt: receipt(true) },
    { runId: "run-a", receipt: receipt(true) },
  ]);
  assert.equal(result[0].state, "UNPAIRED");
});
