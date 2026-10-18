/** Integer-only texture variants. These functions never change simulation or source artwork. */
export type SpriteRole = 'player' | 'wing' | 'enemy' | 'pickup' | 'boss';
export type PixelRaster = { width: number; height: number; pixels: Uint8Array };
export type SpritePalette = readonly [number, number, number];
export const IDLE_FRAME_COUNT = 4;

const channel = (color: number, shift: number) => (color >>> shift) & 255;
const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const energy = [0.84, 1, 1.16, 0.96] as const;

/** Keep dark outlines, neutral metal and bright warning highlights authored. */
export function bakeIdleFrames(source: PixelRaster, role: SpriteRole, palette: SpritePalette): PixelRaster[] {
  return Array.from({ length: IDLE_FRAME_COUNT }, (_, frame) => {
    const pixels = new Uint8Array(source.pixels);
    for (let p = 0; p < pixels.length; p += 4) {
      if (pixels[p + 3] === 0) continue;
      const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b), saturation = hi - lo;
      const hotMark = r > g * 1.25 && r > b * 1.3;
      const warningHighlight = hotMark && r > 230 && g > 145 && b > 100;
      if (role === 'enemy' && hi > 48 && saturation > 27 && !warningHighlight) {
        // Use pigment value, not luminance: saturated red armor is as bright
        // as its cyan replacement. Mixing opposing RGB hues made it grey.
        // Interpolate within the sector ramp, then retain the source value and
        // near-neutral shading; no original competing hue enters the remap.
        const step = Math.max(0, Math.min(2, (hi - 48) / 96));
        const low = Math.min(1, Math.floor(step)), blend = step - low;
        const rampR = channel(palette[low], 16) * (1 - blend) + channel(palette[low + 1], 16) * blend;
        const rampG = channel(palette[low], 8) * (1 - blend) + channel(palette[low + 1], 8) * blend;
        const rampB = channel(palette[low], 0) * (1 - blend) + channel(palette[low + 1], 0) * blend;
        const value = Math.max(rampR, rampG, rampB, 1), pigment = Math.min(1, saturation / 70);
        const shade = hi * pigment / value;
        pixels[p] = byte(hi - (value - rampR) * shade);
        pixels[p + 1] = byte(hi - (value - rampG) * shade);
        pixels[p + 2] = byte(hi - (value - rampB) * shade);
      }
      // Bright cool emitters cycle in four stepped frames. Neutral hull metal,
      // dark outline pixels, alpha and external silhouette are byte-identical.
      if (hi > 135 && saturation > 35 && !hotMark && (g > r * .85 || b > r * 1.1)) {
        const x = (p / 4) % source.width, y = Math.floor(p / 4 / source.width);
        const phase = (frame + (Math.floor(x / 3) + Math.floor(y / 4)) % 2) % 4;
        for (let c = 0; c < 3; c++) pixels[p + c] = byte(pixels[p + c] * energy[phase]);
      } else if (role === 'pickup' && hi > 115 && saturation > 30) {
        // Gold coins/gems retain their semantic hue while their lit facets turn.
        const phase = (frame + Math.floor((p / 4) % source.width / 4)) % 4;
        for (let c = 0; c < 3; c++) pixels[p + c] = byte(pixels[p + c] * (.94 + phase * .025));
      }
    }
    return { ...source, pixels };
  });
}

/** Four alpha-clipped diagonal bands, played only once per several seconds. */
export function bakeMetalShimmer(source: PixelRaster): PixelRaster[] {
  return Array.from({ length: 4 }, (_, frame) => {
    const pixels = new Uint8Array(source.pixels.length);
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      const p = (y * source.width + x) * 4;
      const r = source.pixels[p], g = source.pixels[p + 1], b = source.pixels[p + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      const diagonal = (x + y * .42) / (source.width + source.height * .42);
      if (source.pixels[p + 3] && hi > 80 && hi - lo < 70 && Math.abs(diagonal - (.13 + frame * .25)) < .085) {
        pixels[p] = pixels[p + 1] = pixels[p + 2] = 255;
        pixels[p + 3] = Math.round(source.pixels[p + 3] * .68);
      }
    }
    return { ...source, pixels };
  });
}

/** Alpha-edge illumination stays inside the original opaque silhouette. */
export function bakeInnerOutline(source: PixelRaster): PixelRaster {
  const pixels = new Uint8Array(source.pixels.length);
  const alpha = (x: number, y: number) => x < 0 || y < 0 || x >= source.width || y >= source.height ? 0 : source.pixels[(y * source.width + x) * 4 + 3];
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const p = (y * source.width + x) * 4, a = alpha(x, y);
    if (a > 40 && (alpha(x - 1, y) < 40 || alpha(x + 1, y) < 40 || alpha(x, y - 1) < 40 || alpha(x, y + 1) < 40)) {
      pixels[p] = pixels[p + 1] = pixels[p + 2] = 255; pixels[p + 3] = a;
    }
  }
  return { ...source, pixels };
}

export function bakePixelGlow(): PixelRaster {
  const width = 24, height = 24, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const radius = Math.sqrt((x - 11.5) ** 2 + (y - 11.5) ** 2) / 12;
    pixels[p] = pixels[p + 1] = pixels[p + 2] = 255;
    pixels[p + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 170 / 12) * 12;
  }
  return { width, height, pixels };
}

export function idleFrame(frame: number, phase: number, reduced: boolean, lowQuality = false) {
  return reduced ? 1 : Math.floor(Math.max(0, frame + phase) / (lowQuality ? 12 : 7)) % IDLE_FRAME_COUNT;
}

export function shimmerFrame(frame: number, phase: number, reduced: boolean, highQuality: boolean): number {
  if (reduced || !highQuality) return -1;
  const step = ((Math.floor(frame + phase) % 330) + 330) % 330;
  return step < 24 ? Math.floor(step / 6) : -1;
}
