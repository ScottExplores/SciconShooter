const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const load = (entry) => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const mod = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
};
const flight = load('services/gameplay/formations/FormationFlight.ts');
const formations = load('services/gameplay/formations/FormationRuntime.ts');
const presentation = load('services/pixi/FormationEnemyPresentation.ts');
global.Image = class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const { GameEngine, Entity } = load('services/gameLogic.ts');
const lab = load('services/combatLab.ts');

test('attack verbs produce different, constant-speed committed routes on mobile widths', () => {
  for (const width of [320, 390, 440]) {
    const mids = [];
    for (const attack of ['paired-dive', 'pincer-pass', 'sweep-strafe', 'lane-pass', 'leader-escorts', 'ring-collapse']) {
      const input = { start: { x: 65, y: 130 }, target: { x: width * .65, y: 540 }, width, height: 700, hullHeight: 32, index: 0, cycle: 0, attack, speed: 4.5 };
      const route = flight.createFormationAttackFlight(input);
      assert.deepEqual(flight.sampleFormationFlight(route, 0), input.start);
      const mid = flight.sampleFormationFlight(route, route.duration / 2);
      mids.push(`${mid.x.toFixed(2)},${mid.y.toFixed(2)}`);
      input.target.x = 0; // A later dodge cannot bend the baked trajectory.
      assert.deepEqual(flight.sampleFormationFlight(route, route.duration / 2), mid);
      let previous = input.start;
      for (let age = 1; age <= Math.ceil(route.duration); age++) {
        const point = flight.sampleFormationFlight(route, age);
        assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) <= 4.501);
        assert.ok(Number.isFinite(point.x + point.y));
        previous = point;
      }
      assert.ok(previous.y > 700 + 32);
    }
    assert.equal(new Set(mids).size, mids.length);
  }
});

test('return starts at the real exit, rounds a visible flank, and lands exactly without a jump', () => {
  const start = { x: 230, y: 748 };
  const target = { x: 130, y: 180 };
  const route = flight.createFormationReturnFlight({ start, target, width: 390, height: 700, hullWidth: 32, speed: 5 });
  assert.deepEqual(flight.sampleFormationFlight(route, 0), start);
  assert.deepEqual(flight.sampleFormationFlight(route, route.duration), target);
  let previous = start;
  let visibleFlank = false;
  for (let age = 1; age <= Math.ceil(route.duration); age++) {
    const point = flight.sampleFormationFlight(route, age);
    if (point.x > 315 && point.y < 550 && point.y > 250) visibleFlank = true;
    assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) <= 5.001);
    previous = point;
  }
  assert.ok(visibleFlank);
});

test('flight heading makes full turns without wraparound spins or renderer bank clipping', () => {
  let heading = Math.PI - .01;
  const next = flight.followFormationHeading(heading, .01, 4, true);
  assert.ok(Math.abs(next - heading) < .03);
  for (let i = 0; i < 80; i++) heading = flight.followFormationHeading(heading, -4, 0, true);
  assert.ok(Math.abs(Math.sin(heading + Math.PI / 2)) < .001);
  assert.equal(presentation.sampleFormationEnemyPresentation({ flightHeading: heading, formationState: 'entry', currentFrame: 80 }).bankRadians, heading);
  for (let i = 0; i < 80; i++) heading = flight.followFormationHeading(heading, 0, 0, false);
  assert.ok(Math.abs(Math.sin(heading)) < .001);
});

test('returning stragglers reappear promptly and approach their slot nose-up', () => {
  for (const width of [320, 390, 1280]) {
    for (const x of [20, width / 2, width - 50]) {
      const target = { x: width / 2, y: 140 };
      const route = flight.createFormationReturnFlight({ start: { x, y: 752 }, target, width, height: 700, hullWidth: 32, speed: 4.5 });
      let firstVisible = 0;
      for (let age = 1; age <= 60; age++) {
        const point = flight.sampleFormationFlight(route, age);
        if (point.y < 700 && point.x + 32 > 0 && point.x < width) { firstVisible = age; break; }
      }
      assert.ok(firstVisible > 0 && firstVisible < 45);
      assert.ok(flight.sampleFormationFlight(route, route.duration - 1).y > target.y);
    }
  }
});

test('train members follow the same procession at the same age before their individual slot glides', () => {
  for (const entryPath of ['loop-the-loop', 'serpentine-weave']) {
    const common = { mode: 'v', count: 8, groupSeed: 2, viewport: { width: 390, height: 700 }, entityWidth: 32, entityHeight: 32,
      start: { x: -70, y: entryPath === 'loop-the-loop' ? 434 : 49 }, entryDirection: 'left', entryPath };
    for (const age of [20, 40, 60]) {
      const samples = [0, 1, 6].map(index => {
        const input = { ...common, index, target: { x: 40 + index * 38, y: 100 + index * 10 }, progress: 0 };
        input.progress = age / formations.resolveFormationTrainDuration(input);
        return formations.resolveFormationCohortEntryPose(input);
      });
      for (const point of samples.slice(1)) assert.ok(Math.hypot(point.x - samples[0].x, point.y - samples[0].y) < .001);
    }
  }
});

test('real engine executes dive → continuous return → hold without teleporting or changing collision size', () => {
  const engine = new GameEngine(lab.createCombatLabStats(), { campaign: lab.createCombatLabCampaign(), previewMode: true, audioEnabled: false, preloadCanvasAssets: false });
  engine.init(390, 700);
  const enemy = new Entity('ENEMY_DRONE', 80, 140, .5);
  enemy.width = 32; enemy.height = 32;
  enemy.formation = 'v'; enemy.formationState = 'hold'; enemy.formationTargetX = 80; enemy.formationTargetY = 140;
  enemy.formationGroupReady = true; enemy.formationBaseSpeed = 3; enemy.encounterGroupSize = 8;
  enemy.formationChoreography = formations.resolveFormationChoreography({ patternId: 'v', formationBehavior: { attackId: 'pincer-pass' } });
  engine.beginConfiguredFormationAttack(enemy, 0);
  const lockedPath = enemy.formationFlight;
  engine.player.x = 10;
  let returned = false;
  let settled = false;
  for (let frame = 1; frame <= 650; frame++) {
    engine.frameCount = frame;
    const before = { x: enemy.x, y: enemy.y };
    engine.updateConfiguredEnemyFormation(enemy);
    if (enemy.formationState === 'dive') { enemy.x += enemy.vx; enemy.y += enemy.vy; assert.equal(enemy.formationFlight, lockedPath); }
    if (enemy.formationState === 'return') returned = true;
    assert.ok(Math.hypot(enemy.x - before.x, enemy.y - before.y) <= 7.1, `no transition jump at ${frame}`);
    assert.equal(enemy.width, 32); assert.equal(enemy.height, 32);
    if (returned && enemy.formationState === 'hold') { settled = true; break; }
  }
  assert.ok(returned && settled);
  assert.equal(enemy.x, 80); assert.equal(enemy.y, 140);
});

test('live showcase schedules both entry gates, armed groups, and complete attack/return cycles', () => {
  const campaign = lab.createCombatLabCampaign();
  const engine = new GameEngine(lab.createCombatLabStats(), { campaign, previewMode: true, previewInvincible: true,
    audioEnabled: false, preloadCanvasAssets: false, randomSeed: 'squad-flight-proof' });
  engine.init(390, 700);
  const seen = new Set();
  const births = new Map();
  let projectileSeen = false;
  let returnedThenHeld = false;
  const returning = new Set();
  const positions = new Map();
  let hitStopTested = false;
  for (let frame = 0; frame < 1800; frame++) {
    if (!hitStopTested && engine.entities.some(enemy => enemy.formationState === 'dive' && enemy.formationFlight)) {
      engine.hitStopFrames = 12;
      hitStopTested = true;
    }
    engine.update();
    for (const enemy of engine.entities) {
      if (enemy.type === 'PROJECTILE' && !enemy.isPlayerShot) projectileSeen = true;
      if (!enemy.formationState || enemy.markedForDeletion) continue;
      seen.add(enemy.formationState);
      if (!births.has(enemy.id)) births.set(enemy.id, { event: enemy.sourceEventId, frame: engine.frameCount, x: enemy.x });
      if (enemy.formationState === 'return') returning.add(enemy.id);
      if (enemy.formationState === 'hold' && returning.has(enemy.id)) returnedThenHeld = true;
      const previous = positions.get(enemy.id);
      if (previous && enemy.formationFlight) {
        assert.ok(Math.hypot(enemy.x - previous.x, enemy.y - previous.y) < 8, `live flight must integrate once (${enemy.formationState})`);
      }
      positions.set(enemy.id, { x: enemy.x, y: enemy.y });
    }
    if (returnedThenHeld && projectileSeen && births.size === 20) break;
  }
  assert.deepEqual([...seen].sort(), ['dive', 'entry', 'hold', 'return']);
  assert.ok(projectileSeen, 'showcase must include real enemy fire');
  assert.ok(returnedThenHeld, 'a survivor completes the full visible loop');
  assert.ok(hitStopTested, 'paused flight clocks are covered');
  assert.equal(births.size, 20, 'role caps must not strand the second squad outside the encounter');
  const ribbon = [...births.values()].filter(item => item.event.endsWith('-lab-ribbon'));
  assert.equal(new Set(ribbon.map(item => item.frame)).size, 12, 'one hull per ribbon beat, no stacked pairs');
  const echo = [...births.values()].filter(item => item.event.endsWith('-lab-echo'));
  assert.ok(echo.some(item => item.x < 0) && echo.some(item => item.x > 390), 'flank squad uses both gates');
});
