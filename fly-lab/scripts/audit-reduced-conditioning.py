"""Independent saved-artifact checks; does not import the experiment simulator."""
import os
for key in ('OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS'):
    os.environ[key]='2'
import hashlib,json,math
from datetime import datetime,timezone
from pathlib import Path
import numpy as np

LAB=Path(__file__).resolve().parents[1]
ROOT=LAB/'evidence/reduced-conditioning-v1'
read=lambda name:json.loads((ROOT/name).read_text())
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
canonical=lambda value:json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
experiment=read('public-experiment.json'); circuit=read('circuit.json'); frozen=read('frozen-protocol.json'); checksums=read('checksums.json')
checks=[]
def check(name,passed,detail):
    checks.append({'id':name,'passed':bool(passed),'detail':detail})
    if not passed:raise AssertionError(name+': '+detail)
check('artifact-checksums',all(sha(ROOT/name)==expected for name,expected in checksums.items()),'Every original frozen artifact matches its checksum.')
check('source-freeze',all(sha(LAB/name)==expected for name,expected in frozen['sourceHashes'].items()),'Exact model, runner and configuration still match the pre-outcome freeze.')
check('circuit-freeze',hashlib.sha256(canonical(circuit).encode()).hexdigest()==frozen['circuitHash'],'Extracted real circuit equals its pre-outcome hash.')
replicas=experiment['replicas']; cfg=frozen['protocol']; replay=experiment['replay']; frames=replay['frames']
tuples={(r['condition'],r['seed'],r['reinforcedCue']) for r in replicas}
expected={(condition,seed,cue) for condition in cfg['conditions'] for seed in cfg['seeds'] for cue in cfg['reinforcedCues']}
check('all-assignments',tuples==expected and len(tuples)==len(replicas)==96,'Six conditions x eight assignment seeds x two reinforced cue identities; no dropped result.')
error=0.
for r in replicas:
    for cue in ('A','B'):
        calculated=1-r['postResponseHz'][cue]/r['preResponseHz'][cue]
        error=max(error,abs(calculated-r['suppression'][cue]))
for row in experiment['results']:
    selected=[r for r in replicas if r['condition']==row['condition']]
    for key in ('SpecificSuppression','CsPlusSuppression','CsMinusSuppression'):
        error=max(error,abs(sum(r[key[0].lower()+key[1:]] for r in selected)/len(selected)-row['mean'+key]))
check('all-summary-arithmetic',error<1e-12,f'All 192 cue effects and all condition means independently agree; max error {error}.')
contacts=np.array([edge['contacts'] for edge in circuit['edges']],dtype=float)
ids=[edge['kcId'] for edge in circuit['edges']]; lookup={name:i for i,name in enumerate(ids)}
check('real-selected-edges',len(ids)==720 and len(set(ids))==720 and all(e['contacts']>0 and e['danToKcContacts']>0 and e['mbonId']=='11402' and e['danId']=='11327' for e in circuit['edges']),'Every selected KC has positive released contacts to MBON11402 and from DAN11327; no invented zero-contact edge.')
selected=next(r for r in replicas if r['condition']=='paired' and r['seed']==replay['seed'] and r['reinforcedCue']==replay['reinforcedCue'])
checkpoint=next(r['state'] for r in read('checkpoints.json') if r['condition']=='paired' and r['seed']==replay['seed'] and r['reinforcedCue']==replay['reinforcedCue'])
gains=np.array(checkpoint['gains']); masks={cue:np.array([name in set(selected['cueIds'][cue]) for name in ids],dtype=float) for cue in ('A','B')}
check('cue-identity',all(int(mask.sum())==36 for mask in masks.values()) and np.dot(masks['A'],masks['B'])==0,'Two fixed 5% direct-input patterns, disjoint by design; not biological sensory representations.')
sample_indices=[lookup[c['id']] for c in replay['sampledCells'] if c['role']=='KC']
step=0; maximum_frame_error=0.; maximum_checkpoint_error=0.; replay_count=0
dt=cfg['dtSeconds']; decay=math.exp(-dt/cfg['cellTimeConstantSeconds']); eligibility_decay=math.exp(-dt/cfg['eligibilityTimeConstantSeconds'])
w=np.ones(len(ids)); kc=np.zeros(len(ids)); eligibility=np.zeros(len(ids)); dan=0.; output=0.; zero=np.zeros(len(ids))
def reset():
    global kc,eligibility,dan,output
    kc=np.zeros(len(ids));eligibility=np.zeros(len(ids));dan=0.;output=0.
def integrate(mask,reinforcement,phase,cue,trial,plastic):
    global step,kc,eligibility,dan,output,w,maximum_frame_error,replay_count
    kc=cfg['kcDriveHz']*gains*mask+(kc-cfg['kcDriveHz']*gains*mask)*decay
    dan=cfg['danDriveHz']*reinforcement+(dan-cfg['danDriveHz']*reinforcement)*decay
    if plastic:
        eligibility=kc/cfg['kcDriveHz']+(eligibility-kc/cfg['kcDriveHz'])*eligibility_decay
        w=np.maximum(cfg['minimumEfficacy'],np.minimum(cfg['maximumEfficacy'],w*np.exp(-dt*cfg['etaPerSecond']*eligibility*dan/cfg['danDriveHz'])))
    drive=float(np.sum(contacts*w*kc)/np.sum(contacts))*cfg['mbonGain']
    output=drive+(output-drive)*decay
    if step%round(cfg['samplePeriodSeconds']/dt)==0:
        frame=frames[replay_count]
        assert (frame['stage'],frame['cue'],frame['trial'],frame['reinforcementInput'])==(phase,cue,trial,reinforcement)
        expected_values=[*kc[sample_indices],dan,output]
        maximum_frame_error=max(maximum_frame_error,float(np.max(np.abs(np.array(expected_values)-frame['cellRatesHz']))),abs((step+1)*dt-frame['timeSeconds']),abs(float(w.mean())-frame['meanEfficacy']),abs(float(w[masks['A'].astype(bool)].mean())-frame['csPlusMeanEfficacy']),abs(float(w[masks['B'].astype(bool)].mean())-frame['csMinusMeanEfficacy']))
        replay_count+=1
    step+=1
def probe(phase):
    responses={}
    for cue in ('A','B'):
        reset(); trace=[]
        for tick in range(round(cfg['probeSeconds']/dt)):
            integrate(masks[cue],0,phase,cue,0,False)
            if tick*dt>=cfg['probeMeasureStartSeconds']:trace.append(output)
        responses[cue]=float(np.mean(trace))
    return responses
before=probe('pre'); reset()
for slot in range(2*cfg['trainingPairs']):
    cue='A' if slot%2==0 else 'B'
    for tick in range(round(cfg['slotSeconds']/dt)):
        t=tick*dt; cue_on=cfg['cueStartSeconds']<=t<cfg['cueStartSeconds']+cfg['cueSeconds']
        reinforce=int(cue==replay['reinforcedCue'] and cfg['pairedReinforcementStartSeconds']<=t<cfg['pairedReinforcementStartSeconds']+cfg['reinforcementSeconds'])
        integrate(masks[cue] if cue_on else zero,reinforce,'training',cue if cue_on else None,slot//2+1,True)
for key,value in [('efficacy',w),('kc',kc),('eligibility',eligibility),('dan',dan),('mbon',output)]:
    maximum_checkpoint_error=max(maximum_checkpoint_error,float(np.max(np.abs(np.asarray(value)-np.asarray(checkpoint[key])))))
after=probe('post')
check('all-recorded-activity',replay_count==len(frames) and maximum_frame_error<1e-9,f'Independent equation reconstruction agrees with all {replay_count} frames and 18 recorded cells; max absolute error {maximum_frame_error}.')
check('checkpoint-equations',maximum_checkpoint_error<1e-9,f'Independently reconstructed trained rates, eligibility and 720 efficacies match saved checkpoint; max error {maximum_checkpoint_error}.')
check('probe-measurements',max(abs(before[cue]-selected['preResponseHz'][cue]) for cue in ('A','B'))<1e-9 and max(abs(after[cue]-selected['postResponseHz'][cue]) for cue in ('A','B'))<1e-9,'Independent pre/post probe means match the selected published execution.')
report={'auditedAt':datetime.now(timezone.utc).isoformat(),'status':'PASS','scope':'Independent saved-artifact arithmetic and equation reconstruction; not biological validation. No original simulator imported.','publicExperimentSha256':sha(ROOT/'public-experiment.json'),'checks':checks,'maximumRecordedValueError':maximum_frame_error,'maximumCheckpointError':maximum_checkpoint_error}
target=LAB/'docs/evidence/reduced-conditioning-v1-independent-audit.json'
target.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
