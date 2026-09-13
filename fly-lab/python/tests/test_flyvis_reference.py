"""Analysis-only fixtures test the assay, never simulate or validate a fly."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest


LAB = Path(__file__).resolve().parents[2]
module_spec = importlib.util.spec_from_file_location('flyvis_reference', LAB / 'scripts/flyvis-reference.py')
reference = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(reference)


def analysis_fixture():
    spec = json.loads((LAB / 'configs/candidates/flyvis-reference-v1.json').read_text(encoding='utf-8'))
    names = ['L1', 'L2', *spec['preferredDirectionsDegrees']]
    flash = np.zeros((2, 600, len(names)), dtype=np.float32)
    flash[0, 200:400, :2] = 1
    flash[1, 200:400, :2] = -1
    flash_rows = [{'intensity': i, 'radius': 6} for i in [0, 1]]
    edge_rows = [{'intensity': i, 'angle': a, 't_stim': 1} for i in [0, 1] for a in spec['edge']['angles']]
    edge = np.zeros((len(edge_rows), 600, len(names)), dtype=np.float32)
    for i, row in enumerate(edge_rows):
        for column, name in enumerate(names[2:], start=2):
            expected = int(name.startswith('T4'))
            direction = spec['preferredDirectionsDegrees'][name]
            if row['intensity'] == expected:
                amplitude = 1 + .8 * np.cos(np.deg2rad(row['angle'] - direction))
            else:
                amplitude = .1
            edge[i, 250:350, column] = amplitude
    blank = np.zeros((600, len(names)), dtype=np.float32)
    repeats = [(flash[0], flash[0].copy()), (edge[0], edge[0].copy())]
    return dict(flash=flash, flash_rows=flash_rows, edge=edge, edge_rows=edge_rows,
                blank=blank, repeats=repeats, cell_types=names, spec=spec)


def test_reference_engineering_pass_never_authorizes_malecns():
    result = reference.evaluate_screen(**analysis_fixture())
    assert result['status'] == 'PASS'
    assert result['trainingAllowed'] is False
    assert result['scope'] == 'PUBLISHED_FLYVIS_REFERENCE_SCREEN_NOT_MALECNS_VALIDATION'
    assert result['contrastMatches'] == 8
    assert result['directionMatches'] == 8


def test_wrong_direction_retains_per_cell_failures():
    values = analysis_fixture()
    for row in values['edge_rows']:
        row['angle'] = (row['angle'] + 180) % 360
    result = reference.evaluate_screen(**values)
    assert result['status'] == 'FAIL'
    assert result['gates']['preferredVersusOpponent']['status'] == 'FAIL'
    assert result['directionMatches'] == 0
    assert len(result['cells']) == 8


def test_wrong_contrast_and_l1_l2_polarity_cannot_pass():
    values = analysis_fixture()
    values['flash'] *= -1
    for row in values['edge_rows']:
        row['intensity'] = 1 - row['intensity']
    result = reference.evaluate_screen(**values)
    assert result['status'] == 'FAIL'
    assert result['contrastMatches'] == 0
    assert result['gates']['l1L2FlashPolarity']['status'] == 'FAIL'


def test_blank_drift_and_actual_repeat_difference_fail():
    values = analysis_fixture()
    values['blank'][400:] = 1
    values['repeats'][0][1][:] += .1
    result = reference.evaluate_screen(**values)
    assert result['gates']['blankStability']['status'] == 'FAIL'
    assert result['gates']['repeatDeterminism']['status'] == 'FAIL'


def test_nonfinite_results_are_failure_not_json_nan():
    values = analysis_fixture()
    values['edge'][0, 300, 5] = np.nan
    result = reference.evaluate_screen(**values)
    assert result['status'] == 'FAIL'
    assert result['gates']['finite']['status'] == 'FAIL'
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize('mutation', ['duplicate', 'short', 'repeat_shape'])
def test_incomplete_or_ambiguous_response_metadata_is_rejected(mutation):
    values = analysis_fixture()
    if mutation == 'duplicate':
        values['edge_rows'][0] = deepcopy(values['edge_rows'][1])
    elif mutation == 'short':
        values['flash'] = values['flash'][:, :201]
    else:
        values['repeats'][0] = (values['flash'][0], values['flash'][0, :1])
    with pytest.raises(ValueError):
        reference.evaluate_screen(**values)
