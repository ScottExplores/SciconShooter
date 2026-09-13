const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const built=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/liveData.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const box={exports:{}};Function('require','module','exports',built.outputFiles[0].text)(require,box,box.exports);
const {validateLive,feedIsLive}=box.exports;
const fixture=()=>({schemaVersion:1,kind:'scicon-continuous-live-v1',sessionId:'one',sequence:2,updatedAt:'2026-09-13T20:00:00Z',serverNow:'2026-09-13T20:00:01Z',status:'running',controller:{id:'random',name:'Random baseline',learningStatus:'not-learning'},phase:{kind:'boss',damagePerSecond:3},totals:{score:5,bossDamage:3,bossHits:1,simulatedSeconds:1},action:{movement:'W',fire:true},feedback:{deliveredReward:0},neural:null,image:'data:image/jpeg;base64,/9j/2Q=='});
test('an old capture is never made live by successful polling or a stopped source',()=>{const value=fixture();assert.equal(feedIsLive(value,1000,2000),true);assert.equal(feedIsLive(value,1000,16001),false);assert.equal(feedIsLive({...value,serverNow:'2026-09-13T20:01:00Z'},1000,1001),false);assert.equal(feedIsLive({...value,status:'stopped'},1000,1001),false);});
test('the viewer rejects fabricated baseline neural feedback and corrupt totals',()=>{const value=fixture();assert.equal(validateLive(value),value);assert.throws(()=>validateLive({...value,neural:{spikes:1,sampledNeurons:[]}}));assert.throws(()=>validateLive({...value,feedback:{deliveredReward:1}}));assert.throws(()=>validateLive({...value,totals:{...value.totals,score:NaN}}));});
