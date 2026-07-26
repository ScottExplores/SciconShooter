import type {
  BossEvent,
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelinePrimitiveId,
  BossTimelineTelegraphStyle,
  BossTimelineTrackKind
} from './types';
import { BOSS_TIMELINE_PRIMITIVES } from './bossTimeline';

export type BossTimelineTemplateId = 'starter-loop' | 'advanced-showcase';

export interface BossTimelineTemplateDescriptor {
  id: BossTimelineTemplateId;
  label: string;
  description: string;
}

export const BOSS_TIMELINE_TEMPLATES: readonly BossTimelineTemplateDescriptor[] = Object.freeze([
  {
    id: 'starter-loop',
    label: 'Starter loop',
    description: 'One readable warning and one configurable aimed burst.'
  },
  {
    id: 'advanced-showcase',
    label: 'Advanced showcase',
    description: 'A non-shipping authoring fixture covering movement, projectile, laser, summon, shield, weak-point, rage, intro, and death primitives.'
  }
]);

const action = (
  id: string,
  primitiveId: BossTimelinePrimitiveId,
  startSeconds: number,
  phaseId: string | undefined,
  parameters?: BossTimelineClip['parameters'],
  extra: Partial<BossTimelineClip> = {}
): BossTimelineClip => {
  const primitive = BOSS_TIMELINE_PRIMITIVES[primitiveId];
  return {
    id,
    label: primitive.label,
    track: primitive.track,
    primitiveId,
    trigger: 'time',
    startSeconds,
    durationSeconds: 0.2,
    phaseId,
    parameters,
    ...extra
  };
};

const warningPair = ({
  id,
  primitiveId,
  startSeconds,
  phaseId,
  style = 'warning',
  color = '#fb7185',
  parameters,
  warningSeconds = 0.7,
  actionDurationSeconds = 0.2
}: {
  id: string;
  primitiveId: BossTimelinePrimitiveId;
  startSeconds: number;
  phaseId?: string;
  style?: BossTimelineTelegraphStyle;
  color?: string;
  parameters?: BossTimelineClip['parameters'];
  warningSeconds?: number;
  actionDurationSeconds?: number;
}): BossTimelineClip[] => {
  const warningId = `${id}-warning`;
  return [
    action(
      warningId,
      'telegraph',
      startSeconds,
      phaseId,
      { warningSeconds, telegraphStyle: style, color },
      { label: `${BOSS_TIMELINE_PRIMITIVES[primitiveId].label} warning`, durationSeconds: warningSeconds }
    ),
    action(
      id,
      primitiveId,
      startSeconds + warningSeconds,
      phaseId,
      parameters,
      { telegraphClipId: warningId, durationSeconds: actionDurationSeconds }
    )
  ];
};

const phaseClip = (
  id: string,
  primitiveId: BossTimelinePrimitiveId,
  phaseId: string | undefined,
  parameters?: BossTimelineClip['parameters'],
  track?: BossTimelineTrackKind
): BossTimelineClip => ({
  ...action(id, primitiveId, 0, phaseId, parameters),
  track: track ?? BOSS_TIMELINE_PRIMITIVES[primitiveId].track,
  trigger: 'phase-enter'
});

const starterLoop = (boss: BossEvent): BossTimelineConfig => {
  const phaseId = boss.phases[0]?.id;
  return {
    durationSeconds: 8,
    loop: true,
    clips: warningPair({
      id: 'starter-burst',
      primitiveId: 'aimed-burst',
      startSeconds: 0.5,
      phaseId,
      style: 'target',
      color: '#ffb454',
      parameters: { projectileCount: 5 }
    })
  };
};

const advancedShowcase = (boss: BossEvent): BossTimelineConfig => {
  const openingPhaseId = boss.phases[0]?.id;
  const ragePhaseId = boss.phases[1]?.id ?? openingPhaseId;
  const clips: BossTimelineClip[] = [
    phaseClip('intro-effect', 'effect-cue', openingPhaseId, { color: '#67e8f9' }),
    phaseClip('intro-camera', 'camera-cue', openingPhaseId, { strength: 1.2 }),
    phaseClip(
      'opening-movement',
      'set-movement',
      openingPhaseId,
      { movementPatternId: 'arena-roam', speedMultiplier: 0.9 }
    ),
    action(
      'opening-sweep-bank-reentry',
      'follow-path',
      0.1,
      openingPhaseId,
      { movementPathId: 'sweep-bank-reentry' },
      { durationSeconds: 8 }
    ),
    phaseClip('opening-shields', 'set-shield', openingPhaseId, { shieldCount: 3, enabled: true }),
    ...warningPair({
      id: 'aimed-burst',
      primitiveId: 'aimed-burst',
      startSeconds: 0.8,
      phaseId: openingPhaseId,
      style: 'target',
      parameters: { projectileCount: 5 }
    }),
    ...warningPair({
      id: 'gap-ring',
      primitiveId: 'gap-ring',
      startSeconds: 2.3,
      phaseId: openingPhaseId,
      style: 'ring',
      color: '#67e8f9',
      parameters: { projectileCount: 16, sequence: 0 }
    }),
    ...warningPair({
      id: 'cross-beam',
      primitiveId: 'cross-beam',
      startSeconds: 4,
      phaseId: openingPhaseId,
      style: 'lane',
      parameters: undefined
    }),
    ...warningPair({
      id: 'rail-sweep',
      primitiveId: 'rail-sweep',
      startSeconds: 5.5,
      phaseId: openingPhaseId,
      style: 'lane',
      color: '#f97316',
      parameters: { sequence: 1 }
    }),
    ...warningPair({
      id: 'summon-formation',
      primitiveId: 'summon-formation',
      startSeconds: 7,
      phaseId: openingPhaseId,
      style: 'warning',
      color: '#fbbf24',
      parameters: { summonCount: 4, enemyId: 'drone', formationPatternId: 'v' }
    }),
    ...warningPair({
      id: 'pod-volley',
      primitiveId: 'pod-volley',
      startSeconds: 8.5,
      phaseId: openingPhaseId,
      style: 'warning',
      color: '#ff9d2e',
      parameters: { projectileCount: 6, sequence: 0 }
    }),
    ...warningPair({
      id: 'rotor-hazard-sentence',
      primitiveId: 'rotor-hazard-sentence',
      startSeconds: 9.7,
      phaseId: openingPhaseId,
      style: 'ring',
      color: '#ff3bd4',
      parameters: { projectileCount: 6, sequence: 0, motionCue: 'rotor-volley' }
    }),
    action(
      'expose-helmet',
      'set-weak-point',
      9.4,
      openingPhaseId,
      { componentId: 'helmet', enabled: true }
    ),
    phaseClip('rage-effect', 'effect-cue', ragePhaseId, { color: '#f0abfc' }),
    phaseClip('rage-camera', 'camera-cue', ragePhaseId, { strength: 2.5 }),
    phaseClip(
      'rage-movement',
      'set-movement',
      ragePhaseId,
      { movementPatternId: 'gatekeeper-cycle', speedMultiplier: 1.35 }
    ),
    phaseClip('rage-shields-down', 'set-shield', ragePhaseId, { shieldCount: 0, enabled: false }),
    ...warningPair({
      id: 'tail-fan',
      primitiveId: 'tail-fan',
      startSeconds: 0.8,
      phaseId: ragePhaseId,
      style: 'warning',
      parameters: { projectileCount: 7, sequence: 2 }
    }),
    ...warningPair({
      id: 'inward-collapse',
      primitiveId: 'inward-collapse',
      startSeconds: 2.3,
      phaseId: ragePhaseId,
      style: 'target',
      color: '#8b5cf6',
      parameters: { projectileCount: 14, sequence: 3 }
    }),
    ...warningPair({
      id: 'rotating-cross',
      primitiveId: 'rotating-cross',
      startSeconds: 4,
      phaseId: ragePhaseId,
      style: 'ring',
      color: '#22d3ee',
      parameters: { projectileCount: 8, sequence: 4 }
    }),
    ...warningPair({
      id: 'helix-volley',
      primitiveId: 'helix-volley',
      startSeconds: 5.5,
      phaseId: ragePhaseId,
      style: 'lane',
      color: '#ec4899',
      parameters: { projectileCount: 8, sequence: 5, handedness: 'left' }
    }),
    ...warningPair({
      id: 'side-barrage',
      primitiveId: 'side-barrage',
      startSeconds: 7,
      phaseId: ragePhaseId,
      style: 'lane',
      color: '#fb7185',
      parameters: { projectileCount: 6, side: 'port' }
    }),
    ...warningPair({
      id: 'weave-wall',
      primitiveId: 'weave-wall',
      startSeconds: 8.5,
      phaseId: ragePhaseId,
      style: 'lane',
      color: '#67e8f9',
      parameters: { projectileCount: 18, sequence: 0 }
    }),
    ...warningPair({
      id: 'radial-beam-array',
      primitiveId: 'radial-beam-array',
      startSeconds: 9.7,
      phaseId: ragePhaseId,
      style: 'spokes',
      color: '#f43f5e',
      parameters: { sequence: 0, motionCue: 'radial-beam' }
    }),
    ...warningPair({
      id: 'corner-ambush-beam',
      primitiveId: 'corner-ambush-beam',
      startSeconds: 10.5,
      phaseId: ragePhaseId,
      style: 'target',
      color: '#ef4444',
      parameters: { sequence: 1 },
      warningSeconds: 0.8,
      actionDurationSeconds: 0.7
    }),
    ...warningPair({
      id: 'corner-ambush-ram',
      primitiveId: 'corner-ambush-ram',
      startSeconds: 10.65,
      phaseId: ragePhaseId,
      style: 'target',
      color: '#ff3348',
      parameters: { sequence: 0 },
      warningSeconds: 0.8,
      actionDurationSeconds: 0.7
    }),
    ...warningPair({
      id: 'paired-cannon-burst',
      primitiveId: 'paired-cannon-burst',
      startSeconds: 12.2,
      phaseId: ragePhaseId,
      parameters: {
        projectileCount: 6,
        side: 'port',
        sequence: 0,
        motionCue: 'paired-crossfire'
      }
    }),
    ...warningPair({
      id: 'articulated-melee-sweep',
      primitiveId: 'articulated-melee-sweep',
      startSeconds: 13.6,
      phaseId: ragePhaseId,
      parameters: { side: 'starboard', sequence: 0, motionCue: 'claw-sweep' },
      actionDurationSeconds: 0.8
    }),
    ...warningPair({
      id: 'reactor-aperture-pattern',
      primitiveId: 'reactor-aperture-pattern',
      startSeconds: 15.3,
      phaseId: ragePhaseId,
      style: 'ring',
      parameters: {
        projectileCount: 18,
        sequence: 1,
        rotationDirection: 'clockwise',
        motionCue: 'reactor-pattern'
      }
    }),
    ...warningPair({
      id: 'tracking-pincer-dive',
      primitiveId: 'tracking-pincer-dive',
      startSeconds: 16.7,
      phaseId: ragePhaseId,
      parameters: { sequence: 0, motionCue: 'pincer-dive' },
      actionDurationSeconds: 0.7
    }),
    {
      ...action('death-effect', 'effect-cue', 0, undefined, { color: '#ffffff' }),
      trigger: 'death',
      durationSeconds: 0.8
    },
    {
      ...action('death-camera', 'camera-cue', 0, undefined, { strength: 4 }),
      trigger: 'death',
      durationSeconds: 0.4
    }
  ];

  return {
    durationSeconds: 18.2,
    loop: true,
    clips
  };
};

export const createBossTimelineTemplate = (
  templateId: BossTimelineTemplateId,
  boss: BossEvent
): BossTimelineConfig => (
  templateId === 'advanced-showcase' ? advancedShowcase(boss) : starterLoop(boss)
);
