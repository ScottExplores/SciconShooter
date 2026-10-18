import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './services/revamp/bosses/engineAdapter.ts';
export * from './services/revamp/bosses/runtime.ts'; export * from './services/revamp/bosses/catalog.ts';
export * from './services/revamp/bosses/interactive.ts'; export * from './services/revamp/bosses/interactiveArena.ts'; export * from './services/revamp/bosses/interactiveEscorts.ts';
export * from './services/revamp/bosses/safeRoute.ts'; export * from './services/revamp/events.ts';`, resolveDir: process.cwd(), loader: 'ts' },
 bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function fixture(profile = api.REVAMP_BOSSES[0]) {
 const boss = { id: 'boss', sourceItemId: profile.sourceBossId, sourceEventId: `revamp:${profile.id}`, x:0,y:0,width:320,height:220,hp:1000,maxHp:1000,bossComponents:[],attackTimer:0,color:'#f80' };
 const engine = { width:390,height:844,frameCount:0,entities:[],stats:{wave:6,coins:0},player:{x:180,y:710,width:30,height:30},invincibleTimer:0,
 playSound(){},pulseDamageFlash(){},pulseBossComponentFlash(){},spawnBurst(){},spawnCoin(x,y){ const c={x,y,coin:true};this.entities.push(c);return c; },
 createEnemy(type,x,y) { const e={type,x,y,id:`e${this.entities.length}`,markedForDeletion:false};this.entities.push(e);return e; },
 spawnGeneratedBossProjectile(owner,x,y,a,s,c,size){this.entities.push({bossOwnerId:owner.id,x,y,width:size,height:size,vx:Math.cos(a)*s,vy:Math.sin(a)*s});},
 spawnEnemyLaneLaser(owner,axis,x,w,f,d){const b={bossOwnerId:owner,x,y:0,width:1,height:1,duration:d};this.entities.push(b);return b;} };
 api.attachRevampBoss(engine,boss);
 const state=api.getBossEncounter(boss);
 const tick=(n=1)=>{for(let i=0;i<n;i++){engine.frameCount++;api.updateRevampBoss(engine,boss);for(const entity of engine.entities)api.updateInteractiveBossEscort(engine,entity);}};
 const damage=(amount=100000)=>{const applied=api.revampHullDamage(boss,amount);boss.hp-=applied;api.afterRevampHullDamage(engine,boss);};
 return {boss,engine,state,tick,damage};
}

test('every major has four damage-state armaments and destruction-gated layers; ordinary centered fire cannot deadlock',()=>{
 for(const profile of api.REVAMP_BOSSES){const f=fixture(profile);const a=f.state.interactive;
  assert.equal(a.parts.length,4);f.tick(72);
  for(const phase of [1,2]){
   assert.equal(f.state.phase,phase);assert.equal(a.shielded,true);
   const before=f.boss.hp;f.damage(1);assert.equal(f.boss.hp,before);
   const active=api.activeInteractiveParts(a);assert.equal(active.length,2);
   const damaged=active.find(part=>part.hp<part.maxHp);assert.ok(damaged);
   api.damageRevampPart(f.engine,f.boss,f.boss.bossComponents[a.parts.indexOf(damaged)],damaged.maxHp*0.4);
   assert.equal(damaged.damageState,'cracked');
   api.damageRevampPart(f.engine,f.boss,f.boss.bossComponents[a.parts.indexOf(damaged)],damaged.maxHp*0.35);
   assert.equal(damaged.damageState,'smoking');
   f.damage();assert.equal(a.parts.filter(part=>part.layer===phase&&part.broken).length,1);
   assert.equal(f.state.stage,'stagger');assert.equal(f.boss.hp,before);
   f.damage();assert.equal(f.state.phase,phase+1);assert.equal(f.state.stage,'transition');
   assert.equal(f.boss.hp,1000*(phase===1?.66:.33));
   assert.equal(api.revampHullDamage(f.boss,100000),0);f.tick(60);
  }
  assert.equal(a.shielded,false);assert.equal(a.breakCount,4);assert.equal(a.rewardCoins,8);
  assert.equal(a.parts.every(part=>part.damageState==='destroyed'),true);
  f.damage();assert.equal(f.boss.hp,0);
 }
});

test('part destruction cancels committed hazards and removes the owning attack immediately and permanently',()=>{
 const f=fixture();f.tick(72);const a=f.state.interactive;const broken=a.parts[0];
 assert.equal(a.ownerPartId,broken.id);f.tick(f.state.remainingFrames);
 assert.ok(f.engine.entities.some(e=>e.bossOwnerId==='boss'));
 api.damageRevampPart(f.engine,f.boss,f.boss.bossComponents[0],100000);
 assert.equal(f.state.attack,null);assert.equal(f.state.plan,null);
 assert.ok(f.engine.entities.filter(e=>e.bossOwnerId==='boss').every(e=>e.markedForDeletion));
 for(let i=0;i<1400;i++){f.tick();assert.notEqual(f.state.attack?.id,broken.attackId);}
});

test('later phases lead with a fully warned arena then hangar, and broken weapons never regain ownership',()=>{
 for(const profile of api.REVAMP_BOSSES){
  const f=fixture(profile);const a=f.state.interactive;
  const liveHazards=()=>f.engine.entities.filter(entity=>entity.bossOwnerId===f.boss.id&&!entity.markedForDeletion);
  f.tick(72);
  assert.equal(a.attackMode,'weapon',`${profile.id}: phase one keeps its original opener`);
  f.damage();f.damage();f.tick(60);
  for(const phase of [2,3]){
   assert.equal(f.state.phase,phase);
   assert.equal(f.state.stage,'warning');
   assert.equal(a.attackMode,'arena',`${profile.id}: phase ${phase} immediately introduces its arena`);
   assert.equal(a.arena.pattern,phase===2?'walls':'sweep');
   assert.equal(f.state.remainingFrames,84);
   assert.equal(a.ownerPartId,null);
   assert.equal(liveHazards().length,0,'phase cleanup precedes the new warning');
   f.tick(83);assert.equal(f.state.stage,'warning');assert.equal(liveHazards().length,0);
   f.tick();assert.equal(f.state.stage,'fire');assert.equal(liveHazards().length,2);
   if(phase===3)assert.ok(liveHazards().every(entity=>Number.isFinite(entity.beamAngleRadians)));
   f.tick(180);assert.equal(f.state.stage,'recovery');assert.equal(liveHazards().length,0);
   f.tick(84);assert.equal(f.state.stage,'warning');assert.equal(a.attackMode,'summon');
   assert.equal(f.state.remainingFrames,60);assert.equal(a.escorts.length,0);
   f.tick(59);assert.equal(a.escorts.length,0,'the following hangar also keeps its full warning');
   f.tick();assert.equal(a.escorts.length,2);assert.equal(f.state.stage,'fire');
   f.tick(180);assert.equal(a.escorts.length,0);assert.equal(liveHazards().length,0);
   f.tick(72);assert.equal(f.state.stage,'warning');assert.equal(a.attackMode,'weapon');
   assert.ok(!a.parts.some(part=>part.broken&&part.attackId===f.state.attack.id));
   if(phase===2){
    const owner=a.parts.find(part=>part.id===a.ownerPartId);assert.ok(owner&&owner.layer===2);
    api.damageRevampPart(f.engine,f.boss,f.boss.bossComponents[a.parts.indexOf(owner)],100000);
    assert.equal(f.state.plan,null,'breaking the newly selected weapon cancels its committed volley');
    assert.equal(f.state.attack,null);assert.equal(liveHazards().length,0);
    f.tick(72);assert.equal(a.attackMode,'weapon');assert.notEqual(a.ownerPartId,owner.id);
    assert.notEqual(f.state.attack.id,owner.attackId,'the remaining armament owns the next volley');
    f.damage();assert.equal(f.state.phase,3);f.tick(60);
   }else assert.equal(a.ownerPartId,'core','destroyed armaments stay disabled when the core takes over');
  }
 }
});

test('physical core opens over 18 simulation steps and only its open window grants the damage bonus',()=>{
 const f=fixture();f.tick(72);for(let p=0;p<2;p++){f.damage();f.damage();f.tick(60);}
 f.state.stage='recovery';f.state.remainingFrames=84;f.state.interactive.coreOpen=0;
 const closed=api.revampHullDamage(f.boss,10);f.tick(9);assert.ok(f.state.interactive.coreOpen>0&&f.state.interactive.coreOpen<1);
 f.tick(9);assert.equal(f.state.interactive.coreOpen,1);assert.equal(f.boss.bossWeakPointOpen,true);
 assert.ok(api.revampHullDamage(f.boss,10)>closed*2);
 f.state.stage='warning';f.state.remainingFrames=60;f.tick(18);assert.equal(f.state.interactive.coreOpen,0);
});

test('arena wall/grid warning and exact live geometry retain replayed routes from all conservative lower starts',()=>{
 let scenarios=0;
 for(const phase of [2,3])for(const sequence of [0,1,2,6])for(const x of [52,123,195,267,338])for(const y of [464.2,590.8,717.4]){
  const plan=api.createInteractiveArenaPlan(phase,sequence);
  assert.ok(plan.warningFrames>=36);const proof=api.proveRevampBossAttack(plan,{x,y});
  assert.equal(proof.status,'proven',`${phase}/${sequence}/${x}/${y}`);assert.ok(proof.minimumClearancePixels>=6);scenarios++;
 }
 assert.equal(scenarios,120);
});

test('each live weapon plan at its real attached socket is safe across the roster and arena starts',()=>{
 for(const profile of api.REVAMP_BOSSES){const f=fixture(profile);f.tick(72);
  for(const phase of [1,2,3]){
   if(phase>1){f.damage();f.damage();f.tick(60);}
   const seen=new Set();
   for(let i=0;i<1400;i++){
    if(f.state.stage==='warning'&&f.state.plan&&!seen.has(f.state.attack.id)){
     seen.add(f.state.attack.id);
     for(const x of [52,123,195,267,338])for(const y of [464.2,590.8,717.4]){
      const proof=api.proveRevampBossAttack(f.state.plan,{x,y});
      assert.equal(proof.status,'proven',`${profile.id}/${phase}/${f.state.attack.id}/${x}/${y}`);
     }
    }f.tick();
   }
  }
 }
});

test('hangar escorts are capped, deployed safely, destructible, bounded above the player arena, and cleaned on owner loss',()=>{
 const f=fixture();f.tick(72);f.damage();f.damage();f.tick(60);
 for(let i=0;i<1600&&!f.state.interactive.escorts.length;i++)f.tick();
 const a=f.state.interactive;assert.equal(a.escorts.length,2);
 api.summonInteractiveBossEscorts(f.engine,f.boss,f.state);assert.equal(a.escorts.length,2);
 const escorts=f.engine.entities.filter(e=>e.sourceItemId?.endsWith(':escort'));assert.equal(escorts.length,2);
 assert.ok(escorts.every(e=>e.contactDamage===0&&e.hp>0));f.tick(45);
 assert.ok(escorts.every(e=>e.contactDamage===1));assert.ok(escorts.every(e=>e.y+e.height<=396));
 escorts[0].hp=0;f.tick();assert.equal(a.escorts.length,1);
 api.defeatRevampBoss(f.engine,f.boss);f.tick();assert.equal(a.escorts.length,0);
 assert.ok(escorts.every(e=>e.markedForDeletion));assert.equal(f.engine.invincibleTimer,120);
});


test('rotating beam collision and rendering share each sampled pose; all live sweeps stay within proven edge envelopes',()=>{
 const f=fixture();f.tick(72);for(let p=0;p<2;p++){f.damage();f.damage();f.tick(60);}
 for(let frame=0;frame<1600&&!(f.state.interactive.attackMode==='arena'&&f.state.stage==='fire');frame++)f.tick();
 assert.equal(f.state.interactive.arena.pattern,'sweep');
 const beams=f.engine.entities.filter(e=>e.bossOwnerId==='boss'&&!e.markedForDeletion&&e.beamAngleRadians!==undefined);
 assert.equal(beams.length,2);
 for(let frame=0;frame<72;frame++){
  const samples=api.sampleInteractiveSweep(f.state.interactive.coreX,f.state.interactive.coreY,frame);
  for(const [i,sample] of samples.entries()){
   assert.equal(beams[i].beamAngleRadians,sample.angle);
   assert.equal(beams[i].x,sample.x);assert.equal(beams[i].y,sample.y);
   const direction=sample.angle+Math.PI/2;
   const at400=f.state.interactive.coreX+(400-f.state.interactive.coreY)*Math.cos(direction)/Math.sin(direction);
   // Radius projection is conservative; proof uses the full 146px edge rectangles.
   assert.ok(i===0?at400-8>=244:at400+8<=146,`${i}/${frame}/${at400}`);
  }
  f.tick();
 }
 assert.ok(beams.every(e=>e.markedForDeletion));
});

test('side-mounted weapon proof covers every bounded sequence, both rage speeds and maximum live socket height',()=>{
 let scenarios=0;
 for(const profile of api.REVAMP_BOSSES)for(const phase of [1,2,3])for(const rage of [false,true]){
  const indices=phase===1?[0,1]:phase===2?[2,3]:[1,3];
  for(const index of indices){
   const original=profile.attacks[index];
   const attack={...original,telegraphFrames:['gap-ring','weave-wall'].includes(original.kind)?Math.max(108,original.telegraphFrames):original.telegraphFrames};
   const sequences=attack.kind==='weave-wall'?10:attack.kind==='gap-ring'?6:1;
   const origins=phase===3?[{x:195,y:300}]:[{x:130.6,y:388.1},{x:259.4,y:388.1},{x:161.4,y:300},{x:228.6,y:300}];
   if(['frontier-crownclaw','orbit-gyroscope','hammerhead-siege'].includes(profile.sourceBossId)){
    const crown=profile.sourceBossId==='frontier-crownclaw';
    const coreRatio=crown?.50:profile.sourceBossId==='orbit-gyroscope'?.52:.62;
    if(phase===3)origins.push({x:195,y:148+245*coreRatio});
    else {const y=148+245*(phase===1?(crown?.66:.68):(crown?.70:.72));
     for(const x of phase===1?[130.6,259.4]:[161.4,228.6])origins.push({x,y});}
   }
   for(let sequence=0;sequence<sequences;sequence++)for(const origin of origins)for(const x of [52,123,195,267,338])for(const y of [464.2,590.8,717.4]){
    const player={x,y};const plan=api.createInteractiveWeaponPlan({attack,phase,rage,sequence,origin,player});
    const proof=api.proveRevampBossAttack(plan,player);
    assert.equal(proof.status,'proven',`${profile.id}/${phase}/${rage}/${attack.kind}/${sequence}/${origin.x},${origin.y}/${x},${y}`);
    scenarios++;
   }
  }
 }
 assert.equal(scenarios,42000);
});
