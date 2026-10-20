# Quackles → Spark: downstream experiment lab

**Status:** diagnostic-only; not an upstream proposal or proof of a performance win.

Purpose: transfer Quackles' provenance-locked, adversarial frame-continuity
methodology to Spark without replacing Spark's existing browser harness or
changing its renderer. This is separate from [Spark PR #428](https://github.com/sparkjsdev/spark/pull/428)
and complements its paging/race tests.

## Run

```sh
npm install
npm run build:wasm
node --test scripts/lab/*.test.mjs
# Playwright and the existing Spark browser fixture/build setup are required.
npx playwright install chromium
SPARK_QUACKLES_LAB=1 npm run test:browser -- --grep @quackles-lab
# Intermediate 8-cell sweep (2 seeds x 2 budgets x 2 sorting modes):
SPARK_QUACKLES_LAB=1 SPARK_LAB_PROFILE=focused SPARK_LAB_FRAMES=45 npm run test:browser -- --grep @quackles-lab
node scripts/lab/summarize.mjs artifacts/spark-quackles
# 7 seeds x 2 budgets x 2 formats x 2 motion tapes x 2 sorting modes = 112 cells.
SPARK_QUACKLES_LAB=1 SPARK_LAB_PROFILE=full npm run test:browser -- --grep @quackles-lab
```

Default opt-in smoke: 1 seed × 1 budget × 1 format × 1 motion × 2 sorting
modes = 2 cells. The focused profile exercises 8 cells and is used for
fork CI. The full matrix is intentionally manual and expensive. Set
`SPARK_LAB_FRAMES` to change frames per cell (minimum 20). Set `SPARK_LAB_OUT`
for the receipt directory. Generated receipts are written under
`artifacts/spark-quackles/<run-id>/` (untracked, no scene assets committed).

Each JSON receipt includes exact Spark commit when Git metadata is available,
fixture-content SHA-256 (the `.rad` header **and** `.radc` chunks for paged
assets), deterministic camera-tape SHA-256, browser/OS/GPU/DPR, and rAF
interval distribution. The normal matrix uses Spark's existing generated
`furry-logo-pedestal` fixture, **not** the Quackles 201MP/1GP Blue source.

`settledPixelsIdentical` compares images captured outside the timed motion.
It is an observation, not a gating assertion or evidence that there were no
blank frames in motion. No synchronous per-frame `readPixels` or GPU fences
are added. rAF intervals are **not GPU render timings**. Playwright's
SwiftShader-based measurements do **not** represent actual Android or desktop
hardware GPU performance.

## Rules before promotion

1. First verify fixture and camera-tape hashes; never mix source masters or
   accidentally compare different input paths. `assertComparable` enforces
   fixture, tape, browser, GPU, DPR, viewport, network/cache and instrumentation.
2. Repeat each cell 5+ times, alternate control/candidate order, capture
   uninstrumented overhead, and separate cold from warm cache. One run cannot
   establish a performance win.
3. Add controlled network stalls and stale fetch/scene-switch experiments only
   after checking for duplication with #428 and existing tests.
4. For Quackles Blue fidelity, render exact authored cameras against matching
   Blender Cycles/mesh/virtual-texture references: PSNR, SSIM, LPIPS and edge/
   text regions. The previous Quackles Gaussian spike [#47](https://github.com/kvnloo/quackles/issues/47)
   reported severe 4–8× zoom loss, so a splat is not a 1GP texture replacement.
5. Hardware-GPU and **physical Android Chrome** trials are separate acceptance
   strata. No production change, default-branch merge, or upstream PR based on
   software-GPU or synthetic evidence alone.

Targets worth investigation: sorting continuity
[#407](https://github.com/sparkjsdev/spark/issues/407),
scene churn and pager disposal [#318](https://github.com/sparkjsdev/spark/issues/318),
and source-accurate LoD selection. Keep Quackles' original mesh authoritative
for geometry/animation/identity until a challenger beats it on a relevant,
reproducible Pareto dimension.
