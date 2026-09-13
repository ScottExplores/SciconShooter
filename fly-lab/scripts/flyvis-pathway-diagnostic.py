"""Frozen, post-reference output-lesion diagnostic of the official FlyVis model."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import threading
import time
import numpy as np

LAB_ROOT = Path(__file__).resolve().parents[1]


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def outgoing_targets(node_types, sources, nominated):
    """Select outgoing edges by exact source node type, never target type."""
    names, sources = np.asarray(node_types).astype('U'), np.asarray(sources)
    if sources.ndim != 1 or not np.issubdtype(sources.dtype, np.integer):
        raise ValueError('One integer source index per edge is required')
    if sources.size == 0 or sources.min() < 0 or sources.max() >= len(names):
        raise ValueError('Source index is outside the graph')
    if not nominated or len(set(nominated)) != len(nominated):
        raise ValueError('Nominated presynaptic types must be unique and nonempty')
    populations = {name: np.flatnonzero(names == name) for name in nominated}
    if any(len(indices) == 0 for indices in populations.values()):
        raise ValueError('Every nominated presynaptic type must exist')
    selected = np.isin(names[sources], nominated)
    if not selected.any():
        raise ValueError('The intervention selects no outgoing connections')
    return selected, populations


def activity_summary(activity):
    values = np.asarray(activity)
    if values.size == 0 or not np.isfinite(values).all():
        raise ValueError('Finite nonempty activity is required')
    release = np.maximum(values, 0)
    return {'gradedMinimum': float(values.min()), 'gradedMaximum': float(values.max()),
            'gradedNonzeroFraction': float(np.count_nonzero(values) / values.size),
            'releaseMinimum': float(release.min()), 'releaseMaximum': float(release.max()),
            'releaseNonzeroFraction': float(np.count_nonzero(release) / release.size),
            'neuronsWithAnyPositiveRelease': int(np.count_nonzero(np.any(release > 0, axis=0))),
            'neuronCount': int(values.shape[-1]), 'frameCount': int(values.shape[0])}


def difference_summary(original, other, threshold):
    if original.shape != other.shape or not np.isfinite(original).all() or not np.isfinite(other).all():
        raise ValueError('Comparison requires matching finite full-network arrays')
    delta = np.abs(other - original)
    position = np.unravel_index(int(delta.argmax()), delta.shape)
    return {'maximumAbsoluteDifference': float(delta.max()), 'bitIdentical': bool(np.array_equal(original, other)),
            'entriesAboveThreshold': int(np.count_nonzero(delta > threshold)),
            'maximumDifferenceFrame': int(position[0]), 'maximumDifferenceNeuron': int(position[1])}


def select_stimuli(reference, specification):
    checksums = json.loads((reference / 'checksums.json').read_text(encoding='utf-8'))
    selected = []
    for criterion in specification['stimuli']:
        candidates = []
        for path in sorted(reference.glob(criterion['family'] + '-*.json')):
            if file_hash(path) != checksums.get(path.name):
                raise ValueError('Reference stimulus metadata hash mismatch')
            row = json.loads(path.read_text(encoding='utf-8'))
            if all(row.get(key) == value for key, value in criterion.items() if key != 'family'):
                candidates.append(path)
        if len(candidates) != 1:
            raise ValueError('Each fixed stimulus criterion must select exactly one recorded trial')
        path = candidates[0].with_suffix('.npz')
        if file_hash(path) != checksums.get(path.name):
            raise ValueError('Reference stimulus/response array hash mismatch')
        selected.append(path)
    if len(set(selected)) != len(selected):
        raise ValueError('Diagnostic stimulus choices must be distinct')
    return selected


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--specification', type=Path, default=LAB_ROOT / 'configs/candidates/flyvis-pathway-diagnostic-v1.json')
    args = parser.parse_args(argv)
    data_root, output, spec_path = args.data_root.resolve(), args.output.resolve(), args.specification.resolve()
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    if spec['trainingAllowed'] is not False or spec['scope'] != 'POST_REFERENCE_CAUSAL_DIAGNOSTIC_NOT_MALECNS_VALIDATION':
        raise ValueError('Only the separate causal diagnostic scope is allowed')
    reference = LAB_ROOT / spec['referenceDirectory']
    for name, key in [('metadata.json', 'referenceMetadataSha256'), ('results.json', 'referenceResultsSha256')]:
        if file_hash(reference / name) != spec[key]:
            raise ValueError('Frozen reference identity mismatch')
    helper_path = LAB_ROOT / 'scripts/flyvis-reference.py'
    if file_hash(helper_path) != spec['referenceScriptSha256']:
        raise ValueError('Frozen reference helper changed')
    module_spec = importlib.util.spec_from_file_location('frozen_flyvis_reference', helper_path)
    helper = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(helper)
    reference_spec = json.loads((reference / 'specification.json').read_text(encoding='utf-8'))
    helper.verify_pretrained(data_root, reference_spec)
    selected_inputs = select_stimuli(reference, spec)
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'specification.json', spec)
    script_hash, spec_hash, start = file_hash(__file__), file_hash(spec_path), time.monotonic()
    os.environ.update(PYTHON_DOTENV_DISABLED='1', MPLBACKEND='Agg', FLYVIS_ROOT_DIR=str(data_root),
                      CUDA_VISIBLE_DEVICES='', OMP_NUM_THREADS=str(spec['threads']), MKL_NUM_THREADS=str(spec['threads']))
    os.chdir(data_root)
    stop = threading.Event()
    def watchdog():
        import psutil
        process = psutil.Process()
        while not stop.wait(.1):
            elapsed, rss = time.monotonic() - start, process.memory_info().rss
            if elapsed > spec['maximumWallSeconds'] or rss > spec['maximumRssBytes']:
                write_json(output / 'interrupted.json', {'status': 'NOT_RUN', 'trainingAllowed': False,
                           'reason': 'Diagnostic resource budget exceeded', 'elapsedSeconds': elapsed, 'rssBytes': rss})
                os._exit(125)
    threading.Thread(target=watchdog, daemon=True).start()
    try:
        import torch
        torch.set_num_threads(spec['threads']); torch.set_num_interop_threads(1)
        torch.use_deterministic_algorithms(True)
        import flyvis
        from flyvis import NetworkView
        if importlib.metadata.version('flyvis') != reference_spec['packageVersion'] or str(flyvis.device) != 'cpu':
            raise ValueError('Reference package/device identity mismatch')
        helper.install_windows_hdf5_writer()
        def recover(network, checkpoint):
            network.load_state_dict(torch.load(checkpoint, weights_only=True, map_location='cpu')['network'], strict=True)
            return network
        view = NetworkView(data_root / reference_spec['model'], recover_fn=recover)
        network = view.init_network(); network.eval()
        for parameter in network.parameters():
            parameter.requires_grad_(False)
        if type(network.dynamics).__name__ != 'PPNeuronIGRSynapses' or not isinstance(network.dynamics.activation, torch.nn.ReLU):
            raise ValueError('Diagnostic requires the recorded graded/ReLU dynamics')
        initial_parameters = {name: value.detach().clone() for name, value in network.state_dict().items()}
        node_types = np.asarray(network.connectome.nodes.type[:]).astype('U')
        sources = np.asarray(network.connectome.edges.source_index[:])
        outgoing, populations = outgoing_targets(node_types, sources, spec['lesionPresynapticTypes'])
        source_types = np.asarray(network.connectome.edges.source_type[:]).astype('U')
        if not np.array_equal(source_types, node_types[sources]):
            raise ValueError('Source type and node-index annotations disagree')
        selected_edges = np.flatnonzero(outgoing)
        central = np.asarray(network.connectome.central_cells_index[:], dtype=np.int64)
        central_names = node_types[central]
        targets = [name for name in central_names if name.startswith(('T4', 'T5'))]
        target_indices = np.asarray([central[list(central_names).index(name)] for name in targets])
        np.savez_compressed(output / 'intervention-targets.npz', outgoingEdgeIndices=selected_edges,
                            sourceNodeIndices=sources[selected_edges], allNodeTypes=node_types,
                            **{name + 'NodeIndices': ids for name, ids in populations.items()})
        official_hook = network.dynamics.write_derived_params
        lesion_tensor = torch.as_tensor(outgoing)
        ones = torch.ones(len(sources), dtype=torch.float32)
        records = []
        dt = reference_spec['dtSeconds']
        for input_path in selected_inputs:
            with np.load(input_path, allow_pickle=False) as saved:
                stimulus = saved['stimulus'].copy()
                previous_response, previous_indices = saved['response'].copy(), saved['nodeIndices'].copy()
            if stimulus.ndim != 2 or stimulus.shape[1] != 721 or stimulus.dtype != np.float32 or not np.isfinite(stimulus).all():
                raise ValueError('Only exact finite saved float32 stimuli are allowed')
            if not np.array_equal(previous_indices, central):
                raise ValueError('Reference central-cell identity changed')
            np.savez_compressed(output / (input_path.stem + '-input.npz'), stimulus=stimulus)
            baseline = None
            for arm in spec['arms']:
                audits = []
                mask = ones.clone()
                if arm == 'block-L1-L2-output':
                    mask[lesion_tensor] = 0
                def wrapped_hook(params, **kwargs):
                    official_hook(params, **kwargs)
                    before = params.edges.weight
                    after = before * mask
                    if not torch.equal(after[~lesion_tensor], before[~lesion_tensor]):
                        raise ValueError('Intervention changed a nontarget connection')
                    if arm == 'sham' and not torch.equal(before, after):
                        raise ValueError('Sham changed a connection')
                    if arm == 'block-L1-L2-output' and torch.count_nonzero(after[lesion_tensor]).item() != 0:
                        raise ValueError('Declared outputs were not blocked')
                    audits.append({'targetedEdges': int(len(selected_edges)),
                                   'targetedPreviouslyNonzeroWeights': int(torch.count_nonzero(before[lesion_tensor]).item()),
                                   'changedWeightCount': int(torch.count_nonzero(after != before).item()),
                                   'nontargetWeightsUnchanged': True})
                    params.edges.weight = after
                network.dynamics.write_derived_params = official_hook if arm == 'original' else wrapped_hook
                with torch.inference_mode():
                    initial = network.steady_state(reference_spec['initialGraySeconds'], dt, batch_size=1, value=.5)
                    activity = network.simulate(torch.from_numpy(stimulus)[None, :, None, :], dt, initial_state=initial)
                    response = activity[0].detach().cpu().numpy().copy()
                if not np.isfinite(response).all():
                    raise ValueError('Diagnostic produced nonfinite activity')
                if not all(torch.equal(initial_parameters[name], value) for name, value in network.state_dict().items()):
                    raise ValueError('Stored model parameters changed')
                if arm != 'original' and len(audits) != 2:
                    raise ValueError('Expected intervention during both initialization and stimulus forward passes')
                if baseline is None:
                    baseline = response
                whole = difference_summary(baseline, response, spec['differenceThreshold'])
                central_diff = difference_summary(previous_response, response[:, central], spec['differenceThreshold'])
                row = {'input': input_path.stem, 'arm': arm, 'inputArchiveSha256': file_hash(input_path),
                       'elapsedSeconds': time.monotonic() - start, 'finite': True, 'parametersUnchanged': True,
                       'fullPopulation': {name: activity_summary(response[:, ids]) for name, ids in populations.items()},
                       'wholeNetworkVsOriginal': whole, 'centralVsPriorReference': central_diff, 'hookAudits': audits}
                np.savez_compressed(output / (input_path.stem + '-' + arm + '.npz'), wholeNetworkActivity=response,
                                    centralMotionActivity=response[:, target_indices], centralMotionNodeIndices=target_indices,
                                    centralMotionTypes=np.asarray(targets, dtype='U'), timeSeconds=np.arange(len(stimulus)) * dt,
                                    **{name + 'Activity': response[:, ids] for name, ids in populations.items()})
                write_json(output / (input_path.stem + '-' + arm + '.json'), row)
                records.append(row)
                print(json.dumps({'input': input_path.stem, 'arm': arm, 'seconds': round(row['elapsedSeconds'], 2),
                                  'maximumNetworkDifference': whole['maximumAbsoluteDifference']}), flush=True)
            network.dynamics.write_derived_params = official_hook
        sham_ok = all(row['wholeNetworkVsOriginal']['bitIdentical'] for row in records if row['arm'] == 'sham')
        reference_ok = all(row['centralVsPriorReference']['bitIdentical'] for row in records if row['arm'] == 'original')
        immutable = file_hash(__file__) == script_hash and file_hash(spec_path) == spec_hash and file_hash(helper_path) == spec['referenceScriptSha256']
        if not (sham_ok and reference_ok and immutable):
            raise ValueError('Diagnostic integrity checks failed')
        effects = [row for row in records if row['arm'] == 'block-L1-L2-output']
        result = {'status': 'COMPLETE', 'scope': spec['scope'], 'trainingAllowed': False,
                  'createdAt': datetime.now(timezone.utc).isoformat(), 'seconds': time.monotonic() - start,
                  'scriptSha256': script_hash, 'specificationSha256': spec_hash,
                  'referenceMetadataSha256': spec['referenceMetadataSha256'],
                  'checkpointSha256': file_hash(view.get_checkpoint('best')),
                  'nodeCount': len(node_types), 'edgeCount': len(sources), 'targetedEdgeCount': len(selected_edges),
                  'populationCounts': {name: len(ids) for name, ids in populations.items()},
                  'validity': {'originalMatchesSavedReference': reference_ok, 'shamBitIdentical': sham_ok,
                               'storedParametersUnchanged': True, 'sourceFilesUnchanged': immutable},
                  'effectDetectedAboveThreshold': any(row['wholeNetworkVsOriginal']['maximumAbsoluteDifference'] > spec['differenceThreshold'] for row in effects),
                  'maximumLesionDifference': max(row['wholeNetworkVsOriginal']['maximumAbsoluteDifference'] for row in effects),
                  'interpretation': spec['interpretation'], 'records': records}
        write_json(output / 'results.json', result)
        lines = ['# FlyVis L1/L2 pathway diagnostic', '', 'Post-reference causal diagnostic; no MaleCNS validation or training authorization.', '',
                 'Blocked only outgoing L1/L2 transmission, including during fresh gray initialization. Node parameters and equations remained unchanged.', '',
                 '| Input | Maximum full-network lesion difference | L1 positive release fraction (original) | L2 positive release fraction (original) |',
                 '|---|---:|---:|---:|']
        for path in selected_inputs:
            original = next(row for row in records if row['input'] == path.stem and row['arm'] == 'original')
            lesion = next(row for row in effects if row['input'] == path.stem)
            lines.append('| ' + path.stem + ' | ' + str(lesion['wholeNetworkVsOriginal']['maximumAbsoluteDifference']) + ' | '
                         + str(original['fullPopulation']['L1']['releaseNonzeroFraction']) + ' | '
                         + str(original['fullPopulation']['L2']['releaseNonzeroFraction']) + ' |')
        lines += ['', 'All original central responses matched the saved reference bit-for-bit. Every sham matched its original full-network response bit-for-bit. '
                  'Full-network activity arrays, target identities, population activity/release summaries and hook audits are saved.', '', spec['interpretation'], '',
                  '[Official dynamics hook](' + spec['source'] + ')']
        (output / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
        write_json(output / 'checksums.json', {p.name: file_hash(p) for p in sorted(output.iterdir()) if p.is_file()})
        print(json.dumps({'status': 'COMPLETE', 'output': str(output), 'maximumLesionDifference': result['maximumLesionDifference']}), flush=True)
        return 0
    except Exception as error:
        write_json(output / 'interrupted.json', {'status': 'NOT_RUN', 'trainingAllowed': False,
                   'reason': type(error).__name__ + ': ' + str(error), 'seconds': time.monotonic() - start})
        raise
    finally:
        stop.set()


if __name__ == '__main__':
    raise SystemExit(main())
