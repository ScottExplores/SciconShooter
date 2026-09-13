"""Sealed episode schedules and replica-level study execution/analysis.

Planning never simulates an episode. Execution requires real model manifests,
identity-bound gates, preregistered control evidence and an explicit time budget.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import time
import numpy as np
import pyarrow.parquet as pq
from .artifacts import LAB_ROOT, atomic_json, digest, verify_export
from .statistics import paired_replica_estimate, factorial_interaction, holm_adjust, required_replicas
from .validation import evidence_report, validate_declared_checks, validate_gate_evidence, validate_shuffled_graph
from .model import file_hash

CONDITIONS = {'intact-fixed','intact-plastic','shuffled-fixed','shuffled-plastic','matched-random','yoked-reward','plasticity-block','sham'}
PLASTIC = {'intact-plastic','shuffled-plastic','yoked-reward','plasticity-block','sham'}
FIXED_TRAINING_MODE = 'reward-exposed-frozen-plasticity'


def seed_for(master, *labels):
    """Domain-separated uint32 streams; condition never enters environment seeds."""
    return int.from_bytes(hashlib.sha256(json.dumps([master,*labels],separators=(',',':')).encode()).digest()[:4], 'little')


def plan(spec):
    if spec.get('schemaVersion') != 1 or spec.get('scenario') != 'operation-open-galaxy':
        raise ValueError('Only version 1 ORBIT ENTRY studies are supported')
    conditions=spec['conditions']
    if not conditions or len(set(conditions))!=len(conditions) or not set(conditions)<=CONDITIONS:
        raise ValueError('Unknown or duplicate conditions')
    if set(conditions)&{'intact-fixed','shuffled-fixed'} and spec.get('fixedTrainingMode')!=FIXED_TRAINING_MODE:
        raise ValueError('Fixed training must explicitly declare reward-exposed-frozen-plasticity; withholding DAN input confounds the factorial contrast')
    for key in ('replicas','trainingEpisodes','evaluationEpisodes'):
        if type(spec[key]) is not int or spec[key]<1:raise ValueError(f'Invalid {key}')
    if spec['replicas']<2:raise ValueError('At least two independent replicas are required')
    if type(spec['masterSeed']) is not int or not 0<=spec['masterSeed']<2**32:raise ValueError('Invalid master seed')
    if not 1<=spec['timeLimitSeconds']<=90:raise ValueError('Invalid episode horizon')
    if spec.get('status')!='EXPLORATORY':raise ValueError('Confirmatory protocols require a separately frozen power assessment; this runner is exploratory')
    evaluation=spec.get('evaluation',{})
    if evaluation.get('plasticity') is not False or evaluation.get('passiveEfficacyRelaxation') is not False or evaluation.get('resetTransientState') is not True:
        raise ValueError('Evaluation must reset transients and freeze every efficacy update')
    rows=[]
    # A donor finishes training before its matched yoked condition begins.
    ordered=sorted(conditions,key=lambda c:(c=='yoked-reward',conditions.index(c)))
    for replica in range(spec['replicas']):
        for condition in ordered:
            for phase,count in [('pre',spec['evaluationEpisodes']),('training',spec['trainingEpisodes']),('post',spec['evaluationEpisodes'])]:
                for episode in range(count):
                    stream='evaluation' if phase!='training' else 'training'
                    rows.append({'replica':replica,'condition':condition,'phase':phase,'episode':episode,
                                 'seed':seed_for(spec['masterSeed'],stream,replica,episode),
                                 'initializationSeed':seed_for(spec['masterSeed'],'neural',replica),
                                 'shuffleSeed':seed_for(spec['masterSeed'],'rewiring',replica)})
    return {'schemaVersion':1,'protocolHash':digest(spec),'protocol':spec,'episodes':rows,
            'maximumSimulatedSeconds':len(rows)*spec['timeLimitSeconds'],
            'evidence':'INSUFFICIENT EVIDENCE','evaluationSeeds':'Orchestrator only; neural worker receives pixels and reinforcement'}


def confined_config(name):
    path=(LAB_ROOT/'configs'/str(name)).resolve()
    if not path.is_relative_to((LAB_ROOT/'configs').resolve()) or not path.is_file():raise ValueError('Configuration file must exist in fly-lab/configs')
    return path


def preflight(spec, *, load_models=False):
    schedule=plan(spec);failures=[];identities={};models={};reports={};interventions={};frozen_files={};wrapper_hashes={}
    if 'yoked-reward' in spec['conditions'] and 'intact-plastic' not in spec['conditions']:
        failures.append('Yoked control requires an intact-plastic donor for each replica')
    if 'yoked-reward' in spec['conditions']:
        minimum=spec.get('minimumShiftBins')
        bins=decision_count(spec['timeLimitSeconds'])
        if spec.get('yokedMode')!='temporally-shuffled' or type(minimum) is not int or not 1<=minimum<=(bins-1)//2:
            failures.append('Yoked control requires preregistered temporally-shuffled mode and valid minimumShiftBins; unaltered same-seed donors are prohibited')
    for condition in spec['conditions']:
        if condition=='matched-random':
            try:
                calibration=json.loads(confined_config(spec['randomCalibration']).read_text())
                from .controls import TimingMatchedRandom
                TimingMatchedRandom(calibration['actions'],0)
                if calibration.get('sourceRole')!='preregistered-calibration':raise ValueError('Calibration cannot use held-out evaluation actions')
            except (KeyError,ValueError,OSError) as error:failures.append(f'{condition}: {error}')
            continue
        configs=spec.get('models',{}).get(condition,[])
        if not isinstance(configs,list) or len(configs)!=spec['replicas']:
            failures.append(f'{condition}: supply one frozen model configuration per independent replica')
            continue
        for replica,name in enumerate(configs):
            try:
                model_spec=json.loads(confined_config(name).read_text())
                models[condition,replica]=model_spec
                if model_spec.get('initializationSeed')!=seed_for(spec['masterSeed'],'neural',replica):raise ValueError('Replica initialization seed not declared')
                evidence=model_spec.get('controlValidation',{})
                if condition.startswith('shuffled') and (evidence.get('rewiring')!='PASS' or evidence.get('activityMatching')!='PASS' or not evidence.get('report')):
                    raise ValueError('Shuffled control requires preserved-statistics, mixing and activity evidence')
                if condition in ('plasticity-block','sham') and (evidence.get('intervention')!='PASS' or not evidence.get('report')):
                    raise ValueError('Intervention/sham validation report required')
                if condition in ('plasticity-block','sham') and 'lesions' not in model_spec:raise ValueError('Explicit intervention/sham manifest required')
                if condition.startswith('shuffled') or condition in ('plasticity-block','sham'):
                    report=evidence_report(evidence.get('report'),root=LAB_ROOT)
                    protocol=validate_declared_checks(report,root=LAB_ROOT,key='activityMatchingChecks' if condition.startswith('shuffled') else 'checks')
                    if condition.startswith('shuffled') and any(report.get(k)!=protocol.get(k) for k in ('minimumChangedFraction','strataAnnotations')):
                        raise ValueError('Shuffle thresholds/strata differ from preregistration')
                    reports[condition,replica]=report
                for key in ('graph','manifest','vision','decoder','plasticity','gates'):
                    path=(LAB_ROOT/model_spec[key]).resolve()
                    if not path.is_relative_to(LAB_ROOT) or not path.is_file():raise ValueError(f'Missing or invalid {key}')
                if load_models:
                    from .worker import WorkerSession
                    from .model import SparseGraph,LIFParameters
                    def read(key):return json.loads((LAB_ROOT/model_spec[key]).read_text()) if key in model_spec else None
                    brain=WorkerSession(SparseGraph.load(LAB_ROOT/model_spec['graph'],LAB_ROOT/model_spec['manifest']),read('vision'),read('decoder'),plasticity_manifest=read('plasticity'),parameters=LIFParameters(**(read('parameters') or {})),gates=read('gates'),lesion_manifest=read('lesions'))
                    validate_gate_evidence(brain.gates,brain.identity,root=LAB_ROOT)
                    identities[f'{condition}:{replica}']=brain.identity
                    wrapper_hashes[f'{condition}:{replica}']=file_hash(confined_config(name))
                    frozen_files[f'{condition}:{replica}']={key:{'path':model_spec[key],'sha256':file_hash(LAB_ROOT/model_spec[key])}
                        for key in ('graph','manifest','vision','decoder','plasticity','parameters','gates','lesions') if key in model_spec}
                    if condition in ('plasticity-block','sham'):
                        report=reports[condition,replica]
                        if report.get('identity')!=brain.identity:raise ValueError('Intervention report model identity mismatch')
                        training=np.flatnonzero(brain.lesions.masks['training'])
                        frozen=np.flatnonzero(brain.lesions.masks['frozen'])
                        plastic_cells=set(brain.plasticity.pre.tolist()+brain.plasticity.dan.tolist()+brain.graph.indices[brain.plasticity.edge].tolist())
                        if len(frozen) or not len(training):raise ValueError('Acquisition controls require nonempty training-only silencing')
                        if condition=='plasticity-block':
                            if report.get('interventionKind')!='acquisition-dan-silencing' or set(brain.plasticity.dan.tolist())!=set(training.tolist()):
                                raise ValueError('Plasticity-block control must silence exactly the nominated compartment DANs during acquisition')
                            if np.any(brain.plasticity.dan_baseline!=0):
                                raise ValueError('DAN silencing does not block the centered plasticity rule with a nonzero DAN baseline')
                        elif report.get('interventionKind')!='sham-cell-silencing' or plastic_cells.intersection(training.tolist()):
                            raise ValueError('Sham must silence nominated control cells outside the plastic KC/DAN/MBON circuit')
                        interventions[condition,replica]=len(training)
                    del brain
            except (KeyError,ValueError,OSError) as error:failures.append(f'{condition} replica {replica}: {error}')
    # In each factorial pair, toggling updates must be the only model change.
    for replica in range(spec['replicas']):
        for a,b in [('intact-fixed','intact-plastic'),('shuffled-fixed','shuffled-plastic'),('intact-plastic','yoked-reward')]:
            if f'{a}:{replica}' in identities and f'{b}:{replica}' in identities and identities[f'{a}:{replica}']!=identities[f'{b}:{replica}']:
                failures.append(f'{a}/{b} replica {replica}: physiology/sensory/decoder/plasticity identities differ')
        if load_models:
            intact=models.get(('intact-plastic',replica),models.get(('intact-fixed',replica)))
            for condition in [c for c in spec['conditions'] if c.startswith('shuffled') or c in ('plasticity-block','sham')]:
                try:
                    candidate=models.get((condition,replica))
                    if not intact or not candidate:raise ValueError('Control requires an actual intact model from the same replica')
                    def manifest(model,key):
                        value=json.loads((LAB_ROOT/model[key]).read_text()) if key in model else {}
                        if isinstance(value,dict):value.pop('graphHash',None)
                        return value
                    for key in ('vision','decoder','plasticity','parameters'):
                        if manifest(intact,key)!=manifest(candidate,key):raise ValueError(f'Control changed non-topological {key} definitions')
                    from .model import SparseGraph
                    parent=SparseGraph.load(LAB_ROOT/intact['graph'],LAB_ROOT/intact['manifest'])
                    other=SparseGraph.load(LAB_ROOT/candidate['graph'],LAB_ROOT/candidate['manifest'])
                    if condition.startswith('shuffled'):
                        validate_shuffled_graph(parent,other,seed_for(spec['masterSeed'],'rewiring',replica),reports[condition,replica])
                        if manifest(intact,'lesions')!=manifest(candidate,'lesions'):raise ValueError('Shuffled control changed lesions')
                    elif other.identity!=parent.identity:raise ValueError('Intervention control changed anatomy')
                    del parent,other
                    if condition=='sham' and (('plasticity-block',replica) not in interventions or interventions.get((condition,replica))!=interventions['plasticity-block',replica]):
                        raise ValueError('Sham and plasticity-block must silence the same number of cells')
                except (KeyError,ValueError,OSError) as error:failures.append(f'{condition} replica {replica}: {error}')
    return {'ready':not failures,'failures':failures,'identities':identities,'frozenModelFiles':frozen_files,'modelConfigHashes':wrapper_hashes,'protocolHash':schedule['protocolHash'],
            'episodeCount':len(schedule['episodes']),'maximumSimulatedSeconds':schedule['maximumSimulatedSeconds']}


def decision_count(seconds):
    """The browser floors the 60-Hz horizon and may return a final partial action."""
    return (max(1,int(np.floor(seconds*60)))+2)//3


def yoked_exposure(outcomes, schedule, metadata):
    actual=np.asarray(outcomes,dtype=float);planned=np.asarray(schedule,dtype=float)
    received=planned[:len(actual)]
    correlation=float(np.corrcoef(actual,received)[0,1]) if len(actual)>1 and np.std(actual)>0 and np.std(received)>0 else None
    return {**metadata,'outcomeCorrelation':correlation,'observedDecisions':len(actual),'plannedDecisions':len(planned),
            'plannedPositiveDose':float(planned[planned>0].sum()),'plannedNegativeDose':float(planned[planned<0].sum()),
            'deliveredPositiveDose':float(received[received>0].sum()),'deliveredNegativeDose':float(received[received<0].sum()),
            'censoredScheduleBins':len(planned)-len(actual),'interpretation':'Recipient early termination can censor imposed reinforcement; inspect realized dose matching'}


def validate_episode_model(check, key, reset_result):
    if reset_result['config'].get('modelFiles')!=check['frozenModelFiles'][key]:
        raise ValueError('Model files changed after study preflight; replica continuity is invalid')


def expected_execution(row):
    """Preregistered execution contract; held-out evaluation never delivers US."""
    if row['condition']=='matched-random':
        return {'controller':'matched-random','neuralMode':None,'reinforcementProtocol':'none'}
    if row['phase']!='training':
        return {'controller':'neural-fixed','neuralMode':'frozen','reinforcementProtocol':'none'}
    plastic=row['condition'] in PLASTIC
    return {'controller':'neural-plastic' if plastic else 'neural-fixed',
            'neuralMode':'training' if plastic else 'training-fixed',
            'reinforcementProtocol':'signed-dan-yoked-v1' if row['condition']=='yoked-reward' else 'signed-dan-outcome-v1'}


def validate_episode_execution(row, config, *, protocol_hash, summary=None):
    """Check server-stamped modes before running and in sealed final artifacts.

    The server verifies the actual worker mode on every neural update, including
    terminal reinforcement. Do not infer executed modes from condition labels.
    """
    expected=expected_execution(row)
    if any(key not in config or config[key]!=value for key,value in expected.items()):
        raise ValueError('Episode execution mode or reinforcement protocol differs from the sealed study')
    actual_study=config.get('study',{})
    if config.get('phase')!=row['phase'] or actual_study.get('protocolHash')!=protocol_hash or any(actual_study.get(key)!=value for key,value in row.items()):
        raise ValueError('Episode phase or study identity differs from the sealed schedule')
    if summary is not None and any(key not in summary or summary[key]!=expected[key] for key in ('neuralMode','reinforcementProtocol')):
        raise ValueError('Final artifact execution mode or reinforcement protocol differs from its configuration')
    return {key:config[key] for key in ('neuralMode','reinforcementProtocol')} | {'protocolHash':protocol_hash}


def analyze(spec, records):
    """Only completed pre/post episodes enter complete paired replica matrices."""
    planned=plan(spec)
    expected={(r['condition'],r['replica'],r['phase'],r['episode']):r for r in planned['episodes']}
    values={};failures=[]
    for record in records:
        key=tuple(record[k] for k in ('condition','replica','phase','episode'))
        if key in values or key not in expected:raise ValueError('Duplicate or unplanned episode')
        if record.get('seed')!=expected[key]['seed']:raise ValueError('Evaluation seed mismatch')
        if record.get('status')!='completed':failures.append(list(key));continue
        contract=expected_execution(expected[key])
        if record.get('protocolHash')!=planned['protocolHash'] or any(name not in record or record[name]!=contract[name] for name in ('neuralMode','reinforcementProtocol')):
            raise ValueError('Unverified or incompatible episode execution: legacy fixed-training runs without DAN input cannot enter this study')
        score=record.get('score')
        if type(score) not in (int,float) or not np.isfinite(score):raise ValueError('Invalid endpoint')
        values[key]=score
    missing=[list(key) for key in expected if key not in values]
    if missing:return {'evidence':'INSUFFICIENT EVIDENCE','complete':False,'missingEpisodes':missing,'interruptedEpisodes':failures,'reason':'Incomplete attempts are not imputed as losses or silently discarded'}
    matrices={};estimates={}
    for condition in spec['conditions']:
        before=np.array([[values[condition,r,'pre',e] for e in range(spec['evaluationEpisodes'])] for r in range(spec['replicas'])])
        after=np.array([[values[condition,r,'post',e] for e in range(spec['evaluationEpisodes'])] for r in range(spec['replicas'])])
        matrices[condition]=after-before
        estimates[condition]=paired_replica_estimate(before,after,seed=spec['masterSeed'])
    comparisons={}
    for control in ['intact-fixed','yoked-reward']:
        if control in matrices and 'intact-plastic' in matrices:
            comparisons['plastic-vs-'+control]=paired_replica_estimate(matrices[control],matrices['intact-plastic'],seed=spec['masterSeed'])
    factorial=['intact-fixed','intact-plastic','shuffled-fixed','shuffled-plastic']
    if all(c in matrices for c in factorial):comparisons['topology-plasticity-interaction']=factorial_interaction(*(matrices[c] for c in factorial),seed=spec['masterSeed'])
    adjusted=holm_adjust([v['pValue'] for v in comparisons.values()])
    for result,p in zip(comparisons.values(),adjusted):result['holmAdjustedP']=p
    power={}
    for name,result in comparisons.items():
        sd=float(np.std(result['replicaDeltas'],ddof=1))
        baseline_sd=float(np.std([values['intact-fixed',r,'pre',e] for r in range(spec['replicas']) for e in range(spec['evaluationEpisodes'])],ddof=1)) if 'intact-fixed' in matrices else 0
        if sd>0 and baseline_sd>0:
            estimate=required_replicas(.5*baseline_sd,sd,power=.9,comparisons=max(1,len(comparisons)))
            estimate['independentReplicasPerCondition']=max(20,estimate['independentReplicasPerCondition']);power[name]=estimate
    return {'complete':True,'evidence':'INSUFFICIENT EVIDENCE','studyStatus':'EXPLORATORY','protocolHash':planned['protocolHash'],
            'estimand':'Difference in replica-level pre/post frozen score change','conditionChanges':estimates,'primaryComparisons':comparisons,
            'confirmatoryPlanning':power,'learningClaim':'No automatic claim: sensory gates, controls, effect threshold, replication and limitations require scientific review'}


def execute(spec, output, *, maximum_wall_hours):
    """Runs only validated configurations. Never starts the multi-month default blindly."""
    check=preflight(spec,load_models=True)
    if not check['ready']:raise ValueError('Study blocked: '+'; '.join(check['failures']))
    ratio=spec.get('measuredWallSecondsPerSimulatedSecond')
    if not isinstance(ratio,(int,float)) or not np.isfinite(ratio) or ratio<=0:raise ValueError('Record an end-to-end measured throughput before execution')
    if not np.isfinite(maximum_wall_hours) or maximum_wall_hours<=0:raise ValueError('A finite positive wall-clock budget is required')
    estimate=check['maximumSimulatedSeconds']*ratio/3600
    if estimate>maximum_wall_hours:raise ValueError(f'Estimated {estimate:.1f} hours exceeds the declared {maximum_wall_hours:g}-hour budget; optimize and validate first')
    from .server import Coordinator,safe_run
    from .controls import yoked_schedule
    schedule=plan(spec);output=Path(output).resolve();output.mkdir(parents=True,exist_ok=False)
    atomic_json(output/'protocol.json',spec);atomic_json(output/'schedule.sealed.json',schedule);atomic_json(output/'preflight.json',check)
    coordinator=Coordinator();records=[];donors={};previous_pair=None;started=time.monotonic()
    calibration=json.loads(confined_config(spec['randomCalibration']).read_text())['actions'] if 'matched-random' in spec['conditions'] else None
    try:
        for row in schedule['episodes']:
            if time.monotonic()-started>maximum_wall_hours*3600:raise TimeoutError('Declared study compute budget exhausted; remaining attempts are incomplete')
            condition=row['condition'];replica=row['replica'];training=row['phase']=='training';pair=(condition,replica)
            controller='matched-random' if condition=='matched-random' else 'neural-plastic' if training and condition in PLASTIC else 'neural-fixed'
            config={'controller':controller,'seed':row['seed'],'timeLimitSeconds':spec['timeLimitSeconds'],'preserveEfficacy':pair==previous_pair,
                    'phase':row['phase'],'study':{'id':spec['id'],'protocolHash':schedule['protocolHash'],**row},'constantFire':spec.get('constantFire',False),'renderProfile':spec.get('renderProfile','swiftshader')}
            if controller=='matched-random':config['calibrationActions']=calibration
            else:
                config['neuralConfig']=spec['models'][condition][replica]
                if file_hash(confined_config(config['neuralConfig']))!=check['modelConfigHashes'][f'{condition}:{replica}']:
                    raise ValueError('Model configuration changed after study preflight')
            if training and condition=='yoked-reward':
                donor=donors[replica,row['episode']]
                doses,yoke_metadata=yoked_schedule(donor,seed_for(spec['masterSeed'],'yoke',replica,row['episode']),minimum_shift_bins=spec['minimumShiftBins'])
                if np.any(donor) and np.array_equal(doses,donor):
                    raise ValueError('Preregistered temporal shift left nonzero donor doses unchanged; control is degenerate')
                yoke_metadata['changedBins']=int(np.count_nonzero(doses!=donor))
                yoke_metadata['zeroDoseDonor']=not bool(np.any(donor))
                config['study']['yoke']={**yoke_metadata,'minimumShiftBins':spec['minimumShiftBins'],'donorReplica':replica,'donorEpisode':row['episode']}
                config['reinforcementSchedule']=np.asarray(doses).tolist()
            reset_result=coordinator.reset(config)
            validate_episode_execution(row,reset_result['config'],protocol_hash=schedule['protocolHash'])
            if controller!='matched-random':validate_episode_model(check,f'{condition}:{replica}',reset_result)
            previous_pair=pair
            while coordinator.status!='completed':
                if time.monotonic()-started>maximum_wall_hours*3600:raise TimeoutError('Study compute budget exhausted mid-episode')
                coordinator.step()
            run=safe_run(coordinator.run_id);summary=json.loads((run/'summary.json').read_text())
            if verify_export(run):raise ValueError('Finished episode artifact failed checksums')
            recorded_config=json.loads((run/'config.json').read_text())
            execution=validate_episode_execution(row,recorded_config,protocol_hash=schedule['protocolHash'],summary=summary)
            record={**row,**summary,**execution,'runId':coordinator.run_id}
            if training and condition=='yoked-reward':
                outcomes=pq.read_table(run/'rewards.parquet')['reward'].to_numpy()
                record['yokedExposure']=yoked_exposure(outcomes,doses,config['study']['yoke'])
                atomic_json(output/f'yoked-{replica}-{row["episode"]}.json',record['yokedExposure'])
            records.append(record)
            atomic_json(output/'episodes.json',records)
            atomic_json(output/'progress.json',{'completed':len(records),'total':len(schedule['episodes']),'lastRun':coordinator.run_id})
            if training and condition=='intact-plastic':
                doses=pq.read_table(run/'rewards.parquet')['reward'].to_numpy()
                donors[replica,row['episode']]=np.pad(doses,(0,decision_count(spec['timeLimitSeconds'])-len(doses)))
        analysis=analyze(spec,records);atomic_json(output/'analysis.json',analysis)
        (output/'report.md').write_text('# Scicon Fly Lab study\n\nEXPLORATORY — INSUFFICIENT EVIDENCE\n\n```json\n'+json.dumps(analysis,indent=2)+'\n```\n',encoding='utf8')
        return analysis
    except Exception as error:
        atomic_json(output/'interrupted.json',{'error':str(error),'completed':len(records),'remaining':len(schedule['episodes'])-len(records),'time':datetime.now(timezone.utc).isoformat()})
        atomic_json(output/'analysis.json',analyze(spec,records));raise
    finally:coordinator.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('operation',choices=['plan','preflight','run','analyze'])
    parser.add_argument('protocol');parser.add_argument('--output');parser.add_argument('--episodes');parser.add_argument('--max-wall-hours',type=float,default=24)
    args=parser.parse_args();spec=json.loads(Path(args.protocol).read_text())
    if args.operation=='plan':result=plan(spec)
    elif args.operation=='preflight':result=preflight(spec,load_models=True)
    elif args.operation=='analyze':result=analyze(spec,json.loads(Path(args.episodes).read_text()))
    else:
        if not args.output:parser.error('run requires a new --output directory')
        result=execute(spec,args.output,maximum_wall_hours=args.max_wall_hours)
    if args.output and args.operation!='run':atomic_json(args.output,result)
    print(json.dumps(result,indent=2))
    return 2 if args.operation=='preflight' and not result['ready'] else 0


if __name__=='__main__':raise SystemExit(main())
