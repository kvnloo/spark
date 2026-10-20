import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { summarizeFrameIntervals } from "../../scripts/lab/continuity-metrics.mjs";
import { cameraTape, createMatrix } from "../../scripts/lab/matrix.mjs";
import { expect, test } from "./harness.fixture.js";

const enabled = process.env.SPARK_QUACKLES_LAB === "1";
const profile = process.env.SPARK_LAB_PROFILE ?? "smoke";
const frameCount = Number(process.env.SPARK_LAB_FRAMES ?? 45);
const targetHz = Number(process.env.SPARK_LAB_HZ ?? 60);
const repetitions = Number(process.env.SPARK_LAB_REPEATS ?? 1);
const fixtures = path.join(import.meta.dirname, "fixtures");
const labRoot = path.resolve(
  process.env.SPARK_LAB_OUT ?? "artifacts/spark-quackles",
);
const runId =
  process.env.SPARK_LAB_RUN_ID ??
  `${new Date().toISOString().replace(/:/g, "-")}-${process.pid}`;

if (enabled) {
  if (!["smoke", "focused", "full"].includes(profile))
    throw new Error("Unknown SPARK_LAB_PROFILE");
  if (!Number.isInteger(frameCount) || frameCount < 20 || frameCount > 600)
    throw new Error("SPARK_LAB_FRAMES must be an integer from 20 to 600");
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10)
    throw new Error("SPARK_LAB_REPEATS must be an integer from 1 to 10");
  if (!Number.isFinite(targetHz) || targetHz <= 0 || targetHz > 360)
    throw new Error("SPARK_LAB_HZ must be positive and at most 360");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId))
    throw new Error("Unsafe SPARK_LAB_RUN_ID");
}

function gitRef(...args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const imageHash = (url: string) =>
  sha256(Buffer.from(url.split(",")[1], "base64"));

async function hashFixture(source: string) {
  const directory =
    source === "paged" ? path.join(fixtures, "chunked") : fixtures;
  const header = "furry-logo-pedestal-lod.rad";
  const names = (await readdir(directory))
    .filter(
      (name) =>
        name === header ||
        (source === "paged" &&
          /^furry-logo-pedestal-lod-\d+\.radc$/.test(name)),
    )
    .sort();
  if (!names.includes(header) || (source === "paged" && names.length < 2)) {
    throw new Error(`Missing complete ${source} fixture in ${directory}`);
  }
  const files = [];
  for (const name of names) {
    const bytes = await readFile(path.join(directory, name));
    files.push({ name, sizeBytes: bytes.length, sha256: sha256(bytes) });
  }
  return { sha256: sha256(JSON.stringify(files)), files };
}

test.describe("@quackles-lab motion/LOD receipts", () => {
  test.skip(!enabled, "Set SPARK_QUACKLES_LAB=1 to run downstream experiments");
  const cases = createMatrix(
    enabled ? profile : "smoke",
    enabled ? repetitions : 1,
  );
  for (const {
    source,
    motion,
    seed,
    lodSplatCount,
    trialIndex,
    sortRadial,
  } of cases) {
    test(`${source} ${motion} seed=${seed} budget=${lodSplatCount} trial=${trialIndex} radial=${sortRadial}`, async ({
      harnessPage,
      browser,
    }, testInfo) => {
      test.setTimeout(300_000);
      const positions = cameraTape(seed, motion, frameCount);
      const fixture = await hashFixture(source);
      const url =
        source === "paged"
          ? "/test/browser/fixtures/chunked/furry-logo-pedestal-lod.rad"
          : "/test/browser/fixtures/furry-logo-pedestal-lod.rad";
      const observed = await harnessPage.evaluate(
        async ({ positions, lodSplatCount, sortRadial, url, paged }) => {
          const h = window.harness;
          let continuous = false;
          h.createSpark({
            lodSplatCount,
            sortRadial,
            // One owner of frame scheduling: no extra onDirty render
            // alongside the measured continuous loop.
            onDirty: () => {
              if (!continuous) h.requestRender();
            },
          });
          const camera = h.createCamera({
            fov: 60,
            position: [0, 0, 7],
          });
          h.addSplatMesh({ url, paged, quaternion: [1, 0, 0, 0] });
          await h.settle();
          const gl = h.renderer.getContext();
          const debug = gl.getExtension("WEBGL_debug_renderer_info");
          const gpu = String(
            gl.getParameter(
              debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
            ),
          );
          function capture() {
            const canvas = document.createElement("canvas");
            canvas.width = gl.drawingBufferWidth;
            canvas.height = gl.drawingBufferHeight;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Cannot inspect settled canvas");
            context.drawImage(h.renderer.domElement, 0, 0);
            const data = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            let nonBlackPixels = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] || data[i + 1] || data[i + 2]) nonBlackPixels++;
            }
            return { png: h.getPixels(), nonBlackPixels };
          }
          // All readbacks are outside the measured frame sequence.
          const before = capture();
          continuous = true;
          for (let i = 0; i < 5; i++) {
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => {
                h.renderer.render(h.scene, camera);
                resolve();
              }),
            );
          }
          const intervals: number[] = [];
          let previous: number | undefined;
          let renderCalls = 0;
          let internalRenderCalls = 0;
          const originalRender = h.renderer.render;
          h.renderer.render = (scene, view) => {
            // Spark's FullScreenQuad computation also calls renderer.render.
            // Only the application scene/camera counts as a display submission.
            if (scene === h.scene && view === camera) renderCalls++;
            else internalRenderCalls++;
            originalRender.call(h.renderer, scene, view);
          };
          try {
            // N+1 rAF boundaries cover all N draws, including the last.
            for (let i = 0; i <= positions.length; i++) {
              await new Promise<void>((resolve) =>
                requestAnimationFrame((time) => {
                  if (previous !== undefined) intervals.push(time - previous);
                  previous = time;
                  if (i < positions.length) {
                    const position = positions[i];
                    camera.position.set(position[0], position[1], position[2]);
                    camera.lookAt(0, 0, 0);
                    h.renderer.render(h.scene, camera);
                  }
                  resolve();
                }),
              );
            }
          } finally {
            h.renderer.render = originalRender;
            continuous = false;
          }
          await h.settle();
          const endpoint = capture();
          camera.position.set(0, 0, 7);
          camera.lookAt(0, 0, 0);
          await h.settle();
          const after = capture();
          return {
            intervals,
            before,
            after,
            endpoint,
            renderCalls,
            internalRenderCalls,
            gpu,
            userAgent: navigator.userAgent,
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
            canvas: {
              width: gl.drawingBufferWidth,
              height: gl.drawingBufferHeight,
              pixelRatio: h.renderer.getPixelRatio(),
            },
          };
        },
        {
          positions,
          lodSplatCount,
          sortRadial,
          url,
          paged: source === "paged",
        },
      );
      const sourceStatus = gitRef(
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        "src",
        "test/browser",
        "scripts/lab",
        "package-lock.json",
      );
      const result = {
        schemaVersion: 3,
        runId,
        status: "DIAGNOSTIC_ONLY",
        createdAt: new Date().toISOString(),
        repo: {
          sha: gitRef("rev-parse", "HEAD"),
          dirty: sourceStatus === null ? null : sourceStatus.length > 0,
        },
        fixture: {
          id: "furry-logo-pedestal-lod",
          sourceFamily: "spark-test-fixture (not Quackles Blue)",
          format: source,
          ...fixture,
        },
        environment: {
          browser: `Chromium ${browser.version()}`,
          userAgent: observed.userAgent,
          os: `${os.platform()} ${os.release()}`,
          hostFingerprint: sha256(os.hostname()),
          gpu: observed.gpu,
          dpr: observed.dpr,
          viewport: observed.viewport,
          canvas: observed.canvas,
          instrumentation:
            "single-owner-rAF-v3; display/internal passes separated; boundary readbacks only",
          network: "local Vite fixtures",
          cache: "initial-view-resident; new motion pages may still load",
          device: "Playwright software WebGL2; not physical-device acceptance",
        },
        trial: {
          index: trialIndex,
          repeatIndex: testInfo.repeatEachIndex,
          retry: testInfo.retry,
          project: testInfo.project.name,
        },
        scenario: {
          motion,
          seed,
          lodSplatCount,
          sortRadial,
          frames: frameCount,
          targetHz,
          replay: "frame-stepped-v2",
          tapeSha256: sha256(JSON.stringify(positions)),
        },
        rawIntervals: observed.intervals,
        metrics: summarizeFrameIntervals(observed.intervals, 1000 / targetHz),
        checks: {
          initialPixelSha256: imageHash(observed.before.png),
          recoveredPixelSha256: imageHash(observed.after.png),
          settledPixelsIdentical: observed.before.png === observed.after.png,
          initialNonBlackPixels: observed.before.nonBlackPixels,
          recoveredNonBlackPixels: observed.after.nonBlackPixels,
          renderCalls: observed.renderCalls,
          internalRenderCalls: observed.internalRenderCalls,
          endpointPixelSha256: imageHash(observed.endpoint.png),
          endpointNonBlackPixels: observed.endpoint.nonBlackPixels,
        },
        limitations: [
          "rAF cadence is not GPU completion or input latency",
          "Frame-stepped camera poses do not normalize wall-clock motion speed",
          "No in-motion pixel continuity or physical GPU performance claim",
          "No Quackles Blue fidelity or complete motion-path warm-cache claim",
        ],
      };
      const name = `${source}-${motion}-seed${seed}-lod${lodSplatCount}-trial${trialIndex}-repeat${testInfo.repeatEachIndex}-retry${testInfo.retry}-${sha256(testInfo.project.name).slice(0, 8)}-radial${sortRadial}.json`;
      const out = path.join(labRoot, runId);
      await mkdir(out, { recursive: true });
      const json = `${JSON.stringify(result, null, 2)}\n`;
      // Never overwrite a prior trial, repetition, retry, or project.
      await writeFile(path.join(out, name), json, { flag: "wx" });
      await testInfo.attach(name, {
        body: json,
        contentType: "application/json",
      });
      expect(result.metrics.samples).toBe(frameCount);
      expect(result.checks.renderCalls).toBe(frameCount);
      expect(result.checks.initialNonBlackPixels).toBeGreaterThan(0);
      expect(result.checks.recoveredNonBlackPixels).toBeGreaterThan(0);
      expect(result.checks.settledPixelsIdentical).toBe(true);
      expect(result.checks.endpointNonBlackPixels).toBeGreaterThan(0);
      expect(result.checks.endpointPixelSha256).not.toBe(
        result.checks.initialPixelSha256,
      );
    });
  }
});
