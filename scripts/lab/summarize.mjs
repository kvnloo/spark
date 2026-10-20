#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertComparable } from "./continuity-metrics.mjs";

// Pair radial-vs-depth sorting only within one exact-replay experiment run.
// This is a diagnostic report, never a statistical-performance winner call.
export function compareSortingReceipts(records) {
  const groups = new Map();
  for (const { runId, receipt } of records) {
    if (receipt.schemaVersion !== 1) throw new Error("Unknown receipt version");
    if (receipt.metrics?.samples < 1) throw new Error("Missing frame interval samples");
    const scenario = receipt.scenario;
    if (typeof scenario?.sortRadial !== "boolean") {
      throw new Error("Missing sorting mode");
    }
    const key = JSON.stringify([
      runId,
      receipt.fixture?.sha256,
      scenario?.tapeSha256,
      scenario?.lodSplatCount,
      scenario?.motion,
      receipt.environment?.gpu,
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
      results.push({ state: "UNPAIRED", count: group.length });
      continue;
    }
    assertComparable(radial[0], depth[0]);
    results.push({
      state: "DIAGNOSTIC_ONLY",
      sha: radial[0].repo?.sha ?? null,
      source: radial[0].fixture?.format,
      seed: radial[0].scenario.seed,
      motion: radial[0].scenario.motion,
      splatBudget: radial[0].scenario.lodSplatCount,
      gpu: radial[0].environment.gpu,
      // Positive value means radial has a larger rAF interval than depth.
      deltaP95Ms: radial[0].metrics.p95Ms - depth[0].metrics.p95Ms,
      deltaP99Ms: radial[0].metrics.p99Ms - depth[0].metrics.p99Ms,
      deltaMissedIntervals:
        radial[0].metrics.missedIntervals - depth[0].metrics.missedIntervals,
      radialSettledReversible: radial[0].checks?.settledPixelsIdentical ?? null,
      depthSettledReversible: depth[0].checks?.settledPixelsIdentical ?? null,
    });
  }
  return results;
}

async function readReceipts(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      records.push(...(await readReceipts(full)).map((x) => ({ ...x, runId: entry.name })));
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "summary.json") {
      records.push({
        runId: path.basename(root),
        receipt: JSON.parse(await readFile(full, "utf8")),
      });
    }
  }
  return records;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? "artifacts/spark-quackles");
  const records = await readReceipts(root);
  const results = compareSortingReceipts(records);
  const report = {
    schemaVersion: 1,
    sourceReceipts: records.length,
    paired: results.filter((r) => r.state === "DIAGNOSTIC_ONLY").length,
    verdict: "INSUFFICIENT_FOR_UPSTREAM_PROMOTION",
    warnings: [
      "Software WebGL2 rAF intervals cannot establish hardware GPU latency",
      "No pixel continuity during motion was measured",
      "Each candidate needs repeated trials and reference-fidelity checks",
    ],
    comparisons: results,
  };
  await writeFile(path.join(root, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
