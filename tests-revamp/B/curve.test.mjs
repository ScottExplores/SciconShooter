import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../..');
const bundle = await build({ stdin: { contents: "export * from './services/revamp/curve/difficultyCurve.ts'; export * from './services/revamp/curve/authorCampaign.mjs'; export { validateGameCampaign } from './game-config/validate.ts';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { CURVE, missionCurve, spawnThreat, waveThreat, regularHealth, authorRevampCampaign,
  authorEscalationBase, validateGameCampaign } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const campaign = JSON.parse(await readFile(resolve(root, 'game-config/campaign.json'), 'utf8'));
const escalation = JSON.parse(await readFile(resolve(root, 'game-config/campaign-escalation-base.json'), 'utf8'));
const approximately = (actual, expected, epsilon = 0.0001) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
const earlySectorIds = new Set(campaign.sectors.slice(0, 3).map((sector) => sector.id));
const earlyNodes = campaign.campaignGraph.nodes.filter((node) => earlySectorIds.has(node.sectorId));

test('7% ramp is interrupted only by the explicit 10% post-boss sector breath', () => {
  for (let mission = 2; mission <= 50; mission++) {
    const curve = missionCurve(mission);
    approximately(curve.threat / missionCurve(mission - 1).threat, curve.afterBoss ? 0.9 : 1.07);
  }
  assert.equal(missionCurve(NaN).mission, 1);
  assert.equal(missionCurve(Infinity).mission, 1);
  assert.equal(missionCurve(-5).mission, 1);
});

test('threat counts weighted alternatives once and includes burst/cadence rather than budget labels', () => {
  const roles = [
    { id: 'contact', threatCost: 2, fireBehavior: 'none', durabilityClass: 'light' },
    { id: 'gun', threatCost: 3, fireBehavior: 'aimed-burst', durabilityClass: 'standard' },
  ];
  const event = { kind: 'spawn', count: 4, enemies: [
    { roleId: 'contact', weight: 3, health: 2 },
    { roleId: 'gun', weight: 1, health: 2, attackIntervalSeconds: 1.5, burstCount: 2 },
  ] };
  assert.equal(spawnThreat(event, roles), 18);
  assert.equal(waveThreat([event, { kind: 'recovery' }, { ...event, count: 2 }], roles), 27);
  assert.equal(spawnThreat({ ...event, enemies: [] }, roles), 0);
});

test('complete campaign validates, generator is idempotent and escalation cannot restore obsolete counts', () => {
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, issues: [] });
  assert.deepEqual(authorRevampCampaign(campaign), campaign);
  assert.deepEqual(authorEscalationBase(campaign, escalation), escalation);
  for (const node of earlyNodes) {
    const level = campaign.levels.find((level) => level.id === node.missionDefinitionId);
    const actual = new Map(level.waves.flatMap((wave) => wave.events.filter((event) => event.kind === 'spawn')
      .map((event) => [`${level.id}/${wave.id}/${event.id}`, event.count])));
    const recorded = Object.entries(escalation).filter(([key]) => key.startsWith(`${level.id}/`));
    assert.equal(recorded.length, actual.size);
    for (const [key, count] of recorded) assert.equal(count, actual.get(key));
  }
});

test('every authored formation meets actual curve pressure and focused regular TTK including optional routes', () => {
  for (const node of earlyNodes) {
    const level = campaign.levels.find((level) => level.id === node.missionDefinitionId);
    const curve = missionCurve(node.depth);
    const regularWaves = level.waves.filter(wave => wave.events.some(event => event.kind === 'spawn'));
    const spawns = regularWaves.flatMap(wave => wave.events.filter(event => event.kind === 'spawn'));
    approximately(regularWaves.reduce((sum, wave) => sum + waveThreat(wave.events, campaign.enemyRoles), 0) / regularWaves.length, curve.threat, 0.0001);
    assert.equal(level.startingDifficulty, 1);
    assert.equal(level.campaignProgression.recommendedPower.expected, curve.expectedPower);
    for (const wave of level.waves) {
      assert.equal(wave.difficultyMultiplier, 1);
      const hulls = wave.events.filter(event => event.kind === 'spawn').reduce((sum, event) => sum + event.count, 0);
      assert.ok(wave.threatCap >= hulls, `${level.id}: pressure must never throttle formation assembly`);
    }
    for (const event of spawns) for (const enemy of event.enemies) {
      const ttk = enemy.health / curve.expectedDps;
      assert.ok(ttk >= 0.3998 && ttk <= 1.2, `${level.id} ${enemy.roleId} TTK ${ttk}`);
      assert.equal(enemy.damage, 1);
      if (enemy.roleId === 'role-revamp-escort') assert.equal(event.count, 2);
    }
  }
});

test('opening has full mirrored grids, gentle fire, guaranteed power and a separate mini-boss beat', () => {
  const opening = campaign.levels.find(level => level.id === 'operation-open-galaxy');
  assert.equal(opening.waves.length, 3);
  for (const wave of opening.waves.slice(0, -1)) {
    const spawns = wave.events.filter(event => event.kind === 'spawn');
    const count = spawns.reduce((total, event) => total + event.count, 0);
    assert.ok(count >= 24 && count <= 40);
    const grid = spawns.find(event => event.enemies[0].roleId === 'role-revamp-linefighter');
    assert.equal(grid.formationSlots.length, grid.count);
    assert.equal(grid.startSeconds, 0);
    assert.equal(grid.formationBehavior.movementId, 'revamp-breathe');
    assert.equal(grid.formationBehavior.attackId, 'revamp-dive');
    assert.ok(grid.enemies[0].projectileSpeed <= 2);
    assert.equal(spawns.filter(event => event !== grid).reduce((sum, event) => sum + event.count, 0), 2);
    assert.ok(wave.events.some(event => event.kind === 'recovery' && event.powerupIds.includes('projectile-upgrade')));
    assert.ok(!wave.events.some(event => event.kind === 'boss'));
  }
  assert.equal(opening.waves[0].introSeconds, 0);
  assert.ok(opening.waves[0].events.some(event => event.startSeconds === 6 && event.powerupIds?.includes('projectile-upgrade')));
  const peer = opening.waves.at(-1).events.find(event => event.kind === 'boss');
  assert.equal(peer.label, 'PEER REVIEWER');
  assert.ok(peer.warningSeconds >= 1.2);
});

test('one new regular-enemy mechanic per introduction mission, taught before reuse', () => {
  const roles = campaign.enemyRoles.filter((role) => role.id.startsWith('role-revamp-') && role.id !== 'role-revamp-linefighter');
  const introductions = new Set(roles.map((role) => `${role.introductionSector}/${role.introductionMission}`));
  assert.equal(roles.length, 8);
  assert.equal(introductions.size, 8);
  for (const role of roles) {
    const depth = (role.introductionSector - 1) * 5 + role.introductionMission;
    const firstUse = Math.min(...earlyNodes.filter((node) => {
      const level = campaign.levels.find((level) => level.id === node.missionDefinitionId);
      return level.waves.some((wave) => wave.events.some((event) => event.kind === 'spawn' && event.enemies.some((enemy) => enemy.roleId === role.id)));
    }).map((node) => node.depth));
    assert.equal(firstUse, depth, role.id);
    assert.ok(role.fireDelaySeconds >= 0.7);
  }
  for (const node of earlyNodes.filter((node) => node.depth > 1)) {
    const level = campaign.levels.find((level) => level.id === node.missionDefinitionId);
    assert.ok(level.waves.length >= 3 && level.waves.length <= 9);
    for (let index = 0; index < level.waves.length - 1; index++) {
      if (level.waves[index].events.some((event) => event.kind === 'boss')) assert.equal(level.waves[index + 1].rhythm, 'recovery');
    }
  }
});

test('health tuning does not silently grow beyond the authored TTK window', () => {
  for (let mission = 1; mission <= 50; mission++) for (const durability of Object.keys(CURVE.regularTtkSeconds)) {
    approximately(regularHealth(mission, durability) / missionCurve(mission).expectedDps, CURVE.regularTtkSeconds[durability], 0.0002);
  }
});
