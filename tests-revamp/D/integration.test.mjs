import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const api = require('../../api/_lib/walletProfiles.js');
const core = require('../../services/revamp/progression/core.js');
const bundle = await build({stdin:{contents:`export * from './services/revamp/runtime/flight'; export * from './services/revamp/runtime/profile'; export * from './services/revamp/runtime/useProgression'; export * from './services/squadProgression'; export * from './services/walletProfileDirtyStore';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const baseline = () => core.getRevampBonuses(core.createRevampProgress());

test('fractional Fortune preserves integer coin economy without rounding every pickup up',()=>{
  const flight = new m.RevampFlight('test',{...baseline(),creditGainMultiplier:1.12});
  assert.equal(Array.from({length:100},()=>flight.credit()).reduce((a,b)=>a+b,0),112);
});
test('goal event retries use absolute producer totals after a partial local save',()=>{
  const profileId='retry-profile';
  const flight=new m.RevampFlight(profileId,baseline());
  flight.event('kills',2);flight.event('kills',3);flight.event('powerups');
  const pending=m.pendingRevampEvents(profileId);
  const receipts=m.aggregateRevampEventTotals(pending);
  assert.equal(receipts.find(event=>event.kind==='kills').amount,5);
  let state=core.createRevampProgress();
  const flush=()=>{for(const receipt of m.aggregateRevampEventTotals(m.pendingRevampEvents(profileId)))state=core.recordRevampEvent(state,receipt,new Date(receipt.occurredAt));};
  flush(); // Durable local save succeeded, but cloud dirty marker failed: no queue acknowledgement.
  flush(); // Same pending entries must not be added to the saved total again.
  assert.equal(state.events.find(event=>event.kind==='kills').amount,5);
  assert.equal(state.events.find(event=>event.kind==='powerups').amount,1);
  flight.event('kills',2); // New gameplay before retry is still counted exactly once.
  flush();assert.equal(state.events.find(event=>event.kind==='kills').amount,7);
  m.acknowledgeRevampEvents(m.pendingRevampEvents(profileId).map(event=>event.id));
  assert.equal(m.pendingRevampEvents(profileId).length,0);
  flight.resetMission();flight.event('kills'); // Same engine's next mission keeps the date's absolute total.
  flush();assert.equal(state.events.find(event=>event.kind==='kills').amount,8);
  m.acknowledgeRevampEvents(m.pendingRevampEvents(profileId).map(event=>event.id));
});
test('absolute goal counters split on local date without resetting prior receipts',()=>{
  const profileId='calendar-profile',flight=new m.RevampFlight(profileId,baseline());
  const realNow=Date.now;
  try {
    Date.now=()=>new Date(2026,9,17,23,59).getTime();flight.event('kills',5);
    Date.now=()=>new Date(2026,9,18,0,1).getTime();flight.event('kills',2);
  } finally {Date.now=realNow;}
  const receipts=m.aggregateRevampEventTotals(m.pendingRevampEvents(profileId));
  assert.deepEqual(receipts.map(event=>event.amount),[5,2]);
  assert.ok(receipts[0].id.includes(':2026-10-17:'));
  assert.ok(receipts[1].id.includes(':2026-10-18:'));
  m.acknowledgeRevampEvents(m.pendingRevampEvents(profileId).map(event=>event.id));
});
test('a partial purchase journal recovers before another transaction without disk reads on healthy flushes',()=>{
  const originalWindow=globalThis.window,originalCustomEvent=globalThis.CustomEvent;
  const stored=new Map();let reads=0,failMirrors=false;
  globalThis.window={localStorage:{
    getItem(key){reads++;return stored.get(key)??null;},
    setItem(key,value){if(failMirrors&&key.startsWith('scicon_weekly_squad_'))throw new Error('quota exceeded');stored.set(key,String(value));},
    removeItem(key){stored.delete(key);}
  },dispatchEvent(){}};
  globalThis.CustomEvent=originalCustomEvent??class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
  try {
    const profileId='pilot:journal-retry';
    let weekly={...m.createWeeklySquadState(profileId),coins:100,durableCampaignCoins:100};
    let permanent=m.createPermanentSquadState(profileId);
    permanent.revamp=core.settleRevampMission(permanent.revamp,{runId:'seed',missionId:'level-1',cleared:true,kills:10,spawned:10,damageTaken:0,durationMs:60000,scienceCreditsEarned:100}).state;
    m.commitCampaignSquadSettlement({resultId:'seed',weeklyState:weekly,permanentState:permanent});
    const access=m.createRevampTransactionAccess(()=>({profileId,read:()=>({weekly,permanent}),commit:(nextWeekly,nextPermanent)=>{
      m.commitCampaignSquadSettlement({resultId:'transaction',weeklyState:nextWeekly,permanentState:nextPermanent});
      weekly=nextWeekly;permanent=nextPermanent;
    }}));
    const healthyReads=reads;access.read();access.read();assert.equal(reads,healthyReads);
    const first=core.purchaseRevampUpgrade(permanent.revamp,'firepower',weekly.coins);
    failMirrors=true;
    assert.throws(()=>access.commit(m.withRevampCredits(weekly,first.credits),{...permanent,revamp:first.state}),/quota/);
    assert.equal(permanent.revamp.upgrades.firepower,0,'live refs are still stale after journal commit');
    assert.throws(()=>access.read(),/recovering/, 'a still-full store must block a new action');
    failMirrors=false;
    const recovered=access.read();
    assert.equal(recovered.permanent.revamp.upgrades.firepower,1);
    assert.equal(recovered.weekly.coins,60);
    const second=core.purchaseRevampUpgrade(recovered.permanent.revamp,'survival',recovered.weekly.coins);
    access.commit(m.withRevampCredits(recovered.weekly,second.credits),{...recovered.permanent,revamp:second.state});
    assert.equal(permanent.revamp.upgrades.firepower,1,'second transaction retains recovered purchase');
    assert.equal(permanent.revamp.upgrades.survival,1);
    assert.equal(weekly.coins,20);
    const afterRecovery=reads;access.read();assert.equal(reads,afterRecovery,'healthy reads return to memory only');
  } finally {globalThis.window=originalWindow;globalThis.CustomEvent=originalCustomEvent;}
});
test('actual target observations deduplicate, exclude fillers, and reset per Mission',()=>{
  const flight = new m.RevampFlight('test',baseline());
  const targets = [{id:'a',type:'ENEMY_DRONE'},{id:'b',type:'ENEMY_BRICK',campaignFiller:true},{id:'c',type:'PROJECTILE'}];
  flight.observe(targets); flight.observe(targets); flight.kill('ENEMY_DRONE','a');
  assert.deepEqual(flight.metrics,{spawned:1,kills:1,hits:0});
  flight.resetMission(); assert.deepEqual(flight.metrics,{spawned:0,kills:0,hits:0});
});
test('research shield absorbs life loss but disqualifies no-hit; overdrive pauses with simulation',()=>{
  const flight = new m.RevampFlight('test',{...baseline(),shieldBonus:2,overdriveChargeMultiplier:1.2,overdriveDurationMultiplier:1.3});
  assert.equal(flight.absorb(1),0); assert.equal(flight.metrics.hits,1);
  assert.equal(flight.absorb(2),1);
  for(let i=0;i<21;i++)flight.kill('ENEMY_DRONE',String(i));
  assert.ok(flight.overdriveFrames>0); const remaining=flight.overdriveFrames;
  assert.equal(flight.damageMultiplier(),1.25); flight.tick(); assert.equal(flight.overdriveFrames,remaining-1);
});
test('spending consumes seasonal coins before durable credits; rewards survive rollover',()=>{
  const weekly={...m.createWeeklySquadState('pilot-test'),coins:100,durableCampaignCoins:60};
  const spent=m.withRevampCredits(weekly,30);assert.equal(spent.durableCampaignCoins,30);
  const earned=m.withRevampCredits(spent,80);assert.equal(earned.durableCampaignCoins,80);
  assert.equal(m.rollWeeklySquadStateForward(earned,'2099-W01').coins,80);
});
test('Campaign gets earned wings and research; ordinary/weekly loadout has no meta field',()=>{
  const weekly=m.createWeeklySquadState('pilot-test'),permanent=m.createPermanentSquadState('pilot-test');
  assert.equal(m.buildRuntimeSquadLoadout(weekly,'researchhub').revamp,undefined);
  let campaign=m.buildRevampCampaignLoadout(weekly,permanent,'researchhub');
  assert.equal(campaign.companions[0].slot,'left');assert.equal(campaign.revamp.firstFlight,true);
  permanent.campaignProgress.completedMissionIds=['mission-1'];
  campaign=m.buildRevampCampaignLoadout(weekly,permanent,'researchhub');
  assert.deepEqual(campaign.companions.map(c=>c.slot),['left','right']);
});
test('Campaign wing rank follows earned Support research while legacy purchased ranks stay intact',()=>{
  const weekly=m.createWeeklySquadState('paid-wing-pilot'),permanent=m.createPermanentSquadState('paid-wing-pilot');
  weekly.unlockedSlots.left=true;
  weekly.ownedMiniShips['citation-dart']=5;
  weekly.equipped.left='citation-dart';
  assert.equal(m.buildRuntimeSquadLoadout(weekly,'researchhub').companions[0].level,5);
  assert.equal(m.buildRevampCampaignLoadout(weekly,permanent,'researchhub').companions[0].level,1);
  permanent.revamp=core.sanitizeRevampProgress({...permanent.revamp,purchasedNodeIds:['support:1']});
  assert.equal(m.buildRevampCampaignLoadout(weekly,permanent,'researchhub').companions[0].level,2);
  permanent.revamp=core.sanitizeRevampProgress({...permanent.revamp,purchasedNodeIds:['support:1','support:2','support:3','support:4']});
  assert.equal(m.buildRevampCampaignLoadout(weekly,permanent,'researchhub').companions[0].level,5);
  assert.equal(weekly.ownedMiniShips['citation-dart'],5);
  assert.equal(m.buildRuntimeSquadLoadout(weekly,'researchhub').companions[0].level,5);
});
test('post-victory coin sweep records only actual credited earnings once without replaying mission rewards',()=>{
  const mission={runId:'victory-1',missionId:'level-1',cleared:true,kills:9,spawned:10,damageTaken:0,durationMs:60000,scienceCreditsEarned:40};
  let progress=core.settleRevampMission(core.createRevampProgress(),mission).state;
  const weekly={...m.createWeeklySquadState('sweep-pilot'),coins:40,durableCampaignCoins:40};
  const grants=[{id:'campaign:victory-1:collected',label:'Collected Tokens',amount:50,kind:'wave',oneTime:false},
    {id:'campaign:victory-1:late-star',label:'Late mastery',amount:10,kind:'star',oneTime:true}];
  const credit=m.creditCampaignRewardGrants(weekly,grants);
  assert.equal(credit.creditedAmount,60);
  const before={playTimeMs:progress.playTimeMs,researchData:progress.researchData,events:progress.events};
  progress=core.recordRevampEarnedCredits(progress,'victory-1:collected',credit.creditedAmount);
  assert.equal(progress.scienceCreditsEarned,100);
  assert.equal(core.getRevampSpendableCredits(progress,credit.state.coins),100);
  assert.deepEqual({playTimeMs:progress.playTimeMs,researchData:progress.researchData,events:progress.events},before);
  const repeated=m.creditCampaignRewardGrants(credit.state,grants);
  assert.equal(repeated.creditedAmount,0);
  assert.deepEqual(core.recordRevampEarnedCredits(progress,'victory-1:collected',repeated.creditedAmount),progress);
  assert.deepEqual(core.recordRevampEarnedCredits(progress,'victory-1:collected',60),progress);
  assert.equal(core.mergeRevampProgress(progress,progress).scienceCreditsEarned,100);
});
test('wallet sanitizer round-trips versioned medals, purchases, goals and preferences; migrates legacy snapshots',()=>{
  const address='0x'+'a'.repeat(40);
  const base=api.sanitizeWalletSnapshot({},address);
  assert.equal(base.permanentState.revamp.version,1);
  let state=core.settleRevampMission(base.permanentState.revamp,{runId:'flight-1',missionId:'level-1',cleared:true,kills:10,spawned:10,damageTaken:0,durationMs:300000,scienceCreditsEarned:100}).state;
  state=core.purchaseRevampUpgrade(state,'firepower',100).state;
  state={...state,equippedCosmeticId:'revamp-trail-ion',wingAutoCast:false};
  const remote=api.sanitizeWalletSnapshot({...base,permanentState:{...base.permanentState,revamp:state}},address);
  assert.deepEqual(remote.permanentState.revamp,core.sanitizeRevampProgress(state));
  assert.equal(remote.permanentState.revamp.upgrades.firepower,1);
  assert.equal(remote.permanentState.revamp.researchData,3);
});
test('wallet conflict rejects simultaneous tree purchases instead of silently creating free upgrades',()=>{
  const address='0x'+'b'.repeat(40),base=api.sanitizeWalletSnapshot({},address);
  const seeded=core.sanitizeRevampProgress({legacyResearchData:20,settledRunIds:['previous'],earnedCreditsByRunId:{previous:100}});
  base.permanentState.revamp=seeded;
  const local=structuredClone(base),remote=structuredClone(base);
  local.permanentState.revamp=core.purchaseRevampUpgrade(seeded,'firepower',100).state;
  remote.permanentState.revamp=core.purchaseRevampUpgrade(seeded,'survival',100).state;
  assert.throws(()=>m.mergeWalletProfileSnapshots({address,baseSnapshot:base,localSnapshot:local,remoteSnapshot:remote}),/changed on both devices/);
});

test('wallet purchase protection retains earned wings without accepting forged levels or ships',()=>{
  const {applyEarnedWingEntitlements}=require('../../services/revamp/progression/earnedWingEntitlements.js');
  const address='0x'+'c'.repeat(40), base=api.sanitizeWalletSnapshot({},address);
  const incoming=structuredClone(base);
  incoming.permanentState.revamp=core.settleRevampMission(base.permanentState.revamp,{runId:'first',missionId:'level-1',cleared:true,kills:9,spawned:10,damageTaken:0,durationMs:60000}).state;
  incoming.weeklyState.ownedMiniShips={'citation-dart':5,'quorum-crab':5,'nebula-tern':5};
  incoming.weeklyState.unlockedSlots={left:true,right:true}; incoming.weeklyState.equipped={left:'citation-dart',right:'quorum-crab'};
  const protectedSave=api.preserveWalletPurchaseServerState({currentSnapshot:base,incomingSnapshot:incoming,purchasedTokensAvailable:0});
  const earned=applyEarnedWingEntitlements(protectedSave,incoming);
  assert.equal(earned.weeklyState.unlockedSlots.right,true);
  assert.deepEqual(earned.weeklyState.ownedMiniShips,{'citation-dart':1,'quorum-crab':1});
  assert.deepEqual(earned.weeklyState.equipped,{left:'citation-dart',right:'quorum-crab'});
});

test('server rejects paid reserve funding even if a client strips its paidCreditReserve',()=>{
  const address='0x'+'d'.repeat(40),base=api.sanitizeWalletSnapshot({},address);
  base.permanentState.revamp=core.sanitizeRevampProgress({legacyResearchData:20,settledRunIds:['oldFlight'],earnedCreditsByRunId:{oldFlight:100}});
  const incoming=structuredClone(base);
  incoming.permanentState.revamp=core.purchaseRevampUpgrade(base.permanentState.revamp,'firepower',100).state;
  incoming.weeklyState.coins=60;
  assert.throws(()=>api.preserveWalletPurchaseServerState({currentSnapshot:base,incomingSnapshot:incoming,purchasedTokensAvailable:100}),/earned in flight/);
  const allowed=api.preserveWalletPurchaseServerState({currentSnapshot:base,incomingSnapshot:{...incoming,weeklyState:{...incoming.weeklyState,coins:160}},purchasedTokensAvailable:100});
  assert.equal(allowed.permanentState.revamp.paidCreditReserve,100);
});
