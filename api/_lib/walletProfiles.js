const crypto = require('crypto');
const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const {
  makeWalletProfileMessage,
  normalizeWalletAddress,
  walletProfileId
} = require('./walletProfileAuth');
const { getWeeklyBoundaryMeta } = require('../../shared/weeklyCompetitionBoundary');
const campaign = require('../../game-config/campaign.json');
const campaignMigration = require('../../game-config/campaign-migration-v22.json');
const campaignGraphMigration = require('../../game-config/campaign-migration-v23.json');

const PROFILES_TABLE = process.env.SUPABASE_WALLET_PROFILES_TABLE || 'scicon_wallet_profiles';
const CHALLENGES_TABLE = process.env.SUPABASE_WALLET_PROFILE_CHALLENGES_TABLE || 'scicon_wallet_profile_challenges';
const BOSS_ARCHIVE_RESULTS_TABLE = process.env.SUPABASE_BOSS_ARCHIVE_RESULTS_TABLE
  || 'scicon_boss_archive_challenge_results';
const BOSS_ARCHIVE_PROGRESS_VERSION = 2;
const BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT = 3;
const BOSS_ARCHIVE_DIFFICULTY_IDS = Object.freeze(['easy', 'medium', 'heroic']);
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 256 * 1024;

const PLAYER_SHIP_IDS = ['researchhub', 'bio', 'eth', 'btc'];
const PLAYER_SHIP_ID_SET = new Set(PLAYER_SHIP_IDS);
const MINI_SHIP_IDS = [
  'citation-dart',
  'helix-wasp',
  'photon-manta',
  'quorum-crab',
  'axiom-orbiter',
  'archive-beetle',
  'beacon-kite',
  'prism-skimmer',
  'ledger-hammer',
  'nebula-tern'
];
const MINI_SHIP_ID_SET = new Set(MINI_SHIP_IDS);
const ACHIEVEMENT_IDS = new Set([
  'sector-pioneer',
  'boss-breaker',
  'research-hunter',
  'coin-collector',
  'mission-veteran',
  'ace-score'
]);
const CAMPAIGN_MAJOR_BOSS_IDS = new Set([
  'gatekeeper',
  ...(Array.isArray(campaign.sectors)
    ? campaign.sectors.map((sector) => sector?.majorBossId).filter((id) => typeof id === 'string')
    : [])
]);
const BOSS_ARCHIVE_ENTRIES = Object.freeze(
  campaign.levels
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((level) => level.waves.flatMap((wave) => wave.events
      .filter((event) => event.kind === 'boss' && CAMPAIGN_MAJOR_BOSS_IDS.has(event.bossId))
      .map((event) => Object.freeze({
        eventId: event.id,
        missionNumber: level.order
      }))))
);
const BOSS_ARCHIVE_EVENT_IDS = Object.freeze(
  BOSS_ARCHIVE_ENTRIES.map((entry) => entry.eventId)
);
const BOSS_ARCHIVE_EVENT_ID_SET = new Set(BOSS_ARCHIVE_EVENT_IDS);
const LEGACY_BOSS_ARCHIVE_MISSION_BY_EVENT_ID = Object.freeze({
  'open-orbit-gatekeeper': 'stage-bastion-protocol',
  'null-sector-final-boss': 'stage-null-sector',
  'ion-citadel-final-boss': 'stage-ion-citadel',
  'terminus-ascendant-final-boss': 'stage-terminus-ascendant'
});
const canonicalCampaignBossEventId = (legacyCanonicalEventId) => {
  if (BOSS_ARCHIVE_EVENT_ID_SET.has(legacyCanonicalEventId)) return legacyCanonicalEventId;
  const missionId = LEGACY_BOSS_ARCHIVE_MISSION_BY_EVENT_ID[legacyCanonicalEventId];
  if (!missionId) return null;
  const mission = campaign.levels.find((level) => level.id === missionId);
  return mission?.waves.flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && CAMPAIGN_MAJOR_BOSS_IDS.has(event.bossId))?.id ?? null;
};
const BOSS_ARCHIVE_EVENT_ALIASES = new Map(
  Object.entries(campaignMigration.bossEventAliases || {})
    .map(([legacyId, canonicalId]) => [
      legacyId.trim().toLowerCase(),
      canonicalCampaignBossEventId(canonicalId)
    ])
    .filter(([, canonicalId]) => BOSS_ARCHIVE_EVENT_ID_SET.has(canonicalId))
);
const canonicalBossArchiveEventId = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const canonical = BOSS_ARCHIVE_EVENT_ALIASES.get(normalized) || normalized;
  return BOSS_ARCHIVE_EVENT_ID_SET.has(canonical) ? canonical : null;
};
const BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS = 100;
const BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS = 20;
const BOSS_ARCHIVE_CHALLENGE_REWARD_MISSIONS_PER_TIER = 5;
const BOSS_ARCHIVE_BASE_SPEED_TARGET_MS = 75_000;
const BOSS_ARCHIVE_SPEED_TARGET_STEP_MS = 2_500;
const BOSS_ARCHIVE_CONFIG_BY_EVENT_ID = new Map(
  BOSS_ARCHIVE_ENTRIES.map((entry) => [entry.eventId, Object.freeze({
    ...entry,
    rewardCoins: BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS
      + BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS * Math.floor(
        Math.max(0, entry.missionNumber - 1)
        / BOSS_ARCHIVE_CHALLENGE_REWARD_MISSIONS_PER_TIER
      ),
    timedTargetMs: BOSS_ARCHIVE_BASE_SPEED_TARGET_MS
      + BOSS_ARCHIVE_SPEED_TARGET_STEP_MS * Math.max(0, entry.missionNumber - 1)
  })])
);
const FINAL_CAMPAIGN_MISSION = campaign.levels.reduce(
  (highest, level) => Math.max(highest, Math.max(0, Math.floor(Number(level.order) || 0))),
  0
);
const CAMPAIGN_LEVELS = Object.freeze(
  campaign.levels.slice().sort((left, right) => left.order - right.order)
);
const CAMPAIGN_LEVEL_IDS = Object.freeze(CAMPAIGN_LEVELS.map((level) => level.id));
const CAMPAIGN_LEVEL_ID_SET = new Set(CAMPAIGN_LEVEL_IDS);
const CAMPAIGN_WAVE_IDS_BY_LEVEL = new Map(CAMPAIGN_LEVELS.map((level) => [
  level.id,
  Object.freeze(level.waves.slice().sort((left, right) => left.order - right.order).map((wave) => wave.id))
]));
const CAMPAIGN_WAVE_ALIASES = campaignMigration.waveAliases || {};
const campaignStoredRevision = (value) => (
  Number.isFinite(Number(value))
    ? Math.max(0, Math.floor(Number(value)))
    : campaign.revision
);
const campaignWaveId = (levelId, value, storedRevision) => {
  if (typeof value !== 'string') return null;
  const waveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(levelId) || [];
  if (waveIds.includes(value)) return value;
  if (storedRevision >= campaignMigration.toRevision) return null;
  const alias = CAMPAIGN_WAVE_ALIASES[levelId]?.[value];
  return waveIds.includes(alias) ? alias : null;
};
const prefixThrough = (ids, index) => index < 0 ? [] : ids.slice(0, Math.min(ids.length, index + 1));
const orderedPrefix = (ids, included) => {
  const prefix = [];
  for (const id of ids) {
    if (!included.has(id)) break;
    prefix.push(id);
  }
  return prefix;
};
const campaignCheckpointRank = (missionId, waveId) => {
  const missionIndex = CAMPAIGN_LEVEL_IDS.indexOf(missionId);
  const waveIndex = (CAMPAIGN_WAVE_IDS_BY_LEVEL.get(missionId) || []).indexOf(waveId);
  return missionIndex < 0 || waveIndex < 0 ? -1 : missionIndex * 1000 + waveIndex;
};
const CAMPAIGN_BRANCHES = Object.freeze(
  Array.isArray(campaign.campaignBranches) ? campaign.campaignBranches : []
);
const CAMPAIGN_PROGRESS_VERSION = 4;
const MAX_CAMPAIGN_COMPLETION_RECORDS = 96;
const MAX_CAMPAIGN_RESULT_IDS = 384;
const MAX_CAMPAIGN_REWARD_IDS = 768;
const MAX_CREDITED_CAMPAIGN_REWARD_IDS = 1024;
const CAMPAIGN_REPLAY_REWARD_MARKER = ':replay:';
const CAMPAIGN_GRAPH = (
  campaign.revision >= campaignGraphMigration.toRevision
  && campaign.campaignGraph
  && typeof campaign.campaignGraph === 'object'
  && !Array.isArray(campaign.campaignGraph)
  && Array.isArray(campaign.campaignGraph.nodes)
  && campaign.campaignGraph.nodes.length > 0
)
  ? campaign.campaignGraph
  : null;
const CAMPAIGN_GRAPH_NODES = Object.freeze(CAMPAIGN_GRAPH?.nodes ?? []);
const CAMPAIGN_GRAPH_NODE_IDS = Object.freeze(CAMPAIGN_GRAPH_NODES.map((node) => node.nodeId));
const CAMPAIGN_GRAPH_NODE_ID_SET = new Set(CAMPAIGN_GRAPH_NODE_IDS);
const CAMPAIGN_GRAPH_NODE_BY_ID = new Map(
  CAMPAIGN_GRAPH_NODES.map((node) => [node.nodeId, node])
);
const CAMPAIGN_LEVEL_BY_ID = new Map(
  CAMPAIGN_LEVELS.map((level) => [level.id, level])
);
const CAMPAIGN_GRAPH_EDGE_BY_ID = new Map(
  CAMPAIGN_GRAPH_NODES.flatMap((node) => (
    Array.isArray(node.outgoingEdges)
      ? node.outgoingEdges.map((edge) => [edge.edgeId, { ...edge, fromNodeId: node.nodeId }])
      : []
  ))
);
const CAMPAIGN_GRAPH_NODES_BY_MISSION_ID = new Map();
CAMPAIGN_GRAPH_NODES.forEach((node) => {
  const nodes = CAMPAIGN_GRAPH_NODES_BY_MISSION_ID.get(node.missionDefinitionId) ?? [];
  nodes.push(node);
  CAMPAIGN_GRAPH_NODES_BY_MISSION_ID.set(node.missionDefinitionId, nodes);
});

const campaignGraphNodeOrder = (nodeId) => {
  const node = CAMPAIGN_GRAPH_NODE_BY_ID.get(nodeId);
  if (!node) return -1;
  const levelOrder = CAMPAIGN_LEVELS.find((level) => level.id === node.missionDefinitionId)?.order ?? 0;
  return Math.max(0, Math.floor(Number(node.depth) || 0)) * 10_000
    + (node.mainPath ? 1_000 : 0)
    + Math.max(0, Math.floor(Number(levelOrder) || 0));
};

const deepestCampaignGraphNodeId = (nodeIds, { mainPathOnly = false } = {}) => (
  Array.from(new Set(nodeIds))
    .filter((nodeId) => {
      const node = CAMPAIGN_GRAPH_NODE_BY_ID.get(nodeId);
      return Boolean(node && (!mainPathOnly || node.mainPath));
    })
    .sort((left, right) => (
      campaignGraphNodeOrder(right) - campaignGraphNodeOrder(left)
      || left.localeCompare(right)
    ))[0] ?? null
);

const campaignGraphNodeForMission = (missionId, preferredNodeIds = []) => {
  const candidates = CAMPAIGN_GRAPH_NODES_BY_MISSION_ID.get(missionId) ?? [];
  if (candidates.length === 0) return null;
  const preferred = preferredNodeIds
    .map((nodeId) => CAMPAIGN_GRAPH_NODE_BY_ID.get(nodeId))
    .find((node) => node?.missionDefinitionId === missionId);
  return preferred
    ?? candidates.find((node) => node.mainPath)
    ?? candidates[0];
};

const campaignGraphNodeIdsForMissions = (missionIds) => {
  const missionIdSet = missionIds instanceof Set ? missionIds : new Set(missionIds);
  return CAMPAIGN_GRAPH_NODES
    .filter((node) => missionIdSet.has(node.missionDefinitionId))
    .map((node) => node.nodeId);
};

const campaignGraphOutgoingTargetIds = (sourceNodeId) => {
  const source = CAMPAIGN_GRAPH_NODE_BY_ID.get(sourceNodeId);
  if (!source || !Array.isArray(source.outgoingEdges)) return [];
  return source.outgoingEdges
    .map((edge) => edge?.toNodeId)
    .filter((targetNodeId) => CAMPAIGN_GRAPH_NODE_ID_SET.has(targetNodeId));
};

const isDirectCampaignGraphRoute = (sourceNodeId, targetNodeId) => (
  campaignGraphOutgoingTargetIds(sourceNodeId).includes(targetNodeId)
);

const campaignStarIds = (level) => {
  const authoredObjectives = level?.campaignProgression?.masteryObjectives;
  if (Array.isArray(authoredObjectives) && authoredObjectives.length > 0) {
    return authoredObjectives
      .map((objective) => objective?.id)
      .filter((id) => typeof id === 'string' && id.length > 0)
      .slice(0, 3);
  }
  const boss = level.waves.some((wave) => wave.events.some((event) => (
    event.kind === 'boss' && CAMPAIGN_MAJOR_BOSS_IDS.has(event.bossId)
  )));
  return boss
    ? [`${level.id}:complete`, `${level.id}:damage`, `${level.id}:time`]
    : [`${level.id}:complete`, `${level.id}:coins`, `${level.id}:score`];
};

const campaignMissionRecord = (value, level, storedRevision = campaign.revision) => {
  const record = asObject(value);
  const waveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) || [];
  const starIds = campaignStarIds(level);
  const starIdSet = new Set(starIds);
  const mappedCompletedWaveIds = stringList(record.completedWaveIds, {
    maxItems: waveIds.length,
    maxLength: 120
  }).flatMap((id) => {
    const canonical = campaignWaveId(level.id, id, storedRevision);
    return canonical ? [canonical] : [];
  });
  const completedWaveIds = storedRevision < campaignMigration.toRevision && mappedCompletedWaveIds.length > 0
    ? prefixThrough(waveIds, Math.max(...mappedCompletedWaveIds.map((id) => waveIds.indexOf(id))))
    : orderedPrefix(waveIds, new Set(mappedCompletedWaveIds));
  const completed = Boolean(record.completed) || completedWaveIds.length === waveIds.length;
  let earnedStarIds = stringList(record.earnedStarIds, {
    maxItems: 3,
    maxLength: 160
  }).filter((id) => starIdSet.has(id));
  if (completed) {
    starIds.slice(0, integer(record.stars, 0, 3)).forEach((id) => {
      if (!earnedStarIds.includes(id)) earnedStarIds.push(id);
    });
    if (!earnedStarIds.includes(starIds[0])) earnedStarIds.unshift(starIds[0]);
  } else {
    earnedStarIds = [];
  }
  const nullableInteger = (entry, min = 0) => (
    entry === null || entry === undefined ? null : integer(entry, min, 1_000_000_000)
  );
  const optionalDate = (entry) => (
    typeof entry === 'string' && Number.isFinite(Date.parse(entry)) ? new Date(entry).toISOString() : null
  );
  return {
    completedWaveIds: completed ? [...waveIds] : completedWaveIds,
    completed,
    stars: completed
      ? Math.max(integer(record.stars, 0, 3), Math.min(3, earnedStarIds.length), 1)
      : 0,
    earnedStarIds,
    bestScore: integer(record.bestScore, 0, 1_000_000_000),
    bestClearTimeMs: nullableInteger(record.bestClearTimeMs, 1),
    bestDamageTaken: nullableInteger(record.bestDamageTaken),
    bestCoinsCollected: integer(record.bestCoinsCollected, 0, 1_000_000_000),
    firstCompletedAt: optionalDate(record.firstCompletedAt),
    lastCompletedAt: optionalDate(record.lastCompletedAt),
    completionCount: integer(record.completionCount, 0, 1_000_000)
  };
};

const sanitizeCampaignBranchProgress = (
  rawValue,
  missionRecords,
  now,
  branchDefinitions = CAMPAIGN_BRANCHES
) => {
  const branches = Array.isArray(branchDefinitions)
    ? branchDefinitions.filter((branch) => (
        branch
        && typeof branch === 'object'
        && !Array.isArray(branch)
        && typeof branch.branchId === 'string'
        && typeof branch.sourceMissionId === 'string'
      ))
    : [];
  const branchIds = branches.map((branch) => branch.branchId);
  const branchIdSet = new Set(branchIds);
  const value = asObject(rawValue);
  const storedUnlockedIds = stringList(value.unlockedBranchIds, {
    maxItems: branchIds.length,
    maxLength: 120
  }).filter((id) => branchIdSet.has(id));
  const storedUnlocked = new Set(storedUnlockedIds);
  const founderLocked = new Set(stringList(value.founderLockedBranchIds, {
    maxItems: branchIds.length,
    maxLength: 120
  }).filter((id) => branchIdSet.has(id)));
  const completed = new Set(stringList(value.completedBranchIds, {
    maxItems: branchIds.length,
    maxLength: 120
  }).filter((id) => branchIdSet.has(id)));
  const claimed = new Set(stringList(value.claimedBranchIds, {
    maxItems: branchIds.length,
    maxLength: 120
  }).filter((id) => branchIdSet.has(id)));
  const attemptIds = new Set();
  const rewardReceiptIds = new Set();
  const attemptReceipts = (Array.isArray(value.attemptReceipts) ? value.attemptReceipts : [])
    .flatMap((entry) => {
      const receipt = asObject(entry);
      const attemptId = text(receipt.attemptId, 180);
      const branchId = text(receipt.branchId, 120);
      const playerId = text(receipt.playerId, 180) || 'unknown';
      const outcome = ['failed', 'interrupted', 'success'].includes(receipt.outcome)
        ? receipt.outcome
        : null;
      const rewardReceiptId = text(receipt.rewardReceiptId, 180) || null;
      const success = outcome === 'success';
      if (
        !attemptId
        || !branchIdSet.has(branchId)
        || !outcome
        || attemptIds.has(attemptId)
        || (success && !rewardReceiptId)
        || (success && rewardReceiptIds.has(rewardReceiptId))
      ) return [];
      attemptIds.add(attemptId);
      if (success) rewardReceiptIds.add(rewardReceiptId);
      const claimedReceipt = success && Boolean(receipt.claimed) && Boolean(rewardReceiptId);
      if (success) completed.add(branchId);
      if (claimedReceipt) claimed.add(branchId);
      const destroyedByType = Object.fromEntries(
        ['standard', 'armored', 'fast', 'golden'].map((kind) => [
          kind,
          integer(asObject(receipt.destroyedByType)[kind], 0, 10_000)
        ])
      );
      return [{
        attemptId,
        branchId,
        playerId,
        outcome,
        destroyedByType,
        presentsDestroyed: Math.max(
          integer(receipt.presentsDestroyed, 0, 1_000_000),
          Object.values(destroyedByType).reduce((total, count) => total + count, 0)
        ),
        performanceCoins: success ? integer(receipt.performanceCoins, 0, 1_000_000) : 0,
        coinsCalculated: success ? integer(receipt.coinsCalculated, 0, 1_000_000) : 0,
        coinsAwarded: success && rewardReceiptId
          ? integer(receipt.coinsAwarded, 0, 1_000_000)
          : 0,
        completedAt: typeof receipt.completedAt === 'string' && Number.isFinite(Date.parse(receipt.completedAt))
          ? new Date(receipt.completedAt).toISOString()
          : isoNow(now),
        rewardReceiptId: success ? rewardReceiptId : null,
        claimed: claimedReceipt
      }];
    })
    .slice(-256);
  const unlocked = new Set(storedUnlockedIds);
  let unlockedAnotherBranch = true;
  while (unlockedAnotherBranch) {
    unlockedAnotherBranch = false;
    branches.forEach((branch) => {
      if (founderLocked.has(branch.branchId)) return;
      if (unlocked.has(branch.branchId)) return;
      const condition = asObject(branch.unlockCondition);
      const requiredStars = integer(branch.requiredStars, 0, 3);
      const conditionMet = !condition.kind || condition.kind === 'all-stars-earned'
        ? requiredStars > 0
          && integer(asObject(missionRecords)[condition.missionId || branch.sourceMissionId]?.stars, 0, 3) >= requiredStars
        : condition.kind === 'sector-mastered'
          ? Array.isArray(condition.missionIds)
            && condition.missionIds.length > 0
            && condition.missionIds.every((missionId) => (
              integer(asObject(missionRecords)[missionId]?.stars, 0, 3) >= 3
            ))
          : condition.kind === 'branch-completed'
            ? completed.has(condition.branchId)
            : false;
      if (conditionMet) {
        unlocked.add(branch.branchId);
        unlockedAnotherBranch = true;
      }
    });
  }
  completed.forEach((branchId) => {
    if (!founderLocked.has(branchId)) unlocked.add(branchId);
  });
  claimed.forEach((branchId) => {
    if (!founderLocked.has(branchId)) unlocked.add(branchId);
    completed.add(branchId);
  });
  founderLocked.forEach((branchId) => unlocked.delete(branchId));
  const viewed = new Set(stringList(value.viewedBranchIds, {
    maxItems: branchIds.length,
    maxLength: 120
  }).filter((id) => unlocked.has(id)));
  const requestedNew = new Set(stringList(value.newBranchIds, {
    maxItems: branchIds.length,
    maxLength: 120
  }).filter((id) => branchIdSet.has(id)));
  branchIds.forEach((branchId) => {
    if (unlocked.has(branchId) && !storedUnlocked.has(branchId)) requestedNew.add(branchId);
  });
  const processedAttemptIds = new Set(stringList(value.processedAttemptIds, {
    maxItems: 512,
    maxLength: 180
  }));
  attemptReceipts.forEach((receipt) => processedAttemptIds.add(receipt.attemptId));
  const claimedRewardReceiptIds = new Set(stringList(value.claimedRewardReceiptIds, {
    maxItems: 256,
    maxLength: 180
  }));
  attemptReceipts.forEach((receipt) => {
    if (receipt.claimed && receipt.rewardReceiptId) claimedRewardReceiptIds.add(receipt.rewardReceiptId);
  });
  return {
    version: 2,
    founderLockedBranchIds: branchIds.filter((branchId) => founderLocked.has(branchId)),
    unlockedBranchIds: branchIds.filter((branchId) => unlocked.has(branchId)),
    newBranchIds: branchIds.filter((branchId) => (
      unlocked.has(branchId)
      && requestedNew.has(branchId)
      && !viewed.has(branchId)
      && !completed.has(branchId)
    )),
    viewedBranchIds: branchIds.filter((branchId) => viewed.has(branchId)),
    completedBranchIds: branchIds.filter((branchId) => completed.has(branchId)),
    claimedBranchIds: branchIds.filter((branchId) => claimed.has(branchId)),
    processedAttemptIds: Array.from(processedAttemptIds).slice(-512),
    claimedRewardReceiptIds: Array.from(claimedRewardReceiptIds).slice(-256),
    attemptReceipts,
    updatedAt: isoNow(now)
  };
};

const sanitizeCampaignProgress = (rawValue, lifetimeStats, now) => {
  const value = asObject(rawValue);
  const storedRevision = campaignStoredRevision(value.campaignRevision);
  const storedProgressVersion = integer(value.version, 0, CAMPAIGN_PROGRESS_VERSION);
  const hasStoredProgress = Boolean(
    rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
  );
  const reachedMission = hasStoredProgress
    ? 1
    : Math.max(1, Math.min(CAMPAIGN_LEVELS.length, integer(lifetimeStats.highestWave, 1, CAMPAIGN_LEVELS.length)));
  const missionRecords = {};
  CAMPAIGN_LEVELS.forEach((level, index) => {
    const stored = campaignMissionRecord(asObject(value.missionRecords)[level.id], level, storedRevision);
    const legacyCompleted = !hasStoredProgress && index < reachedMission - 1;
    missionRecords[level.id] = legacyCompleted
      ? {
          ...stored,
          completed: true,
          completedWaveIds: [...(CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) || [])],
          stars: Math.max(1, stored.stars),
          earnedStarIds: Array.from(new Set([campaignStarIds(level)[0], ...stored.earnedStarIds]))
        }
      : stored;
  });
  const completedMissionIds = CAMPAIGN_LEVELS
    .filter((level) => missionRecords[level.id].completed || asObject(value).completedMissionIds?.includes?.(level.id))
    .map((level) => level.id);
  completedMissionIds.forEach((id) => {
    missionRecords[id] = {
      ...missionRecords[id],
      completed: true,
      completedWaveIds: [...(CAMPAIGN_WAVE_IDS_BY_LEVEL.get(id) || [])]
    };
  });
  const unlocked = new Set(
    hasStoredProgress
      ? stringList(value.unlockedMissionIds, { maxItems: CAMPAIGN_LEVELS.length, maxLength: 120 })
        .filter((id) => CAMPAIGN_LEVEL_ID_SET.has(id))
      : CAMPAIGN_LEVEL_IDS.slice(0, reachedMission)
  );
  unlocked.add(CAMPAIGN_LEVEL_IDS[0]);
  completedMissionIds.forEach((id) => {
    unlocked.add(id);
    if (!CAMPAIGN_GRAPH) {
      const index = CAMPAIGN_LEVEL_IDS.indexOf(id);
      if (CAMPAIGN_LEVEL_IDS[index + 1]) unlocked.add(CAMPAIGN_LEVEL_IDS[index + 1]);
    }
  });
  const completedGraphNodeIds = new Set();
  const unlockedGraphNodeIds = new Set();
  const selectedRouteTargetBySourceNodeId = {};
  let pendingRouteChoice = null;
  if (CAMPAIGN_GRAPH) {
    stringList(value.completedGraphNodeIds, {
      maxItems: CAMPAIGN_GRAPH_NODE_IDS.length,
      maxLength: 120
    }).filter((id) => CAMPAIGN_GRAPH_NODE_ID_SET.has(id))
      .forEach((id) => completedGraphNodeIds.add(id));
    campaignGraphNodeIdsForMissions(completedMissionIds)
      .forEach((id) => completedGraphNodeIds.add(id));
    stringList(value.unlockedGraphNodeIds, {
      maxItems: CAMPAIGN_GRAPH_NODE_IDS.length,
      maxLength: 120
    }).filter((id) => CAMPAIGN_GRAPH_NODE_ID_SET.has(id))
      .forEach((id) => unlockedGraphNodeIds.add(id));
    campaignGraphNodeIdsForMissions(unlocked)
      .forEach((id) => unlockedGraphNodeIds.add(id));
    completedGraphNodeIds.forEach((id) => unlockedGraphNodeIds.add(id));
    if (CAMPAIGN_GRAPH_NODE_ID_SET.has(CAMPAIGN_GRAPH.entryNodeId)) {
      unlockedGraphNodeIds.add(CAMPAIGN_GRAPH.entryNodeId);
    }

    const rawSelections = asObject(value.selectedRouteTargetBySourceNodeId);
    Object.entries(rawSelections)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([sourceNodeId, targetNodeId]) => {
        if (
          typeof targetNodeId !== 'string'
          || !completedGraphNodeIds.has(sourceNodeId)
          || !isDirectCampaignGraphRoute(sourceNodeId, targetNodeId)
        ) return;
        selectedRouteTargetBySourceNodeId[sourceNodeId] = targetNodeId;
        unlockedGraphNodeIds.add(targetNodeId);
      });

    // Revision-22/version-3 snapshots have Mission checkpoints but no graph
    // choice ledger. Preserve an old route only when those checkpoints identify
    // exactly one direct exit; never guess between two authored alternatives.
    if (storedProgressVersion < CAMPAIGN_PROGRESS_VERSION) {
      const preservedMissionIds = new Set(completedMissionIds);
      if (CAMPAIGN_LEVEL_ID_SET.has(value.recommendedMissionId)) {
        preservedMissionIds.add(value.recommendedMissionId);
      }
      completedGraphNodeIds.forEach((sourceNodeId) => {
        if (selectedRouteTargetBySourceNodeId[sourceNodeId]) return;
        const preservedTargets = campaignGraphOutgoingTargetIds(sourceNodeId)
          .filter((targetNodeId) => {
            const target = CAMPAIGN_GRAPH_NODE_BY_ID.get(targetNodeId);
            return target && preservedMissionIds.has(target.missionDefinitionId);
          });
        if (preservedTargets.length !== 1) return;
        selectedRouteTargetBySourceNodeId[sourceNodeId] = preservedTargets[0];
        unlockedGraphNodeIds.add(preservedTargets[0]);
      });
    }

    const pendingCandidates = [];
    completedGraphNodeIds.forEach((sourceNodeId) => {
      const outgoingTargetIds = campaignGraphOutgoingTargetIds(sourceNodeId);
      if (outgoingTargetIds.length === 1) {
        selectedRouteTargetBySourceNodeId[sourceNodeId] ??= outgoingTargetIds[0];
        unlockedGraphNodeIds.add(outgoingTargetIds[0]);
        return;
      }
      if (outgoingTargetIds.length < 2) return;
      outgoingTargetIds.forEach((id) => unlockedGraphNodeIds.add(id));
      if (!selectedRouteTargetBySourceNodeId[sourceNodeId]) {
        pendingCandidates.push({
          sourceNodeId,
          optionNodeIds: outgoingTargetIds,
          depth: Math.max(0, Math.floor(Number(CAMPAIGN_GRAPH_NODE_BY_ID.get(sourceNodeId)?.depth) || 0))
        });
      }
    });

    const rawPending = asObject(value.pendingRouteChoice);
    const requestedPending = pendingCandidates.find((entry) => entry.sourceNodeId === rawPending.sourceNodeId);
    if (requestedPending) {
      const requestedOptions = stringList(rawPending.optionNodeIds, {
        maxItems: requestedPending.optionNodeIds.length,
        maxLength: 120
      }).filter((id) => requestedPending.optionNodeIds.includes(id));
      pendingRouteChoice = {
        sourceNodeId: requestedPending.sourceNodeId,
        optionNodeIds: requestedOptions.length > 1
          ? requestedPending.optionNodeIds.filter((id) => requestedOptions.includes(id))
          : requestedPending.optionNodeIds
      };
    }
    if (!pendingRouteChoice) {
      const pending = pendingCandidates.sort((left, right) => (
        right.depth - left.depth || left.sourceNodeId.localeCompare(right.sourceNodeId)
      ))[0];
      pendingRouteChoice = pending
        ? { sourceNodeId: pending.sourceNodeId, optionNodeIds: pending.optionNodeIds }
        : null;
    }

    unlockedGraphNodeIds.forEach((nodeId) => {
      const node = CAMPAIGN_GRAPH_NODE_BY_ID.get(nodeId);
      if (node && CAMPAIGN_LEVEL_ID_SET.has(node.missionDefinitionId)) {
        unlocked.add(node.missionDefinitionId);
      }
    });
  }
  const unlockedWaveIdsByMission = {};
  CAMPAIGN_LEVELS.forEach((level) => {
    const waveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) || [];
    if (!unlocked.has(level.id)) {
      unlockedWaveIdsByMission[level.id] = [];
      return;
    }
    if (completedMissionIds.includes(level.id)) {
      unlockedWaveIdsByMission[level.id] = [...waveIds];
      return;
    }
    const completedCount = missionRecords[level.id].completedWaveIds.length;
    const requested = stringList(asObject(value.unlockedWaveIdsByMission)[level.id], {
      maxItems: waveIds.length,
      maxLength: 120
    }).flatMap((id) => {
      const canonical = campaignWaveId(level.id, id, storedRevision);
      return canonical ? [canonical] : [];
    });
    if (value.recommendedMissionId === level.id) {
      const recommended = campaignWaveId(level.id, value.recommendedWaveId, storedRevision);
      if (recommended) requested.push(recommended);
    }
    // Requested unlocks may restore the immediate checkpoint, but may never
    // jump over an uncleared Wave.
    const requestedIndex = requested.reduce(
      (highest, id) => Math.max(highest, waveIds.indexOf(id)),
      0
    );
    const furthestIndex = Math.min(
      waveIds.length - 1,
      Math.max(requestedIndex, completedCount),
      completedCount
    );
    unlockedWaveIdsByMission[level.id] = prefixThrough(waveIds, furthestIndex);
  });
  const derivedCheckpoint = CAMPAIGN_LEVELS.reduce((best, level) => {
    const waveId = unlockedWaveIdsByMission[level.id]?.at(-1);
    const rank = waveId ? campaignCheckpointRank(level.id, waveId) : -1;
    return rank > best.rank ? { missionId: level.id, waveId, rank } : best;
  }, {
    missionId: CAMPAIGN_LEVEL_IDS[reachedMission - 1] || CAMPAIGN_LEVEL_IDS[0],
    waveId: CAMPAIGN_WAVE_IDS_BY_LEVEL.get(
      CAMPAIGN_LEVEL_IDS[reachedMission - 1] || CAMPAIGN_LEVEL_IDS[0]
    )?.[0] || '',
    rank: -1
  });
  let recommendedMissionId = derivedCheckpoint.missionId;
  let recommendedWaveId = derivedCheckpoint.waveId;
  let recommendedGraphNodeId = null;
  let currentGraphNodeId = null;
  let furthestMainGraphNodeId = null;
  if (CAMPAIGN_GRAPH) {
    const requestedRecommendedNodeId = typeof value.recommendedGraphNodeId === 'string'
      && unlockedGraphNodeIds.has(value.recommendedGraphNodeId)
      ? value.recommendedGraphNodeId
      : null;
    const preservedMissionNodeId = CAMPAIGN_LEVEL_ID_SET.has(value.recommendedMissionId)
      ? campaignGraphNodeForMission(value.recommendedMissionId, [
          requestedRecommendedNodeId,
          value.currentGraphNodeId
        ])?.nodeId ?? null
      : null;
    const selectedTargetNodeIds = Object.values(selectedRouteTargetBySourceNodeId)
      .filter((id) => unlockedGraphNodeIds.has(id));
    const recommendedCandidates = pendingRouteChoice
      ? [pendingRouteChoice.sourceNodeId]
      : [requestedRecommendedNodeId, preservedMissionNodeId, ...selectedTargetNodeIds];
    recommendedGraphNodeId = deepestCampaignGraphNodeId(
      recommendedCandidates.filter((id) => id && unlockedGraphNodeIds.has(id))
    ) ?? CAMPAIGN_GRAPH.entryNodeId;

    const requestedFurthestMainNodeId = typeof value.furthestMainGraphNodeId === 'string'
      && unlockedGraphNodeIds.has(value.furthestMainGraphNodeId)
      && CAMPAIGN_GRAPH_NODE_BY_ID.get(value.furthestMainGraphNodeId)?.mainPath
      ? value.furthestMainGraphNodeId
      : null;
    furthestMainGraphNodeId = deepestCampaignGraphNodeId([
      ...completedGraphNodeIds,
      ...selectedTargetNodeIds,
      requestedFurthestMainNodeId
    ].filter(Boolean), { mainPathOnly: true }) ?? CAMPAIGN_GRAPH.entryNodeId;
    if (
      campaignGraphNodeOrder(furthestMainGraphNodeId)
      > campaignGraphNodeOrder(recommendedGraphNodeId)
    ) {
      recommendedGraphNodeId = furthestMainGraphNodeId;
    }

    const requestedCurrentNodeId = typeof value.currentGraphNodeId === 'string'
      && unlockedGraphNodeIds.has(value.currentGraphNodeId)
      ? value.currentGraphNodeId
      : null;
    currentGraphNodeId = requestedCurrentNodeId ?? recommendedGraphNodeId;
    const recommendedNode = CAMPAIGN_GRAPH_NODE_BY_ID.get(recommendedGraphNodeId);
    if (recommendedNode && CAMPAIGN_LEVEL_ID_SET.has(recommendedNode.missionDefinitionId)) {
      recommendedMissionId = recommendedNode.missionDefinitionId;
      const requestedWaveId = value.recommendedMissionId === recommendedMissionId
        ? campaignWaveId(recommendedMissionId, value.recommendedWaveId, storedRevision)
        : null;
      const unlockedCheckpointWaveId = unlockedWaveIdsByMission[recommendedMissionId]?.at(-1);
      recommendedWaveId = unlockedCheckpointWaveId
        ?? (requestedWaveId
          && unlockedWaveIdsByMission[recommendedMissionId]?.includes(requestedWaveId)
          ? requestedWaveId
          : CAMPAIGN_WAVE_IDS_BY_LEVEL.get(recommendedMissionId)?.[0] ?? '');
    }
  }
  const completionRecords = (Array.isArray(value.completionRecords) ? value.completionRecords : [])
    .flatMap((entry) => {
      const record = asObject(entry);
      const resultId = text(record.resultId, 180);
      const missionWaveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(record.missionId);
      const migratedRecordWaveId = campaignWaveId(
        record.missionId,
        record.waveId,
        campaignStoredRevision(record.campaignRevision ?? storedRevision)
      );
      if (
        !resultId
        || !missionWaveIds
        || !migratedRecordWaveId
      ) return [];
      return [{
        resultId,
        playerId: text(record.playerId, 180) || 'unknown',
        campaignId: campaign.id,
        campaignRevision: integer(record.campaignRevision, 0, 1_000_000),
        missionId: record.missionId,
        waveId: migratedRecordWaveId,
        completedAt: typeof record.completedAt === 'string' && Number.isFinite(Date.parse(record.completedAt))
          ? new Date(record.completedAt).toISOString()
          : isoNow(now),
        stageComplete: Boolean(record.stageComplete),
        firstClearGranted: Boolean(record.firstClearGranted),
        masteryEligible: Boolean(record.masteryEligible),
        coinsAwarded: integer(record.coinsAwarded, 0, 1_000_000),
        starsEarned: integer(record.starsEarned, 0, 3)
      }];
    })
    .slice(-MAX_CAMPAIGN_COMPLETION_RECORDS);
  const replayRewardEpochByMission = Object.fromEntries(CAMPAIGN_LEVELS.flatMap((level) => {
    const epoch = asObject(value.replayRewardEpochByMission)[level.id];
    if (typeof epoch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(epoch)) return [];
    const parsed = Date.parse(`${epoch}T00:00:00.000Z`);
    return Number.isFinite(parsed) ? [[level.id, new Date(parsed).toISOString().slice(0, 10)]] : [];
  }));
  return {
    version: CAMPAIGN_PROGRESS_VERSION,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    recommendedMissionId,
    recommendedWaveId,
    recommendedGraphNodeId,
    currentGraphNodeId,
    furthestMainGraphNodeId,
    unlockedGraphNodeIds: CAMPAIGN_GRAPH
      ? CAMPAIGN_GRAPH_NODE_IDS.filter((id) => unlockedGraphNodeIds.has(id))
      : [],
    completedGraphNodeIds: CAMPAIGN_GRAPH
      ? CAMPAIGN_GRAPH_NODE_IDS.filter((id) => completedGraphNodeIds.has(id))
      : [],
    selectedRouteTargetBySourceNodeId,
    pendingRouteChoice,
    unlockedMissionIds: CAMPAIGN_LEVEL_IDS.filter((id) => unlocked.has(id)),
    unlockedWaveIdsByMission,
    completedMissionIds,
    missionRecords,
    claimedRewardIds: campaignPermanentRewardIds(value.claimedRewardIds),
    replayRewardEpochByMission,
    processedResultIds: stringList(value.processedResultIds, {
      maxItems: MAX_CAMPAIGN_RESULT_IDS,
      maxLength: 180
    }),
    completionRecords,
    unviewedMissionIds: stringList(value.unviewedMissionIds, { maxItems: CAMPAIGN_LEVELS.length, maxLength: 120 })
      .filter((id) => CAMPAIGN_LEVEL_ID_SET.has(id)),
    unviewedStarMissionIds: stringList(value.unviewedStarMissionIds, { maxItems: CAMPAIGN_LEVELS.length, maxLength: 120 })
      .filter((id) => CAMPAIGN_LEVEL_ID_SET.has(id)),
    unviewedRewardIds: stringList(value.unviewedRewardIds, { maxItems: 120, maxLength: 180 })
      .filter((id) => id.startsWith('campaign:')),
    branchProgress: sanitizeCampaignBranchProgress(value.branchProgress, missionRecords, now),
    campaignCompleted: CAMPAIGN_GRAPH
      ? Array.from(completedGraphNodeIds).some((nodeId) => (
          campaignGraphOutgoingTargetIds(nodeId).length === 0
        ))
      : completedMissionIds.length === CAMPAIGN_LEVELS.length,
    updatedAt: isoNow(now)
  };
};

const mergeCampaignGraphProgress = ({
  currentProgress,
  incomingProgress,
  lifetimeStats,
  now = Date.now()
}) => {
  const incoming = sanitizeCampaignProgress(incomingProgress, lifetimeStats, now);
  if (!currentProgress || typeof currentProgress !== 'object') return incoming;
  const current = sanitizeCampaignProgress(currentProgress, lifetimeStats, now);

  const boundedTailUnion = (left, right, maxItems) => Array.from(new Set([
    ...(Array.isArray(left) ? left : []),
    ...(Array.isArray(right) ? right : [])
  ])).slice(-maxItems);
  const earliestIso = (left, right) => [left, right]
    .filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort()[0] ?? null;
  const latestIso = (left, right) => [left, right]
    .filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) ?? null;
  const lowestNullable = (left, right) => {
    const values = [left, right].filter((value) => Number.isFinite(value));
    return values.length > 0 ? Math.min(...values) : null;
  };
  const missionRecords = Object.fromEntries(CAMPAIGN_LEVELS.map((level) => {
    const cloud = current.missionRecords[level.id];
    const device = incoming.missionRecords[level.id];
    const waveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) ?? [];
    const starIds = campaignStarIds(level);
    const completed = cloud.completed || device.completed;
    return [level.id, {
      completedWaveIds: completed
        ? [...waveIds]
        : waveIds.filter((waveId) => (
            cloud.completedWaveIds.includes(waveId)
            || device.completedWaveIds.includes(waveId)
          )),
      completed,
      stars: Math.max(cloud.stars, device.stars),
      earnedStarIds: starIds.filter((starId) => (
        cloud.earnedStarIds.includes(starId)
        || device.earnedStarIds.includes(starId)
      )),
      bestScore: Math.max(cloud.bestScore, device.bestScore),
      bestClearTimeMs: lowestNullable(cloud.bestClearTimeMs, device.bestClearTimeMs),
      bestDamageTaken: lowestNullable(cloud.bestDamageTaken, device.bestDamageTaken),
      bestCoinsCollected: Math.max(cloud.bestCoinsCollected, device.bestCoinsCollected),
      firstCompletedAt: earliestIso(cloud.firstCompletedAt, device.firstCompletedAt),
      lastCompletedAt: latestIso(cloud.lastCompletedAt, device.lastCompletedAt),
      // Snapshot merges are convergent, so summing would double count the same
      // run after a retry. Keep the largest monotonic counter instead.
      completionCount: Math.max(cloud.completionCount, device.completionCount)
    }];
  }));
  const completionRecordByResultId = new Map();
  [...current.completionRecords, ...incoming.completionRecords].forEach((record) => {
    const existing = completionRecordByResultId.get(record.resultId);
    if (!existing) {
      completionRecordByResultId.set(record.resultId, record);
      return;
    }
    // The canonical cloud identity wins on a conflicting result ID. Only
    // monotonic settlement details may be improved by the active device.
    completionRecordByResultId.set(record.resultId, {
      ...existing,
      completedAt: earliestIso(existing.completedAt, record.completedAt) ?? existing.completedAt,
      stageComplete: existing.stageComplete || record.stageComplete,
      firstClearGranted: existing.firstClearGranted || record.firstClearGranted,
      masteryEligible: existing.masteryEligible || record.masteryEligible,
      coinsAwarded: Math.max(existing.coinsAwarded, record.coinsAwarded),
      starsEarned: Math.max(existing.starsEarned, record.starsEarned)
    });
  });
  const completionRecords = Array.from(completionRecordByResultId.values())
    .sort((left, right) => (
      left.completedAt.localeCompare(right.completedAt)
      || left.resultId.localeCompare(right.resultId)
    ))
    .slice(-MAX_CAMPAIGN_COMPLETION_RECORDS);
  const replayRewardEpochByMission = Object.fromEntries(CAMPAIGN_LEVEL_IDS.flatMap((missionId) => {
    const cloudEpoch = current.replayRewardEpochByMission[missionId] ?? '';
    const deviceEpoch = incoming.replayRewardEpochByMission[missionId] ?? '';
    const epoch = cloudEpoch > deviceEpoch ? cloudEpoch : deviceEpoch;
    return epoch ? [[missionId, epoch]] : [];
  }));
  const mergedBase = {
    ...incoming,
    unlockedMissionIds: Array.from(new Set([
      ...current.unlockedMissionIds,
      ...incoming.unlockedMissionIds
    ])),
    unlockedWaveIdsByMission: Object.fromEntries(CAMPAIGN_LEVEL_IDS.map((missionId) => [
      missionId,
      Array.from(new Set([
        ...(current.unlockedWaveIdsByMission[missionId] ?? []),
        ...(incoming.unlockedWaveIdsByMission[missionId] ?? [])
      ]))
    ])),
    completedMissionIds: Array.from(new Set([
      ...current.completedMissionIds,
      ...incoming.completedMissionIds
    ])),
    missionRecords,
    claimedRewardIds: campaignPermanentRewardIds([
      ...current.claimedRewardIds,
      ...incoming.claimedRewardIds
    ]),
    replayRewardEpochByMission,
    processedResultIds: boundedTailUnion(
      boundedTailUnion(
        current.processedResultIds,
        incoming.processedResultIds,
        MAX_CAMPAIGN_RESULT_IDS
      ),
      completionRecords.map((record) => record.resultId),
      MAX_CAMPAIGN_RESULT_IDS
    ),
    completionRecords,
    campaignCompleted: current.campaignCompleted || incoming.campaignCompleted
  };
  if (!CAMPAIGN_GRAPH) {
    return sanitizeCampaignProgress(mergedBase, lifetimeStats, now);
  }
  const completedGraphNodeIds = Array.from(new Set([
    ...current.completedGraphNodeIds,
    ...incoming.completedGraphNodeIds
  ])).filter((id) => CAMPAIGN_GRAPH_NODE_ID_SET.has(id));
  const completedSet = new Set(completedGraphNodeIds);
  const unlockedGraphNodeIds = Array.from(new Set([
    ...current.unlockedGraphNodeIds,
    ...incoming.unlockedGraphNodeIds,
    ...completedGraphNodeIds
  ])).filter((id) => CAMPAIGN_GRAPH_NODE_ID_SET.has(id));
  const unlockedSet = new Set(unlockedGraphNodeIds);
  const selectedRouteTargetBySourceNodeId = {};
  const selectionSources = Array.from(new Set([
    ...Object.keys(current.selectedRouteTargetBySourceNodeId),
    ...Object.keys(incoming.selectedRouteTargetBySourceNodeId)
  ])).sort();
  selectionSources.forEach((sourceNodeId) => {
    if (!completedSet.has(sourceNodeId)) return;
    // A route choice is committed. Keep the canonical cloud choice when two
    // devices disagree, while still accepting a previously unrecorded direct
    // choice from the active device.
    const candidates = [
      current.selectedRouteTargetBySourceNodeId[sourceNodeId],
      incoming.selectedRouteTargetBySourceNodeId[sourceNodeId]
    ].filter((targetNodeId, index, values) => (
      typeof targetNodeId === 'string'
      && values.indexOf(targetNodeId) === index
      && isDirectCampaignGraphRoute(sourceNodeId, targetNodeId)
    ));
    const selected = candidates[0];
    if (!selected) return;
    selectedRouteTargetBySourceNodeId[sourceNodeId] = selected;
    unlockedSet.add(selected);
  });
  const recommendedGraphNodeId = deepestCampaignGraphNodeId([
    current.recommendedGraphNodeId,
    incoming.recommendedGraphNodeId
  ].filter(Boolean));
  const furthestMainGraphNodeId = deepestCampaignGraphNodeId([
    current.furthestMainGraphNodeId,
    incoming.furthestMainGraphNodeId,
    ...completedGraphNodeIds
  ].filter(Boolean), { mainPathOnly: true });
  const incomingCurrentNodeId = incoming.currentGraphNodeId;
  const currentGraphNodeId = incomingCurrentNodeId && unlockedSet.has(incomingCurrentNodeId)
    ? incomingCurrentNodeId
    : current.currentGraphNodeId;
  return sanitizeCampaignProgress({
    ...mergedBase,
    recommendedGraphNodeId,
    currentGraphNodeId,
    furthestMainGraphNodeId,
    unlockedGraphNodeIds: Array.from(unlockedSet),
    completedGraphNodeIds,
    selectedRouteTargetBySourceNodeId,
    pendingRouteChoice: incoming.pendingRouteChoice ?? current.pendingRouteChoice
  }, lifetimeStats, now);
};

const apiError = (message, statusCode, details = {}) => Object.assign(
  new Error(message),
  { statusCode, ...details }
);

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const text = (value, maxLength) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const stringList = (value, { maxItems = 100, maxLength = 80, pattern } = {}) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().slice(0, maxLength))
      .filter((item) => item && (!pattern || pattern.test(item)))
  )).slice(0, maxItems);
};

const campaignPermanentRewardIds = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, 180))
    .filter((item) => (
      item.startsWith('campaign:')
      && !item.includes(CAMPAIGN_REPLAY_REWARD_MARKER)
    ))
)).slice(-MAX_CAMPAIGN_REWARD_IDS);

const bossArchiveEventIds = (value) => {
  const requested = new Set(
    stringList(value, { maxItems: BOSS_ARCHIVE_EVENT_IDS.length, maxLength: 120 })
      .map(canonicalBossArchiveEventId)
      .filter(Boolean)
  );
  return BOSS_ARCHIVE_EVENT_IDS.filter((eventId) => requested.has(eventId));
};

const getBossArchiveChallengeConfig = (eventId) => (
  BOSS_ARCHIVE_CONFIG_BY_EVENT_ID.get(String(eventId || '').trim()) || null
);

const BOSS_ARCHIVE_MASTERY_IDS = [
  'challenge-clear',
  'no-hit-clear',
  'timed-clear'
];

const optionalIso = (value) => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const optionalDuration = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(60 * 60 * 1000, Math.round(parsed))
    : null;
};

const sanitizeBossArchiveMastery = (value) => {
  const mastery = asObject(value);
  return Object.fromEntries(BOSS_ARCHIVE_MASTERY_IDS.map((id) => {
    const objective = asObject(mastery[id]);
    const completedAt = optionalIso(objective.completedAt);
    return [id, {
      completedAt,
      claimedAt: completedAt ? optionalIso(objective.claimedAt) : null
    }];
  }));
};

const sanitizeBossArchiveLastResult = (value) => {
  const result = asObject(value);
  const playedAt = optionalIso(result.playedAt);
  if (!playedAt || !['practice', 'challenge'].includes(result.mode)) return null;
  return {
    mode: result.mode,
    difficultyId: BOSS_ARCHIVE_DIFFICULTY_IDS.includes(result.difficultyId)
      ? result.difficultyId
      : 'medium',
    victory: result.victory === true,
    clearTimeMs: optionalDuration(result.clearTimeMs),
    damageTaken: integer(result.damageTaken, 0, 1_000_000),
    playedAt
  };
};

const sanitizeBossArchiveDifficultyRecord = (value) => {
  const record = asObject(value);
  const clears = integer(record.clears, 0, 1_000_000_000);
  const attempts = Math.max(clears, integer(record.attempts, 0, 1_000_000_000));
  return {
    attempts,
    clears,
    noHitClears: integer(record.noHitClears, 0, clears),
    bestClearTimeMs: optionalDuration(record.bestClearTimeMs),
    bestNoHitTimeMs: optionalDuration(record.bestNoHitTimeMs),
    processedResultIds: stringList(record.processedResultIds, {
      maxItems: 64,
      maxLength: 120
    })
  };
};

const sanitizeBossArchiveDifficultyRecords = (value) => {
  const records = asObject(value);
  return Object.fromEntries(BOSS_ARCHIVE_DIFFICULTY_IDS.flatMap((difficultyId) => (
    records[difficultyId]
      && typeof records[difficultyId] === 'object'
      && !Array.isArray(records[difficultyId])
      ? [[difficultyId, sanitizeBossArchiveDifficultyRecord(records[difficultyId])]]
      : []
  )));
};

const sanitizeBossArchiveRecord = (value) => {
  const record = asObject(value);
  const practiceAttempts = integer(record.practiceAttempts, 0, 1_000_000_000);
  const challengeAttempts = integer(record.challengeAttempts, 0, 1_000_000_000);
  const practiceClears = integer(record.practiceClears, 0, practiceAttempts);
  const challengeClears = integer(record.challengeClears, 0, challengeAttempts);
  const totalClears = Math.max(
    practiceClears + challengeClears,
    integer(record.totalClears, 0, 1_000_000_000)
  );
  const attempts = Math.max(
    totalClears,
    practiceAttempts + challengeAttempts,
    integer(record.attempts, 0, 1_000_000_000)
  );
  const noHitClears = integer(record.noHitClears, 0, totalClears);
  const bestClearTimeMs = optionalDuration(record.bestClearTimeMs);
  const bestNoHitTimeMs = optionalDuration(record.bestNoHitTimeMs);
  const storedDifficultyRecords = sanitizeBossArchiveDifficultyRecords(record.difficultyRecords);
  const hasStoredDifficultyRecords = Object.keys(storedDifficultyRecords).length > 0;
  const difficultyRecords = Object.fromEntries(BOSS_ARCHIVE_DIFFICULTY_IDS.map((difficultyId) => [
    difficultyId,
    storedDifficultyRecords[difficultyId] || (
      difficultyId === 'medium' && !hasStoredDifficultyRecords
        ? {
            ...sanitizeBossArchiveDifficultyRecord(null),
            attempts,
            clears: totalClears,
            noHitClears,
            bestClearTimeMs,
            bestNoHitTimeMs
          }
        : sanitizeBossArchiveDifficultyRecord(null)
    )
  ]));
  return {
    attempts,
    practiceAttempts,
    challengeAttempts,
    totalClears,
    practiceClears,
    challengeClears,
    noHitClears,
    bestClearTimeMs,
    bestChallengeTimeMs: optionalDuration(record.bestChallengeTimeMs),
    bestNoHitTimeMs,
    difficultyRecords,
    mastery: sanitizeBossArchiveMastery(record.mastery),
    processedResultIds: stringList(record.processedResultIds, {
      maxItems: 64,
      maxLength: 120
    }),
    lastResult: sanitizeBossArchiveLastResult(record.lastResult)
  };
};

const mergeMigratedBossArchiveRecords = (values) => values
  .map(sanitizeBossArchiveRecord)
  .reduce((merged, record) => {
    const earliest = (left, right) => {
      if (!left) return right;
      if (!right) return left;
      return left < right ? left : right;
    };
    const shortest = (left, right) => {
      if (left === null) return right;
      if (right === null) return left;
      return Math.min(left, right);
    };
    const latestResult = !merged.lastResult
      || (record.lastResult?.playedAt || '') > merged.lastResult.playedAt
      ? record.lastResult
      : merged.lastResult;
    return {
      attempts: integer(merged.attempts + record.attempts, 0, 1_000_000_000),
      practiceAttempts: integer(
        merged.practiceAttempts + record.practiceAttempts,
        0,
        1_000_000_000
      ),
      challengeAttempts: integer(
        merged.challengeAttempts + record.challengeAttempts,
        0,
        1_000_000_000
      ),
      totalClears: integer(merged.totalClears + record.totalClears, 0, 1_000_000_000),
      practiceClears: integer(merged.practiceClears + record.practiceClears, 0, 1_000_000_000),
      challengeClears: integer(merged.challengeClears + record.challengeClears, 0, 1_000_000_000),
      noHitClears: integer(merged.noHitClears + record.noHitClears, 0, 1_000_000_000),
      bestClearTimeMs: shortest(merged.bestClearTimeMs, record.bestClearTimeMs),
      bestChallengeTimeMs: shortest(
        merged.bestChallengeTimeMs,
        record.bestChallengeTimeMs
      ),
      bestNoHitTimeMs: shortest(merged.bestNoHitTimeMs, record.bestNoHitTimeMs),
      difficultyRecords: Object.fromEntries(BOSS_ARCHIVE_DIFFICULTY_IDS.flatMap((difficultyId) => {
        const left = merged.difficultyRecords[difficultyId];
        const right = record.difficultyRecords[difficultyId];
        if (!left && !right) return [];
        const leftRecord = sanitizeBossArchiveDifficultyRecord(left);
        const rightRecord = sanitizeBossArchiveDifficultyRecord(right);
        return [[difficultyId, {
          attempts: integer(leftRecord.attempts + rightRecord.attempts, 0, 1_000_000_000),
          clears: integer(leftRecord.clears + rightRecord.clears, 0, 1_000_000_000),
          noHitClears: integer(
            leftRecord.noHitClears + rightRecord.noHitClears,
            0,
            1_000_000_000
          ),
          bestClearTimeMs: shortest(leftRecord.bestClearTimeMs, rightRecord.bestClearTimeMs),
          bestNoHitTimeMs: shortest(leftRecord.bestNoHitTimeMs, rightRecord.bestNoHitTimeMs),
          processedResultIds: stringList([
            ...leftRecord.processedResultIds,
            ...rightRecord.processedResultIds
          ], { maxItems: 64, maxLength: 120 })
        }]];
      })),
      mastery: Object.fromEntries(BOSS_ARCHIVE_MASTERY_IDS.map((id) => [id, {
        completedAt: earliest(merged.mastery[id].completedAt, record.mastery[id].completedAt),
        claimedAt: earliest(merged.mastery[id].claimedAt, record.mastery[id].claimedAt)
      }])),
      processedResultIds: stringList([
        ...merged.processedResultIds,
        ...record.processedResultIds
      ], { maxItems: 64, maxLength: 120 }),
      lastResult: latestResult
    };
  }, sanitizeBossArchiveRecord(null));

const sanitizeBossArchiveProgress = (value, unlockedEventIds, now) => {
  const archive = asObject(value);
  const unlockedSet = new Set(unlockedEventIds);
  const records = asObject(archive.records);
  const dailyChallenge = asObject(archive.dailyChallenge);
  const dailyAttempts = asObject(archive.dailyAttempts);
  const utcDateKey = isoNow(now).slice(0, 10);
  const storedDateKey = typeof dailyChallenge.utcDateKey === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dailyChallenge.utcDateKey)
    ? dailyChallenge.utcDateKey
    : utcDateKey;
  const normalizedLastSelectedEventId = canonicalBossArchiveEventId(archive.lastSelectedEventId);
  const lastSelectedEventId = normalizedLastSelectedEventId
    && unlockedSet.has(normalizedLastSelectedEventId)
    ? normalizedLastSelectedEventId
    : null;
  const sanitizedDailyChallenge = storedDateKey === utcDateKey
    ? {
        utcDateKey,
        successfulClearsUsed: integer(dailyChallenge.successfulClearsUsed, 0, 99),
        processedClearIds: stringList(dailyChallenge.processedClearIds, {
          maxItems: 64,
          maxLength: 120
        })
      }
    : {
        utcDateKey,
        successfulClearsUsed: 0,
        processedClearIds: []
      };
  const storedAttemptDateKey = typeof dailyAttempts.utcDateKey === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dailyAttempts.utcDateKey)
    ? dailyAttempts.utcDateKey
    : null;
  const hasStoredDailyAttempts = Object.keys(dailyAttempts).length > 0;
  const hasCurrentDailyAttempts = storedAttemptDateKey === utcDateKey;
  const legacyAttemptIds = sanitizedDailyChallenge.processedClearIds;
  const sanitizedDailyAttempts = {
    utcDateKey,
    attemptsUsed: hasCurrentDailyAttempts
      ? integer(dailyAttempts.attemptsUsed, 0, BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT)
      : !hasStoredDailyAttempts ? Math.min(
          BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT,
          sanitizedDailyChallenge.successfulClearsUsed
        ) : 0,
    processedAttemptIds: stringList(
      hasStoredDailyAttempts ? dailyAttempts.processedAttemptIds : legacyAttemptIds,
      { maxItems: 64, maxLength: 120 }
    )
  };
  return {
    version: BOSS_ARCHIVE_PROGRESS_VERSION,
    unlockedEventIds,
    seenEventIds: bossArchiveEventIds(archive.seenEventIds)
      .filter((eventId) => unlockedSet.has(eventId)),
    lastSelectedEventId,
    records: Object.fromEntries(BOSS_ARCHIVE_EVENT_IDS.flatMap((eventId) => {
      const migratedValues = Object.entries(records)
        .filter(([storedEventId]) => canonicalBossArchiveEventId(storedEventId) === eventId)
        .map(([, record]) => record);
      return migratedValues.length === 0
        ? []
        : [[eventId, mergeMigratedBossArchiveRecords(migratedValues)]];
    })),
    dailyChallenge: sanitizedDailyChallenge,
    dailyAttempts: sanitizedDailyAttempts
  };
};

const earliestIso = (left, right) => {
  const normalizedLeft = optionalIso(left);
  const normalizedRight = optionalIso(right);
  if (!normalizedLeft) return normalizedRight;
  if (!normalizedRight) return normalizedLeft;
  return normalizedLeft < normalizedRight ? normalizedLeft : normalizedRight;
};

const minimumDuration = (left, right) => {
  const normalizedLeft = optionalDuration(left);
  const normalizedRight = optionalDuration(right);
  if (normalizedLeft === null) return normalizedRight;
  if (normalizedRight === null) return normalizedLeft;
  return Math.min(normalizedLeft, normalizedRight);
};

const mergeProtectedBossArchiveRecord = (currentValue, incomingValue) => {
  const current = sanitizeBossArchiveRecord(currentValue);
  const incoming = sanitizeBossArchiveRecord(incomingValue);
  const currentPlayedAt = current.lastResult?.playedAt || '';
  const incomingPlayedAt = incoming.lastResult?.playedAt || '';
  const practiceAttempts = Math.max(current.practiceAttempts, incoming.practiceAttempts);
  const practiceClears = Math.max(current.practiceClears, incoming.practiceClears);
  const incomingPracticeResult = incoming.lastResult?.mode === 'practice'
    && incomingPlayedAt >= currentPlayedAt;
  return {
    // Practice remains local/offline-capable. Official Challenge fields are
    // copied only from the canonical row and change only through settlement.
    attempts: Math.max(current.attempts, current.challengeAttempts + practiceAttempts),
    practiceAttempts,
    challengeAttempts: current.challengeAttempts,
    totalClears: Math.max(current.totalClears, current.challengeClears + practiceClears),
    practiceClears,
    challengeClears: current.challengeClears,
    noHitClears: Math.max(current.noHitClears, incoming.noHitClears),
    bestClearTimeMs: minimumDuration(current.bestClearTimeMs, incoming.bestClearTimeMs),
    bestChallengeTimeMs: current.bestChallengeTimeMs,
    bestNoHitTimeMs: minimumDuration(current.bestNoHitTimeMs, incoming.bestNoHitTimeMs),
    difficultyRecords: current.difficultyRecords,
    mastery: Object.fromEntries(BOSS_ARCHIVE_MASTERY_IDS.map((id) => [id, {
      completedAt: current.mastery[id]?.completedAt ?? null,
      // Claiming a completed cosmetic node remains a normal profile action;
      // an ordinary save cannot invent the completion that makes it claimable.
      claimedAt: current.mastery[id]?.completedAt
        ? earliestIso(current.mastery[id]?.claimedAt, incoming.mastery[id]?.claimedAt)
        : null
    }])),
    processedResultIds: current.processedResultIds,
    lastResult: incomingPracticeResult
      ? incoming.lastResult
      : current.lastResult
  };
};

const preserveBossArchiveServerState = ({
  currentSnapshot,
  incomingSnapshot,
  dailyLedger = null,
  now
}) => {
  if (!currentSnapshot) return incomingSnapshot;
  const currentArchive = currentSnapshot.permanentState.bossArchive;
  const incomingArchive = incomingSnapshot.permanentState.bossArchive;
  const unlockedEventIds = bossArchiveEventIds([
    ...currentArchive.unlockedEventIds,
    ...incomingArchive.unlockedEventIds
  ]);
  const unlockedSet = new Set(unlockedEventIds);
  const seenEventIds = bossArchiveEventIds([
    ...currentArchive.seenEventIds,
    ...incomingArchive.seenEventIds
  ]).filter((eventId) => unlockedSet.has(eventId));
  const records = Object.fromEntries(BOSS_ARCHIVE_EVENT_IDS.flatMap((eventId) => {
    const currentRecord = currentArchive.records[eventId];
    const incomingRecord = incomingArchive.records[eventId];
    return currentRecord || incomingRecord
      ? [[eventId, mergeProtectedBossArchiveRecord(currentRecord, incomingRecord)]]
      : [];
  }));
  const utcDateKey = isoNow(now).slice(0, 10);
  const currentDaily = currentArchive.dailyChallenge.utcDateKey === utcDateKey
    ? currentArchive.dailyChallenge
    : { utcDateKey, successfulClearsUsed: 0, processedClearIds: [] };
  const incomingDaily = incomingArchive.dailyChallenge.utcDateKey === utcDateKey
    ? incomingArchive.dailyChallenge
    : { utcDateKey, successfulClearsUsed: 0, processedClearIds: [] };
  const ledgerIds = Array.isArray(dailyLedger)
    ? dailyLedger.map((row) => `boss-archive:${row.result_id}`)
    : [];
  const dailyChallenge = {
    utcDateKey,
    successfulClearsUsed: Array.isArray(dailyLedger)
      ? Math.min(99, dailyLedger.length)
      : Math.max(currentDaily.successfulClearsUsed, incomingDaily.successfulClearsUsed),
    processedClearIds: stringList([
      ...currentDaily.processedClearIds,
      ...incomingDaily.processedClearIds,
      ...ledgerIds
    ], { maxItems: 64, maxLength: 120 })
  };
  const storedDailyAttempts = currentArchive.dailyAttempts ?? {};
  const currentDailyAttempts = storedDailyAttempts.utcDateKey === utcDateKey
    ? storedDailyAttempts
    : {
        utcDateKey,
        attemptsUsed: 0,
        processedAttemptIds: storedDailyAttempts.processedAttemptIds ?? []
      };
  const dailyAttempts = {
    utcDateKey,
    // Attempt consumption is server-owned. A normal client save can neither
    // restore a spent charge nor manufacture an idempotency receipt.
    // Successful-clear rows may belong to fights launched before UTC reset,
    // so the launch ledger alone is authoritative for today's charge count.
    attemptsUsed: integer(
      currentDailyAttempts.attemptsUsed,
      0,
      BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT
    ),
    processedAttemptIds: stringList(currentDailyAttempts.processedAttemptIds, {
      maxItems: 64,
      maxLength: 120
    })
  };
  const requestedSelection = incomingArchive.lastSelectedEventId
    ?? currentArchive.lastSelectedEventId;
  return {
    ...incomingSnapshot,
    permanentState: {
      ...incomingSnapshot.permanentState,
      bossArchive: {
        ...incomingArchive,
        unlockedEventIds,
        seenEventIds,
        lastSelectedEventId: requestedSelection && unlockedSet.has(requestedSelection)
          ? requestedSelection
          : null,
        records,
        dailyChallenge,
        dailyAttempts
      }
    }
  };
};

/**
 * Campaign branch results are server-owned. Ordinary profile saves may update
 * harmless discovery/view state, but cannot introduce completion, claim, or
 * reward receipts that were not already present in the canonical profile.
 */
const preserveCampaignBranchServerState = ({
  currentSnapshot,
  incomingSnapshot,
  now,
  branchDefinitions = CAMPAIGN_BRANCHES
}) => {
  const currentCampaign = asObject(currentSnapshot?.permanentState?.campaignProgress);
  const incomingCampaign = mergeCampaignGraphProgress({
    currentProgress: currentSnapshot?.permanentState?.campaignProgress,
    incomingProgress: incomingSnapshot.permanentState?.campaignProgress,
    lifetimeStats: incomingSnapshot.permanentState?.lifetimeStats,
    now
  });
  const current = asObject(currentCampaign.branchProgress);
  const incoming = asObject(incomingCampaign.branchProgress);
  const mergeSafeIds = (field) => [
    ...(Array.isArray(current[field]) ? current[field] : []),
    ...(Array.isArray(incoming[field]) ? incoming[field] : [])
  ];
  const branchProgress = sanitizeCampaignBranchProgress({
    unlockedBranchIds: Array.isArray(current.unlockedBranchIds) ? current.unlockedBranchIds : [],
    newBranchIds: mergeSafeIds('newBranchIds'),
    viewedBranchIds: mergeSafeIds('viewedBranchIds'),
    founderLockedBranchIds: Array.isArray(current.founderLockedBranchIds)
      ? current.founderLockedBranchIds
      : [],
    completedBranchIds: Array.isArray(current.completedBranchIds) ? current.completedBranchIds : [],
    claimedBranchIds: Array.isArray(current.claimedBranchIds) ? current.claimedBranchIds : [],
    processedAttemptIds: Array.isArray(current.processedAttemptIds) ? current.processedAttemptIds : [],
    claimedRewardReceiptIds: Array.isArray(current.claimedRewardReceiptIds)
      ? current.claimedRewardReceiptIds
      : [],
    attemptReceipts: Array.isArray(current.attemptReceipts) ? current.attemptReceipts : []
  }, incomingCampaign.missionRecords, now, branchDefinitions);
  if (Array.isArray(current.founderLockedBranchIds)) {
    branchProgress.founderLockedBranchIds = [...current.founderLockedBranchIds];
  }
  const currentReplayEpochs = asObject(currentCampaign.replayRewardEpochByMission);
  const incomingReplayEpochs = asObject(incomingCampaign.replayRewardEpochByMission);
  const replayRewardEpochByMission = Object.fromEntries(CAMPAIGN_LEVEL_IDS.flatMap((missionId) => {
    const currentEpoch = typeof currentReplayEpochs[missionId] === 'string'
      ? currentReplayEpochs[missionId]
      : '';
    const incomingEpoch = typeof incomingReplayEpochs[missionId] === 'string'
      ? incomingReplayEpochs[missionId]
      : '';
    const epoch = currentEpoch > incomingEpoch ? currentEpoch : incomingEpoch;
    return epoch ? [[missionId, epoch]] : [];
  }));
  const currentCreditedRewardIds = stringList(
    currentSnapshot?.weeklyState?.creditedCampaignRewardIds,
    { maxItems: MAX_CREDITED_CAMPAIGN_REWARD_IDS, maxLength: 180 }
  ).filter((id) => id.startsWith('campaign:') || id.startsWith('campaign-branch:'));
  const currentBranchRewardIds = currentCreditedRewardIds
    .filter((id) => id.startsWith('campaign-branch:'));
  const currentNonBranchRewardIds = currentCreditedRewardIds
    .filter((id) => id.startsWith('campaign:'));
  const incomingNonBranchRewardIds = stringList(
    incomingSnapshot.weeklyState?.creditedCampaignRewardIds,
    { maxItems: MAX_CREDITED_CAMPAIGN_REWARD_IDS, maxLength: 180 }
  ).filter((id) => !id.startsWith('campaign-branch:'));
  const nonBranchCapacity = Math.max(
    0,
    MAX_CREDITED_CAMPAIGN_REWARD_IDS - currentBranchRewardIds.length
  );
  const mergedNonBranchRewardIds = nonBranchCapacity > 0
    ? Array.from(new Set([
        ...currentNonBranchRewardIds,
        ...incomingNonBranchRewardIds
      ])).slice(-nonBranchCapacity)
    : [];
  return {
    ...incomingSnapshot,
    weeklyState: {
      ...incomingSnapshot.weeklyState,
      creditedCampaignRewardIds: Array.from(new Set([
        ...mergedNonBranchRewardIds,
        ...currentBranchRewardIds
      ])).slice(-MAX_CREDITED_CAMPAIGN_REWARD_IDS)
    },
    permanentState: {
      ...incomingSnapshot.permanentState,
      campaignProgress: {
        ...incomingCampaign,
        replayRewardEpochByMission,
        branchProgress
      }
    }
  };
};

const fetchBossArchiveDailyLedger = async (address, now = Date.now()) => {
  const walletAddress = normalizeWalletAddress(address);
  const utcDateKey = isoNow(now).slice(0, 10);
  if (!walletAddress) return null;
  try {
    const rows = await fetchSupabaseJson(
      `${BOSS_ARCHIVE_RESULTS_TABLE}?select=result_id&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + `&utc_date=eq.${encodeURIComponent(utcDateKey)}&order=settled_at.asc&limit=99`,
      { headers: supabaseHeaders() }
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (/PGRST205|schema cache|Could not find the table/i.test(String(error?.message || ''))) {
      return null;
    }
    throw error;
  }
};

const inferLegacyBossArchiveEventIds = (lifetimeStats) => {
  const highestMission = integer(lifetimeStats.highestWave, 0, FINAL_CAMPAIGN_MISSION);
  const bossesDefeated = integer(lifetimeStats.bossesDefeated, 0, 1_000_000_000);
  const campaignCompleted = highestMission >= FINAL_CAMPAIGN_MISSION
    && bossesDefeated >= FINAL_CAMPAIGN_MISSION;
  const completedThrough = campaignCompleted
    ? FINAL_CAMPAIGN_MISSION
    : Math.max(0, Math.min(FINAL_CAMPAIGN_MISSION, highestMission - 1));

  if (completedThrough > 0) {
    const inferred = BOSS_ARCHIVE_ENTRIES
      .filter((entry) => entry.missionNumber <= completedThrough)
      .map((entry) => entry.eventId);
    if (inferred.length > 0 || bossesDefeated === 0) return inferred;

    // Pre-v22 early Gatekeeper variants collapse into the canonical first
    // sector boss, so retain that earned unlock even before Mission 5.
    return BOSS_ARCHIVE_EVENT_IDS.slice(0, 1);
  }
  if (highestMission === 0 && bossesDefeated > 0) {
    return BOSS_ARCHIVE_EVENT_IDS.slice(0, Math.min(bossesDefeated, BOSS_ARCHIVE_EVENT_IDS.length));
  }
  return [];
};

const isoNow = (now) => new Date(now).toISOString();
const MAIN_SHIP_FIRE_RATE_MAX_LEVEL = 49;
const MAIN_SHIP_STANDARD_UPGRADE_MAX_LEVEL = 7;

const createUpgradeLevels = () => ({
  fireRate: 0,
  speed: 0,
  startingHearts: 0
});

const createShipUpgrades = () => Object.fromEntries(
  PLAYER_SHIP_IDS.map((shipId) => [shipId, createUpgradeLevels()])
);

const createWeeklyState = (profileId, now) => ({
  version: 4,
  profileId,
  weekKey: getWeeklyBoundaryMeta(new Date(now)).weekKey,
  coins: 0,
  durableCampaignCoins: 0,
  unlockedSlots: { left: false, right: false },
  ownedMiniShips: {},
  equipped: { left: null, right: null },
  shipUpgrades: createShipUpgrades(),
  creditedCampaignRewardIds: [],
  weeklyCampaignStreak: null,
  weeklyStats: {
    runs: 0,
    score: 0,
    enemiesDefeated: 0,
    coinsEarned: 0
  },
  updatedAt: isoNow(now)
});

const WEEKLY_CAMPAIGN_SCORE_RULES = Object.freeze({
  regularEnemy: 12,
  eliteEnemy: 45,
  waveClear: 150,
  missionClear: 650,
  miniBoss: 500,
  majorBoss: 1600,
  noDamage: 300,
  accuracy90: 200,
  accuracy75: 100,
  parTime: 150,
  nearParTime: 75,
  threeStarQuality: 400,
  remainingLife: 20,
  maximumRemainingLives: 10,
  consecutiveStep: 0.015,
  maximumConsecutiveBonus: 0.15,
  routeRiskMultiplier: { low: 1, moderate: 1.05, high: 1.1 },
  minimumAuthoredMultiplier: 1,
  maximumCombinedRouteMultiplier: 1.5
});

const WEEKLY_CAMPAIGN_PROOF_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const WEEKLY_CAMPAIGN_PROOF_MAX_MISSION_DURATION_MS = 90 * 60 * 1000;

const getWeeklyMissionOutcomeLimits = (node) => {
  const level = CAMPAIGN_LEVEL_BY_ID.get(node?.missionDefinitionId);
  if (!level) return null;
  const waves = Array.isArray(level.waves) ? level.waves : [];
  const authoredSpawnBudget = waves.reduce((missionTotal, wave) => (
    (Array.isArray(wave?.events) ? wave.events : []).reduce((waveTotal, event) => {
      if (!['spawn', 'formation', 'elite'].includes(event?.kind)) return waveTotal;
      const enemies = Array.isArray(event?.enemies) ? event.enemies : [];
      const explicitCount = Math.max(0, Math.floor(Number(event?.count) || 0));
      const spawnCount = Math.max(explicitCount, enemies.length);
      return {
        total: waveTotal.total + spawnCount,
        elite: waveTotal.elite + (enemies.some((enemy) => enemy?.rank === 'elite') ? spawnCount : 0)
      };
    }, missionTotal)
  ), { total: 0, elite: 0 });
  const minimumElapsedMs = Math.max(1_000, Math.floor(
    waves.reduce((total, wave) => (
      wave?.completionRule === 'clear-after-duration'
        ? total + Math.max(0, Number(wave.durationSeconds) || 0)
        : total
    ), 0) * 1_000 * 0.8
  ));
  const masteryObjectives = Array.isArray(level.campaignProgression?.masteryObjectives)
    ? level.campaignProgression.masteryObjectives
    : [];
  const parTimeObjective = masteryObjectives.find((objective) => objective?.kind === 'time-at-most');
  const authoredBossIds = waves.flatMap((wave) => (
    Array.isArray(wave?.events)
      ? wave.events.filter((event) => event?.kind === 'boss' && typeof event.bossId === 'string')
        .map((event) => event.bossId)
      : []
  ));
  const majorBossKillCeiling = node?.bossId
    ? authoredBossIds.filter((bossId) => bossId === node.bossId).length
    : 0;
  const miniBossKillCeiling = Math.max(0, authoredBossIds.length - majorBossKillCeiling);
  return {
    waveCount: waves.length,
    // Formation controllers and carrier-style units can create bounded
    // children, so leave conservative slack while rejecting fabricated
    // five-figure totals for a single Mission.
    nonBossKillCeiling: Math.max(25, authoredSpawnBudget.total * 4 + 25),
    regularEnemyKillCeiling: Math.max(25, authoredSpawnBudget.total * 4 + 25),
    eliteKillCeiling: authoredSpawnBudget.elite,
    miniBossKillCeiling,
    majorBossKillCeiling,
    minimumElapsedMs,
    parTimeMs: Number(parTimeObjective?.target) > 0
      ? Math.floor(Number(parTimeObjective.target) * 1_000)
      : null,
    masteryObjectives
  };
};

const calculateWeeklyPerformanceStars = (limits, outcome) => {
  if (!limits || !outcome?.missionCompleted) return 0;
  return limits.masteryObjectives.reduce((stars, objective) => {
    if (stars >= 3) return stars;
    if (objective?.kind === 'complete') return stars + 1;
    if (objective?.kind === 'damage-at-most') {
      return outcome.damageTaken <= Number(objective.target) ? stars + 1 : stars;
    }
    if (objective?.kind === 'time-at-most') {
      return outcome.elapsedMs !== null && outcome.elapsedMs <= Number(objective.target) * 1_000
        ? stars + 1
        : stars;
    }
    // Weekly receipts deliberately do not trust Campaign coin or raw score
    // aggregates. Those objective kinds therefore cannot award a server star.
    return stars;
  }, 0);
};

const strictWeeklyInteger = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) return null;
  return numeric;
};

const strictWeeklyTimestamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const timestamp = Math.floor(numeric);
  return timestamp >= minimum && timestamp <= maximum ? timestamp : null;
};

const weeklyCampaignPrefixDigest = (streak, {
  visitedNodeCount = streak.visitedNodeIds.length,
  committedRouteCount = streak.committedRoutes.length,
  scoreEventCount = streak.scoreEvents.length
} = {}) => crypto.createHash('sha256').update(JSON.stringify({
  schemaVersion: streak.schemaVersion,
  weeklyId: streak.weeklyId,
  resetAtMs: streak.resetAtMs,
  startNodeId: streak.startNodeId,
  createdAtMs: streak.createdAtMs,
  visitedNodeIds: streak.visitedNodeIds.slice(0, visitedNodeCount),
  committedRoutes: streak.committedRoutes.slice(0, committedRouteCount),
  scoreEvents: streak.scoreEvents.slice(0, scoreEventCount).map((event) => ({
    eventId: event.eventId,
    nodeId: event.nodeId,
    occurredAtMs: event.occurredAtMs,
    outcome: event.outcome
  }))
})).digest('hex');

const canonicalizeWeeklyCampaignStreakServer = (
  rawValue,
  boundary,
  now,
  { requireFinalized = false, expectedBinding = null } = {}
) => {
  const fail = (code) => ({ streak: null, error: code });
  const value = asObject(rawValue);
  if (!CAMPAIGN_GRAPH || Object.keys(value).length === 0) return fail('weekly_proof_missing');
  if (value.schemaVersion !== 1) return fail('weekly_schema_invalid');
  const revision = strictWeeklyInteger(value.revision, 1, Number.MAX_SAFE_INTEGER);
  if (revision === null) return fail('weekly_revision_invalid');
  if (value.weeklyId !== boundary.weekKey) return fail('weekly_boundary_invalid');
  const resetAtMs = strictWeeklyInteger(value.resetAtMs, 1, Number.MAX_SAFE_INTEGER);
  if (resetAtMs !== boundary.endsAt.getTime() || now >= resetAtMs) {
    return fail('weekly_boundary_invalid');
  }

  const startNodeId = typeof value.startNodeId === 'string' ? value.startNodeId : '';
  const startNode = CAMPAIGN_GRAPH_NODE_BY_ID.get(startNodeId);
  if (!startNode?.weeklyStreakEligible) return fail('weekly_start_node_invalid');
  if (
    expectedBinding
    && (
      expectedBinding.weeklyId !== boundary.weekKey
      || expectedBinding.resetAtMs !== resetAtMs
      || (expectedBinding.startNodeId && expectedBinding.startNodeId !== startNodeId)
    )
  ) return fail('weekly_start_binding_mismatch');

  const latestAllowedTimestamp = now + WEEKLY_CAMPAIGN_PROOF_MAX_CLOCK_SKEW_MS;
  const createdAtMs = strictWeeklyTimestamp(
    value.createdAtMs,
    boundary.startsAt.getTime(),
    Math.min(resetAtMs - 1, latestAllowedTimestamp)
  );
  const updatedAtMs = createdAtMs === null
    ? null
    : strictWeeklyTimestamp(
        value.updatedAtMs,
        createdAtMs,
        Math.min(resetAtMs - 1, latestAllowedTimestamp)
      );
  if (createdAtMs === null || updatedAtMs === null) return fail('weekly_timestamps_invalid');
  if (expectedBinding?.createdAtMs !== undefined && expectedBinding.createdAtMs !== createdAtMs) {
    return fail('weekly_start_binding_mismatch');
  }

  const rawVisitedNodeIds = Array.isArray(value.visitedNodeIds) ? value.visitedNodeIds : [];
  const rawCommitments = Array.isArray(value.committedRoutes) ? value.committedRoutes : [];
  if (
    rawVisitedNodeIds.length < 1
    || rawVisitedNodeIds.length > CAMPAIGN_GRAPH_NODE_IDS.length
    || rawVisitedNodeIds[0] !== startNodeId
    || new Set(rawVisitedNodeIds).size !== rawVisitedNodeIds.length
    || rawCommitments.length !== rawVisitedNodeIds.length - 1
  ) return fail('weekly_route_order_invalid');

  const committedRoutes = [];
  const visitedNodeIds = [startNodeId];
  const committedEdgeIds = new Set();
  let currentNodeId = startNodeId;
  for (let index = 0; index < rawCommitments.length; index += 1) {
    const commitment = asObject(rawCommitments[index]);
    const edgeId = typeof commitment.edgeId === 'string' ? commitment.edgeId : '';
    const edge = CAMPAIGN_GRAPH_EDGE_BY_ID.get(edgeId);
    const target = edge ? CAMPAIGN_GRAPH_NODE_BY_ID.get(edge.toNodeId) : null;
    if (
      !edge
      || committedEdgeIds.has(edge.edgeId)
      || edge.fromNodeId !== currentNodeId
      || commitment.fromNodeId !== currentNodeId
      || commitment.toNodeId !== edge.toNodeId
      || rawVisitedNodeIds[index + 1] !== edge.toNodeId
      || !target?.weeklyStreakEligible
      || visitedNodeIds.includes(edge.toNodeId)
    ) return fail('weekly_route_order_invalid');
    const prerequisites = Array.isArray(target.prerequisiteNodeIds)
      ? target.prerequisiteNodeIds
      : [];
    const prerequisitesMet = prerequisites.length === 0
      || (target.prerequisiteMode === 'any'
        ? prerequisites.some((nodeId) => visitedNodeIds.includes(nodeId))
        : prerequisites.every((nodeId) => visitedNodeIds.includes(nodeId)));
    if (!prerequisitesMet) return fail('weekly_prerequisites_invalid');
    const committedAtMs = strictWeeklyTimestamp(
      commitment.committedAtMs,
      createdAtMs,
      updatedAtMs
    );
    if (
      committedAtMs === null
      || (committedRoutes.length > 0
        && committedAtMs <= committedRoutes[committedRoutes.length - 1].committedAtMs)
    ) return fail('weekly_timestamps_invalid');
    committedRoutes.push({
      edgeId: edge.edgeId,
      fromNodeId: currentNodeId,
      toNodeId: edge.toNodeId,
      routeId: edge.routeId,
      risk: ['low', 'moderate', 'high'].includes(edge.risk) ? edge.risk : 'low',
      committedAtMs
    });
    committedEdgeIds.add(edge.edgeId);
    currentNodeId = edge.toNodeId;
    visitedNodeIds.push(currentNodeId);
  }
  if (value.currentNodeId !== currentNodeId) return fail('weekly_route_order_invalid');

  const rawScoreEvents = Array.isArray(value.scoreEvents) ? value.scoreEvents : [];
  const rawScoredNodeIds = Array.isArray(value.scoredNodeIds) ? value.scoredNodeIds : [];
  if (
    (requireFinalized && rawScoreEvents.length < 1)
    || rawScoreEvents.length > visitedNodeIds.length
    || rawScoreEvents.length !== rawScoredNodeIds.length
    || new Set(rawScoredNodeIds).size !== rawScoredNodeIds.length
  ) return fail('weekly_score_event_order_invalid');

  const rawEventIds = new Set();
  const scoreEvents = [];
  const score = {
    totalPoints: 0,
    enemyPoints: 0,
    elitePoints: 0,
    wavePoints: 0,
    missionPoints: 0,
    miniBossPoints: 0,
    majorBossPoints: 0,
    performancePoints: 0,
    remainingLifePoints: 0,
    routeBonusPoints: 0,
    consecutiveBonusPoints: 0,
    completedNodeCount: 0,
    eventCount: 0
  };
  let previousEventTimestamp = createdAtMs;
  for (let index = 0; index < rawScoreEvents.length; index += 1) {
    const event = asObject(rawScoreEvents[index]);
    const nodeId = visitedNodeIds[index];
    const node = CAMPAIGN_GRAPH_NODE_BY_ID.get(nodeId);
    const eventId = typeof event.eventId === 'string' ? event.eventId.trim() : '';
    if (
      !node
      || event.nodeId !== nodeId
      || rawScoredNodeIds[index] !== nodeId
      || !eventId
      || eventId.length > 180
      || rawEventIds.has(eventId)
    ) return fail('weekly_score_event_order_invalid');
    const occurredAtMs = strictWeeklyTimestamp(event.occurredAtMs, previousEventTimestamp, updatedAtMs);
    if (occurredAtMs === null || occurredAtMs <= previousEventTimestamp) {
      return fail('weekly_timestamps_invalid');
    }
    const limits = getWeeklyMissionOutcomeLimits(node);
    if (!limits) return fail('weekly_mission_definition_missing');
    const outcomeValue = asObject(event.outcome);
    const regularEnemyKills = strictWeeklyInteger(
      outcomeValue.regularEnemyKills,
      0,
      limits.regularEnemyKillCeiling
    );
    const eliteKills = strictWeeklyInteger(outcomeValue.eliteKills, 0, limits.eliteKillCeiling);
    const wavesCleared = strictWeeklyInteger(outcomeValue.wavesCleared, 0, limits.waveCount);
    const miniBossKills = strictWeeklyInteger(
      outcomeValue.miniBossKills,
      0,
      limits.miniBossKillCeiling
    );
    const majorBossKills = strictWeeklyInteger(
      outcomeValue.majorBossKills,
      0,
      limits.majorBossKillCeiling
    );
    const damageTaken = strictWeeklyInteger(outcomeValue.damageTaken, 0, 1_000_000);
    const livesRemaining = strictWeeklyInteger(
      outcomeValue.livesRemaining,
      0,
      WEEKLY_CAMPAIGN_SCORE_RULES.maximumRemainingLives
    );
    const accuracy = outcomeValue.accuracy === null || outcomeValue.accuracy === undefined
      ? null
      : Number(outcomeValue.accuracy);
    const elapsedMs = outcomeValue.elapsedMs === null || outcomeValue.elapsedMs === undefined
      ? null
      : strictWeeklyInteger(
          outcomeValue.elapsedMs,
          1,
          WEEKLY_CAMPAIGN_PROOF_MAX_MISSION_DURATION_MS
        );
    if (
      outcomeValue.missionCompleted !== true
      || regularEnemyKills === null
      || eliteKills === null
      || regularEnemyKills + eliteKills > limits.nonBossKillCeiling
      || wavesCleared !== limits.waveCount
      || miniBossKills !== limits.miniBossKillCeiling
      || majorBossKills !== limits.majorBossKillCeiling
      || damageTaken === null
      || livesRemaining === null
      || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1))
      || (outcomeValue.elapsedMs !== null && outcomeValue.elapsedMs !== undefined && elapsedMs === null)
      || (elapsedMs !== null && elapsedMs < limits.minimumElapsedMs)
      || (requireFinalized && elapsedMs === null)
    ) return fail('weekly_outcome_impossible');

    const outcome = {
      regularEnemyKills,
      eliteKills,
      wavesCleared,
      miniBossKills,
      majorBossKills,
      missionCompleted: true,
      damageTaken,
      livesRemaining,
      accuracy,
      elapsedMs,
      parTimeMs: limits.parTimeMs,
      performanceStars: 0
    };
    outcome.performanceStars = calculateWeeklyPerformanceStars(limits, outcome);

    const incoming = index > 0 ? committedRoutes[index - 1] : null;
    const edge = incoming ? CAMPAIGN_GRAPH_EDGE_BY_ID.get(incoming.edgeId) : null;
    if (incoming && incoming.committedAtMs <= previousEventTimestamp) {
      return fail('weekly_timestamps_invalid');
    }
    if (incoming && occurredAtMs <= incoming.committedAtMs) {
      return fail('weekly_timestamps_invalid');
    }
    const enemyPoints = outcome.regularEnemyKills * WEEKLY_CAMPAIGN_SCORE_RULES.regularEnemy;
    const elitePoints = outcome.eliteKills * WEEKLY_CAMPAIGN_SCORE_RULES.eliteEnemy;
    const wavePoints = outcome.wavesCleared * WEEKLY_CAMPAIGN_SCORE_RULES.waveClear;
    const missionPoints = WEEKLY_CAMPAIGN_SCORE_RULES.missionClear;
    const miniBossPoints = outcome.miniBossKills * WEEKLY_CAMPAIGN_SCORE_RULES.miniBoss;
    const majorBossPoints = outcome.majorBossKills * WEEKLY_CAMPAIGN_SCORE_RULES.majorBoss;
    const noDamagePoints = outcome.damageTaken === 0 ? WEEKLY_CAMPAIGN_SCORE_RULES.noDamage : 0;
    const accuracyPoints = outcome.accuracy !== null && outcome.accuracy >= 0.9
      ? WEEKLY_CAMPAIGN_SCORE_RULES.accuracy90
      : outcome.accuracy !== null && outcome.accuracy >= 0.75
        ? WEEKLY_CAMPAIGN_SCORE_RULES.accuracy75
        : 0;
    const timePoints = outcome.elapsedMs !== null && outcome.parTimeMs !== null
      ? outcome.elapsedMs <= outcome.parTimeMs
        ? WEEKLY_CAMPAIGN_SCORE_RULES.parTime
        : outcome.elapsedMs <= outcome.parTimeMs * 1.2
          ? WEEKLY_CAMPAIGN_SCORE_RULES.nearParTime
          : 0
      : 0;
    const threeStarQualityPoints = outcome.performanceStars === 3
      ? WEEKLY_CAMPAIGN_SCORE_RULES.threeStarQuality
      : 0;
    const remainingLifePoints = outcome.livesRemaining * WEEKLY_CAMPAIGN_SCORE_RULES.remainingLife;
    const basePoints = enemyPoints + elitePoints + wavePoints + missionPoints + miniBossPoints
      + majorBossPoints + noDamagePoints + accuracyPoints + timePoints + threeStarQualityPoints
      + remainingLifePoints;
    const riskMultiplier = WEEKLY_CAMPAIGN_SCORE_RULES.routeRiskMultiplier[edge?.risk] || 1;
    const routeMultiplier = Math.min(
      WEEKLY_CAMPAIGN_SCORE_RULES.maximumCombinedRouteMultiplier,
      riskMultiplier * Math.max(
        WEEKLY_CAMPAIGN_SCORE_RULES.minimumAuthoredMultiplier,
        Number(edge?.weeklyScoreMultiplier) || 1
      ) * Math.max(
        WEEKLY_CAMPAIGN_SCORE_RULES.minimumAuthoredMultiplier,
        Number(node.weeklyScoreMultiplier) || 1
      )
    );
    const afterRoute = Math.round(basePoints * routeMultiplier);
    const consecutiveMultiplier = 1 + Math.min(
      score.completedNodeCount * WEEKLY_CAMPAIGN_SCORE_RULES.consecutiveStep,
      WEEKLY_CAMPAIGN_SCORE_RULES.maximumConsecutiveBonus
    );
    const totalPoints = Math.round(afterRoute * consecutiveMultiplier);
    const breakdown = {
      enemyPoints,
      elitePoints,
      wavePoints,
      missionPoints,
      miniBossPoints,
      majorBossPoints,
      noDamagePoints,
      accuracyPoints,
      timePoints,
      threeStarQualityPoints,
      remainingLifePoints,
      basePoints,
      routeMultiplier,
      routeBonusPoints: afterRoute - basePoints,
      consecutiveMultiplier,
      consecutiveBonusPoints: totalPoints - afterRoute,
      totalPoints
    };
    scoreEvents.push({ eventId, nodeId, occurredAtMs, outcome, breakdown });
    score.totalPoints += totalPoints;
    score.enemyPoints += enemyPoints;
    score.elitePoints += elitePoints;
    score.wavePoints += wavePoints;
    score.missionPoints += missionPoints;
    score.miniBossPoints += miniBossPoints;
    score.majorBossPoints += majorBossPoints;
    score.performancePoints += noDamagePoints + accuracyPoints + timePoints + threeStarQualityPoints;
    score.remainingLifePoints += remainingLifePoints;
    score.routeBonusPoints += breakdown.routeBonusPoints;
    score.consecutiveBonusPoints += breakdown.consecutiveBonusPoints;
    score.completedNodeCount += 1;
    score.eventCount += 1;
    rawEventIds.add(eventId);
    previousEventTimestamp = occurredAtMs;
  }

  // Every route commitment requires the source Mission to have been scored.
  if (scoreEvents.length < committedRoutes.length) return fail('weekly_unscored_route_advance');
  for (let index = 0; index < committedRoutes.length; index += 1) {
    if (committedRoutes[index].committedAtMs <= scoreEvents[index].occurredAtMs) {
      return fail('weekly_timestamps_invalid');
    }
  }

  const rawFinalization = asObject(value.finalization);
  const allowedReasons = new Set([
    'loss', 'deliberate-end', 'backward-selection', 'repeat-selection',
    'disconnected-selection', 'forward-route-violation', 'terminal-complete',
    'merge-conflict', 'migrated-finalized'
  ]);
  const finalized = rawFinalization.status === 'finalized';
  if (requireFinalized && !finalized) return fail('weekly_proof_not_finalized');
  if (!finalized && rawFinalization.status !== 'active') return fail('weekly_finalization_invalid');
  const reason = finalized && allowedReasons.has(rawFinalization.reason)
    ? rawFinalization.reason
    : null;
  if (finalized && !reason) return fail('weekly_finalization_invalid');
  const finalizedAtMs = finalized
    ? strictWeeklyTimestamp(rawFinalization.finalizedAtMs, previousEventTimestamp + 1, updatedAtMs)
    : null;
  if (finalized && finalizedAtMs === null) return fail('weekly_timestamps_invalid');
  if (reason === 'terminal-complete') {
    const eligibleOutgoing = (Array.isArray(CAMPAIGN_GRAPH_NODE_BY_ID.get(currentNodeId)?.outgoingEdges)
      ? CAMPAIGN_GRAPH_NODE_BY_ID.get(currentNodeId).outgoingEdges
      : []).filter((edge) => CAMPAIGN_GRAPH_NODE_BY_ID.get(edge.toNodeId)?.weeklyStreakEligible);
    if (scoreEvents.length !== visitedNodeIds.length || eligibleOutgoing.length > 0) {
      return fail('weekly_terminal_invalid');
    }
  }
  const submissionStatus = finalized
    && ['ready', 'pending', 'submitted', 'failed'].includes(rawFinalization.submissionStatus)
    ? rawFinalization.submissionStatus
    : finalized ? 'ready' : 'not-ready';
  const triggerNodeId = typeof rawFinalization.triggerNodeId === 'string'
    && CAMPAIGN_GRAPH_NODE_BY_ID.has(rawFinalization.triggerNodeId)
    ? rawFinalization.triggerNodeId
    : null;

  const streak = {
    schemaVersion: 1,
    revision,
    weeklyId: boundary.weekKey,
    resetAtMs,
    startNodeId,
    currentNodeId,
    committedRoutes,
    visitedNodeIds,
    scoredNodeIds: scoreEvents.map((event) => event.nodeId),
    scoreEvents,
    score,
    finalization: {
      status: finalized ? 'finalized' : 'active',
      reason,
      finalizedAtMs,
      triggerNodeId,
      submissionStatus,
      submissionId: typeof rawFinalization.submissionId === 'string'
        ? rawFinalization.submissionId.slice(0, 180)
        : null,
      submittedAtMs: submissionStatus === 'submitted'
        ? strictWeeklyTimestamp(rawFinalization.submittedAtMs, finalizedAtMs ?? createdAtMs, updatedAtMs)
        : null
    },
    createdAtMs,
    updatedAtMs
  };

  if (expectedBinding) {
    const visitedNodeCount = strictWeeklyInteger(
      expectedBinding.visitedNodeCount,
      1,
      visitedNodeIds.length
    );
    const committedRouteCount = strictWeeklyInteger(
      expectedBinding.committedRouteCount,
      0,
      committedRoutes.length
    );
    const scoreEventCount = strictWeeklyInteger(
      expectedBinding.scoreEventCount,
      0,
      scoreEvents.length
    );
    const boundRevision = strictWeeklyInteger(
      expectedBinding.revision,
      1,
      Number.MAX_SAFE_INTEGER
    );
    const boundAtMs = strictWeeklyTimestamp(
      expectedBinding.boundAtMs,
      createdAtMs,
      Math.min(resetAtMs - 1, latestAllowedTimestamp)
    );
    if (
      visitedNodeCount === null
      || committedRouteCount === null
      || scoreEventCount === null
      || boundRevision === null
      || boundAtMs === null
      || committedRouteCount !== visitedNodeCount - 1
      || scoreEventCount > visitedNodeCount
      || expectedBinding.currentNodeId !== visitedNodeIds[visitedNodeCount - 1]
      || expectedBinding.prefixHash !== weeklyCampaignPrefixDigest(streak, {
        visitedNodeCount,
        committedRouteCount,
        scoreEventCount
      })
    ) return fail('weekly_start_binding_mismatch');

    const newCommitments = committedRoutes.slice(committedRouteCount);
    const newEvents = scoreEvents.slice(scoreEventCount);
    if (
      newCommitments.some((commitment) => commitment.committedAtMs <= boundAtMs)
      || newEvents.some((event) => event.occurredAtMs <= boundAtMs)
    ) return fail('weekly_start_binding_mismatch');

    const minimumRevision = boundRevision
      + newCommitments.length
      + newEvents.length
      + (finalized ? 1 : 0);
    if (revision < minimumRevision) return fail('weekly_revision_invalid');
  }

  return {
    error: null,
    streak
  };
};

const sanitizeWeeklyCampaignStreakServer = (rawValue, boundary, now) => (
  canonicalizeWeeklyCampaignStreakServer(rawValue, boundary, now).streak
);

const createWeeklyCampaignStreakRunBinding = (
  rawValue,
  { now = Date.now() } = {}
) => {
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const result = canonicalizeWeeklyCampaignStreakServer(rawValue, boundary, now);
  if (!result.streak || result.streak.finalization.status !== 'active') {
    throw apiError('An active Weekly Campaign proof is required to start this run.', 422, {
      details: { anomalies: [result.error || 'weekly_start_proof_not_active'] }
    });
  }
  const streak = result.streak;
  return {
    schemaVersion: 1,
    weeklyId: streak.weeklyId,
    resetAtMs: streak.resetAtMs,
    startNodeId: streak.startNodeId,
    createdAtMs: streak.createdAtMs,
    currentNodeId: streak.currentNodeId,
    revision: streak.revision,
    visitedNodeCount: streak.visitedNodeIds.length,
    committedRouteCount: streak.committedRoutes.length,
    scoreEventCount: streak.scoreEvents.length,
    scoreElapsedMs: streak.scoreEvents.reduce((total, event) => (
      total + (event.outcome.elapsedMs ?? 0)
    ), 0),
    prefixHash: weeklyCampaignPrefixDigest(streak),
    boundAtMs: Math.floor(now)
  };
};

const validateFinalizedWeeklyCampaignStreakProof = (
  rawValue,
  { now = Date.now(), expectedBinding = null } = {}
) => {
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const result = canonicalizeWeeklyCampaignStreakServer(rawValue, boundary, now, {
    requireFinalized: true,
    expectedBinding
  });
  if (!result.streak) {
    throw apiError('Weekly Campaign proof failed integrity checks.', 422, {
      details: { anomalies: [result.error || 'weekly_proof_invalid'] }
    });
  }
  return result.streak;
};

const sanitizeWeeklyState = (rawValue, profileId, now) => {
  const value = asObject(rawValue);
  const fallback = createWeeklyState(profileId, now);
  const isCurrentWeek = value.weekKey === fallback.weekKey;

  const ownedMiniShips = {};
  Object.entries(asObject(value.ownedMiniShips)).forEach(([id, level]) => {
    if (MINI_SHIP_ID_SET.has(id)) ownedMiniShips[id] = integer(level, 1, 5);
  });
  const shipUpgrades = createShipUpgrades();
  const rawUpgrades = asObject(value.shipUpgrades);
  PLAYER_SHIP_IDS.forEach((shipId) => {
    const levels = asObject(rawUpgrades[shipId]);
    shipUpgrades[shipId] = {
      fireRate: integer(levels.fireRate, 0, MAIN_SHIP_FIRE_RATE_MAX_LEVEL),
      speed: integer(levels.speed, 0, MAIN_SHIP_STANDARD_UPGRADE_MAX_LEVEL),
      startingHearts: integer(levels.startingHearts, 0, MAIN_SHIP_STANDARD_UPGRADE_MAX_LEVEL)
    };
  });
  const equipped = {};
  ['left', 'right'].forEach((slot) => {
    const id = asObject(value.equipped)[slot];
    equipped[slot] = MINI_SHIP_ID_SET.has(id) && ownedMiniShips[id] ? id : null;
  });
  const weeklyStats = asObject(value.weeklyStats);
  const sanitizedCoins = integer(value.coins, 0, 1_000_000_000);
  const durableCampaignCoins = Math.min(
    integer(value.durableCampaignCoins, 0, 1_000_000_000),
    sanitizedCoins
  );
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  return {
    ...fallback,
    // Competition currency and run totals restart each week. Hangar ownership,
    // equipment, and upgrade levels remain durable across that boundary.
    coins: isCurrentWeek ? sanitizedCoins : durableCampaignCoins,
    durableCampaignCoins,
    unlockedSlots: {
      left: Boolean(asObject(value.unlockedSlots).left),
      right: Boolean(asObject(value.unlockedSlots).right)
    },
    ownedMiniShips,
    equipped,
    shipUpgrades,
    creditedCampaignRewardIds: stringList(value.creditedCampaignRewardIds, {
      maxItems: MAX_CREDITED_CAMPAIGN_REWARD_IDS,
      maxLength: 180
    }).filter((id) => id.startsWith('campaign:') || id.startsWith('campaign-branch:')),
    weeklyCampaignStreak: isCurrentWeek
      ? sanitizeWeeklyCampaignStreakServer(value.weeklyCampaignStreak, boundary, now)
      : null,
    weeklyStats: isCurrentWeek
      ? {
          runs: integer(weeklyStats.runs, 0, 1_000_000),
          score: integer(weeklyStats.score, 0, 1_000_000_000),
          enemiesDefeated: integer(weeklyStats.enemiesDefeated, 0, 1_000_000_000),
          coinsEarned: integer(weeklyStats.coinsEarned, 0, 1_000_000_000)
        }
      : fallback.weeklyStats,
    updatedAt: isoNow(now)
  };
};

const sanitizePermanentState = (rawValue, profileId, now) => {
  const value = asObject(rawValue);
  const dailyGifts = asObject(value.dailyGifts);
  const lifetimeStats = asObject(value.lifetimeStats);
  const bossArchive = asObject(value.bossArchive);
  const hasStoredBossArchive = Boolean(
    value.bossArchive
    && typeof value.bossArchive === 'object'
    && !Array.isArray(value.bossArchive)
  );
  const unlockedEventIds = hasStoredBossArchive
    ? bossArchiveEventIds(bossArchive.unlockedEventIds)
    : inferLegacyBossArchiveEventIds(lifetimeStats);
  const lastClaimDate = typeof dailyGifts.lastClaimDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dailyGifts.lastClaimDate)
    ? dailyGifts.lastClaimDate
    : null;
  const achievementTiers = {};
  Object.entries(asObject(value.achievementTiers)).forEach(([id, tier]) => {
    if (ACHIEVEMENT_IDS.has(id)) achievementTiers[id] = integer(tier, 0, 5);
  });

  // Minted ownership is derived from verified onchain mint records and must
  // never be accepted from an offchain wallet-profile snapshot.
  return {
    version: 1,
    profileId,
    cosmetics: stringList(value.cosmetics, { maxItems: 100, maxLength: 80 }),
    weeklyArchive: stringList(value.weeklyArchive, {
      maxItems: 260,
      maxLength: 10,
      pattern: /^\d{4}-\d{2}-\d{2}$/
    }),
    dailyGifts: {
      currentDay: integer(dailyGifts.currentDay, 0, 30),
      lastClaimDate
    },
    lifetimeStats: {
      runs: integer(lifetimeStats.runs, 0, 1_000_000_000),
      highestWave: integer(lifetimeStats.highestWave, 0, 1_000_000),
      enemiesDefeated: integer(lifetimeStats.enemiesDefeated, 0, 1_000_000_000),
      bossesDefeated: integer(lifetimeStats.bossesDefeated, 0, 1_000_000_000),
      coinsCollected: integer(lifetimeStats.coinsCollected, 0, 1_000_000_000),
      bestScore: integer(lifetimeStats.bestScore, 0, 1_000_000_000)
    },
    achievementTiers,
    unlockedPlayerShips: stringList(value.unlockedPlayerShips, {
      maxItems: PLAYER_SHIP_IDS.length,
      maxLength: 16
    }).filter((id) => PLAYER_SHIP_ID_SET.has(id)),
    bossArchive: sanitizeBossArchiveProgress(bossArchive, unlockedEventIds, now),
    campaignProgress: sanitizeCampaignProgress(value.campaignProgress, lifetimeStats, now),
    updatedAt: isoNow(now)
  };
};

const sanitizeStats = (rawValue) => {
  const value = asObject(rawValue);
  return {
    highScore: integer(value.highScore, 0, 1_000_000_000),
    totalCoins: integer(value.totalCoins, 0, 1_000_000_000),
    playerName: text(value.playerName, 15)
  };
};

const sanitizeWalletSnapshot = (rawSnapshot, address, now = Date.now()) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const profileId = walletProfileId(walletAddress);
  const snapshot = asObject(rawSnapshot);
  const sanitized = {
    weeklyState: sanitizeWeeklyState(snapshot.weeklyState, profileId, now),
    permanentState: sanitizePermanentState(snapshot.permanentState, profileId, now),
    stats: sanitizeStats(snapshot.stats),
    selectedShipId: PLAYER_SHIP_ID_SET.has(snapshot.selectedShipId)
      ? snapshot.selectedShipId
      : 'researchhub'
  };
  if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw apiError('The wallet profile snapshot is too large.', 413);
  }
  return sanitized;
};

const rowToProfile = (row, now = Date.now()) => {
  if (!row) return null;
  const walletAddress = normalizeWalletAddress(row.wallet_address);
  if (!walletAddress) return null;
  return {
    walletAddress,
    profileId: walletProfileId(walletAddress),
    revision: integer(row.revision, 1, Number.MAX_SAFE_INTEGER),
    snapshot: sanitizeWalletSnapshot(row.snapshot, walletAddress, now),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null
  };
};

const fetchWalletProfile = async (address, now = Date.now()) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const rows = await fetchSupabaseJson(
    `${PROFILES_TABLE}?select=wallet_address,revision,snapshot,updated_at&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return rowToProfile(Array.isArray(rows) ? rows[0] : null, now);
};

const writeWalletProfileSnapshotCas = async ({ profile, snapshot, now }) => {
  const sanitizedSnapshot = sanitizeWalletSnapshot(
    snapshot,
    profile.walletAddress,
    now
  );
  const rows = await fetchSupabaseJson(
    `${PROFILES_TABLE}?wallet_address=eq.${encodeURIComponent(profile.walletAddress)}`
      + `&revision=eq.${profile.revision}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        revision: profile.revision + 1,
        snapshot: sanitizedSnapshot,
        updated_at: isoNow(now)
      })
    }
  );
  return rowToProfile(Array.isArray(rows) ? rows[0] : null, now);
};

const reserveBossArchiveDailyAttempt = async ({
  address,
  eventId,
  difficultyId,
  attemptId,
  minimumAttemptsUsed = 0,
  dailyLimit = BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const canonicalEventId = canonicalBossArchiveEventId(eventId);
  const normalizedDifficultyId = BOSS_ARCHIVE_DIFFICULTY_IDS.includes(difficultyId)
    ? difficultyId
    : null;
  const normalizedAttemptId = String(attemptId || '').trim().toLowerCase();
  const normalizedDailyLimit = Math.min(
    BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT,
    integer(dailyLimit, 1, BOSS_ARCHIVE_DAILY_ATTEMPT_LIMIT)
  );
  if (!walletAddress) {
    throw apiError('A valid Base wallet address is required.', 400, { code: 'invalid_wallet' });
  }
  if (!canonicalEventId || !normalizedDifficultyId) {
    throw apiError('This Boss Archive Challenge is unavailable.', 400, { code: 'invalid_challenge' });
  }
  if (!/^[0-9a-f-]{36}$/.test(normalizedAttemptId)) {
    throw apiError('A valid Boss Archive attempt id is required.', 400, { code: 'invalid_attempt' });
  }
  const attemptReceiptId = `boss-archive:${normalizedAttemptId}`;

  const utcDateKey = isoNow(now).slice(0, 10);
  for (let retry = 0; retry < 5; retry += 1) {
    const profile = await fetchWalletProfile(walletAddress, now);
    if (!profile) {
      throw apiError(
        'Create this wallet profile before starting a Challenge.',
        409,
        { code: 'profile_missing' }
      );
    }
    const archive = profile.snapshot.permanentState.bossArchive;
    if (!archive.unlockedEventIds.includes(canonicalEventId)) {
      throw apiError(
        'Defeat this boss in the campaign before starting its Challenge.',
        403,
        { code: 'boss_locked' }
      );
    }
    const storedDaily = archive.dailyAttempts ?? {};
    const currentDaily = storedDaily.utcDateKey === utcDateKey
      ? storedDaily
      : {
          utcDateKey,
          attemptsUsed: 0,
          processedAttemptIds: storedDaily.processedAttemptIds ?? []
        };
    if (currentDaily.processedAttemptIds.includes(attemptReceiptId)) {
      return {
        profile,
        duplicate: true,
        attemptsUsed: Math.max(
          integer(currentDaily.attemptsUsed, 0, normalizedDailyLimit),
          Math.min(normalizedDailyLimit, integer(minimumAttemptsUsed, 0, normalizedDailyLimit))
        )
      };
    }
    const attemptsUsed = Math.max(
      integer(currentDaily.attemptsUsed, 0, normalizedDailyLimit),
      Math.min(normalizedDailyLimit, integer(minimumAttemptsUsed, 0, normalizedDailyLimit))
    );
    if (attemptsUsed >= normalizedDailyLimit) {
      throw apiError(
        'No Boss Archive Challenge charges remain until 00:00 UTC.',
        409,
        { code: 'no_charges' }
      );
    }

    const currentRecord = sanitizeBossArchiveRecord(archive.records[canonicalEventId]);
    const currentDifficulty = sanitizeBossArchiveDifficultyRecord(
      currentRecord.difficultyRecords[normalizedDifficultyId]
    );
    const dailyAttempts = {
      utcDateKey,
      attemptsUsed: attemptsUsed + 1,
      processedAttemptIds: stringList([
        ...currentDaily.processedAttemptIds,
        attemptReceiptId
      ], { maxItems: 64, maxLength: 120 })
    };
    const nextSnapshot = {
      ...profile.snapshot,
      permanentState: {
        ...profile.snapshot.permanentState,
        bossArchive: {
          ...archive,
          records: {
            ...archive.records,
            [canonicalEventId]: {
              ...currentRecord,
              difficultyRecords: {
                ...currentRecord.difficultyRecords,
                [normalizedDifficultyId]: {
                  ...currentDifficulty,
                  attempts: currentDifficulty.attempts + 1
                }
              }
            }
          },
          dailyAttempts
        }
      }
    };
    const saved = await writeWalletProfileSnapshotCas({
      profile,
      snapshot: nextSnapshot,
      now
    });
    if (saved) {
      return {
        profile: saved,
        duplicate: false,
        attemptsUsed: dailyAttempts.attemptsUsed
      };
    }
  }
  throw apiError(
    'Boss Archive Challenge state changed repeatedly. Try again.',
    409,
    { code: 'challenge_start_conflict' }
  );
};

const recordBossArchiveDifficultyResult = async ({
  address,
  eventId,
  difficultyId,
  resultId,
  clearTimeMs,
  damageTaken,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const canonicalEventId = canonicalBossArchiveEventId(eventId);
  const normalizedDifficultyId = BOSS_ARCHIVE_DIFFICULTY_IDS.includes(difficultyId)
    ? difficultyId
    : null;
  const normalizedResultId = String(resultId || '').trim().toLowerCase();
  if (!walletAddress || !canonicalEventId || !normalizedDifficultyId) {
    throw apiError('Boss Archive Challenge result is invalid.', 400, { code: 'settlement_invalid' });
  }
  if (!/^[0-9a-f-]{36}$/.test(normalizedResultId)) {
    throw apiError('Boss Archive Challenge result is invalid.', 400, { code: 'settlement_invalid' });
  }
  const resultReceiptId = `boss-archive:${normalizedResultId}`;
  const normalizedClearTimeMs = optionalDuration(clearTimeMs);
  if (normalizedClearTimeMs === null) {
    throw apiError('Boss Archive Challenge clear time is invalid.', 400, { code: 'settlement_invalid' });
  }
  const normalizedDamageTaken = integer(damageTaken, 0, 1_000_000);

  for (let retry = 0; retry < 5; retry += 1) {
    const profile = await fetchWalletProfile(walletAddress, now);
    if (!profile) {
      throw apiError(
        'Boss Archive Challenge profile could not be reloaded.',
        500,
        { code: 'profile_missing' }
      );
    }
    const archive = profile.snapshot.permanentState.bossArchive;
    const currentRecord = sanitizeBossArchiveRecord(archive.records[canonicalEventId]);
    const currentDifficulty = sanitizeBossArchiveDifficultyRecord(
      currentRecord.difficultyRecords[normalizedDifficultyId]
    );
    if (currentDifficulty.processedResultIds.includes(resultReceiptId)) return profile;

    const noHit = normalizedDamageTaken === 0;
    const difficultyRecord = {
      ...currentDifficulty,
      attempts: Math.max(currentDifficulty.attempts, currentDifficulty.clears + 1),
      clears: currentDifficulty.clears + 1,
      noHitClears: currentDifficulty.noHitClears + (noHit ? 1 : 0),
      bestClearTimeMs: minimumDuration(
        currentDifficulty.bestClearTimeMs,
        normalizedClearTimeMs
      ),
      bestNoHitTimeMs: noHit
        ? minimumDuration(currentDifficulty.bestNoHitTimeMs, normalizedClearTimeMs)
        : currentDifficulty.bestNoHitTimeMs,
      processedResultIds: stringList([
        ...currentDifficulty.processedResultIds,
        resultReceiptId
      ], { maxItems: 64, maxLength: 120 })
    };
    const nextSnapshot = {
      ...profile.snapshot,
      permanentState: {
        ...profile.snapshot.permanentState,
        bossArchive: {
          ...archive,
          records: {
            ...archive.records,
            [canonicalEventId]: {
              ...currentRecord,
              lastResult: {
                mode: 'challenge',
                difficultyId: normalizedDifficultyId,
                victory: true,
                clearTimeMs: normalizedClearTimeMs,
                damageTaken: normalizedDamageTaken,
                playedAt: isoNow(now)
              },
              difficultyRecords: {
                ...currentRecord.difficultyRecords,
                [normalizedDifficultyId]: difficultyRecord
              }
            }
          }
        }
      }
    };
    const saved = await writeWalletProfileSnapshotCas({
      profile,
      snapshot: nextSnapshot,
      now
    });
    if (saved) return saved;
  }
  throw apiError(
    'Boss Archive Challenge result changed repeatedly. Try settlement again.',
    409,
    { code: 'challenge_settlement_conflict' }
  );
};

const createWalletProfileChallenge = async ({ address, origin, now = Date.now() }) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Number(now) + CHALLENGE_LIFETIME_MS).toISOString();
  const message = makeWalletProfileMessage({
    address: walletAddress,
    challengeId,
    expiresAt,
    origin
  });
  await fetchSupabaseJson(CHALLENGES_TABLE, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      challenge_id: challengeId,
      wallet_address: walletAddress,
      message,
      expires_at: expiresAt
    })
  });
  return { challengeId, message, expiresAt };
};

const getWalletProfileChallenge = async ({ address, challengeId, now = Date.now() }) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress || !/^[0-9a-f-]{36}$/i.test(String(challengeId || ''))) {
    throw apiError('Wallet and challenge are required.', 400);
  }
  const rows = await fetchSupabaseJson(
    `${CHALLENGES_TABLE}?select=challenge_id,wallet_address,message,expires_at,used_at&challenge_id=eq.${encodeURIComponent(challengeId)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const challenge = Array.isArray(rows) ? rows[0] : null;
  if (!challenge || new Date(challenge.expires_at).getTime() <= Number(now)) {
    throw apiError('This wallet profile challenge is missing or expired.', 410);
  }
  if (challenge.wallet_address !== walletAddress) {
    throw apiError('The wallet profile challenge does not match this account.', 403);
  }
  if (challenge.used_at) {
    throw apiError('This wallet profile challenge was already used.', 410);
  }
  return challenge;
};

const consumeWalletProfileChallenge = async (challengeId, now = Date.now()) => {
  const rows = await fetchSupabaseJson(
    `${CHALLENGES_TABLE}?challenge_id=eq.${encodeURIComponent(challengeId)}&used_at=is.null`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ used_at: isoNow(now) })
    }
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw apiError('This wallet profile challenge was already used.', 409);
  }
};

const saveWalletProfile = async ({
  address,
  expectedRevision,
  snapshot,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const revision = Number(expectedRevision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw apiError('A valid expectedRevision is required.', 400);
  }
  let sanitizedSnapshot = sanitizeWalletSnapshot(snapshot, walletAddress, now);
  let current = null;
  if (revision > 0) {
    current = await fetchWalletProfile(walletAddress, now);
    if (!current || current.revision !== revision) {
      throw apiError(
        'This wallet profile changed on another device. Reload it before saving again.',
        409,
        { currentRevision: current?.revision ?? 0, currentProfile: current }
      );
    }
    const dailyLedger = await fetchBossArchiveDailyLedger(walletAddress, now);
    sanitizedSnapshot = preserveBossArchiveServerState({
      currentSnapshot: current.snapshot,
      incomingSnapshot: sanitizedSnapshot,
      dailyLedger,
      now
    });
  }
  sanitizedSnapshot = preserveCampaignBranchServerState({
    currentSnapshot: current?.snapshot ?? null,
    incomingSnapshot: sanitizedSnapshot,
    now
  });
  const updatedAt = isoNow(now);
  let rows;

  if (revision === 0) {
    rows = await fetchSupabaseJson(`${PROFILES_TABLE}?on_conflict=wallet_address`, {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=ignore-duplicates,return=representation'
      }),
      body: JSON.stringify({
        wallet_address: walletAddress,
        revision: 1,
        snapshot: sanitizedSnapshot,
        updated_at: updatedAt
      })
    });
  } else {
    rows = await fetchSupabaseJson(
      `${PROFILES_TABLE}?wallet_address=eq.${encodeURIComponent(walletAddress)}&revision=eq.${revision}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          revision: revision + 1,
          snapshot: sanitizedSnapshot,
          updated_at: updatedAt
        })
      }
    );
  }

  const saved = Array.isArray(rows) ? rows[0] : null;
  if (!saved) {
    const current = await fetchWalletProfile(walletAddress, now);
    throw apiError(
      'This wallet profile changed on another device. Reload it before saving again.',
      409,
      { currentRevision: current?.revision ?? 0, currentProfile: current }
    );
  }
  return rowToProfile(saved, now);
};

module.exports = {
  CHALLENGES_TABLE,
  CHALLENGE_LIFETIME_MS,
  MAX_SNAPSHOT_BYTES,
  PROFILES_TABLE,
  consumeWalletProfileChallenge,
  createWeeklyCampaignStreakRunBinding,
  createWalletProfileChallenge,
  createWeeklyState,
  fetchWalletProfile,
  fetchBossArchiveDailyLedger,
  getBossArchiveChallengeConfig,
  getWalletProfileChallenge,
  rowToProfile,
  sanitizeCampaignProgress,
  mergeCampaignGraphProgress,
  sanitizeCampaignBranchProgress,
  sanitizePermanentState,
  sanitizeStats,
  sanitizeWalletSnapshot,
  sanitizeWeeklyState,
  validateFinalizedWeeklyCampaignStreakProof,
  preserveBossArchiveServerState,
  preserveCampaignBranchServerState,
  recordBossArchiveDifficultyResult,
  reserveBossArchiveDailyAttempt,
  saveWalletProfile
};
