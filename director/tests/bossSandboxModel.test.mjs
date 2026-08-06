import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(
  await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8')
);
const prototypeAssetRoot = path.join(repositoryRoot, 'director-data', 'prototype-assets');
const vfxSheetPath = path.join(prototypeAssetRoot, 'aurora-boss-vfx-sheet-v1.png');
const gloamforgeAtlasPath = path.join(
  prototypeAssetRoot,
  'gloamforge-mantis',
  'gloamforge-mantis-atlas.png'
);
const nullwakeAssembledPath = path.join(
  prototypeAssetRoot,
  'nullwake-revenant-assembled.png'
);
const nullwakeFactoryAtlasV3Path = path.join(
  prototypeAssetRoot,
  'nullwake-revenant-factory-atlas-v3.png'
);
const artworkFixtures = Object.freeze([
  Object.freeze({
    prototypeId: 'meridian-harrower',
    kind: 'segmented-crescent-v1',
    frameCount: 17,
    assembledDimensions: Object.freeze({ width: 606, height: 606 }),
    sheetDimensions: Object.freeze({ width: 1254, height: 1254 }),
    sheetPath: path.join(prototypeAssetRoot, 'meridian-harrower-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'helios-clawcarrier',
    modular: true,
    frameCount: 40,
    assembledDimensions: Object.freeze({ width: 460, height: 330 }),
    sheetDimensions: Object.freeze({ width: 2048, height: 1024 }),
    binaryAlpha: true,
    sheetPath: path.join(
      prototypeAssetRoot,
      'helios-clawcarrier-v2',
      'helios-clawcarrier-v2-atlas.png'
    )
  }),
  Object.freeze({
    prototypeId: 'aurora-storm-engine',
    kind: 'rotating-emitter-core-v1',
    frameCount: 33,
    assembledDimensions: Object.freeze({ width: 662, height: 503 }),
    sheetDimensions: Object.freeze({ width: 1254, height: 1254 }),
    sheetPath: path.join(prototypeAssetRoot, 'aurora-storm-engine-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'umbra-needlewing',
    kind: 'transforming-orbiter-v1',
    renderMode: 'assembled',
    assembledMotionProfile: 'wingbeat-hover',
    frameCount: 23,
    assembledDimensions: Object.freeze({ width: 363, height: 257 }),
    sheetDimensions: Object.freeze({ width: 1254, height: 1254 }),
    binaryAlpha: true,
    sheetPath: path.join(prototypeAssetRoot, 'umbra-needlewing-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'cinderjaw-siege-beetle',
    kind: 'articulated-pincer-v1',
    frameCount: 20,
    assembledDimensions: Object.freeze({ width: 351, height: 256 }),
    sheetDimensions: Object.freeze({ width: 1254, height: 1254 }),
    binaryAlpha: true,
    sheetPath: path.join(prototypeAssetRoot, 'cinderjaw-siege-beetle-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'vesperglass-mothmother',
    kind: 'segmented-crescent-v1',
    frameCount: 17,
    assembledDimensions: Object.freeze({ width: 376, height: 306 }),
    sheetDimensions: Object.freeze({ width: 1536, height: 1024 }),
    binaryAlpha: true,
    sheetPath: path.join(prototypeAssetRoot, 'vesperglass-mothmother-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'twin-halo-wardens',
    kind: 'transforming-orbiter-v1',
    renderMode: 'assembled',
    assembledMotionProfile: 'paired-resonance',
    frameCount: 23,
    assembledDimensions: Object.freeze({ width: 322, height: 219 }),
    sheetDimensions: Object.freeze({ width: 1254, height: 1254 }),
    binaryAlpha: true,
    sheetPath: path.join(prototypeAssetRoot, 'twin-halo-wardens-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'riftcoil-wyrm',
    kind: 'segmented-crescent-v1',
    frameCount: 17,
    assembledDimensions: Object.freeze({ width: 287, height: 370 }),
    sheetDimensions: Object.freeze({ width: 1183, height: 1329 }),
    binaryAlpha: true,
    sheetPath: path.join(prototypeAssetRoot, 'riftcoil-wyrm-modular-sheet.png')
  }),
  Object.freeze({
    prototypeId: 'nullwake-revenant',
    kind: 'transforming-orbiter-v1',
    renderMode: 'assembled',
    assembledMotionProfile: 'revival-shell',
    frameCount: 23,
    assembledDimensions: Object.freeze({ width: 370, height: 311 }),
    sheetDimensions: Object.freeze({ width: 1254, height: 1254 }),
    binaryAlpha: true,
    chromaDespilled: true,
    sheetPath: path.join(prototypeAssetRoot, 'nullwake-revenant-modular-sheet.png')
  })
]);
const { PNG } = pngjs;
const sourceSnapshot = structuredClone(campaign);
const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true },
  appType: 'custom'
});
after(async () => vite.close());

const model = await vite.ssrLoadModule('/director/src/tools/bosses/bossSandboxModel.ts');
const timelineRegistry = await vite.ssrLoadModule('/game-config/bossTimeline.ts');
const weeklyRun = await vite.ssrLoadModule('/services/weeklyRunGenerator.ts');
const artworkAssets = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxArtworkAssets.ts'
);
const getAllBossChoices = () => (
  model.buildBossSandboxGroups(campaign).flatMap((group) => group.choices)
);
const getPrototypeChoice = (prototypeId) => (
  getAllBossChoices().find((choice) => choice.prototypeId === prototypeId)
);

test('performing attack selector follows runtime stages and clears for recovery', () => {
  const activeAttack = {
    id: 'attack-one',
    label: 'Attack One',
    role: 'core',
    beatIndex: 1,
    beatCount: 3,
    clipId: 'attack-one-warning'
  };

  for (const stage of ['warning', 'fire', 'transition']) {
    assert.equal(
      model.getBossSandboxPerformingAttackId({ ...activeAttack, stage }),
      'attack-one'
    );
  }
  assert.equal(
    model.getBossSandboxPerformingAttackId({ ...activeAttack, stage: 'recovery' }),
    null
  );
  assert.equal(model.getBossSandboxPerformingAttackId(null), null);
  assert.equal(model.getBossSandboxPerformingAttackId(undefined), null);
});

test('weekly lineup is the canonical deterministic Weekly Run encounter order', () => {
  const weekKey = '2026-08-02';
  const stageCount = 12;
  const plan = weeklyRun.planWeeklyRunStages(weekKey, campaign, stageCount);
  const lineup = model.buildBossSandboxWeeklyLineup(campaign, weekKey, stageCount);

  assert.deepEqual(
    lineup.map((encounter) => ({
      stageNumber: encounter.stageNumber,
      bossId: encounter.bossId,
      kind: encounter.kind,
      waveCount: encounter.waveCount
    })),
    plan.filter((stage) => stage.bossId).map((stage) => ({
      stageNumber: stage.index + 1,
      bossId: stage.bossId,
      kind: stage.kind === 'major' ? 'boss' : 'elite-enemy',
      waveCount: stage.waveCount
    }))
  );
  assert.ok(lineup.some((encounter) => encounter.kind === 'boss'));
  assert.ok(lineup.some((encounter) => encounter.kind === 'elite-enemy'));
  assert.ok(lineup.every((encounter) => encounter.label.length > 0));
  assert.deepEqual(
    model.buildBossSandboxWeeklyLineup(campaign, weekKey, stageCount),
    lineup
  );
  assert.deepEqual(campaign, sourceSnapshot);
});

test('rail width recovery and clamping always reserve the mobile game viewport', () => {
  assert.deepEqual(
    model.normalizeBossSandboxRailWidths(null),
    { left: model.BOSS_SANDBOX_RAIL_MIN_WIDTH, right: model.BOSS_SANDBOX_RAIL_MIN_WIDTH }
  );
  assert.deepEqual(
    model.normalizeBossSandboxRailWidths({ left: 999, right: 'bad' }),
    { left: model.BOSS_SANDBOX_RAIL_MAX_WIDTH, right: model.BOSS_SANDBOX_RAIL_MIN_WIDTH }
  );
  assert.equal(
    model.clampBossSandboxRailWidth({
      requestedWidth: 500,
      otherRailWidth: model.BOSS_SANDBOX_RAIL_MIN_WIDTH,
      workspaceWidth: 1000
    }),
    374
  );

  const fitted = model.fitBossSandboxRailWidths({ left: 420, right: 420 }, 900);
  assert.ok(fitted.left >= model.BOSS_SANDBOX_RAIL_MIN_WIDTH);
  assert.ok(fitted.right >= model.BOSS_SANDBOX_RAIL_MIN_WIDTH);
  assert.ok(
    fitted.left + fitted.right + model.BOSS_SANDBOX_GAME_VIEWPORT_WIDTH <= 900
  );
});

test('Boss Sandbox integrity assets include every supplemental modular atlas once', () => {
  const assembled = { url: '/assembled.png', contentHash: 'a'.repeat(64) };
  const sheet = { url: '/sheet.png', contentHash: 'b'.repeat(64) };
  const supplementalA = { url: '/factory-atlas-v2.png', contentHash: 'c'.repeat(64) };
  const supplementalB = { url: '/damage-atlas.png', contentHash: 'd'.repeat(64) };
  const vfx = { url: '/vfx.png', contentHash: 'e'.repeat(64) };
  const assets = artworkAssets.getBossSandboxIntegrityAssets({
    assembled,
    sheet,
    articulatedAtlas: sheet,
    modularRig: {
      atlases: [assembled, supplementalA, supplementalB]
    },
    vfxAtlas: vfx
  });

  assert.deepEqual(
    assets.map((asset) => asset.url),
    ['/assembled.png', '/sheet.png', '/factory-atlas-v2.png', '/damage-atlas.png', '/vfx.png']
  );
  assert.equal(Object.isFrozen(assets), true);
  assert.throws(
    () => artworkAssets.getBossSandboxIntegrityAssets({
      assembled,
      sheet,
      modularRig: {
        atlases: [{ ...assembled, contentHash: 'f'.repeat(64) }]
      }
    }),
    /conflicting hashes/
  );
});

test('every registered modular atlas participates in the browser integrity gate', () => {
  for (const registration of Object.values(model.SANDBOX_BOSS_ARTWORK_REGISTRATIONS)) {
    const integrityAssets = artworkAssets.getBossSandboxIntegrityAssets(registration);
    for (const atlas of registration.modularRig?.atlases ?? []) {
      assert.ok(
        integrityAssets.some((asset) => (
          asset.url === atlas.url && asset.contentHash === atlas.contentHash
        )),
        `${registration.prototypeId}/${atlas.url} must be verified before preview mount`
      );
    }
  }
});

test('Boss Sandbox groups main-game and every non-campaign prototype without losing campaign order', () => {
  const groups = model.buildBossSandboxGroups(campaign);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const campaignGroup = groupById.get(model.BOSS_SANDBOX_GROUP_IDS.campaign);
  const testGroup = groupById.get(model.BOSS_SANDBOX_GROUP_IDS.test);
  const miniBossGroup = groupById.get(model.BOSS_SANDBOX_GROUP_IDS.miniBosses);
  const campaignChoices = campaignGroup.choices;
  const prototypeChoices = [...testGroup.choices, ...miniBossGroup.choices];
  const configuredBossCount = campaign.levels.flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss').length;

  assert.deepEqual(
    groups.map((group) => group.id),
    [
      model.BOSS_SANDBOX_GROUP_IDS.campaign,
      model.BOSS_SANDBOX_GROUP_IDS.test,
      model.BOSS_SANDBOX_GROUP_IDS.miniBosses
    ]
  );
  assert.equal(campaignGroup.source, 'campaign');
  assert.equal(testGroup.source, 'test');
  assert.equal(miniBossGroup.source, 'test');
  assert.equal(testGroup.choices.length, 15);
  assert.equal(miniBossGroup.choices.length, 8);
  assert.equal(miniBossGroup.label, 'ELITE ENEMIES · Campaign roster');
  artworkFixtures.forEach(({ prototypeId }) => {
    assert.ok(prototypeChoices.some((choice) => choice.prototypeId === prototypeId));
  });
  assert.ok(testGroup.choices.some((choice) => (
    choice.prototypeId === 'frontier-crownclaw'
  )));
  assert.ok(testGroup.choices.some((choice) => (
    choice.prototypeId === 'gloamforge-mantis'
  )));
  assert.equal(campaignChoices.length, configuredBossCount);
  assert.deepEqual(
    campaignChoices.map((choice) => choice.missionOrder),
    [...campaignChoices]
      .map((choice) => choice.missionOrder)
      .sort((left, right) => left - right)
  );
  assert.ok(campaignChoices.every((choice) => (
    model.getBossSandboxChoiceOptionLabel(choice)
      .startsWith(`M${String(choice.missionOrder).padStart(2, '0')} · ${choice.encounterClass === 'full-boss' ? 'BOSS' : 'ELITE'} · `)
  )));
  assert.equal(
    campaignChoices.find((choice) => choice.missionOrder === 3)?.encounterClass,
    'mini-boss'
  );
  assert.equal(
    campaignChoices.find((choice) => choice.missionOrder === 5)?.encounterClass,
    'full-boss'
  );
  const fractureCampaignChoice = campaignChoices.find((choice) => choice.missionOrder === 8);
  assert.equal(fractureCampaignChoice?.miniBoss?.encounterId, 'fracture-engine-elite');
  assert.match(
    fractureCampaignChoice?.artworkUrl ?? '',
    /mini-boss-lab-v2\/fracture-engine-elite\/.*\.png$/
  );
  assert.equal(
    new Set(groups.flatMap((group) => group.choices.map((choice) => choice.id))).size,
    configuredBossCount + prototypeChoices.length
  );
  assert.deepEqual(campaign, sourceSnapshot);
});

test('Boss Sandbox defaults to MAIN GAME and preserves the milestone campaign boss roster', () => {
  const groups = model.buildBossSandboxGroups(campaign);
  const campaignChoices = groups.find((group) => (
    group.id === model.BOSS_SANDBOX_GROUP_IDS.campaign
  )).choices;
  const allChoices = groups.flatMap((group) => group.choices);

  assert.equal(model.getDefaultBossSandboxChoice(allChoices), campaignChoices[0]);
  assert.equal(model.getDefaultBossSandboxChoice(allChoices).source, 'campaign');

  const expectedRoster = [
    [5, 'GATEKEEPER PRIME', 'gatekeeper-prime'],
    [10, 'Paywall Decimator', 'paywall-decimator'],
    [15, 'Prism Moth Broodkeeper', 'prism-moth'],
    [20, 'Frontier Crownclaw', 'frontier-crownclaw'],
    [25, 'Helios Clawcarrier', 'helios-clawcarrier']
  ];

  const actualRoster = expectedRoster.map(([missionOrder]) => {
    const choice = campaignChoices.find((candidate) => (
      candidate.missionOrder === missionOrder
    ));
    assert.ok(choice, `M${missionOrder} must be selectable from MAIN GAME`);
    assert.equal(choice.source, 'campaign');

    const preview = model.buildBossSandboxPreview(campaign, choice);
    const boss = preview.previewWave.events.find((event) => (
      event.kind === 'boss' && event.id === choice.eventId
    ));
    assert.ok(boss, `M${missionOrder} must preview its selected campaign boss`);
    assert.equal(preview.eventId, choice.eventId);

    return [missionOrder, boss.label, boss.bossId];
  });

  assert.deepEqual(actualRoster, expectedRoster);
});

test('Boss Sandbox clearly separates bosses from elite enemies across Campaign and test encounters', () => {
  const groups = model.buildBossSandboxGroups(campaign);
  assert.deepEqual(
    model.BOSS_SANDBOX_CATEGORIES.map((category) => category.label),
    [
      'Bosses',
      'Elite Enemies',
      'Test Bosses',
      'Solo Elites',
      'Paired Encounters',
      'Guardian Formations',
      'Wall Encounters',
      'All Encounters'
    ]
  );
  assert.equal(model.getBossSandboxSelectorLabel('full-bosses'), 'Boss to Test');
  assert.equal(model.getBossSandboxSelectorLabel('test-bosses'), 'Test Boss to Test');
  assert.equal(model.getBossSandboxSelectorLabel('mini-bosses'), 'Elite Enemy to Test');
  assert.equal(model.getBossSandboxSelectorLabel('elite-enemies'), 'Solo Elite to Test');
  assert.equal(model.getBossSandboxSelectorLabel('guardian-formations'), 'Formation to Test');

  const testBossChoices = model.filterBossSandboxGroups(groups, 'test-bosses')
    .flatMap((group) => group.choices);
  assert.equal(testBossChoices.length, 15);
  assert.ok(testBossChoices.every((choice) => choice.source === 'test'));
  assert.ok(testBossChoices.every((choice) => choice.encounterClass === 'full-boss'));
  assert.ok(testBossChoices.some((choice) => (
    choice.prototypeId === 'cinderjaw-siege-beetle'
    && choice.bossLabel === 'Cinderjaw Siege Beetle'
  )));
  const paywallArchive = testBossChoices.find((choice) => (
    choice.prototypeId === 'paywall-decimator-archive'
  ));
  assert.ok(paywallArchive);
  assert.equal(paywallArchive.bossLabel, 'Paywall Decimator');
  const paywallPreview = model.buildBossSandboxPreview(campaign, paywallArchive);
  const paywallBoss = paywallPreview.previewWave.events.find((event) => event.kind === 'boss');
  assert.equal(paywallBoss.spriteKey, 'PIXI_BOSS_PAYWALL_FRAMES');
  assert.equal(paywallBoss.rigId, 'paywall-siege');
  assert.deepEqual(
    paywallBoss.weapons.map((weapon) => weapon.id),
    ['sandbox-paywall-decimator-burst', 'sandbox-paywall-decimator-beam']
  );

  const miniBossChoices = model.filterBossSandboxGroups(groups, 'mini-bosses')
    .flatMap((group) => group.choices);
  assert.ok(miniBossChoices.every((choice) => choice.encounterClass === 'mini-boss'));
  const campaignEliteChoices = miniBossChoices.filter((choice) => choice.source === 'campaign');
  const testEliteChoices = miniBossChoices.filter((choice) => choice.source === 'test');
  assert.ok(campaignEliteChoices.length > 0);
  assert.equal(testEliteChoices.length, 8);
  assert.ok(testEliteChoices.every((choice) => choice.miniBoss?.sandboxReady === true));
  assert.ok(testEliteChoices.every((choice) => choice.miniBoss?.campaignAssigned === true));
  assert.ok(testEliteChoices.every((choice) => choice.artworkAssetId));

  const pairIds = model.filterBossSandboxGroups(groups, 'paired-encounters')
    .flatMap((group) => group.choices)
    .map((choice) => choice.miniBoss?.encounterId);
  assert.deepEqual([...new Set(pairIds)], [
    'fracture-engine-elite',
    'twin-meridian-sentinels',
    'gridline-sentries'
  ]);
  const allChoices = model.filterBossSandboxGroups(groups, 'all-encounters')
    .flatMap((group) => group.choices);
  assert.equal(allChoices.length, groups.flatMap((group) => group.choices).length);
  assert.deepEqual(campaign, sourceSnapshot);
});

test('Frontier projectile registrations resolve to the authored open claw, chain, and laser frames', () => {
  const registration = model.getSandboxBossArtworkRegistration('frontier-crownclaw');
  assert.ok(registration?.modularRig);
  const animations = registration.projectileAnimations;
  assert.deepEqual(animations['boss-frontier-chainclaw'].frameIds, ['claw.open']);
  assert.deepEqual(animations['boss-frontier-chain-link'].frameIds, ['chain.segment']);
  assert.deepEqual(
    animations['boss-frontier-reactor-beam'].frameIds,
    ['beam.0', 'beam.1', 'beam.2', 'beam.3']
  );
  for (const animation of Object.values(animations)) {
    for (const frameId of animation.frameIds) {
      assert.ok(
        registration.modularRig.frameById[frameId],
        `Frontier modular atlas must contain ${frameId}`
      );
    }
  }
});

test('production choices resolve to one valid source boss without mutating campaign', () => {
  const groups = model.buildBossSandboxGroups(campaign);
  const choice = groups.flatMap((group) => group.choices)
    .find((candidate) => candidate.source === 'campaign');
  assert.ok(choice);

  const preview = model.buildBossSandboxPreview(campaign, choice);
  assert.equal(preview.previewWave.events.length, 1);
  assert.equal(preview.previewWave.events[0].kind, 'boss');
  assert.equal(preview.previewWave.events[0].id, choice.eventId);
  assert.deepEqual(campaign, sourceSnapshot);
});

test('all boss choices expose numbered controls, grouping authored sentences and preserving legacy clips', () => {
  const groups = model.buildBossSandboxGroups(campaign);
  const choices = groups.flatMap((group) => group.choices);
  const testChoiceCount = groups.filter((group) => group.source === 'test')
    .flatMap((group) => group.choices).length;
  let tinyTimelineAttackCount = 0;

  assert.equal(choices.length, (
    campaign.levels.flatMap((level) => level.waves)
      .flatMap((wave) => wave.events)
      .filter((event) => event.kind === 'boss').length
    + testChoiceCount
  ));
  for (const choice of choices) {
    const preview = model.buildBossSandboxPreview(campaign, choice);
    const event = preview.previewWave.events.find((candidate) => candidate.kind === 'boss');
    const attacks = model.getBossSandboxAttacks(preview);
    const phaseIds = new Set(event.phases.map((phase) => phase.id));

    assert.ok(event, `${choice.id} must resolve one boss event`);
    assert.ok(attacks.length > 0, `${choice.id} must expose at least one attack button`);
    assert.equal(
      new Set(attacks.map((attack) => attack.id)).size,
      attacks.length,
      `${choice.id} attack IDs must remain unique`
    );
    for (const attack of attacks) {
      assert.ok(phaseIds.has(attack.phaseId), `${choice.id}/${attack.id} needs a valid phase`);
      assert.ok(attack.sourceLabel.trim().length > 0, `${choice.id}/${attack.id} needs diagnostics`);
    }

    if (event.timeline) {
      if (event.timeline.attacks?.length) {
        assert.deepEqual(
          attacks.map((attack) => attack.id),
          event.timeline.attacks.map((attack) => attack.id),
          `${choice.id} must expose the four player-facing attack sentences`
        );
        assert.ok(
          attacks.every((attack) => attack.phaseId === event.phases[0].id),
          `${choice.id} defaults grouped attacks to the opening phase`
        );
        continue;
      }
      const expected = event.timeline.clips.filter((clip) => (
        clip.trigger === 'time'
        && timelineRegistry.BOSS_TIMELINE_PRIMITIVES[clip.primitiveId]?.damaging
      ));
      assert.deepEqual(
        [...attacks.map((attack) => attack.id)].sort(),
        [...expected.map((clip) => clip.id)].sort(),
        `${choice.id} must expose every damaging timeline clip`
      );
      for (const clip of expected.filter((candidate) => candidate.durationSeconds <= 0.2)) {
        tinyTimelineAttackCount += 1;
        assert.ok(
          attacks.some((attack) => attack.id === clip.id),
          `${choice.id}/${clip.id} must not disappear because its duration is tiny`
        );
      }
    }
  }

  assert.ok(tinyTimelineAttackCount > 0, 'the fixture must exercise sub-quarter-second attacks');
  assert.deepEqual(campaign, sourceSnapshot);
});

test('fixed artwork registrations are presentation-only and locked to matching test events', () => {
  for (const fixture of artworkFixtures) {
    const choice = getPrototypeChoice(fixture.prototypeId);
    assert.ok(choice);

    const preview = model.buildBossSandboxPreview(campaign, choice);
    assert.equal(model.isSandboxBossPrototypePreview(preview), true);
    assert.equal(preview.sandboxPrototype.promotionAllowed, false);
    const spriteKeyBefore = preview.previewWave.events[0].spriteKey;
    const registration = model.getSandboxBossArtworkRegistration(fixture.prototypeId);
    const artwork = model.createSandboxOnlyBossArtwork(preview);

    assert.ok(registration);
    assert.equal(registration.prototypeId, fixture.prototypeId);
    assert.deepEqual(
      { width: registration.assembled.width, height: registration.assembled.height },
      fixture.assembledDimensions
    );
    assert.equal(artwork.eventId, preview.eventId);
    assert.equal(artwork.url, registration.assembled.url);
    assert.equal(artwork.contentHash, registration.assembled.contentHash);
    assert.equal(artwork.renderMode, fixture.renderMode);
    assert.equal(artwork.assembledMotionProfile, fixture.assembledMotionProfile);
    assert.match(artwork.contentHash, /^[0-9a-f]{64}$/);
    assert.ok(artwork.url.includes(artwork.contentHash));
    const authoredAtlas = fixture.modular
      ? artwork.modularRig?.manifest.atlas
      : artwork.articulatedAtlas;
    if (fixture.modular) {
      assert.equal(artwork.articulatedAtlas, undefined);
      assert.equal(artwork.modularRig, registration.modularRig);
      assert.equal(typeof artwork.sampleModularPose, 'function');
      assert.equal(artwork.modularRig.manifest.kind, 'modular-hierarchy-v1');
    } else {
      assert.equal(artwork.articulatedAtlas, registration.articulatedAtlas);
      assert.equal(artwork.articulatedAtlas.kind, fixture.kind);
    }
    assert.ok(authoredAtlas);
    assert.deepEqual(
      { width: authoredAtlas.width, height: authoredAtlas.height },
      fixture.sheetDimensions
    );
    assert.ok(artwork.vfxAtlas);
    assert.equal(artwork.vfxAtlas.contentHash, model.SANDBOX_BOSS_VFX_SHEET_SHA256);
    assert.equal(Object.keys(artwork.vfxAtlas.frames).length, 16);
    assert.equal(registration.sheet.url, authoredAtlas.url);
    assert.equal(registration.sheet.contentHash, authoredAtlas.contentHash);
    assert.ok(authoredAtlas.url.includes(authoredAtlas.contentHash));
    assert.equal(Object.keys(authoredAtlas.frames).length, fixture.frameCount);
    Object.values(authoredAtlas.frames).forEach((frame) => {
      assert.ok(frame.x >= 0 && frame.y >= 0);
      assert.ok(frame.width > 0 && frame.height > 0);
      assert.ok(frame.x + frame.width <= authoredAtlas.width);
      assert.ok(frame.y + frame.height <= authoredAtlas.height);
    });
    assert.equal(preview.previewWave.events[0].spriteKey, spriteKeyBefore);
    assert.deepEqual(campaign, sourceSnapshot);
  }
});

test('Nullwake artwork publishes five frozen anatomy-owned normalized weapon sockets', () => {
  const choice = getPrototypeChoice('nullwake-revenant');
  assert.ok(choice);

  const preview = model.buildBossSandboxPreview(campaign, choice);
  const registration = model.getSandboxBossArtworkRegistration('nullwake-revenant');
  const artwork = model.createSandboxOnlyBossArtwork(preview);
  assert.ok(registration?.weaponSockets);
  assert.equal(artwork.weaponSockets, registration.weaponSockets);
  assert.equal(registration.weaponSockets.kind, 'normalized-boss-sockets-v1');
  assert.deepEqual(
    Array.from(registration.weaponSockets.sockets, (socket) => ({ ...socket })),
    [
      { id: 'upper-port-claw', role: 'port', xRatio: 0.17, yRatio: 0.32 },
      { id: 'lower-port-claw', role: 'port', xRatio: 0.16, yRatio: 0.76 },
      { id: 'upper-starboard-claw', role: 'starboard', xRatio: 0.83, yRatio: 0.32 },
      { id: 'lower-starboard-claw', role: 'starboard', xRatio: 0.84, yRatio: 0.76 },
      { id: 'revenant-core', role: 'core', xRatio: 0.5, yRatio: 0.54 }
    ]
  );
  assert.equal(
    registration.weaponSockets.sockets.filter((socket) => socket.role === 'port').length,
    2
  );
  assert.equal(
    registration.weaponSockets.sockets.filter((socket) => socket.role === 'starboard').length,
    2
  );
  assert.equal(
    registration.weaponSockets.sockets.filter((socket) => socket.role === 'core').length,
    1
  );
  registration.weaponSockets.sockets.forEach((socket) => {
    assert.ok(socket.xRatio >= 0 && socket.xRatio <= 1);
    assert.ok(socket.yRatio >= 0 && socket.yRatio <= 1);
    assert.equal(Object.isFrozen(socket), true);
  });
  assert.equal(Object.isFrozen(registration.weaponSockets), true);
  assert.equal(Object.isFrozen(registration.weaponSockets.sockets), true);
  assert.deepEqual(campaign, sourceSnapshot);
});

test('Nullwake reassembles its exact existing pixels as a five-part articulated hierarchy', async () => {
  const choice = getPrototypeChoice('nullwake-revenant');
  assert.ok(choice);

  const preview = model.buildBossSandboxPreview(campaign, choice);
  const registration = model.getSandboxBossArtworkRegistration('nullwake-revenant');
  const artwork = model.createSandboxOnlyBossArtwork(preview);
  const rig = artwork.modularRig;
  const sourceImage = PNG.sync.read(await readFile(nullwakeAssembledPath));
  const recomposed = new PNG({ width: sourceImage.width, height: sourceImage.height });

  assert.ok(registration);
  assert.ok(rig);
  assert.equal(registration.modularRig, rig);
  assert.equal(typeof artwork.sampleModularPose, 'function');
  assert.equal(rig.manifest.id, 'nullwake-revenant-articulated');
  assert.deepEqual(rig.manifest.designSize, { width: 370, height: 311 });
  assert.equal(rig.manifest.atlas.url, registration.assembled.url);
  assert.equal(rig.manifest.atlas.contentHash, registration.assembled.contentHash);
  assert.equal(rig.manifest.parts.filter((part) => part.role === 'arm').length, 4);
  assert.equal(rig.manifest.parts.filter((part) => part.role === 'body').length, 1);
  assert.deepEqual(
    rig.manifest.sockets.map(({ id, role, partId }) => ({ id, role, partId })),
    [
      { id: 'muzzle-upper-port', role: 'projectile-muzzle', partId: 'arm.upper-port' },
      { id: 'muzzle-lower-port', role: 'projectile-muzzle', partId: 'arm.lower-port' },
      { id: 'muzzle-upper-starboard', role: 'projectile-muzzle', partId: 'arm.upper-starboard' },
      { id: 'muzzle-lower-starboard', role: 'projectile-muzzle', partId: 'arm.lower-starboard' },
      { id: 'revenant-core', role: 'core-origin', partId: 'body' }
    ]
  );

  const worldOriginById = new Map();
  for (const partId of rig.topologicalPartIds) {
    const part = rig.partById[partId];
    const parentOrigin = part.parentId
      ? worldOriginById.get(part.parentId)
      : { x: 0, y: 0 };
    if (part.visible || part.frameId === null) {
      assert.equal(part.transform.rotation, 0);
      assert.equal(part.transform.scaleX, 1);
      assert.equal(part.transform.scaleY, 1);
    }
    worldOriginById.set(partId, {
      x: parentOrigin.x + part.transform.x,
      y: parentOrigin.y + part.transform.y
    });
  }

  for (const partId of rig.renderPartIds) {
    const part = rig.partById[partId];
    if (!part.visible || !part.frameId || !part.anchor) continue;
    const frame = rig.manifest.atlas.frames[part.frameId];
    const origin = worldOriginById.get(partId);
    const destinationX = Math.round(
      rig.manifest.designSize.width / 2 + origin.x - part.anchor.x * frame.width
    );
    const destinationY = Math.round(
      rig.manifest.designSize.height / 2 + origin.y - part.anchor.y * frame.height
    );
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const sourceOffset = ((frame.y + y) * sourceImage.width + frame.x + x) * 4;
        if (sourceImage.data[sourceOffset + 3] === 0) continue;
        const destinationOffset = (
          (destinationY + y) * recomposed.width + destinationX + x
        ) * 4;
        sourceImage.data.copy(
          recomposed.data,
          destinationOffset,
          sourceOffset,
          sourceOffset + 4
        );
      }
    }
  }

  assert.deepEqual(Buffer.from(recomposed.data), Buffer.from(sourceImage.data));
  assert.equal(
    Array.from(sourceImage.data).filter((_, index) => index % 4 === 3)
      .every((alpha) => alpha === 0 || alpha === 255),
    true
  );
  assert.deepEqual(campaign, sourceSnapshot);
});

test('Nullwake supplemental factory atlas exposes only bounded, visible, binary-alpha frames', async () => {
  const registration = model.getSandboxBossArtworkRegistration('nullwake-revenant');
  const rig = registration?.modularRig;
  const atlasImage = PNG.sync.read(await readFile(nullwakeFactoryAtlasV3Path));
  const atlas = rig?.manifest.supplementalAtlases?.[0];

  assert.ok(rig);
  assert.ok(atlas);
  assert.equal(atlas.url, model.NULLWAKE_REVENANT_FACTORY_ATLAS_V3_URL);
  assert.equal(atlas.contentHash, model.NULLWAKE_REVENANT_FACTORY_ATLAS_V3_SHA256);
  assert.equal(atlasImage.width, 1536);
  assert.equal(atlasImage.height, 1024);
  assert.equal(Object.keys(atlas.frames).length, 15);
  for (const [frameId, frame] of Object.entries(atlas.frames)) {
    assert.ok(frame.x >= 0 && frame.y >= 0, `${frameId} starts inside the atlas`);
    assert.ok(frame.width > 0 && frame.height > 0, `${frameId} has visible dimensions`);
    assert.ok(frame.x + frame.width <= atlasImage.width, `${frameId} stays within atlas width`);
    assert.ok(frame.y + frame.height <= atlasImage.height, `${frameId} stays within atlas height`);
    let opaquePixels = 0;
    for (let y = frame.y; y < frame.y + frame.height; y += 1) {
      for (let x = frame.x; x < frame.x + frame.width; x += 1) {
        if (atlasImage.data[(y * atlasImage.width + x) * 4 + 3] === 255) opaquePixels += 1;
      }
    }
    assert.ok(opaquePixels > 0, `${frameId} contains generated artwork`);
    assert.equal(rig.frameById[frameId], atlas.frames[frameId]);
    assert.equal(rig.atlasByFrameId[frameId], atlas);
  }
  for (let offset = 3; offset < atlasImage.data.length; offset += 4) {
    assert.ok(
      atlasImage.data[offset] === 0 || atlasImage.data[offset] === 255,
      'Nullwake factory atlas alpha must remain binary'
    );
  }
  const opaquePalette = new Set();
  for (let offset = 0; offset < atlasImage.data.length; offset += 4) {
    if (atlasImage.data[offset + 3] !== 255) continue;
    opaquePalette.add(
      (atlasImage.data[offset] << 16)
      | (atlasImage.data[offset + 1] << 8)
      | atlasImage.data[offset + 2]
    );
  }
  assert.equal(opaquePalette.size, 32, 'Nullwake runtime atlas must keep its locked 32-color palette');
  assert.deepEqual(campaign, sourceSnapshot);
});

test('Gloamforge registers its generated component package as one validated modular hierarchy', {
  skip: !existsSync(gloamforgeAtlasPath)
}, async () => {
  const choice = getPrototypeChoice('gloamforge-mantis');
  assert.ok(choice);

  const preview = model.buildBossSandboxPreview(campaign, choice);
  const registration = model.getSandboxBossArtworkRegistration('gloamforge-mantis');
  const artwork = model.createSandboxOnlyBossArtwork(preview);
  const rig = artwork.modularRig;
  const atlasImage = PNG.sync.read(await readFile(gloamforgeAtlasPath));

  assert.ok(registration);
  assert.ok(rig);
  assert.equal(registration.modularRig, rig);
  assert.equal(registration.articulatedAtlas, undefined);
  assert.equal(artwork.articulatedAtlas, undefined);
  assert.equal(artwork.renderMode, undefined);
  assert.equal(typeof artwork.sampleModularPose, 'function');
  assert.equal(rig.manifest.kind, 'modular-hierarchy-v1');
  assert.equal(rig.manifest.id, 'gloamforge-mantis');
  assert.deepEqual(rig.manifest.designSize, { width: 720, height: 620 });
  assert.equal(rig.manifest.atlas.url, model.GLOAMFORGE_MANTIS_SHEET_URL);
  assert.equal(rig.manifest.atlas.contentHash, model.GLOAMFORGE_MANTIS_SHEET_SHA256);
  assert.equal(Object.keys(rig.manifest.atlas.frames).length, 29);
  assert.equal(rig.manifest.parts.length, 22);
  assert.equal(rig.manifest.animations.length, 6);
  assert.equal(rig.manifest.sockets.length, 8);
  assert.equal(rig.partById.root.role, 'joint');
  assert.equal(rig.partById.root.frameId, null);
  assert.equal(rig.partById.root.visible, false);
  assert.equal(rig.partById.root.transform.x, 0);
  assert.equal(rig.partById.root.transform.y, -95);
  assert.equal(rig.partById['arm.port.mount'].frameId, null);
  assert.equal(rig.partById['cannon.port'].parentId, 'arm.port.mount');
  assert.equal(rig.partById.cleaver.visible, false);
  assert.equal(rig.animationById['cannon-port-cycle'].frameHold, 7);
  assert.equal(rig.animationById['exhaust-idle'].frameHold, 8);
  assert.equal(rig.socketById['muzzle-port'].role, 'projectile-muzzle');
  assert.equal(rig.socketById['muzzle-port'].partId, 'cannon.port');
  assert.equal(rig.socketById['pod-starboard'].role, 'detachable-pod');
  assert.equal(atlasImage.width, 2048);
  assert.equal(atlasImage.height, 2048);
  for (let offset = 3; offset < atlasImage.data.length; offset += 4) {
    assert.ok(
      atlasImage.data[offset] === 0 || atlasImage.data[offset] === 255,
      'Gloamforge atlas alpha must remain binary'
    );
  }
  assert.deepEqual(campaign, sourceSnapshot);
});

test('artwork registry returns undefined for test prototypes without concept art', () => {
  const choice = getPrototypeChoice('sweep-bank-reentry');
  assert.ok(choice);

  const preview = model.buildBossSandboxPreview(campaign, choice);
  assert.equal(model.isSandboxBossPrototypePreview(preview), true);
  assert.equal(model.getSandboxBossArtworkRegistration(choice.prototypeId), undefined);
  assert.throws(
    () => model.createSandboxOnlyBossArtwork(preview),
    /No fixed Sandbox artwork is registered/
  );
  assert.deepEqual(campaign, sourceSnapshot);
});

test('all modular Test Mission bosses share one transparent, bounded, loopback-only VFX atlas', {
  skip: !existsSync(vfxSheetPath)
}, async () => {
  const atlases = artworkFixtures.map(({ prototypeId }) => {
    const choice = getPrototypeChoice(prototypeId);
    const preview = model.buildBossSandboxPreview(campaign, choice);
    return model.createSandboxOnlyBossArtwork(preview).vfxAtlas;
  });
  const atlas = atlases[0];
  const image = PNG.sync.read(await readFile(vfxSheetPath));

  assert.ok(atlases.every((candidate) => (
    candidate.contentHash === atlas.contentHash
    && candidate.url === atlas.url
  )));
  assert.ok(atlas);
  assert.equal(atlas.width, 1254);
  assert.equal(atlas.height, 1254);
  assert.equal(Object.keys(atlas.frames).length, 16);
  assert.match(atlas.contentHash, /^[0-9a-f]{64}$/);
  assert.ok(atlas.url.includes(atlas.contentHash));
  assert.equal(image.data[3], 0, 'the VFX atlas outer gutter must be transparent');
  for (const [frameId, frame] of Object.entries(atlas.frames)) {
    assert.ok(frame.x >= 0 && frame.y >= 0, `${frameId} starts in bounds`);
    assert.ok(frame.x + frame.width <= atlas.width, `${frameId} width is in bounds`);
    assert.ok(frame.y + frame.height <= atlas.height, `${frameId} height is in bounds`);
    let visiblePixels = 0;
    for (let y = frame.y; y < frame.y + frame.height; y += 1) {
      for (let x = frame.x; x < frame.x + frame.width; x += 1) {
        if (image.data[((y * image.width + x) * 4) + 3] > 16) visiblePixels += 1;
      }
    }
    assert.ok(visiblePixels > 100, `${frameId} contains visible pixel art`);
  }
  assert.deepEqual(campaign, sourceSnapshot);
});

for (const fixture of artworkFixtures) {
  test(`every ${fixture.prototypeId} authored-atlas frame is in bounds and visible`, {
    skip: !existsSync(fixture.sheetPath)
  }, async () => {
    const choice = getPrototypeChoice(fixture.prototypeId);
    assert.ok(choice);
    const preview = model.buildBossSandboxPreview(campaign, choice);
    const artwork = model.createSandboxOnlyBossArtwork(preview);
    const image = PNG.sync.read(await readFile(fixture.sheetPath));
    const authoredAtlas = fixture.modular
      ? artwork.modularRig?.manifest.atlas
      : artwork.articulatedAtlas;

    assert.ok(authoredAtlas);
    assert.equal(image.width, authoredAtlas.width);
    assert.equal(image.height, authoredAtlas.height);
    if (fixture.binaryAlpha) {
      for (let offset = 3; offset < image.data.length; offset += 4) {
        assert.ok(
          image.data[offset] === 0 || image.data[offset] === 255,
          `${fixture.prototypeId} physical atlas alpha must be binary`
        );
      }
    }
    if (fixture.chromaDespilled) {
      let greenFringePixels = 0;
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const red = image.data[offset];
        const green = image.data[offset + 1];
        const blue = image.data[offset + 2];
        const alpha = image.data[offset + 3];
        if (
          alpha > 0
          && green > 180
          && green > red * 1.35
          && green > blue * 1.35
        ) greenFringePixels += 1;
      }
      assert.equal(greenFringePixels, 0, `${fixture.prototypeId} must not retain chroma fringe`);
    }
    for (const [partId, frame] of Object.entries(authoredAtlas.frames)) {
      let visiblePixels = 0;
      visible: for (let y = frame.y; y < frame.y + frame.height; y += 1) {
        for (let x = frame.x; x < frame.x + frame.width; x += 1) {
          if (image.data[((y * image.width + x) * 4) + 3] > 8) visiblePixels += 1;
          if (visiblePixels > 100) break visible;
        }
      }
      assert.ok(visiblePixels > 100, `${partId} must contain visible atlas pixels`);
    }
  });
}

test('Desktop and Mobile viewport presets always scale completely inside the host', () => {
  const desktop = model.BOSS_SANDBOX_VIEWPORTS.desktop;
  const mobile = model.BOSS_SANDBOX_VIEWPORTS.mobile;
  assert.deepEqual(
    { width: desktop.width, height: desktop.height },
    { width: 1280, height: 720 }
  );
  assert.deepEqual(
    { width: mobile.width, height: mobile.height },
    { width: 390, height: 844 }
  );

  for (const viewport of [desktop, mobile]) {
    const host = { width: 980, height: 680 };
    const scale = model.resolveBossSandboxFitScale(host, viewport);
    assert.ok(scale >= 0.2 && scale <= 1);
    assert.ok(viewport.width * scale <= host.width - 24 + 0.001);
    assert.ok(viewport.height * scale <= host.height - 24 + 0.001);
  }
  assert.equal(model.resolveBossSandboxFitScale({ width: 0, height: 0 }, desktop), 0.5);
});

test('focused mobile arena can upscale to consume the full-height center column', () => {
  const mobile = model.BOSS_SANDBOX_VIEWPORTS.mobile;
  const host = { width: 700, height: 1_080 };
  const scale = model.resolveBossSandboxFitScale(
    host,
    mobile,
    0,
    Number.POSITIVE_INFINITY
  );

  assert.ok(scale > 1, 'the focused arena should be able to grow beyond native CSS size');
  assert.equal(scale, host.height / mobile.height);
  assert.ok(mobile.width * scale <= host.width + 0.001);
  assert.ok(mobile.height * scale <= host.height + 0.001);
});
