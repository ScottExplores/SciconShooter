"""Replay cleanup with a sealed synthetic export; no browser process starts."""
from copy import deepcopy
import hashlib
import json

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from scicon_fly import replay as replay_module


@pytest.mark.parametrize('case',['success','hash-mismatch','runtime-mismatch','worker-error','close-request-error'])
def test_replay_always_requests_graceful_owned_browser_cleanup(case,tmp_path,monkeypatch):
    write=lambda name,value:(tmp_path/name).write_text(json.dumps(value))
    runtime={'fixture':'SYNTHETIC_REPLAY_CLEANUP_ONLY'}
    write('config.json',{'seed':7,'episode':{'timeLimitSeconds':1},'renderProfile':'swiftshader'})
    write('metadata.json',{'sourceTreeHash':'fixture-source'})
    write('runtime.json',runtime)
    write('initial.json',{'stateHash':'initial-state','observationHash':'initial-gray','frameHash':'initial-png'})
    pq.write_table(pa.Table.from_pylist([{'seq':1,'tick':3,'movement':'N','fire':True,
                    'stateHash':'step-state','observationHash':'step-gray','frameHash':'step-png','eventsHash':'step-events'}]),
                   tmp_path/'actions.parquet')
    write('checksums.json',{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in tmp_path.iterdir()})
    calls=[]
    class Driver:
        process=None
        def call(self,command,timeout=None):
            calls.append(deepcopy(command))
            if command['op']=='close':
                assert timeout==30
                if case=='close-request-error':raise RuntimeError('Close response unavailable')
                return {'closed':True}
            if command['op']=='reset':
                return {'runtimeIdentity':{} if case=='runtime-mismatch' else runtime,
                        'stateHash':'initial-state','observation':{'sha256':'initial-gray'},'frame':{'sha256':'initial-png'}}
            if case=='worker-error':raise RuntimeError('Worker fixture failed')
            return {'tick':3,'stateHash':'wrong' if case=='hash-mismatch' else 'step-state',
                    'observation':{'sha256':'step-gray'},'frame':{'sha256':'step-png'},'eventsHash':'step-events'}
        def close(self):calls.append({'ownedHandleClosed':True})
    driver=Driver()
    def create_driver(args,name):
        assert args[-2:]==['--render-profile','swiftshader'] and name=='replay'
        return driver
    monkeypatch.setattr(replay_module,'JsonProcess',create_driver)
    monkeypatch.setattr(replay_module,'source_identity',lambda:{'sourceTreeHash':'fixture-source'})
    if case=='runtime-mismatch':
        with pytest.raises(ValueError,match='runtime differs'):replay_module.replay(tmp_path)
    elif case=='worker-error':
        with pytest.raises(RuntimeError,match='Worker fixture failed'):replay_module.replay(tmp_path)
    else:
        result=replay_module.replay(tmp_path)
        assert result['passed']==(case!='hash-mismatch')
        if case=='hash-mismatch':assert result['decision']==1 and not result['stateMatched']
        else:assert result['decisions']==1 and result['sourceMatched']
    assert calls[-2:]==[{'op':'close'},{'ownedHandleClosed':True}]
    assert sum(command.get('op')=='close' for command in calls)==1
