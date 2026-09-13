"""Loopback-only experiment coordinator. The dashboard never owns the simulation clock."""
from __future__ import annotations
import argparse, base64, gzip, hashlib, io, json, os, queue, secrets, shutil, socket, subprocess, sys, threading, time, uuid, zipfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote
import numpy as np
import pyarrow.parquet as pq
import psutil
from PIL import Image
from .artifacts import LAB_ROOT, RunWriter, atomic_json, digest, source_identity
from .controls import TimingMatchedRandom
from .validation import validate_gate_evidence,evidence_file
from .watch import WatchLibrary, PreviewCancelled, byte_range, compact_neural, close_driver
from .watch_signals import get_signals, input_change

MOVEMENTS=['idle','N','NE','E','SE','S','SW','W','NW']
EXPERIMENTS=LAB_ROOT/'experiments';RUNTIME=LAB_ROOT/'runtime';DATA=LAB_ROOT/'data'
for p in [EXPERIMENTS,RUNTIME]: p.mkdir(exist_ok=True)
PROCESS_SOURCE_TREE_HASH=source_identity()['sourceTreeHash']

def assert_process_source_current():
    if source_identity()['sourceTreeHash']!=PROCESS_SOURCE_TREE_HASH:
        raise RuntimeError('Source files changed after the coordinator loaded. Restart the lab after source edits before resetting an episode.')

class JsonProcess:
    def __init__(self,args,name):
        self.include_id=name!='neural'
        self.error_log=(RUNTIME/(name+'.log')).open('a',encoding='utf8')
        env={k:v for k,v in os.environ.items() if k.lower() in ['path','systemroot','windir','comspec','pathext','temp','tmp','userprofile','localappdata','appdata','home','lang','node_extra_ca_certs']}
        env.update(PYTHONPATH=str(LAB_ROOT/'python'),PYTHONUNBUFFERED='1')
        self.process=subprocess.Popen(args,cwd=LAB_ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.error_log,text=True,encoding='utf8',bufsize=1,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.responses=queue.Queue();self.lock=threading.Lock();self.seq=0
        def read():
            for line in self.process.stdout:
                try:self.responses.put(json.loads(line))
                except ValueError:self.error_log.write(line);self.error_log.flush()
            self.responses.put({'ok':False,'error':f'{name} process exited'})
        threading.Thread(target=read,daemon=True).start()
    def call(self,command,timeout=180):
        with self.lock:
            if self.process.poll() is not None:raise RuntimeError('Worker has exited; reset the episode to restart it')
            self.seq+=1; self.process.stdin.write(json.dumps(({'id':self.seq,**command} if self.include_id else command))+'\n'); self.process.stdin.flush()
            try:response=self.responses.get(timeout=timeout)
            except queue.Empty: self.close();raise TimeoutError('Worker command timed out; episode interrupted')
            if self.include_id and response.get('ok') is not False and response.get('id')!=self.seq:raise RuntimeError('Worker response sequence mismatch')
            if response.get('ok') is False or response.get('error'):raise RuntimeError(response.get('error','Worker failed'))
            return response.get('result',response)
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:self.process.wait(10)
            except subprocess.TimeoutExpired:self.process.kill()
        self.error_log.close()

def read_json(path,default=None):
    try:return json.loads(Path(path).read_text(encoding='utf8'))
    except (OSError,ValueError):return default

def dataset_manifest():
    for path in [DATA/'compiled'/'manifest.json',DATA/'male-cns-v1.0'/'manifest.json']:
        value=read_json(path)
        if value:return value
    matches=list(DATA.glob('**/manifest.json')) if DATA.exists() else []
    for path in matches:
        value=read_json(path)
        if value and ('neurons' in value or 'neuron_count' in value or 'counts' in value):return value
    return {'status':'not_ingested'}

def gate_status():
    return read_json(LAB_ROOT/'configs'/'validation-results.json',{'numerical':{'status':'NOT_RUN'},'vision':{'status':'NOT_RUN','reason':'Validated retinal mapping required'},'conditioning':{'status':'NOT_RUN'},'decoder':{'status':'NOT_RUN'}})

def calculate_outcome_reward(previous_state,result):
    """Count confirmed kills and actual life units lost, independent of pickups.

    player-death describes terminal presentation, not a unit of damage. A
    life-loss event is emitted once at the native damage transition and can
    represent more than one lost life. Invalid/missing loss telemetry interrupts
    the episode rather than silently substituting net lives or terminal deaths.
    """
    state=result.get('state');events=result.get('events')
    if not isinstance(previous_state,dict) or not isinstance(state,dict) or not isinstance(events,list):
        raise ValueError('Invalid reward telemetry: state and event list are required')
    counters=[]
    for source in (previous_state,state):
        values=(source.get('enemiesDefeated'),source.get('lives'))
        if any(type(value) is not int or value<0 for value in values):
            raise ValueError('Invalid reward telemetry: kills and lives must be nonnegative integer counters')
        counters.append(values)
    kills=counters[1][0]-counters[0][0]
    if kills<0:
        raise ValueError('Invalid reward telemetry: confirmed kill counter decreased within an episode')
    losses=0
    for event in events:
        if not isinstance(event,dict):
            raise ValueError('Invalid reward telemetry: event must be an object')
        if event.get('type')!='player-life-lost':
            continue
        count=event.get('count');before=event.get('livesBefore');remaining=event.get('livesRemaining')
        if type(count) is not int or count<=0:
            raise ValueError('Invalid reward telemetry: player-life-lost count must be a positive integer')
        if any(type(value) is not int or value<0 for value in (before,remaining)) or before-remaining!=count:
            raise ValueError('Invalid reward telemetry: player-life-lost transition does not match count')
        losses+=count
    if counters[0][1]-counters[1][1]>losses:
        raise ValueError('Invalid reward telemetry: net life drop is missing player-life-lost events')
    return kills-5*losses

def neural_mode_for(controller,phase):
    if controller not in ('neural-fixed','neural-plastic'):
        return None
    if phase!='training':
        return 'frozen'
    return 'training' if controller=='neural-plastic' else 'training-fixed'

def archive_model_evidence(value,destination,seen=None):
    seen=set() if seen is None else seen
    if isinstance(value,dict):
        if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str):
            source=evidence_file(value,root=LAB_ROOT)
            if source not in seen:
                seen.add(source);target=destination/source.relative_to(LAB_ROOT);target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source,target)
                if hashlib.sha256(target.read_bytes()).hexdigest()!=value['sha256']:raise ValueError('Evidence changed while snapshotting')
                if source.suffix=='.json':archive_model_evidence(read_json(source),destination,seen)
        for child in value.values():archive_model_evidence(child,destination,seen)
    elif isinstance(value,list):
        for child in value:archive_model_evidence(child,destination,seen)

class Coordinator:
    def __init__(self):
        self.lock=threading.RLock();self.step_lock=threading.Lock();self.driver=None;self.neural=None
        self.running=False;self.thread=None;self.latest=None;self.writer=None;self.config=None
        self.run_id=None;self.seq=0;self.error=None;self.history=[];self.total_reward=0;self.action={'movement':'idle','fire':False}
        self.status='idle';self.neural_summary=None;self.rng=np.random.default_rng(42);self.hold=0;self.neural_signature=None
        self.matched_random=None;self.reinforcement_schedule=None;self.driver_profile=None
        self.watch_snapshot=None
    def public(self):
        with self.lock:
            latest=self.latest or {};state=latest.get('state',{})
            return {'status':self.status,'running':self.running,'runId':self.run_id,'seq':self.seq,'tick':latest.get('tick',0),'simTimeMs':latest.get('simTimeMs',0),
                'score':state.get('score',0),'lives':state.get('lives',3),'kills':state.get('enemiesDefeated',0),'state':state,
                'action':self.action,'reward':self.history[-1]['reward'] if self.history else 0,'totalReward':self.total_reward,
                'neural':self.neural_summary,'history':self.history[-240:],'config':self.config,'error':self.error,
                'dataset':dataset_manifest(),'gates':gate_status(),'evidence':'INSUFFICIENT EVIDENCE',
                'frameAvailable':bool(latest.get('frame')),'runtimeIdentity':latest.get('runtimeIdentity'),'timings':latest.get('timings')}
    def pause(self):
        self.running=False
        if self.thread and self.thread is not threading.current_thread():self.thread.join(timeout=185)
        with self.lock:
            if self.status=='running':self.status='paused'
    def finish(self,status):
        if self.writer and not self.writer.closed:
            if self.neural:
                try:self.checkpoint('final')
                except Exception as error:self.error=str(error);status='interrupted'
            state=(self.latest or {}).get('state',{})
            exposure=None
            if self.reinforcement_schedule is not None:
                from .study import yoked_exposure
                exposure=yoked_exposure([h['reward'] for h in self.history],self.reinforcement_schedule,(self.config.get('study') or {}).get('yoke',{}))
            self.writer.finish({'experimentId':self.run_id,'status':status,'controller':self.config['controller'],'seed':self.config['seed'],
                'neuralMode':self.config.get('neuralMode'),'reinforcementProtocol':self.config.get('reinforcementProtocol','none'),
                'score':state.get('score',0),'lives':state.get('lives',3),'kills':state.get('enemiesDefeated',0),
                'simTimeMs':(self.latest or {}).get('simTimeMs',0),'decisions':self.seq,'reward':self.total_reward,
                'evidence':'INSUFFICIENT EVIDENCE','error':self.error,'yokedExposure':exposure})
        return status
    def checkpoint(self,label):
        name=self.run_id+'-'+label+'.npz'
        info=self.neural.call({'op':'checkpoint','name':name})
        folder=RUNTIME/'neural';destination=self.writer.path/'checkpoints';destination.mkdir(exist_ok=True)
        for p in folder.glob(name+'*'):shutil.copy2(p,destination/p.name)
        atomic_json(destination/(label+'.json'),info)
    def reset(self,body):
        assert_process_source_current()
        self.pause()
        with self.step_lock:
            self.finish('interrupted' if self.seq else 'cancelled')
            for name in ['driver','neural']:
                process=getattr(self,name)
                if process and process.process.poll() is not None:
                    process.close();setattr(self,name,None)
            controller=body.get('controller','random')
            if controller not in ['random','matched-random','idle','manual','neural-fixed','neural-plastic']:raise ValueError('Unknown controller')
            phase=body.get('phase','training' if controller=='neural-plastic' else 'evaluation')
            neural_mode=neural_mode_for(controller,phase)
            seed=body.get('seed',42)
            if isinstance(seed,bool) or not isinstance(seed,int) or not 0<=seed<2**32:raise ValueError('Seed must be a uint32 integer')
            duration=body.get('timeLimitSeconds',90)
            if not isinstance(duration,(int,float)) or not 1<=duration<=90:raise ValueError('Duration must be 1..90 seconds')
            neural_config=body.get('neuralConfig')
            frozen_model={}
            if controller.startswith('neural'):
                if not neural_config:raise ValueError('A frozen, dataset-bound visual and decoder manifest is required. No placeholder fly controller is supplied.')
                config_path=(LAB_ROOT/'configs'/str(neural_config)).resolve()
                if not config_path.is_relative_to(LAB_ROOT/'configs'):raise ValueError('Invalid neural configuration path')
                spec=read_json(config_path)
                if not spec:raise ValueError('Neural configuration not found')
                args=[sys.executable,'-m','scicon_fly.worker']
                for key in ['graph','manifest','vision','decoder','plasticity','parameters','gates','lesions']:
                    if key in spec:
                        resolved=(LAB_ROOT/spec[key]).resolve()
                        if not resolved.is_relative_to(LAB_ROOT):raise ValueError('Model paths must be in fly-lab')
                        args.extend(['--'+key,str(resolved)])
                        with resolved.open('rb') as stream:frozen_model[key]={'path':spec[key],'sha256':hashlib.file_digest(stream,'sha256').hexdigest()}
                args+=['--deny-root',str(EXPERIMENTS),'--checkpoint-dir',str(RUNTIME/'neural')]
                signature=digest(frozen_model)
                if not self.neural or self.neural_signature!=signature:
                    if self.neural:self.neural.close()
                    self.neural=JsonProcess(args,'neural');self.neural_signature=signature
                    self.neural.call({'op':'reset','preserveEfficacy':False})
                else:self.neural.call({'op':'reset','preserveEfficacy':bool(body.get('preserveEfficacy',False))})
            elif self.neural:self.neural.close();self.neural=None
            calibration=body.get('calibrationActions')
            self.matched_random=TimingMatchedRandom(calibration,seed^0x9E3779B9) if controller=='matched-random' else None
            schedule=body.get('reinforcementSchedule')
            if schedule is not None:
                if neural_mode not in ('training','training-fixed') or not isinstance(schedule,list) or not np.isfinite(np.asarray(schedule,dtype=float)).all():raise ValueError('Finite yoked reinforcement requires a neural training mode')
                if len(schedule)!=(max(1,int(np.floor(duration*60)))+2)//3:raise ValueError('Yoked schedule must cover every decision, including declared zero padding')
            self.reinforcement_schedule=schedule
            render_profile=body.get('renderProfile','swiftshader')
            if render_profile not in ['swiftshader','local-d3d11']:raise ValueError('Unknown rendering profile')
            self.config={'schemaVersion':1,'controller':controller,'seed':seed,'policySeed':seed^0x9E3779B9,
                'neuralMode':neural_mode,'reinforcementProtocol':('signed-dan-yoked-v1' if schedule is not None else 'signed-dan-outcome-v1') if neural_mode in ('training','training-fixed') else 'none',
                'renderProfile':render_profile,
                'episode':{'levelId':'operation-open-galaxy','timeLimitSeconds':duration,'presentationSeed':seed^0xA341316C},
                'decisionHz':20,'gameHz':60,'movement':'native-keyboard-9','fire':'independent','constantFire':bool(body.get('constantFire',False)),
                'reward':{'enemyDestroyed':1,'lifeLost':-5,'lifeLossEvent':'player-life-lost','lifeLossCountField':'count','terminalDeathAffectsReward':False},'neuralConfig':neural_config,'modelFiles':frozen_model,'calibrationActions':calibration,'reinforcementSchedule':schedule,'reinforcementSource':'yoked' if schedule is not None else 'outcomes','preserveEfficacy':bool(body.get('preserveEfficacy',False)),'phase':phase,'study':body.get('study'),'scope':'ORBIT ENTRY stochastic robustness; not scenario transfer'}
            self.run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8]
            self.seq=0;self.history=[];self.total_reward=0;self.error=None;self.hold=0;self.neural_summary=None;self.latest=None;self.watch_snapshot=None
            self.rng=np.random.default_rng(self.config['policySeed']);self.action={'movement':'idle','fire':False};self.status='loading'
            self.writer=RunWriter(EXPERIMENTS,self.run_id,self.config,dataset_manifest() if controller.startswith('neural') else None)
            try:
                for key,info in frozen_model.items():
                    if key!='graph':
                        destination=self.writer.path/'model-manifests'/f'{key}.json';destination.parent.mkdir(exist_ok=True)
                        shutil.copy2(LAB_ROOT/info['path'],destination)
                        if key!='manifest':archive_model_evidence(read_json(destination),self.writer.path/'model-evidence')
                if self.neural:
                    identity=self.neural.call({'op':'status'})
                    if neural_mode not in identity.get('supportedModes',[]):raise ValueError('Worker does not support the configured neural mode')
                    if neural_mode in ('training','training-fixed'):validate_gate_evidence(identity['gates'],identity['identity'],root=LAB_ROOT,synthetic=False)
                    atomic_json(self.writer.path/'model-identity.json',identity)
                    self.checkpoint('initial')
                if self.driver and self.driver_profile!=render_profile:self.driver.close();self.driver=None
                if not self.driver:
                    self.driver=JsonProcess(['node',str(LAB_ROOT/'scripts'/'driver.mjs'),'--render-profile',render_profile],'engine');self.driver_profile=render_profile
                self.latest=self.driver.call({'op':'reset','seed':seed,'episode':self.config['episode']})
                self.writer.initial(self.latest);self.status='ready'
            except Exception as error:self.error=str(error);self.status='error';self.finish('interrupted');raise
        return self.public()
    def choose_action(self,manual=None):
        kind=self.config['controller']
        if kind.startswith('neural'):
            mode=self.config.get('neuralMode',neural_mode_for(kind,self.config.get('phase','training' if kind=='neural-plastic' else 'evaluation')))
            observation={k:self.latest['observation'][k] for k in ['grayBase64','width','height']}
            delivered=self.training_reward(self.seq-1) if self.history and mode in ('training','training-fixed') else 0
            result=self.neural.call({'op':'step','observation':observation,'reinforcement':delivered,'mode':mode})
            self.neural_summary=result.get('summary',result.get('neural'))
            if not isinstance(self.neural_summary,dict) or self.neural_summary.get('mode')!=mode:raise ValueError('Worker did not verify the configured neural mode')
            if self.neural_summary is not None:self.neural_summary['deliveredReinforcement']=delivered
            action=result.get('action',result)
        elif kind=='matched-random':action=self.matched_random.next_action()
        elif kind=='random':
            if self.hold<=0:
                self.action={'movement':MOVEMENTS[int(self.rng.integers(9))],'fire':bool(self.rng.integers(2))};self.hold=int(self.rng.integers(2,9))
            self.hold-=1;action=self.action.copy()
        elif kind=='manual':action=manual or {'movement':'idle','fire':False}
        else:action={'movement':'idle','fire':False}
        if self.config['constantFire']:action={**action,'fire':True}
        if action.get('movement') not in MOVEMENTS or not isinstance(action.get('fire'),bool):raise ValueError('Invalid action')
        return {'movement':action['movement'],'fire':action['fire']}
    def training_reward(self,index):
        return self.reinforcement_schedule[index] if self.reinforcement_schedule is not None else self.history[index]['reward']
    def step(self,manual=None):
        with self.step_lock:
            if not self.latest:raise ValueError('Reset an episode first')
            if not self.writer or self.writer.closed:raise ValueError('Episode closed; reset before stepping')
            if self.latest.get('terminated') or self.latest.get('truncated'):raise ValueError('Episode ended; reset before stepping')
            try:
                previous=self.latest['state'];previous_observation=self.latest.get('observation');action=self.choose_action(manual)
                result=self.driver.call({'op':'step','action':action,'seq':self.seq+1})
                reward=calculate_outcome_reward(previous,result)
                pixel_change=input_change(previous_observation,result['observation']) if previous_observation is not None and result.get('observation') is not None else None
                self.seq+=1;self.action=action;self.total_reward+=reward
                self.writer.append(self.seq,action,result,reward,self.neural_summary)
                with self.lock:
                    self.latest=result;self.history.append({'tick':result['tick'],'seconds':result['simTimeMs']/1000,'score':result['state'].get('score',0),'reward':reward,'lives':result['state'].get('lives',3),'movement':action['movement'],'fire':action['fire']})
                    self.watch_snapshot={'seq':self.seq,'action':dict(action),'neural':compact_neural(self.neural_summary),
                                         'inputChange':pixel_change,'reward':float(reward)}
                if result.get('terminated') or result.get('truncated'):
                    with self.lock:self.running=False;self.status='finalizing'
                    mode=self.config.get('neuralMode',neural_mode_for(self.config['controller'],self.config.get('phase','training' if self.config['controller']=='neural-plastic' else 'evaluation')))
                    if self.neural and mode in ('training','training-fixed'):
                        terminal=self.neural.call({'op':'reinforce','reinforcement':self.training_reward(self.seq-1)})
                        if not isinstance(terminal.get('summary'),dict) or terminal['summary'].get('mode')!=mode:raise ValueError('Worker terminal reinforcement did not verify the configured neural mode')
                        atomic_json(self.writer.path/'terminal-reinforcement.json',terminal)
                        self.writer.record_neural(result['tick'],terminal.get('summary'))
                    finalized_status=self.finish('completed')
                    with self.lock:self.status=finalized_status
                return self.public()
            except Exception as error:
                self.error=str(error);self.running=False;self.status='error';self.finish('interrupted');raise
    def start(self):
        if self.status=='finalizing':raise ValueError('Episode is finalizing; wait for completion before starting another run')
        if not self.latest:self.reset({})
        if self.running:return self.public()
        if not self.writer or self.writer.closed:raise ValueError('Reset the closed episode first')
        self.running=True;self.status='running'
        def loop():
            while self.running:
                try:self.step()
                except Exception:break
        self.thread=threading.Thread(target=loop,daemon=True);self.thread.start();return self.public()
    def stop(self):
        self.pause()
        with self.step_lock:self.status=self.finish('stopped')
    def close(self):
        self.stop()
        if self.driver:self.driver.close()
        if self.neural:self.neural.close()

COORDINATOR=Coordinator()
WATCH=WatchLibrary(EXPERIMENTS,RUNTIME/'watch')
REPLAY_JOB={'status':'idle'}
REPLAY_LOCK=threading.Lock()
WORKLOAD_ADMISSION_LOCK=threading.RLock()

def watch_driver(profile):
    return JsonProcess(['node',str(LAB_ROOT/'scripts'/'driver.mjs'),'--render-profile',profile],'watch')

def assert_watch_workload_available():
    if COORDINATOR.running or REPLAY_JOB['status']=='running' or WATCH.busy():
        raise ValueError('Pause the active experiment and wait for the current replay/video job before starting another workload')

def start_watch_demo(body):
    assert_process_source_current();assert_watch_workload_available()
    duration=body.get('timeLimitSeconds',30)
    if isinstance(duration,bool) or not isinstance(duration,(int,float)) or not 1<=duration<=60:
        raise ValueError('Demo duration must be 1..60 seconds')
    profile=body.get('renderProfile','local-d3d11' if os.name=='nt' else 'swiftshader')
    if profile not in ('local-d3d11','swiftshader'):raise ValueError('Unknown demo render profile')
    seed=body.get('seed',1924)
    if type(seed) is not int or not 0<=seed<2**32:raise ValueError('Demo seed must be a uint32 integer')
    def record(progress,cancel,register_resource):
        demo=Coordinator()
        register_resource(demo)
        try:
            if cancel.is_set():raise PreviewCancelled('Demo recording cancelled')
            demo.reset({'controller':'random','seed':seed,'timeLimitSeconds':duration,'renderProfile':profile,'constantFire':True})
            progress(runId=demo.run_id)
            while demo.writer and not demo.writer.closed:
                if cancel.is_set():raise PreviewCancelled('Demo recording cancelled; the partial experiment was finalized')
                demo.step();progress(done=demo.seq)
            return demo.run_id
        finally:
            try:demo.stop()
            finally:close_driver(demo.driver);demo.driver=None
    return WATCH.start_demo(record,watch_driver,int(duration*20))

def start_replay(run_id):
    global REPLAY_JOB
    path=safe_run(run_id)
    if not (path/'checksums.json').exists():raise ValueError('Complete or stop the run before replay')
    with REPLAY_LOCK:
        if REPLAY_JOB['status']=='running':raise ValueError('A replay is already running')
        REPLAY_JOB={'status':'running','runId':run_id,'startedAt':datetime.now(timezone.utc).isoformat()}
    def work():
        global REPLAY_JOB
        try:
            from .replay import replay
            result=replay(path)
            with REPLAY_LOCK:REPLAY_JOB.update(status='passed' if result['passed'] else 'failed',result=result)
        except Exception as error:
            with REPLAY_LOCK:REPLAY_JOB.update(status='failed',error=str(error))
        atomic_json(RUNTIME/'replay-result.json',REPLAY_JOB)
    threading.Thread(target=work,daemon=True).start()
    return dict(REPLAY_JOB)

def safe_run(run_id):
    if not run_id or any(c not in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_' for c in run_id):raise ValueError('Invalid experiment ID')
    path=(EXPERIMENTS/run_id).resolve()
    if not path.is_relative_to(EXPERIMENTS.resolve()) or not path.is_dir():raise ValueError('Experiment not found')
    return path

def run_summary(path):
    summary=read_json(path/'summary.json')
    if summary:return {**summary,'finalized':(path/'checksums.json').is_file()}
    metadata=read_json(path/'metadata.json',{})
    owner=metadata.get('ownerPid')
    active=bool(owner and psutil.pid_exists(owner))
    return {'status':'running' if active else 'interrupted','finalized':False,'error':None if active else 'Process ended before finalization; inspect/recover journal explicitly'}

class Handler(BaseHTTPRequestHandler):
    # Short loopback requests; close explicitly rather than retaining unbounded
    # proxy keep-alive threads after a Vite HMR/client cancellation.
    protocol_version='HTTP/1.0'
    def setup(self):
        super().setup()
        self.connection.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
    def log_message(self,*args):pass
    def respond(self,data,status=200,content_type='application/json'):
        payload=json.dumps(data,allow_nan=False).encode() if content_type=='application/json' else data
        compressed=content_type=='application/json' and len(payload)>16384 and 'gzip' in self.headers.get('Accept-Encoding','')
        if compressed:payload=gzip.compress(payload,compresslevel=1,mtime=0)
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(payload)));self.send_header('Cache-Control','no-store');self.send_header('Connection','close');self.send_header('X-Content-Type-Options','nosniff')
        if compressed:self.send_header('Content-Encoding','gzip');self.send_header('Vary','Accept-Encoding')
        self.end_headers()
        if self.command=='HEAD':return
        try:
            for offset in range(0,len(payload),65536):self.wfile.write(payload[offset:offset+65536])
            self.wfile.flush()
        except (BrokenPipeError,ConnectionResetError):pass
    def watch_file(self,path,sha256):
        size=path.stat().st_size;etag='"'+sha256+'"'
        if self.headers.get('If-None-Match')==etag and not self.headers.get('Range'):
            self.send_response(304);self.send_header('ETag',etag);self.send_header('Content-Length','0');self.end_headers();return
        try:start,end,partial=byte_range(self.headers.get('Range'),size)
        except ValueError:
            self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return
        content_type={'.mp4':'video/mp4','.png':'image/png','.json':'application/json; charset=utf-8'}[path.suffix]
        self.send_response(206 if partial else 200);self.send_header('Content-Type',content_type)
        self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes')
        self.send_header('Cache-Control','private, max-age=86400, immutable');self.send_header('ETag',etag)
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Connection','close')
        if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if self.command=='HEAD':return
        try:
            with path.open('rb') as stream:
                stream.seek(start);remaining=end-start+1
                while remaining:
                    chunk=stream.read(min(65536,remaining))
                    if not chunk:break
                    self.wfile.write(chunk);remaining-=len(chunk)
        except (BrokenPipeError,ConnectionResetError):pass
    def valid_origin(self):
        host=self.headers.get('Host','').split(':')[0]
        origin=self.headers.get('Origin')
        return host in ['127.0.0.1','localhost'] and (not origin or origin in ['http://127.0.0.1:5180','http://localhost:5180'])
    def do_GET(self):
        if not self.valid_origin():return self.respond({'error':'Loopback origin required'},403)
        path=unquote(urlparse(self.path).path)
        try:
            if path=='/watch':return self.respond(WATCH.catalog(PROCESS_SOURCE_TREE_HASH))
            if path=='/watch/live':return self.respond(WATCH.live(COORDINATOR))
            if path.startswith('/watch/live/frame/'):
                key=path.removeprefix('/watch/live/frame/').removesuffix('.png');frame=WATCH.live_frame(key)
                if frame is None:return self.respond({'error':'Live snapshot expired; refresh the lightweight snapshot'},404)
                return self.respond(frame,content_type='image/png')
            if path.startswith('/watch/'):
                parts=path.split('/')
                if len(parts)==3:return self.respond(WATCH.manifest(parts[2]))
                if len(parts)==4 and parts[3]=='signals':return self.respond(get_signals(safe_run(parts[2])))
                if len(parts)==4:return self.watch_file(*WATCH.artifact(parts[2],parts[3]))
                return self.respond({'error':'Unknown watch route'},404)
            if path=='/status':return self.respond(COORDINATOR.public())
            if path=='/replay':return self.respond(dict(REPLAY_JOB))
            if path=='/studies':return self.respond([read_json(p) for p in sorted((EXPERIMENTS/'studies').glob('*/analysis.json'))])
            if path=='/runs':
                return self.respond([{'id':p.name,'summary':run_summary(p),'config':read_json(p/'config.json',{})} for p in sorted(EXPERIMENTS.iterdir(),reverse=True) if p.is_dir() and (p/'config.json').is_file()][:100])
            if path=='/frame':
                frame=(COORDINATOR.latest or {}).get('frame',{}).get('pngDataUrl')
                if not frame:return self.respond({'error':'No completed frame'},404)
                return self.respond(base64.b64decode(frame.split(',',1)[1]),content_type='image/png')
            if path=='/observation':
                obs=(COORDINATOR.latest or {}).get('observation')
                if not obs:return self.respond({'error':'No observation'},404)
                im=Image.frombytes('L',(obs['width'],obs['height']),base64.b64decode(obs['grayBase64']));buffer=io.BytesIO();im.save(buffer,format='PNG')
                return self.respond(buffer.getvalue(),content_type='image/png')
            if path=='/anatomy':
                matches=list(DATA.glob('**/morphology.json')) if DATA.exists() else []
                return self.respond(read_json(matches[0],{}) if matches else {'status':'unavailable','neurons':[],'reason':'No source morphology cached; no synthetic brain geometry is shown.'})
            if path.startswith('/runs/'):
                _,_,run_id,*rest=path.split('/');run=safe_run(run_id);kind=rest[0] if rest else 'summary'
                if kind=='export':
                    if not (run/'checksums.json').exists():raise ValueError('Stop or complete this run before exporting')
                    buffer=io.BytesIO()
                    with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
                        for p in run.rglob('*'):
                            if p.is_file():archive.write(p,run.name+'/'+p.relative_to(run).as_posix())
                    return self.respond(buffer.getvalue(),content_type='application/zip')
                if kind=='report':return self.respond((run/'report.md').read_bytes(),content_type='text/markdown; charset=utf-8')
                if kind=='actions':return self.respond(pq.read_table(run/'actions.parquet').to_pylist())
                return self.respond({'config':read_json(run/'config.json'),'summary':read_json(run/'summary.json'),'metadata':read_json(run/'metadata.json'),'statistics':read_json(run/'statistics.json')})
            return self.respond({'error':'Not found'},404)
        except Exception as error:return self.respond({'error':str(error)},400)
    def do_POST(self):
        if not self.valid_origin() or self.headers.get('X-Scicon-Lab')!='1':return self.respond({'error':'Explicit local lab client required'},403)
        try:
            length=int(self.headers.get('Content-Length',0))
            if length>65536:raise ValueError('Request too large')
            body=json.loads(self.rfile.read(length) or '{}');path=urlparse(self.path).path
            if path not in ('/reset','/start','/pause','/step','/stop','/replay','/watch/build','/watch/demo','/watch/cancel'):
                return self.respond({'error':'Not found'},404)
            # Admission and launch are atomic across HTTP threads. The lock is
            # released after starting a background job, not held during replay.
            with WORKLOAD_ADMISSION_LOCK:result=self.post_action(path,body)
            self.respond(result)
        except Exception as error:self.respond({'error':str(error)},400)
    def post_action(self,path,body):
        if path in ('/reset','/start','/step','/replay') and WATCH.busy():
            raise ValueError('A watch demo/replay build is active; cancel or wait before starting another workload')
        if path=='/reset':return COORDINATOR.reset(body)
        if path=='/start':return COORDINATOR.start()
        if path=='/pause':COORDINATOR.pause();return COORDINATOR.public()
        if path=='/step':
            if COORDINATOR.running:raise ValueError('Pause before a manual step')
            return COORDINATOR.step(body.get('action'))
        if path=='/stop':COORDINATOR.stop();return COORDINATOR.public()
        if path=='/replay':return start_replay(body.get('runId'))
        if path=='/watch/build':
            assert_process_source_current();assert_watch_workload_available()
            return WATCH.start(body.get('runId'),watch_driver)
        if path=='/watch/demo':return start_watch_demo(body)
        if path=='/watch/cancel':return WATCH.cancel()
        raise ValueError('Unknown lab action')
    def do_HEAD(self):self.do_GET()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8766);args=parser.parse_args()
    class LabServer(ThreadingHTTPServer):
        request_queue_size=64
        daemon_threads=True
    server=LabServer(('127.0.0.1',args.port),Handler)
    print(f'Scicon experiment coordinator: 127.0.0.1:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:WATCH.close();COORDINATOR.close();server.server_close()
if __name__=='__main__':main()
