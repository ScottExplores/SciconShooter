"""Windows reader locks must not destroy the previous complete snapshot."""
import json

import pytest

from scicon_fly import artifacts


def test_atomic_json_retries_transient_reader_permission_error(tmp_path,monkeypatch):
    path=tmp_path/'latest.json';path.write_text('{"sequence":1}')
    replace=artifacts.os.replace;calls=[];delays=[]
    def briefly_locked(source,destination):
        calls.append((source,destination))
        if len(calls)<3:
            assert json.loads(path.read_text())=={'sequence':1}
            assert json.loads(source.read_text())=={'sequence':2}
            raise PermissionError(13,'Temporary Windows reader sharing lock')
        return replace(source,destination)
    monkeypatch.setattr(artifacts.os,'replace',briefly_locked)
    monkeypatch.setattr(artifacts.time,'sleep',delays.append)
    artifacts.atomic_json(path,{'sequence':2})
    assert json.loads(path.read_text())=={'sequence':2}
    assert len(calls)==3 and delays==[.01,.02]
    assert not (tmp_path/'latest.json.tmp').exists()


def test_permanent_permission_error_is_bounded_and_preserves_both_versions(tmp_path,monkeypatch):
    path=tmp_path/'latest.json';path.write_text('{"sequence":7}')
    attempts=[];delays=[]
    def locked(*_):attempts.append(1);raise PermissionError(13,'Locked')
    monkeypatch.setattr(artifacts.os,'replace',locked)
    monkeypatch.setattr(artifacts.time,'sleep',delays.append)
    with pytest.raises(PermissionError):artifacts.atomic_json(path,{'sequence':8})
    assert len(attempts)==9 and len(delays)==8 and sum(delays)<1
    assert json.loads(path.read_text())=={'sequence':7}
    assert json.loads((tmp_path/'latest.json.tmp').read_text())=={'sequence':8}


def test_unrelated_io_failure_is_not_masked_by_retries(tmp_path,monkeypatch):
    attempts=[]
    def failed(*_):attempts.append(1);raise OSError('Disk failure')
    monkeypatch.setattr(artifacts.os,'replace',failed)
    monkeypatch.setattr(artifacts.time,'sleep',lambda _:pytest.fail('Unrelated I/O error should fail immediately'))
    with pytest.raises(OSError,match='Disk failure'):artifacts.atomic_json(tmp_path/'latest.json',{})
    assert len(attempts)==1
