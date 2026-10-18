import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {UI_DEVICES,UI_SCREEN_NAMES} from '../../tools-revamp/qa/ui-audit.mjs';
import {combineUiReports} from '../../tools-revamp/qa/ui-report.mjs';

test('combined UI report cannot pass with missing device or screen coverage',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'scicon-ui-report-'));
  try{
    const file=path.join(temp,'partial.json');
    await writeFile(file,JSON.stringify({runId:'partial',artifactDir:temp,dist:'snapshot-a',results:[],browserErrors:[],network:[]}));
    const report=await combineUiReports([file],{output:temp,runId:'combined'});
    assert.equal(report.status,'failed');
    assert.equal(report.browserErrors.length,UI_SCREEN_NAMES.length*Object.keys(UI_DEVICES).length+2);
    assert.ok(report.browserErrors.some(error=>error.error.includes('desktop-shell')));
    assert.ok(report.browserErrors.some(error=>error.error.includes('victory-gameplay')));
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('combined UI report preserves failed cases and records later verified replacements',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'scicon-ui-report-'));
  try{
    const results=[];
    for(const device of Object.keys(UI_DEVICES)){
      await mkdir(path.join(temp,device));await writeFile(path.join(temp,device,'capture.png'),'fixture');
      for(const screen of [...UI_SCREEN_NAMES,...(device==='desktop'?['desktop-shell','desktop-playing-shell']:[])])results.push({device,screen,source:'test fixture',status:'passed',violations:[],screenshots:['capture.png'],checkedTextNodes:8,checkedControls:2});
    }
    const base={runId:'base',artifactDir:temp,dist:'snapshot-a',results,browserErrors:[],network:[],finishedAt:new Date().toISOString()};
    const baseFile=path.join(temp,'base.json');await writeFile(baseFile,JSON.stringify(base));
    const replacement={...base,runId:'replacement',dist:'snapshot-b',results:[{...results[0],status:'failed',violations:[{type:'text-clipped',selector:'p',text:'Label',screenshot:'capture.png'}]}]};
    const replaceFile=path.join(temp,'replacement.json');await writeFile(replaceFile,JSON.stringify(replacement));
    const failed=await combineUiReports([baseFile,replaceFile],{output:temp,runId:'failed'});
    assert.equal(failed.status,'failed');assert.equal(failed.overflowCount,1);
    replacement.results[0]={...results[0]};await writeFile(replaceFile,JSON.stringify(replacement));
    const repaired=await combineUiReports([baseFile,replaceFile],{output:temp,runId:'repaired'});
    assert.equal(repaired.status,'passed');assert.equal(repaired.results.length,UI_SCREEN_NAMES.length*4+2);
    assert.equal(repaired.results[0].build,'snapshot-b');assert.equal(repaired.results[0].sourceRunId,'replacement');
    assert.equal(repaired.provenance.length,2);
  }finally{await rm(temp,{recursive:true,force:true});}
});
