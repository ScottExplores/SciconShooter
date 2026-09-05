const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const { PNG } = require('../director/node_modules/pngjs');
const load = (entry) => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const mod = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
};
global.Image = class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const { GameEngine, Entity } = load('services/gameLogic.ts');
const { createCombatLabCampaign, createCombatLabStats, createCombatLabLoadout } = load('services/combatLab.ts');
const utility = load('services/supportUtility.ts');
const { parseGameCampaign } = load('game-config/validate.ts');
const fixture = (previewContinuousWaves = true) => {
  const campaign = createCombatLabCampaign();
  const loadout = createCombatLabLoadout('bio', 7, 2, 0, ['quorum-crab', 'axiom-orbiter'], 3);
  const engine = new GameEngine(createCombatLabStats(), { campaign, previewMode: true, previewContinuousWaves,
    squadLoadout: loadout, audioEnabled: false, preloadCanvasAssets: false, randomSeed: 'lab-test' });
  engine.init(390, 700);
  return { engine, campaign };
};

test('showcase remains a valid campaign and contains a major boss and an elite', () => {
  const campaign = createCombatLabCampaign();
  assert.doesNotThrow(() => parseGameCampaign(campaign));
  assert.equal(campaign.levels[0].waves.length, 6);
  const bosses = campaign.levels[0].waves.flatMap(wave => wave.events.filter(event => event.kind === 'boss'));
  assert.deepEqual(bosses.map(event => event.bossId), ['bottleneck-drone', 'gatekeeper-prime']);
  assert.equal(campaign.levels[0].waves[0].events[0].formationBehavior.entryPathId, 'serpentine-weave');
});

test('continuous local preview carries equipment, score and lives between waves and stops at Mission end', () => {
  const { engine, campaign } = fixture();
  engine.stats.score = 4321;
  engine.lives = 6;
  for (let index = 1; index < 6; index++) {
    engine.waveTransitionPending = true;
    engine.startNextWave();
    assert.equal(engine.getRuntimeState().waveId, campaign.levels[0].waves[index].id);
    assert.equal(engine.stats.score, 4321);
    assert.equal(engine.lives, 6);
    assert.equal(engine.gameActive, true);
  }
  engine.waveTransitionPending = true;
  engine.startNextWave();
  assert.equal(engine.previewComplete, true);
  assert.equal(engine.gameActive, false);
  assert.equal(engine.getRuntimeState().levelId, campaign.levels[0].id, 'must not leak into the next campaign Mission');
});

test('ordinary boss previews still stop after one wave', () => {
  const { engine } = fixture(false);
  engine.waveTransitionPending = true;
  engine.startNextWave();
  assert.equal(engine.previewComplete, true);
});

test('local unlocks use isolated preview state, not account or competition writes', () => {
  const entry = fs.readFileSync('index.tsx', 'utf8');
  const panel = fs.readFileSync('components/CombatLab.tsx', 'utf8');
  const lab = fs.readFileSync('services/combatLab.ts', 'utf8');
  assert.match(entry, /combatLabRequested = import\.meta\.env\.DEV/);
  assert.match(entry, /const CombatLab = import\.meta\.env\.DEV/);
  assert.match(entry, /if \(!combatLabRequested\) installPlayerReportMonitoring/);
  assert.match(panel, /previewMode: true/);
  assert.match(panel, /previewContinuousWaves: continuousMission/);
  assert.match(lab, /const campaign = cloneGameCampaign\(\)/);
  assert.doesNotMatch(panel + lab, /localStorage\.setItem|submitWeekly|saveSquad|fetch\(|walletPurchase/);
  for (const ship of ['researchhub', 'bio', 'eth', 'btc']) {
    const loadout = createCombatLabLoadout(ship, 49, 6, 7, [], 5);
    assert.equal(loadout.mainShipId, ship);
    assert.equal(loadout.upgrades.fireRate, 49);
    assert.equal(loadout.profileId, 'local-combat-lab');
  }
});

test('salvage drone leaves formation, collects real coins once, and recalls after collection', () => {
  const { engine } = fixture();
  engine.entities = [];
  engine.introFlightFrames = 0;
  engine.player.x = 130; engine.player.y = 540;
  const coin = new Entity('COIN', 255, 425, 0.5);
  coin.width = 16; coin.height = 16;
  engine.entities.push(coin);
  const before = engine.stats.coins;
  for (let frame = 0; frame < 75; frame++) { engine.updateSquadCompanions(); if (!coin.markedForDeletion) engine.updateCoinEntity(coin); }
  assert.equal(coin.markedForDeletion, true);
  assert.ok(engine.stats.coins > before);
  const credited = engine.stats.coins;
  engine.entities = [];
  for (let frame = 0; frame < 40; frame++) engine.updateSquadCompanions();
  assert.equal(engine.stats.coins, credited);
  assert.equal(engine.getSquadCompanionVisuals()[0].utilityActive, false);
});

test('interceptor catches one hostile round then respects recharge; friendly fire and beams survive', () => {
  const { engine } = fixture();
  engine.entities = [];
  engine.introFlightFrames = 0;
  for (let frame = 0; frame < 40; frame++) engine.updateSquadCompanions();
  const guard = engine.getSquadCompanionVisuals()[1];
  const round = (friendly, beam) => {
    const entity = new Entity('PROJECTILE', guard.x, guard.y, 0.5);
    entity.width = 4; entity.height = 8; entity.isPlayerShot = friendly; entity.isBeam = beam;
    return entity;
  };
  const first = round(false, false), second = round(false, false), friendly = round(true, false), beam = round(false, true);
  engine.entities = [first, second, friendly, beam];
  engine.updateSquadCompanions();
  assert.equal([first, second].filter(item => item.markedForDeletion).length, 1);
  engine.updateSquadCompanions();
  assert.equal([first, second].filter(item => item.markedForDeletion).length, 1);
  assert.equal(friendly.markedForDeletion, false);
  assert.equal(beam.markedForDeletion, false);
  assert.ok(utility.getInterceptorCooldown(5) < utility.getInterceptorCooldown(1));
});

test('viewport shrink clamps the separately owned player back onto the flight surface', () => {
  const { engine } = fixture();
  engine.player.x = 700; engine.player.y = 1100;
  engine.resize(320, 480);
  const bounds = engine.getPlayerMovementBounds();
  assert.ok(engine.player.x <= bounds.maxX);
  assert.ok(engine.player.y <= bounds.maxY);
});

test('new sprites have real alpha, bounded dimensions, and a visible silhouette', () => {
  for (const name of fs.readdirSync('public/game-art/generated/scicon-combat-evolution-v1').filter(name => name.endsWith('.png'))) {
    const png = PNG.sync.read(fs.readFileSync(`public/game-art/generated/scicon-combat-evolution-v1/${name}`));
    assert.equal(png.width, 128); assert.equal(png.height, 128);
    let transparent = 0, opaque = 0;
    for (let index = 3; index < png.data.length; index += 4) png.data[index] === 0 ? transparent++ : opaque++;
    assert.ok(transparent > 8000, `${name}: no baked background`);
    assert.ok(opaque > 100, `${name}: visible pixels`);
  }
});
