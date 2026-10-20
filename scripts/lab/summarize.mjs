#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertComparable, summarizeFrameIntervals } from "./continuity-metrics.mjs";

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Invalid ${label}`);
  }
}

export function validateReceipt(receipt) {
  if (!receipt || ![1, 2].includes(receipt.schemaVersion)) {
    throw new Error("Unknown receipt version");
  }
  const { metrics, scenario } = receipt;
  integer(metrics?.samples, "frame interval samples", 1);
  for (const name of ["p95Ms", "p99Ms"]) {
    if (!Number.isFinite(metrics[name]) || metrics[name] <= 0) {
      throw new Error(`Invalid metrics.${name}`);
    }
  }
  if (metrics.p99Ms < metrics.p95Ms) throw new Error("Invalid percentile order");
  integer(metrics.missedIntervals, "missedIntervals");
  if (metrics.missedIntervals > metrics.samples) throw new Error("Invalid missedIntervals");
  if (typeof scenario?.sortRadial !== "boolean") throw new Error("Missing sorting mode");
  integer(scenario.seed, "scenario.seed");
  integer(scenario.lodSplatCount, "scenario.lodSplatCount", 1);
  if (!["orbit", "reverse"].includes(scenario.motion)) throw new Error("Unknown motion");
  if (!["paged", "in-memory"].includes(receipt.fixture?.format)) throw new Error("Unknown source format");
  if (typeof receipt.repo?.sha !== "string" || !receipt.repo.sha) throw new Error("Missing repo.sha");
  assertComparable(receipt, receipt);

  if (receipt.schemaVersion === 2) {
    if (!/^[a-f0-9]{40}$/.test(receipt.repo.sha) || receipt.repo.dirty !== false) {
      throw new Error("Unverified source revision or dirty source tree");
    }
    for (const digest of [receipt.fixture.sha256, scenario.tapeSha256]) {
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid SHA-256");
    }
    integer(scenario.frames, "scenario.frames", 20);
    if (scenario.replay !== "frame-stepped-v2") throw new Error("Unknown replay policy");
    if (!Number.isFinite(scenario.targetHz) || scenario.targetHz <= 0 || metrics.budgetMs !== 1000 / scenario.targetHz) {
      throw new Error("Invalid frame budget");
    }
    integer(receipt.environment.canvas?.width, "canvas.width", 1);
    integer(receipt.environment.canvas?.height, "canvas.height", 1);
    if (!Number.isFinite(receipt.environment.canvas?.pixelRatio) || receipt.environment.canvas.pixelRatio <= 0) {
      throw new Error("Invalid canvas.pixelRatio");
    }
    for (const field of ["index", "repeatIndex", "retry"]) integer(receipt.trial?.[field], `trial.${field}`);
    if (typeof receipt.trial.project !== "string" || !receipt.trial.project) throw new Error("Missing trial.project");
    const computed = summarizeFrameIntervals(receipt.rawIntervals, metrics.budgetMs);
    if (computed.samples !== scenario.frames) throw new Error("Incomplete frame sample sequence");
    for (const [key, value] of Object.entries(computed)) {
      if (metrics[key] !== value) throw new Error(`Summary differs from raw intervals: ${key}`);
    }
    if (receipt.checks?.renderCalls !== scenario.frames) throw new Error("Unexpected render count");
    for (const field of ["initialNonBlackPixels", "recoveredNonBlackPixels"]) {
      integer(receipt.checks?.[field], field, 1);
      if (receipt.checks[field] > receipt.environment.canvas.width * receipt.environment.canvas.height) throw new Error("Impossible painted-pixel count");
    }
    const before = receipt.checks.initialPixelSha256;
    const after = receipt.checks.recoveredPixelSha256;
    if (receipt.checks.settledPixelsIdentical !== true || typeof before !== "string" || !/^[a-f0-9]{64}$/.test(before) || before !== after) {
      throw new Error("Invalid settled visual control");
    }
  }
  return receipt;
}

// No winner call: matched trials are observations, not statistical inference.
export function compareSortingReceipts(records) {
  if (!Array.isArray(records) || !records.length) throw new Error("No receipt evidence");
  const groups = new Map();
  for (const { runId, receipt } of records) {
    if (typeof runId !== "string" || !runId) throw new Error("Missing run identity");
    validateReceipt(receipt);
    const scenario = receipt.scenario;
    const key = JSON.stringify([
      runId, receipt.fixture.format, scenario.motion, scenario.seed,
      scenario.lodSplatCount, receipt.trial?.index ?? 0,
      receipt.trial?.repeatIndex ?? 0, receipt.trial?.retry ?? 0,
      receipt.trial?.project ?? "legacy",
    ]);
    const group = groups.get(key) ?? [];
    group.push(receipt);
    groups.set(key, group);
  }
  const results = [];
  for (const group of groups.values()) {
    const radial = group.filter((r) => r.scenario.sortRadial);
    const depth = group.filter((r) => !r.scenario.sortRadial);
    if (radial.length !== 1 || depth.length !== 1) {
      results.push({ state: "UNPAIRED", count: group.length, reason: "missing or duplicate sorting mode" });
      continue;
    }
    const a = radial[0];
    const b = depth[0];
    assertComparable(a, b);
    results.push({
      state: "DIAGNOSTIC_ONLY",
      schemaVersion: a.schemaVersion,
      sha: a.repo.sha,
      source: a.fixture.format,
      seed: a.scenario.seed,
      motion: a.scenario.motion,
      trial: a.trial ?? null,
      splatBudget: a.scenario.lodSplatCount,
      gpu: a.environment.gpu,
      deltaP95Ms: a.metrics.p95Ms - b.metrics.p95Ms,
      deltaP99Ms: a.metrics.p99Ms - b.metrics.p99Ms,
      deltaMissedIntervals: a.metrics.missedIntervals - b.metrics.missedIntervals,
      radialSettledReversible: a.checks?.settledPixelsIdentical ?? null,
      depthSettledReversible: b.checks?.settledPixelsIdentical ?? null,
    });
  }
  return results;
}

export async function readReceipts(root) {
  const records = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      records.push(...await readReceipts(full));
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "summary.json") {
      records.push({
        // Preserve the full leaf path: nested shards may have identical names.
        runId: path.resolve(root),
        receipt: JSON.parse(await readFile(full, "utf8")),
      });
    }
  }
  return records;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(process.argv[2] ?? "artifacts/spark-quackles");
    const records = await readReceipts(root);
    const comparisons = compareSortingReceipts(records);
    const expected = Number(process.env.SPARK_LAB_EXPECTED ?? records.length);
    integer(expected, "SPARK_LAB_EXPECTED", 1);
    const paired = comparisons.filter((r) => r.state === "DIAGNOSTIC_ONLY").length;
    const complete = paired * 2 === records.length && records.length === expected;
    const report = {
      schemaVersion: 2,
      sourceReceipts: records.length,
      expectedReceipts: expected,
      paired,
      complete,
      verdict: "INSUFFICIENT_FOR_UPSTREAM_PROMOTION",
      warnings: [
        "Software WebGL2 rAF intervals cannot establish hardware GPU latency",
        "Settled equality does not establish pixel continuity during motion",
        "Frame-stepped paths are not time-normalized input replays",
        "Schema-1 receipts lack render-count and raw-interval validation",
      ],
      comparisons,
    };
    await writeFile(path.join(root, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!complete) process.exitCode = 1;
  } catch (error) {
    console.error(`Receipt validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
