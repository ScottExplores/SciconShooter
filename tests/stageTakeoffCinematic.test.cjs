const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const engine = read('services', 'gameLogic.ts');
const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');

const loadTakeoffPresentation = () => {
  const start = engine.indexOf('export const STAGE_TAKEOFF_FRAMES');
  const end = engine.indexOf('const PLAYER_RAM_COOLDOWN_FRAMES', start);
  assert.ok(start >= 0 && end > start, 'takeoff timing helper must remain a standalone pure slice');
  const compiled = ts.transpileModule(engine.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
    module: moduleBox,
    require,
    Math,
    Number
  });
  return moduleBox.exports;
};

test('takeoff is exactly 18 hold, 24 lift, and 90 accelerating world-launch frames', () => {
  const {
    STAGE_TAKEOFF_FRAMES,
    STAGE_TAKEOFF_HOLD_FRAMES,
    STAGE_TAKEOFF_LIFT_FRAMES,
    STAGE_TAKEOFF_LAUNCH_FRAMES,
    STAGE_TAKEOFF_TRAVEL_EXPONENT,
    getStageTakeoffPresentation
  } = loadTakeoffPresentation();

  assert.equal(STAGE_TAKEOFF_FRAMES, 132);
  assert.equal(STAGE_TAKEOFF_HOLD_FRAMES, 18);
  assert.equal(STAGE_TAKEOFF_LIFT_FRAMES, 24);
  assert.equal(STAGE_TAKEOFF_LAUNCH_FRAMES, 90);
  assert.equal(STAGE_TAKEOFF_TRAVEL_EXPONENT, 2.35);

  assert.deepEqual(
    [132, 115, 114, 91, 90, 1, 0].map((remaining) => getStageTakeoffPresentation(remaining).phase),
    ['hold', 'hold', 'lift', 'lift', 'launch', 'launch', 'idle']
  );

  const holdStart = getStageTakeoffPresentation(132);
  const holdEnd = getStageTakeoffPresentation(115);
  const liftStart = getStageTakeoffPresentation(114);
  const liftEnd = getStageTakeoffPresentation(91);
  const launchStart = getStageTakeoffPresentation(90);
  const launchEnd = getStageTakeoffPresentation(1);
  assert.equal(holdStart.scale, 1);
  assert.equal(holdEnd.scale, 0.98);
  assert.equal(liftStart.scale, 0.98);
  assert.equal(liftEnd.scale, 1.02);
  assert.equal(launchStart.scale, 1.02);
  assert.ok(Math.abs(launchEnd.scale - 0.92) < 1e-12);
  assert.equal(launchStart.travel, 0);
  assert.equal(launchEnd.travel, 1);

  const launchTravelAt = (phaseAge) => getStageTakeoffPresentation(90 - phaseAge).travel;
  const samples = [0, 22, 44, 66, 89].map(launchTravelAt);
  const deltas = samples.slice(1).map((value, index) => value - samples[index]);
  assert.ok(deltas.every((delta, index) => index === 0 || delta > deltas[index - 1]));
});

test('an arbitrary reward-window position returns home, lifts four percent, then stays anchored', () => {
  const { getStageTakeoffPose, getStageTakeoffPresentation } = loadTakeoffPresentation();
  const start = { x: 27, y: 318 };
  const home = { x: 154, y: 724 };
  const viewportHeight = 900;

  const holdStart = getStageTakeoffPose(
    getStageTakeoffPresentation(132),
    start.x,
    start.y,
    home.x,
    home.y,
    viewportHeight
  );
  const holdEnd = getStageTakeoffPose(
    getStageTakeoffPresentation(115),
    start.x,
    start.y,
    home.x,
    home.y,
    viewportHeight
  );
  const liftStart = getStageTakeoffPose(
    getStageTakeoffPresentation(114),
    start.x,
    start.y,
    home.x,
    home.y,
    viewportHeight
  );
  const liftEnd = getStageTakeoffPose(
    getStageTakeoffPresentation(91),
    start.x,
    start.y,
    home.x,
    home.y,
    viewportHeight
  );
  const launchStart = getStageTakeoffPose(
    getStageTakeoffPresentation(90),
    start.x,
    start.y,
    home.x,
    home.y,
    viewportHeight
  );
  const launchEnd = getStageTakeoffPose(
    getStageTakeoffPresentation(1),
    start.x,
    start.y,
    home.x,
    home.y,
    viewportHeight
  );

  assert.deepEqual({ x: holdStart.x, y: holdStart.y }, start);
  assert.deepEqual({ x: holdEnd.x, y: holdEnd.y }, home);
  assert.deepEqual({ x: liftStart.x, y: liftStart.y }, home);
  assert.equal(liftEnd.x, home.x);
  assert.equal(liftEnd.y, home.y - viewportHeight * 0.04);
  assert.equal(launchStart.x, home.x);
  assert.equal(launchStart.y, liftEnd.y);
  assert.equal(launchEnd.x, home.x);
  assert.equal(launchEnd.y, liftEnd.y, 'the world accelerates while the formation remains anchored');
  assert.ok(launchEnd.scale >= 0.9 && launchEnd.scale <= 1.02);
});

test('stage-boundary cleanup deterministically removes every non-player entity and boss part', () => {
  const {
    STAGE_BOUNDARY_CLEAR_ENTITY_TYPES,
    shouldClearStageBoundaryEntityType
  } = loadTakeoffPresentation();
  const required = [
    'ENEMY_DRONE',
    'ENEMY_JOURNAL',
    'ENEMY_BRICK',
    'ENEMY_SWARM',
    'ENEMY_INVADER',
    'BOSS',
    'MINI_BOSS',
    'PROJECTILE',
    'MISSILE',
    'POWERUP',
    'COIN',
    'BOMB',
    'PARTICLE',
    'EFFECT'
  ];
  assert.deepEqual([...STAGE_BOUNDARY_CLEAR_ENTITY_TYPES].sort(), [...required].sort());
  assert.ok(required.every((type) => shouldClearStageBoundaryEntityType(type)));
  assert.equal(shouldClearStageBoundaryEntityType('PLAYER'), false);
  assert.equal(shouldClearStageBoundaryEntityType('COIN', true), false);
  assert.equal(shouldClearStageBoundaryEntityType('PARTICLE', true), false);
  assert.equal(shouldClearStageBoundaryEntityType('EFFECT', true), false);
  assert.equal(shouldClearStageBoundaryEntityType('PROJECTILE', true), false);
  assert.equal(shouldClearStageBoundaryEntityType('MISSILE', true), false);
  assert.equal(shouldClearStageBoundaryEntityType('COIN', false), true);
  assert.equal(shouldClearStageBoundaryEntityType('PROJECTILE', false), true);
  assert.equal(shouldClearStageBoundaryEntityType('MISSILE', false), true);
  assert.equal(shouldClearStageBoundaryEntityType('BOSS', true), true);
  assert.equal(shouldClearStageBoundaryEntityType('POWERUP', true), true);

  const cleanupStart = engine.indexOf('private clearStageBoundaryDebris(');
  const cleanupEnd = engine.indexOf('getPlayerHomePosition()', cleanupStart);
  const cleanup = engine.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /component\.hp = 0/);
  assert.match(cleanup, /component\.destroyed = true/);
  assert.match(cleanup, /this\.bossRef = null/);
  assert.match(cleanup, /this\.miniBossRef = null/);
  assert.match(cleanup, /this\.pendingConfiguredEncounter = null/);
  assert.match(cleanup, /this\.collisionBoxes\.clear\(\)/);
  assert.match(cleanup, /if \(compactImmediately\) this\.compactEntities\(\)/);
  assert.match(engine, /beginStageCompletion\(label: string, color: string\) \{[\s\S]*?this\.clearStageBoundaryDebris\(false, true, false\)/);
});

test('reward-window projectiles keep moving without combat and expire before takeoff cleanup', () => {
  const {
    advanceStageCompletionProjectile,
    shouldClearStageBoundaryEntityType
  } = loadTakeoffPresentation();

  const playerShot = {
    markedForDeletion: false,
    isBeam: false,
    life: 60,
    x: 120,
    y: 360,
    vx: 2.5,
    vy: -9,
    width: 10,
    height: 28
  };
  assert.equal(shouldClearStageBoundaryEntityType('PROJECTILE', true), false);
  advanceStageCompletionProjectile(playerShot, 430, 900);
  assert.equal(playerShot.x, 122.5);
  assert.equal(playerShot.y, 351);
  assert.equal(playerShot.markedForDeletion, false);

  const hostileShot = {
    markedForDeletion: false,
    isBeam: false,
    life: 60,
    x: 210,
    y: 200,
    vx: -1,
    vy: 6,
    width: 16,
    height: 16
  };
  advanceStageCompletionProjectile(hostileShot, 430, 900);
  assert.deepEqual(
    { x: hostileShot.x, y: hostileShot.y, markedForDeletion: hostileShot.markedForDeletion },
    { x: 209, y: 206, markedForDeletion: false }
  );

  const expiringBeam = {
    markedForDeletion: false,
    isBeam: true,
    life: 1,
    x: 80,
    y: 40,
    vx: 0,
    vy: 0,
    width: 24,
    height: 500
  };
  advanceStageCompletionProjectile(expiringBeam, 430, 900);
  assert.equal(expiringBeam.life, 0);
  assert.equal(expiringBeam.markedForDeletion, true);

  const leavingMissile = {
    markedForDeletion: false,
    isBeam: false,
    life: 60,
    x: 140,
    y: -108,
    vx: 0,
    vy: -4,
    width: 10,
    height: 20
  };
  assert.equal(shouldClearStageBoundaryEntityType('MISSILE', true), false);
  advanceStageCompletionProjectile(leavingMissile, 430, 900);
  assert.equal(leavingMissile.markedForDeletion, true);
  assert.equal(shouldClearStageBoundaryEntityType('MISSILE', false), true);

  const rewardUpdateStart = engine.indexOf('updateStageRewardCollection()');
  const rewardUpdateEnd = engine.indexOf('continueToNextWave()', rewardUpdateStart);
  const rewardUpdate = engine.slice(rewardUpdateStart, rewardUpdateEnd);
  assert.match(rewardUpdate, /updateStageCompletionProjectiles\(\)/);
  assert.doesNotMatch(rewardUpdate, /checkCollisions\(\)|updateEnemyFire\(\)|spawnEnemies\(\)/);
});

test('companion formation resets deterministically and reforms with the next-stage intro', () => {
  const {
    getSquadCompanionFormationTarget,
    resetSquadCompanionFormation
  } = loadTakeoffPresentation();
  const companions = [
    { slot: 'left', x: -400, y: -900, frameIndex: 5, entryProgress: 1 },
    { slot: 'right', x: 800, y: -700, frameIndex: 3, entryProgress: 1 }
  ];
  const player = { x: 150, y: 980, width: 122, height: 122 };
  resetSquadCompanionFormation(
    companions,
    player.x,
    player.y,
    player.width,
    player.height
  );
  companions.forEach((companion, index) => {
    const expected = getSquadCompanionFormationTarget(
      player.x,
      player.y,
      player.width,
      player.height,
      companion.slot,
      index
    );
    assert.equal(companion.x, expected.x);
    assert.equal(companion.y, expected.y);
    assert.equal(companion.frameIndex, 0);
    assert.equal(companion.entryProgress, 0);
  });
  assert.ok(companions[0].x < player.x + player.width / 2);
  assert.ok(companions[1].x > player.x + player.width / 2);

  const nextStageStart = engine.slice(
    engine.indexOf('startNextWave()'),
    engine.indexOf('resize(width: number, height: number)')
  );
  assert.match(nextStageStart, /if \(stageBoundary\)[\s\S]*?this\.resetSquadCompanionPositions\(\)/);
  assert.match(engine, /updateIntroFlight\(\)[\s\S]*?this\.updateIntroSquadCompanions\(\)/);
});

test('engine takeoff uses the anchored pose and cleans combat debris at the reward boundary', () => {
  const departureStart = engine.indexOf('updateWaveDeparture()');
  const departureEnd = engine.indexOf('startDeathSequence()', departureStart);
  const departure = engine.slice(departureStart, departureEnd);
  const cleanupStart = engine.indexOf('private clearStageBoundaryDebris(');
  const cleanupEnd = engine.indexOf('getPlayerHomePosition()', cleanupStart);
  const cleanup = engine.slice(cleanupStart, cleanupEnd);

  assert.doesNotMatch(departure, /Math\.sin/);
  assert.doesNotMatch(departure, /endY|player\.height \* 1\.2/);
  assert.match(departure, /getStageTakeoffPose\(/);
  assert.match(departure, /this\.playerDrawScale = pose\.scale/);
  assert.match(departure, /this\.playerTilt = 0/);
  assert.match(departure, /this\.playerVel = \{ x: 0, y: 0 \}/);
  assert.match(departure, /this\.updateDepartureSquadCompanions\(takeoff\)/);
  assert.match(departure, /takeoff\.phase === 'launch' && !this\.stageTakeoffBoostCuePlayed[\s\S]*?this\.playSound\('launch'\)/);
  assert.match(engine, /beginStageTakeoff\(\) \{[\s\S]*?this\.clearStageBoundaryDebris\(true\)[\s\S]*?this\.waveDepartureDuration = STAGE_TAKEOFF_FRAMES/);
  assert.match(cleanup, /shouldClearStageBoundaryEntityType\(entity\.type, preserveRewardWindow\)/);
  assert.match(cleanup, /this\.pendingPlayerShots\.length = 0/);
  assert.match(cleanup, /this\.pendingBossStrikes = \[\]/);
  assert.match(cleanup, /this\.pendingEnemyLasers = \[\]/);
  assert.match(cleanup, /this\.playerAfterimages\.length = 0/);
  assert.match(engine, /MOBILE_TAKEOFF_PARTICLE_CAP = 48/);
  assert.match(engine, /DESKTOP_TAKEOFF_PARTICLE_CAP = 80/);
  assert.match(engine, /MOBILE_TAKEOFF_PARTICLES_PER_FRAME = 2/);
  assert.match(engine, /DESKTOP_TAKEOFF_PARTICLES_PER_FRAME = 4/);
});

test('Pixi forces neutral flight, dual bounded thrusters, and scaled companion departure', () => {
  assert.match(renderer, /engine\.waveDepartureFrames > 0[\s\S]*?this\.playerSteeringState = 'neutral'[\s\S]*?motion\.steeringFrames\.neutral/);
  assert.match(renderer, /STAGE_TAKEOFF_THRUSTER_VISUAL_CAP = 3\.2/);
  assert.match(renderer, /const takeoff = engine\.getStageTakeoffPresentation\(\)/);
  assert.match(renderer, /const hardBank = !takeoffActive/);
  assert.match(renderer, /thruster\.visible = !hardBank \|\| index === 0/);
  assert.match(renderer, /Math\.min\(STAGE_TAKEOFF_THRUSTER_VISUAL_CAP, rawSizeBoost\)/);
  assert.match(renderer, /pod\.width = companion\.width \* companion\.scale/);
  assert.match(renderer, /pod\.height = companion\.height \* companion\.scale/);
  assert.match(renderer, /gunPodThrusterSprites = \[new Sprite\(Texture\.WHITE\), new Sprite\(Texture\.WHITE\)\]/);
  const syncGunPods = renderer.slice(
    renderer.indexOf('private syncGunPods(engine: GameEngine)'),
    renderer.indexOf('private syncPlayerThrusters(engine: GameEngine)')
  );
  assert.match(syncGunPods, /thruster\.visible = Boolean\(takeoffActive/);
  assert.doesNotMatch(syncGunPods, /new Sprite|new Container/);
  assert.match(engine, /scale: this\.waveDepartureFrames > 0 \? this\.playerDrawScale : 1/);
});
