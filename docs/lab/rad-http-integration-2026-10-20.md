# Real RAD / HTTP / WASM experiment — 2026-10-20

Downstream evidence for [draft PR #2](https://github.com/kvnloo/spark/pull/2), not another fix or an upstream submission. The actual renderer/fetcher source on this branch is unchanged from `ffe210dc0a45d0515a06c9235878108112827d61`.

## What the experiment verifies

The script imports the real Rust/WASM decoder and serves Spark's complete `furry-logo-pedestal-lod.rad` via a loopback HTTP server. It tests every one of the six chunks with a server honoring Range (`206`) and a server ignoring it (`200`). Both the original fetcher and the exact draft source are loaded in memory; no production file is patched on disk. Candidate source Git blob must equal `e585943666ae6780895c97e714a5cae7449ca4c4`.

Each returned byte range is checked against its monolithic file slice **and** the corresponding independently generated `.radc`. Decoded packed attributes, SH1/SH2/SH3 and LOD-tree buffers are compared by SHA-256, not only by splat count. The experiment fails unless all 18 positive cases match and all six expected baseline failures decode the *entire* model instead of the requested page. A crash or unrelated decoder error cannot satisfy the negative control.

## Locally executed result

Using [exact fixture artifact 12250014219](https://github.com/kvnloo/spark/actions/runs/39392687999/artifacts/12250014219):

| Fetcher / server | Correct chunks | Decoded splats per request |
| --- | --- | --- |
| Original / 206 | 6/6 | 65,536 for chunks 0–4; 65,287 for chunk 5 |
| Original / 200 | 0/6, required negative control | 392,967 for every request |
| Draft #2 / 206 | 6/6 | Correct page counts and buffer hashes |
| Draft #2 / 200 | 6/6 | Correct page counts and buffer hashes |

The monolithic RAD is 11,165,928 bytes and contains 392,967 LOD splats. Source SPZ SHA-256: `882af7282cb88085fe364949097221f53a2e5e64b8b03d6d22ff70805e635a02`. Local RAD SHA-256: `5efad7047440f2807a8d024977caa9834e29e538ca6d3fbeb475a67b551fdea1`. Local WASM SHA-256: `c55005fb7657dba134cd97778510eb573497aaf9e3768d2042ce87321d5cba7c`.

## Reproduce

With Node 22.16+ and the repository's normal Rust/WASM build prerequisites:

```sh
npm ci
npm run build:wasm
CI=1 node --experimental-strip-types -e "import('./test/browser/global-setup.ts').then(m => m.default())"
node scripts/lab/rad-http-roundtrip.mjs
```

No Chromium or GPU is required. JSON receipts go to `artifacts/rad-http-roundtrip/receipt.json`; an optional first argument changes the output path. The downstream workflow runs the same commands from the frozen source base.

Limits: one source fixture, no rendered-pixel or physical-device validation, no network-speed claim. A non-range server still sends the full representation; the patch fixes correctness, not transport bandwidth. RAD metadata records build durations, so regenerated whole-file hashes may differ; source and individual chunk identities are recorded independently. This is separate from the 100K software-renderer settle investigation.

Provenance: mrxz's fetcher abstraction and owned-buffer contract remain intact. This experiment reuses Spark's existing asundqui browser-fixture setup rather than adding a second scene generator.
