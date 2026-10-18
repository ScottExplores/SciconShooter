import { BufferImageSource, DisplacementFilter, Rectangle, Sprite, Texture, type Container } from 'pixi.js';
import type { GameEngine } from '../../gameLogic';
import type { RenderQualityBudget } from '../performance/AdaptiveRenderQuality';

export const SHOCKWAVE_FRAMES = 27;

/** Neutral edges prevent texture clamping from moving the rest of the screen. */
export function bakeShockwaveMap(size = 64): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const radius = Math.hypot(dx, dy);
    const ring = Math.max(0, 1 - Math.abs(radius - .65) / .18);
    const offset = radius > 0 ? ring * 88 / radius : 0;
    const i = (y * size + x) * 4;
    pixels[i] = Math.round(128 + dx * offset);
    pixels[i + 1] = Math.round(128 + dy * offset);
    pixels[i + 2] = 128; pixels[i + 3] = 255;
  }
  return pixels;
}

/**
 * High-only heat ripple. The filter belongs exclusively to the background:
 * bullets, hulls, hitboxes, telegraphs and HUD never move through this shader.
 * One retained, CPU-backed displacement texture supports WebGL and WebGPU.
 */
export class BackgroundShockwave {
  private map: Sprite | null = null;
  private filter: DisplacementFilter | null = null;
  private attached = false;
  private started = -100;
  private sequence = 0;
  private generation = -1;
  private waveKey = '';
  private lastFrame = -1;
  private priorArea: Rectangle | null = null;
  private readonly area = new Rectangle(0, 0, 390, 844);
  private origin = { x: 195, y: 200 };
  private warp = false;
  private disposed = false;
  private readonly qaBridge = { snapshot: () => this.snapshot() };

  constructor(private readonly target: Container) {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') {
      (window as Window & { __sciconShockwaveQA?: typeof this.qaBridge }).__sciconShockwaveQA = this.qaBridge;
    }
  }

  update(engine: GameEngine, quality: RenderQualityBudget, reduced: boolean): void {
    if (this.disposed) return;
    const frame = engine.feel.presentationFrame;
    if (engine.feel.resetGeneration !== this.generation || frame < this.lastFrame) {
      this.generation = engine.feel.resetGeneration; this.sequence = 0;
      this.waveKey = ''; this.started = -100;
    }
    this.lastFrame = frame;
    const runtime = engine.getRuntimeState();
    const waveKey = `${runtime.waveId}:${runtime.wavePresentationRevision}`;
    const eligible = quality.tier === 'high' && !reduced;
    // Consume receipts even on Low; a later quality change must not replay them.
    if (this.waveKey && waveKey !== this.waveKey && eligible) {
      this.started = frame; this.origin = { x: engine.width / 2, y: engine.height * .28 }; this.warp = true;
    }
    this.waveKey = waveKey;
    if (this.sequence !== engine.feel.latestSequence) {
      for (const event of engine.feel.events) {
        if (event.sequence <= this.sequence) continue;
        if (eligible && (event.type === 'part-break' || event.type === 'phase-change'
          || (event.type === 'kill' && event.tier !== 'small'))) {
          this.started = frame; this.origin = { x: event.x, y: event.y }; this.warp = false;
        }
      }
      this.sequence = engine.feel.latestSequence;
    }
    const age = frame - this.started;
    if (!eligible || age < 0 || age >= SHOCKWAVE_FRAMES) {
      if (!eligible) this.started = -100;
      this.detach(); return;
    }
    this.ensureResources();
    const progress = age / SHOCKWAVE_FRAMES;
    const extent = Math.round(48 + progress * (this.warp ? 720 : 370));
    this.map!.position.set(Math.round(this.origin.x), Math.round(this.origin.y));
    this.map!.width = extent; this.map!.height = extent;
    this.filter!.scale.set((this.warp ? 6 : 4) * Math.sin(Math.PI * progress) * (1 - progress));
    this.area.width = engine.width; this.area.height = engine.height;
    if (!this.attached) {
      this.priorArea = this.target.filterArea ?? null;
      this.target.filterArea = this.area;
      this.target.filters = [...(this.target.filters ?? []), this.filter!];
      this.attached = true;
    }
  }

  snapshot() { return { active: this.attached, allocated: Boolean(this.map), sourceBytes: this.map ? 64 * 64 * 4 : 0 }; }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.detach();
    this.filter?.destroy(); this.filter = null;
    this.map?.destroy({ texture: true, textureSource: true }); this.map = null;
    if (typeof window !== 'undefined') {
      const target = window as Window & { __sciconShockwaveQA?: typeof this.qaBridge };
      if (target.__sciconShockwaveQA === this.qaBridge) delete target.__sciconShockwaveQA;
    }
  }

  private ensureResources(): void {
    if (this.map) return;
    const texture = new Texture({ label: 'revamp-R-heat-map', source: new BufferImageSource({
      resource: bakeShockwaveMap(), width: 64, height: 64, scaleMode: 'nearest',
      format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha', autoGenerateMipmaps: false,
    }) });
    this.map = new Sprite({ texture, anchor: .5, eventMode: 'none', roundPixels: true });
    this.target.addChild(this.map);
    // Background resolution 1 retains its authored pixel grid and bounds this
    // short-lived pass to one 390x844 target even on DPR 2/3 phones.
    this.filter = new DisplacementFilter({ sprite: this.map, scale: 0, resolution: 1, padding: 0 });
  }

  private detach(): void {
    if (!this.attached) return;
    const remaining = (this.target.filters ?? []).filter(filter => filter !== this.filter);
    this.target.filters = remaining.length ? remaining : null;
    this.target.filterArea = this.priorArea;
    this.attached = false;
  }
}
