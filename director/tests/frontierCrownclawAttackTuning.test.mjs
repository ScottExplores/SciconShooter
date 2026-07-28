import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

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
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const tuningModule = await vite.ssrLoadModule(
  '/director/src/tools/bosses/frontierCrownclawAttackTuning.ts'
);
const {
  DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING,
  FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES,
  FRONTIER_CROWNCLAW_TUNING_FIELD_MAPPINGS,
  applyFrontierCrownclawAttackTuningToTimeline,
  normalizeFrontierCrownclawAttackTuning
} = tuningModule;
const { FrontierCrownclawAttackTuningPanel } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/FrontierCrownclawAttackTuningPanel.tsx'
);
const { buildSandboxBossPrototypePreview } = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const { validateGameCampaign } = await vite.ssrLoadModule(
  '/game-config/validate.ts'
);

const frontierPreview = buildSandboxBossPrototypePreview(
  campaign,
  'frontier-crownclaw'
);
const frontierEvent = frontierPreview.previewWave.events.find((event) => (
  event.kind === 'boss' && event.id === frontierPreview.eventId
));
assert.ok(frontierEvent?.timeline, 'Frontier preview must expose its compiled timeline');
const sourceTimeline = frontierEvent.timeline;

const actions = (timeline, primitiveId) => timeline.clips.filter((clip) => (
  clip.primitiveId === primitiveId
));
const warningFor = (timeline, action) => timeline.clips.find((clip) => (
  clip.id === action.telegraphClipId
));
const recoveryFor = (timeline, attackId, phaseId) => {
  const attack = timeline.attacks.find((candidate) => candidate.id === attackId);
  const variant = attack.variants.find((candidate) => candidate.phaseId === phaseId);
  return timeline.clips.find((clip) => clip.id === variant.recoveryClipId);
};

test('Frontier tuning defaults are deeply frozen and every requested control is bounded', () => {
  assert.deepEqual(Object.keys(DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING), [
    'harpoon',
    'reactor',
    'crabwalk'
  ]);
  assert.equal(Object.isFrozen(DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING), true);
  for (const group of Object.values(DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING)) {
    assert.equal(Object.isFrozen(group), true);
  }

  for (const groupId of ['harpoon', 'reactor', 'crabwalk']) {
    const defaults = DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING[groupId];
    const ranges = FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES[groupId];
    assert.deepEqual(Object.keys(defaults), Object.keys(ranges));
    for (const [field, specification] of Object.entries(ranges)) {
      assert.ok(defaults[field] >= specification.minimum, `${groupId}.${field} is too small`);
      assert.ok(defaults[field] <= specification.maximum, `${groupId}.${field} is too large`);
      assert.equal(
        typeof FRONTIER_CROWNCLAW_TUNING_FIELD_MAPPINGS[groupId][field],
        'string',
        `${groupId}.${field} must document its schema-v1 mapping`
      );
    }
  }
});

test('Frontier tuning normalization clamps, step-snaps, and replaces non-finite values', () => {
  const normalized = normalizeFrontierCrownclawAttackTuning({
    harpoon: {
      targetLockFrames: -1,
      launchSpeedMultiplier: 1.18,
      maxExtensionRatio: Number.NaN,
      tensionFrames: 100,
      closeDelayFrames: 7.6,
      retractSpeedMultiplier: Number.POSITIVE_INFINITY,
      launchCount: 9,
      launchAngleDegrees: 1,
      crossLinkSpacingFrames: 100.7,
      crossLinkSafeOpeningPixels: 151
    },
    reactor: {
      chargeFrames: 999,
      pulseCount: 0,
      beamWidthPixels: 22.6,
      beamDurationFrames: -1,
      sweepSpeedMultiplier: 1.12,
      sweepRangeRatio: 0.333,
      recoveryFrames: Number.NaN,
      safeRegionRatio: 1
    },
    crabwalk: {
      speedMultiplier: 0,
      rangeRatio: 0.535,
      directionChanges: 99,
      projectileCount: 1,
      projectileCadenceFrames: 7.7,
      formationSpacingFrames: 199,
      formationBeats: 3.8,
      recoveryFrames: 1000
    }
  });

  assert.deepEqual(normalized.harpoon, {
    targetLockFrames: 42,
    launchSpeedMultiplier: 1.2,
    maxExtensionRatio: 0.72,
    tensionFrames: 28,
    closeDelayFrames: 8,
    retractSpeedMultiplier: 1,
    launchCount: 2,
    launchAngleDegrees: 18,
    crossLinkSpacingFrames: 101,
    crossLinkSafeOpeningPixels: 152
  });
  assert.deepEqual(normalized.reactor, {
    chargeFrames: 84,
    pulseCount: 1,
    beamWidthPixels: 23,
    beamDurationFrames: 84,
    sweepSpeedMultiplier: 1.1,
    sweepRangeRatio: 0.33,
    recoveryFrames: 54,
    safeRegionRatio: 0.38
  });
  assert.deepEqual(normalized.crabwalk, {
    speedMultiplier: 0.9,
    rangeRatio: 0.54,
    directionChanges: 4,
    projectileCount: 9,
    projectileCadenceFrames: 8,
    formationSpacingFrames: 198,
    formationBeats: 4,
    recoveryFrames: 66
  });
});

test('Frontier panel exposes every requested control in three named attack groups', () => {
  const html = renderToStaticMarkup(React.createElement(
    FrontierCrownclawAttackTuningPanel,
    {
      value: DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING,
      onChange: () => {}
    }
  ));
  assert.equal((html.match(/<fieldset/g) ?? []).length, 3);
  assert.deepEqual(
    [...html.matchAll(/data-frontier-attack="([^"]+)"/g)]
      .map((match) => match[1]),
    ['harpoon', 'reactor', 'crabwalk']
  );
  for (const label of [
    'Target lock',
    'Launch speed',
    'Max extension',
    'Tension hold',
    'Claw close delay',
    'Retract speed',
    'Launch count',
    'Launch angle',
    'Cross-Link spacing',
    'Cross-Link safe opening',
    'Reactor charge',
    'Pulse count',
    'Beam width',
    'Beam duration',
    'Sweep speed',
    'Sweep range',
    'Reactor recovery',
    'Safe region',
    'Crabwalk speed',
    'Crabwalk range',
    'Direction changes',
    'Projectile count',
    'Projectile cadence',
    'Formation spacing',
    'Formation beats',
    'Crabwalk recovery'
  ]) {
    assert.match(html, new RegExp(label));
  }
});

test('Frontier route-proven defaults preserve its compiled clip schedule and parameters', () => {
  const before = structuredClone(sourceTimeline);
  const tuned = applyFrontierCrownclawAttackTuningToTimeline(
    sourceTimeline,
    DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING
  );
  assert.deepEqual(sourceTimeline, before);
  assert.equal(tuned.durationSeconds, 26.8);
  assert.equal(tuned.attacks.length, 4);

  const comparable = (timeline) => timeline.clips.map((clip) => ({
    ...clip,
    startSeconds: Number(clip.startSeconds.toFixed(6)),
    durationSeconds: Number(clip.durationSeconds.toFixed(6))
  }));
  assert.deepEqual(comparable(tuned), comparable(sourceTimeline));
});

test('Frontier tuning relayout applies every control without mutating its source', () => {
  const before = structuredClone(sourceTimeline);
  const tuned = applyFrontierCrownclawAttackTuningToTimeline(sourceTimeline, {
    harpoon: {
      targetLockFrames: 60,
      launchSpeedMultiplier: 1.2,
      maxExtensionRatio: 0.78,
      tensionFrames: 28,
      closeDelayFrames: 16,
      retractSpeedMultiplier: 0.85,
      launchCount: 2,
      launchAngleDegrees: 30,
      crossLinkSpacingFrames: 102,
      crossLinkSafeOpeningPixels: 152
    },
    reactor: {
      chargeFrames: 84,
      pulseCount: 2,
      beamWidthPixels: 24,
      beamDurationFrames: 120,
      sweepSpeedMultiplier: 0.9,
      sweepRangeRatio: 0.36,
      recoveryFrames: 72,
      safeRegionRatio: 0.38
    },
    crabwalk: {
      speedMultiplier: 0.9,
      rangeRatio: 0.54,
      directionChanges: 4,
      projectileCount: 14,
      projectileCadenceFrames: 8,
      formationSpacingFrames: 228,
      formationBeats: 4,
      recoveryFrames: 66
    }
  });

  assert.deepEqual(sourceTimeline, before);
  assert.ok(tuned.durationSeconds > sourceTimeline.durationSeconds);

  const harpoons = actions(tuned, 'chainclaw-harpoon');
  const coreHarpoon = harpoons.find((clip) => (
    clip.parameters.motionCue === 'frontier-chainclaw-harpoon'
  ));
  assert.equal(coreHarpoon.repeat.count, 2);
  assert.deepEqual(warningFor(tuned, coreHarpoon).repeat, coreHarpoon.repeat);
  assert.equal(warningFor(tuned, coreHarpoon).durationSeconds, 1);
  assert.equal(coreHarpoon.parameters.projectileSpeedScale, 1.08);
  assert.ok(coreHarpoon.parameters.sequence > 0);

  const crossLinks = harpoons.filter((clip) => (
    clip.parameters.motionCue === 'frontier-crown-cross-link'
    && clip.phaseId === 'sandbox-frontier-bastion-lock'
  ));
  assert.deepEqual(
    crossLinks.slice(1).map((clip, index) => Math.round(
      (warningFor(tuned, clip).startSeconds
        - warningFor(tuned, crossLinks[index]).startSeconds) * 60
    )),
    [102, 102, 102]
  );
  assert.ok(crossLinks.every((clip) => clip.durationSeconds === 0.9));

  const reactors = actions(tuned, 'crown-reactor-beam');
  const firstReactor = reactors[0];
  assert.equal(firstReactor.repeat.count, 2);
  assert.deepEqual(warningFor(tuned, firstReactor).repeat, firstReactor.repeat);
  assert.equal(warningFor(tuned, firstReactor).durationSeconds, 1.45);
  assert.equal(firstReactor.durationSeconds, 2.5);
  for (const phaseId of new Set(reactors.map((clip) => clip.phaseId))) {
    assert.equal(
      recoveryFor(tuned, 'crown-reactor-beam', phaseId).durationSeconds,
      1.2
    );
  }

  const crabwalk = actions(tuned, 'bastion-crabwalk-barrage');
  const phaseOneCrabwalk = crabwalk.filter((clip) => (
    clip.phaseId === 'sandbox-frontier-bastion-lock'
  ));
  const phaseTwoCrabwalk = crabwalk.filter((clip) => (
    clip.phaseId === 'sandbox-frontier-critical-cross-link'
  ));
  assert.ok(phaseOneCrabwalk.every((clip) => clip.parameters.projectileCount === 11));
  assert.ok(phaseOneCrabwalk.every((clip) => clip.parameters.shotIntervalFrames === 9));
  assert.ok(phaseTwoCrabwalk.every((clip) => clip.parameters.projectileCount === 14));
  assert.ok(phaseTwoCrabwalk.every((clip) => clip.parameters.shotIntervalFrames === 8));
  assert.ok(crabwalk.every((clip) => clip.repeat.count === 2));
  assert.ok(crabwalk.every((clip) => clip.repeat.intervalSeconds === 7.6));
  for (const phaseId of new Set(crabwalk.map((clip) => clip.phaseId))) {
    assert.equal(
      recoveryFor(tuned, 'bastion-crabwalk-barrage', phaseId).durationSeconds,
      1.1
    );
  }
});

test('bounded maximum Frontier tuning remains a valid isolated campaign preview', () => {
  const maximumDraft = Object.fromEntries(Object.entries(
    FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES
  ).map(([groupId, ranges]) => [
    groupId,
    Object.fromEntries(Object.entries(ranges).map(([field, specification]) => [
      field,
      specification.maximum
    ]))
  ]));
  const tunedTimeline = applyFrontierCrownclawAttackTuningToTimeline(
    sourceTimeline,
    maximumDraft
  );
  const candidate = structuredClone(frontierPreview.campaign);
  const level = candidate.levels.find((entry) => entry.id === frontierPreview.levelId);
  const wave = level.waves.find((entry) => entry.id === frontierPreview.waveId);
  const boss = wave.events.find((event) => event.id === frontierPreview.eventId);
  boss.timeline = tunedTimeline;

  const result = validateGameCampaign(candidate);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test('Frontier tuning is a collapsed external sandbox panel and ignores other timelines', async () => {
  const appSource = await readFile(
    path.join(
      repositoryRoot,
      'director',
      'src',
      'tools',
      'bosses',
      'BossSandboxApp.tsx'
    ),
    'utf8'
  );
  assert.match(appSource, /selectedChoice\.prototypeId === 'frontier-crownclaw'/);
  assert.match(appSource, /<details className="boss-sandbox__frontier-tuning">/);
  assert.doesNotMatch(
    appSource,
    /<details className="boss-sandbox__frontier-tuning"\s+open/
  );

  const prismPreview = buildSandboxBossPrototypePreview(campaign, 'prism-moth-brood');
  const prismEvent = prismPreview.previewWave.events.find((event) => event.kind === 'boss');
  const untouched = applyFrontierCrownclawAttackTuningToTimeline(
    prismEvent.timeline,
    { harpoon: { launchCount: 2 } }
  );
  assert.deepEqual(untouched, prismEvent.timeline);
});
