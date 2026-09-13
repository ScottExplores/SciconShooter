"""Small analysis fixtures, not biological validation."""
import importlib.util
from pathlib import Path
import numpy as np
import pytest

spec = importlib.util.spec_from_file_location('pathway', Path(__file__).resolve().parents[2] / 'scripts/flyvis-pathway-diagnostic.py')
pathway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pathway)


def test_lesion_selects_outgoing_not_incoming_connections():
    selected, populations = pathway.outgoing_targets(['L1', 'T4a', 'L2', 'Mi1'], np.array([0, 1, 2, 3]), ['L1', 'L2'])
    np.testing.assert_array_equal(selected, [True, False, True, False])
    np.testing.assert_array_equal(populations['L1'], [0])


@pytest.mark.parametrize('sources,nominated', [(np.array([0.0]), ['L1']), (np.array([-1]), ['L1']),
                                             (np.array([4]), ['L1']), (np.array([0]), ['missing']),
                                             (np.array([0]), ['L1', 'L1'])])
def test_invalid_lesion_targets_fail(sources, nominated):
    with pytest.raises(ValueError):
        pathway.outgoing_targets(['L1', 'L2'], sources, nominated)


def test_negative_graded_activity_has_no_positive_release():
    result = pathway.activity_summary(np.array([[-3., -1.], [-2., -0.5]]))
    assert result['gradedNonzeroFraction'] == 1
    assert result['releaseMaximum'] == 0
    assert result['releaseNonzeroFraction'] == 0
    assert result['neuronsWithAnyPositiveRelease'] == 0


def test_whole_network_difference_detects_effect_outside_central_cells():
    baseline = np.zeros((3, 5))
    lesion = baseline.copy(); lesion[2, 4] = .2
    result = pathway.difference_summary(baseline, lesion, 1e-6)
    assert result['maximumAbsoluteDifference'] == .2
    assert result['maximumDifferenceNeuron'] == 4
    assert not result['bitIdentical']
