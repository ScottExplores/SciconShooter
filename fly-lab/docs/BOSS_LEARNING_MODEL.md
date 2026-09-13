# A reduced fly circuit controlling Scicon boss practice

This experiment connects an explicitly reduced model built from released MaleCNS connections to the actual Scicon game. It tests whether retained changes to those connections improve boss damage under a fixed input and action interface. Improvement is an outcome to measure. This document describes the neural controller, not a completed positive game result.

The model is `malecns-pam02-boss-v1`. The circuit and physiological constants are in `configs/boss-learning-circuit-v1.json`; source hashes are in `configs/boss-learning-source-freeze-v1.json`. The original full-CNS validation gates remain unchanged. This reduced model does not solve the previously failed optic-lobe interface.

## Released anatomy

The frozen circuit includes **250 actual MaleCNS cells: 241 right alpha-prime/beta-prime Kenyon cells, eight right PAM02 neurons, and right MBON01, body 10013**. There are **2,975 KC-to-MBON anatomical contacts** and **865 contacts from the nominated PAM02 cells to those KCs**. Every retained KC has both directed connections; no strength threshold or gameplay-based neuron selection was used. Gamma KCs are excluded because the selected dopamine compartment is beta-prime-2a.

The eight DAN body IDs are 142238, 144126, 155329, 171959, 190296, 257650, 259089 and 291665. They have released `dopamine` annotations and `PAM02(B'2a)_R` instances. MBON01 has the instance `MBON01(y5B'2a)_R`. The frozen manifest retains every modeled edge, the supporting DAN contacts, original cell identities and soma coordinates, source hashes, exclusion records, and a count/hash of omitted internal connectivity. Run `scripts/extract-boss-learning-circuit.py` to independently rebuild and compare the selection against the source graph.

The [MaleCNS release](https://male-cns.janelia.org/download/) supplies anatomy. [Li et al. 2020](https://elifesciences.org/articles/62576) supports the cell-type/compartment crosswalk. [McCurdy et al. 2021](https://pubmed.ncbi.nlm.nih.gov/33602917/) experimentally paired PAM-beta-prime-2a stimulation with a cue and observed a persistent reduction in the MBON-gamma5/beta-prime-2a cue response. That work supports a reward-associated depression candidate; it does not establish that a fly would interpret Scicon hull damage as reward, nor the equations or action interface below.

Only KC-to-MBON edges transmit rates here. The observed DAN-to-KC edges nominate eligible plastic connections; they are not measured dopamine concentrations or receptor gains. Other brain connections, recurrence, optic lobes and nerve cord are omitted. Synapse locations within the nominated compartment have not been verified: this is a type-level crosswalk. Original soma locations provide display context and must not be presented as locations of active synapses.

## Engineered sensory and action boundaries

The external runner extracts the boss/ship relationship from rendered pixels using a frozen documented image-processing algorithm. The controller accepts only `targetOffset` in [-1,1], `playerX` in [0,1], and visibility/confidence flags. It cannot receive game coordinates, object IDs, aim predictions, score, seed, or evaluator diagnostics. This image-processing boundary replaces fly vision; the optic lobes are not simulated. Extraction confidence and failure must be displayed and recorded. A missing player or target gives no KC input and uninformed exploration, not an invented target location.

The 241 real KCs receive fixed random receptive-field centers and gains. A seeded permutation partitions them into three engineered action groups (west, idle, east). For each group, the 15% nearest receptive fields in pixel offset/player position are active. Input coding is fixed before gameplay. The nearest-field metric is squared offset difference plus 0.4 times squared player-position difference. It does not encode a rule to move toward the target.

The **same single MBON is probed computationally three times**, once per candidate action input. These are counterfactual input probes of one reduced circuit, not three biological MBONs firing in parallel. Each probe sums actual KC contact counts times KC input times mutable efficacy. A reward-free baseline normalization divides by the same candidate's response at efficacy one. A fixed softmax favors lower normalized responses, consistent with an engineered attraction readout following reward-associated depression. Softmax gain is 7 and uniform exploration is 12%, including frozen evaluation. All three untrained action probabilities are exactly one third for every visible position; no target-following behavior is supplied.

The selected input supplies actual recorded modeled KC and MBON rates. The other candidate responses are explicitly labeled computational probes. The action is held by the runner for 0.2 simulated seconds (four canonical 20 Hz game steps). Constant firing is an external task rule. No biological firing or descending motor pathway is claimed. The final partial interval, if any, uses its actual simulated duration.

## Learning and persistence

For a confirmed amount of boss hull damage `d` during the preceding action interval, the imposed numerical reward dose is `min(d/2, 1)`. Every nominated PAM02 cell receives a modeled rate of 20 Hz times this dose. This is a computational teaching signal, not chemical dopamine, and its game-value interpretation is engineered.

KC rates equal 20 Hz times a fixed gain in [0.8,1.2] for the selected sparse input. MBON rate is the anatomical-contact-weighted sum divided by total retained KC contacts. These are algebraic rate variables, not measured or simulated spikes.

Chosen KC inputs set a bounded replacing eligibility trace. Between actions it decays with a 0.65-second time constant. Reward credits only the previously held action's KC group: this action-credit gate is an explicit engineering hypothesis, not a reproduced anatomical pathway. For each eligible edge, the update is:

`efficacy *= exp(-0.12 * rewardDose * eligibility * intervalSeconds)`

Efficacy is clipped to [0.1,1]. Anatomy/contact counts remain immutable. There is no decoder learning, gradient-trained auxiliary policy, or hard-coded steering rule. Actual contact counts influence both the MBON output and learned action probabilities; a focused intervention test verifies that changing contacts with nonuniform efficacies changes the readout.

The rule depresses active connections by design. A synthetic choice-reward positive control verifies that it can learn a choice association, but is not evidence of game improvement. An initial implementation credited all recent action groups and failed this mechanism test through credit contamination; before game trials, the declared previous-action gate was added. No game result was used to make that correction.

Checkpoints include all efficacies, eligibility, rates, input coding, previous action/input, random-generator state, clocks and counters. Checksums and model/circuit identities are verified before restore. Across game rounds, transient state is reset and efficacies retained. The runner can reseed action sampling for matched evaluation without changing the frozen input codebook. Frozen evaluation accepts no imposed reward and changes neither efficacies nor eligibility; its pre/post weight hash must match. The complete training checkpoint is restored after evaluation so test activity does not alter subsequent training.

The first game pilot completed three baseline evaluations and then stopped at checkpoint restore before training. Direct JSON transport through Node changed Python numeric serialization (for example, `1.0` became `1`) and could round 128-bit RNG integers. The failed attempt is preserved. The transport was repaired to pass base64-encoded original Python bytes plus their SHA-256 through Node without numerical parsing. Only Python decodes those bytes before its existing internal checksum and state validation. A real bridge integration test covers Node JSON and disk roundtrip, three frozen evaluation resets, full restore and identical subsequent decisions. This repair changes no anatomy, input coding, learning constants or game reward rule; a new session records the changed implementation hash.

This positive-only bounded rule can eventually saturate. Endless play does not imply endless learning. Score accumulation must be separated from controlled improvement. Wall-clock pauses do not imply modeled retention or forgetting. A checkpoint demonstrates persistence of software state, not biological memory retention.

## Evidence and limitations

Focused tests verify actual cell nomination, reward-to-efficacy-to-decision causality, contact-count influence on learned choices, absence of an untrained tracking policy, exact checkpoint continuation, corrupt-state rejection and frozen memory. These establish implementation behavior. Learning from rendered game observations remains a separate empirical result requiring matched pre/post evaluation and fixed-weight/reward controls.

The input codebook, action grouping, normalization, numerical dynamics, reward magnitude, action-credit rule and output decoder are engineered. Their success would establish a result for this specified reduced anatomical model, not that a complete fly CNS learned Scicon or that biological topology is necessary. Topology claims require matched rewiring/intervention controls. Continuous public viewing is a display of the recorded/current model and game state; it is not an evaluation replicate.

The first live pilot should report the actual direction and uncertainty of matched boss-damage and alignment changes, retain unsuccessful runs, and distinguish technical closed-loop operation from useful perception and learned improvement. A second family of input codebooks, reward controls and independent training seeds is needed before broad learning claims. The original aversive 722-cell conditioning recording is a different model and must remain labeled separately.

## JSON-lines bridge

From the isolated lab directory:

```text
.venv/Scripts/python.exe scripts/boss-learning-worker.py --circuit configs/boss-learning-circuit-v1.json --seed 1924
```

Commands are `status`, `reset`, `step`, `reinforce`, `checkpoint`, `restore` and `close`. `initialize` is an alias for `status`. An optional request `id` is echoed. `reset` accepts `learning`, `preserveEfficacy` and an optional action-RNG `seed`; this seed never changes the anatomical input codebook. `step` accepts only the declared `features`, `reinforcement` for the preceding held action, and `dtSeconds`. `reinforce` consumes terminal reward without selecting another action. The bridge `checkpoint` returns an opaque `{format:"opaque-python-json-v1",payload:"BASE64",sha256:"RAW_BYTE_SHA256"}` envelope and a separate `weightHash`; `restore` takes that envelope unchanged. Its payload contains the original Python `{state,sha256}` checkpoint. JavaScript must never decode and reserialize the state or RNG. The direct Python `state_dict()` API remains unchanged. The independent auditor may parse a decoded copy solely to compare ordinary numerical weight values after verifying the original byte hash; it never reserializes or restores RNG integers.

Telemetry reports `samples` of actual IDs with `hz`, `role` and `type`; population means, reward dose and raw damage; `changedThisStep`; `changedWeightsSinceInitialization`; complete changed-edge records; all three action probabilities and labeled computational MBON probes. `changedWeights` is an alias for the number differing from initial efficacy one. No random brain pulses or invented biological spike counts are supplied.
