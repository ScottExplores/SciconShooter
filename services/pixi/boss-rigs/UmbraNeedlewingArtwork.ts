import atlasSource from '../../../director-data/prototype-assets/umbra-needlewing/umbra-needlewing-atlas.json';
import rigSource from '../../../director-data/prototype-assets/umbra-needlewing/umbra-needlewing.rig.json';
import type { BossWeaponSocketProfile } from '../../gameplay/bosses/BossWeaponSocketRuntime';
import type { BossModularProjectileVisualKind } from '../../gameplay/bosses/BossProjectilePresentationRuntime';
import {
  FIXED_FRAME_ANIMATION_KIND,
  MODULAR_BOSS_RIG_KIND,
  registerModularBossRig,
  type ModularBossPartRole,
  type ModularBossRigManifest,
  type ModularBossSocketRole
} from './ModularHierarchyRig';
import {
  sampleUmbraNeedlewingModularPose,
  validateUmbraNeedlewingRigCompatibility
} from './UmbraNeedlewingModularPose';
import type {
  PreviewBossArtwork,
  PreviewBossProjectileAnimation
} from './PreviewBossRigContracts';
import {
  MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
  type PreviewBossReferenceComparisonDescriptor
} from './PreviewBossReferenceComparison';

export const UMBRA_NEEDLEWING_NEUTRAL_SHA256 =
  'a1635e616add1b99336c366bc51499311f130ce62fbecd8d4a8956e1c9b2aba2';
export const UMBRA_NEEDLEWING_ATLAS_SHA256 =
  'c98290efd065277225b9d64bbcf06f23e5013cd29ca9ae501f404c18750321d1';
export const UMBRA_NEEDLEWING_REFERENCE_SHA256 =
  '2db71f4a183415e9851be2363b2224b8d7912e272922b55c7cfb8c1043e0ac21';

const assetUrl = (hash: string, variant: string) => (
  `/__director/api/v1/prototype-assets/umbra-needlewing/${hash}/${variant}.png`
);

export const UMBRA_NEEDLEWING_NEUTRAL_URL = assetUrl(
  UMBRA_NEEDLEWING_NEUTRAL_SHA256,
  'assembled'
);
export const UMBRA_NEEDLEWING_ATLAS_URL = assetUrl(
  UMBRA_NEEDLEWING_ATLAS_SHA256,
  'sheet'
);
export const UMBRA_NEEDLEWING_REFERENCE_URL = assetUrl(
  UMBRA_NEEDLEWING_REFERENCE_SHA256,
  'reference'
);

export const UMBRA_NEEDLEWING_NEUTRAL_SIZE = Object.freeze({
  width: 512,
  height: 320
});

export const UMBRA_NEEDLEWING_REFERENCE_SIZE = Object.freeze({
  width: 1511,
  height: 1041
});

const resolvePartRole = (partId: string): ModularBossPartRole => {
  if (partId === 'root' || partId.endsWith('.mount')) return 'joint';
  if (partId === 'body') return 'body';
  if (partId.startsWith('wing.')) return 'arm';
  if (partId === 'core') return 'phase-attachment';
  if (
    partId.startsWith('needle.mount.')
    || partId === 'needle.launcher'
  ) return 'weapon';
  if (partId === 'escape.module') return 'exhaust';
  if (
    partId.startsWith('eye.')
    || partId.startsWith('projectile.')
    || partId.startsWith('vfx.')
  ) return 'effect';
  return 'decorative';
};

const resolveSocketRole = (socketId: string): ModularBossSocketRole => {
  if (socketId === 'needle.port.muzzle' || socketId === 'needle.starboard.muzzle') {
    return 'projectile-muzzle';
  }
  if (socketId === 'needle.launcher.muzzle') return 'beam-origin';
  if (socketId === 'core.emitter') return 'core-origin';
  return 'effect-origin';
};

const normalizeUmbraNeedlewingManifest = (): ModularBossRigManifest => {
  if (atlasSource.image.sha256 !== UMBRA_NEEDLEWING_ATLAS_SHA256) {
    throw new Error('Umbra Needlewing atlas metadata does not match its fixed content hash.');
  }
  if (rigSource.atlas.sha256 !== UMBRA_NEEDLEWING_ATLAS_SHA256) {
    throw new Error('Umbra Needlewing rig does not reference the registered atlas.');
  }

  const designSize = Object.freeze({
    width: rigSource.canvas.width,
    height: rigSource.canvas.height
  });
  const frames = Object.freeze(Object.fromEntries(
    Object.entries(atlasSource.frames).map(([frameId, frame]) => [
      frameId,
      Object.freeze({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height
      })
    ])
  ));
  const parts = Object.freeze(rigSource.parts.map((part) => {
    const isRoot = part.parentId === null;
    return Object.freeze({
      id: part.id,
      role: resolvePartRole(part.id),
      parentId: part.parentId,
      frameId: part.frameId,
      transform: Object.freeze({
        x: isRoot ? part.transform.x - designSize.width / 2 : part.transform.x,
        y: isRoot ? part.transform.y - designSize.height / 2 : part.transform.y,
        rotation: part.transform.rotationDegrees * Math.PI / 180,
        scaleX: part.transform.scaleX,
        scaleY: part.transform.scaleY
      }),
      anchor: part.anchor
        ? Object.freeze({ x: part.anchor.x, y: part.anchor.y })
        : null,
      layer: part.layer,
      visible: part.neutralVisible
    });
  }));
  const animations = Object.freeze(rigSource.animations.map((animation) => (
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: animation.id,
      partId: animation.partId,
      frameIds: Object.freeze([...animation.frameIds]),
      frameHold: Math.max(1, Math.round(60 / animation.fps)),
      loop: animation.loop
    })
  )));
  const sockets = Object.freeze(rigSource.sockets.map((socket) => (
    Object.freeze({
      id: socket.id,
      role: resolveSocketRole(socket.id),
      partId: socket.partId,
      x: socket.x,
      y: socket.y,
      rotation: 0
    })
  )));

  return Object.freeze({
    kind: MODULAR_BOSS_RIG_KIND,
    id: rigSource.bossId,
    designSize,
    preserveAspectRatio: true,
    atlas: Object.freeze({
      url: UMBRA_NEEDLEWING_ATLAS_URL,
      contentHash: UMBRA_NEEDLEWING_ATLAS_SHA256,
      width: atlasSource.image.width,
      height: atlasSource.image.height,
      frames
    }),
    parts,
    animations,
    sockets,
    destruction: Object.freeze({
      durationFrames: 108,
      fragments: Object.freeze([
        Object.freeze({
          partId: 'wing.port.0',
          delayFrames: 0,
          travelX: -170,
          travelY: 130,
          rotationRadians: -2.2
        }),
        Object.freeze({
          partId: 'wing.starboard.0',
          delayFrames: 0,
          travelX: 170,
          travelY: 130,
          rotationRadians: 2.2
        }),
        Object.freeze({
          partId: 'wing.port.1',
          delayFrames: 7,
          travelX: -148,
          travelY: 165,
          rotationRadians: -2.5
        }),
        Object.freeze({
          partId: 'wing.starboard.1',
          delayFrames: 7,
          travelX: 148,
          travelY: 165,
          rotationRadians: 2.5
        }),
        Object.freeze({
          partId: 'wing.port.2',
          delayFrames: 14,
          travelX: -118,
          travelY: 196,
          rotationRadians: -2.8
        }),
        Object.freeze({
          partId: 'wing.starboard.2',
          delayFrames: 14,
          travelX: 118,
          travelY: 196,
          rotationRadians: 2.8
        }),
        Object.freeze({
          partId: 'wing.port.3',
          delayFrames: 20,
          travelX: -82,
          travelY: 220,
          rotationRadians: -2.1
        }),
        Object.freeze({
          partId: 'wing.starboard.3',
          delayFrames: 20,
          travelX: 82,
          travelY: 220,
          rotationRadians: 2.1
        }),
        Object.freeze({
          partId: 'core',
          delayFrames: 30,
          travelX: 12,
          travelY: 160,
          rotationRadians: 1.7
        }),
        Object.freeze({
          partId: 'body',
          delayFrames: 38,
          travelX: 0,
          travelY: 230,
          rotationRadians: -0.42
        })
      ])
    })
  });
};

export const UMBRA_NEEDLEWING_RIG_MANIFEST = normalizeUmbraNeedlewingManifest();

export const UMBRA_NEEDLEWING_MODULAR_RIG = registerModularBossRig(
  UMBRA_NEEDLEWING_RIG_MANIFEST
);

const rigCompatibilityIssues = validateUmbraNeedlewingRigCompatibility(
  UMBRA_NEEDLEWING_MODULAR_RIG
);
if (rigCompatibilityIssues.length > 0) {
  throw new Error(
    `Umbra Needlewing modular rig is incompatible: ${rigCompatibilityIssues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
}

export const UMBRA_NEEDLEWING_WEAPON_SOCKETS = Object.freeze({
  kind: 'normalized-boss-sockets-v1',
  sockets: Object.freeze([
    Object.freeze({
      id: 'needle.port.muzzle',
      role: 'port',
      xRatio: 0.365,
      yRatio: 0.65
    }),
    Object.freeze({
      id: 'needle.starboard.muzzle',
      role: 'starboard',
      xRatio: 0.635,
      yRatio: 0.65
    }),
    Object.freeze({
      id: 'core.emitter',
      role: 'core',
      xRatio: 0.5,
      yRatio: 0.687
    })
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

export const UMBRA_NEEDLEWING_PROJECTILE_ANIMATIONS = Object.freeze({
  'boss-umbra-needle': projectileAnimation(
    ['needle.0', 'needle.1', 'needle.2', 'needle.3'],
    4,
    30,
    1.7,
    -Math.PI / 2
  ),
  'boss-umbra-wing-shard': projectileAnimation(
    ['shard.0', 'shard.1', 'shard.2', 'shard.3'],
    5,
    34,
    1.55,
    0
  )
} satisfies Readonly<Partial<Record<
  BossModularProjectileVisualKind,
  PreviewBossProjectileAnimation
>>>);

export const UMBRA_NEEDLEWING_REFERENCE_COMPARISON = Object.freeze({
  kind: MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
  url: UMBRA_NEEDLEWING_REFERENCE_URL,
  contentHash: UMBRA_NEEDLEWING_REFERENCE_SHA256,
  width: UMBRA_NEEDLEWING_REFERENCE_SIZE.width,
  height: UMBRA_NEEDLEWING_REFERENCE_SIZE.height,
  provenance:
    'Locked complete Umbra Needlewing neutral reference, chroma-sanitized without changing anatomy or silhouette.',
  landmarks: Object.freeze([
    Object.freeze({
      id: 'umbra-core',
      label: 'Lower core aperture',
      reference: Object.freeze({ xRatio: 0.5, yRatio: 0.672 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'core.emitter' })
    }),
    Object.freeze({
      id: 'upper-wing-port',
      label: 'Upper port wing joint',
      reference: Object.freeze({ xRatio: 0.319, yRatio: 0.368 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'wing.port.0.joint' })
    }),
    Object.freeze({
      id: 'upper-wing-starboard',
      label: 'Upper starboard wing joint',
      reference: Object.freeze({ xRatio: 0.681, yRatio: 0.368 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'wing.starboard.0.joint' })
    }),
    Object.freeze({
      id: 'needle-port',
      label: 'Port needle muzzle',
      reference: Object.freeze({ xRatio: 0.323, yRatio: 0.576 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'needle.port.muzzle' })
    }),
    Object.freeze({
      id: 'needle-starboard',
      label: 'Starboard needle muzzle',
      reference: Object.freeze({ xRatio: 0.677, yRatio: 0.576 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'needle.starboard.muzzle' })
    })
  ])
} satisfies PreviewBossReferenceComparisonDescriptor);

export type UmbraNeedlewingArtworkPackage = Readonly<{
  bossId: 'umbra-needlewing';
  prototypeId: 'umbra-needlewing';
  prototypeHash: string;
  poseKey: 'umbra-needlewing';
  artwork: Omit<PreviewBossArtwork, 'eventId' | 'modularRig'> & Readonly<{
    modularRigManifest: ModularBossRigManifest;
  }>;
}>;

export const UMBRA_NEEDLEWING_ARTWORK_PACKAGE: UmbraNeedlewingArtworkPackage = Object.freeze({
  bossId: 'umbra-needlewing',
  prototypeId: 'umbra-needlewing',
  prototypeHash: UMBRA_NEEDLEWING_NEUTRAL_SHA256,
  poseKey: 'umbra-needlewing',
  artwork: Object.freeze({
    url: UMBRA_NEEDLEWING_NEUTRAL_URL,
    contentHash: UMBRA_NEEDLEWING_NEUTRAL_SHA256,
    weaponSockets: UMBRA_NEEDLEWING_WEAPON_SOCKETS,
    renderMode: 'articulated',
    modularRigManifest: UMBRA_NEEDLEWING_RIG_MANIFEST,
    sampleModularPose: sampleUmbraNeedlewingModularPose,
    modularReferenceComparison: UMBRA_NEEDLEWING_REFERENCE_COMPARISON,
    projectileAnimations: UMBRA_NEEDLEWING_PROJECTILE_ANIMATIONS
  })
});
