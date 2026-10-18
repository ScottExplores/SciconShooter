import { Texture } from 'pixi.js';

/** REVAMP(S): Scott's warm sprite-fire colors with cool, low-contrast hull smoke. */
export const PIXEL_EXPLOSION_PALETTE = [
  0x261d2b, 0x702b31, 0xb63c29, 0xe96525, 0xff9f32, 0xffd35a, 0xffef9a, 0xfffbe0,
  0x1d2739, 0x344052, 0x526177, 0x8593a6, 0xc1cad1
] as const;
export type PixelExplosionTier = 'small' | 'medium' | 'large' | 'mega';
export const PIXEL_EXPLOSION_SPECS = {
  small: { edge: 24, frames: 10, duration: 420, smoke: 2, sparks: 3, debris: 1 },
  medium: { edge: 40, frames: 10, duration: 560, smoke: 3, sparks: 5, debris: 2 },
  large: { edge: 64, frames: 12, duration: 710, smoke: 4, sparks: 7, debris: 3 },
  mega: { edge: 96, frames: 12, duration: 860, smoke: 5, sparks: 10, debris: 4 }
} as const;
export interface PixelAtlasFrame { x: number; y: number; width: number; height: number; }
export interface PixelAtlasPixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  sequences: Record<string, PixelAtlasFrame[]>;
}
const TAU = Math.PI * 2;
const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x + seed * 13, 374761393) ^ Math.imul(y + 17, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const rgba = (color: number) => [color >>> 16, (color >>> 8) & 255, color & 255, 255];
const colors = PIXEL_EXPLOSION_PALETTE.map(rgba);

type Paint = (x: number, y: number, edge: number, index: number, count: number) => number;
const fire: Paint = (x, y, edge, index, count) => {
  const t = index / (count - 1);
  const growth = Math.min(1, 0.16 + t * 3.2);
  const radius = edge * 0.395 * growth;
  const dx = x + 0.5 - edge / 2;
  const dy = y + 0.5 - edge / 2;
  let surface = Math.hypot(dx, dy) / (radius * 0.77);
  // Overlapping round lobes create a scalloped fireball rather than a square or star.
  for (let lobe = 0; lobe < 7; lobe++) {
    const angle = lobe * TAU / 7 + 0.18;
    const reach = radius * (0.48 + (lobe % 3) * 0.045);
    const lobeRadius = radius * (0.41 + (lobe % 2) * 0.08);
    surface = Math.min(surface, Math.hypot(dx - Math.cos(angle) * reach, dy - Math.sin(angle) * reach) / lobeRadius);
  }
  const noise = hash(x, y, edge);
  if (surface > 1 || (surface > 0.80 && noise < (surface - 0.80) * 2.1)) return -1;
  // Cooling tears holes into the fire, revealing the underlying hull and smoke.
  const erosion = Math.max(0, (t - 0.49) * 1.62);
  const island = hash(Math.floor(x / 2), Math.floor(y / 2), edge + 3);
  if (island < erosion || (t > 0.88 && noise < 0.48)) return -1;
  const core = Math.hypot(dx + radius * 0.09, dy + radius * 0.1) / radius;
  const heat = Math.max(0, 1 - t * 0.91);
  if (core < 0.27 * heat && t < 0.52) return 7;
  if (core < 0.47 * heat && t < 0.62) return 6;
  const bands = 5.9 - surface * 3.1 - t * 3.4 + (noise > 0.75 ? 0.6 : 0);
  return Math.max(1, Math.min(5, Math.floor(bands)));
};
const smoke: Paint = (x, y, edge, index, count) => {
  const t = index / (count - 1);
  const dx = x + 0.5 - edge / 2;
  const dy = y + 0.5 - edge / 2;
  const radius = edge * (0.22 + t * 0.16);
  let distance = 2;
  for (let lobe = 0; lobe < 5; lobe++) {
    const angle = lobe * TAU / 5 + 0.4;
    distance = Math.min(distance, Math.hypot(dx - Math.cos(angle) * radius * 0.45, dy - Math.sin(angle) * radius * 0.33) / (radius * 0.72));
  }
  const noise = hash(x, y, 91);
  if (distance > 1 || noise < Math.max(0, distance - 0.7) * 1.8 + t * 0.17) return -1;
  return distance > 0.83 ? 8 : dy < -radius * 0.2 && distance < 0.65 ? 10 : 9;
};
const ring: Paint = (x, y, edge, index, count) => {
  const t = index / (count - 1);
  const dx = x + 0.5 - edge / 2;
  const dy = y + 0.5 - edge / 2;
  const distance = Math.hypot(dx, dy);
  const radius = edge * (0.10 + t * 0.36);
  if (Math.abs(distance - radius) > (edge >= 64 && t < 0.35 ? 1.05 : 0.65)) return -1;
  if (hash(x, y, 33) < t * 0.4) return -1;
  return index < 3 ? 6 : index < 6 ? 4 : 2;
};
const debris: Paint = (x, y, edge, index) => {
  const angle = index * TAU / 8;
  const dx = x + 0.5 - edge / 2;
  const dy = y + 0.5 - edge / 2;
  const rx = Math.cos(angle) * dx - Math.sin(angle) * dy;
  const ry = Math.sin(angle) * dx + Math.cos(angle) * dy;
  const distance = Math.max(Math.abs(rx) / 3.7, Math.abs(ry) / 2.4, Math.abs(rx + ry) / 5.0);
  if (distance > 1) return -1;
  return distance > 0.72 ? 8 : ry < -0.5 ? 12 : rx > 1.8 ? 3 : 10;
};
const spark = (direction: number): Paint => (x, y, edge, index) => {
  const angle = direction * TAU / 8;
  const dx = x + 0.5 - edge / 2;
  const dy = y + 0.5 - edge / 2;
  const along = Math.cos(angle) * dx + Math.sin(angle) * dy;
  const across = -Math.sin(angle) * dx + Math.cos(angle) * dy;
  if (Math.abs(across) > 0.75 || along > 1.5 || along < -(4.5 - index)) return -1;
  return along > -0.5 ? (index === 0 ? 7 : 5) : along > -2 ? 4 : 2;
};

/** Deterministic pure raster authoring, shared by the GPU atlas and geometry tests. */
export function generatePixelExplosionAtlas(): PixelAtlasPixels {
  const width = 1024;
  const sequences: Record<string, PixelAtlasFrame[]> = {};
  const jobs: { key: string; edge: number; count: number; paint: Paint }[] = [];
  for (const [key, spec] of Object.entries(PIXEL_EXPLOSION_SPECS)) {
    jobs.push({ key, edge: spec.edge, count: spec.frames, paint: fire });
    jobs.push({ key: `ring-${key}`, edge: spec.edge, count: 8, paint: ring });
  }
  jobs.push({ key: 'smoke', edge: 32, count: 8, paint: smoke }, { key: 'debris', edge: 12, count: 8, paint: debris });
  for (let direction = 0; direction < 8; direction++) jobs.push({ key: `spark-${direction}`, edge: 12, count: 3, paint: spark(direction) });
  jobs.sort((a, b) => b.edge - a.edge);
  let cursorX = 1, cursorY = 1, rowHeight = 0;
  for (const job of jobs) {
    sequences[job.key] = [];
    for (let index = 0; index < job.count; index++) {
      if (cursorX + job.edge + 1 > width) { cursorX = 1; cursorY += rowHeight + 2; rowHeight = 0; }
      sequences[job.key].push({ x: cursorX, y: cursorY, width: job.edge, height: job.edge });
      cursorX += job.edge + 2;
      rowHeight = Math.max(rowHeight, job.edge);
    }
  }
  const height = cursorY + rowHeight + 1;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const job of jobs) {
    sequences[job.key].forEach((frame, index) => {
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const palette = job.paint(x, y, frame.width, index, job.count);
        if (palette < 0) continue;
        pixels.set(colors[palette], ((frame.y + y) * width + frame.x + x) * 4);
      }
    });
  }
  return { width, height, pixels, sequences };
}

/** One immutable canvas source, one upload; every animation frame batches together. */
export class PixelExplosionAtlas {
  private page: Texture | null = null;
  private readonly sequences: Record<string, Texture[]> = {};
  constructor() {
    // Headless logic tests have no DOM. Never fall back to the solid WHITE texture.
    if (typeof document === 'undefined') return;
    const atlas = generatePixelExplosionAtlas();
    const canvas = document.createElement('canvas');
    canvas.width = atlas.width; canvas.height = atlas.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(atlas.width, atlas.height);
    image.data.set(atlas.pixels);
    context.putImageData(image, 0, 0);
    this.page = Texture.from(canvas);
    this.page.source.scaleMode = 'nearest';
    for (const [key, frames] of Object.entries(atlas.sequences)) {
      this.sequences[key] = frames.map((bounds) => {
        const frame = this.page!.frame.clone();
        Object.assign(frame, bounds);
        return new Texture({ source: this.page!.source, frame });
      });
    }
  }
  get(key: string) { return this.sequences[key] ?? []; }
  getStats() {
    return { sources: this.page ? 1 : 0, frames: Object.values(this.sequences).reduce((sum, frames) => sum + frames.length, 0),
      width: this.page?.width ?? 0, height: this.page?.height ?? 0 };
  }
  destroy() {
    for (const frames of Object.values(this.sequences)) for (const frame of frames) frame.destroy(false);
    this.page?.destroy(true);
    this.page = null;
    for (const key of Object.keys(this.sequences)) delete this.sequences[key];
  }
}
