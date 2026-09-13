# Synthetic teaching demonstration: first persisted UI run

The first persisted UI run completed on **2026-09-13 at 18:33:44 UTC** with seed **42**, displayed rewarded cue **A**, and both A/B counterbalances calculated. All **18 declared numerical criteria passed**. The rewarded cue's measured readout fell from **16 to 10 spikes per 0.30-second probe** in both counterbalances; the other cue remained at 16. This is a four-neuron synthetic demonstration of the existing mathematical timing rule.

## Artifact and source identity

Run directory, relative to the repository root:

`fly-lab/runtime/teaching/f20eb709b5f742268655154d35a85378/`

The directory contains `result.json` (1,014,318 bytes), `record.json`, an empty `worker.log`, and `source/` snapshots of the four Python files below. Result and snapshot hashes were independently recomputed from these saved files while writing this report; they match the run record. No experiment was rerun for this report.

| Artifact | SHA-256 |
| --- | --- |
| `result.json` | `753e8d0232781dd5884451b5610e801ec3fc1a378390c155239536902390e7f4` |
| `record.json` | `4ed5b85b3078092defe062d4e5a5e914e65314fcae694cb031e8dd8904f57c4f` |
| `source/teaching.py` | `019319f392a7a76f6ea4ffcce6f49085476d86b514bd111079448047f904106f` |
| `source/teaching_service.py` | `78dce68a881a7794043180ff2adec48053c22d87fb0f893698d6bdc135b73571` |
| `source/model.py` | `e64c5af6d15da29306357727a973489a498be82cce3ca5b904e8880fe57c7dc5` |
| `source/plasticity.py` | `0fc21608f20b75abc45a87b4f6dc099226171f85afd2b196bdca7de51f823561` |

Recorded Git HEAD: `2489be02b105cb1392755ad85d98547a8de543b0`. The worktree contained uncommitted changes; HEAD alone does not identify this implementation. Recorded source-tree hash: `9e057e8bf90821d1e8cd65d45cdb6cd346bdb4bdc48f417bc6a21f856da40736`. The service checked that this hash stayed unchanged during calculation. The retained snapshots cover the four Python modules, not the entire source tree or Python environment.

Synthetic graph hash: `919bd607a0924a11accb9970be231dfb5deadd8a6fa03d1056d7d4ddaca071ce`. The complete graph arrays and parameters are in `result.json` under `sourceProof`.

## Protocol and measurements

Two artificial cue neurons project through two excitatory plastic edges to one shared MBON-like readout. One artificial DAN-like reward neuron supplies two explicitly assigned modulatory couplings. Each cue edge has 80 engineered contacts. Direct **35 mV current** elicits cue and reward spikes in the existing `LIFModel`; the readout receives no direct current. Actual model spike counts enter the existing `CompartmentPlasticity` implementation and drive efficacy changes.

The LIF timestep is 1 ms; recorded and plasticity bins are 10 ms. Each cue pulse lasts 0.20 seconds and each reward pulse 0.10 seconds. Reward begins 0.05 seconds after cue offset in paired training, versus 1.0 second after offset in the unpaired control. The unpaired gap is ten 0.10-second trace constants. Both conditions use 2.5-second cue slots and three A/B trials, ordered **B/A, A/B, A/B** by seed 42. The frozen control receives the paired schedule with all plasticity frozen. Plasticity uses eta 0.00015, a 0.05-second efficacy lag, and 1,800-second memory timescale. These teaching parameters were declared before the first calculation and were not adjusted in response to its outcome.

Cue-before-reward timing matters: the existing signed timing rule depresses forward pairing; simultaneous proportional cue/reward traces would cancel. All three conditions have identical engineered input doses (21 mV-seconds to each cue; 10.5 to reward, subject to floating-point representation), and all elicited exactly **99 cue-A, 99 cue-B, and 48 reward training spikes**. Small residual unpaired efficacy changes are reported rather than rounded to an assertion of zero learning.

Each probe resets voltage, synaptic current, delay queues, refractory state, and clock while preserving efficacy and plasticity state. All plasticity, including trace evolution and passive decay, is frozen during evaluation. Every probe recorded zero reward spikes and identical before/after memory hashes.

| Rewarded cue | Condition | A readout pre → post | B readout pre → post | Final A-edge efficacy | Final B-edge efficacy |
| --- | --- | --- | --- | --- | --- |
| A | Paired | 16 → 10 | 16 → 16 | 0.6066616101931329 | 1.000000000191378 |
| A | Unpaired | 16 → 16 | 16 → 16 | 0.999971841455341 | 1.000002605422903 |
| A | Frozen | 16 → 16 | 16 → 16 | 1 | 1 |
| B | Paired | 16 → 16 | 16 → 10 | 1.0000000001909648 | 0.6064784551851728 |
| B | Unpaired | 16 → 16 | 16 → 16 | 1.0000026000037234 | 0.9999705286420466 |
| B | Frozen | 16 → 16 | 16 → 16 | 1 | 1 |

All efficacies began at 1. Counts refer to the shared readout in separate 0.30-second A/B probes. Rewarded-cue suppression is 6 spikes, or 37.5%. Both counterbalances are deterministic symmetry checks; they are not independent animals or statistical replication.

| Intervention after paired training | A-rewarded probes (A, B) | B-rewarded probes (A, B) | Memory action |
| --- | --- | --- | --- |
| Sham | (10, 16) | (16, 10) | Reset transients; preserve trained efficacy and rule state |
| Erasure | (16, 16) | (16, 16) | Reset both rule state and external efficacy to baseline |
| Restoration | (10, 16) | (16, 10) | Restore saved trained neural/plasticity arrays, then reset transients for frozen probes |

The numerical criteria require at least one spike and 20% rewarded-cue suppression, unchanged other-cue output, unpaired output change at most one spike and efficacy drift below 0.01, a smaller unpaired effect than paired suppression, unchanged frozen output/efficacy despite delivered reward, matched input doses, frozen evaluation, and successful erasure/sham/restoration checks. All nine checks passed for each counterbalance.

## Resources and verification status

The saved worker record reports **4.125 seconds**, **51,884,032 bytes sampled peak RSS** (about 49.5 MiB), **65 samples**, and **3 distinct observed process IDs** in its owned process tree. Numerical-library thread settings were 2. The service monitors a 4 GiB sampled-RSS / 180-second budget and terminates the owned tree on excess; sampled RSS is not an operating-system allocation ceiling.

Verification completed during implementation: **21 core Python tests**, **5 service tests**, **16 JavaScript tests**, TypeScript checking, and the private application build passed. The private build retained existing chunk-size warnings. Core tests include repeatability, both counterbalances, reconstruction of readouts from saved frames, instrumentation proving recorded spikes come from `LIFModel.advance`, no evaluation updates, and a disabled-plasticity negative control that fails the learning criteria.

Browser QA completed by the root agent: a fresh Run produced this first record; paired, unpaired, and frozen buttons displayed the saved values; playback advanced and paused recorded bins; desktop and 390-by-844 mobile layouts had no horizontal overflow; and the existing Watch view opened with working replay. The Download button produced a full `{record, experiment}` payload equal to the saved files. Browser console warnings and errors were empty. The selected A counterbalance retains 1,800 paired and 1,620 frames per control; the B counterbalance retains numerical summaries. Playback represents these completed calculation bins, not live neural streaming.

## Reproduce the numerical artifact from snapshots

These PowerShell commands create a new temporary package from the preserved numerical source files and use the existing local Python environment. They do not overwrite the original run. They are reproduction instructions, not an additional run performed for this report. CLI reproduction has the fixed experiment size; process-tree supervision belongs to the service.

```powershell
Set-Location -LiteralPath 'C:\Users\scott\Documents\Scicon Shooter'
$teachingSnapshot = Join-Path (Get-Location) 'fly-lab/runtime/teaching/f20eb709b5f742268655154d35a85378/source'
$teachingRepro = Join-Path $env:TEMP ('scicon-teaching-' + [guid]::NewGuid().ToString('N'))
$teachingPackage = Join-Path $teachingRepro 'scicon_fly'
New-Item -ItemType Directory -Path $teachingPackage | Out-Null
New-Item -ItemType File -Path (Join-Path $teachingPackage '__init__.py') | Out-Null
foreach ($teachingModule in @('teaching.py', 'model.py', 'plasticity.py')) {
    Copy-Item -LiteralPath (Join-Path $teachingSnapshot $teachingModule) -Destination $teachingPackage
}
$env:PYTHONPATH = $teachingRepro
& 'fly-lab/.venv/Scripts/python.exe' -m scicon_fly.teaching --seed 42 --rewarded-cue A --output (Join-Path $teachingRepro 'result.json')
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $teachingRepro 'result.json')
```

Expected numerical artifact SHA-256 in the same numerical environment: `753e8d0232781dd5884451b5610e801ec3fc1a378390c155239536902390e7f4`. The CLI refuses an existing output path. Python/NumPy environment differences can affect exact numerical reproducibility; the environment itself is not archived here.

## Scope

Classification is **SYNTHETIC_TEACHING_EXPERIMENT**. The graph manifest explicitly sets `synthetic: true`. Cell roles, contacts, reward coupling, timing, and current inputs are engineered assignments. The experiment provides no MaleCNS mapping, visual transduction, preference or choice measure, game score, biological learning claim, or biological gate validation. It does not modify or satisfy the MaleCNS training gates. The supported finding is cue-specific output suppression caused by this mathematical plasticity rule in this declared tiny circuit.
