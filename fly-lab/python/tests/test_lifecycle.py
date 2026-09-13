import gzip
import json
import threading
import time
import pytest
from scicon_fly import server
from scicon_fly.server import Coordinator
from scicon_fly.recovery import recover


def test_stop_serializes_with_inflight_manual_step():
    entered=threading.Event();release=threading.Event();log=[]
    class Driver:
        def call(self,_command):
            entered.set();assert release.wait(3)
            return {'tick':3,'simTimeMs':50,'state':{'score':1,'lives':3,'enemiesDefeated':1},'events':[]}
    class Writer:
        closed=False
        def append(self,*_):assert not self.closed;log.append('append')
        def finish(self,_summary):self.closed=True;log.append('finish')
    c=Coordinator();c.driver=Driver();c.writer=Writer();c.config={'controller':'manual','constantFire':False,'seed':1};c.latest={'state':{'score':0,'lives':3,'enemiesDefeated':0}};c.status='ready'
    step=threading.Thread(target=c.step);step.start();assert entered.wait(2)
    stop=threading.Thread(target=c.stop);stop.start();time.sleep(.02)
    assert log==[] and not c.writer.closed
    release.set();step.join(3);stop.join(3)
    assert not step.is_alive() and not stop.is_alive()
    assert log==['append','finish'] and c.seq==1


def test_partial_journal_recovery_never_changes_original_or_completes_study(tmp_path):
    original=tmp_path/'crashed';original.mkdir()
    row={'action':{'seq':1,'tick':3,'movement':'idle','fire':False},'reward':0,'events':[]}
    text=json.dumps(row)+'\n{"action":'
    (original/'journal.jsonl').write_text(text)
    with gzip.open(original/'observations.jsonl.gz','wt') as stream:stream.write('{"tick":0}\n')
    result=recover(original,tmp_path/'recovered')
    assert result['completeJournalDecisions']==1 and result['incompleteJournalTail']
    assert result['missingObservationTicks']==[3]
    assert not result['eligibleForCompletedStudyAnalysis']
    assert (original/'journal.jsonl').read_text()==text


def terminal_coordinator(writer):
    class Driver:
        def call(self,_command):
            return {'tick':3,'simTimeMs':50,'terminated':True,'truncated':False,
                    'state':{'score':1,'lives':3,'enemiesDefeated':1},'events':[{'type':'completion'}]}
    coordinator=Coordinator();coordinator.driver=Driver();coordinator.writer=writer
    coordinator.config={'controller':'idle','constantFire':False,'seed':1}
    coordinator.latest={'state':{'score':0,'lives':3,'enemiesDefeated':0}}
    coordinator.status='running';coordinator.running=True
    return coordinator


def test_completed_status_is_published_only_after_final_artifacts_exist(monkeypatch):
    monkeypatch.setattr(server,'dataset_manifest',lambda:{})
    monkeypatch.setattr(server,'gate_status',lambda:{})
    entered=threading.Event();release=threading.Event();errors=[];results=[]
    class Writer:
        closed=False;summary=None;checksums_ready=False
        def append(self,*_):pass
        def finish(self,summary):
            # RunWriter closes its streams before it publishes all final files.
            self.closed=True;entered.set();assert release.wait(3)
            self.summary=summary;self.checksums_ready=True
    writer=Writer();coordinator=terminal_coordinator(writer)
    def complete():
        try:results.append(coordinator.step())
        except Exception as error:errors.append(error)
    thread=threading.Thread(target=complete);thread.start()
    try:
        assert entered.wait(2)
        published=coordinator.public()
        assert published['status']=='finalizing' and published['running'] is False
        assert writer.summary is None and not writer.checksums_ready
        with pytest.raises(ValueError,match='finalizing'):
            coordinator.start()
    finally:
        release.set();thread.join(3)
    assert not thread.is_alive() and errors==[]
    assert writer.checksums_ready and writer.summary['status']=='completed'
    assert results[0]['status']=='completed' and coordinator.public()['status']=='completed'


def test_final_checkpoint_failure_publishes_interrupted_consistently(monkeypatch):
    monkeypatch.setattr(server,'dataset_manifest',lambda:{})
    monkeypatch.setattr(server,'gate_status',lambda:{})
    class Writer:
        closed=False
        def append(self,*_):pass
        def finish(self,summary):self.summary=summary;self.closed=True
    writer=Writer();coordinator=terminal_coordinator(writer);coordinator.neural=object()
    def fail_checkpoint(_label):raise RuntimeError('Final checkpoint write failed')
    coordinator.checkpoint=fail_checkpoint
    result=coordinator.step()
    assert result['status']=='interrupted' and coordinator.status=='interrupted'
    assert writer.closed and writer.summary['status']=='interrupted'
    assert result['error']==writer.summary['error']=='Final checkpoint write failed'
    assert coordinator.running is False


@pytest.mark.parametrize('failure',[None,'finalization','engine-close-request','engine-close-handle'])
def test_coordinator_close_cleans_owned_handles_even_after_failure(failure):
    log=[]
    class Driver:
        process=None
        def call(self,command,timeout):
            assert command=={'op':'close'} and timeout==30
            log.append('engine-close-request')
            if failure=='engine-close-request':raise RuntimeError('close request failed')
        def close(self):
            log.append('engine-close-handle')
            if failure=='engine-close-handle':raise RuntimeError('close handle failed')
    class Neural:
        def close(self):log.append('neural-close')
    coordinator=Coordinator();coordinator.driver=Driver();coordinator.driver_profile='swiftshader'
    coordinator.neural=Neural();coordinator.neural_signature='fixture'
    def stop():
        log.append('finalize')
        if failure=='finalization':raise RuntimeError('finalization failed')
    coordinator.stop=stop
    if failure in ('finalization','engine-close-handle'):
        with pytest.raises(RuntimeError,match='finalization failed' if failure=='finalization' else 'close handle failed'):
            coordinator.close()
    else:coordinator.close()
    assert log==['finalize','engine-close-request','engine-close-handle','neural-close']
    assert coordinator.driver is None and coordinator.neural is None
    assert coordinator.driver_profile is None and coordinator.neural_signature is None
    # A repeated close must not address the already-released process handles.
    coordinator.stop=lambda:None
    coordinator.close()
    assert log==['finalize','engine-close-request','engine-close-handle','neural-close']


@pytest.mark.parametrize('profile',['swiftshader','local-d3d11'])
def test_render_profile_reset_releases_only_replaced_engine(profile,tmp_path,monkeypatch):
    log=[]
    class Process:
        def poll(self):return None
    class Driver:
        def __init__(self,name):self.name=name;self.process=Process()
        def call(self,command,timeout=None):
            log.append((self.name,command['op']))
            return {'state':{},'tick':0,'simTimeMs':0}
        def close(self):log.append((self.name,'close-handle'))
    class Writer:
        closed=False
        def __init__(self,*_):self.path=tmp_path
        def initial(self,result):assert result['tick']==0
        def finish(self,_):self.closed=True
    def new_driver(args,name):
        assert args[-2:]==['--render-profile',profile] and name=='engine'
        return Driver('new')
    # Check coordinator ownership/order without starting or killing processes;
    # this fixture does not claim a native Windows process-tree integration test.
    monkeypatch.setattr('scicon_fly.watch.terminate_owned_process',lambda process:log.append(('owned-process','terminate')))
    monkeypatch.setattr(server,'assert_process_source_current',lambda:None)
    monkeypatch.setattr(server,'RunWriter',Writer)
    monkeypatch.setattr(server,'JsonProcess',new_driver)
    monkeypatch.setattr(server,'dataset_manifest',lambda:{})
    monkeypatch.setattr(server,'gate_status',lambda:{})
    coordinator=Coordinator();old=Driver('old');coordinator.driver=old;coordinator.driver_profile='swiftshader'
    try:
        coordinator.reset({'controller':'idle','seed':1,'timeLimitSeconds':1,'renderProfile':profile})
        if profile=='swiftshader':
            assert coordinator.driver is old and log==[('old','reset')]
        else:
            assert coordinator.driver is not old
            assert log==[('old','close'),('owned-process','terminate'),('old','close-handle'),('new','reset')]
        assert coordinator.driver_profile==profile
    finally:coordinator.close()
