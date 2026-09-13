/** Local, persistent boss-learning experiment. This executable has no public controls. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import readline from 'node:readline';
import {EngineDriver} from './driver.mjs';
import {extractBossPixels} from './boss-learning-vision.mjs';

const LAB=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ROOT=path.join(LAB,'runtime','boss-learning-v1');
const PYTHON=path.join(LAB,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const ENV={...process.env,PYTHONPATH:[path.join(LAB,'python'),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const now=()=>new Date().toISOString();
const exists=async file=>fs.access(file).then(()=>true,()=>false);

export function optionsFromArgs(args) {
  const config={session:'boss-learning',resume:false,seed:1924,bossSeconds:180,evaluationSeconds:30,evaluationSeeds:[9124,9125,9126],trainingBouts:5,maxWallSeconds:null,maxDecisions:null,maxBytes:8*1024**3,renderProfile:process.platform==='win32'?'local-d3d11':'swiftshader',origin:'http://127.0.0.1:5180',circuit:'configs/boss-learning-circuit-v1.json'};
  const names={'--session':'session','--seed':'seed','--boss-seconds':'bossSeconds','--evaluation-seconds':'evaluationSeconds','--evaluation-seeds':'evaluationSeeds','--training-bouts':'trainingBouts','--max-seconds':'maxWallSeconds','--max-decisions':'maxDecisions','--disk-budget-gib':'maxBytes','--render-profile':'renderProfile','--origin':'origin','--circuit':'circuit'};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--resume'){config.resume=true;continue;}
    const name=names[args[i]],value=args[++i];if(!name||value===undefined)throw new Error('Unknown option or missing value');
    config[name]=name==='evaluationSeeds'?value.split(',').map(Number):['session','renderProfile','origin','circuit'].includes(name)?value:Number(value)*(name==='maxBytes'?1024**3:1);
  }
  if(!/^[A-Za-z0-9_-]{1,70}$/.test(config.session))throw new Error('Session must be a simple local name');
  const uint32=n=>Number.isSafeInteger(n)&&n>=0&&n<2**32;
  if(!uint32(config.seed)||!config.evaluationSeeds.length||config.evaluationSeeds.length>20||!config.evaluationSeeds.every(uint32))throw new Error('Seeds must be uint32 integers');
  for(const [key,max] of [['bossSeconds',180],['evaluationSeconds',180]])if(!Number.isFinite(config[key])||config[key]<1||config[key]>max)throw new Error(`${key} must be 1..${max}`);
  if(!Number.isSafeInteger(config.trainingBouts)||config.trainingBouts<1||config.trainingBouts>100)throw new Error('training-bouts must be 1..100');
  for(const key of ['maxWallSeconds','maxDecisions'])if(config[key]!==null&&(!Number.isFinite(config[key])||config[key]<1))throw new Error(`Invalid ${key}`);
  if(!Number.isSafeInteger(config.maxBytes)||config.maxBytes<256*1024**2)throw new Error('Disk budget must be at least .25 GiB');
  if(!['swiftshader','local-d3d11'].includes(config.renderProfile))throw new Error('Unsupported renderer');
  const origin=new URL(config.origin);if(!['127.0.0.1','localhost'].includes(origin.hostname)||origin.protocol!=='http:')throw new Error('Game origin must be loopback HTTP');
  config.origin=origin.origin;
  return config;
}

export function confirmedHullDamage(events) {
  if(!Array.isArray(events))throw new Error('A complete event list is required');
  const hits=[];
  for(let index=0;index<events.length;index++) {
    const event=events[index];if(!event||typeof event!=='object')throw new Error('Invalid event');
    if(event.type!=='entity-damage'||event.sourceKind!=='player'||!['BOSS','MINI_BOSS'].includes(event.targetKind))continue;
    if(!Number.isFinite(event.amount)||event.amount<=0||!Number.isFinite(event.remainingHealth)||event.remainingHealth<0||typeof event.targetId!=='string')throw new Error('Invalid confirmed hull damage');
    hits.push({eventIndex:index,targetId:event.targetId,amount:event.amount,remainingHealth:event.remainingHealth,fatal:event.fatal===true});
  }
  return {amount:hits.reduce((n,hit)=>n+hit.amount,0),hits};
}

export async function atomicJson(file,value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=`${file}.${process.pid}.${randomUUID()}.tmp`,handle=await fs.open(temporary,'wx');
  try {await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
  for(let attempt=0;;attempt++){
    try{await fs.rename(temporary,file);break;}
    catch(error){if(attempt>=15||!['EACCES','EPERM','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}
  }
}

export class Journal {
  constructor(file){this.file=file;this.hash='0'.repeat(64);this.rows=[];this.bytes=0;}
  async open(){
    if(await exists(this.file)) {
      const size=(await fs.stat(this.file)).size,tail=Buffer.alloc(1),read=await fs.open(this.file,'r');
      try{if(size)await read.read(tail,0,1,size-1);}finally{await read.close();}
      if(size&&tail[0]!==10)throw new Error('Partial journal tail; preserve evidence and recover explicitly');
      for await(const line of readline.createInterface({input:createReadStream(this.file),crlfDelay:Infinity})) {
        if(!line)continue;
        const record=JSON.parse(line);if(record.previous!==this.hash||record.hash!==sha(record.previous+JSON.stringify(record.payload)))throw new Error('Journal hash-chain mismatch');
        this.hash=record.hash;this.remember(record.payload);
      }
      this.bytes=size;
    }
    this.handle=await fs.open(this.file,'a');return this;
  }
  async append(payload){
    const record={previous:this.hash,payload,hash:sha(this.hash+JSON.stringify(payload))},line=JSON.stringify(record)+'\n';
    await this.handle.write(line);await this.handle.sync();this.hash=record.hash;this.remember(payload);this.bytes+=Buffer.byteLength(line);
  }
  remember(payload){if(payload.kind==='bout-start')this.rows=[];this.rows.push(payload);}
  async close(){await this.handle?.close();this.handle=null;}
}

class Bridge {
  constructor(config,folder){this.config=config;this.folder=folder;this.counter=0;this.pending=new Map();}
  async open(){
    this.process=spawn(PYTHON,['scripts/boss-learning-worker.py','--circuit',this.config.circuit,'--seed',String(this.config.seed)],{cwd:LAB,env:ENV,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.stderr=await fs.open(path.join(this.folder,'model-stderr.log'),'a');
    this.process.stderr.on('data',bytes=>{this.stderr.write(bytes).catch(()=>{});});
    readline.createInterface({input:this.process.stdout,crlfDelay:Infinity}).on('line',line=>{
      try {const message=JSON.parse(line),waiter=this.pending.get(message.id);if(!waiter)throw new Error('Unmatched model response');this.pending.delete(message.id);clearTimeout(waiter.timer);message.ok===false?waiter.reject(new Error(message.error)):waiter.resolve(message.result??message);}
      catch(error){for(const waiter of this.pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}this.pending.clear();}
    });
    this.process.on('error',error=>{for(const waiter of this.pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}this.pending.clear();});
    this.process.on('exit',code=>{for(const waiter of this.pending.values()){clearTimeout(waiter.timer);waiter.reject(new Error(`Model worker exited (${code})`));}this.pending.clear();});
    return this.call({op:'status'});
  }
  call(request){return new Promise((resolve,reject)=>{const id=++this.counter,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Model operation timed out'));},120000);this.pending.set(id,{resolve,reject,timer});this.process.stdin.write(JSON.stringify({...request,id})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});});}
  async close(){if(this.process?.exitCode===null){await this.call({op:'close'}).catch(()=>{});this.process.stdin.end();this.process.kill();}await this.stderr?.close();}
}

async function lease(root) {
  await fs.mkdir(root,{recursive:true});const file=path.join(root,'owner.lock');
  if(await exists(file)) {
    const old=JSON.parse(await fs.readFile(file,'utf8'));let alive=false;
    try{process.kill(old.pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')throw error;}
    if(alive)throw new Error('Another boss learning runner owns the local experiment');
    await fs.unlink(file);
  }
  const handle=await fs.open(file,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:now()}));await handle.sync();
  return async()=>{await handle.close();await fs.unlink(file);};
}

async function treeBytes(folder){let size=0;for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())size+=await treeBytes(file);else if(entry.isFile())size+=(await fs.stat(file)).size;}return size;}
const methodConfig=config=>Object.fromEntries(Object.entries(config).filter(([key])=>!['resume','maxWallSeconds','maxDecisions','maxBytes'].includes(key)));
const cleanNeural=value=>{
  if(value===null)return null;
  if(!value||typeof value!=='object')throw new Error('Model did not return neural telemetry');
  const keys=['changedWeights','changedThisStep','meanEfficacy','danHz','kcHz','mbonHz','weightHash','modelTimeSeconds','probabilities','reinforcementDose','deliveredReinforcement','identity','modelVersion','activityKind','plasticityChanges','lifetimeWeightUpdates','simTimeSeconds','visionUsable'];
  const neural=Object.fromEntries(keys.filter(key=>key in value).map(key=>[key,value[key]]));
  neural.changedWeights=value.changedWeightsSinceInitialization??value.changedWeights;
  neural.sampledNeurons=(value.sampledNeurons??value.samples??[]).slice(0,32).map(({id,type,hz})=>({id,type,hz}));
  if(!['changedWeights','meanEfficacy','danHz','kcHz','mbonHz'].every(key=>Number.isFinite(neural[key]))||!neural.sampledNeurons.every(n=>typeof n.id==='string'&&typeof n.type==='string'&&Number.isFinite(n.hz)&&n.hz>=0))throw new Error('Invalid actual neural rate telemetry');
  return neural;
};
const checkpointPayload=value=>{const checkpoint=value.checkpoint??value;if(!checkpoint||typeof checkpoint!=='object')throw new Error('Model checkpoint is missing');return checkpoint;};
const weightHash=value=>value.weightHash??value.neural?.weightHash??value.checkpoint?.weightHash??null;

export async function run(config) {
  const release=await lease(ROOT),folder=path.join(ROOT,config.session),checkpointFile=path.join(folder,'resume.json');
  let bridge,driver,journal,state,result=null,identity,stop=false,status='transitioning',error=null,lastPublish=0,bytes=0,dirty=false;
  const started=Date.now();let localDecisions=0;
  const onStop=()=>{stop=true;};process.on('SIGINT',onStop);process.on('SIGTERM',onStop);
  async function budget(){bytes=await treeBytes(folder);const disk=await fs.statfs(folder);if(bytes+64*1024**2>=config.maxBytes||disk.bavail*disk.bsize<2*1024**3)throw Object.assign(new Error('Storage limit reached; saved records retained. Increase the explicit private budget to continue.'),{storageLimit:true});}
  async function checkpoint(){
    const model=checkpointPayload(await bridge.call({op:'checkpoint'}));
    await atomicJson(checkpointFile,{schemaVersion:1,method:methodConfig(config),sourceTreeHash:identity.sourceTreeHash,journalHash:journal.hash,state,model,clean:true,savedAt:now()});dirty=false;
  }
  async function publish(force=false) {
    if(!state||(!force&&Date.now()-lastPublish<250))return;
    let image=state.lastImage??null;
    if(result?.frame?.pngDataUrl){const pixels=await driver.page.evaluate(extractBossPixels,{pngDataUrl:result.frame.pngDataUrl,includeJpeg:true});image=pixels.image;state.lastVision=pixels.vision;}
    state.publicSequence++;state.lastImage=image;
    const bout=state.bout,elapsed=bout?.tick/60||0,damage=bout?.damage??0;
    const snapshot={schemaVersion:1,kind:'scicon-boss-learning-v1',sessionId:state.sessionId,sequence:state.publicSequence,updatedAt:now(),status,
      controller:{id:'boss-learning-v1',name:'MaleCNS-derived mushroom-body aiming model',learningStatus:bout?.mode==='training'?'training':'fixed-evaluation',identity:state.modelIdentity},
      phase:{kind:bout?.phase??state.nextPhase,name:bout?.phase==='wave'?'Orbit Entry • intermission':'Gatekeeper Prime',elapsedSeconds:elapsed,damage,hits:bout?.hits??0,damagePerSecond:elapsed?damage/elapsed:0,mode:bout?.mode??state.mode},
      totals:state.totals,action:state.action,feedback:{computedReward:bout?.mode==='training'?state.pendingReward:0,deliveredReward:state.deliveredReward,lastHitAt:state.lastHit?.simulatedSeconds??null,lastHitId:state.lastHit?.id??null,bossDamage:state.lastHit?.amount??0},
      neural:state.neural,vision:state.lastVision??null,metrics:{evaluations:state.evaluations.slice(-24).map(row=>({label:`${row.stage} · seed ${row.seed}`,damagePerSecond:row.damagePerSecond,simulatedSeconds:row.seconds,trainingSeconds:row.trainingSeconds})),trainingBouts:state.trainingBouts,evidence:'INSUFFICIENT EVIDENCE',note:'Cumulative points are display totals; improvement is assessed in frozen evaluations.'},image,error,limits:{usedBytes:bytes,maxBytes:config.maxBytes}};
    if(image){const content=Buffer.from(image.split(',')[1],'base64');snapshot.frame={mimeType:'image/jpeg',width:390,height:844,sha256:sha(content)};}
    await atomicJson(path.join(folder,'public','latest.json'),snapshot);lastPublish=Date.now();
  }
  async function beginBout() {
    status='transitioning';await publish(true);await budget();
    const mode=state.mode,phase='boss';
    if(mode==='evaluation'&&!state.trainingAnchor)state.trainingAnchor=checkpointPayload(await bridge.call({op:'checkpoint'}));
    const seed=mode==='evaluation'?config.evaluationSeeds[state.evaluationIndex]:config.seed;
    const reset=await bridge.call({op:'reset',learning:mode==='training',preserveEfficacy:true,seed});
    state.neural=cleanNeural(reset.neural??null);
    const frozenWeightHash=weightHash(reset)??weightHash(await bridge.call({op:'status'}));
    if(mode==='evaluation'&&!frozenWeightHash)throw new Error('Frozen evaluation requires a model weight hash');
    const seconds=mode==='evaluation'?config.evaluationSeconds:config.bossSeconds;
    result=await driver.command({op:'reset',seed,episode:{task:'boss-practice-v1',practicePhase:phase,timeLimitSeconds:seconds}});
    const number=++state.boutNumber;
    state.bout={id:`bout-${String(number).padStart(6,'0')}`,number,mode,phase,seed,seconds,seq:0,tick:0,damage:0,hits:0,score:0,frozenWeightHash};
    state.pendingReward=0;state.deliveredReward=0;state.lastHit=null;state.action={movement:'idle',fire:true};state.holdRemaining=0;state.heldSeconds=0;
    await journal.append({kind:'bout-start',at:now(),bout:state.bout,config:result.state.config,runtimeIdentity:result.runtimeIdentity,stateHash:result.stateHash,frameHash:result.frame.sha256});
    await fs.writeFile(path.join(folder,`${state.bout.id}-initial.png`),Buffer.from(result.frame.pngDataUrl.split(',')[1],'base64'));
    dirty=true;status='running';await publish(true);await checkpoint();
  }
  async function finishBout() {
    const bout=state.bout;
    if(bout.mode==='training'){
      const terminal=await bridge.call({op:'reinforce',reinforcement:state.pendingReward,dtSeconds:state.heldSeconds});
      if(terminal.neural)state.neural=cleanNeural(terminal.neural);
      await journal.append({kind:'terminal-reinforcement',boutId:bout.id,rawReward:state.pendingReward,result:terminal});
      state.deliveredReward=state.pendingReward;state.pendingReward=0;
    }
    const modelStatus=await bridge.call({op:'status'}),afterHash=weightHash(modelStatus);
    if(bout.mode==='evaluation'&&afterHash!==bout.frozenWeightHash)throw new Error('Frozen evaluation changed learned weights');
    const summary={...bout,outcome:result.state.practice?.outcome??(result.truncated?'time-limit':'completed'),damagePerSecond:bout.damage/(bout.tick/60),weightHash:afterHash,endedAt:now()};
    if(bout.mode==='evaluation'){
      const evaluation={stage:state.evaluationStage,trainingBouts:state.trainingBouts,trainingSeconds:state.trainingSeconds,seed:bout.seed,damage:bout.damage,damagePerSecond:summary.damagePerSecond,score:bout.score,seconds:bout.tick/60,outcome:summary.outcome,weightHash:afterHash,weightsFrozen:true};
      state.evaluations.push(evaluation);state.evaluationIndex++;
      if(state.evaluationIndex===config.evaluationSeeds.length){await bridge.call({op:'restore',checkpoint:state.trainingAnchor});state.neural=cleanNeural((await bridge.call({op:'status'})).neural??null);state.trainingAnchor=null;state.mode='training';state.nextPhase='boss';state.evaluationIndex=0;}
    }else {state.trainingBouts++;state.nextPhase='boss';if(state.trainingBouts%config.trainingBouts===0){state.mode='evaluation';state.evaluationStage=`after-${state.trainingBouts}`;state.evaluationIndex=0;}}
    await journal.append({kind:'bout-end',summary});await atomicJson(path.join(folder,`${bout.id}-summary.json`),summary);
    state.bout=null;state.pendingReward=0;dirty=true;status='transitioning';await publish(true);await checkpoint();
  }
  try {
    await fs.mkdir(folder,{recursive:true});
    if(await exists(checkpointFile)){if(!config.resume)throw new Error('Session exists; use --resume to retain its learned state');}
    else if(config.resume)throw new Error('No saved session checkpoint exists');
    const source=await promisify(execFile)(PYTHON,['-c','import json; from scicon_fly.artifacts import source_identity; print(json.dumps(source_identity()))'],{cwd:LAB,env:ENV,windowsHide:true,maxBuffer:8*1024**2});identity=JSON.parse(source.stdout);
    journal=await new Journal(path.join(folder,'journal.jsonl')).open();
    bridge=new Bridge(config,folder);const modelStatus=await bridge.open();
    driver=new EngineDriver(config.origin,{renderProfile:config.renderProfile});
    if(config.resume) {
      const saved=JSON.parse(await fs.readFile(checkpointFile,'utf8'));
      if(!saved.clean||saved.journalHash!==journal.hash)throw new Error('Journal extends beyond a clean model checkpoint; explicit recovery is required and all evidence is preserved');
      if(JSON.stringify(saved.method)!==JSON.stringify(methodConfig(config))||saved.sourceTreeHash!==identity.sourceTreeHash)throw new Error('Model/game methods changed; start a new versioned session');
      state=saved.state;await bridge.call({op:'restore',checkpoint:saved.model});
      const publicFile=path.join(folder,'public','latest.json');if(await exists(publicFile))state.publicSequence=Math.max(state.publicSequence,JSON.parse(await fs.readFile(publicFile,'utf8')).sequence);
      if(state.bout){
        const bout=state.bout;result=await driver.command({op:'reset',seed:bout.seed,episode:{task:'boss-practice-v1',practicePhase:bout.phase,timeLimitSeconds:bout.seconds}});
        for(const row of journal.rows.filter(row=>row.kind==='decision'&&row.boutId===bout.id)){
          result=await driver.command({op:'step',seq:row.boutSequence,action:row.action});
          if(result.stateHash!==row.stateHash||result.frame.sha256!==row.frameHash)throw new Error('Resume replay differs from the recorded pinned game state/frame');
        }
      }
    }else{
      if(journal.rows.length)throw new Error('An existing journal has no checkpoint; preserve it for explicit recovery');
      state={sessionId:`${config.session}-${randomUUID().slice(0,8)}`,publicSequence:0,decisionSequence:0,boutNumber:0,bout:null,trainingBouts:0,trainingSeconds:0,holdRemaining:0,heldSeconds:0,modelPixels:null,mode:'evaluation',nextPhase:'boss',evaluationStage:'baseline',evaluationIndex:0,trainingAnchor:null,evaluations:[],totals:{score:0,bossDamage:0,bossHits:0,simulatedSeconds:0},pendingReward:0,deliveredReward:0,lastHit:null,action:{movement:'idle',fire:true},neural:null,modelIdentity:modelStatus.identity??modelStatus};
      await atomicJson(path.join(folder,'config.json'),{...methodConfig(config),visionMethod:'rgba-connected-color-v1',controllerIntervalSeconds:.2,engineObservationSeconds:.05,terminalReinforcementInterval:'Actual final held-action game ticks divided by 60',reward:'confirmed boss hull HP loss only',reinforcement:'Engineered PAM stimulation; dose is declared by model manifest',evidence:'INSUFFICIENT EVIDENCE'});
      await atomicJson(path.join(folder,'source-identity.json'),identity);await atomicJson(path.join(folder,'model-identity.json'),modelStatus);
      await checkpoint();
    }
    await atomicJson(path.join(folder,'owner.json'),{pid:process.pid,sessionId:state.sessionId,startedAt:now()});
    console.log(JSON.stringify({status:'starting',sessionId:state.sessionId,publicFile:path.join(folder,'public','latest.json'),resume:config.resume}));
    while(!stop){
      if(config.maxWallSeconds!==null&&(Date.now()-started)/1000>=config.maxWallSeconds)break;
      if(config.maxDecisions!==null&&localDecisions>=config.maxDecisions)break;
      if(await exists(path.join(folder,'stop.request'))){await fs.unlink(path.join(folder,'stop.request'));break;}
      const stepStart=Date.now();if(!state.bout)await beginBout();
      if(state.decisionSequence%100===0)await budget();
      const policyDecision=state.holdRemaining===0;
      let delivered=0;
      if(policyDecision){
        state.modelPixels=await driver.page.evaluate(extractBossPixels,{pngDataUrl:result.frame.pngDataUrl});
        state.modelPixels.sourceFrameHash=result.frame.sha256;state.modelPixels.sourceTick=result.tick;
        const target=result.state.entities.find(entity=>entity.type==='BOSS'),ship=result.state.player;
        state.modelDiagnostics={source:'Privileged validation only; never sent to model',playerCenterX:ship.x+ship.width/2,bossCenterX:target?target.x+target.width/2:null,controllable:result.state.timers.intro<=0&&result.state.timers.departure<=0};
        delivered=state.bout.mode==='training'?state.pendingReward:0;
        const model=await bridge.call({op:'step',features:state.modelPixels.features,reinforcement:delivered,dtSeconds:.2});
        const proposed=model.action;if(!proposed||!['W','idle','E'].includes(proposed.movement)||proposed.fire!==true)throw new Error('Model returned an invalid horizontal action');
        state.neural=cleanNeural(model.neural);state.action=proposed;state.holdRemaining=4;state.heldSeconds=0;state.pendingReward=0;state.deliveredReward=delivered;
      }
      const pixels=state.modelPixels,action=state.action;
      dirty=true;const previousScore=state.bout.score,previousTick=state.bout.tick;
      const next=await driver.command({op:'step',seq:state.bout.seq+1,action});
      const outcome=confirmedHullDamage(next.events),score=next.state.score;
      if(!Number.isFinite(score)||score<previousScore)throw new Error('Episode score decreased');
      state.lastVision=pixels.vision;state.holdRemaining--;
      state.decisionSequence++;state.bout.seq++;state.bout.tick=next.tick;state.bout.damage+=outcome.amount;state.bout.hits+=outcome.hits.length;state.bout.score=score;
      state.totals.score+=score-previousScore;state.totals.bossDamage+=outcome.amount;state.totals.bossHits+=outcome.hits.length;state.totals.simulatedSeconds+=(next.tick-previousTick)/60;
      state.heldSeconds+=(next.tick-previousTick)/60;
      if(state.bout.mode==='training')state.trainingSeconds+=(next.tick-previousTick)/60;
      if(state.bout.mode==='training')state.pendingReward+=outcome.amount;
      if(outcome.hits.length)state.lastHit={id:`${state.bout.id}:${state.bout.seq}`,amount:outcome.amount,simulatedSeconds:state.totals.simulatedSeconds};
      const boss=next.state.entities.find(entity=>entity.type==='BOSS'),player=next.state.player;
      await journal.append({kind:'decision',sequence:state.decisionSequence,boutId:state.bout.id,boutSequence:state.bout.seq,mode:state.bout.mode,tick:next.tick,policyDecision,features:pixels.features,vision:pixels.vision,inputFrameHash:pixels.sourceFrameHash,inputTick:pixels.sourceTick,inputDiagnostics:policyDecision?state.modelDiagnostics:null,action,confirmedHullDamage:outcome.amount,computedReward:state.bout.mode==='training'?outcome.amount:0,deliveredReward:delivered,neural:policyDecision?state.neural:null,events:next.events,stateHash:next.stateHash,frameHash:next.frame.sha256,observationHash:next.observation.sha256,score,
        diagnostics:{source:'privileged evaluation only; never policy input',playerX:player.x,playerY:player.y,playerCenterX:player.x+player.width/2,bossX:boss?.x??null,bossY:boss?.y??null,bossCenterX:boss?boss.x+boss.width/2:null,bossHp:boss?.hp??null,withinBounds:player.x+player.width/2>=0&&player.x+player.width/2<=390&&player.y+player.height/2>=0&&player.y+player.height/2<=844,controllable:next.state.timers.intro<=0&&next.state.timers.departure<=0}});
      result=next;localDecisions++;status='running';await publish();
      if(next.terminated||next.truncated)await finishBout();
      const delay=50-(Date.now()-stepStart);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    }
    status='stopped';await publish(true);await checkpoint();
  }catch(caught){error=String(caught.message??caught);status=caught.storageLimit?'storage-limit':'error';console.error(error);if(state)await publish(true).catch(()=>{});}
  finally{
    if(state&&status==='storage-limit')await checkpoint().catch(()=>{});
    await driver?.close().catch(()=>{});await bridge?.close().catch(()=>{});await journal?.close().catch(()=>{});
    if(state)await atomicJson(path.join(folder,'owner.json'),{pid:process.pid,sessionId:state.sessionId,stoppedAt:now(),status,error});
    process.off('SIGINT',onStop);process.off('SIGTERM',onStop);await release();
  }
  return error?1:0;
}

if(process.argv[1]===fileURLToPath(import.meta.url))process.exitCode=await run(optionsFromArgs(process.argv.slice(2)));
