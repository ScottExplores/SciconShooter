"""Scientific gates remain NOT_RUN until matching evidence is supplied."""
from datetime import datetime, timezone
import numpy as np

REQUIRED_TRAINING_GATES = ("numerical", "visual", "conditioning", "decoder")


def gate_report(identity):
    return {"schemaVersion": 1, "identity": identity, "generatedAt": datetime.now(timezone.utc).isoformat(),
            "gates": {name: {"status": "NOT_RUN", "evidence": [], "reason": "No validated assay result is available"} for name in REQUIRED_TRAINING_GATES},
            "trainingAllowed": False, "biologicalLearning": "UNKNOWN"}


def require_training_gates(report, identity):
    if report.get("identity") != identity:
        raise ValueError("Validation evidence does not match this model/graph/input/decoder/plasticity configuration")
    failed = [name for name in REQUIRED_TRAINING_GATES if report.get("gates", {}).get(name, {}).get("status") != "PASS" or not report["gates"][name].get("evidence")]
    if failed:
        raise ValueError("Training gate not passed: " + ", ".join(failed))


def conditioning_gate(paired_suppression, unpaired_suppression, backward_suppression, no_us_suppression, *, minimum_selectivity):
    """Assay outputs must already be independent, counterbalanced cue contrasts.

    This conservative descriptive development gate is not a statistical claim.
    Actual source files must be attached by the experiment manager.
    """
    arrays = [np.asarray(a, dtype=float) for a in (paired_suppression, unpaired_suppression, backward_suppression, no_us_suppression)]
    if any(a.ndim != 1 or a.size < 2 or not np.isfinite(a).all() for a in arrays) or len({a.shape for a in arrays}) != 1 or not np.isfinite(minimum_selectivity) or minimum_selectivity <= 0:
        raise ValueError("Need complete counterbalanced conditioning measurements")
    margin = arrays[0] - np.maximum.reduce(arrays[1:])
    passed = bool(np.all(margin >= minimum_selectivity))
    return {"status": "PASS" if passed else "FAIL", "minimumMargin": float(margin.min()),
            "requiredMargin": minimum_selectivity, "evidence": [], "classification": "DEVELOPMENT_ASSAY_ONLY",
            "reason": "Paired cue selectivity must exceed every timing/no-US control in every counterbalance"}


def numerical_agreement(reference, candidate, tolerance=1e-9):
    if not np.isfinite(tolerance) or tolerance < 0:
        raise ValueError("Numerical tolerance must be nonnegative and finite")
    if set(reference) != set(candidate):
        return {"status": "FAIL", "reason": "Different state fields", "evidence": []}
    mismatches = []
    for name, expected in reference.items():
        actual = candidate[name]
        equal = expected.shape == actual.shape and (np.array_equal(expected, actual) if expected.dtype.kind not in "fc" else np.allclose(expected, actual, rtol=0, atol=tolerance))
        if not equal:
            mismatches.append(name)
    return {"status": "FAIL" if mismatches else "PASS", "mismatches": mismatches,
            "absoluteTolerance": tolerance, "evidence": [], "classification": "NUMERICAL_ONLY"}


def _assay_backend(backend):
    """Execution identity is separate from physiological/assay configuration."""
    import inspect
    from .model import LIFModel, file_hash
    if backend == "reference":
        model_type, version = LIFModel, "numpy-reference-lif-v1"
    elif backend == "preallocated":
        from .lif_fast import FastLIFModel
        model_type, version = FastLIFModel, FastLIFModel.backend_version
    else:
        raise ValueError("Unknown assay backend; choose reference or preallocated")
    return model_type, {"backend": backend, "backendVersion": version,
                        "implementationSha256": file_hash(inspect.getfile(model_type))}


def full_graph_sanity(graph_path, manifest_path, *, stimulus_type="L1", nominated_count=16, modeled_ms=20., backend="reference"):
    """Load the actual retained graph and report a reproducible arbitrary probe.

    This does not authorize a visual mapping or biological training gate. The
    nominated cells receive an explicitly artificial direct current; geometry
    is neither inferred nor fabricated from their neuron IDs.
    """
    import platform
    import time
    from .model import SparseGraph
    from .vision import VisualTransducer
    model_type, execution = _assay_backend(backend)
    if type(nominated_count) is not int or not 1 <= nominated_count <= 1000 or not np.isfinite(modeled_ms) or not 0 < modeled_ms <= 100:
        raise ValueError("Sanity probe budget is bounded to 1000 nominated cells and 100 modeled ms")
    start = time.perf_counter()
    graph = SparseGraph.load(graph_path, manifest_path)
    load_seconds = time.perf_counter()-start
    start = time.perf_counter(); model = model_type(graph)
    initialize_seconds = time.perf_counter()-start
    steps = round(modeled_ms/model.parameters.dt_ms)
    if steps < 1:
        raise ValueError("Probe duration is shorter than a neural timestep")
    start = time.perf_counter(); silent = model.advance(np.zeros(graph.n), steps)
    silent_seconds = time.perf_counter()-start
    model.reset()
    types = graph.annotations.get("neuron_types", np.full(graph.n, ""))
    selected = np.flatnonzero(types == stimulus_type)[:nominated_count]
    if not len(selected):
        raise ValueError("No exact annotated cell type matches the declared stimulus")
    drive = np.zeros(graph.n); drive[selected] = 20
    start = time.perf_counter(); counts = model.advance(drive, steps)
    stimulated_seconds = time.perf_counter()-start
    mapping_error = None
    try:
        VisualTransducer(graph, {"graphHash": graph.identity, "samples": []})
    except ValueError as exc:
        mapping_error = str(exc)
    return {"synthetic": bool(graph.manifest.get("synthetic", False)), "neurons": graph.n, "edges": graph.e,
            "execution": execution,
            "graphIdentity": graph.identity, "graphFileSha256": graph.manifest.get("graph_sha256"),
            "loadSeconds": load_seconds, "initializationSeconds": initialize_seconds,
            "silent": {"modeledMs": steps*model.parameters.dt_ms, "wallSeconds": silent_seconds, "spikes": int(silent.sum())},
            "injectedCurrentAssay": {"interpretation": "ARBITRARY_NUMERICAL_STIMULUS_NOT_VISUAL_VALIDATION",
                "cellType": stimulus_type, "nominatedNeuronIds": [str(body) for body in graph.ids[selected]],
                "driveMv": 20, "modeledMs": steps*model.parameters.dt_ms, "wallSeconds": stimulated_seconds,
                "spikes": int(counts.sum()), "activeNeurons": int(np.count_nonzero(counts)),
                "finite": bool(np.isfinite(model.v).all() and np.isfinite(model.g).all())},
            "realRetinalValidation": {"status": "NOT_RUN", "blockingError": mapping_error},
            "trainingAllowed": False, "biologicalLearning": "UNKNOWN", "numpy": np.__version__, "python": platform.python_version()}


def visual_decoder_assay(graph, vision_manifest, decoder_manifest, specification, *, parameters=None, backend="reference"):
    """Bounded candidate-only assay; never manufactures a calibrated retina.

    Inputs/criteria are hashed before running. No criterion defaults to PASS.
    All six stimuli share duration and start from reset fixed efficacy. This is
    an initial engineering screen, not the complete biological visual gate.
    """
    import time
    from .model import canonical_hash
    from .vision import VisualTransducer
    from .decoder import FixedDecoder
    model_type, execution = _assay_backend(backend)
    specification_hash = canonical_hash(specification)
    if specification.get("graphHash") != graph.identity:
        raise ValueError("Assay specification must bind the actual graph identity")
    transducer = VisualTransducer(graph, vision_manifest, assay_only=True)
    decoder = FixedDecoder(graph, decoder_manifest, assay_only=True)
    model = model_type(graph, parameters)
    duration = float(specification.get("durationMs", 20))
    bin_ms = float(specification.get("binMs", 5))
    total_budget = float(specification.get("maximumTotalMs", 200))
    if not np.isfinite([duration, bin_ms, total_budget]).all() or not 1 <= duration <= 250 or not model.parameters.dt_ms <= bin_ms <= duration or not duration*6 <= total_budget <= 2000:
        raise ValueError("Visual assay exceeds the declared bounded modeled-time budget")
    if not np.isclose(duration/bin_ms, round(duration/bin_ms)) or not np.isclose(bin_ms/model.parameters.dt_ms, round(bin_ms/model.parameters.dt_ms)):
        raise ValueError("Assay duration/bin must align with the neural timestep")
    populations = {}
    annotations = graph.annotations.get("neuron_types", np.full(graph.n, ""))
    for name, population in specification.get("populations", {}).items():
        if name == "__decoder__" or not population.get("evidence"):
            raise ValueError("Population groups need names and nomination evidence")
        cells = {graph.neuron_index(body) for body in population.get("neuronIds", [])}
        for cell_type in population.get("neuronTypes", []):
            cells.update(np.flatnonzero(annotations == cell_type).tolist())
        if not cells:
            raise ValueError("Nominated visual population has no exact matching cells")
        populations[name] = np.array(sorted(cells), dtype=np.int64)
    if not populations:
        raise ValueError("Assay needs explicit relevant visual/KC population nominations")
    seed = specification.get("seed", 0)
    if type(seed) is not int or seed < 0:
        raise ValueError("Assay scramble seed must be a nonnegative integer")
    bins, steps = round(duration/bin_ms), round(bin_ms/model.parameters.dt_ms)
    permutation = np.random.Generator(np.random.PCG64(seed)).permutation(32*32)
    stimuli = ("dark", "illumination", "flash", "movingBar", "mirror", "scramble")
    results = {}
    start = time.perf_counter()
    for stimulus in stimuli:
        model.reset(); transducer.reset(); decoder.reset()
        total = np.zeros(graph.n, dtype=np.int64)
        first = {name: None for name in populations}
        trace = []; channels = []
        for tick in range(bins):
            frame = np.zeros((32,32), dtype=np.uint8)
            if stimulus == "illumination" or (stimulus == "flash" and tick == bins//2):
                frame[:] = 255
            elif stimulus in {"movingBar", "mirror", "scramble"}:
                left = round(28*tick/max(1,bins-1)); frame[:,left:left+4] = 255
                if stimulus == "mirror": frame = frame[:,::-1].copy()
                elif stimulus == "scramble": frame = frame.reshape(-1)[permutation].reshape(32,32)
            drive = transducer.encode(frame, bin_ms)
            counts = model.advance(drive, steps)
            action = decoder.decode(counts, bin_ms)
            total += counts; channels.append(decoder.rates.copy())
            for name, cells in populations.items():
                if first[name] is None and np.any(counts[cells]): first[name] = (tick+1)*bin_ms
            trace.append({"endMs": (tick+1)*bin_ms, "populationSpikes": {name:int(counts[cells].sum()) for name,cells in populations.items()},
                          "decoderRatesHz": decoder.rates.tolist(), "action": action})
        metrics = {name: {"spikes": int(total[cells].sum()), "meanHz": float(total[cells].sum()*1000/(duration*len(cells))),
                         "activeFraction": float(np.count_nonzero(total[cells])/len(cells)), "firstResponseBinEndMs": first[name],
                         "neurons": len(cells)} for name,cells in populations.items()}
        channel_mean = np.mean(channels, axis=0)
        metrics["__decoder__"] = {"xMeanHz": float(channel_mean[0]), "yMeanHz": float(channel_mean[1]), "fireMeanHz": float(channel_mean[2]),
                                  "fireFraction": float(np.mean([row["action"]["fire"] for row in trace])),
                                  "movingFraction": float(np.mean([row["action"]["movement"] != "idle" for row in trace]))}
        results[stimulus] = {"metrics": metrics, "trace": trace, "spikes": int(total.sum()),
                             "finite": bool(np.isfinite(model.v).all() and np.isfinite(model.g).all())}
    gates = {}
    for domain in ("visual", "decoder"):
        criteria = specification.get("criteria", {}).get(domain, [])
        checks = []
        for criterion in criteria:
            if criterion.get("operator") not in {">=", "<="} or not np.isfinite(criterion.get("value", np.nan)):
                raise ValueError("Preregistered criteria need finite value and >= or <= operator")
            try:
                actual = results[criterion["stimulus"]]["metrics"][criterion["population"]][criterion["metric"]]
                if criterion.get("referenceStimulus"):
                    reference = results[criterion["referenceStimulus"]]["metrics"][criterion["population"]][criterion["metric"]]
                    actual = None if actual is None or reference is None else actual-reference
            except KeyError as exc:
                raise ValueError("Criterion refers to an unknown measured metric") from exc
            passed = actual is not None and (actual >= criterion["value"] if criterion["operator"] == ">=" else actual <= criterion["value"])
            checks.append({"criterion": criterion, "actual": actual, "passed": bool(passed)})
        gates[domain] = {"status": ("PASS" if all(c["passed"] for c in checks) else "FAIL") if checks else "NOT_RUN",
                         "criteriaResults": checks, "classification": "PREREGISTERED_CANDIDATE_SCREEN_ONLY",
                         "reason": "Measured candidate criteria; independent biological acceptance still required" if checks else "No preregistered acceptance criteria supplied"}
    return {"identity": {"graph":graph.identity,"dynamics":model.parameter_hash,"vision":transducer.identity,"decoder":decoder.identity,
                         "assaySpecification":specification_hash},
            "synthetic":bool(graph.manifest.get("synthetic",False)),"scope":"CANDIDATE_ASSAY_ONLY","trainingAllowed":False,
            "execution":execution,
            "durationMsPerStimulus":duration,"totalModeledMs":duration*6,"wallSeconds":time.perf_counter()-start,
            "populationIds":{name:[str(body) for body in graph.ids[cells]] for name,cells in populations.items()},
            "results":results,"gates":gates,"biologicalLearning":"UNKNOWN"}


def main():
    import argparse
    import json
    parser = argparse.ArgumentParser(description="Actual graph numerical sanity probe; does not pass biological gates")
    parser.add_argument("--graph", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--stimulus-type", default="L1")
    parser.add_argument("--nominated-count", type=int, default=16)
    parser.add_argument("--modeled-ms", type=float, default=20.)
    parser.add_argument("--backend", choices=("reference", "preallocated"), default="reference",
                        help="Numerically equivalent execution backend; reference remains the default")
    parser.add_argument("--vision")
    parser.add_argument("--decoder")
    parser.add_argument("--specification", help="Candidate-only visual assay; requires --vision and --decoder")
    args = parser.parse_args()
    if any((args.vision,args.decoder,args.specification)):
        if not all((args.vision,args.decoder,args.specification)):
            parser.error("Candidate assay requires --vision, --decoder, and --specification together")
        from pathlib import Path
        from .model import SparseGraph
        read = lambda path: json.loads(Path(path).read_text(encoding="utf-8"))
        report = visual_decoder_assay(SparseGraph.load(args.graph,args.manifest),read(args.vision),read(args.decoder),read(args.specification),backend=args.backend)
    else:
        report = full_graph_sanity(args.graph, args.manifest, stimulus_type=args.stimulus_type,
                                  nominated_count=args.nominated_count, modeled_ms=args.modeled_ms, backend=args.backend)
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
