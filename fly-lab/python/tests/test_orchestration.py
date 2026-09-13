import json
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import pytest
from scicon_fly import artifacts, server, study


def protocol():
    return {'schemaVersion':1,'id':'synthetic-statistics-test','scenario':'operation-open-galaxy','status':'EXPLORATORY',
            'replicas':8,'trainingEpisodes':1,'evaluationEpisodes':2,'timeLimitSeconds':1,'masterSeed':123,
            'conditions':['intact-fixed','intact-plastic','shuffled-fixed','shuffled-plastic','yoked-reward'],
            'models':{},'evaluation':{'plasticity':False,'passiveEfficacyRelaxation':False,'resetTransientState':True}}


def measurements(spec, positive):
    rows=study.plan(spec)['episodes']
    return [{**row,'status':'completed','score':100+row['replica']+(25 if positive and row['condition']=='intact-plastic' and row['phase']=='post' else 0)} for row in rows]


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
    writer.initial(result);result['tick']=3;result['events']=[{'type':'player-death','tick':2}]
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
        return {'ok':True,'action':{'movement':'W','fire':False},'summary':{'spikes':0}}


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
