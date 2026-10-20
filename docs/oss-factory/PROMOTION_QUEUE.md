# Spark — canonical downstream promotion queue

**Fork:** [kvnloo/spark](https://github.com/kvnloo/spark) · **Upstream:** [sparkjsdev/spark](https://github.com/sparkjsdev/spark)

This is the single project-local queue because Issues are disabled on the fork. Do not create per-wave queues or project-detail issues in oss-factory. Snapshot: **2026-10-20**. No upstream PR/comment or default-branch merge has been performed.

## Small correctness candidates — downstream review

Both branches are independently based on upstream `ffe210dc0a45d0515a06c9235878108112827d61`. The frozen downstream review base is `review/upstream-ffe210d`, avoiding unrelated fork lag. Both preserve **mrxz's** existing fetcher abstraction and caller-owned-buffer contract from upstream [#463](https://github.com/sparkjsdev/spark/pull/463).

| Candidate | Exact head | Verified evidence | State |
|---|---|---|---|
| [Draft #1: file-backed short reads at EOF](https://github.com/kvnloo/spark/pull/1) | `bc8806d209d10585338dab9f44d780d9f0b2e43c` | [CI 39381731308](https://github.com/kvnloo/spark/actions/runs/39381731308): Biome, WASM, both TypeScript checks, **170 unit tests pass**; source-only upstream control **7 regressions fail / 4 pass**. Includes owned-buffer transfer and 2,272 small-file boundary combinations. | FORK_REVIEW |
| [Draft #2: slice full HTTP responses when Range is ignored](https://github.com/kvnloo/spark/pull/2) | `c0caf23fef4943a036e6cad6f170f24642b7d468` | [CI 39384500197](https://github.com/kvnloo/spark/actions/runs/39384500197): Biome, WASM, both TypeScript checks, **203 unit tests pass**; real HTTP control **19 regressions fail / 25 pass**. 44 cases cover 200/206, offsets/tails, whole chunks, HTTP errors and live abort. | FORK_REVIEW |

The workflow files in those PRs are **fork-only evidence infrastructure** and must be omitted from a future upstream patch. The HTTP fallback fixes byte correctness, not bandwidth: a server returning the full representation still transfers the full file. Neither fix establishes GPU speed, mobile responsiveness, or Quackles image fidelity. They do not redesign numeric input validation.

## Experiment lab — still qualifying instrumentation

Branch: [`experiments/quackles-continuity`](https://github.com/kvnloo/spark/tree/experiments/quackles-continuity). Latest pushed head: `3a5089a53ab40f1491f2b0e8aedf038f155462d5`; [run 39385731760](https://github.com/kvnloo/spark/actions/runs/39385731760) is pending final verification at this checkpoint.

**72 local lab checks pass**: frame distributions, malformed/missing evidence, source/host/replay comparability, independent trial identities, camera tapes, and exact 2/8/112-cell matrix construction. Full 112-cell browser execution is **not yet established**. The suite extends Spark's existing browser harness; it does not replace [asundqui's pager/browser work #428](https://github.com/sparkjsdev/spark/pull/428).

### Failure and evidence history — do not erase

- `f79d695`, [39377799570](https://github.com/kvnloo/spark/actions/runs/39377799570): original 2-cell smoke passed. Its timing report is **superseded**, not a performance baseline: competing scheduling, no raw intervals, and incomplete drawing-buffer metadata were subsequently identified.
- `baf286c`, [39379105809](https://github.com/kvnloo/spark/actions/runs/39379105809): **FAILED before browser execution**. `String.replaceAll` conflicted with Spark's ES2020 TypeScript target. No eight-cell result exists for this run.
- `428cd90`, [39382525749](https://github.com/kvnloo/spark/actions/runs/39382525749): TypeScript and lab contracts passed; all eight browser cases emitted receipts but **failed the harness's render-count assertion**. It counted internal `FullScreenQuad` passes as application display submissions (21–22 versus 20). These are not renderer failures or qualified performance results.
- `3a5089`: separates display/internal render counts, retains one application scheduler, records complete raw intervals and real drawing-buffer size, verifies nonblank motion endpoints and exact return-to-origin images, and rejects mixed-host/run/trial receipts. Browser validation remains pending at this checkpoint.

Normal timing trials do not add per-frame readback or GPU fences. rAF cadence is browser scheduling, **not GPU completion or input latency**. Frame-stepped poses are not wall-clock-normalized input replay. Settled image equality does not establish in-motion continuity. SwiftShader is not a physical phone GPU. Different instrumentation versions must never be compared as a claimed speedup.

## Work lanes

1. **Continuity/sorting:** validate instrumentation, expand controlled camera/LoD experiments, and reproduce [#407](https://github.com/sparkjsdev/spark/issues/407) on affected Mac Chrome before proposing a platform fix.
2. **Streaming lifecycle:** controlled late/aborted requests, scene churn, ownership and byte correctness. Current fetchers already accept `AbortSignal`; do not repeat outdated claims from [#318](https://github.com/sparkjsdev/spark/issues/318) without checking source.
3. **Quackles fidelity:** source-matched authored cameras and reference renders. [RFC #47](https://github.com/kvnloo/quackles/issues/47) found fidelity problems **at 4–8× zoom**, not a measured 4–8× overall quality loss. Mesh remains scene authority; don't mix 201MP/1GP source masters.
4. **Hardware/mobile/XR:** physical Android and affected desktop/headset acceptance are separate strata; emulated viewports and software GPUs cannot qualify these claims.
5. **Resource/performance:** separate fetch/decode/upload/sort/residency/publication, calibrate collector overhead, and retain last correct visual while stale work is rejected. Do not blindly freeze necessary 3D updates during motion.

## Promotion gates

- [ ] Refresh upstream and duplicate/maintainer-policy checks before any external action.
- [ ] Keep the source fix and regression minimal; remove fork-only workflows from proposed upstream diff.
- [ ] Retain exact-head green tests **and a failing upstream control**. Rust/browser/device suites are required where the change affects those paths; a pure byte-range correctness fix is not a device-performance claim.
- [ ] Performance proposals need matched fixtures/tapes, five or more valid repetitions (ten for close results), instrumentation-overhead controls, and relevant physical hardware.
- [ ] Preserve original authors and source provenance. Obtain approval before upstream publication or default-branch merge.

**No renderer-performance winner and no physical-device result is claimed.**
