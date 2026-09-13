"""Verify local evidence provenance; this never creates or promotes assay results."""
from __future__ import annotations

import json
import math
from pathlib import Path
import re
import numpy as np

from .artifacts import LAB_ROOT
from .assays import REQUIRED_TRAINING_GATES, require_training_gates
from .model import file_hash


def evidence_file(reference, *, root=LAB_ROOT):
    """Every evidence reference is a confined path and a frozen SHA-256 digest."""
    if not isinstance(reference, dict) or not isinstance(reference.get('path'), str) or not re.fullmatch(r'[0-9a-f]{64}', str(reference.get('sha256', ''))):
        raise ValueError('Evidence requires a local {path, sha256} reference')
    root = Path(root).resolve()
    path = (root/reference['path']).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('Evidence must exist inside fly-lab')
    if file_hash(path) != reference['sha256']:
        raise ValueError('Evidence file hash mismatch')
    return path


def evidence_report(reference, *, root=LAB_ROOT):
    path = evidence_file(reference, root=root)
    if path.suffix != '.json':
        raise ValueError('Validation reports must be JSON')
    report = json.loads(path.read_text(encoding='utf8'))
    if not isinstance(report, dict) or report.get('schemaVersion') != 1 or report.get('status') != 'PASS':
        raise ValueError('Validation report is not a versioned PASS result')
    if any(report.get(key) is True for key in ('synthetic', 'candidateOnly', 'assayOnly')) or report.get('trainingAllowed') is False or 'CANDIDATE' in str(report.get('classification', '')).upper():
        raise ValueError('Synthetic/candidate assay evidence cannot authorize a real controller')
    return report


def validate_checks(checks):
    """Recompute the report's preregistered scalar acceptance comparisons."""
    if not isinstance(checks, list) or not checks:
        raise ValueError('Validation evidence needs measured acceptance checks')
    for check in checks:
        if not isinstance(check, dict) or not check.get('name'):
            raise ValueError('Validation checks require named measurements')
        actual, threshold = check.get('actual'), check.get('threshold')
        if type(actual) not in (int, float) or type(threshold) not in (int, float) or not math.isfinite(actual) or not math.isfinite(threshold):
            raise ValueError('Validation checks require finite actual and threshold values')
        op = check.get('operator')
        if op not in ('<=', '>=', '==') or not {'<=': actual <= threshold, '>=': actual >= threshold, '==': actual == threshold}[op]:
            raise ValueError('A measured validation check failed')


def validate_declared_checks(report, *, root=LAB_ROOT, key='checks'):
    protocol=json.loads(evidence_file(report.get('protocol'),root=root).read_text(encoding='utf8'))
    checks=report.get(key)
    validate_checks(checks)
    criteria=[{k:row[k] for k in ('name','operator','threshold')} for row in checks]
    if protocol.get(key)!=criteria:
        raise ValueError('Acceptance criteria differ from the hashed preregistered protocol')
    return protocol


def validate_gate_evidence(report, identity, *, root=LAB_ROOT, synthetic=False):
    """Real controllers require hash-bound assay artifacts, not truthy evidence labels.

    A JSON assay artifact declares schemaVersion=1, gate, identity, status=PASS,
    protocol={path,sha256}, and nonempty checks (name/actual/operator/threshold).
    This verifies provenance and comparisons, not the truth of an assay's science.
    Synthetic numerical fixtures must be explicitly identified by the caller.
    """
    require_training_gates(report, identity)
    if synthetic:
        return
    for name in REQUIRED_TRAINING_GATES:
        references = report['gates'][name]['evidence']
        if not isinstance(references, list):
            raise ValueError(f'{name}: evidence must be a list of hashed local files')
        results = 0
        for reference in references:
            path = evidence_file(reference, root=root)
            if path.suffix != '.json':
                continue
            result = evidence_report(reference, root=root)
            if result.get('gate') != name or result.get('identity') != identity:
                raise ValueError(f'{name}: assay result identity/gate mismatch')
            validate_declared_checks(result,root=root)
            results += 1
        if not results:
            raise ValueError(f'{name}: no matching measured JSON assay result')


def validate_shuffled_graph(parent, candidate, seed, report):
    """Recompute structural invariants on the full retained CSR, without simulation."""
    if candidate.identity == parent.identity or candidate.manifest.get('parentGraphHash') != parent.identity or candidate.manifest.get('shuffleSeed') != seed:
        raise ValueError('Shuffled graph must differ and bind its actual parent and declared shuffle seed')
    if report.get('parentGraphHash') != parent.identity or report.get('graphHash') != candidate.identity or report.get('shuffleSeed') != seed:
        raise ValueError('Shuffle report graph/parent/seed mismatch')
    if candidate.n != parent.n or candidate.e != parent.e or not np.array_equal(candidate.ids, parent.ids) or not np.array_equal(candidate.signs, parent.signs):
        raise ValueError('Shuffle changed neuron identities, signs or graph dimensions')
    if set(candidate.annotations) != set(parent.annotations) or any(not np.array_equal(candidate.annotations[k], v) for k, v in parent.annotations.items()):
        raise ValueError('Shuffle changed neuron annotations')
    out = np.diff(parent.indptr)
    if not np.array_equal(out, np.diff(candidate.indptr)):
        raise ValueError('Shuffle changed presynaptic degrees')
    pre = np.repeat(np.arange(parent.n, dtype=np.int64), out)
    if not np.array_equal(np.bincount(parent.indices, minlength=parent.n), np.bincount(candidate.indices, minlength=parent.n)):
        raise ValueError('Shuffle changed postsynaptic degrees')
    for endpoints in (pre,):
        if not np.allclose(np.bincount(endpoints, weights=parent.contacts, minlength=parent.n), np.bincount(endpoints, weights=candidate.contacts, minlength=parent.n), rtol=0, atol=1e-8):
            raise ValueError('Shuffle changed weighted output strengths')
    if not np.allclose(np.bincount(parent.indices, weights=parent.contacts, minlength=parent.n), np.bincount(candidate.indices, weights=candidate.contacts, minlength=parent.n), rtol=0, atol=1e-8):
        raise ValueError('Shuffle changed weighted input strengths')
    columns = report.get('strataAnnotations')
    required={'neuron_types','neuron_regions'}.intersection(parent.annotations)
    if not isinstance(columns, list) or not columns or not required.issubset(columns) or any(key not in parent.annotations for key in columns):
        raise ValueError('Shuffle report must declare available cell-type/region strata')
    records = np.rec.fromarrays([parent.annotations[key] for key in columns] + [parent.signs])
    _, strata = np.unique(records, return_inverse=True)
    count = int(strata.max())+1
    def distribution(graph):
        values = np.empty(graph.e, dtype=[('pair', 'i8'), ('contacts', 'f8')])
        values['pair'] = strata[pre]*count+strata[graph.indices]
        values['contacts'] = graph.contacts
        return np.sort(values, order=['pair', 'contacts'])
    if not np.array_equal(distribution(parent), distribution(candidate)):
        raise ValueError('Shuffle changed stratum-pair/contact distributions')
    original = np.sort(pre*parent.n+parent.indices)
    shuffled = np.sort(pre*candidate.n+candidate.indices)
    if len(np.unique(original)) != parent.e or len(np.unique(shuffled)) != candidate.e:
        raise ValueError('Shuffle requires merged edges and no new parallel edges')
    if not np.isin(pre[candidate.indices == pre], pre[parent.indices == pre]).all():
        raise ValueError('Shuffle created new self loops')
    changed = 1-len(np.intersect1d(original, shuffled, assume_unique=True))/parent.e if parent.e else 0
    minimum = report.get('minimumChangedFraction')
    if type(minimum) not in (int, float) or not math.isfinite(minimum) or not 0 < minimum <= 1 or changed < minimum:
        raise ValueError('Actual topology mixing is below its preregistered threshold')
    recorded=report.get('changedFraction')
    if type(recorded) not in (int,float) or not math.isfinite(recorded) or not math.isclose(recorded, changed, abs_tol=1e-12):
        raise ValueError('Recorded shuffle mixing differs from the actual graph')
    validate_checks(report.get('activityMatchingChecks'))
    return {'changedFraction': changed, 'invariantsVerified': True}
