# A real-connectivity conditioning mechanism check

The first completed reduced-circuit assay uses **720 annotated MaleCNS gamma Kenyon cells, MBON11 (body 11402), and PPL101 (body 11327)**. Actual KC-to-MBON contacts affect the modeled output. A declared learning rule changes separate connection efficacies. The result is a small, reproducible computational mechanism check, with a recorded activity display. It is not the random game controller, a whole-fly simulation, or evidence of learned gameplay.

The first execution completed on 13 September 2026. Its methods were written and hashed locally before the first condition was evaluated. This is local prespecification, not an external preregistration. No parameter sweep or outcome-driven fitting was performed.

## What comes from anatomy

The compiled graph is the existing official MaleCNS v1.0 ingestion: 166,700 neurons and 25,582,938 directed pairs. The assay verifies the graph file SHA-256 against its manifest and verifies the raw annotation file against its recorded SHA-256.

Selection includes every right-hemisphere `KCg*` cell with a positive directed contact count to right MBON11 and a positive PPL101-to-KC contact count. No strength threshold is applied. There are 763 candidate gamma KCs with MBON11 contacts; 43 lack an observed contact from the nominated DAN and are excluded. The retained 720 KC-to-MBON pairs contain 15,870 contacts; the supporting DAN-to-KC pairs contain 2,480 contacts.

Actual annotation instances are `MBON11(y1pedc>a/B)_R` and `PPL101(y1ped)_R`. The [Li et al. mushroom-body connectome paper](https://elifesciences.org/articles/62576) maps MBON11 and PPL101 to gamma1pedc. The paper supports an aversive-reinforcement interpretation for this module. This is not an appetitive score-reward module. The transfer of that type crosswalk to MaleCNS uses released annotations; we have not retrieved synapse-level compartment coordinates for these connections.

Only KC-to-MBON edges transmit rates in this reduced model. DAN-to-KC contacts establish eligible candidate edges; contact counts are not treated as receptor counts or dopamine-release measurements. The model applies uniform dopamine modulation across eligible edges. The anatomical manifest also records **134,926 other internal directed pairs, totaling 231,858 contacts, that the reduction omits**, including feedback and KC-to-KC connections. Connections with excluded cells are outside this model. This substantial reduction precludes claims about intact topology, full CNS operation, or VNC contribution.

## What we designed

The equations are a new phenomenological rate model, separate from the whole-graph LIF worker and `CompartmentPlasticity`. They are inspired by the experimentally supported pairing-dependent depression described by [Hige et al. 2015](https://pubmed.ncbi.nlm.nih.gov/26637800/), but do not reproduce that paper's physiological measurements or exact stimulation protocol. In particular, this model has no bidirectional rule, detailed dopamine receptor kinetics, recurrent circuitry, or measured time constants.

- Two cue identities are each assigned directly to 36 disjoint KCs (5% of those retained), using a seeded permutation. They are symbols for imposed inputs, not screen images or biologically reconstructed odor representations.
- Each selected KC receives 20 Hz target rate multiplied by a fixed, seeded gain uniformly drawn from 0.8 to 1.2. The gain variation is an engineering assumption.
- KC and DAN rates are first-order filters with a 100 ms time constant. The DAN target during reinforcement is 20 Hz.
- The normalized KC eligibility trace has a 500 ms time constant. Each 20 ms step multiplies efficacy by `exp(-0.12 * eligibility * (DAN rate / 20 Hz) * dt)`, bounded between 0.1 and 1.0.
- MBON rate is a 100 ms filter of the contact-weighted KC-rate sum, scaled by efficacy and divided by the total retained KC contact count. This denominator is fixed across all cues and conditions.
- The MBON has no behavioral decoder. Reduced activity in this output is not itself a measured preference, avoidance choice, or game action.

These parameters were fixed before outcome execution. Depression's direction is built into the equation. The assay checks whether timing, cue specificity, disabled plasticity, memory erasure, and checkpoint behavior work as declared. Passing cannot independently validate the equation as a biological explanation.

## Protocol and controls

Eight seeds provide different cue assignments and fixed KC gains on the **same anatomical specimen**. Each seed is tested with A reinforced and B reinforced. These are 16 input assignments per condition, not 16 flies or independent anatomical replicas. There are six conditions and 96 executions in total. We report descriptive effects, not confirmatory biological significance tests.

Before training, each cue receives a three-second probe; output is averaged over seconds one to three. Transient rates and eligibility traces are reset before each probe. All probe efficacy and eligibility updates are disabled, with exact equality checks.

Training presents four A/B pairs in twelve-second slots. The cue is on from slot seconds two to four. A one-second DAN input occurs only for the nominated reinforced cue. Conditions change its timing or plasticity:

| Condition | Manipulation |
|---|---|
| Paired | DAN input at seconds three to four, overlapping the cue |
| Unpaired | Same amount of DAN input at seconds nine to ten |
| Backward | Same amount of DAN input at seconds zero to one |
| Absent | No DAN input |
| Frozen | Same paired input, efficacy and eligibility updates disabled |
| Erased | Same paired training, then restore all efficacies to baseline before the post-test |

Post-training probes use fresh transients and fixed efficacies. Cue suppression is `1 - post-response/pre-response`. Specific suppression is reinforced-cue suppression minus other-cue suppression. A saved full state includes rates, eligibility, efficacies, fixed gains, clock, model identity and contact identity. Every execution checks JSON roundtrip and exact next-step agreement; pre/post probes cannot modify efficacy or eligibility.

## First result

| Condition | Mean cue-specific output suppression |
|---|---:|
| Paired | 36.367684% |
| Same reinforcement, delayed | 0.000957% |
| Reinforcement before cue | 0.000018% |
| No reinforcement | 0% |
| Plasticity disabled | 0% |
| Memory erased | 0% |

Paired effects range from 35.632097% to 37.090562% across the 16 assignments. In the recorded seed, cue A's MBON response changes from 1.030526 to 0.648298 modeled Hz, while B stays at 1.008589 modeled Hz. These absolute rates are outputs of the assumed normalization; they are not fitted fly firing rates.

All seven predeclared engineering checks passed. All 96 executions passed exact checkpoint/continuation and fixed-probe checks. The first study took 18.67 wall seconds. The largest RSS observed at watchdog checks was 171,720,704 bytes; this is sampled RSS rather than a claim about continuous peak allocation. The script limits numerical libraries to two threads and checks a 240-second / 4-GiB budget during execution.

The defensible conclusion is: **the declared plasticity mechanism produces retained, cue-specific output changes on this anatomical reduction, and controls attribute those changes to the rule and pairing schedule.** It does not establish a new biological discovery, useful vision, behavior, intact-connectome learning, or Scicon learning. All existing whole-brain validation gates remain unchanged.

## Activity display and reproducibility

The public artifact contains 540 snapshots over a 108-second recorded paired execution: pre-probes, training, and post-probes. It includes 16 sampled KC rates plus the identified DAN and MBON rates. These are actual computed **model rates**, not decorative pulses or spike counts. The display must say “Recorded model activity.” Repeating this recording does not add trials, generate new evidence, or continue training. Reinforcement input is a separate channel from the resulting DAN rate. Other brain regions must not be lit as if simulated.

Original released soma coordinates accompany all selected cells; visual rescaling is allowed, but those coordinates do not localize active synapses. A labeled circuit diagram may show functional relationships. It must not imply measured activity elsewhere in the brain.

From the canonical checkout with the lab's Python environment and verified graph/annotations present:

```powershell
fly-lab/.venv/Scripts/python.exe fly-lab/scripts/run-reduced-conditioning.py --output fly-lab/runtime/reduced-conditioning-reproduction
```

The output directory must not exist. Existing runs are never overwritten. The script writes `frozen-protocol.json` and `circuit.json` before any condition outcomes, and verifies source hashes again before publishing a completed result. Output files are checksummed. `public-experiment.json` is the compact viewer artifact; `checkpoints.json` and the complete anatomical reduction remain available for audit. Exact numerical reproduction was checked separately in the same environment; cross-platform tolerances require separate validation.

Evidence directory: `fly-lab/evidence/reduced-conditioning-v1/`. Full released data are local and excluded from production builds. Public dataset attribution is FlyEM / HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology, and Google Research; MaleCNS data are CC-BY-4.0. Sources are linked above and in the machine-readable artifact.

## What comes next

Use this completed mechanism check as a foundation, not as a replacement label for game learning. Next, test sensitivity to cue overlap, parameter uncertainty, neuron selection and missing feedback. Reward-based boss training requires an appetitive or otherwise justified signed reinforcement mapping, credible screen-to-neural input, a causal action readout, retained plasticity, and fixed evaluation controls. None of those gates is advanced by this result alone.
