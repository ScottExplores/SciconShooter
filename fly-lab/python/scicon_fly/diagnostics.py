"""Read-only sparse connectivity diagnosis for an already frozen sensory screen.

This measures anatomical paths and a sufficient quiescent-LIF failure condition.
It does not simulate gameplay, tune parameters, fit mappings, or promote gates.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import asdict
import json
from pathlib import Path
import platform
import sys
import time

import numpy as np
import psutil
import scipy
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from .decoder import FixedDecoder
from .model import LIFParameters, SparseGraph, canonical_hash, file_hash
from .vision import VisualTransducer

MODES = {
    'anatomical': 'Every positive-contact directed edge; transmitter effects ignored',
    'fast_nonzero': 'Edges with nonzero presynaptic modeled fast sign; inhibition retained as influence, never treated as excitation',
    'excitatory_only': 'Only positive presynaptic modeled fast signs; a restricted structural diagnostic, not a complete dynamics model',
}


def adjacency(graph, mode):
    if mode not in MODES:
        raise ValueError('Unknown edge mode')
    row_mask = np.ones(graph.n, dtype=bool) if mode == 'anatomical' else graph.signs != 0 if mode == 'fast_nonzero' else graph.signs > 0
    degrees = np.diff(graph.indptr)
    if row_mask.all():
        indices, indptr = graph.indices, graph.indptr
    else:
        keep = np.repeat(row_mask, degrees)
        indices = graph.indices[keep]
        indptr = np.r_[0, np.cumsum(degrees * row_mask)]
    # Sparse values are unit path lengths, not signed physiological weights.
    return csr_matrix((np.ones(len(indices)), indices, indptr), shape=(graph.n, graph.n))


def shortest_paths(matrix, sources):
    sources = np.unique(np.asarray(sources, dtype=np.int32))
    if len(sources) and (sources.min() < 0 or sources.max() >= matrix.shape[0]):
        raise ValueError('Source index outside graph')
    if not len(sources):
        return np.full(matrix.shape[0], np.inf), np.full(matrix.shape[0], -9999, dtype=np.int32)
    distances, predecessors, _ = dijkstra(matrix, directed=True, indices=sources,
                                         min_only=True, unweighted=True, return_predecessors=True)
    return distances, predecessors


def path_example(graph, predecessors, target, hop_count):
    indices = [int(target)]
    for _ in range(int(hop_count)):
        previous = int(predecessors[indices[-1]])
        if previous < 0:
            raise ValueError('Broken shortest-path predecessor chain')
        indices.append(previous)
    indices.reverse()
    types = graph.annotations.get('neuron_types', np.full(graph.n, ''))
    edges = []
    for source, target in zip(indices, indices[1:]):
        edge = graph.edge_index(int(graph.ids[source]), int(graph.ids[target]))
        edges.append({'pre': str(graph.ids[source]), 'post': str(graph.ids[target]),
                      'contacts': int(graph.contacts[edge]), 'modeledPresynapticSign': int(graph.signs[source])})
    return {'neuronIds': [str(graph.ids[i]) for i in indices],
            'types': [str(types[i]) for i in indices], 'edges': edges}


def reachability_summary(graph, distances, predecessors, targets, parameters, horizon_ms):
    targets = np.unique(np.asarray(targets, dtype=np.int64))
    finite = targets[np.isfinite(distances[targets])]
    histogram = Counter(int(v) for v in distances[finite])
    ordered = sorted(finite.tolist(), key=lambda i: (distances[i], int(graph.ids[i])))
    minimum = int(distances[finite].min()) if len(finite) else None
    maximum = int(distances[finite].max()) if len(finite) else None
    return {
        'targetCount': len(targets), 'reachable': len(finite), 'unreachable': len(targets) - len(finite),
        'minimumHops': minimum, 'maximumShortestHops': maximum,
        'shortestHopHistogram': {str(k): v for k, v in sorted(histogram.items())},
        'delayOnlyMinimumMs': minimum * parameters.delay_ms if minimum is not None else None,
        'scheduleOnlyMinimumMs': minimum * (parameters.delay_ms + parameters.dt_ms) if minimum is not None else None,
        'withinDelayOnlyHorizon': int(np.count_nonzero(distances[finite] * parameters.delay_ms <= horizon_ms)),
        'unreachableIds': [str(graph.ids[i]) for i in targets if not np.isfinite(distances[i])],
        'examples': [path_example(graph, predecessors, i, distances[i]) for i in ordered[:3]],
    }


def direct_contacts(graph, sources, targets):
    lookup = np.zeros(graph.n, dtype=bool); lookup[np.asarray(targets, dtype=np.int64)] = True
    reached = np.zeros(graph.n, dtype=bool)
    edges = 0; contacts = 0; source_count = 0
    for source in np.unique(sources):
        lo, hi = graph.indptr[source:source + 2]
        outgoing = graph.indices[lo:hi]
        selected = lookup[outgoing]
        edges += int(selected.sum()); contacts += int(graph.contacts[lo:hi][selected].sum())
        source_count += int(selected.any()); reached[outgoing[selected]] = True
    return {'directedPairs': edges, 'contacts': contacts, 'contributingSources': source_count,
            'reachedTargets': int(reached.sum())}


def input_boundary(graph, sources):
    sources = np.unique(sources)
    outgoing = np.concatenate([np.arange(graph.indptr[i], graph.indptr[i + 1]) for i in sources])
    targets = graph.indices[outgoing]
    types = graph.annotations.get('neuron_types', np.full(graph.n, ''))
    nt = graph.annotations.get('neurotransmitters', np.full(graph.n, 'unknown'))
    type_contacts = Counter()
    for target, count in zip(targets, graph.contacts[outgoing]):
        type_contacts[str(types[target])] += int(count)
    return {'drivenNeurons': len(sources),
            'sourceTypes': dict(Counter(str(v) for v in types[sources])),
            'sourceNeurotransmitters': dict(Counter(str(v) for v in nt[sources])),
            'sourceModeledSigns': dict(Counter(str(int(v)) for v in graph.signs[sources])),
            'outgoingDirectedPairs': len(outgoing), 'outgoingContacts': int(graph.contacts[outgoing].sum()),
            'uniqueDirectTargets': len(np.unique(targets)),
            'targetModeledSigns': dict(Counter(str(int(v)) for v in graph.signs[np.unique(targets)])),
            'topTargetTypesByContacts': [{'type': name, 'contacts': count} for name, count in type_contacts.most_common(15)]}


def quiescent_barrier(graph, sources, parameters):
    """Sufficient invariant, conditional on reset/zero external undriven current.

    This is not an assertion that excitatory-only reachability captures inhibition
    or disinhibition in generally active networks.
    """
    sources = np.unique(sources)
    return {'sufficientBarrierPresent': bool(len(sources) and np.all(graph.signs[sources] <= 0)
                                            and parameters.threshold_mv > max(parameters.rest_mv, parameters.reset_mv)),
            'conditions': ['Every directly driven neuron has nonpositive outgoing fast weights',
                           'All other neurons begin at rest with zero synaptic current and empty delay queues',
                           'No external/tonic current reaches undriven neurons; efficacy is nonnegative',
                           'Threshold exceeds rest/reset; current-based LIF has no rebound or graded transmission'],
            'implication': 'Under these conditions, undriven membrane potentials cannot exceed rest: nonpositive input cannot initiate downstream spikes. More simulated time alone cannot remove this barrier.',
            'scope': 'This model configuration only; not a claim about inhibitory circuits or living fly vision'}


def diagnose(graph, vision, decoder, specification, screen, *, parameters=None):
    parameters = parameters or LIFParameters()
    transducer = VisualTransducer(graph, vision, assay_only=True)
    readout = FixedDecoder(graph, decoder, assay_only=True)
    expected = {'graph': graph.identity, 'dynamics': canonical_hash(asdict(parameters)),
                'vision': transducer.identity, 'decoder': readout.identity,
                'assaySpecification': canonical_hash(specification)}
    if specification.get('graphHash') != graph.identity or screen.get('identity') != expected:
        raise ValueError('Frozen screen identity does not match graph, parameters, or candidate manifests')
    sources = transducer.neurons[transducer.gain > 0]
    if not len(sources):
        raise ValueError('Candidate has no positive-gain input samples')
    populations = {name: np.array([graph.neuron_index(body) for body in ids], dtype=np.int64)
                   for name, ids in screen['populationIds'].items()}
    for name, declaration in specification['populations'].items():
        nominated = {graph.neuron_index(body) for body in declaration.get('neuronIds', [])}
        for cell_type in declaration.get('neuronTypes', []):
            nominated.update(np.flatnonzero(graph.annotations['neuron_types'] == cell_type).tolist())
        if nominated != set(populations.get(name, [])):
            raise ValueError('Frozen population IDs do not match their original nomination')
    kcs, mbons = populations['visual_kc'], populations['MBON']
    decoder_cells = np.flatnonzero(np.any(readout.weights != 0, axis=0))
    horizon = float(specification['durationMs'])
    routes = {}
    for mode in MODES:
        started = time.perf_counter(); matrix = adjacency(graph, mode)
        distance, predecessor = shortest_paths(matrix, sources)
        stage = {'retainedEdges': int(matrix.nnz), 'reachableNetworkNeurons': int(np.isfinite(distance).sum()),
                 'inputToVisualKCs': reachability_summary(graph, distance, predecessor, kcs, parameters, horizon),
                 'inputToMBONs': reachability_summary(graph, distance, predecessor, mbons, parameters, horizon),
                 'inputToDecoder': reachability_summary(graph, distance, predecessor, decoder_cells, parameters, horizon)}
        reachable_kcs = kcs[np.isfinite(distance[kcs])]
        kc_distance, kc_predecessor = shortest_paths(matrix, reachable_kcs)
        stage['reachableVisualKCsToMBONs'] = reachability_summary(graph, kc_distance, kc_predecessor, mbons, parameters, horizon)
        reachable_mbons = mbons[np.isfinite(kc_distance[mbons])]
        mbon_distance, mbon_predecessor = shortest_paths(matrix, reachable_mbons)
        stage['reachableMBONsToDecoder'] = reachability_summary(graph, mbon_distance, mbon_predecessor, decoder_cells, parameters, horizon)
        stage['orderedWaypointChainExists'] = bool(np.isfinite(mbon_distance[decoder_cells]).any())
        stage['wallSeconds'] = time.perf_counter() - started
        routes[mode] = stage
        del matrix
    observed = {name: {'networkSpikes': result['spikes'], 'L1Spikes': result['metrics']['L1']['spikes'],
                       'visualKCSpikes': result['metrics']['visual_kc']['spikes'], 'MBONSpikes': result['metrics']['MBON']['spikes'],
                       'firstL1ResponseBinEndMs': result['metrics']['L1']['firstResponseBinEndMs']}
                for name, result in screen['results'].items()}
    return {'schemaVersion': 1, 'scope': 'POST_SCREEN_CONNECTIVITY_DIAGNOSTIC_NOT_A_FIT',
            'synthetic': bool(graph.manifest.get('synthetic', False)), 'trainingAllowed': False,
            'identity': expected, 'parameters': asdict(parameters), 'neurons': graph.n, 'directedPairs': graph.e,
            'contacts': int(graph.contacts.sum()), 'candidateDurationMs': horizon,
            'inputBoundary': input_boundary(graph, sources),
            'populationCounts': {name: len(cells) for name, cells in populations.items()},
            'decoder': {'uniqueEffectiveCells': len(decoder_cells), 'cellsAlsoInMBONPopulation': len(set(decoder_cells) & set(mbons)),
                        'channels': {name: {'nonzeroCells': int(np.count_nonzero(readout.weights[i])),
                                            'negativeTerms': int(np.count_nonzero(readout.weights[i] < 0)),
                                            'positiveTerms': int(np.count_nonzero(readout.weights[i] > 0)),
                                            'thresholdHz': float(readout.threshold[i])} for i, name in enumerate(('x', 'y', 'fire'))},
                        'filterMs': readout.tau_ms,
                        'interpretation': decoder.get('interpretation'),
                        'MBONToReadoutIsZeroHopSoftwareBoundary': bool(set(decoder_cells) <= set(mbons))},
            'directContacts': {'inputsToVisualKCs': direct_contacts(graph, sources, kcs),
                               'visualKCsToMBONs': direct_contacts(graph, kcs, mbons)},
            'edgeModeDefinitions': MODES, 'routes': routes,
            'quiescentBarrier': quiescent_barrier(graph, sources, parameters),
            'observedFrozenScreen': observed,
            'interpretationLimits': ['Reachability is not response, causality, cue coding, learning, or validation of a visual/effector map.',
                'Paths may traverse arbitrary recurrent routes and mixed neuronal classes; these are not canonical visual pathways.',
                'Hop-based delay bounds ignore integration, inhibition, filtering and source first-spike latency.',
                'Stage-wise hop minima are not added to claim one global shortest waypoint-constrained route.',
                'No candidate gain, transmitter sign, threshold, wiring, decoder, assay criterion, or gate was changed.']}


def markdown(report):
    boundary = report['inputBoundary']
    lines = ['# Frozen MaleCNS sensory-boundary diagnosis', '',
             'Post-screen diagnostic only. No parameters were fitted and no biological gate was passed.', '',
             f"The graph has {report['neurons']:,} retained neurons, {report['directedPairs']:,} directed pairs and {report['contacts']:,} contacts.",
             f"The candidate directly drives {boundary['drivenNeurons']:,} cells: {boundary['sourceTypes']}; modeled fast signs {boundary['sourceModeledSigns']}.", '',
             '| Edge policy | Input → visual KCs | Input → MBONs | Input → decoder | Ordered KC/MBON route |',
             '|---|---:|---:|---:|---|']
    for mode, row in report['routes'].items():
        def cell(key):
            item = row[key]
            return f"{item['reachable']}/{item['targetCount']} ({item['minimumHops']}–{item['maximumShortestHops']} hops)" if item['reachable'] else f"0/{item['targetCount']}"
        lines.append(f"| {mode} | {cell('inputToVisualKCs')} | {cell('inputToMBONs')} | {cell('inputToDecoder')} | {row['orderedWaypointChainExists']} |")
    no_downstream = all(row['visualKCSpikes'] == row['MBONSpikes'] == 0 for row in report['observedFrozenScreen'].values())
    software_boundary = report['decoder']['MBONToReadoutIsZeroHopSoftwareBoundary']
    lines += ['', 'These are sparse shortest-path measurements, not predicted physiological responses. Inhibitory influence remains explicitly inhibitory in the fast-nonzero policy.', '',
              f"Direct visual-KC → MBON anatomy: {report['directContacts']['visualKCsToMBONs']}.",
              f"Decoder effective population: {report['decoder']['uniqueEffectiveCells']} cells; {report['decoder']['cellsAlsoInMBONPopulation']} overlap the MBON assay population. Readout entirely within that population: {software_boundary}. Overlap is a zero-hop software boundary, not a tested VNC motor pathway.", '',
              f"Sufficient quiescent-LIF barrier present: **{report['quiescentBarrier']['sufficientBarrierPresent']}**. {report['quiescentBarrier']['implication']}", '',
              f"All saved stimuli have zero nominated visual-KC and MBON spikes: {no_downstream}. If the sufficient quiescent barrier holds, structural connections and a longer probe alone cannot create downstream excitation.", '',
              'A new version needs evidence-based sensory transduction/graded visual physiology, resting activity and receptor effects, followed by new frozen assays. This diagnostic does not authorize changing signs or thresholds to obtain a positive result.', '',
              'Reproduce with the command and file hashes in the companion JSON. That file also includes exact example body-ID paths, contact counts, hop distributions, timing bounds, source identities and measured resource use.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('graph', 'manifest', 'vision', 'decoder', 'specification', 'screen', 'output'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--parameters')
    args = parser.parse_args()
    paths = {name: Path(getattr(args, name)).resolve() for name in ('graph', 'manifest', 'vision', 'decoder', 'specification', 'screen')}
    read = lambda path: json.loads(path.read_text(encoding='utf8'))
    started = time.perf_counter()
    graph = SparseGraph.load(paths['graph'], paths['manifest'])
    loaded = time.perf_counter()
    parameters = LIFParameters(**read(Path(args.parameters))) if args.parameters else LIFParameters()
    report = diagnose(graph, *(read(paths[k]) for k in ('vision', 'decoder', 'specification', 'screen')), parameters=parameters)
    report['provenance'] = {name: {'path': str(path), 'sha256': file_hash(path)} for name, path in paths.items()}
    if args.parameters:
        report['provenance']['parameters'] = {'path': str(Path(args.parameters).resolve()), 'sha256': file_hash(args.parameters)}
    memory = psutil.Process().memory_info()
    report['resources'] = {'loadWallSeconds': loaded - started, 'totalWallSeconds': time.perf_counter() - started,
                           'residentBytesAtCompletion': memory.rss,
                           'peakWorkingSetBytes': getattr(memory, 'peak_wset', None),
                           'simulatedMilliseconds': 0}
    report['runtime'] = {'python': platform.python_version(), 'executable': sys.executable,
                         'moduleWorkingDirectory': str(Path(__file__).resolve().parents[1]),
                         'numpy': np.__version__, 'scipy': scipy.__version__,
                         'moduleSha256': file_hash(__file__)}
    report['reproduction'] = 'python -m scicon_fly.diagnostics ' + ' '.join(f'--{k} "{v}"' for k, v in vars(args).items() if v is not None)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf8')
    output.with_suffix('.md').write_text(markdown(report), encoding='utf8')
    print(json.dumps({'output': str(output), 'sha256': file_hash(output), 'resources': report['resources'],
                      'inputBoundary': report['inputBoundary'], 'barrier': report['quiescentBarrier']['sufficientBarrierPresent'],
                      'routes': {mode: {key: value[key] for key in ('retainedEdges', 'reachableNetworkNeurons', 'orderedWaypointChainExists', 'wallSeconds')} for mode, value in report['routes'].items()}}, indent=2))


if __name__ == '__main__':
    main()
