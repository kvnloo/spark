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
  schemaVersion?: number;
  runId?: string;
  repo?: { sha?: string };
  fixture?: { sourceFamily?: string; sha256?: string; format?: string };
  scenario?: {
    tapeSha256?: string;
    replay?: string;
    frames?: number;
    lodSplatCount?: number;
    targetHz?: number;
  };
  metrics?: { budgetMs?: number };
  environment?: {
    browser?: string;
    gpu?: string;
    os?: string;
    hostFingerprint?: string;
    dpr?: number;
    viewport?: { width: number; height: number };
    canvas?: { width: number; height: number; pixelRatio: number };
    instrumentation?: string;
    cache?: string;
    network?: string;
  };
};
export function assertComparable(
  a: ComparableReceipt,
  b: ComparableReceipt,
): true;
