import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const previousImage=globalThis.Image;
globalThis.Image=class { complete=false; naturalWidth=0; };
const directory=await mkdtemp(join(tmpdir(),'scicon-O-escort-'));
after(async()=>{if(previousImage===undefined)delete globalThis.Image;else globalThis.Image=previousImage;await rm(directory,{recursive:true,force:true});});
const bundle=await build({stdin:{contents:`export * from './services/gameLogic.ts'; export * from './services/combatLab.ts';
export * from './services/revamp/bosses/engineAdapter.ts'; export * from './services/revamp/bosses/runtime.ts';
export * from './services/revamp/bosses/interactiveEscorts.ts'; export * from './services/revamp/bosses/miniInteractive.ts';
export * from './services/revamp/bosses/catalog.ts'; export * from './services/revamp/bosses/patterns.ts';
export * from './services/revamp/bosses/safeRoute.ts'; export * from './types.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',target:'es2022',define:{'import.meta.env':'{}'}});
const path=join(directory,'engine.mjs');await writeFile(path,bundle.outputFiles[0].text);
const api=await import(pathToFileURL(path).href);
const fixture=()=>{
 const engine=new api.GameEngine(api.createCombatLabStats(),{previewMode:true,previewInvincible:false,audioEnabled:false,preloadCanvasAssets:false,randomSeed:12345});
 engine.init(390,844);
 const boss=engine.createEntity(api.EntityType.BOSS,55,148);
 Object.assign(boss,{width:280,height:200,hp:1000,maxHp:1000,sourceItemId:'gatekeeper-prime',sourceEventId:'revamp:gatekeeper-prime',attackTimer:0});
 engine.entities.push(boss);api.attachRevampBoss(engine,boss);
 for(let i=0;i<72;i++){engine.frameCount++;api.updateRevampBoss(engine,boss);}
 const state=api.getBossEncounter(boss);state.stage='fire';state.remainingFrames=180;state.interactive.attackMode='summon';
 api.summonInteractiveBossEscorts(engine,boss,state);
 const escort=engine.entities.find(e=>e.sourceItemId==='gatekeeper-prime:escort');
 assert.ok(escort);engine.entities=engine.entities.filter(e=>e===escort||e===boss);
 // Isolate the escort's genuine collision from its parent hull at the hangar.
 boss.y=-1000;
 return{engine,boss,state,escort};
};

test('actual ram collision admits escorts only while active, with deployment and exit immunity',()=>{
 for(const age of [0,41,42,144,145,179]){
  const {engine,escort}=fixture();
  for(let frame=0;frame<age;frame++)api.updateInteractiveBossEscort(engine,escort);
  engine.player.x=escort.x+escort.width/2-engine.player.width/2;
  engine.player.y=escort.y+escort.height/2-engine.player.height/2;
  engine.invincibleTimer=0;engine.activePowerups.clear();
  const before=engine.lives;
  engine.checkCollisions();
  if(age>=42&&age<=144)assert.ok(engine.lives<before,`active age ${age} must use the real ram path`);
  else assert.equal(engine.lives,before,`deploy/exit age ${age} must never use contactDamage || 1 fallback`);
 }
});

test('the mini drone side cannon and open-core plans retain constructive routes from all mobile starts',()=>{
 const boss={id:'drone-proof',sourceItemId:'bottleneck-drone',sourceEventId:'revamp:bottleneck-drone',
  x:125,y:110,width:140,height:160,hp:100,maxHp:100,bossComponents:[],bossPresentationBankRadians:0};
 api.attachInteractiveMini({frameCount:0},boss);
 const side=api.getInteractiveMini(boss).parts[0];
 assert.deepEqual({x:side.x,y:side.y},{x:162.8,y:218.8},'proof uses the live shorter-hull cannon mount');
 const profile=api.getRevampBoss('gatekeeper-prime');let scenarios=0;
 for(const phase of [1,2])for(const attack of profile.attacks.slice(0,2)){
  if(phase===2&&attack.kind==='aimed-fan')continue; // Destroyed cannon cannot emit in the core phase.
  const origin=attack.kind==='aimed-fan'?side:{x:195,y:218.8};
  for(let sequence=0;sequence<(attack.kind==='gap-ring'?6:1);sequence++)for(const x of [52,123,195,267,338])for(const y of [464.2,590.8,717.4]){
   const player={x,y};const plan=api.createBossAttackPlan({origin,attack,phase,sequence,rage:false,player,worldWidth:390,worldHeight:844});
   const proof=api.proveRevampBossAttack(plan,player);
   assert.equal(proof.status,'proven',`${phase}/${attack.kind}/${sequence}/${x}/${y}`);scenarios++;
  }
 }
 assert.equal(scenarios,195);
});
