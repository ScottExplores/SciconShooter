const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (entry) => {
  const result = esbuild.buildSync({ entryPoints: [path.join(root, entry)], bundle: true,
    platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};
global.Image = class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const { GameEngine } = load('services/gameLogic.ts');
const { DEFAULT_GAME_CAMPAIGN } = load('services/levelConfig.ts');
const { createCombatLabStats, createCombatLabLoadout } = load('services/combatLab.ts');
const labSource = read('components/CombatLab.tsx');
const canvasSource = read('components/GameCanvas.tsx');
const previewSource = read('components/ShipWeaponPreviewDialog.tsx');
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `source section ${start} → ${end} exists`);
  return source.slice(from, to);
};

test('Lab defaults to ordinary Mission 1 and exposes every real first-sector Mission without replacing its campaign', () => {
  assert.match(labSource, /useState\(`mission:\$\{DEFAULT_GAME_CAMPAIGN\.levels\[0\]\.id\}`\)/);
  assert.match(labSource, /const campaign = targetId === 'showcase' \? showcase : DEFAULT_GAME_CAMPAIGN/);
  assert.match(labSource, /DEFAULT_GAME_CAMPAIGN\.sectors\[0\]\.missionIds\.map/);
  assert.match(labSource, /value=\{`mission:\$\{id\}`\}/);
  assert.match(labSource, /const level = campaignMission \?\?/);
  assert.match(labSource, /const continuousMission = targetId === 'showcase' \|\| Boolean\(campaignMission\)/);
  assert.match(labSource, /previewContinuousWaves: continuousMission/);
  assert.match(labSource, /campaign, levelId: level\.id, waveId: wave\.id/);
  const ids = DEFAULT_GAME_CAMPAIGN.sectors[0].missionIds;
  assert.equal(ids.length, 5);
  assert.deepEqual(ids.map((id) => DEFAULT_GAME_CAMPAIGN.levels.find((level) => level.id === id).order), [1, 2, 3, 4, 5]);
});

test('all five real Mission previews preserve in-flight state across internal boundaries and stop at their own finale', () => {
  // This tests boundary semantics, not autonomous combat completion: enemies
  // are not fought or silently marked defeated to claim a successful run.
  for (const levelId of DEFAULT_GAME_CAMPAIGN.sectors[0].missionIds) {
    const level = DEFAULT_GAME_CAMPAIGN.levels.find((candidate) => candidate.id === levelId);
    const loadout = createCombatLabLoadout('bio', 21, 3, 3, [], 3);
    const engine = new GameEngine(createCombatLabStats(), { campaign: DEFAULT_GAME_CAMPAIGN,
      previewMode: true, previewContinuousWaves: true, playerShipId: 'bio', squadLoadout: loadout,
      initialLevelId: level.id, initialWaveId: level.waves[0].id, randomSeed: `lab-continuity:${level.id}`,
      audioEnabled: false, preloadCanvasAssets: false });
    engine.init(390, 844);
    engine.stats.score = 4321;
    engine.lives = 6;
    engine.missionOverdriveLevel = 3;
    const statsIdentity = engine.stats;
    const playerIdentity = engine.player;
    for (let index = 1; index < level.waves.length; index++) {
      engine.waveTransitionPending = true;
      engine.startNextWave();
      const state = engine.getRuntimeState();
      assert.equal(state.levelId, level.id);
      assert.equal(state.waveId, level.waves[index].id);
      assert.equal(state.waveNumber, index + 1, 'wave numbers stay local to the selected Mission');
      assert.equal(state.complete, false, 'React must not reload an internal boundary');
      assert.equal(engine.gameActive, true);
      assert.equal(engine.stats, statsIdentity);
      assert.equal(engine.player, playerIdentity);
      assert.equal(engine.stats.score, 4321);
      assert.equal(engine.lives, 6);
      assert.equal(engine.missionOverdriveLevel, 3);
      assert.equal(engine.introFlightFrames, 0, 'internal boundaries do not replay takeoff');
    }
    engine.waveTransitionPending = true;
    engine.startNextWave();
    assert.equal(engine.getRuntimeState().levelId, level.id);
    assert.equal(engine.getRuntimeState().waveId, level.waves.at(-1).id);
    assert.equal(engine.getRuntimeState().complete, true);
    assert.equal(engine.gameActive, false, 'a local Mission preview never leaks into the next Mission');
  }
});

test('Lab completion callback ignores ordinary state updates and duplicates rather than resetting each wave', () => {
  const callback = section(labSource, 'const receiveRuntime = useCallback', 'const relaunch =');
  assert.match(callback, /if \(!state\.complete\) \{ completedWave\.current = ''; return; \}/);
  assert.match(callback, /if \(panel \|\| paused \|\| completedWave\.current === state\.waveId\) return/);
  assert.match(callback, /continuousMission \? level\.waves\[state\.waveNumber\] : null/);
  assert.match(callback, /else \{ setFinished\(true\); setPaused\(true\); \}/);
  assert.doesNotMatch(callback, /\b(?:setRun|setStats|createCombatLabStats|createCombatLabLoadout)\s*\(/);
});

test('every Canvas suspension path clears queued hull pulses and unregisters its global listeners on disposal', () => {
  for (const [start, end] of [
    ["case 'pause':", "case 'restart':"],
    ['if (!running) {', '} else {'],
    ['const handleWindowBlur = () => {', 'const handleVisibilityChange'],
    ['disposeRuntime = () => {', 'void setupRuntime().catch']
  ]) assert.match(section(canvasSource, start, end), /clearQueuedPrimaryBursts\(\)/, start);
  const visibility = section(canvasSource, 'const handleVisibilityChange = () => {', 'const keyboardTarget:');
  assert.match(visibility, /if \(document\.hidden\) engine\.clearQueuedPrimaryBursts\(\)/);
  const cleanup = section(canvasSource, 'disposeRuntime = () => {', 'void setupRuntime().catch');
  assert.match(cleanup, /window\.removeEventListener\('blur', handleWindowBlur\)/);
  assert.match(cleanup, /document\.removeEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(cleanup, /cancelAnimationFrame\(requestRef\.current\)/);
  assert.match(cleanup, /renderer\.destroy\(\)/);
});

test('Hangar cadence follows the selected hull and all volley timers are bounded and cleaned on dependency changes', () => {
  assert.match(previewSource, /getPlayerWeaponPreviewVolleyIntervalMs\(fireRateLevel, shipId \?\? 'researchhub'\)/);
  assert.match(previewSource, /getPlayerWeaponPreviewActiveVolleyLimit\(fireRateLevel, shots, shipId \?\? 'researchhub'\)/);
  const timers = section(previewSource, 'let disposed = false;', 'const previousFocus =');
  assert.match(timers, /\.slice\(-activeVolleyLimit\)/);
  assert.match(timers, /cleanupTimers\.delete\(cleanupTimer\)/);
  assert.match(timers, /disposed = true/);
  assert.match(timers, /window\.clearInterval\(volleyTimer\)/);
  assert.match(timers, /cleanupTimers\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
  assert.match(timers, /\[activeVolleyLimit, reducedMotion, shipId, volleyIntervalMs, volleyLifetimeMs\]/);
});
