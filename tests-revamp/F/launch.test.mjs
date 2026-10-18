import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: "export * from './services/revamp/qa/config'; export * from './services/revamp/qa/launch'; export * from './services/revamp/qa/storage';",
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
});
const { readQAConfig, resolveQALaunch, createQAStorage, installQAStorage } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const missions = [
  { id: 'mission-01', waveIds: ['first-wave', 'boss-wave'] },
  { id: 'mission-30', waveIds: ['mid-wave'] }
];
const bosses = [{ eventId: 'gatekeeper', bossId: 'gatekeeper-prime', missionId: 'mission-01', waveId: 'boss-wave' }];

test('mission QA launch uses authored first wave and requires qa=1', () => {
  assert.equal(resolveQALaunch(readQAConfig('?mission=mission-30'), missions, bosses), null);
  assert.deepEqual(resolveQALaunch(readQAConfig('?qa=1&mission=mission-30'), missions, bosses), {
    missionId: 'mission-30', waveId: 'mid-wave', kind: 'mission'
  });
  assert.equal(resolveQALaunch(readQAConfig('?qa=1&mission=unknown'), missions, bosses), null);
});

test('boss QA launch jumps to the authored wave without changing campaign data', () => {
  const before = JSON.stringify({ missions, bosses });
  for (const boss of ['gatekeeper', 'gatekeeper-prime', 'first']) {
    assert.deepEqual(resolveQALaunch(readQAConfig(`?qa=1&bosslab=${boss}`), missions, bosses), {
      missionId: 'mission-01', waveId: 'boss-wave', kind: 'mission'
    });
  }
  assert.equal(resolveQALaunch(readQAConfig('?qa=1&bosslab=unknown'), missions, bosses), null);
  assert.equal(JSON.stringify({ missions, bosses }), before);
});

test('normal pages leave native storage and its descriptor unchanged', () => {
  const localStorage = createQAStorage();
  localStorage.setItem('player-save', 'keep');
  const target = { location: { search: '?mission=mission-01&god=1' }, localStorage };
  const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage');
  installQAStorage(target);
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, 'localStorage'), descriptor);
  assert.equal(target.localStorage.getItem('player-save'), 'keep');
});

test('QA storage starts empty and never reads, clears, or writes normal player saves', () => {
  const native = createQAStorage();
  native.setItem('player-save', 'keep');
  const target = { location: { search: '?qa=1' }, localStorage: native };
  installQAStorage(target);
  assert.equal(target.localStorage.length, 0);
  assert.equal(target.localStorage.getItem('player-save'), null);
  target.localStorage.setItem('qa-coin-balance', 5000);
  assert.equal(target.localStorage.getItem('qa-coin-balance'), '5000');
  target.localStorage.clear();
  assert.equal(native.getItem('player-save'), 'keep');
  assert.equal(native.length, 1);
});
