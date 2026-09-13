import hashlib
import json
import pytest
from scicon_fly import teaching_service as service


def test_teaching_requests_fail_closed():
    valid = {'requestId': 'a' * 32, 'seed': 42, 'rewardedCue': 'A'}
    assert service.request_config(valid) == valid
    for change in ({'seed': True}, {'seed': -1}, {'seed': 2**32}, {'seed': 1.5},
                   {'rewardedCue': 'C'}, {'requestId': '../elsewhere'}, {'extra': 1}):
        with pytest.raises(ValueError):
            service.request_config({**valid, **change})


def test_retries_reuse_completed_record_and_reject_changed_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    config = {'requestId': 'a' * 32, 'seed': 42, 'rewardedCue': 'A'}
    folder = tmp_path / config['requestId']
    folder.mkdir()
    payload = b'{"classification":"SYNTHETIC_TEACHING_EXPERIMENT"}'
    (folder / 'result.json').write_bytes(payload)
    record = {'status': 'completed', 'config': config, 'resultSha256': hashlib.sha256(payload).hexdigest()}
    (folder / 'record.json').write_text(json.dumps(record))
    # No source hashing or subprocess launch is permitted for the duplicate.
    monkeypatch.setattr(service, 'source_identity', lambda: pytest.fail('Duplicate request reran'))
    assert service.run(config)['experiment']['classification'] == 'SYNTHETIC_TEACHING_EXPERIMENT'
    with pytest.raises(ValueError, match='different settings'):
        service.run({**config, 'seed': 43})
    (folder / 'result.json').write_bytes(b'{}')
    with pytest.raises(ValueError, match='integrity'):
        service.run(config)


def test_failed_attempt_is_preserved_and_latest_identifier_is_constrained(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    assert service.latest() is None
    config = {'requestId': 'b' * 32, 'seed': 0, 'rewardedCue': 'B'}
    folder = tmp_path / config['requestId']
    folder.mkdir()
    record = {'status': 'failed', 'config': config}
    (folder / 'record.json').write_text(json.dumps(record))
    with pytest.raises(ValueError, match='preserved'):
        service.run(config)
    assert json.loads((folder / 'record.json').read_text()) == record
    (tmp_path / 'latest.json').write_text('{"requestId":"../outside"}')
    with pytest.raises(ValueError, match='identifier'):
        service.latest()


@pytest.mark.parametrize('cleanup_failure', [False, True])
def test_monitor_failure_terminates_owned_worker_and_preserves_attempt(tmp_path, monkeypatch, cleanup_failure):
    monkeypatch.setattr(service, 'ROOT', tmp_path)
    monkeypatch.setattr(service, 'source_identity', lambda: {'sourceTreeHash': 'test', 'gitCommit': 'test'})
    class Worker:
        pid = 12345
        killed = False
        waited = False
        def poll(self):
            return -1 if self.killed else None
        def kill(self):
            self.killed = True
        def wait(self, timeout=None):
            self.waited = True
            if cleanup_failure:
                raise service.subprocess.TimeoutExpired('teaching', timeout)
            return -1
    class InaccessibleMonitor:
        def children(self, recursive=False):
            raise service.psutil.AccessDenied(pid=12345)
    worker = Worker()
    monkeypatch.setattr(service.subprocess, 'Popen', lambda *a, **kw: worker)
    monkeypatch.setattr(service.psutil, 'Process', lambda pid: InaccessibleMonitor())
    config = {'requestId': 'c' * 32, 'seed': 42, 'rewardedCue': 'A'}
    with pytest.raises(service.psutil.AccessDenied):
        service.run(config)
    assert worker.killed and worker.waited
    record = json.loads((tmp_path / config['requestId'] / 'record.json').read_text())
    assert record['status'] == 'failed'
    assert ('cleanupError' in record) == cleanup_failure
    assert not (tmp_path / 'latest.json').exists()
