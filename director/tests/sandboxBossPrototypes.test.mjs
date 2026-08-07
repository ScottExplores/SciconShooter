import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { validateGameCampaign as validateServerCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const campaignBytesBefore = await readFile(campaignPath);
const campaignStatBefore = await stat(campaignPath);
const campaign = JSON.parse(campaignBytesBefore.toString('utf8'));
const sourceSnapshot = structuredClone(campaign);
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
const {
  SANDBOX_BOSS_PROTOTYPES,
  buildSandboxBossPrototypePreview
} = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const { calculateCombatLabDps } = await vite.ssrLoadModule(
  '/director/src/combat-lab/combatLabTelemetry.ts'
);

const getPrototypeBoss = (prototypeId) => {
  const preview = buildSandboxBossPrototypePreview(campaign, prototypeId);
  const boss = preview.previewWave.events.find((event) => event.kind === 'boss');
  assert.ok(boss, `${prototypeId} must focus one boss`);
  return { boss, preview };
};

test('all Sandbox boss descriptors build deterministic, valid, immutable-provenance previews', () => {
  assert.equal(SANDBOX_BOSS_PROTOTYPES.length, 23);
  assert.equal(Object.isFrozen(SANDBOX_BOSS_PROTOTYPES), true);

  const prototypeHashes = new Set();
  const previewHashes = new Set();
  for (const descriptor of SANDBOX_BOSS_PROTOTYPES) {
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(descriptor.sandboxOnly, true);
    assert.equal(Object.hasOwn(descriptor, 'libraryCategory'), false);
    assert.match(descriptor.prototypeHash, /^sandbox-fnv1a64:[0-9a-f]{16}$/);

    const first = descriptor.buildPreview(campaign);
    const repeated = descriptor.buildPreview(campaign);
    assert.deepEqual(first, repeated);
    assert.equal(first.sandboxPrototype.source, 'director-sandbox-prototype');
    assert.equal(first.sandboxPrototype.sandboxOnly, true);
    assert.equal(first.sandboxPrototype.promotionAllowed, false);
    assert.equal(first.sandboxPrototype.prototypeId, descriptor.id);
    assert.equal(first.sandboxPrototype.prototypeHash, descriptor.prototypeHash);
    assert.match(first.sandboxPrototype.previewHash, /^sandbox-fnv1a64:[0-9a-f]{16}$/);
    assert.equal(first.focus.kind, 'boss');
    assert.equal(first.previewWave.completionRule, 'boss-defeat');
    assert.equal(first.previewWave.events.length, 1);

    const browserResult = validateBrowserCampaign(first.campaign);
    const serverResult = validateServerCampaign(first.campaign);
    assert.equal(
      browserResult.valid,
      true,
      browserResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
    );
    assert.equal(serverResult.valid, true, serverResult.errors.join('\n'));

    prototypeHashes.add(descriptor.prototypeHash);
    previewHashes.add(first.sandboxPrototype.previewHash);
  }

  assert.equal(prototypeHashes.size, SANDBOX_BOSS_PROTOTYPES.length);
  assert.equal(previewHashes.size, SANDBOX_BOSS_PROTOTYPES.length);
  assert.deepEqual(campaign, sourceSnapshot, 'pure builders must not mutate their source campaign');
});

test('Mini-Boss Lab exposes eight Campaign-assigned encounters for isolated previews', () => {
  const expectedIds = [
    'fracture-engine-elite',
    'aegis-brood-core',
    'railspine-wallcrawler',
    'maw-carrier',
    'twin-meridian-sentinels',
    'prism-bloom',
    'aegis-convoy-captain',
    'gridline-sentries'
  ];
  const miniBosses = SANDBOX_BOSS_PROTOTYPES.filter((descriptor) => (
    descriptor.encounterClass === 'mini-boss'
  ));

  assert.deepEqual(miniBosses.map((descriptor) => descriptor.id), expectedIds);
  for (const descriptor of miniBosses) {
    const metadata = descriptor.miniBoss;
    assert.ok(metadata, `${descriptor.id} needs Mini-Boss Lab metadata`);
    assert.equal(metadata.encounterId, descriptor.id);
    assert.equal(metadata.sandboxReady, true);
    assert.equal(metadata.campaignAssigned, true);
    assert.equal(metadata.categories.includes('mini-bosses'), true);
    assert.equal(metadata.assetValidationStatus, 'approved-existing-assets-bound');
    assert.ok(metadata.assetIds.length > 0);
    assert.ok(metadata.signatureManeuver.length > 0);
    assert.ok(metadata.supportingBehavior.length > 0);
    assert.ok(metadata.expectedDurationSeconds >= 15);
    assert.ok(metadata.expectedDurationSeconds <= 35);

    const { boss, preview } = getPrototypeBoss(descriptor.id);
    assert.equal(boss.id, `sandbox-${descriptor.id}`);
    assert.equal(boss.durationSeconds, metadata.expectedDurationSeconds);
    assert.equal(preview.previewWave.durationSeconds, metadata.expectedDurationSeconds);
    assert.equal(boss.phases.length, 1);
    assert.equal(
      boss.timeline.clips.filter((clip) => Boolean(clip.telegraphClipId)).length,
      2,
      `${descriptor.id} should expose one signature beat and one supporting beat`
    );
  }
});

test('Redline Re-entry uses the allowlisted sweep, bank, and re-entry path', () => {
  const { boss } = getPrototypeBoss('sweep-bank-reentry');
  const pathClips = boss.timeline.clips.filter((clip) => clip.primitiveId === 'follow-path');

  assert.equal(pathClips.length, boss.phases.length);
  pathClips.forEach((clip) => {
    assert.equal(clip.track, 'movement');
    assert.equal(clip.trigger, 'time');
    assert.equal(clip.parameters.movementPathId, 'sweep-bank-reentry');
    assert.ok(clip.durationSeconds > 0);
  });
});

test('Prism Moth compiles exactly four anatomy-owned attacks and a real metamorphosis', () => {
  const descriptor = SANDBOX_BOSS_PROTOTYPES.find((entry) => entry.id === 'prism-moth-brood');
  const { boss } = getPrototypeBoss('prism-moth-brood');
  const clipsById = new Map(boss.timeline.clips.map((clip) => [clip.id, clip]));
  const damagingPrimitives = new Set([
    'prism-wingbeat-weave',
    'prism-brood-procession',
    'prism-lunar-swoop',
    'prism-kaleidoscope-brood'
  ]);

  assert.ok(descriptor);
  assert.match(descriptor.description, /crystalline moth/i);
  assert.match(descriptor.description, /Kaleidoscope corridor/i);
  assert.equal(boss.spriteKey, 'CAMPAIGN_BOSS_PRISM_MOTH');
  assert.equal(boss.rigId, 'open-orbit');
  assert.equal(boss.componentMode, 'hull-only');
  assert.equal(boss.phases.length, 2);
  assert.equal(boss.phases[1].triggerHealthRatio, 0.5);
  assert.deepEqual(
    boss.phases.map((phase) => phase.label),
    ['Crystal Nursery', 'Prism Metamorphosis']
  );
  assert.deepEqual(
    boss.timeline.attacks.map((attack) => [attack.id, attack.role]),
    [
      ['wingbeat-weave', 'core'],
      ['brood-procession', 'core'],
      ['lunar-prism-swoop', 'core'],
      ['kaleidoscope-brood', 'signature']
    ]
  );
  assert.equal(
    boss.timeline.clips.some((clip) => (
      clip.primitiveId === 'summon-formation'
      || clip.primitiveId === 'set-weak-point'
      || clip.parameters?.enemyId === 'brick'
    )),
    false,
    'Prism must not retain generic brick summons or debug weak-point cues'
  );
  const metamorphosisClip = boss.timeline.clips.find((clip) => (
      clip.primitiveId === 'effect-cue'
      && clip.phaseId === boss.phases[1].id
      && clip.parameters?.motionCue === 'prism-metamorphosis'
      && clip.durationSeconds >= 2
  ));
  assert.ok(metamorphosisClip, 'phase two requires a visible metamorphosis sequence');
  const firstPhaseTwoTimedCue = Math.min(
    ...boss.timeline.clips
      .filter((clip) => (
        clip.phaseId === boss.phases[1].id
        && clip.trigger === 'time'
      ))
      .map((clip) => clip.startSeconds)
  );
  assert.ok(
    firstPhaseTwoTimedCue >= metamorphosisClip.durationSeconds,
    'phase two must finish the full metamorphosis before any attack warning can replace it'
  );

  for (const attack of boss.timeline.attacks) {
    assert.deepEqual(
      attack.variants.map((variant) => variant.phaseId),
      boss.phases.map((phase) => phase.id),
      `${attack.id} must remix the learned rule in both phases`
    );
    for (const variant of attack.variants) {
      variant.beatClipIds.forEach((clipId) => {
        const clip = clipsById.get(clipId);
        assert.ok(clip, `${clipId} must resolve`);
        assert.equal(damagingPrimitives.has(clip.primitiveId), true);
        assert.ok(clip.telegraphClipId);
        assert.equal(clipsById.get(clip.telegraphClipId)?.primitiveId, 'telegraph');
        assert.ok(clip.parameters?.motionCue?.startsWith('prism-'));
      });
    }
  }

  const phaseOneWingbeat = boss.timeline.clips.find((clip) => (
    clip.phaseId === boss.phases[0].id
    && clip.primitiveId === 'prism-wingbeat-weave'
  ));
  const phaseTwoSwoop = boss.timeline.clips.find((clip) => (
    clip.phaseId === boss.phases[1].id
    && clip.primitiveId === 'prism-lunar-swoop'
  ));
  assert.deepEqual(phaseOneWingbeat.repeat, { count: 5, intervalSeconds: 0.72 });
  assert.equal(phaseOneWingbeat.parameters.projectileCount, 7);
  assert.deepEqual(phaseTwoSwoop.repeat, { count: 3, intervalSeconds: 1.7 });
  assert.equal(phaseTwoSwoop.parameters.shotIntervalFrames, 4);

  boss.timeline.clips
    .filter((clip) => damagingPrimitives.has(clip.primitiveId))
    .forEach((clip) => {
      assert.ok((clip.parameters?.shotIntervalFrames ?? 12) <= 12);
      assert.ok((clip.parameters?.sweepPasses ?? 3) <= 3);
      assert.ok((clip.parameters?.channelWidthPixels ?? 122) >= 122);
  });
});

test('Tribunal Laser Core seals every component before phased exposure', () => {
  const { boss } = getPrototypeBoss('weak-point-laser-core');
  const shellPhaseId = boss.phases[0].id;
  const exposurePhaseId = boss.phases[1].id;
  const ragePhaseId = boss.phases[2].id;
  const weakPointClips = boss.timeline.clips.filter((clip) => clip.primitiveId === 'set-weak-point');
  const sealedComponents = new Set(
    weakPointClips
      .filter((clip) => clip.phaseId === shellPhaseId && clip.parameters.enabled === false)
      .map((clip) => clip.parameters.componentId)
  );
  const damagingLasers = boss.timeline.clips.filter((clip) => (
    clip.primitiveId === 'cross-beam' || clip.primitiveId === 'rail-sweep'
  ));

  assert.deepEqual(
    [...sealedComponents].sort(),
    ['helmet', 'left-cannon', 'right-cannon']
  );
  assert.ok(weakPointClips.some((clip) => (
    clip.phaseId === exposurePhaseId
    && clip.parameters.componentId === 'left-cannon'
    && clip.parameters.enabled === true
  )));
  assert.ok(weakPointClips.some((clip) => (
    clip.phaseId === exposurePhaseId
    && clip.parameters.componentId === 'right-cannon'
    && clip.parameters.enabled === true
  )));
  assert.ok(weakPointClips.some((clip) => (
    clip.phaseId === ragePhaseId
    && clip.parameters.componentId === 'helmet'
    && clip.parameters.enabled === true
  )));
  damagingLasers.forEach((clip) => assert.ok(clip.telegraphClipId));
});

test('Meridian Harrower is a long-form animated puzzle fixture with warned attacks', () => {
  const descriptor = SANDBOX_BOSS_PROTOTYPES.find((entry) => entry.id === 'meridian-harrower');
  const { boss } = getPrototypeBoss('meridian-harrower');
  const damaging = boss.timeline.clips.filter((clip) => (
    clip.primitiveId === 'side-barrage'
    || clip.primitiveId === 'gap-ring'
    || clip.primitiveId === 'pod-volley'
    || clip.primitiveId === 'weave-wall'
    || clip.primitiveId === 'summon-formation'
    || clip.primitiveId === 'rail-sweep'
    || clip.primitiveId === 'rotating-cross'
    || clip.primitiveId === 'cross-beam'
    || clip.primitiveId === 'inward-collapse'
  ));

  assert.ok(descriptor);
  assert.equal(boss.spriteKey, 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT');
  assert.equal(boss.rigId, 'paywall-siege');
  assert.equal(boss.health, 2_600);
  assert.equal(boss.sizeMultiplier, 1.45);
  assert.deepEqual(
    boss.phases.map((phase) => phase.label),
    ['Arm cipher', 'Orbit key', 'Open aperture']
  );
  assert.deepEqual(
    boss.phases.map((phase) => phase.speedMultiplier),
    [0.9, 0.95, 1],
    'phase challenge changes through attack composition rather than timer inflation'
  );
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'follow-path'));
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'pod-volley'));
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'weave-wall'));
  assert.ok(boss.timeline.clips.some((clip) => (
    clip.primitiveId === 'tail-fan'
    && clip.phaseId === boss.phases[2].id
  )));
  assert.deepEqual(
    new Set(
      boss.timeline.clips
        .filter((clip) => clip.primitiveId === 'side-barrage')
        .map((clip) => clip.parameters.side)
    ),
    new Set(['port', 'starboard'])
  );
  boss.timeline.clips
    .filter((clip) => (
      clip.primitiveId === 'pod-volley'
      || clip.primitiveId === 'weave-wall'
      || clip.primitiveId === 'tail-fan'
    ))
    .forEach((clip) => assert.ok(clip.durationSeconds >= 1));
  assert.ok(boss.timeline.clips.some((clip) => (
    clip.primitiveId === 'set-weak-point'
    && clip.parameters.componentId === 'helmet'
    && clip.parameters.enabled === true
  )));
  damaging.forEach((clip) => assert.ok(clip.telegraphClipId, `${clip.id} needs a warning`));
});

test('Helios Clawcarrier compiles three learned weapons and one signature route per phase', () => {
  const descriptor = SANDBOX_BOSS_PROTOTYPES.find((entry) => entry.id === 'helios-clawcarrier');
  const { boss } = getPrototypeBoss('helios-clawcarrier');
  const damaging = boss.timeline.clips.filter((clip) => (
    clip.primitiveId === 'paired-cannon-burst'
    || clip.primitiveId === 'articulated-melee-sweep'
    || clip.primitiveId === 'reactor-aperture-pattern'
    || clip.primitiveId === 'tracking-pincer-dive'
  ));

  assert.ok(descriptor);
  assert.equal(boss.rigId, 'crown-claw');
  assert.equal(boss.health, 8_000);
  assert.deepEqual(boss.componentHealth, {
    'left-cannon': 2_000,
    'right-cannon': 2_000
  });
  assert.equal(boss.shieldCount, 0);
  assert.equal(boss.speed, 1.35);
  assert.equal(boss.sizeMultiplier, 1.35);
  assert.deepEqual(
    boss.phases.map((phase) => phase.label),
    ['Siege Calibration', 'Armor Shear', 'Reactor Overdrive']
  );
  assert.deepEqual(
    boss.phases.map((phase) => phase.speedMultiplier),
    [0.72, 0.75, 0.78],
    'the encounter must remix authored routes instead of sharply accelerating'
  );
  assert.equal(boss.timeline.loop, true);
  assert.equal(boss.timeline.durationSeconds, 24.9);
  assert.equal(damaging.length, 30);
  assert.deepEqual(
    boss.timeline.attacks.map((attack) => [attack.id, attack.role]),
    [
      ['twin-rotary-crossfire', 'core'],
      ['machinegun-channel', 'signature'],
      ['reactor-maze', 'core'],
      ['clawcarrier-crush', 'core']
    ]
  );
  const clipsById = new Map(boss.timeline.clips.map((clip) => [clip.id, clip]));
  const crossfireAttack = boss.timeline.attacks.find(
    (attack) => attack.id === 'twin-rotary-crossfire'
  );
  assert.ok(crossfireAttack);
  crossfireAttack.variants.forEach((variant) => {
    const beats = variant.beatClipIds.map((clipId) => clipsById.get(clipId));
    assert.ok(beats.every(Boolean), `${variant.phaseId} crossfire clips must resolve`);
    const phaseIndex = boss.phases.findIndex((phase) => phase.id === variant.phaseId);
    const expectedBurstCount = phaseIndex >= 2 ? 6 : 5;
    assert.deepEqual(beats.map((beat) => beat.parameters.projectileCount), [
      expectedBurstCount,
      expectedBurstCount,
      expectedBurstCount + 1
    ]);
    assert.deepEqual(
      beats.map((beat) => beat.parameters.shotIntervalFrames),
      [phaseIndex >= 2 ? 2 : 3, phaseIndex >= 2 ? 2 : 3, phaseIndex >= 2 ? 2 : 3],
      `${variant.phaseId} must use rapid sequential machine-gun cadence`
    );
    assert.deepEqual(
      beats.map((beat) => beat.parameters.sequence),
      [phaseIndex * 10, phaseIndex * 10 + 1, phaseIndex * 10 + 2],
      `${variant.phaseId} must retain deterministic aimed-round branches`
    );
    const warningStarts = beats.map((beat) => clipsById.get(beat.telegraphClipId).startSeconds);
    assert.deepEqual(
      warningStarts.map((start) => Number((start - warningStarts[0]).toFixed(6))),
      [0, 1.05, 2.1],
      `${variant.phaseId} must separate all three crossfire commitments`
    );
  });
  boss.phases.forEach((phase) => {
    assert.deepEqual(
      boss.timeline.attacks.map((attack) => {
        const variant = attack.variants.find((candidate) => candidate.phaseId === phase.id);
        const firstBeat = clipsById.get(variant.beatClipIds[0]);
        return clipsById.get(firstBeat.telegraphClipId).startSeconds;
      }),
      [0.2, 15.4, 4.6, 11.2],
      `${phase.id} must retain the retimed four-sentence cadence`
    );
  });
  boss.timeline.attacks.forEach((attack) => {
    assert.equal(attack.variants.length, 3, `${attack.id} needs one remix per phase`);
    assert.deepEqual(
      attack.variants.map((variant) => variant.phaseId),
      boss.phases.map((phase) => phase.id)
    );
    attack.variants.forEach((variant) => {
      const expandedBeatCount = variant.beatClipIds.reduce((count, clipId) => {
        const clip = boss.timeline.clips.find((candidate) => candidate.id === clipId);
        return count + (clip?.repeat?.count ?? 1);
      }, 0);
      assert.ok(
        expandedBeatCount >= (attack.role === 'signature' ? 4 : 2),
        `${attack.id} must remain a connected multi-beat sentence`
      );
      const recovery = boss.timeline.clips.find((clip) => clip.id === variant.recoveryClipId);
      assert.equal(recovery?.primitiveId, 'effect-cue');
      assert.ok(recovery?.durationSeconds >= 0.8, `${attack.id} needs a visible recovery`);
    });
  });
  assert.deepEqual(
    damaging.filter((clip) => clip.phaseId === boss.phases[0].id)
      .map((clip) => [clip.primitiveId, clip.parameters?.motionCue ?? null]),
    [
      ['paired-cannon-burst', 'paired-crossfire'],
      ['paired-cannon-burst', 'paired-crossfire'],
      ['paired-cannon-burst', 'paired-crossfire'],
      ['paired-cannon-burst', 'paired-crossfire'],
      ['paired-cannon-burst', 'machinegun-channel'],
      ['reactor-aperture-pattern', 'reactor-fan'],
      ['reactor-aperture-pattern', 'reactor-fan'],
      ['reactor-aperture-pattern', 'reactor-mines'],
      ['reactor-aperture-pattern', 'reactor-fan'],
      ['tracking-pincer-dive', 'pincer-dive']
    ]
  );
  const channel = boss.timeline.clips.find((clip) => (
    clip.primitiveId === 'paired-cannon-burst'
    && clip.parameters?.motionCue === 'machinegun-channel'
    && clip.phaseId === boss.phases[0].id
  ));
  assert.ok(channel);
  assert.deepEqual(channel.repeat, { count: 4, intervalSeconds: 1.7 });
  assert.equal(channel.durationSeconds, 1.7);
  assert.equal(channel.parameters.channelWidthPixels, 160);
  assert.equal(channel.parameters.sweepPasses, 2);
  const channelAttack = boss.timeline.attacks.find((attack) => attack.id === 'machinegun-channel');
  channelAttack.variants.forEach((variant) => {
    const [entry, movingChannel] = variant.beatClipIds.map((clipId) => clipsById.get(clipId));
    assert.equal(entry.parameters.motionCue, 'paired-crossfire');
    assert.equal(entry.parameters.projectileCount, 5);
    assert.equal(entry.parameters.shotIntervalFrames, 2);
    assert.equal(entry.parameters.projectileSpeedScale, 1.35);
    assert.equal(entry.durationSeconds, 0.36);
    assert.equal(
      Number((clipsById.get(movingChannel.telegraphClipId).startSeconds
        - clipsById.get(entry.telegraphClipId).startSeconds).toFixed(6)),
      0.82,
      `${variant.phaseId} must visibly herd the exterior lanes before channel fire`
    );
  });
  assert.deepEqual(
    boss.phases.map((phase) => {
      const variant = boss.timeline.attacks
        .find((attack) => attack.id === 'machinegun-channel')
        .variants.find((candidate) => candidate.phaseId === phase.id);
      const clip = variant.beatClipIds
        .map((clipId) => clipsById.get(clipId))
        .find((candidate) => candidate.parameters.motionCue === 'machinegun-channel');
      return [
        clip.parameters.sweepRangeRatio,
        clip.parameters.sweepPasses,
        clip.durationSeconds,
        clip.repeat.intervalSeconds
      ];
    }),
    [
      [0.36, 2, 1.7, 1.7],
      [0.42, 2, 1.5, 1.5],
      [0.46, 2, 1.3, 1.3]
    ],
    'lower-health phases must complete the same readable route progressively faster'
  );
  assert.deepEqual(
    boss.phases.map((phase) => {
      const variant = boss.timeline.attacks
        .find((attack) => attack.id === 'reactor-maze')
        .variants.find((candidate) => candidate.phaseId === phase.id);
      return variant.beatClipIds.map((clipId) => clipsById.get(clipId).parameters.projectileCount);
    }),
    [[8, 9, 3, 8], [9, 9, 4, 9], [10, 11, 5, 10]]
  );
  const crushVariants = boss.timeline.attacks
    .find((attack) => attack.id === 'clawcarrier-crush').variants;
  crushVariants.forEach((variant) => {
    const crush = clipsById.get(variant.beatClipIds[0]);
    assert.equal(crush.durationSeconds, 0.65);
    assert.deepEqual(crush.repeat, { count: 4, intervalSeconds: 0.65 });
  });
  assert.equal(
    boss.timeline.clips.some((clip) => clip.primitiveId === 'articulated-melee-sweep'),
    false,
    'the retired claw-based Attack 2 must not remain in Helios active rotation'
  );
  assert.deepEqual(
    boss.timeline.attacks.find((attack) => attack.id === 'reactor-maze').sourceSocketRoles,
    ['core']
  );
  assert.deepEqual(
    boss.timeline.attacks.find((attack) => attack.id === 'clawcarrier-crush').sourceSocketRoles,
    ['port', 'starboard']
  );
  assert.equal(
    boss.timeline.clips.some((clip) => clip.primitiveId === 'follow-path'),
    false,
    'the wide modular silhouette must stay inside the mobile combat bounds'
  );
  assert.equal(
    boss.timeline.clips.some((clip) => (
      clip.primitiveId === 'set-shield' || clip.primitiveId === 'set-weak-point'
    )),
    false,
    'Helios must not retain the old helmet/shield phase softlock'
  );
  damaging.forEach((clip) => {
    const warning = boss.timeline.clips.find((candidate) => candidate.id === clip.telegraphClipId);
    assert.ok(warning, `${clip.id} needs a linked warning`);
    assert.ok(clip.label, `${clip.id} needs a bespoke attack label`);
    assert.ok(clip.startSeconds > warning.startSeconds, `${clip.id} must follow its warning`);
  });
});

test('boss component health overrides stay portable, bounded, and incompatible with hull-only mode', () => {
  const source = buildSandboxBossPrototypePreview(campaign, 'helios-clawcarrier').campaign;
  const getBoss = (candidate) => candidate.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.id === 'sandbox-helios-clawcarrier');
  const assertRejectedByBoth = (candidate, label) => {
    const browserResult = validateBrowserCampaign(candidate);
    const serverResult = validateServerCampaign(candidate);
    assert.equal(browserResult.valid, false, `${label} must fail browser validation`);
    assert.equal(serverResult.valid, false, `${label} must fail server validation`);
  };

  const unknownComponent = structuredClone(source);
  getBoss(unknownComponent).componentHealth.reactor = 10;
  assertRejectedByBoth(unknownComponent, 'unknown component');

  const invalidHealth = structuredClone(source);
  getBoss(invalidHealth).componentHealth['left-cannon'] = 0;
  assertRejectedByBoth(invalidHealth, 'zero component health');

  const hullOnlyConflict = structuredClone(source);
  getBoss(hullOnlyConflict).componentMode = 'hull-only';
  assertRejectedByBoth(hullOnlyConflict, 'hull-only component health');
});

test('Aurora Oculus reverses rotors deterministically and staggers dense one-gap rings', () => {
  const descriptor = SANDBOX_BOSS_PROTOTYPES.find((entry) => entry.id === 'aurora-storm-engine');
  const { boss } = getPrototypeBoss('aurora-storm-engine');
  const primitives = new Set(boss.timeline.clips.map((clip) => clip.primitiveId));
  const damaging = boss.timeline.clips.filter((clip) => (
    clip.primitiveId === 'rotor-hazard-sentence'
    || clip.primitiveId === 'gap-ring'
    || clip.primitiveId === 'radial-beam-array'
  ));

  assert.ok(descriptor);
  assert.equal(boss.health, 6_800);
  assert.equal(boss.shieldCount, 0);
  assert.equal(boss.componentMode, 'hull-only');
  assert.deepEqual(
    boss.phases.map((phase) => phase.label),
    ['Survey orbit', 'Reverse overdrive']
  );
  assert.deepEqual(
    boss.phases.map((phase) => phase.movementPatternId),
    ['arena-roam', 'sine-drift']
  );
  assert.deepEqual(boss.phases.map((phase) => phase.speedMultiplier), [0.95, 1.05]);
  for (const primitive of ['rotor-hazard-sentence', 'gap-ring', 'radial-beam-array']) {
    assert.equal(primitives.has(primitive), true, `missing ${primitive}`);
  }
  const rotors = boss.timeline.clips.filter(
    (clip) => clip.primitiveId === 'rotor-hazard-sentence'
  );
  const beams = boss.timeline.clips.filter(
    (clip) => clip.primitiveId === 'radial-beam-array'
  );
  assert.equal(boss.timeline.durationSeconds, 36);
  assert.equal(boss.timeline.loop, true);
  assert.deepEqual(rotors.map((clip) => clip.parameters.sequence), [0, 1, 2, 3]);
  assert.deepEqual(
    rotors.map((clip) => clip.parameters.pulseIntervalSeconds),
    [0.9, 0.85, 0.75, 0.65]
  );
  assert.deepEqual(rotors.map((clip) => clip.startSeconds), [1.4, 17.8, 1.4, 17.8]);
  assert.ok(rotors.every((clip) => clip.durationSeconds === 5.4));
  assert.ok(rotors.every((clip) => clip.parameters.motionCue === 'rotor-volley'));
  for (const phase of boss.phases) {
    const phaseRotors = rotors.filter((clip) => clip.phaseId === phase.id);
    assert.deepEqual(
      phaseRotors.map((clip) => clip.parameters.sequence % 2),
      [0, 1],
      `${phase.id} must reverse from counter-clockwise to clockwise`
    );
    assert.ok(
      phaseRotors[1].startSeconds - phaseRotors[0].startSeconds >= 16,
      `${phase.id} must leave enough time to read each direction`
    );
  }
  assert.deepEqual(beams.map((clip) => clip.parameters.sequence), [0, 1, 2, 3]);
  assert.ok(beams.every((clip) => clip.parameters.motionCue === 'radial-beam'));
  assert.ok(beams.every((clip) => clip.parameters.rotationDirection === 'seeded-random'));
  assert.ok(beams.every((clip) => clip.durationSeconds === 2));
  const gapRings = boss.timeline.clips.filter((clip) => clip.primitiveId === 'gap-ring');
  assert.equal(gapRings.length, 4);
  assert.deepEqual(gapRings.map((clip) => clip.parameters.projectileCount), [14, 14, 16, 16]);
  assert.deepEqual(
    gapRings.map((clip) => clip.repeat),
    [
      { count: 3, intervalSeconds: 0.85 },
      { count: 3, intervalSeconds: 0.8 },
      { count: 3, intervalSeconds: 0.75 },
      { count: 3, intervalSeconds: 0.7 }
    ]
  );
  gapRings.forEach((ring) => {
    const ringWarning = boss.timeline.clips.find((clip) => clip.id === ring.telegraphClipId);
    assert.equal(ringWarning.parameters.telegraphStyle, 'ring');
    assert.deepEqual(ringWarning.repeat, ring.repeat);
    assert.ok(ring.startSeconds - ringWarning.startSeconds >= 0.8);
    assert.ok(ring.parameters.projectileCount <= 16, 'each mobile pulse must remain bounded');
    assert.ok(
      ring.parameters.projectileCount * ring.repeat.count <= 48,
      'the three-pulse cluster must stay inside the authored density budget'
    );
  });
  beams.forEach((beam) => {
    const beamWarning = boss.timeline.clips.find((clip) => clip.id === beam.telegraphClipId);
    assert.equal(beamWarning.parameters.telegraphStyle, 'spokes');
    assert.ok(beam.startSeconds - beamWarning.startSeconds >= 0.8);
  });
  damaging.forEach((clip) => assert.ok(clip.telegraphClipId, `${clip.id} needs a warning`));
});

test('Nullwake Revenant authors one full-health false defeat and a distinct enlarged second form', () => {
  const descriptor = SANDBOX_BOSS_PROTOTYPES.find((entry) => entry.id === 'nullwake-revenant');
  const { boss } = getPrototypeBoss('nullwake-revenant');
  const damagingPrimitives = new Set([
    'gap-ring',
    'inward-collapse',
    'rotating-cross',
    'helix-volley',
    'side-barrage',
    'pod-volley',
    'weave-wall',
    'cross-beam'
  ]);
  const damaging = boss.timeline.clips.filter((clip) => damagingPrimitives.has(clip.primitiveId));

  assert.ok(descriptor);
  assert.equal(descriptor.sandboxOnly, true);
  assert.equal(boss.health, 4_200);
  assert.equal(boss.componentMode, 'hull-only');
  assert.equal(boss.sizeMultiplier, 1.32);
  assert.deepEqual(boss.revival, {
    phaseId: 'sandbox-nullwake-backplane-crown',
    shutdownSeconds: 2.2,
    rebootSeconds: 2.6,
    restoreHealthRatio: 1,
    awakenedSizeMultiplier: 1.22
  });
  assert.deepEqual(
    boss.phases.map((phase) => phase.label),
    ['Borrowed Charge', 'Backplane Crown', 'Terminal Overclock']
  );
  assert.deepEqual(
    boss.phases.map((phase) => phase.movementPatternId),
    ['arena-roam', 'sine-drift', 'arena-roam']
  );
  assert.ok(
    boss.phases[1].triggerHealthRatio > boss.phases[2].triggerHealthRatio,
    'the full-health reboot phase must retain its own later low-health phase'
  );
  assert.equal(boss.timeline.loop, true);
  assert.equal(boss.timeline.durationSeconds, 24.7);
  assert.equal(damaging.length, 45);
  assert.deepEqual(
    boss.timeline.attacks.map((attack) => [attack.id, attack.role]),
    [
      ['claw-corridor', 'core'],
      ['dead-signal-gates', 'core'],
      ['memory-lattice', 'core'],
      ['revenant-maze', 'signature']
    ]
  );
  boss.timeline.attacks.forEach((attack) => {
    assert.equal(attack.variants.length, 3, `${attack.id} needs one learned-rule remix per phase`);
    assert.deepEqual(
      attack.variants.map((variant) => variant.phaseId),
      boss.phases.map((phase) => phase.id)
    );
    attack.variants.forEach((variant) => {
      assert.ok(
        variant.beatClipIds.length >= (attack.role === 'signature' ? 4 : 2),
        `${attack.id} must remain a connected multi-beat sentence`
      );
      const recovery = boss.timeline.clips.find((clip) => clip.id === variant.recoveryClipId);
      assert.equal(recovery?.primitiveId, 'effect-cue');
      assert.equal(recovery?.phaseId, variant.phaseId);
    });
  });
  assert.deepEqual(
    damaging.filter((clip) => clip.phaseId === 'sandbox-nullwake-borrowed-charge')
      .map((clip) => clip.primitiveId),
    [
      'side-barrage', 'side-barrage', 'side-barrage',
      'gap-ring', 'gap-ring', 'gap-ring',
      'weave-wall', 'weave-wall', 'weave-wall',
      'weave-wall', 'gap-ring', 'cross-beam', 'side-barrage', 'gap-ring', 'weave-wall'
    ]
  );
  const gateAttack = boss.timeline.attacks.find((attack) => attack.id === 'dead-signal-gates');
  assert.deepEqual(
    gateAttack.variants.map((variant) => variant.beatClipIds.map((clipId) => {
      const clip = boss.timeline.clips.find((candidate) => candidate.id === clipId);
      return [clip.parameters.sequence, clip.parameters.rotationDirection];
    })),
    [
      [[0, 'clockwise'], [1, 'clockwise'], [2, 'clockwise']],
      [[0, 'counterclockwise'], [1, 'counterclockwise'], [2, 'counterclockwise']],
      [[1, 'clockwise'], [2, 'clockwise'], [1, 'clockwise']]
    ]
  );
  assert.equal(damaging.some((clip) => clip.repeat), false);
  damaging.forEach((clip) => {
    const warning = boss.timeline.clips.find((candidate) => candidate.id === clip.telegraphClipId);
    assert.ok(warning, `${clip.id} needs a linked warning`);
    assert.ok(clip.label, `${clip.id} needs a bespoke attack label`);
    assert.ok(clip.startSeconds > warning.startSeconds, `${clip.id} must follow its warning`);
  });
  assert.equal(
    boss.timeline.clips.some((clip) => clip.primitiveId === 'follow-path'),
    false,
    'the enlarged backplane form must remain inside mobile combat bounds'
  );
});

const serialPrototypeContracts = Object.freeze([
  Object.freeze({
    id: 'cinderjaw-siege-beetle',
    phases: ['Siege Stance', 'Claw Battery', 'Stripped Reactor']
  }),
  Object.freeze({
    id: 'vesperglass-mothmother',
    phases: ['Wingbeat Measure', 'Brood Lattice', 'Prismatic Molt']
  }),
  Object.freeze({
    id: 'twin-halo-wardens',
    phases: ['Call and Answer', 'Orbit Exchange', 'Conjunction']
  }),
  Object.freeze({
    id: 'riftcoil-wyrm',
    phases: ['Fang Measure', 'Tail Cipher', 'Coil Cage']
  })
]);

const damagingPrototypePrimitives = new Set([
  'aimed-burst',
  'gap-ring',
  'rotor-hazard-sentence',
  'radial-beam-array',
  'corner-ambush-beam',
  'corner-ambush-ram',
  'cross-beam',
  'rail-sweep',
  'tail-fan',
  'inward-collapse',
  'rotating-cross',
  'helix-volley',
  'side-barrage',
  'pod-volley',
  'weave-wall',
  'summon-formation'
]);

test('four legacy design-board bosses retain three fair phases and serial 90-second attack clips', () => {
  for (const contract of serialPrototypeContracts) {
    const { boss } = getPrototypeBoss(contract.id);
    assert.deepEqual(boss.phases.map((phase) => phase.label), contract.phases);
    assert.equal(boss.timeline.durationSeconds, 90);
    assert.equal(boss.timeline.loop, true);
    assert.ok(
      Math.max(...boss.phases.map((phase) => phase.speedMultiplier))
      - Math.min(...boss.phases.map((phase) => phase.speedMultiplier))
      <= 0.061,
      `${contract.id} must escalate through geometry instead of blanket speed`
    );

    for (const phase of boss.phases) {
      const clips = boss.timeline.clips.filter((clip) => clip.phaseId === phase.id);
      const byId = new Map(clips.map((clip) => [clip.id, clip]));
      const attacks = clips
        .filter((clip) => damagingPrototypePrimitives.has(clip.primitiveId))
        .sort((left, right) => left.startSeconds - right.startSeconds);
      assert.equal(attacks.length, 7, `${contract.id}/${phase.id} needs seven readable sentences`);

      for (let index = 0; index < attacks.length; index += 1) {
        const attack = attacks[index];
        const warning = byId.get(attack.telegraphClipId);
        const recovery = byId.get(`${attack.id}-recovery`);
        assert.equal(warning?.primitiveId, 'telegraph', `${attack.id} needs one warning`);
        assert.ok(
          attack.startSeconds - warning.startSeconds >= 0.8,
          `${attack.id} needs a mobile-readable warning`
        );
        assert.equal(recovery?.primitiveId, 'effect-cue', `${attack.id} needs recovery`);
        assert.ok(
          recovery.startSeconds >= attack.startSeconds + attack.durationSeconds,
          `${attack.id} recovery must follow commitment`
        );
        assert.ok(recovery.durationSeconds >= 1.8, `${attack.id} recovery is too short`);
        if (attack.parameters?.projectileCount !== undefined) {
          assert.ok(
            attack.parameters.projectileCount <= 18,
            `${attack.id} exceeds the mobile projectile sentence budget`
          );
        }
        const nextAttack = attacks[index + 1];
        if (nextAttack) {
          const nextWarning = byId.get(nextAttack.telegraphClipId);
          assert.ok(
            nextWarning.startSeconds
            >= recovery.startSeconds + recovery.durationSeconds,
            `${attack.id} must recover before ${nextAttack.id} warns`
          );
        }
      }
    }
  }
});

const retainedUmbraBeatIds = Object.freeze([
  'sandbox-umbra-survey-port',
  'sandbox-umbra-survey-starboard',
  'sandbox-umbra-survey-upper-anchor-return',
  'sandbox-umbra-survey-ring-a',
  'sandbox-umbra-survey-ring-b',
  'sandbox-umbra-survey-port-return',
  'sandbox-umbra-survey-starboard-return',
  'sandbox-umbra-survey-shadow-dissolve',
  'sandbox-umbra-survey-lower-left-ram',
  'sandbox-umbra-survey-lower-right-ram',
  'sandbox-umbra-survey-upper-anchor-materialize',
  'sandbox-umbra-hunt-port',
  'sandbox-umbra-hunt-starboard',
  'sandbox-umbra-hunt-upper-anchor-return',
  'sandbox-umbra-hunt-entry-ring',
  'sandbox-umbra-hunt-ring',
  'sandbox-umbra-hunt-left-corner',
  'sandbox-umbra-hunt-right-corner',
  'sandbox-umbra-hunt-shadow-dissolve',
  'sandbox-umbra-hunt-lower-left-ram',
  'sandbox-umbra-hunt-mid-right-ram',
  'sandbox-umbra-hunt-lower-right-ram',
  'sandbox-umbra-hunt-mid-left-ram',
  'sandbox-umbra-hunt-upper-anchor-materialize',
  'sandbox-umbra-compass-port',
  'sandbox-umbra-compass-starboard',
  'sandbox-umbra-compass-upper-anchor-return',
  'sandbox-umbra-compass-ring-a',
  'sandbox-umbra-compass-ring-b',
  'sandbox-umbra-compass-right-corner',
  'sandbox-umbra-compass-left-corner',
  'sandbox-umbra-compass-shadow-dissolve',
  'sandbox-umbra-compass-lower-left-ram',
  'sandbox-umbra-compass-lower-right-ram',
  'sandbox-umbra-compass-mid-left-ram',
  'sandbox-umbra-compass-mid-right-ram',
  'sandbox-umbra-compass-lower-left-return-ram',
  'sandbox-umbra-compass-lower-right-return-ram',
  'sandbox-umbra-compass-upper-anchor-materialize'
]);

test('Umbra Needlewing compiles three core attacks and Blackout Hunt in every phase', () => {
  const { boss } = getPrototypeBoss('umbra-needlewing');
  assert.deepEqual(
    boss.phases.map((phase) => phase.label),
    ['Wing Survey', 'Blackout Hunt', 'Broken Compass']
  );
  assert.equal(boss.timeline.durationSeconds, 24.25);
  assert.equal(boss.timeline.loop, true);
  assert.deepEqual(
    boss.timeline.attacks.map((attack) => attack.id),
    ['wing-shear-crossfire', 'orbit-gap-thread', 'corner-needle-lock', 'blackout-ambush']
  );
  assert.deepEqual(
    boss.timeline.attacks.map((attack) => attack.role),
    ['core', 'core', 'core', 'signature']
  );
  assert.equal(boss.timeline.attacks[2].label, 'Blackout Laser');
  assert.equal(boss.timeline.attacks.at(-1).label, 'Blackout Hunt');
  assert.equal(boss.timeline.attacks[1].label, 'Broken Clockwise Opening');
  boss.timeline.attacks.forEach((attack) => {
    assert.equal(attack.variants.length, 3, `${attack.id} needs one remix per phase`);
    assert.deepEqual(
      attack.variants.map((variant) => variant.phaseId),
      boss.phases.map((phase) => phase.id)
    );
    assert.ok(attack.recognitionCue.length > 0);
    assert.ok(attack.solution.length > 0);
    assert.ok(attack.sourceSocketRoles.length > 0);
  });

  const wingShear = boss.timeline.attacks.find((attack) => attack.id === 'wing-shear-crossfire');
  wingShear.variants.forEach((variant) => {
    assert.equal(variant.beatClipIds.length, 3, `${variant.phaseId} needs a return beat`);
    const returnClip = boss.timeline.clips.find(
      (clip) => clip.id === variant.beatClipIds.at(-1)
    );
    assert.match(returnClip.id, /upper-anchor-return$/);
    assert.equal(returnClip.parameters.motionCue, 'umbra-needle-lattice');
  });

  const orbitGap = boss.timeline.attacks.find((attack) => attack.id === 'orbit-gap-thread');
  const expectedSalvos = new Map([
    ['sandbox-umbra-wing-survey', 5],
    ['sandbox-umbra-blackout-hunt', 6],
    ['sandbox-umbra-broken-compass', 8]
  ]);
  orbitGap.variants.forEach((variant) => {
    const salvos = variant.beatClipIds.map((clipId) => (
      boss.timeline.clips.find((clip) => clip.id === clipId)
    ));
    assert.equal(
      salvos.reduce((count, clip) => count + (clip.repeat?.count ?? 1), 0),
      expectedSalvos.get(variant.phaseId)
    );
    salvos.forEach((clip) => {
      assert.equal(clip.parameters.motionCue, 'umbra-wing-shard-gate');
      assert.ok(['clockwise', 'counterclockwise'].includes(clip.parameters.rotationDirection));
    });
    assert.deepEqual(
      [...new Set(salvos.map((clip) => clip.parameters.rotationDirection))],
      variant.phaseId === 'sandbox-umbra-broken-compass'
        ? ['clockwise', 'counterclockwise']
        : ['clockwise']
    );
  });
  const blackoutLaser = boss.timeline.attacks.find(
    (attack) => attack.id === 'corner-needle-lock'
  );
  blackoutLaser.variants.forEach((variant) => {
    const clips = variant.beatClipIds.map((clipId) => (
      boss.timeline.clips.find((clip) => clip.id === clipId)
    ));
    assert.equal(clips.length, 2, `${variant.phaseId} needs two laser locks`);
    assert.ok(
      clips.every((clip) => clip.primitiveId === 'corner-ambush-beam'),
      `${variant.phaseId} Blackout Laser must stay beam-only`
    );
  });
  const blackoutHunt = boss.timeline.attacks.find(
    (attack) => attack.id === 'blackout-ambush'
  );
  const expectedCharges = new Map([
    ['sandbox-umbra-wing-survey', 2],
    ['sandbox-umbra-blackout-hunt', 4],
    ['sandbox-umbra-broken-compass', 6]
  ]);
  blackoutHunt.variants.forEach((variant) => {
    const clips = variant.beatClipIds.map((clipId) => (
      boss.timeline.clips.find((clip) => clip.id === clipId)
    ));
    const charges = clips.filter((clip) => clip.primitiveId === 'corner-ambush-ram');
    const transitions = clips.filter((clip) => clip.primitiveId === 'effect-cue');
    assert.equal(charges.length, expectedCharges.get(variant.phaseId));
    assert.equal(transitions.length, 2, `${variant.phaseId} needs dissolve and materialize beats`);
    assert.ok(
      clips.every((clip) => (
        clip.primitiveId === 'corner-ambush-ram'
        || clip.primitiveId === 'effect-cue'
      )),
      `${variant.phaseId} Blackout Hunt must not mix in beams or rings`
    );
    assert.deepEqual(
      new Set(charges.map((clip) => clip.parameters.sequence % 4)),
      variant.phaseId === 'sandbox-umbra-wing-survey'
        ? new Set([0, 1])
        : new Set([0, 1, 2, 3])
    );
    charges.forEach((clip, index) => {
      if (index === 0) return;
      const previous = charges[index - 1];
      const warning = boss.timeline.clips.find(
        (candidate) => candidate.id === clip.telegraphClipId
      );
      const gapAfterExit = warning.startSeconds
        - (previous.startSeconds + previous.durationSeconds);
      assert.ok(gapAfterExit >= -0.000001, `${previous.id} must fully exit first`);
      assert.ok(gapAfterExit <= 0.101, `${clip.id} warning should follow immediately`);
    });
  });
  assert.equal(
    boss.timeline.clips.some((clip) => /safe gap|portal track/i.test(clip.label)),
    false,
    'player-facing timeline must not compile production debug-guide labels'
  );

  const clipIds = new Set(boss.timeline.clips.map((clip) => clip.id));
  retainedUmbraBeatIds.forEach((clipId) => {
    assert.ok(clipIds.has(clipId), `${clipId} must remain directly triggerable`);
    assert.ok(clipIds.has(`${clipId}-warning`), `${clipId} must retain its warning ID`);
  });

  const phasePacing = new Map([
    ['sandbox-umbra-wing-survey', { recovery: [0.6, 1], transition: [0.6, 1] }],
    ['sandbox-umbra-blackout-hunt', { recovery: [0.4, 0.8], transition: [0.4, 0.8] }],
    ['sandbox-umbra-broken-compass', { recovery: [0.25, 0.6], transition: [0.25, 0.6] }]
  ]);
  for (const phase of boss.phases) {
    const pacing = phasePacing.get(phase.id);
    const windows = boss.timeline.attacks.map((attack) => {
      const variant = attack.variants.find((candidate) => candidate.phaseId === phase.id);
      assert.ok(variant, `${attack.id} needs ${phase.id}`);
      const beats = variant.beatClipIds.map((clipId) => {
        const beat = boss.timeline.clips.find((clip) => clip.id === clipId);
        assert.ok(beat, `${clipId} must exist`);
        const warning = boss.timeline.clips.find((clip) => clip.id === beat.telegraphClipId);
        assert.equal(warning?.primitiveId, 'telegraph', `${clipId} needs one warning`);
        assert.ok(
          beat.startSeconds - warning.startSeconds >= 0.8 - 0.000001,
          `${clipId} needs a mobile-readable warning`
        );
        if (beat.parameters?.projectileCount !== undefined) {
          assert.ok(beat.parameters.projectileCount <= 18, `${clipId} exceeds the mobile budget`);
        }
        return { beat, warning };
      });
      const expandedBeatCount = beats.reduce(
        (count, { beat }) => count + (beat.repeat?.count ?? 1),
        0
      );
      assert.ok(
        expandedBeatCount >= 2,
        `${attack.id}/${phase.id} needs connected beats`
      );
      const recovery = boss.timeline.clips.find((clip) => clip.id === variant.recoveryClipId);
      assert.equal(recovery?.primitiveId, 'effect-cue', `${attack.id}/${phase.id} needs recovery`);
      assert.ok(
        recovery.durationSeconds >= pacing.recovery[0]
        && recovery.durationSeconds <= pacing.recovery[1],
        `${attack.id}/${phase.id} recovery must follow phase pacing`
      );
      const finalBeatEnd = Math.max(...beats.map(({ beat }) => (
        beat.startSeconds
        + ((beat.repeat?.count ?? 1) - 1) * (beat.repeat?.intervalSeconds ?? 0)
        + beat.durationSeconds
      )));
      assert.ok(recovery.startSeconds >= finalBeatEnd);
      return {
        startSeconds: Math.min(...beats.map(({ warning }) => warning.startSeconds)),
        endSeconds: recovery.startSeconds + recovery.durationSeconds
      };
    });
    for (let index = 1; index < windows.length; index += 1) {
      const transition = windows[index].startSeconds - windows[index - 1].endSeconds;
      assert.ok(
        transition >= pacing.transition[0] - 0.000001
        && transition <= pacing.transition[1] + 0.000001,
        `${phase.id} transition ${index} must stay compact`
      );
    }
    const loopTransition = boss.timeline.durationSeconds - windows.at(-1).endSeconds;
    assert.ok(
      loopTransition >= pacing.transition[0] - 0.000001
      && loopTransition <= pacing.transition[1] + 0.000001,
      `${phase.id} loop transition must stay compact`
    );
  }
});

test('Umbra Needlewing alone owns the fair corner-ambush blackout vocabulary', () => {
  const { boss: umbra } = getPrototypeBoss('umbra-needlewing');
  const corners = umbra.timeline.clips.filter(
    (clip) => clip.primitiveId === 'corner-ambush-beam'
  );
  assert.ok(corners.length >= 6);
  assert.deepEqual(new Set(corners.map((clip) => clip.parameters.sequence % 2)), new Set([0, 1]));
  corners.forEach((corner) => {
    const warning = umbra.timeline.clips.find((clip) => clip.id === corner.telegraphClipId);
    assert.equal(warning.parameters.telegraphStyle, 'target');
    assert.ok(corner.startSeconds - warning.startSeconds >= 0.8);
    assert.ok(corner.durationSeconds >= 0.3 && corner.durationSeconds <= 1.25);
  });
  const rams = umbra.timeline.clips.filter(
    (clip) => clip.primitiveId === 'corner-ambush-ram'
  );
  assert.ok(rams.length >= 4);
  assert.deepEqual(new Set(rams.map((clip) => clip.parameters.sequence % 2)), new Set([0, 1]));
  rams.forEach((ram) => {
    const warning = umbra.timeline.clips.find((clip) => clip.id === ram.telegraphClipId);
    assert.equal(warning.parameters.telegraphStyle, 'target');
    assert.ok(ram.startSeconds - warning.startSeconds >= 0.8);
    assert.ok(ram.durationSeconds >= 0.45 && ram.durationSeconds <= 1.4);
  });
  for (const descriptor of SANDBOX_BOSS_PROTOTYPES) {
    if (descriptor.id === 'umbra-needlewing') continue;
    const { boss } = getPrototypeBoss(descriptor.id);
    assert.equal(
      (boss.timeline?.clips ?? []).some((clip) => (
        clip.primitiveId === 'corner-ambush-beam'
        || clip.primitiveId === 'corner-ambush-ram'
      )),
      false,
      `${descriptor.id} must not borrow Umbra's signature corner beam`
    );
  }
});

test('Cinderjaw sources cannons, pod mines, core rings, and gatling fallback coherently', () => {
  const { boss } = getPrototypeBoss('cinderjaw-siege-beetle');
  const finalPhaseId = boss.phases[2].id;
  const earlierSides = boss.timeline.clips.filter((clip) => (
    clip.primitiveId === 'side-barrage' && clip.phaseId !== finalPhaseId
  ));
  const fallbackSides = boss.timeline.clips.filter((clip) => (
    clip.primitiveId === 'side-barrage' && clip.phaseId === finalPhaseId
  ));
  assert.deepEqual(
    new Set(earlierSides.map((clip) => clip.parameters.motionCue)),
    new Set(['heavy-cannon'])
  );
  assert.deepEqual(
    new Set(fallbackSides.map((clip) => clip.parameters.motionCue)),
    new Set(['gatling-barrage'])
  );
  assert.deepEqual(
    new Set(earlierSides.map((clip) => clip.parameters.side)),
    new Set(['port', 'starboard'])
  );
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'pod-volley'));
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'gap-ring'));
});

test('Gloamforge Mantis uses anatomy-owned sentences and a two-phase cleaver transformation', () => {
  const descriptor = SANDBOX_BOSS_PROTOTYPES.find((entry) => entry.id === 'gloamforge-mantis');
  const { boss } = getPrototypeBoss('gloamforge-mantis');
  const attacks = boss.timeline.clips.filter(
    (clip) => damagingPrototypePrimitives.has(clip.primitiveId)
  );

  assert.ok(descriptor);
  assert.equal(boss.id, 'sandbox-gloamforge-mantis');
  assert.equal(boss.health, 5_600);
  assert.equal(boss.speed, 0.7);
  assert.equal(
    boss.componentMode,
    'hull-only',
    'the two visible forge-bore sockets remain weapon origins without becoming detachable health components'
  );
  assert.equal(boss.componentHealth, undefined);
  assert.deepEqual(
    boss.phases.map((phase) => ({
      label: phase.label,
      triggerHealthRatio: phase.triggerHealthRatio,
      speedMultiplier: phase.speedMultiplier
    })),
    [
      { label: 'Crucible Measure', triggerHealthRatio: 1, speedMultiplier: 0.8 },
      { label: 'Cleaver Unfurl', triggerHealthRatio: 0.34, speedMultiplier: 0.8 }
    ],
    'phase two must change silhouette and weapon grammar without a blanket speed jump'
  );
  assert.ok(
    descriptor.designIntent.some((intent) => intent.includes('forearm cannon socket')),
    'the fight contract must name the cannon origin'
  );
  assert.ok(
    descriptor.designIntent.some((intent) => (
      intent.includes('chest crucible') && intent.includes('slag pods')
    )),
    'the fight contract must name the crucible and slag-pod origins'
  );
  assert.ok(
    descriptor.designIntent.some((intent) => (
      intent.includes('armor petals open') && intent.includes('plasma cleaver unfolds')
    )),
    'phase two must declare a silhouette change'
  );

  const openingSides = boss.timeline.clips.filter((clip) => (
    clip.phaseId === boss.phases[0].id && clip.primitiveId === 'side-barrage'
  ));
  assert.deepEqual(
    openingSides.map((clip) => clip.parameters.side),
    ['port', 'starboard', 'port', 'starboard']
  );
  assert.ok(openingSides.every((clip) => clip.parameters.motionCue === 'heavy-cannon'));

  const rings = boss.timeline.clips.filter((clip) => clip.primitiveId === 'gap-ring');
  assert.deepEqual(rings.map((clip) => clip.parameters.projectileCount), [16, 20]);
  for (const phase of boss.phases) {
    const phasePrimitives = new Set(
      attacks.filter((clip) => clip.phaseId === phase.id).map((clip) => clip.primitiveId)
    );
    assert.equal(phasePrimitives.has('pod-volley'), true);
    assert.equal(phasePrimitives.has('weave-wall'), true);
  }
  const phaseTwoPrimitives = new Set(
    attacks
      .filter((clip) => clip.phaseId === boss.phases[1].id)
      .map((clip) => clip.primitiveId)
  );
  for (const primitive of ['rail-sweep', 'cross-beam', 'tail-fan']) {
    assert.equal(phaseTwoPrimitives.has(primitive), true, `phase two is missing ${primitive}`);
  }

  assert.equal(attacks.length, 14);
  attacks.forEach((attack) => {
    const warning = boss.timeline.clips.find((clip) => clip.id === attack.telegraphClipId);
    const recovery = boss.timeline.clips.find((clip) => clip.id === `${attack.id}-recovery`);
    assert.equal(warning?.primitiveId, 'telegraph', `${attack.id} needs a linked warning`);
    assert.ok(attack.startSeconds > warning.startSeconds, `${attack.id} must follow its warning`);
    assert.equal(recovery?.primitiveId, 'effect-cue', `${attack.id} needs a recovery`);
    assert.ok(
      recovery.startSeconds >= attack.startSeconds + attack.durationSeconds,
      `${attack.id} recovery must follow the attack`
    );
  });
});

test('Vesperglass assigns wings, cocoons, tail, and core geometry distinct attack verbs', () => {
  const { boss } = getPrototypeBoss('vesperglass-mothmother');
  const primitives = new Set(boss.timeline.clips.map((clip) => clip.primitiveId));
  for (const primitive of [
    'side-barrage',
    'pod-volley',
    'tail-fan',
    'gap-ring',
    'helix-volley',
    'rotating-cross'
  ]) {
    assert.equal(primitives.has(primitive), true, `Vesperglass is missing ${primitive}`);
  }
  assert.deepEqual(
    new Set(
      boss.timeline.clips
        .filter((clip) => clip.primitiveId === 'side-barrage')
        .map((clip) => clip.parameters.side)
    ),
    new Set(['port', 'starboard'])
  );
});

test('Twin Halo alternates owned sides and commits cross beams to exact lane warnings', () => {
  const { boss } = getPrototypeBoss('twin-halo-wardens');
  const sides = boss.timeline.clips.filter((clip) => clip.primitiveId === 'side-barrage');
  const crosses = boss.timeline.clips.filter((clip) => clip.primitiveId === 'cross-beam');
  assert.deepEqual(new Set(sides.map((clip) => clip.parameters.side)), new Set(['port', 'starboard']));
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'pod-volley'));
  assert.ok(boss.timeline.clips.some((clip) => clip.primitiveId === 'gap-ring'));
  assert.ok(crosses.length >= 6);
  crosses.forEach((cross) => {
    const warning = boss.timeline.clips.find((clip) => clip.id === cross.telegraphClipId);
    assert.equal(warning.parameters.telegraphStyle, 'lane');
  });
});

test('Riftcoil keeps mirrored fang helixes and orders each final cross before its aligned tail', () => {
  const { boss } = getPrototypeBoss('riftcoil-wyrm');
  const helixes = boss.timeline.clips.filter((clip) => clip.primitiveId === 'helix-volley');
  assert.deepEqual(
    new Set(helixes.map((clip) => clip.parameters.handedness)),
    new Set(['left', 'right'])
  );
  const finalPhaseId = boss.phases[2].id;
  const finalAttacks = boss.timeline.clips
    .filter((clip) => (
      clip.phaseId === finalPhaseId && damagingPrototypePrimitives.has(clip.primitiveId)
    ))
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const crossIndexes = finalAttacks.flatMap((clip, index) => (
    clip.primitiveId === 'rotating-cross' ? [index] : []
  ));
  assert.equal(crossIndexes.length, 3);
  crossIndexes.forEach((index) => {
    assert.equal(finalAttacks[index + 1]?.primitiveId, 'tail-fan');
    assert.equal(
      finalAttacks[index + 1]?.parameters.sequence,
      finalAttacks[index].parameters.sequence
    );
  });
});

test('Sandbox prototype loading cannot write campaign or workspace content', async () => {
  for (const descriptor of SANDBOX_BOSS_PROTOTYPES) descriptor.buildPreview(campaign);

  const campaignBytesAfter = await readFile(campaignPath);
  const campaignStatAfter = await stat(campaignPath);
  assert.deepEqual(campaignBytesAfter, campaignBytesBefore);
  assert.equal(campaignStatAfter.mtimeMs, campaignStatBefore.mtimeMs);

  const builderSource = await readFile(
    path.join(repositoryRoot, 'director', 'src', 'combat-lab', 'sandboxBossPrototypes.ts'),
    'utf8'
  );
  assert.doesNotMatch(
    builderSource,
    /\b(?:fetchGameCampaign|saveGameCampaign|localStorage|writeFile|gameCampaignWorkspaceRepository)\b/
  );
});

test('boss-only telemetry derives DPS from the simulation frame clock', () => {
  assert.equal(calculateCombatLabDps(null), 0);
  assert.equal(calculateCombatLabDps({
    aggregate: {
      latestFrame: 0,
      damageDealt: 900
    }
  }), 0);
  assert.equal(calculateCombatLabDps({
    aggregate: {
      latestFrame: 120,
      damageDealt: 600
    }
  }), 300);
});

test('Sandbox UI retains the canonical preview and blocks persistence or promotion while selected', async () => {
  const appSource = await readFile(
    path.join(repositoryRoot, 'director', 'src', 'combat-lab', 'CombatLabApp.tsx'),
    'utf8'
  );
  const pickerSource = await readFile(
    path.join(repositoryRoot, 'director', 'src', 'combat-lab', 'SandboxBossPrototypePicker.tsx'),
    'utf8'
  );

  assert.match(appSource, /<GameEditorCanvas/);
  assert.match(appSource, /buildSandboxBossPrototypePreview\(sourceCampaign, prototypeId\)/);
  assert.match(appSource, /if \(activeSandboxPrototype\)[\s\S]*cannot be saved as promotable presets/);
  assert.match(appSource, /if \(activeSandboxPrototype\)[\s\S]*cannot be exported as campaign JSON/);
  assert.match(appSource, /if \(activeSandboxPrototype\)[\s\S]*cannot be promoted or applied/);
  assert.match(appSource, /disabled=\{Boolean\(activeSandboxPrototype\)\}/);
  assert.match(appSource, /calculateCombatLabDps\(telemetrySnapshot\)/);
  assert.match(pickerSource, /data-sandbox-only="true"/);
  assert.match(pickerSource, /aria-pressed=\{activePrototypeId === prototype\.id\}/);
});
