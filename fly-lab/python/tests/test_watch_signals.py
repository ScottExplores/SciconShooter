import base64
import gzip
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from scicon_fly import watch_signals as signals


def observation(tick,value):
    gray=bytes([value])*signals.PIXELS
    return {'tick':tick,'width':96,'height':208,'grayBase64':base64.b64encode(gray).decode(),
            'sha256':hashlib.sha256(gray).hexdigest()}


def seal(path):
    (path/'checksums.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                                                for p in path.iterdir() if p.name!='checksums.json'}))


def write_observations(path,frames):
    with gzip.open(path/'observations.jsonl.gz','wt') as stream:
        for frame in frames:stream.write(json.dumps(frame)+'\n')


@pytest.fixture
def exported(tmp_path):
    run=tmp_path/'export';run.mkdir()
    frames=[observation(0,0),observation(3,1),observation(6,1),observation(9,255)]
    (run/'initial.json').write_text(json.dumps({'tick':0,'observationHash':frames[0]['sha256']}))
    pq.write_table(pa.Table.from_pylist([{'seq':seq,'tick':frame['tick'],'observationHash':frame['sha256']}
                                       for seq,frame in enumerate(frames[1:],1)]),run/'actions.parquet')
    write_observations(run,frames);seal(run)
    return run,frames


def test_exact_change_clipping_and_live_helper_match_recorded_signal(exported):
    run,frames=exported;result=signals.derive_signals(run)
    assert {key:result[key] for key in ('version','source','gain')}=={'version':1,'source':'recorded-grayscale','gain':8}
    assert [frame['seq'] for frame in result['frames']]==[0,1,2,3]
    assert [frame['tick'] for frame in result['frames']]==[0,3,6,9]
    assert [frame['inputChange'] for frame in result['frames']]==[0,8/255,0,1]
    assert signals.input_change(frames[0],frames[1])==result['frames'][1]['inputChange']
    assert signals.input_change(frames[-1],frames[0])==1


@pytest.mark.parametrize('corruption',['shape','self-hash','sealed-hash','missing','extra','order'])
def test_resealed_but_invalid_observations_fail_closed(exported,corruption):
    run,frames=exported
    if corruption=='shape':frames[1]['width']=95
    elif corruption=='self-hash':frames[1]['sha256']='0'*64
    elif corruption=='sealed-hash':frames[1]=observation(3,2)
    elif corruption=='missing':frames.pop()
    elif corruption=='extra':frames.append(observation(12,3))
    else:frames[1],frames[2]=frames[2],frames[1]
    write_observations(run,frames);seal(run)
    with pytest.raises(ValueError):signals.derive_signals(run)


def test_export_tampering_is_rejected_before_parsing(exported):
    run,_=exported;(run/'initial.json').write_text('{}')
    with pytest.raises(ValueError,match='Export checksum mismatch'):signals.get_signals(run)


@pytest.mark.parametrize('name',sorted(signals.REQUIRED_FILES))
def test_required_inputs_must_be_named_in_the_sealed_checksums(exported,name):
    run,_=exported
    manifest=json.loads((run/'checksums.json').read_text());del manifest[name]
    (run/'checksums.json').write_text(json.dumps(manifest))
    with pytest.raises(ValueError,match='absent from checksums.json'):signals.derive_signals(run)
    with pytest.raises(ValueError,match='absent from checksums.json'):signals.get_signals(run)


def test_cache_reuses_verification_but_detects_file_changes_and_does_not_leak_mutable_results(exported,monkeypatch):
    run,frames=exported;calls=[];verify=signals.verify_export
    def counted(path):calls.append(path);return verify(path)
    monkeypatch.setattr(signals,'verify_export',counted)
    first=signals.get_signals(run);first['frames'][0]['inputChange']=99
    assert signals.get_signals(run)['frames'][0]['inputChange']==0
    assert len(calls)==1
    write_observations(run,frames)
    seal(run)
    assert signals.get_signals(run)['frames'][1]['inputChange']==8/255
    assert len(calls)==2
    (run/'initial.json').write_text('{}')
    with pytest.raises(ValueError,match='Export checksum mismatch'):signals.get_signals(run)


def test_cli_prints_only_the_sidecar_and_leaves_export_unchanged(exported):
    run,_=exported
    before={p.name:p.read_bytes() for p in run.iterdir()}
    env={**os.environ,'PYTHONPATH':str(Path(__file__).resolve().parents[1])}
    result=subprocess.run([sys.executable,'-m','scicon_fly.watch_signals',str(run)],env=env,
                          capture_output=True,text=True,check=True,timeout=10,
                          creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert json.loads(result.stdout)==signals.derive_signals(run)
    assert result.stderr=='' and {p.name:p.read_bytes() for p in run.iterdir()}==before


def test_live_snapshot_exposes_atomic_reward_and_image_change(tmp_path):
    from scicon_fly.server import Coordinator
    from scicon_fly.watch import WatchLibrary
    coordinator=Coordinator();library=WatchLibrary(tmp_path,tmp_path/'cache')
    assert library.live(coordinator)['inputChange']==0 and library.live(coordinator)['reward']==0
    coordinator.watch_snapshot={'seq':3,'action':{'movement':'W','fire':True},'neural':None,'inputChange':.25,'reward':-4.0}
    coordinator.total_reward=123;coordinator.seq=4
    snapshot=library.live(coordinator)
    assert snapshot['seq']==3 and snapshot['inputChange']==.25 and snapshot['reward']==-4
