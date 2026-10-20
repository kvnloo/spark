# Quackles → Spark initial CI smoke (2026-10-20)

**Experiment only. No upstream-readiness claim.** The [first fork workflow](https://github.com/kvnloo/spark/actions/runs/39377799570) completed successfully on [`f79d695`](https://github.com/kvnloo/spark/commit/f79d695daeb2871631dc92bc8edd0b2877db2293): 4 metric unit tests + Rust/WASM build + 2 browser scenarios pass.

- Scene: Spark `furry-logo-pedestal` RAD, paged, 10,000-splat budget, exact asset SHA-256 `2766042ea389a03b9bfce1644b3c55a02fc214877c2a58daee428f50ac51719c`.
- Input: reverse camera tape, seed 1, 90 frames, tape SHA-256 `ea72aae28d0a5681391eeccf7c50c78a37f990c4610f3152599531c12e2f678d`.
- Environment: Chromium 153.0.8010.12 on Linux GitHub Actions, **SwiftShader Vulkan software GPU**, 1280×720 at DPR 1, warm local fixture, no in-motion readback.
- Radial sort: 89 rAF intervals; p95 **899.9 ms**, p99 **1083.2 ms**; settled image hash was identical before/after motion.
- Depth sort: 89 rAF intervals; p95 **766.7 ms**, p99 **1133.3 ms**; settled image hash was identical before/after motion.
- Pairwise diagnostic: radial − depth p95 **+133.2 ms**, p99 **−50.1 ms**. Different percentile signs and just one trial; **no winner**.

The huge frame intervals reflect this software-renderer scenario and include browser scheduling; they do not establish Spark's hardware-GPU performance or user input latency. Settled pixel equality does **not** prove absence of an in-motion flash or sorting snap. The separate [Quackles Gaussian spike](https://github.com/kvnloo/quackles/issues/47) reported fidelity loss **at 4–8× zoom**, not a 4–8× multiplicative quality loss.

Artifacts: [download from GitHub Actions](https://github.com/kvnloo/spark/actions/runs/39377799570/artifacts/12244551055). Reproduce pairing using `node scripts/lab/summarize.mjs <unpacked-root>/artifacts/spark-quackles`.

Next: controlled repeated A/B runs, physical phone or affected Mac Chrome to reproduce sorting jitter [#407](https://github.com/sparkjsdev/spark/issues/407), and source-matched visual references before promotion. Avoid duplicating [asundqui's extensive pager/browser testing PR #428](https://github.com/sparkjsdev/spark/pull/428).
