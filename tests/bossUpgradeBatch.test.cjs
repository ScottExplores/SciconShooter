const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, Array, Set, Map }
  );
  return moduleBox.exports;
};

test('portrait bosses stay inside the screen and pattern gaps stay readable', () => {
  const motion = loadTypeScriptModule('services/gameplay/serialQuietBeatMotion.ts');
  const patterns = loadTypeScriptModule('services/gameplay/bosses/BossPatternRuntime.ts');
  const span = motion.serialQuietBeatHorizontalSpan(412, 338);
  assert.ok(span.minX >= 0, span);
  assert.ok(span.maxX + 338 <= 412, span);

  const wall = patterns.resolveBossWeaveWallLayout(390, true, 1);
  const gap = wall.safeGapRightX - wall.safeGapLeftX;
  assert.ok(gap + 0.01 >= patterns.bossPatternSafeGapPixels(), `gap ${gap}`);
});

test('Nullwake phase 1 survives the opening of the health bar', () => {
  const { resolveBossPhaseConfig } = loadTypeScriptModule('services/bossPhaseConfig.ts');
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.bossId === 'nullwake-revenant');
  const opening = resolveBossPhaseConfig(2500, 2500, event.phases, event.weapons);
  const stillOpening = resolveBossPhaseConfig(2000, 2500, event.phases, event.weapons);
  const crown = resolveBossPhaseConfig(1200, 2500, event.phases, event.weapons);
  assert.equal(opening.phaseId, 'sandbox-nullwake-borrowed-charge');
  assert.equal(stillOpening.phaseId, 'sandbox-nullwake-borrowed-charge');
  assert.equal(crown.phaseId, 'sandbox-nullwake-backplane-crown');
  assert.ok(event.phases[1].triggerHealthRatio <= 0.7);
});

const loadBundledModule = (entryPoint) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    loaded,
    loaded.exports
  );
  return loaded.exports;
};

const findBoss = (campaignConfig, bossId) => {
  for (const level of campaignConfig.levels) {
    for (const wave of level.waves) {
      const event = wave.events.find((candidate) => (
        candidate.kind === 'boss' && candidate.bossId === bossId
      ));
      if (event) return event;
    }
  }
  return null;
};

test('event runs keep pre-batch1 boss scripts and campaign gets the new moves', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));
  const generator = loadBundledModule('services/weeklyRunGenerator.ts');
  const { GameEngine } = loadBundledModule('services/gameLogic.ts');
  const run = generator.buildWeeklyRunCampaign('2026-10-26', campaign, 48);
  const campaignNullwake = findBoss(campaign, 'nullwake-revenant');
  const eventNullwake = findBoss(run, 'nullwake-revenant');
  assert.ok(campaignNullwake && eventNullwake, 'Nullwake is in the campaign and the event run');
  assert.equal(campaignNullwake.phases[1].triggerHealthRatio, 0.62);
  assert.equal(eventNullwake.phases[1].triggerHealthRatio, 0.99);
  assert.deepEqual(eventNullwake.timeline, campaignNullwake.timeline);
  assert.equal(eventNullwake.movementPatternId, campaignNullwake.movementPatternId);

  class TestImage {
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
    crossOrigin = '';
    src = '';
  }
  global.Image = TestImage;
  const stats = {
    score: 0,
    highScore: 0,
    wave: 1,
    coins: 0,
    totalCoins: 0,
    enemiesDefeated: 0,
    bombs: 2,
    bombCharge: 0,
    bombChargeMax: 100,
    shipAbilityCooldown: 0,
    shipAbilityCooldownMax: 960,
    lives: 9,
    repairsCount: 0,
    upgrades: { fireRate: 0, speed: 0, ability: 0 },
    powerupUses: {},
    bossProgress: 0,
    isBossActive: true,
    bossHp: 0,
    bossMaxHp: 100
  };
  const eventEngine = new GameEngine(stats, {
    campaign: run,
    audioEnabled: false,
    preloadCanvasAssets: false,
    previewMode: true,
    previewInvincible: true
  });
  const campaignEngine = new GameEngine(stats, {
    campaign,
    audioEnabled: false,
    preloadCanvasAssets: false,
    previewMode: true,
    previewInvincible: true
  });
  assert.equal(eventEngine.legacyBossScripts, true);
  assert.equal(campaignEngine.legacyBossScripts, false);

  const gatekeeper = findBoss(campaign, 'gatekeeper-prime');
  const countSweep = (engine) => {
    engine.init(390, 844);
    engine.gameActive = true;
    engine.introFlightFrames = 0;
    engine.invincibleTimer = 999999;
    engine.spawnBoss(structuredClone(gatekeeper));
    const boss = engine.entities.find((entity) => entity.type === 'BOSS');
    boss.y = 180;
    boss.gatekeeperPrimeCombatStartFrame = 0;
    boss.hp = boss.maxHp * 0.4;
    for (let frame = 0; frame < 80; frame += 1) {
      boss.hp = boss.maxHp * 0.4;
      engine.frameCount += 1;
      engine.updateBoss(boss);
    }
    return engine.entities.filter((entity) => entity.variant === 91 && entity.isBeam).length;
  };
  assert.equal(countSweep(eventEngine), 0);
  assert.ok(countSweep(campaignEngine) > 0);
});
