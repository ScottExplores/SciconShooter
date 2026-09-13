"""Durable, private boss/wave session. Public snapshots never accept commands.

The random validation controller is deliberately named; it is not a fly model.
Neural training uses Coordinator's unchanged, dataset-bound admission gates.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import time
from datetime import datetime, timezone
import uuid

from PIL import Image
import psutil

from .artifacts import LAB_ROOT, atomic_json, canonical, digest, source_identity, verify_export

ROOT=LAB_ROOT/'runtime'/'continuous'
CONTROLLERS={'random':'Random validation baseline', 'neural-fixed':'Fixed connectome diagnostic',
             'neural-plastic':'Plastic connectome candidate'}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def boss_contacts(events):
    """Return confirmed hull contacts, preserving event-position identity."""
    from .server import calculate_boss_damage_reward
    calculate_boss_damage_reward({'events':events})
    return [(i,e) for i,e in enumerate(events) if e.get('type')=='entity-damage'
            and e.get('sourceKind')=='player' and e.get('targetKind') in ('BOSS','MINI_BOSS')]


def validate_config(config):
    if config.get('controller') not in CONTROLLERS:raise ValueError('Choose an explicit supported controller')
    if config['controller'].startswith('neural') and not config.get('neuralConfig'):
        raise ValueError('A real dataset-bound neural manifest is required')
    for key in ('bossSeconds','waveSeconds'):
        value=config.get(key)
        maximum=180 if key=='bossSeconds' else 90
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 1<=value<=maximum:
            raise ValueError(f'{key} must be 1..{maximum} simulated seconds')
    if type(config.get('seed')) is not int or not 0<=config['seed']<2**32:raise ValueError('Seed must be uint32')
    if config.get('renderProfile') not in ('local-d3d11','swiftshader'):raise ValueError('Unknown renderer')
    if type(config.get('maxBytes')) is not int or config['maxBytes']<256*1024**2:raise ValueError('Session disk budget must be at least 256 MiB')
    return dict(config)


class SessionLedger:
    """SQLite transactions atomically credit a unique (bout, command) once.

    The game journal is written/fsynced first. If the process fails before this
    transaction, recovery imports its complete rows. Conflicting duplicates and
    gaps are errors, never silently guessed or credited again.
    """
    def __init__(self,path,config,session_id=None):
        self.path=Path(path);self.path.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(self.path/'session.sqlite3')
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS session (
              singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL,
              config TEXT NOT NULL, started_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
              score REAL NOT NULL DEFAULT 0, damage REAL NOT NULL DEFAULT 0,
              hits INTEGER NOT NULL DEFAULT 0, sim_seconds REAL NOT NULL DEFAULT 0,
              decisions INTEGER NOT NULL DEFAULT 0, observed_decisions INTEGER NOT NULL DEFAULT 0,
              boss_visible_decisions INTEGER NOT NULL DEFAULT 0, aligned_decisions INTEGER NOT NULL DEFAULT 0,
              outside_decisions INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS bouts (
              ordinal INTEGER PRIMARY KEY, run_id TEXT UNIQUE NOT NULL, phase TEXT NOT NULL,
              run_path TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', seed INTEGER NOT NULL,
              initial_score REAL NOT NULL, last_score REAL NOT NULL, last_seq INTEGER NOT NULL DEFAULT 0,
              last_tick INTEGER NOT NULL DEFAULT 0, damage REAL NOT NULL DEFAULT 0,
              hits INTEGER NOT NULL DEFAULT 0, error TEXT, started_at TEXT NOT NULL, ended_at TEXT, outcome TEXT);
            CREATE TABLE IF NOT EXISTS decisions (
              run_id TEXT NOT NULL REFERENCES bouts(run_id), seq INTEGER NOT NULL,
              tick INTEGER NOT NULL, source_hash TEXT NOT NULL, score_delta REAL NOT NULL,
              damage REAL NOT NULL, hits INTEGER NOT NULL, sim_seconds REAL NOT NULL,
              reward_computed REAL NOT NULL, reward_delivered REAL NOT NULL,
              hit_events TEXT NOT NULL, observer TEXT, PRIMARY KEY(run_id,seq));
            CREATE TABLE IF NOT EXISTS notices (
              id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL);
        ''')
        existing=self.db.execute('SELECT * FROM session').fetchone()
        encoded=canonical(validate_config(config)).decode()
        if existing:
            old=json.loads(existing['config']);new=dict(config)
            old_limit=old.pop('maxBytes');new_limit=new.pop('maxBytes')
            if old!=new:raise ValueError('Session method/configuration changed; start a new explicit session')
            self.session_id=existing['id']
            if old_limit!=new_limit:
                with self.db:self.db.execute('UPDATE session SET config=? WHERE singleton=1',(encoded,))
                self.notice('budget-changed',f'Private operator changed storage budget from {old_limit} to {new_limit} bytes.')
                atomic_json(self.path/'config.json',config)
        else:
            self.session_id=session_id or datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8]
            with self.db:self.db.execute('INSERT INTO session(singleton,id,config,started_at) VALUES(1,?,?,?)',(self.session_id,encoded,utc_now()))
            atomic_json(self.path/'config.json',config)
        if self.db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('Session database integrity check failed')

    def active(self):
        row=self.db.execute("SELECT * FROM bouts WHERE status='active' ORDER BY ordinal DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def last_bout(self):
        row=self.db.execute('SELECT * FROM bouts ORDER BY ordinal DESC LIMIT 1').fetchone()
        return dict(row) if row else None

    def next_phase(self):
        last=self.last_bout()
        if not last:return 'boss'
        if last['status']!='completed':return last['phase']
        return 'wave' if last['phase']=='boss' else 'boss'

    def begin(self,run_id,phase,run_path,seed,initial_score=0):
        if self.active():raise ValueError('Finish the active bout before starting another')
        if phase!=self.next_phase():raise ValueError('Boss and wave phases must follow the declared order')
        if not isinstance(initial_score,(int,float)) or not math.isfinite(initial_score) or initial_score<0:raise ValueError('Invalid initial score')
        with self.db:
            self.db.execute('INSERT INTO bouts(run_id,phase,run_path,seed,initial_score,last_score,started_at) VALUES(?,?,?,?,?,?,?)',
                            (run_id,phase,str(Path(run_path).resolve()),seed,initial_score,initial_score,utc_now()))

    def credit(self,run_id,row,observer=None):
        action=row.get('action',{});seq=action.get('seq');tick=action.get('tick');score=row.get('score')
        if type(seq) is not int or seq<1 or type(tick) is not int or tick<1:raise ValueError('Invalid command sequence/tick')
        if isinstance(score,bool) or not isinstance(score,(int,float)) or not math.isfinite(score):raise ValueError('Invalid score counter')
        source_hash=digest(row)
        existing=self.db.execute('SELECT source_hash FROM decisions WHERE run_id=? AND seq=?',(run_id,seq)).fetchone()
        if existing:
            if existing['source_hash']!=source_hash:raise ValueError('Conflicting duplicate decision; refusing to credit it')
            return False
        bout=self.db.execute('SELECT * FROM bouts WHERE run_id=?',(run_id,)).fetchone()
        if not bout or bout['status']!='active':raise ValueError('Unknown or closed bout')
        if seq!=bout['last_seq']+1 or tick<=bout['last_tick']:raise ValueError('Noncontiguous decision journal')
        delta=score-bout['last_score']
        if delta<0:raise ValueError('Score decreased inside a bout')
        contacts=boss_contacts(row.get('events'))
        damage=sum(e['amount'] for _,e in contacts)
        reward=row.get('reward')
        if isinstance(reward,bool) or not isinstance(reward,(int,float)) or not math.isfinite(reward) or not math.isclose(reward,damage,rel_tol=1e-12,abs_tol=1e-12):
            raise ValueError('Boss practice reward differs from confirmed hull HP damage')
        neural=row.get('neural')
        delivered=neural.get('deliveredReinforcement',0) if isinstance(neural,dict) else 0
        if isinstance(delivered,bool) or not isinstance(delivered,(int,float)) or not math.isfinite(delivered):raise ValueError('Invalid delivered reinforcement')
        identities=[{'seq':seq,'eventIndex':i,'targetId':e['targetId'],'amount':e['amount']} for i,e in contacts]
        with self.db:
            self.db.execute('INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (run_id,seq,tick,source_hash,delta,damage,len(contacts),(tick-bout['last_tick'])/60,reward,delivered,json.dumps(identities),canonical(observer).decode() if observer else None))
            self.db.execute('UPDATE bouts SET last_score=?,last_seq=?,last_tick=?,damage=damage+?,hits=hits+? WHERE run_id=?',
                            (score,seq,tick,damage,len(contacts),run_id))
            self.db.execute('UPDATE session SET score=score+?,damage=damage+?,hits=hits+?,sim_seconds=sim_seconds+?,decisions=decisions+1 WHERE singleton=1',
                            (delta,damage,len(contacts),(tick-bout['last_tick'])/60))
            if observer and observer['controllable']:
                visible=observer['boss'] is not None
                self.db.execute('UPDATE session SET observed_decisions=observed_decisions+1,boss_visible_decisions=boss_visible_decisions+?,aligned_decisions=aligned_decisions+?,outside_decisions=outside_decisions+? WHERE singleton=1',
                                (int(visible),int(visible and observer['alignedWithBoss']),int(not observer['withinBounds'])))
        return True

    def finish(self,run_id,status,error=None,outcome=None):
        if status not in ('completed','interrupted','stopped'):raise ValueError('Invalid bout terminal status')
        with self.db:
            self.db.execute("UPDATE bouts SET status=?,error=?,ended_at=?,outcome=? WHERE run_id=? AND status='active'",(status,error,utc_now(),outcome,run_id))

    def recover(self):
        """Recover only complete fsynced journal rows, then retry interrupted phase."""
        bout=self.active()
        if not bout:return
        self.reconcile_journal(bout)
        summary_path=Path(bout['run_path'])/'summary.json'
        summary=json.loads(summary_path.read_text()) if summary_path.exists() else {}
        completed=summary.get('status')=='completed' and (Path(bout['run_path'])/'checksums.json').exists()
        if completed:
            checksums=json.loads((Path(bout['run_path'])/'checksums.json').read_text())
            if not isinstance(checksums,dict) or not all(k in checksums for k in ('journal.jsonl','summary.json')) or verify_export(bout['run_path']):
                raise ValueError('Completed export checksum verification failed; evidence preserved for explicit recovery')
        self.finish(bout['run_id'],'completed' if completed else 'interrupted',None if completed else 'Worker stopped; recovered confirmed records, retrying this phase',
                    (summary.get('practice') or {}).get('outcome'))
        self.notice('recovered','Recovered durable command rows. An interrupted phase restarts; cumulative confirmed measurements are retained.')

    def reconcile_journal(self,bout):
        """Credit every durable row before closing its accounting cursor."""
        journal=Path(bout['run_path'])/'journal.jsonl'
        if not journal.is_file():raise ValueError('Active bout journal is missing; recovery requires explicit repair')
        with journal.open('rb') as stream:
            for line in stream:
                if not line.endswith(b'\n'):raise ValueError('Interrupted partial journal line; evidence preserved for explicit recovery')
                self.credit(bout['run_id'],json.loads(line))

    def notice(self,kind,detail):
        with self.db:self.db.execute('INSERT INTO notices(created_at,kind,detail) VALUES(?,?,?)',(utc_now(),kind,detail))

    def totals(self):
        row=self.db.execute('SELECT score,damage bossDamage,hits bossHits,sim_seconds simSeconds,decisions FROM session WHERE singleton=1').fetchone()
        result=dict(row)
        result['bossEncounters']=self.db.execute("SELECT COUNT(*) FROM bouts WHERE phase='boss'").fetchone()[0]
        return result

    def diagnostics(self):
        row=self.db.execute('SELECT decisions,observed_decisions,boss_visible_decisions,aligned_decisions,outside_decisions FROM session').fetchone()
        return {'observedControllableDecisions':row['observed_decisions'],'recordedDecisions':row['decisions'],
                'bossVisibleDecisions':row['boss_visible_decisions'],'alignedDecisions':row['aligned_decisions'],
                'outsideBoundsDecisions':row['outside_decisions'],
                'alignmentFraction':row['aligned_decisions']/row['boss_visible_decisions'] if row['boss_visible_decisions'] else None,
                'scope':'Privileged diagnostics never sent to the controller; native intro excluded. Crash-recovered decisions may lack observer samples.'}

    def revision(self):
        with self.db:self.db.execute('UPDATE session SET revision=revision+1 WHERE singleton=1')
        return self.db.execute('SELECT revision FROM session').fetchone()[0]

    def close(self):
        self.db.close()


class StorageLimit(RuntimeError):pass


class DiskBudget:
    def __init__(self,ledger,max_bytes,reserve_bytes=64*1024**2,min_free_bytes=2*1024**3):
        self.ledger=ledger;self.maximum=max_bytes;self.reserve=reserve_bytes;self.min_free=min_free_bytes;self.used=0

    def check(self):
        roots=[self.ledger.path]+[Path(r[0]) for r in self.ledger.db.execute('SELECT run_path FROM bouts')]
        self.used=sum(p.stat().st_size for root in roots if root.exists() for p in root.rglob('*') if p.is_file())
        if self.used+self.reserve>=self.maximum:raise StorageLimit('Session storage budget reached; saved records are preserved. Increase the private budget explicitly to continue.')
        if shutil.disk_usage(self.ledger.path).free<self.min_free+self.reserve:raise StorageLimit('Free disk safety threshold reached; saved records are preserved.')
        return self.used


class SessionLease:
    """Exclusive OS lock survives neither process exit nor machine restart."""
    def __init__(self,path):self.path=Path(path);self.stream=None
    def __enter__(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.stream=self.path.open('a+b');self.stream.seek(0)
        if self.path.stat().st_size==0:self.stream.write(b'0');self.stream.flush();self.stream.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self.stream.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.stream.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.stream.close();raise RuntimeError('Another continuous session owns the local runner')
        return self
    def __exit__(self,*_):
        if self.stream:self.stream.close()


def public_neural(summary):
    if not isinstance(summary,dict):return None
    # Only actual worker fields. Neither game action nor reward becomes a spike.
    keys=('spikes','activeNeurons','neuronCount','connectionCount','simTimeMs','mode','plasticityFrozen','sampledNeurons','samplePolicy','activePopulations','reinforcementDoseMs')
    return {k:summary[k] for k in keys if k in summary}


def public_snapshot(value):
    """Stable website contract. Frame bytes and measurements share one revision."""
    frame=value.get('frame');image=None
    if frame is not None:
        if frame.get('mimeType')!='image/jpeg' or (frame.get('width'),frame.get('height'))!=(390,844):raise ValueError('Invalid public frame metadata')
        content=base64.b64decode(frame['base64'],validate=True)
        if hashlib.sha256(content).hexdigest()!=frame.get('sha256'):raise ValueError('Public frame checksum mismatch')
        image='data:image/jpeg;base64,'+frame['base64']
    current=value['current'];feedback=value['feedback'];hit=feedback.get('lastHit')
    mode={'Random validation baseline':'random','Fixed connectome diagnostic':'neural-fixed','Plastic connectome candidate':'neural-plastic'}[value['controllerLabel']]
    return {'schemaVersion':1,'kind':'scicon-continuous-live-v1','sessionId':value['sessionId'],
            'sequence':value['revision'],'updatedAt':value['capturedAt'],'serverNow':utc_now(),
            'status':{'transition':'transitioning','interrupted':'error'}.get(value['status'],value['status']),
            'controller':{'id':mode,'name':value['controllerLabel'],'learningStatus':value['learningStatus']},
            'phase':{'kind':value['phase'],'name':value['stageName'],'elapsedSeconds':current['phaseSimSeconds'],
                     'damage':current['bossDamage'],'hits':current['bossHits'],'damagePerSecond':current['bossDamagePerSecond']},
            'totals':{'score':value['totals']['score'],'bossDamage':value['totals']['bossDamage'],
                      'bossHits':value['totals']['bossHits'],'simulatedSeconds':value['totals']['simSeconds']},
            'action':value['action'],'feedback':{'hitCount':hit['count'] if hit else 0,'bossDamage':feedback['hitAmount'],
                'computedReward':feedback['rewardComputed'],'deliveredReward':feedback['rewardDelivered'],
                'deliveryStatus':feedback['deliveryStatus'],'lastHitAt':hit['atSimSeconds'] if hit else None,
                'lastHitId':hit['id'] if hit else None},
            'neural':value['neural'],'frame':({k:frame[k] for k in ('mimeType','width','height','sha256')} if frame else None),
            'image':image,'error':value['error'],'limits':value['limits']}


def active_owner(root=ROOT):
    try:
        value=json.loads((Path(root)/'owner.json').read_text())
        if value.get('stoppedAt'):return None
        process=psutil.Process(value['pid'])
        if abs(process.create_time()-value['createdAt'])>.01:return None
        return value
    except (OSError,ValueError,KeyError,psutil.Error):return None


def center(entity):
    if not isinstance(entity,dict):return None
    if not all(isinstance(entity.get(k),(int,float)) and math.isfinite(entity[k]) for k in ('x','y','width','height')):return None
    return {'x':entity['x']+entity['width']/2,'y':entity['y']+entity['height']/2}


def observe_state(state):
    player_entity=state.get('player');player=center(player_entity)
    boss=next((e for e in state.get('entities',[]) if e.get('type')=='BOSS'),None)
    return {'player':player,'boss':center(boss),'bossBounds':({'x':boss['x'],'width':boss['width']} if boss else None),
            'controllable':bool(player and state.get('timers',{}).get('intro',1)<=0),
            'withinBounds':bool(player and 0<=player_entity['x'] and player_entity['x']+player_entity['width']<=390
                                and 0<=player_entity['y'] and player_entity['y']+player_entity['height']<=844),
            'alignedWithBoss':bool(player and boss and boss['x']<=player['x']<=boss['x']+boss['width'])}


class ContinuousRunner:
    def __init__(self,ledger,config,root=ROOT,coordinator=None):
        from .server import Coordinator
        self.ledger=ledger;self.config=config;self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True)
        self.coordinator=coordinator or Coordinator();self.budget=DiskBudget(ledger,config['maxBytes'])
        self.last_publish=0.;self.stop_requested=False;self.last_hit=None;self.last_reward=0.;self.last_delivered=0.
        self.status='transition';self.error=None;self.frame=None;self.previous_step_wall=None

    def start_bout(self):
        phase=self.ledger.next_phase();ordinal=(self.ledger.last_bout() or {}).get('ordinal',0)+1
        duration=self.config['bossSeconds'] if phase=='boss' else self.config['waveSeconds']
        self.status='transition';self.publish(force=True)
        self.budget.check()
        self.coordinator.reset({'controller':self.config['controller'],'neuralConfig':self.config.get('neuralConfig'),
            'seed':self.config['seed'],'policySeed':(self.config['seed']^0x9E3779B9^ordinal)&0xffffffff,
            'timeLimitSeconds':duration,'renderProfile':self.config['renderProfile'],'constantFire':True,
            'task':'boss-practice-v1','practicePhase':phase,'rewardProtocol':'boss-hull-damage-v1',
            'preserveEfficacy':ordinal>1,'phase':'training' if self.config['controller']=='neural-plastic' else 'evaluation'})
        self.ledger.begin(self.coordinator.run_id,phase,self.coordinator.writer.path,self.config['seed'],self.coordinator.latest['state']['score'])
        self.last_hit=None;self.last_reward=0.;self.last_delivered=0.;self.status='running';self.publish(force=True)

    def step_once(self):
        if not self.ledger.active():self.start_bout()
        c=self.coordinator
        if c.seq%20==0:self.budget.check()
        c.step()
        # Match RunWriter's fsynced journal payload exactly, so recovery compares
        # hashes rather than crediting an independently reconstructed guess.
        result=c.latest;state=result['state'];seq=c.seq
        row={'action':{'seq':seq,'tick':result['tick'],'movement':c.action['movement'],'fire':c.action['fire'],
             'stateHash':result['stateHash'],'observationHash':result['observation']['sha256'],
             'frameHash':result.get('frame',{}).get('sha256'),'eventsHash':result.get('eventsHash')},
             'reward':c.history[-1]['reward'],'events':result.get('events',[]),'neural':c.neural_summary,
             'score':state.get('score'),'lives':state.get('lives')}
        self.ledger.credit(c.run_id,row,observe_state(state))
        self.last_reward=float(row['reward']);self.last_delivered=float((c.neural_summary or {}).get('deliveredReinforcement',0))
        contacts=boss_contacts(row['events'])
        if contacts:self.last_hit={'id':f'{c.run_id}:{seq}','amount':sum(e['amount'] for _,e in contacts),
                                  'count':len(contacts),'atSimSeconds':self.ledger.totals()['simSeconds']}
        if c.writer.closed:
            status='completed' if c.status=='completed' else 'interrupted'
            self.ledger.finish(c.run_id,status,c.error,(state.get('practice') or {}).get('outcome'))
            if status!='completed':raise RuntimeError(c.error or 'Practice bout did not complete')
        self.publish()
        return result

    def snapshot(self):
        c=self.coordinator;latest=c.latest or {};state=latest.get('state',{});bout=self.ledger.active() or self.ledger.last_bout()
        entities=state.get('entities',[]);boss=next((e for e in entities if e.get('type')=='BOSS'),None)
        player=center(state.get('player'));boss_center=center(boss)
        elapsed=(latest.get('tick',0)/60) if bout else 0
        damage=bout['damage'] if bout else 0
        mode=self.config['controller'];neural=public_neural(c.neural_summary) if mode.startswith('neural') else None
        phase=bout['phase'] if bout else 'boss'
        return {'version':1,'schemaVersion':1,'kind':'scicon-continuous-live-v1','sessionId':self.ledger.session_id,
            'revision':self.ledger.revision(),'capturedAt':utc_now(),'status':self.status,'phase':phase,
            'stageName':'Gatekeeper Prime' if phase=='boss' else 'Orbit Entry • enemy wave',
            'controllerLabel':CONTROLLERS[mode],
            'learningStatus':'training' if mode=='neural-plastic' else 'fixed-evaluation' if mode=='neural-fixed' else 'not-learning',
            'totals':self.ledger.totals(),'diagnostics':self.ledger.diagnostics(),'action':dict(c.action),
            'current':{'score':state.get('score',0),'bossHealth':boss.get('hp') if boss else None,
                       'bossMaxHealth':boss.get('maxHp') if boss else None,'phaseSimSeconds':elapsed,
                       'bossDamage':damage,'bossHits':bout['hits'] if bout else 0,
                       'bossDamagePerSecond':damage/elapsed if elapsed else 0,'player':player,'boss':boss_center,
                       'playerWithinBounds':bool(player and 0<=player['x']<=390 and 0<=player['y']<=844),
                       'alignedWithBoss':bool(player and boss and boss['x']<=player['x']<=boss['x']+boss['width'])},
            'feedback':{'hitAmount':self.last_hit['amount'] if self.last_hit else 0,'lastHit':self.last_hit,
                        'rewardComputed':self.last_reward,'rewardDelivered':self.last_delivered,
                        'deliveryStatus':'no-neural-worker' if not mode.startswith('neural') else 'evaluation-disabled' if mode=='neural-fixed' else 'delivered',
                        'atSimSeconds':self.ledger.totals()['simSeconds']},
            'neural':neural,'frame':self.frame,'error':self.error,
            'limits':{'maxBytes':self.budget.maximum,'usedBytes':self.budget.used},
            'evidence':'INSUFFICIENT EVIDENCE','activityExplanation':'Brain highlights require measured neural activity. Hit and reward markers describe separate logged events.'}

    def publish(self,force=False):
        now=time.monotonic()
        if not force and now-self.last_publish<.25:return
        latest=self.coordinator.latest or {};data=latest.get('frame',{}).get('pngDataUrl')
        if data:
            png=base64.b64decode(data.split(',',1)[1],validate=True)
            if hashlib.sha256(png).hexdigest()!=latest['frame']['sha256']:raise ValueError('Snapshot frame hash mismatch')
            with Image.open(io.BytesIO(png)) as picture:
                if picture.size!=(390,844):raise ValueError('Unexpected public frame dimensions')
                buffer=io.BytesIO();picture.convert('RGB').save(buffer,'JPEG',quality=78,optimize=False)
            image=buffer.getvalue()
            # Embed frame in the atomically replaced snapshot: a publisher can
            # never pair revision N's measurements with revision N+1's picture.
            self.frame={'mimeType':'image/jpeg','width':390,'height':844,'sha256':hashlib.sha256(image).hexdigest(),
                        'base64':base64.b64encode(image).decode()}
        atomic_json(self.root/'latest.json',self.snapshot());self.last_publish=now

    def run(self,max_decisions=None):
        count=0
        try:
            while not self.stop_requested:
                request_path=self.root/'stop-request.json'
                if request_path.exists():
                    request=json.loads(request_path.read_text())
                    if request.get('pid')==os.getpid() and request.get('createdAt')==psutil.Process().create_time():break
                started=time.monotonic()
                self.step_once();count+=1
                if max_decisions is not None and count>=max_decisions:break
                # Display sampling never drives simulation time. This cap avoids
                # an unbounded random baseline consuming all CPU overnight.
                delay=.05-(time.monotonic()-started)
                if delay>0:time.sleep(delay)
        except StorageLimit as error:self.status='storage-limit';self.error=str(error)
        except Exception as error:self.status='interrupted';self.error=str(error)
        finally:
            if self.status not in ('storage-limit','interrupted'):self.status='stopped'
            try:self.coordinator.close()
            except Exception as error:self.status='interrupted';self.error=str(error)
            active=self.ledger.active()
            if active:
                try:
                    # Coordinator may have fsynced a last decision and then
                    # failed while checkpointing/finalizing. Reconcile before
                    # closing the cursor, or a later resume would miss it.
                    self.ledger.reconcile_journal(active)
                    self.ledger.finish(active['run_id'],'stopped' if self.status=='stopped' else 'interrupted',self.error)
                except Exception as error:
                    self.status='interrupted';self.error='Journal reconciliation failed: '+str(error)
                    self.ledger.notice('reconciliation-failed',self.error)
                    # Keep its accounting cursor active for explicit recovery;
                    # do not erase or silently skip conflicting/corrupt evidence.
            self.publish(force=True)
        return 1 if self.error else 0


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--controller',choices=CONTROLLERS,required=True)
    parser.add_argument('--neural-config')
    parser.add_argument('--session',default='boss-practice')
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--seed',type=int,default=1924)
    parser.add_argument('--boss-seconds',type=float,default=180)
    parser.add_argument('--wave-seconds',type=float,default=30)
    parser.add_argument('--disk-budget-gib',type=float,default=8)
    parser.add_argument('--render-profile',choices=('local-d3d11','swiftshader'),default='local-d3d11' if os.name=='nt' else 'swiftshader')
    parser.add_argument('--max-decisions',type=int,help='Bounded verification only; omitted for the ongoing session')
    args=parser.parse_args()
    if not args.session or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in args.session):parser.error('Session must be a simple local identifier')
    if args.max_decisions is not None and args.max_decisions<1:parser.error('max-decisions must be positive')
    config=validate_config({'version':1,'task':'boss-practice-v1','controller':args.controller,'neuralConfig':args.neural_config,
        'seed':args.seed,'bossSeconds':args.boss_seconds,'waveSeconds':args.wave_seconds,'renderProfile':args.render_profile,
        'maxBytes':int(args.disk_budget_gib*1024**3),'rewardProtocol':'boss-hull-damage-v1'})
    path=ROOT/'sessions'/args.session
    with SessionLease(ROOT/'runner.lock'):
        if (path/'session.sqlite3').exists() and not args.resume:raise ValueError('Session already exists; use --resume to retain cumulative records')
        ledger=SessionLedger(path,config)
        identity=source_identity();source_path=path/'source-identity.json'
        if source_path.exists():
            if json.loads(source_path.read_text())['sourceTreeHash']!=identity['sourceTreeHash']:
                raise ValueError('Source changed since this session began; a new versioned session is required')
        else:atomic_json(source_path,identity)
        if args.controller=='neural-plastic' and ledger.last_bout():
            raise ValueError('Automatic plastic-model crash recovery is not validated. Restore and audit its complete checkpoint before a new session; learned state will never silently reset.')
        ledger.recover()
        owner={'pid':os.getpid(),'createdAt':psutil.Process().create_time(),'sessionId':ledger.session_id,'startedAt':utc_now()}
        atomic_json(ROOT/'owner.json',owner)
        runner=ContinuousRunner(ledger,config)
        def stop(*_):runner.stop_requested=True
        signal.signal(signal.SIGINT,stop);signal.signal(signal.SIGTERM,stop)
        print(json.dumps({'sessionId':ledger.session_id,'controller':CONTROLLERS[args.controller],'learningStatus':'not-learning' if args.controller!='neural-plastic' else 'unvalidated-training','snapshot':str(ROOT/'latest.json'),'pid':os.getpid()}),flush=True)
        try:return runner.run(args.max_decisions)
        finally:
            atomic_json(ROOT/'owner.json',{**owner,'stoppedAt':utc_now()});ledger.close()


if __name__=='__main__':raise SystemExit(main())
