const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const {
  createWeeklyState,
  mergeCampaignGraphProgress,
  preserveAchievementServerState,
  preserveCampaignBranchServerState,
  sanitizeCampaignBranchProgress,
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
const CAMPAIGN_GRAPH = campaign.campaignGraph;
const GRAPH_ENTRY = CAMPAIGN_GRAPH.nodes.find((node) => node.nodeId === CAMPAIGN_GRAPH.entryNodeId);
const GRAPH_ROUTE_TARGETS = GRAPH_ENTRY.outgoingEdges.map((edge) => edge.toNodeId);
const GRAPH_ROUTE_A = CAMPAIGN_GRAPH.nodes.find((node) => node.nodeId === GRAPH_ROUTE_TARGETS[0]);
const GRAPH_ROUTE_B = CAMPAIGN_GRAPH.nodes.find((node) => node.nodeId === GRAPH_ROUTE_TARGETS[1]);
const FIRST_BOSS_EVENT_ID = campaign.levels
  .flatMap((level) => level.waves.flatMap((wave) => wave.events))
  .find((event) => event.kind === 'boss' && event.bossId === campaign.sectors[0].majorBossId).id;
const TEST_BRANCHES = [{
  branchId: 'wallet-test-supply-cache',
  sourceMissionId: FIRST_MISSION.id,
  unlockCondition: { kind: 'all-stars-earned', missionId: FIRST_MISSION.id },
  requiredStars: 3,
  oneTimeCompletion: true,
  replayPolicy: 'no-replay-after-claim'
}];

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
      durableCampaignCoins: 999,
      unlockedSlots: { left: 1, right: false, admin: true },
      ownedMiniShips: {
        'citation-dart': 99,
        'not-a-real-ship': 5
      },
      equipped: { left: 'citation-dart', right: 'not-a-real-ship' },
      shipUpgrades: {
        researchhub: { fireRate: 999, speed: 999, ability: 999, startingHearts: -5 },
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
      achievementTiers: {
        'boss-breaker': 99,
        'elite-hunter': 3,
        'hangar-engineer': 2,
        injected: 99
      },
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
  assert.equal(sanitized.weeklyState.coins, 42);
  assert.equal(sanitized.weeklyState.durableCampaignCoins, 42);
  assert.equal(sanitized.permanentState.profileId, PROFILE_ID);
  assert.equal(sanitized.weeklyState.ownedMiniShips['citation-dart'], 5);
  assert.equal(sanitized.weeklyState.ownedMiniShips['not-a-real-ship'], undefined);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.fireRate, 49);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.speed, 7);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.ability, 6);
  assert.equal(sanitized.weeklyState.equipped.right, null);
  assert.equal('mintedMiniShips' in sanitized.permanentState, false);
  assert.deepEqual(sanitized.permanentState.unlockedPlayerShips, ['eth']);
  assert.deepEqual(sanitized.permanentState.achievementTiers, {
    'boss-breaker': 5,
    'elite-hunter': 3,
    'hangar-engineer': 2
  });
  assert.deepEqual(sanitized.permanentState.bossArchive, {
    version: 2,
    unlockedEventIds: [FIRST_BOSS_EVENT_ID],
    seenEventIds: [FIRST_BOSS_EVENT_ID],
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: {
      utcDateKey: '2026-07-23',
      successfulClearsUsed: 0,
      processedClearIds: []
    },
    dailyAttempts: {
      utcDateKey: '2026-07-23',
      attemptsUsed: 0,
      processedAttemptIds: []
    }
  });
  assert.equal(sanitized.stats.playerName.length, 15);
  assert.equal(sanitized.selectedShipId, 'bio');

  const negativeDurableBalance = sanitizeWalletSnapshot({
    weeklyState: { weekKey, coins: 100, durableCampaignCoins: -25 }
  }, WALLET, now);
  assert.equal(negativeDurableBalance.weeklyState.coins, 100);
  assert.equal(negativeDurableBalance.weeklyState.durableCampaignCoins, 0);
});

test('the cloud achievement whitelist stays in parity with every Reward Center track', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const rewardSource = fs.readFileSync(
    path.join(root, 'services', 'rewardProgression.ts'),
    'utf8'
  );
  const definitions = rewardSource.match(
    /export const ACHIEVEMENT_DEFINITIONS:[\s\S]*?= \[([\s\S]*?)\n\];/
  );
  assert.ok(definitions, 'achievement definitions must remain discoverable');
  const achievementIds = [...definitions[1].matchAll(/\bid: '([^']+)'/g)]
    .map((match) => match[1]);
  assert.ok(achievementIds.length > 0);

  const sanitized = sanitizeWalletSnapshot({
    permanentState: {
      achievementTiers: Object.fromEntries(achievementIds.map((id) => [id, 1]))
    }
  }, WALLET, now);

  assert.deepEqual(
    Object.keys(sanitized.permanentState.achievementTiers),
    achievementIds,
    'a cloud save must not strip a client-authored achievement track'
  );
});

test('cloud reconciliation never rolls achievement claims or lifetime counters backward', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const current = sanitizeWalletSnapshot({
    permanentState: {
      lifetimeStats: {
        runs: 8,
        highestWave: 12,
        enemiesDefeated: 900,
        bossesDefeated: 6,
        coinsCollected: 1200,
        bestScore: 5000,
        campaignMissionsCleared: 11,
        campaignMissionsMastered: 4,
        eliteBossesDefeated: 7,
        weeklyRunsCompleted: 2,
        weeklyBestSector: 4,
        hangarUpgradesPurchased: 9
      },
      achievementTiers: {
        'boss-breaker': 2,
        'elite-hunter': 3,
        'campaign-cartographer': 1
      }
    }
  }, WALLET, now);
  const incoming = structuredClone(current);
  incoming.permanentState.lifetimeStats.bossesDefeated = 1;
  incoming.permanentState.lifetimeStats.eliteBossesDefeated = 2;
  incoming.permanentState.lifetimeStats.weeklyBestSector = 6;
  incoming.permanentState.achievementTiers['boss-breaker'] = 0;
  incoming.permanentState.achievementTiers['elite-hunter'] = 1;
  incoming.permanentState.achievementTiers['deep-sector'] = 2;

  const protectedSnapshot = preserveAchievementServerState({
    currentSnapshot: current,
    incomingSnapshot: incoming
  });

  assert.equal(protectedSnapshot.permanentState.lifetimeStats.bossesDefeated, 6);
  assert.equal(protectedSnapshot.permanentState.lifetimeStats.eliteBossesDefeated, 7);
  assert.equal(protectedSnapshot.permanentState.lifetimeStats.weeklyBestSector, 6);
  assert.deepEqual(protectedSnapshot.permanentState.achievementTiers, {
    'boss-breaker': 2,
    'campaign-cartographer': 1,
    'elite-hunter': 3,
    'deep-sector': 2
  });
});

test('a stale weekly snapshot resets competition totals while preserving Hangar and Boss Archive progress', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const expected = createWeeklyState(PROFILE_ID, now);
  const sanitized = sanitizeWalletSnapshot({
    weeklyState: {
      ...expected,
      weekKey: '2026-07-12',
      coins: 999999,
      durableCampaignCoins: 275,
      unlockedSlots: { left: true, right: true },
      ownedMiniShips: { 'citation-dart': 4, 'photon-manta': 3 },
      equipped: { left: 'citation-dart', right: 'photon-manta' },
      shipUpgrades: {
        ...expected.shipUpgrades,
        researchhub: { fireRate: 12, speed: 5, ability: 0, startingHearts: 3 },
        bio: { fireRate: 7, speed: 2, ability: 0, startingHearts: 1 }
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
  assert.equal(sanitized.weeklyState.coins, 275);
  assert.equal(sanitized.weeklyState.durableCampaignCoins, 275);
  assert.deepEqual(sanitized.weeklyState.weeklyStats, expected.weeklyStats);
  assert.equal(sanitized.weeklyState.weeklyCampaignStreak, null);
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
    ability: 0,
    startingHearts: 3
  });
  assert.deepEqual(sanitized.permanentState.bossArchive, {
    version: 2,
    unlockedEventIds: [FIRST_BOSS_EVENT_ID],
    seenEventIds: [FIRST_BOSS_EVENT_ID],
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: {
      utcDateKey: '2026-07-23',
      successfulClearsUsed: 0,
      processedClearIds: []
    },
    dailyAttempts: {
      utcDateKey: '2026-07-23',
      attemptsUsed: 0,
      processedAttemptIds: []
    }
  });
});

test('wallet snapshots preserve the current Weekly Campaign Streak and recompute its score', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const event = {
    eventId: 'weekly-wallet-event',
    nodeId: GRAPH_ENTRY.nodeId,
    occurredAtMs: now - 1_000,
    outcome: {
      regularEnemyKills: 1,
      eliteKills: 0,
      wavesCleared: GRAPH_ENTRY.routeSummary.estimatedWaveCount,
      miniBossKills: 0,
      majorBossKills: 0,
      missionCompleted: true,
      damageTaken: 0,
      livesRemaining: 3,
      accuracy: null,
      elapsedMs: null,
      parTimeMs: null,
      performanceStars: 1
    },
    breakdown: { totalPoints: 999999999 }
  };
  const sanitized = sanitizeWalletSnapshot({
    weeklyState: {
      weekKey: boundary.weekKey,
      weeklyCampaignStreak: {
        schemaVersion: 1,
        revision: 2,
        weeklyId: boundary.weekKey,
        resetAtMs: boundary.endsAt.getTime(),
        startNodeId: GRAPH_ENTRY.nodeId,
        currentNodeId: GRAPH_ENTRY.nodeId,
        committedRoutes: [],
        visitedNodeIds: [GRAPH_ENTRY.nodeId],
        scoredNodeIds: [GRAPH_ENTRY.nodeId],
        scoreEvents: [event],
        score: { totalPoints: 999999999 },
        finalization: { status: 'active', submissionStatus: 'not-ready' },
        createdAtMs: now - 2_000,
        updatedAtMs: now - 1_000
      }
    }
  }, WALLET, now);

  const streak = sanitized.weeklyState.weeklyCampaignStreak;
  assert.equal(streak.weeklyId, boundary.weekKey);
  assert.deepEqual(streak.visitedNodeIds, [GRAPH_ENTRY.nodeId]);
  // 2322 after the surge waves: the server recompute scores waves cleared,
  // and the entry Mission now runs six of them.
  assert.equal(streak.score.totalPoints, 2322);
  assert.equal(streak.scoreEvents[0].breakdown.totalPoints, 2322);
  assert.equal(streak.finalization.status, 'active');
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
    version: 2,
    unlockedEventIds: [FIRST_BOSS_EVENT_ID],
    seenEventIds: [],
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: {
      utcDateKey: '2026-07-23',
      successfulClearsUsed: 0,
      processedClearIds: []
    },
    dailyAttempts: {
      utcDateKey: '2026-07-23',
      attemptsUsed: 0,
      processedAttemptIds: []
    }
  });
  assert.equal(sanitized.permanentState.campaignProgress.version, 4);
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
  assert.equal(fresh.weeklyState.durableCampaignCoins, 0);
});

test('cloud branch migration unlocks prior three-star mastery without inventing completion', () => {
  const now = Date.UTC(2026, 6, 27, 19);
  const migrated = sanitizeCampaignBranchProgress(
    undefined,
    { [FIRST_MISSION.id]: { stars: 3 } },
    now,
    TEST_BRANCHES
  );

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.unlockedBranchIds, ['wallet-test-supply-cache']);
  assert.deepEqual(migrated.newBranchIds, ['wallet-test-supply-cache']);
  assert.deepEqual(migrated.completedBranchIds, []);
  assert.deepEqual(migrated.claimedBranchIds, []);
  assert.deepEqual(migrated.attemptReceipts, []);
});

test('cloud branch sanitizer and revision merge preserve one-time receipts without duplicate IDs', () => {
  const now = Date.UTC(2026, 6, 27, 19);
  const claimed = sanitizeCampaignBranchProgress({
    unlockedBranchIds: ['wallet-test-supply-cache', 'injected-branch'],
    completedBranchIds: ['wallet-test-supply-cache'],
    claimedBranchIds: ['wallet-test-supply-cache'],
    processedAttemptIds: ['branch-attempt-1', 'branch-attempt-1'],
    claimedRewardReceiptIds: ['campaign-branch:receipt-1', 'campaign-branch:receipt-1'],
    attemptReceipts: [{
      attemptId: 'branch-attempt-1',
      branchId: 'wallet-test-supply-cache',
      playerId: PROFILE_ID,
      outcome: 'success',
      presentsDestroyed: 20,
      coinsCalculated: 275,
      coinsAwarded: 275,
      completedAt: '2026-07-27T18:00:00.000Z',
      rewardReceiptId: 'campaign-branch:receipt-1',
      claimed: true
    }, {
      attemptId: 'injected-attempt',
      branchId: 'injected-branch',
      playerId: PROFILE_ID,
      outcome: 'success',
      coinsAwarded: 999999,
      rewardReceiptId: 'campaign-branch:injected',
      claimed: true
    }, {
      attemptId: 'malformed-success',
      branchId: 'wallet-test-supply-cache',
      playerId: PROFILE_ID,
      outcome: 'success',
      coinsAwarded: 999999,
      completedAt: '2026-07-27T18:05:00.000Z',
      claimed: true
    }]
  }, { [FIRST_MISSION.id]: { stars: 3 } }, now, TEST_BRANCHES);

  assert.deepEqual(claimed.unlockedBranchIds, ['wallet-test-supply-cache']);
  assert.deepEqual(claimed.completedBranchIds, ['wallet-test-supply-cache']);
  assert.deepEqual(claimed.claimedBranchIds, ['wallet-test-supply-cache']);
  assert.deepEqual(claimed.processedAttemptIds, ['branch-attempt-1']);
  assert.deepEqual(claimed.claimedRewardReceiptIds, ['campaign-branch:receipt-1']);
  assert.equal(claimed.attemptReceipts.length, 1);

  const currentSnapshot = {
    weeklyState: {
      creditedCampaignRewardIds: [
        'campaign:cloud-credit',
        'campaign-branch:canonical-credit'
      ]
    },
    permanentState: {
      campaignProgress: {
        missionRecords: { [FIRST_MISSION.id]: { stars: 3 } },
        replayRewardEpochByMission: { [FIRST_MISSION.id]: '2026-07-27' },
        branchProgress: claimed
      }
    }
  };
  const incomingSnapshot = {
    weeklyState: {
      creditedCampaignRewardIds: [
        'campaign:device-credit',
        'campaign-branch:forged-device-credit'
      ]
    },
    stats: {},
    selectedShipId: 'researchhub',
    permanentState: {
      campaignProgress: {
        missionRecords: { [FIRST_MISSION.id]: { stars: 3 } },
        replayRewardEpochByMission: { [FIRST_MISSION.id]: '2026-07-26' },
        branchProgress: {
          unlockedBranchIds: ['wallet-test-supply-cache'],
          attemptReceipts: []
        }
      }
    }
  };
  const merged = preserveCampaignBranchServerState({
    currentSnapshot,
    incomingSnapshot,
    now: now + 1_000,
    branchDefinitions: TEST_BRANCHES
  });
  const roundTripped = merged.permanentState.campaignProgress.branchProgress;
  assert.equal(roundTripped.version, 2);
  assert.deepEqual(roundTripped.claimedBranchIds, ['wallet-test-supply-cache']);
  assert.deepEqual(roundTripped.processedAttemptIds, ['branch-attempt-1']);
  assert.deepEqual(roundTripped.claimedRewardReceiptIds, ['campaign-branch:receipt-1']);
  assert.equal(roundTripped.attemptReceipts.length, 1);
  assert.deepEqual(merged.permanentState.campaignProgress.replayRewardEpochByMission, {
    [FIRST_MISSION.id]: '2026-07-27'
  });
  assert.deepEqual(merged.weeklyState.creditedCampaignRewardIds, [
    'campaign:cloud-credit',
    'campaign:device-credit',
    'campaign-branch:canonical-credit'
  ]);
});

test('Campaign progress and reward receipts survive wallet sanitization with strict Mission-Wave pairing', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const weekKey = getWeeklyBoundaryMeta(new Date(now)).weekKey;
  const validRewardId = `campaign:${FIRST_MISSION.id}:first-clear`;
  const validBranchRewardId = 'campaign-branch:wallet-test-supply-cache:receipt-1';
  const validResultId = 'campaign-result-valid';
  const sanitized = sanitizeWalletSnapshot({
    weeklyState: {
      weekKey,
      coins: 180,
      durableCampaignCoins: 120,
      creditedCampaignRewardIds: [
        validRewardId,
        validRewardId,
        validBranchRewardId,
        'not-a-campaign-reward'
      ]
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
        claimedRewardIds: [
          validRewardId,
          `campaign:${FIRST_MISSION.id}:replay:2026-07-23:wave`,
          'not-a-campaign-reward'
        ],
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
  assert.deepEqual(
    sanitized.weeklyState.creditedCampaignRewardIds,
    [validRewardId, validBranchRewardId]
  );
  assert.equal(progress.version, 4);
  assert.equal(progress.campaignId, campaign.id);
  assert.equal(progress.campaignRevision, campaign.revision);
  assert.equal(progress.recommendedMissionId, SECOND_MISSION.id);
  assert.equal(progress.recommendedWaveId, SECOND_MISSION_WAVE.id);
  assert.deepEqual(progress.unlockedMissionIds, [FIRST_MISSION.id, SECOND_MISSION.id]);
  assert.deepEqual(
    progress.unlockedWaveIdsByMission[FIRST_MISSION.id],
    FIRST_MISSION.waves.slice().sort((left, right) => left.order - right.order).slice(0, 2).map((wave) => wave.id)
  );
  assert.deepEqual(progress.unlockedWaveIdsByMission[SECOND_MISSION.id], [SECOND_MISSION_WAVE.id]);
  assert.deepEqual(progress.missionRecords[FIRST_MISSION.id].completedWaveIds, [FIRST_WAVE.id]);
  assert.deepEqual(progress.missionRecords[FIRST_MISSION.id].earnedStarIds, []);
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
  assert.equal(roundTripped.weeklyState.coins, 180);
  assert.equal(roundTripped.weeklyState.durableCampaignCoins, 120);
  assert.deepEqual(
    {
      ...roundTripped.permanentState.campaignProgress,
      branchProgress: {
        ...roundTripped.permanentState.campaignProgress.branchProgress,
        updatedAt: null
      },
      updatedAt: null
    },
    {
      ...progress,
      branchProgress: { ...progress.branchProgress, updatedAt: null },
      updatedAt: null
    }
  );
});

test('Campaign v4 graph checkpoints and direct route choices survive a wallet save-load round trip', () => {
  const now = Date.UTC(2026, 6, 28, 19);
  const snapshot = sanitizeWalletSnapshot({
    permanentState: {
      campaignProgress: {
        version: 4,
        campaignId: campaign.id,
        campaignRevision: campaign.revision,
        recommendedMissionId: GRAPH_ROUTE_B.missionDefinitionId,
        recommendedWaveId: CAMPAIGN_LEVELS.find((level) => (
          level.id === GRAPH_ROUTE_B.missionDefinitionId
        )).waves[0].id,
        recommendedGraphNodeId: GRAPH_ROUTE_B.nodeId,
        currentGraphNodeId: GRAPH_ROUTE_B.nodeId,
        furthestMainGraphNodeId: GRAPH_ENTRY.nodeId,
        unlockedGraphNodeIds: [
          GRAPH_ENTRY.nodeId,
          GRAPH_ROUTE_A.nodeId,
          GRAPH_ROUTE_B.nodeId,
          'unknown-node'
        ],
        completedGraphNodeIds: [GRAPH_ENTRY.nodeId, 'unknown-node'],
        selectedRouteTargetBySourceNodeId: {
          [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_B.nodeId,
          'unknown-source': GRAPH_ROUTE_A.nodeId
        },
        pendingRouteChoice: {
          sourceNodeId: 'unknown-source',
          optionNodeIds: ['unknown-node']
        },
        unlockedMissionIds: [
          GRAPH_ENTRY.missionDefinitionId,
          GRAPH_ROUTE_A.missionDefinitionId,
          GRAPH_ROUTE_B.missionDefinitionId
        ],
        completedMissionIds: [GRAPH_ENTRY.missionDefinitionId],
        missionRecords: {
          [GRAPH_ENTRY.missionDefinitionId]: { completed: true }
        }
      }
    }
  }, WALLET, now);
  const progress = snapshot.permanentState.campaignProgress;

  assert.equal(progress.version, 4);
  assert.equal(progress.recommendedGraphNodeId, GRAPH_ROUTE_B.nodeId);
  assert.equal(progress.currentGraphNodeId, GRAPH_ROUTE_B.nodeId);
  assert.equal(progress.furthestMainGraphNodeId, GRAPH_ENTRY.nodeId);
  assert.deepEqual(progress.completedGraphNodeIds, [GRAPH_ENTRY.nodeId]);
  assert.deepEqual(progress.unlockedGraphNodeIds.slice(0, 3), [
    GRAPH_ENTRY.nodeId,
    GRAPH_ROUTE_A.nodeId,
    GRAPH_ROUTE_B.nodeId
  ]);
  assert.equal(progress.unlockedGraphNodeIds.includes('unknown-node'), false);
  assert.deepEqual(progress.selectedRouteTargetBySourceNodeId, {
    [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_B.nodeId
  });
  assert.equal(progress.pendingRouteChoice, null);

  const loaded = sanitizeWalletSnapshot(snapshot, WALLET, now + 1_000)
    .permanentState.campaignProgress;
  assert.deepEqual(
    { ...loaded, branchProgress: { ...loaded.branchProgress, updatedAt: null }, updatedAt: null },
    { ...progress, branchProgress: { ...progress.branchProgress, updatedAt: null }, updatedAt: null }
  );
});

test('Campaign v3 migration infers only an unambiguous authored route and rejects unknown graph IDs', () => {
  const now = Date.UTC(2026, 6, 28, 19);
  const routeAMission = CAMPAIGN_LEVELS.find((level) => level.id === GRAPH_ROUTE_A.missionDefinitionId);
  const migrated = sanitizeWalletSnapshot({
    permanentState: {
      campaignProgress: {
        version: 3,
        campaignId: campaign.id,
        campaignRevision: 22,
        recommendedMissionId: routeAMission.id,
        recommendedWaveId: routeAMission.waves[0].id,
        unlockedMissionIds: [GRAPH_ENTRY.missionDefinitionId, routeAMission.id],
        completedMissionIds: [GRAPH_ENTRY.missionDefinitionId],
        missionRecords: {
          [GRAPH_ENTRY.missionDefinitionId]: { completed: true }
        },
        recommendedGraphNodeId: 'unknown-node',
        currentGraphNodeId: 'unknown-node',
        completedGraphNodeIds: ['unknown-node']
      }
    }
  }, WALLET, now).permanentState.campaignProgress;

  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.completedGraphNodeIds, [GRAPH_ENTRY.nodeId]);
  assert.deepEqual(migrated.selectedRouteTargetBySourceNodeId, {
    [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_A.nodeId
  });
  assert.equal(migrated.pendingRouteChoice, null);
  assert.equal(migrated.recommendedGraphNodeId, GRAPH_ROUTE_A.nodeId);
  assert.equal(migrated.currentGraphNodeId, GRAPH_ROUTE_A.nodeId);
  assert.equal(migrated.unlockedGraphNodeIds.includes('unknown-node'), false);

  const undecided = sanitizeWalletSnapshot({
    permanentState: {
      campaignProgress: {
        version: 3,
        campaignRevision: 22,
        recommendedMissionId: GRAPH_ENTRY.missionDefinitionId,
        unlockedMissionIds: [GRAPH_ENTRY.missionDefinitionId],
        completedMissionIds: [GRAPH_ENTRY.missionDefinitionId],
        missionRecords: {
          [GRAPH_ENTRY.missionDefinitionId]: { completed: true }
        }
      }
    }
  }, WALLET, now).permanentState.campaignProgress;
  assert.deepEqual(undecided.selectedRouteTargetBySourceNodeId, {});
  assert.deepEqual(undecided.pendingRouteChoice, {
    sourceNodeId: GRAPH_ENTRY.nodeId,
    optionNodeIds: GRAPH_ROUTE_TARGETS
  });
});

test('Campaign graph merge keeps committed cloud routes and unions known cross-device checkpoints', () => {
  const now = Date.UTC(2026, 6, 28, 19);
  const base = {
    version: 4,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    recommendedMissionId: GRAPH_ROUTE_B.missionDefinitionId,
    recommendedGraphNodeId: GRAPH_ROUTE_B.nodeId,
    currentGraphNodeId: GRAPH_ROUTE_B.nodeId,
    furthestMainGraphNodeId: GRAPH_ENTRY.nodeId,
    unlockedMissionIds: [GRAPH_ENTRY.missionDefinitionId, GRAPH_ROUTE_B.missionDefinitionId],
    completedMissionIds: [GRAPH_ENTRY.missionDefinitionId],
    missionRecords: { [GRAPH_ENTRY.missionDefinitionId]: { completed: true } },
    unlockedGraphNodeIds: [GRAPH_ENTRY.nodeId, GRAPH_ROUTE_B.nodeId],
    completedGraphNodeIds: [GRAPH_ENTRY.nodeId],
    selectedRouteTargetBySourceNodeId: { [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_B.nodeId }
  };
  const merged = mergeCampaignGraphProgress({
    currentProgress: base,
    incomingProgress: {
      ...base,
      recommendedMissionId: GRAPH_ROUTE_A.missionDefinitionId,
      recommendedGraphNodeId: GRAPH_ROUTE_A.nodeId,
      currentGraphNodeId: GRAPH_ROUTE_A.nodeId,
      unlockedMissionIds: [GRAPH_ENTRY.missionDefinitionId, GRAPH_ROUTE_A.missionDefinitionId],
      unlockedGraphNodeIds: [GRAPH_ENTRY.nodeId, GRAPH_ROUTE_A.nodeId, 'unknown-node'],
      selectedRouteTargetBySourceNodeId: {
        [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_A.nodeId,
        'unknown-source': 'unknown-node'
      }
    },
    lifetimeStats: {},
    now
  });

  assert.equal(merged.version, 4);
  assert.equal(merged.unlockedGraphNodeIds.includes(GRAPH_ROUTE_A.nodeId), true);
  assert.equal(merged.unlockedGraphNodeIds.includes(GRAPH_ROUTE_B.nodeId), true);
  assert.equal(merged.unlockedGraphNodeIds.includes('unknown-node'), false);
  assert.deepEqual(merged.selectedRouteTargetBySourceNodeId, {
    [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_B.nodeId
  });
  assert.equal(merged.currentGraphNodeId, GRAPH_ROUTE_A.nodeId);
});

test('Campaign wallet merge preserves monotonic Mission state and bounded idempotency receipts', () => {
  const now = Date.UTC(2026, 6, 28, 19);
  const entryMission = CAMPAIGN_LEVELS.find((level) => (
    level.id === GRAPH_ENTRY.missionDefinitionId
  ));
  const entryWaveIds = entryMission.waves
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((wave) => wave.id);
  const starIds = entryMission.campaignProgression.masteryObjectives.map((objective) => objective.id);
  const cloudRewardIds = Array.from(
    { length: 768 },
    (_, index) => `campaign:cloud-reward:${index}`
  );
  const deviceRewardIds = [
    ...cloudRewardIds.slice(-384),
    ...Array.from({ length: 384 }, (_, index) => `campaign:device-reward:${index}`)
  ];
  const cloudResultIds = Array.from({ length: 384 }, (_, index) => `cloud-result-${index}`);
  const deviceResultIds = [
    ...cloudResultIds.slice(-192),
    ...Array.from({ length: 192 }, (_, index) => `device-result-${index}`)
  ];
  const completionRecord = (resultId, offsetSeconds) => ({
    resultId,
    playerId: PROFILE_ID,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    missionId: entryMission.id,
    waveId: entryWaveIds[0],
    completedAt: new Date(now + offsetSeconds * 1_000).toISOString(),
    stageComplete: false,
    firstClearGranted: false,
    masteryEligible: false,
    coinsAwarded: 1,
    starsEarned: 0
  });
  const cloudCompletionRecords = Array.from(
    { length: 96 },
    (_, index) => completionRecord(`cloud-completion-${index}`, index)
  );
  const deviceCompletionRecords = [
    ...cloudCompletionRecords.slice(-48),
    ...Array.from(
      { length: 48 },
      (_, index) => completionRecord(`device-completion-${index}`, 96 + index)
    )
  ];
  const currentProgress = {
    version: 4,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    recommendedMissionId: entryMission.id,
    recommendedGraphNodeId: GRAPH_ENTRY.nodeId,
    currentGraphNodeId: GRAPH_ENTRY.nodeId,
    furthestMainGraphNodeId: GRAPH_ENTRY.nodeId,
    unlockedMissionIds: [entryMission.id],
    unlockedWaveIdsByMission: { [entryMission.id]: entryWaveIds },
    completedMissionIds: [entryMission.id],
    missionRecords: {
      [entryMission.id]: {
        completed: true,
        completedWaveIds: entryWaveIds,
        stars: 2,
        earnedStarIds: starIds.slice(0, 2),
        bestScore: 900,
        bestClearTimeMs: 60_000,
        bestDamageTaken: 2,
        bestCoinsCollected: 75,
        firstCompletedAt: '2026-07-25T18:00:00.000Z',
        lastCompletedAt: '2026-07-28T18:00:00.000Z',
        completionCount: 7
      }
    },
    unlockedGraphNodeIds: [GRAPH_ENTRY.nodeId],
    completedGraphNodeIds: [GRAPH_ENTRY.nodeId],
    claimedRewardIds: cloudRewardIds,
    replayRewardEpochByMission: { [entryMission.id]: '2026-07-28' },
    processedResultIds: cloudResultIds,
    completionRecords: cloudCompletionRecords
  };
  const incomingProgress = {
    version: 4,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    recommendedMissionId: entryMission.id,
    recommendedGraphNodeId: GRAPH_ENTRY.nodeId,
    currentGraphNodeId: GRAPH_ENTRY.nodeId,
    furthestMainGraphNodeId: GRAPH_ENTRY.nodeId,
    unlockedMissionIds: [entryMission.id],
    unlockedWaveIdsByMission: { [entryMission.id]: [entryWaveIds[0]] },
    completedMissionIds: [],
    missionRecords: {
      [entryMission.id]: {
        completed: false,
        completedWaveIds: [],
        bestScore: 100,
        bestClearTimeMs: 90_000,
        bestDamageTaken: 8,
        bestCoinsCollected: 10,
        completionCount: 1
      }
    },
    unlockedGraphNodeIds: [GRAPH_ENTRY.nodeId],
    completedGraphNodeIds: [],
    claimedRewardIds: deviceRewardIds,
    replayRewardEpochByMission: { [entryMission.id]: '2026-07-27' },
    processedResultIds: deviceResultIds,
    completionRecords: deviceCompletionRecords
  };

  const merged = mergeCampaignGraphProgress({
    currentProgress,
    incomingProgress,
    lifetimeStats: {},
    now
  });
  const record = merged.missionRecords[entryMission.id];

  assert.equal(record.completed, true);
  assert.deepEqual(record.completedWaveIds, entryWaveIds);
  assert.equal(record.stars, 2);
  assert.deepEqual(record.earnedStarIds, starIds.slice(0, 2));
  assert.equal(record.bestScore, 900);
  assert.equal(record.bestClearTimeMs, 60_000);
  assert.equal(record.bestDamageTaken, 2);
  assert.equal(record.bestCoinsCollected, 75);
  assert.equal(record.completionCount, 7);
  assert.equal(merged.claimedRewardIds.length, 768);
  assert.equal(merged.claimedRewardIds.includes('campaign:device-reward:383'), true);
  assert.equal(merged.claimedRewardIds.includes('campaign:cloud-reward:0'), false);
  assert.equal(merged.processedResultIds.length, 384);
  assert.equal(merged.processedResultIds.includes('device-result-191'), true);
  assert.equal(merged.completionRecords.length, 96);
  assert.equal(merged.completionRecords.some((entry) => entry.resultId === 'device-completion-47'), true);
  assert.equal(merged.completionRecords.some((entry) => entry.resultId === 'cloud-completion-0'), false);
  assert.deepEqual(merged.replayRewardEpochByMission, {
    [entryMission.id]: '2026-07-28'
  });
});

test('cloud Campaign migration preserves a rev21 partial checkpoint and replay reward epoch', () => {
  const now = Date.UTC(2026, 6, 27, 19);
  const waveIds = FIRST_MISSION.waves
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((wave) => wave.id);
  const sanitized = sanitizeWalletSnapshot({
    permanentState: {
      campaignProgress: {
        version: 2,
        campaignId: campaign.id,
        campaignRevision: 21,
        recommendedMissionId: FIRST_MISSION.id,
        recommendedWaveId: 'open-orbit-checkpoint',
        unlockedMissionIds: [FIRST_MISSION.id],
        unlockedWaveIdsByMission: {
          [FIRST_MISSION.id]: ['open-orbit', 'open-orbit-checkpoint']
        },
        missionRecords: {
          [FIRST_MISSION.id]: {
            completedWaveIds: ['open-orbit', 'open-orbit-checkpoint']
          }
        },
        replayRewardEpochByMission: {
          [FIRST_MISSION.id]: '2026-07-26',
          injected: '2099-01-01'
        }
      }
    }
  }, WALLET, now);
  const progress = sanitized.permanentState.campaignProgress;

  assert.equal(progress.version, 4);
  assert.equal(progress.campaignRevision, campaign.revision);
  assert.deepEqual(progress.missionRecords[FIRST_MISSION.id].completedWaveIds, waveIds.slice(0, 3));
  assert.deepEqual(progress.unlockedWaveIdsByMission[FIRST_MISSION.id], waveIds.slice(0, 4));
  assert.equal(progress.recommendedMissionId, FIRST_MISSION.id);
  assert.equal(progress.recommendedWaveId, waveIds[3]);
  assert.deepEqual(progress.replayRewardEpochByMission, {
    [FIRST_MISSION.id]: '2026-07-26'
  });
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
  assert.equal(archive.lastSelectedEventId, FIRST_BOSS_EVENT_ID);
  assert.equal(archive.dailyChallenge.successfulClearsUsed, 2);
  assert.deepEqual(archive.dailyChallenge.processedClearIds, ['receipt-1']);
  assert.equal(archive.records[FIRST_BOSS_EVENT_ID].challengeClears, 1);
  assert.equal(archive.records[FIRST_BOSS_EVENT_ID].mastery['challenge-clear'].claimedAt, '2026-07-23T18:01:00.000Z');
  assert.equal(archive.records[FIRST_BOSS_EVENT_ID].mastery.injected, undefined);
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

  assert.deepEqual(vercel.rewrites.find((route) => route.source === '/api/wallet-profile'), {
    source: '/api/wallet-profile',
    destination: '/api/mint-records?route=wallet-profile'
  });
  assert.match(mintRoute, /req\.query\?\.route === 'wallet-profile'/);
  assert.match(mintRoute, /walletProfileHandler\(req, res\)/);
});
