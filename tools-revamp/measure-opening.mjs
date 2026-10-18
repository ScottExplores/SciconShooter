#!/usr/bin/env node
// REVAMP(I): Renderer-free pacing evidence using the same engine, seed and pilot as mobile QA.
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function loadOpeningRuntime() {
  const scratch = await mkdtemp(join(tmpdir(), 'scicon-I-pacing-'));
  try {
    const outfile = join(scratch, 'runtime.mjs');
    await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
      export { GameEngine } from './services/gameLogic';
      export { DEFAULT_GAME_CAMPAIGN } from './services/levelConfig';
      export { createWeeklySquadState, createPermanentSquadState } from './services/squadProgression';
      export { buildRevampCampaignLoadout } from './services/revamp/runtime/profile';
      export { getAutoplayInput, isQAEnemy, isQAEnemyBullet, isQAOnScreen } from './services/revamp/qa/autoplayBot';
    ` }, outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
      define: { 'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false', 'import.meta.env.MODE': '"test"' } });
    globalThis.Image ??= class { set src(_value) {} };
    return await import(pathToFileURL(outfile).href);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

export function measureOpeningMission(runtime, level, { seed = 12345, seconds = 150, god = false, mobile = true, performance = false } = {}) {
  const campaign = runtime.DEFAULT_GAME_CAMPAIGN;
  const permanent = runtime.createPermanentSquadState('local-pacing');
  const first = [...campaign.levels].sort((a, b) => a.order - b.order)[0];
  if (level.id !== first.id) permanent.campaignProgress.completedMissionIds = [first.id];
  const stats = { score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
    bombs: 2, bombCharge: 0, bombChargeMax: 100, lives: 3, repairsCount: 0,
    shipAbilityCooldown: 0, shipAbilityCooldownMax: 960, upgrades: { fireRate: 0, speed: 0, ability: 0 },
    powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 };
  const engine = new runtime.GameEngine(stats, { campaign, audioEnabled: false, preloadCanvasAssets: false,
    initialLevelId: level.id, initialWaveId: level.waves[0].id, randomSeed: seed, playerShipId: 'researchhub',
    squadLoadout: runtime.buildRevampCampaignLoadout(runtime.createWeeklySquadState('local-pacing'), permanent, 'researchhub') });
  engine.init(390, 844);
  engine.mobileProfile = mobile;
  engine.setPerformanceMode(performance);
  const report = { mission: level.id, seed, god, world: '390x844', player: 'researchhub, no research or paid upgrades',
    elapsedSeconds: 0, rewardCollectionSeconds: 0, complete: false, lives: 3, kills: 0, firstEnemySeconds: null, maxEnemies: 0,
    maxHolding: 0, maxEnemyBullets: 0, denseSeconds: 0, waves: [], damage: [], samples: [] };
  // Observe accepted damage through existing methods; all arguments/returns stay intact.
  let currentTick = 0;
  const damage = engine.applyPlayerLifeDamage.bind(engine);
  engine.applyPlayerLifeDamage = amount => {
    const result = damage(amount);
    if (result.damageApplied > 0) report.damage.push({ seconds: currentTick / 60, amount: result.damageApplied,
      playerX: engine.player.x, playerY: engine.player.y, kind: 'hazard' });
    return result;
  };
  const describeSource = (source, kind) => {
    const latest = report.damage.at(-1);
    if (!latest || latest.seconds !== currentTick / 60) return;
    Object.assign(latest, { kind, type: source.type, role: source.campaignRoleId, event: source.sourceEventId,
      x: source.x, y: source.y, vx: source.vx, vy: source.vy, formation: source.formationState });
  };
  const ram = engine.resolvePlayerRamCollision.bind(engine);
  engine.resolvePlayerRamCollision = (source, protectedFromDamage) => {
    const before = report.damage.length;
    const result = ram(source, protectedFromDamage);
    if (report.damage.length > before) describeSource(source, 'contact');
    return result;
  };
  const projectileFeedback = engine.registerPlayerProjectileHitFeedback.bind(engine);
  engine.registerPlayerProjectileHitFeedback = (source, previewSafeHit) => {
    if (!previewSafeHit) describeSource(source, 'projectile');
    return projectileFeedback(source, previewSafeHit);
  };
  const waves = new Set();
  for (let tick = 1; tick <= seconds * 60; tick++) {
    currentTick = tick;
    if (god) engine.invincibleTimer = Math.max(engine.invincibleTimer, 3600);
    engine.handleInput(runtime.getAutoplayInput(engine, seed), null);
    engine.update();
    // REVAMP(G): Keep the post-defeat coin sweep visible in timing evidence;
    // it is playable reward collection, separate from the encounter budget.
    report.rewardCollectionSeconds = Math.max(report.rewardCollectionSeconds, engine.stageRewardCollectionDuration / 60);
    let enemies = 0, bullets = 0, holding = 0, diving = 0;
    for (const entity of engine.entities) {
      if (!runtime.isQAOnScreen(entity, engine.width, engine.height)) continue;
      if (runtime.isQAEnemy(entity) && entity.hp > 0) {
        enemies++;
        if (entity.formationState === 'hold') holding++;
        if (entity.formationState === 'attack') diving++;
      }
      if (runtime.isQAEnemyBullet(entity)) bullets++;
    }
    const state = engine.getRuntimeState();
    if (!waves.has(state.waveId)) {
      waves.add(state.waveId);
      report.waves.push({ id: state.waveId, seconds: tick / 60 });
    }
    if (enemies && report.firstEnemySeconds === null) report.firstEnemySeconds = tick / 60;
    report.maxEnemies = Math.max(report.maxEnemies, enemies);
    report.maxHolding = Math.max(report.maxHolding, holding);
    report.maxEnemyBullets = Math.max(report.maxEnemyBullets, bullets);
    if (enemies >= 18) report.denseSeconds += 1 / 60;
    if (tick % 60 === 0) report.samples.push({ seconds: tick / 60, enemies, holding, diving, bullets,
      kills: stats.enemiesDefeated, lives: engine.lives, bossHp: engine.bossRef?.hp ?? engine.miniBossRef?.hp ?? null });
    report.elapsedSeconds = tick / 60;
    report.lives = engine.lives;
    report.kills = stats.enemiesDefeated;
    report.complete = Boolean(state.complete || engine.waveVictoryReady);
    if (report.complete || engine.lives <= 0) break;
  }
  report.denseSeconds = Math.round(report.denseSeconds * 100) / 100;
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const value = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const runtime = await loadOpeningRuntime();
  const campaign = runtime.DEFAULT_GAME_CAMPAIGN;
  const mission = value('--mission');
  const sector = campaign.sectors[0].id;
  const ids = new Set(campaign.campaignGraph.nodes.filter(node => node.sectorId === sector).map(node => node.missionDefinitionId));
  const levels = campaign.levels.filter(level => mission ? level.id === mission : ids.has(level.id));
  if (!levels.length) throw new Error(`No mission matched ${mission ?? sector}`);
  const reports = levels.map(level => measureOpeningMission(runtime, level, {
    god: args.includes('--god'), seconds: Number(value('--seconds') ?? 150), seed: Number(value('--seed') ?? 12345) }));
  const result = { note: 'Fixed 60 Hz simulation time including hit-stop and flight transitions; no renderer. Ordinary baseline campaign loadout. God mode, when enabled, is coverage only. Reactive autoplay is not a human fairness proof.', reports };
  const output = value('--output');
  if (output) await writeFile(resolve(output), `${JSON.stringify(result, null, 2)}\n`);
  console.table(reports.map(({ samples, waves, damage, player, world, ...summary }) => summary));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
