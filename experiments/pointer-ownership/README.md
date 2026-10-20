# Pointer ownership and cancellation experiment

Downstream only. The renderer source on this branch remains the upstream snapshot `ffe210dc0a45d0515a06c9235878108112827d61`; the small candidate patch is applied explicitly by the workflow. This is not an upstream PR or a merged source change.

`PointerControls` installs document-level release/cancellation listeners. Before checking ownership, it updates tap history and emits double presses. Consequently unrelated page clicks and another canvas's gestures invoke its callback; cancelled touches can also complete a double tap.

The candidate adds an owned-pointer guard and treats an owned cancellation as cleanup, not a completed tap. The existing capture cleanup and legitimate two-tap path are retained.

## Reproduce

From this branch with dependencies and Spark's generated WASM installed:

```sh
cp experiments/pointer-ownership/PointerControls.release.test.ts test/unit/
cp experiments/pointer-ownership/pointer-ownership.test.ts test/browser/
cp experiments/pointer-ownership/pointer.config.ts test/browser/
# The upstream control must fail 7 unit cases and all 3 browser cases.
npx vitest run test/unit/PointerControls.release.test.ts
npx playwright test -c test/browser/pointer.config.ts

git apply --check experiments/pointer-ownership/controls.patch
git apply experiments/pointer-ownership/controls.patch
npm run types
npm test
npx playwright test -c test/browser/pointer.config.ts
```

Local evidence on 2026-10-20: **168 unit tests passed**, including 9 new gesture regressions. The exact upstream control passed 2/9 and failed 7/9. In Chromium 144.0.7559.96, a self-contained local bundle with actual mouse/CDP touch input passed all **3 browser scenarios** after the patch; the upstream bundle failed all 3. No network navigation, GPU-speed claim, or physical-phone acceptance was involved.

CI uses the existing Spark browser harness rather than shipping another application test framework. Original/fixed results and source hashes must remain distinguishable. Preserve the upstream PointerControls authors and behavior outside the two narrow guards. Promotion requires a small source+tests commit, not merging this experiment folder or workflow wholesale.
