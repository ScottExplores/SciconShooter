import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='http://127.0.0.1:5180/lab-api';
async function api(path,body) {
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Scicon-Lab':'1'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
  const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;
}
const index=process.argv.indexOf('--render-profile');const renderProfile=index<0?'swiftshader':process.argv[index+1];
const secondsIndex=process.argv.indexOf('--seconds');const seconds=secondsIndex<0?4:Number(process.argv[secondsIndex+1]);
assert.ok(Number.isInteger(seconds)&&seconds>=2&&seconds<=90);
await mkdir('runtime',{recursive:true});
const reset=await api('/reset',{controller:'random',seed:1924,timeLimitSeconds:seconds,renderProfile,constantFire:true});
await api('/start',{});
await new Promise(r=>setTimeout(r,250));
const paused=await api('/pause',{});
await new Promise(r=>setTimeout(r,300));
assert.equal((await api('/status')).tick,paused.tick,'Pause cannot advance simulated time');
const stepped=await api('/step',{});assert.equal(stepped.tick,paused.tick+3,'A decision is exactly three native ticks');
await api('/start',{});
let status;
do {await new Promise(r=>setTimeout(r,300));status=await api('/status');if(status.status==='error')throw new Error(status.error);} while(status.status!=='completed');
assert.equal(status.tick,seconds*60);assert.equal(status.seq,seconds*20);
const record=await api('/runs/'+reset.runId);assert.equal(record.summary.status,'completed');
const response=await fetch(base+'/runs/'+reset.runId+'/export',{signal:AbortSignal.timeout(30000)});assert.ok(response.ok);
const archive=Buffer.from(await response.arrayBuffer());assert.equal(archive.readUInt32LE(0),0x04034b50);
await writeFile('runtime/representative-run.zip',archive);
const blocked=await fetch(base+'/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,403);
await api('/replay',{runId:reset.runId});let replay;
do {await new Promise(r=>setTimeout(r,500));replay=await api('/replay');} while(replay.status==='running');
assert.equal(replay.status,'passed',JSON.stringify(replay));
assert.equal(replay.result.sourceMatched,true,'Strict source identity');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1536,height:1024},deviceScaleFactor:1});
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
  await page.getByText('8 source skeletons',{exact:true}).waitFor();
  await page.locator('.game-viewport img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.game-viewport img')?.complete);
  await page.screenshot({path:'runtime/qa-desktop-live.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'runtime/qa-mobile-live.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal mobile overflow');
  assert.deepEqual(pageErrors,[]);
} finally {await browser.close();}
const result={passed:true,runId:reset.runId,renderProfile,seconds,decisions:status.seq,score:status.score,exportBytes:archive.length,replay:replay.result,checks:['pause clock','manual step','resume completion','immutable export','missing mutation header rejected','strict replay','desktop/mobile render']};
await writeFile('runtime/qa-workflow.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,replay:{passed:replay.result.passed,decisions:replay.result.decisions,sourceMatched:replay.result.sourceMatched}}));
