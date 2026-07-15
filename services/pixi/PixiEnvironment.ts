import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ASSETS } from '../../constants';
import { GameEngine } from '../gameLogic';
import { PixiTextureBank } from './PixiTextureBank';

type ParallaxLayer = {
  root: Container;
  sprites: [Sprite, Sprite];
  speed: number;
  alpha: number;
  textureKey: string;
};

type StarPoint = {
  sprite: Sprite;
  speed: number;
  phase: number;
  baseX: number;
  baseY: number;
};

type ScienceGlyph = {
  graphic: Graphics;
  baseX: number;
  baseY: number;
  speed: number;
  phase: number;
  family: number;
};

const BACKGROUND_LAYERS = [
  { url: ASSETS.GAME_PARALLAX_BACK, speed: 0.08, alpha: 0.72 },
  { url: ASSETS.GAME_PARALLAX_STARS, speed: 0.18, alpha: 0.46 },
  { url: ASSETS.GAME_BG_BACK, speed: 0.3, alpha: 0.28 },
  { url: ASSETS.GAME_BG_STARS, speed: 0.48, alpha: 0.55 }
] as const;

const IDENTITIES = {
  'open-orbit': { tint: '#082f49', accent: '#67e8f9', family: 0 },
  'citation-storm': { tint: '#312e81', accent: '#c4b5fd', family: 1 },
  'paywall-siege': { tint: '#713f12', accent: '#facc15', family: 2 },
  'open-galaxy': { tint: '#064e3b', accent: '#6ee7b7', family: 3 }
} as const;

export class PixiEnvironment {
  private readonly parallaxLayers: ParallaxLayer[] = [];
  private readonly stars: StarPoint[] = [];
  private readonly glyphs: ScienceGlyph[] = [];
  private readonly backgroundFill = new Graphics();
  private readonly sectorTint = new Graphics();
  private readonly horizon = new Sprite(Texture.WHITE);
  private readonly bigPlanet = new Sprite(Texture.WHITE);
  private readonly ringPlanet = new Sprite(Texture.WHITE);
  private width = 1;
  private height = 1;
  private built = false;

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
      ...BACKGROUND_LAYERS.map((layer) => layer.url),
      ASSETS.GAME_BG_PLANET,
      ASSETS.GAME_PARALLAX_BIG_PLANET,
      ASSETS.GAME_PARALLAX_RING_PLANET
    ]);
    this.applyTextures();
  }

  private build() {
    this.built = true;
    this.backgroundLayer.addChild(this.backgroundFill);
    for (const definition of BACKGROUND_LAYERS) {
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
        textureKey: definition.url
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
      this.stars.push({ sprite, speed: 0.2 + depth * 1.35, phase: Math.random() * Math.PI * 2, baseX, baseY });
      this.backgroundLayer.addChild(sprite);
    }

    this.environmentLayer.addChild(this.horizon, this.bigPlanet, this.ringPlanet);
    for (let index = 0; index < 18; index++) {
      const graphic = new Graphics();
      graphic.eventMode = 'none';
      const family = index % 4;
      this.drawGlyph(graphic, family, '#67e8f9');
      this.glyphs.push({
        graphic,
        baseX: Math.random(),
        baseY: Math.random(),
        speed: 0.08 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        family
      });
      this.environmentLayer.addChild(graphic);
    }
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

  private applyTextures() {
    for (const layer of this.parallaxLayers) {
      const texture = this.textures.get(layer.textureKey);
      if (!texture) continue;
      layer.sprites[0].texture = texture;
      layer.sprites[1].texture = texture;
    }
    const horizon = this.textures.get(ASSETS.GAME_BG_PLANET);
    const bigPlanet = this.textures.get(ASSETS.GAME_PARALLAX_BIG_PLANET);
    const ringPlanet = this.textures.get(ASSETS.GAME_PARALLAX_RING_PLANET);
    if (horizon) this.horizon.texture = horizon;
    if (bigPlanet) this.bigPlanet.texture = bigPlanet;
    if (ringPlanet) this.ringPlanet.texture = ringPlanet;
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

    for (const layer of this.parallaxLayers) {
      for (const sprite of layer.sprites) {
        sprite.width = this.width;
        sprite.height = this.height + 4;
        sprite.alpha = layer.alpha;
      }
    }
  }

  update(engine: GameEngine) {
    const lowQuality = engine.performanceMode;
    const backgroundId = engine.getCurrentWaveDefinition()?.backgroundId ?? engine.getCurrentLevelDefinition()?.backgroundId ?? 'open-orbit';
    const identity = IDENTITIES[backgroundId as keyof typeof IDENTITIES] ?? IDENTITIES['open-orbit'];

    for (let index = 0; index < this.parallaxLayers.length; index++) {
      const layer = this.parallaxLayers[index];
      const offset = -((engine.frameCount * layer.speed) % this.height);
      layer.root.visible = !(lowQuality && (index === 1 || index === 2));
      layer.sprites[0].position.set(0, offset);
      layer.sprites[1].position.set(0, offset + this.height);
    }

    for (let index = 0; index < this.stars.length; index++) {
      const star = this.stars[index];
      star.sprite.visible = !lowQuality || index % 2 === 0;
      star.sprite.x = star.baseX * this.width;
      star.sprite.y = ((star.baseY * this.height) + engine.frameCount * star.speed) % this.height;
      star.sprite.alpha = Math.max(0.08, Math.min(0.78, 0.28 + Math.sin(engine.frameCount * 0.025 + star.phase) * 0.22));
    }

    this.sectorTint.tint = identity.tint;
    this.sectorTint.alpha = lowQuality ? 0.075 : 0.115;
    this.bigPlanet.y = 125 + Math.sin(engine.frameCount * 0.008) * 12;
    this.ringPlanet.position.set(
      this.width + 80 - ((engine.frameCount * 0.16) % (this.width + 180)),
      190 + Math.sin(engine.frameCount * 0.012) * 18
    );
    this.horizon.alpha = lowQuality ? 0.34 : 0.52;

    for (let index = 0; index < this.glyphs.length; index++) {
      const glyph = this.glyphs[index];
      const visibleForSector = glyph.family === identity.family || index % 7 === 0;
      glyph.graphic.visible = !lowQuality && visibleForSector;
      glyph.graphic.x = glyph.baseX * this.width + Math.sin(engine.frameCount * 0.006 + glyph.phase) * 22;
      glyph.graphic.y = ((glyph.baseY * this.height) + engine.frameCount * glyph.speed) % (this.height + 60) - 30;
      glyph.graphic.rotation = Math.sin(engine.frameCount * 0.004 + glyph.phase) * 0.18;
      glyph.graphic.alpha = 0.12 + Math.sin(engine.frameCount * 0.01 + glyph.phase) * 0.035;
      glyph.graphic.tint = identity.accent;
    }
  }

  destroy() {
    this.parallaxLayers.length = 0;
    this.stars.length = 0;
    this.glyphs.length = 0;
  }
}
