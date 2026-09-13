"""Append-only experiment records, atomic finalization and verifiable exports."""
from __future__ import annotations
import base64, gzip, hashlib, json, os, subprocess, tempfile, zipfile
from datetime import datetime, timezone
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq

LAB_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = LAB_ROOT.parent

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode()

def digest(value): return hashlib.sha256(canonical(value)).hexdigest()

def atomic_json(path, value):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_name(path.name+'.tmp')
    with temporary.open('wb') as stream:
        stream.write(canonical(value)); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary,path)

def source_identity():
    paths=[]
    for directory in ['services','components','game-config','shared','fly-lab/environment','fly-lab/src','fly-lab/python/scicon_fly','fly-lab/scripts','fly-lab/configs']:
        parent=REPO_ROOT/directory
        if parent.exists(): paths += [p for p in parent.rglob('*') if p.is_file() and p.suffix in ('.ts','.tsx','.js','.mjs','.json','.py','.html','.css') and '__pycache__' not in p.parts]
    paths += [REPO_ROOT/p for p in ['constants.ts','types.ts','package.json','package-lock.json','tsconfig.json','fly-lab/package.json','fly-lab/package-lock.json','fly-lab/requirements.txt','fly-lab/requirements.lock.txt','fly-lab/index.html','fly-lab/vite.config.ts','fly-lab/tsconfig.json'] if (REPO_ROOT/p).exists()]
    files={p.relative_to(REPO_ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
    try: commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO_ROOT,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).strip()
    except Exception: commit='unavailable'
    return {'gitCommit':commit,'sourceTreeHash':digest(files),'files':files}

class RunWriter:
    def __init__(self,root,run_id,config,dataset=None):
        self.path=Path(root)/run_id; self.path.mkdir(parents=True,exist_ok=False)
        self.rows={k:[] for k in ['events','actions','rewards','neural-summary','synaptic-changes']}
        self.part=0; self.closed=False; self.config=config
        self.started=datetime.now(timezone.utc).isoformat()
        source=source_identity()
        atomic_json(self.path/'config.json',config)
        atomic_json(self.path/'metadata.json',{'schemaVersion':1,'experimentId':run_id,'startedAt':self.started,'ownerPid':os.getpid(),'configHash':digest(config),'status':'running',**source})
        atomic_json(self.path/'dataset-manifest.json',dataset or {'status':'not_used','controller':config['controller']})
        with zipfile.ZipFile(self.path/'source.zip','w',zipfile.ZIP_DEFLATED) as archive:
            for name,expected in source['files'].items():
                content=(REPO_ROOT/name).read_bytes()
                if hashlib.sha256(content).hexdigest()!=expected:raise RuntimeError('Source changed while snapshotting; reset after editing finishes')
                archive.writestr(name,content)
        self.journal=(self.path/'journal.jsonl').open('a',encoding='utf8',buffering=1)
        self.observations=gzip.open(self.path/'observations.jsonl.gz','wt',encoding='utf8')
    def initial(self,result):
        self.record_observation(result)
        atomic_json(self.path/'initial.json',{'tick':result['tick'],'stateHash':result['stateHash'],'observationHash':result['observation']['sha256'],'frameHash':result.get('frame',{}).get('sha256')})
        atomic_json(self.path/'runtime.json',result.get('runtimeIdentity',{}))
    def record_observation(self,result):
        observation=result.get('observation')
        if observation:
            self.observations.write(json.dumps({'tick':result['tick'],**observation},separators=(',',':'))+'\n')
            self.observations.flush()
    def append(self,seq,action,result,reward,neural=None):
        tick=result['tick']; state=result['state']; observation=result['observation']
        row={'seq':seq,'tick':tick,'movement':action['movement'],'fire':action['fire'],'stateHash':result['stateHash'],'observationHash':observation['sha256'],'frameHash':result.get('frame',{}).get('sha256'),'eventsHash':result.get('eventsHash')}
        self.rows['actions'].append(row)
        self.rows['rewards'].append({'tick':tick,'reward':float(reward)})
        for event in result.get('events',[]): self.rows['events'].append({'tick':tick,'payload':json.dumps(event,sort_keys=True)})
        self.record_neural(tick,neural)
        self.journal.write(json.dumps({'action':row,'reward':reward,'events':result.get('events',[]),'neural':neural,'score':state.get('score'), 'lives':state.get('lives')},separators=(',',':'))+'\n')
        self.journal.flush()
        os.fsync(self.journal.fileno())
        self.record_observation(result)
        if len(self.rows['actions'])>=200: self.flush()
    def record_neural(self,tick,neural):
        if neural:self.rows['neural-summary'].append({'tick':tick,'payload':json.dumps(neural,sort_keys=True)})
        if neural and neural.get('plasticityChanges'):self.rows['synaptic-changes'].append({'tick':tick,'payload':json.dumps(neural['plasticityChanges'],sort_keys=True)})
    def flush(self):
        if not any(self.rows.values()): return
        for name,rows in self.rows.items():
            if rows:
                folder=self.path/'parts'/name; folder.mkdir(parents=True,exist_ok=True)
                target=folder/f'{self.part:06d}.parquet'; temporary=target.with_suffix('.tmp')
                pq.write_table(pa.Table.from_pylist(rows),temporary,compression='zstd'); os.replace(temporary,target); rows.clear()
        self.part+=1
    def finish(self,summary):
        if self.closed:return
        self.flush();self.journal.close();self.observations.close(); self.closed=True
        schemas={'events':pa.schema([('tick',pa.int64()),('payload',pa.string())]),'actions':pa.schema([('seq',pa.int64()),('tick',pa.int64()),('movement',pa.string()),('fire',pa.bool_()),('stateHash',pa.string()),('observationHash',pa.string()),('frameHash',pa.string()),('eventsHash',pa.string())]),'rewards':pa.schema([('tick',pa.int64()),('reward',pa.float64())]),'neural-summary':pa.schema([('tick',pa.int64()),('payload',pa.string())]),'synaptic-changes':pa.schema([('tick',pa.int64()),('payload',pa.string())])}
        for name in self.rows:
            parts=sorted((self.path/'parts'/name).glob('*.parquet'))
            table=pa.concat_tables([pq.read_table(p) for p in parts]) if parts else pa.Table.from_pylist([],schema=schemas[name])
            pq.write_table(table,self.path/(name+'.parquet'),compression='zstd')
        metadata=json.loads((self.path/'metadata.json').read_text())
        metadata.update(status=summary['status'],finishedAt=datetime.now(timezone.utc).isoformat())
        atomic_json(self.path/'metadata.json',metadata);atomic_json(self.path/'summary.json',summary)
        atomic_json(self.path/'statistics.json',{'evidence':'INSUFFICIENT EVIDENCE','reason':'Individual episodes are not independent learning replicas. Use the preregistered study analysis.','episode':summary})
        (self.path/'README.md').write_text('# Scicon Fly Lab experiment\n\n'+
            'This is an individual episode, not evidence of learning.\n\n'+
            'Run `python -m scicon_fly.replay EXPERIMENT_DIRECTORY` with the pinned runtime and local lab web server running. '+
            'Replay checks every recorded action against state and grayscale observation hashes. '+
            'Install the game assets separately from the source checkout; source.zip contains model and game source, not the artwork library.\n\n'+
            'observations.jsonl.gz preserves the exact grayscale policy input. Reward is +1 per enemy destruction and -5 per life lost. '+
            'No hidden game state is sent to a neural worker. Inspect config.json, runtime.json and dataset-manifest.json for model and environment identity.\n',encoding='utf8')
        (self.path/'report.md').write_text(report_markdown(self.path),encoding='utf8')
        files={p.relative_to(self.path).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in self.path.rglob('*') if p.is_file() and p.name!='checksums.json'}
        atomic_json(self.path/'checksums.json',files)

def report_markdown(path):
    path=Path(path);config=json.loads((path/'config.json').read_text());summary=json.loads((path/'summary.json').read_text())
    return '# Scicon Fly Lab — ResearchHub study record\n\n'+ '\n\n'.join([
        '## Background\nA connectome is anatomical evidence; physiological and interface assumptions require separate validation.',
        '## Hypothesis\nA specified plastic model improves frozen held-out performance over matched controls.',
        '## Methods and conditions\n```json\n'+json.dumps(config,indent=2)+'\n```',
        '## Primary endpoint\nReplica-level difference in pre/post frozen ORBIT ENTRY score, compared with fixed and yoked controls.',
        '## Secondary endpoints\nSurvival, enemy destruction, losses, firing duty cycle, movement entropy; scenario transfer is separate.',
        '## Statistical plan\nPaired replica-level intervals and Holm-adjusted primary comparisons. An individual episode cannot establish learning.',
        '## Results\n```json\n'+json.dumps(summary,indent=2)+'\n```',
        '## Limitations\nINSUFFICIENT EVIDENCE. These are software-model measurements, not behavior of a living fly. Biological validation gates and independent trained replicas remain necessary.',
        '## Data and code availability\nThis export contains source.zip, exact policy observations, event/action Parquet tables and hashed provenance. Full MaleCNS raw data and game assets use their original distributions.',
        '## Reproducibility\nSee README.md, metadata.json, runtime.json, dataset-manifest.json and checksums.json.'
    ])+'\n'

def verify_export(path):
    path=Path(path).resolve();failures=[]
    for relative,expected in json.loads((path/'checksums.json').read_text()).items():
        target=(path/relative).resolve()
        if not target.is_relative_to(path) or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=expected: failures.append(relative)
    return failures
