import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export * from './services/revamp/bosses/bossLab.ts';
    export * from './services/revamp/bosses/catalog.ts';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022'
});
const { readBossLabRequest, createBossLabEncounter, bossLabHealthCommandRatio, BOSS_LAB_VIEWPORT, BOSS_LAB_UPGRADES, REVAMP_BOSSES, resolveRevampBoss } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const bosses = [{ id: 'gatekeeper-prime' }, { id: 'peer-reviewer' }];

test('15% preset crosses rage with fractional scaled boss HP and integer preview rounding', () => {
  for (const maxHp of [510.08, 1491.4773952, 1950.5065984000003, 4965.456538240001]) {
    const applied = Math.round(maxHp * bossLabHealthCommandRatio(0.15, maxHp));
    assert.ok(applied / maxHp <= 0.15);
    assert.ok(maxHp * 0.15 - applied < 1);
  }
});

test('normal gameplay does not activate the lab; explicit flags launch immediately', () => {
  assert.equal(readBossLabRequest('?view=hangar', bosses), null);
  assert.equal(readBossLabRequest('?bosslab=peer-reviewer', bosses).bossId, 'peer-reviewer');
  assert.equal(readBossLabRequest('?bosslab=', bosses).bossId, 'gatekeeper-prime');
  assert.equal(readBossLabRequest('?bosslab=gatekeeper-prime', []), null);
});

test('unknown IDs recover to a visible encounter and report the invalid selection', () => {
  const request = readBossLabRequest('?bosslab=missing', bosses);
  assert.equal(request.bossId, 'gatekeeper-prime');
  assert.equal(request.unknownId, 'missing');
  assert.equal(readBossLabRequest('?bosslab=%20PEER-REVIEWER%20', bosses).bossId, 'peer-reviewer');
});

test('watch and phase links are bounded preview controls', () => {
  assert.deepEqual(readBossLabRequest('?bosslab=peer-reviewer&bosswatch=1&bosshp=0.3', bosses), {
    bossId: 'peer-reviewer', unknownId: null, watch: true, healthRatio: 0.3
  });
  for (const [value, expected] of [['NaN', 1], ['Infinity', 1], ['-2', 0.01], ['5', 1]]) {
    assert.equal(readBossLabRequest(`?bosslab&bosshp=${value}`, bosses).healthRatio, expected);
  }
});

test('a source boss becomes the only immediate encounter without changing campaign data', async () => {
  const source = JSON.parse(await readFile('game-config/campaign.json', 'utf8'));
  const original = JSON.stringify(source);
  const profile = { id: 'peer-reviewer', name: 'The Peer Reviewer', sourceBossId: 'gatekeeper-prime' };
  const encounter = createBossLabEncounter(source, profile);
  assert.equal(JSON.stringify(source), original);
  const level = encounter.campaign.levels.find(level => level.id === encounter.levelId);
  const wave = level.waves.find(wave => wave.id === encounter.waveId);
  assert.equal(wave.events.length, 1);
  assert.equal(wave.events[0].bossId, 'gatekeeper-prime');
  assert.equal(wave.events[0].id, 'revamp:peer-reviewer');
  assert.equal(wave.events[0].startSeconds, 0);
  assert.equal(wave.introSeconds, 0);
  assert.equal(wave.completionRule, 'boss-defeat');
  assert.equal(wave.events[0].blocksWaveClock, true);
  assert.notEqual(wave.events[0], source.levels.flatMap(level => level.waves).flatMap(wave => wave.events)
    .find(event => event.kind === 'boss' && event.bossId === 'gatekeeper-prime'));
});

test('missing source content fails clearly rather than launching an unrelated boss', () => {
  assert.throws(() => createBossLabEncounter({ levels: [] }, {
    id: 'missing', name: 'Missing', sourceBossId: 'missing-source'
  }), /Boss Lab source encounter is missing: missing-source/);
});

test('every gallery entry launches its exact identity on an available original art source', async () => {
  const source = JSON.parse(await readFile('game-config/campaign.json', 'utf8'));
  for (const profile of REVAMP_BOSSES) {
    const encounter = createBossLabEncounter(source, profile);
    const wave = encounter.campaign.levels.find(level => level.id === encounter.levelId)
      .waves.find(wave => wave.id === encounter.waveId);
    const event = wave.events[0];
    assert.equal(event.bossId, profile.sourceBossId);
    assert.equal(resolveRevampBoss(event.bossId, event.id).id, profile.id);
    assert.ok(event.spriteKey);
    assert.equal(event.label, profile.name);
  }
});

test('the lab preserves the competitive phone world and provides full equipment power', () => {
  assert.deepEqual(BOSS_LAB_VIEWPORT, { width: 390, height: 844 });
  assert.deepEqual(BOSS_LAB_UPGRADES, { fireRate: 49, ability: 6, speed: 7 });
});
