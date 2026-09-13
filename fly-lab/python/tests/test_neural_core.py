"""SYNTHETIC test fixtures only. None is a MaleCNS or biological result."""
import base64
from collections import Counter
import json
import os
from pathlib import Path
import subprocess
import sys
import numpy as np
import pytest
from scicon_fly.model import SparseGraph, LIFModel, LIFParameters, save_checkpoint, load_checkpoint, file_hash
from scicon_fly.plasticity import CompartmentPlasticity
from scicon_fly.vision import VisualTransducer, decode_observation
from scicon_fly.decoder import FixedDecoder
from scicon_fly.controls import constrained_shuffle, yoked_schedule, TimingMatchedRandom, LesionProtocol
from scicon_fly.assays import gate_report, require_training_gates, conditioning_gate, visual_decoder_assay
from scicon_fly.worker import WorkerSession


def fixture_graph():
    return SparseGraph([11, 12, 13, 14], [0, 2, 3, 4, 5], [0, 1, 2, 1, 1], [4, 12, 5, 9, 2], [1, 1, -1, 0],
                       {"synthetic": True, "source": "SYNTHETIC_NUMERICAL_FIXTURE"},
                       {"neuron_types": ["KC", "MBON", "TEST_INHIBITORY", "PPL_TEST"]})


def manifests(graph):
    vision = {"graphHash": graph.identity, "samples": [{"neuronId": "11", "x": 0, "y": 0, "gain": 1}], "maximumDriveMv": 30}
    decoder = {"graphHash": graph.identity, "filterMs": 100,
               "channels": {name: {"neurons": [{"id": "12", "gain": 1}], "thresholdHz": 1,
                                    "evidence": ["SYNTHETIC_TEST_ASSIGNMENT"]} for name in ("x", "y", "fire")}}
    plasticity = {"graphHash": graph.identity, "edges": [{"kcId": "11", "mbonId": "12", "compartment": "SYNTHETIC",
                   "evidence": ["SYNTHETIC_TEST_ONLY"], "dan": [{"id": "14", "gain": 1}]}],
                  "reinforcement": {"neurons": [{"id": "14", "gainMv": 20}], "durationMs": 20, "maximumMagnitude": 1}}
    return vision, decoder, plasticity


def observation(value=255):
    return {"grayBase64": base64.b64encode(bytes([value]*4)).decode(), "width": 2, "height": 2}


def test_graph_immutable_exact_ids_and_existing_mask():
    graph = fixture_graph()
    with pytest.raises(ValueError):
        graph.contacts[0] = 0
    with pytest.raises(ValueError):
        graph.neuron_index(11.)
    with pytest.raises(ValueError):
        graph.edge_index(12, 14)
    assert graph.edge_index("11", "12") == 1
    other = SparseGraph([2**63+3], [0, 0], [], [], [1], {"synthetic": True})
    assert other.neuron_index(str(2**63+3)) == 0


def test_quiescent_network_and_exact_subthreshold_relaxation():
    model = LIFModel(fixture_graph())
    assert model.advance(np.zeros(4), 100).sum() == 0
    model.reset()
    drive = np.full(4, 2.)
    model.advance(drive, 100)
    expected = -52+2*(1-np.exp(-10/20))
    np.testing.assert_allclose(model.v, expected, rtol=0, atol=1e-12)
    assert not model.queue.any()


def test_batching_preserves_full_neural_state():
    one, many = LIFModel(fixture_graph()), LIFModel(fixture_graph())
    counts = one.advance([20, 0, 15, 0], 301)
    split = sum((many.advance([20, 0, 15, 0], n) for n in (1, 100, 200)), np.zeros(4, dtype=int))
    np.testing.assert_array_equal(counts, split)
    for key, value in one.state_dict().items():
        np.testing.assert_array_equal(value, many.state_dict()[key])


def test_brian2_oracle_delays_refractoriness_autapse_and_inhibition():
    b = pytest.importorskip("brian2")
    b.start_scope(); b.prefs.codegen.target = "numpy"
    b.defaultclock.dt = .1*b.ms
    graph = fixture_graph(); model = LIFModel(graph)
    group = b.NeuronGroup(4, """dv/dt=(-52*mV-v+drive+g)/(20*ms):volt (unless refractory)
                               dg/dt=-g/(5*ms):volt (unless refractory)
                               drive:volt""", threshold="v > -45*mV", reset="v=-52*mV;g=0*mV", refractory=2.2*b.ms, method="exact")
    group.v = -52*b.mV; group.g = 0*b.mV
    syn = b.Synapses(group, group, "w:volt", on_pre="g_post += w", delay=1.8*b.ms)
    pre = np.repeat(np.arange(4), np.diff(graph.indptr))
    syn.connect(i=pre, j=graph.indices)
    syn.w = model.baseline*b.mV
    spikes = b.SpikeMonitor(group)
    monitor = b.StateMonitor(group, ["v", "g"], record=True, when="end")
    network = b.Network(group, syn, spikes, monitor)
    ours = []
    for drive in ([30, 0, 40, 0], [0, 10, 0, 0], [40, 0, 20, 0]):
        group.drive = np.array(drive)*b.mV
        network.run(15*b.ms)
        for _ in range(150):
            counts = model.advance(drive, 1)
            ours.append((model.v.copy(), model.g.copy(), counts.copy()))
    np.testing.assert_allclose(np.stack([s[0] for s in ours]).T, np.asarray(monitor.v/b.mV), rtol=0, atol=2e-10)
    np.testing.assert_allclose(np.stack([s[1] for s in ours]).T, np.asarray(monitor.g/b.mV), rtol=0, atol=2e-10)
    spike_bins = np.zeros((450, 4), dtype=int)
    for neuron, time in zip(spikes.i, spikes.t/b.ms):
        spike_bins[round(time/.1), neuron] += 1
    np.testing.assert_array_equal(np.stack([s[2] for s in ours]), spike_bins)


def test_plasticity_timing_mask_and_frozen_passive_decay():
    graph = fixture_graph(); _, _, manifest = manifests(graph)
    rule = CompartmentPlasticity(graph, manifest)
    efficacy = np.ones(graph.e)
    for _ in range(10):
        rule.advance([1, 0, 0, 0], .01, efficacy)
    for _ in range(10):
        rule.advance([0, 0, 0, 1], .01, efficacy)
    assert efficacy[1] < 1
    np.testing.assert_array_equal(efficacy[[0, 2, 3, 4]], 1)
    state, weights = rule.state_dict(), efficacy.copy()
    rule.advance([100, 100, 100, 100], .01, efficacy, frozen=True)
    for name, value in state.items():
        np.testing.assert_array_equal(value, rule.state_dict()[name])
    np.testing.assert_array_equal(weights, efficacy)
    backward = CompartmentPlasticity(graph, manifest); e = np.ones(graph.e)
    for _ in range(10):
        backward.advance([0, 0, 0, 1], .01, e)
    for _ in range(10):
        backward.advance([1, 0, 0, 0], .01, e)
    assert e[1] > 1


def test_real_graph_refuses_fabricated_mapping_and_unverified_cell_roles():
    original = fixture_graph()
    graph = SparseGraph(original.ids, original.indptr, original.indices, original.contacts, original.signs, {"synthetic": False})
    v, d, p = manifests(graph)
    with pytest.raises(ValueError, match="validated"):
        VisualTransducer(graph, v)
    with pytest.raises(ValueError, match="validated"):
        FixedDecoder(graph, d)
    with pytest.raises(ValueError, match="annotations"):
        CompartmentPlasticity(graph, p)


def test_restricted_observation_and_actual_transduction():
    graph = fixture_graph(); v, _, _ = manifests(graph)
    mapper = VisualTransducer(graph, v)
    drive = mapper.encode(decode_observation(observation()), 50)
    assert drive[0] > 0 and np.count_nonzero(drive) == 1
    for bad in ({**observation(), "enemyX": 1}, {**observation(), "width": 1}, {**observation(), "grayBase64": "?"}):
        with pytest.raises(ValueError):
            decode_observation(bad)


def test_full_worker_checkpoint_resume_and_keep_efficacy(tmp_path):
    graph = fixture_graph(); v, d, p = manifests(graph)
    session = WorkerSession(graph, v, d, plasticity_manifest=p, checkpoint_dir=tmp_path, interval_ms=16.6666666667, allow_synthetic_fixture=True)
    session.handle({"op": "step", "observation": observation(), "mode": "frozen"})
    session.handle({"op": "checkpoint", "name": "state.npz"})
    result = session.handle({"op": "step", "observation": observation(64), "mode": "frozen"})
    after = session._states()
    session.handle({"op": "restore", "name": "state.npz"})
    repeated = session.handle({"op": "step", "observation": observation(64), "mode": "frozen"})
    assert repeated == result
    for name, state in after.items():
        for key, a in state.items():
            np.testing.assert_array_equal(a, session._states()[name][key])
    session.plasticity.u[:] = -.2; session.plasticity.w[:] = -.1
    session.brain.efficacy[session.plasticity.edge] = .9
    session.handle({"op": "reset", "preserveEfficacy": True})
    assert session.brain.efficacy[1] == .9 and session.brain.clock == 0
    assert not session.brain.queue.any() and not session.vision.filtered.any() and not session.decoder.rates.any()
    session.handle({"op": "reset"})
    np.testing.assert_array_equal(session.brain.efficacy, 1)
    with pytest.raises(ValueError, match="gate"):
        session.handle({"op": "step", "observation": observation(), "mode": "training"})
    with pytest.raises(ValueError, match="privileged"):
        session.handle({"op": "step", "observation": observation(), "health": 2})
    with pytest.raises(ValueError):
        session.handle({"op": "checkpoint", "name": "../outside.npz"})


def test_checkpoint_corruption_and_identity_are_rejected(tmp_path):
    file = tmp_path/"memory.npz"
    save_checkpoint(file, {"graph": "a"}, {"test": {"v": np.zeros(3)}})
    with pytest.raises(ValueError, match="identity"):
        load_checkpoint(file, {"graph": "b"})
    with file.open("ab") as stream:
        stream.write(b"corrupt")
    with pytest.raises(ValueError, match="checksum"):
        load_checkpoint(file, {"graph": "a"})
    with pytest.raises(ValueError, match="pickle"):
        save_checkpoint(file, {}, {"test": {"a": np.array([{}], dtype=object)}})


def test_terminal_reinforcement_is_declared_neural_interval(tmp_path):
    graph=fixture_graph(); v,d,p=manifests(graph)
    session=WorkerSession(graph,v,d,plasticity_manifest=p,checkpoint_dir=tmp_path,allow_synthetic_fixture=True)
    session.gates=gate_report(session.identity)
    # This is explicitly a SYNTHETIC test of gating mechanics, not biological evidence.
    for gate in session.gates["gates"].values():
        gate.update(status="PASS", evidence=["SYNTHETIC_UNIT_TEST"])
    session.handle({"op":"step","observation":observation(),"mode":"training"})
    before=session.brain.clock
    result=session.handle({"op":"reinforce","reinforcement":-1})
    assert "action" not in result and result["summary"]["terminalNeuralMs"]==20
    assert session.brain.clock-before==200
    with pytest.raises(ValueError,match="reset"):
        session.handle({"op":"step","observation":observation(),"mode":"training"})
    session.handle({"op":"checkpoint","name":"terminal.npz"})


def test_signed_reward_exact_additive_dose_checkpoint_and_zero_flush(tmp_path):
    graph=fixture_graph(); v,d,p=manifests(graph)
    p["reinforcement"]={"negativeNeurons":[{"id":"14","gainMv":20}],
                        "positiveNeurons":[{"id":"14","gainMv":10}], "maximumMagnitude":5,"durationMs":20}
    session=WorkerSession(graph,v,d,plasticity_manifest=p,checkpoint_dir=tmp_path,interval_ms=5,allow_synthetic_fixture=True)
    for gate in session.gates["gates"].values():
        gate.update(status="PASS",evidence=["SYNTHETIC_PROTOCOL_TEST_ONLY"])
    first=session.handle({"op":"step","mode":"training","observation":observation(),"reinforcement":-5})
    assert first["summary"]["reinforcementDoseMs"]=={"negative":25.,"positive":0.}
    session.handle({"op":"checkpoint","name":"pending.npz"})
    second=session.handle({"op":"step","mode":"training","observation":observation(),"reinforcement":1})
    session.handle({"op":"restore","name":"pending.npz"})
    assert session.handle({"op":"step","mode":"training","observation":observation(),"reinforcement":1})==second
    assert second["summary"]["reinforcementDoseMs"]=={"negative":25.,"positive":5.}
    terminal=session.handle({"op":"reinforce","reinforcement":0})
    assert terminal["summary"]["reinforcementDoseMs"]=={"negative":50.,"positive":15.}
    assert not session.reinforcement_queue.any()
    session.handle({"op":"reset","preserveEfficacy":True})
    weights=session.brain.efficacy.copy(); state=session.plasticity.state_dict()
    result=session.handle({"op":"step","mode":"frozen","observation":observation()})
    assert result["summary"]["plasticityChanges"]==[]
    np.testing.assert_array_equal(weights,session.brain.efficacy)
    for key,value in state.items(): np.testing.assert_array_equal(value,session.plasticity.state_dict()[key])
    with pytest.raises(ValueError,match="trained episode"):
        session.handle({"op":"reinforce","reinforcement":1})
    _,_,legacy=manifests(graph)
    missing=WorkerSession(graph,v,d,plasticity_manifest=legacy,allow_synthetic_fixture=True)
    with pytest.raises(ValueError,match="mapping"):
        missing.handle({"op":"step","observation":observation(),"reinforcement":1,"mode":"training"})
    session.handle({"op":"reset","preserveEfficacy":True})
    with pytest.raises(ValueError,match="no clipping"):
        session.handle({"op":"step","observation":observation(),"reinforcement":6,"mode":"training"})


def test_passive_retention_exact_rule_and_acquisition_expression_silencing(tmp_path):
    graph=fixture_graph();v,d,p=manifests(graph)
    rule=CompartmentPlasticity(graph,p); efficacy=np.ones(graph.e)
    rule.u[:]=-.2;rule.w[:]=-.1;rule.kc_trace[:]=2
    slow=CompartmentPlasticity(graph,p);slow.restore(rule.state_dict()); slow_efficacy=efficacy.copy()
    rule.retain(.1,efficacy)
    for _ in range(10): slow.advance(np.zeros(graph.n),.01,slow_efficacy)
    for name,value in rule.state_dict().items(): np.testing.assert_allclose(value,slow.state_dict()[name],rtol=0,atol=1e-14)
    np.testing.assert_array_equal(efficacy[[0,2,3,4]],1)
    lesion={"graphHash":graph.identity,"evidence":["SYNTHETIC_TEST_ONLY"],"lesions":[{"neuronIds":["11"],"scope":"acquisition"}]}
    protocol=LesionProtocol(graph,lesion)
    assert protocol.mask("frozen") is None
    model=LIFModel(graph); anatomical=model.baseline.copy()
    assert model.advance([100,0,0,0],100,silenced=protocol.mask("training")).sum()==0
    assert model.advance([100,0,0,0],100,silenced=protocol.mask("frozen"))[0]>0
    np.testing.assert_array_equal(model.baseline,anatomical)
    np.testing.assert_array_equal(model.efficacy,1)
    session=WorkerSession(graph,v,d,plasticity_manifest=p,checkpoint_dir=tmp_path,allow_synthetic_fixture=True,lesion_manifest=lesion)
    for gate in session.gates["gates"].values(): gate.update(status="PASS",evidence=["SYNTHETIC_TEST_ONLY"])
    session.plasticity.u[:]=-.2;session.plasticity.w[:]=-.1;session.brain.efficacy[1]=.9
    result=session.handle({"op":"retain","seconds":100})
    assert result["summary"]["retentionSeconds"]==100 and session.brain.clock==0
    assert result["summary"]["plasticityChanges"][0]["kind"]=="analytic_passive_retention"
    session.handle({"op":"checkpoint","name":"retention.npz"})
    session.handle({"op":"reset","preserveEfficacy":True})
    assert session.retention_seconds==100
    session.handle({"op":"restore","name":"retention.npz"})
    assert session.terminal and session.retention_seconds==100
    recipient=WorkerSession(graph,v,d,plasticity_manifest=p,checkpoint_dir=tmp_path,allow_synthetic_fixture=True)
    for gate in recipient.gates["gates"].values(): gate.update(status="PASS",evidence=["SYNTHETIC_TEST_ONLY"])
    with pytest.raises(ValueError,match="identity"):
        recipient.handle({"op":"restore","name":"retention.npz"})
    recipient.handle({"op":"transferMemory","name":"retention.npz","sourceIdentity":session.identity})
    np.testing.assert_array_equal(recipient.brain.efficacy,session.brain.efficacy)
    assert recipient.brain.clock==0 and not recipient.terminal and recipient.last_mode==0
    assert np.any(recipient.memory_origin)
    with pytest.raises(ValueError,match="only the lesion"):
        recipient.handle({"op":"transferMemory","name":"retention.npz","sourceIdentity":{**session.identity,"decoder":"changed"}})


def test_candidate_assay_scoped_optin_measured_criteria_without_training_pass():
    synthetic=fixture_graph()
    graph=SparseGraph(synthetic.ids,synthetic.indptr,synthetic.indices,synthetic.contacts,synthetic.signs,
                      {"synthetic":False,"purpose":"TEST_ACCESS_BOUNDARY_ONLY_NOT_MALECNS"},synthetic.annotations)
    v,d,_=manifests(graph)
    for mapping in (v,d): mapping["candidate"]={"assayOnly":True,"evidence":["TEST_CANDIDATE_ONLY"]}
    with pytest.raises(ValueError,match="validated"):
        WorkerSession(graph,v,d)
    spec={"graphHash":graph.identity,"durationMs":20,"binMs":5,"maximumTotalMs":120,
          "populations":{"test_kc":{"neuronTypes":["KC"],"evidence":["TEST_ONLY"]}}}
    report=visual_decoder_assay(graph,v,d,spec)
    assert not report["trainingAllowed"] and report["gates"]["visual"]["status"]=="NOT_RUN"
    assert set(report["results"])=={"dark","illumination","flash","movingBar","mirror","scramble"}
    assert report["results"]["dark"]["spikes"]==0
    assert report["results"]["illumination"]["metrics"]["test_kc"]["spikes"]>0
    spec["criteria"]={"visual":[{"stimulus":"illumination","population":"test_kc","metric":"meanHz",
                                "referenceStimulus":"dark","operator":">=","value":1e6}]}
    failed=visual_decoder_assay(graph,v,d,spec)
    assert failed["gates"]["visual"]["status"]=="FAIL" and not failed["trainingAllowed"]
    assert failed["identity"]["assaySpecification"]!=report["identity"]["assaySpecification"]


def _evidence_boundary_test_session(tmp_path):
    # Artificial data with the real-controller boundary enabled solely to test
    # access checks. No report from this fixture is biological evidence.
    fixture=fixture_graph()
    graph=SparseGraph(fixture.ids,fixture.indptr,fixture.indices,fixture.contacts,fixture.signs,
                      {"synthetic":False,"purpose":"UNIT_TEST_REAL_EVIDENCE_BOUNDARY_ONLY"},fixture.annotations)
    v,d,p=manifests(graph)
    for mapping in (v,d): mapping["validation"]={"status":"PASS","evidence":["UNVERIFIED_UNIT_TEST_LABEL"]}
    session=WorkerSession(graph,v,d,plasticity_manifest=p,checkpoint_dir=tmp_path)
    for gate in session.gates["gates"].values(): gate.update(status="PASS",evidence=["UNVERIFIED_UNIT_TEST_LABEL"])
    return session


@pytest.mark.parametrize("op",["step","reinforce","retain","transferMemory"])
def test_direct_real_worker_entrypoints_reject_truthy_evidence_labels(tmp_path,op):
    session=_evidence_boundary_test_session(tmp_path)
    requests={"step":{"op":"step","mode":"training","observation":observation()},
              "reinforce":{"op":"reinforce","reinforcement":-1},
              "retain":{"op":"retain","seconds":1},
              "transferMemory":{"op":"transferMemory","name":"unused.npz","sourceIdentity":session.identity}}
    if op=="reinforce": session.frame=1;session.last_mode=1
    for _ in range(2):
        with pytest.raises(ValueError,match="Evidence requires a local"):
            session.handle(requests[op])
        assert session._training_evidence_cache is None


def test_worker_caches_only_successful_hash_bound_gate_snapshot(tmp_path,monkeypatch):
    from scicon_fly import validation
    session=_evidence_boundary_test_session(tmp_path)
    calls=[];original=validation.validate_gate_evidence
    def checked(report,identity,*,synthetic):
        calls.append(True)
        return original(report,identity,root=tmp_path,synthetic=synthetic)
    monkeypatch.setattr(validation,"validate_gate_evidence",checked)
    checks=[{"name":"UNIT_TEST_SCHEMA_ONLY","operator":">=","threshold":1}]
    protocol=tmp_path/'unit-test-protocol.json';protocol.write_text(json.dumps({"checks":checks}),encoding='utf8')
    for name,gate in session.gates["gates"].items():
        artifact=tmp_path/(name+'-unit-test-report.json')
        artifact.write_text(json.dumps({"schemaVersion":1,"status":"PASS","gate":name,"identity":session.identity,
                            "purpose":"TEMPORARY_UNIT_TEST_SCHEMA_ONLY_NOT_SCIENTIFIC_EVIDENCE",
                            "protocol":{"path":protocol.name,"sha256":file_hash(protocol)},
                            "checks":[{**checks[0],"actual":1}]}),encoding='utf8')
        gate["evidence"]=[{"path":artifact.name,"sha256":file_hash(artifact)}]
    session._require_training();session._require_training()
    assert len(calls)==1 and session._training_evidence_cache is not None
    session.gates["gates"]["visual"]["evidence"][0]["sha256"]='0'*64
    for expected in (2,3):
        with pytest.raises(ValueError,match="hash mismatch"):
            session._require_training()
        assert len(calls)==expected


def test_control_shuffle_preserves_degree_strength_and_strata():
    graph=SparseGraph(np.arange(1,9),np.arange(9),[4,5,6,7,0,1,2,3],np.ones(8),np.ones(8),{"synthetic":True})
    shuffled,report=constrained_shuffle(graph,9,20,strata=["a"]*4+["b"]*4)
    assert report["acceptedSwaps"]>0
    np.testing.assert_array_equal(np.bincount(graph.indices,minlength=8),np.bincount(shuffled.indices,minlength=8))
    np.testing.assert_array_equal(np.diff(graph.indptr),np.diff(shuffled.indptr))
    assert all((target>=4)==(source<4) for source,target in enumerate(shuffled.indices))
    np.testing.assert_array_equal(graph.contacts,shuffled.contacts)


def test_shuffle_protects_plastic_mapping_and_preserves_weighted_invariants():
    pre=np.repeat(np.arange(12),2)
    post=np.array([((source%6+offset)%6)+(6 if source<6 else 0) for source in range(12) for offset in (0,1)])
    contacts=np.tile([1,2],12)
    graph=SparseGraph(np.arange(101,113),np.arange(0,25,2),post,contacts,np.ones(12),{"synthetic":True})
    protected=np.array([0,5,13],dtype=np.int64)
    shuffled,report=constrained_shuffle(graph,seed=3,swaps_per_edge=20,strata=["a"]*6+["b"]*6,protected_edges=protected)
    assert report["acceptedSwaps"]>0 and report["changedConnections"]>0
    assert report["protectedConnections"]==3 and report["protectedFraction"]==3/24
    assert report["changedMutableFraction"]==report["changedConnections"]/21
    for edge in protected:
        preserved=shuffled.edge_index(graph.ids[pre[edge]],graph.ids[graph.indices[edge]])
        assert shuffled.contacts[preserved]==graph.contacts[edge]
    np.testing.assert_array_equal(np.diff(graph.indptr),np.diff(shuffled.indptr))
    np.testing.assert_array_equal(np.bincount(graph.indices,minlength=12),np.bincount(shuffled.indices,minlength=12))
    np.testing.assert_array_equal(np.bincount(graph.indices,weights=graph.contacts,minlength=12),
                                  np.bincount(shuffled.indices,weights=shuffled.contacts,minlength=12))
    np.testing.assert_array_equal(np.add.reduceat(graph.contacts,graph.indptr[:-1]),np.add.reduceat(shuffled.contacts,shuffled.indptr[:-1]))
    assert all((target>=6)==(source<6) for source,target in zip(pre,shuffled.indices))
    assert len(set(zip(pre,shuffled.indices)))==graph.e and not np.any(pre==shuffled.indices)
    repeated,again=constrained_shuffle(graph,3,20,strata=["a"]*6+["b"]*6,protected_edges=protected[::-1])
    np.testing.assert_array_equal(shuffled.indices,repeated.indices)
    assert again==report and repeated.identity==shuffled.identity
    all_fixed,none=constrained_shuffle(graph,3,20,protected_edges=np.arange(graph.e))
    for edge in range(graph.e):
        retained=all_fixed.edge_index(graph.ids[pre[edge]],graph.ids[graph.indices[edge]])
        assert all_fixed.contacts[retained]==graph.contacts[edge]
    assert none["attemptedSwaps"]==0 and none["changedMutableFraction"]==0
    assert none["mixingAdequacy"]=="REQUIRES_PREREGISTERED_THRESHOLD"
    for bad in ([1.0],[True],[0,True],[-1],[graph.e],[1,1],[[1]]):
        with pytest.raises(ValueError,match="[Pp]rotected"):
            constrained_shuffle(graph,3,protected_edges=bad)


def test_yoked_dose_and_random_action_dwell_checkpoint():
    original=np.array([0,0,-1,0,0,-.5,0])
    shifted,report=yoked_schedule(original,4,2)
    assert shifted.sum()==original.sum() and report["shiftBins"]>=2
    sequence=[{"movement":"N","fire":False}]*3+[{"movement":"E","fire":True}]*2+[{"movement":"idle","fire":False}]
    control=TimingMatchedRandom(sequence,3)
    output=[control.next_action() for _ in sequence]
    assert Counter(tuple(a.items()) for a in output)==Counter(tuple(a.items()) for a in sequence)
    state=control.state_dict(); future=[control.next_action() for _ in range(14)]
    control.restore(state)
    assert future==[control.next_action() for _ in range(14)]


def test_failed_no_us_conditioning_is_not_learning():
    report=conditioning_gate([.8,.8],[0,0],[0,0],[.8,.8],minimum_selectivity=.1)
    assert report["status"]=="FAIL"
    empty=gate_report({"graph":"x"})
    with pytest.raises(ValueError):
        require_training_gates(empty,{"graph":"x"})


def test_evaluator_filesystem_boundary_in_separate_process(tmp_path):
    denied=tmp_path/"evaluator"; denied.mkdir(); (denied/"score.json").write_text("{}")
    code="""import pathlib,sys
from scicon_fly.worker import install_filesystem_boundary
root=pathlib.Path(sys.argv[1]); install_filesystem_boundary([root])
for operation in [lambda:(root/'score.json').read_text(),lambda:list(root.iterdir())]:
    try: operation()
    except PermissionError: pass
    else: raise AssertionError('evaluator access was permitted')
print('denied')
"""
    run=subprocess.run([sys.executable,"-c",code,str(denied)],capture_output=True,text=True,
                       env={**os.environ,"PYTHONPATH":str(Path(__file__).resolve().parents[1])})
    assert run.returncode==0,run.stderr
    assert run.stdout.strip()=="denied"
