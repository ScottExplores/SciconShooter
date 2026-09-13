"""Numerical software fixtures, not physiological or learning evidence."""
import json
import numpy as np
import pytest

from scicon_fly.lif_fast import FastLIFModel
from scicon_fly.model import LIFModel, LIFParameters, SparseGraph


def graph_fixture():
    # Shared targets, autapses, repeated edges, inhibition and a zero-sign cell.
    return SparseGraph([11, 12, 13, 14, 15, 16], [0, 3, 4, 5, 6, 7, 8],
                       [0, 4, 4, 4, 4, 4, 5, 1], [4, 12, 3, 9, 7, 2, 11, 4],
                       [1, -1, 0, 1, 1, 1], {"synthetic": True, "purpose": "NUMERICAL_FIXTURE_ONLY"})


def same_state(reference, candidate):
    for name, value in reference.state_dict().items():
        np.testing.assert_array_equal(value, candidate.state_dict()[name], err_msg=name)


@pytest.mark.parametrize("parameters", [LIFParameters(), LIFParameters(synapse_ms=20),
                                      LIFParameters(refractory_ms=0, delay_ms=.1)])
def test_every_tick_exact_state_spikes_and_delivery_time_efficacy(parameters):
    graph = graph_fixture()
    reference, candidate = LIFModel(graph, parameters), FastLIFModel(graph, parameters)
    rng = np.random.default_rng(542)
    for tick in range(450):
        if tick % 19 == 0:
            drive = rng.uniform(-5, 55, graph.n)
        if tick % 11 == 0:
            efficacy = rng.uniform(0, 2, graph.e)
            reference.efficacy[:] = efficacy
            candidate.efficacy[:] = efficacy
        silence = np.array([False, False, False, False, True, False]) if 110 <= tick < 140 else None
        np.testing.assert_array_equal(reference.advance(drive, silenced=silence),
                                      candidate.advance(drive, silenced=silence))
        same_state(reference, candidate)


def test_batching_reset_restore_and_drive_alias():
    graph = graph_fixture()
    reference, candidate = LIFModel(graph), FastLIFModel(graph)
    drive = np.array([30, 30, 30, 0, 0, 0.])
    for steps in [1, 18, 22, 101]:
        np.testing.assert_array_equal(reference.advance(drive, steps), candidate.advance(drive, steps))
        same_state(reference, candidate)
    saved = reference.state_dict()
    reference.reset(); candidate.reset()
    same_state(reference, candidate)
    reference.restore(saved); candidate.restore(saved)
    for field in ["v", "g"]:
        np.testing.assert_array_equal(reference.advance(getattr(reference, field), 35),
                                      candidate.advance(getattr(candidate, field), 35))
        same_state(reference, candidate)
    reference.efficacy[:] = .5; candidate.efficacy[:] = .5
    reference.reset(keep_weights=True); candidate.reset(keep_weights=True)
    same_state(reference, candidate)
    np.testing.assert_array_equal(candidate.efficacy, .5)


def test_simultaneous_signed_arrivals_and_refractory_discard():
    graph = graph_fixture()
    reference, candidate = LIFModel(graph), FastLIFModel(graph)
    for model in [reference, candidate]:
        model.queue[0, [0, 1, 2, 3]] = True
        model.last_spike[0] = 0  # An autaptic arrival during refractory is discarded.
    reference.advance(np.zeros(graph.n)); candidate.advance(np.zeros(graph.n))
    same_state(reference, candidate)
    assert candidate.g[0] == 0
    assert candidate.g[4] == ((12 + 3) - 9 + 2) * .275


def test_brian2_independent_equations_and_exact_spike_bins():
    import brian2 as b
    b.start_scope(); b.prefs.codegen.target = "numpy"; b.defaultclock.dt = .1 * b.ms
    graph = graph_fixture(); model = FastLIFModel(graph)
    group = b.NeuronGroup(graph.n, """dv/dt=(-52*mV-v+drive+g)/(20*ms):volt (unless refractory)
                                        dg/dt=-g/(5*ms):volt (unless refractory)
                                        drive:volt""", threshold="v > -45*mV", reset="v=-52*mV;g=0*mV",
                          refractory=2.2*b.ms, method="exact")
    group.v = -52*b.mV; group.g = 0*b.mV
    synapses = b.Synapses(group, group, "w:volt", on_pre="g_post += w", delay=1.8*b.ms)
    synapses.connect(i=np.repeat(np.arange(graph.n), np.diff(graph.indptr)), j=graph.indices)
    synapses.w = model.baseline*b.mV
    spikes = b.SpikeMonitor(group)
    monitor = b.StateMonitor(group, ["v", "g"], record=True, when="end")
    network = b.Network(group, synapses, spikes, monitor)
    states, counts = [], []
    for drive in [[40, 40, 40, 0, 15, 0], [0, 10, 0, 25, 15, 0], [35, 35, 0, 10, 15, 0]]:
        group.drive = np.asarray(drive)*b.mV
        network.run(15*b.ms)
        for _ in range(150):
            counts.append(model.advance(drive))
            states.append((model.v.copy(), model.g.copy()))
    np.testing.assert_allclose(np.stack([x[0] for x in states]).T, np.asarray(monitor.v/b.mV), rtol=0, atol=2e-10)
    np.testing.assert_allclose(np.stack([x[1] for x in states]).T, np.asarray(monitor.g/b.mV), rtol=0, atol=2e-10)
    expected = np.zeros((450, graph.n), dtype=np.int64)
    for neuron, time in zip(spikes.i, spikes.t/b.ms):
        expected[round(time/.1), neuron] += 1
    np.testing.assert_array_equal(counts, expected)
    assert expected[:, 0].sum() and expected[:, 1].sum() and expected[:, 4].sum()


def without_execution_timing(value):
    if isinstance(value, dict):
        return {k: without_execution_timing(v) for k, v in value.items()
                if k not in {"execution", "wallSeconds", "loadSeconds", "initializationSeconds"}}
    if isinstance(value, list):
        return [without_execution_timing(v) for v in value]
    return value


def test_assay_backend_selection_and_unknown_rejection():
    from scicon_fly.assays import _assay_backend, full_graph_sanity, visual_decoder_assay
    assert _assay_backend("reference")[0] is LIFModel
    assert _assay_backend("preallocated")[0] is FastLIFModel
    with pytest.raises(ValueError, match="Unknown assay backend"):
        full_graph_sanity("missing.npz", "missing.json", backend="approximate")
    with pytest.raises(ValueError, match="Unknown assay backend"):
        visual_decoder_assay(None, {}, {}, {}, backend="approximate")


def test_full_graph_sanity_default_and_optional_backend_same_results(tmp_path):
    from scicon_fly.assays import full_graph_sanity
    graph = graph_fixture()
    graph_path, manifest_path = tmp_path / "graph.npz", tmp_path / "manifest.json"
    np.savez(graph_path, **{name: getattr(graph, name) for name in ["ids", "indptr", "indices", "contacts", "signs"]},
             neuron_types=np.array(["L1", "L1", "UNKNOWN", "KC", "MBON", "TEST"]))
    manifest_path.write_text(json.dumps(graph.manifest))
    reference = full_graph_sanity(graph_path, manifest_path, nominated_count=2)
    candidate = full_graph_sanity(graph_path, manifest_path, nominated_count=2, backend="preallocated")
    assert reference["execution"]["backend"] == "reference"
    assert candidate["execution"]["backendVersion"] == FastLIFModel.backend_version
    assert len(candidate["execution"]["implementationSha256"]) == 64
    assert without_execution_timing(reference) == without_execution_timing(candidate)
    assert not candidate["trainingAllowed"]


def test_visual_assay_backend_preserves_identity_results_and_gates():
    from scicon_fly.assays import visual_decoder_assay
    graph = graph_fixture()
    vision = {"graphHash": graph.identity, "samples": [{"neuronId": "11", "x": 0, "y": 0, "gain": 1}], "maximumDriveMv": 30}
    decoder = {"graphHash": graph.identity, "filterMs": 100,
               "channels": {name: {"neurons": [{"id": "15", "gain": 1}], "thresholdHz": 1,
                                   "evidence": ["SYNTHETIC_TEST_ONLY"]} for name in ["x", "y", "fire"]}}
    spec = {"graphHash": graph.identity, "durationMs": 20, "binMs": 5, "maximumTotalMs": 120, "seed": 12,
            "populations": {"input": {"neuronIds": ["11"], "evidence": ["SYNTHETIC_TEST_ONLY"]}},
            "criteria": {"visual": [{"stimulus": "illumination", "population": "input", "metric": "spikes",
                                        "operator": ">=", "value": 1}], "decoder": []}}
    reference = visual_decoder_assay(graph, vision, decoder, spec)
    candidate = visual_decoder_assay(graph, vision, decoder, spec, backend="preallocated")
    assert reference["execution"]["backend"] == "reference"
    assert candidate["execution"]["backend"] == "preallocated"
    assert without_execution_timing(reference) == without_execution_timing(candidate)
    assert not candidate["trainingAllowed"] and candidate["gates"]["decoder"]["status"] == "NOT_RUN"
