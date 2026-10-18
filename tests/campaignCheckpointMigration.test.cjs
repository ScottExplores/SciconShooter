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
    // I shortened this checkpoint Mission: two legacy checkpoints may not
    // become all three current Waves and silently grant a clear.
    assert.deepEqual(progress.missionRecords[mission.id].completedWaveIds, waves.slice(0, Math.min(3, waves.length - 1)));
    assert.equal(progress.missionRecords[mission.id].completed, false);
    assert.equal(progress.missionRecords[mission.id].stars, 0);
    assert.deepEqual(progress.claimedRewardIds, []);
  }
  assert.equal(resolveRevampWaveId(mission.id, 'stage-citation-storm-wave-1', waves, 24), null);
  assert.equal(resolveRevampWaveId(mission.id, `${mission.id}-wave-9999`, waves, 24), null);
  assert.equal(resolveRevampWaveId(mission.id, `${mission.id}-wave-1`, waves, 25), null);
});

test('rev25 unfinished dense-Mission checkpoints cannot acquire a clear from retained IDs', () => {
  assert.ok(campaign.revision >= 26, 'content reauthoring must advance the migration revision');
  const shortened = campaign.levels.filter(level => level.id !== 'operation-open-galaxy'
    && level.waves.some(wave => wave.id.includes('-revamp-')));
  assert.equal(shortened.length, 17);
  for (const level of shortened) {
    const currentIds = level.waves.map(wave => wave.id);
    for (const completed of [undefined, false]) {
      const record = { completedWaveIds: currentIds, bestScore: 456 };
      if (completed !== undefined) record.completed = completed;
      const save = {
        version: 4, campaignId: campaign.id, campaignRevision: 25,
        unlockedMissionIds: [level.id], recommendedMissionId: level.id,
        missionRecords: { [level.id]: record }, claimedRewardIds: [], processedResultIds: ['prior-result']
      };
      for (const progress of sanitizeBoth(save)) {
        const migrated = progress.missionRecords[level.id];
        assert.deepEqual(migrated.completedWaveIds, currentIds.slice(0, -1), level.id);
        assert.equal(migrated.completed, false, level.id);
        assert.equal(migrated.stars, 0, level.id);
        assert.deepEqual(migrated.earnedStarIds, []);
        assert.equal(migrated.bestScore, 456);
        assert.deepEqual(progress.claimedRewardIds, []);
        assert.deepEqual(progress.processedResultIds, ['prior-result']);
        for (const resanitized of sanitizeBoth(progress)) {
          assert.deepEqual(resanitized.missionRecords[level.id], migrated, 'migration remains stable after revision advances');
        }
      }
    }
  }
});

test('rev25 exact retired IDs migrate only within their Mission and revision', () => {
  assert.equal(resolveRevampWaveId(mission.id, `${mission.id}-revamp-wave-6`, waves, 25), waves.at(-1));
  for (const invalid of ['stage-citation-storm-revamp-wave-6', `${mission.id}-revamp-wave-7`, `${mission.id}-wave-1`]) {
    assert.equal(resolveRevampWaveId(mission.id, invalid, waves, 25), null);
  }
  assert.equal(resolveRevampWaveId(mission.id, `${mission.id}-revamp-wave-6`, waves, campaign.revision), null);
  for (const completed of [undefined, false]) {
    const record = { completedWaveIds: [1, 2, 3, 4].map(index => `${mission.id}-revamp-wave-${index}`) };
    if (completed !== undefined) record.completed = completed;
    for (const progress of sanitizeBoth({ version: 4, campaignId: campaign.id, campaignRevision: 25,
      missionRecords: { [mission.id]: record }, recommendedMissionId: mission.id,
      recommendedWaveId: `${mission.id}-revamp-wave-5` })) {
      assert.deepEqual(progress.missionRecords[mission.id].completedWaveIds, waves.slice(0, -1));
      assert.equal(progress.missionRecords[mission.id].completed, false);
      assert.equal(progress.missionRecords[mission.id].stars, 0);
      assert.deepEqual(progress.claimedRewardIds, []);
    }
  }
});

test('explicit clears and settled receipts survive rev25 reauthoring; explicit unfinished current saves remain unfinished', () => {
  for (const revision of [25, campaign.revision]) {
    for (const completed of [true, false]) {
      const save = {
        version: 4, campaignId: campaign.id, campaignRevision: revision,
        unlockedMissionIds: [mission.id], recommendedMissionId: mission.id,
        missionRecords: { [mission.id]: { completedWaveIds: waves, completed, stars: completed ? 2 : 0 } },
        claimedRewardIds: completed ? [`campaign:${mission.id}:first-clear`] : [],
        processedResultIds: ['settled-result'], replayRewardEpochByMission: { [mission.id]: '2026-07-22' }
      };
      for (const progress of sanitizeBoth(save)) {
        assert.equal(progress.missionRecords[mission.id].completed, completed);
        assert.deepEqual(progress.missionRecords[mission.id].completedWaveIds, completed ? waves : waves.slice(0, -1));
        assert.equal(progress.missionRecords[mission.id].stars, completed ? 2 : 0);
        assert.deepEqual(progress.claimedRewardIds, save.claimedRewardIds);
        assert.deepEqual(progress.processedResultIds, save.processedResultIds);
        assert.equal(progress.replayRewardEpochByMission[mission.id], '2026-07-22');
      }
    }
  }
});

test('fully completed historical wave lists retain clears when the optional completed flag was absent', () => {
  for (const [id, suffixes] of [
    ['operation-open-galaxy', ['wave-1']],
    ['stage-citation-storm', ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6']],
    ['stage-paywall-siege', ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6']],
    ['stage-bastion-protocol', ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'boss-wave']]
  ]) {
    const level = campaign.levels.find(level => level.id === id);
    const oldIds = suffixes.map(suffix => `${level.id}-revamp-${suffix}`);
    const save = {
      version: 4, campaignId: campaign.id, campaignRevision: 25,
      missionRecords: { [level.id]: { completedWaveIds: oldIds } }
    };
    for (const progress of sanitizeBoth(save)) {
      assert.equal(progress.missionRecords[level.id].completed, true);
      assert.deepEqual(progress.missionRecords[level.id].completedWaveIds, level.waves.map(wave => wave.id));
    }
  }
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
