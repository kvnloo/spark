import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cameraTape } from "../../scripts/lab/matrix.mjs";
import { expect, test } from "./harness.fixture.js";

// A bounded diagnostic, not a performance test or a workaround for a failure.
const enabled = process.env.SPARK_SETTLE_PROBE === "1";
for (const budget of [10_000, 100_000]) {
  for (const mode of ["jump", "on-demand", "switched"] as const) {
    test(`@settle-probe budget=${budget} mode=${mode}`, async ({
      harnessPage,
    }, info) => {
      test.skip(!enabled, "Opt in with SPARK_SETTLE_PROBE=1");
      const tape = cameraTape(1, "reverse", 20);
      const result = await harnessPage.evaluate(
        async ({ budget, mode, tape }) => {
          const h = window.harness;
          let continuous = false;
          let dirtyCallbacks = 0;
          let displayRenders = 0;
          const spark = h.createSpark({
            lodSplatCount: budget,
            onDirty: () => {
              dirtyCallbacks++;
              if (!continuous) h.requestRender();
            },
          });
          const camera = h.createCamera({ fov: 60, position: [0, 0, 7] });
          h.addSplatMesh({
            url: "/test/browser/fixtures/chunked/furry-logo-pedestal-lod.rad",
            paged: true,
            quaternion: [1, 0, 0, 0],
          });
          const original = h.renderer.render;
          h.renderer.render = (scene, view) => {
            if (scene === h.scene && view === camera) displayRenders++;
            original.call(h.renderer, scene, view);
          };
          const state = () => ({
            dirtyCallbacks,
            displayRenders,
            dirty: spark.dirty,
            sorting: spark.sorting,
            sortDirty: spark.sortDirty,
            sortMessages: Object.keys(spark.sortWorker?.messages ?? {}),
            lodDirty: spark.lodDirty,
            lodQueue: spark.lodWorker?.queue?.length ?? null,
            lodMessages: Object.keys(spark.lodWorker?.messages ?? {}),
            lodInitQueue: spark.lodInitQueue.length,
            fetching: spark.pager?.isFetching() ?? false,
            queued: spark.pager?.hasQueued() ?? false,
            currentMapping: spark.current.mappingVersion,
            displayMapping: spark.display.mappingVersion,
            currentSplats: spark.current.numSplats,
            activeSplats: spark.activeSplats,
            mappingChanged: spark.current.mappingChanged(),
            camera: camera.position.toArray(),
            sortedCenter: spark.sortedCenter.toArray(),
          });
          await h.settle();
          const initial = state();
          continuous = mode === "switched";
          const poses = mode === "jump" ? tape.slice(-1) : tape;
          for (const p of poses) {
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => {
                camera.position.set(...p);
                camera.lookAt(0, 0, 0);
                if (mode === "switched") h.renderer.render(h.scene, camera);
                else h.requestRender();
                resolve();
              }),
            );
          }
          continuous = false;
          const endOfMotion = state();
          let endpointError: string | null = null;
          try {
            await h.settle({ timeoutMs: 10_000 });
          } catch (error) {
            endpointError = String(error);
          }
          const endpoint = state();
          let recoveryError: string | null = null;
          if (endpointError) {
            // Isolate a missed scheduling edge: no camera or renderer mutation.
            for (let i = 0; i < 8; i++) {
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => {
                  h.requestRender();
                  resolve();
                }),
              );
            }
            try {
              await h.settle({ timeoutMs: 5_000 });
            } catch (error) {
              recoveryError = String(error);
            }
          }
          const afterExtraFrames = state();
          camera.position.set(0, 0, 7);
          camera.lookAt(0, 0, 0);
          let originError: string | null = null;
          try {
            await h.settle({ timeoutMs: 5_000 });
          } catch (error) {
            originError = String(error);
          }
          h.renderer.render = original;
          return {
            budget,
            mode,
            initial,
            endOfMotion,
            endpoint,
            endpointError,
            afterExtraFrames,
            recoveryError,
            origin: state(),
            originError,
          };
        },
        { budget, mode, tape },
      );
      const text = `${JSON.stringify(result, null, 2)}\n`;
      const directory = path.resolve("artifacts/settle-probe");
      await mkdir(directory, { recursive: true });
      const name = `${budget}-${mode}.json`;
      await writeFile(path.join(directory, name), text);
      await info.attach(name, { body: text, contentType: "application/json" });
      expect(result.endpointError, text).toBeNull();
      expect(result.originError, text).toBeNull();
    });
  }
}
