import {
  ABYSSAL_OCTARCH_CAMERA_PROFILE,
  ABYSSAL_OCTARCH_EVENT_ID
} from '../../gameplay/bosses/AbyssalOctarchRuntime';
import type { BossWeaponSocketProfile } from '../../gameplay/bosses/BossWeaponSocketRuntime';
import type { BossModularProjectileVisualKind } from '../../gameplay/bosses/BossProjectilePresentationRuntime';
import type { EncounterCameraProfile } from '../../gameplay/EncounterCameraRuntime';
import {
  FIXED_FRAME_ANIMATION_KIND,
  MODULAR_BOSS_RIG_KIND,
  registerModularBossRig,
  type ModularBossAtlasFrame,
  type ModularBossRigManifest
} from './ModularHierarchyRig';
import {
  sampleAbyssalOctarchModularPose,
  validateAbyssalOctarchRigCompatibility
} from './AbyssalOctarchModularPose';
import { ABYSSAL_OCTARCH_NEUTRAL_TENTACLE_MOUNTS } from './AbyssalOctarchRigLayout';
import type {
  PreviewBossArtwork,
  PreviewBossProjectileAnimation
} from './PreviewBossRigContracts';
import {
  MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
  type PreviewBossReferenceComparisonDescriptor
} from './PreviewBossReferenceComparison';

/**
 * This package is intentionally backed only by the accepted, deterministic
 * outputs of tools/build-abyssal-octarch-assets.mjs. Raw generations and
 * Director-only source boards never become runtime URLs.
 */
export const ABYSSAL_OCTARCH_ART_ROOT =
  '/game-art/generated/bosses/test-packages/abyssal-octarch-v1' as const;

export const ABYSSAL_OCTARCH_NEUTRAL_SHA256 =
  'a9fc10f01d3d6abcb51ff00b8be1a2b6ead7c02b10e7ee697369b2c1c1b7854d' as const;
export const ABYSSAL_OCTARCH_ATLAS_SHA256 =
  'dae4d697b30ee0a7f6509022fc4273907452b7a71a02377bfe885a3523f4cf30' as const;
export const ABYSSAL_OCTARCH_REFERENCE_SHA256 =
  '32e3b0b8989342a8fcf1c1df3e41894b714a0e896621ebb5218a8c9f1e685831' as const;

export const ABYSSAL_OCTARCH_NEUTRAL_URL =
  `${ABYSSAL_OCTARCH_ART_ROOT}/assembled-${ABYSSAL_OCTARCH_NEUTRAL_SHA256}.png` as const;
export const ABYSSAL_OCTARCH_ATLAS_URL =
  `${ABYSSAL_OCTARCH_ART_ROOT}/atlas-${ABYSSAL_OCTARCH_ATLAS_SHA256}.png` as const;
export const ABYSSAL_OCTARCH_REFERENCE_URL =
  `${ABYSSAL_OCTARCH_ART_ROOT}/reference-${ABYSSAL_OCTARCH_REFERENCE_SHA256}.png` as const;

export const ABYSSAL_OCTARCH_DESIGN_SIZE = Object.freeze({
  width: 720,
  height: 480
});

const frame = (
  x: number,
  y: number,
  width: number,
  height: number
): ModularBossAtlasFrame => Object.freeze({ x, y, width, height });

/** Fixed frame table emitted by the deterministic asset builder. */
export const ABYSSAL_OCTARCH_ATLAS_FRAMES = Object.freeze({
  'body.anger': frame(4, 4, 208, 287),
  'body.collapse': frame(216, 4, 208, 287),
  'body.core-exposed': frame(428, 4, 208, 287),
  'body.neutral': frame(640, 4, 208, 287),
  'tentacle.constrict.extended': frame(482, 295, 227, 110),
  'tentacle.constrict.loose': frame(713, 295, 227, 110),
  'tentacle.constrict.tight': frame(944, 295, 227, 110),
  'tentacle.grasp.closed': frame(1606, 295, 240, 89),
  'tentacle.grasp.open': frame(4, 409, 240, 89),
  'tentacle.grasp.reach': frame(248, 409, 240, 89),
  'tentacle.slam.hanging': frame(852, 4, 237, 131),
  'tentacle.slam.needle': frame(1093, 4, 237, 131),
  'tentacle.slam.windup': frame(1334, 4, 237, 131),
  'tentacle.sweep.extended': frame(1667, 4, 235, 110),
  'tentacle.sweep.neutral': frame(4, 295, 235, 110),
  'tentacle.sweep.windup': frame(243, 295, 235, 110),
  'vfx.asteroid': frame(893, 409, 85, 81),
  'vfx.asteroid-cracked': frame(982, 409, 85, 81),
  'vfx.asteroid-fragments': frame(1071, 409, 85, 81),
  'vfx.beam-segment': frame(1348, 409, 88, 44),
  'vfx.bolt': frame(1440, 409, 74, 44),
  'vfx.charged-orb': frame(1160, 409, 79, 79),
  'vfx.core-implosion': frame(1175, 295, 112, 109),
  'vfx.damage-sparks': frame(582, 409, 86, 87),
  'vfx.grab-ring': frame(802, 409, 87, 86),
  'vfx.impact': frame(492, 409, 86, 88),
  'vfx.slam-shockwave': frame(1243, 409, 101, 52),
  'vfx.socket-burst': frame(672, 409, 126, 86),
  'vfx.suction-spiral': frame(1575, 4, 88, 124),
  'vfx.void-cloud.0': frame(1291, 295, 101, 93),
  'vfx.void-cloud.1': frame(1396, 295, 101, 93),
  'vfx.void-cloud.2': frame(1501, 295, 101, 93)
});

const transform = (
  x: number,
  y: number,
  rotation = 0,
  scaleX = 1,
  scaleY = 1
) => Object.freeze({ x, y, rotation, scaleX, scaleY });

const anchor = (x = 0.5, y = 0.5) => Object.freeze({ x, y });
const radians = (degrees: number) => degrees * Math.PI / 180;

const tentaclePart = ({
  index,
  side,
  x,
  y,
  rotation,
  frameId,
  frameAnchor,
  layer
}: {
  index: number;
  side: 'port' | 'starboard';
  x: number;
  y: number;
  rotation: number;
  frameId: string;
  frameAnchor: Readonly<{ x: number; y: number }>;
  layer: number;
}) => Object.freeze([
  Object.freeze({
    id: `tentacle.${index}.${side}.mount`,
    role: 'joint' as const,
    parentId: 'root',
    frameId: null,
    transform: transform(x, y, radians(rotation)),
    anchor: null,
    layer,
    visible: false
  }),
  Object.freeze({
    id: `tentacle.${index}.${side}`,
    role: 'arm' as const,
    parentId: `tentacle.${index}.${side}.mount`,
    frameId,
    transform: transform(0, 0, 0, side === 'port' ? 0.94 : -0.94, 0.94),
    anchor: frameAnchor,
    layer,
    visible: true
  })
]);

const sweepAnchor = anchor(0.9617021276595744, 0.6818181818181818);
const slamAnchor = anchor(0.9620253164556962, 0.5877862595419847);
const constrictAnchor = anchor(0.960352422907489, 0.6363636363636364);
const graspAnchor = anchor(0.9625, 0.550561797752809);
const [
  upperMount,
  middleUpperMount,
  middleLowerMount,
  lowerMount
] = ABYSSAL_OCTARCH_NEUTRAL_TENTACLE_MOUNTS;

export const ABYSSAL_OCTARCH_RIG_MANIFEST = Object.freeze({
  kind: MODULAR_BOSS_RIG_KIND,
  id: 'abyssal-octarch',
  designSize: ABYSSAL_OCTARCH_DESIGN_SIZE,
  preserveAspectRatio: true,
  atlas: Object.freeze({
    url: ABYSSAL_OCTARCH_ATLAS_URL,
    contentHash: ABYSSAL_OCTARCH_ATLAS_SHA256,
    width: 2048,
    height: 512,
    frames: ABYSSAL_OCTARCH_ATLAS_FRAMES
  }),
  parts: Object.freeze([
    Object.freeze({
      id: 'root',
      role: 'joint' as const,
      parentId: null,
      frameId: null,
      transform: transform(0, -8),
      anchor: null,
      layer: 0,
      visible: false
    }),
    ...tentaclePart({
      index: 0,
      side: 'port',
      x: -upperMount.x,
      y: upperMount.y,
      rotation: upperMount.portRotation,
      frameId: 'tentacle.sweep.neutral',
      frameAnchor: sweepAnchor,
      layer: 2
    }),
    ...tentaclePart({
      index: 0,
      side: 'starboard',
      x: upperMount.x,
      y: upperMount.y,
      rotation: upperMount.starboardRotation,
      frameId: 'tentacle.sweep.neutral',
      frameAnchor: sweepAnchor,
      layer: 2
    }),
    ...tentaclePart({
      index: 1,
      side: 'port',
      x: -middleUpperMount.x,
      y: middleUpperMount.y,
      rotation: middleUpperMount.portRotation,
      frameId: 'tentacle.slam.hanging',
      frameAnchor: slamAnchor,
      layer: 3
    }),
    ...tentaclePart({
      index: 1,
      side: 'starboard',
      x: middleUpperMount.x,
      y: middleUpperMount.y,
      rotation: middleUpperMount.starboardRotation,
      frameId: 'tentacle.slam.hanging',
      frameAnchor: slamAnchor,
      layer: 3
    }),
    ...tentaclePart({
      index: 2,
      side: 'port',
      x: -middleLowerMount.x,
      y: middleLowerMount.y,
      rotation: middleLowerMount.portRotation,
      frameId: 'tentacle.constrict.loose',
      frameAnchor: constrictAnchor,
      layer: 4
    }),
    ...tentaclePart({
      index: 2,
      side: 'starboard',
      x: middleLowerMount.x,
      y: middleLowerMount.y,
      rotation: middleLowerMount.starboardRotation,
      frameId: 'tentacle.constrict.loose',
      frameAnchor: constrictAnchor,
      layer: 4
    }),
    ...tentaclePart({
      index: 3,
      side: 'port',
      x: -lowerMount.x,
      y: lowerMount.y,
      rotation: lowerMount.portRotation,
      frameId: 'tentacle.grasp.open',
      frameAnchor: graspAnchor,
      layer: 5
    }),
    ...tentaclePart({
      index: 3,
      side: 'starboard',
      x: lowerMount.x,
      y: lowerMount.y,
      rotation: lowerMount.starboardRotation,
      frameId: 'tentacle.grasp.open',
      frameAnchor: graspAnchor,
      layer: 5
    }),
    Object.freeze({
      id: 'body',
      role: 'body' as const,
      parentId: 'root',
      frameId: 'body.neutral',
      transform: transform(0, -2, 0, 1.02, 1.02),
      anchor: anchor(),
      layer: 10,
      visible: true
    }),
    Object.freeze({
      id: 'effect.void-cloud',
      role: 'effect' as const,
      parentId: 'root',
      frameId: 'vfx.void-cloud.0',
      transform: transform(0, 48, 0, 1.25, 1.25),
      anchor: anchor(),
      layer: 1,
      visible: false
    }),
    Object.freeze({
      id: 'effect.core',
      role: 'effect' as const,
      parentId: 'body',
      frameId: 'vfx.charged-orb',
      transform: transform(0, 48, 0, 0.72, 0.72),
      anchor: anchor(),
      layer: 20,
      visible: false
    }),
    Object.freeze({
      id: 'effect.mouth',
      role: 'effect' as const,
      parentId: 'body',
      frameId: 'vfx.suction-spiral',
      transform: transform(0, 58, 0, 0.76, 0.76),
      anchor: anchor(),
      layer: 21,
      visible: false
    }),
    Object.freeze({
      id: 'effect.attack.port',
      role: 'effect' as const,
      parentId: 'root',
      frameId: 'vfx.grab-ring',
      transform: transform(-118, 24, 0, 0.82, 0.82),
      anchor: anchor(),
      layer: 22,
      visible: false
    }),
    Object.freeze({
      id: 'effect.attack.starboard',
      role: 'effect' as const,
      parentId: 'root',
      frameId: 'vfx.grab-ring',
      transform: transform(118, 24, 0, 0.82, 0.82),
      anchor: anchor(),
      layer: 22,
      visible: false
    }),
    Object.freeze({
      id: 'effect.damage',
      role: 'effect' as const,
      parentId: 'body',
      frameId: 'vfx.damage-sparks',
      transform: transform(0, 0, 0, 0.84, 0.84),
      anchor: anchor(),
      layer: 23,
      visible: false
    }),
    Object.freeze({
      id: 'effect.implosion',
      role: 'effect' as const,
      parentId: 'body',
      frameId: 'vfx.core-implosion',
      transform: transform(0, 48, 0, 0.82, 0.82),
      anchor: anchor(),
      layer: 24,
      visible: false
    })
  ]),
  animations: Object.freeze([
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'body-state-cycle',
      partId: 'body',
      frameIds: Object.freeze([
        'body.neutral',
        'body.anger',
        'body.core-exposed',
        'body.collapse'
      ]),
      frameHold: 12,
      loop: false
    }),
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'tentacle-sweep-cycle',
      partId: 'tentacle.0.port',
      frameIds: Object.freeze([
        'tentacle.sweep.neutral',
        'tentacle.sweep.windup',
        'tentacle.sweep.extended'
      ]),
      frameHold: 8,
      loop: false
    }),
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'tentacle-slam-cycle',
      partId: 'tentacle.1.port',
      frameIds: Object.freeze([
        'tentacle.slam.hanging',
        'tentacle.slam.windup',
        'tentacle.slam.needle'
      ]),
      frameHold: 7,
      loop: false
    }),
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'tentacle-constrict-cycle',
      partId: 'tentacle.2.port',
      frameIds: Object.freeze([
        'tentacle.constrict.loose',
        'tentacle.constrict.tight',
        'tentacle.constrict.extended'
      ]),
      frameHold: 9,
      loop: false
    }),
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'tentacle-grasp-cycle',
      partId: 'tentacle.3.port',
      frameIds: Object.freeze([
        'tentacle.grasp.open',
        'tentacle.grasp.reach',
        'tentacle.grasp.closed'
      ]),
      frameHold: 8,
      loop: false
    })
  ]),
  sockets: Object.freeze([
    Object.freeze({
      id: 'core.emitter',
      role: 'core-origin' as const,
      partId: 'body',
      x: 0,
      y: 48,
      rotation: 0
    }),
    Object.freeze({
      id: 'mouth.suction',
      role: 'effect-origin' as const,
      partId: 'body',
      x: 0,
      y: 58,
      rotation: Math.PI / 2
    }),
    Object.freeze({
      id: 'core.beam',
      role: 'beam-origin' as const,
      partId: 'body',
      x: 0,
      y: 52,
      rotation: Math.PI / 2
    }),
    Object.freeze({
      id: 'core.projectile.port',
      role: 'projectile-muzzle' as const,
      partId: 'body',
      x: -32,
      y: 48,
      rotation: Math.PI / 2
    }),
    Object.freeze({
      id: 'core.projectile.starboard',
      role: 'projectile-muzzle' as const,
      partId: 'body',
      x: 32,
      y: 48,
      rotation: Math.PI / 2
    }),
    ...([0, 1, 2, 3] as const).flatMap((index) => (
      (['port', 'starboard'] as const).map((side) => Object.freeze({
        id: `tentacle-${index}-${side}-tip`,
        role: 'melee-root' as const,
        partId: `tentacle.${index}.${side}`,
        x: -224,
        y: 0,
        rotation: side === 'port' ? Math.PI : 0
      }))
    ))
  ]),
  destruction: Object.freeze({
    durationFrames: 150,
    fragments: Object.freeze([
      Object.freeze({ partId: 'tentacle.0.port', delayFrames: 0, travelX: -180, travelY: 150, rotationRadians: -2.2 }),
      Object.freeze({ partId: 'tentacle.0.starboard', delayFrames: 4, travelX: 188, travelY: 162, rotationRadians: 2.2 }),
      Object.freeze({ partId: 'tentacle.1.port', delayFrames: 8, travelX: -196, travelY: 174, rotationRadians: -2.2 }),
      Object.freeze({ partId: 'tentacle.1.starboard', delayFrames: 12, travelX: 204, travelY: 186, rotationRadians: 2.2 }),
      Object.freeze({ partId: 'tentacle.2.port', delayFrames: 16, travelX: -212, travelY: 198, rotationRadians: -2.2 }),
      Object.freeze({ partId: 'tentacle.2.starboard', delayFrames: 20, travelX: 220, travelY: 210, rotationRadians: 2.2 }),
      Object.freeze({ partId: 'tentacle.3.port', delayFrames: 24, travelX: -228, travelY: 222, rotationRadians: -2.2 }),
      Object.freeze({ partId: 'tentacle.3.starboard', delayFrames: 28, travelX: 236, travelY: 234, rotationRadians: 2.2 }),
      Object.freeze({ partId: 'body', delayFrames: 40, travelX: 0, travelY: 220, rotationRadians: 0.35 })
    ])
  })
} satisfies ModularBossRigManifest);

export const ABYSSAL_OCTARCH_MODULAR_RIG = registerModularBossRig(
  ABYSSAL_OCTARCH_RIG_MANIFEST
);

const compatibilityIssues = validateAbyssalOctarchRigCompatibility(
  ABYSSAL_OCTARCH_MODULAR_RIG
);
if (compatibilityIssues.length > 0) {
  throw new Error(
    `Abyssal Octarch modular rig is incompatible: ${compatibilityIssues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
}

export const ABYSSAL_OCTARCH_WEAPON_SOCKETS = Object.freeze({
  kind: 'normalized-boss-sockets-v1',
  sockets: Object.freeze([
    Object.freeze({ id: 'core.emitter', role: 'core', xRatio: 0.5, yRatio: 0.579 }),
    Object.freeze({ id: 'core.projectile.port', role: 'port', xRatio: 0.455, yRatio: 0.579 }),
    Object.freeze({ id: 'core.projectile.starboard', role: 'starboard', xRatio: 0.545, yRatio: 0.579 }),
    Object.freeze({ id: 'tentacle-0-port-tip', role: 'port', xRatio: 0.071, yRatio: 0.223 }),
    Object.freeze({ id: 'tentacle-0-starboard-tip', role: 'starboard', xRatio: 0.929, yRatio: 0.223 }),
    Object.freeze({ id: 'tentacle-1-port-tip', role: 'port', xRatio: 0.07, yRatio: 0.42 }),
    Object.freeze({ id: 'tentacle-1-starboard-tip', role: 'starboard', xRatio: 0.93, yRatio: 0.42 }),
    Object.freeze({ id: 'tentacle-2-port-tip', role: 'port', xRatio: 0.082, yRatio: 0.638 }),
    Object.freeze({ id: 'tentacle-2-starboard-tip', role: 'starboard', xRatio: 0.918, yRatio: 0.638 }),
    Object.freeze({ id: 'tentacle-3-port-tip', role: 'port', xRatio: 0.125, yRatio: 0.838 }),
    Object.freeze({ id: 'tentacle-3-starboard-tip', role: 'starboard', xRatio: 0.875, yRatio: 0.838 })
  ])
} satisfies BossWeaponSocketProfile);

const projectileAnimation = (
  frameIds: readonly string[],
  frameHoldFrames: number,
  minimumVisualHeight: number,
  entityHeightScale: number,
  orientationOffsetRadians: number
): PreviewBossProjectileAnimation => Object.freeze({
  frameIds: Object.freeze([...frameIds]),
  frameHoldFrames,
  minimumVisualHeight,
  entityHeightScale,
  orientationOffsetRadians
});

/**
 * The global projectile contract already contains eight generic Singularity
 * channels. Octarch reuses those semantic slots while keeping every texture
 * and authored meaning local to this package.
 */
export const ABYSSAL_OCTARCH_VISUAL_ROLE_TO_KIND = Object.freeze({
  'grasp-field': 'boss-singularity-seed',
  'suction-vortex': 'boss-singularity-well',
  'needle-tip': 'boss-singularity-shard',
  'abyssal-beam': 'boss-singularity-beam',
  'tentacle-impact': 'boss-singularity-claw',
  'void-bolt': 'boss-singularity-bolt',
  'socket-burst': 'boss-singularity-pulse',
  'core-implosion': 'boss-singularity-collapse'
} as const satisfies Readonly<Record<string, BossModularProjectileVisualKind>>);

export const ABYSSAL_OCTARCH_PROJECTILE_ANIMATIONS = Object.freeze({
  'boss-singularity-seed': projectileAnimation(
    ['vfx.grab-ring', 'vfx.charged-orb'], 5, 34, 1.35, 0
  ),
  'boss-singularity-well': projectileAnimation(
    ['vfx.void-cloud.0', 'vfx.void-cloud.1', 'vfx.void-cloud.2', 'vfx.suction-spiral'],
    5,
    56,
    1.75,
    0
  ),
  'boss-singularity-shard': projectileAnimation(
    ['vfx.bolt', 'vfx.impact'], 4, 32, 1.55, -Math.PI / 2
  ),
  'boss-singularity-beam': projectileAnimation(
    ['vfx.charged-orb', 'vfx.beam-segment'], 3, 58, 2.1, -Math.PI / 2
  ),
  'boss-singularity-claw': projectileAnimation(
    ['vfx.grab-ring', 'vfx.slam-shockwave', 'vfx.impact'], 4, 46, 1.7, 0
  ),
  'boss-singularity-bolt': projectileAnimation(
    ['vfx.bolt', 'vfx.charged-orb'], 4, 36, 1.7, -Math.PI / 2
  ),
  'boss-singularity-pulse': projectileAnimation(
    ['vfx.charged-orb', 'vfx.socket-burst', 'vfx.impact'], 4, 46, 1.8, 0
  ),
  'boss-singularity-collapse': projectileAnimation(
    ['vfx.void-cloud.2', 'vfx.core-implosion'], 5, 64, 2.15, 0
  )
} satisfies Readonly<Partial<Record<
  BossModularProjectileVisualKind,
  PreviewBossProjectileAnimation
>>>);

/** Auditable action/damage/death use of every accepted VFX frame. */
export const ABYSSAL_OCTARCH_VFX_FRAME_MAP = Object.freeze({
  'grasp-and-hurl': Object.freeze(['vfx.grab-ring', 'vfx.asteroid', 'vfx.asteroid-cracked']),
  'tentacle-slam': Object.freeze(['vfx.slam-shockwave', 'vfx.impact']),
  'sweeping-arm': Object.freeze(['vfx.socket-burst', 'vfx.impact']),
  'needle-tip-stab': Object.freeze(['vfx.bolt', 'vfx.impact']),
  'constricting-ring': Object.freeze(['vfx.grab-ring', 'vfx.void-cloud.0']),
  'suction-current': Object.freeze(['vfx.suction-spiral', 'vfx.void-cloud.0', 'vfx.void-cloud.1', 'vfx.void-cloud.2']),
  'asteroid-hurl': Object.freeze(['vfx.asteroid', 'vfx.asteroid-cracked', 'vfx.asteroid-fragments']),
  'abyssal-gaze': Object.freeze(['vfx.charged-orb', 'vfx.beam-segment', 'vfx.impact']),
  damage: Object.freeze(['vfx.damage-sparks']),
  defeat: Object.freeze(['vfx.socket-burst', 'vfx.core-implosion'])
});

export const ABYSSAL_OCTARCH_REFERENCE_COMPARISON = Object.freeze({
  kind: MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
  url: ABYSSAL_OCTARCH_REFERENCE_URL,
  contentHash: ABYSSAL_OCTARCH_REFERENCE_SHA256,
  width: 720,
  height: 480,
  provenance:
    'Locked, chroma-sanitized Abyssal Octarch neutral reference emitted by the deterministic Boss Factory package.',
  landmarks: Object.freeze([
    Object.freeze({
      id: 'central-core',
      label: 'Bioluminescent central core',
      reference: Object.freeze({ xRatio: 0.5, yRatio: 0.59 }),
      rig: Object.freeze({ kind: 'socket' as const, socketId: 'core.emitter' })
    }),
    Object.freeze({
      id: 'port-upper-socket',
      label: 'Upper port attachment',
      reference: Object.freeze({ xRatio: 0.344, yRatio: 0.32 }),
      rig: Object.freeze({
        kind: 'normalized-design-point' as const,
        xRatio: 0.5 - upperMount.x / ABYSSAL_OCTARCH_DESIGN_SIZE.width,
        yRatio: 0.5 + (-8 + upperMount.y) / ABYSSAL_OCTARCH_DESIGN_SIZE.height
      })
    }),
    Object.freeze({
      id: 'starboard-upper-socket',
      label: 'Upper starboard attachment',
      reference: Object.freeze({ xRatio: 0.656, yRatio: 0.32 }),
      rig: Object.freeze({
        kind: 'normalized-design-point' as const,
        xRatio: 0.5 + upperMount.x / ABYSSAL_OCTARCH_DESIGN_SIZE.width,
        yRatio: 0.5 + (-8 + upperMount.y) / ABYSSAL_OCTARCH_DESIGN_SIZE.height
      })
    }),
    Object.freeze({
      id: 'port-lower-socket',
      label: 'Lower port attachment',
      reference: Object.freeze({ xRatio: 0.416, yRatio: 0.72 }),
      rig: Object.freeze({
        kind: 'normalized-design-point' as const,
        xRatio: 0.5 - lowerMount.x / ABYSSAL_OCTARCH_DESIGN_SIZE.width,
        yRatio: 0.5 + (-8 + lowerMount.y) / ABYSSAL_OCTARCH_DESIGN_SIZE.height
      })
    }),
    Object.freeze({
      id: 'starboard-lower-socket',
      label: 'Lower starboard attachment',
      reference: Object.freeze({ xRatio: 0.584, yRatio: 0.72 }),
      rig: Object.freeze({
        kind: 'normalized-design-point' as const,
        xRatio: 0.5 + lowerMount.x / ABYSSAL_OCTARCH_DESIGN_SIZE.width,
        yRatio: 0.5 + (-8 + lowerMount.y) / ABYSSAL_OCTARCH_DESIGN_SIZE.height
      })
    })
  ])
} satisfies PreviewBossReferenceComparisonDescriptor);

export const ABYSSAL_OCTARCH_ENCOUNTER_CAMERA = Object.freeze({
  eventId: ABYSSAL_OCTARCH_EVENT_ID,
  normalScale: ABYSSAL_OCTARCH_CAMERA_PROFILE.normalScale,
  expandedScale: ABYSSAL_OCTARCH_CAMERA_PROFILE.expandedScale,
  zoomDelayFrames: ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDelayFrames,
  zoomDurationFrames: ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDurationFrames,
  restoreDurationFrames: ABYSSAL_OCTARCH_CAMERA_PROFILE.restoreDurationFrames,
  verticalAnchor: 'top'
} satisfies EncounterCameraProfile);

export type AbyssalOctarchArtworkPackage = Readonly<{
  bossId: 'abyssal-octarch';
  prototypeId: 'abyssal-octarch';
  prototypeHash: string;
  poseKey: 'abyssal-octarch';
  artwork: Omit<PreviewBossArtwork, 'eventId' | 'modularRig'> & Readonly<{
    modularRigManifest: ModularBossRigManifest;
  }>;
}>;

export const ABYSSAL_OCTARCH_ARTWORK_PACKAGE: AbyssalOctarchArtworkPackage = Object.freeze({
  bossId: 'abyssal-octarch',
  prototypeId: 'abyssal-octarch',
  prototypeHash: ABYSSAL_OCTARCH_NEUTRAL_SHA256,
  poseKey: 'abyssal-octarch',
  artwork: Object.freeze({
    url: ABYSSAL_OCTARCH_NEUTRAL_URL,
    contentHash: ABYSSAL_OCTARCH_NEUTRAL_SHA256,
    weaponSockets: ABYSSAL_OCTARCH_WEAPON_SOCKETS,
    renderMode: 'articulated',
    modularRigManifest: ABYSSAL_OCTARCH_RIG_MANIFEST,
    sampleModularPose: sampleAbyssalOctarchModularPose,
    modularReferenceComparison: ABYSSAL_OCTARCH_REFERENCE_COMPARISON,
    projectileAnimations: ABYSSAL_OCTARCH_PROJECTILE_ANIMATIONS,
    encounterCamera: ABYSSAL_OCTARCH_ENCOUNTER_CAMERA
  })
});
