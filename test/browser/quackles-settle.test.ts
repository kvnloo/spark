import { cameraTape } from "../../scripts/lab/matrix.mjs";
import { expect, test } from "./harness.fixture.js";

// Diagnostic companion to the existing lab, not a timing or performance trial.
// Preserve the failing workload and its 60-second settle deadline.
test.describe("@settle-diagnostics", () => {
  test.skip(
    process.env.SPARK_LAB_DIAGNOSTICS !== "1",
    "Set SPARK_LAB_DIAGNOSTICS=1 for the bounded timeout investigation",
  );
  for (const { lodSplatCount, serializeGpu } of [
    { lodSplatCount: 10_000, serializeGpu: false },
    { lodSplatCount: 100_000, serializeGpu: false },
    { lodSplatCount: 100_000, serializeGpu: true },
  ]) {
    test(`paged reverse budget=${lodSplatCount} serialized=${serializeGpu}`, async ({
      harnessPage,
      browser,
    }, testInfo) => {
      test.setTimeout(420_000);
      const result = await harnessPage.evaluate(
        async ({ positions, lodSplatCount, serializeGpu }) => {
          const h = window.harness;
          let continuous = false;
          let phase = "initial";
          const gl = h.renderer.getContext();
          const readbacks = new Map<
            number,
            { started: number; width: number; height: number }
          >();
          const completedReadbacks: { durationMs: number; phase: string }[] =
            [];
          const originalRead = h.renderer.readRenderTargetPixelsAsync;
          let readId = 0;
          h.renderer.readRenderTargetPixelsAsync = (...args) => {
            const id = ++readId;
            const started = performance.now();
            readbacks.set(id, { started, width: args[3], height: args[4] });
            const result = originalRead.apply(h.renderer, args);
            // Observe the existing promise without introducing an await into Spark.
            void result.then(
              () => {
                readbacks.delete(id);
                completedReadbacks.push({
                  durationMs: performance.now() - started,
                  phase,
                });
                if (completedReadbacks.length > 8) completedReadbacks.shift();
              },
              () => readbacks.delete(id),
            );
            return result;
          };
          const spark = h.createSpark({
            lodSplatCount,
            sortRadial: false,
            onDirty: () => {
              if (!continuous) h.requestRender();
            },
          });
          const camera = h.createCamera({ fov: 60, position: [0, 0, 7] });
          h.addSplatMesh({
            url: "/test/browser/fixtures/chunked/furry-logo-pedestal-lod.rad",
            paged: true,
            quaternion: [1, 0, 0, 0],
          });
          const started = performance.now();
          function snapshot() {
            const pager = spark.pager;
            const length = (name: string) => {
              const queue = pager && Reflect.get(pager, name);
              return Array.isArray(queue) ? queue.length : null;
            };
            return {
              phase,
              elapsedMs: performance.now() - started,
              frame: h.renderer.info.render.frame,
              scheduled: Reflect.get(h, "renderScheduled"),
              dirty: spark.dirty,
              sorting: spark.sorting,
              sortDirty: spark.sortDirty,
              lodDirty: spark.lodDirty,
              lodBusy: spark.lodWorker?.queue != null,
              lodMessages: Object.keys(spark.lodWorker?.messages ?? {}).length,
              sortMessages: Object.keys(spark.sortWorker?.messages ?? {})
                .length,
              mapping: {
                latest: Reflect.get(spark, "latestMappingVersion"),
                current: spark.current.mappingVersion,
                display: spark.display.mappingVersion,
                changed: spark.current.mappingChanged(),
              },
              activeSplats: spark.activeSplats,
              readbacks: [...readbacks.values()].map(
                ({ started, width, height }) => ({
                  ageMs: performance.now() - started,
                  width,
                  height,
                }),
              ),
              completedReadbacks: [...completedReadbacks],
              pager: {
                fetching: pager?.isFetching(),
                queued: pager?.hasQueued(),
                fetchers: length("fetchers"),
                fetched: length("fetched"),
                newUploads: length("newUploads"),
                readyUploads: length("readyUploads"),
                treeUpdates: length("lodTreeUpdates"),
              },
            };
          }
          const phases: ReturnType<typeof snapshot>[] = [];
          const tail: ReturnType<typeof snapshot>[] = [];
          async function settle(name: string) {
            phase = name;
            const sample = () => {
              tail.push(snapshot());
              if (tail.length > 8) tail.shift();
            };
            sample();
            const timer = setInterval(sample, 1000);
            try {
              await h.settle();
              phases.push(snapshot());
            } finally {
              clearInterval(timer);
              sample();
            }
          }
          try {
            await settle("initial");
            continuous = true;
            for (let i = 0; i < 5; i++) {
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => {
                  h.renderer.render(h.scene, camera);
                  if (serializeGpu) gl.finish();
                  resolve();
                }),
              );
            }
            phase = "motion";
            // Same N+1 rAF boundaries and exact 20-pose tape as the failed run.
            for (let i = 0; i <= positions.length; i++) {
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => {
                  if (i < positions.length) {
                    const position = positions[i];
                    camera.position.set(position[0], position[1], position[2]);
                    camera.lookAt(0, 0, 0);
                    h.renderer.render(h.scene, camera);
                    if (serializeGpu) gl.finish();
                  }
                  resolve();
                }),
              );
            }
            continuous = false;
            await settle("endpoint");
            camera.position.set(0, 0, 7);
            camera.lookAt(0, 0, 0);
            await settle("return-to-origin");
            return { ok: true, error: null, phases, tail, final: snapshot() };
          } catch (error) {
            // Preserve the original failure. Passive extra observation is not a
            // passing trial, nor a larger acceptance deadline. Submit no extra
            // draw, flush, or finish here; distinguish slow GPU drain from a stall.
            const failed = snapshot();
            const failedTail = [...tail];
            let passiveRecovery: {
              recovered: boolean;
              error: string | null;
              final: ReturnType<typeof snapshot>;
            };
            phase = "passive-drain-after-failure";
            try {
              await h.settle({ requestRender: false, timeoutMs: 180_000 });
              passiveRecovery = {
                recovered: true,
                error: null,
                final: snapshot(),
              };
            } catch (recoveryError) {
              passiveRecovery = {
                recovered: false,
                error: String(recoveryError),
                final: snapshot(),
              };
            }
            return {
              ok: false,
              error: String(error),
              phases,
              tail: failedTail,
              final: failed,
              passiveRecovery,
            };
          } finally {
            continuous = false;
            h.renderer.readRenderTargetPixelsAsync = originalRead;
          }
        },
        {
          positions: cameraTape(1, "reverse", 20),
          lodSplatCount,
          serializeGpu,
        },
      );
      const evidence = {
        kind: "SETTLE_DIAGNOSTIC_NOT_PERFORMANCE",
        sha: process.env.GITHUB_SHA ?? null,
        browser: browser.version(),
        lodSplatCount,
        serializeGpu,
        limitation: serializeGpu
          ? "Per-draw gl.finish is diagnostic only, not a production fix or benchmark"
          : "Passive GPU-readback observation, not GPU completion-time instrumentation",
        ...result,
      };
      await testInfo.attach(
        `settle-${lodSplatCount}-serialized-${serializeGpu}.json`,
        {
          body: JSON.stringify(evidence, null, 2),
          contentType: "application/json",
        },
      );
      console.log("SPARK_SETTLE_DIAGNOSTIC", JSON.stringify(evidence));
      expect(result.ok, result.error ?? "settled").toBe(true);
    });
  }
});
