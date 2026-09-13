# Implementation verification

Validation performed locally on Windows, Intel i7-1165G7 / Iris Xe, approximately 64 GB RAM. This document describes software checks, not a successful biological learning experiment.

| Check | Result |
|---|---|
| Python suite | 101 passed: ingestion, independent Brian2 oracle, signed reinforcement, actual life-loss rewards, checkpoint/frozen-state integrity, fixed-acquisition controls, candidate assays, statistics, file-backed gates, source-version guard and lifecycle/recovery |
| New real-engine/asset suite | 13 passed: nine environment tests plus four asset integrity tests |
| Existing focused gameplay/Pixi regressions | 60 passed across 11 existing files after life-event correction |
| Native production behavior comparison | 1,641 consecutive per-frame snapshots identical to baseline through natural death with research hooks omitted |
| TypeScript | Root game and isolated lab both passed |
| Lint | No errors in changed runtime and lab files; four existing unused-variable warnings in canonical game/renderer |
| Production build and exclusion | Passed; no Fly Lab/Director modules, data or markers in production output |
| Lab build | Passed; existing large-bundle warning remains |
| SwiftShader deterministic browser replay | Initial state plus 60 decisions: state, grayscale, PNG, events and corrected 235-asset seal identical; duplicate command idempotent; no prohibited requests |
| Intel D3D11 deterministic browser replay | 240 decisions through Wave 2 with matching state, grayscale, PNG, events and corrected asset hashes |
| Native longer episode | Four waves, 1,049 decisions, native defeat at tick 3,146 (52.43 simulated seconds); score 390, 36 kills, three life losses and one terminal death event |
| Actual asset integrity | All 235 assets / 9,949,981 bytes match canonical files; no empty hashes, late assets, failed or external requests |
| HTTP/UI repeatability | 20/20 warm anatomy reloads; no lost connection; fresh browser status/anatomy payloads verified after TCP/response fixes |
| End-to-end representative run | `20260913T045443-b84de665`, 12 simulated seconds, 240 decisions, score 84; pause/manual-step/resume, finalized ZIP export, mutation-header rejection, strict replay and responsive browser checks passed |
| Separate clean JavaScript installation | Fresh local Git clone plus independent root/lab `npm ci`; all 240 decisions and initial state reproduced exactly using exported source bytes |

The representative export is local at `experiments/20260913T045443-b84de665`, with a ZIP in `runtime/representative-run.zip` (3,120,827 bytes). It is an engineering random-action baseline with continuous fire, not a learned policy. Full artifacts are intentionally ignored by Git. Reproduce verification using `node scripts/verify-workflow.mjs --render-profile local-d3d11 --seconds 12` with the lab running and source stable. `verify-replay.mjs` checks both profiles when invoked with `--render-profile`. Completion is published only after summary, tables, report and checksums finish; a concurrent regression verifies that finalization cannot advertise a ready export early.

## Scientific checks and result

The actual MaleCNS graph was compiled and independently counted: 166,700 neurons, 25,582,938 directed edges, 124,177,617 contacts. A real six-stimulus candidate screen ran with frozen projected optic-hex inputs, parameters, nominated populations, decoder and thresholds. Visual and decoder criteria failed. See the [measured screen](evidence/malecns-hex-v0.1-screen.json) and [diagnosis](evidence/malecns-hex-v0.1-diagnosis.json). The worker refuses these assay-only manifests for gameplay training.

The numerical kernel matches Brian2 on tested equations/scheduling. This is not reproduction of a published FlyWire behavioral assay or validation of transferred MaleCNS physiology. Whole-graph CPU timing was roughly 73 wall seconds per modeled second in the initial low-activity probe; a large pilot was not launched.

The final review corrected the fixed/plastic acquisition contrast: both conditions receive the same declared signed-DAN reinforcement protocol; fixed acquisition freezes all efficacy, passive and plasticity-trace updates. Held-out evaluation remains reward-free. The sealed study protocol and analysis reject legacy fixed runs that withheld reinforcement. Synthetic tests establish execution semantics; they do not establish MaleCNS learning.

## Visual verification against the design concept

The implemented layout retains the concept's persistent navigation, separate experiment controls, portrait game column, central morphology view, stacked input/action/reward/gate panels, and bottom traces. The cyan/dark instrument palette and panel hierarchy are preserved. Conceptual brain outlines, gameplay artwork and fake activity were replaced with actual canonical game captures, eight authentic SWCs, exact grayscale observations and measured traces or honest empty states. Desktop panels fit the tested 1536-pixel viewport width. Mobile stacks the panels without horizontal overflow. Skeletons are explicitly labelled a sample; model activity is not inferred from their colors.

## Separate installation

[The corrected clean-install report](evidence/clean-install-reproduction.json) records source commit `e4ec9745`, restored from the representative export over clean clone base `b54c4c08`. The clone's independent root/lab dependency installations were reused with unchanged lockfiles. All 311 source files were verified before and after replay, including exact line-ending bytes. All 235 nonempty asset files and every action's state, grayscale, PNG and event hash matched. The 12-second replay took 11.97 wall seconds. The temporary Vite server was stopped afterward. The corrected asset-manifest hash is `0cb9abc5a551138ea037e9f7a8c3d48e694562607298def778159cabce079e1a`; source-tree hash is `af5786570b548e7a4fc9d46a93bba5e2118f50f7f979a8fcfc5bd25477361599`.

This was a separate JavaScript dependency installation on the same Windows computer and GPU. It reused the pinned Chromium cache and the original Python interpreter only to read Parquet/provenance; it is not a cross-hardware or independent Python installation claim.

## Limits of these checks

Earlier QA runs used Playwright page-response bodies to hash PNGs loaded through Pixi workers. The browser returned empty buffers for 228 successful image loads, making those old PNG hashes invalid evidence of asset integrity. Their original artifacts remain preserved and are superseded by corrected exports. The driver now hashes complete upstream bytes and fulfills Chromium with those identical bytes, records byte lengths, rejects empty/partial/redirected responses and seals the manifest before tick zero. Native damage now emits counted life-loss events; terminal presentation is never used as a proxy for damage.

Browser coverage is bounded; it has not exercised every wave/ship/device or survived through the full 90-second mission cap. Cross-GPU/cross-machine numerical identity is not promised. No code was pushed, deployed or merged into main, and unrelated authoring/assets were not included in the Fly Lab change.
