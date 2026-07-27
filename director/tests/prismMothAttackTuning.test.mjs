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

const {
  DEFAULT_PRISM_MOTH_ATTACK_TUNING,
  PRISM_MOTH_ATTACK_TUNING_RANGES,
  PRISM_MOTH_FORMATION_TEMPLATES,
  applyPrismMothAttackTuningToTimeline,
  normalizePrismMothAttackTuning
} = await vite.ssrLoadModule(
  '/director/src/tools/bosses/prismMothAttackTuning.ts'
);
const { PrismMothAttackTuningPanel } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/PrismMothAttackTuningPanel.tsx'
);
const { buildSandboxBossPrototypePreview } = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const { validateGameCampaign } = await vite.ssrLoadModule(
  '/game-config/validate.ts'
);
const { BOSS_TIMELINE_PRIMITIVES } = await vite.ssrLoadModule(
  '/game-config/bossTimeline.ts'
);

const prismPreview = buildSandboxBossPrototypePreview(campaign, 'prism-moth-brood');
const prismEvent = prismPreview.previewWave.events.find((event) => (
  event.kind === 'boss' && event.id === prismPreview.eventId
));
assert.ok(prismEvent?.timeline, 'Prism preview must expose its compiled boss timeline');
const sourceTimeline = prismEvent.timeline;

const findActions = (timeline, primitiveId) => timeline.clips.filter((clip) => (
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

test('Prism tuning defaults are deeply frozen, mobile-bounded, and grouped into exactly four attacks', () => {
  assert.deepEqual(Object.keys(DEFAULT_PRISM_MOTH_ATTACK_TUNING), [
    'attack1',
    'attack2',
    'attack3',
    'attack4'
  ]);
  assert.equal(Object.isFrozen(DEFAULT_PRISM_MOTH_ATTACK_TUNING), true);
  for (const attack of Object.values(DEFAULT_PRISM_MOTH_ATTACK_TUNING)) {
    assert.equal(Object.isFrozen(attack), true);
  }

  for (const attackId of ['attack1', 'attack2', 'attack3', 'attack4']) {
    const defaults = DEFAULT_PRISM_MOTH_ATTACK_TUNING[attackId];
    const ranges = PRISM_MOTH_ATTACK_TUNING_RANGES[attackId];
    for (const [field, specification] of Object.entries(ranges)) {
      assert.ok(defaults[field] >= specification.minimum, `${attackId}.${field} default is too small`);
      assert.ok(defaults[field] <= specification.maximum, `${attackId}.${field} default is too large`);
    }
  }
  assert.ok(DEFAULT_PRISM_MOTH_ATTACK_TUNING.attack1.safeLaneWidthRatio >= 0.3);
  assert.ok(DEFAULT_PRISM_MOTH_ATTACK_TUNING.attack2.routeWidthRatio >= 0.3);
  assert.ok(DEFAULT_PRISM_MOTH_ATTACK_TUNING.attack4.corridorWidthRatio >= 0.26);
});

test('Prism tuning normalization clamps numbers, snaps steps, and rejects unknown enum values', () => {
  const normalized = normalizePrismMothAttackTuning({
    attack1: {
      wingbeatCadenceFrames: -100,
      featherCount: 100,
      featherSpacingRadians: 0.086,
      fanAngleRadians: Number.POSITIVE_INFINITY,
      safeLaneWidthRatio: 1,
      bossDriftRatio: -1,
      sequenceLength: 4.6
    },
    attack2: {
      nodeCount: 1,
      hatchDelayFrames: 200,
      formationTemplate: 'not-a-template',
      broodSpeedRatio: 0.0176,
      spacingRatio: Number.NaN,
      routeWidthRatio: 0,
      waves: 1.7
    },
    attack3: {
      swoopCount: 99,
      speedMultiplier: 0,
      curveDepthRatio: 1,
      edgeTelegraphFrames: 1,
      featherTrailFrames: 999,
      recoveryFrames: 42.4
    },
    attack4: {
      nodeCount: 0,
      activationOrder: 'unknown-order',
      formationRotation: 'random',
      corridorWidthRatio: 0.1,
      beats: 99,
      coreChargeFrames: 1,
      recoveryFrames: 999
    }
  });

  assert.equal(normalized.attack1.wingbeatCadenceFrames, 24);
  assert.equal(normalized.attack1.featherCount, 7);
  assert.equal(normalized.attack1.featherSpacingRadians, 0.09);
  assert.equal(normalized.attack1.fanAngleRadians, 0.56);
  assert.equal(normalized.attack1.safeLaneWidthRatio, 0.46);
  assert.equal(normalized.attack1.bossDriftRatio, 0);
  assert.equal(normalized.attack1.sequenceLength, 5);
  assert.equal(normalized.attack2.nodeCount, 3);
  assert.equal(normalized.attack2.hatchDelayFrames, 48);
  assert.equal(normalized.attack2.formationTemplate, 'mirrored-arcs');
  assert.equal(normalized.attack2.broodSpeedRatio, 0.018);
  assert.equal(normalized.attack2.spacingRatio, 0.22);
  assert.equal(normalized.attack2.routeWidthRatio, 0.3);
  assert.equal(normalized.attack2.waves, 2);
  assert.equal(normalized.attack3.swoopCount, 3);
  assert.equal(normalized.attack3.speedMultiplier, 0.8);
  assert.equal(normalized.attack3.curveDepthRatio, 0.34);
  assert.equal(normalized.attack3.edgeTelegraphFrames, 36);
  assert.equal(normalized.attack3.featherTrailFrames, 72);
  assert.equal(normalized.attack3.recoveryFrames, 42);
  assert.equal(normalized.attack4.nodeCount, 4);
  assert.equal(normalized.attack4.activationOrder, 'outer-to-inner');
  assert.equal(normalized.attack4.formationRotation, 'clockwise');
  assert.equal(normalized.attack4.corridorWidthRatio, 0.26);
  assert.equal(normalized.attack4.beats, 5);
  assert.equal(normalized.attack4.coreChargeFrames, 48);
  assert.equal(normalized.attack4.recoveryFrames, 120);
});

test('Prism tuning panel exposes every requested control under exactly four named attack groups', () => {
  const html = renderToStaticMarkup(React.createElement(PrismMothAttackTuningPanel, {
    value: DEFAULT_PRISM_MOTH_ATTACK_TUNING,
    onChange: () => {}
  }));
  assert.equal((html.match(/<fieldset/g) ?? []).length, 4);
  assert.deepEqual(
    [...html.matchAll(/data-prism-attack="(attack[1-4])"/g)].map((match) => match[1]),
    ['attack1', 'attack2', 'attack3', 'attack4']
  );
  for (const label of [
    'Wingbeat cadence',
    'Feather count',
    'Feather spacing',
    'Fan angle',
    'Safe lane width',
    'Boss drift',
    'Sequence length',
    'Node count',
    'Hatch delay',
    'Formation template',
    'Brood speed',
    'Formation spacing',
    'Route width',
    'Waves',
    'Swoops',
    'Swoop speed multiplier',
    'Curve depth',
    'Edge telegraph',
    'Feather trail',
    'Recovery',
    'Activation order',
    'Formation rotation',
    'Corridor width',
    'Pattern beats',
    'Core charge'
  ]) {
    assert.match(html, new RegExp(label));
  }
  for (const template of PRISM_MOTH_FORMATION_TEMPLATES) {
    assert.match(html, new RegExp(`value="${template}"`));
  }
});

test('Prism tuning applies all four groups without mutating the compiled source timeline', () => {
  const before = structuredClone(sourceTimeline);
  const tuned = applyPrismMothAttackTuningToTimeline(sourceTimeline, {
    attack1: {
      wingbeatCadenceFrames: 24,
      featherCount: 7,
      featherSpacingRadians: 0.07,
      fanAngleRadians: 0.7,
      safeLaneWidthRatio: 0.4,
      bossDriftRatio: 0.1,
      sequenceLength: 4
    },
    attack2: {
      nodeCount: 5,
      hatchDelayFrames: 42,
      formationTemplate: 'split-corridor',
      broodSpeedRatio: 0.016,
      spacingRatio: 0.3,
      routeWidthRatio: 0.4,
      waves: 1
    },
    attack3: {
      swoopCount: 3,
      speedMultiplier: 1.2,
      curveDepthRatio: 0.32,
      edgeTelegraphFrames: 42,
      featherTrailFrames: 24,
      recoveryFrames: 54
    },
    attack4: {
      nodeCount: 5,
      activationOrder: 'right-to-left',
      formationRotation: 'counterclockwise',
      corridorWidthRatio: 0.42,
      beats: 5,
      coreChargeFrames: 120,
      recoveryFrames: 120
    }
  });

  assert.deepEqual(sourceTimeline, before);
  assert.notStrictEqual(tuned, sourceTimeline);
  assert.notStrictEqual(tuned.clips, sourceTimeline.clips);
  assert.equal(tuned.attacks.length, 4);

  for (const action of findActions(tuned, 'prism-wingbeat-weave')) {
    assert.equal(action.repeat.count, 4);
    assert.equal(action.repeat.intervalSeconds, 0.4);
    assert.equal(action.parameters.projectileCount, 7);
    assert.equal(action.parameters.shotIntervalFrames, 7);
    assert.equal(action.parameters.channelWidthPixels, 156);
    assert.equal(action.parameters.sweepRangeRatio, 0.7);
    assert.deepEqual(warningFor(tuned, action).repeat, action.repeat);
  }

  for (const action of findActions(tuned, 'prism-brood-procession')) {
    assert.equal(action.repeat.count, 1);
    assert.equal(action.parameters.projectileCount, 5);
    assert.equal(action.parameters.channelWidthPixels, 156);
    assert.equal(action.parameters.sweepRangeRatio, 0.3);
    assert.equal(action.parameters.sweepPasses, 1);
    assert.deepEqual(warningFor(tuned, action).repeat, action.repeat);
  }

  for (const action of findActions(tuned, 'prism-lunar-swoop')) {
    assert.equal(action.repeat.count, 3);
    assert.equal(action.parameters.projectileCount, 3);
    assert.equal(action.parameters.sweepRangeRatio, 0.32);
    assert.equal(action.parameters.sweepPasses, 3);
    const warning = warningFor(tuned, action);
    assert.equal(warning.durationSeconds, 0.7);
    assert.equal(warning.parameters.warningSeconds, 0.7);
    assert.equal(action.startSeconds, warning.startSeconds + 0.7);
    assert.deepEqual(warning.repeat, action.repeat);
    const recovery = recoveryFor(tuned, 'lunar-prism-swoop', action.phaseId);
    assert.equal(recovery.durationSeconds, 0.9);
    assert.ok(recovery.startSeconds >= action.startSeconds + action.durationSeconds);
  }

  const kaleidoscopeActions = findActions(tuned, 'prism-kaleidoscope-brood');
  assert.equal(kaleidoscopeActions.length, 8);
  for (const action of kaleidoscopeActions) {
    assert.equal(action.parameters.projectileCount, 5);
    assert.equal(action.parameters.channelWidthPixels, 164);
    assert.ok(Number.isInteger(action.parameters.sequence));
    if (BOSS_TIMELINE_PRIMITIVES['prism-kaleidoscope-brood'].parameterKeys.includes('rotationDirection')) {
      assert.equal(action.parameters.rotationDirection, 'counterclockwise');
    } else {
      assert.equal(action.parameters.rotationDirection, undefined);
    }
  }
  const firstKaleidoscopeAction = kaleidoscopeActions.find((action) => (
    action.id.includes('cocoon-charge')
  ));
  assert.equal(firstKaleidoscopeAction.parameters.pulseIntervalSeconds, 2);
  assert.equal(
    warningFor(tuned, firstKaleidoscopeAction).parameters.warningSeconds,
    2
  );
  for (const phaseId of new Set(kaleidoscopeActions.map((action) => action.phaseId))) {
    assert.equal(
      recoveryFor(tuned, 'kaleidoscope-brood', phaseId).durationSeconds,
      2
    );
  }

  const untouchedCue = sourceTimeline.clips.find((clip) => (
    clip.id === 'sandbox-moth-prism-metamorphosis-sequence'
  ));
  assert.deepEqual(
    tuned.clips.find((clip) => clip.id === untouchedCue.id),
    untouchedCue
  );
});

test('aggressive mobile-safe Prism tuning remains a valid full campaign preview', () => {
  const tunedTimeline = applyPrismMothAttackTuningToTimeline(sourceTimeline, {
    attack1: {
      wingbeatCadenceFrames: 24,
      featherCount: 7,
      featherSpacingRadians: 0.12,
      fanAngleRadians: 0.72,
      safeLaneWidthRatio: 0.3,
      bossDriftRatio: 0.12,
      sequenceLength: 5
    },
    attack2: {
      nodeCount: 5,
      hatchDelayFrames: 48,
      formationTemplate: 'alternating-diagonals',
      broodSpeedRatio: 0.018,
      spacingRatio: 0.32,
      routeWidthRatio: 0.3,
      waves: 2
    },
    attack3: {
      swoopCount: 3,
      speedMultiplier: 0.8,
      curveDepthRatio: 0.34,
      edgeTelegraphFrames: 54,
      featherTrailFrames: 72,
      recoveryFrames: 60
    },
    attack4: {
      nodeCount: 6,
      activationOrder: 'inner-to-outer',
      formationRotation: 'counterclockwise',
      corridorWidthRatio: 0.26,
      beats: 5,
      coreChargeFrames: 120,
      recoveryFrames: 120
    }
  });
  const candidate = structuredClone(prismPreview.campaign);
  const level = candidate.levels.find((entry) => entry.id === prismPreview.levelId);
  const wave = level.waves.find((entry) => entry.id === prismPreview.waveId);
  const boss = wave.events.find((event) => event.id === prismPreview.eventId);
  boss.timeline = tunedTimeline;

  const result = validateGameCampaign(candidate);
  assert.equal(
    result.valid,
    true,
    JSON.stringify(result.issues, null, 2)
  );
});
