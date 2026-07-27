const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const {
  createWeeklyState,
  sanitizeWalletSnapshot
} = require('../api/_lib/walletProfiles');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
const campaign = require('../game-config/campaign.json');

const root = path.resolve(__dirname, '..');
const WALLET = '0x2222222222222222222222222222222222222222';
const PROFILE_ID = `wallet:${WALLET}`;
const CAMPAIGN_LEVELS = campaign.levels.slice().sort((left, right) => left.order - right.order);
const FIRST_MISSION = CAMPAIGN_LEVELS[0];
const SECOND_MISSION = CAMPAIGN_LEVELS[1];
const FIRST_WAVE = FIRST_MISSION.waves.slice().sort((left, right) => left.order - right.order)[0];
const SECOND_MISSION_WAVE = SECOND_MISSION.waves
  .slice()
  .sort((left, right) => left.order - right.order)[0];
const SECOND_MISSION_LAST_WAVE = SECOND_MISSION.waves
  .slice()
  .sort((left, right) => left.order - right.order)
  .at(-1);

test('wallet snapshots whitelist fields, normalize profile IDs, and strip minted ownership', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const weekKey = getWeeklyBoundaryMeta(new Date(now)).weekKey;
  const sanitized = sanitizeWalletSnapshot({
    unknownRoot: 'discard me',
    selectedShipId: 'bio',
    weeklyState: {
      version: 99,
      profileId: 'pilot:wrong-device',
      weekKey,
      coins: 42.8,
      unlockedSlots: { left: 1, right: false, admin: true },
      ownedMiniShips: {
        'citation-dart': 99,
        'not-a-real-ship': 5
      },
      equipped: { left: 'citation-dart', right: 'not-a-real-ship' },
      shipUpgrades: {
        researchhub: { fireRate: 999, speed: 999, startingHearts: -5 },
        bio: { fireRate: 3, speed: 2, startingHearts: 1 }
      },
      weeklyStats: { runs: 2, score: 3, enemiesDefeated: 4, coinsEarned: 5 },
      injected: { role: 'admin' }
    },
    permanentState: {
      profileId: 'pilot:wrong-device',
      mintedMiniShips: ['citation-dart', 'ledger-hammer'],
      cosmetics: [' cyan ', 123, 'gold'],
      weeklyArchive: [weekKey, 'not-a-week'],
      dailyGifts: { currentDay: 999, lastClaimDate: '2026-07-23' },
      lifetimeStats: {
        runs: 5,
        highestWave: 6,
        enemiesDefeated: 7,
        bossesDefeated: 8,
        coinsCollected: 9,
        bestScore: 10
      },
      achievementTiers: { 'boss-breaker': 99, injected: 99 },
      unlockedPlayerShips: ['eth', 'admin'],
      bossArchive: {
        unlockedEventIds: [
          'paywall-siege-gatekeeper',
          'open-orbit-gatekeeper',
          'paywall-siege-gatekeeper',
          'unknown-boss'
        ],
        seenEventIds: [
          'bastion-protocol-gatekeeper',
          'open-orbit-gatekeeper',
          123
        ]
      }
    },
    stats: { highScore: 10.9, totalCoins: 20.1, playerName: '  PILOT NAME THAT IS TOO LONG  ' }
  }, WALLET, now);

  assert.deepEqual(Object.keys(sanitized).sort(), [
    'permanentState',
    'selectedShipId',
    'stats',
    'weeklyState'
  ]);
  assert.equal(sanitized.weeklyState.profileId, PROFILE_ID);
  assert.equal(sanitized.permanentState.profileId, PROFILE_ID);
  assert.equal(sanitized.weeklyState.ownedMiniShips['citation-dart'], 5);
  assert.equal(sanitized.weeklyState.ownedMiniShips['not-a-real-ship'], undefined);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.fireRate, 21);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.speed, 7);
  assert.equal(sanitized.weeklyState.equipped.right, null);
  assert.equal('mintedMiniShips' in sanitized.permanentState, false);
  assert.deepEqual(sanitized.permanentState.unlockedPlayerShips, ['eth']);
  assert.deepEqual(sanitized.permanentState.achievementTiers, { 'boss-breaker': 5 });
  assert.deepEqual(sanitized.permanentState.bossArchive, {
    version: 1,
    unlockedEventIds: ['open-orbit-gatekeeper', 'paywall-siege-gatekeeper'],
    seenEventIds: ['open-orbit-gatekeeper'],
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: {
      utcDateKey: '2026-07-23',
      successfulClearsUsed: 0,
      processedClearIds: []
    }
  });
  assert.equal(sanitized.stats.playerName.length, 15);
  assert.equal(sanitized.selectedShipId, 'bio');
});

test('a stale weekly snapshot resets competition totals while preserving Hangar and Boss Archive progress', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const expected = createWeeklyState(PROFILE_ID, now);
  const sanitized = sanitizeWalletSnapshot({
    weeklyState: {
      ...expected,
      weekKey: '2026-07-12',
      coins: 999999,
      unlockedSlots: { left: true, right: true },
      ownedMiniShips: { 'citation-dart': 4, 'photon-manta': 3 },
      equipped: { left: 'citation-dart', right: 'photon-manta' },
      shipUpgrades: {
        ...expected.shipUpgrades,
        researchhub: { fireRate: 12, speed: 5, startingHearts: 3 },
        bio: { fireRate: 7, speed: 2, startingHearts: 1 }
      },
      weeklyStats: { runs: 8, score: 123456, enemiesDefeated: 900, coinsEarned: 999999 }
    },
    permanentState: {
      bossArchive: {
        unlockedEventIds: ['open-orbit-gatekeeper', 'paywall-siege-gatekeeper'],
        seenEventIds: ['open-orbit-gatekeeper']
      }
    }
  }, WALLET, now);

  assert.equal(sanitized.weeklyState.weekKey, expected.weekKey);
  assert.equal(sanitized.weeklyState.coins, 0);
  assert.deepEqual(sanitized.weeklyState.weeklyStats, expected.weeklyStats);
  assert.deepEqual(sanitized.weeklyState.unlockedSlots, { left: true, right: true });
  assert.deepEqual(sanitized.weeklyState.ownedMiniShips, {
    'citation-dart': 4,
    'photon-manta': 3
  });
  assert.deepEqual(sanitized.weeklyState.equipped, {
    left: 'citation-dart',
    right: 'photon-manta'
  });
  assert.deepEqual(sanitized.weeklyState.shipUpgrades.researchhub, {
    fireRate: 12,
    speed: 5,
    startingHearts: 3
  });
  assert.deepEqual(sanitized.permanentState.bossArchive, {
    version: 1,
    unlockedEventIds: ['open-orbit-gatekeeper', 'paywall-siege-gatekeeper'],
    seenEventIds: ['open-orbit-gatekeeper'],
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: {
      utcDateKey: '2026-07-23',
      successfulClearsUsed: 0,
      processedClearIds: []
    }
  });
});

test('legacy cloud snapshots infer Boss Archive unlocks before writing canonical arrays', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const sanitized = sanitizeWalletSnapshot({
    permanentState: {
      lifetimeStats: {
        highestWave: 4,
        bossesDefeated: 2
      }
    }
  }, WALLET, now);

  assert.deepEqual(sanitized.permanentState.bossArchive, {
    version: 1,
    unlockedEventIds: ['open-orbit-gatekeeper', 'paywall-siege-gatekeeper'],
    seenEventIds: [],
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: {
      utcDateKey: '2026-07-23',
      successfulClearsUsed: 0,
      processedClearIds: []
    }
  });
  assert.equal(sanitized.permanentState.campaignProgress.version, 1);
  assert.equal(sanitized.permanentState.campaignProgress.campaignId, campaign.id);
  assert.equal(sanitized.permanentState.campaignProgress.recommendedMissionId, CAMPAIGN_LEVELS[3].id);
  assert.equal(sanitized.permanentState.campaignProgress.recommendedWaveId, CAMPAIGN_LEVELS[3].waves[0].id);
  assert.deepEqual(
    sanitized.permanentState.campaignProgress.completedMissionIds,
    CAMPAIGN_LEVELS.slice(0, 3).map((level) => level.id)
  );
  assert.deepEqual(sanitized.weeklyState.creditedCampaignRewardIds, []);

  const fresh = sanitizeWalletSnapshot({}, WALLET, now);
  assert.equal(fresh.permanentState.campaignProgress.recommendedMissionId, FIRST_MISSION.id);
  assert.equal(fresh.permanentState.campaignProgress.recommendedWaveId, FIRST_WAVE.id);
  assert.deepEqual(fresh.permanentState.campaignProgress.completedMissionIds, []);
  assert.deepEqual(fresh.weeklyState.creditedCampaignRewardIds, []);
});

test('Campaign progress and reward receipts survive wallet sanitization with strict Mission-Wave pairing', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const weekKey = getWeeklyBoundaryMeta(new Date(now)).weekKey;
  const validRewardId = `campaign:${FIRST_MISSION.id}:first-clear`;
  const validResultId = 'campaign-result-valid';
  const sanitized = sanitizeWalletSnapshot({
    weeklyState: {
      weekKey,
      creditedCampaignRewardIds: [validRewardId, validRewardId, 'not-a-campaign-reward']
    },
    permanentState: {
      campaignProgress: {
        version: 99,
        campaignId: 'injected-campaign',
        campaignRevision: campaign.revision,
        recommendedMissionId: SECOND_MISSION.id,
        recommendedWaveId: SECOND_MISSION_LAST_WAVE.id,
        unlockedMissionIds: [FIRST_MISSION.id, SECOND_MISSION.id, 'unknown-mission'],
        unlockedWaveIdsByMission: {
          [FIRST_MISSION.id]: [FIRST_WAVE.id, SECOND_MISSION_WAVE.id, 'unknown-wave'],
          [SECOND_MISSION.id]: [SECOND_MISSION_WAVE.id, SECOND_MISSION_LAST_WAVE.id]
        },
        missionRecords: {
          [FIRST_MISSION.id]: {
            completedWaveIds: [FIRST_WAVE.id, SECOND_MISSION_WAVE.id],
            earnedStarIds: [`${FIRST_MISSION.id}:complete`, 'unknown-star'],
            bestScore: 321
          },
          'unknown-mission': { completed: true }
        },
        claimedRewardIds: [validRewardId, 'not-a-campaign-reward'],
        processedResultIds: [validResultId],
        completionRecords: [
          {
            resultId: validResultId,
            playerId: PROFILE_ID,
            campaignId: campaign.id,
            campaignRevision: campaign.revision,
            missionId: FIRST_MISSION.id,
            waveId: FIRST_WAVE.id,
            completedAt: '2026-07-23T18:00:00.000Z',
            stageComplete: false,
            firstClearGranted: false,
            coinsAwarded: 12,
            starsEarned: 0
          },
          {
            resultId: 'campaign-result-mismatched',
            missionId: FIRST_MISSION.id,
            waveId: SECOND_MISSION_WAVE.id
          },
          {
            resultId: 'campaign-result-unknown',
            missionId: 'unknown-mission',
            waveId: 'unknown-wave'
          }
        ],
        unviewedMissionIds: [SECOND_MISSION.id, 'unknown-mission'],
        unviewedStarMissionIds: [FIRST_MISSION.id, 'unknown-mission'],
        unviewedRewardIds: [validRewardId, 'not-a-campaign-reward']
      }
    }
  }, WALLET, now);

  const progress = sanitized.permanentState.campaignProgress;
  assert.deepEqual(sanitized.weeklyState.creditedCampaignRewardIds, [validRewardId]);
  assert.equal(progress.version, 1);
  assert.equal(progress.campaignId, campaign.id);
  assert.equal(progress.campaignRevision, campaign.revision);
  assert.equal(progress.recommendedMissionId, SECOND_MISSION.id);
  assert.equal(progress.recommendedWaveId, SECOND_MISSION_WAVE.id);
  assert.deepEqual(progress.unlockedMissionIds, [FIRST_MISSION.id, SECOND_MISSION.id]);
  assert.deepEqual(progress.unlockedWaveIdsByMission[FIRST_MISSION.id], [FIRST_WAVE.id]);
  assert.deepEqual(progress.unlockedWaveIdsByMission[SECOND_MISSION.id], [SECOND_MISSION_WAVE.id]);
  assert.deepEqual(progress.missionRecords[FIRST_MISSION.id].completedWaveIds, []);
  assert.deepEqual(progress.missionRecords[FIRST_MISSION.id].earnedStarIds, [`${FIRST_MISSION.id}:complete`]);
  assert.equal(progress.missionRecords[FIRST_MISSION.id].bestScore, 321);
  assert.deepEqual(progress.claimedRewardIds, [validRewardId]);
  assert.deepEqual(progress.processedResultIds, [validResultId]);
  assert.deepEqual(progress.completionRecords.map((record) => record.resultId), [validResultId]);
  assert.deepEqual(progress.unviewedMissionIds, [SECOND_MISSION.id]);
  assert.deepEqual(progress.unviewedStarMissionIds, [FIRST_MISSION.id]);
  assert.deepEqual(progress.unviewedRewardIds, [validRewardId]);

  const roundTripped = sanitizeWalletSnapshot(sanitized, WALLET, now + 1_000);
  assert.deepEqual(
    roundTripped.weeklyState.creditedCampaignRewardIds,
    sanitized.weeklyState.creditedCampaignRewardIds
  );
  assert.deepEqual(
    { ...roundTripped.permanentState.campaignProgress, updatedAt: null },
    { ...progress, updatedAt: null }
  );
});

test('wallet snapshots retain sanitized Boss Archive records, mastery, and UTC charges', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const sanitized = sanitizeWalletSnapshot({
    permanentState: {
      cosmetics: [
        'boss-archive:open-orbit-gatekeeper:badge',
        'boss-archive:open-orbit-gatekeeper:badge'
      ],
      bossArchive: {
        unlockedEventIds: ['open-orbit-gatekeeper'],
        seenEventIds: ['open-orbit-gatekeeper'],
        lastSelectedEventId: 'open-orbit-gatekeeper',
        records: {
          'open-orbit-gatekeeper': {
            attempts: 3,
            practiceAttempts: 1,
            challengeAttempts: 2,
            totalClears: 2,
            practiceClears: 1,
            challengeClears: 1,
            noHitClears: 1,
            bestClearTimeMs: 45000,
            bestChallengeTimeMs: 50000,
            bestNoHitTimeMs: 50000,
            mastery: {
              'challenge-clear': {
                completedAt: '2026-07-23T18:00:00.000Z',
                claimedAt: '2026-07-23T18:01:00.000Z'
              },
              injected: { completedAt: '2026-07-23T18:00:00.000Z' }
            },
            processedResultIds: ['receipt-1', 'receipt-1'],
            lastResult: {
              mode: 'challenge',
              victory: true,
              clearTimeMs: 50000,
              damageTaken: 0,
              playedAt: '2026-07-23T18:00:00.000Z'
            }
          },
          'unknown-boss': { attempts: 999 }
        },
        dailyChallenge: {
          utcDateKey: '2026-07-23',
          successfulClearsUsed: 2,
          processedClearIds: ['receipt-1']
        }
      }
    }
  }, WALLET, now);

  const archive = sanitized.permanentState.bossArchive;
  assert.equal(archive.lastSelectedEventId, 'open-orbit-gatekeeper');
  assert.equal(archive.dailyChallenge.successfulClearsUsed, 2);
  assert.deepEqual(archive.dailyChallenge.processedClearIds, ['receipt-1']);
  assert.equal(archive.records['open-orbit-gatekeeper'].challengeClears, 1);
  assert.equal(archive.records['open-orbit-gatekeeper'].mastery['challenge-clear'].claimedAt, '2026-07-23T18:01:00.000Z');
  assert.equal(archive.records['open-orbit-gatekeeper'].mastery.injected, undefined);
  assert.equal(archive.records['unknown-boss'], undefined);
  assert.deepEqual(sanitized.permanentState.cosmetics, [
    'boss-archive:open-orbit-gatekeeper:badge'
  ]);
});

test('wallet profile SQL is API-only with RLS and no public role grants', () => {
  const sql = fs.readFileSync(
    path.join(root, 'supabase', 'wallet-cloud-profiles.sql'),
    'utf8'
  );

  assert.match(sql, /create table if not exists public\.scicon_wallet_profiles/);
  assert.match(sql, /create table if not exists public\.scicon_wallet_profile_challenges/);
  assert.match(sql, /scicon_wallet_profiles enable row level security/);
  assert.match(sql, /scicon_wallet_profile_challenges enable row level security/);
  assert.match(sql, /revoke all on table public\.scicon_wallet_profiles[\s\S]*from anon, authenticated, public/);
  assert.match(sql, /grant select, insert, update, delete[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /create policy/i);
});

test('Boss Archive Challenge SQL settles rewards and daily charges atomically', () => {
  const sql = fs.readFileSync(
    path.join(root, 'supabase', 'wallet-cloud-profiles.sql'),
    'utf8'
  );

  assert.match(sql, /create table if not exists public\.scicon_boss_archive_challenge_results/);
  assert.match(sql, /primary key \(wallet_address, result_id\)/);
  assert.match(sql, /scicon_boss_archive_challenge_results enable row level security/);
  assert.match(
    sql,
    /revoke all on table public\.scicon_boss_archive_challenge_results[\s\S]*from anon, authenticated, public/
  );
  assert.match(sql, /create or replace function public\.scicon_settle_boss_archive_challenge/);
  assert.match(sql, /security invoker/);
  assert.match(
    sql,
    /from public\.scicon_wallet_profiles[\s\S]*where wallet_address = p_wallet_address[\s\S]*for update/
  );
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /v_utc_date := \(v_now at time zone 'UTC'\)::date/);
  assert.match(
    sql,
    /select count\(\*\)::integer into v_used[\s\S]*from public\.scicon_boss_archive_challenge_results[\s\S]*utc_date = v_utc_date/
  );
  assert.match(sql, /if v_used >= p_daily_limit then[\s\S]*boss_archive_no_charges/);
  assert.match(sql, /insert into public\.scicon_boss_archive_challenge_results/);
  assert.match(
    sql,
    /update public\.scicon_wallet_profiles[\s\S]*revision = revision \+ 1/
  );
  assert.match(
    sql,
    /revoke all on function public\.scicon_settle_boss_archive_challenge[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    sql,
    /grant execute on function public\.scicon_settle_boss_archive_challenge[\s\S]*to service_role/
  );
});

test('wallet profile API shares the existing mint-records Vercel function', () => {
  const vercel = JSON.parse(
    fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')
  );
  const mintRoute = fs.readFileSync(
    path.join(root, 'api', 'mint-records.js'),
    'utf8'
  );

  assert.deepEqual(vercel.rewrites[1], {
    source: '/api/wallet-profile',
    destination: '/api/mint-records?route=wallet-profile'
  });
  assert.match(mintRoute, /req\.query\?\.route === 'wallet-profile'/);
  assert.match(mintRoute, /walletProfileHandler\(req, res\)/);
});
