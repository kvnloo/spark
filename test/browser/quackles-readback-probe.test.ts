import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./harness.fixture.js";

for (const mode of ["control", "no-pause", "extra-flush"] as const) {
  test(`@readback-probe ${mode}`, async ({
    harnessPage,
    consoleMessages,
  }, info) => {
    test.skip(process.env.SPARK_READBACK_PROBE !== "1", "Opt-in diagnostic");
    const result = await harnessPage.evaluate(async (mode) => {
      const h = window.harness;
      const reads: {
        id: number;
        phase: string;
        start: number;
        end?: number;
        error?: string;
        bytes: number;
        height: number;
      }[] = [];
      let phase = "initial";
      const original = h.renderer.readRenderTargetPixelsAsync.bind(h.renderer);
      h.renderer.readRenderTargetPixelsAsync = async (...args) => {
        const record = {
          id: reads.length,
          phase,
          start: performance.now(),
          bytes: args[5].byteLength,
          height: args[4],
        };
        reads.push(record);
        try {
          const result = await original(...args);
          Object.assign(record, { end: performance.now() });
          return result;
        } catch (error) {
          Object.assign(record, {
            end: performance.now(),
            error: String(error),
          });
          throw error;
        }
      };
      const spark = h.createSpark({ lodSplatCount: 100_000 });
      spark.readPause = mode === "no-pause" ? 0 : 1;
      spark.flushAfterRead = mode === "extra-flush";
      const camera = h.createCamera({ fov: 60, position: [0, 0, 7] });
      h.addSplatMesh({
        url: "/test/browser/fixtures/chunked/furry-logo-pedestal-lod.rad",
        paged: true,
        quaternion: [1, 0, 0, 0],
      });
      await h.settle();
      phase = "jump";
      camera.position.set(-1.0132354276432105, -0.25, 7.3);
      camera.lookAt(0, 0, 0);
      let error: string | null = null;
      try {
        await h.settle({ timeoutMs: 10_000 });
      } catch (caught) {
        error = String(caught);
      }
      return {
        mode,
        error,
        reads,
        sorting: spark.sorting,
        sortDirty: spark.sortDirty,
        sortMessages: Object.keys(spark.sortWorker?.messages ?? {}),
        currentMapping: spark.current.mappingVersion,
        displayMapping: spark.display.mappingVersion,
        contextLost: h.renderer.getContext().isContextLost(),
      };
    }, mode);
    const record = {
      ...result,
      console: consoleMessages
        .filter((entry) => ["error", "warning"].includes(entry.type()))
        .map((entry) => entry.text()),
    };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    await mkdir("artifacts/readback-probe", { recursive: true });
    await writeFile(
      path.join("artifacts/readback-probe", `${mode}.json`),
      text,
    );
    await info.attach(`${mode}.json`, {
      body: text,
      contentType: "application/json",
    });
    expect(result.error, text).toBeNull();
  });
}
