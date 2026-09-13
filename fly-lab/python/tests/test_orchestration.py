import json
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import pytest
from scicon_fly import artifacts, server, study


def protocol():
    return {'schemaVersion':1,'id':'synthetic-statistics-test','scenario':'operation-open-galaxy','status':'EXPLORATORY',
            'replicas':8,'trainingEpisodes':1,'evaluationEpisodes':2,'timeLimitSeconds':1,'masterSeed':123,
            'fixedTrainingMode':'reward-exposed-frozen-plasticity',
            'conditions':['intact-fixed','intact-plastic','shuffled-fixed','shuffled-plastic','yoked-reward'],
            'models':{},'evaluation':{'plasticity':False,'passiveEfficacyRelaxation':False,'resetTransientState':True}}


def measurements(spec, positive):
    planned=study.plan(spec)
    return [{**row,**study.expected_execution(row),'protocolHash':planned['protocolHash'],'status':'completed',
             'score':100+row['replica']+(25 if positive and row['condition']=='intact-plastic' and row['phase']=='post' else 0)} for row in planned['episodes']]


def test_sealed_schedule_matches_conditions_without_train_test_overlap():
    spec=protocol();a=study.plan(spec);assert a==study.plan(spec)
    training={r['seed'] for r in a['episodes'] if r['phase']=='training'}
    evaluation={r['seed'] for r in a['episodes'] if r['phase']=='pre'}
    assert training.isdisjoint(evaluation)
    for r in a['episodes']:
        expected=study.seed_for(spec['masterSeed'],'training' if r['phase']=='training' else 'evaluation',r['replica'],r['episode'])
        assert r['seed']==expected
    assert study.preflight(spec)['ready'] is False


def test_complete_replica_analysis_positive_null_and_missing():
    spec=protocol()
    positive=study.analyze(spec,measurements(spec,True))
    assert positive['complete'] and positive['evidence']=='INSUFFICIENT EVIDENCE'
    for comparison in positive['primaryComparisons'].values():
        assert comparison['meanDelta']==25
        assert comparison['holmAdjustedP']<.05
        assert comparison['replicas']==8
    null=study.analyze(spec,measurements(spec,False))
    assert all(c['holmAdjustedP']==1 for c in null['primaryComparisons'].values())
    incomplete=study.analyze(spec,measurements(spec,False)[:-1])
    assert not incomplete['complete'] and len(incomplete['missingEpisodes'])==1
    with pytest.raises(ValueError,match='Duplicate'):
        study.analyze(spec,measurements(spec,False)*2)


def test_artifact_roundtrip_preserves_events_observations_and_detects_corruption(tmp_path,monkeypatch):
    monkeypatch.setattr(artifacts,'source_identity',lambda:{'gitCommit':'test','sourceTreeHash':'test','files':{}})
    writer=artifacts.RunWriter(tmp_path,'run',{'controller':'manual'})
    result={'tick':0,'state':{'score':0,'lives':3},'stateHash':'state','observation':{'width':1,'height':1,'grayBase64':'AA==','sha256':'gray'},'frame':{'sha256':'png'},'runtimeIdentity':{'chromium':'test'},'events':[]}
    writer.initial(result);result['tick']=3;result['state']['lives']=2;result['events']=[{'type':'player-life-lost','tick':2,'count':1,'livesBefore':3,'livesRemaining':2}]
    writer.append(1,{'movement':'N','fire':True},result,-5,{'plasticityChanges':[{'edgeIndex':2,'before':1,'after':.9}]})
    writer.finish({'status':'completed','score':0})
    assert artifacts.verify_export(writer.path)==[]
    assert pq.read_table(writer.path/'events.parquet').num_rows==1
    assert pq.read_table(writer.path/'synaptic-changes.parquet').num_rows==1
    assert pq.read_table(writer.path/'actions.parquet')['frameHash'][0].as_py()=='png'
    (writer.path/'config.json').write_text('{}')
    assert artifacts.verify_export(writer.path)==['config.json']


class FakeBrain:
    def __init__(self):self.requests=[]
    def call(self,message):
        self.requests.append(message)
        return {'ok':True,'action':{'movement':'W','fire':False},'summary':{'spikes':0,'mode':message.get('mode')}}


def test_neural_boundary_hides_diagnostics_and_frozen_reward():
    c=server.Coordinator();c.neural=FakeBrain();c.config={'controller':'neural-fixed','constantFire':False}
    c.latest={'observation':{'width':1,'height':1,'grayBase64':'AA==','sha256':'private'},'state':{'enemyCoordinates':[123,456]},'seed':1234}
    c.history=[{'reward':4}];c.seq=1
    assert c.choose_action()=={'movement':'W','fire':False}
    request=c.neural.requests[-1]
    assert request=={'op':'step','observation':{'width':1,'height':1,'grayBase64':'AA=='},'reinforcement':0,'mode':'frozen'}
    c.config['controller']='neural-plastic';c.reinforcement_schedule=[-2]
    c.choose_action();assert c.neural.requests[-1]['reinforcement']==-2


def test_closed_episode_cannot_restart_or_step():
    c=server.Coordinator();c.latest={'terminated':False};c.writer=type('Closed',(),{'closed':True})()
    with pytest.raises(ValueError,match='closed'):c.start()
    with pytest.raises(ValueError,match='closed'):c.step()


@pytest.mark.parametrize('controller,phase,mode',[
    ('neural-fixed','training','training-fixed'),('neural-plastic','training','training'),
    ('neural-fixed','evaluation','frozen'),('neural-plastic','evaluation','frozen')])
def test_fixed_and_plastic_training_share_reinforcement_while_evaluation_freezes(controller,phase,mode):
    c=server.Coordinator();c.neural=FakeBrain()
    c.config={'controller':controller,'phase':phase,'neuralMode':server.neural_mode_for(controller,phase),'constantFire':False}
    c.latest={'observation':{'width':1,'height':1,'grayBase64':'AA=='},'state':{'lives':3,'enemiesDefeated':0}}
    c.history=[{'reward':-4}];c.seq=1
    c.choose_action()
    assert c.neural.requests[-1]['mode']==mode
    assert c.neural.requests[-1]['reinforcement']==(0 if mode=='frozen' else -4)
    c.reinforcement_schedule=[2];c.choose_action()
    assert c.neural.requests[-1]['reinforcement']==(0 if mode=='frozen' else 2)
    assert c.neural_summary['mode']==mode


def test_server_rejects_a_worker_that_does_not_attest_requested_training_mode():
    c=server.Coordinator();c.config={'controller':'neural-fixed','phase':'training','constantFire':False}
    c.latest={'observation':{'width':1,'height':1,'grayBase64':'AA=='}}
    class WrongMode:
        def call(self,message):return {'action':{'movement':'idle','fire':False},'summary':{'mode':'frozen'}}
    c.neural=WrongMode()
    with pytest.raises(ValueError,match='did not verify'):
        c.choose_action()


@pytest.mark.parametrize('controller,mode',[('neural-fixed','training-fixed'),('neural-plastic','training')])
def test_terminal_reinforcement_is_drained_and_attested_in_both_training_arms(tmp_path,controller,mode):
    class Brain:
        def __init__(self):self.requests=[]
        def call(self,request):
            self.requests.append(request)
            return {'action':{'movement':'idle','fire':False},'summary':{'mode':mode,'plasticityChanges':[]}}
    class Driver:
        def call(self,request):
            return {'tick':3,'simTimeMs':50,'terminated':True,'truncated':False,
                    'state':{'lives':0,'enemiesDefeated':2,'score':20},
                    'events':[{'type':'player-life-lost','count':1,'livesBefore':1,'livesRemaining':0},{'type':'player-death'}]}
    class Writer:
        closed=False
        path=tmp_path
        def append(self,*args):pass
        def record_neural(self,tick,summary):self.neural=summary
        def finish(self,summary):self.summary=summary;self.closed=True
    c=server.Coordinator();c.neural=Brain();c.driver=Driver();c.writer=Writer();c.run_id='UNIT_TEST'
    c.config={'controller':controller,'phase':'training','neuralMode':mode,'reinforcementProtocol':'signed-dan-outcome-v1','constantFire':False,'seed':1}
    c.latest={'observation':{'width':1,'height':1,'grayBase64':'AA=='},'state':{'lives':1,'enemiesDefeated':0}}
    c.public=lambda:{};c.checkpoint=lambda label:None
    c.step()
    assert c.neural.requests[0]['mode']==mode and c.neural.requests[0]['reinforcement']==0
    assert c.neural.requests[-1]=={'op':'reinforce','reinforcement':-3}
    assert c.writer.neural['mode']==mode and c.writer.summary['neuralMode']==mode
    assert c.writer.summary['reinforcementProtocol']=='signed-dan-outcome-v1'
    assert json.loads((tmp_path/'terminal-reinforcement.json').read_text())['summary']['mode']==mode


def test_reset_requires_the_source_version_loaded_by_this_process(monkeypatch):
    c=server.Coordinator();calls=[]
    monkeypatch.setattr(server,'PROCESS_SOURCE_TREE_HASH','loaded-version')
    def current():calls.append(True);return {'sourceTreeHash':'edited-version'}
    monkeypatch.setattr(server,'source_identity',current)
    with pytest.raises(RuntimeError,match='Restart the lab after source edits'):
        c.reset({'controller':'random'})
    assert c.writer is None and c.driver is None and len(calls)==1
    monkeypatch.setattr(server,'PROCESS_SOURCE_TREE_HASH','edited-version')
    with pytest.raises(ValueError,match='Unknown controller'):
        c.reset({'controller':'invalid-unit-test-controller'})
    assert c.writer is None and len(calls)==2
