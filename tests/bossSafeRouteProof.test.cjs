const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const cache = new Map();
  const loadFile = (absolutePath) => {
    const resolvedPath = absolutePath.endsWith('.ts') ? absolutePath : `${absolutePath}.ts`;
    if (cache.has(resolvedPath)) return cache.get(resolvedPath).exports;
    const source = fs.readFileSync(resolvedPath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    const moduleBox = { exports: {} };
    cache.set(resolvedPath, moduleBox);
    const localRequire = (specifier) => {
      if (!specifier.startsWith('.')) return require(specifier);
      return loadFile(path.resolve(path.dirname(resolvedPath), specifier));
    };
    vm.runInNewContext(
      `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
      { module: moduleBox, require: localRequire, Math, Number, Object, Array, Map, Set, JSON }
    );
    return moduleBox.exports;
  };
  const relativePath = path.join(
    'services',
    'gameplay',
    'bosses',
    'BossSafeRouteProof.ts'
  );
  return {
    exports: loadFile(path.join(root, relativePath)),
    source: fs.readFileSync(path.join(root, relativePath), 'utf8')
  };
};

const phaseId = 'nullwake-benchmark';

const beatPair = ({
  id,
  primitiveId,
  warningStart,
  lead,
  duration = 0.2,
  parameters
}) => {
  const warningId = `${id}-warning`;
  return [{
    id: warningId,
    label: `${id} warning`,
    track: 'presentation',
    primitiveId: 'telegraph',
    trigger: 'time',
    startSeconds: warningStart,
    durationSeconds: lead,
    phaseId,
    parameters: {
      warningSeconds: lead,
      telegraphStyle: primitiveId === 'gap-ring' ? 'ring' : 'lane'
    }
  }, {
    id,
    label: id,
    track: primitiveId === 'cross-beam' ? 'laser' : 'attack',
    primitiveId,
    trigger: 'time',
    startSeconds: warningStart + lead,
    durationSeconds: duration,
    phaseId,
    telegraphClipId: warningId,
    ...(parameters ? { parameters } : {})
  }];
};

const benchmarkBeats = [
  ...beatPair({
    id: 'maze-entry',
    primitiveId: 'weave-wall',
    warningStart: 0.1,
    lead: 0.9,
    duration: 0.25,
    parameters: { sequence: 4 }
  }),
  ...beatPair({
    id: 'maze-first-gate',
    primitiveId: 'gap-ring',
    warningStart: 1.65,
    lead: 0.8,
    parameters: {
      projectileCount: 14,
      sequence: 2,
      rotationDirection: 'clockwise'
    }
  }),
  ...beatPair({
    id: 'maze-cross',
    primitiveId: 'cross-beam',
    warningStart: 3.2,
    lead: 0.95,
    duration: 0.45
  }),
  ...beatPair({
    id: 'maze-claw',
    primitiveId: 'side-barrage',
    warningStart: 4.75,
    lead: 0.8,
    parameters: { projectileCount: 4, side: 'port' }
  }),
  ...beatPair({
    id: 'maze-return-gate',
    primitiveId: 'gap-ring',
    warningStart: 6.15,
    lead: 0.85,
    parameters: {
      projectileCount: 14,
      sequence: 3,
      rotationDirection: 'clockwise'
    }
  }),
  ...beatPair({
    id: 'maze-exit',
    primitiveId: 'weave-wall',
    warningStart: 7.65,
    lead: 0.9,
    duration: 0.25,
    parameters: { sequence: 5 }
  })
];

const benchmarkTimeline = {
  durationSeconds: 11,
  loop: false,
  clips: [
    ...benchmarkBeats,
    {
      id: 'maze-recovery',
      label: 'Maze recovery',
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: 8.8,
      durationSeconds: 1,
      phaseId
    }
  ],
  attacks: [{
    id: 'revenant-maze',
    label: 'Revenant Maze',
    role: 'signature',
    skillTest: 'route-combination',
    recognitionCue: 'The core and claws lock inward.',
    solution: 'Follow the warned route.',
    safeRouteRule: 'channel-to-quadrant',
    sourceSocketRoles: ['port', 'starboard', 'core'],
    variants: [{
      phaseId,
      beatClipIds: [
        'maze-entry',
        'maze-first-gate',
        'maze-cross',
        'maze-claw',
        'maze-return-gate',
        'maze-exit'
      ],
      recoveryClipId: 'maze-recovery'
    }]
  }]
};

const mobilePose = {
  core: { x: 195, y: 284 },
  weaveOriginY: 310,
  sockets: {
    port: [{ x: 78, y: 213 }, { x: 75, y: 355 }],
    starboard: [{ x: 312, y: 213 }, { x: 315, y: 355 }]
  },
  projectileSpeed: 5.8,
  geometryUncertaintyPixels: 0
};

const authoredNullwakeMobilePose = {
  core: { x: 189.50152319697585, y: 293.38497522218256 },
  weaveOriginY: 312.4,
  sockets: {
    port: [
      { x: 102.78466237627214, y: 238.20063721938908 },
      { x: 98.16511851246887, y: 343.68252752332836 }
    ],
    starboard: [{ x: 312, y: 213 }, { x: 315, y: 355 }]
  },
  projectileSpeed: 5.8,
  geometryUncertaintyPixels: 3,
  beatOrigins: {
    'maze-entry:0': { weaveOriginY: 312.4 },
    'maze-first-gate:0': {
      core: { x: 189.50152319697585, y: 293.38497522218256 }
    },
    'maze-cross:0': {
      core: { x: 173.61861142372152, y: 291.864376435385 }
    },
    'maze-claw:0': {
      sockets: {
        port: [
          { x: 102.78466237627214, y: 238.20063721938908 },
          { x: 98.16511851246887, y: 343.68252752332836 }
        ]
      }
    },
    'maze-return-gate:0': {
      core: { x: 215.71247922805765, y: 271.0421836129465 }
    },
    'maze-exit:0': { weaveOriginY: 312.4 }
  }
};

const desktopPose = {
  core: { x: 640, y: 268 },
  weaveOriginY: 294,
  sockets: {
    port: [{ x: 523, y: 197 }, { x: 520, y: 339 }],
    starboard: [{ x: 757, y: 197 }, { x: 760, y: 339 }]
  },
  projectileSpeed: 5.8,
  geometryUncertaintyPixels: 0
};

test('Nullwake-like maze has deterministic constructive witnesses on mobile and desktop', () => {
  const {
    proveBossAttackOnBenchmarkViewports
  } = loadRuntime().exports;
  const proof = proveBossAttackOnBenchmarkViewports({
    timeline: benchmarkTimeline,
    attackId: 'revenant-maze',
    phaseId,
    mobilePose: authoredNullwakeMobilePose,
    desktopPose,
    searchBreadth: 96,
    controlFrames: 6
  });
  assert.equal(
    proof.status,
    'proven',
    JSON.stringify({
      mobile: [proof.results.mobile.reason, proof.results.mobile.detail],
      desktop: [proof.results.desktop.reason, proof.results.desktop.detail]
    })
  );
  for (const result of [proof.results.mobile, proof.results.desktop]) {
    assert.equal(result.reason, 'proven');
    assert.deepEqual(
      Array.from(result.modeledPrimitives),
      ['weave-wall', 'gap-ring', 'cross-beam', 'side-barrage']
    );
    assert.ok(result.witness.length > 20);
    assert.match(result.witnessHash, /^[0-9a-f]{8}$/);
    assert.ok(result.minimumClearancePixels > 0);
    assert.match(result.detail, /concrete baseline-speed route/i);
  }
});

test('the same inputs replay to the same witness without ambient randomness', () => {
  const { exports, source } = loadRuntime();
  const request = {
    timeline: benchmarkTimeline,
    attackId: 'revenant-maze',
    phaseId,
    viewport: exports.BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: authoredNullwakeMobilePose,
    searchBreadth: 96,
    controlFrames: 6
  };
  const first = exports.proveBossAttackSafeRoute(request);
  const second = exports.proveBossAttackSafeRoute(request);

  assert.equal(first.status, 'proven');
  assert.equal(second.status, 'proven');
  assert.equal(second.witnessHash, first.witnessHash);
  assert.deepEqual(
    JSON.parse(JSON.stringify(second.witness)),
    JSON.parse(JSON.stringify(first.witness))
  );
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});

test('unsupported or insufficiently specified attacks remain unproven', () => {
  const { proveBossAttackSafeRoute, BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS } = loadRuntime().exports;
  const unsupportedTimeline = {
    ...benchmarkTimeline,
    clips: benchmarkTimeline.clips.map((clip) => (
      clip.id === 'maze-cross'
        ? { ...clip, primitiveId: 'rotating-cross', track: 'attack' }
        : clip
    ))
  };
  const unsupported = proveBossAttackSafeRoute({
    timeline: unsupportedTimeline,
    attackId: 'revenant-maze',
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: mobilePose
  });
  assert.equal(unsupported.status, 'unproven');
  assert.equal(unsupported.reason, 'unsupported-primitive');
  assert.match(unsupported.detail, /no conservative hazard model/i);

  const missingSocket = proveBossAttackSafeRoute({
    timeline: benchmarkTimeline,
    attackId: 'revenant-maze',
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: {
      ...mobilePose,
      sockets: { ...mobilePose.sockets, port: [] }
    }
  });
  assert.equal(missingSocket.status, 'unproven');
  assert.equal(missingSocket.reason, 'missing-pose-geometry');
  assert.match(missingSocket.detail, /anatomy-owned socket/i);
});

test('a failed bounded search never claims the attack is impossible or safe', () => {
  const { proveBossAttackSafeRoute, BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS } = loadRuntime().exports;
  const crossClips = benchmarkTimeline.clips.filter((clip) => (
    clip.id === 'maze-cross-warning'
    || clip.id === 'maze-cross'
    || clip.id === 'maze-recovery'
  ));
  const crossOnly = {
    durationSeconds: 3,
    loop: false,
    clips: crossClips.map((clip) => (
      clip.id === 'maze-cross-warning'
        ? { ...clip, startSeconds: 0.1 }
        : clip.id === 'maze-cross'
          ? { ...clip, startSeconds: 1.05 }
          : { ...clip, startSeconds: 1.5 }
    )),
    attacks: [{
      ...benchmarkTimeline.attacks[0],
      variants: [{
        phaseId,
        beatClipIds: ['maze-cross'],
        recoveryClipId: 'maze-recovery'
      }]
    }]
  };
  const result = proveBossAttackSafeRoute({
    timeline: crossOnly,
    attackId: 'revenant-maze',
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: mobilePose,
    player: {
      collisionWidth: 360,
      collisionHeight: 63.44,
      maximumSpeedPerFrame: 2.5,
      accelerationPerFrame: 0.38
    },
    searchBreadth: 24,
    controlFrames: 4
  });

  assert.equal(result.status, 'unproven');
  assert.equal(result.reason, 'search-exhausted');
  assert.match(result.detail, /unproven|remains unproven/i);
  assert.doesNotMatch(result.detail, /impossible/i);
  assert.equal(result.witness, undefined);
});

const buildSideBarrageTimeline = ({
  id,
  motionCue,
  projectileCount,
  durationSeconds = 0.7
}) => ({
  durationSeconds: 4,
  loop: false,
  clips: [
    ...beatPair({
      id,
      primitiveId: 'side-barrage',
      warningStart: 0.1,
      lead: 0.9,
      duration: durationSeconds,
      parameters: {
        side: 'port',
        projectileCount,
        motionCue
      }
    }),
    {
      id: `${id}-recovery`,
      label: `${id} recovery`,
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: 2,
      durationSeconds: 0.8,
      phaseId
    }
  ],
  attacks: [{
    id: `${id}-attack`,
    label: `${id} attack`,
    role: 'core',
    skillTest: 'aim-dodge',
    recognitionCue: 'The weapon bank braces.',
    solution: 'Cross the warning line after it locks.',
    safeRouteRule: 'locked-aim-perpendicular',
    sourceSocketRoles: ['port', 'starboard'],
    variants: [{
      phaseId,
      beatClipIds: [id],
      recoveryClipId: `${id}-recovery`
    }]
  }]
});

test('side-barrage proof models match the runtime heavy and gatling envelopes', () => {
  const { resolveBossSideBarrageProofModel } = loadRuntime().exports;

  assert.deepEqual(
    JSON.parse(JSON.stringify(resolveBossSideBarrageProofModel({
      projectileCount: 11,
      projectileSpeed: 5.2,
      motionCue: 'heavy-cannon',
      mobileProfile: true
    }))),
    {
      variant: 'heavy-cannon',
      projectileCount: 5,
      projectileSpeed: 3.5360000000000005,
      projectileSize: 24,
      spreadRadians: 0.16,
      pulseIntervalFrames: 0
    }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(resolveBossSideBarrageProofModel({
      projectileCount: 12,
      projectileSpeed: 5.2,
      motionCue: 'gatling-barrage',
      mobileProfile: true
    }))),
    {
      variant: 'gatling-barrage',
      projectileCount: 10,
      projectileSpeed: 7.4,
      projectileSize: 9,
      spreadRadians: 0.018,
      pulseIntervalFrames: 7
    }
  );
  assert.equal(resolveBossSideBarrageProofModel({
    projectileCount: 7,
    projectileSpeed: 8.6,
    motionCue: 'gatling-barrage',
    mobileProfile: false
  }).pulseIntervalFrames, 5);
});

test('heavy-cannon side-barrage can produce a deterministic constructive witness', () => {
  const {
    BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
    MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
    proveBossAttackSafeRoute
  } = loadRuntime().exports;
  const timeline = buildSideBarrageTimeline({
    id: 'helios-heavy-port',
    motionCue: 'heavy-cannon',
    projectileCount: 7
  });
  const request = {
    timeline,
    attackId: 'helios-heavy-port-attack',
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: {
      ...mobilePose,
      beatOrigins: {
        'helios-heavy-port:0': {
          sockets: { port: [{ x: 86, y: 270 }] }
        }
      }
    },
    searchBreadth: 48,
    controlFrames: 4
  };
  const first = proveBossAttackSafeRoute(request);
  const repeated = proveBossAttackSafeRoute(request);

  assert.equal(first.status, 'proven', first.detail);
  assert.equal(first.reason, 'proven');
  assert.equal(repeated.witnessHash, first.witnessHash);
  assert.ok(
    first.minimumClearancePixels >= MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS
  );
});

test('gatling side-barrage alternates exact warning-owned port and starboard sockets', () => {
  const {
    BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
    proveBossAttackSafeRoute
  } = loadRuntime().exports;
  const timeline = buildSideBarrageTimeline({
    id: 'helios-inner-gatlings',
    motionCue: 'gatling-barrage',
    projectileCount: 8,
    durationSeconds: 0.9
  });
  const exactPose = {
    ...mobilePose,
    beatOrigins: {
      'helios-inner-gatlings:0': {
        sockets: {
          port: [{ x: 158, y: 286 }],
          starboard: [{ x: 232, y: 286 }]
        }
      }
    }
  };
  const request = {
    timeline,
    attackId: 'helios-inner-gatlings-attack',
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: exactPose,
    searchBreadth: 64,
    controlFrames: 4
  };
  const first = proveBossAttackSafeRoute(request);
  const repeated = proveBossAttackSafeRoute(request);

  assert.equal(first.status, 'proven', first.detail);
  assert.equal(repeated.witnessHash, first.witnessHash);
  assert.ok(first.minimumClearancePixels > 0);

  const missingStarboard = proveBossAttackSafeRoute({
    ...request,
    pose: {
      ...exactPose,
      sockets: { ...exactPose.sockets, starboard: [] },
      beatOrigins: {
        'helios-inner-gatlings:0': {
          sockets: { port: [{ x: 158, y: 286 }], starboard: [] }
        }
      }
    }
  });
  assert.equal(missingStarboard.status, 'unproven');
  assert.equal(missingStarboard.reason, 'missing-pose-geometry');
  assert.match(missingStarboard.detail, /starboard gatling/i);
});
