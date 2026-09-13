# MaleCNS data provenance and quality

The local graph was compiled from the official **male-cns:v1.0** release on
2026-09-13 UTC. Source files and raw acquisition sidecars are under
`fly-lab/data/raw/v1.0/`; these large local files must remain outside Git.
SHA-256 pins and exact byte lengths are checked into `configs/datasets.json`.
These pins were established from the first official HTTPS downloads, then
verified during compilation; they are reproducibility locks, not hashes signed
by the paper authors. The downloader also records GCS generation and ETag and
checks an official MD5 header when supplied. Raw files are never silently
overwritten. Interrupted downloads use object-identity-checked partial files;
a failed checksum never promotes a partial file.

## Actual source schema

| File | Rows | Relevant columns |
| --- | ---: | --- |
| Annotations | 211,577 | `bodyId`, `superclass`, `status`, `type`, `somaSide`, `somaNeuromere`, `assignedOlHex1`, `assignedOlHex2` |
| Neurotransmitters | 1,835,518 | `body`, `consensus_nt`, prediction/confidence and ground-truth fields |
| Weights | 151,856,684 | `body_pre`, `body_post`, `weight` |

Weights cover **all segments**, including unresolved fragments. Their contact
sum is 311,833,243; it must not be reported as contacts in the retained neural
graph. The importer retains assigned neuronal superclasses, including uncertain
classes, and excludes explicit glia and unassigned objects. Restricting to
`Traced` alone would produce 165,122 neurons and wrongly omit 1,578 retained
neurons. All positive released contacts between included neurons are retained,
including weak edges and autapses. There is no extra pruning threshold.

## Measured retained graph

| Quantity | Count |
| --- | ---: |
| Neurons | 166,700 |
| Directed neuron pairs | 25,582,938 |
| Synaptic contacts | 124,177,617 |
| Duplicate directed-pair rows merged | 0 |
| Autapses | 101 |
| Zero incoming / outgoing degree | 370 / 1,220 |
| Weak / strong components | 220 / 1,385 |
| Unknown consensus transmitter | 3,177 |
| Modeled fast-transmission sign zero | 3,718 neurons; 1,023,803 edges; 3,232,234 contacts |

Consensus transmitter counts: acetylcholine 103,720; glutamate 29,302; GABA
22,069; histamine 7,891; dopamine 392; octopamine 101; serotonin 48; unknown
3,177. The exploratory fast-current sign policy is ACh positive and
GABA/glutamate/histamine negative. Unknown and modulatory transmitters have zero
fast-current sign; their anatomical nodes and edges remain present. This is
**not** a measured receptor-specific conductance model. R8 cotransmission,
graded visual dynamics and compartmental dopamine effects require separate
validated models.

The artifact uses presynaptic-row CSR: `ids` uint64, `indptr` int64, `indices`
int32, `contacts` uint32 and `signs` float64 per neuron. `indices` gives targets;
source indices are implied by CSR rows. Unicode annotation arrays and the
official assigned optic-lobe hex coordinates are included without pickle.
`neuron_regions` reflects `somaNeuromere`, not exclusive synaptic ROI membership;
missing values stay empty. Assigned hex coordinates are not a validated
screen-to-retina map. Full arrays occupy **256,673,912 bytes**; the measured
compile took approximately 55 seconds on this machine. Simulator benchmarks
must be reported separately.

## Evidence boundaries

The annotation candidates include 4,064 KCs, 97 MBONs, 206 `KCg-d`, 129
`KCab-p`, 340 PAM/PPL-named cells and 5,327 L1/L2/L3 cells. Type-name matches
identify candidates; they do not validate function, reward compartments,
retinotopy or effector selection. All corresponding functional gates remain
`NOT_VALIDATED`. No synthetic neuronal positions or biological attack circuit
are inferred.

`data/compiled/morphology.json` contains eight real released SWC skeleton
samples. Positions are official 8-nm-unit coordinates multiplied by eight;
every line segment uses an actual parent-child pair. Long skeletons are sampled
to at most 8,000 original segments, with original/displayed counts recorded.
The file is an anatomical illustration, not a whole-CNS morphology or a
functional readout map. Each neuron records its source URL and SHA-256.

## Reproduction and verification

From the repository root, using the lab private Python environment:

```powershell
$env:PYTHONPATH = (Resolve-Path '.\fly-lab\python').Path
& '.\fly-lab\.venv\Scripts\python.exe' -m scicon_fly.data prepare
& '.\fly-lab\.venv\Scripts\python.exe' -m scicon_fly.data inspect
& '.\fly-lab\.venv\Scripts\python.exe' -m scicon_fly.data morphology
& '.\fly-lab\.venv\Scripts\python.exe' -m pytest fly-lab/python/tests/test_data.py -q
```

The 16 focused tests cover uncertain-neuron retention, glia exclusion,
directed-edge aggregation, weak contacts/autapses, unknown/modulatory signs,
invalid counts, safe resume, ignored Range, changed object identity, corrupt
existing files, checksum failures, path traversal and end-to-end compilation
of a explicitly synthetic miniature Feather fixture.

Primary data: [official downloads](https://male-cns.janelia.org/download/).
Data license: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Credit FlyEM / HHMI Janelia, University of Cambridge, MRC Laboratory of
Molecular Biology and Google Research. The project's code license does not
replace the dataset license.
