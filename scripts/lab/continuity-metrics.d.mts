export type FrameIntervalSummary = {
  samples: number;
  budgetMs: number;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  intervalsOver2xBudget: number;
  intervalsOver50Ms: number;
  missedIntervals: number;
  estimatedMissedVsyncs: number;
  maxConsecutiveMisses: number;
};

export function summarizeFrameIntervals(
  intervals: number[],
  budgetMs?: number,
): FrameIntervalSummary;

export type ComparableReceipt = {
  fixture?: { sourceFamily?: string; sha256?: string };
  scenario?: { tapeSha256?: string };
  environment?: {
    browser?: string;
    gpu?: string;
    os?: string;
    dpr?: number;
    viewport?: { width: number; height: number };
    instrumentation?: string;
    cache?: string;
    network?: string;
  };
};

export function assertComparable(a: ComparableReceipt, b: ComparableReceipt): true;
