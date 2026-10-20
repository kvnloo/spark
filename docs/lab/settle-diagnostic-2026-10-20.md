# High-LOD settle investigation — 2026-10-20

Diagnostic evidence, not a renderer performance result or a production fix.

## First isolation run

Exact head `56a14ca8fe271615c6e27f35124c46d5d5b4a776`, [run 39392687999](https://github.com/kvnloo/spark/actions/runs/39392687999), Chromium 153.0.8010.12 / SwiftShader. Source, WASM and fixtures are exported by the run; [diagnostic attachments](https://github.com/kvnloo/spark/actions/runs/39392687999/artifacts/12250198924) preserve the original failure.

- Existing upstream static paged 100K snapshot: PASS.
- Seed-1 reverse motion, 10K budget: PASS through initial, endpoint and return-to-origin settle.
- Same motion at 100K: initial settle PASS (~26.2 s), endpoint settle FAIL after its unchanged 60 s deadline.
- At failure: `sorting=true`, `sortDirty=false`, no sort-worker messages, no LOD-worker messages or busy callback, no pending fetches/uploads/tree updates. Mapping latest/current/display = 6/5/4. No renders were scheduled and the frame counter remained 103 over the final eight observations.

This localizes the wait before the sort-worker RPC, not to network loading or queued LOD work. GPU-readback latency/backpressure remains a hypothesis, not a confirmed renderer deadlock. In particular, rAF submission cadence does not imply GPU completion. Do not fix this by silently reducing the budget, declaring incomplete matrices green, or blindly increasing the acceptance deadline.

The next diagnostic observes the existing readback promises, preserves timed-out samples as failures while observing passive recovery separately, and adds an explicitly separate per-draw `gl.finish()` control. That synchronous control is NOT a proposed production optimization and its timings must not be compared with normal lab trials. All observation remains in the test harness, consistent with mrxz's review of [asundqui's PR #428](https://github.com/sparkjsdev/spark/pull/428).

## Independent combined-fetcher check

The two existing downstream drafts [#1](https://github.com/kvnloo/spark/pull/1) and [#2](https://github.com/kvnloo/spark/pull/2) were also checked together locally using their exact test-file blobs (`9916b2ff853826919fe261177af54e3054f16f4b`, `8a35daf8025282791d89c5fb80a834a914871a68`).

- Original fetcher: 188 passed / 26 failed / 214 total.
- Both minimal behavioral fixes applied together: 214 passed / 0 failed.
- Original fetcher SHA-256: `1f602d68c5eb0d893cc20e8c5c8799a60fbc7b8329a6b7ace1e4ee003f94087e`.
- Combined local source SHA-256: `623bb50dca72710812b85c8201a95edea73b60b202191218bb3b11b5d996e183`.

This is a local integration experiment, not a new merged branch or a replacement for each draft's independent exact-head CI. The lab source was restored afterward. Original fetcher design and ownership contract remain mrxz's work.
