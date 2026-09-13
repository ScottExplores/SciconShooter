"""Verified display derivatives. Reading a replay never starts the game engine."""
from __future__ import annotations
import base64, hashlib, json, os, re, subprocess, threading, time, uuid
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
import pyarrow.parquet as pq
import psutil
from .artifacts import atomic_json, source_identity, verify_export

FPS = 20
LABELS = {'random':'Random baseline','matched-random':'Timing-matched random baseline',
          'idle':'Idle baseline','manual':'Recorded human controls',
          'neural-fixed':'Fixed connectome model','neural-plastic':'Plastic connectome model'}

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf8'))

def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()

def valid_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,120}',value):
        raise ValueError('Invalid experiment ID')
    return value

def player_center(state):
    player=state.get('player') or {}
    if not all(isinstance(player.get(key),(int,float)) for key in ('x','y','width','height')):
        return None
    return {'x':player['x']+player['width']/2,'y':player['y']+player['height']/2}

def compact_neural(value):
    if not isinstance(value,dict):return None
    return {key:value[key] for key in ('spikes','activeFraction','mode','meanRateHz') if key in value}

def byte_range(header,size):
    """One HTTP byte range; reject malformed and unsatisfiable requests."""
    if header is None:return 0,size-1,False
    match=re.fullmatch(r'bytes=(\d*)-(\d*)',header.strip())
    if not match or not any(match.groups()) or size<=0:raise ValueError('Invalid byte range')
    first,last=match.groups()
    if not first:
        count=int(last)
        if count<=0:raise ValueError('Invalid byte range')
        return max(0,size-count),size-1,True
    start=int(first);end=min(int(last),size-1) if last else size-1
    if start>=size or end<start:raise ValueError('Unsatisfiable byte range')
    return start,end,True

class PreviewCancelled(RuntimeError):pass

def terminate_owned_process(process):
    """Only terminate descendants of the Popen handle owned by this watch job."""
    if process is None or process.poll() is not None:return
    try:
        parent=psutil.Process(process.pid);owned=parent.children(recursive=True)+[parent]
        for child in reversed(owned):
            try:child.terminate()
            except psutil.NoSuchProcess:pass
        _,alive=psutil.wait_procs(owned,timeout=3)
        for child in alive:
            try:child.kill()
            except psutil.NoSuchProcess:pass
    except psutil.NoSuchProcess:pass

def close_driver(driver):
    if not driver:return
    try:driver.call({'op':'close'},timeout=30)
    except Exception:pass
    finally:
        try:terminate_owned_process(getattr(driver,'process',None))
        finally:driver.close()

class VideoEncoder:
    """One-thread encoder; PNG verification happens before every write."""
    def __init__(self,path):
        import imageio_ffmpeg
        self.path=Path(path)
        self.version=imageio_ffmpeg.get_ffmpeg_version()
        self.log=self.path.with_suffix('.encoder.log').open('wb')
        args=[imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-nostdin',
              '-threads','1','-f','image2pipe','-framerate',str(FPS),'-i','pipe:0','-an',
              '-c:v','libx264','-preset','veryfast','-crf','24','-profile:v','baseline',
              '-level:v','3.1','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',
              '-f','mp4',str(self.path)]
        flags=getattr(subprocess,'CREATE_NO_WINDOW',0)|getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0)
        self.process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=self.log,creationflags=flags)
    def write(self,png):
        if self.process.poll() is not None:raise RuntimeError('Replay video encoder exited unexpectedly')
        self.process.stdin.write(png)
    def finish(self):
        self.process.stdin.close()
        if self.process.wait(timeout=60)!=0:raise RuntimeError('Replay video encoder failed; inspect the derived-cache encoder log')
        self.log.close()
        if not self.path.is_file() or not self.path.stat().st_size:raise RuntimeError('Replay video is empty')
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=10)
        if not self.log.closed:self.log.close()

def verify_result(result,expected,runtime,initial=False):
    if result.get('runtimeIdentity')!=runtime:raise ValueError('Replay renderer/runtime or asset bytes differ from the export')
    actual={'tick':result['tick'],'stateHash':result['stateHash'],
            'observationHash':result['observation']['sha256'],'frameHash':result['frame']['sha256']}
    if not initial:actual['eventsHash']=result['eventsHash']
    for key,value in actual.items():
        if value!=expected[key]:raise ValueError(f'Replay {key} differs at tick {result["tick"]}')
    data=result['frame']['pngDataUrl']
    if not data.startswith('data:image/png;base64,'):raise ValueError('Replay frame is not a PNG')
    png=base64.b64decode(data.split(',',1)[1],validate=True)
    if hashlib.sha256(png).hexdigest()!=expected['frameHash']:raise ValueError('Replay PNG bytes do not match their recorded hash')
    if (result['frame'].get('width'),result['frame'].get('height'))!=(390,844):raise ValueError('Unexpected replay frame dimensions')
    return png

def build_preview(run,folder,driver_factory,progress=lambda **_:None,cancel=None,encoder_factory=VideoEncoder,register_resource=lambda _:None):
    """Strict source/runtime/action replay into a separate, unpublished folder."""
    run=Path(run);folder=Path(folder)
    cancelled=cancel or threading.Event()
    if cancelled.is_set():raise PreviewCancelled('Replay build cancelled')
    started=time.monotonic();metadata=read_json(run/'metadata.json');config=read_json(run/'config.json')
    original_checksums=file_hash(run/'checksums.json')
    if source_identity()['sourceTreeHash']!=metadata['sourceTreeHash']:
        raise ValueError('Source identity differs. Record a fresh finalized run, or restore its source before building a replay.')
    failures=verify_export(run)
    if failures:raise ValueError('Export checksum mismatch: '+', '.join(failures))
    rows=pq.read_table(run/'actions.parquet').to_pylist()
    if len(rows)>1800:raise ValueError('Watch clips are limited to the native 90-second episode')
    if [row['seq'] for row in rows]!=list(range(1,len(rows)+1)):raise ValueError('Recorded actions are not contiguous')
    runtime=read_json(run/'runtime.json')
    if runtime.get('assetProvenanceVersion')!='intercepted-response-bytes-v1':
        raise ValueError('This older export lacks verified asset-byte provenance; record a fresh run')
    reward_rows=pq.read_table(run/'rewards.parquet').to_pylist()
    if [row['tick'] for row in reward_rows]!=[row['tick'] for row in rows]:
        raise ValueError('Recorded rewards do not align with the action timeline')
    rewards={row['tick']:row['reward'] for row in reward_rows}
    neural={row['tick']:compact_neural(json.loads(row['payload'])) for row in pq.read_table(run/'neural-summary.parquet').to_pylist()}
    folder.mkdir(parents=True,exist_ok=False)
    driver=None;encoder=None;timeline=[];total_reward=0
    def record(result,seq,action,png):
        nonlocal total_reward
        state=result['state'];wave=state.get('runtime',{});reward=float(rewards.get(result['tick'],0)) if seq else 0
        total_reward+=reward
        timeline.append({'seq':seq,'tick':result['tick'],'videoTimeSeconds':seq/FPS,'simTimeMs':result['simTimeMs'],
                         **action,'score':state['score'],'lives':state['lives'],'kills':state['enemiesDefeated'],
                         'player':player_center(state),'reward':reward,'totalReward':total_reward,
                         'waveNumber':wave.get('waveNumber'),'waveName':wave.get('waveName'),
                         'neural':neural.get(result['tick'])})
        encoder.write(png)
    try:
        progress(done=0,total=len(rows))
        encoder=encoder_factory(folder/'replay.mp4')
        register_resource(encoder)
        if cancelled.is_set():raise PreviewCancelled('Replay build cancelled')
        driver=driver_factory(config.get('renderProfile','swiftshader'))
        register_resource(driver)
        initial=driver.call({'op':'reset','seed':config['seed'],'episode':config['episode']})
        png=verify_result(initial,read_json(run/'initial.json'),runtime,initial=True)
        (folder/'poster.png').write_bytes(png)
        record(initial,0,{'movement':'idle','fire':False},png)
        for row in rows:
            if cancelled.is_set():raise PreviewCancelled('Replay build cancelled')
            if time.monotonic()-started>1800:raise RuntimeError('Replay build exceeded its 30-minute wall-clock limit')
            action={'movement':row['movement'],'fire':row['fire']}
            result=driver.call({'op':'step','seq':row['seq'],'action':action})
            png=verify_result(result,row,runtime)
            record(result,row['seq'],action,png)
            progress(done=row['seq'],total=len(rows))
        encoder.finish()
        if cancelled.is_set():raise PreviewCancelled('Replay build cancelled')
        if source_identity()['sourceTreeHash']!=metadata['sourceTreeHash']:
            raise ValueError('Source changed during replay; the display cache was not published')
        if file_hash(run/'checksums.json')!=original_checksums or verify_export(run):
            raise ValueError('Export changed during replay; the display cache was not published')
        atomic_json(folder/'timeline.json',timeline)
        files={name:{'sha256':file_hash(folder/name),'bytes':(folder/name).stat().st_size}
               for name in ('replay.mp4','poster.png','timeline.json')}
        label=LABELS.get(config['controller'],config['controller'])
        prefix=f'/lab-api/watch/{run.name}'
        manifest={'schemaVersion':1,'status':'ready','runId':run.name,'title':label+' · ORBIT ENTRY',
                  'controller':config['controller'],'controllerLabel':label,'summary':read_json(run/'summary.json'),
                  'sourceCommit':metadata['gitCommit'],'sourceTreeHash':metadata['sourceTreeHash'],
                  'exportChecksumsSha256':original_checksums,'createdAt':datetime.now(timezone.utc).isoformat(),
                  'evidence':'INSUFFICIENT EVIDENCE','neuralRecorded':bool(neural),
                  'displayOnly':True,'displayNote':'Lossy display derivative of verified game frames; exact policy observations remain in the export.',
                  'actionTiming':'Each action is the recorded decision that produced the displayed post-step frame; the initial frame has no applied action.',
                  'media':{'url':prefix+'/replay.mp4?v='+files['replay.mp4']['sha256'],
                           'posterUrl':prefix+'/poster.png?v='+files['poster.png']['sha256'],
                           'width':390,'height':844,'fps':FPS,'durationSeconds':len(timeline)/FPS,
                           'frameCount':len(timeline),'codec':'H.264 baseline / yuv420p','encoder':encoder.version,
                           **files['replay.mp4']},
                  'timeline':{'url':prefix+'/timeline.json?v='+files['timeline.json']['sha256'],'entries':len(timeline)},
                  'verification':{'passed':True,'decisions':len(rows),'initialStateAndPixels':True,
                                  'fields':['tick','stateHash','observationHash','frameHash','eventsHash','runtimeIdentity'],
                                  'assetHash':runtime['assetHash'],'sourceRecheckedAfterReplay':True},
                  'files':files,'buildSeconds':time.monotonic()-started}
        atomic_json(folder/'manifest.json',manifest)
        return manifest
    finally:
        try:
            if encoder:encoder.close()
        finally:close_driver(driver)

class WatchLibrary:
    def __init__(self,experiments,cache):
        self.experiments=Path(experiments).resolve();self.cache=Path(cache).resolve()
        self.lock=threading.RLock();self.job={'status':'idle','done':0,'total':0}
        self.cancel_event=threading.Event();self.thread=None;self.live_frames=OrderedDict();self.checked_files={};self.resources=[]
    def run(self,run_id):
        path=(self.experiments/valid_id(run_id)).resolve()
        if not path.is_relative_to(self.experiments) or not path.is_dir():raise ValueError('Experiment not found')
        return path
    def index(self):
        try:return read_json(self.cache/'index.json')
        except FileNotFoundError:return {}
    def cached(self,run_id):
        run=self.run(run_id);entry=self.index().get(run_id)
        if not entry:return None
        folder=(self.cache/entry['folder']).resolve()
        if not folder.is_relative_to(self.cache):raise ValueError('Invalid watch cache path')
        manifest_path=folder/'manifest.json'
        if file_hash(manifest_path)!=entry['sha256']:raise ValueError('Watch cache manifest checksum mismatch')
        manifest=read_json(manifest_path)
        if manifest.get('runId')!=run_id or manifest.get('exportChecksumsSha256')!=file_hash(run/'checksums.json'):
            raise ValueError('Watch cache belongs to a different export')
        return folder,manifest
    def catalog(self,source_hash=None):
        runs=[]
        for path in sorted(self.experiments.iterdir(),reverse=True):
            if not path.is_dir() or not (path/'checksums.json').is_file() or not (path/'config.json').is_file():continue
            try:
                config=read_json(path/'config.json');metadata=read_json(path/'metadata.json');summary=read_json(path/'summary.json')
                clip=self.cached(path.name)
                runs.append({'runId':path.name,'controller':config['controller'],
                             'controllerLabel':LABELS.get(config['controller'],config['controller']),
                             'status':'ready' if clip else 'not-built','summary':summary,'sourceCommit':metadata.get('gitCommit'),
                             'sourceMatched':source_hash==metadata.get('sourceTreeHash')})
            except (OSError,ValueError,KeyError):continue
            if len(runs)>=100:break
        with self.lock:return {'runs':runs,'job':dict(self.job)}
    def manifest(self,run_id):
        clip=self.cached(run_id)
        if not clip:raise ValueError('No cached replay; explicitly build one from a matching finalized run')
        return clip[1]
    def artifact(self,run_id,name):
        if name not in ('replay.mp4','poster.png','timeline.json'):raise ValueError('Unknown watch artifact')
        clip=self.cached(run_id)
        if not clip:raise ValueError('Replay is not cached')
        folder,manifest=clip;path=(folder/name).resolve()
        if not path.is_relative_to(folder):raise ValueError('Invalid watch artifact path')
        stat=path.stat();identity=(stat.st_size,stat.st_mtime_ns)
        expected=manifest['files'][name]
        with self.lock:
            if self.checked_files.get(str(path))!=identity:
                if stat.st_size!=expected['bytes'] or file_hash(path)!=expected['sha256']:
                    raise ValueError('Watch artifact checksum mismatch')
                self.checked_files[str(path)]=identity
        return path,expected['sha256']
    def start(self,run_id,driver_factory):
        run=self.run(run_id)
        if not (run/'checksums.json').is_file():raise ValueError('Complete or stop the run before building a replay')
        with self.lock:
            if self.job['status']=='building':raise ValueError('A replay video build is already running')
            cached=self.cached(run_id)
            if cached:return {'status':'ready','runId':run_id,'done':cached[1]['verification']['decisions'],'total':cached[1]['verification']['decisions']}
            if source_identity()['sourceTreeHash']!=read_json(run/'metadata.json')['sourceTreeHash']:
                raise ValueError('Source identity differs. Record a fresh finalized run, or restore its source before building a replay.')
            self.cancel_event=threading.Event()
            self.resources=[]
            self.job={'status':'building','stage':'encoding','runId':run_id,'done':0,'total':0,'startedAt':datetime.now(timezone.utc).isoformat()}
            folder=self.cache/(run_id+'-'+uuid.uuid4().hex[:12])
            def progress(**values):
                with self.lock:self.job.update(values)
            def work():
                try:
                    build_preview(run,folder,driver_factory,progress,self.cancel_event,register_resource=self.register_resource)
                    with self.lock:
                        index=self.index();index[run_id]={'folder':folder.name,'sha256':file_hash(folder/'manifest.json')}
                        atomic_json(self.cache/'index.json',index)
                        self.job.update(status='ready',finishedAt=datetime.now(timezone.utc).isoformat())
                except Exception as error:
                    with self.lock:self.job.update(status='cancelled' if isinstance(error,PreviewCancelled) or self.cancel_event.is_set() else 'failed',error=str(error))
                finally:
                    with self.lock:self.resources=[]
            self.thread=threading.Thread(target=work,daemon=True);self.thread.start()
            return dict(self.job)
    def start_demo(self,recorder,driver_factory,total):
        with self.lock:
            if self.job['status']=='building':raise ValueError('A replay video build is already running')
            self.cancel_event=threading.Event()
            self.resources=[]
            self.job={'status':'building','stage':'recording','runId':None,'done':0,'total':total,
                      'startedAt':datetime.now(timezone.utc).isoformat()}
            def progress(**values):
                with self.lock:self.job.update(values)
            def work():
                try:
                    run_id=recorder(progress,self.cancel_event,self.register_resource)
                    if self.cancel_event.is_set():raise PreviewCancelled('Demo recording cancelled')
                    run=self.run(run_id);folder=self.cache/(run_id+'-'+uuid.uuid4().hex[:12])
                    progress(stage='encoding',runId=run_id,done=0,total=0)
                    build_preview(run,folder,driver_factory,progress,self.cancel_event,register_resource=self.register_resource)
                    with self.lock:
                        index=self.index();index[run_id]={'folder':folder.name,'sha256':file_hash(folder/'manifest.json')}
                        atomic_json(self.cache/'index.json',index)
                        self.job.update(status='ready',finishedAt=datetime.now(timezone.utc).isoformat())
                except Exception as error:
                    with self.lock:self.job.update(status='cancelled' if isinstance(error,PreviewCancelled) or self.cancel_event.is_set() else 'failed',error=str(error))
                finally:
                    with self.lock:self.resources=[]
            self.thread=threading.Thread(target=work,daemon=True);self.thread.start()
            return dict(self.job)
    def busy(self):
        with self.lock:return self.job['status']=='building'
    def register_resource(self,resource):
        with self.lock:self.resources.append(resource)
    def close(self):
        self.cancel_event.set()
        with self.lock:resources=list(self.resources)
        for resource in resources:
            terminate_owned_process(getattr(resource,'process',None))
            for name in ('driver','neural'):
                terminate_owned_process(getattr(getattr(resource,name,None),'process',None))
        if self.thread and self.thread is not threading.current_thread():self.thread.join(timeout=5)
    def cancel(self):
        with self.lock:
            self.cancel_event.set()
            return {**self.job,'cancelRequested':self.job['status']=='building'}
    def live(self,coordinator):
        with coordinator.lock:
            latest=coordinator.latest or {};state=latest.get('state',{});controller=(coordinator.config or {}).get('controller')
            stamp=getattr(coordinator,'watch_snapshot',None) or {'seq':0,'action':{'movement':'idle','fire':False},'neural':None,'inputChange':0.0,'reward':0.0}
            frame=latest.get('frame',{}).get('pngDataUrl');key=f'{coordinator.run_id or "idle"}-{stamp["seq"]}'
            snapshot={'available':bool(frame),'running':coordinator.running,'status':coordinator.status,
                      'runId':coordinator.run_id,'seq':stamp['seq'],'tick':latest.get('tick',0),
                      'simTimeMs':latest.get('simTimeMs',0),'score':state.get('score',0),'lives':state.get('lives',3),
                      'kills':state.get('enemiesDefeated',0),'player':player_center(state),
                      'action':dict(stamp['action']),'controller':controller,'controllerLabel':LABELS.get(controller,controller),
                      'neural':stamp['neural'],'inputChange':stamp.get('inputChange'),'reward':stamp.get('reward',0.0),'error':coordinator.error,
                      'frameUrl':f'/lab-api/watch/live/frame/{key}.png' if frame else None}
        if frame:
            with self.lock:
                if key not in self.live_frames:self.live_frames[key]=base64.b64decode(frame.split(',',1)[1])
                while len(self.live_frames)>3:self.live_frames.popitem(last=False)
        return snapshot
    def live_frame(self,key):
        with self.lock:return self.live_frames.get(key)
