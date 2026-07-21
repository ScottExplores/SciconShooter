import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
const server = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: { '@game': repositoryRoot }
  },
  server: { middlewareMode: true },
  appType: 'custom'
});

after(async () => {
  await server.close();
});

const catalogModule = await server.ssrLoadModule('/director/src/combat-lab/contentCatalog.ts');
const experimentModule = await server.ssrLoadModule('/director/src/combat-lab/experimentModel.ts');
const validationModule = await server.ssrLoadModule('/game-config/validate.ts');

const {
  COMBAT_LAB_CATEGORY_IDS,
  buildCombatLabCatalog
} = catalogModule;
const {
  buildCombatLabRuntimeSquadLoadout,
  createCombatLabPreset,
  createFocusedPreviewCampaign,
  createPreviewCampaignFromPreset,
  createPromotionCampaign,
  duplicateCombatLabPreset,
  loadCombatLabPreset
} = experimentModule;
const { validateGameCampaign } = validationModule;

const findEvent = (value, eventId) => {
  for (const level of value.levels) {
    for (const wave of level.waves) {
      const event = wave.events.find((candidate) => candidate.id === eventId);
      if (event) return { level, wave, event };
    }
  }
  return undefined;
};

test('content catalog discovers every real Combat Lab category without dangling relationships', () => {
  const catalog = buildCombatLabCatalog(campaign);

  assert.deepEqual(catalog.categories.map((category) => category.id), [...COMBAT_LAB_CATEGORY_IDS]);
  assert.equal(catalog.categories.length, 10);
  assert.ok(catalog.categories.every((category) => category.items.length > 0));
  assert.equal(new Set(catalog.allItems.map((item) => item.id)).size, catalog.allItems.length);
  assert.equal(Object.keys(catalog.byId).length, catalog.allItems.length);
  assert.equal(catalog.formations.length, 9);
  assert.equal(catalog.enemies.length, 4);
  assert.equal(catalog.mainShips.length, 4);
  assert.equal(catalog.miniShips.length, 10);
  assert.equal(catalog.powerups.length, 7);
  assert.ok(catalog.bosses.length > 0);
  assert.ok(catalog.bossMoves.some((item) => item.kind === 'boss-weapon'));
  assert.ok(catalog.bossMoves.some((item) => item.kind === 'boss-phase'));
  assert.ok(catalog.effectsAssets.some((item) => item.kind === 'asset'));
  assert.ok(catalog.effectsAssets.some((item) => item.kind === 'effect'));

  for (const item of catalog.allItems) {
    assert.ok(item.sourceRefs.length > 0, `${item.id} should identify its production source`);
    for (const relatedId of item.relatedIds) {
      assert.ok(catalog.byId[relatedId], `${item.id} has dangling relationship ${relatedId}`);
    }
  }
});

test('every formation, enemy, power-up, boss weapon, and boss phase selection creates a valid focused preview', () => {
  const before = JSON.stringify(campaign);
  const catalog = buildCombatLabCatalog(campaign);

  for (const item of catalog.formations) {
    const result = createFocusedPreviewCampaign(campaign, {
      kind: 'formation',
      patternId: item.target.patternId
    });
    assert.equal(validateGameCampaign(result.campaign).valid, true, item.id);
    assert.equal(result.previewWave.events.length, 1);
    assert.ok(['spawn', 'asteroid-belt'].includes(result.previewWave.events[0].kind));
    assert.equal(result.previewWave.events[0].patternId, item.target.patternId);
  }

  for (const item of catalog.enemies) {
    const result = createFocusedPreviewCampaign(campaign, {
      kind: 'enemy',
      enemyId: item.target.enemyId
    });
    assert.equal(validateGameCampaign(result.campaign).valid, true, item.id);
    assert.equal(result.previewWave.events[0].enemies[0].enemyId, item.target.enemyId);
  }

  for (const item of catalog.powerups) {
    const result = createFocusedPreviewCampaign(campaign, {
      kind: 'powerup',
      powerupId: item.target.powerupId
    });
    assert.equal(validateGameCampaign(result.campaign).valid, true, item.id);
    assert.deepEqual(result.previewWave.events[0].powerupIds, [item.target.powerupId]);
  }

  for (const item of catalog.bossMoves) {
    const focus = item.kind === 'boss-weapon'
      ? {
        kind: 'boss-weapon',
        eventId: item.target.eventId,
        weaponSettingId: item.target.weaponSettingId
      }
      : {
        kind: 'boss-phase',
        eventId: item.target.eventId,
        phaseId: item.target.phaseId
      };
    const source = findEvent(campaign, item.target.eventId).event;
    const result = createFocusedPreviewCampaign(campaign, focus);
    const previewBoss = result.previewWave.events[0];
    assert.equal(validateGameCampaign(result.campaign).valid, true, item.id);
    assert.equal(previewBoss.id, source.id, `${item.id} should retain the production event ID`);
    assert.equal(previewBoss.rigId, source.rigId, `${item.id} should retain its explicit rig`);
    if (item.kind === 'boss-phase') {
      const sourcePhase = source.phases.find((phase) => phase.id === item.target.phaseId);
      assert.equal(previewBoss.phases[0].id, sourcePhase.id);
      assert.equal(previewBoss.phases[0].movementPatternId, sourcePhase.movementPatternId);
      if (source.bossId === 'paywall-wall') {
        assert.equal(previewBoss.phases[0].speedMultiplier, 1);
        assert.equal(previewBoss.speed, source.speed * sourcePhase.speedMultiplier);
        assert.ok(result.limitations.some((message) => message.includes('Paywall wall')));
      } else {
        assert.equal(previewBoss.phases[0].speedMultiplier, sourcePhase.speedMultiplier);
        assert.equal(previewBoss.speed, source.speed, 'real phase runtime should apply the multiplier');
      }
    }
  }

  assert.equal(JSON.stringify(campaign), before, 'focused previews must not mutate the source campaign');
});

test('promotion inserts a full valid wave with unique remapped event and nested boss IDs', () => {
  const before = JSON.stringify(campaign);
  const targetLevel = campaign.levels[0];
  const sourceWave = targetLevel.waves.find((wave) => wave.events.some((event) => event.kind === 'boss'));
  assert.ok(sourceWave, 'fixture should contain a boss wave');

  const result = createPromotionCampaign(campaign, {
    kind: 'wave',
    targetLevelId: targetLevel.id,
    wave: sourceWave,
    insertAfterWaveId: targetLevel.waves[0].id
  }, {
    now: () => '2026-07-20T12:00:00.000Z'
  });

  assert.equal(validateGameCampaign(result.campaign).valid, true);
  assert.equal(result.campaign.schemaVersion, campaign.schemaVersion);
  assert.equal(result.campaign.recordCard.copy.title, campaign.recordCard.copy.title);
  assert.equal(result.campaign.hudAssets.bombIconAssetKey, campaign.hudAssets.bombIconAssetKey);
  assert.equal(result.campaign.revision, campaign.revision + 1);
  assert.equal(result.campaign.updatedAt, '2026-07-20T12:00:00.000Z');
  assert.notEqual(result.insertedWaveId, sourceWave.id);

  const promotedLevel = result.campaign.levels.find((level) => level.id === targetLevel.id);
  const promotedWave = promotedLevel.waves.find((wave) => wave.id === result.insertedWaveId);
  assert.ok(promotedWave);
  assert.deepEqual(promotedLevel.waves.map((wave) => wave.order), promotedLevel.waves.map((_, index) => index + 1));
  assert.equal(promotedWave.events.length, sourceWave.events.length);
  assert.ok(promotedWave.events.every((event, index) => event.id !== sourceWave.events[index].id));

  const sourceBoss = sourceWave.events.find((event) => event.kind === 'boss');
  const promotedBoss = promotedWave.events.find((event) => event.kind === 'boss');
  assert.ok(sourceBoss && promotedBoss);
  assert.equal(promotedBoss.rigId, sourceBoss.rigId);
  assert.ok(promotedBoss.weapons.every((weapon, index) => weapon.id !== sourceBoss.weapons[index].id));
  assert.ok(promotedBoss.phases.every((phase, index) => phase.id !== sourceBoss.phases[index].id));
  const promotedWeaponIds = new Set(promotedBoss.weapons.map((weapon) => weapon.id));
  assert.ok(promotedBoss.phases.every((phase) => (
    phase.weaponSettingIds.every((weaponId) => promotedWeaponIds.has(weaponId))
  )));

  const eventPromotion = createPromotionCampaign(campaign, {
    kind: 'event',
    targetLevelId: targetLevel.id,
    targetWaveId: targetLevel.waves[0].id,
    event: sourceBoss,
    startSeconds: 0
  }, {
    now: () => '2026-07-20T12:00:00.000Z'
  });
  assert.equal(validateGameCampaign(eventPromotion.campaign).valid, true);
  assert.notEqual(eventPromotion.insertedEventId, sourceBoss.id);
  const promotedEventBoss = findEvent(eventPromotion.campaign, eventPromotion.insertedEventId).event;
  assert.equal(promotedEventBoss.kind, 'boss');
  assert.equal(promotedEventBoss.rigId, sourceBoss.rigId);
  assert.ok(promotedEventBoss.phases.every((phase) => (
    phase.weaponSettingIds.every((id) => promotedEventBoss.weapons.some((weapon) => weapon.id === id))
  )));
  assert.equal(JSON.stringify(campaign), before, 'promotion must not mutate the tracked campaign object');
});

test('preset envelopes clone safely and runtime loadouts use production progression formulas', () => {
  const before = JSON.stringify(campaign);
  const preview = createFocusedPreviewCampaign(campaign, {
    kind: 'powerup',
    powerupId: 'extra-life'
  });
  const loadout = {
    mainShipId: 'bio',
    upgrades: { fireRate: 999, speed: 3, startingHearts: -4 },
    companions: [
      { slot: 'left', miniShipId: 'citation-dart', level: 99 },
      { slot: 'right', miniShipId: 'photon-manta', level: 2 }
    ]
  };
  const runtimeLoadout = buildCombatLabRuntimeSquadLoadout(loadout);
  assert.equal(runtimeLoadout.profileId, 'combat-lab');
  assert.equal(runtimeLoadout.weekKey, 'combat-lab');
  assert.equal(runtimeLoadout.mainShipId, 'bio');
  assert.equal(runtimeLoadout.upgrades.speed, 3);
  assert.equal(runtimeLoadout.upgrades.startingHearts, 0);
  assert.ok(runtimeLoadout.upgrades.fireRate < 999);
  assert.deepEqual(runtimeLoadout.companions.map((companion) => companion.slot), ['left', 'right']);
  assert.equal(runtimeLoadout.companions[0].level, 5);

  const preset = createCombatLabPreset({
    name: 'Extra Life Pickup',
    sourceCampaign: campaign,
    preview,
    loadout,
    contentHash: 'fixture-hash'
  }, {
    now: () => '2026-07-20T12:00:00.000Z'
  });
  assert.equal(preset.schemaVersion, 1);
  assert.equal(preset.status, 'test-preset');
  assert.equal(preset.source.campaignId, campaign.id);
  assert.equal(preset.source.eventId, preview.eventId);

  const loaded = loadCombatLabPreset(JSON.stringify(preset), campaign);
  loaded.previewWave.name = 'Mutated loaded copy';
  assert.notEqual(loaded.previewWave.name, preset.previewWave.name);
  assert.throws(() => loadCombatLabPreset({
    ...preset,
    focus: { kind: 'unknown-focus' }
  }), /Unsupported Combat Lab preset focus/);
  assert.throws(() => buildCombatLabRuntimeSquadLoadout({
    mainShipId: 'bio',
    companions: [{ slot: 'center', miniShipId: 'citation-dart', level: 1 }]
  }), /Unknown Combat Lab squad slot/);

  const duplicate = duplicateCombatLabPreset(preset, undefined, {
    now: () => '2026-07-21T12:00:00.000Z'
  });
  assert.notEqual(duplicate.id, preset.id);
  assert.equal(duplicate.name, `${preset.name} Copy`);
  assert.notEqual(duplicate.previewWave, preset.previewWave);
  assert.equal(duplicate.createdAt, '2026-07-21T12:00:00.000Z');

  const restoredCampaign = createPreviewCampaignFromPreset(campaign, preset);
  assert.equal(validateGameCampaign(restoredCampaign).valid, true);
  assert.equal(findEvent(restoredCampaign, preview.eventId).event.powerupIds[0], 'extra-life');
  assert.equal(JSON.stringify(campaign), before, 'preset operations must not mutate the source campaign');
});
