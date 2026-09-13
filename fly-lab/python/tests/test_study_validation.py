"""Synthetic validator fixtures; none of these files is biological gate evidence."""
from copy import deepcopy
import json
import numpy as np
import pytest

from scicon_fly.assays import gate_report, REQUIRED_TRAINING_GATES
from scicon_fly.controls import constrained_shuffle, yoked_schedule
from scicon_fly.model import SparseGraph, file_hash
from scicon_fly import study
from scicon_fly.validation import evidence_file, validate_gate_evidence, validate_shuffled_graph


def write(root, name, value):
    path=root/name
    path.write_text(json.dumps(value),encoding='utf8')
    return {'path':name,'sha256':file_hash(path)}


def gate_fixture(root):
    identity={'graph':'SYNTHETIC_VALIDATOR_TEST_ONLY'}
    checks=[{'name':'unit metric','operator':'<=','threshold':.1,'actual':.01}]
    protocol=write(root,'protocol.json',{'checks':[{k:v for k,v in row.items() if k!='actual'} for row in checks]})
    report=gate_report(identity)
    for name in REQUIRED_TRAINING_GATES:
        result={'schemaVersion':1,'gate':name,'identity':identity,'status':'PASS','protocol':protocol,'checks':checks}
        report['gates'][name]={'status':'PASS','evidence':[write(root,name+'.json',result)]}
    return report,identity


def test_real_gates_reject_truthy_labels_and_verify_hashed_measurements(tmp_path):
    report,identity=gate_fixture(tmp_path)
    validate_gate_evidence(report,identity,root=tmp_path)
    forged=deepcopy(report);forged['gates']['visual']['evidence']=['claimed PASS']
    with pytest.raises(ValueError,match='path, sha256'):
        validate_gate_evidence(forged,identity,root=tmp_path)
    (tmp_path/'visual.json').write_text('{}')
    with pytest.raises(ValueError,match='hash mismatch'):
        validate_gate_evidence(report,identity,root=tmp_path)


@pytest.mark.parametrize('change',[{'candidateOnly':True},{'synthetic':True},{'assayOnly':True},{'trainingAllowed':False},{'classification':'CANDIDATE_ONLY'}])
def test_candidate_and_synthetic_assays_cannot_be_promoted_to_real_gate(tmp_path,change):
    report,identity=gate_fixture(tmp_path)
    result=json.loads((tmp_path/'visual.json').read_text());result.update(change)
    report['gates']['visual']['evidence']=[write(tmp_path,'visual.json',result)]
    with pytest.raises(ValueError,match='Synthetic/candidate'):
        validate_gate_evidence(report,identity,root=tmp_path)


def test_gate_thresholds_must_match_protocol_and_pass_measurements(tmp_path):
    report,identity=gate_fixture(tmp_path)
    result=json.loads((tmp_path/'conditioning.json').read_text());result['checks'][0]['threshold']=10
    report['gates']['conditioning']['evidence']=[write(tmp_path,'conditioning.json',result)]
    with pytest.raises(ValueError,match='criteria differ'):
        validate_gate_evidence(report,identity,root=tmp_path)
    result['checks'][0].update(threshold=.1,actual=1)
    report['gates']['conditioning']['evidence']=[write(tmp_path,'conditioning.json',result)]
    with pytest.raises(ValueError,match='check failed'):
        validate_gate_evidence(report,identity,root=tmp_path)
    with pytest.raises(ValueError,match='inside fly-lab'):
        evidence_file({'path':'../outside.json','sha256':'0'*64},root=tmp_path)


def graph_fixture():
    n=8
    return SparseGraph(np.arange(10,10+n),np.arange(0,2*n+1,2),[(i+j)%n for i in range(n) for j in (1,2)],
                       np.ones(2*n),np.ones(n),{'synthetic':True}, {'neuron_types':['SYNTHETIC']*n})


def test_shuffle_verification_uses_actual_edges_weights_and_declared_parent():
    original=graph_fixture();candidate,metrics=constrained_shuffle(original,17)
    report={'parentGraphHash':original.identity,'graphHash':candidate.identity,'shuffleSeed':17,
            'strataAnnotations':['neuron_types'],'minimumChangedFraction':.01,'changedFraction':metrics['changedFraction'],
            'activityMatchingChecks':[{'name':'fixture activity','actual':.01,'operator':'<=','threshold':.1}]}
    assert validate_shuffled_graph(original,candidate,17,report)['invariantsVerified']
    with pytest.raises(ValueError,match='seed'):
        validate_shuffled_graph(original,candidate,18,report)
    fake=SparseGraph(original.ids,original.indptr,original.indices,original.contacts,original.signs,candidate.manifest,original.annotations)
    with pytest.raises(ValueError,match='mixing'):
        validate_shuffled_graph(original,fake,17,{**report,'graphHash':fake.identity})
    altered=candidate.contacts.copy();altered[0]+=1
    changed=SparseGraph(candidate.ids,candidate.indptr,candidate.indices,altered,candidate.signs,candidate.manifest,candidate.annotations)
    with pytest.raises(ValueError,match='strengths'):
        validate_shuffled_graph(original,changed,17,{**report,'graphHash':changed.identity})


def study_fixture():
    return {'schemaVersion':1,'id':'SYNTHETIC_SCHEDULE_TEST','scenario':'operation-open-galaxy','status':'EXPLORATORY',
            'replicas':2,'trainingEpisodes':1,'evaluationEpisodes':1,'timeLimitSeconds':90,'masterSeed':123,
            'conditions':['intact-plastic','yoked-reward'],'models':{},
            'evaluation':{'plasticity':False,'passiveEfficacyRelaxation':False,'resetTransientState':True}}


def test_unaltered_same_seed_yoking_is_blocked_and_temporal_shift_is_preregistered():
    spec=study_fixture()
    assert any('unaltered' in failure for failure in study.preflight(spec)['failures'])
    spec.update(yokedMode='unaltered-donor',minimumShiftBins=200)
    assert any('unaltered' in failure for failure in study.preflight(spec)['failures'])
    spec['yokedMode']='temporally-shuffled'
    assert not any('Yoked control' in failure for failure in study.preflight(spec)['failures'])
    doses=np.zeros(1800);doses[100]=1;doses[150]=-5
    shifted,metadata=yoked_schedule(doses,5,minimum_shift_bins=200)
    assert 200<=metadata['shiftBins']<=1600
    assert not np.array_equal(doses,shifted)
    assert shifted.sum()==doses.sum()


def test_partial_action_horizons_and_realized_yoke_censoring_are_explicit():
    assert study.decision_count(1.02)==21
    assert study.decision_count(90)==1800
    result=study.yoked_exposure([1,-5,0],[0,1,-5,1],{'shiftBins':1})
    assert result['plannedPositiveDose']==2
    assert result['deliveredPositiveDose']==1
    assert result['deliveredNegativeDose']==-5
    assert result['censoredScheduleBins']==1
    assert result['outcomeCorrelation'] is not None


def test_model_replacement_between_training_episodes_breaks_the_seal():
    files={'graph':{'path':'fixture.npz','sha256':'one'},'decoder':{'path':'decoder.json','sha256':'two'}}
    check={'frozenModelFiles':{'intact-plastic:0':files}}
    study.validate_episode_model(check,'intact-plastic:0',{'config':{'modelFiles':deepcopy(files)}})
    changed=deepcopy(files);changed['decoder']['sha256']='changed'
    with pytest.raises(ValueError,match='replica continuity'):
        study.validate_episode_model(check,'intact-plastic:0',{'config':{'modelFiles':changed}})
