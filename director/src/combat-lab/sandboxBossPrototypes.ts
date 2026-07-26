import type {
  BossEvent,
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelinePrimitiveId,
  BossTimelineTelegraphStyle,
  GameCampaignConfig
} from '@game/game-config/types';
import {
  compileBossAttackTimeline,
  type BossAttackBeatBlueprint,
  type BossAttackPhaseBlueprint
} from '@game/game-config/bossAttackSentences';
import { assertValidGameCampaign } from '@game/game-config/validate';
import type { CombatLabPreviewResult } from './experimentModel';

export type SandboxBossPrototypeId =
  | 'sweep-bank-reentry'
  | 'prism-moth-brood'
  | 'weak-point-laser-core'
  | 'meridian-harrower'
  | 'helios-clawcarrier'
  | 'aurora-storm-engine'
  | 'umbra-needlewing'
  | 'cinderjaw-siege-beetle'
  | 'gloamforge-mantis'
  | 'vesperglass-mothmother'
  | 'twin-halo-wardens'
  | 'riftcoil-wyrm'
  | 'nullwake-revenant';

export interface SandboxBossPrototypeProvenance {
  readonly schemaVersion: 1;
  readonly source: 'director-sandbox-prototype';
  readonly sandboxOnly: true;
  readonly promotionAllowed: false;
  readonly prototypeId: SandboxBossPrototypeId;
  readonly prototypeHash: string;
  readonly previewHash: string;
}

export interface SandboxBossPrototypePreview extends CombatLabPreviewResult {
  readonly sandboxPrototype: SandboxBossPrototypeProvenance;
}

export interface SandboxBossPrototypeDescriptor {
  readonly id: SandboxBossPrototypeId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly designIntent: readonly string[];
  readonly sandboxOnly: true;
  readonly prototypeHash: string;
  buildPreview(sourceCampaign: GameCampaignConfig): SandboxBossPrototypePreview;
}

type PrototypeTimelineParameters = NonNullable<BossTimelineClip['parameters']>;

interface PrototypeDefinition {
  readonly id: SandboxBossPrototypeId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly designIntent: readonly string[];
  readonly boss: Readonly<BossEvent>;
}

const clone = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const deepFreeze = <T,>(value: T): T => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(',')}}`;
};

/**
 * Stable browser-safe fingerprint for ephemeral prototype metadata. Runtime
 * content hashes remain SHA-256; this deliberately separate namespace cannot
 * be mistaken for a campaign/workspace hash.
 */
const prototypeFingerprint = (value: unknown): string => {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalJson(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `sandbox-fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

const primitiveTracks: Record<BossTimelinePrimitiveId, BossTimelineClip['track']> = {
  telegraph: 'presentation',
  'aimed-burst': 'attack',
  'gap-ring': 'attack',
  'rotor-hazard-sentence': 'attack',
  'radial-beam-array': 'laser',
  'corner-ambush-beam': 'laser',
  'corner-ambush-ram': 'movement',
  'paired-cannon-burst': 'attack',
  'articulated-melee-sweep': 'attack',
  'reactor-aperture-pattern': 'attack',
  'tracking-pincer-dive': 'attack',
  'cross-beam': 'laser',
  'rail-sweep': 'laser',
  'tail-fan': 'attack',
  'inward-collapse': 'attack',
  'rotating-cross': 'attack',
  'helix-volley': 'attack',
  'side-barrage': 'attack',
  'pod-volley': 'attack',
  'weave-wall': 'attack',
  'summon-formation': 'summon',
  'set-shield': 'defense',
  'set-weak-point': 'defense',
  'set-movement': 'movement',
  'follow-path': 'movement',
  'effect-cue': 'presentation',
  'camera-cue': 'presentation'
};

const primitiveLabels: Record<BossTimelinePrimitiveId, string> = {
  telegraph: 'Telegraph',
  'aimed-burst': 'Aimed burst',
  'gap-ring': 'Gap ring',
  'rotor-hazard-sentence': 'Rotor hazard sentence',
  'radial-beam-array': 'Radial beam array',
  'corner-ambush-beam': 'Corner ambush beam',
  'corner-ambush-ram': 'Corner ambush ram',
  'paired-cannon-burst': 'Paired cannon burst',
  'articulated-melee-sweep': 'Articulated melee sweep',
  'reactor-aperture-pattern': 'Reactor aperture pattern',
  'tracking-pincer-dive': 'Tracking pincer dive',
  'cross-beam': 'Cross beam',
  'rail-sweep': 'Rail sweep',
  'tail-fan': 'Tail fan',
  'inward-collapse': 'Inward collapse',
  'rotating-cross': 'Rotating cross',
  'helix-volley': 'Helix volley',
  'side-barrage': 'Side barrage',
  'pod-volley': 'Pod volley',
  'weave-wall': 'Weave wall',
  'summon-formation': 'Summon formation',
  'set-shield': 'Set shield ring',
  'set-weak-point': 'Set weak point',
  'set-movement': 'Set movement',
  'follow-path': 'Follow path',
  'effect-cue': 'Effect cue',
  'camera-cue': 'Camera cue'
};

const clip = (
  id: string,
  primitiveId: BossTimelinePrimitiveId,
  startSeconds: number,
  phaseId: string | undefined,
  parameters?: PrototypeTimelineParameters,
  extra: Partial<BossTimelineClip> = {}
): BossTimelineClip => ({
  id,
  label: primitiveLabels[primitiveId],
  track: primitiveTracks[primitiveId],
  primitiveId,
  trigger: 'time',
  startSeconds,
  durationSeconds: 0.2,
  phaseId,
  parameters,
  ...extra
});

const phaseCue = (
  id: string,
  primitiveId: Exclude<BossTimelinePrimitiveId, 'follow-path'>,
  phaseId: string,
  parameters?: PrototypeTimelineParameters
): BossTimelineClip => ({
  ...clip(id, primitiveId, 0, phaseId, parameters),
  trigger: 'phase-enter'
});

const warned = ({
  id,
  primitiveId,
  startSeconds,
  phaseId,
  style,
  color,
  parameters,
  leadSeconds = 0.8,
  actionDurationSeconds = 0.2,
  repeat,
  label
}: {
  id: string;
  primitiveId: Exclude<BossTimelinePrimitiveId, 'telegraph' | 'follow-path'>;
  startSeconds: number;
  phaseId: string;
  style: BossTimelineTelegraphStyle;
  color: string;
  parameters?: PrototypeTimelineParameters;
  leadSeconds?: number;
  actionDurationSeconds?: number;
  repeat?: BossTimelineClip['repeat'];
  label?: string;
}): BossTimelineClip[] => {
  const warningId = `${id}-warning`;
  return [
    clip(
      warningId,
      'telegraph',
      startSeconds,
      phaseId,
      { warningSeconds: leadSeconds, telegraphStyle: style, color },
      {
        label: `${label ?? primitiveLabels[primitiveId]} warning`,
        durationSeconds: leadSeconds,
        ...(repeat ? { repeat } : {})
      }
    ),
    clip(
      id,
      primitiveId,
      startSeconds + leadSeconds,
      phaseId,
      parameters,
      {
        ...(label ? { label } : {}),
        telegraphClipId: warningId,
        durationSeconds: actionDurationSeconds,
        ...(repeat ? { repeat } : {})
      }
    )
  ];
};

type PrototypeDamagingPrimitiveId = Exclude<
  BossTimelinePrimitiveId,
  | 'telegraph'
  | 'set-shield'
  | 'set-weak-point'
  | 'set-movement'
  | 'follow-path'
  | 'effect-cue'
  | 'camera-cue'
>;

interface SerialAttackStep {
  readonly id: string;
  readonly label?: string;
  readonly primitiveId: PrototypeDamagingPrimitiveId;
  readonly style: BossTimelineTelegraphStyle;
  readonly parameters?: PrototypeTimelineParameters;
  readonly leadSeconds?: number;
  readonly actionDurationSeconds?: number;
  readonly recoverySeconds?: number;
  readonly repeat?: BossTimelineClip['repeat'];
}

interface SerialPhaseTimeline {
  readonly phaseId: string;
  readonly color: string;
  readonly cameraStrength?: number;
  readonly steps: readonly SerialAttackStep[];
}

/**
 * Test-boss attack sentences are intentionally linear: show the exact danger,
 * commit one authored action, then publish a visible recovery beat. A generous
 * twelve-second cadence leaves room to traverse the route on a phone viewport.
 */
const serialAttackSentence = (
  phaseId: string,
  color: string,
  startSeconds: number,
  step: SerialAttackStep
): BossTimelineClip[] => {
  const leadSeconds = step.leadSeconds ?? 0.9;
  const actionDurationSeconds = step.actionDurationSeconds ?? 0.8;
  const recoverySeconds = step.recoverySeconds ?? 1.8;
  const repeatSpan = step.repeat
    ? Math.max(0, step.repeat.count - 1) * step.repeat.intervalSeconds
    : 0;
  const recoveryStartSeconds = startSeconds + leadSeconds + actionDurationSeconds + repeatSpan;
  return [
    ...warned({
      id: step.id,
      primitiveId: step.primitiveId,
      startSeconds,
      phaseId,
      style: step.style,
      color,
      parameters: step.parameters,
      leadSeconds,
      actionDurationSeconds,
      repeat: step.repeat,
      label: step.label
    }),
    clip(
      `${step.id}-recovery`,
      'effect-cue',
      recoveryStartSeconds,
      phaseId,
      { color },
      { label: 'Recovery window', durationSeconds: recoverySeconds }
    )
  ];
};

const serialBossTimeline = (
  phases: readonly SerialPhaseTimeline[],
  durationSeconds = 90
): BossTimelineConfig => ({
  durationSeconds,
  loop: true,
  clips: phases.flatMap((phase) => [
    phaseCue(
      `${phase.phaseId}-identity`,
      'effect-cue',
      phase.phaseId,
      { color: phase.color }
    ),
    ...(phase.cameraStrength === undefined
      ? []
      : [phaseCue(
          `${phase.phaseId}-camera`,
          'camera-cue',
          phase.phaseId,
          { strength: phase.cameraStrength }
        )]),
    ...phase.steps.flatMap((step, index) => (
      serialAttackSentence(phase.phaseId, phase.color, 2 + (index * 12), step)
    ))
  ])
});

const gatekeeperBoss = ({
  id,
  label,
  rigId,
  spriteKey,
  health,
  shieldCount,
  componentMode,
  revival,
  phases,
  timeline,
  speed = 2.1,
  sizeMultiplier = 1,
  burstIntervalSeconds = 1.1,
  beamIntervalSeconds = 2.4
}: Pick<BossEvent, 'id' | 'label' | 'rigId' | 'spriteKey' | 'health' | 'shieldCount' | 'phases' | 'timeline'> & {
  componentMode?: BossEvent['componentMode'];
  revival?: BossEvent['revival'];
  speed?: number;
  sizeMultiplier?: number;
  burstIntervalSeconds?: number;
  beamIntervalSeconds?: number;
}): BossEvent => ({
  id,
  kind: 'boss',
  label,
  startSeconds: 0,
  durationSeconds: 90,
  delayAfterSeconds: 0,
  blocksWaveClock: true,
  bossId: 'gatekeeper',
  rigId,
  componentMode,
  spriteKey,
  positionId: 'center-top',
  movementPatternId: 'arena-roam',
  warningSeconds: 1.2,
  health,
  speed,
  damage: 1,
  scoreReward: 0,
  powerupDropChance: 0,
  shieldCount,
  sizeMultiplier,
  ...(revival ? { revival } : {}),
  weapons: [
    {
      id: `${id}-burst`,
      weaponId: 'burst-volley',
      attackIntervalSeconds: burstIntervalSeconds,
      damage: 1,
      projectileSpeed: 5.8,
      burstCount: 4
    },
    {
      id: `${id}-beam`,
      weaponId: 'lane-beam',
      attackIntervalSeconds: beamIntervalSeconds,
      damage: 1,
      projectileSpeed: 5,
      burstCount: 1
    }
  ],
  phases,
  timeline
});

const sweepOpening = 'sandbox-sweep-opening';
const sweepRage = 'sandbox-sweep-rage';
const sweepTimeline: BossTimelineConfig = {
  durationSeconds: 14,
  loop: true,
  clips: [
    phaseCue('sandbox-sweep-intro-fx', 'effect-cue', sweepOpening, { color: '#38bdf8' }),
    phaseCue('sandbox-sweep-intro-camera', 'camera-cue', sweepOpening, { strength: 1.3 }),
    clip(
      'sandbox-sweep-path-opening',
      'follow-path',
      0.1,
      sweepOpening,
      { movementPathId: 'sweep-bank-reentry' },
      { durationSeconds: 6.4 }
    ),
    ...warned({
      id: 'sandbox-sweep-opening-rail',
      primitiveId: 'rail-sweep',
      startSeconds: 1.5,
      phaseId: sweepOpening,
      style: 'lane',
      color: '#38bdf8',
      parameters: { sequence: 0 }
    }),
    ...warned({
      id: 'sandbox-sweep-opening-tail',
      primitiveId: 'tail-fan',
      startSeconds: 4.5,
      phaseId: sweepOpening,
      style: 'warning',
      color: '#f59e0b',
      parameters: { projectileCount: 7, sequence: 1 }
    }),
    ...warned({
      id: 'sandbox-sweep-opening-ring',
      primitiveId: 'gap-ring',
      startSeconds: 8.4,
      phaseId: sweepOpening,
      style: 'ring',
      color: '#22d3ee',
      parameters: { projectileCount: 16, sequence: 2 }
    }),
    phaseCue('sandbox-sweep-rage-fx', 'effect-cue', sweepRage, { color: '#fb7185' }),
    phaseCue('sandbox-sweep-rage-camera', 'camera-cue', sweepRage, { strength: 2.4 }),
    clip(
      'sandbox-sweep-path-rage',
      'follow-path',
      0.1,
      sweepRage,
      { movementPathId: 'sweep-bank-reentry' },
      { durationSeconds: 4.8 }
    ),
    ...warned({
      id: 'sandbox-sweep-rage-barrage',
      primitiveId: 'side-barrage',
      startSeconds: 1.2,
      phaseId: sweepRage,
      style: 'lane',
      color: '#fb7185',
      parameters: { projectileCount: 8, side: 'port' }
    }),
    ...warned({
      id: 'sandbox-sweep-rage-rail',
      primitiveId: 'rail-sweep',
      startSeconds: 5.5,
      phaseId: sweepRage,
      style: 'lane',
      color: '#f97316',
      parameters: { sequence: 3 }
    }),
    ...warned({
      id: 'sandbox-sweep-rage-helix',
      primitiveId: 'helix-volley',
      startSeconds: 9,
      phaseId: sweepRage,
      style: 'warning',
      color: '#f0abfc',
      parameters: { projectileCount: 10, sequence: 4, handedness: 'right' }
    })
  ]
};

const mothOpening = 'sandbox-moth-opening';
const mothBrood = 'sandbox-moth-brood';
const mothRage = 'sandbox-moth-rage';
const mothTimeline: BossTimelineConfig = {
  durationSeconds: 14,
  loop: true,
  clips: [
    phaseCue('sandbox-moth-opening-fx', 'effect-cue', mothOpening, { color: '#e879f9' }),
    phaseCue('sandbox-moth-opening-move', 'set-movement', mothOpening, {
      movementPatternId: 'arena-roam',
      speedMultiplier: 0.9
    }),
    phaseCue('sandbox-moth-left-wing', 'set-weak-point', mothOpening, {
      componentId: 'left-cannon',
      enabled: true
    }),
    ...warned({
      id: 'sandbox-moth-opening-burst',
      primitiveId: 'aimed-burst',
      startSeconds: 1,
      phaseId: mothOpening,
      style: 'target',
      color: '#f0abfc',
      parameters: { projectileCount: 5 }
    }),
    ...warned({
      id: 'sandbox-moth-opening-bricks',
      primitiveId: 'summon-formation',
      startSeconds: 3.5,
      phaseId: mothOpening,
      style: 'warning',
      color: '#facc15',
      parameters: { summonCount: 5, enemyId: 'brick', formationPatternId: 'grid' }
    }),
    ...warned({
      id: 'sandbox-moth-opening-ring',
      primitiveId: 'gap-ring',
      startSeconds: 7,
      phaseId: mothOpening,
      style: 'ring',
      color: '#c084fc',
      parameters: { projectileCount: 18, sequence: 1 }
    }),
    ...warned({
      id: 'sandbox-moth-opening-cross',
      primitiveId: 'rotating-cross',
      startSeconds: 10.2,
      phaseId: mothOpening,
      style: 'ring',
      color: '#67e8f9',
      parameters: { projectileCount: 8, sequence: 2 }
    }),
    phaseCue('sandbox-moth-brood-camera', 'camera-cue', mothBrood, { strength: 1.8 }),
    phaseCue('sandbox-moth-brood-shield', 'set-shield', mothBrood, { shieldCount: 2, enabled: true }),
    phaseCue('sandbox-moth-right-wing', 'set-weak-point', mothBrood, {
      componentId: 'right-cannon',
      enabled: true
    }),
    ...warned({
      id: 'sandbox-moth-brood-helix',
      primitiveId: 'helix-volley',
      startSeconds: 1,
      phaseId: mothBrood,
      style: 'warning',
      color: '#e879f9',
      parameters: { projectileCount: 10, sequence: 3, handedness: 'left' }
    }),
    ...warned({
      id: 'sandbox-moth-brood-bricks',
      primitiveId: 'summon-formation',
      startSeconds: 4.2,
      phaseId: mothBrood,
      style: 'warning',
      color: '#fde047',
      parameters: { summonCount: 6, enemyId: 'brick', formationPatternId: 'diamond' }
    }),
    ...warned({
      id: 'sandbox-moth-brood-barrage',
      primitiveId: 'side-barrage',
      startSeconds: 7.5,
      phaseId: mothBrood,
      style: 'lane',
      color: '#fb7185',
      parameters: { projectileCount: 7, side: 'starboard' }
    }),
    ...warned({
      id: 'sandbox-moth-brood-burst',
      primitiveId: 'aimed-burst',
      startSeconds: 10.4,
      phaseId: mothBrood,
      style: 'target',
      color: '#f0abfc',
      parameters: { projectileCount: 7 }
    }),
    phaseCue('sandbox-moth-rage-fx', 'effect-cue', mothRage, { color: '#ffffff' }),
    phaseCue('sandbox-moth-rage-camera', 'camera-cue', mothRage, { strength: 3 }),
    phaseCue('sandbox-moth-rage-shield-down', 'set-shield', mothRage, { shieldCount: 0, enabled: false }),
    phaseCue('sandbox-moth-core', 'set-weak-point', mothRage, {
      componentId: 'helmet',
      enabled: true
    }),
    ...warned({
      id: 'sandbox-moth-rage-collapse',
      primitiveId: 'inward-collapse',
      startSeconds: 1,
      phaseId: mothRage,
      style: 'target',
      color: '#a855f7',
      parameters: { projectileCount: 16, sequence: 4 }
    }),
    ...warned({
      id: 'sandbox-moth-rage-bricks',
      primitiveId: 'summon-formation',
      startSeconds: 4.3,
      phaseId: mothRage,
      style: 'warning',
      color: '#facc15',
      parameters: { summonCount: 4, enemyId: 'brick', formationPatternId: 'pincer' }
    }),
    ...warned({
      id: 'sandbox-moth-rage-cross',
      primitiveId: 'rotating-cross',
      startSeconds: 7.4,
      phaseId: mothRage,
      style: 'ring',
      color: '#22d3ee',
      parameters: { projectileCount: 10, sequence: 5 }
    }),
    ...warned({
      id: 'sandbox-moth-rage-helix',
      primitiveId: 'helix-volley',
      startSeconds: 10.3,
      phaseId: mothRage,
      style: 'warning',
      color: '#f472b6',
      parameters: { projectileCount: 12, sequence: 6, handedness: 'right' }
    })
  ]
};

const laserShell = 'sandbox-laser-shell';
const laserExpose = 'sandbox-laser-expose';
const laserRage = 'sandbox-laser-rage';
const laserTimeline: BossTimelineConfig = {
  durationSeconds: 12,
  loop: true,
  clips: [
    phaseCue('sandbox-laser-shell-shield', 'set-shield', laserShell, { shieldCount: 4, enabled: true }),
    phaseCue('sandbox-laser-shell-core', 'set-weak-point', laserShell, {
      componentId: 'helmet',
      enabled: false
    }),
    phaseCue('sandbox-laser-shell-left-cannon', 'set-weak-point', laserShell, {
      componentId: 'left-cannon',
      enabled: false
    }),
    phaseCue('sandbox-laser-shell-right-cannon', 'set-weak-point', laserShell, {
      componentId: 'right-cannon',
      enabled: false
    }),
    ...warned({
      id: 'sandbox-laser-shell-cross',
      primitiveId: 'cross-beam',
      startSeconds: 0.8,
      phaseId: laserShell,
      style: 'lane',
      color: '#67e8f9'
    }),
    ...warned({
      id: 'sandbox-laser-shell-rail',
      primitiveId: 'rail-sweep',
      startSeconds: 4,
      phaseId: laserShell,
      style: 'lane',
      color: '#38bdf8',
      parameters: { sequence: 0 }
    }),
    ...warned({
      id: 'sandbox-laser-shell-burst',
      primitiveId: 'aimed-burst',
      startSeconds: 8,
      phaseId: laserShell,
      style: 'target',
      color: '#f8fafc',
      parameters: { projectileCount: 5 }
    }),
    phaseCue('sandbox-laser-expose-camera', 'camera-cue', laserExpose, { strength: 2 }),
    phaseCue('sandbox-laser-expose-shield', 'set-shield', laserExpose, { shieldCount: 2, enabled: true }),
    phaseCue('sandbox-laser-left-cannon', 'set-weak-point', laserExpose, {
      componentId: 'left-cannon',
      enabled: true
    }),
    phaseCue('sandbox-laser-right-cannon', 'set-weak-point', laserExpose, {
      componentId: 'right-cannon',
      enabled: true
    }),
    ...warned({
      id: 'sandbox-laser-expose-cross',
      primitiveId: 'cross-beam',
      startSeconds: 0.8,
      phaseId: laserExpose,
      style: 'lane',
      color: '#22d3ee'
    }),
    ...warned({
      id: 'sandbox-laser-expose-rail',
      primitiveId: 'rail-sweep',
      startSeconds: 3.8,
      phaseId: laserExpose,
      style: 'lane',
      color: '#f97316',
      parameters: { sequence: 1 }
    }),
    ...warned({
      id: 'sandbox-laser-expose-barrage',
      primitiveId: 'side-barrage',
      startSeconds: 6.8,
      phaseId: laserExpose,
      style: 'lane',
      color: '#fb7185',
      parameters: { projectileCount: 8, side: 'port' }
    }),
    ...warned({
      id: 'sandbox-laser-expose-ring',
      primitiveId: 'gap-ring',
      startSeconds: 9.4,
      phaseId: laserExpose,
      style: 'ring',
      color: '#67e8f9',
      parameters: { projectileCount: 18, sequence: 2 }
    }),
    phaseCue('sandbox-laser-rage-fx', 'effect-cue', laserRage, { color: '#ef4444' }),
    phaseCue('sandbox-laser-rage-camera', 'camera-cue', laserRage, { strength: 3.5 }),
    phaseCue('sandbox-laser-rage-shield', 'set-shield', laserRage, { shieldCount: 0, enabled: false }),
    phaseCue('sandbox-laser-rage-core', 'set-weak-point', laserRage, {
      componentId: 'helmet',
      enabled: true
    }),
    ...warned({
      id: 'sandbox-laser-rage-cross',
      primitiveId: 'cross-beam',
      startSeconds: 0.6,
      phaseId: laserRage,
      style: 'lane',
      color: '#f43f5e'
    }),
    ...warned({
      id: 'sandbox-laser-rage-rail',
      primitiveId: 'rail-sweep',
      startSeconds: 3.2,
      phaseId: laserRage,
      style: 'lane',
      color: '#f97316',
      parameters: { sequence: 3 }
    }),
    ...warned({
      id: 'sandbox-laser-rage-collapse',
      primitiveId: 'inward-collapse',
      startSeconds: 5.8,
      phaseId: laserRage,
      style: 'target',
      color: '#ef4444',
      parameters: { projectileCount: 18, sequence: 4 }
    }),
    ...warned({
      id: 'sandbox-laser-rage-rotate',
      primitiveId: 'rotating-cross',
      startSeconds: 9,
      phaseId: laserRage,
      style: 'ring',
      color: '#facc15',
      parameters: { projectileCount: 12, sequence: 5 }
    })
  ]
};

const meridianOpening = 'sandbox-meridian-opening';
const meridianRing = 'sandbox-meridian-ring';
const meridianAperture = 'sandbox-meridian-aperture';
const meridianTimeline: BossTimelineConfig = {
  durationSeconds: 18,
  loop: true,
  clips: [
    phaseCue('sandbox-meridian-opening-fx', 'effect-cue', meridianOpening, { color: '#22d3ee' }),
    phaseCue('sandbox-meridian-opening-camera', 'camera-cue', meridianOpening, { strength: 1.4 }),
    phaseCue('sandbox-meridian-opening-core', 'set-weak-point', meridianOpening, {
      componentId: 'helmet',
      enabled: false
    }),
    clip(
      'sandbox-meridian-opening-path',
      'follow-path',
      0.1,
      meridianOpening,
      { movementPathId: 'sweep-bank-reentry' },
      { durationSeconds: 7.4 }
    ),
    ...warned({
      id: 'sandbox-meridian-opening-pods',
      primitiveId: 'pod-volley',
      startSeconds: 1,
      phaseId: meridianOpening,
      style: 'target',
      color: '#f59e0b',
      parameters: { projectileCount: 3, sequence: 0 },
      leadSeconds: 1,
      actionDurationSeconds: 1
    }),
    ...warned({
      id: 'sandbox-meridian-opening-wall',
      primitiveId: 'weave-wall',
      startSeconds: 5,
      phaseId: meridianOpening,
      style: 'lane',
      color: '#22d3ee',
      parameters: { projectileCount: 9, sequence: 0 },
      leadSeconds: 1,
      actionDurationSeconds: 1.2
    }),
    ...warned({
      id: 'sandbox-meridian-opening-ring',
      primitiveId: 'gap-ring',
      startSeconds: 10,
      phaseId: meridianOpening,
      style: 'ring',
      color: '#e879f9',
      parameters: { projectileCount: 16, sequence: 1 },
      actionDurationSeconds: 0.9
    }),
    ...warned({
      id: 'sandbox-meridian-opening-barrage',
      primitiveId: 'side-barrage',
      startSeconds: 14,
      phaseId: meridianOpening,
      style: 'lane',
      color: '#fb7185',
      parameters: { projectileCount: 5, side: 'port' },
      actionDurationSeconds: 0.9
    }),
    ...warned({
      id: 'sandbox-meridian-opening-starboard',
      primitiveId: 'side-barrage',
      startSeconds: 16.2,
      phaseId: meridianOpening,
      style: 'lane',
      color: '#f97316',
      parameters: { projectileCount: 5, side: 'starboard' },
      leadSeconds: 0.8,
      actionDurationSeconds: 0.8
    }),
    phaseCue('sandbox-meridian-ring-camera', 'camera-cue', meridianRing, { strength: 2 }),
    phaseCue('sandbox-meridian-ring-shield', 'set-shield', meridianRing, {
      shieldCount: 2,
      enabled: true
    }),
    ...warned({
      id: 'sandbox-meridian-ring-wall',
      primitiveId: 'weave-wall',
      startSeconds: 1,
      phaseId: meridianRing,
      style: 'lane',
      color: '#67e8f9',
      parameters: { projectileCount: 9, sequence: 1 },
      leadSeconds: 1,
      actionDurationSeconds: 1.2
    }),
    ...warned({
      id: 'sandbox-meridian-ring-pods',
      primitiveId: 'pod-volley',
      startSeconds: 5,
      phaseId: meridianRing,
      style: 'target',
      color: '#f59e0b',
      parameters: { projectileCount: 4, sequence: 1 },
      leadSeconds: 1,
      actionDurationSeconds: 1
    }),
    ...warned({
      id: 'sandbox-meridian-ring-cross',
      primitiveId: 'rotating-cross',
      startSeconds: 9,
      phaseId: meridianRing,
      style: 'ring',
      color: '#e879f9',
      parameters: { projectileCount: 8, sequence: 2 },
      actionDurationSeconds: 0.9
    }),
    ...warned({
      id: 'sandbox-meridian-ring-rail',
      primitiveId: 'rail-sweep',
      startSeconds: 13,
      phaseId: meridianRing,
      style: 'lane',
      color: '#38bdf8',
      parameters: { sequence: 3 },
      leadSeconds: 1,
      actionDurationSeconds: 2
    }),
    ...warned({
      id: 'sandbox-meridian-ring-summon',
      primitiveId: 'summon-formation',
      startSeconds: 15.2,
      phaseId: meridianRing,
      style: 'ring',
      color: '#facc15',
      parameters: { summonCount: 3, enemyId: 'brick', formationPatternId: 'diamond' },
      leadSeconds: 1.1,
      actionDurationSeconds: 0.6
    }),
    phaseCue('sandbox-meridian-aperture-fx', 'effect-cue', meridianAperture, {
      color: '#ef4444'
    }),
    phaseCue('sandbox-meridian-aperture-camera', 'camera-cue', meridianAperture, {
      strength: 3
    }),
    phaseCue('sandbox-meridian-aperture-shield', 'set-shield', meridianAperture, {
      shieldCount: 0,
      enabled: false
    }),
    phaseCue('sandbox-meridian-aperture-core', 'set-weak-point', meridianAperture, {
      componentId: 'helmet',
      enabled: true
    }),
    ...warned({
      id: 'sandbox-meridian-aperture-beam',
      primitiveId: 'cross-beam',
      startSeconds: 0.8,
      phaseId: meridianAperture,
      style: 'lane',
      color: '#fb7185',
      leadSeconds: 1,
      actionDurationSeconds: 1.2
    }),
    ...warned({
      id: 'sandbox-meridian-aperture-wall',
      primitiveId: 'weave-wall',
      startSeconds: 5,
      phaseId: meridianAperture,
      style: 'lane',
      color: '#f97316',
      parameters: { projectileCount: 9, sequence: 2 },
      leadSeconds: 1,
      actionDurationSeconds: 1.2
    }),
    ...warned({
      id: 'sandbox-meridian-aperture-collapse',
      primitiveId: 'inward-collapse',
      startSeconds: 9.2,
      phaseId: meridianAperture,
      style: 'target',
      color: '#c084fc',
      parameters: { projectileCount: 14, sequence: 4 },
      actionDurationSeconds: 1.2
    }),
    ...warned({
      id: 'sandbox-meridian-aperture-pods',
      primitiveId: 'pod-volley',
      startSeconds: 13,
      phaseId: meridianAperture,
      style: 'target',
      color: '#f59e0b',
      parameters: { projectileCount: 5, sequence: 2 },
      leadSeconds: 1,
      actionDurationSeconds: 1
    }),
    ...warned({
      id: 'sandbox-meridian-aperture-tail',
      primitiveId: 'tail-fan',
      startSeconds: 15.5,
      phaseId: meridianAperture,
      style: 'warning',
      color: '#ff3bd4',
      parameters: { projectileCount: 9, sequence: 5 },
      leadSeconds: 0.8,
      actionDurationSeconds: 1.2
    })
  ]
};

const clawcarrierCalibration = 'sandbox-clawcarrier-siege-calibration';
const clawcarrierCrossfire = 'sandbox-clawcarrier-armor-shear';
const clawcarrierBreach = 'sandbox-clawcarrier-reactor-overdrive';
type ClawcarrierSide = 'port' | 'starboard';
type ClawcarrierGapDirection = 'clockwise' | 'counterclockwise';

interface ClawcarrierPhaseRoute {
  readonly phaseId: string;
  readonly color: string;
  readonly cameraStrength: number;
  readonly firstCannonSide: ClawcarrierSide;
  readonly firstSweepSide: ClawcarrierSide;
  readonly gapDirection: ClawcarrierGapDirection;
  readonly reactorSequences: readonly [number, number, number, number];
  readonly crushSequence: number;
}

const oppositeClawcarrierSide = (side: ClawcarrierSide): ClawcarrierSide => (
  side === 'port' ? 'starboard' : 'port'
);

const buildClawcarrierSweepBeats = (
  route: ClawcarrierPhaseRoute
): readonly BossAttackBeatBlueprint[] => {
  const sweepSides: readonly ClawcarrierSide[] = [
    route.firstSweepSide,
    oppositeClawcarrierSide(route.firstSweepSide)
  ];
  return [
    ...sweepSides.map<BossAttackBeatBlueprint>((side, index) => ({
      id: `${side === 'port' ? 'p' : 's'}-clamp`,
      label: `${side === 'port' ? 'Port' : 'Starboard'} corner clamp`,
      primitiveId: 'articulated-melee-sweep',
      offsetSeconds: index * 2.05,
      telegraphStyle: 'warning',
      leadSeconds: 0.86,
      actionDurationSeconds: 0.96,
      parameters: {
        side,
        motionCue: 'claw-sweep'
      }
    }))
  ];
};

const buildClawcarrierPhase = (
  route: ClawcarrierPhaseRoute
): BossAttackPhaseBlueprint => ({
  phaseId: route.phaseId,
  color: route.color,
  cameraStrength: route.cameraStrength,
  attacks: [
    {
      id: 'twin-rotary-crossfire',
      label: 'Twin Rotary Crossfire',
      phaseId: route.phaseId,
      role: 'core',
      skillTest: 'rhythm-dodge',
      recognitionCue: 'The port rotary spins first, the starboard answers, then both housings brace together.',
      solution: 'Dodge the first short burst, cross behind the delayed answer, then hold the center gap through the coordinated volley.',
      safeRouteRule: 'opposite-side-dodge',
      sourceSocketRoles: ['port', 'starboard'],
      startSeconds: 0.2,
      recoverySeconds: 0.8,
      color: route.color,
      beats: [
        {
          id: 'port-answer',
          label: `${route.firstCannonSide === 'port' ? 'Port' : 'Starboard'} rotary opening`,
          primitiveId: 'paired-cannon-burst',
          offsetSeconds: 0,
          telegraphStyle: 'warning',
          leadSeconds: 0.68,
          actionDurationSeconds: 0.38,
          parameters: {
            projectileCount: 3,
            side: route.firstCannonSide,
            motionCue: 'paired-crossfire'
          }
        },
        {
          id: 'reply',
          label: `${oppositeClawcarrierSide(route.firstCannonSide) === 'port' ? 'Port' : 'Starboard'} rotary answer`,
          primitiveId: 'paired-cannon-burst',
          offsetSeconds: 1.7,
          telegraphStyle: 'warning',
          leadSeconds: 0.68,
          actionDurationSeconds: 0.38,
          parameters: {
            projectileCount: 3,
            side: oppositeClawcarrierSide(route.firstCannonSide),
            motionCue: 'paired-crossfire'
          }
        },
        {
          id: 'twin-volley',
          label: 'Coordinated rotary crossfire',
          primitiveId: 'paired-cannon-burst',
          offsetSeconds: 3.4,
          telegraphStyle: 'warning',
          leadSeconds: 0.8,
          actionDurationSeconds: 0.62,
          parameters: {
            projectileCount: 4,
            sequence: route.crushSequence,
            motionCue: 'paired-crossfire'
          }
        }
      ]
    },
    {
      id: 'claw-sweep-pincer',
      label: 'Claw Sweep Pincer',
      phaseId: route.phaseId,
      role: 'core',
      skillTest: 'lane-routing',
      recognitionCue: 'One shoulder opens as Helios travels to a lower corner, tracks briefly, locks, and closes its connected claw before the opposite corner answers.',
      solution: 'Cross away during the visible travel, leave the tracked corner before lock, and pass outside the closing claw tip. A destroyed claw changes the route; losing both claws triggers rotary fallback fire.',
      safeRouteRule: 'shifting-channel',
      sourceSocketRoles: ['port', 'starboard'],
      startSeconds: 6,
      recoverySeconds: 0.8,
      color: route.color,
      beats: buildClawcarrierSweepBeats(route)
    },
    {
      id: 'reactor-maze',
      label: 'Reactor Maze',
      phaseId: route.phaseId,
      role: 'core',
      skillTest: 'gap-tracking',
      recognitionCue: 'The body braces and the reactor opens before drawing a downward fan a few rounds at a time; a separate beat visibly deploys and arms a bounded mine formation.',
      solution: 'Read the fan order, cross its widening lanes between beats, then route around armed mines before their proximity explosions become active.',
      safeRouteRule: 'shifting-channel',
      sourceSocketRoles: ['core'],
      startSeconds: 11.7,
      recoverySeconds: 0.9,
      color: route.color,
      beats: route.reactorSequences.map((sequence, index) => ({
        id: index === 2 ? 'mines' : `fan-${index + 1}`,
        label: index === 2 ? 'Reactor mine deployment' : `Reactor fan beat ${index + 1}`,
        primitiveId: 'reactor-aperture-pattern' as const,
        offsetSeconds: index * 1.35,
        telegraphStyle: 'warning' as const,
        leadSeconds: index === 2 ? 0.82 : 0.62,
        actionDurationSeconds: index === 2 ? 0.72 : 0.78,
        parameters: {
          projectileCount: index === 2 ? 3 : 7 + (index % 3),
          sequence,
          motionCue: index === 2 ? 'reactor-mines' : 'reactor-fan'
        }
      }))
    },
    {
      id: 'clawcarrier-crush',
      label: 'Clawcarrier Crush',
      phaseId: route.phaseId,
      role: 'signature',
      skillTest: 'route-combination',
      recognitionCue: 'The carrier rises, opens both claws, follows the player briefly, then freezes before committing to the locked dive.',
      solution: 'Bait the short tracking stage, leave the locked area before the dive, and stay outside the visibly closed claw tips until they release.',
      safeRouteRule: 'channel-to-quadrant',
      sourceSocketRoles: ['port', 'starboard'],
      startSeconds: 18.2,
      recoverySeconds: 0.9,
      color: route.color,
      beats: [
        {
          id: 'crush',
          label: 'Clawcarrier Crush sequence',
          primitiveId: 'tracking-pincer-dive',
          offsetSeconds: 0,
          telegraphStyle: 'warning',
          leadSeconds: 0.55,
          actionDurationSeconds: 0.5,
          parameters: {
            sequence: route.crushSequence,
            motionCue: 'pincer-dive'
          },
          repeat: { count: 4, intervalSeconds: 0.9 }
        }
      ]
    }
  ]
});

const clawcarrierTimeline = compileBossAttackTimeline({
  durationSeconds: 23.5,
  loop: true,
  phases: [
    buildClawcarrierPhase({
      phaseId: clawcarrierCalibration,
      color: '#f59e0b',
      cameraStrength: 0.65,
      firstCannonSide: 'port',
      firstSweepSide: 'port',
      gapDirection: 'clockwise',
      reactorSequences: [0, 1, 2, 3],
      crushSequence: 0
    }),
    buildClawcarrierPhase({
      phaseId: clawcarrierCrossfire,
      color: '#22d3ee',
      cameraStrength: 0.9,
      firstCannonSide: 'starboard',
      firstSweepSide: 'starboard',
      gapDirection: 'counterclockwise',
      reactorSequences: [5, 4, 3, 2],
      crushSequence: 4
    }),
    buildClawcarrierPhase({
      phaseId: clawcarrierBreach,
      color: '#ef4444',
      cameraStrength: 1.15,
      firstCannonSide: 'port',
      firstSweepSide: 'starboard',
      gapDirection: 'clockwise',
      reactorSequences: [2, 4, 1, 3],
      crushSequence: 8
    })
  ]
});

const stormEngineStudy = 'sandbox-storm-engine-reference-study';
const stormEngineOverdrive = 'sandbox-storm-engine-reverse-overdrive';
const stormEngineTimeline: BossTimelineConfig = {
  durationSeconds: 36,
  loop: true,
  clips: [
    phaseCue('sandbox-storm-engine-study-fx', 'effect-cue', stormEngineStudy, {
      color: '#67e8f9'
    }),
    ...warned({
      id: 'sandbox-storm-engine-study-rotor-forward',
      primitiveId: 'rotor-hazard-sentence',
      startSeconds: 0.8,
      phaseId: stormEngineStudy,
      style: 'ring',
      color: '#ff3bd4',
      parameters: {
        projectileCount: 6,
        sequence: 0,
        pulseIntervalSeconds: 0.9,
        motionCue: 'rotor-volley'
      },
      leadSeconds: 0.6,
      actionDurationSeconds: 5.4
    }),
    ...warned({
      id: 'sandbox-storm-engine-study-prism-pulses-a',
      primitiveId: 'gap-ring',
      startSeconds: 8.2,
      phaseId: stormEngineStudy,
      style: 'ring',
      color: '#67e8f9',
      parameters: { projectileCount: 14, sequence: 0 },
      leadSeconds: 0.8,
      actionDurationSeconds: 0.25,
      repeat: { count: 3, intervalSeconds: 0.85 }
    }),
    ...warned({
      id: 'sandbox-storm-engine-study-radial-beam-a',
      primitiveId: 'radial-beam-array',
      startSeconds: 12.5,
      phaseId: stormEngineStudy,
      style: 'spokes',
      color: '#f43f5e',
      parameters: {
        sequence: 0,
        motionCue: 'radial-beam',
        rotationDirection: 'seeded-random'
      },
      leadSeconds: 0.9,
      actionDurationSeconds: 2
    }),
    ...warned({
      id: 'sandbox-storm-engine-study-rotor-reverse',
      primitiveId: 'rotor-hazard-sentence',
      startSeconds: 17.2,
      phaseId: stormEngineStudy,
      style: 'ring',
      color: '#facc15',
      parameters: {
        projectileCount: 6,
        sequence: 1,
        pulseIntervalSeconds: 0.85,
        motionCue: 'rotor-volley'
      },
      leadSeconds: 0.6,
      actionDurationSeconds: 5.4
    }),
    ...warned({
      id: 'sandbox-storm-engine-study-prism-pulses-b',
      primitiveId: 'gap-ring',
      startSeconds: 24.7,
      phaseId: stormEngineStudy,
      style: 'ring',
      color: '#67e8f9',
      parameters: { projectileCount: 14, sequence: 1 },
      leadSeconds: 0.8,
      actionDurationSeconds: 0.25,
      repeat: { count: 3, intervalSeconds: 0.8 }
    }),
    ...warned({
      id: 'sandbox-storm-engine-study-radial-beam-b',
      primitiveId: 'radial-beam-array',
      startSeconds: 29.5,
      phaseId: stormEngineStudy,
      style: 'spokes',
      color: '#f43f5e',
      parameters: {
        sequence: 1,
        motionCue: 'radial-beam',
        rotationDirection: 'seeded-random'
      },
      leadSeconds: 0.9,
      actionDurationSeconds: 2
    }),
    phaseCue('sandbox-storm-engine-overdrive-fx', 'effect-cue', stormEngineOverdrive, {
      color: '#ff3bd4'
    }),
    phaseCue('sandbox-storm-engine-overdrive-camera', 'camera-cue', stormEngineOverdrive, {
      strength: 2.2
    }),
    ...warned({
      id: 'sandbox-storm-engine-overdrive-rotor-forward',
      primitiveId: 'rotor-hazard-sentence',
      startSeconds: 0.8,
      phaseId: stormEngineOverdrive,
      style: 'ring',
      color: '#facc15',
      parameters: {
        projectileCount: 6,
        sequence: 2,
        pulseIntervalSeconds: 0.75,
        motionCue: 'rotor-volley'
      },
      leadSeconds: 0.6,
      actionDurationSeconds: 5.4
    }),
    ...warned({
      id: 'sandbox-storm-engine-overdrive-prism-pulses-a',
      primitiveId: 'gap-ring',
      startSeconds: 8.2,
      phaseId: stormEngineOverdrive,
      style: 'ring',
      color: '#ff3bd4',
      parameters: { projectileCount: 16, sequence: 2 },
      leadSeconds: 0.8,
      actionDurationSeconds: 0.25,
      repeat: { count: 3, intervalSeconds: 0.75 }
    }),
    ...warned({
      id: 'sandbox-storm-engine-overdrive-radial-beam-a',
      primitiveId: 'radial-beam-array',
      startSeconds: 12.5,
      phaseId: stormEngineOverdrive,
      style: 'spokes',
      color: '#facc15',
      parameters: {
        sequence: 2,
        motionCue: 'radial-beam',
        rotationDirection: 'seeded-random'
      },
      leadSeconds: 0.9,
      actionDurationSeconds: 2
    }),
    ...warned({
      id: 'sandbox-storm-engine-overdrive-rotor-reverse',
      primitiveId: 'rotor-hazard-sentence',
      startSeconds: 17.2,
      phaseId: stormEngineOverdrive,
      style: 'ring',
      color: '#67e8f9',
      parameters: {
        projectileCount: 6,
        sequence: 3,
        pulseIntervalSeconds: 0.65,
        motionCue: 'rotor-volley'
      },
      leadSeconds: 0.6,
      actionDurationSeconds: 5.4
    }),
    ...warned({
      id: 'sandbox-storm-engine-overdrive-prism-pulses-b',
      primitiveId: 'gap-ring',
      startSeconds: 24.7,
      phaseId: stormEngineOverdrive,
      style: 'ring',
      color: '#ff3bd4',
      parameters: { projectileCount: 16, sequence: 3 },
      leadSeconds: 0.8,
      actionDurationSeconds: 0.25,
      repeat: { count: 3, intervalSeconds: 0.7 }
    }),
    ...warned({
      id: 'sandbox-storm-engine-overdrive-radial-beam-b',
      primitiveId: 'radial-beam-array',
      startSeconds: 29.5,
      phaseId: stormEngineOverdrive,
      style: 'spokes',
      color: '#facc15',
      parameters: {
        sequence: 3,
        motionCue: 'radial-beam',
        rotationDirection: 'seeded-random'
      },
      leadSeconds: 0.9,
      actionDurationSeconds: 2
    })
  ]
};

const umbraWingSurvey = 'sandbox-umbra-wing-survey';
const umbraBlackoutHunt = 'sandbox-umbra-blackout-hunt';
const umbraBrokenCompass = 'sandbox-umbra-broken-compass';
const umbraTimeline = serialBossTimeline([
  {
    phaseId: umbraWingSurvey,
    color: '#818cf8',
    cameraStrength: 0.7,
    steps: [
      {
        id: 'sandbox-umbra-survey-port',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-umbra-survey-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-umbra-survey-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 14, sequence: 0 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-umbra-survey-port-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-umbra-survey-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 1 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-umbra-survey-starboard-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-umbra-survey-ring-c',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 14, sequence: 2 },
        leadSeconds: 1
      }
    ]
  },
  {
    phaseId: umbraBlackoutHunt,
    color: '#ef4444',
    cameraStrength: 1,
    steps: [
      {
        id: 'sandbox-umbra-hunt-lower-right-ram',
        primitiveId: 'corner-ambush-ram',
        style: 'target',
        parameters: { sequence: 1 },
        leadSeconds: 1.15,
        actionDurationSeconds: 0.9,
        recoverySeconds: 2.5
      },
      {
        id: 'sandbox-umbra-hunt-left-corner',
        primitiveId: 'corner-ambush-beam',
        style: 'target',
        parameters: { sequence: 0 },
        leadSeconds: 1,
        actionDurationSeconds: 0.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-umbra-hunt-right-corner',
        primitiveId: 'corner-ambush-beam',
        style: 'target',
        parameters: { sequence: 1 },
        leadSeconds: 1,
        actionDurationSeconds: 0.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-umbra-hunt-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 3 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-umbra-hunt-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-umbra-hunt-left-corner-return',
        primitiveId: 'corner-ambush-beam',
        style: 'target',
        parameters: { sequence: 2 },
        leadSeconds: 1,
        actionDurationSeconds: 0.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-umbra-hunt-exit-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 18, sequence: 4 },
        leadSeconds: 1
      }
    ]
  },
  {
    phaseId: umbraBrokenCompass,
    color: '#f43f5e',
    cameraStrength: 1.2,
    steps: [
      {
        id: 'sandbox-umbra-compass-right-corner',
        primitiveId: 'corner-ambush-beam',
        style: 'target',
        parameters: { sequence: 1 },
        leadSeconds: 1,
        actionDurationSeconds: 0.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-umbra-compass-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 5 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-umbra-compass-left-corner',
        primitiveId: 'corner-ambush-beam',
        style: 'target',
        parameters: { sequence: 0 },
        leadSeconds: 1,
        actionDurationSeconds: 0.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-umbra-compass-right-corner-return',
        primitiveId: 'corner-ambush-beam',
        style: 'target',
        parameters: { sequence: 3 },
        leadSeconds: 1,
        actionDurationSeconds: 0.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-umbra-compass-lower-left-ram',
        primitiveId: 'corner-ambush-ram',
        style: 'target',
        parameters: { sequence: 2 },
        leadSeconds: 1,
        actionDurationSeconds: 0.78,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-umbra-compass-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-umbra-compass-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 18, sequence: 6 },
        leadSeconds: 1
      }
    ]
  }
]);

const cinderjawSiegeStance = 'sandbox-cinderjaw-siege-stance';
const cinderjawClawBattery = 'sandbox-cinderjaw-claw-battery';
const cinderjawStrippedReactor = 'sandbox-cinderjaw-stripped-reactor';
const cinderjawTimeline = serialBossTimeline([
  {
    phaseId: cinderjawSiegeStance,
    color: '#f97316',
    cameraStrength: 0.9,
    steps: [
      {
        id: 'sandbox-cinderjaw-siege-port-cannon',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'port', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-cinderjaw-siege-starboard-cannon',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'starboard', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-cinderjaw-siege-mines-a',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 0 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-cinderjaw-siege-core-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 14, sequence: 0 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-cinderjaw-siege-port-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-cinderjaw-siege-mines-b',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 1 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-cinderjaw-siege-starboard-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      }
    ]
  },
  {
    phaseId: cinderjawClawBattery,
    color: '#fb923c',
    cameraStrength: 1,
    steps: [
      {
        id: 'sandbox-cinderjaw-battery-mines-a',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 5, sequence: 2 },
        actionDurationSeconds: 1.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-cinderjaw-battery-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-cinderjaw-battery-core-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 1 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-cinderjaw-battery-port',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-cinderjaw-battery-mines-b',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 5, sequence: 3 },
        actionDurationSeconds: 1.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-cinderjaw-battery-starboard-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'starboard', motionCue: 'heavy-cannon' },
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-cinderjaw-battery-core-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 2 },
        leadSeconds: 1
      }
    ]
  },
  {
    phaseId: cinderjawStrippedReactor,
    color: '#facc15',
    cameraStrength: 1.2,
    steps: [
      {
        id: 'sandbox-cinderjaw-reactor-port-gatling',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port', motionCue: 'gatling-barrage' },
        actionDurationSeconds: 1.6
      },
      {
        id: 'sandbox-cinderjaw-reactor-starboard-gatling',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard', motionCue: 'gatling-barrage' },
        actionDurationSeconds: 1.6
      },
      {
        id: 'sandbox-cinderjaw-reactor-core-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 3 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-cinderjaw-reactor-mines',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 4 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-cinderjaw-reactor-port-gatling-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'port', motionCue: 'gatling-barrage' },
        actionDurationSeconds: 1.7
      },
      {
        id: 'sandbox-cinderjaw-reactor-starboard-gatling-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'starboard', motionCue: 'gatling-barrage' },
        actionDurationSeconds: 1.7
      },
      {
        id: 'sandbox-cinderjaw-reactor-core-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 18, sequence: 4 },
        leadSeconds: 1
      }
    ]
  }
]);

const vesperglassWingbeatMeasure = 'sandbox-vesperglass-wingbeat-measure';
const vesperglassBroodLattice = 'sandbox-vesperglass-brood-lattice';
const vesperglassPrismaticMolt = 'sandbox-vesperglass-prismatic-molt';
const vesperglassTimeline = serialBossTimeline([
  {
    phaseId: vesperglassWingbeatMeasure,
    color: '#c4b5fd',
    cameraStrength: 0.7,
    steps: [
      {
        id: 'sandbox-vesperglass-wingbeat-port',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-wingbeat-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-wingbeat-cocoons-a',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 0 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-vesperglass-wingbeat-tail-a',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 7, sequence: 0 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-vesperglass-wingbeat-port-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-wingbeat-cocoons-b',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 1 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-vesperglass-wingbeat-tail-b',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 1 },
        actionDurationSeconds: 1.3
      }
    ]
  },
  {
    phaseId: vesperglassBroodLattice,
    color: '#67e8f9',
    cameraStrength: 0.9,
    steps: [
      {
        id: 'sandbox-vesperglass-brood-cocoons-a',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 5, sequence: 2 },
        actionDurationSeconds: 1.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-vesperglass-brood-core-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 14, sequence: 0 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-brood-tail-a',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 2 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-vesperglass-brood-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-brood-cocoons-b',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 5, sequence: 3 },
        actionDurationSeconds: 1.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-vesperglass-brood-core-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 1 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-brood-tail-b',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 3 },
        actionDurationSeconds: 1.3
      }
    ]
  },
  {
    phaseId: vesperglassPrismaticMolt,
    color: '#f0abfc',
    cameraStrength: 1.1,
    steps: [
      {
        id: 'sandbox-vesperglass-molt-left-helix',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 0, handedness: 'left' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-vesperglass-molt-right-helix',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 1, handedness: 'right' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-vesperglass-molt-cross-a',
        primitiveId: 'rotating-cross',
        style: 'spokes',
        parameters: { projectileCount: 8, sequence: 0 },
        leadSeconds: 1,
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-vesperglass-molt-core-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 2 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-vesperglass-molt-left-helix-return',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 10, sequence: 2, handedness: 'left' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-vesperglass-molt-right-helix-return',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 10, sequence: 3, handedness: 'right' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-vesperglass-molt-cross-b',
        primitiveId: 'rotating-cross',
        style: 'spokes',
        parameters: { projectileCount: 10, sequence: 1 },
        leadSeconds: 1,
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      }
    ]
  }
]);

const twinHaloCallAndAnswer = 'sandbox-twin-halo-call-and-answer';
const twinHaloOrbitExchange = 'sandbox-twin-halo-orbit-exchange';
const twinHaloConjunction = 'sandbox-twin-halo-conjunction';
const twinHaloTimeline = serialBossTimeline([
  {
    phaseId: twinHaloCallAndAnswer,
    color: '#facc15',
    cameraStrength: 0.8,
    steps: [
      {
        id: 'sandbox-twin-halo-call-port',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-answer-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 5, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-call-nodes',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 0 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-twin-halo-call-cross',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1,
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-twin-halo-call-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 14, sequence: 0 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-answer-nodes',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 4, sequence: 1 },
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-twin-halo-answer-cross',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1,
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      }
    ]
  },
  {
    phaseId: twinHaloOrbitExchange,
    color: '#22d3ee',
    cameraStrength: 0.9,
    steps: [
      {
        id: 'sandbox-twin-halo-exchange-nodes-a',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 5, sequence: 2 },
        actionDurationSeconds: 1.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-twin-halo-exchange-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-exchange-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 1 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-exchange-cross-a',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1,
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-twin-halo-exchange-port',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-exchange-nodes-b',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 5, sequence: 3 },
        actionDurationSeconds: 1.7,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-twin-halo-exchange-cross-b',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1,
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      }
    ]
  },
  {
    phaseId: twinHaloConjunction,
    color: '#fde68a',
    cameraStrength: 1.2,
    steps: [
      {
        id: 'sandbox-twin-halo-conjunction-cross-a',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1,
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-twin-halo-conjunction-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 2 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-conjunction-port',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'port' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-conjunction-starboard',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'starboard' },
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-twin-halo-conjunction-nodes',
        primitiveId: 'pod-volley',
        style: 'target',
        parameters: { projectileCount: 6, sequence: 4 },
        actionDurationSeconds: 1.8,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-twin-halo-conjunction-cross-b',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1,
        actionDurationSeconds: 1.2,
        recoverySeconds: 2.4
      },
      {
        id: 'sandbox-twin-halo-conjunction-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 18, sequence: 3 },
        leadSeconds: 1
      }
    ]
  }
]);

const riftcoilFangMeasure = 'sandbox-riftcoil-fang-measure';
const riftcoilTailCipher = 'sandbox-riftcoil-tail-cipher';
const riftcoilCoilCage = 'sandbox-riftcoil-coil-cage';
const riftcoilTimeline = serialBossTimeline([
  {
    phaseId: riftcoilFangMeasure,
    color: '#2dd4bf',
    cameraStrength: 0.8,
    steps: [
      {
        id: 'sandbox-riftcoil-fang-left-helix',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 0, handedness: 'left' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-riftcoil-fang-right-helix',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 1, handedness: 'right' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-riftcoil-fang-tail-a',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 7, sequence: 0 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-riftcoil-fang-left-return',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 2, handedness: 'left' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-riftcoil-fang-right-return',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 3, handedness: 'right' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-riftcoil-fang-seam-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 14, sequence: 0 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-riftcoil-fang-tail-b',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 1 },
        actionDurationSeconds: 1.3
      }
    ]
  },
  {
    phaseId: riftcoilTailCipher,
    color: '#a78bfa',
    cameraStrength: 0.9,
    steps: [
      {
        id: 'sandbox-riftcoil-cipher-tail-a',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 2 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-riftcoil-cipher-ring-a',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 1 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-riftcoil-cipher-left-helix',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 9, sequence: 4, handedness: 'left' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-riftcoil-cipher-right-helix',
        primitiveId: 'helix-volley',
        style: 'warning',
        parameters: { projectileCount: 9, sequence: 5, handedness: 'right' },
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-riftcoil-cipher-tail-b',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 9, sequence: 3 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-riftcoil-cipher-ring-b',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 2 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-riftcoil-cipher-tail-c',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 9, sequence: 4 },
        actionDurationSeconds: 1.3
      }
    ]
  },
  {
    phaseId: riftcoilCoilCage,
    color: '#f472b6',
    cameraStrength: 1.1,
    steps: [
      {
        id: 'sandbox-riftcoil-cage-cross-a',
        primitiveId: 'rotating-cross',
        style: 'spokes',
        parameters: { projectileCount: 8, sequence: 0 },
        leadSeconds: 1,
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-riftcoil-cage-aligned-tail-a',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 9, sequence: 0 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-riftcoil-cage-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 3 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-riftcoil-cage-cross-b',
        primitiveId: 'rotating-cross',
        style: 'spokes',
        parameters: { projectileCount: 10, sequence: 1 },
        leadSeconds: 1,
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-riftcoil-cage-aligned-tail-b',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 9, sequence: 1 },
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-riftcoil-cage-cross-c',
        primitiveId: 'rotating-cross',
        style: 'spokes',
        parameters: { projectileCount: 10, sequence: 2 },
        leadSeconds: 1,
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-riftcoil-cage-aligned-tail-c',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 10, sequence: 2 },
        actionDurationSeconds: 1.3
      }
    ]
  }
]);

const nullwakeBorrowedCharge = 'sandbox-nullwake-borrowed-charge';
const nullwakeBackplaneCrown = 'sandbox-nullwake-backplane-crown';
const nullwakeTerminalOverclock = 'sandbox-nullwake-terminal-overclock';
type NullwakeSide = 'port' | 'starboard';
type NullwakeGapDirection = 'clockwise' | 'counterclockwise';

interface NullwakePhaseRoute {
  readonly phaseId: string;
  readonly color: string;
  readonly cameraStrength: number;
  readonly clawSides: readonly [NullwakeSide, NullwakeSide, NullwakeSide];
  readonly gateDirection: NullwakeGapDirection;
  readonly gateSequences: readonly [number, number, number];
  readonly latticeSequences: readonly [number, number, number];
  readonly maze: {
    readonly entrySequence: number;
    readonly firstGateSequence: number;
    readonly side: NullwakeSide;
    readonly secondGateSequence: number;
    readonly exitSequence: number;
  };
}

const buildNullwakePhase = (route: NullwakePhaseRoute): BossAttackPhaseBlueprint => ({
  phaseId: route.phaseId,
  color: route.color,
  cameraStrength: route.cameraStrength,
  attacks: [
    {
      id: 'claw-corridor',
      label: 'Claw Corridor',
      phaseId: route.phaseId,
      role: 'core',
      skillTest: 'rhythm-dodge',
      recognitionCue: 'One firing claw bank opens while the opposite bank folds inward.',
      solution: 'Move away from the warned firing bank and read repeated-side feints.',
      safeRouteRule: 'opposite-side-dodge',
      sourceSocketRoles: ['port', 'starboard'],
      startSeconds: 0.2,
      recoverySeconds: 0.8,
      color: route.color,
      beats: route.clawSides.map((side, index) => ({
        id: `claw-${index + 1}`,
        label: `${side === 'port' ? 'Port' : 'Starboard'} claw wake`,
        primitiveId: 'side-barrage' as const,
        offsetSeconds: index * 1.35,
        telegraphStyle: 'lane' as const,
        leadSeconds: 0.75,
        actionDurationSeconds: 0.2,
        parameters: { projectileCount: 4, side }
      }))
    },
    {
      id: 'dead-signal-gates',
      label: 'Dead-Signal Gates',
      phaseId: route.phaseId,
      role: 'core',
      skillTest: 'gap-tracking',
      recognitionCue: 'The core draws three ordered aperture guides.',
      solution: 'Follow each shown gap waypoint one reachable step at a time.',
      safeRouteRule: 'rotating-gap',
      sourceSocketRoles: ['core'],
      startSeconds: 4.75,
      recoverySeconds: 0.8,
      color: route.color,
      beats: route.gateSequences.map((sequence, index) => ({
        id: `gate-${index + 1}`,
        label: `Dead-signal gate ${index + 1}`,
        primitiveId: 'gap-ring' as const,
        offsetSeconds: index * 1.45,
        telegraphStyle: 'ring' as const,
        leadSeconds: 0.8,
        actionDurationSeconds: 0.2,
        parameters: {
          projectileCount: 14,
          sequence,
          rotationDirection: route.gateDirection
        }
      }))
    },
    {
      id: 'memory-lattice',
      label: 'Memory Lattice',
      phaseId: route.phaseId,
      role: 'core',
      skillTest: 'lane-routing',
      recognitionCue: 'All four claws flatten while cyan rails frame the next channel.',
      solution: 'Enter the two-lane channel, then follow its one-step shifts.',
      safeRouteRule: 'shifting-channel',
      sourceSocketRoles: ['core'],
      startSeconds: 9.55,
      recoverySeconds: 0.85,
      color: route.color,
      beats: route.latticeSequences.map((sequence, index) => ({
        id: `lattice-${index + 1}`,
        label: `Memory lattice ${index + 1}`,
        primitiveId: 'weave-wall' as const,
        offsetSeconds: index * 1.55,
        telegraphStyle: 'lane' as const,
        leadSeconds: 0.85,
        actionDurationSeconds: 0.25,
        parameters: { sequence }
      }))
    },
    {
      id: 'revenant-maze',
      label: 'Revenant Maze',
      phaseId: route.phaseId,
      role: 'signature',
      skillTest: 'route-combination',
      recognitionCue: 'All limbs lock inward and the core changes color around a route guide.',
      solution: 'Follow channel, core gap, safe cross quadrant, lit claw, then the return gate.',
      safeRouteRule: 'channel-to-quadrant',
      sourceSocketRoles: ['port', 'starboard', 'core'],
      startSeconds: 14.7,
      recoverySeconds: 1,
      color: route.color,
      beats: [
        {
          id: 'maze-entry',
          label: 'Maze entry channel',
          primitiveId: 'weave-wall',
          offsetSeconds: 0,
          telegraphStyle: 'lane',
          leadSeconds: 0.9,
          actionDurationSeconds: 0.25,
          parameters: { sequence: route.maze.entrySequence }
        },
        {
          id: 'maze-first-gate',
          label: 'Maze route gate',
          primitiveId: 'gap-ring',
          offsetSeconds: 1.55,
          telegraphStyle: 'ring',
          leadSeconds: 0.8,
          actionDurationSeconds: 0.2,
          parameters: {
            projectileCount: 14,
            sequence: route.maze.firstGateSequence,
            rotationDirection: route.gateDirection
          }
        },
        {
          id: 'maze-cross',
          label: 'Maze quadrant cross',
          primitiveId: 'cross-beam',
          offsetSeconds: 3.1,
          telegraphStyle: 'lane',
          leadSeconds: 0.95,
          actionDurationSeconds: 0.45
        },
        {
          id: 'maze-claw',
          label: 'Maze claw pressure',
          primitiveId: 'side-barrage',
          offsetSeconds: 4.65,
          telegraphStyle: 'lane',
          leadSeconds: 0.8,
          actionDurationSeconds: 0.2,
          parameters: { projectileCount: 4, side: route.maze.side }
        },
        {
          id: 'maze-return-gate',
          label: 'Maze return gate',
          primitiveId: 'gap-ring',
          offsetSeconds: 6.05,
          telegraphStyle: 'ring',
          leadSeconds: 0.85,
          actionDurationSeconds: 0.2,
          parameters: {
            projectileCount: 14,
            sequence: route.maze.secondGateSequence,
            rotationDirection: route.gateDirection
          }
        },
        {
          id: 'maze-exit',
          label: 'Maze exit channel',
          primitiveId: 'weave-wall',
          offsetSeconds: 7.55,
          telegraphStyle: 'lane',
          leadSeconds: 0.9,
          actionDurationSeconds: 0.25,
          parameters: { sequence: route.maze.exitSequence }
        }
      ]
    }
  ]
});

const nullwakeTimeline = compileBossAttackTimeline({
  durationSeconds: 24.7,
  loop: true,
  phases: [
    buildNullwakePhase({
      phaseId: nullwakeBorrowedCharge,
      color: '#67e8f9',
      cameraStrength: 0.6,
      clawSides: ['port', 'starboard', 'port'],
      gateDirection: 'clockwise',
      gateSequences: [0, 1, 2],
      latticeSequences: [0, 1, 2],
      maze: {
        entrySequence: 4,
        firstGateSequence: 2,
        side: 'port',
        secondGateSequence: 3,
        exitSequence: 5
      }
    }),
    buildNullwakePhase({
      phaseId: nullwakeBackplaneCrown,
      color: '#fb923c',
      cameraStrength: 1.15,
      clawSides: ['starboard', 'port', 'starboard'],
      gateDirection: 'counterclockwise',
      gateSequences: [0, 1, 2],
      latticeSequences: [2, 1, 0],
      maze: {
        entrySequence: 2,
        firstGateSequence: 2,
        side: 'starboard',
        secondGateSequence: 3,
        exitSequence: 0
      }
    }),
    buildNullwakePhase({
      phaseId: nullwakeTerminalOverclock,
      color: '#c084fc',
      cameraStrength: 1.3,
      clawSides: ['port', 'port', 'starboard'],
      gateDirection: 'clockwise',
      gateSequences: [1, 2, 1],
      latticeSequences: [1, 2, 1],
      maze: {
        entrySequence: 3,
        firstGateSequence: 2,
        side: 'port',
        secondGateSequence: 1,
        exitSequence: 2
      }
    })
  ]
});

const gloamforgeCrucibleMeasure = 'sandbox-gloamforge-crucible-measure';
const gloamforgeCleaverUnfurl = 'sandbox-gloamforge-cleaver-unfurl';
const gloamforgeTimeline = serialBossTimeline([
  {
    phaseId: gloamforgeCrucibleMeasure,
    color: '#f59e0b',
    cameraStrength: 0.8,
    steps: [
      {
        id: 'sandbox-gloamforge-measure-port-cannon',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'port', motionCue: 'heavy-cannon' },
        leadSeconds: 1.1,
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-gloamforge-measure-starboard-cannon',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 6, side: 'starboard', motionCue: 'heavy-cannon' },
        leadSeconds: 1.1,
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-gloamforge-measure-crucible-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 16, sequence: 0 },
        leadSeconds: 1
      },
      {
        id: 'sandbox-gloamforge-measure-slag-pods',
        primitiveId: 'pod-volley',
        style: 'warning',
        parameters: { projectileCount: 7, sequence: 0 },
        leadSeconds: 1,
        actionDurationSeconds: 1.3
      },
      {
        id: 'sandbox-gloamforge-measure-slag-wall',
        primitiveId: 'weave-wall',
        style: 'lane',
        parameters: { projectileCount: 10, sequence: 0 },
        leadSeconds: 1.1,
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-gloamforge-measure-port-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'port', motionCue: 'heavy-cannon' },
        leadSeconds: 1.1,
        actionDurationSeconds: 1
      },
      {
        id: 'sandbox-gloamforge-measure-starboard-return',
        primitiveId: 'side-barrage',
        style: 'lane',
        parameters: { projectileCount: 7, side: 'starboard', motionCue: 'heavy-cannon' },
        leadSeconds: 1.1,
        actionDurationSeconds: 1
      }
    ]
  },
  {
    phaseId: gloamforgeCleaverUnfurl,
    color: '#fb7185',
    cameraStrength: 2,
    steps: [
      {
        id: 'sandbox-gloamforge-unfurl-crucible-ring',
        primitiveId: 'gap-ring',
        style: 'ring',
        parameters: { projectileCount: 20, sequence: 1 },
        leadSeconds: 1.1
      },
      {
        id: 'sandbox-gloamforge-unfurl-port-rail',
        primitiveId: 'rail-sweep',
        style: 'lane',
        parameters: { sequence: 0 },
        leadSeconds: 1.2,
        actionDurationSeconds: 2,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-gloamforge-unfurl-cleaver-fan',
        primitiveId: 'tail-fan',
        style: 'warning',
        parameters: { projectileCount: 10, sequence: 0 },
        leadSeconds: 1,
        actionDurationSeconds: 1.2
      },
      {
        id: 'sandbox-gloamforge-unfurl-slag-pods',
        primitiveId: 'pod-volley',
        style: 'warning',
        parameters: { projectileCount: 8, sequence: 1 },
        leadSeconds: 1,
        actionDurationSeconds: 1.4
      },
      {
        id: 'sandbox-gloamforge-unfurl-cross-cut',
        primitiveId: 'cross-beam',
        style: 'lane',
        leadSeconds: 1.2,
        actionDurationSeconds: 1.6,
        recoverySeconds: 2.2
      },
      {
        id: 'sandbox-gloamforge-unfurl-slag-wall',
        primitiveId: 'weave-wall',
        style: 'lane',
        parameters: { projectileCount: 12, sequence: 1 },
        leadSeconds: 1.1,
        actionDurationSeconds: 1.5
      },
      {
        id: 'sandbox-gloamforge-unfurl-starboard-rail',
        primitiveId: 'rail-sweep',
        style: 'lane',
        parameters: { sequence: 2 },
        leadSeconds: 1.2,
        actionDurationSeconds: 2,
        recoverySeconds: 2.4
      }
    ]
  }
]);

const definitions = deepFreeze([
  {
    id: 'sweep-bank-reentry',
    label: 'Redline Re-entry',
    shortLabel: 'Sweep / bank / re-entry',
    description: 'A deterministic traversal study that sweeps the arena, banks the presentation rig, exits, and re-enters before its next firing pass.',
    designIntent: [
      'Readable movement path before projectile pressure',
      'Presentation banking without rotating collision geometry',
      'Repeatable fixed-seed re-entry timing'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-redline-reentry',
      label: 'Redline Re-entry',
      rigId: 'paywall-siege',
      spriteKey: 'CAMPAIGN_BOSS_RAIL_SERPENT',
      health: 900,
      shieldCount: 2,
      phases: [
        {
          id: sweepOpening,
          label: 'Vector sweep',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 1,
          weaponSettingIds: ['sandbox-redline-reentry-burst', 'sandbox-redline-reentry-beam']
        },
        {
          id: sweepRage,
          label: 'Afterburner return',
          triggerHealthRatio: 0.45,
          movementPatternId: 'arena-roam',
          speedMultiplier: 1.35,
          weaponSettingIds: ['sandbox-redline-reentry-burst', 'sandbox-redline-reentry-beam']
        }
      ],
      timeline: sweepTimeline
    })
  },
  {
    id: 'prism-moth-brood',
    label: 'Prism Moth Broodkeeper',
    shortLabel: 'Prism Moth summoner',
    description: 'A Prism Moth sprite-archetype composition that exposes rig components, layers original projectile phrases, and summons warned Peer Review Bulwark formations.',
    designIntent: [
      'Prism Moth sprite archetype supplies the articulated visual identity',
      'Existing open-orbit component sockets provide authored weak points',
      'Every brick formation receives a distinct warning window',
      'Summons punctuate rather than replace the boss attack composition'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-prism-moth-brood',
      label: 'Prism Moth Broodkeeper',
      rigId: 'open-orbit',
      spriteKey: 'CAMPAIGN_BOSS_PRISM_MOTH',
      health: 1_050,
      shieldCount: 0,
      phases: [
        {
          id: mothOpening,
          label: 'Wing articulation',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.9,
          weaponSettingIds: ['sandbox-prism-moth-brood-burst', 'sandbox-prism-moth-brood-beam']
        },
        {
          id: mothBrood,
          label: 'Brood lattice',
          triggerHealthRatio: 0.62,
          movementPatternId: 'gatekeeper-cycle',
          speedMultiplier: 1.1,
          weaponSettingIds: ['sandbox-prism-moth-brood-burst', 'sandbox-prism-moth-brood-beam']
        },
        {
          id: mothRage,
          label: 'Prismatic molt',
          triggerHealthRatio: 0.28,
          movementPatternId: 'arena-roam',
          speedMultiplier: 1.35,
          weaponSettingIds: ['sandbox-prism-moth-brood-burst', 'sandbox-prism-moth-brood-beam']
        }
      ],
      timeline: mothTimeline
    })
  },
  {
    id: 'weak-point-laser-core',
    label: 'Tribunal Laser Core',
    shortLabel: 'Laser / weak-point core',
    description: 'A three-phase laser boss that trades shield layers for exposed cannons and a final helmet weak point while preserving explicit lane warnings.',
    designIntent: [
      'Cross-beam and rail damage always follow lane telegraphs',
      'Weak-point exposure is phase-authored and visually inspectable',
      'Final rage increases composition density without unbounded loops'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-tribunal-laser-core',
      label: 'Tribunal Laser Core',
      rigId: 'crown-claw',
      spriteKey: 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT',
      health: 1_200,
      shieldCount: 4,
      phases: [
        {
          id: laserShell,
          label: 'Shielded tribunal',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.8,
          weaponSettingIds: ['sandbox-tribunal-laser-core-burst', 'sandbox-tribunal-laser-core-beam']
        },
        {
          id: laserExpose,
          label: 'Cannon exposure',
          triggerHealthRatio: 0.55,
          movementPatternId: 'gatekeeper-cycle',
          speedMultiplier: 1.05,
          weaponSettingIds: ['sandbox-tribunal-laser-core-burst', 'sandbox-tribunal-laser-core-beam']
        },
        {
          id: laserRage,
          label: 'Core verdict',
          triggerHealthRatio: 0.22,
          movementPatternId: 'arena-roam',
          speedMultiplier: 1.3,
          weaponSettingIds: ['sandbox-tribunal-laser-core-burst', 'sandbox-tribunal-laser-core-beam']
        }
      ],
      timeline: laserTimeline
    })
  },
  {
    id: 'meridian-harrower',
    label: 'Meridian Harrower',
    shortLabel: 'Animated puzzle-boss study',
    description: 'A Test Mission boss built from an articulated generated-art atlas: readable limb wind-ups, launched pod sprites, shifting safe-channel walls, and a real aperture punish window.',
    designIntent: [
      'Generated modular artwork moves as a deterministic articulated rig',
      'Crescent poses communicate the next dodge puzzle before damage',
      'Launched pod sprites and safe-channel walls change the attack vocabulary',
      'Phases change decisions instead of merely shortening attack timers',
      'The final aperture is a real exposed weak point with a recovery window'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-meridian-harrower',
      label: 'Meridian Harrower',
      // Paywall Siege owns a real helmet component, allowing the authored
      // aperture exposure to change mechanics as well as presentation.
      rigId: 'paywall-siege',
      // The Boss Sandbox swaps this validated catalog placeholder for the
      // ignored local concept image only after the pure preview is built.
      spriteKey: 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT',
      health: 2_600,
      shieldCount: 0,
      sizeMultiplier: 1.45,
      phases: [
        {
          id: meridianOpening,
          label: 'Arm cipher',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.9,
          weaponSettingIds: ['sandbox-meridian-harrower-burst', 'sandbox-meridian-harrower-beam']
        },
        {
          id: meridianRing,
          label: 'Orbit key',
          triggerHealthRatio: 0.66,
          movementPatternId: 'gatekeeper-cycle',
          speedMultiplier: 0.95,
          weaponSettingIds: ['sandbox-meridian-harrower-burst', 'sandbox-meridian-harrower-beam']
        },
        {
          id: meridianAperture,
          label: 'Open aperture',
          triggerHealthRatio: 0.32,
          movementPatternId: 'arena-roam',
          speedMultiplier: 1,
          weaponSettingIds: ['sandbox-meridian-harrower-burst', 'sandbox-meridian-harrower-beam']
        }
      ],
      timeline: meridianTimeline
    })
  },
  {
    id: 'helios-clawcarrier',
    label: 'Helios Clawcarrier',
    shortLabel: 'Solar siege puzzle',
    description: 'A slow solar siege carrier whose braced claw banks, visibly spinning rotary guns, and opening reactor teach four connected dodge puzzles instead of relying on a raw speed check.',
    designIntent: [
      'Every tracer, ring, mine, and melee hit belongs to a visible rotary muzzle, reactor, or moving claw tip',
      'Twin Rotary Crossfire spins and recoils one cannon, answers from the other, then coordinates both around a readable lane',
      'Claw Sweep Pincer opens, strikes one connected claw at a time, then closes both with collision following the visible tips',
      'Reactor Maze opens the armor and advances four incomplete rings before deliberately deploying animated mines',
      'Clawcarrier Crush rises, tracks, locks, dives, closes, holds, releases, and returns without a targeting line'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-helios-clawcarrier',
      label: 'Helios Clawcarrier',
      // The Sandbox swaps this catalog-backed placeholder for the ignored
      // Helios V2 modular atlas after the canonical preview is constructed.
      rigId: 'crown-claw',
      spriteKey: 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT',
      health: 3_200,
      shieldCount: 0,
      speed: 1.35,
      sizeMultiplier: 1.35,
      burstIntervalSeconds: 4.8,
      beamIntervalSeconds: 8,
      phases: [
        {
          id: clawcarrierCalibration,
          label: 'Siege Calibration',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.72,
          weaponSettingIds: ['sandbox-helios-clawcarrier-burst', 'sandbox-helios-clawcarrier-beam']
        },
        {
          id: clawcarrierCrossfire,
          label: 'Armor Shear',
          triggerHealthRatio: 0.67,
          movementPatternId: 'gatekeeper-cycle',
          speedMultiplier: 0.75,
          weaponSettingIds: ['sandbox-helios-clawcarrier-burst', 'sandbox-helios-clawcarrier-beam']
        },
        {
          id: clawcarrierBreach,
          label: 'Reactor Overdrive',
          triggerHealthRatio: 0.32,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.78,
          weaponSettingIds: ['sandbox-helios-clawcarrier-burst', 'sandbox-helios-clawcarrier-beam']
        }
      ],
      timeline: clawcarrierTimeline
    })
  },
  {
    id: 'aurora-storm-engine',
    label: 'Aurora Oculus · Reference Study',
    shortLabel: 'Professional eye-boss study',
    description: 'A close mechanical study of the reference encounter: one floating eye chassis, an eight-socket rotor that deliberately reverses mid-cycle, staggered safe-gap rings, layered pellet and eye-sprite hazards, then thin guides and lethal beams on the same live angle.',
    designIntent: [
      'One shared rotor angle drives limbs, emission sockets, warning guides, and collision',
      'The chassis floats through the arena while the functional carrier rotates locally',
      'Pink rotor pellets reverse on a warned cadence while slow eye sprites create layered, readable pressure',
      'Safe-gap circles arrive as three separately warned pulses instead of one simultaneous projectile dump',
      'Thin moving guides show the exact four beam lanes before they become damaging',
      'Low health shortens the authored spit cadence without blanket movement-speed scaling'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-aurora-storm-engine',
      label: 'Aurora Oculus',
      // The Sandbox swaps this catalog-backed placeholder for the ignored
      // rotating-emitter atlas after the canonical preview is constructed.
      rigId: 'paywall-siege',
      componentMode: 'hull-only',
      spriteKey: 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT',
      health: 6_800,
      shieldCount: 0,
      speed: 0.55,
      sizeMultiplier: 2.35,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: stormEngineStudy,
          label: 'Survey orbit',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.95,
          weaponSettingIds: ['sandbox-aurora-storm-engine-burst', 'sandbox-aurora-storm-engine-beam']
        },
        {
          id: stormEngineOverdrive,
          label: 'Reverse overdrive',
          triggerHealthRatio: 0.32,
          movementPatternId: 'sine-drift',
          speedMultiplier: 1.05,
          weaponSettingIds: ['sandbox-aurora-storm-engine-burst', 'sandbox-aurora-storm-engine-beam']
        }
      ],
      timeline: stormEngineTimeline
    })
  },
  {
    id: 'nullwake-revenant',
    label: 'Nullwake Revenant',
    shortLabel: 'False-death revenant',
    description: 'A two-life mechanical revenant that truthfully reaches zero health, hangs powerless and limp, then restores a full second health bar as four backplane weapon nodes ignite and its combat silhouette enlarges.',
    designIntent: [
      'The first lethal hit produces a readable shutdown instead of rewards or an invisible phase swap',
      'A quiet limp interval and escalating reboot pulses sell the false defeat before the health bar refills',
      'Four opaque backplane weapon nodes remain dormant until the reboot and then become real attack emitters',
      'The awakened form changes from restrained claw fire to staggered gates, helixes, collapsing routes, and exact warned beams',
      'A second lethal hit is final, so the surprise is dramatic without becoming an endless resurrection trick'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-nullwake-revenant',
      label: 'Nullwake Revenant',
      rigId: 'open-orbit',
      componentMode: 'hull-only',
      spriteKey: 'CAMPAIGN_BOSS_ECLIPSE_ENGINE',
      health: 4_200,
      shieldCount: 0,
      speed: 0.65,
      sizeMultiplier: 1.32,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      revival: {
        phaseId: nullwakeBackplaneCrown,
        shutdownSeconds: 2.2,
        rebootSeconds: 2.6,
        restoreHealthRatio: 1,
        awakenedSizeMultiplier: 1.22
      },
      phases: [
        {
          id: nullwakeBorrowedCharge,
          label: 'Borrowed Charge',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.72,
          weaponSettingIds: ['sandbox-nullwake-revenant-burst', 'sandbox-nullwake-revenant-beam']
        },
        {
          id: nullwakeBackplaneCrown,
          label: 'Backplane Crown',
          triggerHealthRatio: 0.99,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.78,
          weaponSettingIds: ['sandbox-nullwake-revenant-burst', 'sandbox-nullwake-revenant-beam']
        },
        {
          id: nullwakeTerminalOverclock,
          label: 'Terminal Overclock',
          triggerHealthRatio: 0.28,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.84,
          weaponSettingIds: ['sandbox-nullwake-revenant-burst', 'sandbox-nullwake-revenant-beam']
        }
      ],
      timeline: nullwakeTimeline
    })
  },
  {
    id: 'umbra-needlewing',
    label: 'Umbra Needlewing',
    shortLabel: 'Blackout corner hunter',
    description: 'A transforming-orbiter night hunter whose wing emitters trade measured side fire for a fair, fully telegraphed corner ambush while its core opens one navigable ring at a time.',
    designIntent: [
      'Wing emitters alternate port and starboard fire instead of launching shots from the hull center',
      'The blackout sentence preserves the player ship and HUD while one corner silhouette owns the warned beam',
      'Corner parity, safe-gap order, and recovery placement change by phase without blanket speed inflation',
      'Every corner beam uses an exact target warning before a short commitment and a long escape window'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-umbra-needlewing',
      label: 'Umbra Needlewing',
      rigId: 'open-orbit',
      componentMode: 'hull-only',
      spriteKey: 'CAMPAIGN_BOSS_ECLIPSE_ENGINE',
      health: 5_200,
      shieldCount: 0,
      speed: 0.8,
      sizeMultiplier: 1.75,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: umbraWingSurvey,
          label: 'Wing Survey',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.82,
          weaponSettingIds: ['sandbox-umbra-needlewing-burst', 'sandbox-umbra-needlewing-beam']
        },
        {
          id: umbraBlackoutHunt,
          label: 'Blackout Hunt',
          triggerHealthRatio: 0.66,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.85,
          weaponSettingIds: ['sandbox-umbra-needlewing-burst', 'sandbox-umbra-needlewing-beam']
        },
        {
          id: umbraBrokenCompass,
          label: 'Broken Compass',
          triggerHealthRatio: 0.3,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.88,
          weaponSettingIds: ['sandbox-umbra-needlewing-burst', 'sandbox-umbra-needlewing-beam']
        }
      ],
      timeline: umbraTimeline
    })
  },
  {
    id: 'cinderjaw-siege-beetle',
    label: 'Cinderjaw Siege Beetle',
    shortLabel: 'Siege cannon beetle',
    description: 'An articulated-pincer siege creature that braces before firing its two heavy cheek cannons, drops visible pod mines from its claws, then falls back to exposed gatlings around a stripped reactor.',
    designIntent: [
      'Port and starboard cannon sentences recoil from their matching cheek weapons',
      'Mine sprites detach only from the two claw pods and leave a mobile-safe route between them',
      'The central reactor owns every gap ring while the side weapons remain visually causal',
      'The final phase changes weapon vocabulary from heavy cannons to gatlings instead of accelerating the whole boss'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-cinderjaw-siege-beetle',
      label: 'Cinderjaw Siege Beetle',
      rigId: 'paywall-siege',
      spriteKey: 'CAMPAIGN_BOSS_SINGULARITY_CRAB',
      health: 5_800,
      shieldCount: 0,
      speed: 0.65,
      sizeMultiplier: 1.65,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: cinderjawSiegeStance,
          label: 'Siege Stance',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.68,
          weaponSettingIds: ['sandbox-cinderjaw-siege-beetle-burst', 'sandbox-cinderjaw-siege-beetle-beam']
        },
        {
          id: cinderjawClawBattery,
          label: 'Claw Battery',
          triggerHealthRatio: 0.67,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.7,
          weaponSettingIds: ['sandbox-cinderjaw-siege-beetle-burst', 'sandbox-cinderjaw-siege-beetle-beam']
        },
        {
          id: cinderjawStrippedReactor,
          label: 'Stripped Reactor',
          triggerHealthRatio: 0.32,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.72,
          weaponSettingIds: ['sandbox-cinderjaw-siege-beetle-burst', 'sandbox-cinderjaw-siege-beetle-beam']
        }
      ],
      timeline: cinderjawTimeline
    })
  },
  {
    id: 'gloamforge-mantis',
    label: 'Gloamforge Mantis',
    shortLabel: 'Crucible cleaver mantis',
    description: 'A deliberate modular foundry hunter whose forearm cannons alternate sides, whose central crucible stages navigable projectile rings, and whose slag pods unfold into a phase-two rail-and-cleaver vocabulary.',
    designIntent: [
      'Every port and starboard barrage originates at the matching articulated forearm cannon socket',
      'The exposed chest crucible owns each staged sixteen-to-twenty-shot gap ring while paired slag pods own every pod volley and weave wall',
      'At low health the armor petals open and the central plasma cleaver unfolds, changing both the silhouette and the weapon vocabulary',
      'Phase two adds warned rail sweeps, cross-beam cuts, and a cleaver tail fan without a blanket movement-speed jump',
      'Every damaging commitment has its own linked telegraph and visible recovery window'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-gloamforge-mantis',
      label: 'Gloamforge Mantis',
      rigId: 'paywall-siege',
      spriteKey: 'CAMPAIGN_BOSS_SINGULARITY_CRAB',
      health: 5_600,
      shieldCount: 0,
      speed: 0.7,
      sizeMultiplier: 1.7,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: gloamforgeCrucibleMeasure,
          label: 'Crucible Measure',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.8,
          weaponSettingIds: ['sandbox-gloamforge-mantis-burst', 'sandbox-gloamforge-mantis-beam']
        },
        {
          id: gloamforgeCleaverUnfurl,
          label: 'Cleaver Unfurl',
          triggerHealthRatio: 0.34,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.8,
          weaponSettingIds: ['sandbox-gloamforge-mantis-burst', 'sandbox-gloamforge-mantis-beam']
        }
      ],
      timeline: gloamforgeTimeline
    })
  },
  {
    id: 'vesperglass-mothmother',
    label: 'Vesperglass Mothmother',
    shortLabel: 'Prismatic brood moth',
    description: 'A segmented-crescent brood carrier whose wings answer one another, whose abdominal pods release slow cocoon sprites, and whose tail and glass core teach a different safe-route motif in every phase.',
    designIntent: [
      'Alternating side volleys originate at the matching wing tips and cocoon sprites detach from visible pods',
      'The segmented tail owns every tail fan while the luminous core owns gap rings and rotating crosses',
      'Brood pressure comes from order and route geometry rather than unbounded summons or projectile counts',
      'The prismatic molt recombines already learned left and right helixes around deliberate recovery windows'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-vesperglass-mothmother',
      label: 'Vesperglass Mothmother',
      rigId: 'open-orbit',
      spriteKey: 'CAMPAIGN_BOSS_PRISM_MOTH',
      health: 5_000,
      shieldCount: 0,
      speed: 0.9,
      sizeMultiplier: 1.25,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: vesperglassWingbeatMeasure,
          label: 'Wingbeat Measure',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.84,
          weaponSettingIds: ['sandbox-vesperglass-mothmother-burst', 'sandbox-vesperglass-mothmother-beam']
        },
        {
          id: vesperglassBroodLattice,
          label: 'Brood Lattice',
          triggerHealthRatio: 0.64,
          movementPatternId: 'gatekeeper-cycle',
          speedMultiplier: 0.86,
          weaponSettingIds: ['sandbox-vesperglass-mothmother-burst', 'sandbox-vesperglass-mothmother-beam']
        },
        {
          id: vesperglassPrismaticMolt,
          label: 'Prismatic Molt',
          triggerHealthRatio: 0.29,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.88,
          weaponSettingIds: ['sandbox-vesperglass-mothmother-burst', 'sandbox-vesperglass-mothmother-beam']
        }
      ],
      timeline: vesperglassTimeline
    })
  },
  {
    id: 'twin-halo-wardens',
    label: 'Twin Halo Wardens',
    shortLabel: 'Call-and-answer sentinels',
    description: 'A transforming-orbiter pair that passes pressure between two halo bodies: one side calls, the other answers, orbit nodes trade places, and the shared core commits only to the exact cross lanes it warned.',
    designIntent: [
      'Left and right bodies alternate side fire so each projectile sentence has a readable owner',
      'Large orbit-node sprites launch from visible halo sockets before the two bodies exchange positions',
      'Gap rings and cross beams originate from the shared conjunction core rather than arbitrary body points',
      'Conjunction raises difficulty by reordering known calls around exact beam lanes, not by hiding or speeding warnings'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-twin-halo-wardens',
      label: 'Twin Halo Wardens',
      rigId: 'citation-storm',
      componentMode: 'hull-only',
      spriteKey: 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE',
      health: 6_200,
      shieldCount: 0,
      speed: 0.72,
      sizeMultiplier: 1.7,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: twinHaloCallAndAnswer,
          label: 'Call and Answer',
          triggerHealthRatio: 1,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.78,
          weaponSettingIds: ['sandbox-twin-halo-wardens-burst', 'sandbox-twin-halo-wardens-beam']
        },
        {
          id: twinHaloOrbitExchange,
          label: 'Orbit Exchange',
          triggerHealthRatio: 0.65,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.8,
          weaponSettingIds: ['sandbox-twin-halo-wardens-burst', 'sandbox-twin-halo-wardens-beam']
        },
        {
          id: twinHaloConjunction,
          label: 'Conjunction',
          triggerHealthRatio: 0.3,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.82,
          weaponSettingIds: ['sandbox-twin-halo-wardens-burst', 'sandbox-twin-halo-wardens-beam']
        }
      ],
      timeline: twinHaloTimeline
    })
  },
  {
    id: 'riftcoil-wyrm',
    label: 'Riftcoil Wyrm',
    shortLabel: 'Helix corridor serpent',
    description: 'A segmented-crescent rift serpent that writes paired left and right helixes around a center seam, turns its tail into a readable fan, then coils rotating core geometry into aligned tail exits.',
    designIntent: [
      'Left and right fang emitters write mirrored helixes while preserving a readable center seam',
      'Every tail fan originates from the articulated tail and follows the preceding core sentence',
      'The chest core owns gap rings and rotating crosses while the head and body remain collision-stable',
      'The coil cage escalates by aligning cross-and-tail pairs in a new order instead of accelerating ambient movement'
    ],
    boss: gatekeeperBoss({
      id: 'sandbox-riftcoil-wyrm',
      label: 'Riftcoil Wyrm',
      rigId: 'crown-claw',
      componentMode: 'hull-only',
      spriteKey: 'CAMPAIGN_BOSS_RAIL_SERPENT',
      health: 5_600,
      shieldCount: 0,
      speed: 0.72,
      sizeMultiplier: 1.7,
      burstIntervalSeconds: 30,
      beamIntervalSeconds: 30,
      phases: [
        {
          id: riftcoilFangMeasure,
          label: 'Fang Measure',
          triggerHealthRatio: 1,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.76,
          weaponSettingIds: ['sandbox-riftcoil-wyrm-burst', 'sandbox-riftcoil-wyrm-beam']
        },
        {
          id: riftcoilTailCipher,
          label: 'Tail Cipher',
          triggerHealthRatio: 0.66,
          movementPatternId: 'arena-roam',
          speedMultiplier: 0.78,
          weaponSettingIds: ['sandbox-riftcoil-wyrm-burst', 'sandbox-riftcoil-wyrm-beam']
        },
        {
          id: riftcoilCoilCage,
          label: 'Coil Cage',
          triggerHealthRatio: 0.31,
          movementPatternId: 'sine-drift',
          speedMultiplier: 0.8,
          weaponSettingIds: ['sandbox-riftcoil-wyrm-burst', 'sandbox-riftcoil-wyrm-beam']
        }
      ],
      timeline: riftcoilTimeline
    })
  }
] satisfies readonly PrototypeDefinition[]);

const buildPreview = (
  definition: PrototypeDefinition,
  prototypeHash: string,
  sourceCampaign: GameCampaignConfig
): SandboxBossPrototypePreview => {
  assertValidGameCampaign(sourceCampaign);
  const campaign = clone(sourceCampaign);
  const level = [...campaign.levels].sort((left, right) => left.order - right.order)[0];
  const wave = level && [...level.waves].sort((left, right) => left.order - right.order)[0];
  if (!level || !wave) {
    throw new Error('Sandbox boss prototypes require a validated campaign with at least one wave');
  }

  const boss = clone(definition.boss) as BossEvent;
  const previewWave = {
    ...wave,
    name: `SANDBOX · ${definition.label}`,
    completionRule: 'boss-defeat' as const,
    difficultyMultiplier: 1,
    durationSeconds: 90,
    introSeconds: 0,
    delayAfterSeconds: 0,
    scoreMultiplier: 1,
    threatCap: Math.max(48, wave.threatCap),
    events: [boss]
  };
  const waveIndex = level.waves.findIndex((candidate) => candidate.id === wave.id);
  level.waves[waveIndex] = previewWave;
  assertValidGameCampaign(campaign);

  const previewHash = prototypeFingerprint({
    schemaVersion: 1,
    prototypeHash,
    sourceCampaign: {
      id: sourceCampaign.id,
      revision: sourceCampaign.revision,
      updatedAt: sourceCampaign.updatedAt
    },
    campaign
  });
  const sandboxPrototype = Object.freeze({
    schemaVersion: 1 as const,
    source: 'director-sandbox-prototype' as const,
    sandboxOnly: true as const,
    promotionAllowed: false as const,
    prototypeId: definition.id,
    prototypeHash,
    previewHash
  });

  return {
    campaign,
    focus: {
      kind: 'boss',
      levelId: level.id,
      waveId: wave.id,
      eventId: boss.id
    },
    levelId: level.id,
    waveId: wave.id,
    eventId: boss.id,
    previewWave: clone(previewWave),
    limitations: Object.freeze([
      'Director Sandbox fixture only; it cannot be promoted or applied to the Mission Builder workspace.',
      'The preview reuses a source wave ID only as an in-memory host for the canonical GameEditorCanvas path.'
    ]),
    sandboxPrototype
  };
};

export const SANDBOX_BOSS_PROTOTYPES: readonly SandboxBossPrototypeDescriptor[] = Object.freeze(
  definitions.map((definition) => {
    const prototypeHash = prototypeFingerprint({
      schemaVersion: 1,
      sandboxOnly: true,
      id: definition.id,
      boss: definition.boss
    });
    return Object.freeze({
      id: definition.id,
      label: definition.label,
      shortLabel: definition.shortLabel,
      description: definition.description,
      designIntent: definition.designIntent,
      sandboxOnly: true as const,
      prototypeHash,
      buildPreview: (sourceCampaign: GameCampaignConfig) => (
        buildPreview(definition, prototypeHash, sourceCampaign)
      )
    });
  })
);

export const SANDBOX_BOSS_PROTOTYPE_BY_ID = Object.freeze(
  Object.fromEntries(SANDBOX_BOSS_PROTOTYPES.map((prototype) => [prototype.id, prototype]))
) as Readonly<Record<SandboxBossPrototypeId, SandboxBossPrototypeDescriptor>>;

export const buildSandboxBossPrototypePreview = (
  sourceCampaign: GameCampaignConfig,
  prototypeId: SandboxBossPrototypeId
): SandboxBossPrototypePreview => (
  SANDBOX_BOSS_PROTOTYPE_BY_ID[prototypeId].buildPreview(sourceCampaign)
);
