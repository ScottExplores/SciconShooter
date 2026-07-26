import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requireFromDirector = createRequire(new URL('../director/package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');

const colorKey = (red, green, blue) => (red << 16) | (green << 8) | blue;
const colorFromKey = (key, count) => ({
  red: (key >>> 16) & 0xff,
  green: (key >>> 8) & 0xff,
  blue: key & 0xff,
  count
});

const boundsFor = (colors) => colors.reduce((bounds, color) => ({
  redMin: Math.min(bounds.redMin, color.red),
  redMax: Math.max(bounds.redMax, color.red),
  greenMin: Math.min(bounds.greenMin, color.green),
  greenMax: Math.max(bounds.greenMax, color.green),
  blueMin: Math.min(bounds.blueMin, color.blue),
  blueMax: Math.max(bounds.blueMax, color.blue),
  weight: bounds.weight + color.count
}), {
  redMin: 255,
  redMax: 0,
  greenMin: 255,
  greenMax: 0,
  blueMin: 255,
  blueMax: 0,
  weight: 0
});

const createBox = (colors) => {
  const bounds = boundsFor(colors);
  const redRange = bounds.redMax - bounds.redMin;
  const greenRange = bounds.greenMax - bounds.greenMin;
  const blueRange = bounds.blueMax - bounds.blueMin;
  return {
    colors,
    bounds,
    score: Math.max(redRange, greenRange, blueRange) * Math.sqrt(bounds.weight)
  };
};

const splitBox = (box) => {
  if (box.colors.length < 2) return null;
  const ranges = [
    ['red', box.bounds.redMax - box.bounds.redMin],
    ['green', box.bounds.greenMax - box.bounds.greenMin],
    ['blue', box.bounds.blueMax - box.bounds.blueMin]
  ].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const channel = ranges[0][0];
  const secondary = channel === 'red' ? 'green' : 'red';
  const tertiary = channel === 'blue' ? 'green' : 'blue';
  const ordered = [...box.colors].sort((left, right) => (
    left[channel] - right[channel]
    || left[secondary] - right[secondary]
    || left[tertiary] - right[tertiary]
  ));
  const halfway = box.bounds.weight / 2;
  let cumulative = 0;
  let splitIndex = 1;
  for (; splitIndex < ordered.length; splitIndex += 1) {
    cumulative += ordered[splitIndex - 1].count;
    if (cumulative >= halfway) break;
  }
  splitIndex = Math.max(1, Math.min(ordered.length - 1, splitIndex));
  return [createBox(ordered.slice(0, splitIndex)), createBox(ordered.slice(splitIndex))];
};

const averageBoxColor = (box) => {
  const totals = box.colors.reduce((result, color) => ({
    red: result.red + color.red * color.count,
    green: result.green + color.green * color.count,
    blue: result.blue + color.blue * color.count,
    count: result.count + color.count
  }), { red: 0, green: 0, blue: 0, count: 0 });
  return Object.freeze({
    red: Math.round(totals.red / Math.max(1, totals.count)),
    green: Math.round(totals.green / Math.max(1, totals.count)),
    blue: Math.round(totals.blue / Math.max(1, totals.count))
  });
};

export const analyzeBossPixelArtPng = (image) => {
  const opaqueColors = new Set();
  let opaquePixels = 0;
  let transparentPixels = 0;
  let semitransparentPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3];
    if (alpha === 0) {
      transparentPixels += 1;
    } else if (alpha === 255) {
      opaquePixels += 1;
      opaqueColors.add(colorKey(image.data[offset], image.data[offset + 1], image.data[offset + 2]));
    } else {
      semitransparentPixels += 1;
    }
  }
  return Object.freeze({
    width: image.width,
    height: image.height,
    opaquePixels,
    transparentPixels,
    semitransparentPixels,
    opaquePaletteSize: opaqueColors.size
  });
};

export const quantizeBossPixelArt = (source, maximumColors = 32) => {
  const colorLimit = Math.max(2, Math.min(256, Math.floor(maximumColors)));
  const histogram = new Map();
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const alpha = source.data[offset + 3];
    if (alpha !== 0 && alpha !== 255) {
      throw new Error(`Boss pixel art contains semi-transparent alpha ${alpha} at pixel ${offset / 4}.`);
    }
    if (alpha === 0) continue;
    const key = colorKey(source.data[offset], source.data[offset + 1], source.data[offset + 2]);
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  if (histogram.size === 0) throw new Error('Boss pixel art contains no opaque pixels.');
  const colors = [...histogram.entries()]
    .map(([key, count]) => colorFromKey(key, count))
    .sort((left, right) => (
      left.red - right.red || left.green - right.green || left.blue - right.blue
    ));
  const boxes = [createBox(colors)];
  while (boxes.length < colorLimit) {
    let candidateIndex = -1;
    let candidateScore = -1;
    boxes.forEach((box, index) => {
      if (box.colors.length > 1 && box.score > candidateScore) {
        candidateIndex = index;
        candidateScore = box.score;
      }
    });
    if (candidateIndex < 0) break;
    const split = splitBox(boxes[candidateIndex]);
    if (!split) break;
    boxes.splice(candidateIndex, 1, ...split);
  }
  const palette = boxes.map(averageBoxColor);
  const mapped = new Map();
  const output = new PNG({ width: source.width, height: source.height, colorType: 6 });
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const alpha = source.data[offset + 3];
    if (alpha === 0) {
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
      continue;
    }
    const key = colorKey(source.data[offset], source.data[offset + 1], source.data[offset + 2]);
    let replacement = mapped.get(key);
    if (!replacement) {
      replacement = palette.reduce((best, candidate) => {
        const red = source.data[offset] - candidate.red;
        const green = source.data[offset + 1] - candidate.green;
        const blue = source.data[offset + 2] - candidate.blue;
        const distance = red * red + green * green + blue * blue;
        return distance < best.distance ? { color: candidate, distance } : best;
      }, { color: palette[0], distance: Number.POSITIVE_INFINITY }).color;
      mapped.set(key, replacement);
    }
    output.data[offset] = replacement.red;
    output.data[offset + 1] = replacement.green;
    output.data[offset + 2] = replacement.blue;
    output.data[offset + 3] = 255;
  }
  return Object.freeze({
    image: output,
    palette: Object.freeze(palette),
    before: analyzeBossPixelArtPng(source),
    after: analyzeBossPixelArtPng(output)
  });
};

export const quantizeBossPixelArtFile = async ({ inputPath, outputPath, maximumColors = 32 }) => {
  const input = PNG.sync.read(await readFile(inputPath));
  const result = quantizeBossPixelArt(input, maximumColors);
  await writeFile(outputPath, PNG.sync.write(result.image, { colorType: 6 }));
  return Object.freeze({
    inputPath: path.resolve(inputPath),
    outputPath: path.resolve(outputPath),
    palette: result.palette,
    before: result.before,
    after: result.after
  });
};

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const [inputPath, outputPath, colorArg] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node tools/quantize-boss-pixel-art.mjs <input.png> <output.png> [maximum-colors]');
  }
  const result = await quantizeBossPixelArtFile({
    inputPath,
    outputPath,
    maximumColors: colorArg === undefined ? 32 : Number(colorArg)
  });
  process.stdout.write(`${JSON.stringify({
    inputPath: result.inputPath,
    outputPath: result.outputPath,
    before: result.before,
    after: result.after
  })}\n`);
}

