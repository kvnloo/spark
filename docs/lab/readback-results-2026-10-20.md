# High-LOD timeout: measured result, not a production fix

Date: 2026-10-20. Exact experimental head: `c52670c2625df667e06bbb00cfc6261ee62942b1`. [Run 39394102898](https://github.com/kvnloo/spark/actions/runs/39394102898), [original diagnostic attachments](https://github.com/kvnloo/spark/actions/runs/39394102898/artifacts/12251671519). Chromium 153.0.8010.12, the existing Playwright SwiftShader configuration. No renderer source change.

## Result

| Scenario | Outcome | Scope |
| --- | --- | --- |
| Existing upstream static paged 100K snapshot | PASS | Existing screenshot assertion |
| Seed-1 reverse motion, 10K, ordinary submissions | PASS | Initial, endpoint and return-to-origin settle |
| Same motion, 100K, ordinary submissions | FAIL at the original 60-second endpoint deadline | Then recovered passively; failure is preserved |
| Same motion, 100K, per-draw `gl.finish()` diagnostic | PASS | Explicitly different scheduling, not a performance candidate |

Final workflow remains **failed: 3 passed / 1 failed**. Contracts/Biome, the WASM build, both TypeScript checks and all 159 upstream unit tests passed. The failed 8-cell performance-lab sweep has **not** been retroactively declared green.

## What was actually waiting

The ordinary 100K case first settled successfully at elapsed 26,332.6 ms. At its endpoint timeout (elapsed 86,780.3 ms), it had:

- `sorting=true` with zero sort-worker or LOD-worker messages;
- no pending downloads, fetched chunks, uploads or LOD-tree updates;
- a pending `readRenderTargetPixelsAsync` for 2048 × 49 pixels, already 25,061.9 ms old;
- mapping latest/current/display = 6/5/4.

After preserving that failure, the harness only observed normal processing: `settle({requestRender:false, timeoutMs:180000})`. It submitted **no forced redraw, flush or finish**. The renderer became idle at elapsed **95,629.7 ms**, just **8,849.4 ms after the original cutoff**. The pending readback promise completed at duration 31,481.2 ms, all queues were empty and mapping versions converged to 6/6/6.

This replay therefore does **not** demonstrate a permanent LOD deadlock or lost asynchronous completion. It demonstrates long readback/queue latency on the software-rendered workload. Promise duration includes queued work and browser/driver scheduling; it is **not** a GPU timer-query measurement.

The ordinary case exits after recording recovery; return-to-origin and in-motion pixel continuity were **not verified for that failed case**. Do not conflate an idle pipeline with a correct rendered image.

## Why the synchronous control is not a fix

The separately labeled control calls `gl.finish()` after warm-up and motion draws. It completed initial/endpoint/return-to-origin phases, but its entire test took 124.734 seconds and its readback promises were still long. It changes where waiting occurs and changes the submission schedule. Its timings cannot be compared with ordinary rAF timing trials as a claimed speedup, and `gl.finish()` must not be promoted into normal rendering on this evidence.

The 60-second acceptance deadline was not increased. A subsequent passive observation window was diagnostic only and could not turn the failed test into a pass. No budgets, seeds or failed rows were silently dropped.

## Next experimental boundary

Keep software correctness tests and physical-device performance qualification separate. Before extending the full 112-cell timing matrix, use actual hardware-GPU runs with source/fixture/input pins and distinguish frame submission, queued GPU work, readback and presentation. Keep the existing failed controls and calibrate instrumentation overhead. There is no justified renderer bug patch or physical-device performance claim from this run alone.

All observation lives in the browser test harness. This follows mrxz's review of [asundqui's PR #428](https://github.com/sparkjsdev/spark/pull/428): avoid production debug overhead and do not add artificial async boundaries inside synchronous renderer code.

## Independent fetcher integration

Existing downstream drafts #1 and #2 were checked together locally against the 159-test upstream base: **214 pass / 0 fail** with both minimal fixes; **188 pass / 26 fail** with the original fetcher. This did not merge the branches or alter their independent exact-head CI.

A separate [real RAD/HTTP/WASM experiment](https://github.com/kvnloo/spark/tree/experiments/rad-http-integration) also executes all six actual scene chunks under 200 and 206 responses. Its local results validate the draft #2 byte/decoder correction without relying on a GPU. It is not evidence that the software-renderer timeout was caused by HTTP.
