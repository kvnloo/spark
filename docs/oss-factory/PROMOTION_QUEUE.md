# Spark — canonical downstream promotion queue

**Owner fork:** [kvnloo/spark](https://github.com/kvnloo/spark)  
**Upstream:** [sparkjsdev/spark](https://github.com/sparkjsdev/spark)  
**State:** EXPERIMENTING, not READY. This file is the single project-local queue because Issues are disabled on the fork. Keep upstream discussion and maintainer feedback at their original links. Do not create per-wave queues.

## Current evidence (2026-10-20)

- Upstream base: `ffe210dc0a45d0515a06c9235878108112827d61` (`main` when verified).
- Experimental branch: [`experiments/quackles-continuity`](https://github.com/kvnloo/spark/tree/experiments/quackles-continuity).
- First downstream commit: [`f79d695`](https://github.com/kvnloo/spark/commit/f79d695daeb2871631dc92bc8edd0b2877db2293) — opt-in 112-cell motion/LOD diagnostics and reproducible receipts.
- Follow-up: [`baf286c`](https://github.com/kvnloo/spark/commit/baf286cb7b432f417c65e50a0eaa4f803219322b) — 8-cell focused profile, paired comparator and [first baseline](https://github.com/kvnloo/spark/blob/experiments/quackles-continuity/docs/lab/first-smoke-2026-10-20.md).
- Eight local metric/receipt unit tests passed. First browser smoke [run 39377799570](https://github.com/kvnloo/spark/actions/runs/39377799570) **GREEN** (two browser cells and WASM build). Its 89-interval SwiftShader traces have extreme p95 (767–900 ms) and inconclusive sorting deltas; identical *settled* pixels do not establish in-motion continuity. Focused 8-cell [run 39379105809](https://github.com/kvnloo/spark/actions/runs/39379105809) initiated, outcome pending verification.
- **No upstream-ready code or real-device performance finding claimed.**

## Experimental work lanes

1. **Frame continuity/sorting** — controlled pan, orbit and reversal; emitted receipts; reproduce [#407](https://github.com/sparkjsdev/spark/issues/407) on affected Chrome/macOS before fixing. No real-device reproduction yet.
2. **LoD/refinement** — compare streamed vs nonpaged RAD and sorting modes using consistent source identity. Reject visual blanking/stale generations. Avoid overlap with [asundqui's PR #428](https://github.com/sparkjsdev/spark/pull/428) and the existing browser suite.
3. **Pager cancellation/scene churn** — characterize [#318](https://github.com/sparkjsdev/spark/issues/318), abort/dispose lifecycle and bandwidth; first check landed changes and pending fixes.
4. **Visual fidelity** — [Quackles Gaussian RFC #47](https://github.com/kvnloo/quackles/issues/47) found strong novel-view rendering but unacceptable 4–8× zoom quality, including text/metal. Do not mix 201MP and 1GP source masters; exact authored cameras and reference renders before proposing renderer changes.
5. **Mobile + XR** — physical Chrome Android and headset measurements kept separate from Playwright SwiftShader and emulated viewports; no mobile performance claims from desktop GPU.
6. **GPU/memory/bytes** — independent fetch, decode, upload, sort, residency and publish timings with calibrated instrumentation overhead, no per-frame synchronous readback in normal trials.

## Promotion gate

- [ ] Re-run unit, typecheck, lint, browser and Rust suites on exact fork SHA.
- [ ] Establish same-fixture/SHA A/B controls, repeat five or more times; 10+ close results; report p50/p95/p99, frame tails, first correct frame and memory/network costs when measured.
- [ ] Capture physical Android Chrome and affected GPU/browser evidence for any device-specific fix.
- [ ] Audit open issues, PRs and duplicate work; credit original authors and keep attribution.
- [ ] Promote a small, documented, maintainable fix only when reproducible and materially better. No upstream PR, external comment or default-branch merge without evidence/approval.

A test passing on SwiftShader is a diagnostic signal, not evidence that a physical device feels responsive. Preserve previous failures and limitations in receipts.
