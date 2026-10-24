import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const readChunks = (png) => {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG');
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data: Buffer.from(data) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
};

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
};

export const decodePng = (png) => {
  const chunks = readChunks(png);
  const header = chunks.find((chunk) => chunk.type === 'IHDR').data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  if (bitDepth !== 8 || header[12] !== 0) {
    throw new Error(`Unsupported PNG header ${bitDepth}/${colorType}`);
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);
  const compressed = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  const inflated = inflateSync(compressed);
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source];
    source += 1;
    const rowStart = y * stride;
    for (let index = 0; index < stride; index += 1) {
      const raw = inflated[source + index];
      const left = index >= channels ? pixels[rowStart + index - channels] : 0;
      const up = y > 0 ? pixels[rowStart - stride + index] : 0;
      const upLeft = y > 0 && index >= channels ? pixels[rowStart - stride + index - channels] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[rowStart + index] = value;
    }
    source += stride;
  }
  return { width, height, channels, colorType, pixels, chunks };
};

const encodePng = ({ width, height, channels, colorType, pixels, chunks }) => {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawStart = y * (stride + 1);
    raw[rawStart] = 0;
    pixels.copy(raw, rawStart + 1, y * stride, (y + 1) * stride);
  }
  const compressed = deflateSync(raw);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const nextChunks = chunks
    .filter((chunk) => chunk.type !== 'IDAT' && chunk.type !== 'IEND')
    .map((chunk) => chunk.type === 'IHDR' ? { type: 'IHDR', data: header } : chunk);
  const idatIndex = nextChunks.findIndex((chunk) => chunk.type === 'IHDR') + 1;
  nextChunks.splice(idatIndex, 0, { type: 'IDAT', data: compressed });
  nextChunks.push({ type: 'IEND', data: Buffer.alloc(0) });
  const parts = [PNG_SIGNATURE];
  for (const chunk of nextChunks) {
    const type = Buffer.from(chunk.type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([type, chunk.data])), 0);
    parts.push(length, type, chunk.data, crc);
  }
  return Buffer.concat(parts);
};

const blendSeam = (image, fadeRows) => {
  const { width, height, channels, pixels } = image;
  const fade = Math.max(1, Math.min(fadeRows, Math.floor(height / 4)));
  const stride = width * channels;
  for (let row = 0; row < fade; row += 1) {
    const weight = row / fade;
    const top = row * stride;
    const bottom = (height - fade + row) * stride;
    for (let index = 0; index < stride; index += 1) {
      pixels[bottom + index] = Math.round(pixels[bottom + index] * (1 - weight) + pixels[top + index] * weight);
    }
  }
  pixels.copy(pixels, (height - 1) * stride, 0, stride);
};

const targets = [
  ['public/game-art/generated/scicon-space-parallax-pack-v2/backgrounds/violet-rift.png', 128],
  ['public/game-art/generated/scicon-breakwater-v1/wreckfield.png', 128],
  ['public/game-art/generated/scicon-breakwater-v1/gate.png', 128],
  ['public/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/desert/backgrounds/desert-round-master-512x4096.png', 256],
  ['public/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/river/backgrounds/river-round-master-512x4096.png', 256]
];

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  for (const [file, fadeRows] of targets) {
    const image = decodePng(readFileSync(file));
    blendSeam(image, fadeRows);
    writeFileSync(file, encodePng(image));
    console.log(`baked ${file} ${image.width}x${image.height} fade ${fadeRows}`);
  }
}
