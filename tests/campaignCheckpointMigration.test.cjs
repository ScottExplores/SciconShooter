const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const campaign = require('../game-config/campaign.json');
const { sanitizeWalletSnapshot } = require('../api/_lib/walletProfiles.js');
const { createServiceLoader } = require('./helpers/loadService.cjs');
const { resolveRevampWaveId } = require('../shared/campaignWaveMigration.js');

// REVAMP(G), category (a): REVAMP_NOTES_B renamed wave IDs; D promises durable
// progression/receipts. Exercise browser/API sanitizers against the same save.
const majorIds = new Set(campaign.sectors.map((sector) => sector.majorBossId));
const client = createServiceLoader({ dependencies: {
  './levelConfig': {
    DEFAULT_GAME_CAMPAIGN: campaign,
    flattenLevels: (value) => [...value.levels].sort((a, b) => a.order - b.order),
    getBackground: () => ({ tint: '#123456' }),
    getPrimaryAssetPath: (key) => `/art/${key}.png`
  },
  '../game-config/catalog': {
    isMajorBossId: (id) => majorIds.has(id),
    getBossEncounterClass: (id) => majorIds.has(id) ? 'major-boss' : null
  },
  './gameplay/mini-bosses': { getMiniBossEncounterDefinition: () => undefined }
} })(path.join(__dirname, '../services/campaignProgression.ts'));
const wallet = '0x2222222222222222222222222222222222222222';
const now = Date.UTC(2026, 6, 23, 19);
const mission = campaign.levels.find((level) => level.id === 'stage-paywall-siege');
const waves = [...mission.waves].sort((a, b) => a.order - b.order).map((wave) => wave.id);

const sanitizeBoth = (progress) => [
  client.sanitizeCampaignProgress(progress, { campaign }),
  sanitizeWalletSnapshot({ permanentState: { campaignProgress: progress } }, wallet, now)
    .permanentState.campaignProgress
];

test('rev24 renamed checkpoints preserve partial progress and reward receipts in browser and cloud', () => {
  const receipt = `campaign:${mission.id}:first-clear`;
  const save = {
    version: 4, campaignId: campaign.id, campaignRevision: 24,
    unlockedMissionIds: [mission.id], recommendedMissionId: mission.id,
    recommendedWaveId: `${mission.id}-wave-3`,
    missionRecords: { [mission.id]: {
      completedWaveIds: [`${mission.id}-wave-1`, `${mission.id}-wave-2`],
      completed: false, bestScore: 321
    } },
    claimedRewardIds: [receipt], processedResultIds: ['durable-result'],
    replayRewardEpochByMission: { [mission.id]: '2026-07-22' }
  };
  for (const progress of sanitizeBoth(save)) {
    assert.deepEqual(progress.missionRecords[mission.id].completedWaveIds, waves.slice(0, 2));
    assert.equal(progress.missionRecords[mission.id].completed, false);
    assert.equal(progress.missionRecords[mission.id].bestScore, 321);
    assert.deepEqual(progress.missionRecords[mission.id].earnedStarIds, []);
    assert.deepEqual(progress.claimedRewardIds, [receipt]);
    assert.deepEqual(progress.processedResultIds, ['durable-result']);
    assert.equal(progress.replayRewardEpochByMission[mission.id], '2026-07-22');
  }
});

test('rev21 aliases chain through reauthoring without accepting foreign or current-revision retired IDs', () => {
  const save = {
    version: 2, campaignId: campaign.id, campaignRevision: 21,
    unlockedMissionIds: [mission.id], recommendedMissionId: mission.id,
    recommendedWaveId: 'paywall-siege-checkpoint',
    missionRecords: { [mission.id]: { completedWaveIds: ['paywall-siege', 'paywall-siege-checkpoint'] } }
  };
  for (const progress of sanitizeBoth(save)) {
    assert.deepEqual(progress.missionRecords[mission.id].completedWaveIds, waves.slice(0, 3));
    assert.equal(progress.missionRecords[mission.id].completed, false);
  }
  assert.equal(resolveRevampWaveId(mission.id, 'stage-citation-storm-wave-1', waves, 24), null);
  assert.equal(resolveRevampWaveId(mission.id, `${mission.id}-wave-9999`, waves, 24), null);
  assert.equal(resolveRevampWaveId(mission.id, `${mission.id}-wave-1`, waves, 25), null);
});

test('shortened missions cannot turn an incomplete historical checkpoint into a rewarded clear', () => {
  const first = [...campaign.levels].sort((a, b) => a.order - b.order)[0];
  const currentWaves = [...first.waves].sort((a, b) => a.order - b.order).map((wave) => wave.id);
  const save = {
    version: 2, campaignId: campaign.id, campaignRevision: 21,
    unlockedMissionIds: [first.id], recommendedMissionId: first.id,
    recommendedWaveId: 'open-orbit-checkpoint',
    missionRecords: { [first.id]: { completedWaveIds: ['open-orbit', 'open-orbit-checkpoint'] } }
  };
  for (const progress of sanitizeBoth(save)) {
    assert.equal(progress.missionRecords[first.id].completed, false);
    assert.equal(progress.missionRecords[first.id].stars, 0);
    assert.deepEqual(progress.claimedRewardIds, []);
    assert.deepEqual(progress.missionRecords[first.id].completedWaveIds,
      currentWaves.slice(0, Math.min(3, currentWaves.length - 1)));
  }
});
