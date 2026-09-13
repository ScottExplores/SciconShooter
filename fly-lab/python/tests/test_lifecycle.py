import gzip
import json
import threading
import time
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
