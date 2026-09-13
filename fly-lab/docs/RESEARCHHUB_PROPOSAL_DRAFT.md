# SCICON FLY LAB: validating visual interfaces before claiming connectome-based learning

Local working draft, 13 September 2026 UTC. Not submitted or published. Lead: Scott [full name, verified profile and ORCID to be supplied]. Scientific collaborator and eligible funding recipient: not yet confirmed.

We recommend preparing a small feasibility proposal now. The first request should fund expert review, sensory validation and independent reproduction. A campaign should begin only after its authors, recipient arrangement, methods and exact budget are ready. Successful game learning is a possible later result, not an existing achievement or a promised deliverable.

## Research question and rationale

Can an explicitly documented visual interface produce reproducible, stimulus-specific responses and causal action readout in a model constrained by the male Drosophila CNS connectome? If so, can a later controlled study distinguish learned changes from an engineered decoder, reward exposure and anatomical topology?

The public MaleCNS release supplies connectivity, annotations, predicted transmitters and morphology. These are valuable constraints, but do not supply a complete physiological model or a mapping from game pixels to sensory inputs. [Official MaleCNS v1.0 data](https://male-cns.janelia.org/download/)

Shiu and colleagues demonstrated useful sensorimotor predictions with a connectome-based integrate-and-fire model in feeding and grooming circuits. That does not validate our transfer to MaleCNS, early vision or a shooter. FlyVis supplies a distinct example of connectome-constrained visual modeling with fitted dynamics; adopting its ideas would require a new, explicit interface and validation. [Shiu et al., 2024](https://www.nature.com/articles/s41586-024-07763-9), [Lappalainen et al., 2024](https://www.nature.com/articles/s41586-024-07939-3)

Our eventual plasticity hypothesis concerns compartment-specific KC–DAN interactions at existing KC→MBON connections. Dopamine effects depend on timing, circuitry and feedback. A numerical reward signal imposed on simulated DANs is not real dopamine, and a fitted game controller is not evidence of natural fly behavior. [Huang, Luo et al., 2024](https://www.nature.com/articles/s41586-024-07819-w)

## Existing assets and preliminary evidence

| Available now | What it establishes and does not establish |
|---|---|
| Reproducible import of MaleCNS v1.0: 166,700 retained neurons, 25,582,938 directed neuron pairs and 124,177,617 contacts | Independently counted anatomy under documented inclusion rules; contact counts are not measured conductances |
| Sparse reference dynamics, compartment-restricted experimental plasticity, safe checkpoints and Brian2 comparisons | Numerical agreement for tested equations, delays and refractory cases; physiological validity remains open |
| Isolated canonical Scicon engine, pixel observations, action/reward logs, immutable exports and strict replay | A controlled experimental environment; baseline gameplay is not neural learning |
| Candidate assay runner and frozen inputs, thresholds, reports and hashes | Actual negative evidence and a repeatable route to test replacements |
| Factorial study, intervention and statistics machinery | Infrastructure and synthetic pipeline tests; no completed biological learning study |
| Spectator display and portable Pi replay export | Communication and inexpensive observation; illustrated activity is not measured neural firing |

Local evidence: [data quality](DATA_QUALITY.md), [model methods](MODEL.md), [experiment design](../EXPERIMENT_DESIGN.md), [limitations](../ASSUMPTIONS_AND_LIMITATIONS.md).

Current gates are numerical **PASS, reference equations only**; candidate vision **FAIL**; candidate decoder **FAIL**; conditioning and learning **NOT RUN**. In six 50-ms stimuli, a crude optic-hex projection drove 1,767 L1 neurons. Illumination produced 10,602 L1 spikes but zero response in 335 nominated visual KCs and 97 MBONs. Every decoder output was idle/no-fire. All stimulated L1 outputs are inhibitory under the current sign assumptions; a quiescent downstream network lacks excitatory drive. This rejects that interface/model combination, not fly vision. [Frozen screen](evidence/malecns-hex-v0.1-screen.json), [diagnosis](evidence/malecns-hex-v0.1-diagnosis.json), [gate record](../configs/validation-results.json)

## First funded stage: six to eight weeks, part time

The deliverable is a reproducible sensory-validity study, including a negative result if no defensible candidate works. Timing begins after collaborators and the recipient are confirmed.

| Milestone | Work and reviewable output | Decision rule |
|---|---|---|
| 1. Scientific audit, weeks 1–2 | A Drosophila vision/connectomics collaborator reviews coverage, cell annotations, glutamate/receptor assumptions, graded signaling, background activity and relevant published response data. Freeze a gap report and at most two candidate specifications. | If no defensible sensory crosswalk exists, publish the missing-data result and stop integration; never use soma position as retinal geometry. |
| 2. Sensory probes, weeks 2–5 | Preserve the failed baseline. Test declared candidate changes using dark/constant light, flashes, moving bars, mirrored and scrambled inputs, plus latency probes. Freeze cell IDs, transforms, parameters and calibration/held-out stimuli before candidate evaluation. | Require reproducible stimulus selectivity and plausible reference response properties, not merely more spikes. Numeric thresholds and referenced target populations must be signed off before the new assays run. |
| 3. Causal readout and reproduction, weeks 5–7 | Test whether perturbing nominated output populations changes the declared fixed decoder. Reproduce one candidate on another installation; document numerical tolerances and renderer dependence. | No game-based decoder tuning on held-out stimuli. A failed readout remains a failed gate. Independent reproduction may confirm failure. |
| 4. Release and next-stage decision, weeks 7–8 | Publish methods, source/data manifests, stimulus specifications, response matrices, failed variants, runtime/memory measurements and a recommended next experiment. | Only passing sensory and causal-readout evidence can justify proceeding to conditioning. No automatic training launch. |

The collaborator's audit must distinguish an empirically motivated correction from arbitrary tuning. Simply reversing inhibitory signs or adding excitation until an action appears would not meet the scientific objective. Any graded early-vision component remains separately identified; it must not be presented as the original uniform spiking model.

## Analysis and conditional learning study

For the first stage, report every prespecified stimulus/population response, latency, selectivity metric, decoder outcome and computational cost, including failures. Separate calibration from held-out tests. Repeating an identical deterministic run does not create independent biological replicates. Any intervals across stimulus or noise seeds describe that declared source of variability only. This draft is not a completed preregistration: exact candidate models, target response criteria, seed counts and rejection thresholds remain to be frozen with the scientific collaborator.

A later funding request would first test paired, unpaired, backward, no-reward and frozen conditioning, with memory erasure controls. Gameplay begins only after conditioning passes. The existing design then compares intact/shuffled topology × fixed/plastic efficacy, with time-displaced yoked reinforcement, matched action timing and sham interventions. Fixed training receives the same outcome-to-DAN rule but freezes plasticity; held-out evaluation receives no reinforcement and freezes all efficacy changes. Protected plastic connections constrain what a shuffle experiment can say about topology.

The proposed primary gameplay endpoint is each independently trained replica's change in frozen evaluation score versus fixed and yoked controls; a topology claim additionally requires the factorial interaction. Use replica-level paired differences, confidence intervals and multiplicity correction, with sample size determined from a separate pilot. Frames are not independent samples. Report survival and actions as supporting outcomes. Keep the current +1 kill/−5 life-loss rule fixed; a coin bonus would require a separate protocol. Missing or interrupted trials remain visible. [Existing analysis and control specification](../EXPERIMENT_DESIGN.md)

## Resources and provisional budget

The highest-priority resource is a collaborator with Drosophila visual physiology/connectomics expertise, followed by computational-neuroscience and independent replication support. Existing code, game infrastructure, downloaded anatomy and Scott's PC are available in kind. Named people, availability and rates are not yet agreed.

These are **USD planning estimates, not vendor quotes or commitments**. They estimate a bounded first-stage review/validation effort, not rebuilding the entire visual system or executing the full gameplay study.

| First-stage item | Estimated effort or allowance | Estimated cost |
|---|---|---:|
| Scientific consultation and model/assay review | 20–30 hours at assumed $100–150/hour | $2,000–4,500 |
| Focused validation implementation and documentation | 20–30 hours at assumed $75–100/hour | $1,500–3,000 |
| Independent reproduction and statistical review | 6–10 hours at assumed $75–100/hour | $450–1,000 |
| Bounded compute trials, storage and backup | Allowance after local benchmarks | $200–500 |
| Contingency | Approximately 10% of the above | $415–900 |
| **Planning envelope** | Rounded; exact request pending scope and quotes | **$5,000–10,000** |

A provisional target around $7,500 is reasonable only if collaborators can deliver the bounded scope within it. Institution administration, taxes, platform/recipient fees and applicable indirect costs are not verified or included; replace estimates with an agreed complete budget before setting a funding goal. If a suitable collaborator contributes in kind, reduce the cash request rather than buying unnecessary equipment.

Do not buy a new GPU or workstation first. The measured low-activity reference took about 1.46 wall seconds for 20 modeled milliseconds, approximately 73× slower than real time. Extrapolating that rate to the existing 5,760-episode template gives roughly 438 days of neural computation alone; this is not a measured study duration. Benchmark representative active and quiescent workloads, memory and output costs, then validate any acceleration against the reference. [Benchmark and scope](MODEL.md), [compute projection](../EXPERIMENT_DESIGN.md)

The owned Pi 5 is optional for replay display or a lightweight local service. It is not assumed to run the full neural model or improve scientific validity. Future conditioning, acceleration and gameplay could require another **$15,000–30,000 planning envelope**, but that is a conditional scoping estimate only. No second-stage campaign or hardware choice should be based on it before measured throughput, collaborator commitments and a powered design exist.

## Open outputs and authorship

Proposed outputs are an openly accessible methods/negative-results report, versioned assay specifications, appropriately licensed research code and independently reproducible evidence. The repository is currently local; no public release is represented as already completed. Confirm source/data licenses, game-asset redistribution rights and collaborator authorship before release. New animal experiments and human-subject studies are outside this first stage.

Scott should disclose the relationship to Scicon Shooter and any related financial interests. Funded research must remain separate from game purchases, wallet operation, ranked competition and proposal-selection privileges. Scientific claims and future funding approval belong to accountable human authors.

AI disclosure for the eventual submission: “This draft was prepared with substantial assistance from OpenAI Codex, including literature/documentation searches and drafting. Human authors must verify sources, methods, budgets and claims before submission.” Do not imply that human scientific review has already occurred. ResearchHub requires disclosure of substantially AI-generated content and prohibits misrepresented credentials and primarily promotional material. [Content guidelines](https://docs.researchhub.com/researchhub/content-guidelines)

## ResearchHub route and unresolved submission details

ResearchHub currently offers applications to funding opportunities and standalone crowdfunding proposals. Its public Fund page provides **Submit Proposal**. No matching open call or award has been confirmed for this project. [Funding documentation](https://docs.researchhub.com/researchhub/product-features/fund), [Fund page](https://www.researchhub.com/fund/grants)

The recipient guide requests a 2–4-page preregistration covering background, hypothesis, methods, statistical analysis and budget, plus verified identity and a linked ORCID. It describes public review, an all-or-nothing funding goal, and cash disbursement through Endaoment to a university/nonprofit foundation. It does not establish an unaffiliated independent developer's eligibility or a personal-wallet payout route. Confirm an eligible recipient or accepted sponsor arrangement and the applicable fees before fundraising. International institutions may need a US charitable intermediary. [Funding recipient requirements](https://docs.researchhub.com/researchhub/product-features/fund/funding-recipients)

Before a public campaign: resolve the lead's identity/ORCID, scientific coauthor, eligible recipient, exact first-stage methods/thresholds, complete budget, timeline and rights to public outputs. The official guide lists editorial@researchhub.foundation for questions; no message has been sent. Until those details are resolved, a separately approved research note describing the negative screen and seeking scientific feedback is a lower-commitment option. [Research-note route](https://docs.researchhub.com/researchhub/product-features/publish)
