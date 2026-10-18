import { Container, Sprite, Texture, type Renderer } from 'pixi.js';
import type { GameEngine } from '../../gameLogic';
import { getFeelSettings } from '../feel/FeelSettings';
import { createBackgroundQuad } from '../performance/BackgroundQuad';
import { tagLargeSprite } from '../performance/SelectedSpriteBatcher';
import { BackdropTextures } from './BackdropTextures';
import { createMissionBackdropLayout, type MissionBackdropLayout } from './layout';
import { createBackdropRandom, resolveMissionBackdrop, type MissionBackdropSelection } from './themes';
import { bakeCapitalShip, bakeDebris, bakeNebula, bakePlanet, bakeSignature, mixColor } from './pixelArt';
import { backdropDetailBudget, sampleBackdropEvent, warpEnvelope, type SET_PIECE_DURATION } from './timeline';

type PositionedSprite = { sprite: Sprite; x: number; y: number; scale: number; rotation: number; speed: number };
type Star = { sprite: Sprite; x: number; y: number; depth: number; phase: number };
type BackdropWindow = Window & { __sciconBackgroundQA?: { snapshot: () => ReturnType<SectorBackdrop['snapshot']> } };

/**
 * Six retained planes: baked nebula, far stars, landmarks, mid stars/fleet,
 * debris/near stars, and set pieces. Everything stays behind the action layer.
 * All motion follows engine frames; this presenter never writes to the engine.
 */
export class SectorBackdrop {
  private readonly root = new Container({ label: 'sector-backdrop', eventMode: 'none' });
  private readonly planes = Array.from({ length: 6 }, (_, index) => new Container({ label: `backdrop-depth-${index}`, eventMode: 'none' }));
  private textures: BackdropTextures | null = null;
  private selection: MissionBackdropSelection | null = null;
  private layout: MissionBackdropLayout | null = null;
  private levelId = '';
  private campaign: GameEngine['campaign'] | null = null;
  private stars: Star[] = [];
  private landmarks: PositionedSprite[] = [];
  private debris: PositionedSprite[] = [];
  private nebula: ReturnType<typeof createBackgroundQuad>[] = [];
  private battle: Sprite[] = [];
  private battleBeams: Sprite[] = [];
  private battleFlashes: Sprite[] = [];
  private flyby: Sprite | null = null;
  private gate: Sprite[] = [];
  private shower: Sprite[] = [];
  private seconds = 0;
  private motion = 0;
  private lastFrame = -1;
  private waveKey = '';
  private warpStarted = -10;
  private wasBoss = false;
  private bossGrade = 0;
  private warp = 0;
  private detailScale = 1;
  private reducedMotion = false;
  private activeEvent: keyof typeof SET_PIECE_DURATION | null = null;
  private eventProgress = 0;
  private width = 390;
  private height = 844;
  private destroyed = false;
  private readonly qaBridge = { snapshot: () => this.snapshot() };

  constructor(private readonly parent: Container, private readonly renderer: () => Renderer) {
    this.root.addChild(...this.planes);
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') {
      (window as BackdropWindow).__sciconBackgroundQA = this.qaBridge;
    }
  }

  update(engine: GameEngine, detailScale: number): boolean {
    if (this.destroyed) return false;
    const levelId = engine.getCurrentLevelDefinition()?.id ?? '';
    const restarted = engine.frameCount < this.lastFrame;
    if (this.levelId !== levelId || this.campaign !== engine.campaign || restarted) {
      this.levelId = levelId; this.campaign = engine.campaign;
      this.select(resolveMissionBackdrop(engine.campaign, levelId));
    }
    this.lastFrame = this.lastFrame < 0 ? engine.frameCount : this.lastFrame;
    if (!this.selection || !this.layout) { this.root.visible = false; this.lastFrame = engine.frameCount; return false; }
    this.root.visible = true;
    this.width = engine.width; this.height = engine.height;
    const dt = Math.max(0, Math.min(4, engine.frameCount - this.lastFrame)) / 60;
    this.lastFrame = engine.frameCount;
    this.seconds += dt;
    this.detailScale = detailScale;
    this.reducedMotion = getFeelSettings().reducedMotion;
    const runtime = engine.getRuntimeState();
    const waveKey = `${runtime.waveId}:${runtime.wavePresentationRevision}`;
    const bossActive = runtime.majorBossActive || runtime.bossActive;
    if (this.waveKey !== waveKey || (bossActive && !this.wasBoss)) this.warpStarted = this.seconds;
    this.waveKey = waveKey; this.wasBoss = bossActive;
    this.bossGrade += ((bossActive ? 1 : 0) - this.bossGrade) * Math.min(1, dt * .7);
    this.warp = this.reducedMotion ? 0 : Math.max(warpEnvelope(this.seconds - this.warpStarted, false), runtime.stageHyperspeedStrength || 0);
    this.motion += dt * (this.reducedMotion ? .12 : 1 + this.warp * 4);
    this.present();
    return true;
  }

  private select(selection: MissionBackdropSelection | null) {
    this.clearScene(); this.selection = selection;
    this.seconds = this.motion = this.bossGrade = 0; this.lastFrame = -1;
    this.waveKey = ''; this.wasBoss = false; this.activeEvent = null; this.eventProgress = this.warp = 0;
    if (!selection) return;
    this.parent.addChild(this.root); // Legacy initialization may have appended its planes later.
    const layout = this.layout = createMissionBackdropLayout(selection), theme = selection.theme;
    const bank = this.textures = new BackdropTextures(this.renderer());
    // REVAMP(L): This opaque, unbatched plane needs neither an atlas copy nor blending.
    const cloud = bank.add('nebula', bakeNebula(theme, layout.nebulae[0].seed), { atlas: false });
    for (let i = 0; i < 2; i++) {
      const mesh = createBackgroundQuad(); mesh.texture = cloud;
      mesh.blendMode = 'none';
      this.planes[0].addChild(mesh); this.nebula.push(mesh);
    }
    for (const planet of layout.planets) {
      const sprite = this.sprite(bank.add(`planet-${planet.kind}`, bakePlanet(theme, planet.kind, planet.seed)), 2);
      this.landmarks.push({ sprite, x: planet.x, y: planet.y, scale: planet.scale * 1.55, rotation: 0, speed: 1.1 });
    }
    layout.signatures.forEach((placement, i) => {
      const sprite = this.sprite(bank.add(`signature-${i}`, bakeSignature(theme, placement.kind, placement.seed)), 2);
      this.landmarks.push({ sprite, ...placement, scale: placement.scale * 1.2, speed: 2 + i * .8 });
    });
    const random = createBackdropRandom(selection.seed ^ 0x53544152);
    for (let i = 0; i < 54; i++) {
      const depth = i % 3, sprite = this.sprite(Texture.WHITE, [1, 3, 4][depth]);
      sprite.tint = mixColor(theme.palette.detail, 0x8296a8, .3);
      this.stars.push({ sprite, x: random(), y: random(), depth, phase: random() * 6.28 });
    }
    const rocks = [0, 1, 2].map(i => bank.add(`debris-${i}`, bakeDebris(theme, selection.seed + i)));
    layout.debris.forEach((placement, i) => {
      const sprite = this.sprite(rocks[i % 3], 4);
      this.debris.push({ sprite, ...placement });
    });
    const capital = bank.add('capital', bakeCapitalShip(theme, selection.seed));
    this.flyby = this.sprite(capital, 5);
    for (let i = 0; i < 4; i++) { const ship = this.sprite(capital, 3); ship.scale.set(.065 + i % 2 * .02); this.battle.push(ship); }
    for (let i = 0; i < 2; i++) { const beam = this.sprite(Texture.WHITE, 3); beam.tint = theme.palette.accent; this.battleBeams.push(beam); }
    for (let i = 0; i < 2; i++) { const flash = this.sprite(Texture.WHITE, 3); flash.tint = theme.palette.detail; this.battleFlashes.push(flash); }
    const gateTexture = bank.add('transit-station', bakeSignature(theme, 'rails', selection.seed ^ 0x47415445));
    for (let i = 0; i < 2; i++) this.gate.push(this.sprite(gateTexture, 5));
    for (let i = 0; i < 12; i++) this.shower.push(this.sprite(rocks[i % 3], 5));
  }

  private sprite(texture: Texture, plane: number) {
    const sprite = new Sprite({ texture, anchor: .5, eventMode: 'none', roundPixels: true });
    // Reuse J's one-sampler path for broad atlas silhouettes; tiny stars/debris
    // remain in the actor batch. This avoids eight texture fetches per far pixel.
    if ((plane === 2 || plane === 5) && texture.width > 64) tagLargeSprite(sprite);
    this.planes[plane].addChild(sprite); return sprite;
  }

  private present() {
    const { width: w, height: h, motion: t, seconds, layout, selection } = this;
    if (!selection || !layout) return;
    const budget = backdropDetailBudget(this.detailScale), reduced = this.reducedMotion;
    const grade = mixColor(0xffffff, mixColor(selection.theme.palette.boss, 0xffffff, .45), this.bossGrade * .6);
    // Full-plane single-sampler quads avoid the actor shader's mobile fill cost.
    const drift = (t * 1.5) % h;
    for (let i = 0; i < this.nebula.length; i++) {
      const mesh = this.nebula[i]; mesh.width = w + 12; mesh.height = h + 1;
      mesh.x = -6 + (reduced ? 0 : Math.sin(t * .035) * 4); mesh.y = drift + (i - 1) * h;
      const breathing = reduced ? 0 : .025 + Math.sin(t * .045) * .025;
      mesh.tint = mixColor(grade, selection.theme.palette.accent, breathing);
    }
    this.landmarks.forEach((item, i) => {
      // Always retain the defining sector silhouette, including Low quality.
      item.sprite.visible = budget.secondary || i < (layout.planets.length + 1);
      const travel = (item.y * (h + 320) + t * item.speed) % (h + 320) - 120;
      item.sprite.position.set(Math.round(item.x * w), Math.round(travel));
      item.sprite.scale.set(item.scale * w / 390);
      item.sprite.rotation = item.rotation; item.sprite.alpha = .61;
      item.sprite.tint = grade;
    });
    this.stars.forEach((star, i) => {
      const sprite = star.sprite; sprite.visible = i < budget.stars;
      if (!sprite.visible) return;
      const edge = star.x < .16 || star.x > .84;
      const streak = edge && !reduced ? this.warp * (18 + star.depth * 17) : 0;
      sprite.position.set(Math.round(star.x * w), Math.round((star.y * h + t * (3 + star.depth * 6)) % h));
      sprite.width = star.depth === 2 ? 2 : 1;
      sprite.height = (star.depth === 2 ? 2 : 1) + streak;
      sprite.alpha = .3 + star.depth * .08 + (reduced ? 0 : Math.sin(t * .6 + star.phase) * .025);
    });
    this.debris.forEach((item, i) => {
      item.sprite.visible = i < budget.debris;
      if (!item.sprite.visible) return;
      item.sprite.position.set(Math.round(item.x * w + (reduced ? 0 : Math.sin(t * .08 + i) * 3)), Math.round((item.y * (h + 60) + t * (5 + item.speed * 7)) % (h + 60) - 30));
      item.sprite.scale.set(item.scale); item.sprite.rotation = item.rotation + (reduced ? 0 : t * .012); item.sprite.alpha = .48;
    });
    this.presentBattle(budget.battle, t, w, h);
    const sampled = sampleBackdropEvent(layout, seconds);
    this.activeEvent = sampled?.event.kind ?? null; this.eventProgress = sampled?.progress ?? 0;
    const kind = sampled?.event.kind, progress = sampled?.progress ?? 0, side = sampled?.event.side ?? -1;
    const envelope = Math.min(1, progress * 6, (1 - progress) * 6);
    if (this.flyby) {
      this.flyby.visible = kind === 'capital-flyby' && !reduced;
      this.flyby.scale.set(.85 * w / 390);
      this.flyby.position.set(w * (side < 0 ? .09 : .91), -180 + progress * (h + 360));
      this.flyby.rotation = side * -.06; this.flyby.alpha = envelope * .65;
    }
    this.gate.forEach((sprite, i) => {
      sprite.visible = kind === 'station-flythrough' && !reduced;
      sprite.scale.set((1.2 + progress * .8) * w / 390, (2.6 + progress) * h / 844);
      sprite.position.set(i ? w + 35 : -35, -260 + progress * (h + 520));
      sprite.rotation = 0; sprite.alpha = envelope * .64;
    });
    this.shower.forEach((sprite, i) => {
      sprite.visible = kind === 'asteroid-shower' && !reduced && i < budget.debris;
      const edge = i % 2 === 0 ? .03 + i % 5 * .035 : .97 - i % 5 * .035;
      const phase = (progress + i * .083) % 1;
      sprite.position.set(w * edge + Math.sin(i + progress) * 6, -40 + phase * (h + 80));
      sprite.scale.set(.5 + i % 3 * .2); sprite.rotation = i + progress * .4;
      sprite.alpha = envelope * .5;
    });
  }

  private presentBattle(enabled: boolean, t: number, w: number, h: number) {
    if (!this.layout) return;
    const side = this.layout.battle.side, baseX = side < 0 ? .075 : .925, y = this.layout.battle.y * h;
    this.battle.forEach((ship, i) => {
      ship.visible = enabled;
      ship.position.set(w * baseX + (i % 2 ? 15 : -15), y + Math.floor(i / 2) * 60 + Math.sin(t * .1 + i) * 4);
      ship.rotation = i < 2 ? Math.PI : 0; ship.alpha = .42;
    });
    this.battleBeams.forEach((beam, i) => {
      // Fixed, short connecting beams at the extreme edge. Never moving rounds.
      const phase = (t + i * 1.7) % 4;
      beam.visible = enabled && !this.reducedMotion && phase < .55;
      beam.width = 1; beam.height = 40;
      beam.position.set(w * baseX + (i ? 15 : -15), y + 30);
      beam.alpha = Math.sin(phase / .55 * Math.PI) * .2;
    });
    this.battleFlashes.forEach((flash, i) => {
      const phase = (t + i * 1.7) % 4;
      flash.visible = enabled && !this.reducedMotion && phase >= .35 && phase < .9;
      flash.position.set(w * baseX + (i ? 15 : -15), y + (i ? 0 : 60));
      flash.width = 3 + phase * 4; flash.height = 2 + phase * 2;
      flash.alpha = Math.max(0, 1 - Math.abs(phase - .6) * 4) * .16;
    });
  }

  snapshot() {
    return {
      themeId: this.selection?.theme.id ?? null, missionId: this.selection?.missionId ?? null,
      seed: this.selection?.seed ?? null, variant: this.selection?.variant ?? null,
      seconds: this.seconds, event: this.activeEvent, eventProgress: this.eventProgress,
      warp: this.warp, bossGrade: this.bossGrade, quality: this.detailScale,
      reducedMotion: this.reducedMotion, layers: this.planes.length,
      atlas: this.textures?.stats() ?? null,
      objects: this.planes.reduce((sum, plane) => sum + plane.children.length, 0),
    };
  }

  private clearScene() {
    for (const plane of this.planes) for (const child of plane.removeChildren()) child.destroy();
    this.textures?.destroy(); this.textures = null; this.layout = null;
    this.stars = []; this.landmarks = []; this.debris = []; this.nebula = [];
    this.battle = []; this.battleBeams = []; this.battleFlashes = []; this.flyby = null; this.gate = []; this.shower = [];
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearScene(); this.root.destroy({ children: true });
    if (typeof window !== 'undefined' && (window as BackdropWindow).__sciconBackgroundQA === this.qaBridge) delete (window as BackdropWindow).__sciconBackgroundQA;
  }
}
