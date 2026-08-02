// Minimal pixel-art raster + PNG encoder. Pure Node, no dependencies.
//
// Sprites are drawn on a small logical grid and upscaled by an integer factor
// with nearest-neighbour, which is what makes the output read as crisp blocky
// pixel art rather than a smooth render shrunk down.

import zlib from 'node:zlib';

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

export const encodePng = (width, height, rgba) => {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

export class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height * 4);
  }

  /** Additive deposit, which is how neon energy accumulates toward white. */
  add(x, y, [r, g, b], intensity) {
    if (intensity <= 0) return;
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    this.data[i] += r * intensity;
    this.data[i + 1] += g * intensity;
    this.data[i + 2] += b * intensity;
    this.data[i + 3] += intensity;
  }

  /** Soft radial deposit used for glow cores and falloff. */
  glow(cx, cy, radius, colour, intensity, falloff = 2) {
    const r = Math.ceil(radius);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) continue;
        this.add(x, y, colour, intensity * Math.exp(-((d / radius) ** falloff) * 3));
      }
    }
  }

  line(x0, y0, x1, y1, colour, intensity, thickness = 1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (thickness <= 1) this.add(x, y, colour, intensity);
      else this.glow(x, y, thickness / 2, colour, intensity, 3);
    }
  }

  ring(cx, cy, radius, width, colour, intensity) {
    const outer = Math.ceil(radius + width + 1);
    for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y += 1) {
      for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        const band = Math.exp(-((d - radius) ** 2) / Math.max(0.25, width * width));
        if (band < 0.02) continue;
        this.add(x, y, colour, intensity * band);
      }
    }
  }

  /**
   * Resolves the accumulated float buffer into 8-bit RGBA, quantising to a
   * small number of brightness steps so the result has flat pixel-art bands
   * instead of a smooth gradient, then stamping a dark outline.
   */
  resolve({ steps = 5, outline = [8, 12, 34], alphaCutoff = 0.16 } = {}) {
    const { width, height } = this;
    const out = Buffer.alloc(width * height * 4);
    const solid = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i += 1) {
      // Normalise by the RAW accumulated weight, not the display alpha. Dividing
      // by the clamped alpha made every pixel with more than one deposit
      // saturate to pure white, which erased each move's colour entirely.
      const weight = this.data[i * 4 + 3];
      if (Math.min(1, weight) < alphaCutoff) continue;
      solid[i] = 1;
      // Overlapping deposits still brighten toward white, but only via the
      // colour they actually carry.
      const boost = 1 + Math.min(0.55, Math.max(0, weight - 1) * 0.16);
      const q = (v) => Math.min(1, Math.round((v / Math.max(weight, 0.0001)) * boost * steps) / steps);
      out[i * 4] = Math.round(255 * q(this.data[i * 4]));
      out[i * 4 + 1] = Math.round(255 * q(this.data[i * 4 + 1]));
      out[i * 4 + 2] = Math.round(255 * q(this.data[i * 4 + 2]));
      out[i * 4 + 3] = 255;
    }

    // Single-pixel dark outline on the silhouette edge: the house style for
    // this project's arcade sprites, and it keeps the FX readable over any
    // background colour.
    const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : solid[y * width + x]);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (solid[i]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
          out[i * 4] = outline[0];
          out[i * 4 + 1] = outline[1];
          out[i * 4 + 2] = outline[2];
          out[i * 4 + 3] = 235;
        }
      }
    }
    return out;
  }

  /** Nearest-neighbour integer upscale, preserving hard pixel edges. */
  static upscale(rgba, width, height, factor) {
    const outW = width * factor;
    const outH = height * factor;
    const out = Buffer.alloc(outW * outH * 4);
    for (let y = 0; y < outH; y += 1) {
      const sy = Math.floor(y / factor);
      for (let x = 0; x < outW; x += 1) {
        const sx = Math.floor(x / factor);
        rgba.copy(out, (y * outW + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4);
      }
    }
    return { data: out, width: outW, height: outH };
  }

  /** Packs frames left-to-right into one horizontal strip. */
  static sheet(frames, frameWidth, frameHeight) {
    const width = frameWidth * frames.length;
    const out = Buffer.alloc(width * frameHeight * 4);
    frames.forEach((frame, index) => {
      for (let y = 0; y < frameHeight; y += 1) {
        frame.copy(
          out,
          (y * width + index * frameWidth) * 4,
          y * frameWidth * 4,
          (y + 1) * frameWidth * 4
        );
      }
    });
    return { data: out, width, height: frameHeight };
  }
}
