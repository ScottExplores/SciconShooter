"""Frozen actual-anatomy graded engineering assay; never updates research gates."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import threading
import time

# Set before NumPy/BLAS import, including when invoked outside an activated venv.
for variable in ('OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
    os.environ[variable] = '2'
LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB / 'python'))
import numpy as np
from scicon_fly.model import SparseGraph


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def circuit_graph(document):
    neurons, edges = document['neurons'], document['internalEdges']
    if len(neurons) != 57 or [n['index'] for n in neurons] != list(range(57)):
        raise ValueError('Expected frozen 57-cell compact ordering')
    names = np.array([n['type'] for n in neurons])
    if {name: int(np.sum(names == name)) for name in np.unique(names)} != {'L2': 19, 'Tm1': 19, 'Tm2': 19}:
        raise ValueError('Unexpected populations')
    if any(n['somaSide'] != 'R' for n in neurons):
        raise ValueError('Expected nominated right-side circuit')
    ordered = sorted(edges, key=lambda e: (e['source'], e['target']))
    pairs = [(e['source'], e['target']) for e in ordered]
    if len(pairs) != len(set(pairs)):
        raise ValueError('Duplicate anatomical edge')
    if any(not 0 <= endpoint < 57 for pair in pairs for endpoint in pair):
        raise ValueError('Invalid edge endpoint')
    signs = [n['sourceSign'] for n in neurons]
    if any(e['sourceSign'] != signs[e['source']] for e in ordered):
        raise ValueError('Inconsistent source sign')
    counts = np.bincount([e['source'] for e in ordered], minlength=57)
    graph = SparseGraph([int(n['bodyId']) for n in neurons], np.r_[0, np.cumsum(counts)],
                        [e['target'] for e in ordered], [e['contacts'] for e in ordered], signs,
                        {'scope': 'reduced diagnostic', 'sourceProvenance': document['provenance']},
                        {'neuron_types': names})
    return graph, names


def make_stimuli(spec, dt_ms):
    s = spec['stimuli']
    def ticks(milliseconds):
        value = milliseconds / dt_ms
        if abs(value - round(value)) > 1e-8:
            raise ValueError('Stimulus boundary is not on a simulation tick')
        return round(value)
    def record(name, contrast, duration, group):
        start = ticks(s['initial_baseline_ms'])
        end = start + ticks(duration)
        values = np.zeros(end + ticks(s['recovery_ms']))
        values[start:end] = contrast
        return {'name': name, 'group': group, 'contrast': values, 'start': start, 'end': end}
    records = [record('baseline', 0, s['step_ms'], 'baseline')]
    for kind, duration in [('flash', s['flash_ms']), ('step', s['step_ms'])]:
        for contrast in s['development_contrasts']:
            records.append(record(kind + ('_OFF' if contrast < 0 else '_ON'), contrast, duration, 'development'))
    for index, contrast in enumerate(s['held_out_contrasts']):
        records.append(record(f'heldout_flash_{index}', contrast, s['flash_ms'], 'held_out_amplitude'))
    for seed in s['noise_seeds']:
        row = record(f'heldout_noise_{seed}', 0, s['noise_ms'], 'held_out_noise')
        bin_ticks = ticks(s['noise_bin_ms'])
        count = (row['end'] - row['start']) // bin_ticks
        if count * bin_ticks != row['end'] - row['start']:
            raise ValueError('Noise duration must contain complete bins')
        # Fixed binary contrasts with a declared independent NumPy PCG64 stream.
        noise = np.random.Generator(np.random.PCG64(seed)).choice([-s['noise_amplitude'], s['noise_amplitude']], count)
        row['contrast'][row['start']:row['end']] = np.repeat(noise, bin_ticks)
        records.append(row)
    return records


def population_summary(release, names, stimulus, dt_ms, baseline):
    result = {}
    for name in ['L2', 'Tm1', 'Tm2']:
        trace = release[:, names == name].mean(axis=1) - baseline
        start, end = stimulus['start'], stimulus['end']
        active = trace[start + 1:end + 1]
        max_index = int(np.argmax(active))
        hits = np.flatnonzero(active >= 1e-4)
        late = active[-max(1, round(100 / dt_ms)):]
        result[name] = {'maximumReleaseChange': float(active.max()), 'minimumReleaseChange': float(active.min()),
                        'positivePeakLatencyMs': float((max_index + 1) * dt_ms) if active.max() >= 1e-4 else None,
                        'positiveResponseOnsetMsAt1eMinus4': float((hits[0] + 1) * dt_ms) if len(hits) else None,
                        'last100msMeanReleaseChange': float(late.mean()),
                        'last100msToPositivePeakRatio': float(late.mean() / active.max()) if active.max() >= 1e-4 else None,
                        'recoveryEndReleaseChange': float(trace[-1])}
    return result


def simulate(graph, names, spec, stimulus, arm, dt_ms):
    from scicon_fly.graded import GradedModel, GradedParameters
    p = spec['parameters']
    sources = np.repeat(np.arange(graph.n), np.diff(graph.indptr))
    mask = np.ones(graph.e, dtype=bool)
    if arm == 'block_L2_output':
        mask[names[sources] == 'L2'] = False
    params = GradedParameters(dt_ms=dt_ms, tau_v_ms=np.array([p['tau_v_ms_by_type'][name] for name in names]),
                             tau_a_ms=p['tau_a_ms'], baseline_release=p['baseline_release'],
                             maximum_release=p['maximum_release'], adaptation_strength=p['adaptation_strength'])
    model = GradedModel(graph, params, edge_gains=p['gain_per_contact'], edge_mask=mask)
    count = len(stimulus['contrast'])
    v, a, release = (np.empty((count + 1, graph.n), dtype=np.float64) for _ in range(3))
    v[0], a[0], release[0] = model.v, model.a, model.release
    drive = np.zeros(graph.n)
    polarity = 1 if arm == 'reverse_input_polarity' else -1
    for index, contrast in enumerate(stimulus['contrast']):
        drive[names == 'L2'] = polarity * contrast
        state = model.advance(drive)
        v[index + 1], a[index + 1], release[index + 1] = state['v'], state['a'], state['release']
    finite = all(np.isfinite(array).all() for array in (v, a, release))
    bounded = bool(release.min() >= 0 and release.max() <= p['maximum_release'])
    return {'v': v, 'a': a, 'release': release, 'contrast': stimulus['contrast'],
            'time_ms': np.arange(count + 1) * dt_ms}, {
                'finite': bool(finite), 'releaseBounded': bounded,
                'maximumAbsoluteVoltageDeviation': float(np.max(np.abs(v))),
                'parameterHash': model.parameter_hash, 'connectionHash': model.connection_hash,
                'populations': population_summary(release, names, stimulus, dt_ms, p['baseline_release'])}


def compare_arrays(first, second):
    keys = ['v', 'a', 'release', 'contrast', 'time_ms']
    if any(first[key].shape != second[key].shape for key in keys):
        raise ValueError('Comparison shape mismatch')
    return {'bytesIdentical': all(first[key].dtype == second[key].dtype and first[key].tobytes() == second[key].tobytes() for key in keys),
            'maximumReleaseAbsoluteDifference': float(np.max(np.abs(first['release'] - second['release'])))}


def run(spec_path, freeze_path, output):
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    freeze = json.loads(freeze_path.read_text(encoding='utf-8'))
    if spec['scope'] != 'REDUCED_MALECNS_ENGINEERING_DIAGNOSTIC_NOT_BIOLOGICAL_VALIDATION' or spec['trainingAllowed'] is not False:
        raise ValueError('Only the declared reduced engineering scope is supported')
    if file_hash(spec_path) != freeze['specificationSha256']:
        raise ValueError('Frozen specification mismatch')
    expected_sources = [spec['anatomy'], 'scripts/graded-off-diagnostic.py', 'python/scicon_fly/graded.py', 'python/scicon_fly/model.py']
    if set(freeze.get('sourceHashes', {})) != set(expected_sources):
        raise ValueError('Freeze must bind circuit, runner and numerical sources')
    if any(file_hash(LAB / name) != freeze['sourceHashes'][name] for name in expected_sources):
        raise ValueError('Frozen source mismatch')
    if spec['threads'] != 2:
        raise ValueError('Runner is bounded to two numerical threads')
    if spec['arms'] != ['intact', 'sham', 'block_L2_output', 'reverse_input_polarity']:
        raise ValueError('All prespecified control arms are required in order')
    if len(make_stimuli(spec, spec['parameters']['dt_ms'])) != 11:
        raise ValueError('All eleven frozen stimuli are required')
    if not 0 < spec['maximumWallSeconds'] <= 2700 or not 0 < spec['maximumRssBytes'] <= 4 * 1024 ** 3:
        raise ValueError('Resource budget exceeds authorized bounds')
    import psutil
    process = psutil.Process()
    circuit_path = LAB / spec['anatomy']
    circuit = json.loads(circuit_path.read_text(encoding='utf-8'))
    graph, names = circuit_graph(circuit)
    source_paths = [spec_path, freeze_path, circuit_path, Path(__file__), LAB / 'python/scicon_fly/graded.py', LAB / 'python/scicon_fly/model.py']
    source_hashes = {str(path.relative_to(LAB)): file_hash(path) for path in source_paths}
    output.mkdir(parents=True, exist_ok=False)
    started = datetime.now(timezone.utc).isoformat()
    begin, stop = time.monotonic(), threading.Event()
    resource = {'peakSampledRssBytes': process.memory_info().rss, 'sampleIntervalSeconds': 0.1}
    write_json(output / 'status.json', {'status': 'running', 'startedAt': started, 'pid': os.getpid()})
    for label, value in [('specification', spec), ('protocol-freeze', freeze), ('circuit', circuit)]:
        write_json(output / (label + '.json'), value)
    # Preserve exact source bytes as well as the parsed artifact values.
    source_dir = output / 'source'; source_dir.mkdir()
    for index, path in enumerate(source_paths):
        (source_dir / f'{index}-{path.name}').write_bytes(path.read_bytes())
    def watchdog():
        try:
            while not stop.wait(resource['sampleIntervalSeconds']):
                resource['peakSampledRssBytes'] = max(resource['peakSampledRssBytes'], process.memory_info().rss)
                if resource['peakSampledRssBytes'] > spec['maximumRssBytes'] or time.monotonic() - begin > spec['maximumWallSeconds']:
                    write_json(output / 'status.json', {'status': 'interrupted_resource_limit', 'resource': resource})
                    os._exit(70)
        except BaseException as exc:
            write_json(output / 'status.json', {'status': 'interrupted_watchdog_failure', 'message': str(exc)})
            os._exit(71)
    watcher = threading.Thread(target=watchdog, daemon=True); watcher.start()
    try:
        rows, comparisons = [], []
        dt = spec['parameters']['dt_ms']
        criteria = spec['engineering_criteria']
        checks = {'baselineStable': True, 'finiteBounded': True, 'heldOutFiniteBounded': True,
                  'shamBytesIdentical': True, 'blockedDownstreamQuiescent': True, 'offTransmission': True}
        for stimulus in make_stimuli(spec, dt):
            original = None
            for arm in spec['arms']:
                arrays, summary = simulate(graph, names, spec, stimulus, arm, dt)
                trial = stimulus['name'] + '__' + arm
                np.savez_compressed(output / (trial + '.npz'), **arrays)
                rows.append({'trial': trial, 'stimulusGroup': stimulus['group'], 'arm': arm, **summary})
                checks['finiteBounded'] &= summary['finite'] and summary['releaseBounded']
                if stimulus['group'].startswith('held_out'):
                    checks['heldOutFiniteBounded'] &= summary['finite'] and summary['releaseBounded']
                if stimulus['name'] == 'baseline':
                    checks['baselineStable'] &= summary['maximumAbsoluteVoltageDeviation'] <= criteria['baseline_maximum_absolute_deviation']
                if arm == 'intact':
                    original = arrays
                    if stimulus['name'] in ['flash_OFF', 'step_OFF']:
                        checks['offTransmission'] &= all(summary['populations'][name]['maximumReleaseChange'] >= criteria['minimum_downstream_off_peak_release_change'] for name in ['Tm1', 'Tm2'])
                elif arm == 'sham':
                    comparison = compare_arrays(original, arrays)
                    comparisons.append({'stimulus': stimulus['name'], 'kind': 'sham', **comparison})
                    checks['shamBytesIdentical'] &= comparison['bytesIdentical']
                elif arm == 'block_L2_output':
                    value = float(np.max(np.abs(arrays['release'][:, names != 'L2'] - spec['parameters']['baseline_release'])))
                    comparisons.append({'stimulus': stimulus['name'], 'kind': 'block_L2_output', 'maximumDownstreamDeviation': value})
                    checks['blockedDownstreamQuiescent'] &= value <= criteria['maximum_blocked_downstream_deviation']
                print(json.dumps({'completed': trial, 'elapsedSeconds': round(time.monotonic() - begin, 2)}), flush=True)
        fine_dt = spec['convergence']['fine_dt_ms']
        ratio = dt / fine_dt
        if ratio != int(ratio) or ratio <= 1:
            raise ValueError('Fine timestep must divide the original timestep')
        fine_stimulus = next(row for row in make_stimuli(spec, fine_dt) if row['name'] == spec['convergence']['stimulus'])
        fine, fine_summary = simulate(graph, names, spec, fine_stimulus, 'intact', fine_dt)
        convergence_name = spec['convergence']['stimulus']
        np.savez_compressed(output / (convergence_name + '__fine_dt.npz'), **fine)
        with np.load(output / (convergence_name + '__intact.npz'), allow_pickle=False) as coarse:
            error = float(np.max(np.abs(coarse['release'] - fine['release'][::int(ratio)])))
        checks['timestepConverged'] = error <= spec['convergence']['maximum_release_absolute_error']
        checks['sourceBytesUnchanged'] = all(file_hash(LAB / name) == digest for name, digest in source_hashes.items())
        checks = {key: bool(value) for key, value in checks.items()}
        stop.set(); watcher.join(timeout=1)
        write_json(output / 'results.json', {'evidenceStatus': 'REDUCED_ENGINEERING_CHECKS_ONLY',
                    'engineeringChecksPass': all(checks.values()), 'biologicalValidation': False,
                    'learningTested': False, 'checks': checks, 'trials': rows, 'comparisons': comparisons,
                    'convergence': {'maximumReleaseAbsoluteError': error, 'fineDtMs': fine_dt, 'summary': fine_summary},
                    'interpretation': spec['interpretation']})
        write_json(output / 'metadata.json', {'startedAt': started, 'completedAt': datetime.now(timezone.utc).isoformat(),
                    'elapsedSeconds': time.monotonic() - begin, 'resource': resource, 'sourceHashes': source_hashes,
                    'graphIdentity': graph.identity, 'pythonVersion': sys.version, 'numpyVersion': np.__version__,
                    'trialCount': len(rows) + 1, 'simulatedTimeMeaning': 'Independent stimulus trials each reset to the assumed adapted baseline'})
        write_json(output / 'status.json', {'status': 'complete', 'engineeringChecksPass': all(checks.values()), 'trainingOccurred': False})
        checksums = {str(path.relative_to(output)).replace('\\', '/'): file_hash(path) for path in sorted(output.rglob('*')) if path.is_file()}
        write_json(output / 'checksums.json', checksums)
        return 0 if all(checks.values()) else 2
    except BaseException as exc:
        write_json(output / 'status.json', {'status': 'failed', 'exceptionType': type(exc).__name__, 'message': str(exc)})
        raise
    finally:
        stop.set(); watcher.join(timeout=1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--specification', type=Path, default=LAB / 'configs/candidates/graded-off-diagnostic-v1.json')
    parser.add_argument('--freeze', type=Path, default=LAB / 'docs/evidence/graded-off-diagnostic-v1-protocol-freeze.json')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raise SystemExit(run(args.specification.resolve(), args.freeze.resolve(), args.output.resolve()))
