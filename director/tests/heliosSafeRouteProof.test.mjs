import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const execFileAsync = promisify(execFile);
const requestedCampaignGitRef = String(process.env.HELIOS_CAMPAIGN_GIT_REF ?? '').trim();
const campaignSource = requestedCampaignGitRef
  ? (await execFileAsync(
      'git',
      ['show', requestedCampaignGitRef],
      { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true }
    )).stdout
  : await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8');
const campaign = JSON.parse(campaignSource);
const pinnedCampaignModuleId = '\0helios-safe-route-campaign-snapshot';

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
  plugins: [{
    name: 'helios-safe-route-campaign-snapshot',
    enforce: 'pre',
    resolveId(source) {
      const normalized = source.replaceAll('\\', '/');
      return (
        normalized === 'game-config/campaign.json'
        || normalized.endsWith('/game-config/campaign.json')
      )
        ? pinnedCampaignModuleId
        : null;
    },
    load(id) {
      return id === pinnedCampaignModuleId
        ? `export default ${JSON.stringify(campaign)};`
        : null;
    }
  }],
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
  HELIOS_MINE_FORMATION_TEMPLATE_IDS,
  HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
  resolveHeliosMineArmPoint,
  resolveHeliosMineFormation,
  resolveHeliosTrackingPincerCoreRadius,
  resolveHeliosCrossfireSides,
  resolveHeliosMachineGunChannelHorizontalPadding,
  resolveHeliosMachineGunChannelTargetPadding,
  resolveHeliosMachineGunChannelTargets,
  sampleHeliosCrossfirePulse,
  sampleHeliosMachineGunChannelMovement,
  sampleHeliosMachineGunChannelPulse,
  sampleHeliosMineRuntime,
  sampleHeliosReactorFanShot,
  sampleHeliosTrackingPincer
} = await vite.ssrLoadModule('/services/gameplay/bosses/HeliosClawcarrierRuntime.ts');
const {
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
  CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER,
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
  'machinegun-channel',
  'reactor-maze',
  'clawcarrier-crush'
];
const requestedRouteCase = String(process.env.HELIOS_ROUTE_CASE ?? '').trim();
const routeCaseMatches = (attackId, phaseId, viewportId) => (
  !requestedRouteCase
  || `${attackId}|${phaseId}|${viewportId}` === requestedRouteCase
);
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

const isMachineGunChannel = (clipOrAction) => Boolean(
  clipOrAction?.primitiveId === 'paired-cannon-burst'
  && (
    clipOrAction?.motionCue === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE
    || clipOrAction?.parameters?.motionCue === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE
  )
);

const resolveMeleeSample = (action, progress) => sampleHeliosTrackingPincer({
  sequence: action.sequence,
  progress
});

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
  const channelBeats = beats
    .filter((beat) => isMachineGunChannel(beat.clip))
    .sort((left, right) => left.fireFrame - right.fireFrame);
  const channelBeatAtFrame = (frame) => channelBeats.find((beat, index) => (
    frame >= beat.fireFrame
    && frame < (channelBeats[index + 1]?.fireFrame ?? beat.endFrame)
  ));
  const beatOrigins = {};
  const warningEvidence = {};
  const fireEvidence = {};
  const meleeEvidence = {};
  const pincerLocks = {};
  const mineRecords = {};
  const mineLifecycleEvidence = {};
  const channelEvidence = {
    frames: [],
    shots: []
  };
  const phaseIndex = Math.max(
    1,
    bossEvent.phases.findIndex((phase) => phase.id === phaseId) + 1
  );
  const lastFrame = Math.max(...beats.map((beat) => beat.endFrame));
  const resolveLiveChannelTargets = (channel) => {
    const movementBounds = sampleHeliosMachineGunChannelMovement({
      stage: 'fire',
      progress: 0,
      sequence: channel.directionSequence,
      anchorX: channel.anchorX,
      anchorY: channel.anchorY,
      arenaWidth: viewport.width,
      arenaHeight: viewport.height,
      bossWidth: boss.width,
      bossHeight: boss.height,
      horizontalPadding: resolveHeliosMachineGunChannelHorizontalPadding(
        viewport.mobileProfile
      ),
      sweepRangeRatio: channel.sweepRangeRatio,
      sweepPasses: channel.sweepPasses,
      upperLaneRatio: viewport.mobileProfile ? 0.13 : 0.12
    });
    return resolveHeliosMachineGunChannelTargets({
      bossX: boss.x,
      startX: movementBounds.startX,
      endX: movementBounds.endX,
      arenaWidth: viewport.width,
      channelWidthPixels: channel.channelWidthPixels,
      edgePadding: resolveHeliosMachineGunChannelTargetPadding(
        viewport.mobileProfile,
        viewport.width
      )
    });
  };

  const updateCapturedMines = () => {
    for (const records of Object.values(mineRecords)) {
      for (const record of records) {
        const mine = record.entity;
        if (mine.markedForDeletion) continue;
        engine.updateHeliosMineEntity(mine);
        const state = mine.heliosMineState;
        assert.ok(state);
        const center = entityCenter(mine);
        const distanceToPlayer = Math.hypot(
          engine.player.x + engine.player.width / 2 - center.x,
          engine.player.y + engine.player.height / 2 - center.y
        );
        record.samples.push({
          ageFrames: engine.frameCount - state.spawnFrame,
          triggerFrame: state.triggerAgeFrame,
          distanceToPlayer,
          center: copyPoint(center),
          velocity: { x: mine.vx, y: mine.vy },
          stage: mine.heliosMineStage,
          damageActive: engine.isHeliosMineDamageActive(mine),
          visualKind: mine.projectileVisualKind,
          spriteFrameCount: mine.spriteFrames?.length ?? 0,
          markedForDeletion: Boolean(mine.markedForDeletion)
        });
      }
    }
  };

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
          const channel = isMachineGunChannel(beat.clip)
            ? boss.bossHeliosMachineGunChannelState
            : undefined;
          if (isMachineGunChannel(beat.clip)) {
            assert.ok(channel, `${beat.key} must preserve one continuous channel state`);
            assert.equal(channel.actionClipId, beat.clip.id);
          }
          beatOrigins[beat.key] = {
            sockets,
            ...(channel
              ? {
                  channelTargets: Object.fromEntries(sides.map((side) => [side, []])),
                  channelSequence: channel.sequence
                }
              : {})
          };
          const target = {
            x: Number(boss.bossTimelineTargetX),
            y: Number(boss.bossTimelineTargetY)
          };
          assert.equal(Number.isFinite(target.x) && Number.isFinite(target.y), true);
          warningEvidence[beat.key] = {
            primitiveId,
            sides,
            target,
            channelSequence: channel?.sequence,
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
            targetLock,
            ...(beat.clip.parameters?.motionCue === 'reactor-mines'
              ? { mineDeployments: [] }
              : {})
          };
          warningEvidence[beat.key] = {
            primitiveId,
            motionCue: beat.clip.parameters?.motionCue,
            core: copyPoint(core),
            targetLock,
            anatomyOnly: true
          };
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
        if (!isMachineGunChannel(beat.clip)) {
          assert.equal(
            damaging.length,
            0,
            `${beat.key} must begin with anticipation before its first sequential emission`
          );
        }
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
      const beat = isMachineGunChannel(action)
        ? channelBeatAtFrame(frame)
        : beatByAction.get(`${action.actionClipId}:${action.executionIndex}`);
      assert.ok(beat, `${action.actionClipId}:${action.executionIndex} must resolve to its authored beat`);
      const evidence = fireEvidence[beat.key] ?? {
        count: 0,
        frames: [],
        origins: [],
        visualKinds: []
      };
      const elapsedFrames = frame - action.startFrame;
      if (action.primitiveId === 'paired-cannon-burst') {
        const channel = isMachineGunChannel(action)
          ? boss.bossHeliosMachineGunChannelState
          : undefined;
        const sides = resolveHeliosCrossfireSides(action.side);
        const pulse = channel
          ? sampleHeliosMachineGunChannelPulse({
              elapsedFrames: frame - channel.fireStartFrame,
              durationFrames: channel.fireEndFrame - channel.fireStartFrame,
              sequence: channel.sequence,
              intervalFrames: channel.shotIntervalFrames
            })
          : sampleHeliosCrossfirePulse({
              elapsedFrames,
              roundsPerSide: action.projectileCount ?? 4,
              sides,
              intervalFrames: action.shotIntervalFrames ?? (phaseIndex >= 3 ? 2 : 3)
            });
        if (channel) {
          const targets = resolveLiveChannelTargets(channel);
          channelEvidence.frames.push({
            frame,
            x: boss.x,
            y: boss.y,
            centerX: targets.centerX,
            portBoundaryX: targets.portX,
            starboardBoundaryX: targets.starboardX,
            channelWidthPixels: channel.channelWidthPixels
          });
        }
        const expectedSides = pulse?.firing
          ? channel
            ? pulse.firingSides
            : [pulse.side]
          : [];
        const expectedCount = expectedSides.length;
        assert.equal(
          damaging.length,
          expectedCount,
          `${beat.key} frame ${frame} must emit the exact anatomy-owned round set on its cadence pulse`
        );
        if (pulse?.firing) {
          expectedSides.forEach((side, sideIndex) => {
            const projectile = damaging[sideIndex];
            const liveOrigin = engine.getPreviewBossWeaponOrigins(boss, [side])[0];
            assert.ok(liveOrigin, `${beat.key} must expose the firing rotary's live socket`);
            const actualOrigin = entityCenter(projectile);
            assert.ok(
              pointMatches(actualOrigin, preUpdateOrigins[side], 6)
                || pointMatches(actualOrigin, liveOrigin, 6),
              `${beat.key} ${side} round ${pulse.shotIndex} must originate at its live animated socket; actual=${JSON.stringify(actualOrigin)} pre=${JSON.stringify(copyPoint(preUpdateOrigins[side]))} post=${JSON.stringify(copyPoint(liveOrigin))}`
            );
            assert.equal(projectile.projectileVisualKind, 'boss-gatling-tracer');
            beatOrigins[beat.key].sockets[side].push(copyPoint(actualOrigin));
            if (channel) {
              const targets = resolveLiveChannelTargets(channel);
              const target = {
                x: side === 'port' ? targets.portX : targets.starboardX,
                y: viewport.height + (viewport.mobileProfile ? 44 : 64)
              };
              assert.ok(projectile.vy > 0, `${beat.key} channel rounds must travel down-screen`);
              const projectedTargetX = actualOrigin.x
                + (target.y - actualOrigin.y) * projectile.vx / projectile.vy;
              assert.ok(
                Math.abs(projectedTargetX - target.x) < 0.000001,
                `${beat.key} ${side} shot ${pulse.shotIndex} must retain its exact moving channel boundary`
              );
              beatOrigins[beat.key].channelTargets[side].push(target);
              channelEvidence.shots.push({
                frame,
                elapsedFrames: frame - channel.fireStartFrame,
                shotIndex: pulse.shotIndex * 2 + sideIndex,
                side,
                sideShotIndex: pulse.shotIndex,
                beatKey: beat.key,
                origin: copyPoint(actualOrigin),
                target,
                velocity: {
                  x: projectile.vx,
                  y: projectile.vy
                },
                projectileWidth: projectile.width,
                projectileHeight: projectile.height,
                visualKind: projectile.projectileVisualKind
              });
            }
            evidence.count += 1;
            evidence.frames.push(frame);
            evidence.origins.push(copyPoint(actualOrigin));
            evidence.visualKinds.push(projectile.projectileVisualKind);
          });
        }
      } else {
        const liveCore = engine.getPreviewBossWeaponOrigins(boss, ['core'])[0];
        assert.ok(liveCore, `${beat.key} must expose a live reactor socket`);
        let expectedCount = 0;
        if (action.motionCue === 'reactor-mines') {
          assert.ok(damaging.length <= 1, `${beat.key} must deploy at most one mine per frame`);
          expectedCount = damaging.length;
          if (expectedCount === 1) {
            assert.equal(damaging[0]?.projectileVisualKind, 'boss-helios-mine');
            const mine = damaging[0];
            const state = mine.heliosMineState;
            assert.ok(state, `${beat.key} mine must retain its exact deployment state`);
            assert.ok(pointMatches(
              { x: state.deployStartX, y: state.deployStartY },
              entityCenter(mine)
            ));
            const deployment = {
              frameOffset: elapsedFrames,
              origin: { x: state.deployStartX, y: state.deployStartY },
              armPoint: { x: state.armX, y: state.armY },
              deployFrames: state.deployFrames
            };
            beatOrigins[beat.key].mineDeployments.push(deployment);
            (mineRecords[beat.key] ??= []).push({
              entity: mine,
              actionSequence: action.sequence,
              projectileCount: action.projectileCount ?? 3,
              deployment,
              mineSize: mine.width,
              edgePadding: 12,
              topPadding: viewport.mobileProfile ? 54 : 48,
              bottomPadding: viewport.mobileProfile ? 34 : 22,
              minimumForwardTravel: Math.max(
                viewport.mobileProfile ? 104 : 112,
                boss.y + boss.height + (viewport.mobileProfile ? 64 : 76)
                  - state.deployStartY
              ),
              samples: []
            });
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
      && action.primitiveId === 'tracking-pincer-dive'
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
        const activeSides = ['port', 'starboard'];
        const liveTips = Object.fromEntries(activeSides.map((side) => {
          const tips = copyPoints(engine.getPreviewBossWeaponOrigins(boss, [side]));
          assert.equal(tips.length, 1, `${beat.key} must expose one actual ${side} claw tip`);
          return [side, tips[0]];
        }));
        const radius = Math.max(9, Math.min(boss.width, boss.height) * 0.095);
        const bodyRadius = resolveHeliosTrackingPincerCoreRadius(
          boss.width,
          boss.height
        );
        const bodyCenter = {
          x: boss.x + boss.width / 2,
          y: boss.y + boss.height / 2
        };
        const existing = beatOrigins[beat.key] ?? {};
        if (existing.meleeRadiusPixels !== undefined) {
          assert.equal(existing.meleeRadiusPixels, radius);
        }
        beatOrigins[beat.key] = {
          ...existing,
          meleeRadiusPixels: radius,
          meleeBodyRadiusPixels: bodyRadius,
          meleeSamples: [
            ...(existing.meleeSamples ?? []),
            ...activeSides.map((side) => ({
              frameOffset: frame - beat.fireFrame,
              side,
              point: liveTips[side]
            }))
          ],
          meleeBodySamples: [
            ...(existing.meleeBodySamples ?? []),
            {
              frameOffset: frame - beat.fireFrame,
              point: bodyCenter
            }
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
    updateCapturedMines();
  }

  for (let step = 0; step < 260; step += 1) {
    const activeMines = Object.values(mineRecords)
      .flat()
      .filter((record) => !record.entity.markedForDeletion);
    if (activeMines.length === 0) break;
    engine.frameCount += 1;
    updateCapturedMines();
  }

  for (const beat of beats.filter((candidate) => (
    candidate.clip.primitiveId === 'reactor-aperture-pattern'
    && candidate.clip.parameters?.motionCue === 'reactor-mines'
  ))) {
    const records = mineRecords[beat.key] ?? [];
    const requestedCount = beat.clip.parameters?.projectileCount ?? 3;
    assert.ok(records.length > 0, `${beat.key} must deploy its bounded formation`);
    const candidates = Array.from(
      { length: HELIOS_MINE_FORMATION_TEMPLATE_IDS.length },
      (_, offset) => {
        const sequence = records[0].actionSequence + offset;
        const formation = resolveHeliosMineFormation({ sequence, count: requestedCount });
        const matches = formation.length === records.length
          && formation.every((slot, index) => {
            const record = records[index];
            if (
              record.deployment.frameOffset !== 2 + slot.delayFrames
              || record.deployment.deployFrames !== slot.deployFrames
            ) return false;
            const armPoint = resolveHeliosMineArmPoint({
              slot,
              arenaWidth: viewport.width,
              arenaHeight: viewport.height,
              originX: record.deployment.origin.x,
              originY: record.deployment.origin.y,
              mineSize: record.mineSize,
              edgePadding: record.edgePadding,
              topPadding: record.topPadding,
              bottomPadding: record.bottomPadding,
              minimumForwardTravel: record.minimumForwardTravel
            });
            return pointMatches(armPoint, record.deployment.armPoint)
              && armPoint.deployFrames === record.deployment.deployFrames;
          });
        return { sequence, formation, matches };
      }
    ).filter((candidate) => candidate.matches);
    assert.equal(
      candidates.length,
      1,
      `${beat.key} must resolve one bounded seeded formation from exact runtime arm points`
    );
    const [{ sequence: formationSequence, formation }] = candidates;
    assert.equal(new Set(formation.map((slot) => slot.templateId)).size, 1);
    assert.ok(
      HELIOS_MINE_FORMATION_TEMPLATE_IDS.includes(formation[0].templateId),
      `${beat.key} must use a retained bounded template`
    );
    assert.ok(
      new Set(formation.map((slot) => slot.targetXRatio)).size > 1,
      `${beat.key} formation must vary X`
    );
    assert.ok(
      new Set(formation.map((slot) => slot.targetYRatio)).size > 1,
      `${beat.key} formation must vary Y`
    );

    const lifecycleRecords = records.map((record, index) => {
      const slot = formation[index];
      const stages = [...new Set(record.samples.map((sample) => sample.stage))];
      const damageFrames = record.samples
        .filter((sample) => sample.damageActive)
        .map((sample) => sample.ageFrames);
      for (const sample of record.samples) {
        const runtime = sampleHeliosMineRuntime({
          slot,
          ageFrames: sample.ageFrames,
          triggerFrame: sample.triggerFrame,
          distanceToPlayer: sample.distanceToPlayer,
          arenaWidth: viewport.width,
          arenaHeight: viewport.height,
          originX: record.deployment.origin.x,
          originY: record.deployment.origin.y,
          mineSize: record.mineSize,
          edgePadding: record.edgePadding,
          topPadding: record.topPadding,
          bottomPadding: record.bottomPadding,
          minimumForwardTravel: record.minimumForwardTravel
        });
        assert.ok(pointMatches(runtime.armPoint, record.deployment.armPoint));
        assert.equal(runtime.armPoint.deployFrames, record.deployment.deployFrames);
        assert.ok(
          pointMatches(
            { x: runtime.deployment.centerX, y: runtime.deployment.centerY },
            sample.center
          ),
          `${beat.key} mine ${index} age ${sample.ageFrames} must follow the exact shared cubic path`
        );
        if (sample.ageFrames < record.deployment.deployFrames) {
          assert.ok(pointMatches(
            { x: runtime.deployment.velocityX, y: runtime.deployment.velocityY },
            sample.velocity
          ));
        }
        assert.equal(sample.stage, runtime.lifecycle.stage);
        assert.equal(sample.damageActive, runtime.lifecycle.damageActive);
        if (sample.damageActive) {
          assert.equal(sample.visualKind, 'boss-helios-explosion');
          assert.ok(
            sample.spriteFrameCount > 1,
            'mine damage must use visible explosion animation frames'
          );
        }
      }
      assert.deepEqual(stages, ['deploying', 'armed', 'exploding', 'expired']);
      assert.ok(damageFrames.length > 0, `${beat.key} mine ${index} must visibly damage`);
      assert.equal(
        record.entity.markedForDeletion,
        true,
        `${beat.key} mine ${index} must clean up after its final explosion frame`
      );
      return {
        index,
        templateId: slot.templateId,
        frameOffset: record.deployment.frameOffset,
        armPoint: record.deployment.armPoint,
        deployFrames: record.deployment.deployFrames,
        stages,
        damageFrames,
        cleanup: record.entity.markedForDeletion
      };
    });
    mineLifecycleEvidence[beat.key] = {
      formationSequence,
      templateId: formation[0].templateId,
      variedX: true,
      variedY: true,
      mines: lifecycleRecords
    };
  }

  if (channelBeats.length > 0) {
    const firstChannelBeat = channelBeats[0];
    const fireStartFrame = firstChannelBeat.fireFrame;
    const fireEndFrame = Math.max(...channelBeats.map((beat) => beat.endFrame));
    const durationFrames = fireEndFrame - fireStartFrame;
    const channelSequence = beatOrigins[firstChannelBeat.key].channelSequence;
    const intervalFrames = firstChannelBeat.clip.parameters?.shotIntervalFrames ?? 2;
    const expectedShots = [];
    for (let elapsedFrames = 0; elapsedFrames < durationFrames; elapsedFrames += 1) {
      const pulse = sampleHeliosMachineGunChannelPulse({
        elapsedFrames,
        durationFrames,
        sequence: channelSequence,
        intervalFrames
      });
      if (!pulse?.firing) continue;
      pulse.firingSides.forEach((side, sideIndex) => {
        expectedShots.push({
          frame: fireStartFrame + elapsedFrames,
          elapsedFrames,
          shotIndex: pulse.shotIndex * 2 + sideIndex,
          side,
          sideShotIndex: pulse.shotIndex
        });
      });
    }
    assert.deepEqual(
      channelEvidence.shots.map(({
        beatKey: _beatKey,
        origin: _origin,
        target: _target,
        velocity: _velocity,
        projectileWidth: _projectileWidth,
        projectileHeight: _projectileHeight,
        visualKind: _visualKind,
        ...shot
      }) => shot),
      expectedShots,
      `${attack.id}/${phaseId}/${viewport.id} must preserve one cadence across all repeated segments`
    );
    assert.deepEqual(
      channelEvidence.frames.map((sample) => sample.frame),
      Array.from({ length: durationFrames }, (_, index) => fireStartFrame + index),
      `${attack.id}/${phaseId}/${viewport.id} must retain a continuous fire presentation`
    );
    for (let index = 0; index < channelEvidence.frames.length; index += 1) {
      const sample = channelEvidence.frames[index];
      assert.ok(
        sample.portBoundaryX < sample.starboardBoundaryX,
        'channel boundaries must never cross'
      );
      assert.ok(
        Math.abs(
          sample.starboardBoundaryX
            - sample.portBoundaryX
            - sample.channelWidthPixels
        ) < 0.000001,
        'channel boundaries must never close'
      );
      if (index === 0) continue;
      const previous = channelEvidence.frames[index - 1];
      assert.ok(
        Math.hypot(sample.x - previous.x, sample.y - previous.y) <= 8,
        `channel must not teleport between frames ${previous.frame} and ${sample.frame}`
      );
    }
    for (const side of ['port', 'starboard']) {
      const sockets = channelBeats.flatMap((beat) => (
        beatOrigins[beat.key].sockets[side]
      ));
      const targets = channelBeats.flatMap((beat) => (
        beatOrigins[beat.key].channelTargets[side]
      ));
      const sideShots = channelEvidence.shots.filter((shot) => shot.side === side);
      assert.equal(sockets.length, sideShots.length);
      assert.equal(targets.length, sideShots.length);
      sideShots.forEach((shot, index) => {
        assert.equal(shot.sideShotIndex, index);
        assert.ok(pointMatches(sockets[index], shot.origin));
        assert.ok(pointMatches(targets[index], shot.target));
      });
    }
  }

  for (const beat of beats) {
    const primitiveId = beat.clip.primitiveId;
    if (primitiveId === 'paired-cannon-burst') {
      const expected = isMachineGunChannel(beat.clip)
        ? channelEvidence.shots.filter((shot) => shot.beatKey === beat.key).length
        : Math.max(
            3,
            Math.min(9, Math.round(beat.clip.parameters?.projectileCount ?? 4))
          ) * resolveHeliosCrossfireSides(beat.clip.parameters?.side).length;
      assert.equal(fireEvidence[beat.key]?.count, expected);
      assert.equal(
        new Set(fireEvidence[beat.key].frames).size,
        isMachineGunChannel(beat.clip) ? expected / 2 : expected
      );
      assert.ok(fireEvidence[beat.key].visualKinds.every((kind) => kind === 'boss-gatling-tracer'));
      if (isMachineGunChannel(beat.clip)) {
        for (const side of ['port', 'starboard']) {
          assert.equal(
            beatOrigins[beat.key].sockets[side].length,
            beatOrigins[beat.key].channelTargets[side].length,
            `${beat.key}/${side} must align every live muzzle with its exact moving target`
          );
        }
      }
      continue;
    }
    if (primitiveId === 'reactor-aperture-pattern') {
      const expected = beat.clip.parameters?.motionCue === 'reactor-mines'
        ? beatOrigins[beat.key].mineDeployments.length
        : Math.max(5, Math.min(11, Math.floor(beat.clip.parameters?.projectileCount ?? 7)));
      assert.equal(fireEvidence[beat.key]?.count, expected);
      assert.equal(new Set(fireEvidence[beat.key].frames).size, expected);
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
    mineLifecycleEvidence,
    channelEvidence
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

const getProofSettings = (attackId, viewportId, phaseId) => {
  const mobile = viewportId === 'mobile-390x844';
  if (
    attackId === 'twin-rotary-crossfire'
    && mobile
    && phaseId === 'sandbox-clawcarrier-armor-shear'
  ) {
    return { searchBreadth: 512, controlFrames: 4 };
  }
  if (
    attackId === 'reactor-maze'
    && mobile
    && phaseId === 'sandbox-clawcarrier-siege-calibration'
  ) {
    return { searchBreadth: 384, controlFrames: 4 };
  }
  if (
    attackId === 'reactor-maze'
    && mobile
    && phaseId === 'sandbox-clawcarrier-armor-shear'
  ) {
    return { searchBreadth: 384, controlFrames: 4 };
  }
  if (
    attackId === 'reactor-maze'
    && !mobile
    && phaseId === 'sandbox-clawcarrier-siege-calibration'
  ) {
    return { searchBreadth: 512, controlFrames: 4 };
  }
  if (
    attackId === 'reactor-maze'
    && !mobile
    && phaseId === 'sandbox-clawcarrier-reactor-overdrive'
  ) {
    return { searchBreadth: 512, controlFrames: 4 };
  }
  if (
    attackId === 'reactor-maze'
    && mobile
    && phaseId === 'sandbox-clawcarrier-reactor-overdrive'
  ) {
    return { searchBreadth: 512, controlFrames: 4 };
  }
  if (attackId === 'clawcarrier-crush') {
    return { searchBreadth: mobile ? 192 : 128, controlFrames: 6 };
  }
  if (attackId === 'machinegun-channel') {
    if (mobile && phaseId === 'sandbox-clawcarrier-reactor-overdrive') {
      return { searchBreadth: 192, controlFrames: 4 };
    }
    return { searchBreadth: mobile ? 48 : 32, controlFrames: 6 };
  }
  if (attackId === 'reactor-maze') {
    return { searchBreadth: mobile ? 192 : 160, controlFrames: 6 };
  }
  return { searchBreadth: mobile ? 160 : 96, controlFrames: 6 };
};

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
        if (!routeCaseMatches(attack.id, phase.id, viewport.id)) continue;
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
    const settings = getProofSettings(attack.id, viewport.id, phase.id);
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
    if (attack.id === 'machinegun-channel') {
      const channelFrames = new Map(
        capture.evidence.channelEvidence.frames.map((sample) => [sample.frame, sample])
      );
      const fireWitness = first.witness.filter((point) => channelFrames.has(point.frame));
      assert.ok(
        fireWitness.length >= Math.floor(channelFrames.size / settings.controlFrames),
        `${attack.id}/${phase.id}/${viewport.id} must sample the complete channel witness`
      );
      const sampleLiveRailAtY = (point, side) => {
        const candidates = capture.evidence.channelEvidence.shots
          .filter((shot) => shot.side === side && shot.frame <= point.frame)
          .map((shot) => {
            const ageFrames = point.frame - shot.frame + 1;
            return {
              ...shot,
              x: shot.origin.x + shot.velocity.x * ageFrames,
              y: shot.origin.y + shot.velocity.y * ageFrames
            };
          })
          .filter((shot) => (
            shot.y >= -shot.projectileHeight
            && shot.y <= viewport.height + shot.projectileHeight
          ))
          .sort((left, right) => left.y - right.y);
        const before = [...candidates].reverse().find((shot) => shot.y <= point.y);
        const after = candidates.find((shot) => shot.y >= point.y);
        if (!before || !after) return undefined;
        if (before === after || Math.abs(after.y - before.y) < 0.000001) {
          return {
            x: before.x,
            projectileWidth: before.projectileWidth
          };
        }
        const progress = (point.y - before.y) / (after.y - before.y);
        return {
          x: before.x + (after.x - before.x) * progress,
          projectileWidth: Math.max(before.projectileWidth, after.projectileWidth)
        };
      };
      let railWitnessCount = 0;
      let interiorWitnessCount = 0;
      for (const point of fireWitness) {
        const portRail = sampleLiveRailAtY(point, 'port');
        const starboardRail = sampleLiveRailAtY(point, 'starboard');
        if (!portRail || !starboardRail) continue;
        railWitnessCount += 1;
        const interiorMargin = CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.collisionWidth / 2
          + Math.max(portRail.projectileWidth, starboardRail.projectileWidth) * 0.3
          + 3
          + MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS;
        const isInsideChannel = (
          point.x >= portRail.x + interiorMargin
          && point.x <= starboardRail.x - interiorMargin
        );
        if (isInsideChannel) interiorWitnessCount += 1;
        if (viewport.mobileProfile) {
          assert.ok(
            isInsideChannel,
            `${attack.id}/${phase.id}/${viewport.id}/frame-${point.frame} escaped outside `
              + `the live projectile channel: x=${point.x}, bounds=${portRail.x}..`
              + `${starboardRail.x}`
          );
        }
      }
      assert.ok(
        railWitnessCount >= Math.floor(fireWitness.length * 0.7),
        `${attack.id}/${phase.id}/${viewport.id} must resolve both live projectile rails`
      );
      // The mandatory inside-the-rails contract is specifically the portrait
      // mobile encounter requested for the Sandbox. The landscape benchmark
      // still has to retain a six-pixel route and exact live rail geometry,
      // but its much wider arena permits post-passage exterior evasion.
      const targetPadding = resolveHeliosMachineGunChannelTargetPadding(
        viewport.mobileProfile,
        viewport.width
      );
      assert.ok(
        Math.min(...capture.evidence.channelEvidence.frames.map(
          (sample) => sample.portBoundaryX
        )) <= targetPadding + 0.001,
        `${attack.id}/${phase.id}/${viewport.id} must sweep the left exterior gutter`
      );
      assert.ok(
        Math.max(...capture.evidence.channelEvidence.frames.map(
          (sample) => sample.starboardBoundaryX
        )) >= viewport.width - targetPadding - 0.001,
        `${attack.id}/${phase.id}/${viewport.id} must sweep the right exterior gutter`
      );
    }
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
  assert.ok(capturedCases.length > 0, `No Helios route case matched ${requestedRouteCase}`);
  assert.equal(evidence.length, capturedCases.length);
  assert.equal(new Set(evidence.map((entry) => (
    `${entry.attackId}:${entry.phaseId}:${entry.viewportId}`
  ))).size, capturedCases.length);
});
