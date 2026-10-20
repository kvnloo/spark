import assert from "node:assert/strict";
import test from "node:test";
import {
  assertComparable,
  summarizeFrameIntervals,
} from "./continuity-metrics.mjs";

function common() {
  return {
    repo: { sha: "a".repeat(40) },
    fixture: { sourceFamily: "one-master", sha256: "b".repeat(64) },
    scenario: { tapeSha256: "c".repeat(64) },
    environment: {
      browser: "Chrome 153",
      gpu: "SwiftShader",
      os: "linux",
      dpr: 1,
      viewport: { width: 1280, height: 720 },
      instrumentation: "raf-v2",
      cache: "initial-view-resident",
      network: "local",
    },
  };
}

test("sparse frame arrays cannot hide invalid samples", () => {
  assert.throws(() => summarizeFrameIntervals(new Array(3)), /finite/);
});
test("mean calculation does not overflow finite intervals", () => {
  assert.equal(summarizeFrameIntervals([1e308, 1e308], 1e308).meanMs, 1e308);
});
test("comparing viewport dimensions is independent of JSON key ordering", () => {
  const a = common();
  const b = common();
  b.environment.viewport = { height: 720, width: 1280 };
  assert.equal(assertComparable(a, b), true);
});
for (const invalid of [null, "", "unknown"]) {
  test(`equal invalid GPU metadata is not evidence: ${String(invalid)}`, () => {
    const a = common();
    const b = common();
    a.environment.gpu = invalid;
    b.environment.gpu = invalid;
    assert.throws(() => assertComparable(a, b), /gpu/);
  });
}
test("sort comparisons must not cross repository revisions", () => {
  const a = common();
  const b = common();
  b.repo.sha = "d".repeat(40);
  assert.throws(() => assertComparable(a, b), /repo.sha/);
});
test("zero viewport dimensions cannot qualify a comparison", () => {
  const a = common();
  const b = common();
  a.environment.viewport.width = 0;
  b.environment.viewport.width = 0;
  assert.throws(() => assertComparable(a, b), /viewport.width/);
});
test("drawing buffer resolution cannot differ even with the same browser viewport", () => {
  const a = common();
  const b = common();
  a.environment.canvas = { width: 256, height: 256, pixelRatio: 1 };
  b.environment.canvas = { width: 512, height: 512, pixelRatio: 2 };
  assert.throws(() => assertComparable(a, b), /canvas.width/);
});
test("frame target and budget cannot differ", () => {
  const a = common();
  const b = common();
  a.metrics = { budgetMs: 1000 / 60 };
  b.metrics = { budgetMs: 1000 / 120 };
  assert.throws(() => assertComparable(a, b), /budgetMs/);
});
test("frame interval summary does not mutate the sample order", () => {
  const original = [40, 16, 60, 16];
  const input = [...original];
  summarizeFrameIntervals(input);
  assert.deepEqual(input, original);
});
test("empty intervals stay missing evidence", () => {
  const result = summarizeFrameIntervals([]);
  assert.equal(result.samples, 0);
  assert.equal(result.p95Ms, null);
});
