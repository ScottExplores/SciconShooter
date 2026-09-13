# Scicon Fly Lab

Private experimental application using Scicon Shooter's canonical engine and Pixi renderer. The real MaleCNS graph is supported. **No validated MaleCNS visual/game controller or biological learning result is supplied.** Missing evidence is a visible gate, not substituted with a random policy carrying a fly label.

## Start on this computer

```powershell
cd 'C:\Users\scott\Documents\Scicon Shooter\fly-lab'
npm run dev
```

Open http://127.0.0.1:5180. Configure a Random baseline, Idle or Manual episode and choose Reset, then Start or Step. Pause leaves simulated time unchanged. Stop finalizes an export. Replay verifies an immutable run in a fresh Chromium instance. The private coordinator listens on 127.0.0.1:8766; the existing game preview remains separate on 5179.

The software rendering profile is the default. The separately tested `local-d3d11` profile uses this computer's Intel GPU; its pixels must be compared only with runs using the same recorded renderer identity. Source edits invalidate strict replay until the exported source version is restored. This is intentional.

Restart the lab after source or configuration edits. The coordinator rejects new episodes when disk sources differ from the version loaded by its Python process, so an export cannot silently describe different code.

## Another installation

Use the source commit recorded in an experiment's metadata, overlay its `source.zip` when needed, and obtain the original game assets at their recorded hashes. Use Node 24.12.0 and Python 3.12. Install the root game's dependencies with `npm ci` if absent. Then:

```powershell
cd fly-lab
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -Python 'C:\Path\To\python.exe'
$env:PYTHONPATH = (Resolve-Path python).Path
.venv\Scripts\python.exe -m scicon_fly.data prepare
.venv\Scripts\python.exe -m scicon_fly.data morphology
npm run dev
```

The initial three official dataset downloads total about 1.11 GB. Raw data, compiled graphs, virtual environments and experiment results are ignored by Git and excluded from deployment. Do not copy `.env.local`; the lab never loads it. Setup installs only the lab dependencies and pinned browser, not wallets or production services.

In a second terminal with the same `PYTHONPATH`:

```powershell
.venv\Scripts\python.exe -m scicon_fly.replay experiments/EXPERIMENT_ID
.venv\Scripts\python.exe -m scicon_fly.assays --graph data/compiled/v1.0/graph.npz --manifest data/compiled/v1.0/manifest.json
.venv\Scripts\python.exe -m scicon_fly.study preflight configs/study.json
```

Preflight currently fails honestly because validated retinal, decoder, conditioning and control manifests do not exist. The default pilot is a methods template, not an automatic training job. `study plan` generates a reproducible sealed schedule; `study run` additionally requires validated real models and an explicit measured compute budget. See [experiment design](EXPERIMENT_DESIGN.md).

The first actual MaleCNS optic-hex/L1 candidate failed its visual KC and decoder screens. Reproduce its frozen inputs with `scicon_fly.assays` and the three `configs/candidates/malecns-hex-v0.1-*.json` files; inspect `docs/evidence/malecns-hex-v0.1-screen.json` and its diagnosis before revising the model. Candidate assay manifests cannot authorize game training.

```powershell
.venv\Scripts\python.exe -m scicon_fly.assays --graph data/compiled/v1.0/graph.npz --manifest data/compiled/v1.0/manifest.json --vision configs/candidates/malecns-hex-v0.1-vision.json --decoder configs/candidates/malecns-hex-v0.1-decoder.json --specification configs/candidates/malecns-hex-v0.1-specification.json
```

The command reports fresh measurements to the terminal; it does not overwrite the frozen screen or upgrade any validation gate.

`get_state()` is privileged immutable diagnostics, not a restorable engine checkpoint. Game replay always uses a fresh reset plus the exact action sequence. Neural checkpoints separately preserve complete mutable model state. A crash can be inspected with `python -m scicon_fly.recovery experiments/INTERRUPTED_ID runtime/recovered-ID`; this copies the evidence into a new diagnostic directory and never labels it a completed study.

## Verification

```powershell
npm run typecheck
npm test
npm run test:python
npm run verify:replay
```

Browser replay requires the lab server. Root TypeScript, existing gameplay regression tests and production exclusion checks cover the shared engine changes. See [architecture](ARCHITECTURE.md), [data sources](DATA_SOURCES.md), [limitations](ASSUMPTIONS_AND_LIMITATIONS.md), [data quality](docs/DATA_QUALITY.md) and [model methods](docs/MODEL.md).

The dashboard reports individual runs as **INSUFFICIENT EVIDENCE**. Source anatomy, numerical correctness, sensory validity and learned performance are different claims. A reproducible negative assay is useful output.
