# Implementation verification

Validation performed locally on Windows, Intel i7-1165G7 / Iris Xe, approximately 64 GB RAM. This document describes software checks, not a successful biological learning experiment.

| Check | Result |
|---|---|
| Python suite | 62 passed: ingestion, independent Brian2 oracle, signed reinforcement, checkpoint/frozen-state integrity, candidate assays, controls/statistics, file-backed gates, lifecycle/recovery |
| New real-engine environment suite | 8 passed |
| Existing focused gameplay/Pixi regressions | 61 passed across 11 existing files |
| Native production behavior comparison | 1,641 consecutive per-frame snapshots identical to baseline through natural death with research hooks omitted |
| TypeScript | Root game and isolated lab both passed |
| Lint | No errors in changed runtime and lab files; four existing unused-variable warnings in canonical game/renderer |
| Production build and exclusion | Passed; no Fly Lab/Director modules, data or markers in production output |
| Lab build | Passed; existing large-bundle warning remains |
| SwiftShader deterministic browser replay | Initial state plus 60 decisions: state, grayscale, PNG, events and 235-asset seal identical; duplicate command idempotent; no prohibited requests |
| Intel D3D11 deterministic browser replay | 240 decisions through Wave 2 with matching state, grayscale, PNG, events and asset hashes |
| HTTP/UI repeatability | 20/20 warm anatomy reloads; no lost connection; fresh browser status/anatomy payloads verified after TCP/response fixes |
| End-to-end representative run | `20260913T041704-094a322c`, 12 simulated seconds, 240 decisions, score 84; pause/manual-step/resume, ZIP export, mutation-header rejection, strict replay and responsive browser checks passed |

The representative export is local at `experiments/20260913T041704-094a322c`, with a ZIP in `runtime/representative-run.zip`. It is an engineering random-action baseline with continuous fire, not a learned policy. Full artifacts are intentionally ignored by Git. Reproduce verification using `node scripts/verify-workflow.mjs --render-profile local-d3d11 --seconds 12` with the lab running and source stable. `verify-replay.mjs` checks both profiles when invoked with `--render-profile`.

## Scientific checks and result

The actual MaleCNS graph was compiled and independently counted: 166,700 neurons, 25,582,938 directed edges, 124,177,617 contacts. A real six-stimulus candidate screen ran with frozen projected optic-hex inputs, parameters, nominated populations, decoder and thresholds. Visual and decoder criteria failed. See the [measured screen](evidence/malecns-hex-v0.1-screen.json) and [diagnosis](evidence/malecns-hex-v0.1-diagnosis.json). The worker refuses these assay-only manifests for gameplay training.

The numerical kernel matches Brian2 on tested equations/scheduling. This is not reproduction of a published FlyWire behavioral assay or validation of transferred MaleCNS physiology. Whole-graph CPU timing was roughly 73 wall seconds per modeled second in the initial low-activity probe; a large pilot was not launched.

## Visual verification against the design concept

The implemented layout retains the concept's persistent navigation, separate experiment controls, portrait game column, central morphology view, stacked input/action/reward/gate panels, and bottom traces. The cyan/dark instrument palette and panel hierarchy are preserved. Conceptual brain outlines, gameplay artwork and fake activity were replaced with actual canonical game captures, eight authentic SWCs, exact grayscale observations and measured traces or honest empty states. Desktop panels fit the tested 1536×1024 viewport. Mobile stacks the panels without horizontal overflow. Skeletons are explicitly labelled a sample; model activity is not inferred from their colors.

## Limits of these checks

Browser coverage is bounded; it has not exercised every wave/ship/device or the full 90-second mission cap. Cross-GPU/cross-machine numerical identity is not promised. Second-installation results are recorded separately when performed. No code was pushed, deployed or merged into main, and unrelated authoring/assets were not included in the Fly Lab change.
