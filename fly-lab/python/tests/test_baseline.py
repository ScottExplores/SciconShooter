import hashlib
import json

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from scicon_fly import baseline
from scicon_fly.artifacts import atomic_json, digest


@pytest.fixture
def spec():
    return {'schemaVersion': 1, 'id': 'fixture', 'purpose': 'ENGINEERING_BASELINE_NOT_LEARNING',
            'scenario': 'operation-open-galaxy', 'seeds': [12, 34], 'conditions': ['idle', 'random'],
            'timeLimitSeconds': 1, 'constantFire': True, 'renderProfile': 'swiftshader', 'seedRole': 'development-only'}


def seal(path):
    atomic_json(path / 'checksums.json', {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                        for p in path.iterdir() if p.name != 'checksums.json'})


def episode(path, spec):
    path.mkdir()
    atomic_json(path / 'config.json', {'controller': 'idle', 'seed': 12, 'constantFire': True,
                'renderProfile': 'swiftshader', 'reinforcementProtocol': 'none', 'phase': 'evaluation',
                'episode': {'levelId': 'operation-open-galaxy', 'timeLimitSeconds': 1},
                'study': {'protocolHash': digest(spec)}})
    atomic_json(path / 'summary.json', {'status': 'completed', 'decisions': 1, 'score': 0, 'kills': 0,
                'lives': 0, 'reward': -15, 'simTimeMs': 50})
    atomic_json(path / 'metadata.json', {'status': 'completed', 'sourceTreeHash': 'fixture', 'gitCommit': 'fixture'})
    atomic_json(path / 'runtime.json', {'renderer': 'fixture'})
    pq.write_table(pa.Table.from_pylist([{'movement': 'idle', 'fire': True}]), path / 'actions.parquet')
    for name in ('neural-summary', 'synaptic-changes'):
        pq.write_table(pa.table({'payload': pa.array([], type=pa.string())}), path / (name + '.parquet'))
    for name in ('source.zip', 'initial.json', 'observations.jsonl.gz', 'events.parquet', 'rewards.parquet'):
        (path / name).write_bytes(b'fixture evidence; integrity test only')
    seal(path)
    return path


def test_counterbalanced_development_schedule_and_no_training(spec):
    schedule = baseline.plan(spec)
    assert [(x['seed'], x['controller']) for x in schedule['episodes']] == [(12, 'idle'), (12, 'random'), (34, 'random'), (34, 'idle')]
    assert schedule['maximumSimulatedSeconds'] == 4
    for changes in ({'conditions': ['neural-plastic']}, {'constantFire': False}, {'seeds': [True]}, {'seeds': [12, 12]}, {'timeLimitSeconds': 91}, {'seedRole': 'evaluation'}):
        with pytest.raises(ValueError):
            baseline.plan({**spec, **changes})


def test_corrupt_export_never_enters_baseline_results(tmp_path, spec):
    path = episode(tmp_path / 'episode', spec)
    row = {'index': 0, 'controller': 'idle', 'seed': 12}
    assert baseline.inspect_episode(path, row, spec)['simulatedSeconds'] == .05  # Native early defeat is valid.
    (path / 'summary.json').write_text('{}')
    with pytest.raises(ValueError, match='checksum'):
        baseline.inspect_episode(path, row, spec)


def test_sealed_wrong_condition_and_neural_rows_still_rejected(tmp_path, spec):
    path = episode(tmp_path / 'episode', spec)
    row = {'index': 0, 'controller': 'random', 'seed': 12}
    with pytest.raises(ValueError, match='condition'):
        baseline.inspect_episode(path, row, spec)
    pq.write_table(pa.Table.from_pylist([{'payload': 'spikes'}]), path / 'neural-summary.parquet')
    seal(path)
    with pytest.raises(ValueError, match='no neural'):
        baseline.inspect_episode(path, {**row, 'controller': 'idle'}, spec)


def test_empty_checksum_manifest_cannot_certify_an_export(tmp_path, spec):
    path = episode(tmp_path / 'episode', spec)
    atomic_json(path / 'checksums.json', {})
    with pytest.raises(ValueError, match='omits required'):
        baseline.inspect_episode(path, {'index': 0, 'controller': 'idle', 'seed': 12}, spec)


def test_worker_failure_preserves_attempt_and_closes_only_owned_coordinator(tmp_path, spec, monkeypatch):
    class FailingCoordinator:
        run_id = 'failed-owned-run'
        status = 'ready'
        error = None
        closed = False
        def reset(self, config):
            assert config['phase'] == 'evaluation' and config['constantFire']
        def step(self):
            raise RuntimeError('fixture asset failure')
        def close(self):
            self.closed = True
    coordinator = FailingCoordinator()
    monkeypatch.setattr(baseline, 'source_identity', lambda: {'sourceTreeHash': 'fixture'})
    monkeypatch.setattr(baseline, 'sampled_process_tree_rss', lambda: 1)
    output = tmp_path / 'batch'
    with pytest.raises(RuntimeError, match='asset failure'):
        baseline.execute(spec, output, maximum_wall_minutes=1, coordinator_factory=lambda: coordinator)
    result = json.loads((output / 'interrupted.json').read_text())
    assert result['completed'] == 0 and result['activeAttempt']['runId'] == 'failed-owned-run'
    assert coordinator.closed and not (output / 'results.json').exists()
    with pytest.raises(FileExistsError):
        baseline.execute(spec, output, maximum_wall_minutes=1, coordinator_factory=lambda: coordinator)


def test_exhausted_budget_never_starts_an_episode(tmp_path, spec, monkeypatch):
    from scicon_fly import watch
    calls = []
    class Coordinator:
        closed = False
        driver = object()
        def reset(self, config):
            pytest.fail('Budget exhaustion must prevent reset')
        def close(self):
            assert self.driver is None
            calls.append('coordinator-close')
            self.closed = True
    coordinator = Coordinator()
    monkeypatch.setattr(baseline, 'source_identity', lambda: {'sourceTreeHash': 'fixture'})
    monkeypatch.setattr(watch, 'close_driver', lambda driver: calls.append('driver-and-browser-close'))
    ticks = iter([0, 61])
    with pytest.raises(TimeoutError, match='budget'):
        baseline.execute(spec, tmp_path / 'expired', maximum_wall_minutes=1,
                         coordinator_factory=lambda: coordinator, clock=lambda: next(ticks))
    assert coordinator.closed
    assert calls == ['driver-and-browser-close', 'coordinator-close']
