# Sources, versions and reuse

Official data is downloaded without executing external scripts. `configs/datasets.json` pins download URLs and expected SHA-256 hashes. `data.py` retains the raw files and produces a transformation manifest, independent counts, graph checksum, candidate annotations and sampled source skeletons. The data-license/source notices in that configuration must accompany redistributions. Do not infer a data license from a model repository's software license.

| Source | Role | Limitation |
|---|---|---|
| [MaleCNS v1.0 release](https://male-cns.janelia.org/download/) and [publication record](https://www.janelia.org/publication/sexual-dimorphism-in-the-complete-drosophila-male-central-nervous-system-connectome) | Primary brain/VNC reconstruction, annotations, transmitter predictions, contacts and authentic SWCs | Anatomy is not complete physiological state; release includes unresolved segments |
| [Shiu et al.](https://www.nature.com/articles/s41586-024-07763-9), [official code](https://github.com/philshiu/Drosophila_brain_model) | LIF reference equations and published behavioral reference | Uses FlyWire; the current MaleCNS transfer is a new assumption. MIT implementation is not copied wholesale |
| [FlyVis paper](https://www.nature.com/articles/s41586-024-07939-3), [official code](https://github.com/TuragaLab/flyvis) | Evidence for graded early-visual dynamics and fitted physiology | Not integrated as a secretly equivalent replacement for LIF |
| [Hige et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC4674068/) | Compartment/timing specificity of KC→MBON plasticity | Does not identify a universal reward×STDP algorithm |
| [Huang/Luo et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC11525173/), [source model](https://github.com/schnitzer-lab/Luo_Huang_2024_MB_model) | KC/DAN compartment rule reference | Source MATLAB is GPL-3.0; it is not vendored. This Python equation implementation and spike/rate adaptation are separately documented |
| [Visual KC study](https://www.nature.com/articles/s41467-024-49616-z) | Evidence for visual inputs to specific KC populations | Annotation regex matches are candidate IDs, not validated causal roles |
| [Male visual-system inventory](https://www.nature.com/articles/s41586-025-08746-0), [eye mapping](https://www.nature.com/articles/s41586-025-09276-5) | Missing-coverage and retinotopy constraints | Source geometry needs a documented crosswalk to this dataset and framebuffer |
| [DOOMFLY](https://github.com/nftechie/doomfly) | Exploratory implementation and useful failure reports | Its documented failed gates are not positive learning evidence |
| [Trackmania post](https://x.com/adonis_singh/status/2098691347901247977), [public TMNF-C](https://github.com/adonis-singh/TMNF-C) | Motivation | No independently verified fly protocol, checkpoints or controlled learning result was available for the viral claim |

## Recomputed release totals

Using assigned neuronal superclasses, the importer retains **166,700 neurons, 25,582,938 directed edges and 124,177,617 synaptic contacts**. The original segment-pair file contains 151,856,684 rows and 311,833,243 contacts. Retained graph: 101 autapses, 370 neurons with zero indegree, 1,220 with zero outdegree, 220 weak components and 1,385 strong components. Filtering only `Traced` annotations would incorrectly omit 1,578 assigned neurons; their status is preserved instead.

The three downloaded source hashes are:

- Annotations: `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2`
- Transmitters: `95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621`
- Connection weights: `e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1`

Exact release identifiers, units, URLs, inclusion/sign policies and compiled graph hashes are in the generated manifest and [data-quality notes](docs/DATA_QUALITY.md). Coordinates displayed in the dashboard come from eight actual selected SWCs, converted from official 8-nm coordinate units to nm. Long skeletons are sampled by actual parent-child segments; the view is explicitly a morphology sample, not a rendering of every neuron or measured neural activity.
