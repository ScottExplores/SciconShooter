/** Independent artifact audit: no imports from the controller, runner or game. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';

const LAB=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>createHash('sha256').update(x).digest('hex');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const close=(a,b,tolerance=1e-7)=>finite(a)&&finite(b)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const errorSummary=xs=>({n:xs.length,meanAbsolutePixels:mean(xs),maximumAbsolutePixels:xs.length?xs.reduce((a,b)=>Math.max(a,b),0):null});

export async function auditSession(sessionDir,{circuitPath=path.join(LAB,'configs/boss-learning-circuit-v1.json')}={}) {
  const config=JSON.parse(await fs.readFile(path.join(sessionDir,'config.json'),'utf8'));
  const circuit=JSON.parse(await fs.readFile(circuitPath,'utf8'));
  const edges=new Map(circuit.edges.map(e=>[e.kcId,e]));
  const weights=new Map(circuit.edges.map(e=>[e.kcId,1]));
  const failures=[],warnings=[],bouts=[];
  let previous='0'.repeat(64),records=0,decisions=0,policyDecisions=0,current=null,priorDiagnostic=null;
  let totalDamage=0,totalComputed=0,totalDelivered=0,weightUpdates=0,nonzeroDoses=0,departed=0,visible=0,withinBounds=0,boundsSamples=0;
  let trainingBouts=0,trainingSeconds=0,frozenBouts=0,frozenChanges=0,actionSwitches=0,lastSequence=0;
  const changedIds=new Set(),playerErrors=[],targetErrors=[],alignmentSamples=[];
  const check=(condition,message)=>{if(!condition&&failures.length<200)failures.push(`record${records}: ${message}`);};

  function neuralCheck(neural,mode,rawReward) {
    check(neural&&typeof neural==='object','Missing model telemetry');
    if(!neural)return;
    check(close(neural.deliveredReinforcement,rawReward),'Model raw reinforcement receipt differs from delivery');
    const expectedDose=mode==='training'?Math.min(rawReward/2,1):0;
    check(close(neural.reinforcementDose,expectedDose),'PAM dose differs from frozen min(damage/2,1) mapping');
    if(neural.reinforcementDose>0)nonzeroDoses++;
    check(close(neural.danHz,20*expectedDose),'Recorded DAN rate differs from declared imposed dose');
    const ledger=neural.plasticityChanges;
    check(Array.isArray(ledger),'Complete changed-edge ledger missing');
    if(Array.isArray(ledger)) {
      check(neural.changedThisStep===ledger.length,'changedThisStep differs from actual ledger count');
      if(mode==='evaluation'&&ledger.length){frozenChanges+=ledger.length;check(false,'Frozen evaluation modified efficacies');}
      const seen=new Set();
      for(const item of ledger) {
        check(edges.has(item.sourceId)&&item.targetId===circuit.mbonId,'Plastic update is outside frozen real circuit');
        check(!seen.has(item.sourceId),'Duplicate update to same edge within model step');seen.add(item.sourceId);
        check(finite(item.before)&&finite(item.after)&&item.before>=.1-1e-12&&item.before<=1&&item.after>=.1-1e-12&&item.after<=1,'Efficacy outside frozen bounds');
        check(item.after<item.before,'Plasticity ledger has a zero or wrong-direction update');
        check(close(item.delta,item.after-item.before,1e-10),'Plastic delta arithmetic mismatch');
        check(close(item.before,weights.get(item.sourceId),1e-10),'Plasticity before-value breaks persisted weight chain');
        weights.set(item.sourceId,item.after);changedIds.add(item.sourceId);weightUpdates++;
      }
    }
    check(close(neural.meanEfficacy,mean([...weights.values()]),1e-10),'Recorded mean efficacy differs from independently reconstructed weights');
    check(neural.changedWeights===[...weights.values()].filter(w=>w!==1).length,'Recorded changed-weight total differs from reconstructed state');
    const samples=neural.sampledNeurons??neural.samples??[];
    const ids=new Set();
    for(const s of samples){check(circuit.neurons.some(n=>n.id===s.id&&n.type===s.type),'Activity sample has no matching actual neuron');check(!ids.has(s.id),'Duplicated anatomical neuron in activity');ids.add(s.id);check(finite(s.hz)&&s.hz>=0,'Invalid modeled rate');}
    if(neural.probabilities) {
      const p=['W','idle','E'].map(k=>neural.probabilities[k]);
      check(p.every(v=>finite(v)&&v>=0&&v<=1)&&close(p.reduce((a,b)=>a+b,0),1,1e-10),'Action probabilities invalid');
      if(p.some(v=>Math.abs(v-1/3)>1e-8))departed++;
    }
  }

  const journalFile=path.join(sessionDir,'journal.jsonl');
  const stat=await fs.stat(journalFile);
  if(stat.size){const handle=await fs.open(journalFile,'r'),tail=Buffer.alloc(1);try{await handle.read(tail,0,1,stat.size-1);}finally{await handle.close();}check(tail[0]===10,'Partial journal tail; audit a clean stopped snapshot');}
  const input=createReadStream(journalFile),fileHash=createHash('sha256');
  input.on('data',chunk=>fileHash.update(chunk));
  for await(const line of readline.createInterface({input,crlfDelay:Infinity})) {
    if(!line)continue;
    records++;
    let record;
    try{record=JSON.parse(line);}catch{check(false,'Invalid journal JSON');break;}
    check(record.previous===previous,'Hash chain previous-link mismatch');
    check(record.hash===hash(record.previous+JSON.stringify(record.payload)),'Hash chain payload mismatch');
    previous=record.hash;
    const row=record.payload;
    if(row.kind==='bout-start') {
      check(current===null,'New bout started before prior bout ended');
      current={...row.bout,pending:0,damage:0,hits:0,score:0,tick:0,sequence:0,heldSteps:0,heldAction:null,terminal:false,stage:row.bout.mode==='evaluation'?(trainingBouts===0?'baseline':`after-${trainingBouts}`):'training',trainingBoutsAtStart:trainingBouts,trainingSecondsAtStart:trainingSeconds};
      priorDiagnostic=null;
    } else if(row.kind==='decision') {
      decisions++;
      check(current&&row.boutId===current.id,'Decision outside matching bout');
      if(!current)continue;
      check(row.sequence===lastSequence+1,'Global decision sequence is not consecutive');lastSequence=row.sequence;
      check(row.boutSequence===current.sequence+1,'Bout decision sequence is not consecutive');current.sequence=row.boutSequence;
      check(row.mode===current.mode,'Decision mode differs from frozen bout mode');
      check(Number.isInteger(row.tick)&&row.tick>current.tick&&row.tick-current.tick<=3,'Game clock step is not 1..3 canonical ticks');
      if(current.mode==='training')trainingSeconds+=(row.tick-current.tick)/60;
      const mode=current.mode;
      if(row.policyDecision) {
        policyDecisions++;
        check(current.heldSteps===0||current.heldSteps===4,'Model decision did not follow four held engine steps');
        const expected=mode==='training'?current.pending:0;
        check(close(row.deliveredReward,expected),'Policy reward is not sum of preceding held interval');
        totalDelivered+=row.deliveredReward;current.pending=0;current.heldSteps=0;
        if(current.heldAction&&current.heldAction.movement!==row.action.movement)actionSwitches++;
        current.heldAction=row.action;
        neuralCheck(row.neural,mode,row.deliveredReward);
        const f=row.features;
        check(f&&typeof f.targetVisible==='boolean'&&finite(f.targetOffset)&&f.targetOffset>=-1&&f.targetOffset<=1&&finite(f.playerX)&&f.playerX>=0&&f.playerX<=1,'Invalid declared pixel feature');
        if(f?.targetVisible)visible++;
        if((row.inputDiagnostics??priorDiagnostic)&&f?.targetVisible) {
          const d=row.inputDiagnostics??priorDiagnostic,v=row.vision;
          // Vision describes the pre-action frame; the preceding journal row's
          // diagnostics describe that exact frame. x/y in Scicon are top-left.
          if(finite(v?.playerX)&&finite(d.playerX)&&finite(d.playerWidth))playerErrors.push(Math.abs(v.playerX*390-(d.playerX+d.playerWidth/2)));
          else if(finite(v?.playerX)&&finite(d.playerCenterX))playerErrors.push(Math.abs(v.playerX*390-d.playerCenterX));
          if(finite(v?.targetX)&&finite(d.bossX)&&finite(d.bossWidth))targetErrors.push(Math.abs(v.targetX*390-(d.bossX+d.bossWidth/2)));
          else if(finite(v?.targetX)&&finite(d.bossCenterX))targetErrors.push(Math.abs(v.targetX*390-d.bossCenterX));
        }
      } else {
        check(close(row.deliveredReward,0),'Reward delivered without a model decision');
        check(row.neural===null,'Held frame unexpectedly contains another neural update');
        check(current.heldAction&&JSON.stringify(row.action)===JSON.stringify(current.heldAction),'Action changed during held interval');
      }
      current.heldSteps++;
      check(current.heldSteps<=4,'Held interval exceeded four engine steps');
      let damage=0,hits=0;
      check(Array.isArray(row.events),'Complete game events missing');
      for(const event of row.events??[]) {
        if(event.type==='entity-damage'&&event.sourceKind==='player'&&['BOSS','MINI_BOSS'].includes(event.targetKind)) {
          check(finite(event.amount)&&event.amount>0&&finite(event.remainingHealth)&&event.remainingHealth>=0&&typeof event.targetId==='string','Invalid confirmed hull event');
          damage+=event.amount;hits++;
        }
      }
      check(close(row.confirmedHullDamage,damage),'Reported hull damage differs from complete event list');
      check(close(row.computedReward,mode==='training'?damage:0),'Computed reward differs from declared training-only hull damage');
      check(finite(row.score)&&row.score>=current.score,'Score decreased or became invalid');
      current.pending+=mode==='training'?damage:0;current.damage+=damage;current.hits+=hits;current.score=row.score;current.tick=row.tick;
      totalDamage+=damage;totalComputed+=row.computedReward;
      if(typeof row.diagnostics?.withinBounds==='boolean'){boundsSamples++;if(row.diagnostics.withinBounds)withinBounds++;}
      const d=row.diagnostics;
      if(finite(d?.playerCenterX)&&finite(d?.bossCenterX))alignmentSamples.push({boutId:current.id,absoluteCenterSeparation:Math.abs(d.playerCenterX-d.bossCenterX)});
      else if(finite(d?.playerX)&&finite(d?.playerWidth)&&finite(d?.bossX)&&finite(d?.bossWidth))alignmentSamples.push({boutId:current.id,absoluteCenterSeparation:Math.abs(d.playerX+d.playerWidth/2-d.bossX-d.bossWidth/2)});
      priorDiagnostic=d;
    } else if(row.kind==='terminal-reinforcement') {
      check(current&&row.boutId===current.id&&current.mode==='training'&&!current.terminal,'Duplicate or misplaced terminal reward');
      if(!current)continue;
      check(close(row.rawReward,current.pending),'Terminal reward omits or duplicates pending hull damage');
      neuralCheck(row.result?.neural,'training',row.rawReward);
      check(close(row.result?.neural?.simTimeSeconds,current.tick/60),'Terminal neural clock differs from actual game duration');
      current.pending=0;current.terminal=true;totalDelivered+=row.rawReward;
    } else if(row.kind==='bout-end') {
      const s=row.summary;
      check(current&&s.id===current.id,'Summary has no matching active bout');
      if(!current)continue;
      check(close(s.damage,current.damage)&&s.hits===current.hits&&s.score===current.score&&s.tick===current.tick,'Bout totals differ from independently summed journal');
      check(close(s.damagePerSecond,current.damage/(current.tick/60)),'Damage-per-second arithmetic mismatch');
      check(current.pending===0,'Completed bout has undelivered reward');
      if(current.mode==='training'){check(current.terminal,'Training bout lacks terminal reinforcement');trainingBouts++;}
      else{frozenBouts++;check(typeof current.frozenWeightHash==='string'&&s.weightHash===current.frozenWeightHash,'Frozen evaluation weight hashes differ');}
      const alignment=alignmentSamples.filter(x=>x.boutId===current.id).map(x=>x.absoluteCenterSeparation);
      bouts.push({id:current.id,mode:current.mode,stage:current.stage,seed:current.seed,trainingBoutsAtStart:current.trainingBoutsAtStart,trainingSecondsAtStart:current.trainingSecondsAtStart,damage:current.damage,hits:current.hits,score:current.score,seconds:current.tick/60,damagePerSecond:current.damage/(current.tick/60),outcome:s.outcome,meanAbsoluteCenterSeparation:mean(alignment),alignmentSamples:alignment.length,weightHash:s.weightHash});
      current=null;priorDiagnostic=null;
    } else check(false,`Unknown journal record kind: ${row.kind}`);
  }
  if(current)warnings.push('The journal ends with an unfinished bout; pending reward is retained separately and is not a completed evaluation.');
  const pending=current?.pending??0;
  check(close(totalComputed,totalDelivered+pending),'Total generated reinforcement does not equal delivered plus explicitly pending');
  if(!playerErrors.length||!targetErrors.length)warnings.push('Pixel center error is unavailable where prior-frame diagnostics lack actual entity widths/centers; no dimensions were inferred.');
  const evaluations=bouts.filter(b=>b.mode==='evaluation');
  const baseline=new Map(evaluations.filter(b=>b.stage==='baseline').map(b=>[b.seed,b]));
  const stages=[...new Set(evaluations.map(b=>b.stage))].map(stage=>{
    const rows=evaluations.filter(b=>b.stage===stage),paired=rows.filter(b=>baseline.has(b.seed)).map(b=>({seed:b.seed,damagePerSecondChange:b.damagePerSecond-baseline.get(b.seed).damagePerSecond}));
    return {stage,nEvaluationSeeds:rows.length,meanDamagePerSecond:mean(rows.map(b=>b.damagePerSecond)),pairedChangesFromBaseline:stage==='baseline'?[]:paired,meanPairedChangeFromBaseline:stage==='baseline'?null:mean(paired.map(x=>x.damagePerSecondChange))};
  });
  let checkpointAudit={available:false};
  try {
    const saved=JSON.parse(await fs.readFile(path.join(sessionDir,'resume.json'),'utf8'));
    const envelope=saved.model;
    checkpointAudit={available:true,journalMatches:saved.journalHash===previous,format:envelope?.format??'legacy-json',rawBytesVerified:false,weightsCompared:false};
    if(envelope?.format==='opaque-python-json-v1') {
      const raw=Buffer.from(envelope.payload,'base64');
      const valid=typeof envelope.sha256==='string'&&hash(raw)===envelope.sha256;
      check(valid,'Opaque checkpoint original-byte SHA256 mismatch');
      checkpointAudit.rawBytesVerified=valid;
      if(valid&&checkpointAudit.journalMatches) {
        // Parse only for safe numerical weight comparison. RNG integers can
        // exceed JS precision; never use or reserialize this parsed copy.
        const decoded=JSON.parse(raw.toString('utf8'));
        const values=decoded.state?.weights;
        check(Array.isArray(values)&&values.length===circuit.edges.length,'Checkpoint weight vector shape differs from frozen circuit');
        if(Array.isArray(values)&&values.length===circuit.edges.length) {
          check(values.every((w,i)=>finite(w)&&close(w,weights.get(circuit.edges[i].kcId),1e-10)),'Checkpoint weights differ from independent complete ledger reconstruction');
          checkpointAudit.weightsCompared=true;
          checkpointAudit.meanEfficacy=mean(values);
        }
      }
      if(!checkpointAudit.journalMatches)warnings.push('Saved checkpoint predates the current journal; its byte integrity was verified but current weight comparison was skipped.');
    }else warnings.push('Legacy nonopaque checkpoint detected; RNG precision/integrity cannot be verified after JavaScript JSON transport.');
  }catch(error){if(error.code!=='ENOENT')check(false,`Checkpoint audit failed: ${error.message}`);}
  return {schemaVersion:1,audit:'independent-boss-journal-v1',session:path.basename(sessionDir),auditedAt:new Date().toISOString(),status:failures.length?'FAIL':'PASS',
    interpretation:'Implementation/artifact audit only. A single training controller and reused evaluation seeds do not establish a replicated learning effect or anatomical-topology benefit.',
    journal:{records,decisions,policyDecisions,sha256:fileHash.digest('hex'),lastChainHash:previous,completedBouts:bouts.length,unfinishedBout:current?.id??null},
    rewards:{confirmedHullDamage:totalDamage,trainingRewardComputed:totalComputed,rawReinforcementDelivered:totalDelivered,pending,nonzeroNumericalDoses:nonzeroDoses},
    neural:{changedEdgeRecords:weightUpdates,distinctEfficaciesChanged:changedIds.size,meanReconstructedEfficacy:mean([...weights.values()]),probabilityDecisionsDifferentFromUniform:departed,actionSwitches,frozenBouts,frozenChangeRecords:frozenChanges},
    vision:{visibleDecisions:visible,totalPolicyDecisions:policyDecisions,visibilityFraction:policyDecisions?visible/policyDecisions:null,playerCenterError:errorSummary(playerErrors),targetCenterError:errorSummary(targetErrors),comparison:'Pixel centroids versus exact inputDiagnostics centers, or preceding row centers for older journals; diagnostic state never enters controller.'},
    bounds:{recordedChecks:boundsSamples,inside:withinBounds,violations:boundsSamples-withinBounds},checkpoint:checkpointAudit,stages,bouts,failures,warnings,
    limitations:['Hash verification detects corruption, not independent proof that source events are physically true.','Recorded rates and plasticity are modeled quantities, not chemical dopamine or biological recordings.','No statistical significance or learning-success gate is assigned by this audit.','Pixel extraction and canonical game replay need their separate validation.'],config};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [sessionDir,...rest]=process.argv.slice(2);
  if(!sessionDir||rest.length>2||rest.length&&rest[0]!=='--output')throw new Error('Usage: node scripts/audit-boss-learning.mjs SESSION_DIR [--output REPORT.json]');
  const report=await auditSession(path.resolve(sessionDir));
  if(rest[1]){const output=path.resolve(rest[1]);await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=1;
}
