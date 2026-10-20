// Summarize requestAnimationFrame intervals: browser scheduling, not GPU
// completion times or a measurement of rendered pixels.
export function summarizeFrameIntervals(intervals, budgetMs = 1000 / 60) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new RangeError("budgetMs must be positive and finite");
  }
  if (!Array.isArray(intervals)) {
    throw new TypeError("intervals must be an array");
  }
  if (intervals.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("intervals must contain only positive, finite numbers");
  }

  const sorted = intervals.toSorted((a, b) => a - b);
  const percentile = (p) =>
    sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  let streak = 0;
  let longestStreak = 0;
  for (const ms of intervals) {
    streak = ms > budgetMs * 1.5 ? streak + 1 : 0;
    longestStreak = Math.max(streak, longestStreak);
  }

  return {
    samples: intervals.length,
    budgetMs,
    meanMs: intervals.length
      ? intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length
      : null,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.at(-1) ?? null,
    intervalsOver2xBudget: intervals.filter((ms) => ms > budgetMs * 2 + 0.25)
      .length,
    intervalsOver50Ms: intervals.filter((ms) => ms > 50).length,
    missedIntervals: intervals.filter((ms) => ms > budgetMs * 1.5).length,
    estimatedMissedVsyncs: intervals.reduce(
      (sum, ms) => sum + Math.max(0, Math.round(ms / budgetMs) - 1),
      0,
    ),
    maxConsecutiveMisses: longestStreak,
  };
}

// Reject invalid A/B comparisons across sources, tapes, devices, or probes.
// Non-comparable receipts can still be inspected separately.
export function assertComparable(a, b) {
  const same = [
    ["fixture.sourceFamily", a.fixture?.sourceFamily, b.fixture?.sourceFamily],
    ["fixture.sha256", a.fixture?.sha256, b.fixture?.sha256],
    ["scenario.tapeSha256", a.scenario?.tapeSha256, b.scenario?.tapeSha256],
    ["environment.browser", a.environment?.browser, b.environment?.browser],
    ["environment.gpu", a.environment?.gpu, b.environment?.gpu],
    ["environment.os", a.environment?.os, b.environment?.os],
    ["environment.dpr", a.environment?.dpr, b.environment?.dpr],
    ["environment.viewport", JSON.stringify(a.environment?.viewport), JSON.stringify(b.environment?.viewport)],
    ["environment.instrumentation", a.environment?.instrumentation, b.environment?.instrumentation],
    ["environment.cache", a.environment?.cache, b.environment?.cache],
    ["environment.network", a.environment?.network, b.environment?.network],
  ];
  for (const [name, left, right] of same) {
    if (left === undefined || right === undefined || left !== right) {
      throw new Error(`Not comparable: ${name} differs or is missing`);
    }
  }
  return true;
}
