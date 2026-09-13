# Graded OFF physiology: source audit v1

Checked 2026-09-13 for the nominated 57-cell MaleCNS right L2/Tm1/Tm2 diagnostic. This document records evidence and acquisition boundaries; it does not fit parameters, run a model, or change validation gates.

## Behnia et al. 2014: downstream polarity and timing

[Primary paper and methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC4243710/) · [publisher](https://www.nature.com/articles/nature13427).

In vivo whole-cell recordings found Tm1/Tm2 hyperpolarization at light onset and strong depolarization at light offset. Protocols included 200-ms full-field light flashes from darkness and 5-s dark/gray/light steps. The article's main and extended captions disagree on the duration of a separate repeated-flash sequence; do not silently choose one.

The full-field flicker was 10 s, approximately Gaussian, 50% contrast standard deviation, exponential correlation time 10 ms, presented at 240 Hz. Extracted filter peaks were Tm1 56 ms (SEM 3.8) and Tm2 43 ms (SEM 2.7). A separate receptive-field experiment used 256 independently flickering squares, 200 s and 50-ms correlation time. These are different stimulus/estimation conditions.

Filter peaks are **not membrane time constants**, conduction delays, or universal latency thresholds. Their ordering is useful evidence; reproducing their numerical values requires matching stimulus, acquisition and filter estimation. The inspected paper/publisher pages expose figures, but this audit did not locate a public machine-readable raw Tm1/Tm2 recording repository. That is an acquisition gap, not proof that none exists.

## Pang et al. 2025: quantitative L2 targets exist

[Primary paper, final issue January 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11769683/) · DOI 10.1016/j.cub.2024.11.064.

Two-photon ASAP2f voltage imaging measured non-spiking L1/L2 responses in female flies, 5–8 days after eclosion. The impulse protocol used **20-ms full-screen light/dark flashes**, randomly chosen, with **500-ms gray interleaves**, Weber contrast magnitude 1, for **121 s per field of view**. It is not the 200-ms engineering flash proposed for our initial diagnostic.

Responses were biphasic and differed across contrast polarities; recurrent-circuit interventions shaped the slower phase. The paper fitted a feedback model and also tested naturalistic stimuli and a 20-µM chlordimeform condition. Keep untreated and drug-treated records separate. The latter is an octopaminergic manipulation, not our proposed reward signal.

Use fluorescence responses through a declared observation model: they are not absolute membrane voltages or transmitter-release measurements. Parameter fitting must account for indicator dynamics, normalization, stimulus alignment, cell selection and biological variation. A fitted feedback variable is not an identified omitted neuron. Female physiology transferred to one male connectome remains a model assumption.

## Author-deposited data and code

[Dryad release](https://datadryad.org/dataset/doi:10.5061/dryad.ngf1vhj4c) is dated 2024-12-17, totals 49.60 GB and declares CC0-1.0 in page metadata. Selective acquisition is sufficient:

| File | Listed size | Direct source |
|---|---:|---|
| L2_ASAP2f.mat | 117.01 MB | [file 3732211](https://datadryad.org/downloads/file_stream/3732211) |
| L1L2_Metadata.xlsx | 195.43 KB | [file 3732249](https://datadryad.org/downloads/file_stream/3732249) |
| README.md | 15.13 KB | [file 3732251](https://datadryad.org/downloads/file_stream/3732251) |

The documented MAT schema contains selected-ROI indices `iResp`, `roiDataMat`, `roiMetaMat`, stimulus-aligned `t`/`rats`/SEM, continuous fluorescence, reconstructed stimulus values/times, and fly identifiers. Response epoch 1 is dark and 2 light; the search and experimental recordings occupy different columns. Preserve fly-level grouping. This audit inspected the README schema, **not those MAT contents**.

Direct file requests encountered an anti-bot challenge; the attempted spreadsheet was HTML and was renamed accordingly. No usable Dryad spreadsheet or 117-MB MAT was downloaded. Validate content signatures as well as status codes.

[Author code](https://github.com/ClandininLab/L1L2-recurrent-feedback/tree/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0) was inspected at commit `7fa5829e37d566e02beaaa87efd6a0f1de4e48c0`. Its tree lists tiny aggregate [L2_highLum.mat](https://raw.githubusercontent.com/ClandininLab/L1L2-recurrent-feedback/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/computational-model/data/L2_highLum.mat) (1,463 bytes) and [L2_lowLum.mat](https://raw.githubusercontent.com/ClandininLab/L1L2-recurrent-feedback/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/computational-model/data/L2_lowLum.mat) (1,459 bytes). They were not downloaded in this audit; verify variables before use. The author's export script writes `meanResp`, `indivResp` and `t`, but that does not establish which fields exist in each small file.

Static inspection found notebook execution hazards: an assertion uses `['L1' and 'L2']`, and time-vector reads reference undefined `natsti_res` variables. Notebook results therefore cannot be claimed reproduced by running the file unchanged. The source also contains a 750-ms-interleave stimulus example; that must not replace the paper's 500-ms protocol. No downloaded code was executed. No LICENSE file appeared in the inspected tree. The paper links [Zenodo code archive 13367946](https://doi.org/10.5281/zenodo.13367946); its API request did not complete here, so archive license/version remain unverified. Do not infer a software license from the Dryad data license.

## Consequences for the current diagnostic

The 57-cell experiment can test numerical agreement, stable graded signal propagation, intervention handling and reproducibility. Correct polarity after externally imposing an OFF input is chiefly a wiring/software check. It does not independently establish biological OFF selectivity. In particular, subtracting baseline activity and keeping a linear response regime can make equal-and-opposite ON/OFF responses inevitable; report this rather than labeling it physiological rectification.

A reduced-circuit engineering assay **cannot validate whole-CNS vision**, mushroom-body representation, learned control, or behavior. Excluded recurrent inputs and lamina dynamics must remain explicit. Do not tune arbitrary time constants to the 43/56-ms filter peaks and call them measured physiology.

The strongest next bounded step is to acquire and verify the small author aggregate curves, reproduce their stimulus/measurement conventions, and separately obtain selected ROI/fly records for uncertainty. Freeze a training/held-out split by biological fly before fitting. Report a family of adequate fits and parameter sensitivity where parameters are not identifiable. After numerical reproduction, compare a declared L2 boundary model against both flash polarities and a genuinely held-out stimulus. Only then embed it in a larger MaleCNS circuit with boundary interventions. Aggregate mean curves alone do not provide independent validation samples.

## Local inspection record

Downloaded metadata/code only under `fly-lab/data/raw/vision-physiology/pang-2025/` (ignored research data). Seven files total 473,474 bytes. None were executed. SHA256 values:

| Local file | SHA256 |
|---|---|
| github-tree.json | `01e239ca7cb7d6fdc362c007c28da1c1e2943d49bc3e98efa108af937bad9852` |
| computational-model__L1_2responses_to_flashes.ipynb | `8fc96a50db5811bc07d53d23263f23c3cc780b463a0ecd82e7f56a6876c642f6` |
| computational-model__Latency_plots.ipynb | `1cadc600174e528df5c81d6212771d2f2249caedd17f2b74c9703f65a5cca0f3` |
| computational-model__Simulation.ipynb | `f93c79e6d5ca778dd4ef9686a0defa056e49972e149dd85c9555ac7a72a7c529` |
| imaging-analysis__HHY_stimulusSpecificAnalysisScripts__shortFlashProcessed_saveMean.m | `e5c9daf537b4a3f20c7708e3b1c6ccac66b37f3e1cba943a1ffa4c6c6c447cb7` |
| stimulus__fullfield_LDflash20ms_Gray750ms.txt | `8b3e92266c0a11631bf164db7e48b297631ab8fcdfba2239be3d2e01eb5a2bb5` |
| dryad-metadata-download-challenge.html | `a6204aad2b4da29e977c32e10bcf48c78a6d5a6b9e008547373631f79ca4b8f1` |

Browser extraction of PMC pages encountered a challenge; ordinary HTTPS retrieval of the same primary pages succeeded for method inspection. No protection was bypassed. No candidate, anatomical file, model parameter, or validation result was modified by this audit.
