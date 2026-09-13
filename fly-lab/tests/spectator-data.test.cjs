const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const compiled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/spectatorData.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const box = { exports: {} }; Function('require','module','exports',compiled.outputFiles[0].text)(require,box,box.exports);
const { validateSequence, sequenceAt, recentPoints } = box.exports;
const clip = (id, score) => ({ manifest: { runId:id, timeline:{entries:3}, media:{durationSeconds:2} }, input:null, timeline:[{score:0,videoTimeSeconds:0,simTimeMs:0,reward:0},{score,videoTimeSeconds:1,simTimeMs:1000,reward:0},{score,videoTimeSeconds:1.9,simTimeMs:1900,reward:0}] });
test('recorded totals add each unique run once and resets/seeks cannot inflate them', () => {
  const sequence = validateSequence([clip('a',10),clip('b',20)]);
  assert.equal(sequenceAt(sequence,1,2).points,30);
  assert.equal(sequenceAt(sequence,0,0).points,0);
  assert.equal(sequenceAt(sequence,1,1).points,30);
  assert.equal(sequenceAt(sequence,0,1).points,10);
  assert.equal(sequenceAt(sequence,1,2).points,30);
  assert.throws(() => validateSequence([clip('a',10),clip('a',10)]));
});
test('corrupt timing and scores fail visibly; point cues never create training rewards', () => {
  for (const changed of [NaN,-1]) assert.throws(() => validateSequence([clip('bad',changed)]));
  const bad=clip('time',10); bad.timeline[2].videoTimeSeconds=.5; assert.throws(() => validateSequence([bad]));
  const rows=clip('points',11).timeline;
  assert.deepEqual(recentPoints(rows,1),{amount:11,strength:1});
  assert.deepEqual(recentPoints(rows,2),{amount:0,strength:0});
  assert.deepEqual(rows.map(row=>row.reward),[0,0,0]);
});
