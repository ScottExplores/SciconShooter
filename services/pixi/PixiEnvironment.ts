import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { ASSETS } from '../../constants';
import { GameEngine } from '../gameLogic';
import { PixiTextureBank } from './PixiTextureBank';

type ParallaxLayer = {
  root: Container;
  sprites: [Sprite, Sprite];
  speed: number;
  alpha: number;
  textureKey: string;
  tileHeight: number;
  widthScale: number;
  xDrift: number;
  phase: number;
  loop: boolean;
  startOffsetRatio: number;
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
};

type TerrainFamily = 'space' | 'desert' | 'river';

type TerrainProp = {
  sprite: Sprite;
  terrain: TerrainFamily;
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

type TerrainPropDefinition = Omit<TerrainProp, 'sprite' | 'terrain' | 'slot'> & { frame: number };

type EnvironmentProfile = {
  tint: string;
  accent: string;
  family: number;
  colorGradeAlpha: number;
  layers: readonly ParallaxDefinition[];
  horizonAlpha: number;
  bigPlanetAlpha: number;
  ringPlanetAlpha: number;
  planetTint: string;
  starSpeedMultiplier: number;
  terrain: TerrainFamily;
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
const RING_PLANET_SPEED = 0.028;
const TERRAIN_PROP_CELL_SIZE = 256;

const TERRAIN_PROP_ATLASES: Record<TerrainFamily, string> = {
  space: ASSETS.PIXI_TERRAIN_SPACE_PROPS,
  desert: ASSETS.PIXI_TERRAIN_DESERT_PROPS,
  river: ASSETS.PIXI_TERRAIN_RIVER_PROPS
};

const TERRAIN_PROP_LAYOUTS: Record<TerrainFamily, readonly TerrainPropDefinition[]> = {
  space: [
    { frame: 1, baseX: 0.1, baseY: 0.08, speed: 0.012, sway: 2, phase: 0.2, widthRatio: 0.2, rotationSpeed: 0, alpha: 0.66 },
    { frame: 2, baseX: 0.9, baseY: 0.34, speed: 0.018, sway: 3, phase: 1.2, widthRatio: 0.17, rotationSpeed: 0, alpha: 0.66 },
    { frame: 0, baseX: 0.14, baseY: 0.58, speed: 0.1, sway: 5, phase: 2.4, widthRatio: 0.14, rotationSpeed: 0.0012, alpha: 0.86 },
    { frame: 3, baseX: 0.86, baseY: 0.74, speed: 0.13, sway: 6, phase: 3.2, widthRatio: 0.13, rotationSpeed: -0.0008, alpha: 0.88 },
    { frame: 4, baseX: 0.12, baseY: 0.9, speed: 0.16, sway: 7, phase: 4.1, widthRatio: 0.135, rotationSpeed: 0, alpha: 0.9 },
    { frame: 5, baseX: 0.88, baseY: 0.12, speed: 0.08, sway: 4, phase: 5.4, widthRatio: 0.14, rotationSpeed: 0, alpha: 0.78 },
    { frame: 6, baseX: 0.82, baseY: 0.5, speed: 0.045, sway: 4, phase: 0.8, widthRatio: 0.18, rotationSpeed: 0.0004, alpha: 0.72 },
    { frame: 7, baseX: 0.24, baseY: 0.74, speed: 0.18, sway: 9, phase: 2.8, widthRatio: 0.13, rotationSpeed: -0.001, alpha: 0.86 },
    { frame: 8, baseX: 0.9, baseY: 0.92, speed: 0.12, sway: 5, phase: 4.9, widthRatio: 0.12, rotationSpeed: 0, alpha: 0.88 }
  ],
  desert: [
    { frame: 0, baseX: 0.11, baseY: 0.06, speed: 0.48, sway: 2, phase: 0.3, widthRatio: 0.2, rotationSpeed: 0, alpha: 0.92 },
    { frame: 1, baseX: 0.9, baseY: 0.2, speed: 0.42, sway: 2, phase: 1.5, widthRatio: 0.17, rotationSpeed: 0, alpha: 0.9 },
    { frame: 2, baseX: 0.14, baseY: 0.35, speed: 0.56, sway: 2, phase: 2.7, widthRatio: 0.19, rotationSpeed: 0, alpha: 0.94 },
    { frame: 3, baseX: 0.86, baseY: 0.48, speed: 0.46, sway: 2, phase: 3.5, widthRatio: 0.17, rotationSpeed: 0, alpha: 0.9 },
    { frame: 4, baseX: 0.12, baseY: 0.62, speed: 0.6, sway: 3, phase: 4.3, widthRatio: 0.13, rotationSpeed: 0, alpha: 0.88 },
    { frame: 5, baseX: 0.88, baseY: 0.73, speed: 0.5, sway: 2, phase: 5.1, widthRatio: 0.14, rotationSpeed: 0, alpha: 0.96 },
    { frame: 6, baseX: 0.13, baseY: 0.86, speed: 0.54, sway: 2, phase: 0.9, widthRatio: 0.18, rotationSpeed: 0, alpha: 0.92 },
    { frame: 7, baseX: 0.88, baseY: 0.94, speed: 0.58, sway: 3, phase: 2.1, widthRatio: 0.12, rotationSpeed: 0, alpha: 0.94 },
    { frame: 8, baseX: 0.1, baseY: 0.76, speed: 0.44, sway: 1, phase: 3.9, widthRatio: 0.16, rotationSpeed: 0, alpha: 0.86 }
  ],
  river: [
    { frame: 0, baseX: 0.1, baseY: 0.08, speed: 0.5, sway: 2, phase: 0.4, widthRatio: 0.19, rotationSpeed: 0, alpha: 0.93 },
    { frame: 1, baseX: 0.9, baseY: 0.2, speed: 0.58, sway: 4, phase: 1.1, widthRatio: 0.13, rotationSpeed: 0, alpha: 0.9 },
    { frame: 2, baseX: 0.13, baseY: 0.34, speed: 0.48, sway: 3, phase: 2.3, widthRatio: 0.15, rotationSpeed: 0, alpha: 0.9 },
    { frame: 3, baseX: 0.86, baseY: 0.47, speed: 0.52, sway: 2, phase: 3.4, widthRatio: 0.18, rotationSpeed: 0, alpha: 0.94 },
    { frame: 4, baseX: 0.11, baseY: 0.61, speed: 0.56, sway: 2, phase: 4.7, widthRatio: 0.16, rotationSpeed: 0, alpha: 0.92 },
    { frame: 5, baseX: 0.89, baseY: 0.72, speed: 0.49, sway: 3, phase: 5.4, widthRatio: 0.14, rotationSpeed: 0, alpha: 0.96 },
    { frame: 6, baseX: 0.13, baseY: 0.84, speed: 0.46, sway: 2, phase: 0.8, widthRatio: 0.17, rotationSpeed: 0, alpha: 0.88 },
    { frame: 7, baseX: 0.87, baseY: 0.92, speed: 0.62, sway: 3, phase: 2.2, widthRatio: 0.13, rotationSpeed: 0, alpha: 0.95 },
    { frame: 8, baseX: 0.1, baseY: 0.73, speed: 0.54, sway: 2, phase: 3.8, widthRatio: 0.17, rotationSpeed: 0, alpha: 0.9 }
  ]
};

export const CAMPAIGN_ENVIRONMENT_ROUTE = [
  { wave: 1, backgroundId: 'open-orbit', terrain: 'space', storyBeat: 'orbital-departure' },
  { wave: 2, backgroundId: 'citation-storm', terrain: 'space', storyBeat: 'deep-nebula' },
  { wave: 3, backgroundId: 'paywall-siege', terrain: 'desert', storyBeat: 'planetary-descent' },
  { wave: 4, backgroundId: 'open-galaxy', terrain: 'river', storyBeat: 'biosphere-expedition' },
  { wave: 5, backgroundId: 'bastion-protocol', terrain: 'space', storyBeat: 'orbital-return' }
] as const;

const BACKGROUND_PROFILES = {
  'open-orbit': {
    tint: '#082f49',
    accent: '#67e8f9',
    family: 0,
    colorGradeAlpha: 0.085,
    layers: [
      { url: ASSETS.PIXI_TERRAIN_SPACE_MASTER, speed: 0.12, alpha: 1, loop: false, startOffsetRatio: 0.02 },
      { url: ASSETS.GAME_PARALLAX_STARS, speed: 0.2, alpha: 0.14, widthScale: 1.08, xDrift: 4, phase: 0.8 },
      { url: ASSETS.GAME_BG_STARS, speed: 0.09, alpha: 0.08, widthScale: 1.04, xDrift: 2, phase: 2.2 },
      { url: ASSETS.GAME_PARALLAX_BACK, speed: 0.025, alpha: 0.05, widthScale: 1.02, xDrift: 2, phase: 4.1 }
    ],
    horizonAlpha: 0,
    bigPlanetAlpha: 0,
    ringPlanetAlpha: 0,
    planetTint: '#d8f7ff',
    starSpeedMultiplier: 0.85,
    terrain: 'space',
    propAlpha: 0.72,
    propCount: 6,
    glyphAlpha: 0
  },
  'citation-storm': {
    tint: '#312e81',
    accent: '#c4b5fd',
    family: 1,
    colorGradeAlpha: 0.1,
    layers: [
      { url: ASSETS.PIXI_TERRAIN_SPACE_MASTER, speed: 0.18, alpha: 1, loop: false, startOffsetRatio: 0.34 },
      { url: ASSETS.GAME_PARALLAX_STARS, speed: 0.24, alpha: 0.22, widthScale: 1.08, xDrift: 7, phase: 1.8 },
      { url: ASSETS.GAME_BG_STARS, speed: 0.13, alpha: 0.12, widthScale: 1.06, xDrift: 4, phase: 3.1 },
      { url: ASSETS.GAME_PARALLAX_BACK, speed: 0.035, alpha: 0.08, widthScale: 1.04, xDrift: 4, phase: 4.7 }
    ],
    horizonAlpha: 0,
    bigPlanetAlpha: 0,
    ringPlanetAlpha: 0,
    planetTint: '#ddd6fe',
    starSpeedMultiplier: 1.12,
    terrain: 'space',
    propAlpha: 0.86,
    propCount: 9,
    glyphAlpha: 0
  },
  'paywall-siege': {
    tint: '#713f12',
    accent: '#facc15',
    family: 2,
    colorGradeAlpha: 0.095,
    layers: [
      { url: ASSETS.PIXI_TERRAIN_DESERT_MASTER, speed: 0.42, alpha: 1, loop: false, startOffsetRatio: 0.02 },
      { url: ASSETS.PIXI_DESERT_CLOUDS, speed: 0.18, alpha: 0.18, widthScale: 1.06, xDrift: 3, phase: 1.4 },
      { url: ASSETS.GAME_BG_STARS, speed: 0.08, alpha: 0.025, widthScale: 1.04, xDrift: 2, phase: 2.8 }
    ],
    horizonAlpha: 0,
    bigPlanetAlpha: 0,
    ringPlanetAlpha: 0,
    planetTint: '#fde68a',
    starSpeedMultiplier: 0.35,
    terrain: 'desert',
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
      { url: ASSETS.PIXI_TERRAIN_RIVER_MASTER, speed: 0.4, alpha: 1, loop: false, startOffsetRatio: 0.03 },
      { url: ASSETS.GAME_BG_STARS, speed: 0.06, alpha: 0.02, widthScale: 1.04, xDrift: 2, phase: 2.3 }
    ],
    horizonAlpha: 0,
    bigPlanetAlpha: 0,
    ringPlanetAlpha: 0,
    planetTint: '#bbf7d0',
    starSpeedMultiplier: 0.3,
    terrain: 'river',
    propAlpha: 0.94,
    propCount: 9,
    glyphAlpha: 0
  },
  'bastion-protocol': {
    tint: '#831843',
    accent: '#f9a8d4',
    family: 1,
    colorGradeAlpha: 0.075,
    layers: [
      { url: ASSETS.PIXI_TERRAIN_SPACE_MASTER, speed: 0.24, alpha: 1, loop: false, startOffsetRatio: 0.68 },
      { url: ASSETS.GAME_PARALLAX_STARS, speed: 0.3, alpha: 0.2, widthScale: 1.1, xDrift: 8, phase: 0.9 },
      { url: ASSETS.GAME_BG_STARS, speed: 0.16, alpha: 0.1, widthScale: 1.06, xDrift: 4, phase: 2.5 },
      { url: ASSETS.GAME_PARALLAX_BACK, speed: 0.045, alpha: 0.08, widthScale: 1.04, xDrift: 4, phase: 4.2 }
    ],
    horizonAlpha: 0,
    bigPlanetAlpha: 0,
    ringPlanetAlpha: 0,
    planetTint: '#fbcfe8',
    starSpeedMultiplier: 1.2,
    terrain: 'space',
    propAlpha: 0.9,
    propCount: 9,
    glyphAlpha: 0
  }
} as const satisfies Record<string, EnvironmentProfile>;

export class PixiEnvironment {
  private readonly parallaxLayers: ParallaxLayer[] = [];
  private readonly stars: StarPoint[] = [];
  private readonly glyphs: ScienceGlyph[] = [];
  private readonly terrainProps: TerrainProp[] = [];
  private readonly backgroundFill = new Graphics();
  private readonly sectorTint = new Graphics();
  private readonly terrainPropLayer = new Container();
  private readonly horizon = new Sprite(Texture.WHITE);
  private readonly bigPlanet = new Sprite(Texture.WHITE);
  private readonly ringPlanet = new Sprite(Texture.WHITE);
  private width = 1;
  private height = 1;
  private built = false;
  private activeBackgroundId = '';
  private profileStartedAtFrame = 0;

  constructor(
    private readonly backgroundLayer: Container,
    private readonly environmentLayer: Container,
    private readonly textures: PixiTextureBank
  ) {}

  async init(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (!this.built) this.build();
    this.resize(this.width, this.height);
    await this.textures.preload([
      ...Object.values(BACKGROUND_PROFILES).flatMap((profile) => profile.layers.map((layer) => layer.url)),
      ASSETS.GAME_BG_PLANET,
      ASSETS.GAME_PARALLAX_BIG_PLANET,
      ASSETS.GAME_PARALLAX_RING_PLANET,
      ...Object.values(TERRAIN_PROP_ATLASES)
    ]);
    this.buildTerrainProps();
    this.applyProfile(DEFAULT_BACKGROUND_ID, true);
  }

  private build() {
    this.built = true;
    this.backgroundLayer.addChild(this.backgroundFill);
    const defaultLayers: readonly ParallaxDefinition[] = BACKGROUND_PROFILES[DEFAULT_BACKGROUND_ID].layers;
    for (const definition of defaultLayers) {
      const root = new Container();
      root.eventMode = 'none';
      const first = new Sprite(Texture.WHITE);
      const second = new Sprite(Texture.WHITE);
      first.alpha = definition.alpha;
      second.alpha = definition.alpha;
      root.addChild(first, second);
      this.parallaxLayers.push({
        root,
        sprites: [first, second],
        speed: definition.speed,
        alpha: definition.alpha,
        textureKey: definition.url,
        tileHeight: this.height,
        widthScale: definition.widthScale ?? 1,
        xDrift: definition.xDrift ?? 0,
        phase: definition.phase ?? 0,
        loop: definition.loop ?? true,
        startOffsetRatio: definition.startOffsetRatio ?? 0
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
    this.environmentLayer.addChild(this.horizon, this.bigPlanet, this.ringPlanet, this.terrainPropLayer);
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
  }

  private buildTerrainProps() {
    if (this.terrainProps.length > 0) return;
    for (const terrain of Object.keys(TERRAIN_PROP_ATLASES) as TerrainFamily[]) {
      const sheet = this.textures.get(TERRAIN_PROP_ATLASES[terrain]);
      if (!sheet) continue;

      const propTextures = Array.from({ length: 9 }, (_, index) => new Texture({
        source: sheet.source,
        frame: new Rectangle(
          (index % 3) * TERRAIN_PROP_CELL_SIZE,
          Math.floor(index / 3) * TERRAIN_PROP_CELL_SIZE,
          TERRAIN_PROP_CELL_SIZE,
          TERRAIN_PROP_CELL_SIZE
        ),
        label: `${terrain}-terrain-prop-${index}`
      }));
      TERRAIN_PROP_LAYOUTS[terrain].forEach((definition, slot) => {
        const sprite = new Sprite(propTextures[definition.frame]);
        sprite.anchor.set(0.5);
        sprite.eventMode = 'none';
        sprite.visible = false;
        this.terrainProps.push({ sprite, terrain, slot, ...definition });
        this.terrainPropLayer.addChild(sprite);
      });
    }
    this.layoutTerrainProps();
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

  private applyProfile(backgroundId: string, force = false) {
    const resolvedId = backgroundId in BACKGROUND_PROFILES ? backgroundId : DEFAULT_BACKGROUND_ID;
    const profile = BACKGROUND_PROFILES[resolvedId as keyof typeof BACKGROUND_PROFILES];
    if (!force && this.activeBackgroundId === resolvedId) return profile;

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
      layer.root.visible = true;
      for (const sprite of layer.sprites) {
        if (texture) sprite.texture = texture;
        sprite.visible = Boolean(texture);
        sprite.alpha = definition.alpha;
      }
      this.layoutParallaxLayer(layer);
    }

    const horizon = this.textures.get(ASSETS.GAME_BG_PLANET);
    const bigPlanet = this.textures.get(ASSETS.GAME_PARALLAX_BIG_PLANET);
    const ringPlanet = this.textures.get(ASSETS.GAME_PARALLAX_RING_PLANET);
    if (horizon) this.horizon.texture = horizon;
    if (bigPlanet) this.bigPlanet.texture = bigPlanet;
    if (ringPlanet) this.ringPlanet.texture = ringPlanet;
    this.horizon.visible = profile.horizonAlpha > 0;
    this.bigPlanet.visible = profile.bigPlanetAlpha > 0;
    this.ringPlanet.visible = profile.ringPlanetAlpha > 0;
    this.horizon.tint = profile.planetTint;
    this.bigPlanet.tint = profile.planetTint;
    this.ringPlanet.tint = profile.planetTint;
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
    this.horizon.position.set(this.width / 2, this.height + Math.max(80, this.height * 0.15));
    this.horizon.width = this.width;
    this.horizon.height = Math.max(240, this.height * 0.34);
    this.horizon.alpha = 0.52;

    this.bigPlanet.anchor.set(0.5);
    this.bigPlanet.width = this.width < 620 ? 150 : 210;
    this.bigPlanet.height = this.bigPlanet.width;
    this.bigPlanet.position.set(this.width - this.bigPlanet.width * 0.5, 130);
    this.bigPlanet.alpha = 0.52;

    this.ringPlanet.anchor.set(0.5);
    this.ringPlanet.width = this.width < 620 ? 72 : 110;
    this.ringPlanet.height = this.ringPlanet.width * 1.8;
    this.ringPlanet.alpha = 0.62;

    for (const layer of this.parallaxLayers) this.layoutParallaxLayer(layer);
    this.layoutTerrainProps();
  }

  private layoutParallaxLayer(layer: ParallaxLayer) {
    const texture = this.textures.get(layer.textureKey);
    const sourceWidth = Math.max(1, texture?.width || this.width);
    const sourceHeight = Math.max(1, texture?.height || this.height);
    layer.tileHeight = Math.max(this.height * 0.52, this.width * (sourceHeight / sourceWidth));
    for (const sprite of layer.sprites) {
      sprite.width = this.width * layer.widthScale;
      sprite.height = layer.tileHeight + 2;
      sprite.alpha = layer.alpha;
    }
  }

  private layoutTerrainProps() {
    for (const prop of this.terrainProps) {
      const width = Math.max(18, this.width * prop.widthRatio);
      const aspect = Math.max(0.25, prop.sprite.texture.height / Math.max(1, prop.sprite.texture.width));
      prop.sprite.width = width;
      prop.sprite.height = width * aspect;
    }
  }

  update(engine: GameEngine) {
    const backgroundId = engine.getCurrentWaveDefinition()?.backgroundId ?? engine.getCurrentLevelDefinition()?.backgroundId ?? 'open-orbit';
    const resolvedBackgroundId = backgroundId in BACKGROUND_PROFILES ? backgroundId : DEFAULT_BACKGROUND_ID;
    if (this.activeBackgroundId !== resolvedBackgroundId) this.profileStartedAtFrame = engine.frameCount;
    const profile = this.applyProfile(backgroundId);
    const localFrame = Math.max(0, engine.frameCount - this.profileStartedAtFrame);

    for (let index = 0; index < this.parallaxLayers.length; index++) {
      const layer = this.parallaxLayers[index];
      if (!layer.root.visible) continue;
      const maxTravel = Math.max(0, layer.tileHeight - this.height);
      const startingOffset = maxTravel * layer.startOffsetRatio;
      const offset = layer.loop
        ? -((localFrame * layer.speed + startingOffset) % layer.tileHeight)
        : -Math.min(maxTravel, startingOffset + localFrame * layer.speed);
      const spriteX = (this.width - layer.sprites[0].width) / 2;
      layer.root.x = Math.sin(localFrame * 0.0016 + layer.phase) * layer.xDrift;
      layer.sprites[0].visible = true;
      layer.sprites[0].position.set(spriteX, offset);
      layer.sprites[1].visible = layer.loop;
      if (layer.loop) layer.sprites[1].position.set(spriteX, offset + layer.tileHeight);
    }

    for (let index = 0; index < this.stars.length; index++) {
      const star = this.stars[index];
      star.sprite.visible = true;
      star.sprite.x = star.baseX * this.width;
      star.sprite.y = ((star.baseY * this.height) + engine.frameCount * star.speed * profile.starSpeedMultiplier) % this.height;
      star.sprite.alpha = Math.max(0.12, Math.min(0.82, star.baseAlpha + Math.sin(engine.frameCount * 0.012 + star.phase) * 0.08));
    }

    const propCycle = this.height + 320;
    for (const prop of this.terrainProps) {
      const visible = prop.terrain === profile.terrain && prop.slot < profile.propCount;
      prop.sprite.visible = visible;
      if (!visible) continue;
      prop.sprite.x = prop.baseX * this.width + Math.sin(localFrame * 0.0028 + prop.phase) * prop.sway;
      prop.sprite.y = ((prop.baseY * propCycle) + localFrame * prop.speed) % propCycle - 160;
      prop.sprite.rotation = localFrame * prop.rotationSpeed;
      prop.sprite.alpha = prop.alpha;
    }

    this.sectorTint.tint = profile.tint;
    this.sectorTint.alpha = profile.colorGradeAlpha;
    this.horizon.alpha = profile.horizonAlpha;
    this.bigPlanet.alpha = profile.bigPlanetAlpha;
    this.ringPlanet.alpha = profile.ringPlanetAlpha;
    this.bigPlanet.position.set(
      this.width - this.bigPlanet.width * 0.5 + Math.sin(engine.frameCount * 0.0012) * 4,
      130 + Math.sin(engine.frameCount * 0.0018) * 4
    );
    const ringTravel = this.width + this.ringPlanet.width * 2 + 160;
    const ringOffset = (engine.frameCount * RING_PLANET_SPEED + ringTravel * 0.32) % ringTravel;
    this.ringPlanet.position.set(
      this.width + this.ringPlanet.width * 0.8 - ringOffset,
      Math.max(150, this.height * 0.22) + Math.sin(engine.frameCount * 0.0015) * 5
    );

    for (let index = 0; index < this.glyphs.length; index++) {
      const glyph = this.glyphs[index];
      const visibleForSector = profile.glyphAlpha > 0 && (glyph.family === profile.family || index % 7 === 0);
      glyph.graphic.visible = visibleForSector;
      glyph.graphic.x = glyph.baseX * this.width + Math.sin(engine.frameCount * 0.0025 + glyph.phase) * 12;
      glyph.graphic.y = ((glyph.baseY * this.height) + engine.frameCount * glyph.speed) % (this.height + 60) - 30;
      glyph.graphic.rotation = Math.sin(engine.frameCount * 0.0018 + glyph.phase) * 0.12;
      glyph.graphic.alpha = profile.glyphAlpha + Math.sin(engine.frameCount * 0.005 + glyph.phase) * 0.01;
      glyph.graphic.tint = profile.accent;
    }
  }

  destroy() {
    this.parallaxLayers.length = 0;
    this.stars.length = 0;
    this.glyphs.length = 0;
    this.terrainProps.length = 0;
    this.activeBackgroundId = '';
    this.profileStartedAtFrame = 0;
  }
}
