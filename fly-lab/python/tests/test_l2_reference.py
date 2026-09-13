"""Synthetic numerical tests only; no author data or notebook execution."""
from dataclasses import replace
import math

import numpy as np
import pytest

from scicon_fly.l2_reference import L2ReferenceParameters, simulate_l2_reference


def parameters(**changes):
    return replace(L2ReferenceParameters(tv_s=.02, ty_s=.3, w=4, g=.35,
                                         input_positive=3, input_negative=2,
                                         output_bias=.16, output_gain=1.8), **changes)


def independent_reference(p, stimulus, dt, initial, feedback=True):
    # Assemble a 2x2 transition matrix independently of the production scalar
    # derivatives. Both state signs, input polarities and transient y are used.
    state = np.array(initial, dtype=float)
    states = [state.copy()]
    for contrast in stimulus[1:]:
        c = p.g + (1 - 2 * p.g) * float(state[0] > 0)
        transition = np.array([[1-dt/p.tv_s, -dt*p.w/p.tv_s],
                               [dt*c/p.ty_s, 1-dt/p.ty_s]])
        if not feedback:
            transition[1] = 0
        forcing = np.array([-dt/p.tv_s * contrast *
                            (p.input_positive if contrast > 0 else p.input_negative), 0])
        state = transition @ state + forcing
        states.append(state.copy())
    states = np.array(states)
    return states[:, 0], states[:, 1], -p.output_gain*(states[:, 0]+p.output_bias)


def test_full_state_matches_independent_transition_matrix_across_both_branches():
    p = parameters()
    stimulus = np.r_[999, np.ones(40), -np.ones(70), np.zeros(30), np.ones(50)]
    actual = simulate_l2_reference(p, stimulus, dt_s=.001, initial_v=.3, initial_y=.02)
    expected = independent_reference(p, stimulus, .001, [.3, .02])
    assert actual.v.min() < 0 < actual.v.max()
    for value, reference in zip((actual.v, actual.y, actual.fluorescence), expected):
        np.testing.assert_allclose(value, reference, rtol=2e-13, atol=2e-14)


@pytest.mark.parametrize("contrast,expected_equilibrium", [(1, -3), (-1, 2), (0, 0)])
def test_no_feedback_matches_analytic_geometric_sequence(contrast, expected_equilibrium):
    p = parameters(w=100)
    dt, initial, samples = .002, .45, 80
    result = simulate_l2_reference(p, np.full(samples, contrast), dt_s=dt,
                                   initial_v=initial, feedback=False)
    exact_discrete = (expected_equilibrium + (initial-expected_equilibrium) *
                      (1-dt/p.tv_s)**np.arange(samples))
    np.testing.assert_allclose(result.v, exact_discrete, rtol=3e-14, atol=3e-15)
    np.testing.assert_array_equal(result.y, 0)
    np.testing.assert_allclose(result.fluorescence, -p.output_gain*(exact_discrete+p.output_bias),
                               rtol=3e-14, atol=3e-15)


def test_no_feedback_step_converges_to_analytic_continuous_solution():
    p = parameters()
    duration, initial, equilibrium = .04, .6, -p.input_positive
    expected = equilibrium + (initial-equilibrium)*math.exp(-duration/p.tv_s)
    errors = []
    for dt in (.001, .0005, .00025):
        result = simulate_l2_reference(p, np.ones(round(duration/dt)+1), dt_s=dt,
                                       initial_v=initial, feedback=False)
        errors.append(abs(result.v[-1]-expected))
    assert errors[-1] < .007
    assert 1.95 < errors[0]/errors[1] < 2.1
    assert 1.95 < errors[1]/errors[2] < 2.1


def test_simultaneous_updates_use_old_feedback_state_and_old_voltage():
    p = parameters(tv_s=.5, ty_s=2, w=3, g=.25, input_positive=2,
                   input_negative=5, output_bias=0, output_gain=1)
    result = simulate_l2_reference(p, [0, -1], dt_s=.1, initial_v=2, initial_y=.5)
    # dv=(-2-3*.5+5)/.5*.1=.3; dy=(-.5+2*.75)/2*.1=.05.
    np.testing.assert_allclose(result.v, [2, 2.3], rtol=0, atol=1e-15)
    np.testing.assert_allclose(result.y, [.5, .55], rtol=0, atol=1e-15)


def test_first_sample_modes_are_explicit_and_do_not_change_dynamics():
    p = parameters(output_bias=3, output_gain=2)
    stimulus = [9999, 0, 1, -1]
    initial = -.4  # For author reproduction the caller could choose -target[0].
    ordinary = simulate_l2_reference(p, stimulus, dt_s=.001, initial_v=initial)
    anchored = simulate_l2_reference(p, stimulus, dt_s=.001, initial_v=initial,
                                     first_sample_mode="author_target_anchor")
    assert ordinary.fluorescence[0] == -5.2
    assert anchored.fluorescence[0] == .4
    np.testing.assert_array_equal(ordinary.v, anchored.v)
    np.testing.assert_array_equal(ordinary.y, anchored.y)
    np.testing.assert_array_equal(ordinary.fluorescence[1:], anchored.fluorescence[1:])
    assert ordinary.pred is ordinary.fluorescence


def test_latent_scale_equivalence_demonstrates_unidentifiable_absolute_voltage():
    # An arbitrary positive latent scale preserves fluorescence if input and
    # observation gains change together. This is a mathematical identifiability
    # limitation, not a claim to infer a membrane-voltage scale from fluorescence.
    p, scale = parameters(), 7.25
    scaled_p = replace(p, input_positive=p.input_positive*scale,
                       input_negative=p.input_negative*scale,
                       output_bias=p.output_bias*scale, output_gain=p.output_gain/scale)
    stimulus = np.r_[0, np.ones(30), -np.ones(60), np.zeros(30)]
    original = simulate_l2_reference(p, stimulus, dt_s=.001, initial_v=.3, initial_y=.02)
    scaled = simulate_l2_reference(scaled_p, stimulus, dt_s=.001,
                                   initial_v=.3*scale, initial_y=.02*scale)
    np.testing.assert_allclose(scaled.v, original.v*scale, rtol=1e-12, atol=1e-13)
    np.testing.assert_allclose(scaled.y, original.y*scale, rtol=1e-12, atol=1e-13)
    np.testing.assert_allclose(scaled.fluorescence, original.fluorescence,
                               rtol=1e-12, atol=1e-13)
    # The author's special anchor bypasses the affine map and therefore does
    # not share this invariance for an arbitrarily rescaled initial state.
    anchored = simulate_l2_reference(scaled_p, stimulus, dt_s=.001,
                                     initial_v=.3*scale, initial_y=.02*scale,
                                     first_sample_mode="author_target_anchor")
    assert anchored.fluorescence[0] == -.3*scale
    assert anchored.fluorescence[0] != original.fluorescence[0]


def test_first_stimulus_entry_is_unused_and_single_sample_returns_initial_observation():
    p = parameters()
    first = simulate_l2_reference(p, [100, 0, 1], dt_s=.001, initial_v=0)
    second = simulate_l2_reference(p, [-100, 0, 1], dt_s=.001, initial_v=0)
    np.testing.assert_array_equal(first.v, second.v)
    np.testing.assert_array_equal(first.y, second.y)
    assert first.v[1] == 0 and first.v[2] < 0
    single = simulate_l2_reference(p, [88], dt_s=.1, initial_v=.4, initial_y=.1)
    np.testing.assert_array_equal(single.v, [.4])
    np.testing.assert_array_equal(single.y, [.1])
    np.testing.assert_array_equal(single.fluorescence, [-p.output_gain*(.4+p.output_bias)])


def test_zero_operating_state_and_zero_feedback_coefficient_endpoints():
    for g in (0, .5, 1):
        result = simulate_l2_reference(parameters(g=g), np.zeros(10), dt_s=.001, initial_v=0)
        np.testing.assert_array_equal(result.v, 0)
        np.testing.assert_array_equal(result.y, 0)
    no_positive_feedback = simulate_l2_reference(parameters(g=1), [0, 0],
                                                 dt_s=.001, initial_v=1)
    no_negative_feedback = simulate_l2_reference(parameters(g=0), [0, 0],
                                                 dt_s=.001, initial_v=-1)
    assert no_positive_feedback.y[1] == no_negative_feedback.y[1] == 0


def test_inputs_unchanged_and_outputs_read_only_without_shared_storage():
    source = np.array([0., 1., -1.])
    before = source.copy()
    first = simulate_l2_reference(parameters(), source, dt_s=.001, initial_v=0)
    second = simulate_l2_reference(parameters(), source, dt_s=.001, initial_v=0)
    np.testing.assert_array_equal(source, before)
    for array, other in zip((first.v, first.y, first.pred), (second.v, second.y, second.pred)):
        assert array.dtype == np.float64 and not array.flags.writeable
        assert not np.shares_memory(source, array) and not np.shares_memory(array, other)
        with pytest.raises(ValueError):
            array[0] = 99


@pytest.mark.parametrize("name,value", [
    ("tv_s", 0), ("ty_s", -1), ("tv_s", True), ("tv_s", "0.02"),
    ("g", -.01), ("g", 1.01), ("w", float("inf")), ("g", float("nan")),
    ("output_gain", 1j), ("input_negative", [2]), ("output_bias", None),
    ("w", 10**1000),
])
def test_invalid_parameters_raise_without_clipping(name, value):
    with pytest.raises(ValueError):
        parameters(**{name: value})


def test_signed_finite_fit_family_is_preserved_without_hidden_constraints():
    p = parameters(w=-1, input_positive=-2, input_negative=-3, output_gain=-4, output_bias=-5)
    assert (p.w, p.input_positive, p.input_negative, p.output_gain, p.output_bias) == (-1,-2,-3,-4,-5)
    result = simulate_l2_reference(p, [0, 1, -1], dt_s=.001, initial_v=0)
    assert np.isfinite(result.v).all()


@pytest.mark.parametrize("source", [[], 1, [[1, 2]], [True, False], [1j], ["1"],
                                        [0, float("nan")], [float("inf"), 0]])
def test_invalid_stimulus_shape_dtype_or_finiteness(source):
    with pytest.raises(ValueError):
        simulate_l2_reference(parameters(), source, dt_s=.001, initial_v=0)


@pytest.mark.parametrize("changes", [
    {"dt_s": 0}, {"dt_s": -.01}, {"dt_s": float("inf")}, {"dt_s": True},
    {"initial_v": float("nan")}, {"initial_y": [0]}, {"feedback": 1},
    {"first_sample_mode": "implicit"}, {"first_sample_mode": None},
    {"first_sample_mode": np.array(["observation"])},
    {"feedback": False, "initial_y": .5},
])
def test_invalid_call_arguments(changes):
    kwargs = {"dt_s": .001, "initial_v": 0, **changes}
    with pytest.raises(ValueError):
        simulate_l2_reference(parameters(), [0, 1], **kwargs)


def test_invalid_parameter_object_and_nonfinite_computations_fail_visibly():
    with pytest.raises(ValueError, match="parameters"):
        simulate_l2_reference({}, [0], dt_s=.001, initial_v=0)
    with pytest.raises(FloatingPointError, match="initial"):
        simulate_l2_reference(parameters(output_gain=1e308), [0], dt_s=.001, initial_v=10)
    with pytest.raises(FloatingPointError, match="sample 1"):
        simulate_l2_reference(parameters(input_positive=1e308), [0, 1e308],
                               dt_s=.001, initial_v=0)
    with pytest.raises(FloatingPointError, match="sample 1"):
        simulate_l2_reference(parameters(ty_s=1e-308), [0, 0], dt_s=.001,
                               initial_v=1e308, first_sample_mode="author_target_anchor")
