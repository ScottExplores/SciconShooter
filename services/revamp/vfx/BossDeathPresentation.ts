import { Container, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import type { GameEngine } from '../../gameLogic';
import type { ArcadeEffectPool } from '../../pixi/ArcadeEffectPool';
import { getFeelSettings } from '../feel/FeelSettings';
import type { RenderQualityBudget } from '../performance/AdaptiveRenderQuality';
import { getRenderQualityMode } from '../performance/RenderQualitySettings';
import { BossShockwave, BOSS_SHOCKWAVE_DURATION_MS } from './BossShockwave';
import { finishBossDeath } from './BossCompletionGate';
import { BOSS_DEATH_FINALE_MS, MINI_DEATH_FINALE_MS, MAX_BOSS_DEATHS,
  bossDeathPose, bossDeathTimeline, consumeBossDeathSequences, deathBurstDue,
  type BossDeathRequest, type DeathBurst } from './BossDeathSequence';

type HullView = { root: Container; aura: Container; trail: Container; flash: Container;
  health: Container; label: Container; hitFlash?: Container; bossRig?: { componentHealth: Container } };
type Fragment = { sprite: Sprite; x: number; y: number; vx: number; vy: number; spin: number };
type Death = { request: BossDeathRequest; age: number; tailMs: number; timeline: readonly DeathBurst[];
  root: Container; hull: Sprite | null; texture: Texture | null; pieces: Fragment[] };

/** One retained art snapshot per death, max four; all fire/smoke uses ArcadeEffectPool. */
export class BossDeathPresentation {
  private readonly root = new Container({ label: 'revamp-boss-deaths', eventMode: 'none' });
  private readonly flash = new Sprite(Texture.WHITE);
  private readonly deaths: Death[] = [];
  private readonly handled = new Set<string>();
  private readonly shockwave: BossShockwave;
  private source: GameEngine | null = null;
  private generation = -1;
  private renderer: Renderer | null = null;
  private readonly contextListener = { contextChange: () => this.clearVisuals() };
  private shakeX = 0;
  private shakeY = 0;

  constructor(private readonly pool: ArcadeEffectPool, hullLayer: Container, overlay: Container,
    background: Container, private readonly getRenderer: () => Renderer) {
    hullLayer.addChild(this.root);
    this.flash.visible = false;
    this.flash.eventMode = 'none';
    overlay.addChild(this.flash);
    this.shockwave = new BossShockwave(background, getRenderer);
  }

  hasHandled(id?: string) { return Boolean(id && this.handled.has(id)); }
  get cameraOffset() { return { x: this.shakeX, y: this.shakeY }; }

  /** Before syncEntities retires the killed view, preserve its exact last rendered pose. */
  sync(engine: GameEngine, deltaMs: number, quality: RenderQualityBudget,
    viewFor: (id: string) => HullView | undefined) {
    if (this.source !== engine || this.generation !== engine.feel.resetGeneration) {
      this.clearVisuals();
      this.handled.clear();
      this.source = engine;
      this.generation = engine.feel.resetGeneration;
    }
    if (!this.renderer) {
      this.renderer = this.getRenderer();
      this.renderer.runners?.contextChange?.add(this.contextListener);
    }
    const settings = getFeelSettings();
    this.shakeX = this.shakeY = 0;
    this.flash.visible = false;
    this.flash.alpha = 0;
    this.shockwave.disable();
    for (const request of consumeBossDeathSequences(engine)) {
      if (engine.frameCount - request.frame > 180 || this.hasHandled(request.id)) continue;
      if (this.deaths.length >= MAX_BOSS_DEATHS) this.release(this.deaths.shift()!);
      // A bounded history prevents a late common kill receipt replaying a bespoke death.
      if (this.handled.size >= 64) this.handled.delete(this.handled.values().next().value!);
      this.handled.add(request.id);
      this.deaths.push(this.capture(request, viewFor(request.id), quality.particleScale));
    }
    const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    for (let index = this.deaths.length - 1; index >= 0; index--) {
      const death = this.deaths[index];
      const previous = death.age;
      death.age += delta;
      // REVAMP(T): Match ArcadeEffectPool's capped clock, including slow frames.
      death.tailMs = Math.max(0, death.tailMs - Math.min(50, delta));
      const { request } = death;
      const pose = bossDeathPose(death.age, request.mini, settings.reducedMotion, settings.reduceScreenShake);
      for (const burst of death.timeline) {
        if (deathBurstDue(burst, previous, death.age, quality.particleScale)) {
          const tail = this.pool.spawnPixelExplosion(burst.x, burst.y, burst.size, burst.tier, burst.seed);
          death.tailMs = Math.max(death.tailMs, tail || 0);
        }
      }
      if (death.hull) death.hull.visible = pose.hullVisible;
      death.root.position.set(Math.round(request.x), Math.round(request.y));
      // The established pause-menu toggle remains authoritative for camera motion.
      if (engine.polishSettings.screenShake) {
        this.shakeX += pose.shakeX;
        this.shakeY += pose.shakeY;
      }
      for (const piece of death.pieces) {
        const t = pose.fragmentSeconds;
        piece.sprite.visible = !pose.hullVisible;
        piece.sprite.alpha = pose.fragmentAlpha;
        const motion = settings.reducedMotion ? 0.12 : 1;
        piece.sprite.position.set(Math.round(piece.x + piece.vx * t * motion),
          Math.round(piece.y + (piece.vy * t + 85 * t * t) * motion));
        piece.sprite.rotation = settings.reducedMotion ? 0 : piece.spin * t;
      }
      if (pose.flash > 0 && delta <= 250) {
        this.flash.visible = true;
        this.flash.alpha = Math.max(this.flash.alpha, pose.flash);
        this.flash.width = engine.width;
        this.flash.height = engine.height;
      }
      const finale = request.mini ? MINI_DEATH_FINALE_MS : BOSS_DEATH_FINALE_MS;
      const camera = engine.getEncounterCameraTransform();
      const shockAge = death.age - finale;
      if (shockAge >= 0 && shockAge < BOSS_SHOCKWAVE_DURATION_MS) {
        this.shockwave.update(request.x * camera.scale + camera.offsetX, request.y * camera.scale + camera.offsetY,
          shockAge, engine.width, engine.height, getRenderQualityMode() === 'high'
          && quality.tier === 'high' && !settings.reducedMotion && !settings.reduceScreenShake);
      }
      if (pose.complete && death.tailMs <= 0) {
        finishBossDeath(engine, request); // REVAMP(T): Hull AND final explosion have finished.
        this.release(death);
        this.deaths.splice(index, 1);
      }
    }
    // Paired mini-boss deaths cannot multiply the camera excursion.
    this.shakeX = Math.max(-3, Math.min(3, this.shakeX));
    this.shakeY = Math.max(-2, Math.min(2, this.shakeY));
  }

  private capture(request: BossDeathRequest, view: HullView | undefined, density: number): Death {
    const root = new Container({ eventMode: 'none' });
    this.root.addChild(root);
    const death: Death = { request, root, age: -0.001, tailMs: 0, timeline: bossDeathTimeline(request), hull: null, texture: null, pieces: [] };
    if (!view) return death; // An unseen/culled death still has a bounded explosion sequence.
    const decorations = [view.aura, view.trail, view.flash, view.health, view.label, view.hitFlash, view.bossRig?.componentHealth]
      .filter((item): item is Container => Boolean(item));
    const visibility = decorations.map(item => item.visible);
    const wasVisible = view.root.visible;
    try {
      decorations.forEach(item => { item.visible = false; });
      view.root.visible = true;
      const bounds = view.root.getLocalBounds();
      // Explicit bounded crop prevents far-reaching attack decorations allocating huge targets.
      const extent = Math.min(384, Math.max(request.width, request.height) * 0.75 + 8);
      const left = Math.floor(Math.max(-extent, bounds.minX));
      const top = Math.floor(Math.max(-extent, bounds.minY));
      const right = Math.ceil(Math.min(extent, bounds.maxX));
      const bottom = Math.ceil(Math.min(extent, bounds.maxY));
      if (right <= left || bottom <= top) return death;
      const frame = new Rectangle(left, top, right - left, bottom - top);
      const texture = death.texture = this.getRenderer().generateTexture({ target: view.root,
        frame, resolution: 1, antialias: false, textureSourceOptions: { scaleMode: 'nearest', autoGenerateMipmaps: false } });
      const hull = death.hull = new Sprite(texture);
      root.rotation = view.root.rotation;
      root.scale.copyFrom(view.root.scale);
      hull.position.set(left, top);
      hull.roundPixels = true;
      root.addChild(hull);
      // Three pieces on Low, six on High. Views share one snapshot texture source.
      const rows = density < 0.7 ? 1 : 2;
      for (let row = 0; row < rows; row++) for (let col = 0; col < 3; col++) {
        const x = Math.floor(col * frame.width / 3), y = Math.floor(row * frame.height / rows);
        const width = Math.floor((col + 1) * frame.width / 3) - x;
        const height = Math.floor((row + 1) * frame.height / rows) - y;
        const slice = new Texture({ source: texture.source, frame: new Rectangle(x, y, width, height) });
        const sprite = new Sprite(slice);
        sprite.anchor.set(0.5);
        sprite.roundPixels = true;
        sprite.visible = false;
        root.addChild(sprite);
        death.pieces.push({ sprite, x: left + x + width / 2, y: top + y + height / 2,
          vx: (col - 1) * 90 + (row ? 12 : -12), vy: row ? 4 : -82,
          spin: (col % 2 ? -1 : 1) * (0.65 + row * 0.3) });
      }
    } catch {
      // Context loss during the one-shot copy must not interrupt combat or rewards.
      for (const piece of death.pieces) { piece.sprite.texture.destroy(false); piece.sprite.destroy(); }
      death.pieces.length = 0;
      death.hull?.destroy();
      death.hull = null;
      death.texture?.destroy(true);
      death.texture = null;
    } finally {
      decorations.forEach((item, index) => { item.visible = visibility[index]; });
      view.root.visible = wasVisible;
    }
    return death;
  }

  private release(death: Death) {
    for (const piece of death.pieces) piece.sprite.texture.destroy(false);
    death.root.destroy({ children: true });
    death.texture?.destroy(true);
  }

  private clearVisuals() {
    for (const death of this.deaths) this.release(death);
    this.deaths.length = 0;
    this.flash.visible = false;
    this.shakeX = this.shakeY = 0;
    this.shockwave.disable();
  }

  destroy() {
    this.clearVisuals();
    this.handled.clear();
    this.renderer?.runners?.contextChange?.remove(this.contextListener);
    this.shockwave.destroy();
    this.root.destroy({ children: true });
    this.flash.destroy();
    this.source = null;
  }
}
