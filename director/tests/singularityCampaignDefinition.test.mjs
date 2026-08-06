import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { validateGameCampaign as validateServerCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(
  path.join(repositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));
const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom'
});
after(async () => vite.close());

const { compileBossAttackTimeline } = await vite.ssrLoadModule(
  '/game-config/bossAttackSentences.ts'
);
const { validateGameCampaign: validateBrowserCampaign } = await vite.ssrLoadModule(
  '/game-config/validate.ts'
);

const PHASES = [
  {
    id: 'gravitational-calibration',
    label: 'Gravitational Calibration',
    triggerHealthRatio: 1,
    speedMultiplier: 0.78,
    color: '#f97316',
    cameraStrength: 0.8,
    availableAttackIds: [
      'gravity-well-genesis',
      'event-horizon-gaze',
      'orbital-pylon-barrage'
    ]
  },
  {
    id: 'spatial-compression',
    label: 'Spatial Compression',
    triggerHealthRatio: 0.7,
    speedMultiplier: 0.88,
    color: '#ef4444',
    cameraStrength: 1.3,
    availableAttackIds: [
      'gravity-well-genesis',
      'event-horizon-gaze',
      'tidal-claw-pincer',
      'orbital-pylon-barrage',
      'singularity-pulse'
    ]
  },
  {
    id: 'event-horizon-instability',
    label: 'Event Horizon Instability',
    triggerHealthRatio: 0.35,
    speedMultiplier: 1,
    color: '#e11d48',
    cameraStrength: 1.8,
    availableAttackIds: [
      'gravity-well-genesis',
      'event-horizon-gaze',
      'tidal-claw-pincer',
      'orbital-pylon-barrage',
      'singularity-pulse',
      'gravity-collapse'
    ]
  }
];

const ATTACKS = [
  {
    id: 'gravity-well-genesis',
    label: 'Gravity Well Genesis',
    role: 'core',
    skillTest: 'gap-tracking',
    recognitionCue: 'The core compresses two gravity seeds before casting them into the upper arena.',
    solution: 'Read each forming well, cross its quiet side, and never wait beneath an implosion.',
    safeRouteRule: 'opposite-side-dodge',
    sourceSocketRoles: ['core'],
    primitiveId: 'singularity-gravity-well-genesis',
    telegraphStyle: 'target',
    phaseStartSeconds: [0, 0, 0],
    offsets: [0, 2.2],
    leadSeconds: 0.9,
    actionDurationSeconds: 0.35,
    recoverySeconds: 0.9,
    parameters: (phaseIndex, beatIndex) => ({
      projectileCount: phaseIndex === 0 ? 2 : 3,
      sequence: phaseIndex * 2 + beatIndex,
      motionCue: 'singularity-well-genesis',
      rotationDirection: beatIndex % 2 === 0 ? 'clockwise' : 'counterclockwise'
    })
  },
  {
    id: 'event-horizon-gaze',
    label: 'Event Horizon Gaze',
    role: 'core',
    skillTest: 'lane-routing',
    recognitionCue: 'The central lens tracks, locks, and brightens before the damaging horizon appears.',
    solution: 'Move during tracking, respect the lock, then ride the warned fixed, sweeping, or split lane.',
    safeRouteRule: 'shifting-channel',
    sourceSocketRoles: ['core'],
    primitiveId: 'singularity-event-horizon-gaze',
    telegraphStyle: 'lane',
    phaseStartSeconds: [14, 8, 7],
    offsets: [0, 2.5],
    leadSeconds: 1,
    actionDurationSeconds: 0.45,
    recoverySeconds: 1,
    parameters: (phaseIndex, beatIndex) => ({
      sequence: phaseIndex * 2 + beatIndex,
      motionCue: 'singularity-event-horizon-gaze',
      rotationDirection: phaseIndex === 2 ? 'seeded-random' : 'clockwise'
    })
  },
  {
    id: 'tidal-claw-pincer',
    label: 'Tidal Claw Pincer',
    role: 'core',
    skillTest: 'gap-tracking',
    recognitionCue: 'Both lower claws brace wide, then curl inward around one readable center route.',
    solution: 'Commit to the warned middle route and follow the staggered claw that closes second.',
    safeRouteRule: 'shifting-channel',
    sourceSocketRoles: ['port', 'starboard'],
    primitiveId: 'singularity-tidal-claw-pincer',
    telegraphStyle: 'lane',
    phaseStartSeconds: [null, 16, 14],
    offsets: [0, 2.1],
    leadSeconds: 0.8,
    actionDurationSeconds: 0.55,
    recoverySeconds: 1,
    parameters: (phaseIndex, beatIndex) => ({
      sequence: phaseIndex * 2 + beatIndex,
      motionCue: 'singularity-tidal-pincer'
    })
  },
  {
    id: 'orbital-pylon-barrage',
    label: 'Orbital Pylon Barrage',
    role: 'core',
    skillTest: 'rhythm-dodge',
    recognitionCue: 'The four pylons ignite one after another in their exact firing order.',
    solution: 'Cross a pylon lane only after its visible recoil, then answer the next lit socket.',
    safeRouteRule: 'opposite-side-dodge',
    sourceSocketRoles: ['port', 'starboard'],
    primitiveId: 'singularity-orbital-pylon-barrage',
    telegraphStyle: 'target',
    phaseStartSeconds: [28.5, 24, 21],
    offsets: [0, 2],
    leadSeconds: 0.75,
    actionDurationSeconds: 0.5,
    recoverySeconds: 0.9,
    parameters: (phaseIndex, beatIndex) => ({
      projectileCount: [8, 12, 16][phaseIndex],
      sequence: phaseIndex * 2 + beatIndex,
      motionCue: 'singularity-pylon-barrage',
      shotIntervalFrames: phaseIndex === 2 ? 7 : 9,
      projectileSpeedScale: phaseIndex === 0 ? 0.9 : phaseIndex === 1 ? 1 : 1.1
    })
  },
  {
    id: 'singularity-pulse',
    label: 'Singularity Pulse',
    role: 'core',
    skillTest: 'gap-tracking',
    recognitionCue: 'The core expands into a bright gravity ring with two opposing dark notches.',
    solution: 'Enter either warned notch and rotate with its opening while the pulse expands.',
    safeRouteRule: 'rotating-gap',
    sourceSocketRoles: ['core'],
    primitiveId: 'singularity-pulse',
    telegraphStyle: 'ring',
    phaseStartSeconds: [null, 32, 28],
    offsets: [0, 2.4],
    leadSeconds: 0.9,
    actionDurationSeconds: 0.45,
    recoverySeconds: 1.1,
    parameters: (phaseIndex, beatIndex) => ({
      projectileCount: phaseIndex === 1 ? 20 : 24,
      sequence: phaseIndex * 2 + beatIndex,
      motionCue: 'singularity-pulse',
      rotationDirection: beatIndex % 2 === 0 ? 'clockwise' : 'counterclockwise'
    })
  },
  {
    id: 'gravity-collapse',
    label: 'Gravity Collapse',
    role: 'signature',
    skillTest: 'route-combination',
    recognitionCue: 'Every pylon folds inward while three warned wells align around the compressed core.',
    solution: 'Read the implosion order, rotate through each released quadrant, then punish the exhausted core.',
    safeRouteRule: 'channel-to-quadrant',
    sourceSocketRoles: ['core', 'port', 'starboard'],
    primitiveId: 'singularity-gravity-collapse',
    telegraphStyle: 'ring',
    phaseStartSeconds: [null, null, 35],
    offsets: [0, 1.9, 3.8, 5.7],
    leadSeconds: 1.1,
    actionDurationSeconds: 0.55,
    recoverySeconds: 1.3,
    parameters: (_phaseIndex, beatIndex) => ({
      projectileCount: 3,
      sequence: beatIndex,
      motionCue: 'singularity-gravity-collapse',
      rotationDirection: beatIndex % 2 === 0 ? 'clockwise' : 'counterclockwise'
    })
  }
];

const createSingularityTimelineBlueprint = () => ({
  durationSeconds: 44,
  loop: true,
  attackAvailability: 'phase-subset',
  attackOrder: ATTACKS.map((attack) => attack.id),
  phases: PHASES.map((phase, phaseIndex) => ({
    phaseId: phase.id,
    color: phase.color,
    cameraStrength: phase.cameraStrength,
    attacks: ATTACKS
      .filter((attack) => attack.phaseStartSeconds[phaseIndex] !== null)
      .map((attack) => ({
        id: attack.id,
        label: attack.label,
        phaseId: phase.id,
        role: attack.role,
        skillTest: attack.skillTest,
        recognitionCue: attack.recognitionCue,
        solution: attack.solution,
        safeRouteRule: attack.safeRouteRule,
        sourceSocketRoles: attack.sourceSocketRoles,
        startSeconds: attack.phaseStartSeconds[phaseIndex],
        recoverySeconds: attack.recoverySeconds,
        color: phase.color,
        beats: attack.offsets.map((offsetSeconds, beatIndex) => ({
          id: `beat-${beatIndex + 1}`,
          label: `${attack.label} beat ${beatIndex + 1}`,
          primitiveId: attack.primitiveId,
          offsetSeconds,
          leadSeconds: attack.leadSeconds,
          actionDurationSeconds: attack.actionDurationSeconds,
          telegraphStyle: attack.telegraphStyle,
          parameters: attack.parameters(phaseIndex, beatIndex)
        }))
      }))
  }))
});

const mission35Boss = campaign.levels
  .find((level) => level.order === 35)
  ?.waves.flatMap((wave) => wave.events)
  .find((event) => event.id === 'stage-singularity-reach-commander-major-boss');

test('Mission 35 owns the exact three-phase Singularity Reach Commander campaign contract', () => {
  assert.ok(mission35Boss, 'Mission 35 Singularity Reach Commander exists');
  assert.equal(mission35Boss.bossId, 'singularity-crab');
  assert.equal(mission35Boss.health, 2700, 'Mission 35 preserves its progression-aligned durability');
  assert.equal(mission35Boss.componentMode, 'hull-only');
  assert.equal(mission35Boss.shieldCount, 0);
  assert.equal(
    mission35Boss.timeline.clips.some((clip) => clip.primitiveId === 'set-shield'),
    false,
    'the obsolete generic escort shield is absent from the authored fight'
  );
  assert.deepEqual(
    mission35Boss.phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      triggerHealthRatio: phase.triggerHealthRatio,
      speedMultiplier: phase.speedMultiplier
    })),
    PHASES.map((phase) => ({
      id: phase.id,
      label: phase.label,
      triggerHealthRatio: phase.triggerHealthRatio,
      speedMultiplier: phase.speedMultiplier
    }))
  );
});

test('Mission 35 compiles the stable six-attack roster with exact 3/5/6 phase availability', () => {
  const expectedTimeline = compileBossAttackTimeline(createSingularityTimelineBlueprint());
  assert.deepEqual(
    mission35Boss.timeline,
    expectedTimeline,
    'campaign JSON must remain byte-for-byte equivalent to the typed Singularity blueprint'
  );
  assert.equal(mission35Boss.timeline.attackAvailability, 'phase-subset');
  assert.deepEqual(
    mission35Boss.timeline.attacks.map((attack) => attack.id),
    ATTACKS.map((attack) => attack.id)
  );
  assert.deepEqual(
    PHASES.map((phase) => mission35Boss.timeline.attacks
      .filter((attack) => attack.variants.some((variant) => variant.phaseId === phase.id))
      .map((attack) => attack.id)),
    PHASES.map((phase) => phase.availableAttackIds)
  );
  assert.deepEqual(
    PHASES.map((phase) => mission35Boss.timeline.attacks
      .filter((attack) => attack.variants.some((variant) => variant.phaseId === phase.id)).length),
    [3, 5, 6]
  );
  assert.equal(mission35Boss.timeline.attacks.filter((attack) => attack.role === 'signature').length, 1);
  assert.equal(
    mission35Boss.timeline.attacks.find((attack) => attack.role === 'signature').id,
    'gravity-collapse'
  );

  const clipsById = new Map(mission35Boss.timeline.clips.map((clip) => [clip.id, clip]));
  for (const definition of ATTACKS) {
    const attack = mission35Boss.timeline.attacks.find((candidate) => candidate.id === definition.id);
    assert.ok(attack, `${definition.id} remains in the stable global roster`);
    assert.deepEqual(
      {
        role: attack.role,
        skillTest: attack.skillTest,
        safeRouteRule: attack.safeRouteRule,
        sourceSocketRoles: attack.sourceSocketRoles
      },
      {
        role: definition.role,
        skillTest: definition.skillTest,
        safeRouteRule: definition.safeRouteRule,
        sourceSocketRoles: definition.sourceSocketRoles
      },
      `${definition.id} keeps its distinct combat role and anatomy-owned solution`
    );
    for (const variant of attack.variants) {
      for (const beatClipId of variant.beatClipIds) {
        const beat = clipsById.get(beatClipId);
        const warning = clipsById.get(beat?.telegraphClipId);
        assert.equal(beat?.primitiveId, definition.primitiveId);
        assert.ok(warning, `${beatClipId} owns a warning clip`);
        assert.ok(warning.durationSeconds >= 0.75, `${beatClipId} has readable mobile warning time`);
        assert.ok(warning.startSeconds < beat.startSeconds, `${beatClipId} cannot damage before warning`);
      }
    }
  }
});

test('Mission 35 is accepted identically by the browser and local-server campaign validators', () => {
  const browserResult = validateBrowserCampaign(campaign);
  const serverResult = validateServerCampaign(campaign);
  assert.equal(
    browserResult.valid,
    true,
    browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );
  assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
});
