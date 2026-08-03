const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const readSource = (...segments) => fs.readFileSync(path.join(repositoryRoot, ...segments), 'utf8');

const appSource = readSource('App.tsx');
const onboardingSource = readSource('components', 'SciconOnboarding.tsx');
const startScreenSource = readSource('components', 'StartScreen.tsx');

const EXPECTED_MILESTONES = [
  'welcome-home',
  'campaign-entry',
  'campaign-mission',
  'campaign-launch',
  'flight-controls',
  'campaign-reward',
  'hangar-entry',
  'hangar-upgrades',
  'hangar-ships',
  'hangar-wings',
  'return-home',
  'weekly-run',
  'weekly-funding',
];

const extractMilestoneIds = (source) => {
  const start = source.indexOf('export const SCICON_ONBOARDING_STEPS');
  const end = source.indexOf('] as const;', start);
  assert.notEqual(start, -1, 'SciconOnboarding must export its milestone definitions');
  assert.notEqual(end, -1, 'SciconOnboarding milestone array must have a stable end marker');
  return [...source.slice(start, end).matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
};

const loadOnboardingModule = () => {
  const componentPath = path.join(repositoryRoot, 'components', 'SciconOnboarding.tsx');
  const transpiled = ts.transpileModule(onboardingSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: componentPath,
  }).outputText;

  const moduleUnderTest = { exports: {} };
  const mockRequire = (request) => {
    if (request === 'react') {
      return {
        __esModule: true,
        default: {},
        useCallback: () => undefined,
        useEffect: () => undefined,
        useLayoutEffect: () => undefined,
        useMemo: () => undefined,
        useRef: () => undefined,
        useState: () => undefined,
      };
    }
    if (request === 'react/jsx-runtime') {
      return {
        Fragment: Symbol('Fragment'),
        jsx: () => null,
        jsxs: () => null,
      };
    }
    if (request === './PixelActionButton') {
      return { __esModule: true, default: () => null };
    }
    if (request === '../services/onboardingProgress') {
      return {
        completeOnboardingStep: () => undefined,
        getNextOnboardingStepId: () => null,
        loadOnboardingProgress: () => ({}),
        resetOnboardingProgress: () => ({}),
        saveOnboardingProgress: () => true,
        skipOnboarding: () => ({}),
      };
    }
    return require(request);
  };

  new Function('require', 'module', 'exports', transpiled)(
    mockRequire,
    moduleUnderTest,
    moduleUnderTest.exports,
  );
  return moduleUnderTest.exports;
};

const paethPredictor = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
};

const readRgbaPngAlphaStats = (pngPath) => {
  const png = fs.readFileSync(pngPath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.subarray(0, 8).equals(signature), true, 'guide must have a valid PNG signature');

  let offset = 8;
  let header = null;
  const idatChunks = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= png.length, `PNG ${type} chunk must fit inside the file`);
    const data = png.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    }
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }

  assert.ok(header, 'guide PNG must include an IHDR chunk');
  assert.equal(header.bitDepth, 8, 'guide PNG must use 8-bit channels');
  assert.equal(header.colorType, 6, 'guide PNG must be RGBA');
  assert.equal(header.interlace, 0, 'guide PNG must be non-interlaced for deterministic inspection');
  assert.ok(header.width >= 256 && header.height >= 256, 'guide art must have useful source resolution');
  assert.ok(idatChunks.length > 0, 'guide PNG must include image data');

  const bytesPerPixel = 4;
  const rowBytes = header.width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  assert.equal(
    inflated.length,
    header.height * (rowBytes + 1),
    'guide PNG scanlines must match its dimensions',
  );

  let inputOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  let transparentPixels = 0;
  let visiblePixels = 0;
  let softEdgePixels = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const encoded = inflated.subarray(inputOffset, inputOffset + rowBytes);
    inputOffset += rowBytes;
    const decoded = Buffer.allocUnsafe(rowBytes);

    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? decoded[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
      else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      decoded[x] = (encoded[x] + predictor) & 0xff;
    }

    for (let x = 3; x < rowBytes; x += bytesPerPixel) {
      const alpha = decoded[x];
      if (alpha === 0) transparentPixels += 1;
      else {
        visiblePixels += 1;
        if (alpha < 255) softEdgePixels += 1;
      }
    }
    previous = decoded;
  }

  return {
    ...header,
    totalPixels: header.width * header.height,
    transparentPixels,
    visiblePixels,
    softEdgePixels,
  };
};

test('App owns the progressive onboarding and freezes only through its callback', () => {
  assert.match(
    appSource,
    /import\s+SciconOnboarding(?:,\s*\{[^}]+\})?\s+from\s+'\.\/components\/SciconOnboarding'/,
  );
  assert.equal((appSource.match(/<SciconOnboarding\b/g) ?? []).length, 1);
  assert.match(appSource, /onGameplayFreezeChange=\{setOnboardingGameplayFreeze\}/);
  assert.match(appSource, /running:\s*[\s\S]{0,220}!onboardingGameplayFreeze/);
  assert.match(appSource, /onRestartOnboarding=\{\(\)\s*=>\s*setOnboardingRestartNonce/);
  assert.doesNotMatch(startScreenSource, /SciconOnboarding/);
});

test('legacy one-shot Tutorial is removed from StartScreen', () => {
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'components', 'Tutorial.tsx')), false);
  assert.doesNotMatch(startScreenSource, /(?:import\s+Tutorial|<Tutorial\b|showTutorial|TUTORIAL_SEEN)/);
});

test('all onboarding spotlight anchors remain mounted on their owning surfaces', () => {
  const contracts = [
    ['components/StartScreen.tsx', [
      'home-flight-deck',
      'campaign-map',
      'campaign-start',
      'weekly-run',
      'weekly-funding',
      'hangar-nav',
      'home-nav',
    ]],
    ['components/CampaignMap.tsx', ['campaign-mission', 'campaign-launch']],
    ['components/GameStage.tsx', ['flight-stage']],
    ['components/WaveVictoryOverlay.tsx', ['mission-rewards']],
    ['components/SquadHangar.tsx', ['hangar-upgrades', 'hangar-ships', 'hangar-wings']],
  ];

  for (const [relativePath, targets] of contracts) {
    const source = readSource(...relativePath.split('/'));
    assert.match(source, /data-onboarding-target=/, `${relativePath} must expose onboarding anchors`);
    for (const target of targets) {
      assert.ok(source.includes(`'${target}'`) || source.includes(`"${target}"`), `${relativePath} is missing ${target}`);
    }
  }
});

test('More exposes a Flight Guide replay that returns Home before restarting', () => {
  assert.match(startScreenSource, /label="Flight Guide"/);
  assert.match(
    startScreenSource,
    /label="Flight Guide"[\s\S]{0,260}setDashboardTab\('home'\);[\s\S]{0,120}onRestartOnboarding\(\)/,
  );
});

test('component defines all thirteen milestone lessons with skip and reduced-motion support', () => {
  assert.deepEqual(extractMilestoneIds(onboardingSource), EXPECTED_MILESTONES);
  assert.match(onboardingSource, />\s*Skip guidance\s*</i);
  assert.match(onboardingSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(onboardingSource, /data-reduced-motion=/);
  assert.match(onboardingSource, /export const computeOnboardingPlacement\s*=/);
  assert.match(onboardingSource, /onGameplayFreezeChange\?\.\(gameplayFrozen\)/);
});

test('placement helper keeps panels and pointers inside narrow phone bounds', () => {
  const { computeOnboardingPlacement } = loadOnboardingModule();
  assert.equal(typeof computeOnboardingPlacement, 'function');

  const root = { width: 320, height: 568 };
  const nearTop = computeOnboardingPlacement(root, {
    left: 0,
    top: 8,
    width: 50,
    height: 40,
    right: 50,
    bottom: 48,
  }, 210);
  assert.deepEqual(nearTop, {
    left: 12,
    top: 66,
    width: 296,
    pointerLeft: 24,
    pointerDirection: 'up',
  });

  const nearBottomRight = computeOnboardingPlacement(root, {
    left: 274,
    top: 470,
    width: 38,
    height: 40,
    right: 312,
    bottom: 510,
  }, 210);
  assert.equal(nearBottomRight.pointerDirection, 'down');
  assert.equal(nearBottomRight.left, 12);
  assert.equal(nearBottomRight.width, 296);
  assert.ok(nearBottomRight.top >= 12 && nearBottomRight.top + 210 <= root.height - 12);
  assert.ok(nearBottomRight.pointerLeft >= 24 && nearBottomRight.pointerLeft <= 272);

  const centered = computeOnboardingPlacement(root, null, 210);
  assert.deepEqual(centered, {
    left: 12,
    top: 179,
    width: 296,
    pointerLeft: 148,
    pointerDirection: 'up',
  });
});

test('generated Nova guide asset is a substantial RGBA PNG with real transparency', () => {
  const guidePath = path.join(
    repositoryRoot,
    'public',
    'game-art',
    'generated',
    'ui',
    'scicon-onboarding-guide-v1',
    'scicon-guide.png',
  );
  assert.equal(fs.existsSync(guidePath), true, 'generated guide PNG must exist');
  assert.ok(fs.statSync(guidePath).size > 50_000, 'guide PNG must contain substantive art');
  assert.match(onboardingSource, /scicon-onboarding-guide-v1\/scicon-guide\.png/);

  const stats = readRgbaPngAlphaStats(guidePath);
  assert.ok(stats.transparentPixels > stats.totalPixels * 0.1, 'guide background must be transparent');
  assert.ok(stats.visiblePixels > stats.totalPixels * 0.1, 'guide character must remain meaningfully visible');
  assert.ok(stats.softEdgePixels > 0, 'guide transparency should retain anti-aliased edges');
});
