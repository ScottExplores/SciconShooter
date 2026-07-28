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
const { HELIOS_CLAWCARRIER_MODULAR_RIG } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const { sampleHeliosModularPose } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/HeliosModularPose.ts'
);
const { resolveModularBossRigHierarchy } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularHierarchyRig.ts'
);
const {
  HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
  resolveHeliosMachineGunChannelHorizontalPadding,
  resolveHeliosMachineGunChannelSequence,
  resolveHeliosMachineGunChannelTargetPadding,
  resolveHeliosMachineGunChannelTargets,
  sampleHeliosMachineGunChannelMovement,
  sampleHeliosMachineGunChannelPulse
} = await vite.ssrLoadModule(
  '/services/gameplay/bosses/HeliosClawcarrierRuntime.ts'
);

const preview = buildSandboxBossPrototypePreview(campaign, 'helios-clawcarrier');
const bossEvent = preview.previewWave.events.find((event) => event.kind === 'boss');
assert.ok(bossEvent?.timeline, 'Helios preview must expose its compiled attack timeline');
assert.equal(HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE, 'machinegun-channel');

const channelAttack = bossEvent.timeline.attacks.find(
  (attack) => attack.id === 'machinegun-channel'
);
assert.ok(channelAttack, 'Helios must retain the moving machine-gun signature');
assert.equal(channelAttack.role, 'signature');

const FRAMES_PER_SECOND = 60;
const BOSS_WIDTH = 297;
const BOSS_HEIGHT = Math.round(BOSS_WIDTH * 330 / 460);
const EPSILON = 0.001;
const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'mobile', width: 390, height: 844, mobileProfile: true }),
  Object.freeze({ id: 'desktop', width: 1280, height: 720, mobileProfile: false })
]);

const toFrames = (seconds) => Math.max(
  1,
  Math.round(Math.max(0, Number(seconds) || 0) * FRAMES_PER_SECOND)
);

const pointDistance = (left, right) => Math.hypot(
  right.x - left.x,
  right.y - left.y
);

const screenPointForSocket = (socket, topLeftX, topLeftY) => ({
  x: topLeftX
    + BOSS_WIDTH / 2
    + socket.worldX * BOSS_WIDTH / HELIOS_CLAWCARRIER_MODULAR_RIG.manifest.designSize.width,
  y: topLeftY
    + BOSS_HEIGHT / 2
    + socket.worldY * BOSS_HEIGHT / HELIOS_CLAWCARRIER_MODULAR_RIG.manifest.designSize.height
});

const projectRayToY = (origin, angle, targetY) => {
  const verticalVelocity = Math.sin(angle);
  assert.ok(verticalVelocity > 0, 'machine-gun channel rays must travel down-screen');
  const travel = (targetY - origin.y) / verticalVelocity;
  return origin.x + Math.cos(angle) * travel;
};

const getStructuralScreenBounds = (hierarchy, topLeftX, topLeftY) => {
  const designBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  for (const part of hierarchy.parts) {
    if (!part.visible || !part.frame || !part.anchor || part.role === 'effect') continue;
    const { a, b, c, d, tx, ty } = part.worldTransform;
    const localXs = [
      -part.anchor.x * part.frame.width,
      (1 - part.anchor.x) * part.frame.width
    ];
    const localYs = [
      -part.anchor.y * part.frame.height,
      (1 - part.anchor.y) * part.frame.height
    ];
    for (const localX of localXs) {
      for (const localY of localYs) {
        const x = a * localX + c * localY + tx;
        const y = b * localX + d * localY + ty;
        designBounds.minX = Math.min(designBounds.minX, x);
        designBounds.maxX = Math.max(designBounds.maxX, x);
        designBounds.minY = Math.min(designBounds.minY, y);
        designBounds.maxY = Math.max(designBounds.maxY, y);
      }
    }
  }
  const scaleX = BOSS_WIDTH / HELIOS_CLAWCARRIER_MODULAR_RIG.manifest.designSize.width;
  const scaleY = BOSS_HEIGHT / HELIOS_CLAWCARRIER_MODULAR_RIG.manifest.designSize.height;
  return {
    minX: topLeftX + BOSS_WIDTH / 2 + designBounds.minX * scaleX,
    maxX: topLeftX + BOSS_WIDTH / 2 + designBounds.maxX * scaleX,
    minY: topLeftY + BOSS_HEIGHT / 2 + designBounds.minY * scaleY,
    maxY: topLeftY + BOSS_HEIGHT / 2 + designBounds.maxY * scaleY
  };
};

const buildPhaseCase = (phase, phaseIndex) => {
  const variant = channelAttack.variants.find((candidate) => candidate.phaseId === phase.id);
  assert.ok(variant, `machinegun-channel must define ${phase.id}`);
  const channelClips = variant.beatClipIds
    .map((clipId) => bossEvent.timeline.clips.find((clip) => clip.id === clipId))
    .filter((clip) => clip?.parameters?.motionCue === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE);
  assert.equal(channelClips.length, 1, `${phase.id} must own one repeated moving channel clip`);
  const action = channelClips[0];
  const warning = bossEvent.timeline.clips.find((clip) => clip.id === action?.telegraphClipId);
  const recovery = bossEvent.timeline.clips.find((clip) => clip.id === variant.recoveryClipId);
  assert.ok(action && warning && recovery, `${phase.id} must compile warning, fire, and recovery`);
  assert.equal(action.primitiveId, 'paired-cannon-burst');
  assert.equal(action.parameters?.motionCue, HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE);
  assert.equal(action.repeat?.count, 4, `${phase.id} must retain four connected segments`);
  const segmentFrames = toFrames(action.durationSeconds);
  const intervalFrames = toFrames(action.repeat.intervalSeconds);
  assert.equal(
    intervalFrames,
    segmentFrames,
    `${phase.id} channel segments must meet exactly without a gap or overlap`
  );
  return {
    phase,
    phaseIndex,
    action,
    warning,
    recovery,
    warningFrames: toFrames(warning.durationSeconds),
    segmentFrames,
    totalFireFrames: (action.repeat.count - 1) * intervalFrames + segmentFrames,
    recoveryFrames: toFrames(recovery.durationSeconds)
  };
};

const phaseCases = bossEvent.phases.map(buildPhaseCase);
assert.equal(phaseCases.length, 3, 'viewport proof must cover all three Helios phases');

test('Helios channel accelerates by shortening its low-health route without changing the puzzle', () => {
  assert.deepEqual(
    phaseCases.map(({ segmentFrames, totalFireFrames }) => ({
      segmentFrames,
      totalFireFrames
    })),
    [
      { segmentFrames: 102, totalFireFrames: 408 },
      { segmentFrames: 90, totalFireFrames: 360 },
      { segmentFrames: 78, totalFireFrames: 312 }
    ]
  );
  const viewport = VIEWPORTS[0];
  const rates = phaseCases.map(({ action, totalFireFrames }) => {
    const start = sampleHeliosMachineGunChannelMovement({
      stage: 'fire',
      progress: 0,
      sequence: Number(action.parameters?.sequence) || 0,
      anchorX: (viewport.width - BOSS_WIDTH) / 2,
      anchorY: Math.max(72, Math.min(viewport.height * 0.13, 116)),
      arenaWidth: viewport.width,
      arenaHeight: viewport.height,
      bossWidth: BOSS_WIDTH,
      bossHeight: BOSS_HEIGHT,
      horizontalPadding: resolveHeliosMachineGunChannelHorizontalPadding(true),
      sweepRangeRatio: Number(action.parameters?.sweepRangeRatio) || 0.34,
      sweepPasses: Number(action.parameters?.sweepPasses) || 1,
      upperLaneRatio: 0.13
    });
    return Math.abs(start.endX - start.startX)
      * Number(action.parameters?.sweepPasses ?? 1)
      / totalFireFrames;
  });
  assert.ok(rates[1] > rates[0]);
  assert.ok(rates[2] > rates[1]);
  assert.ok(rates[2] <= 2.5, 'the base-speed ship must still be able to follow the channel');
});

test('Helios channel mirrors its starting edge without changing its safe travel span', () => {
  for (const viewport of VIEWPORTS) {
    for (const phaseCase of phaseCases) {
      const { phase, action } = phaseCase;
      const baseSequence = Number(action.parameters?.sequence) || 0;
      const sweepRangeRatio = Number(action.parameters?.sweepRangeRatio) || 0.34;
      const sweepPasses = Number(action.parameters?.sweepPasses) || 1;
      const sequenceA = resolveHeliosMachineGunChannelSequence({
        sequence: baseSequence,
        useIndex: 0,
        seedKey: `${viewport.id}:${phase.id}`
      });
      const sequenceB = resolveHeliosMachineGunChannelSequence({
        sequence: baseSequence,
        useIndex: 1,
        seedKey: `${viewport.id}:${phase.id}`
      });
      assert.notEqual(sequenceA % 2, sequenceB % 2);
      const input = {
        anchorX: (viewport.width - BOSS_WIDTH) / 2,
        anchorY: Math.max(72, Math.min(viewport.height * 0.13, 116)),
        arenaWidth: viewport.width,
        arenaHeight: viewport.height,
        bossWidth: BOSS_WIDTH,
        bossHeight: BOSS_HEIGHT,
        horizontalPadding: resolveHeliosMachineGunChannelHorizontalPadding(
          viewport.mobileProfile
        ),
        sweepRangeRatio,
        sweepPasses,
        upperLaneRatio: viewport.mobileProfile ? 0.13 : 0.12
      };
      const sampleEdge = (sequence, progress) => sampleHeliosMachineGunChannelMovement({
        ...input,
        sequence,
        stage: 'fire',
        progress
      });
      const aStart = sampleEdge(sequenceA, 0);
      const aEnd = sampleEdge(sequenceA, 1);
      const bStart = sampleEdge(sequenceB, 0);
      const bEnd = sampleEdge(sequenceB, 1);
      assert.equal(aStart.startX, bStart.endX, `${viewport.id}/${phase.id} must mirror its first edge`);
      assert.equal(aStart.endX, bStart.startX, `${viewport.id}/${phase.id} must mirror its final edge`);
      assert.equal(
        Math.abs(aStart.endX - aStart.startX),
        Math.abs(bStart.endX - bStart.startX),
        `${viewport.id}/${phase.id} mirrored uses must retain the same travel span`
      );
      let minimumLeftMargin = Infinity;
      let minimumRightMargin = Infinity;
      for (const sample of [aStart, aEnd, bStart, bEnd]) {
        const pose = sampleHeliosModularPose({
          frameCount: 0,
          reducedMotion: false,
          healthRatio: 1,
          phaseIndex: phaseCase.phaseIndex + 1,
          entranceProgress: 1,
          damageStage: phaseCase.phaseIndex,
          action: {
            primitiveId: 'paired-cannon-burst',
            stage: 'fire',
            progress: 0,
            sequence: sequenceA,
            motionCue: HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
            elapsedFrames: 0,
            durationFrames: phaseCase.totalFireFrames,
            projectileCount: action.parameters?.projectileCount,
            shotIntervalFrames: action.parameters?.shotIntervalFrames
          }
        });
        const hierarchy = resolveModularBossRigHierarchy(
          HELIOS_CLAWCARRIER_MODULAR_RIG,
          pose.partOverrides
        );
        const bounds = getStructuralScreenBounds(hierarchy, sample.x, sample.y);
        assert.ok(bounds.minX >= -EPSILON);
        assert.ok(bounds.maxX <= viewport.width + EPSILON);
        minimumLeftMargin = Math.min(minimumLeftMargin, bounds.minX);
        minimumRightMargin = Math.min(
          minimumRightMargin,
          viewport.width - bounds.maxX
        );
      }
      if (viewport.mobileProfile) {
        assert.ok(
          minimumLeftMargin <= 12,
          `${viewport.id}/${phase.id} visible rig stops ${minimumLeftMargin}px short of the left edge`
        );
        assert.ok(
          minimumRightMargin <= 12,
          `${viewport.id}/${phase.id} visible rig stops ${minimumRightMargin}px short of the right edge`
        );
      }
    }
  }
});

test('Helios moving machine-gun channel is continuous, open, and viewport-safe in every phase', () => {
  for (const viewport of VIEWPORTS) {
    for (const phaseCase of phaseCases) {
      const {
        phase,
        phaseIndex,
        action,
        warningFrames,
        segmentFrames,
        totalFireFrames,
        recoveryFrames
      } = phaseCase;
      const context = `${viewport.id}/${phase.id}`;
      const sequence = Number(action.parameters?.sequence) || 0;
      const shotIntervalFrames = Number(action.parameters?.shotIntervalFrames) || 3;
      const channelWidthPixels = Number(action.parameters?.channelWidthPixels) || 116;
      const sweepRangeRatio = Number(action.parameters?.sweepRangeRatio) || 0.34;
      const sweepPasses = Number(action.parameters?.sweepPasses) || 1;
      const anchorX = (viewport.width - BOSS_WIDTH) / 2;
      const anchorY = Math.max(72, Math.min(viewport.height * 0.13, 116));
      const movementInput = {
        sequence,
        anchorX,
        anchorY,
        arenaWidth: viewport.width,
        arenaHeight: viewport.height,
        bossWidth: BOSS_WIDTH,
        bossHeight: BOSS_HEIGHT,
        horizontalPadding: resolveHeliosMachineGunChannelHorizontalPadding(
          viewport.mobileProfile
        ),
        sweepRangeRatio,
        sweepPasses,
        upperLaneRatio: viewport.mobileProfile ? 0.13 : 0.12
      };
      const warningStart = sampleHeliosMachineGunChannelMovement({
        ...movementInput,
        stage: 'warning',
        progress: 0
      });
      const warningEnd = sampleHeliosMachineGunChannelMovement({
        ...movementInput,
        stage: 'warning',
        progress: 1
      });
      const fireStart = sampleHeliosMachineGunChannelMovement({
        ...movementInput,
        stage: 'fire',
        progress: 0
      });
      const fireEnd = sampleHeliosMachineGunChannelMovement({
        ...movementInput,
        stage: 'fire',
        progress: 1
      });
      const recoveryEnd = sampleHeliosMachineGunChannelMovement({
        ...movementInput,
        stage: 'recovery',
        progress: 1
      });
      const sweepTravel = Math.abs(fireStart.endX - fireStart.startX);
      const maximumBossStep = Math.max(
        pointDistance(warningStart, fireStart) * 1.6 / warningFrames,
        sweepTravel * sweepPasses * 1.6 / totalFireFrames,
        pointDistance(fireEnd, recoveryEnd) * 1.6 / recoveryFrames,
        0.5
      ) + 0.1;
      const targetPadding = resolveHeliosMachineGunChannelTargetPadding(
        viewport.mobileProfile,
        viewport.width
      );
      const targetTravel = Math.max(
        0,
        viewport.width - targetPadding * 2 - channelWidthPixels
      );
      const maximumTargetStep = Math.max(
        targetTravel * 0.5 * 1.6 / warningFrames,
        targetTravel * sweepPasses * 1.6 / totalFireFrames,
        targetTravel * 0.5 * 1.6 / recoveryFrames
      ) + 0.5;
      const maximumBoundaryStep = Math.max(
        maximumBossStep + 7,
        maximumTargetStep + 2
      );
      let previousSnapshot;
      let minimumViewportMargin = Infinity;
      let minimumMuzzleGap = Infinity;
      let minimumVisibleChannelGap = Infinity;
      let minimumPortTargetX = Infinity;
      let maximumStarboardTargetX = -Infinity;
      const firingPulses = [];
      const emissionOrigins = { port: [], starboard: [] };

      const inspectFrame = (stage, stageFrame, stageFrames, absoluteFrame) => {
        const progress = stageFrame / Math.max(1, stageFrames);
        const movement = sampleHeliosMachineGunChannelMovement({
          ...movementInput,
          stage,
          progress
        });
        const pose = sampleHeliosModularPose({
          frameCount: absoluteFrame,
          reducedMotion: false,
          healthRatio: phaseIndex === 0 ? 1 : phaseIndex === 1 ? 0.67 : 0.32,
          phaseIndex: phaseIndex + 1,
          entranceProgress: 1,
          damageStage: phaseIndex >= 2 ? 3 : phaseIndex,
          action: {
            primitiveId: 'paired-cannon-burst',
            stage,
            progress,
            sequence,
            motionCue: HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
            elapsedFrames: stage === 'fire' ? stageFrame : 0,
            durationFrames: totalFireFrames,
            projectileCount: action.parameters?.projectileCount,
            shotIntervalFrames
          }
        });
        const hierarchy = resolveModularBossRigHierarchy(
          HELIOS_CLAWCARRIER_MODULAR_RIG,
          pose.partOverrides
        );
        const bounds = getStructuralScreenBounds(hierarchy, movement.x, movement.y);
        const margins = [
          bounds.minX,
          viewport.width - bounds.maxX,
          bounds.minY,
          viewport.height - bounds.maxY
        ];
        minimumViewportMargin = Math.min(minimumViewportMargin, ...margins);
        assert.ok(
          margins.every((margin) => margin >= -EPSILON),
          `${context}/${stage}/${stageFrame} clips the structural rig: ${JSON.stringify(bounds)}`
        );

        const port = screenPointForSocket(
          hierarchy.socketById['rotary-muzzle-port'],
          movement.x,
          movement.y
        );
        const starboard = screenPointForSocket(
          hierarchy.socketById['rotary-muzzle-starboard'],
          movement.x,
          movement.y
        );
        const muzzleGap = starboard.x - port.x;
        minimumMuzzleGap = Math.min(minimumMuzzleGap, muzzleGap);
        assert.ok(muzzleGap > 0, `${context}/${stage}/${stageFrame} muzzle order crossed`);

        const targetY = viewport.height + (viewport.mobileProfile ? 44 : 64);
        const targets = resolveHeliosMachineGunChannelTargets({
          bossX: movement.x,
          startX: movement.startX,
          endX: movement.endX,
          arenaWidth: viewport.width,
          channelWidthPixels,
          edgePadding: resolveHeliosMachineGunChannelTargetPadding(
            viewport.mobileProfile,
            viewport.width
          )
        });
        const portAngle = Math.atan2(
          targetY - port.y,
          targets.portX - port.x
        );
        const starboardAngle = Math.atan2(
          targetY - starboard.y,
          targets.starboardX - starboard.x
        );
        assert.ok(Math.sin(portAngle) > 0, `${context}/${stage}/${stageFrame} port stream turned upward`);
        assert.ok(Math.sin(starboardAngle) > 0, `${context}/${stage}/${stageFrame} starboard stream turned upward`);
        assert.ok(
          targets.portX < targets.starboardX,
          `${context}/${stage}/${stageFrame} target boundaries crossed`
        );
        const portBoundaryX = projectRayToY(port, portAngle, viewport.height);
        const starboardBoundaryX = projectRayToY(starboard, starboardAngle, viewport.height);
        const visibleChannelGap = starboardBoundaryX - portBoundaryX;
        minimumVisibleChannelGap = Math.min(minimumVisibleChannelGap, visibleChannelGap);
        if (stage === 'fire') {
          minimumPortTargetX = Math.min(minimumPortTargetX, targets.portX);
          maximumStarboardTargetX = Math.max(
            maximumStarboardTargetX,
            targets.starboardX
          );
        }
        assert.ok(
          visibleChannelGap >= 80 - EPSILON,
          `${context}/${stage}/${stageFrame} channel closed to ${visibleChannelGap}`
        );

        const snapshot = {
          movement,
          port,
          starboard,
          portBoundaryX,
          starboardBoundaryX
        };
        if (previousSnapshot) {
          assert.ok(
            pointDistance(previousSnapshot.movement, movement) <= maximumBossStep,
            `${context}/${stage}/${stageFrame} boss sweep teleported`
          );
          assert.ok(
            pointDistance(previousSnapshot.port, port) <= maximumBoundaryStep,
            `${context}/${stage}/${stageFrame} port muzzle teleported`
          );
          assert.ok(
            pointDistance(previousSnapshot.starboard, starboard) <= maximumBoundaryStep,
            `${context}/${stage}/${stageFrame} starboard muzzle teleported`
          );
          assert.ok(
            Math.abs(previousSnapshot.portBoundaryX - portBoundaryX) <= maximumBoundaryStep,
            `${context}/${stage}/${stageFrame} port boundary teleported`
          );
          assert.ok(
            Math.abs(previousSnapshot.starboardBoundaryX - starboardBoundaryX) <= maximumBoundaryStep,
            `${context}/${stage}/${stageFrame} starboard boundary teleported`
          );
        }
        previousSnapshot = snapshot;

        if (stage === 'fire' && stageFrame < totalFireFrames) {
          const pulse = sampleHeliosMachineGunChannelPulse({
            elapsedFrames: stageFrame,
            durationFrames: totalFireFrames,
            sequence,
            intervalFrames: shotIntervalFrames
          });
          if (pulse?.firing) {
            assert.deepEqual(pulse.firingSides, ['port', 'starboard']);
            assert.equal(hierarchy.partById['muzzle.port'].visible, true);
            assert.equal(hierarchy.partById['muzzle.starboard'].visible, true);
            firingPulses.push(pulse);
            emissionOrigins.port.push(port);
            emissionOrigins.starboard.push(starboard);
          }
        }
      };

      for (let frame = 0; frame <= warningFrames; frame += 1) {
        inspectFrame('warning', frame, warningFrames, frame);
      }
      for (let frame = 0; frame <= totalFireFrames; frame += 1) {
        inspectFrame('fire', frame, totalFireFrames, warningFrames + frame);
      }
      for (let frame = 0; frame <= recoveryFrames; frame += 1) {
        inspectFrame(
          'recovery',
          frame,
          recoveryFrames,
          warningFrames + totalFireFrames + frame
        );
      }

      assert.ok(minimumViewportMargin >= -EPSILON, `${context} must remain in the viewport`);
      assert.ok(minimumMuzzleGap >= 60, `${context} gun boundaries closed to ${minimumMuzzleGap}`);
      assert.ok(
        minimumVisibleChannelGap >= 80 - EPSILON,
        `${context} visible channel narrowed below a ship-sized route`
      );
      assert.ok(
        minimumPortTargetX <= targetPadding + EPSILON,
        `${context} port wall never swept the left exterior gutter`
      );
      assert.ok(
        maximumStarboardTargetX >= viewport.width - targetPadding - EPSILON,
        `${context} starboard wall never swept the right exterior gutter`
      );
      assert.ok(firingPulses.length > 80, `${context} must sustain a rapid global stream`);
      assert.deepEqual(
        firingPulses.map((pulse) => pulse.shotIndex),
        firingPulses.map((_, index) => index),
        `${context} global shot indices must remain continuous`
      );
      for (let boundaryIndex = 1; boundaryIndex < action.repeat.count; boundaryIndex += 1) {
        const boundaryFrame = boundaryIndex * segmentFrames;
        const before = firingPulses.findLast((pulse) => pulse.elapsedFrames < boundaryFrame);
        const afterBoundary = firingPulses.find((pulse) => pulse.elapsedFrames >= boundaryFrame);
        assert.ok(before && afterBoundary, `${context}/segment-${boundaryIndex} must have adjacent shots`);
        assert.equal(afterBoundary.shotIndex, before.shotIndex + 1);
        assert.equal(
          afterBoundary.elapsedFrames - before.elapsedFrames,
          shotIntervalFrames,
          `${context}/segment-${boundaryIndex} cadence reset at the authored seam`
        );
        const boundary = sampleHeliosMachineGunChannelMovement({
          ...movementInput,
          stage: 'fire',
          progress: boundaryFrame / totalFireFrames
        });
        assert.ok(
          Math.abs(boundary.x - fireStart.x) > 1,
          `${context}/segment-${boundaryIndex} sweep reset to its first position`
        );
      }
      assert.ok(
        emissionOrigins.port.some((origin, index) => (
          index > 0 && pointDistance(emissionOrigins.port[index - 1], origin) > 0.05
        )),
        `${context} port rounds must sample moving live muzzle positions`
      );
      assert.ok(
        emissionOrigins.starboard.some((origin, index) => (
          index > 0 && pointDistance(emissionOrigins.starboard[index - 1], origin) > 0.05
        )),
        `${context} starboard rounds must sample moving live muzzle positions`
      );
      assert.deepEqual(
        [warningEnd.x, warningEnd.y],
        [fireStart.x, fireStart.y],
        `${context} warning must join the global fire sweep without a jump`
      );
      assert.deepEqual(
        [recoveryEnd.x, recoveryEnd.y],
        [anchorX, anchorY],
        `${context} recovery must return to the captured combat anchor`
      );
    }
  }
});
