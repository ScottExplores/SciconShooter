import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const runtime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/SingularityCommanderRuntime.ts'
);

test('Singularity exposes six stable identities across its phase-gated puzzle vocabulary', () => {
  assert.deepEqual(runtime.SINGULARITY_ACTION_IDS, [
    'gravity-well-genesis',
    'event-horizon-gaze',
    'tidal-claw-pincer',
    'orbital-pylon-barrage',
    'singularity-pulse',
    'gravity-collapse'
  ]);
  assert.deepEqual(
    runtime.getSingularityAvailableActions('gravitational-calibration'),
    ['gravity-well-genesis', 'event-horizon-gaze', 'orbital-pylon-barrage']
  );
  assert.equal(
    runtime.getSingularityAvailableActions('spatial-compression').includes('gravity-collapse'),
    false
  );
  assert.equal(
    runtime.getSingularityAvailableActions('event-horizon-instability').length,
    6
  );
  assert.equal(runtime.resolveSingularityPhase(0.7001).index, 1);
  assert.equal(runtime.resolveSingularityPhase(0.7).index, 2);
  assert.equal(runtime.resolveSingularityPhase(0.35).index, 3);
});
test('seeded attack order is deterministic and never immediately repeats its predecessor', () => {
  const request = {
    phase: 'event-horizon-instability',
    seedKey: 'singularity-reach-mobile-proof',
    cycleIndex: 4,
    previousActionId: 'event-horizon-gaze'
  };
  const first = runtime.buildSingularityAttackOrder(request);
  const repeated = runtime.buildSingularityAttackOrder(request);
  assert.deepEqual(first, repeated);
  assert.equal(first.length, 6);
  assert.notEqual(first[0], request.previousActionId);
  assert.equal(new Set(first).size, first.length);
});

test('each action has preparation, readable telegraph, damage, recovery, and cleanup', () => {
  for (const phaseIndex of [1, 2, 3]) {
    for (const actionId of runtime.getSingularityAvailableActions(phaseIndex)) {
      const durations = runtime.resolveSingularityStageDurations(actionId, phaseIndex);
      assert.ok(durations.preparationFrames >= 24);
      assert.ok(durations.telegraphFrames >= (phaseIndex === 1 ? 48 : phaseIndex === 2 ? 42 : 36));
      assert.ok(durations.recoveryFrames >= (actionId === 'gravity-collapse' ? 90 : 48));

      const warning = runtime.sampleSingularityActionStage({
        actionId,
        phaseIndex,
        elapsedFrames: durations.preparationFrames
      });
      const firing = runtime.sampleSingularityActionStage({
        actionId,
        phaseIndex,
        elapsedFrames: durations.preparationFrames + durations.telegraphFrames
      });
      const complete = runtime.sampleSingularityActionStage({
        actionId,
        phaseIndex,
        elapsedFrames: warning.totalFrames
      });
      assert.equal(warning.stage, 'telegraph');
      assert.equal(warning.damageWindowActive, false);
      assert.equal(firing.stage, 'fire');
      assert.equal(firing.damageWindowActive, true);
      assert.equal(complete.stage, 'complete');
      assert.equal(complete.shouldCleanupOwnedArtifacts, true);
    }
  }
});

test('authored hover remains bounded and never mirrors the player', () => {
  const samples = Array.from({ length: 900 }, (_, frameCount) => (
    runtime.sampleSingularityAnchorMovement({
      frameCount,
      arenaWidth: 390,
      arenaHeight: 844,
      bossWidth: 210,
      bossHeight: 180,
      phaseIndex: 3
    })
  ));
  assert.ok(samples.every((sample) => sample.x >= 8 && sample.x <= 172));
  assert.ok(samples.every((sample) => sample.y >= 66 && sample.y <= 320.72));
  assert.ok(samples.some((sample) => Math.abs(sample.bankRadians) > 0.02));
  assert.ok(samples.every((sample) => sample.instabilityEnergy >= 0.1));
});

test('gravity wells use a visible lifecycle and stay out of the phone spawn-protection zone', () => {
  const playerCenter = { x: 195, y: 760 };
  const plans = runtime.buildSingularityGravityWellPlan({
    seedKey: 'singularity-wells-proof',
    phaseIndex: 3,
    executionIndex: 2,
    arenaWidth: 390,
    arenaHeight: 844,
    playerCenter
  });
  assert.equal(plans.length, 3);
  assert.ok(plans.every((well) => well.y < 844 * 0.72));
  assert.ok(plans.every((well) => Math.hypot(well.x - playerCenter.x, well.y - playerCenter.y) >= 72));

  const plan = plans[0];
  const seed = runtime.sampleSingularityWellLifecycle(plan, plan.seedDelayFrames);
  const forming = runtime.sampleSingularityWellLifecycle(
    plan,
    plan.seedDelayFrames + plan.seedTravelFrames
  );
  const active = runtime.sampleSingularityWellLifecycle(
    plan,
    plan.seedDelayFrames + plan.seedTravelFrames + plan.formingFrames + plan.inactiveFrames
  );
  const expired = runtime.sampleSingularityWellLifecycle(plan, 9_999);
  assert.equal(seed.stage, 'seed-travel');
  assert.equal(seed.visible, true);
  assert.equal(seed.damageActive, false);
  assert.equal(forming.stage, 'forming');
  assert.equal(forming.damageActive, false);
  assert.equal(active.stage, 'active');
  assert.equal(active.damageActive, true);
  assert.equal(expired.shouldCleanup, true);
});

test('Event Horizon Gaze tracks, locks for at least 24 frames, and only then damages', () => {
  const plan = runtime.resolveSingularityBeamPlan({
    phaseIndex: 3,
    seedKey: 'singularity-beam-proof-variant-2',
    executionIndex: 2,
    arenaWidth: 390
  });
  assert.ok(plan.beamCount <= 2);
  assert.ok(plan.warningFrames - plan.lockFrame >= 24);
  assert.ok(plan.safeLanePixels >= 72);

  const tracking = runtime.sampleSingularityBeam({
    plan,
    elapsedFrames: plan.lockFrame - 1,
    trackedAngleRadians: 1.1,
    lockedAngleRadians: 1.35
  });
  const locked = runtime.sampleSingularityBeam({
    plan,
    elapsedFrames: plan.lockFrame,
    trackedAngleRadians: 0.4,
    lockedAngleRadians: 1.35
  });
  const firing = runtime.sampleSingularityBeam({
    plan,
    elapsedFrames: plan.warningFrames,
    trackedAngleRadians: 0.1,
    lockedAngleRadians: 1.35
  });
  assert.equal(tracking.stage, 'tracking');
  assert.equal(tracking.damageActive, false);
  assert.equal(locked.stage, 'locked');
  assert.equal(locked.aimAngleRadians, 1.35);
  assert.equal(locked.damageActive, false);
  assert.equal(firing.stage, 'firing');
  assert.equal(firing.damageActive, true);
});

test('pincer always preserves a mobile route and collision follows only the active sweep', () => {
  const plan = runtime.resolveSingularityPincerPlan({
    phaseIndex: 3,
    seedKey: 'singularity-pincer-proof',
    executionIndex: 3,
    arenaWidth: 390
  });
  assert.ok(plan.centerRoutePixels >= 78);
  const warning = runtime.sampleSingularityPincer(plan, 24);
  const active = runtime.sampleSingularityPincer(plan, 24 + plan.warningFrames + 2);
  const complete = runtime.sampleSingularityPincer(plan, 9_999);
  assert.equal(warning.stage, 'warning');
  assert.equal(warning.damageActive, false);
  assert.equal(active.stage, 'sweep');
  assert.equal(active.damageActive, true);
  assert.equal(complete.shouldCleanup, true);
});

test('pylon shots remain socket-owned, sequential, and under the projectile budget', () => {
  for (const phaseIndex of [1, 2, 3]) {
    const plan = runtime.buildSingularityPylonShotPlan({
      phaseIndex,
      seedKey: 'singularity-pylon-proof',
      executionIndex: 1
    });
    assert.ok(plan.length <= runtime.SINGULARITY_RUNTIME_LIMITS.maximumOwnedProjectiles);
    assert.ok(plan.every((shot, index) => (
      runtime.SINGULARITY_PYLON_SOCKET_IDS.includes(shot.socketId)
      && (index === 0 || shot.fireFrame > plan[index - 1].fireFrame)
    )));
  }
});

test('pulse exposes two deterministic gaps and uses a capped gravity influence', () => {
  const first = runtime.resolveSingularityPulsePlan({
    phaseIndex: 3,
    seedKey: 'singularity-pulse-proof',
    executionIndex: 8,
    arenaWidth: 390
  });
  const repeated = runtime.resolveSingularityPulsePlan({
    phaseIndex: 3,
    seedKey: 'singularity-pulse-proof',
    executionIndex: 8,
    arenaWidth: 390
  });
  assert.deepEqual(first, repeated);
  assert.equal(first.gapAnglesRadians.length, 2);
  assert.ok(first.minimumGapPixels >= 56);
  assert.ok(first.projectileCount <= 24);
  assert.ok(first.pullStrength <= 0.11);
});

test('Gravity Collapse activates three wells but never damages through two implosions at once', () => {
  const plan = runtime.buildSingularityCollapsePlan({
    seedKey: 'singularity-collapse-proof',
    executionIndex: 1,
    arenaWidth: 390,
    arenaHeight: 844,
    playerCenter: { x: 195, y: 760 }
  });
  assert.equal(plan.wells.length, 3);
  assert.ok(plan.recoveryFrames >= 90);
  for (let frame = 0; frame <= plan.totalFrames; frame += 1) {
    const damaging = plan.beats.filter((beat) => (
      frame >= beat.implosionFrame && frame < beat.endFrame
    ));
    assert.ok(damaging.length <= 1);
    const index = runtime.getSingularityCollapseDamagingWellIndex(plan, frame);
    assert.equal(index, damaging[0]?.wellIndex ?? null);
  }
});

test('defeat gates rewards until the complete multi-step collapse', () => {
  const stages = [0, 42, 84, 138, 186].map(runtime.sampleSingularityDefeat);
  assert.deepEqual(stages.map((sample) => sample.stage), [
    'pylons-failing',
    'claws-limp',
    'core-compression',
    'final-collapse',
    'complete'
  ]);
  assert.ok(stages.slice(0, -1).every((sample) => !sample.rewardReady));
  assert.equal(stages.at(-1).rewardReady, true);
  assert.ok(stages.every((sample) => !sample.collisionActive && !sample.attacksActive));
});
