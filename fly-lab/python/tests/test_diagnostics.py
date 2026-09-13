"""Small synthetic graph checks; these never constitute biological gate evidence."""
from copy import deepcopy
import json

import numpy as np
import pytest

from scicon_fly.assays import visual_decoder_assay
from scicon_fly.diagnostics import adjacency, diagnose, direct_contacts, quiescent_barrier, shortest_paths
from scicon_fly.model import LIFModel, LIFParameters, SparseGraph


def fixture():
    # Inhibition reaches a structural cholinergic chain; the final zero-sign
    # output is anatomical only. No tonic current exists in the dynamic test.
    graph = SparseGraph([11, 12, 13, 14, 15], [0, 1, 2, 3, 4, 4], [1, 2, 3, 4],
                        [60, 31, 37, 11], [-1, 1, 1, 0, 1], {'synthetic': True},
                        {'neuron_types': ['L1', 'BRIDGE', 'TEST_VISUAL_KC', 'TEST_MBON', 'TEST_DN'],
                         'neurotransmitters': ['glutamate', 'acetylcholine', 'acetylcholine', 'unknown', 'acetylcholine']})
    vision = {'graphHash': graph.identity, 'samples': [{'neuronId': '11', 'x': 0, 'y': 0, 'gain': 1}]}
    decoder = {'graphHash': graph.identity, 'channels': {
        name: {'neurons': [{'id': '14', 'gain': 1}], 'thresholdHz': 1, 'evidence': ['SYNTHETIC_TEST_ONLY']}
        for name in ('x', 'y', 'fire')}}
    spec = {'graphHash': graph.identity, 'durationMs': 20, 'binMs': 5, 'maximumTotalMs': 120,
            'populations': {name: {'neuronIds': [body], 'evidence': ['SYNTHETIC_TEST_ONLY']}
                            for name, body in [('L1', '11'), ('visual_kc', '13'), ('MBON', '14')]}}
    return graph, vision, decoder, spec


def test_directed_multisource_hops_ignore_contact_magnitude_and_keep_zero_hop():
    graph, *_ = fixture()
    matrix = adjacency(graph, 'anatomical')
    distances, _ = shortest_paths(matrix, [0, 3])
    np.testing.assert_array_equal(distances, [0, 1, 2, 0, 1])
    reverse, _ = shortest_paths(matrix, [4])
    assert np.isinf(reverse[:4]).all()
    empty, _ = shortest_paths(matrix, [])
    assert np.isinf(empty).all()
    assert direct_contacts(graph, [2], [3]) == {'directedPairs': 1, 'contacts': 37, 'contributingSources': 1, 'reachedTargets': 1}


def test_inhibition_is_not_dropped_from_fast_influence_and_zero_sign_is_dropped():
    graph, *_ = fixture()
    fast, _ = shortest_paths(adjacency(graph, 'fast_nonzero'), [0])
    positive, _ = shortest_paths(adjacency(graph, 'excitatory_only'), [0])
    np.testing.assert_array_equal(fast[:4], [0, 1, 2, 3])
    assert np.isinf(fast[4])
    assert np.isinf(positive[1:]).all()


def test_structural_route_does_not_overrule_the_quiescent_inhibitory_barrier():
    graph, vision, decoder, spec = fixture()
    screen = visual_decoder_assay(graph, vision, decoder, spec)
    report = diagnose(graph, vision, decoder, spec, screen)
    assert report['routes']['anatomical']['inputToVisualKCs']['minimumHops'] == 2
    assert report['routes']['anatomical']['orderedWaypointChainExists']
    assert report['routes']['fast_nonzero']['inputToMBONs']['reachable'] == 1
    assert not report['routes']['excitatory_only']['orderedWaypointChainExists']
    assert report['decoder']['MBONToReadoutIsZeroHopSoftwareBoundary']
    assert report['routes']['anatomical']['reachableMBONsToDecoder']['minimumHops'] == 0
    assert report['quiescentBarrier']['sufficientBarrierPresent']
    assert report['observedFrozenScreen']['illumination']['L1Spikes'] > 0
    assert all(row['visualKCSpikes'] == row['MBONSpikes'] == 0 for row in report['observedFrozenScreen'].values())
    assert report['trainingAllowed'] is False
    json.dumps(report, allow_nan=False)
    # A longer tiny synthetic run checks the proof against the real equations;
    # it does not run or modify the full MaleCNS model.
    model = LIFModel(graph); counts = model.advance([30, 0, 0, 0, 0], 1000)
    assert counts[0] > 0 and counts[1:].sum() == 0
    assert not quiescent_barrier(graph, [1], LIFParameters())['sufficientBarrierPresent']


def test_diagnostic_rejects_a_changed_decoder_or_renominated_population():
    graph, vision, decoder, spec = fixture()
    screen = visual_decoder_assay(graph, vision, decoder, spec)
    changed = deepcopy(decoder); changed['channels']['x']['thresholdHz'] = 2
    with pytest.raises(ValueError, match='Frozen screen identity'):
        diagnose(graph, vision, changed, spec, screen)
    wrong_population = deepcopy(screen); wrong_population['populationIds']['visual_kc'] = ['12']
    with pytest.raises(ValueError, match='original nomination'):
        diagnose(graph, vision, decoder, spec, wrong_population)


def test_invalid_adjacency_mode_or_source_is_rejected():
    graph, *_ = fixture()
    with pytest.raises(ValueError, match='edge mode'):
        adjacency(graph, 'invented')
    with pytest.raises(ValueError, match='outside graph'):
        shortest_paths(adjacency(graph, 'anatomical'), [9])
