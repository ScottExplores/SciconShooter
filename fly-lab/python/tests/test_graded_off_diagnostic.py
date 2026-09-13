"""Assay recording/contrast semantics, not biological correctness."""
import importlib.util
import json
from pathlib import Path
import numpy as np
import pytest

LAB = Path(__file__).resolve().parents[2]
loader = importlib.util.spec_from_file_location('graded_assay', LAB / 'scripts/graded-off-diagnostic.py')
assay = importlib.util.module_from_spec(loader)
loader.loader.exec_module(assay)


def specification():
    return json.loads((LAB / 'configs/candidates/graded-off-diagnostic-v1.json').read_text())


def test_noise_is_identical_on_coarse_and_fine_time_grids_and_deterministic():
    spec = specification()
    coarse = assay.make_stimuli(spec, .25)
    fine = assay.make_stimuli(spec, .125)
    repeated = assay.make_stimuli(spec, .25)
    assert len(coarse) == 11
    for row, other, repeat in zip(coarse, fine, repeated):
        np.testing.assert_array_equal(row['contrast'], other['contrast'][::2])
        np.testing.assert_array_equal(row['contrast'], repeat['contrast'])
        assert row['start'] * 2 == other['start']
    assert not np.array_equal(coarse[-1]['contrast'], coarse[-2]['contrast'])


def test_flash_polarity_duration_and_heldout_amplitudes_are_distinct():
    rows = assay.make_stimuli(specification(), .25)
    for row in rows:
        assert np.all(row['contrast'][:row['start']] == 0)
        assert np.all(row['contrast'][row['end']:] == 0)
    off = next(row for row in rows if row['name'] == 'flash_OFF')
    on = next(row for row in rows if row['name'] == 'flash_ON')
    assert (off['end'] - off['start']) * .25 == 200
    np.testing.assert_array_equal(off['contrast'], -on['contrast'])
    development = {abs(r['contrast']).max() for r in rows if r['group'] == 'development'}
    heldout = {abs(r['contrast']).max() for r in rows if r['group'] == 'held_out_amplitude'}
    assert development.isdisjoint(heldout)


def test_metrics_do_not_mislabel_negative_response_as_positive_latency():
    values = np.array([[.25, .25, .25], [.25, .25, .25], [.45, .15, .3], [.35, .1, .29], [.25, .25, .25]])
    summary = assay.population_summary(values, np.array(['L2', 'Tm1', 'Tm2']), {'start': 1, 'end': 3}, 1, .25)
    assert summary['L2']['positivePeakLatencyMs'] == 1
    assert summary['Tm1']['positivePeakLatencyMs'] is None
    assert summary['Tm1']['positiveResponseOnsetMsAt1eMinus4'] is None
    assert summary['Tm2']['maximumReleaseChange'] == pytest.approx(.05)


def test_byte_comparison_detects_voltage_difference_despite_equal_release():
    first = {key: np.zeros((2, 3)) for key in ['v', 'a', 'release', 'contrast', 'time_ms']}
    other = {key: value.copy() for key, value in first.items()}
    other['v'][1, 2] = -.001
    assert assay.compare_arrays(first, other) == {'bytesIdentical': False, 'maximumReleaseAbsoluteDifference': 0.0}


def test_corrupt_protocol_rejected_before_output_directory_creation(tmp_path):
    frozen = tmp_path / 'freeze.json'
    frozen.write_text(json.dumps({'specificationSha256': 'bad'}))
    output = tmp_path / 'result'
    with pytest.raises(ValueError, match='specification mismatch'):
        assay.run(LAB / 'configs/candidates/graded-off-diagnostic-v1.json', frozen, output)
    assert not output.exists()


def test_nonintegral_timing_rejected():
    with pytest.raises(ValueError, match='simulation tick'):
        assay.make_stimuli(specification(), .3)
