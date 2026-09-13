# Isolated published FlyVis reference experiment

This experiment runs one frozen, pretrained FlyVis model on the authors' visual connectome. It measures flash polarity and moving-edge selectivity, plus fresh-state repeats and a constant-gray control. It is a numerical and sensory reference for developing Scicon Fly Lab, **not MaleCNS validation or Scicon learning**. No game, reward, decoder training or efficacy update occurs.

The first complete [measured record](evidence/flyvis-reference-v1/README.md) met its predefined engineering criteria: 8/8 direction matches and 7/8 contrast matches. T4d's contrast failure and central L1/L2 activity below the presynaptic-output threshold remain explicit limitations.

A separate [12-run pathway diagnostic](evidence/flyvis-pathway-v1/README.md) then tested outgoing L1/L2 transmission. It confirmed zero rectified release during the recorded stimuli and small, diminishing differences from blocking output also during initialization. It does not replace biological validation.

The scientific protocol is [flyvis-reference-v1.json](../configs/candidates/flyvis-reference-v1.json). Thresholds are a declared engineering screen, not fitted physiological parameters. Model `flow/0000/000` is chosen in advance; all eight nominated T4/T5 types are reported, including any failures. The 29 trials share one checkpoint and are not independent training replicas.

The [runner](../scripts/flyvis-reference.py) freezes the specification, verifies the official archive and extracted model files, loads tensors with `weights_only=True`, records graded activity rather than spikes, and checks that model parameters remain unchanged. Every stimulus and central-cell response is saved with exact indices. The reference result never writes the MaleCNS validation gates.

## Reproduce the isolated environment

Tested on this Windows computer with Python 3.12. The optional dependency set is isolated from `fly-lab/.venv` and the production game. The exact installed versions are in [requirements-vision-reference.lock.txt](../requirements-vision-reference.lock.txt). This is a version lock, not a wheel-hash lock or a tested cross-platform environment.

The installed FlyVis 1.2.0 package identifies its software license as MIT. The upstream authors retain attribution through the linked official source and paper; software licensing should not be treated as a blanket license for separate anatomical datasets.

From `fly-lab` in PowerShell, when the target environment does not already exist:

```powershell
.\.venv\Scripts\python.exe -m venv runtime/vision-reference/.venv
$referencePython = Join-Path (Get-Location) 'runtime/vision-reference/.venv/Scripts/python.exe'
& $referencePython -m pip install torch==2.8.0+cpu torchvision==0.23.0+cpu --index-url https://download.pytorch.org/whl/cpu
& $referencePython -m pip install -r requirements-vision-reference.lock.txt
```

Do not install the upstream `[pretrained]` extra in this Python 3.12 environment: its older optional numba constraint is incompatible. Pretrained checkpoint inference does not need the SinTel training dataset or the pretrained UMAP visualization.

Set the data root explicitly and disable ancestor `.env` loading before invoking upstream FlyVis tools:

```powershell
$env:PYTHON_DOTENV_DISABLED = '1'
$env:FLYVIS_ROOT_DIR = Join-Path (Get-Location) 'runtime/vision-reference/data'
$env:MPLBACKEND = 'Agg'
.\runtime\vision-reference\.venv\Scripts\flyvis.exe download-pretrained
```

The official downloader checks this archive SHA256:

```text
71c78d4070556a536b13b23ee3139cd2788aa2a9d07d430a223b4edead281db1
```

On this computer, the downloader's `httplib2` TLS certificate chain failed. The same official public Google Drive archive was obtained with PowerShell's trusted certificate store; TLS verification was not disabled. It was exactly 3,417,042 bytes and matched that SHA256 before extraction. The [upstream downloader](https://github.com/TuragaLab/flyvis/blob/v1.2.0/flyvis_cli/download_pretrained_models.py) records the file ID and expected hash.

If the same certificate issue occurs, download that exact archive to a new `.part` file using `Invoke-WebRequest`, verify it with `Get-FileHash -Algorithm SHA256`, and extract only after the expected hash matches. Use a fresh destination and verify every resolved archive path stays inside it; do not overwrite an earlier run's model/cache files. Preserve the original archive at `data/results_pretrained_models.zip`. The runner rechecks the archive and every extracted file belonging to the nominated model.

## Run the bounded screen

Choose a new output directory; existing output directories are rejected.

```powershell
& $referencePython scripts/flyvis-reference.py --data-root runtime/vision-reference/data --output runtime/vision-reference/results/NEW-UNIQUE-ID
```

The script restricts CPU computation to two PyTorch threads and one interop thread. Its watchdog covers preprocessing and simulation, with a 20-minute wall budget and a 4-GiB process-RSS threshold. The memory monitor is sampled, so this is an interruption threshold, not an operating-system reservation or an exact maximum. An interruption leaves evidence and cannot become a passing screen.

FlyVis normally constructs large dense pixel/receptor products. Our isolated renderer adapter uses the same upstream geometry and bar-drawing functions, with blocked geometry construction and sparse pixel sums. Before simulation, it must match the upstream float32 network inputs on small-eye cases and selected full-resolution receptors. These comparisons and delivered inputs are saved. This validates the tested allocation change; it does not establish all possible stimulus/raster equivalence across devices.

The script also adapts Datamate 1.0.0's HDF5 writer on Windows to close files through a context manager. The upstream exception path tries to unlink an open file. The adapter writes the same arrays and preserves SWMR mode; neural equations and checkpoints are unchanged. Both adapters are recorded in run metadata and belong to the versioned assay script. Installed third-party packages are not patched on disk.

## Read the record

Each complete output contains:

- `specification.json`, `metadata.json`, `results.json` and a readable `report.md`.
- Exact hex inputs and central-cell graded responses in per-trial NPZ files; stimulus metadata in matching JSON files.
- Fresh gray/repeat controls, renderer-comparison arrays and figures.
- `checksums.json` covering the completed record.

`interrupted.json` marks an incomplete attempt. A software failure before any trial is not a physiological failure. An eventual successful retry does not erase earlier attempts. Runtime outputs remain local under the ignored `runtime/` directory; representative results and provenance can be copied into `docs/evidence` without changing their bytes.

The upstream model was trained by its authors to estimate optic flow. Reproducing its responses does not show that our project trained a fly, that its parameters transfer to MaleCNS, or that visual information reaches a mushroom-body learning circuit. The next MaleCNS candidate still needs its own anatomy/physiology boundary, held-out sensory checks and downstream validation.

Primary sources: [FlyVis paper](https://www.nature.com/articles/s41586-024-07939-3), [official installation](https://turagalab.github.io/flyvis/install/), [versioned source dynamics](https://github.com/TuragaLab/flyvis/blob/v1.2.0/flyvis/network/dynamics.py).
