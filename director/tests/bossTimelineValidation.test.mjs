import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { validateGameCampaign as validateServerCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(
  path.join(repositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));
const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: { '@game': repositoryRoot }
  },
  server: { middlewareMode: true },
  appType: 'custom'
});
after(async () => vite.close());
const { validateGameCampaign: validateBrowserCampaign } = await vite.ssrLoadModule(
  '/game-config/validate.ts'
);
const { createBossTimelineTemplate } = await vite.ssrLoadModule(
  '/game-config/bossTimelineTemplates.ts'
);
const { BOSS_TIMELINE_PRIMITIVES } = await vite.ssrLoadModule(
  '/game-config/bossTimeline.ts'
);
const {
  MOVEMENT_PATH_CATALOG,
  sampleNormalizedMovementPath
} = await vite.ssrLoadModule('/game-config/movementPaths.ts');
const { createPromotionCampaign } = await vite.ssrLoadModule(
  '/director/src/combat-lab/experimentModel.ts'
);

const campaignWithTimeline = () => {
  const candidate = structuredClone(campaign);
  const boss = candidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss');
  assert.ok(boss);
  const phaseId = boss.phases[0].id;
  boss.timeline = {
    durationSeconds: 8,
    loop: true,
    clips: [
      {
        id: 'fixture-warning',
        label: 'Fixture warning',
        track: 'presentation',
        primitiveId: 'telegraph',
        trigger: 'time',
        startSeconds: 0.25,
        durationSeconds: 0.75,
        phaseId,
        repeat: { count: 3, intervalSeconds: 0.5 },
        parameters: {
          warningSeconds: 0.75,
          telegraphStyle: 'ring',
          color: '#ffb454'
        }
      },
      {
        id: 'fixture-burst',
        label: 'Fixture burst',
        track: 'attack',
        primitiveId: 'aimed-burst',
        trigger: 'time',
        startSeconds: 1,
        durationSeconds: 0.2,
        phaseId,
        telegraphClipId: 'fixture-warning',
        repeat: { count: 3, intervalSeconds: 0.5 },
        parameters: { projectileCount: 6 }
      },
      {
        id: 'fixture-shields',
        label: 'Fixture shields',
        track: 'defense',
        primitiveId: 'set-shield',
        trigger: 'phase-enter',
        startSeconds: 0,
        durationSeconds: 0.1,
        phaseId,
        parameters: { shieldCount: 3 }
      },
      {
        id: 'fixture-path',
        label: 'Fixture path',
        track: 'movement',
        primitiveId: 'follow-path',
        trigger: 'time',
        startSeconds: 2,
        durationSeconds: 3,
        phaseId,
        parameters: { movementPathId: 'sweep-bank-reentry' }
      },
      {
        id: 'fixture-death',
        label: 'Fixture death',
        track: 'presentation',
        primitiveId: 'effect-cue',
        trigger: 'death',
        startSeconds: 0,
        durationSeconds: 0.25,
        parameters: { color: '#67e8f9' }
      }
    ]
  };
  return { candidate, boss };
};

const campaignWithRevival = () => {
  const candidate = structuredClone(campaign);
  const boss = candidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.bossId === 'gatekeeper-prime' && event.phases.length > 1);
  assert.ok(boss);
  boss.revival = {
    phaseId: boss.phases[1].id,
    shutdownSeconds: 2.2,
    rebootSeconds: 2.6,
    restoreHealthRatio: 1,
    awakenedSizeMultiplier: 1.25
  };
  return { candidate, boss };
};

test('browser and server accept one bounded revival into a later boss phase', () => {
  const { candidate } = campaignWithRevival();
  const serverResult = validateServerCampaign(candidate);
  const browserResult = validateBrowserCampaign(candidate);
  assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
  assert.equal(
    browserResult.valid,
    true,
    browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );
});

test('browser and server reject unsafe revival fields, bounds, and phase references', () => {
  const invalidCases = [
    ['non-object', ({ boss }) => { boss.revival = null; }],
    ['unknown key', ({ boss }) => { boss.revival.script = 'run()'; }],
    ['unknown phase', ({ boss }) => { boss.revival.phaseId = 'missing-awakened-phase'; }],
    ['opening phase', ({ boss }) => { boss.revival.phaseId = boss.phases[0].id; }],
    ['shutdown too short', ({ boss }) => { boss.revival.shutdownSeconds = 0; }],
    ['shutdown too long', ({ boss }) => { boss.revival.shutdownSeconds = 10.01; }],
    ['reboot too short', ({ boss }) => { boss.revival.rebootSeconds = 0; }],
    ['reboot too long', ({ boss }) => { boss.revival.rebootSeconds = 10.01; }],
    ['zero restoration', ({ boss }) => { boss.revival.restoreHealthRatio = 0; }],
    ['excess restoration', ({ boss }) => { boss.revival.restoreHealthRatio = 1.01; }],
    ['shrinking awakened form', ({ boss }) => { boss.revival.awakenedSizeMultiplier = 0.99; }],
    ['oversized awakened form', ({ boss }) => { boss.revival.awakenedSizeMultiplier = 1.51; }]
  ];

  for (const [label, mutate] of invalidCases) {
    const fixture = campaignWithRevival();
    mutate(fixture);
    const serverResult = validateServerCampaign(fixture.candidate);
    const browserResult = validateBrowserCampaign(fixture.candidate);
    assert.equal(serverResult.valid, false, `${label} should fail server validation`);
    assert.equal(browserResult.valid, false, `${label} should fail browser validation`);
  }
});

test('server campaign validation accepts a bounded typed boss timeline fixture', () => {
  const { candidate } = campaignWithTimeline();
  const result = validateServerCampaign(candidate);
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('rotor pulse cadence is portable, authored, and bounded to a readable range', () => {
  const buildRotorCandidate = (pulseIntervalSeconds) => {
    const { candidate, boss } = campaignWithTimeline();
    const warning = boss.timeline.clips.find((clip) => clip.primitiveId === 'telegraph');
    const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
    delete warning.repeat;
    delete attack.repeat;
    attack.primitiveId = 'rotor-hazard-sentence';
    attack.label = 'Rotor hazard sentence';
    attack.durationSeconds = 6.5;
    attack.parameters = {
      projectileCount: 6,
      sequence: 1,
      pulseIntervalSeconds,
      motionCue: 'rotor-volley'
    };
    return candidate;
  };

  const validCandidate = buildRotorCandidate(0.75);
  const validServer = validateServerCampaign(validCandidate);
  const validBrowser = validateBrowserCampaign(validCandidate);
  assert.equal(validServer.valid, true, validServer.errors.join('\n'));
  assert.equal(
    validBrowser.valid,
    true,
    validBrowser.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );

  for (const invalidInterval of [0.49, 2.01]) {
    const invalidCandidate = buildRotorCandidate(invalidInterval);
    const serverResult = validateServerCampaign(invalidCandidate);
    const browserResult = validateBrowserCampaign(invalidCandidate);
    assert.equal(serverResult.valid, false);
    assert.ok(serverResult.errors.some((error) => error.includes('pulseIntervalSeconds')));
    assert.equal(browserResult.valid, false);
    assert.ok(browserResult.issues.some((issue) => (
      issue.path.endsWith('/pulseIntervalSeconds')
    )));
  }
});

test('moving machine-gun channel tuning is portable, typed, and bounded', () => {
  const buildChannelCandidate = (parameterOverrides = {}) => {
    const { candidate, boss } = campaignWithTimeline();
    const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
    attack.primitiveId = 'paired-cannon-burst';
    attack.label = 'Moving machine-gun channel';
    attack.parameters = {
      projectileCount: 24,
      sequence: 2,
      motionCue: 'machinegun-channel',
      shotIntervalFrames: 3,
      projectileSpeedScale: 1,
      channelWidthPixels: 116,
      sweepRangeRatio: 0.34,
      sweepPasses: 2,
      ...parameterOverrides
    };
    return candidate;
  };

  const validCandidate = buildChannelCandidate();
  const validServer = validateServerCampaign(validCandidate);
  const validBrowser = validateBrowserCampaign(validCandidate);
  assert.equal(validServer.valid, true, validServer.errors.join('\n'));
  assert.equal(
    validBrowser.valid,
    true,
    validBrowser.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );

  const invalidCases = [
    ['shotIntervalFrames', 1],
    ['projectileSpeedScale', 2.01],
    ['channelWidthPixels', 71],
    ['sweepRangeRatio', 0.81],
    ['sweepPasses', 4]
  ];
  for (const [parameter, value] of invalidCases) {
    const candidate = buildChannelCandidate({ [parameter]: value });
    const serverResult = validateServerCampaign(candidate);
    const browserResult = validateBrowserCampaign(candidate);
    assert.equal(serverResult.valid, false, `${parameter} should fail server bounds`);
    assert.ok(serverResult.errors.some((error) => error.includes(parameter)));
    assert.equal(browserResult.valid, false, `${parameter} should fail browser bounds`);
    assert.ok(browserResult.issues.some((issue) => issue.path.endsWith(`/${parameter}`)));
  }
});

test('radial beams accept deterministic rotation policies in both validators', () => {
  const buildRadialCandidate = (rotationDirection) => {
    const { candidate, boss } = campaignWithTimeline();
    const warning = boss.timeline.clips.find((clip) => clip.primitiveId === 'telegraph');
    const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
    delete warning.repeat;
    warning.parameters.telegraphStyle = 'spokes';
    delete attack.repeat;
    attack.primitiveId = 'radial-beam-array';
    attack.label = 'Radial beam array';
    attack.track = 'laser';
    attack.parameters = {
      sequence: 3,
      motionCue: 'radial-beam',
      rotationDirection
    };
    return candidate;
  };

  for (const rotationDirection of ['clockwise', 'counterclockwise', 'seeded-random']) {
    const candidate = buildRadialCandidate(rotationDirection);
    const serverResult = validateServerCampaign(candidate);
    const browserResult = validateBrowserCampaign(candidate);
    assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
    assert.equal(
      browserResult.valid,
      true,
      browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
    );
  }

  const invalidCandidate = buildRadialCandidate('ambient-random');
  const serverResult = validateServerCampaign(invalidCandidate);
  const browserResult = validateBrowserCampaign(invalidCandidate);
  assert.equal(serverResult.valid, false);
  assert.ok(serverResult.errors.some((error) => error.includes('/rotationDirection has unsupported value')));
  assert.equal(browserResult.valid, false);
  assert.ok(browserResult.issues.some((issue) => (
    issue.path.endsWith('/rotationDirection') && issue.code === 'unsupported_value'
  )));
});

test('corner ambush beams require one fair target lock and a bounded live window', () => {
  const buildCornerAmbushCandidate = () => {
    const { candidate, boss } = campaignWithTimeline();
    const warning = boss.timeline.clips.find((clip) => clip.primitiveId === 'telegraph');
    const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
    delete warning.repeat;
    warning.startSeconds = 0.5;
    warning.durationSeconds = 1;
    warning.parameters = {
      warningSeconds: 1,
      telegraphStyle: 'target',
      color: '#ef4444'
    };
    delete attack.repeat;
    attack.primitiveId = 'corner-ambush-beam';
    attack.label = 'Corner ambush beam';
    attack.track = 'laser';
    attack.startSeconds = 1.5;
    attack.durationSeconds = 0.7;
    attack.parameters = { sequence: 1 };
    return { candidate, warning, attack };
  };

  const valid = buildCornerAmbushCandidate();
  const validServer = validateServerCampaign(valid.candidate);
  const validBrowser = validateBrowserCampaign(valid.candidate);
  assert.equal(validServer.valid, true, validServer.errors.join('\n'));
  assert.equal(
    validBrowser.valid,
    true,
    validBrowser.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );

  const wrongStyle = buildCornerAmbushCandidate();
  wrongStyle.warning.parameters.telegraphStyle = 'lane';
  const wrongStyleServer = validateServerCampaign(wrongStyle.candidate);
  const wrongStyleBrowser = validateBrowserCampaign(wrongStyle.candidate);
  assert.equal(wrongStyleServer.valid, false);
  assert.ok(wrongStyleServer.errors.some((error) => error.includes('target telegraph')));
  assert.equal(wrongStyleBrowser.valid, false);
  assert.ok(wrongStyleBrowser.issues.some((issue) => issue.code === 'invalid_corner_ambush_telegraph'));

  const shortWarning = buildCornerAmbushCandidate();
  shortWarning.warning.startSeconds = 0.9;
  shortWarning.warning.durationSeconds = 0.6;
  shortWarning.warning.parameters.warningSeconds = 0.6;
  const shortWarningServer = validateServerCampaign(shortWarning.candidate);
  const shortWarningBrowser = validateBrowserCampaign(shortWarning.candidate);
  assert.equal(shortWarningServer.valid, false);
  assert.ok(shortWarningServer.errors.some((error) => error.includes('0.8-2.5 seconds of warning')));
  assert.equal(shortWarningBrowser.valid, false);
  assert.ok(shortWarningBrowser.issues.some((issue) => issue.code === 'invalid_corner_ambush_warning'));

  const longFire = buildCornerAmbushCandidate();
  longFire.attack.durationSeconds = 1.5;
  const longFireServer = validateServerCampaign(longFire.candidate);
  const longFireBrowser = validateBrowserCampaign(longFire.candidate);
  assert.equal(longFireServer.valid, false);
  assert.ok(longFireServer.errors.some((error) => error.includes('0.3-1.25 seconds')));
  assert.equal(longFireBrowser.valid, false);
  assert.ok(longFireBrowser.issues.some((issue) => issue.code === 'invalid_corner_ambush_duration'));

  const repeated = buildCornerAmbushCandidate();
  repeated.attack.repeat = { count: 2, intervalSeconds: 1 };
  const repeatedServer = validateServerCampaign(repeated.candidate);
  const repeatedBrowser = validateBrowserCampaign(repeated.candidate);
  assert.equal(repeatedServer.valid, false);
  assert.ok(repeatedServer.errors.some((error) => error.includes('not supported by corner-ambush-beam')));
  assert.equal(repeatedBrowser.valid, false);
  assert.ok(repeatedBrowser.issues.some((issue) => issue.code === 'unsupported_repeat'));
});

test('side barrages allow explicit heavy-cannon and gatling presentation cues', () => {
  const buildSideBarrageCandidate = (motionCue) => {
    const { candidate, boss } = campaignWithTimeline();
    const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
    attack.primitiveId = 'side-barrage';
    attack.label = 'Themed side barrage';
    attack.parameters = {
      projectileCount: 6,
      side: 'port',
      motionCue
    };
    return candidate;
  };

  for (const motionCue of ['heavy-cannon', 'gatling-barrage']) {
    const candidate = buildSideBarrageCandidate(motionCue);
    const serverResult = validateServerCampaign(candidate);
    const browserResult = validateBrowserCampaign(candidate);
    assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
    assert.equal(
      browserResult.valid,
      true,
      browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
    );
  }

  const invalidCandidate = buildSideBarrageCandidate('unregistered-weapon-pose');
  const serverResult = validateServerCampaign(invalidCandidate);
  const browserResult = validateBrowserCampaign(invalidCandidate);
  assert.equal(serverResult.valid, false);
  assert.ok(serverResult.errors.some((error) => error.includes('/motionCue has unsupported value')));
  assert.equal(browserResult.valid, false);
  assert.ok(browserResult.issues.some((issue) => (
    issue.path.endsWith('/motionCue') && issue.code === 'unsupported_value'
  )));
});

test('Octarch motion cues remain portable across browser and server validators', () => {
  const motionCues = [
    'octarch-grasp-hurl',
    'octarch-tentacle-slam',
    'octarch-sweeping-arm',
    'octarch-needle-stab',
    'octarch-constricting-ring',
    'octarch-suction-current',
    'octarch-asteroid-hurl',
    'octarch-abyssal-gaze'
  ];

  motionCues.forEach((motionCue) => {
    const { candidate, boss } = campaignWithTimeline();
    const effect = boss.timeline.clips.find((clip) => clip.primitiveId === 'effect-cue');
    effect.parameters = { color: '#67e8f9', motionCue };
    const serverResult = validateServerCampaign(candidate);
    const browserResult = validateBrowserCampaign(candidate);
    assert.equal(serverResult.valid, true, `${motionCue}: ${serverResult.errors.join('\n')}`);
    assert.equal(
      browserResult.valid,
      true,
      `${motionCue}: ${browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`
    );
  });

  const { candidate, boss } = campaignWithTimeline();
  const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
  attack.primitiveId = 'pod-volley';
  attack.label = 'Octarch asteroid hurl';
  attack.parameters = {
    projectileCount: 6,
    sequence: 0,
    motionCue: 'octarch-asteroid-hurl'
  };
  const serverResult = validateServerCampaign(candidate);
  const browserResult = validateBrowserCampaign(candidate);
  assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
  assert.equal(
    browserResult.valid,
    true,
    browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );
});

test('portable timeline validators accept 256 clips and reject the 257th', () => {
  const buildCandidate = (clipCount) => {
    const { candidate, boss } = campaignWithTimeline();
    boss.timeline.clips = Array.from({ length: clipCount }, (_, index) => ({
      id: `capacity-effect-${index + 1}`,
      label: `Capacity effect ${index + 1}`,
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: index * 0.02,
      durationSeconds: 0.1,
      parameters: { color: '#67e8f9' }
    }));
    return candidate;
  };

  const maximum = buildCandidate(256);
  const maximumServer = validateServerCampaign(maximum);
  const maximumBrowser = validateBrowserCampaign(maximum);
  assert.equal(maximumServer.valid, true, maximumServer.errors.join('\n'));
  assert.equal(
    maximumBrowser.valid,
    true,
    maximumBrowser.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );

  const overflow = buildCandidate(257);
  const overflowServer = validateServerCampaign(overflow);
  const overflowBrowser = validateBrowserCampaign(overflow);
  assert.equal(overflowServer.valid, false);
  assert.ok(overflowServer.errors.some((error) => error.includes('at most 256 items')));
  assert.equal(overflowBrowser.valid, false);
  assert.ok(overflowBrowser.issues.some((issue) => (
    issue.path.endsWith('/clips') && issue.code === 'too_many_items'
  )));
});

test('server campaign validation rejects unsafe boss timeline shapes and missing warnings', () => {
  const { candidate, boss } = campaignWithTimeline();
  const attack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
  delete attack.telegraphClipId;
  attack.track = 'presentation';
  attack.trigger = 'death';
  attack.repeat.count = 99;
  attack.parameters.script = 'arbitrary-code-is-never-content';
  attack.parameters.shieldCount = 2;

  const result = validateServerCampaign(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/track must be attack')));
  assert.ok(result.errors.some((error) => error.includes('/trigger must be time')));
  assert.ok(result.errors.some((error) => error.includes('/telegraphClipId must reference')));
  assert.ok(result.errors.some((error) => error.includes('/repeat/count')));
  assert.ok(result.errors.some((error) => error.includes('unsupported fields: script')));
  assert.ok(result.errors.some((error) => error.includes('shieldCount is not supported by aimed-burst')));
});

test('browser campaign validation enforces the same boss timeline safety contract', () => {
  const validFixture = campaignWithTimeline();
  const validResult = validateBrowserCampaign(validFixture.candidate);
  assert.equal(validResult.valid, true, validResult.issues.map((issue) => issue.message).join('\n'));

  const invalidFixture = campaignWithTimeline();
  const attack = invalidFixture.boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
  delete attack.telegraphClipId;
  attack.trigger = 'phase-enter';
  attack.repeat.count = 99;
  attack.parameters.script = 'arbitrary-code-is-never-content';
  attack.parameters.shieldCount = 2;
  const invalidResult = validateBrowserCampaign(invalidFixture.candidate);

  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.issues.some((issue) => issue.code === 'missing_telegraph'));
  assert.ok(invalidResult.issues.some((issue) => issue.code === 'unsafe_damage_trigger'));
  assert.ok(invalidResult.issues.some((issue) => issue.path.endsWith('/repeat/count')));
  assert.ok(invalidResult.issues.some((issue) => issue.code === 'unknown_property'));
  assert.ok(invalidResult.issues.some((issue) => issue.code === 'unsupported_primitive_parameter'));
});

test('pod volleys and weave walls validate as warned, budgeted timeline primitives', () => {
  const { candidate, boss } = campaignWithTimeline();
  const phaseId = boss.phases[0].id;
  boss.timeline.clips.push(
    {
      id: 'pod-warning',
      label: 'Pod warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 3,
      durationSeconds: 0.75,
      phaseId,
      parameters: {
        warningSeconds: 0.75,
        telegraphStyle: 'warning',
        color: '#ff9d2e'
      }
    },
    {
      id: 'pod-fire',
      label: 'Pod volley',
      track: 'attack',
      primitiveId: 'pod-volley',
      trigger: 'time',
      startSeconds: 3.75,
      durationSeconds: 0.2,
      phaseId,
      telegraphClipId: 'pod-warning',
      parameters: { projectileCount: 6, sequence: 2 }
    },
    {
      id: 'weave-warning',
      label: 'Safe channel warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 4.5,
      durationSeconds: 0.75,
      phaseId,
      parameters: {
        warningSeconds: 0.75,
        telegraphStyle: 'lane',
        color: '#67e8f9'
      }
    },
    {
      id: 'weave-fire',
      label: 'Weave wall',
      track: 'attack',
      primitiveId: 'weave-wall',
      trigger: 'time',
      startSeconds: 5.25,
      durationSeconds: 0.2,
      phaseId,
      telegraphClipId: 'weave-warning',
      parameters: { projectileCount: 18, sequence: 1 }
    }
  );

  const serverResult = validateServerCampaign(candidate);
  const browserResult = validateBrowserCampaign(candidate);
  assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
  assert.equal(
    browserResult.valid,
    true,
    browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );

  const weave = boss.timeline.clips.find((clip) => clip.id === 'weave-fire');
  delete weave.telegraphClipId;
  const missingServerResult = validateServerCampaign(candidate);
  const missingBrowserResult = validateBrowserCampaign(candidate);
  assert.equal(missingServerResult.valid, false);
  assert.ok(missingServerResult.errors.some((error) => error.includes('telegraphClipId must reference')));
  assert.equal(missingBrowserResult.valid, false);
  assert.ok(missingBrowserResult.issues.some((issue) => (
    issue.code === 'missing_telegraph' && issue.path.includes('telegraphClipId')
  )));

  weave.telegraphClipId = 'weave-warning';
  const weaveWarning = boss.timeline.clips.find((clip) => clip.id === 'weave-warning');
  weaveWarning.parameters.telegraphStyle = 'warning';
  const hiddenChannelServerResult = validateServerCampaign(candidate);
  const hiddenChannelBrowserResult = validateBrowserCampaign(candidate);
  assert.equal(hiddenChannelServerResult.valid, false);
  assert.ok(hiddenChannelServerResult.errors.some((error) => error.includes('deterministic safe channel')));
  assert.equal(hiddenChannelBrowserResult.valid, false);
  assert.ok(hiddenChannelBrowserResult.issues.some((issue) => (
    issue.code === 'invalid_safe_channel_telegraph'
  )));
});

test('movement paths are allowlisted, time-bounded, and identically validated by browser and server', () => {
  const unknownPath = campaignWithTimeline();
  const unknownPathClip = unknownPath.boss.timeline.clips.find((clip) => clip.primitiveId === 'follow-path');
  unknownPathClip.parameters.movementPathId = 'unreviewed-arbitrary-path';

  const unknownServerResult = validateServerCampaign(unknownPath.candidate);
  const unknownBrowserResult = validateBrowserCampaign(unknownPath.candidate);
  assert.equal(unknownServerResult.valid, false);
  assert.ok(unknownServerResult.errors.some((error) => error.includes('/movementPathId has unsupported value')));
  assert.equal(unknownBrowserResult.valid, false);
  assert.ok(unknownBrowserResult.issues.some((issue) => (
    issue.path.endsWith('/movementPathId') && issue.code === 'unknown_reference'
  )));

  const overrun = campaignWithTimeline();
  const overrunClip = overrun.boss.timeline.clips.find((clip) => clip.primitiveId === 'follow-path');
  overrunClip.startSeconds = 4;
  overrunClip.durationSeconds = 5;
  const overrunServerResult = validateServerCampaign(overrun.candidate);
  const overrunBrowserResult = validateBrowserCampaign(overrun.candidate);
  assert.equal(overrunServerResult.valid, false);
  assert.ok(overrunServerResult.errors.some((error) => error.includes('finish before the timeline endpoint')));
  assert.equal(overrunBrowserResult.valid, false);
  assert.ok(overrunBrowserResult.issues.some((issue) => issue.code === 'invalid_path_timing'));
});

test('the allowlisted sweep path samples deterministically with tangent-derived endpoint-safe banking', () => {
  const descriptor = MOVEMENT_PATH_CATALOG['sweep-bank-reentry'];
  const first = sampleNormalizedMovementPath('sweep-bank-reentry', 0.2);
  const repeated = sampleNormalizedMovementPath('sweep-bank-reentry', 0.2);
  const leftSweep = sampleNormalizedMovementPath('sweep-bank-reentry', 0.06);
  const offscreenTransfer = sampleNormalizedMovementPath('sweep-bank-reentry', 0.65);
  const endpoint = sampleNormalizedMovementPath('sweep-bank-reentry', 1);

  assert.deepEqual(first, repeated);
  assert.ok(first.tangentX > 0);
  assert.ok(first.bankRadians > 0);
  assert.ok(leftSweep.tangentX < 0);
  assert.ok(leftSweep.bankRadians < 0);
  assert.ok(offscreenTransfer.centerYRatio < 0);
  assert.ok(Math.abs(first.bankRadians) <= descriptor.maxBankRadians);
  assert.equal(endpoint.centerXRatio, 0.5);
  assert.equal(endpoint.centerYRatio, 0.24);
  assert.ok(Math.abs(endpoint.bankRadians) < Number.EPSILON);
});

test('advanced non-shipping boss fixture exercises every registered primitive but remains sandbox-only', () => {
  const candidate = structuredClone(campaign);
  const boss = candidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.phases.length > 1);
  assert.ok(boss);
  boss.timeline = createBossTimelineTemplate('advanced-showcase', boss);

  const usedPrimitives = new Set(boss.timeline.clips.map((clip) => clip.primitiveId));
  assert.deepEqual(
    [...usedPrimitives].sort(),
    Object.keys(BOSS_TIMELINE_PRIMITIVES).sort()
  );

  const serverResult = validateServerCampaign(candidate);
  const browserResult = validateBrowserCampaign(candidate);
  assert.equal(serverResult.valid, false);
  assert.ok(serverResult.errors.some((error) => (
    error.includes('restricted to the Frontier Crownclaw Boss Sandbox prototype')
  )));
  assert.equal(browserResult.valid, false);
  assert.ok(browserResult.issues.some((issue) => (
    issue.message.includes('restricted to the Frontier Crownclaw Boss Sandbox prototype')
  )));

  const singlePhaseCandidate = structuredClone(campaign);
  const singlePhaseBoss = singlePhaseCandidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.phases.length === 1);
  assert.ok(singlePhaseBoss);
  singlePhaseBoss.timeline = createBossTimelineTemplate('advanced-showcase', singlePhaseBoss);
  const singlePhaseServerResult = validateServerCampaign(singlePhaseCandidate);
  const singlePhaseBrowserResult = validateBrowserCampaign(singlePhaseCandidate);
  assert.equal(singlePhaseServerResult.valid, false);
  assert.ok(singlePhaseServerResult.errors.some((error) => (
    error.includes('restricted to the Frontier Crownclaw Boss Sandbox prototype')
  )));
  assert.equal(singlePhaseBrowserResult.valid, false);
  assert.ok(singlePhaseBrowserResult.issues.some((issue) => (
    issue.message.includes('restricted to the Frontier Crownclaw Boss Sandbox prototype')
  )));
});

test('boss timeline validation rejects individually bounded clips that exceed the simultaneous entity budget', () => {
  const { candidate, boss } = campaignWithTimeline();
  const sourceAttack = boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
  for (let index = 2; index <= 4; index += 1) {
    boss.timeline.clips.push({
      ...structuredClone(sourceAttack),
      id: `fixture-burst-${index}`,
      label: `Fixture burst ${index}`,
      parameters: { projectileCount: 24 }
    });
  }

  const serverResult = validateServerCampaign(candidate);
  const browserResult = validateBrowserCampaign(candidate);
  assert.equal(serverResult.valid, false);
  assert.ok(serverResult.errors.some((error) => error.includes('damaging entities') && error.includes('limit is 64')));
  assert.equal(browserResult.valid, false);
  assert.ok(browserResult.issues.some((issue) => issue.code === 'simultaneous_entity_budget'));
});

test('repeated damaging clips require matching repeated warnings and must remain inside one timeline', () => {
  const missingWarningRepeat = campaignWithTimeline();
  const warning = missingWarningRepeat.boss.timeline.clips.find((clip) => clip.primitiveId === 'telegraph');
  delete warning.repeat;

  const missingServerResult = validateServerCampaign(missingWarningRepeat.candidate);
  const missingBrowserResult = validateBrowserCampaign(missingWarningRepeat.candidate);
  assert.equal(missingServerResult.valid, false);
  assert.ok(missingServerResult.errors.some((error) => error.includes('must repeat before every damaging execution')));
  assert.equal(missingBrowserResult.valid, false);
  assert.ok(missingBrowserResult.issues.some((issue) => issue.code === 'missing_repeated_telegraph'));

  const outsideTimeline = campaignWithTimeline();
  const outsideAttack = outsideTimeline.boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
  const outsideWarning = outsideTimeline.boss.timeline.clips.find((clip) => clip.primitiveId === 'telegraph');
  outsideAttack.startSeconds = 7.5;
  outsideAttack.repeat = { count: 3, intervalSeconds: 0.5 };
  outsideWarning.startSeconds = 6.75;
  outsideWarning.repeat = { count: 3, intervalSeconds: 0.5 };

  const outsideServerResult = validateServerCampaign(outsideTimeline.candidate);
  const outsideBrowserResult = validateBrowserCampaign(outsideTimeline.candidate);
  assert.equal(outsideServerResult.valid, false);
  assert.ok(outsideServerResult.errors.some((error) => error.includes('must keep every execution inside')));
  assert.equal(outsideBrowserResult.valid, false);
  assert.ok(outsideBrowserResult.issues.some((issue) => issue.code === 'repeat_outside_timeline'));
});

test('repeat and cue budgets mirror the 60 Hz scheduler in browser and server validation', () => {
  const quantizedBudget = campaignWithTimeline();
  const sourceAttack = quantizedBudget.boss.timeline.clips.find((clip) => clip.primitiveId === 'aimed-burst');
  const warning = quantizedBudget.boss.timeline.clips.find((clip) => clip.primitiveId === 'telegraph');
  delete sourceAttack.repeat;
  delete warning.repeat;
  sourceAttack.parameters.projectileCount = 24;
  for (const [index, startSeconds] of [1.004, 1.007].entries()) {
    quantizedBudget.boss.timeline.clips.push({
      ...structuredClone(sourceAttack),
      id: `quantized-burst-${index + 2}`,
      label: `Quantized burst ${index + 2}`,
      startSeconds
    });
  }

  const serverBudgetResult = validateServerCampaign(quantizedBudget.candidate);
  const browserBudgetResult = validateBrowserCampaign(quantizedBudget.candidate);
  assert.equal(serverBudgetResult.valid, false);
  assert.ok(serverBudgetResult.errors.some((error) => error.includes('simulation frame 60') && error.includes('limit is 64')));
  assert.equal(browserBudgetResult.valid, false);
  assert.ok(browserBudgetResult.issues.some((issue) => issue.code === 'simultaneous_entity_budget'));

  const unsupportedRepeat = campaignWithTimeline();
  const shield = unsupportedRepeat.boss.timeline.clips.find((clip) => clip.primitiveId === 'set-shield');
  shield.repeat = { count: 1, intervalSeconds: 0.5 };
  const unsupportedServerResult = validateServerCampaign(unsupportedRepeat.candidate);
  const unsupportedBrowserResult = validateBrowserCampaign(unsupportedRepeat.candidate);
  assert.equal(unsupportedServerResult.valid, false);
  assert.ok(unsupportedServerResult.errors.some((error) => error.includes('is not supported by set-shield')));
  assert.equal(unsupportedBrowserResult.valid, false);
  assert.ok(unsupportedBrowserResult.issues.some((issue) => issue.code === 'unsupported_repeat'));
});

test('validation rejects timelines whose cue counts would be silently truncated by the scheduler', () => {
  const { candidate, boss } = campaignWithTimeline();
  const phaseId = boss.phases[0].id;
  for (let index = 0; index < 9; index += 1) {
    boss.timeline.clips.push({
      id: `crowded-effect-${index}`,
      label: `Crowded effect ${index}`,
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'phase-enter',
      startSeconds: 0,
      durationSeconds: 0.1,
      phaseId,
      parameters: { color: '#67e8f9' }
    });
  }

  const serverResult = validateServerCampaign(candidate);
  const browserResult = validateBrowserCampaign(candidate);
  assert.equal(serverResult.valid, false);
  assert.ok(serverResult.errors.some((error) => error.includes('phase-enter cues') && error.includes('limit is 8')));
  assert.equal(browserResult.valid, false);
  assert.ok(browserResult.issues.some((issue) => issue.code === 'triggered_cue_budget'));
});

test('Combat Lab promotion remaps boss phase, clip, and telegraph references as one closed resource', () => {
  const { candidate, boss } = campaignWithTimeline();
  const awakenedPhase = {
    ...structuredClone(boss.phases[0]),
    id: 'promotion-awakened-phase',
    label: 'Promotion awakened',
    triggerHealthRatio: 0.35
  };
  boss.phases.push(awakenedPhase);
  boss.revival = {
    phaseId: awakenedPhase.id,
    shutdownSeconds: 2.2,
    rebootSeconds: 2.6,
    restoreHealthRatio: 1,
    awakenedSizeMultiplier: 1.25
  };
  const targetLevel = candidate.levels[0];
  const targetWave = targetLevel.waves[0];
  const result = createPromotionCampaign(candidate, {
    kind: 'event',
    targetLevelId: targetLevel.id,
    targetWaveId: targetWave.id,
    event: boss,
    startSeconds: 0
  }, {
    now: () => '2026-07-23T12:00:00.000Z'
  });

  const promotedBoss = result.campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.id === result.insertedEventId);
  assert.equal(promotedBoss?.kind, 'boss');
  assert.ok(promotedBoss.timeline);
  assert.notDeepEqual(
    promotedBoss.timeline.clips.map((clip) => clip.id),
    boss.timeline.clips.map((clip) => clip.id)
  );

  const promotedPhaseIds = new Set(promotedBoss.phases.map((phase) => phase.id));
  const promotedClipIds = new Set(promotedBoss.timeline.clips.map((clip) => clip.id));
  promotedBoss.timeline.clips.forEach((clip) => {
    if (clip.phaseId) assert.equal(promotedPhaseIds.has(clip.phaseId), true);
    if (clip.telegraphClipId) assert.equal(promotedClipIds.has(clip.telegraphClipId), true);
  });
  assert.ok(promotedBoss.revival);
  assert.equal(promotedPhaseIds.has(promotedBoss.revival.phaseId), true);
  assert.notEqual(promotedBoss.revival.phaseId, boss.revival.phaseId);
  const serverResult = validateServerCampaign(result.campaign);
  const browserResult = validateBrowserCampaign(result.campaign);
  assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));
  assert.equal(
    browserResult.valid,
    true,
    browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );
});
