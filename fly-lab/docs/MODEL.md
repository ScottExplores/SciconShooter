# Scicon Fly Lab scientific model and worker contract

This is an engineered, connectome-constrained spiking network with experimental
interfaces. It is not a simulated animal, measured dopamine, or evidence that a
fly learned Scicon Shooter. The actual MaleCNS graph is available; calibrated
retinal mapping, decoder evidence, and end-to-end conditioning evidence are not.
The worker blocks real-graph vision without a validated mapping manifest and
blocks training unless every matching scientific gate passes. Synthetic graphs
exist only in explicitly labeled numerical and protocol tests.

## Reference dynamics

`model.SparseGraph.load(graph_path, manifest_path)` verifies the artifact SHA256
when provided, preserves exact uint64 neuron IDs, and loads presynaptic CSR rows.
Contact counts, endpoint indices, annotations, and modeled transmitter signs are
read-only arrays. Graph identity hashes the loaded arrays, selected annotations,
and manifest; it is distinct from the NPZ file SHA256. Synaptic efficacy is a
separate mutable float64 array initialized to one. No training changes anatomical
contacts or creates an edge.

`LIFModel(graph, LIFParameters(...)).advance(drive_mv, steps, silenced=None)` returns
one spike count per neuron. For each nonrefractory cell, in milliseconds/millivolts:

```text
dv/dt = (E_L - v + g + I)/tau_m
dg/dt = -g/tau_s
delayed source spike: g_target += .275 * contact_count * source_sign * efficacy
threshold: v > -45; reset: v = -52, g = 0
```

Defaults are E_L/reset −52 mV, threshold −45 mV, tau_m 20 ms, tau_s 5 ms,
refractory 2.2 ms, delay 1.8 ms, and timestep 0.1 ms. These are
[Shiu et al. reference-model choices](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/),
not MaleCNS measurements. The
[author implementation](https://github.com/philshiu/Drosophila_brain_model/tree/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960)
motivated the numerical schedule; this module is an independent implementation.

Subthreshold evolution is exact for the held external drive. Each step evolves
states, checks threshold, delivers delayed events, and resets new spikes. Both v
and g are frozen during refractory periods; incoming writes to refractory cells
are discarded. Events store source spikes and read efficacy at delivery. The
0.1 ms threshold grid and discrete delays remain numerical approximations.
The synthetic Brian2 oracle test compares every voltage, synaptic state, and
spike bin in a 45 ms probe containing excitation, inhibition, an autapse, and
refractory arrivals. Passing it validates implementation agreement for those
cases; it does not establish appropriate physiology for all MaleCNS cell types.

Unknown and modulatory transmitter signs are explicitly zero in the compiled
source mapping. Their structural contacts remain present, but the reference
fast-transmission model makes them dynamically silent. DANs can still receive
input and their spikes can enter the separate experimental plasticity rule.
Glutamate/histamine sign assumptions, graded signaling, cotransmission, receptor
specificity, cell-specific thresholds, conduction delays, and neuromodulation
remain scientific uncertainties. A uniform spiking model is especially weak in
the early visual system. A graded/FlyVis-derived model would be a separately
versioned candidate requiring its own validation, not a hidden replacement.

## Experimental KC–DAN plasticity

`CompartmentPlasticity(graph, manifest)` only changes explicitly nominated,
existing excitatory KC→MBON edges. Real-graph cell annotations must identify KCs,
MBONs, and PPL/PAM/DAN cells. Each edge needs compartment evidence and positive
coupling weights to nominated DANs. Those metadata checks are necessary but are
not sufficient biological validation.

The rule is motivated by compartment-restricted, order-dependent plasticity in
[Hige et al. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4674068/) and the
KC–DAN formulation in
[Huang, Luo et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11525173/).
It does not use MBON postsynaptic spikes, a policy gradient, or game score as a
direct synaptic update. It is a new whole-graph adaptation, not a reproduction of
either paper. Its default constants are exploratory and must be fitted or
rejected through conditioning assays before game training.

```text
k_i = KC spike count / bin seconds
d_j = DAN spike count / bin seconds - declared DAN baseline Hz
tau_k dx_i/dt = k_i - x_i
tau_d dy_j/dt = d_j - y_j
F_e = eta [k_pre(e) * sum_j C_ej*y_j - x_pre(e) * sum_j C_ej*d_j]
du_e/dt = F_e - u_e/tau_memory
tau_efficacy dw_e/dt = u_e - w_e
efficacy_e = 1 + w_e
```

The bin maximum is 10 ms; traces use exact exponential filtering and their
midpoint values enter the forcing term. The two-state memory/efficacy system is
integrated analytically for that held forcing. Default trace constants are 1 s,
memory 1800 s, efficacy relaxation 0.05 s, eta 0.001. u and w are bounded so
efficacy remains 0.1–2 times anatomical baseline. Forward KC then DAN activation
produces depression and backward order can produce potentiation in synthetic
timing tests. Numerical convergence, real compartment assignments, baseline
firing, retention times, and visual conditioning remain unvalidated.

Manifest shape (placeholders must be replaced with actual evidence):

```json
{
  "graphHash": "MODEL_GRAPH_IDENTITY",
  "edges": [{
    "kcId": "EXACT_KC_ID", "mbonId": "EXACT_MBON_ID",
    "compartment": "EVIDENCED_COMPARTMENT", "evidence": ["SOURCE_REFERENCE"],
    "dan": [{"id": "EXACT_DAN_ID", "gain": 1}]
  }],
  "danBaselineHz": {"EXACT_DAN_ID": 0},
  "reinforcement": {
    "negativeNeurons": [{"id": "EXACT_AVERSIVE_DAN_ID", "gainMv": 20}],
    "positiveNeurons": [{"id": "EXACT_APPETITIVE_DAN_ID", "gainMv": 20}],
    "durationMs": 200, "maximumMagnitude": 5
  }
}
```

Both reward signs require separately declared mappings into nominated DANs.
The legacy `neurons` field means negative/aversive only. Positive reward with no
positive mapping is an error. The game can deliver +1 per enemy and −5 per lost
life; each signed event schedules abs(reward) times its declared current gain for
the full pulse duration. Simultaneous scalar net outcomes and amplitude scaling
must be preregistered by the experiment manager. The worker never clips an
event: magnitudes beyond `maximumMagnitude` error. Overlapping pulses add, so
every accepted event retains its dose. This is an imposed artificial
reinforcement channel; anatomical connectivity alone does not establish reward
meaning. Signed pulses are not modeled as a measured dopamine concentration.

Frozen evaluation freezes every plasticity trace, memory state, passive decay,
and efficacy. It accepts zero imposed reward and requires reset when crossing
between training and evaluation. Reset with `preserveEfficacy:true` retains u, w,
and efficacy while clearing v, g, delayed spikes, eligibility traces, retinal
filters, decoder filters, and pending reinforcement. A full reset also removes
learned efficacy. Flush terminal reinforcement before a preserving reset.

## Pixels and actions

The worker observes only base64 grayscale pixels, dimensions, and a scalar
reinforcement. `decode_observation` rejects extra keys, malformed bytes, and
oversized images. It receives no enemies, positions, health, collision flags,
evaluation seed, or other privileged game state.

`VisualTransducer` requires frozen samples
`{neuronId,x,y,gain}` with x/y in normalized image coordinates. It bilinearly
samples luminance, applies an exponential temporal filter, then a declared
saturating luminance-to-current transfer. This proxy is deliberately explicit;
it does not turn a neuron ID, hemisphere, or optic-lobe hex coordinate into a
validated receptive field. Real manifests require the matching graph identity
and `validation:{status:"PASS",evidence:[...]}`. No real mapping manifest is
provided by this implementation.

`FixedDecoder` filters graph spike counts and computes fixed x, y, and fire
channels. Each channel has `neurons:[{id,gain}]`, `thresholdHz`, and evidence.
The real decoder needs the same validation structure. Output is exactly:

```text
{movement: 'idle'|'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW', fire: boolean}
```

The decoder is frozen across training, retention, reversal, lesions, and held-out
evaluation. Thresholds are calibrated before holdout. Reversal changes which
external cue/outcome is reinforced while keeping the decoder and neural
manifests identical. Changing decoder gains to create reversal success is not a
valid reversal experiment. Visual conditioning must pass cue counterbalancing,
paired, temporally unpaired, backward-order, and no-US controls first; no-US
selectivity alone is a failure, not learning.

## Worker protocol and records

Start with `python -m scicon_fly.worker --graph PATH --manifest PATH --vision PATH
--decoder PATH`. Optional arguments are `--plasticity`, `--parameters`, `--gates`,
`--lesions`, `--interval-ms`, `--checkpoint-dir`, and repeated `--deny-root`.
`--allow-synthetic-fixture` is restricted to synthetic numerical/conditioning
tests. Startup diagnostics go to stderr; every stdin JSON line gets exactly one
stdout JSON response. Unrecognized fields are rejected.

| Operation | Request fields besides op | Effect |
| --- | --- | --- |
| status | none | Graph/model/interface identities and actual gate status |
| reset | preserveEfficacy boolean, default false | Reset episode transient state |
| step | observation:{grayBase64,width,height}, reinforcement, mode:training/frozen | Advance declared neural time; return action and activity |
| reinforce | reinforcement signed scalar, including zero | Flush pending and final terminal pulse with last retinal drive held; no action; reset required afterward |
| retain | seconds | Analytic passive memory retention with zero KC and centered DAN input; no full-network activity; reset required afterward |
| checkpoint | name: simple filename ending .npz | Save all mutable state |
| restore | name | Verify identity/hash and restore complete state atomically |
| transferMemory | name, sourceIdentity | Explicit compatible transfer across lesion conditions; retain learned memory and reset all transients |

`reinforce` requires a training episode and matching gates. It reports additional
`terminalNeuralMs`; game time does not advance. Zero drains pending pulses; with
no pending dose it takes zero modeled time. `retain` requires matching gates and
flushed pulses. It analytically evolves the declared trace/memory/efficacy rule
for up to 604800 modeled seconds, reports `retentionSeconds` separately from
`fullNetworkTimeMs`, and does not pretend to simulate spontaneous activity or
sleep. A full network retention model is a distinct future experiment.

Step and terminal summaries contain active counts, spikes, modeled time,
retinal samples, decoder rates, actual active cell-type populations, and at most
12 actual neuron IDs with counts, voltages, and synaptic states. The sample policy
is highest spike count with ties by exact ID; these are illustrative traces,
not an unbiased population sample. `plasticityChanges` records every changed
efficacy at every implemented plasticity rate-bin update, with edge index,
source/target IDs, numerical tick, modeled milliseconds, before/after/delta, and
kind. This is a complete ledger of implemented efficacy updates, not a
continuous-time synaptic trace. Passive retention emits separately labeled
analytic updates. Empty changes in frozen or blocked models mean no updates,
not evidence of biological stability.

Checkpoint NPZ files use no object arrays or pickle and have a SHA256 sidecar.
Identity binds graph, dynamics, vision, decoder, plasticity, lesions, timestep
interval, and worker schema. Checkpoints include voltage, synaptic state,
refractory history, delayed events, efficacy, all plasticity/filter states,
pending signed pulse schedule, frame clock, retained-time counter, last drive,
phase, and terminal flag. Invalid restore data rolls back. Checkpoints provide
integrity checking, not cryptographic authorship or protection from a malicious
same-account editor.

`--deny-root` installs Python filesystem audit hooks after configured inputs
load, rejecting access to evaluator experiment directories. Checkpoint names
cannot escape the configured worker directory. The process should use
`fly-lab/runtime/neural/` and the evaluator copies approved checkpoints into
artifacts. These are trusted-code separation controls, not an adversarial OS
sandbox: native extensions and same-account administrator access are outside
this threat model.

## Controls and inference

`constrained_shuffle` performs directed double-edge swaps within frozen source
and target strata, source sign, and exact contact count. It preserves in/out
degree, weighted strengths, and the specified stratum-pair contact distribution;
it creates no new self-loops or duplicate edges. It reports attempted/accepted
swaps and changed fraction. A control with inadequate mixing or mismatched
activity fails its own preregistered gate. Full-graph shuffling is an offline
operation with substantial memory/time requirements and has not been run here.
After shuffling, mappings and eligible plastic edges must bind the resulting
graph identity and be reassessed; inherited PASS claims are invalid.

For plastic shuffle arms, pass `protected_edges` as unique exact edge indices
from the original graph, typically obtained with
`graph.edge_index(kcId, mbonId)` for every declared plastic connection. These
edges are excluded from swaps, retaining their source IDs, target IDs, and
contacts. Their output CSR indices can change when other edges are sorted, so
re-resolve by exact neuron IDs. The plasticity manifest retains identical cell
IDs, compartment/DAN mapping, and parameters, with its graphHash explicitly
rebound to the shuffled graph. Protecting the declared connections preserves
the learning hypothesis; a validated alternative remapping procedure is not
implemented.

Reports include `protectedConnections`, `protectedFraction`, a
`protectedMappingHash` bound to the original graph and sorted input edge
indices, and `changedMutableFraction`. The protected indices/hash also enter
the shuffled graph manifest. Protection limits the topology inference to the
remaining network conditional on the protected connections; it cannot establish
that the protected plastic wiring itself is beneficial. All-protected or poorly
mixed controls remain inadequate nulls. Omitting protection retains the
unrestricted-within-strata swap behavior.

`yoked_schedule` circularly shifts exact signed doses independently of recipient
outcomes. The experiment manager must separate donor and recipient, declare
minimum temporal separation, and measure remaining cue/dose correlations.
`TimingMatchedRandom` permutes calibration action bouts and preserves joint
action occupancy and bout durations per cycle. Adjacent identical bouts can
merge, so temporal autocorrelation must still be measured. Calibration cannot
use held-out test outcomes.

`LesionProtocol` takes `{graphHash,evidence,lesions:[{neuronIds,scope}]}`, where
scope is acquisition, expression, or both. It ideally clamps nominated cells
to reset and removes their emitted/delayed spikes during the chosen phase,
without changing graph or efficacy. Acquisition includes terminal US delivery;
expression acts only in frozen evaluation. This is a computational silencing
intervention, not a quantitative model of a particular genetic reagent. Lesion
identity is part of checkpoint identity. `transferMemory` permits only that
lesion identity to differ, verifies the source checkpoint/hash, retains learned
efficacy/memory and retention history, resets all transients, and records the
source checkpoint hash. It requires the recipient's matching gates. Changed
graph, dynamics, retina, decoder, or plasticity identities are rejected. Ordinary
restore deliberately rejects changed lesion identities.

Replica-level before/after differences, bootstrap confidence intervals, paired
sign-flip tests, Holm corrections, an intact/shuffled × fixed/plastic
interaction, and pilot-based paired power estimates are implemented in
`statistics.py`. Repeated episodes of one learned brain never count as
independent replicas. Exact sign-flip p-values are coarse for small replica
counts; bootstrap intervals can be unreliable at that scale. The independence
and exchangeability assumptions must be justified. Survival is administratively
censored at a declared horizon; crashes/early censoring cannot silently become
deaths. Numerical tests validate these calculations, not a claim of learning.

## Actual-graph run on this workstation

On 2026-09-12, Python 3.12.14 / NumPy 2.2.6 loaded 166700 neurons and
25582938 directed edges from the real MaleCNS v1.0 artifact. Artifact SHA256:
`518bf3441daf58733005aee559c40b437bd1366602baa11e3a9d8ef0867e05d9`.
Loaded model graph identity:
`93d5a84e93e73f32a699a47ecfeaabf977505c942192920da383fdb3884288f4`.

Loading took 2.00 s and LIF initialization 0.39 s. A 20 ms silent integration took
1.424 s and emitted zero spikes. An explicitly arbitrary 20 mV injection into
the first 16 cells annotated exactly `L1` for 20 ms took 1.459 s, emitted 32
spikes in 16 cells, and retained finite v/g. No other cells spiked in that short
probe. This is about 73 times slower than real time at low activity on this
workstation; it is not a real-time or network-recruitment validation. Active
large-scale dynamics can cost more. Optimization must preserve the numerical
oracle and cannot silently prune the graph to meet a performance target.

Nominated source IDs were 10465, 12300, 12579, 12925, 13243, 13383, 13429,
13505, 13688, 13917, 14007, 14405, 14536, 14618, 14757, and 14805. This direct
current probe is **not a retinal mapping or visual assay**. Real visual mapping
correctly remained blocked with “requires an explicit validated evidence
manifest; mapping is unavailable.” Conditioning, decoder, biological learning,
and whole-model training authorization remain unestablished.

Reproduce the full-graph sanity report with:

```text
python -m scicon_fly.assays --graph fly-lab/data/compiled/v1.0/graph.npz --manifest fly-lab/data/compiled/v1.0/manifest.json
```

Run numerical/protocol/inference tests with:

```text
python -m pytest fly-lab/python/tests/test_neural_core.py fly-lab/python/tests/test_statistics_neural.py -q
```

Set `PYTHONPATH=fly-lab/python` and use the isolated `fly-lab/.venv` interpreter.
Brian2 is optional for a minimal runtime but required to execute the oracle;
without it that test is explicitly skipped. A skipped oracle is not a PASS.

## Running candidate visual and decoder assays

There is an executable path for evaluating unvalidated interfaces without
falsely declaring them validated. Supply graph-bound vision/decoder manifests
with `candidate:{assayOnly:true,evidence:["ACTUAL_NOMINATION_EVIDENCE"]}`. The
candidate escape hatch is available only to the assay constructors; the game
worker never enables it. Receptor coordinates and neuron identities still must
be supplied explicitly. Source optic-lobe hex coordinates alone do not establish
that this geometric projection is scientifically valid.

Real worker training entry points (`step` in training mode, `reinforce`, `retain`,
and `transferMemory`) also call `validation.validate_gate_evidence`. Truthy
evidence labels cannot authorize direct CLI training. Each required gate needs a
local SHA256-bound, versioned PASS report matching the complete worker identity,
measured passing comparisons, and matching criteria in a separately hashed
preregistered protocol. Candidate/synthetic evidence cannot authorize a real
controller. Files must be inside fly-lab and accessible outside the denied
evaluator directory. Successful verification is cached for the exact immutable
identity/gate snapshot; failures are not cached. The explicit synthetic-fixture
path remains limited to numerical/protocol tests. These checks establish file
integrity and declared comparisons, not the scientific truth of an assay.

`visual_decoder_assay(graph, vision_manifest, decoder_manifest, specification)`
runs reset, fixed-efficacy dark, illumination, one-bin flash, moving vertical
bar, horizontally mirrored bar, and spatially scrambled bar conditions. The
scramble uses a frozen seed and preserves per-frame intensity counts. It records
actual nominated population responses, bin traces, and decoder actions. First
response time has the declared bin resolution. An assay specification is:

```json
{
  "graphHash": "MODEL_GRAPH_IDENTITY", "seed": 0,
  "durationMs": 20, "binMs": 5, "maximumTotalMs": 120,
  "populations": {
    "visual_kc": {"neuronTypes": ["KCg-d", "KCab-p"], "evidence": ["NOMINATION_SOURCE"]}
  },
  "criteria": {
    "visual": [{"stimulus": "illumination", "referenceStimulus": "dark",
      "population": "visual_kc", "metric": "meanHz", "operator": ">=", "value": 1}],
    "decoder": []
  }
}
```

The shown threshold is an example of schema syntax, not a scientifically
justified acceptance value. Freeze actual thresholds and evidence before
running. Groups may use exact `neuronTypes` and/or exact `neuronIds`; empty
matches fail explicitly. Metrics include spikes, meanHz, activeFraction, and
firstResponseBinEndMs. The reserved `__decoder__` population provides xMeanHz,
yMeanHz, fireMeanHz, fireFraction, and movingFraction. Criteria compare a metric
to a finite threshold, optionally subtracting the same metric under a reference
stimulus. Absence of criteria gives NOT_RUN; failed criteria give FAIL. A PASS
means only that the nominated engineering screen passed its frozen criteria.
It does not automatically authorize the full biological visual/decoder gate or
training. Population nomination, mirror expectations, latency and tuning
benchmarks, broader stimuli, replication, and conditioning still need independent
scientific assessment.

The specification and interfaces are hash-bound. Default per-condition duration
is 20 modeled ms, maximum 250 ms; all six conditions must fit the declared total
budget, capped at 2000 ms. Large durations can take minutes at full graph size.
The short default may be too brief for downstream visual KC recruitment and is
only an initial latency screen. Candidate results never fabricate a training
PASS or silently adjust thresholds after observing responses.

```text
python -m scicon_fly.assays --graph GRAPH.npz --manifest MANIFEST.json --vision CANDIDATE_RETINA.json --decoder CANDIDATE_DECODER.json --specification ASSAY_SPEC.json
```

Reports go to stdout; the experiment manager owns artifact storage and
adjudication. Candidate execution/rejection paths also have explicitly
artificial tests.

## Recorded real-data candidate screen

The frozen `configs/candidates/malecns-hex-v0.1-*.json` files describe one
deliberately crude, assay-only candidate. It uses all 1767 L1 cells with finite
source `assignedOlHex1/2` annotations (875 L, 892 R), omitting 9 missing positions
from stimulation while retaining all neurons and edges in the model. Each hex
axis is independently mapped from its observed minimum/maximum to [0,1]; both
sides receive the same image/orientation. This is an arbitrary projection of
column labels, not calibrated eye geometry. No soma coordinates are used.

The fixed candidate readout uses mean right-minus-left MBON rates for x, exact
MBON01-minus-MBON02 mean rates for y, and all-MBON mean rate for fire, with 1 Hz
thresholds. These choices have no claimed biological movement semantics. They
were frozen before measurement, as were minimal response criteria: illumination
minus dark must exceed 0.01 Hz in the 335 nominated visual KCs and 0.1 in decoder
moving fraction. These are initial engineering criteria, not behavioral
validation or learned performance benchmarks.

The six 50 ms probes took 18.81 s total wall time. Both criteria **failed**.

| Stimulus | L1 spikes | Visual KC spikes | MBON spikes | Moving/fire fraction |
| --- | ---: | ---: | ---: | ---: |
| Dark | 0 | 0 | 0 | 0 / 0 |
| Illumination | 10602 | 0 | 0 | 0 / 0 |
| Flash | 5301 | 0 | 0 | 0 / 0 |
| Moving bar | 5168 | 0 | 0 | 0 / 0 |
| Mirrored bar | 5325 | 0 | 0 | 0 / 0 |
| Scrambled bar | 7340 | 0 | 0 | 0 / 0 |

Full traces, actual population IDs, frozen input hashes, and source-code hashes
are in `docs/evidence/malecns-hex-v0.1-screen.json` with SHA256 sidecar. Report
SHA256 is `6eabee53e9240b31ad4937407e16c1f471d11657b5580f5c5853952548c21733`.

A post-run diagnostic found a stronger explanation than merely insufficient
latency: every driven L1 is annotated glutamate and assigned fast sign −1 in
this candidate. With all undriven cells initially quiescent and no tonic
excitation, these driven sources produce only inhibitory signals. Under the
implemented dynamics, undriven cells cannot rise above rest and recruit spikes.
Extending duration alone cannot fix this particular configuration. The source
check and deduction are recorded separately in
`docs/evidence/malecns-hex-v0.1-diagnosis.json`; frozen inputs were not changed.

This failure concerns the crude interface and uniform quiescent model, not
living-fly vision or learning capacity. It motivates a separately specified,
evidence-based early visual model with appropriate graded/tonic dynamics and
receptor effects. It does not justify changing transmitter signs or injecting
visual KCs merely to obtain a passing game demo. Real worker visual validation
and training remain blocked.
