const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const { PNG } = require(path.join(root, 'director', 'node_modules', 'pngjs'));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const readText = (relativePath) => read(relativePath).toString('utf8');

const presentationSource = readText(
  'services/gameplay/bosses/BottleneckDronePresentation.ts'
);
const presentationCompiled = ts.transpileModule(presentationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const presentationModule = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${presentationCompiled} })(module.exports, require, module);`,
  {
    module: presentationModule,
    exports: presentationModule.exports,
    require,
    Math,
    Number,
    Object
  }
);

const {
  BOTTLENECK_DRONE_BOSS_ID,
  isBottleneckDroneCharging,
  resolveBottleneckDroneFrameIndex
} = presentationModule.exports;

const frameRoot = path.join(
  root,
  'public',
  'game-art',
  'generated',
  'elite-enemies',
  'bottleneck-drone-v3'
);
const manifest = JSON.parse(fs.readFileSync(path.join(frameRoot, 'manifest.json'), 'utf8'));

test('Bottleneck Drone visual remake preserves the authored M03 combat contract', () => {
  const campaign = JSON.parse(readText('game-config/campaign.json'));
  const occurrences = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => (
      wave.events
        .filter((event) => event.bossId === BOTTLENECK_DRONE_BOSS_ID)
        .map((event) => ({ levelId: level.id, waveId: wave.id, event }))
    ))
  ));

  assert.equal(occurrences.length, 1);
  const occurrence = occurrences[0];
  assert.equal(occurrence.levelId, 'stage-paywall-siege');
  assert.equal(occurrence.waveId, 'stage-paywall-siege-wave-5');
  assert.deepEqual(
    {
      health: occurrence.event.health,
      speed: occurrence.event.speed,
      damage: occurrence.event.damage,
      count: occurrence.event.count,
      movementPatternId: occurrence.event.movementPatternId,
      warningSeconds: occurrence.event.warningSeconds,
      durationSeconds: occurrence.event.durationSeconds,
      spriteScale: occurrence.event.spriteStyle?.scale,
      weapons: occurrence.event.weapons,
      phases: occurrence.event.phases
    },
    {
      health: 111,
      speed: 2,
      damage: 1,
      count: 1,
      movementPatternId: 'track-player',
      warningSeconds: 1.4,
      durationSeconds: 14,
      spriteScale: 1.15,
      weapons: [{
        id: 'mini-aimed-shot',
        weaponId: 'aimed-shot',
        attackIntervalSeconds: 3.2,
        damage: 1,
        projectileSpeed: 4.4,
        burstCount: 1
      }],
      phases: [{
        id: 'mini-standard',
        label: 'Tracking fire',
        triggerHealthRatio: 1,
        movementPatternId: 'track-player',
        speedMultiplier: 1,
        weaponSettingIds: ['mini-aimed-shot']
      }]
    }
  );
});

test('Bottleneck Drone frames share one crisp 7:8 canvas and one bounded palette', () => {
  assert.equal(manifest.id, 'bottleneck-drone-v3');
  assert.deepEqual(manifest.processing.targetFrame, { width: 140, height: 160 });
  assert.equal(manifest.processing.alpha, 'binary');
  assert.equal(manifest.processing.scaling, 'nearest-neighbor');
  assert.equal(manifest.processing.structuralComponentPolicy, 'largest-connected-component-only');
  assert.equal(manifest.processing.sourceFrameGutterPixels, 4);
  assert.equal(manifest.processing.transparentSafetyMarginPixels, 4);
  assert.ok(manifest.processing.sharedPaletteSize <= 32);
  assert.deepEqual(
    manifest.frames.map((frame) => frame.id),
    ['neutral', 'idle', 'charge', 'fire', 'recovery']
  );

  const hashes = new Set();
  for (const frameDefinition of manifest.frames) {
    const bytes = fs.readFileSync(path.join(frameRoot, frameDefinition.path));
    const image = PNG.sync.read(bytes);
    assert.equal(image.width, 140);
    assert.equal(image.height, 160);
    const colors = new Set();
    let visiblePixels = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const alpha = image.data[offset + 3];
      assert.ok(alpha === 0 || alpha === 255, `${frameDefinition.id} must use binary alpha`);
      if (alpha === 0) continue;
      visiblePixels += 1;
      colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
    }
    assert.ok(visiblePixels > 6_000, `${frameDefinition.id} should remain readable at gameplay size`);
    assert.ok(colors.size <= 32, `${frameDefinition.id} exceeds the shared palette budget`);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 5, 'every presentation state must be a distinct authored frame');

  const centroidXs = manifest.frames.map((frame) => frame.centroid.x);
  assert.ok(
    Math.max(...centroidXs) - Math.min(...centroidXs) < 2,
    'state frames must keep the same horizontal root registration'
  );
  const neutralY = manifest.frames[0].centroid.y;
  for (const frame of manifest.frames.filter(({ id }) => id !== 'fire')) {
    assert.ok(
      Math.abs(frame.centroid.y - neutralY) < 2,
      `${frame.id} must not vertically jump or squash`
    );
  }

  const sheet = PNG.sync.read(fs.readFileSync(path.join(frameRoot, manifest.spriteSheet)));
  assert.equal(sheet.width, 140 * manifest.frames.length);
  assert.equal(sheet.height, 160);
  manifest.frames.forEach((frameDefinition, frameIndex) => {
    const frame = PNG.sync.read(fs.readFileSync(path.join(frameRoot, frameDefinition.path)));
    for (let y = 0; y < frame.height; y += 1) {
      const frameRow = frame.data.subarray(y * frame.width * 4, (y + 1) * frame.width * 4);
      const sheetStart = (y * sheet.width + frameIndex * frame.width) * 4;
      const sheetRow = sheet.data.subarray(sheetStart, sheetStart + frame.width * 4);
      assert.deepEqual(sheetRow, frameRow, `${frameDefinition.id} must round-trip into the sheet cell`);
    }
  });
});

test('Bottleneck Drone presentation uses state-driven frames without changing attack cadence', () => {
  assert.equal(isBottleneckDroneCharging({ attackTimer: 155, cadenceFrames: 180 }), false);
  assert.equal(isBottleneckDroneCharging({ attackTimer: 156, cadenceFrames: 180 }), true);
  assert.equal(isBottleneckDroneCharging({ attackTimer: 179, cadenceFrames: 180 }), true);
  assert.equal(isBottleneckDroneCharging({ attackTimer: 180, cadenceFrames: 180 }), false);

  assert.equal(resolveBottleneckDroneFrameIndex({
    frameCount: 0,
    lastFireFrame: -999,
    isCharging: false
  }), 0);
  assert.equal(resolveBottleneckDroneFrameIndex({
    frameCount: 30,
    lastFireFrame: -999,
    isCharging: false
  }), 1);
  assert.equal(resolveBottleneckDroneFrameIndex({
    frameCount: 95,
    lastFireFrame: -999,
    isCharging: true
  }), 2);
  assert.equal(resolveBottleneckDroneFrameIndex({
    frameCount: 100,
    lastFireFrame: 100,
    isCharging: false
  }), 3);
  assert.equal(resolveBottleneckDroneFrameIndex({
    frameCount: 108,
    lastFireFrame: 100,
    isCharging: false
  }), 4);

  const engineSource = readText('services/gameLogic.ts');
  const rendererSource = readText('services/pixi/PixiGameRenderer.ts');
  assert.match(engineSource, /configured\.bossId === BOTTLENECK_DRONE_BOSS_ID/);
  assert.match(engineSource, /mb\.spriteFrames = \[\.\.\.ASSETS\.BOTTLENECK_DRONE_FRAMES\]/);
  assert.match(engineSource, /boss\.campaignLastFireFrame = this\.frameCount/);
  assert.match(engineSource, /if \(boss\.attackTimer % shootRate === 0\)/);
  assert.ok(
    rendererSource.match(/\.\.\.ASSETS\.BOTTLENECK_DRONE_FRAMES/g)?.length >= 2,
    'campaign and preview startup paths must preload every short-lived state frame'
  );
});

test('Bottleneck Drone neutral art owns the generated alpha collision mask', () => {
  const neutralUrl = '/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-01-neutral.png';
  const constantsSource = readText('constants.ts');
  const maskGenerator = readText('tools/generate-boss-collision-masks.mjs');
  const generatedMasks = readText('services/gameplay/bosses/generatedBossCollisionMasks.ts');

  assert.ok(constantsSource.includes(`MINI_BOSS: "${neutralUrl}"`));
  assert.ok(maskGenerator.includes(`key: '${neutralUrl}'`));
  assert.ok(generatedMasks.includes(JSON.stringify(neutralUrl)));
  assert.ok(!maskGenerator.includes("key: '/game-art/bosses/mini-boss-drone.png'"));
});

test('sprite frame safety removes detached sheet fragments and protects transparent margins', async () => {
  const safetyModule = await import(pathToFileURL(
    path.join(root, 'tools', 'sprite-frame-safety.mjs')
  ).href);
  const sample = new PNG({ width: 20, height: 20, colorType: 6 });
  for (let y = 6; y <= 13; y += 1) {
    for (let x = 6; x <= 13; x += 1) {
      const offset = (y * sample.width + x) * 4;
      sample.data[offset] = 20;
      sample.data[offset + 1] = 220;
      sample.data[offset + 2] = 255;
      sample.data[offset + 3] = 255;
    }
  }
  for (let y = 7; y <= 11; y += 1) {
    const offset = (y * sample.width + 18) * 4;
    sample.data[offset] = 255;
    sample.data[offset + 3] = 255;
  }

  assert.equal(safetyModule.analyzeOpaqueComponents(sample).length, 2);
  const cleanup = safetyModule.keepLargestOpaqueComponent(sample);
  assert.equal(cleanup.discardedComponentCount, 1);
  assert.equal(cleanup.discardedPixelCount, 5);
  assert.equal(safetyModule.analyzeOpaqueComponents(sample).length, 1);
  assert.doesNotThrow(() => safetyModule.assertTransparentFrameMargin(sample, 4));

  const duplicateSubject = PNG.sync.read(PNG.sync.write(sample));
  for (let y = 1; y <= 4; y += 1) {
    for (let x = 1; x <= 4; x += 1) {
      duplicateSubject.data[(y * duplicateSubject.width + x) * 4 + 3] = 255;
    }
  }
  assert.throws(
    () => safetyModule.keepLargestOpaqueComponent(duplicateSubject),
    /second subject occupying/
  );

  const unsafeMargin = new PNG({ width: 20, height: 20, colorType: 6 });
  unsafeMargin.data[(10 * unsafeMargin.width + 1) * 4 + 3] = 255;
  assert.throws(
    () => safetyModule.assertTransparentFrameMargin(unsafeMargin, 4),
    /safety margin/
  );

  const sourceStrip = new PNG({ width: 40, height: 20, colorType: 6 });
  sourceStrip.data[(10 * sourceStrip.width + 20) * 4 + 3] = 255;
  assert.throws(
    () => safetyModule.assertTransparentFrameGutters(sourceStrip, 2, 2),
    /divider 1\/2.*opaque pixels/
  );

  const sourceSheet = PNG.sync.read(fs.readFileSync(path.join(
    root,
    manifest.source.path
  )));
  assert.doesNotThrow(() => safetyModule.assertTransparentFrameGutters(
    sourceSheet,
    manifest.frames.length,
    manifest.processing.sourceFrameGutterPixels
  ));

  for (const frameDefinition of manifest.frames) {
    const image = PNG.sync.read(fs.readFileSync(path.join(frameRoot, frameDefinition.path)));
    assert.equal(
      safetyModule.analyzeOpaqueComponents(image).length,
      1,
      `${frameDefinition.id} must contain one connected structural sprite`
    );
    assert.doesNotThrow(
      () => safetyModule.assertTransparentFrameMargin(image, 4),
      `${frameDefinition.id} must retain transparent frame padding`
    );
  }
});
