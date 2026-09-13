import assert from 'node:assert/strict';
import { EngineDriver } from './driver.mjs';
const profileIndex=process.argv.indexOf('--render-profile');
const driver=new EngineDriver(undefined,{renderProfile:profileIndex<0?'swiftshader':process.argv[profileIndex+1]});
try {
 const config={seed:1234,episode:{timeLimitSeconds:10}};
 const first=await driver.command({op:'reset',...config});
 const actions=Array.from({length:60},(_,i)=>({movement:['idle','W','E','N','S'][Math.floor(i/7)%5],fire:i%7<5}));
 const trace=[];
 const fingerprint=r=>({tick:r.tick,state:r.stateHash,observation:r.observation.sha256,frame:r.frame.sha256,events:r.eventsHash,assets:r.runtimeIdentity.assetHash});
 for(let i=0;i<actions.length;i++) {const r=await driver.command({op:'step',action:actions[i],seq:i+1});trace.push(fingerprint(r));}
 const reset=await driver.command({op:'reset',...config});
 assert.equal(reset.observation.sha256,first.observation.sha256,'initial pixels');
 assert.deepEqual(reset.runtimeIdentity,first.runtimeIdentity,'runtime and sealed assets');
 assert.equal(reset.frame.sha256,first.frame.sha256,'initial full frame');
 for(let i=0;i<actions.length;i++) {
   const r=await driver.command({op:'step',action:actions[i],seq:i+1});
   assert.deepEqual(fingerprint(r),trace[i],`replay at decision ${i+1}`);
   if(i===5){const duplicate=await driver.command({op:'step',action:actions[i],seq:i+1});assert.equal(duplicate.stateHash,r.stateHash,'idempotent duplicate');}
 }
 console.log(JSON.stringify({passed:true,decisions:actions.length,checks:['fresh reset','state replay','grayscale and PNG replay','event replay','asset seal','idempotent action','loopback request isolation'],renderProfile:driver.runtime.renderProfile,chromium:driver.runtime.chromium,assetHash:driver.runtime.assetHash}));
} finally {await driver.close();}
