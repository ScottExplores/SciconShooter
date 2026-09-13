const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

test('actual Node bridge preserves opaque Python state through three frozen evaluations and exact continuation',async()=>{
  const {Bridge,optionsFromArgs}=await import('../scripts/run-boss-learning.mjs');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'scicon-boss-bridge-'));
  const otherFolder=await fs.mkdtemp(path.join(os.tmpdir(),'scicon-boss-bridge-reference-'));
  const config=optionsFromArgs([]),bridge=new Bridge(config,folder),reference=new Bridge(config,otherFolder);
  const features={targetOffset:.25,targetVisible:true,playerVisible:true,playerX:.4,confidence:1};
  try{
    await bridge.open();await reference.open();
    await bridge.call({op:'reset',learning:true,preserveEfficacy:true,seed:1924});
    await bridge.call({op:'step',features,reinforcement:0,dtSeconds:.2});
    await bridge.call({op:'step',features,reinforcement:2,dtSeconds:.2});
    const response=await bridge.call({op:'checkpoint'});
    assert.equal(response.checkpoint.format,'opaque-python-json-v1');
    assert.equal(typeof response.checkpoint.payload,'string');
    // This is exactly the JSON storage/transport boundary used by resume.json.
    const stored=JSON.parse(JSON.stringify({model:response.checkpoint}));
    await fs.writeFile(path.join(folder,'resume.json'),JSON.stringify(stored));
    const restored=JSON.parse(await fs.readFile(path.join(folder,'resume.json'),'utf8')).model;
    assert.deepEqual(restored,response.checkpoint);
    for(const seed of [9124,9125,9126]){
      await bridge.call({op:'reset',learning:false,preserveEfficacy:true,seed});
      await bridge.call({op:'step',features,reinforcement:0,dtSeconds:.2});
      assert.equal((await bridge.call({op:'status'})).weightHash,response.weightHash);
    }
    await bridge.call({op:'restore',checkpoint:restored});
    await reference.call({op:'restore',checkpoint:restored});
    const actual=await bridge.call({op:'step',features,reinforcement:2,dtSeconds:.2});
    const expected=await reference.call({op:'step',features,reinforcement:2,dtSeconds:.2});
    assert.deepEqual(actual.action,expected.action);assert.deepEqual(actual.neural,expected.neural);
    assert.equal(actual.neural.plasticityFrozen,false);
    const actualState=(await bridge.call({op:'checkpoint'})).checkpoint;
    assert.deepEqual(actualState,(await reference.call({op:'checkpoint'})).checkpoint);
    const corrupt={...restored,payload:restored.payload.slice(0,-4)+'AAAA'};
    await assert.rejects(bridge.call({op:'restore',checkpoint:corrupt}),/checksum|Corrupt/i);
  }finally{await bridge.close();await reference.close();}
});
