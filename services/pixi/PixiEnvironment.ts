import { BlurFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { ASSETS } from '../../constants';
import type { GameCampaign } from '../../game-config/types';
import type { GameEngine } from '../gameLogic';
import { PixiTextureBank } from './PixiTextureBank';

type ParallaxLayer = {
  root: Container;
  sprites: Sprite[];
  speed: number;
  alpha: number;
  textureKey: string;
  tileHeight: number;
  widthScale: number;
  xDrift: number;
  phase: number;
  loop: boolean;
  startOffsetRatio: number;
  softness: number;
  blurFilter: BlurFilter;
  filterActive: boolean;
  scrollDirection: 'up' | 'down';
  coverViewport: boolean;
  activeTileCount: number;
};

type ParallaxDefinition = {
  url: string;
  speed: number;
  alpha: number;
  widthScale?: number;
  xDrift?: number;
  phase?: number;
  loop?: boolean;
  startOffsetRatio?: number;
  softness?: number;
  scrollDirection?: 'up' | 'down';
  coverViewport?: boolean;
  tilePoolSize?: number;
};

type TerrainFamily = 'space' | 'desert' | 'river';
type SpaceRunBackgroundId =
  | 'helix-redline'
  | 'shattered-void'
  | 'gravity-rift'
  | 'ion-eclipse'
  | 'terminus-frontier';
type TerrainPropSet = TerrainFamily | SpaceRunBackgroundId;

type TerrainProp = {
  root: Container;
  sprite: Sprite;
  shadow: Graphics;
  perspectiveTextures: [Texture, Texture, Texture] | null;
  perspectiveState: GroundPropPerspectiveState | -1;
  terrain: TerrainFamily;
  propSet: TerrainPropSet;
  slot: number;
  baseX: number;
  baseY: number;
  speed: number;
  sway: number;
  phase: number;
  widthRatio: number;
  rotationSpeed: number;
  alpha: number;
};

type TerrainPropDefinition = Omit<
  TerrainProp,
  'root' | 'sprite' | 'shadow' | 'perspectiveTextures' | 'perspectiveState' | 'terrain' | 'propSet' | 'slot'
> & { frame: number };

type EnvironmentProfile = {
  tint: string;
  accent: string;
  family: number;
  colorGradeAlpha: number;
  layers: readonly ParallaxDefinition[];
  horizonAlpha: number;
  planetTint: string;
  starSpeedMultiplier: number;
  terrain: TerrainFamily;
  propSet: TerrainPropSet;
  propAlpha: number;
  propCount: number;
  glyphAlpha: number;
};

type StarPoint = {
  sprite: Sprite;
  speed: number;
  phase: number;
  baseX: number;
  baseY: number;
  baseAlpha: number;
};

type ScienceGlyph = {
  graphic: Graphics;
  baseX: number;
  baseY: number;
  speed: number;
  phase: number;
  family: number;
};

const DEFAULT_BACKGROUND_ID = 'open-orbit';
const TERRAIN_PROP_CELL_SIZE = 256;
export const PARALLAX_TILE_POOL_SIZE = 8;
export const DEEP_SPACE_BACKPLATE_TILE_POOL_SIZE = 2;
export const DEBRIS_OVERLAY_TILE_POOL_SIZE = 2;
export const GROUND_PROP_CONTACT_ANCHOR_Y = 238 / TERRAIN_PROP_CELL_SIZE;
export const MOBILE_HYPERSPEED_STREAK_CAP = 24;
export const DESKTOP_HYPERSPEED_STREAK_CAP = 38;
export const TAKEOFF_WORLD_SPEED_MULTIPLIER = 48;
export const SPACE_PROP_MOTION_BLUR_CAP = 5.4;

const positiveModulo = (value: number, divisor: number) => (
  divisor > 0 ? ((value % divisor) + divisor) % divisor : 0
);

export const getLoopingParallaxTileY = (
  tileIndex: number,
  scrollDistance: number,
  tileHeight: number,
  direction: 'up' | 'down'
) => {
  const safeTileHeight = Math.max(1, tileHeight);
  const phase = positiveModulo(scrollDistance, safeTileHeight);
  return direction === 'down'
    ? phase - safeTileHeight + tileIndex * safeTileHeight
    : -phase + tileIndex * safeTileHeight;
};

export const getNonLoopingParallaxOffset = (
  maxTravel: number,
  scrollDistance: number,
  direction: 'up' | 'down'
) => {
  const safeMaxTravel = Math.max(0, maxTravel);
  const travel = Math.min(safeMaxTravel, Math.max(0, scrollDistance));
  return direction === 'down' ? -safeMaxTravel + travel : -travel;
};

export type GroundPropPerspectiveState = 0 | 1 | 2;

export const getGroundPropPerspectiveState = (
  relativeY: number,
  overheadBand: number
): GroundPropPerspectiveState => {
  if (relativeY < -overheadBand) return 0;
  if (relativeY > overheadBand) return 2;
  return 1;
};

const TERRAIN_PROP_ATLASES: Record<TerrainPropSet, string> = {
  space: ASSETS.PIXI_TERRAIN_SPACE_PROPS,
  desert: ASSETS.PIXI_TERRAIN_DESERT_PROPS,
  river: ASSETS.PIXI_TERRAIN_RIVER_PROPS,
  'helix-redline': ASSETS.PIXI_SPACE_RUN_HELIX_REDLINE_PROPS,
  'shattered-void': ASSETS.PIXI_SPACE_RUN_SHATTERED_VOID_PROPS,
  'gravity-rift': ASSETS.PIXI_SPACE_RUN_GRAVITY_RIFT_PROPS,
  'ion-eclipse': ASSETS.PIXI_SPACE_RUN_ION_ECLIPSE_PROPS,
  'terminus-frontier': ASSETS.PIXI_SPACE_RUN_TERMINUS_FRONTIER_PROPS
};

const getTerrainForPropSet = (propSet: TerrainPropSet): TerrainFamily => (
  propSet === 'desert' || propSet === 'river' ? propSet : 'space'
);

const GROUND_PROP_PERSPECTIVE_SHEETS: Partial<Record<TerrainFamily, string>> = {
  desert: ASSETS.PIXI_TERRAIN_DESERT_PROP_PERSPECTIVES,
  river: ASSETS.PIXI_TERRAIN_RIVER_PROP_PERSPECTIVES
};

const createSpaceRunLayout = (phaseOffset: number, mirrored = false): readonly TerrainPropDefinition[] => {
  const leftEdge = mirrored ? 1.07 : 0.08;
  const rightEdge = mirrored ? 0.08 : 1.07;
  return [
    { frame: 0, baseX: leftEdge, baseY: 0.04, speed: 0.04, sway: 1, phase: phaseOffset, widthRatio: 0.86, rotationSpeed: 0, alpha: 1 },
    { frame: 1, baseX: rightEdge, baseY: 0.42, speed: 0.065, sway: 1.4, phase: phaseOffset + 0.8, widthRatio: 1, rotationSpeed: 0, alpha: 1 }
  ];
};

const TERRAIN_PROP_LAYOUTS: Record<TerrainPropSet, readonly TerrainPropDefinition[]> = {
  space: [
    // Keep only the two large, slow planets. The individual asteroids and
    // satellite props fought the cohesive transparent debris overlay and could
    // cross in front of Saturn. The planet plane now stays far, clean, and slow.
    { frame: 1, baseX: 0.08, baseY: 0.05, speed: 0.04, sway: 1, phase: 0.2, widthRatio: 0.78, rotationSpeed: 0, alpha: 1 },
    { frame: 2, baseX: 1.07, baseY: 0.4, speed: 0.065, sway: 1.4, phase: 1.2, widthRatio: 0.96, rotationSpeed: 0, alpha: 1 }
  ],
  desert: [
    { frame: 0, baseX: 0.1, baseY: 0.06, speed: 0, sway: 0, phase: 0.3, widthRatio: 0.25, rotationSpeed: 0, alpha: 0.96 },
    { frame: 1, baseX: 0.91, baseY: 0.2, speed: 0, sway: 0, phase: 1.5, widthRatio: 0.22, rotationSpeed: 0, alpha: 0.95 },
    { frame: 2, baseX: 0.13, baseY: 0.35, speed: 0, sway: 0, phase: 2.7, widthRatio: 0.24, rotationSpeed: 0, alpha: 0.96 },
    { frame: 3, baseX: 0.88, baseY: 0.48, speed: 0, sway: 0, phase: 3.5, widthRatio: 0.22, rotationSpeed: 0, alpha: 0.95 },
    { frame: 4, baseX: 0.1, baseY: 0.62, speed: 0, sway: 0, phase: 4.3, widthRatio: 0.18, rotationSpeed: 0, alpha: 0.94 },
    { frame: 5, baseX: 0.9, baseY: 0.73, speed: 0, sway: 0, phase: 5.1, widthRatio: 0.2, rotationSpeed: 0, alpha: 0.98 },
    { frame: 6, baseX: 0.11, baseY: 0.86, speed: 0, sway: 0, phase: 0.9, widthRatio: 0.24, rotationSpeed: 0, alpha: 0.96 },
    { frame: 7, baseX: 0.9, baseY: 0.94, speed: 0, sway: 0, phase: 2.1, widthRatio: 0.17, rotationSpeed: 0, alpha: 0.97 },
    { frame: 8, baseX: 0.09, baseY: 0.76, speed: 0, sway: 0, phase: 3.9, widthRatio: 0.22, rotationSpeed: 0, alpha: 0.93 }
  ],
  river: [
    { frame: 0, baseX: 0.09, baseY: 0.08, speed: 0, sway: 0, phase: 0.4, widthRatio: 0.24, rotationSpeed: 0, alpha: 0.96 },
    { frame: 1, baseX: 0.91, baseY: 0.2, speed: 0, sway: 0, phase: 1.1, widthRatio: 0.18, rotationSpeed: 0, alpha: 0.95 },
    { frame: 2, baseX: 0.11, baseY: 0.34, speed: 0, sway: 0, phase: 2.3, widthRatio: 0.2, rotationSpeed: 0, alpha: 0.94 },
    { frame: 3, baseX: 0.89, baseY: 0.47, speed: 0, sway: 0, phase: 3.4, widthRatio: 0.23, rotationSpeed: 0, alpha: 0.97 },
    { frame: 4, baseX: 0.09, baseY: 0.61, speed: 0, sway: 0, phase: 4.7, widthRatio: 0.21, rotationSpeed: 0, alpha: 0.96 },
    { frame: 5, baseX: 0.91, baseY: 0.72, speed: 0, sway: 0, phase: 5.4, widthRatio: 0.19, rotationSpeed: 0, alpha: 0.98 },
    { frame: 6, baseX: 0.11, baseY: 0.84, speed: 0, sway: 0, phase: 0.8, widthRatio: 0.22, rotationSpeed: 0, alpha: 0.94 },
    { frame: 7, baseX: 0.9, baseY: 0.92, speed: 0, sway: 0, phase: 2.2, widthRatio: 0.18, rotationSpeed: 0, alpha: 0.97 },
    { frame: 8, baseX: 0.09, baseY: 0.73, speed: 0, sway: 0, phase: 3.8, widthRatio: 0.22, rotationSpeed: 0, alpha: 0.95 }
  ],
  'helix-redline': createSpaceRunLayout(0.35),
  'shattered-void': createSpaceRunLayout(1.15, true),
  'gravity-rift': createSpaceRunLayout(2.05),
  'ion-eclipse': createSpaceRunLayout(2.95, true),
  'terminus-frontier': createSpaceRunLayout(3.85)
};

/** One reusable prop object per visible atlas slot, regardless of campaign length. */
export const TERRAIN_PROP_POOL_SIZE = Math.max(
  ...Object.values(TERRAIN_PROP_LAYOUTS).map((layout) => layout.length)
);

export const CAMPAIGN_ENVIRONMENT_ROUTE = [
  { stage: 1, backgroundId: 'open-orbit', terrain: 'space', storyBeat: 'orbital-departure' },
  { stage: 2, backgroundId: 'citation-storm', terrain: 'space', storyBeat: 'deep-nebula' },
  { stage: 3, backgroundId: 'paywall-siege', terrain: 'desert', storyBeat: 'planetary-descent' },
  { stage: 4, backgroundId: 'open-galaxy', terrain: 'river', storyBeat: 'biosphere-expedition' },
  { stage: 5, backgroundId: 'bastion-protocol', terrain: 'space', storyBeat: 'orbital-return' },
  { stage: 6, backgroundId: 'helix-redline', terrain: 'space', storyBeat: 'helix-convergence' },
  { stage: 7, backgroundId: 'helix-redline', terrain: 'space', storyBeat: 'redline-corridor' },
  { stage: 8, backgroundId: 'shattered-void', terrain: 'space', storyBeat: 'dark-matter-run' },
  { stage: 9, backgroundId: 'shattered-void', terrain: 'space', storyBeat: 'mirror-array' },
  { stage: 10, backgroundId: 'shattered-void', terrain: 'space', storyBeat: 'null-sector' },
  { stage: 11, backgroundId: 'shattered-void', terrain: 'space', storyBeat: 'shard-tempest' },
  { stage: 12, backgroundId: 'gravity-rift', terrain: 'space', storyBeat: 'quantum-cage' },
  { stage: 13, backgroundId: 'gravity-rift', terrain: 'space', storyBeat: 'gravity-well' },
  { stage: 14, backgroundId: 'gravity-rift', terrain: 'space', storyBeat: 'event-horizon' },
  { stage: 15, backgroundId: 'ion-eclipse', terrain: 'space', storyBeat: 'ion-citadel' },
  { stage: 16, backgroundId: 'ion-eclipse', terrain: 'space', storyBeat: 'crimson-vector' },
  { stage: 17, backgroundId: 'ion-eclipse', terrain: 'space', storyBeat: 'eclipse-swarm' },
  { stage: 18, backgroundId: 'terminus-frontier', terrain: 'space', storyBeat: 'fracture-engine' },
  { stage: 19, backgroundId: 'terminus-frontier', terrain: 'space', storyBeat: 'last-light-gauntlet' },
  { stage: 20, backgroundId: 'terminus-frontier', terrain: 'space', storyBeat: 'terminus-ascendant' }
] as const;

export const SPACE_PARALLAX_DEPTH_SPEEDS = Object.freeze({
  'open-orbit': Object.freeze([0.012, 0.03, 0.08, 0.16, 0.36, 0.52, 0.68]),
  'citation-storm': Object.freeze([0.013, 0.034, 0.095, 0.179, 0.394, 0.59, 0.765]),
  'bastion-protocol': Object.freeze([0.014, 0.037, 0.107, 0.197, 0.429, 0.659, 0.85]),
  'helix-redline': Object.freeze([0.013, 0.034, 0.088, 0.172, 0.377, 0.573, 0.748]),
  'shattered-void': Object.freeze([0.011, 0.028, 0.075, 0.148, 0.333, 0.503, 0.663]),
  'gravity-rift': Object.freeze([0.014, 0.036, 0.1, 0.188, 0.412, 0.625, 0.816]),
  'ion-eclipse': Object.freeze([0.012, 0.032, 0.09, 0.176, 0.394, 0.59, 0.782]),
  'terminus-frontier': Object.freeze([0.015, 0.039, 0.115, 0.209, 0.463, 0.694, 0.918])
} as const);

type SpaceParallaxProfileId = keyof typeof SPACE_PARALLAX_DEPTH_SPEEDS;

export const SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS = Object.freeze({
  'open-orbit': 4,
  'citation-storm': 4.5,
  'bastion-protocol': 5,
  'helix-redline': 4.4,
  'shattered-void': 3.9,
  'gravity-rift': 4.8,
  'ion-eclipse': 4.6,
  'terminus-frontier': 5.4
} as const satisfies Record<SpaceParallaxProfileId, number>);

const createSpaceLayers = (
  profileId: SpaceParallaxProfileId,
  startOffsetRatio: number,
  phaseOffset = 0,
  backplateUrl = ASSETS.PIXI_SPACE_PARALLAX_BG_ION_CLOUD,
  _legacyDebrisUrls: readonly string[] = []
): readonly ParallaxDefinition[] => {
  const speeds = SPACE_PARALLAX_DEPTH_SPEEDS[profileId];
  const layers: ParallaxDefinition[] = [
    {
      url: backplateUrl,
      speed: speeds[0],
      alpha: 1,
      // The portrait master has only a few pixels of overscan on tall phones.
      // Reuse a two-sprite strip so the slowest depth keeps drifting for long
      // boss fights instead of clamping after that overscan is exhausted.
      loop: true,
      tilePoolSize: DEEP_SPACE_BACKPLATE_TILE_POOL_SIZE,
      startOffsetRatio,
      coverViewport: true,
      scrollDirection: 'down'
    },
    {
      url: ASSETS.GAME_PARALLAX_BACK,
      speed: speeds[1],
      alpha: 0.1,
      widthScale: 1.04,
      xDrift: 0.5,
      phase: 4.1 + phaseOffset,
      scrollDirection: 'down'
    },
    {
      url: ASSETS.GAME_PARALLAX_FAR_PLANETS,
      speed: speeds[2],
      alpha: 1,
      widthScale: 1.12,
      xDrift: 0.8,
      phase: 1.6 + phaseOffset,
      softness: 0.55,
      scrollDirection: 'down'
    },
    {
      url: ASSETS.GAME_BG_STARS,
      speed: speeds[3],
      alpha: 0.12,
      widthScale: 1.06,
      xDrift: 1.2,
      phase: 2.2 + phaseOffset,
      softness: 0.2,
      scrollDirection: 'down'
    },
  ];
  // The earlier asteroid overlays read as dozens of unrelated loose props and
  // crossed the large planet silhouettes. Live space missions now use the
  // cleaner planet, star, and nebula planes. The generated sheets remain
  // registered for backwards-compatible campaign data without entering view.
  layers.push({
    url: ASSETS.GAME_PARALLAX_STARS,
    speed: speeds[6],
    alpha: 0.22,
    widthScale: 1.08,
    xDrift: 2.2,
    phase: 5.4 + phaseOffset,
    scrollDirection: 'down'
  });
  return layers;
};

const BACKGROUND_PROFILES = {
  'open-orbit': {
    tint: '#082f49',
    accent: '#67e8f9',
    family: 0,
    colorGradeAlpha: 0.085,
    layers: createSpaceLayers(
      'open-orbit',
      0.02,
      0,
      ASSETS.PIXI_SPACE_PARALLAX_BG_ION_CLOUD,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_BASALT]
    ),
    horizonAlpha: 0.11,
    planetTint: '#d8f7ff',
    starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['open-orbit'],
    terrain: 'space',
    propSet: 'space',
    propAlpha: 1,
    propCount: 2,
    glyphAlpha: 0
  },
  'citation-storm': {
    tint: '#312e81',
    accent: '#c4b5fd',
    family: 1,
    colorGradeAlpha: 0.1,
    layers: createSpaceLayers(
      'citation-storm',
      0.34,
      0.8,
      ASSETS.PIXI_SPACE_PARALLAX_BG_VIOLET_RIFT,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_RUST]
    ),
    horizonAlpha: 0.13,
    planetTint: '#ddd6fe',
    starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['citation-storm'],
    terrain: 'space',
    propSet: 'space',
    propAlpha: 1,
    propCount: 2,
    glyphAlpha: 0
  },
  'paywall-siege': {
    tint: '#713f12',
    accent: '#facc15',
    family: 2,
    colorGradeAlpha: 0.095,
    layers: [
      { url: ASSETS.PIXI_TERRAIN_DESERT_MASTER, speed: 0.4, alpha: 1, loop: false, startOffsetRatio: 0.02, scrollDirection: 'down' },
      { url: ASSETS.PIXI_DESERT_CLOUDS, speed: 0.118, alpha: 0.18, widthScale: 1.06, xDrift: 2, phase: 1.4, scrollDirection: 'down' },
      { url: ASSETS.GAME_BG_STARS, speed: 0.017, alpha: 0.025, widthScale: 1.04, xDrift: 1, phase: 2.8, scrollDirection: 'down' }
    ],
    horizonAlpha: 0,
    planetTint: '#fde68a',
    starSpeedMultiplier: 0.39,
    terrain: 'desert',
    propSet: 'desert',
    propAlpha: 0.92,
    propCount: 9,
    glyphAlpha: 0
  },
  'open-galaxy': {
    tint: '#064e3b',
    accent: '#6ee7b7',
    family: 3,
    colorGradeAlpha: 0.085,
    layers: [
      { url: ASSETS.PIXI_TERRAIN_RIVER_MASTER, speed: 0.38, alpha: 1, loop: false, startOffsetRatio: 0.03, scrollDirection: 'down' },
      { url: ASSETS.GAME_BG_STARS, speed: 0.0135, alpha: 0.02, widthScale: 1.04, xDrift: 1, phase: 2.3, scrollDirection: 'down' }
    ],
    horizonAlpha: 0,
    planetTint: '#bbf7d0',
    starSpeedMultiplier: 0.34,
    terrain: 'river',
    propSet: 'river',
    propAlpha: 0.94,
    propCount: 9,
    glyphAlpha: 0
  },
  'bastion-protocol': {
    tint: '#831843',
    accent: '#f9a8d4',
    family: 1,
    colorGradeAlpha: 0.075,
    layers: createSpaceLayers(
      'bastion-protocol',
      0.68,
      1.6,
      ASSETS.PIXI_SPACE_PARALLAX_BG_OBSIDIAN_NEBULA,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_BASALT, ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_RUST]
    ),
    horizonAlpha: 0.14,
    planetTint: '#fbcfe8',
    starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['bastion-protocol'],
    terrain: 'space',
    propSet: 'space',
    propAlpha: 1,
    propCount: 2,
    glyphAlpha: 0
  },
  'helix-redline': {
    tint: '#4c1d95', accent: '#f472b6', family: 1, colorGradeAlpha: 0.09,
    layers: createSpaceLayers(
      'helix-redline', 0.12, 2.2,
      ASSETS.PIXI_SPACE_PARALLAX_BG_VIOLET_RIFT,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_RUST, ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_BASALT]
    ),
    horizonAlpha: 0.14, planetTint: '#f0abfc', starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['helix-redline'],
    terrain: 'space', propSet: 'helix-redline', propAlpha: 1, propCount: 2, glyphAlpha: 0
  },
  'shattered-void': {
    tint: '#1e1b4b', accent: '#a5b4fc', family: 1, colorGradeAlpha: 0.1,
    layers: createSpaceLayers(
      'shattered-void', 0.25, 2.9,
      ASSETS.PIXI_SPACE_PARALLAX_BG_OBSIDIAN_NEBULA,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_BASALT]
    ),
    horizonAlpha: 0.1, planetTint: '#c7d2fe', starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['shattered-void'],
    terrain: 'space', propSet: 'shattered-void', propAlpha: 1, propCount: 2, glyphAlpha: 0
  },
  'gravity-rift': {
    tint: '#134e4a', accent: '#5eead4', family: 0, colorGradeAlpha: 0.09,
    layers: createSpaceLayers(
      'gravity-rift', 0.39, 3.6,
      ASSETS.PIXI_SPACE_PARALLAX_BG_ION_CLOUD,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_BASALT, ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_RUST]
    ),
    horizonAlpha: 0.16, planetTint: '#99f6e4', starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['gravity-rift'],
    terrain: 'space', propSet: 'gravity-rift', propAlpha: 1, propCount: 2, glyphAlpha: 0
  },
  'ion-eclipse': {
    tint: '#1e3a8a', accent: '#67e8f9', family: 3, colorGradeAlpha: 0.1,
    layers: createSpaceLayers(
      'ion-eclipse', 0.52, 4.3,
      ASSETS.PIXI_SPACE_PARALLAX_BG_ION_CLOUD,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_RUST]
    ),
    horizonAlpha: 0.15, planetTint: '#bae6fd', starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['ion-eclipse'],
    terrain: 'space', propSet: 'ion-eclipse', propAlpha: 1, propCount: 2, glyphAlpha: 0
  },
  'terminus-frontier': {
    tint: '#78350f', accent: '#fbbf24', family: 2, colorGradeAlpha: 0.08,
    layers: createSpaceLayers(
      'terminus-frontier', 0.71, 5,
      ASSETS.PIXI_SPACE_PARALLAX_BG_OBSIDIAN_NEBULA,
      [ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_RUST, ASSETS.PIXI_SPACE_PARALLAX_DEBRIS_BASALT]
    ),
    horizonAlpha: 0.12, planetTint: '#fde68a', starSpeedMultiplier: SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS['terminus-frontier'],
    terrain: 'space', propSet: 'terminus-frontier', propAlpha: 1, propCount: 2, glyphAlpha: 0
  }
} as const satisfies Record<string, EnvironmentProfile>;

const ALL_BACKGROUND_PROFILES: readonly EnvironmentProfile[] = Object.values(BACKGROUND_PROFILES);
export const MAX_PARALLAX_LAYER_POOL_SIZE = Math.max(
  ...ALL_BACKGROUND_PROFILES.map((profile) => profile.layers.length)
);

export type PixiEnvironmentWindow = Readonly<{
  currentBackgroundId: string;
  nextBackgroundId: string | null;
}>;

const resolveBackgroundId = (backgroundId?: string | null) => (
  backgroundId && backgroundId in BACKGROUND_PROFILES ? backgroundId : DEFAULT_BACKGROUND_ID
);

const getEntryBackgroundId = (
  level: GameCampaign['levels'][number],
  wave: GameCampaign['levels'][number]['waves'][number]
) => resolveBackgroundId(wave.backgroundId ?? level.backgroundId);

/**
 * Resolves the active route plus the next distinct environment. Repeated stages
 * intentionally share one preload window, giving the following route plenty of
 * time to warm without decoding every late-campaign atlas at mission startup.
 */
export const resolveCampaignEnvironmentWindow = (
  campaign: GameCampaign,
  levelId?: string,
  waveId?: string
): PixiEnvironmentWindow => {
  const entries = [...(campaign.levels ?? [])]
    .sort((left, right) => left.order - right.order)
    .flatMap((level) => [...(level.waves ?? [])]
      .sort((left, right) => left.order - right.order)
      .map((wave) => ({ level, wave })));
  const requestedIndex = entries.findIndex(({ level, wave }) => (
    (!levelId || level.id === levelId)
    && (!waveId || wave.id === waveId)
  ));
  const currentIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const currentEntry = entries[currentIndex];
  const currentBackgroundId = currentEntry
    ? getEntryBackgroundId(currentEntry.level, currentEntry.wave)
    : DEFAULT_BACKGROUND_ID;
  const nextEntry = entries
    .slice(currentIndex + 1)
    .find(({ level, wave }) => getEntryBackgroundId(level, wave) !== currentBackgroundId);

  return {
    currentBackgroundId,
    nextBackgroundId: nextEntry ? getEntryBackgroundId(nextEntry.level, nextEntry.wave) : null
  };
};

/** Exact decoded texture set needed to present one environment profile. */
export const getEnvironmentProfileTextureUrls = (backgroundId: string): readonly string[] => {
  const resolvedId = resolveBackgroundId(backgroundId);
  const profile = BACKGROUND_PROFILES[resolvedId as keyof typeof BACKGROUND_PROFILES];
  const perspectiveSheet = GROUND_PROP_PERSPECTIVE_SHEETS[profile.terrain];
  return Object.freeze([...new Set([
    ...profile.layers.map((layer) => layer.url),
    ...(profile.horizonAlpha > 0 ? [ASSETS.GAME_BG_PLANET] : []),
    TERRAIN_PROP_ATLASES[profile.propSet],
    ...(perspectiveSheet ? [perspectiveSheet] : [])
  ].filter(Boolean))]);
};

export const getEnvironmentWindowTextureUrls = (
  window: PixiEnvironmentWindow
): readonly string[] => Object.freeze([...new Set([
  ...getEnvironmentProfileTextureUrls(window.currentBackgroundId),
  ...(window.nextBackgroundId ? getEnvironmentProfileTextureUrls(window.nextBackgroundId) : [])
])]);

const INITIAL_ENVIRONMENT_WINDOW: PixiEnvironmentWindow = Object.freeze({
  currentBackgroundId: DEFAULT_BACKGROUND_ID,
  nextBackgroundId: 'citation-storm'
});

/** Initial production route only; later environments are warmed on demand. */
export const PIXI_ENVIRONMENT_TEXTURE_URLS = getEnvironmentWindowTextureUrls(INITIAL_ENVIRONMENT_WINDOW);

export class PixiEnvironment {
  private readonly parallaxLayers: ParallaxLayer[] = [];
  private readonly stars: StarPoint[] = [];
  private readonly glyphs: ScienceGlyph[] = [];
  private readonly terrainProps: TerrainProp[] = [];
  private readonly atlasFrameCache = new Map<string, readonly Texture[]>();
  private readonly backgroundFill = new Graphics();
  private readonly sectorTint = new Graphics();
  private readonly hyperspeedStreaks = new Graphics();
  private readonly hyperspeedFrame = new Graphics();
  private readonly terrainPropLayer = new Container();
  private readonly spacePropMotionBlur = new BlurFilter({ strengthX: 0, strengthY: 0, quality: 1, kernelSize: 5 });
  private readonly horizon = new Sprite(Texture.WHITE);
  private width = 1;
  private height = 1;
  private built = false;
  private activeBackgroundId = '';
  private activePropSet: TerrainPropSet | null = null;
  private profileWindowKey = '';
  private profileWindowPreload: Promise<void> = Promise.resolve();
  private campaignLevelId = '';
  private campaignWaveId = '';
  private campaignProfileWindow: PixiEnvironmentWindow = INITIAL_ENVIRONMENT_WINDOW;
  private profileStartedAtFrame = 0;
  private environmentMotionFrame = 0;
  private lastEngineFrame = -1;
  private spacePropBlurActive = false;

  constructor(
    private readonly backgroundLayer: Container,
    private readonly environmentLayer: Container,
    private readonly textures: PixiTextureBank
  ) {}

  async init(
    width: number,
    height: number,
    profileWindow: PixiEnvironmentWindow = INITIAL_ENVIRONMENT_WINDOW
  ) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (!this.built) this.build();
    this.resize(this.width, this.height);
    await this.preloadProfileWindow(profileWindow);
    this.applyProfile(profileWindow.currentBackgroundId, true);
    this.resize(this.width, this.height);
  }

  private build() {
    this.built = true;
    this.backgroundLayer.addChild(this.backgroundFill);
    for (let layerIndex = 0; layerIndex < MAX_PARALLAX_LAYER_POOL_SIZE; layerIndex++) {
      const definition = ALL_BACKGROUND_PROFILES
        .map((profile) => profile.layers[layerIndex])
        .find((candidate): candidate is ParallaxDefinition => Boolean(candidate));
      if (!definition) continue;
      const root = new Container();
      const blurFilter = new BlurFilter({ strength: definition.softness ?? 0, quality: 1, kernelSize: 5 });
      root.eventMode = 'none';
      root.filters = definition.softness ? [blurFilter] : null;
      const sprites: Sprite[] = [];
      const allocatedTileCount = Math.max(
        ...ALL_BACKGROUND_PROFILES.map((profile) => (
          profile.layers[layerIndex]?.tilePoolSize ?? PARALLAX_TILE_POOL_SIZE
        ))
      );
      for (let tileIndex = 0; tileIndex < allocatedTileCount; tileIndex++) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.alpha = definition.alpha;
        sprite.eventMode = 'none';
        sprites.push(sprite);
        root.addChild(sprite);
      }
      this.parallaxLayers.push({
        root,
        sprites,
        speed: definition.speed,
        alpha: definition.alpha,
        textureKey: definition.url,
        tileHeight: this.height,
        widthScale: definition.widthScale ?? 1,
        xDrift: definition.xDrift ?? 0,
        phase: definition.phase ?? 0,
        loop: definition.loop ?? true,
        startOffsetRatio: definition.startOffsetRatio ?? 0,
        softness: definition.softness ?? 0,
        blurFilter,
        filterActive: Boolean(definition.softness),
        scrollDirection: definition.scrollDirection ?? 'down',
        coverViewport: definition.coverViewport ?? false,
        activeTileCount: Math.min(allocatedTileCount, definition.tilePoolSize ?? PARALLAX_TILE_POOL_SIZE)
      });
      this.backgroundLayer.addChild(root);
    }

    this.backgroundLayer.addChild(this.sectorTint);
    const starCount = this.width < 620 ? 72 : 120;
    for (let index = 0; index < starCount; index++) {
      const sprite = new Sprite(Texture.WHITE);
      const depth = 0.25 + Math.random() * 0.75;
      sprite.tint = index % 8 === 0 ? '#67e8f9' : index % 13 === 0 ? '#c4b5fd' : '#e2f4ff';
      sprite.alpha = 0.2 + depth * 0.7;
      const size = 0.7 + depth * 1.9;
      sprite.width = size;
      sprite.height = size;
      const baseX = Math.random();
      const baseY = Math.random();
      const baseAlpha = 0.2 + depth * 0.58;
      sprite.eventMode = 'none';
      this.stars.push({
        sprite,
        speed: 0.025 + depth * 0.16,
        phase: Math.random() * Math.PI * 2,
        baseX,
        baseY,
        baseAlpha
      });
      this.backgroundLayer.addChild(sprite);
    }

    this.terrainPropLayer.eventMode = 'none';
    this.terrainPropLayer.sortableChildren = true;
    this.environmentLayer.addChild(this.horizon, this.terrainPropLayer);
    this.buildTerrainPropPool();
    for (let index = 0; index < 18; index++) {
      const graphic = new Graphics();
      graphic.eventMode = 'none';
      const family = index % 4;
      this.drawGlyph(graphic, family, '#67e8f9');
      this.glyphs.push({
        graphic,
        baseX: Math.random(),
        baseY: Math.random(),
        speed: 0.012 + Math.random() * 0.035,
        phase: Math.random() * Math.PI * 2,
        family
      });
      this.environmentLayer.addChild(graphic);
    }
    this.hyperspeedStreaks.eventMode = 'none';
    this.hyperspeedStreaks.visible = false;
    this.hyperspeedFrame.eventMode = 'none';
    this.hyperspeedFrame.visible = false;
    this.environmentLayer.addChild(this.hyperspeedStreaks, this.hyperspeedFrame);
  }

  private getAtlasFrames(url: string, columns: number, rows: number): readonly Texture[] {
    const cacheKey = `${url}:${columns}x${rows}`;
    const cached = this.atlasFrameCache.get(cacheKey);
    if (cached) return cached;
    const sheet = this.textures.get(url);
    if (!sheet) return [];
    const frames: Texture[] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const frameIndex = row * columns + column;
        frames.push(new Texture({
          source: sheet.source,
          frame: new Rectangle(
            column * TERRAIN_PROP_CELL_SIZE,
            row * TERRAIN_PROP_CELL_SIZE,
            TERRAIN_PROP_CELL_SIZE,
            TERRAIN_PROP_CELL_SIZE
          ),
          label: `${cacheKey}:${frameIndex}`
        }));
      }
    }
    this.atlasFrameCache.set(cacheKey, frames);
    return frames;
  }

  private buildTerrainPropPool() {
    if (this.terrainProps.length > 0) return;
    const fallbackDefinition = TERRAIN_PROP_LAYOUTS.space[0];
    for (let slot = 0; slot < TERRAIN_PROP_POOL_SIZE; slot++) {
      const root = new Container();
      const shadow = new Graphics();
      const sprite = new Sprite(Texture.WHITE);
      root.eventMode = 'none';
      shadow.eventMode = 'none';
      sprite.eventMode = 'none';
      root.visible = false;
      root.addChild(shadow, sprite);
      this.terrainProps.push({
        root,
        sprite,
        shadow,
        perspectiveTextures: null,
        perspectiveState: -1,
        terrain: 'space',
        propSet: 'space',
        slot,
        ...fallbackDefinition
      });
      this.terrainPropLayer.addChild(root);
    }
  }

  private pruneAtlasFrameCache(keepUrls: readonly string[]) {
    for (const [cacheKey, frames] of this.atlasFrameCache) {
      if (keepUrls.some((url) => cacheKey.startsWith(`${url}:`))) continue;
      frames.forEach((frame) => frame.destroy(false));
      this.atlasFrameCache.delete(cacheKey);
    }
  }

  private configureTerrainProps(propSet: TerrainPropSet) {
    if (this.activePropSet === propSet) return true;
    const terrain = getTerrainForPropSet(propSet);
    const atlasUrl = TERRAIN_PROP_ATLASES[propSet];
    const propTextures = this.getAtlasFrames(atlasUrl, 3, 3);
    if (propTextures.length === 0) return false;
    const perspectiveSheetUrl = GROUND_PROP_PERSPECTIVE_SHEETS[terrain];
    const perspectiveFrames = perspectiveSheetUrl
      ? this.getAtlasFrames(perspectiveSheetUrl, 3, 9)
      : [];
    const layout = TERRAIN_PROP_LAYOUTS[propSet];

    this.terrainProps.forEach((prop, slot) => {
      const definition = layout[slot];
      const texture = definition ? propTextures[definition.frame] : null;
      if (!definition || !texture) {
        prop.root.visible = false;
        return;
      }
      const perspectiveStart = definition.frame * 3;
      const firstPerspective = perspectiveFrames[perspectiveStart];
      const secondPerspective = perspectiveFrames[perspectiveStart + 1];
      const thirdPerspective = perspectiveFrames[perspectiveStart + 2];
      const perspectiveTextures = firstPerspective && secondPerspective && thirdPerspective
        ? [firstPerspective, secondPerspective, thirdPerspective] as [Texture, Texture, Texture]
        : null;

      prop.terrain = terrain;
      prop.propSet = propSet;
      prop.slot = slot;
      prop.baseX = definition.baseX;
      prop.baseY = definition.baseY;
      prop.speed = definition.speed;
      prop.sway = definition.sway;
      prop.phase = definition.phase;
      prop.widthRatio = definition.widthRatio;
      prop.rotationSpeed = definition.rotationSpeed;
      prop.alpha = definition.alpha;
      prop.perspectiveTextures = perspectiveTextures;
      prop.perspectiveState = perspectiveTextures ? 0 : -1;
      prop.sprite.texture = perspectiveTextures?.[0] ?? texture;
      prop.sprite.anchor.set(0.5, terrain === 'space' ? 0.5 : GROUND_PROP_CONTACT_ANCHOR_Y);
      prop.root.visible = false;
      prop.root.rotation = 0;
      prop.root.scale.set(1);
    });

    this.activePropSet = propSet;
    this.pruneAtlasFrameCache([atlasUrl, ...(perspectiveSheetUrl ? [perspectiveSheetUrl] : [])]);
    this.layoutTerrainProps();
    return true;
  }

  private drawGlyph(graphic: Graphics, family: number, color: string) {
    graphic.clear();
    if (family === 0) {
      graphic.moveTo(-12, 0).lineTo(0, -9).lineTo(12, 0).lineTo(0, 9).closePath().stroke({ color, width: 1, alpha: 0.5 });
      for (const [x, y] of [[-12, 0], [0, -9], [12, 0], [0, 9]] as const) graphic.circle(x, y, 2.2).fill({ color, alpha: 0.58 });
    } else if (family === 1) {
      graphic.circle(0, 0, 13).stroke({ color, width: 1, alpha: 0.42 });
      graphic.circle(-5, -2, 3).fill({ color, alpha: 0.32 });
      graphic.circle(6, 4, 2).fill({ color, alpha: 0.44 });
      graphic.circle(3, -6, 1.5).fill({ color, alpha: 0.5 });
    } else if (family === 2) {
      for (let row = 0; row < 3; row++) {
        graphic.rect(-12 + row * 5, -12 + row * 7, 2, 10).fill({ color, alpha: 0.45 });
        graphic.rect(-6 + row * 7, 4 - row * 4, 9, 1).fill({ color, alpha: 0.32 });
      }
    } else {
      graphic.circle(0, 0, 12).stroke({ color, width: 1, alpha: 0.42 });
      graphic.circle(0, 0, 5).stroke({ color, width: 1.5, alpha: 0.58 });
      graphic.moveTo(-17, 0).lineTo(17, 0).stroke({ color, width: 1, alpha: 0.35 });
    }
  }

  private preloadProfileWindow(profileWindow: PixiEnvironmentWindow) {
    const normalizedWindow: PixiEnvironmentWindow = {
      currentBackgroundId: resolveBackgroundId(profileWindow.currentBackgroundId),
      nextBackgroundId: profileWindow.nextBackgroundId
        ? resolveBackgroundId(profileWindow.nextBackgroundId)
        : null
    };
    const profileWindowKey = `${normalizedWindow.currentBackgroundId}:${normalizedWindow.nextBackgroundId ?? ''}`;
    if (profileWindowKey === this.profileWindowKey) return this.profileWindowPreload;

    this.profileWindowKey = profileWindowKey;
    this.profileWindowPreload = this.textures
      .preload([...getEnvironmentWindowTextureUrls(normalizedWindow)])
      .then(() => undefined);
    return this.profileWindowPreload;
  }

  private isProfileReady(backgroundId: string) {
    return getEnvironmentProfileTextureUrls(backgroundId)
      .every((url) => Boolean(this.textures.get(url)));
  }

  private applyProfile(backgroundId: string, force = false) {
    const resolvedId = resolveBackgroundId(backgroundId);
    const profile = BACKGROUND_PROFILES[resolvedId as keyof typeof BACKGROUND_PROFILES];
    if (!force && this.activeBackgroundId === resolvedId) return profile;
    if (!this.isProfileReady(resolvedId) || !this.configureTerrainProps(profile.propSet)) {
      const fallbackId = resolveBackgroundId(this.activeBackgroundId);
      return BACKGROUND_PROFILES[fallbackId as keyof typeof BACKGROUND_PROFILES];
    }

    this.activeBackgroundId = resolvedId;
    for (let index = 0; index < this.parallaxLayers.length; index++) {
      const layer = this.parallaxLayers[index];
      const definition: ParallaxDefinition | undefined = profile.layers[index];
      if (!definition) {
        layer.root.visible = false;
        continue;
      }
      const texture = this.textures.get(definition.url);
      layer.speed = definition.speed;
      layer.alpha = definition.alpha;
      layer.textureKey = definition.url;
      layer.widthScale = definition.widthScale ?? 1;
      layer.xDrift = definition.xDrift ?? 0;
      layer.phase = definition.phase ?? index * 1.7;
      layer.loop = definition.loop ?? true;
      layer.startOffsetRatio = definition.startOffsetRatio ?? 0;
      layer.softness = definition.softness ?? 0;
      layer.blurFilter.strength = layer.softness;
      layer.filterActive = layer.softness > 0;
      layer.root.filters = layer.filterActive ? [layer.blurFilter] : null;
      layer.scrollDirection = definition.scrollDirection ?? 'down';
      layer.coverViewport = definition.coverViewport ?? false;
      layer.activeTileCount = Math.min(
        layer.sprites.length,
        definition.tilePoolSize ?? PARALLAX_TILE_POOL_SIZE
      );
      layer.root.visible = true;
      for (let tileIndex = 0; tileIndex < layer.sprites.length; tileIndex++) {
        const sprite = layer.sprites[tileIndex];
        if (texture) sprite.texture = texture;
        sprite.visible = Boolean(texture) && tileIndex < layer.activeTileCount;
        sprite.alpha = definition.alpha;
      }
      this.layoutParallaxLayer(layer);
    }

    const horizon = this.textures.get(ASSETS.GAME_BG_PLANET);
    if (horizon) this.horizon.texture = horizon;
    this.horizon.visible = profile.horizonAlpha > 0;
    this.horizon.tint = profile.planetTint;
    this.terrainPropLayer.visible = profile.propAlpha > 0;
    this.terrainPropLayer.alpha = profile.propAlpha;
    return profile;
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.backgroundFill.clear().rect(0, 0, this.width, this.height).fill('#020617');
    this.sectorTint.clear().rect(0, 0, this.width, this.height).fill('#ffffff');
    this.sectorTint.alpha = 0;

    this.horizon.anchor.set(0.5, 1);
    this.horizon.width = this.width * 1.24;
    this.horizon.height = this.horizon.width * (
      Math.max(1, this.horizon.texture.height) / Math.max(1, this.horizon.texture.width)
    );
    this.horizon.position.set(this.width / 2, this.height + this.horizon.height * 0.72);
    this.horizon.alpha = 0.52;

    this.hyperspeedFrame
      .clear()
      .rect(3, 3, Math.max(1, this.width - 6), Math.max(1, this.height - 6))
      .stroke({ color: '#22d3ee', width: 7, alpha: 0.15 })
      .rect(2, 2, Math.max(1, this.width - 4), Math.max(1, this.height - 4))
      .stroke({ color: '#a5f3fc', width: 1.5, alpha: 0.82 });

    for (const layer of this.parallaxLayers) this.layoutParallaxLayer(layer);
    this.layoutTerrainProps();
  }

  private layoutParallaxLayer(layer: ParallaxLayer) {
    const texture = this.textures.get(layer.textureKey);
    const sourceWidth = Math.max(1, texture?.width || this.width);
    const sourceHeight = Math.max(1, texture?.height || this.height);
    const sourceAspect = sourceHeight / sourceWidth;
    const scaledWidth = layer.coverViewport
      ? Math.max(this.width * layer.widthScale, this.height / sourceAspect) * 1.04
      : this.width * layer.widthScale;
    layer.tileHeight = scaledWidth * sourceAspect;
    for (const sprite of layer.sprites) {
      sprite.width = scaledWidth;
      sprite.height = layer.tileHeight;
      sprite.alpha = layer.alpha;
    }
  }

  private layoutTerrainProps() {
    for (const prop of this.terrainProps) {
      const width = Math.max(18, this.width * prop.widthRatio);
      const aspect = Math.max(0.25, prop.sprite.texture.height / Math.max(1, prop.sprite.texture.width));
      prop.sprite.width = width;
      prop.sprite.height = width * aspect;
      prop.shadow.clear();
      if (prop.terrain !== 'space') {
        prop.shadow.ellipse(0, 0, width * 0.28, width * 0.085)
          .fill({ color: '#020617', alpha: 0.24 });
      }
    }
  }

  update(engine: GameEngine) {
    const currentLevel = engine.getCurrentLevelDefinition();
    const currentWave = engine.getCurrentWaveDefinition();
    const currentLevelId = currentLevel?.id ?? '';
    const currentWaveId = currentWave?.id ?? '';
    if (currentLevelId !== this.campaignLevelId || currentWaveId !== this.campaignWaveId) {
      this.campaignLevelId = currentLevelId;
      this.campaignWaveId = currentWaveId;
      this.campaignProfileWindow = resolveCampaignEnvironmentWindow(
        engine.campaign,
        currentLevelId,
        currentWaveId
      );
      void this.preloadProfileWindow(this.campaignProfileWindow);
    }
    const previousBackgroundId = this.activeBackgroundId;
    const profile = this.applyProfile(this.campaignProfileWindow.currentBackgroundId);
    const profileChanged = previousBackgroundId !== this.activeBackgroundId;
    if (profileChanged) {
      this.profileStartedAtFrame = engine.frameCount;
      this.environmentMotionFrame = 0;
    }
    const localFrame = Math.max(0, engine.frameCount - this.profileStartedAtFrame);
    const runtime = engine.getRuntimeState();
    const rawFrameDelta = this.lastEngineFrame < 0 || engine.frameCount < this.lastEngineFrame
      ? 1
      : engine.frameCount - this.lastEngineFrame;
    const frameDelta = Math.max(0, Math.min(4, rawFrameDelta));
    this.lastEngineFrame = engine.frameCount;
    const hyperspeedStrength = runtime.stageHyperspeedActive
      ? Math.max(0, Math.min(1, runtime.stageHyperspeedStrength))
      : 0;
    const spaceHyperspeedStrength = profile.terrain === 'space' ? hyperspeedStrength : 0;
    const departureSpeedBoost = runtime.stageHyperspeedActive
      ? Math.max(1, Math.min(6, runtime.stageDepartureSpeedBoost))
        + hyperspeedStrength * (profile.terrain === 'space' ? TAKEOFF_WORLD_SPEED_MULTIPLIER : 30)
      : 1;
    if (!profileChanged) {
      this.environmentMotionFrame += frameDelta * departureSpeedBoost;
    }
    const motionFrame = this.environmentMotionFrame || localFrame;
    for (let index = 0; index < this.parallaxLayers.length; index++) {
      const layer = this.parallaxLayers[index];
      if (!layer.root.visible) continue;
      const depthRatio = index / Math.max(1, this.parallaxLayers.length - 1);
      const baseBlurStrength = engine.performanceMode ? 0 : layer.softness;
      const takeoffBlurX = engine.performanceMode ? 0 : spaceHyperspeedStrength * 0.14;
      const takeoffBlurY = engine.performanceMode
        ? 0
        : spaceHyperspeedStrength * (0.7 + depthRatio * 5.6);
      layer.blurFilter.strengthX = baseBlurStrength + takeoffBlurX;
      layer.blurFilter.strengthY = baseBlurStrength + takeoffBlurY;
      const shouldFilter = layer.blurFilter.strengthY > 0.01;
      if (layer.filterActive !== shouldFilter) {
        layer.root.filters = shouldFilter ? [layer.blurFilter] : null;
        layer.filterActive = shouldFilter;
      }
      const maxTravel = Math.max(0, layer.tileHeight - this.height);
      const spriteX = (this.width - layer.sprites[0].width) / 2;
      layer.root.x = Math.sin(motionFrame * 0.0016 + layer.phase) * layer.xDrift;
      if (layer.loop) {
        const scrollDistance = layer.tileHeight * layer.startOffsetRatio + motionFrame * layer.speed;
        for (let tileIndex = 0; tileIndex < layer.sprites.length; tileIndex++) {
          const sprite = layer.sprites[tileIndex];
          if (tileIndex >= layer.activeTileCount) {
            sprite.visible = false;
            continue;
          }
          const tileY = getLoopingParallaxTileY(
            tileIndex,
            scrollDistance,
            layer.tileHeight,
            layer.scrollDirection
          );
          sprite.visible = tileY < this.height + 2 && tileY + layer.tileHeight > -2;
          sprite.position.set(spriteX, tileY);
        }
      } else {
        const scrollDistance = maxTravel * layer.startOffsetRatio + motionFrame * layer.speed;
        const offset = getNonLoopingParallaxOffset(maxTravel, scrollDistance, layer.scrollDirection);
        for (let tileIndex = 0; tileIndex < layer.sprites.length; tileIndex++) {
          const sprite = layer.sprites[tileIndex];
          sprite.visible = tileIndex === 0 && tileIndex < layer.activeTileCount;
          if (tileIndex === 0) sprite.position.set(spriteX, offset);
        }
      }
    }

    for (let index = 0; index < this.stars.length; index++) {
      const star = this.stars[index];
      star.sprite.visible = true;
      star.sprite.x = star.baseX * this.width;
      star.sprite.y = ((star.baseY * this.height) + motionFrame * star.speed * profile.starSpeedMultiplier) % this.height;
      star.sprite.alpha = Math.max(0.12, Math.min(0.82, star.baseAlpha + Math.sin(motionFrame * 0.012 + star.phase) * 0.08));
    }

    const terrainLayer = this.parallaxLayers[0];
    const terrainTop = terrainLayer?.sprites[0].y ?? 0;
    const playerCenterY = engine.player.y + engine.player.height / 2;
    const overheadBand = Math.max(32, engine.player.height * 0.42);
    for (const prop of this.terrainProps) {
      const visible = prop.propSet === profile.propSet && prop.slot < profile.propCount;
      prop.root.visible = visible;
      if (!visible) continue;
      if (prop.terrain === 'space') {
        const propCycle = this.height + Math.max(360, prop.sprite.height * 2);
        prop.root.x = prop.baseX * this.width + Math.sin(motionFrame * 0.0016 + prop.phase) * prop.sway;
        prop.root.y = ((prop.baseY * propCycle) + motionFrame * prop.speed) % propCycle - prop.sprite.height;
        prop.root.rotation = motionFrame * prop.rotationSpeed;
        prop.root.scale.set(1);
        prop.root.alpha = prop.alpha;
        prop.root.zIndex = Math.round(prop.speed * 10_000);
        continue;
      }

      // Ground props share the terrain master's exact vertical transform. Their
      // screen-space scale and outward drift create a gentle flyover effect
      // without allowing the artwork to slide away from the ground beneath it.
      const groundY = terrainTop + prop.baseY * terrainLayer.tileHeight;
      const screenDepth = Math.max(0, Math.min(1, (groundY + 120) / (this.height + 240)));
      const perspectiveScale = 0.76 + screenDepth * 0.48;
      const perspectiveSpread = 0.82 + screenDepth * 0.24;
      const relativeY = groundY - playerCenterY;
      const perspectiveState = getGroundPropPerspectiveState(relativeY, overheadBand);
      if (prop.perspectiveTextures && prop.perspectiveState !== perspectiveState) {
        prop.sprite.texture = prop.perspectiveTextures[perspectiveState];
        prop.perspectiveState = perspectiveState;
      }
      prop.root.x = this.width * 0.5 + (prop.baseX - 0.5) * this.width * perspectiveSpread;
      prop.root.y = groundY;
      prop.root.rotation = 0;
      prop.root.scale.set(perspectiveScale);
      prop.root.alpha = prop.alpha * (0.76 + screenDepth * 0.24);
      prop.root.zIndex = Math.round(groundY * 10);
      prop.root.visible = groundY > -prop.sprite.height && groundY < this.height + prop.sprite.height;
    }

    this.sectorTint.tint = profile.tint;
    this.sectorTint.alpha = profile.colorGradeAlpha;
    this.horizon.alpha = profile.horizonAlpha;
    this.horizon.y = this.height + this.horizon.height * 0.72
      + hyperspeedStrength * this.height * 0.08
      + Math.sin(motionFrame * 0.0014) * 2;

    for (let index = 0; index < this.glyphs.length; index++) {
      const glyph = this.glyphs[index];
      const visibleForSector = profile.glyphAlpha > 0 && (glyph.family === profile.family || index % 7 === 0);
      glyph.graphic.visible = visibleForSector;
      glyph.graphic.x = glyph.baseX * this.width + Math.sin(motionFrame * 0.0025 + glyph.phase) * 12;
      glyph.graphic.y = ((glyph.baseY * this.height) + motionFrame * glyph.speed) % (this.height + 60) - 30;
      glyph.graphic.rotation = Math.sin(motionFrame * 0.0018 + glyph.phase) * 0.12;
      glyph.graphic.alpha = profile.glyphAlpha + Math.sin(motionFrame * 0.005 + glyph.phase) * 0.01;
      glyph.graphic.tint = profile.accent;
    }

    this.hyperspeedStreaks.clear();
    this.hyperspeedStreaks.visible = hyperspeedStrength > 0.01;
    this.hyperspeedFrame.visible = hyperspeedStrength > 0.01;
    this.hyperspeedFrame.alpha = Math.min(0.78, hyperspeedStrength * 0.78);
    if (this.hyperspeedStreaks.visible) {
      const fullQualityStreakCap = this.width < 620
        ? MOBILE_HYPERSPEED_STREAK_CAP
        : DESKTOP_HYPERSPEED_STREAK_CAP;
      const streakCount = engine.performanceMode
        ? Math.max(16, Math.floor(fullQualityStreakCap * 0.66))
        : fullQualityStreakCap;
      const centerX = this.width / 2;
      const phase = motionFrame * (3.4 + hyperspeedStrength * 6.6);
      for (let index = 0; index < streakCount; index++) {
        const seed = (index * 47 + 19) % 101;
        const normalizedX = ((index * 67 + 13) % 997) / 997;
        const x = normalizedX * this.width;
        const y = ((seed / 101 * (this.height + 180) + phase) % (this.height + 180)) - 90;
        const outward = (x - centerX) / Math.max(1, centerX);
        const length = (18 + (index % 7) * 7) * (0.55 + hyperspeedStrength * 1.65);
        const alpha = (0.12 + (index % 5) * 0.035) * hyperspeedStrength;
        this.hyperspeedStreaks
          .moveTo(x - outward * length * 0.16, y - length)
          .lineTo(x + outward * length * 0.22, y)
          .stroke({
            color: index % 6 === 0 ? '#ffffff' : index % 3 === 0 ? '#a5f3fc' : '#38bdf8',
            width: 0.8 + hyperspeedStrength * 1.7,
            alpha
          });
      }
    }

    const propMotionBlurStrength = engine.performanceMode
      ? 0
      : spaceHyperspeedStrength * SPACE_PROP_MOTION_BLUR_CAP;
    this.spacePropMotionBlur.strengthX = Math.min(0.18, propMotionBlurStrength * 0.035);
    this.spacePropMotionBlur.strengthY = propMotionBlurStrength;
    const shouldBlurSpaceProps = propMotionBlurStrength > 0.01;
    if (this.spacePropBlurActive !== shouldBlurSpaceProps) {
      this.terrainPropLayer.filters = shouldBlurSpaceProps ? [this.spacePropMotionBlur] : null;
      this.spacePropBlurActive = shouldBlurSpaceProps;
    }
  }

  destroy() {
    for (const frames of this.atlasFrameCache.values()) {
      frames.forEach((frame) => frame.destroy(false));
    }
    this.parallaxLayers.length = 0;
    this.stars.length = 0;
    this.glyphs.length = 0;
    this.terrainProps.length = 0;
    this.atlasFrameCache.clear();
    this.activeBackgroundId = '';
    this.activePropSet = null;
    this.profileWindowKey = '';
    this.profileWindowPreload = Promise.resolve();
    this.campaignLevelId = '';
    this.campaignWaveId = '';
    this.campaignProfileWindow = INITIAL_ENVIRONMENT_WINDOW;
    this.profileStartedAtFrame = 0;
    this.environmentMotionFrame = 0;
    this.lastEngineFrame = -1;
  }
}
