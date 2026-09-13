const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const runner=import('../scripts/run-boss-learning.mjs');
const vision=import('../scripts/boss-learning-vision.mjs');

test('rendered color components produce relative visual features and reject HUD/projectile noise',async()=>{
  const {extractBossPixels}=await vision;
  const rgba=new Uint8Array(390*844*4);
  const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)rgba.set([...c,255],(j*390+i)*4);};
  rect(170,160,110,100,[40,150,160]);rect(80,710,44,52,[50,90,240]);
  rect(0,30,350,40,[20,220,240]);rect(330,660,3,60,[30,80,230]);
  const result=await extractBossPixels({rgba,width:390,height:844});
  assert.equal(result.features.targetVisible,true);assert.ok(result.features.targetOffset>.5);
  assert.ok(Math.abs(result.vision.targetX*390-224.5)<1);assert.ok(Math.abs(result.vision.playerX*390-101.5)<1);
  assert.equal(result.vision.confidence,1);assert.equal(result.vision.source,'pixels');
  rgba.fill(0);const missing=await extractBossPixels({rgba,width:390,height:844});
  assert.equal(missing.features.targetVisible,false);assert.equal(missing.vision.playerX,null);assert.equal(missing.vision.relativeX,null);assert.equal(missing.vision.confidence,0);
});

test('reward counts distinct actual hull losses, excludes components and rejects invalid damage',async()=>{
  const {confirmedHullDamage}=await runner;
  const hit={type:'entity-damage',sourceKind:'player',targetKind:'BOSS',targetId:'b',amount:2,remainingHealth:98};
  const result=confirmedHullDamage([hit,hit,{...hit,targetKind:'boss-component:cannon'},{type:'primary-fire-input'}]);
  assert.equal(result.amount,4);assert.deepEqual(result.hits.map(e=>e.eventIndex),[0,1]);
  for(const amount of [NaN,Infinity,0,-1])assert.throws(()=>confirmedHullDamage([{...hit,amount}]),/Invalid/);
});

test('journal hash chain detects damaged and partial evidence, retaining only current bout in memory',async()=>{
  const {Journal}=await runner;
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'scicon-boss-journal-')),file=path.join(folder,'journal.jsonl');
  const journal=await new Journal(file).open();
  await journal.append({kind:'bout-start',bout:{id:'a'}});await journal.append({kind:'decision',boutId:'a',action:'W'});
  await journal.append({kind:'bout-start',bout:{id:'b'}});await journal.append({kind:'decision',boutId:'b',action:'E'});
  const hash=journal.hash;assert.equal(journal.rows.length,2);await journal.close();
  const reopened=await new Journal(file).open();assert.equal(reopened.hash,hash);assert.equal(reopened.rows.length,2);await reopened.close();
  const valid=await fs.readFile(file,'utf8');await fs.writeFile(file,valid.replace('"W"','"E"'));
  await assert.rejects(new Journal(file).open(),/hash-chain/);await fs.writeFile(file,valid.slice(0,-1));
  await assert.rejects(new Journal(file).open(),/Partial/);
});

test('runner freezes boss protocol and rejects remote game URLs or invalid limits',async()=>{
  const {optionsFromArgs}=await runner;
  const config=optionsFromArgs(['--session','pilot','--max-seconds','180','--evaluation-seeds','9124','--resume']);
  assert.equal(config.bossSeconds,180);assert.equal(config.maxWallSeconds,180);assert.equal(config.resume,true);
  assert.throws(()=>optionsFromArgs(['--origin','https://example.com']),/loopback/);
  assert.throws(()=>optionsFromArgs(['--session','../escape']),/simple/);
  assert.throws(()=>optionsFromArgs(['--boss-seconds','181']),/180/);
  assert.throws(()=>optionsFromArgs(['--evaluation-seeds','NaN']),/Seeds/);
});
