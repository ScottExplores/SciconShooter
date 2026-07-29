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

const { compileBossAttackTimeline } = await vite.ssrLoadModule(
  '/game-config/bossAttackSentences.ts'
);
const { validateGameCampaign: validateBrowserCampaign } = await vite.ssrLoadModule(
  '/game-config/validate.ts'
);
const { cloneWaveEvent } = await vite.ssrLoadModule(
  '/director/src/editor/editorOperations.ts'
);
const { createPromotionCampaign } = await vite.ssrLoadModule(
  '/director/src/combat-lab/experimentModel.ts'
);

const benchmarkBossFixture = () => {
  const candidate = structuredClone(campaign);
  const boss = candidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.phases.length === 2);
  assert.ok(boss);
  return { candidate, boss };
};

const attackDefinitions = [
  {
    id: 'claw-corridor',
    label: 'Claw Corridor',
    role: 'core',
    skillTest: 'rhythm-dodge',
    recognitionCue: 'The port and starboard claws flare in sequence.',
    solution: 'Cross behind each warned side after its volley passes.',
    safeRouteRule: 'opposite-side-dodge',
    sourceSocketRoles: ['port', 'starboard'],
    startSeconds: 0,
    primitiveId: 'side-barrage',
    telegraphStyle: 'target',
    parameters: (beatIndex) => ({
      projectileCount: 5,
      side: beatIndex % 2 === 0 ? 'port' : 'starboard'
    }),
    offsets: [0, 0.9]
  },
  {
    id: 'dead-signal-gates',
    label: 'Dead Signal Gates',
    role: 'core',
    skillTest: 'gap-tracking',
    recognitionCue: 'The core draws two bright rings around a moving opening.',
    solution: 'Follow the warned opening as it rotates through the lower arena.',
    safeRouteRule: 'rotating-gap',
    sourceSocketRoles: ['core'],
    startSeconds: 4,
    primitiveId: 'gap-ring',
    telegraphStyle: 'ring',
    parameters: (beatIndex) => ({
      projectileCount: 12,
      sequence: beatIndex,
      rotationDirection: 'clockwise'
    }),
    offsets: [0, 0.9]
  },
  {
    id: 'memory-lattice',
    label: 'Memory Lattice',
    role: 'core',
    skillTest: 'lane-routing',
    recognitionCue: 'A cyan channel appears before the lattice descends.',
    solution: 'Enter the highlighted channel, then track its next lane.',
    safeRouteRule: 'shifting-channel',
    sourceSocketRoles: ['core', 'port', 'starboard'],
    startSeconds: 8,
    primitiveId: 'weave-wall',
    telegraphStyle: 'lane',
    parameters: (beatIndex) => ({ projectileCount: 8, sequence: beatIndex }),
    offsets: [0, 0.9]
  },
  {
    id: 'revenant-maze',
    label: 'Revenant Maze',
    role: 'signature',
    skillTest: 'route-combination',
    recognitionCue: 'Every limb locks outward while the core flashes violet.',
    solution: 'Take the warned channel, then finish in the opposite safe quadrant.',
    safeRouteRule: 'channel-to-quadrant',
    sourceSocketRoles: ['port', 'starboard', 'core'],
    startSeconds: 12,
    primitiveId: 'side-barrage',
    telegraphStyle: 'target',
    parameters: (beatIndex) => ({
      projectileCount: 4,
      side: beatIndex % 2 === 0 ? 'port' : 'starboard'
    }),
    offsets: [0, 0.7, 1.4, 2.1]
  }
];

const createBlueprint = (phaseIds) => ({
  durationSeconds: 18,
  loop: true,
  phases: phaseIds.map((phaseId, phaseIndex) => ({
    phaseId,
    color: phaseIndex === 0 ? '#67e8f9' : '#c084fc',
    cameraStrength: phaseIndex === 0 ? 1 : 2,
    attacks: attackDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      phaseId,
      role: definition.role,
      skillTest: definition.skillTest,
      recognitionCue: definition.recognitionCue,
      solution: definition.solution,
      safeRouteRule: definition.safeRouteRule,
      sourceSocketRoles: [...definition.sourceSocketRoles],
      startSeconds: definition.startSeconds,
      recoverySeconds: 0.6,
      color: phaseIndex === 0 ? '#67e8f9' : '#c084fc',
      beats: definition.offsets.map((offsetSeconds, beatIndex) => ({
        id: `beat-${beatIndex + 1}`,
        label: `${definition.label} beat ${beatIndex + 1}`,
        primitiveId: definition.primitiveId,
        offsetSeconds,
        leadSeconds: 0.5,
        actionDurationSeconds: 0.2,
        telegraphStyle: definition.telegraphStyle,
        parameters: definition.parameters(beatIndex + phaseIndex)
      }))
    }))
  }))
});

const compiledCampaignFixture = () => {
  const fixture = benchmarkBossFixture();
  const phaseIds = fixture.boss.phases.map((phase) => phase.id);
  fixture.boss.timeline = compileBossAttackTimeline(createBlueprint(phaseIds));
  return fixture;
};

const validationResults = (candidate) => ({
  server: validateServerCampaign(candidate),
  browser: validateBrowserCampaign(candidate)
});

const assertAcceptedByBoth = (candidate) => {
  const { server, browser } = validationResults(candidate);
  assert.equal(server.valid, true, server.errors.join('\n'));
  assert.equal(
    browser.valid,
    true,
    browser.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
  );
};

const assertRejectedByBoth = (candidate, { browserCode, serverPattern }) => {
  const { server, browser } = validationResults(candidate);
  assert.equal(server.valid, false, 'server validator should reject malformed Boss Factory data');
  assert.equal(browser.valid, false, 'browser validator should reject malformed Boss Factory data');
  if (browserCode) {
    assert.ok(
      browser.issues.some((issue) => issue.code === browserCode),
      `browser issues should include ${browserCode}: ${browser.issues.map((issue) => issue.code).join(', ')}`
    );
  }
  if (serverPattern) {
    assert.ok(
      server.errors.some((error) => serverPattern.test(error)),
      `server errors should match ${serverPattern}: ${server.errors.join('\n')}`
    );
  }
};

test('Boss Factory compiler produces one deterministic three-core/one-signature timeline with complete phase variants', () => {
  const { candidate, boss } = benchmarkBossFixture();
  const phaseIds = boss.phases.map((phase) => phase.id);
  const blueprint = createBlueprint(phaseIds);
  const first = compileBossAttackTimeline(blueprint);
  const second = compileBossAttackTimeline(structuredClone(blueprint));

  assert.deepEqual(first, second, 'the same authoring input must compile byte-for-byte equivalent data');
  assert.equal(first.attacks.length, 4);
  assert.equal(first.attacks.filter((attack) => attack.role === 'core').length, 3);
  assert.equal(first.attacks.filter((attack) => attack.role === 'signature').length, 1);
  first.attacks.forEach((attack) => {
    assert.deepEqual(attack.variants.map((variant) => variant.phaseId), phaseIds);
    attack.variants.forEach((variant) => {
      assert.equal(variant.beatClipIds.length, attack.role === 'signature' ? 4 : 2);
      const recovery = first.clips.find((clip) => clip.id === variant.recoveryClipId);
      assert.equal(recovery?.primitiveId, 'effect-cue');
      const beats = variant.beatClipIds.map((clipId) => first.clips.find((clip) => clip.id === clipId));
      assert.ok(beats.every(Boolean));
      assert.ok(beats.every((beat) => beat.phaseId === variant.phaseId));
      assert.ok(beats.every((beat) => {
        const warning = first.clips.find((clip) => clip.id === beat.telegraphClipId);
        return warning?.primitiveId === 'telegraph' && warning.startSeconds < beat.startSeconds;
      }));
    });
  });

  boss.timeline = first;
  assertAcceptedByBoth(candidate);
});

test('Mission Builder boss duplication remaps nested attack variants with their phases and clips', () => {
  const { boss } = compiledCampaignFixture();
  const duplicate = cloneWaveEvent(boss);
  assert.equal(duplicate.kind, 'boss');
  assert.ok(boss.timeline?.attacks);
  assert.ok(duplicate.timeline?.attacks);

  const phaseIdMap = new Map(boss.phases.map((phase, index) => (
    [phase.id, duplicate.phases[index].id]
  )));
  const clipIdMap = new Map(boss.timeline.clips.map((clip, index) => (
    [clip.id, duplicate.timeline.clips[index].id]
  )));
  assert.notDeepEqual(
    duplicate.timeline.clips.map((clip) => clip.id),
    boss.timeline.clips.map((clip) => clip.id)
  );
  assert.deepEqual(
    duplicate.timeline.attacks.map((attack) => attack.id),
    boss.timeline.attacks.map((attack) => attack.id),
    'attack identity IDs remain stable while their local references are remapped'
  );

  boss.timeline.attacks.forEach((sourceAttack, attackIndex) => {
    const copiedAttack = duplicate.timeline.attacks[attackIndex];
    sourceAttack.variants.forEach((sourceVariant, variantIndex) => {
      const copiedVariant = copiedAttack.variants[variantIndex];
      assert.equal(copiedVariant.phaseId, phaseIdMap.get(sourceVariant.phaseId));
      assert.deepEqual(
        copiedVariant.beatClipIds,
        sourceVariant.beatClipIds.map((clipId) => clipIdMap.get(clipId))
      );
      assert.equal(
        copiedVariant.recoveryClipId,
        clipIdMap.get(sourceVariant.recoveryClipId)
      );
    });
  });
});

test('Combat Lab promotion remaps nested attack references and preserves the four attack identities', () => {
  const candidate = structuredClone(campaign);
  const boss = candidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.bossId === 'bottleneck-drone');
  assert.ok(boss);
  boss.timeline = compileBossAttackTimeline(createBlueprint(boss.phases.map((phase) => phase.id)));
  const targetLevel = candidate.levels[0];
  const targetWave = targetLevel.waves[0];
  const result = createPromotionCampaign(candidate, {
    kind: 'event',
    targetLevelId: targetLevel.id,
    targetWaveId: targetWave.id,
    event: boss,
    startSeconds: 0
  }, {
    now: () => '2026-07-25T12:00:00.000Z'
  });
  const promoted = result.campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.id === result.insertedEventId);
  assert.equal(promoted?.kind, 'boss');
  assert.ok(boss.timeline?.attacks);
  assert.ok(promoted.timeline?.attacks);
  assert.deepEqual(
    promoted.timeline.attacks.map((attack) => attack.id),
    boss.timeline.attacks.map((attack) => attack.id)
  );

  boss.timeline.attacks.forEach((sourceAttack, attackIndex) => {
    const promotedAttack = promoted.timeline.attacks[attackIndex];
    sourceAttack.variants.forEach((sourceVariant, variantIndex) => {
      const promotedVariant = promotedAttack.variants[variantIndex];
      assert.equal(promotedVariant.phaseId, result.idMap[sourceVariant.phaseId]);
      assert.deepEqual(
        promotedVariant.beatClipIds,
        sourceVariant.beatClipIds.map((clipId) => result.idMap[clipId])
      );
      assert.equal(
        promotedVariant.recoveryClipId,
        result.idMap[sourceVariant.recoveryClipId]
      );
    });
  });
  assertAcceptedByBoth(result.campaign);
});

test('Boss Factory compiler rejects malformed rosters, variants, beats, and recovery windows before runtime exposure', () => {
  const { boss } = benchmarkBossFixture();
  const phaseIds = boss.phases.map((phase) => phase.id);
  const cases = [
    {
      label: 'missing signature identity',
      mutate: (blueprint) => blueprint.phases[0].attacks.pop(),
      pattern: /exactly three core attacks and one signature/i
    },
    {
      label: 'phase substitutes a different identity',
      mutate: (blueprint) => { blueprint.phases[1].attacks[0].id = 'replacement-corridor'; },
      pattern: /same three core attacks and one signature/i
    },
    {
      label: 'phase changes learned-rule metadata',
      mutate: (blueprint) => { blueprint.phases[1].attacks[0].solution = 'A different solution'; },
      pattern: /same learned-rule metadata/i
    },
    {
      label: 'beats are not chronological',
      mutate: (blueprint) => { blueprint.phases[0].attacks[0].beats[1].offsetSeconds = 0; },
      pattern: /strictly increasing/i
    },
    {
      label: 'duplicate beat IDs',
      mutate: (blueprint) => { blueprint.phases[0].attacks[0].beats[1].id = 'beat-1'; },
      pattern: /duplicate beat ID/i
    },
    {
      label: 'recovery leaves the timeline',
      mutate: (blueprint) => { blueprint.phases[0].attacks[3].recoverySeconds = 10; },
      pattern: /finish inside the timeline/i
    },
    {
      label: 'unknown executable primitive',
      mutate: (blueprint) => { blueprint.phases[0].attacks[0].beats[0].primitiveId = 'run-script'; },
      pattern: /damaging Boss Factory primitive/i
    }
  ];

  cases.forEach(({ label, mutate, pattern }) => {
    const blueprint = createBlueprint(phaseIds);
    mutate(blueprint);
    assert.throws(() => compileBossAttackTimeline(blueprint), pattern, label);
  });
});

test('browser and server require exactly three core attacks and one signature attack', () => {
  const missingAttack = compiledCampaignFixture();
  missingAttack.boss.timeline.attacks.pop();
  assertRejectedByBoth(missingAttack.candidate, {
    browserCode: 'invalid_attack_roster',
    serverPattern: /exactly three core attacks and one signature/i
  });

  const wrongRoles = compiledCampaignFixture();
  wrongRoles.boss.timeline.attacks[3].role = 'core';
  assertRejectedByBoth(wrongRoles.candidate, {
    browserCode: 'invalid_attack_roster',
    serverPattern: /exactly three core attacks and one signature/i
  });
});

test('browser and server require one attack variant for every boss phase', () => {
  const missingVariant = compiledCampaignFixture();
  missingVariant.boss.timeline.attacks[0].variants.pop();
  assertRejectedByBoth(missingVariant.candidate, {
    browserCode: 'missing_phase_variant',
    serverPattern: /exactly one variant for every boss phase/i
  });

  const duplicateVariant = compiledCampaignFixture();
  duplicateVariant.boss.timeline.attacks[0].variants[1].phaseId =
    duplicateVariant.boss.timeline.attacks[0].variants[0].phaseId;
  assertRejectedByBoth(duplicateVariant.candidate, {
    browserCode: 'duplicate_value',
    serverPattern: /duplicates attack phase variant/i
  });
});

test('browser and server reject out-of-order, multiply-owned, and unowned attack beats', () => {
  const outOfOrder = compiledCampaignFixture();
  outOfOrder.boss.timeline.attacks[0].variants[0].beatClipIds.reverse();
  assertRejectedByBoth(outOfOrder.candidate, {
    browserCode: 'invalid_timing',
    serverPattern: /strictly chronological/i
  });

  const duplicateOwner = compiledCampaignFixture();
  const phaseId = duplicateOwner.boss.phases[0].id;
  const firstAttack = duplicateOwner.boss.timeline.attacks[0].variants.find(
    (variant) => variant.phaseId === phaseId
  );
  const secondAttack = duplicateOwner.boss.timeline.attacks[1].variants.find(
    (variant) => variant.phaseId === phaseId
  );
  secondAttack.beatClipIds[0] = firstAttack.beatClipIds[0];
  assertRejectedByBoth(duplicateOwner.candidate, {
    browserCode: 'duplicate_reference',
    serverPattern: /already owned by another attack variant/i
  });

  const unowned = compiledCampaignFixture();
  unowned.boss.timeline.attacks[0].variants[0].beatClipIds.pop();
  assertRejectedByBoth(unowned.candidate, {
    browserCode: 'unowned_attack_beat',
    serverPattern: /must belong to exactly one Boss Factory attack variant/i
  });
});

test('browser and server require a unique time-based recovery after every final beat', () => {
  const earlyRecovery = compiledCampaignFixture();
  const variant = earlyRecovery.boss.timeline.attacks[0].variants[0];
  const recovery = earlyRecovery.boss.timeline.clips.find(
    (clip) => clip.id === variant.recoveryClipId
  );
  recovery.startSeconds = 0;
  assertRejectedByBoth(earlyRecovery.candidate, {
    browserCode: 'invalid_timing',
    serverPattern: /must start after the final repeated beat/i
  });

  const reusedRecovery = compiledCampaignFixture();
  const firstVariant = reusedRecovery.boss.timeline.attacks[0].variants[0];
  reusedRecovery.boss.timeline.attacks[1].variants[0].recoveryClipId = firstVariant.recoveryClipId;
  assertRejectedByBoth(reusedRecovery.candidate, {
    browserCode: 'duplicate_reference',
    serverPattern: /already owned by another attack variant/i
  });

  const damagingRecovery = compiledCampaignFixture();
  const damagingVariant = damagingRecovery.boss.timeline.attacks[0].variants[0];
  damagingVariant.recoveryClipId = damagingVariant.beatClipIds.at(-1);
  assertRejectedByBoth(damagingRecovery.candidate, {
    browserCode: 'invalid_reference',
    serverPattern: /time-based effect-cue/i
  });
});

test('browser and server reject malformed descriptive attack data and arbitrary fields', () => {
  const invalidSkill = compiledCampaignFixture();
  invalidSkill.boss.timeline.attacks[0].skillTest = 'impossible-script';
  assertRejectedByBoth(invalidSkill.candidate, {
    browserCode: 'unsupported_value',
    serverPattern: /skillTest has unsupported value/i
  });

  const arbitraryField = compiledCampaignFixture();
  arbitraryField.boss.timeline.attacks[0].script = 'spawnAnything()';
  assertRejectedByBoth(arbitraryField.candidate, {
    browserCode: 'unknown_property',
    serverPattern: /unsupported fields: script/i
  });
});
