import assert from "node:assert/strict";
import test from "node:test";
import {
  assertComparable,
  summarizeFrameIntervals,
} from "./continuity-metrics.mjs";

test("empty samples are missing evidence, not zero-latency rendering", () => {
  const result = summarizeFrameIntervals([]);
  assert.equal(result.samples, 0);
  assert.equal(result.meanMs, null);
  assert.equal(result.p99Ms, null);
});

test("percentiles and missed frames use unsorted time-order for streaks", () => {
  const result = summarizeFrameIntervals([16, 16, 40, 50, 16, 60], 1000 / 60);
  assert.equal(result.samples, 6);
  assert.equal(result.p50Ms, 16);
  assert.equal(result.p95Ms, 60);
  assert.equal(result.p99Ms, 60);
  assert.equal(result.maxConsecutiveMisses, 2);
  assert.equal(result.intervalsOver2xBudget, 3);
  assert.equal(result.intervalsOver50Ms, 1);
  assert.equal(result.estimatedMissedVsyncs, 6);
});

test("invalid frame intervals are rejected, not filtered out", () => {
  assert.throws(() => summarizeFrameIntervals([16, NaN]), RangeError);
  assert.throws(() => summarizeFrameIntervals([0]), RangeError);
  assert.throws(() => summarizeFrameIntervals([Infinity]), RangeError);
  assert.throws(() => summarizeFrameIntervals([16], 0), RangeError);
  assert.throws(() => summarizeFrameIntervals(null), TypeError);
});

const common = {
  fixture: { sourceFamily: "spark-fixture", sha256: "a" },
  scenario: { tapeSha256: "tape" },
  environment: {
    browser: "Chromium 151",
    gpu: "SwiftShader",
    os: "linux",
    dpr: 1,
    viewport: { width: 256, height: 256 },
    instrumentation: "raf-sampler",
    cache: "warm",
    network: "local",
  },
};

test("source-family and input-tape comparability is enforced", () => {
  assert.equal(assertComparable(common, structuredClone(common)), true);
  assert.throws(
    () =>
      assertComparable(common, {
        ...common,
        fixture: { ...common.fixture, sha256: "different-master" },
      }),
    /fixture.sha256/,
  );
  assert.throws(
    () =>
      assertComparable(common, {
        ...common,
        scenario: { tapeSha256: "different-input" },
      }),
    /scenario.tapeSha256/,
  );
  assert.throws(
    () =>
      assertComparable(common, {
        ...common,
        environment: { ...common.environment, dpr: 2 },
      }),
    /environment.dpr/,
  );
  assert.throws(() => assertComparable(common, {}), /missing/);
});
