import { cameraTape } from "../../scripts/lab/matrix.mjs";
import { expect, test } from "./harness.fixture.js";

// Diagnostic companion to the existing lab, not a timing or performance trial.
// Preserve the failing workload and its 60-second settle deadline.
test.describe("@settle-diagnostics", () => {
  test.skip(
    process.env.SPARK_LAB_DIAGNOSTICS !== "1",
    "Set SPARK_LAB_DIAGNOSTICS=1 for the bounded timeout investigation",
  );
  for (const lodSplatCount of [10_000, 100_000]) {
    test(`paged reverse budget=${lodSplatCount}`, async ({
      harnessPage,
      browser,
    }, testInfo) => {
      test.setTimeout(180_000);
      const result = await harnessPage.evaluate(
        async ({ positions, lodSplatCount }) => {
          const h = window.harness;
          let continuous = false;
          let phase = "initial";
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
            // A failed sample stays failed; do not turn a recovery into a pass.
            return {
              ok: false,
              error: String(error),
              phases,
              tail,
              final: snapshot(),
            };
          } finally {
            continuous = false;
          }
        },
        { positions: cameraTape(1, "reverse", 20), lodSplatCount },
      );
      const evidence = {
        kind: "SETTLE_DIAGNOSTIC_NOT_PERFORMANCE",
        sha: process.env.GITHUB_SHA ?? null,
        browser: browser.version(),
        lodSplatCount,
        ...result,
      };
      await testInfo.attach(`settle-${lodSplatCount}.json`, {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
      });
      console.log("SPARK_SETTLE_DIAGNOSTIC", JSON.stringify(evidence));
      expect(result.ok, result.error ?? "settled").toBe(true);
    });
  }
});
