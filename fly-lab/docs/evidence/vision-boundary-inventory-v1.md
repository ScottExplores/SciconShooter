# MaleCNS sensory-boundary inventory v1

This is a read-only audit of the frozen official MaleCNS v1.0 graph. It nominates a small sensory experiment; it does not run that experiment or change any model, candidate, sign, parameter, or validation gate. No game score was used.

**Recommendation:** start with a separately versioned, graded L2-to-Tm1/Tm2 OFF-pathway diagnostic around an explicit adapted baseline. Exact column labels and body IDs are available. Preserve the failed L1 screen as evidence.

## Measured anatomical availability

The retained graph has 166,700 neurons, 25,582,938 directed pairs and 124,177,617 contacts. The [machine-readable inventory](vision-boundary-inventory-v1.json) records every exact type matching its query, source hashes, NT fields, duplicate-column counts, common-column intersections, direct contacts and executable reproduction programs. The main inventory ran in 17.06 seconds, with no simulation.

| Source type | Retained bodies | Finite hex pairs L / R | Unique columns L / R | Consensus NT |
|---|---:|---:|---:|---|
| R1-R6 | 3,377 | 0 / 0 | 0 / 0 | histamine |
| R7d / R7p / R7y | 82 / 332 / 482 | 0 / 0 | 0 / 0 | histamine |
| R7_unclear | 404 | 0 / 0 | 0 / 0 | histamine |
| R8d / R8p / R8y | 76 / 330 / 481 | 0 / 0 | 0 / 0 | histamine |
| R8_unclear | 442 | 0 / 0 | 0 / 0 | histamine |
| R7R8_unclear | 85 | 0 / 0 | 0 / 0 | histamine |
| L1 | 1,776 | 875 / 892 | 875 / 892 | glutamate |
| L2 | 1,779 | 874 / 893 | 874 / 892 | acetylcholine |
| L3 | 1,772 | 0 / 892 | 0 / 892 | acetylcholine |
| Mi1 | 1,773 | 875 / 887 | 875 / 886 | acetylcholine |
| Tm1 | 1,777 | 877 / 890 | 877 / 890 | acetylcholine |
| Tm2 | 1,766 | 875 / 883 | 875 / 882 | acetylcholine |
| Tm3 | 2,054 | 0 / 0 | 0 / 0 | acetylcholine |
| Tm4 | 1,670 | 0 / 833 | 0 / 828 | acetylcholine |
| Tm9 | 1,771 | 856 / 887 | 856 / 884 | acetylcholine |
| C2 | 1,745 | 0 / 874 | 0 / 874 | gaba |
| C3 | 1,779 | 878 / 892 | 878 / 890 | gaba |

All types shown above have identical raw-annotation and retained counts: their geometry gaps are already present in the source rather than caused by graph exclusion. Hex sides in this table use **somaSide**. Photoreceptors instead have rootSide labels: R1-R6 has 1,112 L and 2,265 R; missing somaSide does not mean anatomical side is unknown. There are zero paired finite hex annotations for these photoreceptors regardless of side field.

Resolved R7d/p/y total 896 bodies, plus 404 R7_unclear. Resolved R8d/p/y total 887, plus 442 R8_unclear. Another 85 are R7R8_unclear. These are annotated bodies, not a complete retinal census. The R1-R6 label also does not resolve individual R1 through R6 identities.

L2, Mi1, Tm2, Tm4, Tm9 and C3 have duplicate same-side column labels. Do not silently reduce these to one cell per column. Tm3 has no assigned hex pair; positions cannot be supplied by row order, soma location, or an assumption of one Tm3 per column. The JSON includes the other exact Mi/Tm/T4/T5 types and L4/L5.

Exact (somaSide, hex1, hex2) intersection gives **1,752 L2/Tm1/Tm2 columns: 870 L and 882 R**. L1/L2/L3 share 892 columns, all R. L1/Mi1/Tm3 have no complete intersection because Tm3 labels are absent. These are column correspondences, not visual angles. Independent x/y normalization into a square image and identical axis orientation for both eyes remain engineering assumptions.

## Measured pathway contacts

No additional synapse threshold was applied. Pairs and contacts are distinct; physiological influence is not inferred from their magnitude.

| Pathway | Directed pairs | Contacts | Reached postsynaptic bodies / type total |
|---|---:|---:|---:|
| R1-R6 to L1 | 3,280 | 103,405 | 809 / 1,776 |
| R1-R6 to L2 | 3,280 | 107,646 | 814 / 1,779 |
| R1-R6 to L3 | 3,076 | 23,510 | 782 / 1,772 |
| L1 to Mi1 | 2,026 | 142,185 | 1,771 / 1,773 |
| L1 to Tm3 | 12,802 | 151,537 | 2,054 / 2,054 |
| L2 to Tm1 | 2,073 | 205,428 | 1,774 / 1,777 |
| L2 to Tm2 | 3,130 | 221,186 | 1,765 / 1,766 |
| L2 to Tm4 | 11,422 | 162,989 | 1,670 / 1,670 |
| L3 to Tm9 | 3,353 | 49,158 | 1,770 / 1,771 |

Only 809 L1 and 814 L2 bodies have direct input from retained R1-R6 bodies. This does not establish a complete reconstructed retina. Inferring photoreceptor columns from their targets would itself be a new transformation requiring validation.

Among L2-to-Tm1 contacts where both cells have hex labels, 203,944 of 204,631 contacts share the exact somaSide and hex pair; for L2-to-Tm2 it is 214,597 of 220,348. This supports local column correspondence without supplying optical calibration.

## Why the previous L1 screen failed

The [prior diagnosis](diagnostic-connectivity.md) established that all driven L1 cells have inhibitory fast signs, while undriven LIF cells start at rest without tonic input or graded transmission. Under those conditions inhibitory spikes cannot initiate downstream spikes. Structural routes to visual KCs and MBONs exist; extra duration alone cannot remove that quiescent-state barrier.

There is also a sensory-polarity mismatch: L1/L2 hyperpolarize for light increments and depolarize for decrements. The old candidate instead adds positive L1 current for brighter pixels. In vivo recordings distinguish Mi1/Tm3 ON responses from Tm1/Tm2 OFF responses. Their noise-filter peaks were 71/53 and 56/43 ms respectively, so a 50 ms screen also misses some peak timing. These values belong to that experiment and are calibration targets, not universal time constants. [Behnia et al. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4243710/).

Making L1 excitatory would contradict the intended mechanism. ON processing involves graded glutamatergic input, GluClalpha and GABAergic circuitry across parallel pathways; one inhibitory edge is insufficient as a full explanation. [Molina-Obando et al. 2019](https://elifesciences.org/articles/49373).

## The bounded next candidate

1. Freeze a new **sensory-only** experiment. Use the exact R-side 19-column L2/Tm1/Tm2 nomination in the JSON; no game, decoder, dopamine or plasticity. R is nominated for its more complete accompanying L3/C2/Tm4 column annotations, independently of response or score; retain L for a subsequent fixed-parameter sensitivity check. Each side contains 19 L2, 19 Tm1 and 19 Tm2 cells. Selection uses only column labels nearest their coordinate-wise median, with a fixed tie break. Euclidean label distance is a compact sampling rule, not a claim about hex geometry or visual angle.
2. Represent continuous membrane state and nonnegative graded release around an explicit adapted operating point. L2 output increases at negative contrast and decreases at positive contrast. This is a lamina boundary, not a reconstructed retina. Keep L2 cholinergic and retain actual selected contacts. Resting release, transfer function, gain and temporal adaptation are model assumptions requiring preregistration and sensory calibration.
3. Measure zero-contrast stability, both contrast polarities, ON/OFF selectivity, adaptation, response onset and temporal filtering. Use 200 ms flashes and longer steps with adequate recovery; distinguish fitting stimuli from frozen held-out contrast/noise protocols. A generic low-pass step response does not establish measured rectification or band-pass filtering.
4. Start with a small circuit to make numerical behavior cheap and observable, explicitly reporting omitted outside inputs. In the R nomination, L2 has 2,950 contacts to all 19 selected Tm1 cells and 3,060 to all 19 selected Tm2 cells; another six contacts reach four Tm2 cells outside the patch. A reduced model also omits other cell types and recurrent input. Follow any promising result with a frozen embedding/boundary-sensitivity experiment; do not promote the whole-CNS gate using the reduced circuit.
5. Add the ON stream and other identified circuit types only after these tests. L1/Mi1 have verifiable column correspondence; Tm3 requires additional placement evidence. Retain inhibition, the operating baseline and explicitly supported receptor assumptions. Compare graded and all-LIF models as different hypotheses.
6. Only then assay signal arrival and cue discrimination in visual KC subclasses, followed by MBONs and an independently justified readout. Motion-pathway success alone does not establish mushroom-body coding. Female FlyWire evidence distinguishes direct visual projection input to KCg-d from indirect LVIN pathways to KCab-p; transfer to MaleCNS needs exact cross-dataset evidence. [Ganguly et al. 2024](https://www.nature.com/articles/s41467-024-49616-z).

The opposite-side patch tests anatomical sensitivity within one animal; it is not independent biological replication. An excitatory L2 LIF pulse probe could separately test software delivery and reachability, but would not validate graded physiology. None of these new simulations was performed by this audit.

## Transmitter and model limits

The listed lamina and medulla types have unanimous compiled consensus labels: L1 glutamate; L2/L3/Mi1/Tm1/Tm2/Tm3 acetylcholine; C2/C3 GABA. Corresponding raw ground_truth fields match. This source field does not mean each MaleCNS cell was experimentally assayed. Prediction-confidence distributions remain in the JSON; they are not established calibrated probabilities or receptor evidence.

All listed photoreceptors are compiled as histamine with fast sign -1. Raw ground_truth is histamine for R1-R6 and R7d/p/y/unclear, but missing for R8d/p/y/unclear and R7R8_unclear. R8 experimentally cotransmits histamine and acetylcholine, segregated by postsynaptic receptor pathways. A single histaminergic sign omits a known mechanism, particularly for routes toward accessory medulla neurons. [Xiao et al. 2023](https://www.nature.com/articles/s41586-023-06681-6).

Flyvis provides a precedent for connectome-constrained graded visual modeling, but optimized parameters on an optic-flow task with an external decoder. Its validation cannot be inherited by a MaleCNS graph or this candidate. [Lappalainen et al. 2024](https://www.nature.com/articles/s41586-024-07939-3).

## Provenance and reproduction

Official source: [MaleCNS downloads](https://male-cns.janelia.org/download/). Graph identity: 93d5a84e93e73f32a699a47ecfeaabf977505c942192920da383fdb3884288f4. Annotation and NT hashes were rechecked against the compiled manifest; graph file SHA256 matches the frozen candidate. Population/NT joins, finite-hex sums and nominated body-ID membership passed executable assertions.

The [JSON](vision-boundary-inventory-v1.json) stores complete executable audit programs under reproduction.programs, the working directory and Python environment, and all input hashes. Run programs in order with the specified PYTHONPATH; elapsed time will vary. No validation-results or candidate files are outputs.
