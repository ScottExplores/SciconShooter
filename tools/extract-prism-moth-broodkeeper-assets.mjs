import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  analyzeBossPixelArtPng,
  quantizeBossPixelArt
} from './quantize-boss-pixel-art.mjs';

const requireFromDirector = createRequire(new URL('../director/package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirectory = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'prism-moth-broodkeeper'
);
const layoutPath = path.join(packageDirectory, 'source-layout.json');
const rigSourcePath = path.join(packageDirectory, 'rig.source.json');
const designContractPath = path.join(packageDirectory, 'design-contract.md');
const attackSpriteMapPath = path.join(
  packageDirectory,
  'prism-moth-broodkeeper.attack-sprite-map.json'
);
const verifyOnly = process.argv.includes('--verify');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableJson = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const pngBytes = (image) => PNG.sync.write(image, {
  colorType: 6,
  inputColorType: 6,
  inputHasAlpha: true,
  deflateLevel: 9,
  deflateStrategy: 3
});

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const toRepositoryPath = (value) => path.join(repositoryRoot, ...value.split('/'));
const toPackagePath = (value) => path.join(packageDirectory, ...value.split('/'));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertRect = (rect, image, label) => {
  assert(
    rect
      && Number.isInteger(rect.x)
      && Number.isInteger(rect.y)
      && Number.isInteger(rect.width)
      && Number.isInteger(rect.height),
    `${label} needs integer source bounds.`
  );
  assert(
    rect.x >= 0
      && rect.y >= 0
      && rect.width > 0
      && rect.height > 0
      && rect.x + rect.width <= image.width
      && rect.y + rect.height <= image.height,
    `${label} source bounds exceed ${image.width}x${image.height}.`
  );
};

const assertPinnedImage = (bytes, image, descriptor, label) => {
  assert(sha256(bytes) === descriptor.sha256, `${label} hash changed; audit the new source first.`);
  assert(
    image.width === descriptor.width && image.height === descriptor.height,
    `${label} dimensions changed; expected ${descriptor.width}x${descriptor.height}.`
  );
};

const binaryAlphaCopy = (source) => {
  const output = new PNG({ width: source.width, height: source.height, colorType: 6 });
  for (let offset = 0; offset < source.data.length; offset += 4) {
    if (source.data[offset + 3] === 0) {
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
      continue;
    }
    output.data[offset] = source.data[offset];
    output.data[offset + 1] = source.data[offset + 1];
    output.data[offset + 2] = source.data[offset + 2];
    output.data[offset + 3] = 255;
  }
  return output;
};

const countVisiblePixels = (image) => {
  let result = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] !== 0) result += 1;
  }
  return result;
};

const visibleBounds = (image, label) => {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[((y * image.width + x) * 4) + 3] === 0) continue;
      pixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  assert(pixels > 0, `${label} contains no visible pixels.`);
  return Object.freeze({
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    visiblePixels: pixels
  });
};

const cropWithGutter = (source, rect, gutter, outputWidth, outputHeight) => {
  const width = outputWidth ?? rect.width + gutter * 2;
  const height = outputHeight ?? rect.height + gutter * 2;
  const output = new PNG({ width, height, colorType: 6 });
  const targetX = gutter + Math.floor((width - gutter * 2 - rect.width) / 2);
  PNG.bitblt(source, output, rect.x, rect.y, rect.width, rect.height, targetX, gutter);
  return output;
};

const pasteOpaque = (source, target, targetX, targetY) => {
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    const y = targetY + sourceY;
    if (y < 0 || y >= target.height) continue;
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const x = targetX + sourceX;
      if (x < 0 || x >= target.width) continue;
      const sourceOffset = ((sourceY * source.width + sourceX) * 4);
      if (source.data[sourceOffset + 3] === 0) continue;
      const targetOffset = ((y * target.width + x) * 4);
      target.data[targetOffset] = source.data[sourceOffset];
      target.data[targetOffset + 1] = source.data[sourceOffset + 1];
      target.data[targetOffset + 2] = source.data[sourceOffset + 2];
      target.data[targetOffset + 3] = 255;
    }
  }
};

const blendSourceOver = (source, target, targetX, targetY) => {
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    const y = targetY + sourceY;
    if (y < 0 || y >= target.height) continue;
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const x = targetX + sourceX;
      if (x < 0 || x >= target.width) continue;
      const sourceOffset = ((sourceY * source.width + sourceX) * 4);
      const sourceAlpha = source.data[sourceOffset + 3] / 255;
      if (sourceAlpha === 0) continue;
      const targetOffset = ((y * target.width + x) * 4);
      const targetAlpha = target.data[targetOffset + 3] / 255;
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const sourceValue = source.data[sourceOffset + channel];
        const targetValue = target.data[targetOffset + channel];
        target.data[targetOffset + channel] = Math.round(
          (sourceValue * sourceAlpha + targetValue * targetAlpha * (1 - sourceAlpha))
          / Math.max(outputAlpha, Number.EPSILON)
        );
      }
      target.data[targetOffset + 3] = Math.round(outputAlpha * 255);
    }
  }
};

const nearestScale = (source, scale) => {
  if (scale === 1) return source;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const output = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
      const sourceOffset = ((sourceY * source.width + sourceX) * 4);
      const targetOffset = ((y * width + x) * 4);
      output.data[targetOffset] = source.data[sourceOffset];
      output.data[targetOffset + 1] = source.data[sourceOffset + 1];
      output.data[targetOffset + 2] = source.data[sourceOffset + 2];
      output.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }
  return output;
};

const nextPowerOfTwo = (value) => {
  let result = 1;
  while (result < value) result *= 2;
  return result;
};

const packAtlas = (orderedFrames) => {
  const width = 2048;
  const gutter = 4;
  let x = gutter;
  let y = gutter;
  let rowHeight = 0;
  const placements = [];
  orderedFrames.forEach((frame) => {
    if (x + frame.image.width + gutter > width) {
      x = gutter;
      y += rowHeight + gutter;
      rowHeight = 0;
    }
    placements.push(Object.freeze({
      frameId: frame.frameId,
      x,
      y,
      width: frame.image.width,
      height: frame.image.height
    }));
    x += frame.image.width + gutter;
    rowHeight = Math.max(rowHeight, frame.image.height);
  });
  const height = Math.max(512, nextPowerOfTwo(y + rowHeight + gutter));
  assert(height <= 2048, `Prism Moth atlas exceeded the 2048px budget (${width}x${height}).`);
  const atlas = new PNG({ width, height, colorType: 6 });
  placements.forEach((placement, index) => {
    pasteOpaque(orderedFrames[index].image, atlas, placement.x, placement.y);
  });
  return Object.freeze({ atlas, placements: Object.freeze(placements) });
};

const createNeutralAssembly = (rigSource, frameImages) => {
  const output = new PNG({
    width: rigSource.canvas.width,
    height: rigSource.canvas.height,
    colorType: 6
  });
  const partById = Object.fromEntries(rigSource.parts.map((part) => [part.id, part]));
  const resolved = Object.create(null);
  const resolve = (part) => {
    if (resolved[part.id]) return resolved[part.id];
    const transform = part.transform;
    assert(
      transform.scaleX === transform.scaleY && transform.scaleX > 0,
      `${part.id} must use one positive structural scale.`
    );
    assert(transform.rotationDegrees === 0, `${part.id} neutral extraction only supports zero rotation.`);
    if (part.parentId === null) {
      resolved[part.id] = Object.freeze({
        x: transform.x,
        y: transform.y,
        scale: transform.scaleX
      });
      return resolved[part.id];
    }
    const parent = partById[part.parentId];
    assert(parent, `${part.id} references missing parent ${part.parentId}.`);
    const parentTransform = resolve(parent);
    resolved[part.id] = Object.freeze({
      x: parentTransform.x + transform.x * parentTransform.scale,
      y: parentTransform.y + transform.y * parentTransform.scale,
      scale: parentTransform.scale * transform.scaleX
    });
    return resolved[part.id];
  };
  const declarationOrder = new Map(rigSource.parts.map((part, index) => [part.id, index]));
  [...rigSource.parts]
    .sort((left, right) => (
      left.layer - right.layer
      || declarationOrder.get(left.id) - declarationOrder.get(right.id)
    ))
    .forEach((part) => {
      resolve(part);
      if (!part.neutralVisible || part.frameId === null) return;
      const source = frameImages.get(part.frameId);
      assert(source, `${part.id} references missing frame ${part.frameId}.`);
      assert(part.anchor, `${part.id} needs a sprite anchor.`);
      const world = resolved[part.id];
      const scaled = nearestScale(source, world.scale);
      const targetX = Math.round(world.x - part.anchor.x * scaled.width);
      const targetY = Math.round(world.y - part.anchor.y * scaled.height);
      pasteOpaque(scaled, output, targetX, targetY);
    });
  return output;
};

const fill = (image, red, green, blue, alpha = 255) => {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = alpha;
  }
};

const createReferenceComparison = (reference, neutral) => {
  const output = new PNG({ width: 1024, height: 512, colorType: 6 });
  fill(output, 2, 10, 22, 255);
  blendSourceOver(reference, output, Math.floor((512 - reference.width) / 2), Math.floor((512 - reference.height) / 2));
  blendSourceOver(neutral, output, 512, 0);
  for (let y = 0; y < output.height; y += 1) {
    for (const x of [510, 511, 512, 513]) {
      const offset = ((y * output.width + x) * 4);
      output.data[offset] = 18;
      output.data[offset + 1] = 169;
      output.data[offset + 2] = 194;
      output.data[offset + 3] = 255;
    }
  }
  return output;
};

const sampleNormalizedMask = (image, bounds, size = 256) => {
  const result = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(
      bounds.y + bounds.height - 1,
      bounds.y + Math.floor(((y + 0.5) * bounds.height) / size)
    );
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(
        bounds.x + bounds.width - 1,
        bounds.x + Math.floor(((x + 0.5) * bounds.width) / size)
      );
      result[y * size + x] = image.data[((sourceY * image.width + sourceX) * 4) + 3] > 0 ? 1 : 0;
    }
  }
  return result;
};

const compareSilhouettes = (reference, neutral) => {
  const referenceBounds = visibleBounds(reference, 'canonical reference');
  const neutralBounds = visibleBounds(neutral, 'neutral assembly');
  const referenceMask = sampleNormalizedMask(reference, referenceBounds);
  const neutralMask = sampleNormalizedMask(neutral, neutralBounds);
  let intersection = 0;
  let union = 0;
  let referenceCoverage = 0;
  let neutralCoverage = 0;
  for (let index = 0; index < referenceMask.length; index += 1) {
    const left = referenceMask[index];
    const right = neutralMask[index];
    if (left) referenceCoverage += 1;
    if (right) neutralCoverage += 1;
    if (left && right) intersection += 1;
    if (left || right) union += 1;
  }
  return Object.freeze({
    schemaVersion: 1,
    bossId: 'prism-moth-broodkeeper',
    comparison: 'normalized-visible-bounds-alpha-mask',
    referenceBounds,
    neutralBounds,
    normalizedGrid: { width: 256, height: 256 },
    silhouetteIntersectionOverUnion: Number((intersection / Math.max(1, union)).toFixed(6)),
    referenceCoverage: Number((referenceCoverage / referenceMask.length).toFixed(6)),
    neutralCoverage: Number((neutralCoverage / neutralMask.length).toFixed(6)),
    referenceAspectRatio: Number((referenceBounds.width / referenceBounds.height).toFixed(6)),
    neutralAspectRatio: Number((neutralBounds.width / neutralBounds.height).toFixed(6)),
    note: 'This metric is a regression signal for attachment and silhouette drift, not a requirement to duplicate the flattened reference pixel-for-pixel.'
  });
};

const attachmentPurpose = (partId) => {
  if (partId === 'root') return 'Boss-space root and motion origin.';
  if (partId === 'body') return 'Thorax owner for core, abdomen, crest, and shoulders.';
  if (partId === 'core') return 'Prism charge, release, exposure, and overload origin.';
  if (partId === 'abdomen') return 'Living lower-body counter-motion and brood pulse anatomy.';
  if (partId === 'crest') return 'Head/crest illumination and phase silhouette.';
  if (partId.startsWith('shoulder.')) return 'Visible handed wing-root feather and parent pivot.';
  if (partId.startsWith('wing.')) return 'Rigid crystal wing segment attached to its authored shoulder.';
  if (partId.startsWith('brood-pod.')) return 'Visible anatomy-owned cocoon and brood release organ.';
  return 'Authored Prism Moth anatomy.';
};

const createRigPivotManifest = (rig, frameMetadata, layout) => {
  const componentByFrame = Object.fromEntries(
    layout.anatomyComponents.map((component) => [component.frameId, component])
  );
  return Object.freeze({
    schemaVersion: 1,
    bossId: rig.bossId,
    coordinateSpace: '512x512 neutral preview; child transforms are parent-local',
    scalePolicy: 'Positive uniform structural scale only; scaleX must equal scaleY.',
    handednessPolicy: 'Left and right textures are independently authored and never mirrored.',
    parts: rig.parts.map((part) => {
      const frame = part.frameId === null ? null : frameMetadata[part.frameId];
      const source = part.frameId === null ? null : componentByFrame[part.frameId] ?? null;
      return Object.freeze({
        partId: part.id,
        role: part.role,
        parentId: part.parentId,
        frameId: part.frameId,
        handedness: source?.handedness ?? 'transform-only',
        anchor: part.anchor ?? null,
        pivotPixels: frame && part.anchor
          ? Object.freeze({
              x: Number((frame.width * part.anchor.x).toFixed(3)),
              y: Number((frame.height * part.anchor.y).toFixed(3))
            })
          : null,
        neutralLocalTransform: part.transform,
        sourceBounds: source?.sourceBounds ?? null,
        purpose: attachmentPurpose(part.id)
      });
    }),
    sockets: rig.sockets.map((socket) => Object.freeze({
      ...socket,
      followsLivePartTransform: true
    }))
  });
};

const createAssetUsage = (layout, componentRecords, sourceRecords) => Object.freeze({
  schemaVersion: 1,
  bossId: layout.bossId,
  complete: true,
  sourceAssets: Object.freeze([
    Object.freeze({
      id: 'canonical-reference',
      status: 'archived',
      classification: 'forbidden',
      file: layout.sources['canonical-reference'].localFile,
      sha256: layout.sources['canonical-reference'].sha256,
      usedBy: ['reference comparison'],
      reason: 'Flattened guide is never a runtime texture.'
    }),
    Object.freeze({
      id: 'component-source-atlas',
      status: 'archived',
      classification: 'forbidden',
      file: layout.sources['component-atlas'].localFile,
      sha256: layout.sources['component-atlas'].sha256,
      usedBy: ['deterministic anatomy extraction'],
      reason: 'Unpacked source board is retained for provenance and never registered directly.'
    }),
    Object.freeze({
      id: 'brood-lifecycle-source',
      status: 'archived',
      classification: 'forbidden',
      file: layout.sources['brood-lifecycle'].localFile,
      sha256: layout.sources['brood-lifecycle'].sha256,
      usedBy: ['broodling and cocoon frame extraction'],
      reason: 'Generated source sheet is converted into equal-canvas runtime frames.'
    }),
    Object.freeze({
      id: 'brood-lifecycle-chroma',
      status: 'archived',
      classification: 'archived',
      file: layout.sources['brood-lifecycle-chroma'].localFile,
      sha256: sourceRecords.chromaSha256,
      usedBy: [],
      reason: 'Generation intermediary retained for provenance only.'
    })
  ]),
  frames: Object.freeze(componentRecords.map((record) => Object.freeze({
    frameId: record.frameId,
    file: record.outputFile,
    sha256: record.sha256,
    width: record.width,
    height: record.height,
    visiblePixels: record.visiblePixels,
    status: record.usage.includes('neutral') ? 'neutral' : 'attack',
    classification: 'used',
    sourceId: record.sourceId,
    sourceBounds: record.sourceBounds,
    usedBy: record.usage
  }))),
  retainedExternalAssets: Object.freeze([
    Object.freeze({
      id: 'prism-feather',
      classification: 'used',
      status: 'attack',
      ...layout.retainedExternalAttackArt['prism-feather'],
      usedBy: ['Prism Wingbeat Weave', 'Lunar Prism Swoop']
    })
  ]),
  archivedRuntimeFrames: Object.freeze([]),
  missingRuntimeFrames: Object.freeze([])
});

const ACCEPTED_PRISM_ATTACKS = Object.freeze({
  'wingbeat-weave': Object.freeze({
    label: 'Prism Wingbeat Weave',
    role: 'core',
    captures: Object.freeze([
      'review/runtime-v0.19/attack1-01-telegraph.png',
      'review/runtime-v0.19/attack1-02-left-wingbeat.png',
      'review/runtime-v0.19/attack1-03-right-wingbeat.png',
      'review/runtime-v0.19/attack1-04-weave.png',
      'review/runtime-v0.19/attack1-05-recovery.png'
    ])
  }),
  'brood-procession': Object.freeze({
    label: 'Brood Procession',
    role: 'core',
    captures: Object.freeze([
      'review/runtime-v0.19/attack2-01-fold-charge.png',
      'review/runtime-v0.19/attack2-02-cocoon-deploy.png',
      'review/runtime-v0.19/attack2-03-hatching.png',
      'review/runtime-v0.19/attack2-04-formation.png',
      'review/runtime-v0.19/attack2-05-second-procession.png'
    ])
  }),
  'lunar-prism-swoop': Object.freeze({
    label: 'Lunar Prism Swoop',
    role: 'core',
    captures: Object.freeze([
      'review/runtime-v0.19/attack3-01.png',
      'review/runtime-v0.19/attack3-02.png',
      'review/runtime-v0.19/attack3-03.png',
      'review/runtime-v0.19/attack3-04.png',
      'review/runtime-v0.19/attack3-05.png'
    ])
  }),
  'kaleidoscope-brood': Object.freeze({
    label: 'Kaleidoscope Brood',
    role: 'signature',
    captures: Object.freeze([
      'review/runtime-v0.19/attack4-01-cocoon-charge.png',
      'review/runtime-v0.19/attack4-02-core-full-charge.png',
      'review/runtime-v0.19/attack4-03-first-command.png',
      'review/runtime-v0.19/attack4-04-second-corridor.png',
      'review/runtime-v0.19/attack4-05-core-escape.png'
    ])
  })
});

const ACCEPTED_PRISM_FORMATIONS = Object.freeze([
  'mirrored-arcs',
  'alternating-diagonals',
  'v-opening',
  'split-corridor',
  'staggered-wave',
  'center-bloom'
]);

const ACCEPTED_PRISM_ROUTE_PROOFS = Object.freeze({
  mobile: Object.freeze({
    width: 390,
    height: 844,
    attacks: Object.freeze({
      'wingbeat-weave': Object.freeze({
        minimum: 43.5,
        hash: '46266ae08385c1ffc7a1c38ef167bf9b1dc826dd3d91f01b4fd7e8d917facfaa'
      }),
      'brood-procession': Object.freeze({
        minimum: 43.5,
        hash: '3ce975ce6c924aa8cb0938725a312002251d22c782238704a2a6e90738f05d51'
      }),
      'lunar-prism-swoop': Object.freeze({
        minimum: 205.18936327403037,
        hash: '2f165f7ecb5ba792e02371abdede6820eabda11b511de06452c6cde6945a6539'
      }),
      'kaleidoscope-brood': Object.freeze({
        minimum: 35.7,
        hash: '31a82e5bbbd61b96d580385c0ed035d687766bceb24d5cc6982a625ed38dccdb'
      })
    })
  }),
  desktop: Object.freeze({
    width: 1280,
    height: 720,
    attacks: Object.freeze({
      'wingbeat-weave': Object.freeze({
        minimum: 177,
        hash: '52390ae5c5c7a9592eff00f0fa8c3d37e571585efede48fe8853f6099c904ae4'
      }),
      'brood-procession': Object.freeze({
        minimum: 177,
        hash: '40aabab47f56268764a254074dbe43ce756a37cdd6f887af77ea7929d7921be3'
      }),
      'lunar-prism-swoop': Object.freeze({
        minimum: 91.1141487645757,
        hash: 'def202bab14273e674d642ce7e96f35e13eac08feeef94a7fa8d57f199f927a1'
      }),
      'kaleidoscope-brood': Object.freeze({
        minimum: 151.4,
        hash: 'f5bcf011c516507972a66f7dd14b21580e2a75d16c80cc78d06cb42c7d6b08b4'
      })
    })
  })
});

const sameOrderedValues = (actual, expected) => (
  Array.isArray(actual)
  && actual.length === expected.length
  && actual.every((value, index) => value === expected[index])
);

/**
 * The attack-to-sprite map is authored review evidence, like the design
 * contract, because it pins capture paths and independently reviewed route
 * witnesses that cannot be derived from the source atlas. Keep it canonical,
 * content-addressed, and semantically validated before the package manifest is
 * rebuilt. This preserves the authored record through write mode without
 * reducing it to the former assets-only projection.
 */
const validateAttackSpriteMap = (record, layout) => {
  assert(record.schemaVersion === 1, 'Prism attack map schema changed.');
  assert(record.recordVersion === 'runtime-v0.19', 'Prism attack map review version changed.');
  assert(record.artifactType === 'scicon-boss-factory-attack-sprite-map', 'Prism attack map type changed.');
  assert(record.bossId === layout.bossId, 'Prism attack map boss ID differs from source layout.');
  assert(record.sandboxPrototypeId === 'prism-moth-brood', 'Prism Sandbox prototype ID changed.');
  assert(record.runtimeEventId === 'sandbox-prism-moth-brood', 'Prism runtime event ID changed.');
  assert(record.campaignApproved === false, 'Prism attack map must remain Sandbox-only.');
  assert(
    record.factoryStatus === 'factory-ready-sandbox-co-benchmark',
    'Prism Factory classification changed without a new review record.'
  );
  assert(record.fixedSeed === 'scicon-simple-boss-sandbox', 'Prism fixed seed changed.');
  assert(
    record.compiledPreviewSha256 === '3c581d57b56447c9fa845754b2e3b80666413e5d45f0492536415b8eb0b0e560',
    'Prism compiled-preview proof hash changed.'
  );

  const presentation = record.normalGameplayPresentation ?? {};
  for (const key of [
    'attackNamesVisible',
    'beatOrStateLabelsVisible',
    'safeRouteTextVisible',
    'predictedTrajectoryVisible',
    'aimingLinesVisible',
    'socketOrJointGuidesVisible',
    'partBoundsVisible',
    'hitboxesVisible'
  ]) {
    assert(presentation[key] === false, `Prism normal-gameplay presentation regressed: ${key}.`);
  }

  const feather = record.assets?.['prism-feather'];
  const featherSource = layout.retainedExternalAttackArt['prism-feather'];
  assert(feather?.file === featherSource.file, 'Prism feather file changed.');
  assert(feather?.sha256 === featherSource.sha256, 'Prism feather hash changed.');
  assert(feather?.frameCount === featherSource.frameCount, 'Prism feather frame count changed.');
  assert(feather?.nativeForwardAxis === 'up', 'Prism feather forward axis is no longer pinned.');
  assert(
    sameOrderedValues(
      record.assets?.['prism-broodling']?.frameIds,
      ['broodling.flutter.0', 'broodling.flutter.1', 'broodling.flutter.2', 'broodling.flutter.3']
    ),
    'Prism broodling lifecycle frames changed.'
  );
  assert(
    sameOrderedValues(
      record.assets?.['prism-cocoon']?.states,
      ['closed', 'armed', 'cracked', 'hatched']
    ),
    'Prism cocoon lifecycle states changed.'
  );

  const summon = record.summonLifecycle ?? {};
  assert(summon.damageRequiresVisibleActiveState === true, 'Prism summon damage visibility regressed.');
  assert(summon.cleanupOnOwnerLoss === true, 'Prism owner-loss cleanup regressed.');
  assert(summon.cleanupOnActionCancel === true, 'Prism action-cancel cleanup regressed.');
  assert(summon.cleanupOnActionReconstruction === true, 'Prism reconstruction cleanup regressed.');
  assert(summon.maximumBroodNodesPerWave === 6, 'Prism per-wave brood cap changed.');
  assert(summon.maximumBroodWaves === 2, 'Prism brood wave cap changed.');
  assert(summon.maximumOwnedBroodlings === 10, 'Prism owned-brood cap changed.');
  assert(
    sameOrderedValues(summon.formationTemplates, ACCEPTED_PRISM_FORMATIONS),
    'Prism retained formation templates changed.'
  );

  const attacks = Array.isArray(record.attacks) ? record.attacks : [];
  assert(attacks.length === 4, 'Prism attack map must contain exactly four attacks.');
  const attacksById = new Map(attacks.map((attack) => [attack.id, attack]));
  assert(attacksById.size === 4, 'Prism attack IDs must be unique.');
  const capturePaths = [];
  for (const [attackId, expected] of Object.entries(ACCEPTED_PRISM_ATTACKS)) {
    const attack = attacksById.get(attackId);
    assert(attack, `Prism attack map is missing ${attackId}.`);
    assert(attack.label === expected.label, `${attackId} label changed.`);
    assert(attack.role === expected.role, `${attackId} role changed.`);
    assert(Array.isArray(attack.movingParts) && attack.movingParts.length > 0, `${attackId} lost moving anatomy.`);
    assert(Array.isArray(attack.spriteAnimations) && attack.spriteAnimations.length > 0, `${attackId} lost sprite animation.`);
    assert(Array.isArray(attack.emitterSockets) && attack.emitterSockets.length > 0, `${attackId} lost emitter sockets.`);
    assert(attack.preparation && attack.telegraph, `${attackId} lost preparation or telegraph.`);
    assert(Array.isArray(attack.connectedBeats) && attack.connectedBeats.length >= 4, `${attackId} lost connected beats.`);
    assert(attack.playerMovementRule && attack.recoil && attack.recovery, `${attackId} lost its movement/reaction contract.`);
    assert(attack.destroyedAnatomyFallback, `${attackId} lost its anatomy fallback.`);
    const actualCaptures = Object.values(attack.captures ?? {});
    assert(sameOrderedValues(actualCaptures, expected.captures), `${attackId} capture map changed.`);
    capturePaths.push(...actualCaptures);
  }
  assert(
    attacks.filter(({ role }) => role === 'core').length === 3
      && attacks.filter(({ role }) => role === 'signature').length === 1,
    'Prism attack map must retain three core attacks and one signature.'
  );

  const safety = record.deterministicSafety ?? {};
  assert(safety.requiredMinimumClearancePx === 6, 'Prism route floor changed.');
  assert(safety.geometryUncertaintyPx === 3, 'Prism geometry uncertainty changed.');
  const viewports = new Map((safety.viewports ?? []).map((viewport) => [viewport.id, viewport]));
  assert(viewports.size === 2, 'Prism route proof must retain mobile and desktop viewports.');
  for (const [viewportId, expectedViewport] of Object.entries(ACCEPTED_PRISM_ROUTE_PROOFS)) {
    const viewport = viewports.get(viewportId);
    assert(viewport, `Prism route proof is missing ${viewportId}.`);
    assert(
      viewport.width === expectedViewport.width && viewport.height === expectedViewport.height,
      `Prism ${viewportId} proof viewport changed.`
    );
    for (const [attackId, expectedProof] of Object.entries(expectedViewport.attacks)) {
      const proof = viewport.attacks?.[attackId];
      assert(proof, `Prism ${viewportId} proof is missing ${attackId}.`);
      assert(
        proof.minimumReplayedClearancePxAfterUncertainty === expectedProof.minimum,
        `Prism ${viewportId} ${attackId} clearance changed.`
      );
      assert(proof.routeSha256 === expectedProof.hash, `Prism ${viewportId} ${attackId} route hash changed.`);
    }
  }

  assert(record.phaseTwo?.triggerHealthRatio === 0.48, 'Prism Metamorphosis threshold changed.');
  assert(
    record.phaseTwo?.behaviorRemixes?.['kaleidoscope-brood'],
    'Prism phase-two signature remix is missing.'
  );
  assert(record.lifecycleEvidence?.neutral, 'Prism neutral lifecycle evidence is missing.');
  assert(Array.isArray(record.lifecycleEvidence?.stagger), 'Prism stagger evidence is missing.');
  assert(Array.isArray(record.lifecycleEvidence?.death), 'Prism death evidence is missing.');
  assert(
    typeof record.reusableLessonBoundary === 'string'
      && record.reusableLessonBoundary.includes('Do not make Prism'),
    'Prism-specific choreography boundary is missing.'
  );

  return Object.freeze(capturePaths);
};

const build = async () => {
  const [layoutBytes, rigSourceBytes, designContractBytes, attackSpriteMapBytes] = await Promise.all([
    readFile(layoutPath),
    readFile(rigSourcePath),
    readFile(designContractPath),
    readFile(attackSpriteMapPath)
  ]);
  const layout = JSON.parse(layoutBytes.toString('utf8'));
  const rigSource = JSON.parse(rigSourceBytes.toString('utf8'));
  const attackSpriteMap = JSON.parse(attackSpriteMapBytes.toString('utf8'));
  assert(layout.bossId === rigSource.bossId, 'Source layout and rig source boss IDs differ.');
  assert(layout.anatomyComponents.length === 16, 'Prism Moth requires exactly 16 audited anatomy components.');
  assert(layout.lifecycleFrames.length === 8, 'Prism Moth requires four broodling and four cocoon frames.');
  const attackCapturePaths = validateAttackSpriteMap(attackSpriteMap, layout);
  assert(
    attackSpriteMapBytes.equals(stableJson(attackSpriteMap)),
    'Prism attack map must use canonical stable JSON formatting.'
  );
  await Promise.all(attackCapturePaths.map((capturePath) => readFile(toPackagePath(capturePath))));

  const canonicalDescriptor = layout.sources['canonical-reference'];
  const atlasDescriptor = layout.sources['component-atlas'];
  const lifecycleDescriptor = layout.sources['brood-lifecycle'];
  const featherDescriptor = layout.retainedExternalAttackArt['prism-feather'];
  const [canonicalBytes, sourceAtlasBytes, lifecycleBytes, chromaBytes, featherBytes] = await Promise.all([
    readFile(toRepositoryPath(canonicalDescriptor.repositoryFile)),
    readFile(toRepositoryPath(atlasDescriptor.repositoryFile)),
    readFile(toPackagePath(lifecycleDescriptor.localFile)),
    readFile(toPackagePath(layout.sources['brood-lifecycle-chroma'].localFile)),
    readFile(toRepositoryPath(featherDescriptor.file))
  ]);
  const canonical = PNG.sync.read(canonicalBytes);
  const sourceAtlas = PNG.sync.read(sourceAtlasBytes);
  const lifecycle = PNG.sync.read(lifecycleBytes);
  assertPinnedImage(canonicalBytes, canonical, canonicalDescriptor, 'Prism Moth canonical reference');
  assertPinnedImage(sourceAtlasBytes, sourceAtlas, atlasDescriptor, 'Prism Moth component atlas');
  assertPinnedImage(lifecycleBytes, lifecycle, lifecycleDescriptor, 'Prism brood lifecycle sheet');
  assert(sha256(featherBytes) === featherDescriptor.sha256, 'Retained prism-feather sheet hash changed.');

  const quantizedAnatomy = quantizeBossPixelArt(
    binaryAlphaCopy(sourceAtlas),
    layout.paletteLimitPerSource
  ).image;
  const quantizedLifecycle = quantizeBossPixelArt(
    binaryAlphaCopy(lifecycle),
    layout.paletteLimitPerSource
  ).image;
  const frameImages = new Map();
  const componentRecords = [];
  const outputs = new Map();
  outputs.set(canonicalDescriptor.localFile, canonicalBytes);
  outputs.set(atlasDescriptor.localFile, sourceAtlasBytes);

  for (const component of layout.anatomyComponents) {
    assertRect(component.sourceBounds, sourceAtlas, component.frameId);
    const frame = cropWithGutter(
      quantizedAnatomy,
      component.sourceBounds,
      layout.componentGutter
    );
    const visiblePixels = countVisiblePixels(frame);
    assert(
      visiblePixels === component.expectedVisiblePixels,
      `${component.frameId} extracted ${visiblePixels} pixels; expected ${component.expectedVisiblePixels}.`
    );
    const bytes = pngBytes(frame);
    frameImages.set(component.frameId, frame);
    outputs.set(component.outputFile, bytes);
    componentRecords.push(Object.freeze({
      frameId: component.frameId,
      outputFile: component.outputFile,
      sha256: sha256(bytes),
      width: frame.width,
      height: frame.height,
      visiblePixels,
      sourceId: 'component-atlas',
      sourceBounds: component.sourceBounds,
      usage: component.usage
    }));
  }

  const lifecycleByFamily = Object.groupBy(layout.lifecycleFrames, (frame) => frame.family);
  for (const familyFrames of Object.values(lifecycleByFamily)) {
    const normalizedWidth = Math.max(...familyFrames.map((frame) => frame.sourceBounds.width))
      + layout.componentGutter * 2;
    const normalizedHeight = Math.max(...familyFrames.map((frame) => frame.sourceBounds.height))
      + layout.componentGutter * 2;
    for (const descriptor of familyFrames) {
      assertRect(descriptor.sourceBounds, lifecycle, descriptor.frameId);
      const frame = cropWithGutter(
        quantizedLifecycle,
        descriptor.sourceBounds,
        layout.componentGutter,
        normalizedWidth,
        normalizedHeight
      );
      const visiblePixels = countVisiblePixels(frame);
      assert(
        visiblePixels === descriptor.expectedVisiblePixels,
        `${descriptor.frameId} extracted ${visiblePixels} pixels; expected ${descriptor.expectedVisiblePixels}.`
      );
      const bytes = pngBytes(frame);
      frameImages.set(descriptor.frameId, frame);
      outputs.set(descriptor.outputFile, bytes);
      componentRecords.push(Object.freeze({
        frameId: descriptor.frameId,
        outputFile: descriptor.outputFile,
        sha256: sha256(bytes),
        width: frame.width,
        height: frame.height,
        visiblePixels,
        sourceId: 'brood-lifecycle',
        sourceBounds: descriptor.sourceBounds,
        usage: descriptor.usage
      }));
    }
  }

  const orderedFrameIds = [
    ...layout.anatomyComponents.map((component) => component.frameId),
    ...layout.lifecycleFrames.map((frame) => frame.frameId)
  ];
  assert(new Set(orderedFrameIds).size === 24, 'Prism Moth frame identifiers must be unique.');
  const { atlas, placements } = packAtlas(orderedFrameIds.map((frameId) => ({
    frameId,
    image: frameImages.get(frameId)
  })));
  const atlasAnalysis = analyzeBossPixelArtPng(atlas);
  assert(atlasAnalysis.semitransparentPixels === 0, 'Runtime atlas must use binary alpha.');
  assert(atlasAnalysis.opaquePaletteSize <= 96, `Runtime atlas palette is ${atlasAnalysis.opaquePaletteSize}; expected <= 96.`);
  const atlasBytes = pngBytes(atlas);
  const atlasHash = sha256(atlasBytes);
  const frameMetadata = Object.fromEntries(placements.map((placement) => [
    placement.frameId,
    Object.freeze({
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height
    })
  ]));
  const atlasMetadata = Object.freeze({
    schemaVersion: 1,
    bossId: layout.bossId,
    format: 'scicon-modular-boss-atlas-v1',
    image: Object.freeze({
      file: 'prism-moth-broodkeeper-atlas.png',
      sha256: atlasHash,
      width: atlas.width,
      height: atlas.height,
      binaryAlpha: true,
      opaquePaletteSize: atlasAnalysis.opaquePaletteSize
    }),
    frames: Object.freeze(frameMetadata),
    frameFamilies: Object.freeze({
      'broodling-flutter': ['broodling.flutter.0', 'broodling.flutter.1', 'broodling.flutter.2', 'broodling.flutter.3'],
      'cocoon-lifecycle': ['cocoon.lifecycle.0', 'cocoon.lifecycle.1', 'cocoon.lifecycle.2', 'cocoon.lifecycle.3']
    })
  });
  const atlasMetadataBytes = stableJson(atlasMetadata);
  outputs.set('prism-moth-broodkeeper-atlas.png', atlasBytes);
  outputs.set('prism-moth-broodkeeper-atlas.json', atlasMetadataBytes);

  const rig = Object.freeze({
    schemaVersion: 1,
    format: 'modular-hierarchy-v1',
    bossId: rigSource.bossId,
    canvas: rigSource.canvas,
    atlas: Object.freeze({
      file: 'prism-moth-broodkeeper-atlas.png',
      metadataFile: 'prism-moth-broodkeeper-atlas.json',
      sha256: atlasHash,
      width: atlas.width,
      height: atlas.height
    }),
    parts: rigSource.parts,
    sockets: rigSource.sockets,
    animations: rigSource.animations,
    states: rigSource.states,
    lifecycleFamilies: atlasMetadata.frameFamilies,
    provenance: Object.freeze({
      ...rigSource.provenance,
      componentSourceSha256: atlasDescriptor.sha256,
      lifecycleSourceSha256: lifecycleDescriptor.sha256,
      buildScript: 'tools/extract-prism-moth-broodkeeper-assets.mjs'
    })
  });
  const rigBytes = stableJson(rig);
  outputs.set('prism-moth-broodkeeper.rig.json', rigBytes);

  const neutral = createNeutralAssembly(rigSource, frameImages);
  const neutralAnalysis = analyzeBossPixelArtPng(neutral);
  assert(neutralAnalysis.semitransparentPixels === 0, 'Neutral assembly must use binary alpha.');
  assert(neutralAnalysis.opaquePixels > 20_000, 'Neutral assembly unexpectedly lost its anatomy.');
  const neutralBytes = pngBytes(neutral);
  outputs.set('prism-moth-broodkeeper-neutral.png', neutralBytes);

  const comparison = createReferenceComparison(canonical, neutral);
  const comparisonBytes = pngBytes(comparison);
  const comparisonMetrics = compareSilhouettes(canonical, neutral);
  const comparisonMetricsBytes = stableJson(comparisonMetrics);
  outputs.set('review/prism-moth-broodkeeper-reference-comparison.png', comparisonBytes);
  outputs.set('review/prism-moth-broodkeeper-reference-comparison.json', comparisonMetricsBytes);

  const pivotManifest = createRigPivotManifest(rig, frameMetadata, layout);
  const pivotManifestBytes = stableJson(pivotManifest);
  outputs.set('prism-moth-broodkeeper.rig-pivot-manifest.json', pivotManifestBytes);

  const sourceRecords = Object.freeze({ chromaSha256: sha256(chromaBytes) });
  const assetUsage = createAssetUsage(layout, componentRecords, sourceRecords);
  const assetUsageBytes = stableJson(assetUsage);
  outputs.set('prism-moth-broodkeeper.asset-usage.json', assetUsageBytes);

  outputs.set('prism-moth-broodkeeper.attack-sprite-map.json', attackSpriteMapBytes);

  const recordFor = (file, bytes, extra = {}) => Object.freeze({
    file,
    sha256: sha256(bytes),
    ...extra
  });
  const manifest = Object.freeze({
    schemaVersion: 1,
    bossId: layout.bossId,
    format: 'scicon-modular-boss-package-v1',
    inputs: Object.freeze({
      sourceLayout: recordFor('source-layout.json', layoutBytes),
      rigSource: recordFor('rig.source.json', rigSourceBytes),
      designContract: recordFor('design-contract.md', designContractBytes),
      canonicalReference: recordFor(canonicalDescriptor.localFile, canonicalBytes, {
        width: canonical.width,
        height: canonical.height
      }),
      componentAtlas: recordFor(atlasDescriptor.localFile, sourceAtlasBytes, {
        width: sourceAtlas.width,
        height: sourceAtlas.height,
        connectedComponentCount: 16
      }),
      broodLifecycle: recordFor(lifecycleDescriptor.localFile, lifecycleBytes, {
        width: lifecycle.width,
        height: lifecycle.height,
        frameCount: 8
      }),
      broodLifecycleChroma: recordFor(
        layout.sources['brood-lifecycle-chroma'].localFile,
        chromaBytes,
        { runtimeAllowed: false }
      ),
      retainedPrismFeather: recordFor(featherDescriptor.file, featherBytes, {
        runtimeAtlasOwnership: 'external'
      })
    }),
    outputs: Object.freeze({
      atlas: recordFor('prism-moth-broodkeeper-atlas.png', atlasBytes, {
        width: atlas.width,
        height: atlas.height,
        frameCount: orderedFrameIds.length,
        binaryAlpha: true,
        opaquePaletteSize: atlasAnalysis.opaquePaletteSize
      }),
      atlasMetadata: recordFor('prism-moth-broodkeeper-atlas.json', atlasMetadataBytes),
      rig: recordFor('prism-moth-broodkeeper.rig.json', rigBytes, {
        visiblePartCount: rig.parts.filter((part) => part.neutralVisible).length,
        socketCount: rig.sockets.length
      }),
      neutralPreview: recordFor('prism-moth-broodkeeper-neutral.png', neutralBytes, {
        width: neutral.width,
        height: neutral.height,
        binaryAlpha: true
      }),
      referenceComparison: recordFor(
        'review/prism-moth-broodkeeper-reference-comparison.png',
        comparisonBytes,
        { width: comparison.width, height: comparison.height }
      ),
      referenceMetrics: recordFor(
        'review/prism-moth-broodkeeper-reference-comparison.json',
        comparisonMetricsBytes
      ),
      rigPivotManifest: recordFor(
        'prism-moth-broodkeeper.rig-pivot-manifest.json',
        pivotManifestBytes
      ),
      assetUsage: recordFor('prism-moth-broodkeeper.asset-usage.json', assetUsageBytes),
      attackSpriteMap: recordFor(
        'prism-moth-broodkeeper.attack-sprite-map.json',
        attackSpriteMapBytes
      ),
      components: Object.freeze(componentRecords.map((record) => Object.freeze({
        frameId: record.frameId,
        file: record.outputFile,
        sha256: record.sha256,
        width: record.width,
        height: record.height,
        visiblePixels: record.visiblePixels
      })))
    }),
    validation: Object.freeze({
      exactAnatomySourceComponents: 16,
      runtimeAtlasFrames: orderedFrameIds.length,
      allSourceComponentsRetained: true,
      corruptLegacyCropsReused: false,
      binaryRuntimeAlpha: true,
      uniformStructuralScale: true,
      negativeScaleUsed: false,
      sourceHashesPinned: true,
      deterministicBuild: true,
      referenceSilhouetteIoU: comparisonMetrics.silhouetteIntersectionOverUnion
    })
  });
  outputs.set('prism-moth-broodkeeper.asset-manifest.json', stableJson(manifest));

  if (verifyOnly) {
    const mismatches = [];
    for (const [relativePath, expected] of outputs) {
      try {
        const actual = await readFile(toPackagePath(relativePath));
        if (!actual.equals(expected)) mismatches.push(relativePath);
      } catch {
        mismatches.push(relativePath);
      }
    }
    assert(
      mismatches.length === 0,
      `Prism Moth generated package is stale: ${mismatches.join(', ')}`
    );
    return Object.freeze({ manifest, verifiedFiles: outputs.size });
  }

  for (const [relativePath, bytes] of outputs) {
    const outputPath = toPackagePath(relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
  }
  return Object.freeze({ manifest, writtenFiles: outputs.size });
};

export const buildPrismMothBroodkeeperAssets = build;

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const result = await build();
  process.stdout.write(`${JSON.stringify({
    bossId: result.manifest.bossId,
    mode: verifyOnly ? 'verify' : 'write',
    atlas: result.manifest.outputs.atlas,
    neutralPreview: result.manifest.outputs.neutralPreview,
    files: result.verifiedFiles ?? result.writtenFiles
  })}\n`);
}
