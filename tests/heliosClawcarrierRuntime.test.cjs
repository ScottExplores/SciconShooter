const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const sourcePath = path.resolve(
  __dirname,
  '..',
  'services',
  'gameplay',
  'bosses',
  'HeliosClawcarrierRuntime.ts'
);
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
  {
    module: moduleBox,
    exports: moduleBox.exports,
    require,
    Array,
    Math,
    Number,
    Object
  }
);

const {
  buildHeliosReactorFanAngles,
  resolveHeliosClampPlan,
  resolveHeliosCornerClampPlacement,
  resolveHeliosCrossfireAngle,
  resolveHeliosCrossfireSides,
  resolveHeliosMineFormation,
  sampleHeliosCornerClamp,
  sampleHeliosClawSweep,
  sampleHeliosCrossfirePulse,
  sampleHeliosMineLifecycle,
  sampleHeliosReactorFanShot,
  sampleHeliosTrackingPincer
} = moduleBox.exports;

test('Helios rotary fire emits one alternating live-mount pulse per cadence slot', () => {
  const firing = [];
  const samples = [];
  for (let elapsedFrames = 0; elapsedFrames <= 28; elapsedFrames += 1) {
    const sample = sampleHeliosCrossfirePulse({
      elapsedFrames,
      roundsPerSide: 3,
      sides: ['port', 'starboard'],
      intervalFrames: 4
    });
    if (sample) samples.push({ elapsedFrames, ...sample });
    if (sample?.firing) firing.push({ elapsedFrames, ...sample });
  }

  assert.deepEqual(
    firing.map(({ elapsedFrames, shotIndex, side, sideShotIndex }) => ({
      elapsedFrames,
      shotIndex,
      side,
      sideShotIndex
    })),
    [
      { elapsedFrames: 2, shotIndex: 0, side: 'port', sideShotIndex: 0 },
      { elapsedFrames: 6, shotIndex: 1, side: 'starboard', sideShotIndex: 0 },
      { elapsedFrames: 10, shotIndex: 2, side: 'port', sideShotIndex: 1 },
      { elapsedFrames: 14, shotIndex: 3, side: 'starboard', sideShotIndex: 1 },
      { elapsedFrames: 18, shotIndex: 4, side: 'port', sideShotIndex: 2 },
      { elapsedFrames: 22, shotIndex: 5, side: 'starboard', sideShotIndex: 2 }
    ]
  );
  assert.equal(
    new Set(firing.map(({ elapsedFrames }) => elapsedFrames)).size,
    firing.length,
    'rapid fire must never materialize multiple rounds on one simulation frame'
  );
  firing.forEach((sample) => {
    assert.equal(sample.flashEnergy, 1);
    assert.equal(sample.recoilEnergy, 1);
  });
  assert.ok(
    samples.some((sample) => !sample.firing && sample.flashEnergy > 0),
    'the synchronized flash/recoil may decay for one visible frame after each shot'
  );
});

test('Helios reactor fan stays downward, changes deterministic order, and staggers every projectile', () => {
  const minimum = Math.PI / 6;
  const maximum = Math.PI * 5 / 6;
  const ascending = buildHeliosReactorFanAngles({ sequence: 0, projectileCount: 7 });
  const descending = buildHeliosReactorFanAngles({ sequence: 1, projectileCount: 7 });
  const centerOut = buildHeliosReactorFanAngles({ sequence: 2, projectileCount: 7 });

  for (const pattern of [ascending, descending, centerOut]) {
    assert.equal(pattern.length, 7);
    pattern.forEach((angle) => {
      assert.ok(angle >= minimum && angle <= maximum);
      assert.ok(Math.sin(angle) > 0, 'all fan projectiles must travel down-screen');
    });
  }
  assert.deepEqual(Array.from(descending), Array.from(ascending).reverse());
  assert.notDeepEqual(Array.from(centerOut), Array.from(ascending));
  assert.deepEqual(
    buildHeliosReactorFanAngles({ sequence: 2, projectileCount: 7 }),
    centerOut
  );
  const leftBiased = buildHeliosReactorFanAngles({
    sequence: 3,
    projectileCount: 7,
    targetAngleRadians: minimum
  });
  const rightBiased = buildHeliosReactorFanAngles({
    sequence: 3,
    projectileCount: 7,
    targetAngleRadians: maximum
  });
  assert.ok(leftBiased[0] < rightBiased[0]);
  assert.ok(leftBiased.at(-1) < rightBiased.at(-1));

  const emitted = [];
  for (let elapsedFrames = 0; elapsedFrames < 50; elapsedFrames += 1) {
    const sample = sampleHeliosReactorFanShot({
      elapsedFrames,
      sequence: 2,
      projectileCount: 7,
      intervalFrames: 5
    });
    if (sample?.firing) emitted.push({ elapsedFrames, ...sample });
  }
  assert.deepEqual(emitted.map(({ elapsedFrames }) => elapsedFrames), [2, 7, 12, 17, 22, 27, 32]);
  assert.deepEqual(emitted.map(({ angleRadians }) => angleRadians), Array.from(centerOut));
  assert.equal(new Set(emitted.map(({ elapsedFrames }) => elapsedFrames)).size, 7);
});

test('Helios mines use deterministic bounded formations and a visible damage-gated lifecycle', () => {
  const first = resolveHeliosMineFormation({ sequence: 0, count: 4 });
  const repeated = resolveHeliosMineFormation({ sequence: 0, count: 4 });
  const reversed = resolveHeliosMineFormation({ sequence: 1, count: 4 });
  assert.deepEqual(first, repeated);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(Array.from(first, ({ delayFrames }) => delayFrames), [0, 12, 24, 36]);
  assert.deepEqual(
    Array.from(reversed, ({ angleRadians }) => angleRadians),
    Array.from(first, ({ angleRadians }) => angleRadians).reverse()
  );
  [...first, ...reversed].forEach((slot) => {
    assert.ok(slot.angleRadians >= Math.PI / 2 - 0.48);
    assert.ok(slot.angleRadians <= Math.PI / 2 + 0.48);
    assert.ok(slot.speedScale >= 0.9 && slot.speedScale <= 1.06);
  });

  const deploying = sampleHeliosMineLifecycle({
    ageFrames: 12,
    triggerFrame: -1,
    distanceToPlayer: 200
  });
  const armed = sampleHeliosMineLifecycle({
    ageFrames: 60,
    triggerFrame: -1,
    distanceToPlayer: 200
  });
  const proximity = sampleHeliosMineLifecycle({
    ageFrames: 60,
    triggerFrame: -1,
    distanceToPlayer: 60
  });
  const explosionWarmup = sampleHeliosMineLifecycle({
    ageFrames: 102,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  const activeExplosion = sampleHeliosMineLifecycle({
    ageFrames: 109,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  const coolingExplosion = sampleHeliosMineLifecycle({
    ageFrames: 119,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  const expired = sampleHeliosMineLifecycle({
    ageFrames: 142,
    triggerFrame: 100,
    distanceToPlayer: 0
  });

  assert.deepEqual(
    [deploying.stage, armed.stage, proximity.stage, explosionWarmup.stage,
      activeExplosion.stage, coolingExplosion.stage, expired.stage],
    ['deploying', 'armed', 'armed', 'exploding', 'exploding', 'exploding', 'expired']
  );
  assert.equal(deploying.damageActive, false);
  assert.equal(armed.damageActive, false);
  assert.equal(proximity.shouldTrigger, true);
  assert.equal(explosionWarmup.damageActive, false);
  assert.equal(activeExplosion.damageActive, true);
  assert.equal(coolingExplosion.damageActive, false);
  assert.equal(expired.shouldCleanup, true);
});

test('Helios corner clamp resolves surviving anatomy and damages only during visible closure', () => {
  const toPlain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'port', portOperational: true, starboardOperational: true })
  ), { activeSide: 'port', fallbackToCrossfire: false, skipped: false });
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'port', portOperational: false, starboardOperational: true })
  ), { fallbackToCrossfire: false, skipped: true });
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'starboard', portOperational: true, starboardOperational: false })
  ), { fallbackToCrossfire: false, skipped: true });
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'starboard', portOperational: false, starboardOperational: false })
  ), { fallbackToCrossfire: true, skipped: false });

  const warning = sampleHeliosCornerClamp({ stage: 'warning', progress: 0.7, side: 'port' });
  const approach = sampleHeliosCornerClamp({ stage: 'fire', progress: 0.16, side: 'port' });
  const closure = sampleHeliosCornerClamp({ stage: 'fire', progress: 0.42, side: 'port' });
  const release = sampleHeliosCornerClamp({ stage: 'fire', progress: 0.82, side: 'port' });
  assert.equal(warning.damageActive, false);
  assert.equal(warning.trackingActive, true);
  assert.equal(approach.damageActive, false);
  assert.ok(approach.closeEnergy > 0, 'the close must already be visible before damage activates');
  assert.equal(closure.damageActive, true);
  assert.ok(closure.closeEnergy > 0.9, 'damage coincides with the visible closed clamp');
  assert.equal(closure.starboardEnergy, 0);
  assert.equal(release.damageActive, false);
  assert.ok(release.returnProgress > 0);
});

test('Helios corner clamp uses center-aware mobile and desktop tracking lanes', () => {
  const mobileBoss = { width: 297, height: 213 };
  const mobilePort = resolveHeliosCornerClampPlacement({
    side: 'port',
    viewportWidth: 390,
    viewportHeight: 844,
    bossWidth: mobileBoss.width,
    bossHeight: mobileBoss.height,
    mobileProfile: true
  });
  const mobileStarboard = resolveHeliosCornerClampPlacement({
    side: 'starboard',
    viewportWidth: 390,
    viewportHeight: 844,
    bossWidth: mobileBoss.width,
    bossHeight: mobileBoss.height,
    mobileProfile: true
  });

  assert.equal(mobilePort.visualPadding, 44);
  assert.equal(mobilePort.cornerX, 44);
  assert.equal(mobileStarboard.cornerX, 49);
  assert.ok(mobilePort.trackingMinX <= mobilePort.trackingMaxX);
  assert.ok(mobileStarboard.trackingMinX <= mobileStarboard.trackingMaxX);
  assert.ok(mobilePort.trackingMaxX + mobileBoss.width / 2 <= 390 / 2);
  assert.ok(mobileStarboard.trackingMinX + mobileBoss.width / 2 >= 390 / 2);
  assert.ok(mobileStarboard.trackingMaxX + mobileBoss.width <= 390 - 44);

  const desktopStarboard = resolveHeliosCornerClampPlacement({
    side: 'starboard',
    viewportWidth: 1280,
    viewportHeight: 720,
    bossWidth: mobileBoss.width,
    bossHeight: mobileBoss.height,
    mobileProfile: false
  });
  assert.equal(desktopStarboard.visualPadding, 56);
  assert.equal(desktopStarboard.cornerX, 927);
  assert.ok(desktopStarboard.trackingMinX >= 1280 / 2 - mobileBoss.width / 2);
  assert.ok(desktopStarboard.trackingMaxX + mobileBoss.width <= 1280 - 56);
});

test('Helios claw sweeps damage only during the visible middle of the selected strike', () => {
  const preparation = sampleHeliosClawSweep({ progress: 0.2, side: 'port' });
  const strike = sampleHeliosClawSweep({ progress: 0.5, side: 'port' });
  const recovery = sampleHeliosClawSweep({ progress: 0.8, side: 'port' });
  const pairedStrike = sampleHeliosClawSweep({ progress: 0.5 });

  assert.equal(preparation.damageActive, false);
  assert.ok(preparation.portEnergy > 0);
  assert.equal(preparation.starboardEnergy, 0);
  assert.equal(strike.damageActive, true);
  assert.ok(strike.portEnergy > preparation.portEnergy);
  assert.equal(strike.starboardEnergy, 0);
  assert.equal(recovery.damageActive, false);
  assert.ok(recovery.portEnergy > 0, 'the claw remains visibly extended during safe recovery');
  assert.equal(pairedStrike.damageActive, true);
  assert.ok(pairedStrike.portEnergy > 0);
  assert.equal(pairedStrike.portEnergy, pairedStrike.starboardEnergy);
});

test('Helios tracking pincer exposes four deterministic stages and one bounded close window', () => {
  const rise = sampleHeliosTrackingPincer({ sequence: 0, progress: 0.8 });
  const tracking = sampleHeliosTrackingPincer({ sequence: 1, progress: 0.5 });
  const locked = sampleHeliosTrackingPincer({ sequence: 1, progress: 0.8 });
  const diveBeforeClose = sampleHeliosTrackingPincer({ sequence: 2, progress: 0.5 });
  const diveClose = sampleHeliosTrackingPincer({ sequence: 2, progress: 0.7 });
  const hold = sampleHeliosTrackingPincer({ sequence: 3, progress: 0.2 });
  const returnPose = sampleHeliosTrackingPincer({ sequence: 3, progress: 0.8 });

  assert.equal(rise.stage, 'rise-open');
  assert.equal(rise.damageActive, false);
  assert.equal(tracking.stage, 'track-lock');
  assert.equal(tracking.trackingActive, true);
  assert.equal(tracking.lockActive, false);
  assert.equal(locked.trackingActive, false);
  assert.equal(locked.lockActive, true);
  assert.equal(diveBeforeClose.stage, 'dive-close');
  assert.equal(diveBeforeClose.damageActive, false);
  assert.equal(diveClose.damageActive, true);
  assert.ok(diveClose.closeEnergy > diveBeforeClose.closeEnergy);
  assert.equal(hold.stage, 'hold-release-return');
  assert.equal(hold.damageActive, true);
  assert.equal(returnPose.damageActive, false);
  assert.ok(returnPose.returnProgress > 0.5);
});

test('Helios cannon branches remain bounded, frozen, and repeatable', () => {
  const port = resolveHeliosCrossfireSides('port');
  const coordinated = resolveHeliosCrossfireSides(undefined);

  assert.deepEqual(Array.from(port), ['port']);
  assert.deepEqual(Array.from(coordinated), ['port', 'starboard']);
  assert.equal(Object.isFrozen(port), true);
  assert.equal(Object.isFrozen(coordinated), true);
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});

test('Helios fixed crossfire lanes are mirrored around vertical and widen together', () => {
  const vertical = Math.PI / 2;
  const portSingle = resolveHeliosCrossfireAngle('port', false);
  const starboardSingle = resolveHeliosCrossfireAngle('starboard', false);
  const portCoordinated = resolveHeliosCrossfireAngle('port', true);
  const starboardCoordinated = resolveHeliosCrossfireAngle('starboard', true);
  const epsilon = 1e-12;

  assert.ok(portSingle > vertical);
  assert.ok(starboardSingle < vertical);
  assert.ok(Math.abs((portSingle - vertical) - 0.08) < epsilon);
  assert.ok(Math.abs((vertical - starboardSingle) - 0.08) < epsilon);
  assert.ok(Math.abs((portSingle - vertical) - (vertical - starboardSingle)) < epsilon);

  assert.ok(portCoordinated > portSingle);
  assert.ok(starboardCoordinated < starboardSingle);
  assert.ok(Math.abs((portCoordinated - vertical) - 0.3) < epsilon);
  assert.ok(Math.abs((vertical - starboardCoordinated) - 0.3) < epsilon);
  assert.ok(
    Math.abs((portCoordinated - vertical) - (vertical - starboardCoordinated)) < epsilon
  );
});
