"""Durable accounting, explicit baseline labels and boss reward boundaries."""
import base64
import hashlib
import json
from pathlib import Path

import pytest

from scicon_fly.continuous import (SessionLedger, DiskBudget, StorageLimit, SessionLease,
                                  public_neural, public_snapshot, validate_config, observe_state, ContinuousRunner)
from scicon_fly.server import calculate_boss_damage_reward


def config(**changes):
    return {'version':1,'task':'boss-practice-v1','controller':'random','neuralConfig':None,
            'seed':1924,'bossSeconds':180,'waveSeconds':30,'renderProfile':'swiftshader',
            'maxBytes':512*1024**2,'rewardProtocol':'boss-hull-damage-v1',**changes}


def event(amount=2,target='BOSS',source='player'):
    return {'type':'entity-damage','sourceKind':source,'targetKind':target,'targetId':'boss-1',
            'amount':amount,'remainingHealth':100,'frame':30}


def row(seq=1,score=10,events=None,neural=None):
    events=events if events is not None else [event()]
    return {'action':{'seq':seq,'tick':seq*3,'movement':'W','fire':True,'stateHash':'state',
                      'observationHash':'obs','frameHash':'frame','eventsHash':'events'},
            'score':score,'lives':3,'events':events,'reward':calculate_boss_damage_reward({'events':events}),'neural':neural}


def start(ledger,tmp_path,run_id='a',phase='boss'):
    run=tmp_path/run_id;run.mkdir(exist_ok=True)
    ledger.begin(run_id,phase,run,1924)
    return run


def test_damage_reward_only_pays_actual_player_hull_contacts():
    hits=[event(2),event(3),event(20,'boss-component:cannon'),event(90,'BOSS','enemy'),
          {'type':'primary-fire-input','held':True},{'type':'points','amount':500}]
    assert calculate_boss_damage_reward({'events':hits})==5
    assert calculate_boss_damage_reward({'events':[]})==0
    # Contacts with the same target and frame are separate real applied hits.
    assert calculate_boss_damage_reward({'events':[event(2),event(2)]})==4
    for invalid in (float('nan'),float('inf'),True,-1,0):
        with pytest.raises(ValueError):calculate_boss_damage_reward({'events':[event(invalid)]})


def test_committed_decisions_are_exactly_once_across_process_restart(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config(),'session-1');start(ledger,tmp_path)
    first=row();assert ledger.credit('a',first);assert not ledger.credit('a',first)
    assert ledger.totals()=={'score':10,'bossDamage':2,'bossHits':1,'simSeconds':.05,'decisions':1,'bossEncounters':1}
    first_revision=ledger.revision();ledger.close()
    ledger=SessionLedger(tmp_path/'session',config());assert not ledger.credit('a',first)
    assert ledger.revision()>first_revision
    assert ledger.credit('a',row(2,score=14,events=[event(3)]))
    assert ledger.totals()['score']==14 and ledger.totals()['bossDamage']==5
    identities=json.loads(ledger.db.execute('SELECT hit_events FROM decisions WHERE seq=1').fetchone()[0])
    assert identities==[{'seq':1,'eventIndex':0,'targetId':'boss-1','amount':2}]
    ledger.close()


def test_conflicting_duplicate_and_missing_commands_do_not_mutate_totals(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());start(ledger,tmp_path);ledger.credit('a',row())
    for bad in (row(1,11),row(3,11),row(2,9)):
        with pytest.raises(ValueError):ledger.credit('a',bad)
    assert ledger.totals()['score']==10 and ledger.totals()['decisions']==1
    ledger.close()


def test_recover_journal_written_before_ledger_and_retry_interrupted_phase(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());run=start(ledger,tmp_path)
    first=row();second=row(2,20)
    ledger.credit('a',first)
    (run/'journal.jsonl').write_text(json.dumps(first)+'\n'+json.dumps(second)+'\n')
    ledger.close();ledger=SessionLedger(tmp_path/'session',config());ledger.recover()
    assert ledger.totals()['score']==20 and ledger.totals()['bossDamage']==4
    assert ledger.last_bout()['status']=='interrupted' and ledger.next_phase()=='boss'
    start(ledger,tmp_path,'b');ledger.credit('b',row(1,3,events=[]));ledger.finish('b','completed')
    assert ledger.totals()['score']==23 and ledger.next_phase()=='wave'
    start(ledger,tmp_path,'c','wave');ledger.credit('c',row(1,4,events=[]));ledger.finish('c','completed')
    assert ledger.next_phase()=='boss' and ledger.totals()['score']==27
    ledger.close()


def test_finalized_bout_recovers_transition_without_double_counting(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());run=start(ledger,tmp_path)
    first=row();(run/'journal.jsonl').write_text(json.dumps(first)+'\n')
    (run/'summary.json').write_text('{"status":"completed","practice":{"outcome":"boss-defeated"}}')
    (run/'checksums.json').write_text(json.dumps({name:hashlib.sha256((run/name).read_bytes()).hexdigest() for name in ('journal.jsonl','summary.json')}))
    ledger.recover();assert ledger.next_phase()=='wave' and ledger.totals()['score']==10
    assert ledger.last_bout()['outcome']=='boss-defeated'
    ledger.recover();assert ledger.totals()['score']==10
    ledger.close()


def test_corrupt_final_export_never_advances_to_next_phase(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());run=start(ledger,tmp_path)
    (run/'journal.jsonl').write_text(json.dumps(row())+'\n')
    (run/'summary.json').write_text('{"status":"completed"}');(run/'checksums.json').write_text('{}')
    with pytest.raises(ValueError,match='checksum'):ledger.recover()
    assert ledger.active() and ledger.next_phase()=='boss' and ledger.totals()['score']==10
    ledger.close()


def test_partial_journal_and_missing_evidence_fail_visibly_without_erasure(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());run=start(ledger,tmp_path)
    with pytest.raises(ValueError,match='missing'):ledger.recover()
    partial=json.dumps(row())[:-4];(run/'journal.jsonl').write_text(partial)
    with pytest.raises(ValueError,match='partial'):ledger.recover()
    assert (run/'journal.jsonl').read_text()==partial and ledger.active()
    ledger.close()


def test_computed_reward_is_not_delivered_to_random_controller(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());start(ledger,tmp_path);ledger.credit('a',row())
    value=ledger.db.execute('SELECT reward_computed,reward_delivered FROM decisions').fetchone()
    assert tuple(value)==(2,0)
    assert public_neural(None) is None
    real={'spikes':3,'sampledNeurons':[{'id':'123','spikes':3}], 'activePopulations':{'LC4':{'spikes':3}},'privatePath':'secret'}
    assert public_neural(real)=={k:v for k,v in real.items() if k!='privatePath'}
    ledger.close()


def test_method_changes_rejected_but_explicit_budget_increase_allowed(tmp_path):
    path=tmp_path/'session';ledger=SessionLedger(path,config());ledger.close()
    with pytest.raises(ValueError,match='method'):SessionLedger(path,config(seed=555))
    ledger=SessionLedger(path,config(maxBytes=1024**3));assert ledger.session_id
    assert ledger.db.execute('SELECT kind FROM notices').fetchone()[0]=='budget-changed'
    ledger.close()


def test_budget_stops_before_data_deletion(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());run=start(ledger,tmp_path)
    evidence=run/'data.bin';evidence.write_bytes(b'x'*100)
    budget=DiskBudget(ledger,max_bytes=1,reserve_bytes=0,min_free_bytes=0)
    with pytest.raises(StorageLimit,match='preserved'):budget.check()
    assert evidence.read_bytes()==b'x'*100
    ledger.close()


def test_only_one_runner_owns_the_local_session(tmp_path):
    with SessionLease(tmp_path/'runner.lock'):
        with pytest.raises(RuntimeError,match='owns'):SessionLease(tmp_path/'runner.lock').__enter__()
    with SessionLease(tmp_path/'runner.lock'):pass


def test_snapshot_uses_atomic_frame_checksum_and_never_claims_random_learning():
    content=b'test-jpeg';encoded=base64.b64encode(content).decode()
    value={'sessionId':'session','revision':9,'capturedAt':'2026-09-13T00:00:00Z','status':'transition',
        'phase':'boss','stageName':'Gatekeeper Prime','controllerLabel':'Random validation baseline','learningStatus':'not-learning',
        'totals':{'score':7,'bossDamage':4,'bossHits':2,'simSeconds':1},'action':{'movement':'W','fire':True},
        'current':{'phaseSimSeconds':1,'bossDamage':4,'bossHits':2,'bossDamagePerSecond':4},
        'feedback':{'lastHit':{'id':'a:1','amount':2,'count':1,'atSimSeconds':1},'hitAmount':2,'rewardComputed':2,'rewardDelivered':0,'deliveryStatus':'no-neural-worker'},
        'neural':None,'frame':{'mimeType':'image/jpeg','width':390,'height':844,'sha256':hashlib.sha256(content).hexdigest(),'base64':encoded},
        'error':None,'limits':{'maxBytes':100,'usedBytes':3}}
    result=public_snapshot(value)
    assert result['sequence']==9 and result['status']=='transitioning'
    assert result['controller']['learningStatus']=='not-learning' and result['neural'] is None
    assert result['feedback']['deliveredReward']==0 and result['image']=='data:image/jpeg;base64,'+encoded
    value['frame']['base64']=base64.b64encode(b'wrong').decode()
    with pytest.raises(ValueError,match='checksum'):public_snapshot(value)


def test_neural_model_cannot_be_selected_without_real_manifest():
    with pytest.raises(ValueError,match='manifest'):validate_config(config(controller='neural-plastic'))
    with pytest.raises(ValueError,match='180'):validate_config(config(bossSeconds=181))


def test_actual_observer_geometry_is_persisted_and_intro_excluded(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());start(ledger,tmp_path)
    state={'player':{'x':40,'y':690,'width':20,'height':30},'timers':{'intro':2},
           'entities':[{'type':'BOSS','x':30,'y':40,'width':70,'height':50}]}
    intro=observe_state(state);assert intro['withinBounds'] and intro['alignedWithBoss']
    ledger.credit('a',row(),intro)
    assert ledger.diagnostics()['observedControllableDecisions']==0
    state['timers']['intro']=0
    ledger.credit('a',row(2,12),observe_state(state))
    state['player']['x']=385
    ledger.credit('a',row(3,13),observe_state(state))
    metrics=ledger.diagnostics()
    assert metrics['observedControllableDecisions']==2 and metrics['bossVisibleDecisions']==2
    assert metrics['alignmentFraction']==.5 and metrics['outsideBoundsDecisions']==1
    stored=json.loads(ledger.db.execute('SELECT observer FROM decisions WHERE seq=2').fetchone()[0])
    assert stored['player']=={'x':50,'y':705} and stored['boss']=={'x':65,'y':65}
    ledger.close()


def test_finalization_failure_recovers_fsynced_step_before_closing_bout(tmp_path):
    ledger=SessionLedger(tmp_path/'session',config());run=start(ledger,tmp_path)
    first=row()
    class FailedFinalizer:
        seq=0;latest={'state':{},'tick':0};neural_summary=None;action={'movement':'W','fire':True}
        def step(self):
            (run/'journal.jsonl').write_text(json.dumps(first)+'\n')
            raise RuntimeError('Checkpoint failed after fsynced command')
        def close(self):pass
    runner=ContinuousRunner(ledger,config(),root=tmp_path/'feed',coordinator=FailedFinalizer())
    runner.budget.check=lambda:0
    assert runner.run(max_decisions=1)==1
    assert ledger.totals()['score']==10 and ledger.totals()['bossDamage']==2
    assert ledger.last_bout()['status']=='interrupted' and ledger.active() is None
    ledger.close();ledger=SessionLedger(tmp_path/'session',config());ledger.recover()
    assert ledger.totals()['score']==10 and ledger.next_phase()=='boss'
    ledger.close()
