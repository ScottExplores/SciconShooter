"""Independent numerical checks; these are not biological validation gates."""
import numpy as np
import pytest
from scipy.linalg import expm

from scicon_fly.graded import GradedModel, GradedParameters
from scicon_fly.model import SparseGraph


def graph_fixture():
    # Two sources to cell 3; duplicate source 1 edges must add.
    return SparseGraph([11, 12, 13], [0, 2, 3, 3], [2, 2, 2], [2, 3, 7],
                       [1, -1, 1], {"synthetic": True, "purpose": "NUMERICAL_FIXTURE_ONLY"})


def single_cell():
    return SparseGraph([1], [0, 0], [], [], [1], {"synthetic": True})


def test_exact_adapted_baseline_with_recurrence_and_reset():
    graph = graph_fixture()
    p = GradedParameters(baseline_release=[2, 4, 3], adaptation_strength=[1, 2, 3])
    model = GradedModel(graph, p, edge_gains=0.3)
    model.advance(np.zeros(3), 1000)
    np.testing.assert_array_equal(model.v, 0)
    np.testing.assert_array_equal(model.a, 0)
    np.testing.assert_array_equal(model.release, [2, 4, 3])
    model.advance([1, 2, 0], 50)
    previous = model.state_dict()
    model.reset()
    assert model.clock == 0
    model.advance(np.zeros(3), 1000)
    model.advance([1, 2, 0], 50)
    for key, value in previous.items():
        np.testing.assert_array_equal(model.state_dict()[key], value)


def test_single_cell_step_matches_analytic_transient_and_first_order_convergence():
    # Analytic solution for tau dv/dt = -v + u, with zero initial deviation.
    errors = []
    for dt in [0.5, 0.25, 0.125]:
        model = GradedModel(single_cell(), GradedParameters(dt_ms=dt, tau_v_ms=10), edge_gains=0)
        model.advance([2.0], round(20 / dt))
        expected = 2 * (1 - np.exp(-2))
        errors.append(abs(model.v[0] - expected))
        assert model.a[0] == 0
    assert errors[-1] < .004
    assert 1.9 < errors[0] / errors[1] < 2.1
    assert 1.9 < errors[1] / errors[2] < 2.1


def test_independent_matrix_exponential_with_adaptation_and_signed_recurrence():
    # Within the unclipped range, compare to a separately assembled affine ODE
    # solution. This catches update ordering and both adaptation and CSR axes.
    errors = []
    for dt in [.1, .05, .025]:
        p = GradedParameters(dt_ms=dt, tau_v_ms=[10, 20, 30], tau_a_ms=[70, 80, 90],
                             adaptation_strength=[.2, .5, .3], baseline_release=5)
        model = GradedModel(graph_fixture(), p, edge_gains=[.04, .04, .01])
        # Separate hand construction: W[2,0]=.2; W[2,1]=-.07.
        W = np.array([[0, 0, 0], [0, 0, 0], [.2, -.07, 0]])
        tv = np.diag(1 / np.array([10, 20, 30.]))
        ta = np.diag(1 / np.array([70, 80, 90.]))
        A = np.block([[tv @ (W - np.eye(3)), -tv],
                      [ta @ np.diag([.2, .5, .3]), -ta]])
        b = np.r_[tv @ [.8, -.3, 0], np.zeros(3)]
        augmented = np.zeros((7, 7))
        augmented[:6, :6] = A
        augmented[:6, 6] = b
        expected = (expm(augmented * 40) @ np.r_[np.zeros(6), 1])[:6]
        model.advance([.8, -.3, 0], round(40 / dt))
        errors.append(np.max(np.abs(np.r_[model.v, model.a] - expected)))
    assert errors[-1] < .0001
    assert 1.9 < errors[0] / errors[1] < 2.1
    assert 1.9 < errors[1] / errors[2] < 2.1


def test_simultaneous_update_signed_duplicate_edges_and_output_mask():
    graph = graph_fixture()
    p = GradedParameters(dt_ms=1, tau_v_ms=10, tau_a_ms=100, adaptation_strength=1)
    intact = GradedModel(graph, p, edge_gains=1)
    masked = GradedModel(graph, p, edge_gains=1, edge_mask=[False, False, True])
    for model in [intact, masked]:
        model.advance([1, 1, 0])
        np.testing.assert_array_equal(model.v, [.1, .1, 0])
        np.testing.assert_array_equal(model.a, 0)  # Adaptation must read old v.
        model.advance([1, 1, 0])
        np.testing.assert_allclose(model.a, [.001, .001, 0], rtol=0, atol=1e-15)
    np.testing.assert_allclose(intact.v, [.19, .19, -.02], rtol=0, atol=1e-15)
    np.testing.assert_allclose(masked.v, [.19, .19, -.07], rtol=0, atol=1e-15)
    assert masked.v[0] == intact.v[0]  # Blocking outputs does not silence source.


def test_release_clipping_and_no_external_state_aliases():
    model = GradedModel(single_cell(), GradedParameters(baseline_release=1, maximum_release=2), edge_gains=0)
    model.advance([100], 200)
    assert model.release[0] == 2
    for value in [model.v, model.a, model.release, *model.state_dict().values()]:
        value[...] = -999
    assert model.v[0] > 1 and model.a[0] == 0 and model.release[0] == 2 and model.clock == 200
    model.reset()
    model.advance([-100], 200)
    assert model.release[0] == 0


def test_anatomy_parameters_and_masks_are_copied_and_immutable():
    graph = graph_fixture()
    original = {name: getattr(graph, name).copy() for name in ["ids", "indptr", "indices", "contacts", "signs"]}
    tau = np.array([10., 20., 30.])
    gains = np.array([.1, .2, .3])
    mask = np.array([True, False, True])
    p = GradedParameters(tau_v_ms=tau)
    model = GradedModel(graph, p, edge_gains=gains, edge_mask=mask)
    tau[:] = 9; gains[:] = 99; mask[:] = False
    np.testing.assert_array_equal(model.parameters.tau_v_ms, [10, 20, 30])
    np.testing.assert_array_equal(model.edge_gains, [.1, .2, .3])
    np.testing.assert_array_equal(model.edge_mask, [True, False, True])
    for value in [graph.contacts, graph.signs, model.parameters.tau_v_ms,
                  model.edge_gains, model.edge_mask, model.transmission]:
        with pytest.raises(ValueError):
            value.flat[0] = 0
    model.advance([.1, .2, .3], 10)
    for name, value in original.items():
        np.testing.assert_array_equal(getattr(graph, name), value)


@pytest.mark.parametrize("name,value", [
    ("dt_ms", 0), ("dt_ms", float("nan")), ("dt_ms", True), ("dt_ms", [1]),
    ("tau_v_ms", 0), ("tau_a_ms", -1), ("tau_v_ms", [1, float("inf")]),
    ("maximum_release", 0), ("baseline_release", -1), ("adaptation_strength", -1),
    ("tau_v_ms", "20"), ("baseline_release", True), ("tau_v_ms", [[10]]),
])
def test_invalid_parameters_rejected(name, value):
    with pytest.raises(ValueError):
        GradedParameters(**{name: value})


@pytest.mark.parametrize("parameters", [
    GradedParameters(dt_ms=1.1, tau_v_ms=10),
    GradedParameters(dt_ms=1.1, tau_a_ms=10),
    GradedParameters(tau_v_ms=[10, 20]),
    GradedParameters(baseline_release=11, maximum_release=10),
])
def test_graph_bound_parameter_validation(parameters):
    with pytest.raises(ValueError):
        GradedModel(graph_fixture(), parameters, edge_gains=0)


@pytest.mark.parametrize("kwargs", [
    {"edge_gains": -1}, {"edge_gains": float("inf")}, {"edge_gains": [1, 2]},
    {"edge_gains": True}, {"edge_gains": 1, "edge_mask": [1, 1, 1]},
    {"edge_gains": 1, "edge_mask": [True, False]},
])
def test_invalid_connection_parameters(kwargs):
    with pytest.raises(ValueError):
        GradedModel(graph_fixture(), **kwargs)


@pytest.mark.parametrize("drive,steps", [
    (0, 1), ([0, 0], 1), ([0, 0, float("nan")], 1), ([0, 0, 0], 0),
    ([0, 0, 0], True), ([0, 0, 0], 1.0), ([0, 0, 0], 1_000_001),
])
def test_invalid_advance_leaves_state_unchanged(drive, steps):
    model = GradedModel(graph_fixture(), edge_gains=0)
    original = model.state_dict()
    with pytest.raises(ValueError):
        model.advance(drive, steps)
    for key, value in original.items():
        np.testing.assert_array_equal(model.state_dict()[key], value)


def test_atomic_nonfinite_failure_and_weight_overflow():
    graph = graph_fixture()
    with pytest.raises(ValueError, match="overflow"):
        GradedModel(graph, edge_gains=1e308)
    model = GradedModel(single_cell(), GradedParameters(adaptation_strength=1e308), edge_gains=0)
    with pytest.raises(FloatingPointError, match="not committed"):
        model.advance([1e308], 3)
    assert model.clock == 0
    np.testing.assert_array_equal(model.v, 0)


def test_model_identity_tracks_parameters_and_interventions():
    graph = graph_fixture()
    original = GradedModel(graph, edge_gains=.1)
    sham = GradedModel(graph, edge_gains=[.1, .1, .1], edge_mask=[True, True, True])
    lesion = GradedModel(graph, edge_gains=.1, edge_mask=[False, False, True])
    changed_tau = GradedModel(graph, GradedParameters(tau_v_ms=10), edge_gains=.1)
    assert original.parameter_hash == sham.parameter_hash == lesion.parameter_hash
    assert original.connection_hash == sham.connection_hash == changed_tau.connection_hash
    assert original.connection_hash != lesion.connection_hash
    assert original.parameter_hash != changed_tau.parameter_hash


def test_batched_and_single_steps_match_every_state_exactly():
    graph = graph_fixture()
    parameters = GradedParameters(adaptation_strength=.5)
    batched = GradedModel(graph, parameters, edge_gains=.1)
    single = GradedModel(graph, parameters, edge_gains=.1)
    for drive, count in [([.2, -.4, 0], 37), ([-.1, .3, 0], 19)]:
        batched.advance(drive, count)
        for _ in range(count):
            single.advance(drive)
        for key, value in batched.state_dict().items():
            np.testing.assert_array_equal(single.state_dict()[key], value)


def test_unknown_zero_sign_disables_modeled_transmission_without_removing_anatomy():
    graph = SparseGraph([1, 2], [0, 1, 1], [1], [12], [0, 1], {"synthetic": True})
    model = GradedModel(graph, edge_gains=1)
    model.advance([1, 0], 100)
    assert model.v[0] > 0 and model.v[1] == 0
    np.testing.assert_array_equal(graph.contacts, [12])
    np.testing.assert_array_equal(model.transmission, 0)


def test_full_connectome_cannot_accidentally_allocate_dense_transmission():
    count = GradedModel.maximum_dense_neurons + 1
    graph = SparseGraph(np.arange(1, count + 1), np.zeros(count + 1, dtype=int), [], [],
                        np.ones(count), {"synthetic": True})
    with pytest.raises(ValueError, match="limited to 2048"):
        GradedModel(graph, edge_gains=0)
