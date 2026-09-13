# Scicon Fly Lab: reproducible model mechanism check

This package contains the actual retained MaleCNS neuron IDs and contact counts, an explicit reduced rate model, the frozen protocol, 96 completed condition results, recorded model rates, and complete checkpoints. It is sufficient to recompute the model results **without downloading the full connectome**. It does not contain a game-playing fly or demonstrate learned gameplay.

## Run the verification

Use Python 3.12. Extract the archive into a new folder, then run:

```text
python -m venv .venv
```

Windows:

```text
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python scripts/reproduce-reduced-conditioning.py
```

macOS / Linux:

```text
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/reproduce-reduced-conditioning.py
```

The default recomputes all six conditions for the first seed and checks the full 540-frame recorded trajectory and every state variable in each corresponding checkpoint. It validates evidence checksums, frozen source checksums and circuit identity before importing the model. To recompute all 96 executions, add `--all`. The complete run took about twenty seconds on the original computer. Numerical libraries are limited to two threads.

The expected output is `status: PASS`. Exact equality is reported separately. The comparison permits relative error up to 1e-10 and absolute error up to 1e-12 so that modest platform differences are visible without being silently treated as exact reproduction. This tolerance is an engineering choice, not a tested guarantee for all platforms.

## What to inspect

- `METHODS_AND_RESULTS.md`: readable scientific scope, complete methods, controls and first results.
- `evidence/reduced-conditioning-v1/frozen-protocol.json`: parameters and source hashes written before condition outcomes.
- `evidence/reduced-conditioning-v1/circuit.json`: all 722 selected neurons, 720 modeled KC-to-MBON pairs, supporting DAN contacts, and the full list of omitted internal pairs.
- `evidence/reduced-conditioning-v1/public-experiment.json`: descriptive results, all input assignments, checks, source links and one recorded model trajectory.
- `evidence/reduced-conditioning-v1/checkpoints.json`: full trained mutable state for every condition execution.
- `python/scicon_fly/reduced_conditioning.py`: exact frozen numerical implementation.
- `configs/reduced-conditioning-v1.json`: original method choices.

The model uses a single actual anatomical specimen. Its eight seeds and both reinforced-cue assignments are computational input variations, not independent animals. Directly imposed cues bypass vision. PPL101 activation is an aversive reinforcement candidate, not an appetitive game-score signal. Pairing-specific depression follows an explicitly programmed rule; successful checks show that mechanism behaves as declared, not that its biology has been established.

The original `scripts/run-reduced-conditioning.py` is included for source identity and full data re-extraction in the canonical lab environment. That path additionally requires the graph, annotations, PyArrow and psutil. The standalone reproduction command above needs only NumPy and the included frozen reduction.

The hash lists detect corruption and establish internal file identity. They are not externally signed and do not independently authenticate the original dataset. Full independent anatomical verification should repeat extraction from the [official MaleCNS v1.0 release](https://male-cns.janelia.org/download/) and compare identities.

MaleCNS data attribution: FlyEM / HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology, and Google Research. Dataset license: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The included reduction retains the original body IDs and contact counts. Primary scientific sources are linked in `METHODS_AND_RESULTS.md` and the machine-readable public artifact.
