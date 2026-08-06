import type { BossWeaponSocketProfile } from '../../gameplay/bosses/BossWeaponSocketRuntime';
import type { BossModularProjectileVisualKind } from '../../gameplay/bosses/BossProjectilePresentationRuntime';
import type {
  ModularBossAtlasFrame,
  ModularBossRigAtlas,
  ModularBossRigManifest
} from './ModularHierarchyRig';
import type {
  PreviewBossArtwork,
  PreviewBossProjectileAnimation
} from './PreviewBossRigContracts';
import type { PreviewBossReferenceComparisonDescriptor } from './PreviewBossReferenceComparison';

const ART_ROOT = '/game-art/generated/bosses/singularity-reach-commander';

const createGridFrames = (
  ids: readonly string[],
  cellSize: number,
  columns: number
): Readonly<Record<string, ModularBossAtlasFrame>> => Object.freeze(
  Object.fromEntries(ids.map((id, index) => [id, Object.freeze({
    x: (index % columns) * cellSize,
    y: Math.floor(index / columns) * cellSize,
    width: cellSize,
    height: cellSize
  })]))
);

const RIG_FRAME_IDS = Object.freeze([
  'rig.body',
  'rig.core-neutral',
  'rig.pylon.port',
  'rig.pylon.starboard',
  'rig.claw.port',
  'rig.claw.starboard',
  'rig.joint-cap',
  'rig.assembled-neutral'
] as const);

const CORE_FRAME_IDS = Object.freeze([
  'core.idle.dark',
  'core.idle.pulse',
  'core.charge.begin',
  'core.charge.full',
  'core.beam.fire',
  'core.pulse.fire',
  'core.damage.unstable',
  'core.shutdown'
] as const);

const WELL_FRAME_IDS = Object.freeze([
  'well.seed',
  'well.warning',
  'well.grow',
  'well.mature',
  'well.active.a',
  'well.active.b',
  'well.collapse-warning',
  'well.implosion'
] as const);

const PROJECTILE_DAMAGE_FRAME_IDS = Object.freeze([
  'projectile.shard',
  'projectile.crescent',
  'projectile.bolt',
  'projectile.orb',
  'projectile.shard.alt',
  'projectile.bolt.alt',
  'projectile.impact',
  'projectile.implosion',
  'damage.sparks',
  'damage.core-wisps',
  'damage.orbiting-debris',
  'phase.spatial-distortion',
  'defeat.pylon-malfunction',
  'defeat.armor-breakup',
  'defeat.final-collapse',
  'defeat.gravity-shockwave'
] as const);

const WEAPON_VFX_FRAME_IDS = Object.freeze([
  'beam.targeting',
  'beam.locked',
  'beam.startup',
  'beam.core',
  'beam.glow',
  'beam.impact',
  'beam.shutdown',
  'beam.split-fork',
  'claw.charge',
  'claw.slash',
  'claw.compression',
  'claw.impact',
  'pylon.charge',
  'pylon.muzzle',
  'pylon.recoil',
  'pylon.cooling'
] as const);

const rigFrames = Object.freeze({
  ...createGridFrames(RIG_FRAME_IDS, 192, 4),
  // The source cell also contains a disconnected export fragment. Cropping to
  // the largest connected component preserves the clean reference ring only.
  'rig.core-neutral': Object.freeze({ x: 278, y: 62, width: 100, height: 102 }),
  // The rear-armor cell contains three unrelated export fragments. Keep only
  // the centered armor cap so hidden fragments cannot distort the silhouette.
  'rig.joint-cap': Object.freeze({ x: 411, y: 267, width: 45, height: 65 })
});

const rigAtlas: ModularBossRigAtlas = Object.freeze({
  url: `${ART_ROOT}/sheets/rig-modular-sheet.png`,
  contentHash: '7d2087a0467139ac4556f0b5ef7ed26ab63210a57fab32978d3864029419e45d',
  width: 768,
  height: 384,
  frames: rigFrames
});

const supplementalAtlases: readonly ModularBossRigAtlas[] = Object.freeze([
  Object.freeze({
    url: `${ART_ROOT}/sheets/core-lifecycle-sheet.png`,
    contentHash: 'b411d61728e2d73edfa1a194bac2957c4aa5c4f112e3e07cf4ce2b45426710bb',
    width: 512,
    height: 256,
    frames: createGridFrames(CORE_FRAME_IDS, 128, 4)
  }),
  Object.freeze({
    url: `${ART_ROOT}/sheets/gravity-well-sheet.png`,
    contentHash: 'cc2464fbc63652b958430709fe9d24c3ffa777fd621f17fa6a23e4d632782589',
    width: 512,
    height: 256,
    frames: createGridFrames(WELL_FRAME_IDS, 128, 4)
  }),
  Object.freeze({
    url: `${ART_ROOT}/sheets/projectile-damage-sheet.png`,
    contentHash: 'c0c4a21e56078518777e2ef05cccb50e6421db5ce6fca77ba4c862e73ba62b44',
    width: 384,
    height: 384,
    frames: createGridFrames(PROJECTILE_DAMAGE_FRAME_IDS, 96, 4)
  }),
  Object.freeze({
    url: `${ART_ROOT}/sheets/weapon-vfx-sheet.png`,
    contentHash: '4fc28333d4ea9f0ce7da320f17d93be0f53e5c11dbcafa2d41f79e1e61cb2820',
    width: 384,
    height: 384,
    frames: createGridFrames(WEAPON_VFX_FRAME_IDS, 96, 4)
  })
]);

const transform = (
  x: number,
  y: number,
  rotation = 0,
  scaleX = 1,
  scaleY = 1
) => Object.freeze({ x, y, rotation, scaleX, scaleY });

const anchor = (x = 0.5, y = 0.5) => Object.freeze({ x, y });

export const SINGULARITY_COMMANDER_RIG_MANIFEST = Object.freeze({
  kind: 'modular-hierarchy-v1',
  id: 'singularity-reach-commander',
  designSize: Object.freeze({ width: 320, height: 300 }),
  preserveAspectRatio: true,
  atlas: rigAtlas,
  supplementalAtlases,
  parts: Object.freeze([
    Object.freeze({ id: 'root', role: 'joint', parentId: null, frameId: null, transform: transform(0, 0), anchor: null, layer: 0, visible: false }),
    Object.freeze({ id: 'rear-armor', role: 'armor', parentId: 'root', frameId: 'rig.joint-cap', transform: transform(0, 36, 0, 0.78, 0.78), anchor: anchor(), layer: 2, visible: true }),
    Object.freeze({ id: 'pylon.port.mount', role: 'joint', parentId: 'root', frameId: null, transform: transform(-91, -52), anchor: null, layer: 4, visible: false }),
    Object.freeze({ id: 'pylon.port', role: 'weapon', parentId: 'pylon.port.mount', frameId: 'rig.pylon.port', transform: transform(0, 0, 0, 0.86, 0.86), anchor: anchor(), layer: 10, visible: true }),
    Object.freeze({ id: 'pylon.starboard.mount', role: 'joint', parentId: 'root', frameId: null, transform: transform(91, -52), anchor: null, layer: 4, visible: false }),
    Object.freeze({ id: 'pylon.starboard', role: 'weapon', parentId: 'pylon.starboard.mount', frameId: 'rig.pylon.starboard', transform: transform(0, 0, 0, 0.86, 0.86), anchor: anchor(), layer: 10, visible: true }),
    Object.freeze({ id: 'claw.port.mount', role: 'joint', parentId: 'root', frameId: null, transform: transform(-82, 70), anchor: null, layer: 5, visible: false }),
    Object.freeze({ id: 'claw.port', role: 'arm', parentId: 'claw.port.mount', frameId: 'rig.claw.port', transform: transform(0, 0, 0, 0.72, 0.72), anchor: anchor(), layer: 12, visible: true }),
    Object.freeze({ id: 'claw.starboard.mount', role: 'joint', parentId: 'root', frameId: null, transform: transform(82, 70), anchor: null, layer: 5, visible: false }),
    Object.freeze({ id: 'claw.starboard', role: 'arm', parentId: 'claw.starboard.mount', frameId: 'rig.claw.starboard', transform: transform(0, 0, 0, 0.72, 0.72), anchor: anchor(), layer: 12, visible: true }),
    Object.freeze({ id: 'body', role: 'body', parentId: 'root', frameId: 'rig.body', transform: transform(0, 0), anchor: anchor(), layer: 20, visible: true }),
    Object.freeze({ id: 'core', role: 'phase-attachment', parentId: 'body', frameId: 'rig.core-neutral', transform: transform(0, -8, 0, 0.82, 0.82), anchor: anchor(), layer: 24, visible: true }),
    Object.freeze({ id: 'effect.gravity-seed', role: 'effect', parentId: 'core', frameId: 'well.seed', transform: transform(0, 0, 0, 0.42, 0.42), anchor: anchor(), layer: 30, visible: false }),
    Object.freeze({ id: 'effect.beam', role: 'effect', parentId: 'body', frameId: 'beam.startup', transform: transform(0, 14, 0, 0.52, 0.52), anchor: anchor(0.5, 0), layer: 32, visible: false }),
    Object.freeze({ id: 'effect.claw.port', role: 'effect', parentId: 'claw.port', frameId: 'claw.charge', transform: transform(41, 62, -0.38, 0.62, 0.62), anchor: anchor(), layer: 31, visible: false }),
    Object.freeze({ id: 'effect.claw.starboard', role: 'effect', parentId: 'claw.starboard', frameId: 'claw.charge', transform: transform(-41, 62, 0.38, -0.62, 0.62), anchor: anchor(), layer: 31, visible: false }),
    Object.freeze({ id: 'effect.pylon.port', role: 'effect', parentId: 'pylon.port', frameId: 'pylon.charge', transform: transform(0, -73, 0, 0.48, 0.48), anchor: anchor(), layer: 31, visible: false }),
    Object.freeze({ id: 'effect.pylon.starboard', role: 'effect', parentId: 'pylon.starboard', frameId: 'pylon.charge', transform: transform(0, -73, 0, 0.48, 0.48), anchor: anchor(), layer: 31, visible: false }),
    Object.freeze({ id: 'effect.damage.sparks', role: 'effect', parentId: 'body', frameId: 'damage.sparks', transform: transform(-38, 12, 0, 0.48, 0.48), anchor: anchor(), layer: 34, visible: false }),
    Object.freeze({ id: 'effect.damage.wisps', role: 'effect', parentId: 'body', frameId: 'damage.core-wisps', transform: transform(34, 8, 0, 0.5, 0.5), anchor: anchor(), layer: 35, visible: false }),
    Object.freeze({ id: 'effect.damage.debris', role: 'effect', parentId: 'root', frameId: 'damage.orbiting-debris', transform: transform(0, 5, 0, 0.56, 0.56), anchor: anchor(), layer: 36, visible: false }),
    Object.freeze({ id: 'effect.phase-distortion', role: 'effect', parentId: 'root', frameId: 'phase.spatial-distortion', transform: transform(0, 0, 0, 0.84, 0.84), anchor: anchor(), layer: 1, visible: false })
  ]),
  animations: Object.freeze([
    Object.freeze({ kind: 'fixed-frame-sequence-v1', id: 'core-idle', partId: 'core', frameIds: Object.freeze(['rig.core-neutral']), frameHold: 12, loop: true }),
    Object.freeze({ kind: 'fixed-frame-sequence-v1', id: 'core-charge', partId: 'core', frameIds: Object.freeze(['rig.core-neutral']), frameHold: 8, loop: false }),
    Object.freeze({ kind: 'fixed-frame-sequence-v1', id: 'gravity-well-active', partId: 'effect.gravity-seed', frameIds: Object.freeze(['well.mature', 'well.active.a', 'well.active.b']), frameHold: 5, loop: true }),
    Object.freeze({ kind: 'fixed-frame-sequence-v1', id: 'pylon-fire-port', partId: 'effect.pylon.port', frameIds: Object.freeze(['pylon.charge', 'pylon.muzzle', 'pylon.recoil', 'pylon.cooling']), frameHold: 3, loop: false }),
    Object.freeze({ kind: 'fixed-frame-sequence-v1', id: 'pylon-fire-starboard', partId: 'effect.pylon.starboard', frameIds: Object.freeze(['pylon.charge', 'pylon.muzzle', 'pylon.recoil', 'pylon.cooling']), frameHold: 3, loop: false })
  ]),
  sockets: Object.freeze([
    Object.freeze({ id: 'pylon-muzzle-upper-port', role: 'projectile-muzzle', partId: 'pylon.port', x: -6, y: -73, rotation: 0 }),
    Object.freeze({ id: 'pylon-muzzle-lower-port', role: 'projectile-muzzle', partId: 'pylon.port', x: 6, y: -65, rotation: 0 }),
    Object.freeze({ id: 'pylon-muzzle-lower-starboard', role: 'projectile-muzzle', partId: 'pylon.starboard', x: -6, y: -65, rotation: 0 }),
    Object.freeze({ id: 'pylon-muzzle-upper-starboard', role: 'projectile-muzzle', partId: 'pylon.starboard', x: 6, y: -73, rotation: 0 }),
    Object.freeze({ id: 'singularity-core', role: 'core-origin', partId: 'core', x: 0, y: 0, rotation: 0 }),
    Object.freeze({ id: 'claw-tip-port', role: 'melee-root', partId: 'claw.port', x: 41, y: 62, rotation: 0 }),
    Object.freeze({ id: 'claw-tip-starboard', role: 'melee-root', partId: 'claw.starboard', x: -41, y: 62, rotation: 0 }),
    Object.freeze({ id: 'gravity-seed-origin', role: 'core-origin', partId: 'core', x: 0, y: 0, rotation: 0 })
  ]),
  destruction: Object.freeze({
    durationFrames: 112,
    fragments: Object.freeze([
      Object.freeze({ partId: 'pylon.port', delayFrames: 0, travelX: -122, travelY: 146, rotationRadians: -2.5 }),
      Object.freeze({ partId: 'pylon.starboard', delayFrames: 0, travelX: 122, travelY: 146, rotationRadians: 2.5 }),
      Object.freeze({ partId: 'claw.port', delayFrames: 12, travelX: -154, travelY: 188, rotationRadians: -2.9 }),
      Object.freeze({ partId: 'claw.starboard', delayFrames: 12, travelX: 154, travelY: 188, rotationRadians: 2.9 }),
      Object.freeze({ partId: 'rear-armor', delayFrames: 22, travelX: -18, travelY: 168, rotationRadians: -1.7 }),
      Object.freeze({ partId: 'core', delayFrames: 38, travelX: 12, travelY: 118, rotationRadians: 2.2 }),
      Object.freeze({ partId: 'body', delayFrames: 50, travelX: 0, travelY: 232, rotationRadians: -0.46 })
    ])
  })
} satisfies ModularBossRigManifest);

export const SINGULARITY_COMMANDER_WEAPON_SOCKETS: BossWeaponSocketProfile = Object.freeze({
  kind: 'normalized-boss-sockets-v1',
  sockets: Object.freeze([
    Object.freeze({ id: 'pylon-muzzle-upper-port', role: 'port', xRatio: 0.1995, yRatio: 0.1174 }),
    Object.freeze({ id: 'pylon-muzzle-lower-port', role: 'port', xRatio: 0.23175, yRatio: 0.140333 }),
    Object.freeze({ id: 'pylon-muzzle-lower-starboard', role: 'starboard', xRatio: 0.76825, yRatio: 0.140333 }),
    Object.freeze({ id: 'pylon-muzzle-upper-starboard', role: 'starboard', xRatio: 0.8005, yRatio: 0.1174 }),
    Object.freeze({ id: 'singularity-core', role: 'core', xRatio: 0.5, yRatio: 0.473333 }),
    Object.freeze({ id: 'claw-tip-port', role: 'port', xRatio: 0.336, yRatio: 0.882133 }),
    Object.freeze({ id: 'claw-tip-starboard', role: 'starboard', xRatio: 0.664, yRatio: 0.882133 }),
    Object.freeze({ id: 'gravity-seed-origin', role: 'core', xRatio: 0.5, yRatio: 0.473333 })
  ])
});

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

export const SINGULARITY_COMMANDER_PROJECTILE_ANIMATIONS = Object.freeze({
  'boss-singularity-seed': projectileAnimation(['well.seed', 'well.warning', 'well.grow'], 5, 28, 1.65, 0),
  'boss-singularity-well': projectileAnimation(['well.mature', 'well.active.a', 'well.active.b'], 5, 54, 1.65, 0),
  'boss-singularity-shard': projectileAnimation(['projectile.shard', 'projectile.shard.alt'], 3, 22, 1.7, -Math.PI / 2),
  'boss-singularity-beam': projectileAnimation(['beam.startup', 'beam.core', 'beam.glow'], 2, 56, 2, -Math.PI / 2),
  'boss-singularity-claw': projectileAnimation(['claw.charge', 'claw.slash', 'claw.compression', 'claw.impact'], 3, 44, 1.9, 0),
  'boss-singularity-bolt': projectileAnimation(['projectile.bolt', 'projectile.bolt.alt'], 3, 42, 2, -Math.PI / 4),
  'boss-singularity-pulse': projectileAnimation(['projectile.orb', 'projectile.implosion'], 5, 44, 1.8, 0),
  'boss-singularity-collapse': projectileAnimation(['well.collapse-warning', 'well.implosion'], 5, 64, 2.2, 0)
} satisfies Readonly<Partial<Record<BossModularProjectileVisualKind, PreviewBossProjectileAnimation>>>);

const collisionRowWords = Object.freeze([
  0, 0, 0, 0, 7680, 3670016, 7680, 8126464, 15872, 8126464, 7680, 8126464, 15872, 8126464, 32512, 16646144,
  65408, 33488896, 65472, 67076096, 201457632, 67076144, 235012064, 134185008, 251920352, 134201456, 2399404000, 134201585, 3473145824, 134209779, 4287102944, 134210047,
  4287102944, 134210047, 4294967264, 67108863, 4294967232, 67108863, 4294967168, 33554431, 4294967232, 67108863, 4294967232, 67108863, 4294967264, 134217727, 4294967280, 134217727,
  4294967280, 268435455, 4294967288, 536870911, 4294967292, 1073741823, 4294961148, 1073217535, 4294959612, 1065877503, 4294963454, 1058013183, 4294966398, 2118123519, 4294966846, 2088763391,
  4294967070, 2097151999, 4294967198, 2046820351, 4294967198, 973078527, 4294967260, 1006632959, 4294950860, 872415231, 4294938572, 334626815, 4294952904, 333578239, 4294965696, 60817407,
  4294966464, 54525951, 4294475328, 58662911, 4294458880, 8265727, 4294966784, 8388607, 4294966784, 8388607, 4294967040, 8388607, 4278189824, 16777151, 3741319040, 16777023,
  2619342720, 33553469, 1008729984, 33552412, 940572544, 33552412, 805830528, 33546252, 261888, 16769024, 261632, 8372224, 523264, 4186112, 523264, 2088960,
  1046528, 1044480, 2093056, 522240, 2080768, 260096, 1015808, 126976, 917504, 28672, 0, 0, 0, 0, 0, 0
]);

export const SINGULARITY_COMMANDER_REFERENCE_COMPARISON = Object.freeze({
  kind: 'modular-boss-reference-comparison-v1',
  url: `${ART_ROOT}/reference/singularity-reach-commander-canonical.png`,
  contentHash: '2c8401e89268951be1e9cf851f13c6cf4ad80969ca9ac4afbfeabcd4f17093ac',
  width: 384,
  height: 384,
  provenance: 'Locked Boss Archive reference for the Singularity Reach Commander neutral pose.',
  landmarks: Object.freeze([
    Object.freeze({
      id: 'core-center',
      label: 'Singularity Core',
      reference: Object.freeze({ xRatio: 0.5, yRatio: 0.455 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'singularity-core' })
    }),
    Object.freeze({
      id: 'upper-pylon-port',
      label: 'Upper-left pylon',
      reference: Object.freeze({ xRatio: 0.174, yRatio: 0.11 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'pylon-muzzle-upper-port' })
    }),
    Object.freeze({
      id: 'upper-pylon-starboard',
      label: 'Upper-right pylon',
      reference: Object.freeze({ xRatio: 0.826, yRatio: 0.11 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'pylon-muzzle-upper-starboard' })
    }),
    Object.freeze({
      id: 'lower-claw-port',
      label: 'Lower-left claw',
      reference: Object.freeze({ xRatio: 0.184, yRatio: 0.895 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'claw-tip-port' })
    }),
    Object.freeze({
      id: 'lower-claw-starboard',
      label: 'Lower-right claw',
      reference: Object.freeze({ xRatio: 0.816, yRatio: 0.895 }),
      rig: Object.freeze({ kind: 'socket', socketId: 'claw-tip-starboard' })
    })
  ])
} satisfies PreviewBossReferenceComparisonDescriptor);

export type SingularityCommanderArtworkPackage = Readonly<{
  bossId: 'singularity-crab';
  prototypeId: 'singularity-reach-commander';
  prototypeHash: string;
  poseKey: 'singularity-reach-commander';
  artwork: Omit<PreviewBossArtwork, 'eventId' | 'modularRig' | 'sampleModularPose'> & Readonly<{
    modularRigManifest: ModularBossRigManifest;
  }>;
}>;

export const SINGULARITY_COMMANDER_ARTWORK_PACKAGE: SingularityCommanderArtworkPackage = Object.freeze({
  bossId: 'singularity-crab',
  prototypeId: 'singularity-reach-commander',
  prototypeHash: '2c8401e89268951be1e9cf851f13c6cf4ad80969ca9ac4afbfeabcd4f17093ac',
  poseKey: 'singularity-reach-commander',
  artwork: Object.freeze({
    url: SINGULARITY_COMMANDER_REFERENCE_COMPARISON.url,
    contentHash: SINGULARITY_COMMANDER_REFERENCE_COMPARISON.contentHash,
    collisionMask: Object.freeze({ width: 64, height: 64, rowWords: collisionRowWords }),
    weaponSockets: SINGULARITY_COMMANDER_WEAPON_SOCKETS,
    renderMode: 'articulated',
    modularRigManifest: SINGULARITY_COMMANDER_RIG_MANIFEST,
    modularReferenceComparison: SINGULARITY_COMMANDER_REFERENCE_COMPARISON,
    projectileAnimations: SINGULARITY_COMMANDER_PROJECTILE_ANIMATIONS
  })
});
