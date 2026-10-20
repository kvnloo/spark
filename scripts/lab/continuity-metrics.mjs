// rAF intervals measure browser scheduling, not GPU completion or input latency.
export function summarizeFrameIntervals(intervals, budgetMs = 1000 / 60) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new RangeError("budgetMs must be positive and finite");
  }
  if (!Array.isArray(intervals)) {
    throw new TypeError("intervals must be an array");
  }
  let mean = 0;
  let samples = 0;
  let streak = 0;
  let longestStreak = 0;
  let missedVsyncs = 0;
  // Unlike Array.some/filter, iteration also visits holes in sparse arrays.
  for (const ms of intervals) {
    if (!Number.isFinite(ms) || ms <= 0 || !Number.isFinite(ms / budgetMs)) {
      throw new RangeError(
        "intervals must contain only positive, finite numbers",
      );
    }
    samples++;
    mean += (ms - mean) / samples;
    streak = ms > budgetMs * 1.5 ? streak + 1 : 0;
    longestStreak = Math.max(streak, longestStreak);
    missedVsyncs += Math.max(0, Math.round(ms / budgetMs) - 1);
  }
  if (!Number.isFinite(missedVsyncs)) {
    throw new RangeError("estimated missed vsync count overflows");
  }
  const sorted = intervals.toSorted((a, b) => a - b);
  const percentile = (p) =>
    samples ? sorted[Math.ceil(samples * p) - 1] : null;
  return {
    samples,
    budgetMs,
    meanMs: samples ? mean : null,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.at(-1) ?? null,
    intervalsOver2xBudget: intervals.filter((ms) => ms > budgetMs * 2 + 0.25)
      .length,
    intervalsOver50Ms: intervals.filter((ms) => ms > 50).length,
    missedIntervals: intervals.filter((ms) => ms > budgetMs * 1.5).length,
    estimatedMissedVsyncs: missedVsyncs,
    maxConsecutiveMisses: longestStreak,
  };
}

const get = (value, key) =>
  key.split(".").reduce((object, part) => object?.[part], value);

// Only the tested sorting mode may differ. Optional v2 fields become required
// on both sides as soon as either receipt supplies them.
export function assertComparable(a, b) {
  const strings = [
    "fixture.sourceFamily",
    "fixture.sha256",
    "scenario.tapeSha256",
    "environment.browser",
    "environment.gpu",
    "environment.os",
    "environment.instrumentation",
    "environment.cache",
    "environment.network",
  ];
  const numbers = [
    "environment.dpr",
    "environment.viewport.width",
    "environment.viewport.height",
  ];
  const extraStrings = [
    "runId",
    "environment.hostFingerprint",
    "repo.sha",
    "fixture.format",
    "scenario.replay",
  ];
  const extraNumbers = [
    "schemaVersion",
    "environment.canvas.width",
    "environment.canvas.height",
    "environment.canvas.pixelRatio",
    "scenario.frames",
    "scenario.lodSplatCount",
    "scenario.targetHz",
    "metrics.budgetMs",
  ];
  for (const field of extraStrings) {
    if (get(a, field) !== undefined || get(b, field) !== undefined)
      strings.push(field);
  }
  for (const field of extraNumbers) {
    if (get(a, field) !== undefined || get(b, field) !== undefined)
      numbers.push(field);
  }
  for (const field of [...strings, ...numbers]) {
    const left = get(a, field);
    const right = get(b, field);
    const valid = strings.includes(field)
      ? typeof left === "string" &&
        left.trim().length > 0 &&
        !/^(unknown|unavailable)$/i.test(left.trim())
      : Number.isFinite(left) && left > 0;
    if (!valid || left !== right) {
      throw new Error(`Not comparable: ${field} differs or is missing/invalid`);
    }
  }
  return true;
}
