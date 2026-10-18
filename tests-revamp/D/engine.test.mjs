import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scratch = await mkdtemp(join(tmpdir(), 'scicon-revamp-engine-'));
const file = join(scratch, 'engine.cjs');
const previousImage = globalThis.Image;
globalThis.Image = class Image { set src(value) { this.complete = true; this.width = 128; this.height = 128; } };
after(async () => { globalThis.Image = previousImage; await rm(scratch, { recursive: true, force: true }); });
await build({ stdin: { contents: `export * from './services/gameLogic'; export * from './services/levelConfig'; export * from './services/squadProgression'; export * from './services/revamp/progression'; export * from './types';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', outfile: file, logLevel: 'silent' });
const m = await import(pathToFileURL(file).href);

const initialStats = () => ({ score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
  bombs: 0, bombCharge: 0, bombChargeMax: 100, lives: 3, repairsCount: 0,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960, upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 });
const bonuses = () => m.getRevampBonuses(m.createRevampProgress());
function engine({ revamp = {}, wings = false, preview = false, weekly = false, shipId = 'researchhub' } = {}) {
  const campaign = m.cloneGameCampaign();
  // Keep authored metadata but use a quiet runway so the tests control combat causes.
  for (const level of campaign.levels) for (const wave of level.waves) {
    wave.events = []; wave.introSeconds = 0; wave.durationSeconds = 600; wave.completionRule = 'clear-after-duration';
  }
  const weeklyState = m.createWeeklySquadState('engine-test');
  if (wings) {
    weeklyState.unlockedSlots.left = true; weeklyState.ownedMiniShips['citation-dart'] = 1;
    weeklyState.equipped.left = 'citation-dart';
  }
  const loadout = m.buildRuntimeSquadLoadout(weeklyState, shipId);
  if (!weekly) loadout.revamp = { ...bonuses(), wingAutoCast: false, ...revamp };
  const runtime = new m.GameEngine(initialStats(), { campaign, squadLoadout: loadout,
    playerShipId: shipId, previewMode: preview, audioEnabled: false, preloadCanvasAssets: false, randomSeed: 'revamp-engine-test' });
  runtime.init(390, 844);
  runtime.introFlightFrames = 0;
  return runtime;
}
function enemy(runtime, { filler = false, type = m.EntityType.ENEMY_DRONE } = {}) {
  const target = runtime.createEntity(type, 30, 30);
  target.hp = 10; target.campaignFiller = filler;
  runtime.entities.push(target);
  return target;
}
const primaryShots = runtime => runtime.entities.filter(entity => entity.isPlayerShot && !entity.squadAbilityKind);
const primaryEnergy = runtime => primaryShots(runtime).reduce((sum, shot) => sum + shot.damage * Math.max(1, shot.representedRoundsRemaining), 0);

test('real engine summary observes authored enemies, excludes filler, snapshots and resets at mission boundary', () => {
  const runtime = engine();
  const target = enemy(runtime), filler = enemy(runtime, { filler: true });
  enemy(runtime, { type: m.EntityType.SUPPLY_DROP });
  runtime.update(false);
  assert.deepEqual(runtime.buildWaveVictorySummary().revampMetrics, { spawned: 1, kills: 0, hits: 0 });
  runtime.handleEnemyDestroyed(target); runtime.handleEnemyDestroyed(filler);
  const sameFrameTarget = enemy(runtime); runtime.handleEnemyDestroyed(sameFrameTarget);
  const summary = runtime.buildWaveVictorySummary();
  assert.deepEqual(summary.revampMetrics, { spawned: 2, kills: 2, hits: 0 });
  assert.equal(typeof summary.revampRunId, 'string');
  runtime.resetWaveProgress(false);
  assert.deepEqual(runtime.buildWaveVictorySummary().revampMetrics, summary.revampMetrics, 'internal waves preserve mission progress');
  runtime.resetWaveProgress(true);
  assert.deepEqual(runtime.buildWaveVictorySummary().revampMetrics, { spawned: 0, kills: 0, hits: 0 });
  assert.deepEqual(summary.revampMetrics, { spawned: 2, kills: 2, hits: 0 }, 'settlement snapshot remains immutable');
});

test('research shield preserves full life-transition contract and records contact for no-hit medal', () => {
  const runtime = engine({ revamp: { shieldBonus: 2 } });
  assert.deepEqual(runtime.applyPlayerLifeDamage(1), { previousLives: 3, lives: 3, damageApplied: 0, defeated: false });
  assert.deepEqual(runtime.applyPlayerLifeDamage(2), { previousLives: 3, lives: 2, damageApplied: 1, defeated: false });
  assert.equal(runtime.buildWaveVictorySummary().revampMetrics.hits, 2);
  assert.equal(runtime.stats.lives, 2);
});

test('Firepower affects real default-hull collision rounds and primary damage', () => {
  const base = engine(), upgraded = engine({ revamp: { mainDamageMultiplier: 1.2, extraProjectiles: 1 } });
  base.fireBullet(); upgraded.fireBullet();
  assert.equal(primaryShots(base)[0].representedRoundsRemaining, 1);
  assert.equal(primaryShots(upgraded)[0].representedRoundsRemaining, 2);
  assert.ok(Math.abs(primaryEnergy(upgraded) / primaryEnergy(base) - 2.4) < 1e-9);
});

test('earned overdrive changes live projectile damage and stops ticking for transmissions', () => {
  const runtime = engine({ revamp: { overdriveChargeMultiplier: 1.2, overdriveDurationMultiplier: 1.3 } });
  for (let index = 0; index < 21; index++) runtime.handleEnemyDestroyed(enemy(runtime));
  assert.ok(runtime.revampFlight.overdriveFrames > 0);
  runtime.fireBullet(); assert.ok(Math.abs(primaryEnergy(runtime) - 1.25) < 1e-9);
  const before = runtime.revampFlight.overdriveFrames;
  runtime.hitStopFrames = 0;
  runtime.update(true); assert.equal(runtime.revampFlight.overdriveFrames, before);
  runtime.update(false); assert.equal(runtime.revampFlight.overdriveFrames, before - 1);
});

test('wing controller hooks preserve cooldown through paused transmissions and formation reset', () => {
  const runtime = engine({ wings: true });
  enemy(runtime);
  for (let frame = 0; frame < 40; frame++) runtime.update(false);
  assert.equal(runtime.getWingSupportSnapshot().wings[0].ready, true);
  assert.equal(runtime.activateWingSpecial('left'), true);
  const before = runtime.getWingSupportSnapshot().wings[0].cooldownFrames;
  runtime.update(true);
  assert.equal(runtime.getWingSupportSnapshot().wings[0].cooldownFrames, before);
  assert.equal(runtime.activateWingSpecial('left'), false);
  runtime.resetSquadCompanionPositions();
  assert.equal(runtime.getWingSupportSnapshot().wings[0].cooldownFrames, before);
  runtime.update(false);
  assert.equal(runtime.getWingSupportSnapshot().wings[0].cooldownFrames, before - 1);
});

test('weekly engine retains legacy combat and preview cannot emit progression metrics', () => {
  const weekly = engine({ weekly: true, wings: true }), preview = engine({ preview: true, wings: true });
  weekly.handleEnemyDestroyed(enemy(weekly)); preview.handleEnemyDestroyed(enemy(preview));
  assert.equal(weekly.getWingSupportSnapshot().enabled, false);
  assert.equal(weekly.buildWaveVictorySummary().revampMetrics, undefined);
  assert.equal(preview.getWingSupportSnapshot().enabled, true);
  assert.equal(preview.buildWaveVictorySummary().revampMetrics, undefined);
});

test('Mission continuation adopts earned right wing while retaining left object, cooldown and run identity', () => {
  const runtime = engine({ wings: true });
  enemy(runtime);
  for (let frame = 0; frame < 40; frame++) runtime.update(false);
  assert.equal(runtime.activateWingSpecial('left'), true);
  const retainedWing = runtime.squadCompanions[0];
  const cooldown = runtime.getWingSupportSnapshot().wings[0].cooldownFrames;
  const runId = runtime.buildWaveVictorySummary().revampRunId;
  const incoming = { ...runtime.squadLoadout,
    revamp: { ...runtime.squadLoadout.revamp, firstFlight: false },
    companions: [...runtime.squadLoadout.companions, {
      ...runtime.squadLoadout.companions[0], slot: 'right', id: 'quorum-crab', ability: 'coin-magnet',
      frames: m.MINI_SHIP_BY_ID['quorum-crab'].frames
    }] };
  assert.equal(runtime.adoptRevampCampaignLoadout(incoming), false, 'combat cannot adopt loadouts');
  runtime.currentCampaignIndex = runtime.campaign.levels[0].waves.length - 1;
  runtime.waveTransitionPending = true; runtime.waveVictoryReady = true; runtime.gameActive = false;
  const wrongProfile = { ...incoming, profileId: 'different-pilot' };
  assert.equal(runtime.adoptRevampCampaignLoadout(wrongProfile), false);
  assert.equal(runtime.adoptRevampCampaignLoadout(incoming), true);
  assert.strictEqual(runtime.squadCompanions[0], retainedWing);
  assert.deepEqual(runtime.getWingSupportSnapshot().wings.map(wing => wing.slot), ['left', 'right']);
  assert.equal(runtime.getWingSupportSnapshot().wings[0].cooldownFrames, cooldown);
  assert.equal(runtime.buildWaveVictorySummary().revampRunId, runId);
  const currentNode = runtime.getCampaignGraphNodeForLevelId(runtime.campaign.levels[0].id);
  const nextNode = runtime.campaign.campaignGraph.nodes.find(node => node.nodeId === currentNode.outgoingEdges[0].toNodeId);
  assert.equal(runtime.continueToCampaignMission(nextNode.missionDefinitionId), true);
  assert.strictEqual(runtime.squadCompanions[0], retainedWing);
  assert.equal(runtime.getWingSupportSnapshot().wings[0].cooldownFrames, cooldown);
  assert.equal(runtime.squadCompanions[1].id, 'quorum-crab');
  assert.equal(runtime.adoptRevampCampaignLoadout(incoming), false, 'new Mission immediately closes adoption boundary');
});

test('earned-loadout adoption rejects weekly, preview and unsettled Mission boundaries', () => {
  for (const options of [{ weekly: true }, { preview: true }]) {
    const runtime = engine({ ...options, wings: true });
    runtime.currentCampaignIndex = runtime.campaign.levels[0].waves.length - 1;
    runtime.waveTransitionPending = true; runtime.waveVictoryReady = true;
    const incoming = { ...runtime.squadLoadout, revamp: { ...bonuses(), wingAutoCast: false } };
    assert.equal(runtime.adoptRevampCampaignLoadout(incoming), false);
  }
  const runtime = engine({ wings: true });
  runtime.waveTransitionPending = true; runtime.waveVictoryReady = false;
  assert.equal(runtime.adoptRevampCampaignLoadout(runtime.squadLoadout), false);
});
