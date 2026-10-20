import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { summarizeFrameIntervals } from "../../scripts/lab/continuity-metrics.mjs";
import { expect, test } from "./harness.fixture.js";

// Diagnostic-only: not run by the normal browser suite unless explicitly opted in.
const enabled = process.env.SPARK_QUACKLES_LAB === "1";
const full = process.env.SPARK_LAB_PROFILE === "full";
const focused = process.env.SPARK_LAB_PROFILE === "focused";
const seeds = full ? [1, 2, 3, 5, 8, 13, 21] : focused ? [1, 2] : [1];
const budgets = full || focused ? [10_000, 100_000] : [10_000];
const sources = full ? ["paged", "in-memory"] : ["paged"];
const motions = full ? ["orbit", "reverse"] : ["reverse"];
const sortModes = [true, false];
const frameCount = Number(process.env.SPARK_LAB_FRAMES ?? (full ? 120 : 90));
const targetHz = Number(process.env.SPARK_LAB_HZ ?? 60);
const fixtures = path.join(import.meta.dirname, "fixtures");
const labRoot = path.resolve(process.env.SPARK_LAB_OUT ?? "artifacts/spark-quackles");
const runId = `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`;

function gitRef(...args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function cameraTape(seed: number, motion: string, count: number) {
  let state = seed >>> 0;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const phase = rand() * 0.2;
  return Array.from({ length: count }, (_, i) => {
    const t = (i / Math.max(1, count - 1)) * 2 * Math.PI;
    const x =
      motion === "reverse"
        ? Math.sin(t * 2 + phase) * 1.5
        : Math.sin(t + phase) * 1.5;
    const y = Math.cos(t * 0.5) * 0.25;
    return [x, y, 7 + Math.cos(t) * 0.3];
  });
}

async function hashFixture(source: string) {
  const directory = source === "paged" ? path.join(fixtures, "chunked") : fixtures;
  const files = (await readdir(directory))
    .filter((name) => /^furry-logo-pedestal-lod.*\.(rad|radc)$/.test(name))
    .sort();
  if (!files.length) throw new Error(`Missing Spark browser fixture in ${directory}`);
  const hash = createHash("sha256");
  for (const name of files) {
    const bytes = await readFile(path.join(directory, name));
    hash.update(name);
    hash.update("\0");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const imageHash = (url: string) =>
  createHash("sha256")
    .update(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))
    .digest("hex");

test.describe("@quackles-lab motion/LOD receipts", () => {
  test.skip(!enabled, "Set SPARK_QUACKLES_LAB=1 to run the opt-in experiment matrix");

  for (const source of sources) {
    for (const motion of motions) {
      for (const seed of seeds) {
        for (const lodSplatCount of budgets) {
          for (const sortRadial of sortModes) {
            test(`${source} ${motion} seed=${seed} budget=${lodSplatCount} radial=${sortRadial}`, async ({
              harnessPage,
              browser,
            }) => {
              test.setTimeout(240_000);
              expect(Number.isInteger(frameCount) && frameCount >= 20).toBe(true);
              expect(Number.isFinite(targetHz) && targetHz > 0).toBe(true);
              const positions = cameraTape(seed, motion, frameCount);
              const tapeSha256 = sha256(JSON.stringify(positions));
              const fixtureSha256 = await hashFixture(source);
              const url =
                source === "paged"
                  ? "/test/browser/fixtures/chunked/furry-logo-pedestal-lod.rad"
                  : "/test/browser/fixtures/furry-logo-pedestal-lod.rad";
              const observed = await harnessPage.evaluate(
                async ({ positions, lodSplatCount, sortRadial, url, paged }) => {
                  const h = window.harness;
                  h.createSpark({ lodSplatCount, sortRadial });
                  const camera = h.createCamera({ fov: 60, position: [0, 0, 7] });
                  h.addSplatMesh({ url, paged, quaternion: [1, 0, 0, 0] });
                  await h.settle();
                  h.renderer.render(h.scene, camera);
                  // Capture only at fully settled boundaries, never during motion.
                  const before = h.getPixels();
                  const gl = h.renderer.getContext();
                  const debug = gl.getExtension("WEBGL_debug_renderer_info");
                  const gpu = debug
                    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
                    : String(gl.getParameter(gl.RENDERER));
                  // Warm the path outside the measured region.
                  for (let i = 0; i < 5; i++) {
                    await new Promise<void>((resolve) => {
                      requestAnimationFrame(() => {
                        h.renderer.render(h.scene, camera);
                        resolve();
                      });
                    });
                  }
                  const intervals: number[] = [];
                  let previous: number | undefined;
                  for (const position of positions) {
                    await new Promise<void>((resolve) => {
                      requestAnimationFrame((time) => {
                        if (previous !== undefined) intervals.push(time - previous);
                        previous = time;
                        camera.position.set(position[0], position[1], position[2]);
                        camera.lookAt(0, 0, 0);
                        h.renderer.render(h.scene, camera);
                        resolve();
                      });
                    });
                  }
                  camera.position.set(0, 0, 7);
                  camera.lookAt(0, 0, 0);
                  await h.settle();
                  h.renderer.render(h.scene, camera);
                  const after = h.getPixels();
                  return {
                    intervals,
                    before,
                    after,
                    gpu,
                    userAgent: navigator.userAgent,
                    viewport: { width: innerWidth, height: innerHeight },
                    dpr: devicePixelRatio,
                  };
                },
                { positions, lodSplatCount, sortRadial, url, paged: source === "paged" },
              );

              const result = {
                schemaVersion: 1,
                status: "DIAGNOSTIC_ONLY",
                createdAt: new Date().toISOString(),
                repo: {
                  sha: gitRef("rev-parse", "HEAD") ?? process.env.GITHUB_SHA,
                  branch: gitRef("branch", "--show-current"),
                },
                fixture: {
                  id: "furry-logo-pedestal-lod",
                  sourceFamily: "spark-test-fixture (not Quackles Blue)",
                  format: source,
                  sha256: fixtureSha256,
                },
                environment: {
                  browser: `Chromium ${browser.version()}`,
                  userAgent: observed.userAgent,
                  os: `${os.platform()} ${os.release()}`,
                  gpu: observed.gpu,
                  dpr: observed.dpr,
                  viewport: observed.viewport,
                  instrumentation: "rAF cadence + explicit render, no in-motion readback",
                  network: "local Vite fixtures",
                  cache: "warm after settled fixture load",
                  device: "Playwright desktop / SwiftShader (not physical-phone acceptance)",
                },
                scenario: { motion, seed, lodSplatCount, sortRadial, frames: frameCount, tapeSha256 },
                metrics: summarizeFrameIntervals(observed.intervals, 1000 / targetHz),
                checks: {
                  initialPixelSha256: imageHash(observed.before),
                  recoveredPixelSha256: imageHash(observed.after),
                  settledPixelsIdentical: observed.before === observed.after,
                },
                limitations: [
                  "rAF cadence is not GPU completion latency or end-to-end input latency",
                  "No per-frame readPixels; blank-frame and stutter perception unverified",
                  "Software WebGL2 cannot qualify physical Android or hardware GPU performance",
                  "The Spark test fixture cannot establish Quackles Blue macro fidelity",
                ],
              };
              const name = `${source}-${motion}-seed${seed}-lod${lodSplatCount}-radial${sortRadial}.json`;
              const out = path.join(labRoot, runId);
              await mkdir(out, { recursive: true });
              await writeFile(path.join(out, name), `${JSON.stringify(result, null, 2)}\n`);
              expect(result.metrics.samples).toBe(frameCount - 1);
              expect(result.checks.initialPixelSha256).toHaveLength(64);
              expect(result.checks.recoveredPixelSha256).toHaveLength(64);
            });
          }
        }
      }
    }
  }
});
