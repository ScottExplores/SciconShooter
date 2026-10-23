/**
 * Pulls the support-ship squadron onto the research hull's navy / cyan ramp
 * without changing silhouettes, frame centers, or which pixels are transparent.
 *
 * Role lamps (green, violet, rose, amber, teal) stay saturated. Neutral gray
 * hulls, which read as washed-out plastic beside the player ship, move onto
 * the same blue metal. Edge pixels are darkened so the shape still reads when
 * the sprite is drawn at wingman size.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const packDir = path.join(root, 'public/game-art/generated/ships/scicon-mini-squadron-pack-v1');
const manifestPath = path.join(packDir, 'pack-manifest.json');

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)];
  return [left, up, upperLeft][distances.indexOf(Math.min(...distances))];
};

const decodeRgbaPng = (file) => {
  const png = fs.readFileSync(file);
  const idat = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
    } else if (kind === 'IDAT') {
      idat.push(body);
    }
    offset += length + 12;
    if (kind === 'IEND') break;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : paeth(left, up, upperLeft);
      row[x] = (raw + predictor) & 0xff;
    }
    row.copy(pixels, y * stride);
    previous = row;
    sourceOffset += stride;
  }
  return { width, height, pixels };
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    table[index] = crc >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  return out;
};

const encodeRgbaPng = ({ width, height, pixels }) => {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

const mix = (red, green, blue, target, amount) => ([
  Math.round(red + (target[0] - red) * amount),
  Math.round(green + (target[1] - green) * amount),
  Math.round(blue + (target[2] - blue) * amount)
]);

const harmonizePixel = (red, green, blue, alpha) => {
  if (alpha === 0) return [red, green, blue, alpha];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  if (saturation < 0.22) {
    if (luminance > 0.84) return [...mix(red, green, blue, [214, 244, 255], 0.62), alpha];
    if (luminance > 0.55) return [...mix(red, green, blue, [92, 176, 246], 0.78), alpha];
    if (luminance > 0.22) return [...mix(red, green, blue, [22, 78, 176], 0.84), alpha];
    return [...mix(red, green, blue, [6, 16, 42], 0.7), alpha];
  }
  return [...mix(red, green, blue, [64, 186, 224], 0.14), alpha];
};

const harmonizeFrame = ({ width, height, pixels }) => {
  const next = Buffer.from(pixels);
  for (let index = 0; index < next.length; index += 4) {
    const [red, green, blue, alpha] = harmonizePixel(next[index], next[index + 1], next[index + 2], next[index + 3]);
    next[index] = red;
    next[index + 1] = green;
    next[index + 2] = blue;
    next[index + 3] = alpha;
  }
  const opaque = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return next[(y * width + x) * 4 + 3] > 16;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (next[index + 3] < 200) continue;
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (!edge) continue;
      next[index] = 5;
      next[index + 1] = 10;
      next[index + 2] = 22;
    }
  }
  return { width, height, pixels: next };
};

const blit = (target, source, originX, originY) => {
  for (let y = 0; y < source.height; y += 1) {
    source.pixels.copy(
      target.pixels,
      ((originY + y) * target.width + originX) * 4,
      y * source.width * 4,
      (y * source.width + source.width) * 4
    );
  }
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fromPublic = (value) => path.join(root, 'public', ...value.split('/').filter(Boolean));
const master = { width: 768, height: 2560, pixels: Buffer.alloc(768 * 2560 * 4) };

manifest.ships.forEach((ship, row) => {
  const frames = ship.frames.map((framePath) => harmonizeFrame(decodeRgbaPng(fromPublic(framePath))));
  const sheet = { width: 768, height: 256, pixels: Buffer.alloc(768 * 256 * 4) };
  frames.forEach((frame, index) => {
    const file = fromPublic(ship.frames[index]);
    fs.writeFileSync(file, encodeRgbaPng(frame));
    ship.frameHashes[manifest.frameOrder[index]] = crypto.createHash('sha256').update(frame.pixels).digest('hex');
    blit(sheet, frame, index * 256, 0);
    blit(master, frame, index * 256, row * 256);
  });
  fs.writeFileSync(fromPublic(ship.sheet), encodeRgbaPng(sheet));
});

fs.writeFileSync(fromPublic(manifest.masterSheet), encodeRgbaPng(master));
manifest.version = 2;
manifest.generated = '2026-10-23';
manifest.sourceMode = 'Existing squadron silhouettes, retinted in tools/harmonize-support-ship-palette.mjs to the research-ship navy and cyan ramp';
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Harmonized ${manifest.ships.length} support ships.`);
