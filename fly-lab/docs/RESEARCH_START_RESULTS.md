# First research batch: results and next decision

Completed 13 September 2026 UTC on the existing Windows PC. These are engineering measurements and a diagnosis of a failed candidate, not a trained fly or evidence of biological learning.

## Six real-game baselines completed

The frozen [baseline protocol](../configs/baseline-v1.json) ran all six scheduled episodes with the canonical Scicon engine, native ORBIT ENTRY mission, RSC ship, three starting lives, no upgrades and constant fire. All reached the 30-second limit. There were 3,600 recorded decisions, with exact observations, events, rewards and source/runtime identities. Each completed export passed its integrity and condition checks.

| Development seed | Stationary score | Random-movement score | Stationary lives left | Random lives left |
|---|---:|---:|---:|---:|
| 31001 | 76 | 249 | 3 | 1 |
| 31002 | 183 | 171 | 2 | 2 |
| 31003 | 203 | 186 | 2 | 1 |

Random movement scored higher in one pair and lower in two. It finished with fewer lives in two pairs. These descriptive observations show why a visually active or high-scoring recording is insufficient evidence of learning. Neither condition contains a neural worker, plasticity or delivered dopamine-style reinforcement. Three development pairs do not support a general performance conclusion or a statistical learning claim. Recorded outcome rewards remain +1 per enemy destruction and −5 per life lost, with no coin bonus.

The batch took **301.27 wall seconds** for **180 simulated seconds**. The recorded decision loops totaled 289.718 seconds, or **1.61 wall seconds per simulated second**; individual ratios ranged from 1.42 to 2.08. Loop timing includes stepping, recording, finalization and process-memory sampling, and excludes reset and post-run integrity checks. This is not neural throughput. Sampled peak summed RSS of the owned process tree was about **1.13 GB**, which can count shared pages more than once and excludes Vite/the dashboard. These values do not establish the memory budget for an active whole-CNS model.

All runs bind source commit `cec45436a120b880bb7ea803d42bb899ed89be43`, source-tree hash `aad08fae0a01272aa600bdf352223e717f8290c773869d0dd77dc5bc36c1263d`, and the same pinned local D3D11 browser/assets identity. The protocol hash is `bb883aafd9e11401e4765b6d2ce80e04ace50c767cf95abe003d9c2235b809df`.

The last scheduled random run, `20260913T065659-7c5f0b2c`, passed fresh replay of all **600 decisions**, including initial state/pixels, state, grayscale observation, exact PNG, event and runtime/asset checks. Its source was rechecked after replay. A verified display movie with 601 frames is available in Watch; the H.264 movie is a lossy display derivative, while original policy observations remain in the immutable export. This verifies one representative replay, not every episode's replay and not cross-platform identity.

Machine, schedule, per-episode run IDs/checksums and replay evidence are preserved in [the results record](evidence/baseline-20260913.json). Full exports remain under `fly-lab/experiments/`; the batch output is `fly-lab/runtime/baseline-20260913-first/`. Both directories remain local and excluded from production. The batch and replay finished and released their owned game/browser workers; no continuing training job was started.

## What the actual-connectome diagnosis established

The sparse analysis used all 166,700 included neurons and 25,582,938 directed pairs. Anatomical routes from the frozen candidate inputs reach all **335 nominated visual KCs** and all **97 MBONs**. Visual KCs have **4,407 direct pairs / 40,114 contacts** onto 68 of those MBONs. The analysis completed in 3.79 seconds and peaked at approximately 937 MB working set; no additional whole-network simulation was required. [Full diagnosis and limitations](evidence/diagnostic-connectivity.md)

Structural reachability does not guarantee a physiological response. All 1,767 directly driven L1 cells have inhibitory outgoing effects in this candidate. Undriven cells begin silent with no background excitation. Under the implemented current-based dynamics, that combination cannot initiate downstream spikes. Extending the failed 50-ms screen or running more game episodes would not remove this barrier.

The decoder also reads MBONs directly through an engineered software boundary. This is not evidence of a working descending/VNC motor pathway. The anatomical display does not establish that those anatomical regions caused actions.

## Next scientific work

The immediate task is a new, separately specified sensory/physiology candidate grounded in published fly responses: sensory geometry, graded early visual behavior, background activity and receptor effects need explicit treatment. Freeze stimulus and response criteria before evaluating it. Preserve the failed candidate for comparison; do not tune signs or thresholds against gameplay scores.

Useful sensory responses and a causal decoder must precede conditioning. Paired/unpaired/frozen/erasure controls must precede game-learning claims. The full study preflight was rerun and remains blocked by missing validated replica/control manifests and random-action calibration. Its 5,760-episode template was not launched. Failed gates remain unchanged.

The highest-priority additional resource is scientific review by a Drosophila vision/connectomics or computational-neuroscience collaborator. The existing PC supports this first stage with its display off while Windows stays awake. The Pi is optional and is not a prerequisite or an automatic compute accelerator. Hardware purchases should follow a validated active-neural benchmark.

A [ResearchHub proposal draft](RESEARCHHUB_PROPOSAL_DRAFT.md) is ready locally. Its first-stage $5,000–10,000 range is a planning estimate for collaboration, validation and independent reproduction, not a quote, award or spending commitment. Applicant/ORCID details, recipient eligibility, final methods and budget remain to be resolved before publication.

## Software verification and boundaries

- **141 Python tests passed**, including the independent Brian2 equation oracle and new diagnostic/baseline regressions.
- **16 JavaScript engine/signal tests passed**; lab TypeScript checking passed.
- The existing production artifact passed the lab/Director exclusion check. No production source was changed and no deployment was made.
- One earlier full-suite attempt timed out on the existing portable HTTP range test. The targeted rerun and final full suite passed without changing the portable server. Existing Brian2/pyparsing deprecation warnings remain.
- Existing unrelated asset work and user-owned untracked files were preserved. No wallet, account, public score, message to another person or ResearchHub submission was created.
