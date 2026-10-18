import type { BackgroundTheme, BackgroundSignatureKind, BackgroundPlanetKind } from './themes';
import { createBackdropRandom } from './themes';

/** Integer raster artwork: no gradients, filters, antialiasing or runtime noise. */
export class PixelSurface {
  readonly pixels: Uint8Array;
  constructor(readonly width: number, readonly height: number) { this.pixels = new Uint8Array(width * height * 4); }
  dot(x: number, y: number, color: number, alpha = 255) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.pixels[i] = color >> 16; this.pixels[i + 1] = color >> 8 & 255;
    this.pixels[i + 2] = color & 255; this.pixels[i + 3] = alpha;
  }
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 255) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(this.height, y + h); yy++)
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(this.width, x + w); xx++) this.dot(xx, yy, color, alpha);
  }
  line(x0: number, y0: number, x1: number, y1: number, color: number, width = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 0; i <= n; i++) this.rect(Math.round(x0 + (x1 - x0) * i / Math.max(1, n)), Math.round(y0 + (y1 - y0) * i / Math.max(1, n)), width, width, color);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, color: number, inner = 0) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1 && d >= inner ** 2) this.dot(x, y, color);
    }
  }
  polygon(points: readonly (readonly [number, number])[], color: number) {
    const ys = points.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] > y) !== (b[1] > y)) intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length; i += 2) this.rect(Math.ceil(intersections[i]), y, Math.floor(intersections[i + 1]) - Math.ceil(intersections[i]) + 1, 1, color);
    }
  }
}

export const mixColor = (a: number, b: number, t: number): number => {
  t = Math.max(0, Math.min(1, t));
  return (Math.round((a >> 16) * (1 - t) + (b >> 16) * t) << 16)
    | (Math.round((a >> 8 & 255) * (1 - t) + (b >> 8 & 255) * t) << 8)
    | Math.round((a & 255) * (1 - t) + (b & 255) * t);
};
const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
const noise = (x: number, y: number, seed: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx) * (1 - sy)
    + (hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx) * sy;
};

export function bakeNebula(theme: BackgroundTheme, seed: number): PixelSurface {
  const out = new PixelSurface(128, 256), p = theme.palette;
  const ramp = Array.from({ length: 9 }, (_, i) => mixColor(p.ink, p.nebula, i / 10));
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const nx = x / 128, ny = y / 256;
    const warp = noise(x / 34, y / 42, seed) * 3;
    const n = noise(x / 29 + warp, y / 44, seed + 1) * .58
      + noise(x / 12, y / 18 + warp, seed + 2) * .29 + noise(x / 5, y / 7, seed + 3) * .13;
    // Edge clouds preserve a broad, quiet flight lane even in bright sectors.
    const edge = Math.min(1, Math.abs(nx - .5) * 2.6);
    const seam = Math.min(1, Math.min(ny, 1 - ny) * 12);
    let shape = .45;
    if (theme.nebulaStyle === 'ribbon') shape = .35 + .3 * Math.sin(nx * 10 + ny * 14 + warp);
    if (theme.nebulaStyle === 'vortex') shape = .3 + .3 * Math.sin(Math.hypot(nx - .2, ny - .35) * 21 + warp);
    if (theme.nebulaStyle === 'wisps') shape = .25 + .35 * Math.sin(nx * 16 + warp * 2);
    const density = Math.max(0, (n - .28) * (1.1 + shape)) * (.18 + edge * .82) * seam;
    const step = Math.min(8, Math.floor(density * 12 + (x + y % 2) % 2 * .27));
    out.dot(x, y, ramp[step]);
  }
  return out;
}

/** Panel bevels, inset seams, rivets and sparse windows echo Scott's metal hulls. */
function panel(s: PixelSurface, x: number, y: number, w: number, h: number, p: BackgroundTheme['palette'], seed: number) {
  x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
  s.rect(x, y, w, h, p.shadow); s.rect(x + 1, y + 1, w - 2, h - 3, p.hull);
  s.line(x + 2, y + 1, x + w - 3, y + 1, p.detail);
  for (let yy = y + 5; yy < y + h - 3; yy += 7) {
    s.line(x + 2, yy, x + w - 3, yy, p.shadow);
    for (let xx = x + 4; xx < x + w - 4; xx += 8) {
      if (hash(xx, yy, seed) > .58) s.rect(xx, yy - 2, 3, 1, p.detail);
      if (hash(xx, yy, seed + 1) > .86) s.rect(xx, yy + 2, 2, 1, p.accent);
    }
  }
  s.dot(x + 2, y + h - 3, p.detail); s.dot(x + w - 3, y + h - 3, p.detail);
}

export function bakeSignature(theme: BackgroundTheme, kind: BackgroundSignatureKind, seed: number): PixelSurface {
  const s = new PixelSurface(192, 192), p = theme.palette, rnd = createBackdropRandom(seed);
  const ring = (cx: number, cy: number, rx: number, ry: number) => {
    s.ellipse(cx, cy + 3, rx, ry, p.shadow, .72);
    s.ellipse(cx, cy, rx, ry, p.hull, .76);
    s.ellipse(cx, cy - 1, rx, ry, p.detail, .94);
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      const x = cx + Math.cos(a) * rx * .87, y = cy + Math.sin(a) * ry * .87;
      s.rect(x, y, 2, 1, i % 3 === 0 ? p.accent : p.shadow);
    }
  };
  if (kind === 'station') {
    panel(s, 89, 9, 13, 177, p, seed);
    panel(s, 16, 81, 160, 16, p, seed);
    ring(96, 81, 67, 42); ring(96, 81, 47, 28);
    s.ellipse(96, 85, 25, 22, p.shadow); s.ellipse(96, 79, 24, 19, p.hull);
    s.ellipse(96, 77, 21, 16, p.detail, .87);
    for (let a = 0; a < 6; a++) { panel(s, 17 + a * 28, 118, 19, 32, p, seed + a); s.line(25 + a * 28, 97, 25 + a * 28, 118, p.hull, 2); }
    panel(s, 84, 64, 24, 24, p, seed);
  } else if (kind === 'refinery') {
    panel(s, 23, 90, 146, 17, p, seed);
    for (let i = 0; i < 3; i++) {
      const x = 34 + i * 59, y = 44 + i % 2 * 42;
      panel(s, x - 16, y, 33, 64, p, seed + i);
      s.ellipse(x, y, 17, 9, p.detail); s.ellipse(x, y, 13, 6, p.hull);
      for (let j = 0; j < 3; j++) s.ellipse(x, y + 15 + j * 14, 16, 6, p.shadow, .8);
      s.rect(x - 8, y + 48, 16, 2, p.accent);
      panel(s, x - 2, y - 27, 5, 25, p, seed);
    }
    panel(s, 53, 145, 86, 21, p, seed);
  } else if (kind === 'archive') {
    // Suspended, stacked diamond vaults have a different silhouette to a rail bridge.
    for (let i = 3; i >= 0; i--) {
      const y = 27 + i * 34, span = 69 - i * 7;
      s.polygon([[96, y - 20], [96 + span, y + 9], [96 + span, y + 25], [96, y + 55], [96 - span, y + 25], [96 - span, y + 9]], p.shadow);
      s.polygon([[96, y - 17], [94 + span, y + 9], [96, y + 37], [98 - span, y + 9]], p.hull);
      s.polygon([[98 - span, y + 11], [94, y + 38], [94, y + 51], [98 - span, y + 24]], p.detail);
      s.line(96, y - 16, 93 + span, y + 9, p.detail);
      s.line(96, y + 37, 93 + span, y + 10, p.accent);
      for (let j = 0; j < 7; j++) {
        const x = 42 + j * 16, yy = y + 19 + (1 - Math.abs(x - 96) / 65) * 24;
        s.line(x, yy, x, yy + 5, p.shadow, 2);
      }
      s.polygon([[96, y - 6], [119, y + 6], [96, y + 18], [73, y + 6]], p.shadow);
      s.line(87, y + 6, 104, y + 6, p.detail, 2);
    }
  } else if (kind === 'fortress') {
    // Broad armored curtain wall with recessed bays and staggered battlements.
    for (let i = 0; i < 4; i++) {
      const x = 13 + i * 43, y = 24 + i % 2 * 20;
      panel(s, x, y, 37, 145 - i % 2 * 20, p, seed + i);
      panel(s, x + 7, y - 19, 24, 24, p, seed + i);
      s.rect(x + 9, y + 30, 20, 45, p.shadow);
      s.line(x + 12, y + 33, x + 12, y + 71, p.detail);
      s.rect(x + 17, y + 71, 8, 2, p.accent);
      for (let j = 0; j < 3; j++) panel(s, x + 4, y + 87 + j * 14, 29, 9, p, seed + j);
    }
    panel(s, 8, 156, 176, 19, p, seed);
  } else if (kind === 'rails') {
    panel(s, 76, 0, 39, 192, p, seed);
    for (let i = 0; i < 6; i++) {
      const y = 8 + i * 30, spread = 49;
      s.line(96, y, 96 - spread, y + 21, p.hull, 4); s.line(96, y, 96 + spread, y + 21, p.hull, 4);
      panel(s, 88 - spread, y, 30, 23, p, seed + i);
      panel(s, 81 + spread, y, 30, 23, p, seed + i + 1);
      panel(s, 82, y + 2, 27, 14, p, seed);
    }
    for (const x of [24, 29, 162, 167]) s.rect(x, 0, 2, 192, p.detail);
  } else if (kind === 'rings') {
    s.line(25, 23, 166, 168, p.hull, 4); s.line(160, 20, 29, 171, p.hull, 4);
    ring(96, 96, 84, 67); ring(96, 96, 66, 45); ring(96, 96, 38, 82);
    panel(s, 82, 82, 28, 28, p, seed);
    for (const [x, y] of [[22, 65], [148, 115], [83, 14], [83, 164]]) panel(s, x, y, 22, 14, p, seed);
  } else if (kind === 'singularity') {
    // A stepped accretion disk with a deliberately dark center, never a combat glow.
    for (let r = 88; r >= 35; r -= 3) s.ellipse(96, 96, r, r * .38, r % 2 ? p.hull : p.nebula, .93);
    s.ellipse(96, 91, 39, 39, p.shadow); s.ellipse(96, 90, 33, 33, p.ink);
    s.ellipse(96, 90, 39, 39, p.detail, .95);
    s.ellipse(96, 105, 79, 18, p.hull, .91);
  } else if (kind === 'rift') {
    const left: [number, number][] = [[96, 7], [82, 36], [89, 62], [76, 84], [89, 113], [79, 139], [90, 184]];
    const right: [number, number][] = [[94, 184], [106, 148], [101, 117], [116, 92], [104, 64], [115, 33], [96, 7]];
    s.polygon([...left, ...right], p.shadow);
    for (let i = 0; i < left.length - 1; i++) {
      s.line(...left[i], ...left[i + 1], p.hull, 5);
      s.line(left[i][0] + 4, left[i][1], left[i + 1][0] + 4, left[i + 1][1], p.detail, 2);
      s.line(...right[i], ...right[i + 1], p.nebula, 4);
    }
    for (let i = 0; i < 16; i++) {
      const x = (i % 2 ? 124 : 37) + rnd() * 21, y = 15 + rnd() * 160, r = 3 + rnd() * 7;
      s.polygon([[x - r, y], [x, y - r], [x + r, y + 2], [x + r * .4, y + r], [x - r, y + r * .7]], p.hull);
      s.line(x - r, y, x, y - r, p.detail);
    }
  } else if (kind === 'crystal') {
    for (let i = 0; i < 11; i++) {
      const a = rnd() * 6.28, r = 32 + rnd() * 48, x = 96 + Math.cos(a) * r, y = 96 + Math.sin(a) * r;
      const w = 9 + rnd() * 13, h = 16 + rnd() * 35;
      s.polygon([[x, y - h], [x + w, y], [x, y + h * .5], [x - w, y]], p.shadow);
      s.polygon([[x, y - h + 3], [x + w - 2, y], [x, y + h * .42]], p.hull);
      s.polygon([[x, y - h + 3], [x, y + h * .42], [x - w + 2, y]], p.detail);
      s.line(x, y - h + 5, x - w + 3, y, p.accent);
    }
  } else {
    // Salvage field: recognizable severed ribs rather than another planet pair.
    for (let i = 0; i < 7; i++) {
      const x = 59 + rnd() * 42, y = 18 + i * 23;
      panel(s, x, y, 17 + rnd() * 33, 17, p, seed + i);
      s.line(x + 10, y + 4, x - 29, y - 12, p.hull, 4);
      s.line(x + 30, y + 4, x + 58, y - 3, p.detail, 2);
    }
  }
  return s;
}

export function bakePlanet(theme: BackgroundTheme, kind: BackgroundPlanetKind, seed: number): PixelSurface {
  const s = new PixelSurface(160, 160), p = theme.palette;
  if (kind === 'ringed') { s.ellipse(80, 88, 76, 24, p.detail, .76); s.ellipse(80, 88, 69, 21, p.hull, .84); }
  for (let y = 24; y < 134; y++) for (let x = 25; x < 135; x++) {
    const nx = (x - 80) / 53, ny = (y - 78) / 53, d = nx * nx + ny * ny;
    if (d > 1 || (kind === 'shattered' && Math.abs(nx + .28 * Math.sin(ny * 9)) < .08)) continue;
    const shade = Math.sqrt(1 - d) * .6 - nx * .35 - ny * .28;
    const texture = kind === 'gas' || kind === 'ringed' ? Math.sin(y * .35 + Math.sin(x * .04) * 2) * .13 : noise(x / 8, y / 8, seed) * .35;
    s.dot(x, y, mixColor(p.shadow, p.detail, Math.round(Math.max(0, shade + texture) * 5) / 5));
  }
  if (kind === 'cratered') {
    const rnd = createBackdropRandom(seed);
    for (let i = 0; i < 13; i++) {
      const a = rnd() * 6.28, r = rnd() * 39, x = 77 + Math.cos(a) * r, y = 74 + Math.sin(a) * r, size = 3 + rnd() * 7;
      s.ellipse(x, y, size, size * .7, p.shadow); s.ellipse(x - 1, y - 1, size, size * .7, p.hull, .76);
    }
  }
  if (kind === 'ringed') for (let y = 88; y < 112; y++) for (let x = 3; x < 158; x++) {
    const d = ((x - 80) / 76) ** 2 + ((y - 88) / 24) ** 2;
    if (d < 1 && d > .76 ** 2) s.dot(x, y, d > .9 ? p.hull : p.detail);
  }
  return s;
}

export function bakeDebris(theme: BackgroundTheme, seed: number): PixelSurface {
  const s = new PixelSurface(32, 32), p = theme.palette;
  if (theme.debrisStyle === 'metal') { panel(s, 7, 8, 17, 13, p, seed); s.line(2, 5, 29, 26, p.shadow, 2); }
  else {
    const pts: [number, number][] = [], rnd = createBackdropRandom(seed);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = 8 + rnd() * 6; pts.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r]); }
    s.polygon(pts, p.shadow); s.polygon(pts.map(([x, y]) => [x * .8 + 2, y * .8 + 1] as [number, number]), p.hull);
    for (let i = 0; i < 13; i++) s.rect(9 + rnd() * 11, 7 + rnd() * 11, 2, 2, i % 3 ? p.shadow : p.detail);
  }
  return s;
}

export function bakeCapitalShip(theme: BackgroundTheme, seed: number): PixelSurface {
  const s = new PixelSurface(128, 240), p = theme.palette;
  s.polygon([[64, 3], [78, 25], [83, 71], [107, 126], [111, 202], [95, 224], [32, 224], [16, 202], [21, 126], [45, 71], [49, 25]], p.shadow);
  s.polygon([[64, 8], [73, 30], [77, 79], [96, 127], [100, 200], [85, 215], [42, 215], [27, 200], [31, 127], [51, 79], [55, 30]], p.hull);
  panel(s, 54, 39, 20, 148, p, seed);
  for (let i = 0; i < 5; i++) { panel(s, 34, 104 + i * 20, 17, 16, p, seed + i); panel(s, 77, 104 + i * 20, 17, 16, p, seed + i); }
  panel(s, 48, 117, 32, 27, p, seed); s.rect(51, 120, 26, 3, p.detail);
  for (const x of [34, 56, 78]) { panel(s, x, 204, 16, 20, p, seed); s.rect(x + 3, 225, 10, 7, p.nebula); s.rect(x + 6, 225, 4, 3, p.detail); }
  s.line(62, 16, 62, 39, p.detail, 2);
  return s;
}
