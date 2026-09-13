# Experiment design and phase gates

Question: does a specified MaleCNS-derived model acquire persistent improvement in frozen Scicon Shooter evaluation through a declared plasticity mechanism? Which anatomical and engineering choices explain the result? Learning is tested, never assumed.

## Implemented workflow

| Phase | Implemented software | Current scientific status |
|---|---|---|
| 0 | Source/dependency/campaign/asset provenance, immutable exports and methods | Baseline recorded; every run records current identities |
| 1 | Real engine adapter, deterministic clocks/RNG/budgets, strict assets, renderer, replay and events | Focused engine/browser regression checks; bounded mission coverage |
| 2 | Official data ingestion and independent totals, full graph, LIF reference, Brian2 oracle and benchmark | Numerical checks pass; published behavioral reproduction/MaleCNS physiological transfer remain unvalidated |
| 3 | Pixels-only transduction, frozen decoder manifests, actual morphology viewer and assay machinery | Real L1/optic-hex candidate failed frozen visual KC and decoder screens; no validated interface |
| 4 | Compartment plasticity candidate, signed reinforcement, frozen mode, paired/timing controls and complete checkpoints | Synthetic mechanism tests only; full MaleCNS cue conditioning is unproven |
| 5 | Sealed schedules, independent replica execution, matched/yoked controls, factorial analysis and power planning | No biological gameplay training study has been run |
| 6 | Live, Learning, Configuration, Replay and ResearchHub Study views plus per-run exports/reports | Actual telemetry and honest empty states; study evidence remains insufficient |

## Initial task

ORBIT ENTRY (`operation-open-galaxy`), RSC ship, three lives, no permanent upgrades or supports. Native damage, pickups, weapon cadence, collisions and mission progression. No touch aim, abilities, bombs, continues or invulnerability. Decisions are `{movement: idle|N|NE|E|SE|S|SW|W|NW, fire: boolean}`. Fixed 390×844, DPR 1, 60 Hz engine and 20 Hz decisions. End at defeat, mission completion or 90 modeled seconds.

The reward is +1 per actual confirmed destruction minus 5 per `player-death` event, aggregated per decision. Pickups can add lives; reward therefore does not infer life loss from net lives. Previous-step reinforcement enters the neural update before the next action. The final dose and pending pulses are drained in a declared postepisode neural interval holding the last retinal drive; no extra game action is taken. Positive and negative doses address distinct, explicitly nominated DAN channels. The maximum allowed scalar is declared in the plasticity manifest; excess doses fail rather than clip. Net aggregation within a decision can cancel opposite outcomes and is an explicit engineering assumption.

Constant-fire experiments are separate frozen protocols and preserve normal cooldown semantics. Action transitions, actual projectile cadence and spawn opportunities are logged, so score gains due to firing can be distinguished from movement changes.

## Validation before training

Numerical, visual, decoder and conditioning gate reports must match the complete worker identity and contain evidence. A gate marked PASS refers to its specified validation criteria; it is not sufficient to type PASS without the associated assay evidence. No default real mapping is declared validated.

Assays cover dark/constant input, flashes, moving bars, direction/latency, mirrored and scrambled input, visual KC separation and causal decoder influence. A somatic position is not a retinal coordinate. Candidate mappings and every calibration stimulus must be versioned. Decoder calibration is reward-free. Gameplay-informed adjustments create a new version and restart evaluation.

The plasticity module adapts compartment KC/DAN dynamics from the cited source model to spike-count bins. Synthetic timing-control tests verify code and sign conventions; they do not validate MaleCNS conditioning. Experimental real-data paired, unpaired, backward, no-US, frozen and erasure conditions must pass the chosen cue-specific assays first.

## Pilot and controls

`configs/study.json` specifies eight independent replicas per condition, 50 training episodes and 20 matched held-out evaluations at pre/post checkpoints. Each replica is a fresh efficacy/state initialization and a separate training history; deterministic physiology may be identical across replicas. Initialization labels identify replicas rather than pretending the model has unimplemented stochastic physiology. Environment seeds are domain-separated and matched across conditions. Train/evaluation seeds differ; pre/post evaluation seeds match. All seeds stay in the orchestrator.

Intact fixed/plastic and shuffled fixed/plastic form a factorial design. Rewiring preserves degree, weighted strength and declared stratum/contact distributions; a changed graph must also pass stability/activity and adequate-mixing checks. Rewiring all 25.6 million connections is not automatically cheap. It is a separately budgeted preprocessing operation.

Matched-random control permutes bouts from a preregistered calibration sequence; it cannot use held-out evaluation trajectories. The general-purpose Random baseline on the Live page is explicitly an unmatched engineering smoke test. The reward control temporally shifts replica-matched donor doses, with explicit zero padding after a donor episode ends and a preregistered minimum displacement. Unaltered same-seed donor schedules are prohibited: this deterministic model would otherwise reproduce its donor exactly and remain contingent on its own outcomes. Realized dose and reward correlation must be inspected. Acquisition/expression lesions and sham interventions are manifest-bound and must be independently checked.

Frozen evaluation resets neural transients, sensory/decoder state and eligibility while keeping learned efficacy. It disables reward delivery and every efficacy update, including passive relaxation. Episodes and frames from one trained replica are not independent experimental units.

The primary endpoint is replica-level change in frozen score versus fixed and yoked controls. The topology claim additionally requires the intact/shuffled × fixed/plastic interaction. Analysis uses replica-cluster bootstrap intervals, paired sign-flip tests and Holm adjustment across primary comparisons; exchangeability is stated, not guaranteed. Synthetic positive/null data test the pipeline. Interrupted or missing attempts make a study incomplete; they are not losses, imputed wins or silently dropped observations.

Confirmatory planning estimates replicas from pilot paired variance, 90% power, half a prespecified baseline SD effect and family-wise correction, with at least 20 replicas. This normal approximation requires simulation validation and a frozen protocol before a confirmatory study. The current runner intentionally retains the exploratory label.

## Follow-up protocols and compute

Retention advances declared modeled memory time. The implemented analytical passive retention helper assumes zero KC and centered DAN input; it is not whole-CNS simulated sleep. Full-network sleep, alternative baseline activity and graded visual dynamics need separately validated models. Reversal changes the declared environment reinforcement assignment while keeping interfaces fixed. Memory erasure creates a fresh efficacy initialization. Lesions can target acquisition, expression or both, and readout location plus brain/VNC contribution must be reported.

Scenario transfer requires newly frozen authored scenarios and their own asset/config validation. The current engine task registry deliberately accepts ORBIT ENTRY only; new RNG seeds establish stochastic robustness, not task transfer. Sealed unseen scenarios, graded-vision variants and an accelerated backend remain subsequent research extensions after present gates pass.

The pilot template contains 5,760 episodes and at most 518,400 simulated seconds. At the initial low-activity CPU neural benchmark (~73 wall seconds per simulated second), neural computation alone would extrapolate to about 438 days. That is a rough lower-activity extrapolation, not a measured end-to-end study duration. `study run` refuses an unmeasured throughput or a plan beyond its explicit wall-clock budget. Validate acceleration before attempting large studies.
