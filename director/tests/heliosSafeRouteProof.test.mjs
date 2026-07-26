import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(
  path.join(repositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));

globalThis.Image ??= class ImageStub {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = 'anonymous';
  src = '';
};
globalThis.document ??= {
  hidden: false,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window ??= {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener() {},
  removeEventListener() {},
  setInterval,
  clearInterval,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const { buildSandboxBossPrototypePreview } = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const { createSandboxOnlyBossArtwork } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);
const {
  resolveHeliosMineFormation,
  resolveHeliosCrossfireSides,
  sampleHeliosCornerClamp,
  sampleHeliosCrossfirePulse,
  sampleHeliosMineLifecycle,
  sampleHeliosReactorFanShot,
  sampleHeliosTrackingPincer
} = await vite.ssrLoadModule('/services/gameplay/bosses/HeliosClawcarrierRuntime.ts');
const {
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
  MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
  proveBossAttackSafeRoute
} = await vite.ssrLoadModule('/services/gameplay/bosses/BossSafeRouteProof.ts');

const preview = buildSandboxBossPrototypePreview(campaign, 'helios-clawcarrier');
assert.equal(preview.sandboxPrototype.prototypeId, 'helios-clawcarrier');
assert.equal(preview.sandboxPrototype.source, 'director-sandbox-prototype');
const artwork = createSandboxOnlyBossArtwork(preview);
const bossEvent = preview.previewWave.events.find((event) => event.kind === 'boss');
assert.ok(bossEvent?.timeline);
assert.ok(artwork.modularRig);
assert.equal(typeof artwork.sampleModularPose, 'function');

const poseSampler = createModularBossWeaponSocketPoseSampler(
  artwork.modularRig,
  artwork.sampleModularPose
);
const attackIds = [
  'twin-rotary-crossfire',
  'claw-sweep-pincer',
  'reactor-maze',
  'clawcarrier-crush'
];
const attacks = attackIds.map((attackId) => {
  const attack = bossEvent.timeline.attacks.find((candidate) => candidate.id === attackId);
  assert.ok(attack, `Helios V2 must compile ${attackId}`);
  return attack;
});

const createStats = () => ({
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
  lives: 3,
  repairsCount: 0,
  upgrades: { fireRate: 0, speed: 0, missile: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const toFrame = (seconds) => Math.max(
  1,
  Math.round(Math.max(0, Number(seconds) || 0) * 60)
);
const repeatCount = (clip) => Math.max(1, Math.floor(clip.repeat?.count ?? 1));
const executionFrame = (clip, executionIndex) => (
  toFrame(clip.startSeconds)
  + (clip.repeat ? executionIndex * toFrame(clip.repeat.intervalSeconds) : 0)
);
const copyPoint = ({ x, y }) => ({ x: Number(x), y: Number(y) });
const copyPoints = (points) => points.map(copyPoint);
const pointMatches = (left, right, epsilon = 0.0001) => (
  Math.abs(left.x - right.x) <= epsilon
  && Math.abs(left.y - right.y) <= epsilon
);
const entityCenter = (entity) => ({
  x: entity.x + entity.width / 2,
  y: entity.y + entity.height / 2
});

const buildAttackBeats = (attack, phaseId) => {
  const variant = attack.variants.find((candidate) => candidate.phaseId === phaseId);
  assert.ok(variant, `${attack.id} must define ${phaseId}`);
  const recovery = bossEvent.timeline.clips.find((candidate) => (
    candidate.id === variant.recoveryClipId
    && candidate.phaseId === phaseId
    && candidate.primitiveId === 'effect-cue'
  ));
  assert.ok(recovery, `${attack.id}/${phaseId} must own a recovery clip`);
  assert.ok(recovery.durationSeconds >= 0.8, `${attack.id}/${phaseId} recovery must be readable`);

  return variant.beatClipIds.flatMap((clipId) => {
    const clip = bossEvent.timeline.clips.find((candidate) => (
      candidate.id === clipId && candidate.phaseId === phaseId
    ));
    const warning = bossEvent.timeline.clips.find((candidate) => (
      candidate.id === clip?.telegraphClipId && candidate.phaseId === phaseId
    ));
    assert.ok(clip, `${clipId} must resolve to a damaging clip`);
    assert.ok(warning, `${clipId} must own a warning clip`);
    assert.equal(repeatCount(warning), repeatCount(clip));
    return Array.from({ length: repeatCount(clip) }, (_, executionIndex) => {
      const warningFrame = executionFrame(warning, executionIndex);
      const fireFrame = executionFrame(clip, executionIndex);
      assert.ok(warningFrame < fireFrame, `${clipId}:${executionIndex} warning must precede damage`);
      return {
        key: `${clip.id}:${executionIndex}`,
        clip,
        warning,
        executionIndex,
        warningFrame,
        fireFrame,
        endFrame: fireFrame + toFrame(clip.durationSeconds)
      };
    });
  });
};

const getNewDamagingBossEntities = (engine, bossId, previousIds) => engine.entities.filter(
  (entity) => (
    !previousIds.has(entity.id)
    && entity.bossOwnerId === bossId
    && !entity.isTelegraph
    && Number(entity.damage) > 0
  )
);

const assertNoGenericHeliosGuides = (spawned, context) => {
  const forbidden = spawned.filter((entity) => (
    entity.isBossGapGuide
    || entity.isBossSideBarrageGuide
    || entity.effectType === 'text'
  ));
  assert.deepEqual(
    forbidden.map((entity) => ({
      gapGuide: entity.isBossGapGuide,
      barrageGuide: entity.isBossSideBarrageGuide,
      effectType: entity.effectType
    })),
    [],
    `${context} must communicate through animated anatomy, not generic guide entities or text`
  );
};

const resolveMeleeSample = (action, progress) => (
  action.primitiveId === 'articulated-melee-sweep'
    ? sampleHeliosCornerClamp({ stage: 'fire', progress, side: action.side ?? 'port' })
    : sampleHeliosTrackingPincer({ sequence: action.sequence, progress })
);

const captureExactAttackPose = (viewport, attack, phaseId) => {
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: 'helios-v2-safe-route-proof',
    previewBossCollisionEventId: preview.eventId,
    previewBossWeaponSockets: artwork.weaponSockets,
    previewBossWeaponSocketPoseSampler: poseSampler,
    previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
    previewBossReducedMotion: false,
    previewBossWeaponSocketEventId: preview.eventId,
    previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
  });
  engine.init(viewport.width, viewport.height);
  assert.equal(
    engine.triggerAuthoredBossAttack(attack.id, preview.eventId, phaseId),
    true
  );
  const boss = engine.bossRef;
  assert.ok(boss);
  const combatAnchorY = Math.max(72, Math.min(viewport.height * 0.13, 116));
  for (let frame = 0; boss.y < combatAnchorY && frame < 240; frame += 1) {
    engine.frameCount += 1;
    engine.updateBoss(boss);
  }
  assert.ok(boss.y >= combatAnchorY, 'Helios must settle into the arena before an isolated attack starts');
  assert.equal(
    engine.triggerAuthoredBossAttack(attack.id, preview.eventId, phaseId),
    true
  );
  // The sandbox event is represented by a mini-boss entity, whose phase-jump
  // anchor is slightly above the timeline boss's combat anchor on tall mobile
  // viewports. Pin the isolated proof at the same settled combat boundary so
  // updateConfiguredBossTimeline does not intentionally restart the phase clock.
  boss.y = Math.max(boss.y, combatAnchorY);

  const fallbackCore = engine.getPreviewBossWeaponOrigins(boss, ['core'])[0];
  const fallbackPort = engine.getPreviewBossWeaponOrigins(boss, ['port']);
  const fallbackStarboard = engine.getPreviewBossWeaponOrigins(boss, ['starboard']);
  assert.ok(fallbackCore);
  assert.ok(fallbackPort.length > 0);
  assert.ok(fallbackStarboard.length > 0);

  const beats = buildAttackBeats(attack, phaseId);
  const beatByAction = new Map(beats.map((beat) => (
    [`${beat.clip.id}:${beat.executionIndex}`, beat]
  )));
  const beatOrigins = {};
  const warningEvidence = {};
  const fireEvidence = {};
  const meleeEvidence = {};
  const pincerLocks = {};
  const mineEntities = {};
  const mineLifecycleEvidence = {};
  const phaseIndex = Math.max(
    1,
    bossEvent.phases.findIndex((phase) => phase.id === phaseId) + 1
  );
  const lastFrame = Math.max(...beats.map((beat) => beat.endFrame));

  while (boss.attackTimer <= lastFrame) {
    const previousAttackTimer = boss.attackTimer;
    const preUpdateOrigins = {
      port: engine.getPreviewBossWeaponOrigins(boss, ['port'])[0],
      starboard: engine.getPreviewBossWeaponOrigins(boss, ['starboard'])[0],
      core: engine.getPreviewBossWeaponOrigins(boss, ['core'])[0]
    };
    const previousIds = new Set(engine.entities.map((entity) => entity.id));
    engine.frameCount += 1;
    engine.updateBoss(boss);
    const frame = boss.attackTimer;
    assert.ok(
      frame >= previousAttackTimer,
      `${attack.id}/${phaseId}/${viewport.id} phase clock reset from ${previousAttackTimer} to ${frame}; bossY=${boss.y}, combatAnchorY=${combatAnchorY}, type=${boss.type}`
    );
    const spawned = engine.entities.filter((entity) => !previousIds.has(entity.id));
    const damaging = getNewDamagingBossEntities(engine, boss.id, previousIds);
    assertNoGenericHeliosGuides(spawned, `${attack.id}/${phaseId}/${viewport.id}/frame-${frame}`);

    for (const beat of beats) {
      if (frame === beat.warningFrame) {
        const primitiveId = beat.clip.primitiveId;
        if (primitiveId === 'paired-cannon-burst') {
          const sides = [...resolveHeliosCrossfireSides(beat.clip.parameters?.side)];
          const staleLock = boss.bossAttackOriginLocks.find((candidate) => (
            candidate.clipId === beat.clip.id
            && candidate.executionIndex === beat.executionIndex
          ));
          assert.equal(staleLock, undefined, `${beat.key} must not retain stale warning-time muzzle origins`);
          const sockets = Object.fromEntries(sides.map((side) => [side, []]));
          beatOrigins[beat.key] = { sockets };
          const target = {
            x: Number(boss.bossTimelineTargetX),
            y: Number(boss.bossTimelineTargetY)
          };
          assert.equal(Number.isFinite(target.x) && Number.isFinite(target.y), true);
          warningEvidence[beat.key] = {
            primitiveId,
            sides,
            target,
            anatomyOnly: true
          };
        } else if (primitiveId === 'reactor-aperture-pattern') {
          const core = engine.getPreviewBossWeaponOrigins(boss, ['core'])[0];
          assert.ok(core, `${beat.key} must expose its live reactor core`);
          const targetLock = {
            x: Number(boss.bossTimelineTargetX),
            y: Number(boss.bossTimelineTargetY)
          };
          assert.equal(Number.isFinite(targetLock.x) && Number.isFinite(targetLock.y), true);
          beatOrigins[beat.key] = {
            core: copyPoint(core),
            coreSamples: [],
            targetLock
          };
          warningEvidence[beat.key] = {
            primitiveId,
            motionCue: beat.clip.parameters?.motionCue,
            core: copyPoint(core),
            targetLock,
            anatomyOnly: true
          };
        } else if (primitiveId === 'articulated-melee-sweep') {
          const state = boss.bossHeliosCornerClampState;
          assert.ok(state, `${beat.key} must preserve the production corner-clamp state`);
          assert.equal(state.fallbackToCrossfire, false, `${beat.key} starts with intact claws`);
          assert.equal(state.activeSide, beat.clip.parameters?.side);
          warningEvidence[beat.key] = {
            primitiveId,
            activeSide: state.activeSide,
            cornerX: state.cornerX,
            cornerY: state.cornerY,
            anatomyOnly: true
          };
          beatOrigins[beat.key] = { meleeSamples: [] };
        } else if (primitiveId === 'tracking-pincer-dive') {
          const state = boss.bossTrackingPincerState;
          assert.ok(state, `${beat.key} must preserve the production pincer state`);
          const stateSnapshot = {
            anchorX: state.anchorX,
            anchorY: state.anchorY,
            riseX: state.riseX,
            riseY: state.riseY,
            targetX: state.targetX,
            targetY: state.targetY
          };
          pincerLocks[beat.key] = stateSnapshot;
          warningEvidence[beat.key] = { primitiveId, pincerState: stateSnapshot };

          const sequence = Math.max(0, Math.floor(beat.clip.parameters?.sequence ?? 0))
            + beat.executionIndex;
          const pincer = sampleHeliosTrackingPincer({ sequence, progress: 0.7 });
          if (pincer.stage === 'dive-close' || pincer.stage === 'hold-release-return') {
            const targetLock = {
              x: state.targetX + boss.width / 2,
              y: state.targetY + boss.height * 0.44
            };
            const playerCenter = {
              x: engine.player.x + engine.player.width / 2,
              y: engine.player.y + engine.player.height / 2
            };
            assert.ok(
              pointMatches(targetLock, playerCenter),
              `${beat.key} must retain the actual player-center lock used by the pincer`
            );
            beatOrigins[beat.key] = { targetLock };
            warningEvidence[beat.key].targetLock = targetLock;
          }
        } else {
          warningEvidence[beat.key] = {
            primitiveId,
            side: beat.clip.parameters?.side,
            anatomyOnly: true
          };
        }
      }

      if (frame !== beat.fireFrame) continue;
      const primitiveId = beat.clip.primitiveId;
      if (
        primitiveId === 'paired-cannon-burst'
        || primitiveId === 'reactor-aperture-pattern'
      ) {
        assert.equal(
          damaging.length,
          0,
          `${beat.key} must begin with anticipation before its first sequential emission`
        );
        fireEvidence[beat.key] = { count: 0, frames: [], origins: [], visualKinds: [] };
      } else {
        assert.equal(damaging.length, 0, `${beat.key} must use the boss's moving claw hit regions`);
        fireEvidence[beat.key] = { count: 0, movingClawHitRegion: true };
      }
    }

    const action = boss.bossActionPresentation;
    if (
      action?.stage === 'fire'
      && (
        action.primitiveId === 'paired-cannon-burst'
        || action.primitiveId === 'reactor-aperture-pattern'
      )
    ) {
      const beat = beatByAction.get(`${action.actionClipId}:${action.executionIndex}`);
      assert.ok(beat, `${action.actionClipId}:${action.executionIndex} must resolve to its authored beat`);
      const evidence = fireEvidence[beat.key] ?? {
        count: 0,
        frames: [],
        origins: [],
        visualKinds: []
      };
      const elapsedFrames = frame - action.startFrame;
      if (action.primitiveId === 'paired-cannon-burst') {
        const sides = resolveHeliosCrossfireSides(action.side);
        const pulse = sampleHeliosCrossfirePulse({
          elapsedFrames,
          roundsPerSide: action.projectileCount ?? 4,
          sides,
          intervalFrames: phaseIndex >= 3 ? 3 : 4
        });
        const expectedCount = pulse?.firing ? 1 : 0;
        assert.equal(
          damaging.length,
          expectedCount,
          `${beat.key} frame ${frame} must emit exactly one round only on its cadence pulse`
        );
        if (pulse?.firing) {
          const liveOrigin = engine.getPreviewBossWeaponOrigins(boss, [pulse.side])[0];
          assert.ok(liveOrigin, `${beat.key} must expose the firing rotary's live socket`);
          const actualOrigin = entityCenter(damaging[0]);
          assert.ok(
            pointMatches(actualOrigin, preUpdateOrigins[pulse.side], 6)
              || pointMatches(actualOrigin, liveOrigin, 6),
            `${beat.key} round ${pulse.shotIndex} must originate at its live animated socket; actual=${JSON.stringify(actualOrigin)} pre=${JSON.stringify(copyPoint(preUpdateOrigins[pulse.side]))} post=${JSON.stringify(copyPoint(liveOrigin))}`
          );
          assert.equal(damaging[0].projectileVisualKind, 'boss-gatling-tracer');
          beatOrigins[beat.key].sockets[pulse.side].push(copyPoint(actualOrigin));
          evidence.count += 1;
          evidence.frames.push(frame);
          evidence.origins.push(copyPoint(actualOrigin));
          evidence.visualKinds.push(damaging[0].projectileVisualKind);
        }
      } else {
        const liveCore = engine.getPreviewBossWeaponOrigins(boss, ['core'])[0];
        assert.ok(liveCore, `${beat.key} must expose a live reactor socket`);
        let expectedCount = 0;
        if (action.motionCue === 'reactor-mines') {
          const formation = resolveHeliosMineFormation({
            sequence: action.sequence,
            count: action.projectileCount ?? 3
          });
          const slot = formation.find((candidate) => elapsedFrames === 2 + candidate.delayFrames);
          expectedCount = slot ? 1 : 0;
          if (slot) {
            assert.equal(damaging[0]?.projectileVisualKind, 'boss-helios-mine');
            (mineEntities[beat.key] ??= []).push(damaging[0]);
          }
        } else {
          const target = beatOrigins[beat.key].targetLock;
          const targetAngle = Math.atan2(target.y - liveCore.y, target.x - liveCore.x);
          const fanShot = sampleHeliosReactorFanShot({
            elapsedFrames,
            sequence: action.sequence,
            projectileCount: action.projectileCount ?? 7,
            targetAngleRadians: targetAngle,
            intervalFrames: phaseIndex >= 3 ? 4 : 5
          });
          expectedCount = fanShot?.firing ? 1 : 0;
          if (fanShot?.firing) {
            assert.equal(damaging[0]?.projectileVisualKind, 'boss-reactor-pellet');
            const emittedOrigin = entityCenter(damaging[0]);
            const emittedTargetAngle = Math.atan2(
              target.y - emittedOrigin.y,
              target.x - emittedOrigin.x
            );
            const emittedFanShot = sampleHeliosReactorFanShot({
              elapsedFrames,
              sequence: action.sequence,
              projectileCount: action.projectileCount ?? 7,
              targetAngleRadians: emittedTargetAngle,
              intervalFrames: phaseIndex >= 3 ? 4 : 5
            });
            assert.ok(emittedFanShot?.firing);
            const actualAngle = Math.atan2(damaging[0].vy, damaging[0].vx);
            assert.ok(actualAngle >= Math.PI / 6 && actualAngle <= Math.PI * 5 / 6);
            assert.ok(
              Math.abs(actualAngle - emittedFanShot.angleRadians) < 0.000001,
              `${beat.key} fan angle mismatch: actual=${actualAngle} expected=${emittedFanShot.angleRadians} elapsed=${elapsedFrames}`
            );
          }
        }
        assert.equal(
          damaging.length,
          expectedCount,
          `${beat.key} frame ${frame} must emit one staged reactor object only on its authored beat`
        );
        if (expectedCount === 1) {
          const actualOrigin = entityCenter(damaging[0]);
          assert.ok(
            pointMatches(actualOrigin, preUpdateOrigins.core, 6)
              || pointMatches(actualOrigin, liveCore, 6),
            `${beat.key} must sample the live core at each emission instead of reusing warning geometry`
          );
          beatOrigins[beat.key].coreSamples.push(copyPoint(actualOrigin));
          evidence.count += 1;
          evidence.frames.push(frame);
          evidence.origins.push(copyPoint(actualOrigin));
          evidence.visualKinds.push(damaging[0].projectileVisualKind ?? null);
        }
      }
      fireEvidence[beat.key] = evidence;
    }
    if (
      action?.stage === 'fire'
      && (
        action.primitiveId === 'articulated-melee-sweep'
        || action.primitiveId === 'tracking-pincer-dive'
      )
    ) {
      const beat = beatByAction.get(`${action.actionClipId}:${action.executionIndex}`);
      assert.ok(
        beat,
        `Active ${JSON.stringify(`${action.actionClipId}:${action.executionIndex}`)} at frame ${frame} must belong to ${JSON.stringify([...beatByAction.keys()])}`
      );
      const durationFrames = Math.max(1, action.endFrame - action.startFrame);
      const progress = Math.max(0, Math.min(
        1,
        (boss.attackTimer - action.startFrame) / durationFrames
      ));
      const sample = resolveMeleeSample(action, progress);
      if (sample.damageActive) {
        assert.ok(sample.closeEnergy > 0, `${beat.key} damage must coincide with visible closure`);
        const activeSides = action.primitiveId === 'articulated-melee-sweep'
          ? [action.side ?? 'port']
          : ['port', 'starboard'];
        const liveTips = Object.fromEntries(activeSides.map((side) => {
          const tips = copyPoints(engine.getPreviewBossWeaponOrigins(boss, [side]));
          assert.equal(tips.length, 1, `${beat.key} must expose one actual ${side} claw tip`);
          return [side, tips[0]];
        }));
        const radius = Math.max(9, Math.min(boss.width, boss.height) * 0.095);
        const existing = beatOrigins[beat.key] ?? {};
        if (existing.meleeRadiusPixels !== undefined) {
          assert.equal(existing.meleeRadiusPixels, radius);
        }
        beatOrigins[beat.key] = {
          ...existing,
          meleeRadiusPixels: radius,
          meleeSamples: [
            ...(existing.meleeSamples ?? []),
            ...activeSides.map((side) => ({
              frameOffset: frame - beat.fireFrame,
              side,
              point: liveTips[side]
            }))
          ]
        };
        const frames = meleeEvidence[beat.key] ?? [];
        frames.push({
          frame,
          progress,
          radius,
          closeEnergy: sample.closeEnergy,
          tips: liveTips
        });
        meleeEvidence[beat.key] = frames;
      }
    }
  }

  for (const beat of beats.filter((candidate) => (
    candidate.clip.primitiveId === 'reactor-aperture-pattern'
    && candidate.clip.parameters?.motionCue === 'reactor-mines'
  ))) {
    const mines = mineEntities[beat.key] ?? [];
    const expectedFormation = resolveHeliosMineFormation({
      sequence: beat.clip.parameters?.sequence ?? 0,
      count: beat.clip.parameters?.projectileCount ?? 3
    });
    assert.equal(mines.length, expectedFormation.length, `${beat.key} must deploy its bounded formation`);
    const mine = mines[0];
    assert.equal(mine.heliosMineStage, 'deploying');
    const stages = ['deploying'];
    const damageFrames = [];
    engine.player.x = 0;
    engine.player.y = Math.max(0, viewport.height - engine.player.height);
    for (let step = 0; step < 260 && !mine.markedForDeletion; step += 1) {
      engine.frameCount += 1;
      mine.x += mine.vx;
      mine.y += mine.vy;
      engine.updateHeliosMineEntity(mine);
      const stage = mine.heliosMineStage;
      if (stage && stages.at(-1) !== stage) stages.push(stage);
      const sample = sampleHeliosMineLifecycle({
        ageFrames: engine.frameCount - mine.heliosMineState.spawnFrame,
        triggerFrame: mine.heliosMineState.triggerAgeFrame,
        distanceToPlayer: Math.hypot(
          engine.player.x + engine.player.width / 2 - (mine.x + mine.width / 2),
          engine.player.y + engine.player.height / 2 - (mine.y + mine.height / 2)
        )
      });
      const damageActive = engine.isHeliosMineDamageActive(mine);
      assert.equal(damageActive, sample.damageActive && !mine.heliosMineState.hitPlayer);
      if (damageActive) {
        damageFrames.push(engine.frameCount - mine.heliosMineState.spawnFrame);
        assert.equal(mine.projectileVisualKind, 'boss-helios-explosion');
        assert.ok(mine.spriteFrames.length > 1, 'mine damage must use visible explosion animation frames');
      }
    }
    assert.deepEqual(stages, ['deploying', 'armed', 'exploding', 'expired']);
    assert.ok(damageFrames.length > 0, `${beat.key} must expose visible active explosion frames`);
    assert.equal(mine.markedForDeletion, true, `${beat.key} must clean up after its final explosion frame`);
    mineLifecycleEvidence[beat.key] = {
      stages,
      damageFrames,
      cleanup: mine.markedForDeletion
    };
  }

  for (const beat of beats) {
    const primitiveId = beat.clip.primitiveId;
    if (primitiveId === 'paired-cannon-burst') {
      const expected = Math.max(
        3,
        Math.min(9, Math.round(beat.clip.parameters?.projectileCount ?? 4))
      ) * resolveHeliosCrossfireSides(beat.clip.parameters?.side).length;
      assert.equal(fireEvidence[beat.key]?.count, expected);
      assert.equal(new Set(fireEvidence[beat.key].frames).size, expected);
      assert.ok(fireEvidence[beat.key].visualKinds.every((kind) => kind === 'boss-gatling-tracer'));
      continue;
    }
    if (primitiveId === 'reactor-aperture-pattern') {
      const expected = beat.clip.parameters?.motionCue === 'reactor-mines'
        ? resolveHeliosMineFormation({
            sequence: beat.clip.parameters?.sequence ?? 0,
            count: beat.clip.parameters?.projectileCount ?? 3
          }).length
        : Math.max(5, Math.min(11, Math.floor(beat.clip.parameters?.projectileCount ?? 7)));
      assert.equal(fireEvidence[beat.key]?.count, expected);
      assert.equal(new Set(fireEvidence[beat.key].frames).size, expected);
      continue;
    }
    if (primitiveId === 'articulated-melee-sweep') {
      assert.ok(meleeEvidence[beat.key]?.length > 0, `${beat.key} must sample its exact damage window`);
      continue;
    }
    const sequence = Math.max(0, Math.floor(beat.clip.parameters?.sequence ?? 0))
      + beat.executionIndex;
    const pincer = sampleHeliosTrackingPincer({ sequence, progress: 0.7 });
    if (pincer.stage === 'dive-close' || pincer.stage === 'hold-release-return') {
      assert.ok(meleeEvidence[beat.key]?.length > 0, `${beat.key} must sample its exact damage window`);
      assert.ok(beatOrigins[beat.key]?.targetLock, `${beat.key} must retain its player-center lock`);
    }
  }

  const evidence = {
    beatOrigins,
    warningEvidence,
    fireEvidence,
    meleeEvidence,
    pincerLocks,
    mineLifecycleEvidence
  };
  return {
    pose: {
      core: copyPoint(fallbackCore),
      weaveOriginY: fallbackCore.y,
      sockets: {
        port: copyPoints(fallbackPort),
        starboard: copyPoints(fallbackStarboard)
      },
      projectileSpeed: boss.projectileSpeed,
      geometryUncertaintyPixels: 3,
      beatOrigins
    },
    evidence: JSON.parse(JSON.stringify(evidence))
  };
};

const getProofSettings = (attackId, viewportId) => {
  const mobile = viewportId === 'mobile-390x844';
  if (attackId === 'clawcarrier-crush') {
    return { searchBreadth: mobile ? 384 : 192 };
  }
  if (attackId === 'claw-sweep-pincer') {
    return { searchBreadth: mobile ? 256 : 144 };
  }
  if (attackId === 'reactor-maze') {
    return mobile
      ? { searchBreadth: 256 }
      : { searchBreadth: 512 };
  }
  return mobile
    ? { searchBreadth: 512 }
    : { searchBreadth: 112 };
};

const createClampMatrixEngine = (destroyedComponentIds) => {
  const viewport = BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile;
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: 'helios-v2-clamp-matrix',
    previewBossCollisionEventId: preview.eventId,
    previewBossWeaponSockets: artwork.weaponSockets,
    previewBossWeaponSocketPoseSampler: poseSampler,
    previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
    previewBossReducedMotion: false,
    previewBossWeaponSocketEventId: preview.eventId,
    previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
  });
  engine.init(viewport.width, viewport.height);
  assert.equal(
    engine.triggerAuthoredBossAttack('claw-sweep-pincer', preview.eventId, bossEvent.phases[0].id),
    true
  );
  const boss = engine.bossRef;
  assert.ok(boss);
  const combatAnchorY = Math.max(72, Math.min(viewport.height * 0.13, 116));
  for (let frame = 0; boss.y < combatAnchorY && frame < 240; frame += 1) {
    engine.frameCount += 1;
    engine.updateBoss(boss);
  }
  for (const component of boss.bossComponents ?? []) {
    if (!destroyedComponentIds.includes(component.id)) continue;
    component.destroyed = true;
    component.hp = 0;
  }
  assert.equal(
    engine.triggerAuthoredBossAttack('claw-sweep-pincer', preview.eventId, bossEvent.phases[0].id),
    true
  );
  boss.y = Math.max(boss.y, combatAnchorY);
  engine.frameCount += 1;
  engine.updateBoss(boss);
  return { engine, boss };
};

const collectClampAttempts = ({ engine, boss }, frameBudget = 300) => {
  const attempts = [];
  const seenClipIds = new Set();
  for (let frame = 0; frame < frameBudget; frame += 1) {
    const state = boss.bossHeliosCornerClampState;
    if (state && !seenClipIds.has(state.actionClipId)) {
      seenClipIds.add(state.actionClipId);
      attempts.push({
        actionClipId: state.actionClipId,
        activeSide: state.activeSide,
        fallbackToCrossfire: state.fallbackToCrossfire
      });
    }
    engine.frameCount += 1;
    engine.updateBoss(boss);
  }
  return attempts;
};

test('Helios corner clamps resolve intact, one-arm, and both-arm fallback states in the real engine', () => {
  const intact = createClampMatrixEngine([]);
  assert.deepEqual(
    collectClampAttempts(intact).map(({ activeSide, fallbackToCrossfire }) => ({ activeSide, fallbackToCrossfire })),
    [
      { activeSide: 'port', fallbackToCrossfire: false },
      { activeSide: 'starboard', fallbackToCrossfire: false }
    ]
  );

  const portDestroyed = createClampMatrixEngine(['left-cannon']);
  assert.deepEqual(
    collectClampAttempts(portDestroyed).map(({ activeSide, fallbackToCrossfire }) => ({ activeSide, fallbackToCrossfire })),
    [{ activeSide: 'starboard', fallbackToCrossfire: false }],
    'a destroyed port claw skips its own beat instead of reusing the surviving claw twice'
  );

  const starboardDestroyed = createClampMatrixEngine(['right-cannon']);
  assert.deepEqual(
    collectClampAttempts(starboardDestroyed).map(({ activeSide, fallbackToCrossfire }) => ({ activeSide, fallbackToCrossfire })),
    [{ activeSide: 'port', fallbackToCrossfire: false }],
    'a destroyed starboard claw skips its own beat instead of reusing the surviving claw twice'
  );

  const bothDestroyed = createClampMatrixEngine(['left-cannon', 'right-cannon']);
  assert.ok(bothDestroyed.boss.bossHeliosCornerClampState);
  assert.equal(bothDestroyed.boss.bossHeliosCornerClampState.activeSide, undefined);
  assert.equal(bothDestroyed.boss.bossHeliosCornerClampState.fallbackToCrossfire, true);
  assert.equal(bothDestroyed.boss.bossActionPresentation.motionCue, 'paired-crossfire');

  for (let frame = 0; frame < 180; frame += 1) {
    if (bothDestroyed.boss.bossActionPresentation?.stage === 'fire') break;
    bothDestroyed.engine.frameCount += 1;
    bothDestroyed.engine.updateBoss(bothDestroyed.boss);
  }
  assert.equal(bothDestroyed.boss.bossActionPresentation?.stage, 'fire');
  assert.equal(bothDestroyed.engine.isHeliosMeleeDamageActive(bothDestroyed.boss), false);
  assert.equal(
    bothDestroyed.engine.bossMeleeClawsIntersectBox(bothDestroyed.boss, {
      x: 0,
      y: 0,
      width: 390,
      height: 844
    }),
    false,
    'destroyed hidden claws must not retain a damaging melee region during rotary fallback'
  );
});

test('all real Helios attacks use anatomy-owned geometry and retain a six-pixel safe route in every phase and viewport', () => {
  const capturedCases = [];
  const evidence = [];
  const unproven = [];
  for (const attack of attacks) {
    assert.match(attack.recognitionCue, /\S/);
    assert.match(attack.solution, /\S/);
    assert.match(attack.safeRouteRule, /\S/);
    for (const phase of bossEvent.phases) {
      for (const viewport of Object.values(BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS)) {
        const firstCapture = captureExactAttackPose(viewport, attack, phase.id);
        const repeatedCapture = captureExactAttackPose(viewport, attack, phase.id);
        assert.deepEqual(
          repeatedCapture.evidence,
          firstCapture.evidence,
          `${attack.id}/${phase.id}/${viewport.id} must replay exact runtime geometry`
        );
        capturedCases.push({ attack, phase, viewport, capture: firstCapture });
      }
    }
  }

  for (const { attack, phase, viewport, capture } of capturedCases) {
    const settings = getProofSettings(attack.id, viewport.id);
    const request = {
      timeline: bossEvent.timeline,
      attackId: attack.id,
      phaseId: phase.id,
      viewport,
      pose: capture.pose,
      ...settings
    };
    const first = proveBossAttackSafeRoute(request);
    if (first.status !== 'proven') {
      unproven.push({
        attackId: attack.id,
        phaseId: phase.id,
        viewportId: viewport.id,
        reason: first.reason,
        detail: first.detail,
        runtimeEvidence: capture.evidence
      });
      continue;
    }
    assert.ok(
      first.minimumClearancePixels >= MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
      `${attack.id}/${phase.id}/${viewport.id} must retain at least six pixels`
    );
    assert.match(first.witnessHash, /^[0-9a-f]{8}$/);
    const repeated = proveBossAttackSafeRoute(request);
    assert.equal(repeated.status, 'proven', repeated.detail);
    assert.equal(repeated.witnessHash, first.witnessHash);
    assert.equal(repeated.minimumClearancePixels, first.minimumClearancePixels);
    evidence.push({
      attackId: attack.id,
      phaseId: phase.id,
      viewportId: viewport.id,
      witnessHash: first.witnessHash,
      minimumClearancePixels: Number(first.minimumClearancePixels.toFixed(6)),
      modeledPrimitives: first.modeledPrimitives
    });
  }

  assert.deepEqual(unproven, [], JSON.stringify(unproven, null, 2));
  assert.equal(evidence.length, 24);
  assert.equal(new Set(evidence.map((entry) => (
    `${entry.attackId}:${entry.phaseId}:${entry.viewportId}`
  ))).size, 24);
});
