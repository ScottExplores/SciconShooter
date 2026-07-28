export const CAMPAIGN_BRANCH_PROGRESS_VERSION = 2;

const MAX_BRANCH_ATTEMPT_RECEIPTS = 256;
const MAX_BRANCH_ATTEMPT_IDS = 512;
const MAX_BRANCH_REWARD_RECEIPT_IDS = 256;

export type CampaignBranchAttemptOutcome = 'failed' | 'interrupted' | 'success';

export interface CampaignBranchPresentCounts {
  standard: number;
  armored: number;
  fast: number;
  golden: number;
}

/**
 * Persistence only needs this stable projection of an authored branch. Keeping
 * it structural lets Campaign config evolve without coupling reward settlement
 * to map presentation or the branch mission runtime.
 */
export interface CampaignBranchProgressionDefinition {
  branchId: string;
  sourceMissionId: string;
  unlockCondition?: {
    kind?: string;
    missionId?: string;
    missionIds?: string[];
    branchId?: string;
  };
  requiredStars?: number;
  oneTimeCompletion?: boolean;
  replayPolicy?: string;
  completionReward?: unknown;
}

export interface CampaignBranchMissionMasteryRecord {
  stars?: number;
}

export type CampaignBranchMissionMastery = Readonly<Record<
  string,
  number | CampaignBranchMissionMasteryRecord | null | undefined
>>;

export interface CampaignBranchAttemptReceipt {
  attemptId: string;
  branchId: string;
  playerId: string;
  outcome: CampaignBranchAttemptOutcome;
  destroyedByType: CampaignBranchPresentCounts;
  presentsDestroyed: number;
  coinsCalculated: number;
  coinsAwarded: number;
  completedAt: string;
  rewardReceiptId: string | null;
  claimed: boolean;
}

export interface CampaignBranchProgress {
  version: typeof CAMPAIGN_BRANCH_PROGRESS_VERSION;
  /** Founder-only test override; canonical mastery unlocks resume when cleared. */
  founderLockedBranchIds: string[];
  unlockedBranchIds: string[];
  newBranchIds: string[];
  viewedBranchIds: string[];
  completedBranchIds: string[];
  claimedBranchIds: string[];
  processedAttemptIds: string[];
  claimedRewardReceiptIds: string[];
  attemptReceipts: CampaignBranchAttemptReceipt[];
  updatedAt: string;
}

export interface CampaignBranchAttemptInput {
  branchId: string;
  attemptId: string;
  playerId: string;
  outcome: CampaignBranchAttemptOutcome;
  /** Count already validated by the authoritative completion boundary. */
  verifiedPresentsDestroyed?: number;
  /** Per-type counts already clamped by the authoritative completion boundary. */
  verifiedDestroyedByType?: Partial<CampaignBranchPresentCounts> | null;
  /** Final coin value already validated by the authoritative completion boundary. */
  verifiedCoinsAwarded?: number;
  /** Required for a successful reward; must be stable across retries. */
  rewardReceiptId?: string | null;
  completedAt: string;
}

export interface CampaignBranchRewardGrant {
  id: string;
  label: string;
  amount: number;
  kind: 'branch';
  oneTime: true;
}

export type CampaignBranchSettlementReason =
  | 'settled'
  | 'unknown-branch'
  | 'branch-locked'
  | 'attempt-already-processed'
  | 'reward-receipt-already-claimed'
  | 'branch-already-claimed'
  | 'missing-reward-receipt';

export interface CampaignBranchAttemptSettlement {
  accepted: boolean;
  duplicate: boolean;
  reason: CampaignBranchSettlementReason;
  progress: CampaignBranchProgress;
  receipt: CampaignBranchAttemptReceipt | null;
  grant: CampaignBranchRewardGrant | null;
  coinsAwarded: number;
  retryAllowed: boolean;
}

export type CampaignBranchNodeState = 'locked' | 'new' | 'unlocked' | 'completed' | 'claimed';

export interface CampaignBranchFounderAuthorization {
  walletAddress?: string | null;
  founderWalletAddresses: readonly string[];
}

export type CampaignBranchFounderAction = 'unlock' | 'lock' | 'reset-completion';

const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
};

const nonEmptyString = (value: unknown) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const isoDate = (value: unknown, fallback = '1970-01-01T00:00:00.000Z') => {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
};

const uniqueStrings = (value: unknown, allowed?: ReadonlySet<string>) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((entry) => {
    const normalized = nonEmptyString(entry);
    if (!normalized || (allowed && !allowed.has(normalized))) return [];
    return [normalized];
  })));
};

const trimTail = <T,>(values: T[], max: number) => values.slice(Math.max(0, values.length - max));

const getMissionStars = (mastery: CampaignBranchMissionMastery, missionId: string) => {
  const value = mastery[missionId];
  return integer(typeof value === 'number' ? value : value?.stars, 0, 3);
};

const isOneTimeBranch = (definition: CampaignBranchProgressionDefinition) => (
  definition.oneTimeCompletion === true
  || definition.replayPolicy === 'one-time'
  || definition.replayPolicy === 'disabled-after-claim'
  || definition.replayPolicy === 'no-replay-after-claim'
);

export const normalizeCampaignBranchDefinitions = (
  value: unknown
): CampaignBranchProgressionDefinition[] => {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, CampaignBranchProgressionDefinition>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const candidate = entry as Partial<CampaignBranchProgressionDefinition>;
    const branchId = nonEmptyString(candidate.branchId);
    const sourceMissionId = nonEmptyString(candidate.sourceMissionId);
    if (!branchId || !sourceMissionId || byId.has(branchId)) return;
    byId.set(branchId, {
      branchId,
      sourceMissionId,
      unlockCondition: candidate.unlockCondition && typeof candidate.unlockCondition === 'object'
        ? { ...candidate.unlockCondition }
        : undefined,
      requiredStars: integer(candidate.requiredStars, 0, 3),
      oneTimeCompletion: Boolean(candidate.oneTimeCompletion),
      replayPolicy: nonEmptyString(candidate.replayPolicy) ?? undefined,
      completionReward: candidate.completionReward
    });
  });
  return Array.from(byId.values());
};

export const getCampaignBranchDefinitions = (
  campaign: unknown
): CampaignBranchProgressionDefinition[] => {
  if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) return [];
  return normalizeCampaignBranchDefinitions(
    (campaign as { campaignBranches?: unknown }).campaignBranches
  );
};

export const createCampaignBranchProgress = (updatedAt = new Date().toISOString()): CampaignBranchProgress => ({
  version: CAMPAIGN_BRANCH_PROGRESS_VERSION,
  founderLockedBranchIds: [],
  unlockedBranchIds: [],
  newBranchIds: [],
  viewedBranchIds: [],
  completedBranchIds: [],
  claimedBranchIds: [],
  processedAttemptIds: [],
  claimedRewardReceiptIds: [],
  attemptReceipts: [],
  updatedAt: isoDate(updatedAt, new Date().toISOString())
});

const sanitizeAttemptReceipts = (
  value: unknown,
  allowedBranchIds: ReadonlySet<string>
) => {
  if (!Array.isArray(value)) return [];
  const attemptIds = new Set<string>();
  const rewardReceiptIds = new Set<string>();
  const receipts: CampaignBranchAttemptReceipt[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const candidate = entry as Partial<CampaignBranchAttemptReceipt>;
    const attemptId = nonEmptyString(candidate.attemptId);
    const branchId = nonEmptyString(candidate.branchId);
    const playerId = nonEmptyString(candidate.playerId);
    const outcome = candidate.outcome;
    const rewardReceiptId = nonEmptyString(candidate.rewardReceiptId);
    if (
      !attemptId
      || !branchId
      || !playerId
      || !allowedBranchIds.has(branchId)
      || attemptIds.has(attemptId)
      || (outcome !== 'failed' && outcome !== 'interrupted' && outcome !== 'success')
    ) return;
    const success = outcome === 'success';
    if (success && (!rewardReceiptId || rewardReceiptIds.has(rewardReceiptId))) return;
    const destroyedByType: CampaignBranchPresentCounts = {
      standard: integer(candidate.destroyedByType?.standard),
      armored: integer(candidate.destroyedByType?.armored),
      fast: integer(candidate.destroyedByType?.fast),
      golden: integer(candidate.destroyedByType?.golden)
    };
    const destroyedTotal = Object.values(destroyedByType).reduce((total, count) => total + count, 0);
    attemptIds.add(attemptId);
    if (success && rewardReceiptId) rewardReceiptIds.add(rewardReceiptId);
    receipts.push({
      attemptId,
      branchId,
      playerId,
      outcome,
      destroyedByType,
      presentsDestroyed: Math.max(integer(candidate.presentsDestroyed), destroyedTotal),
      coinsCalculated: integer(candidate.coinsCalculated),
      coinsAwarded: success && rewardReceiptId ? integer(candidate.coinsAwarded) : 0,
      completedAt: isoDate(candidate.completedAt),
      rewardReceiptId: success ? rewardReceiptId : null,
      claimed: success && Boolean(candidate.claimed) && Boolean(rewardReceiptId)
    });
  });
  return trimTail(receipts, MAX_BRANCH_ATTEMPT_RECEIPTS);
};

export const sanitizeCampaignBranchProgress = (
  value: unknown,
  definitions: readonly CampaignBranchProgressionDefinition[],
  missionMastery: CampaignBranchMissionMastery = {},
  updatedAt?: string
): CampaignBranchProgress => {
  const normalizedDefinitions = normalizeCampaignBranchDefinitions(definitions);
  const allowedBranchIds = new Set(normalizedDefinitions.map((definition) => definition.branchId));
  const fallback = createCampaignBranchProgress(updatedAt);
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<CampaignBranchProgress>
    : {};
  const attemptReceipts = sanitizeAttemptReceipts(raw.attemptReceipts, allowedBranchIds);
  const founderLocked = new Set(uniqueStrings(raw.founderLockedBranchIds, allowedBranchIds));
  const unlocked = new Set(uniqueStrings(raw.unlockedBranchIds, allowedBranchIds));
  const completed = new Set(uniqueStrings(raw.completedBranchIds, allowedBranchIds));
  const claimed = new Set(uniqueStrings(raw.claimedBranchIds, allowedBranchIds));

  let unlockedAnotherBranch = true;
  while (unlockedAnotherBranch) {
    unlockedAnotherBranch = false;
    normalizedDefinitions.forEach((definition) => {
      if (founderLocked.has(definition.branchId)) return;
      if (unlocked.has(definition.branchId)) return;
      const condition = definition.unlockCondition;
      const requiredStars = integer(definition.requiredStars, 0, 3);
      const conditionMet = !condition || condition.kind === 'all-stars-earned'
        ? requiredStars > 0 && getMissionStars(
            missionMastery,
            nonEmptyString(condition?.missionId) ?? definition.sourceMissionId
          ) >= requiredStars
        : condition.kind === 'sector-mastered'
          ? Array.isArray(condition.missionIds)
            && condition.missionIds.length > 0
            && condition.missionIds.every((missionId) => getMissionStars(missionMastery, missionId) >= 3)
          : condition.kind === 'branch-completed'
            ? completed.has(nonEmptyString(condition.branchId) ?? '')
            : false;
      if (conditionMet) {
        unlocked.add(definition.branchId);
        unlockedAnotherBranch = true;
      }
    });
  }
  attemptReceipts.forEach((receipt) => {
    if (receipt.outcome === 'success') completed.add(receipt.branchId);
    if (receipt.claimed) claimed.add(receipt.branchId);
  });
  completed.forEach((branchId) => {
    if (!founderLocked.has(branchId)) unlocked.add(branchId);
  });
  claimed.forEach((branchId) => {
    if (!founderLocked.has(branchId)) unlocked.add(branchId);
    completed.add(branchId);
  });
  founderLocked.forEach((branchId) => unlocked.delete(branchId));

  const viewed = new Set(uniqueStrings(raw.viewedBranchIds, allowedBranchIds).filter((id) => unlocked.has(id)));
  const explicitlyNew = new Set(uniqueStrings(raw.newBranchIds, allowedBranchIds));
  normalizedDefinitions.forEach((definition) => {
    const branchId = definition.branchId;
    const wasStoredUnlocked = Array.isArray(raw.unlockedBranchIds) && raw.unlockedBranchIds.includes(branchId);
    if (unlocked.has(branchId) && !wasStoredUnlocked) explicitlyNew.add(branchId);
  });
  const newBranchIds = normalizedDefinitions
    .map((definition) => definition.branchId)
    .filter((id) => unlocked.has(id) && explicitlyNew.has(id) && !viewed.has(id) && !completed.has(id));
  const processedAttemptIds = new Set(uniqueStrings(raw.processedAttemptIds));
  attemptReceipts.forEach((receipt) => processedAttemptIds.add(receipt.attemptId));
  const claimedRewardReceiptIds = new Set(uniqueStrings(raw.claimedRewardReceiptIds));
  attemptReceipts.forEach((receipt) => {
    if (receipt.claimed && receipt.rewardReceiptId) claimedRewardReceiptIds.add(receipt.rewardReceiptId);
  });

  return {
    version: CAMPAIGN_BRANCH_PROGRESS_VERSION,
    founderLockedBranchIds: normalizedDefinitions
      .map((definition) => definition.branchId)
      .filter((id) => founderLocked.has(id)),
    unlockedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => unlocked.has(id)),
    newBranchIds,
    viewedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => viewed.has(id)),
    completedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => completed.has(id)),
    claimedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => claimed.has(id)),
    processedAttemptIds: trimTail(Array.from(processedAttemptIds), MAX_BRANCH_ATTEMPT_IDS),
    claimedRewardReceiptIds: trimTail(Array.from(claimedRewardReceiptIds), MAX_BRANCH_REWARD_RECEIPT_IDS),
    attemptReceipts,
    updatedAt: isoDate(raw.updatedAt, fallback.updatedAt)
  };
};

export const reconcileCampaignBranchUnlocks = (
  current: CampaignBranchProgress,
  definitions: readonly CampaignBranchProgressionDefinition[],
  missionMastery: CampaignBranchMissionMastery,
  updatedAt = new Date().toISOString()
) => sanitizeCampaignBranchProgress(
  { ...current, updatedAt },
  definitions,
  missionMastery,
  updatedAt
);

export const markCampaignBranchesViewed = (
  current: CampaignBranchProgress,
  definitions: readonly CampaignBranchProgressionDefinition[],
  branchIds: readonly string[] = current.newBranchIds,
  updatedAt = new Date().toISOString()
): CampaignBranchProgress => {
  const progress = sanitizeCampaignBranchProgress(current, definitions);
  const unlocked = new Set(progress.unlockedBranchIds);
  const viewed = new Set(progress.viewedBranchIds);
  branchIds.forEach((branchId) => {
    if (unlocked.has(branchId)) viewed.add(branchId);
  });
  const newlyViewed = new Set(branchIds);
  return {
    ...progress,
    viewedBranchIds: progress.unlockedBranchIds.filter((branchId) => viewed.has(branchId)),
    newBranchIds: progress.newBranchIds.filter((branchId) => !newlyViewed.has(branchId)),
    updatedAt: isoDate(updatedAt, progress.updatedAt)
  };
};

export const getCampaignBranchNodeState = (
  progress: CampaignBranchProgress,
  branchId: string
): CampaignBranchNodeState => {
  if (progress.founderLockedBranchIds.includes(branchId)) return 'locked';
  if (progress.claimedBranchIds.includes(branchId)) return 'claimed';
  if (progress.completedBranchIds.includes(branchId)) return 'completed';
  if (progress.newBranchIds.includes(branchId)) return 'new';
  if (progress.unlockedBranchIds.includes(branchId)) return 'unlocked';
  return 'locked';
};

export const canLaunchCampaignBranch = (
  progress: CampaignBranchProgress,
  definition: CampaignBranchProgressionDefinition
) => (
  progress.unlockedBranchIds.includes(definition.branchId)
  && !progress.founderLockedBranchIds.includes(definition.branchId)
  && !(isOneTimeBranch(definition) && (
    progress.completedBranchIds.includes(definition.branchId)
    || progress.claimedBranchIds.includes(definition.branchId)
  ))
);

const rejectedSettlement = (
  progress: CampaignBranchProgress,
  reason: Exclude<CampaignBranchSettlementReason, 'settled'>,
  duplicate: boolean,
  retryAllowed: boolean
): CampaignBranchAttemptSettlement => ({
  accepted: false,
  duplicate,
  reason,
  progress,
  receipt: null,
  grant: null,
  coinsAwarded: 0,
  retryAllowed
});

const authoredRewardBounds = (definition: CampaignBranchProgressionDefinition) => {
  if (!definition.completionReward || typeof definition.completionReward !== 'object' || Array.isArray(definition.completionReward)) {
    return null;
  }
  const reward = definition.completionReward as {
    totalMinimumCoins?: unknown;
    totalMaximumCoins?: unknown;
  };
  const minimum = integer(reward.totalMinimumCoins);
  const maximum = integer(reward.totalMaximumCoins);
  return maximum >= minimum && maximum > 0 ? { minimum, maximum } : null;
};

export const settleCampaignBranchAttempt = (
  current: CampaignBranchProgress,
  input: CampaignBranchAttemptInput,
  definitions: readonly CampaignBranchProgressionDefinition[]
): CampaignBranchAttemptSettlement => {
  const normalizedDefinitions = normalizeCampaignBranchDefinitions(definitions);
  const progress = sanitizeCampaignBranchProgress(current, normalizedDefinitions);
  const definition = normalizedDefinitions.find((entry) => entry.branchId === input.branchId);
  if (!definition) return rejectedSettlement(progress, 'unknown-branch', false, false);
  if (!progress.unlockedBranchIds.includes(definition.branchId)) {
    return rejectedSettlement(progress, 'branch-locked', false, false);
  }

  const attemptId = nonEmptyString(input.attemptId);
  if (!attemptId || progress.processedAttemptIds.includes(attemptId)) {
    return rejectedSettlement(progress, 'attempt-already-processed', true, !progress.claimedBranchIds.includes(definition.branchId));
  }
  const success = input.outcome === 'success';
  const rewardReceiptId = nonEmptyString(input.rewardReceiptId);
  if (success && !rewardReceiptId) {
    return rejectedSettlement(progress, 'missing-reward-receipt', false, true);
  }
  if (rewardReceiptId && progress.claimedRewardReceiptIds.includes(rewardReceiptId)) {
    return rejectedSettlement(progress, 'reward-receipt-already-claimed', true, !progress.claimedBranchIds.includes(definition.branchId));
  }
  if (success && isOneTimeBranch(definition) && progress.claimedBranchIds.includes(definition.branchId)) {
    return rejectedSettlement(progress, 'branch-already-claimed', true, false);
  }

  const completedAt = isoDate(input.completedAt);
  const rewardBounds = authoredRewardBounds(definition);
  const coinsAwarded = success
    ? rewardBounds
      ? integer(input.verifiedCoinsAwarded, rewardBounds.minimum, rewardBounds.maximum)
      : integer(input.verifiedCoinsAwarded)
    : 0;
  const destroyedByType: CampaignBranchPresentCounts = {
    standard: integer(input.verifiedDestroyedByType?.standard),
    armored: integer(input.verifiedDestroyedByType?.armored),
    fast: integer(input.verifiedDestroyedByType?.fast),
    golden: integer(input.verifiedDestroyedByType?.golden)
  };
  const destroyedTotal = Object.values(destroyedByType).reduce((total, count) => total + count, 0);
  const receipt: CampaignBranchAttemptReceipt = {
    attemptId,
    branchId: definition.branchId,
    playerId: nonEmptyString(input.playerId) ?? 'unknown',
    outcome: input.outcome,
    destroyedByType,
    presentsDestroyed: Math.max(integer(input.verifiedPresentsDestroyed), destroyedTotal),
    coinsCalculated: success ? coinsAwarded : 0,
    coinsAwarded,
    completedAt,
    rewardReceiptId: success ? rewardReceiptId : null,
    claimed: success
  };
  const completed = new Set(progress.completedBranchIds);
  const claimed = new Set(progress.claimedBranchIds);
  const claimedRewardReceiptIds = new Set(progress.claimedRewardReceiptIds);
  if (success) {
    completed.add(definition.branchId);
    claimed.add(definition.branchId);
    claimedRewardReceiptIds.add(rewardReceiptId!);
  }
  const nextProgress: CampaignBranchProgress = {
    ...progress,
    newBranchIds: success
      ? progress.newBranchIds.filter((branchId) => branchId !== definition.branchId)
      : progress.newBranchIds,
    completedBranchIds: normalizedDefinitions.map((entry) => entry.branchId).filter((id) => completed.has(id)),
    claimedBranchIds: normalizedDefinitions.map((entry) => entry.branchId).filter((id) => claimed.has(id)),
    processedAttemptIds: trimTail([...progress.processedAttemptIds, attemptId], MAX_BRANCH_ATTEMPT_IDS),
    claimedRewardReceiptIds: trimTail(Array.from(claimedRewardReceiptIds), MAX_BRANCH_REWARD_RECEIPT_IDS),
    attemptReceipts: trimTail([...progress.attemptReceipts, receipt], MAX_BRANCH_ATTEMPT_RECEIPTS),
    updatedAt: completedAt
  };
  const grant = success && coinsAwarded > 0
    ? {
        id: rewardReceiptId!,
        label: 'Optional branch completion',
        amount: coinsAwarded,
        kind: 'branch' as const,
        oneTime: true as const
      }
    : null;
  return {
    accepted: true,
    duplicate: false,
    reason: 'settled',
    progress: nextProgress,
    receipt,
    grant,
    coinsAwarded,
    retryAllowed: !success
  };
};

export const mergeCampaignBranchProgress = (
  left: CampaignBranchProgress,
  right: CampaignBranchProgress,
  definitions: readonly CampaignBranchProgressionDefinition[],
  missionMastery: CampaignBranchMissionMastery = {}
): CampaignBranchProgress => {
  const normalizedDefinitions = normalizeCampaignBranchDefinitions(definitions);
  const first = sanitizeCampaignBranchProgress(left, normalizedDefinitions, missionMastery);
  const second = sanitizeCampaignBranchProgress(right, normalizedDefinitions, missionMastery);
  const receiptsByAttemptId = new Map<string, CampaignBranchAttemptReceipt>();
  [...first.attemptReceipts, ...second.attemptReceipts]
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .forEach((receipt) => {
      const previous = receiptsByAttemptId.get(receipt.attemptId);
      if (!previous || (previous.outcome !== 'success' && receipt.outcome === 'success')) {
        receiptsByAttemptId.set(receipt.attemptId, receipt);
      }
    });
  return sanitizeCampaignBranchProgress({
    version: CAMPAIGN_BRANCH_PROGRESS_VERSION,
    founderLockedBranchIds: first.updatedAt >= second.updatedAt
      ? first.founderLockedBranchIds
      : second.founderLockedBranchIds,
    unlockedBranchIds: Array.from(new Set([...first.unlockedBranchIds, ...second.unlockedBranchIds])),
    newBranchIds: Array.from(new Set([...first.newBranchIds, ...second.newBranchIds])),
    viewedBranchIds: Array.from(new Set([...first.viewedBranchIds, ...second.viewedBranchIds])),
    completedBranchIds: Array.from(new Set([...first.completedBranchIds, ...second.completedBranchIds])),
    claimedBranchIds: Array.from(new Set([...first.claimedBranchIds, ...second.claimedBranchIds])),
    processedAttemptIds: trimTail(
      Array.from(new Set([...first.processedAttemptIds, ...second.processedAttemptIds])),
      MAX_BRANCH_ATTEMPT_IDS
    ),
    claimedRewardReceiptIds: trimTail(
      Array.from(new Set([...first.claimedRewardReceiptIds, ...second.claimedRewardReceiptIds])),
      MAX_BRANCH_REWARD_RECEIPT_IDS
    ),
    attemptReceipts: trimTail(Array.from(receiptsByAttemptId.values()), MAX_BRANCH_ATTEMPT_RECEIPTS),
    updatedAt: [first.updatedAt, second.updatedAt].sort().at(-1) ?? first.updatedAt
  }, normalizedDefinitions, missionMastery);
};

const normalizeWalletAddress = (address?: string | null) => address?.trim().toLowerCase() ?? '';

export const isFounderCampaignBranchDeveloper = ({
  walletAddress,
  founderWalletAddresses
}: CampaignBranchFounderAuthorization) => {
  const wallet = normalizeWalletAddress(walletAddress);
  return Boolean(wallet) && founderWalletAddresses.some((address) => normalizeWalletAddress(address) === wallet);
};

/** Founder-only test mutation. The authorization guard wraps the mutation itself. */
export const applyFounderCampaignBranchAction = (
  current: CampaignBranchProgress,
  authorization: CampaignBranchFounderAuthorization,
  action: CampaignBranchFounderAction,
  branchId: string,
  definitions: readonly CampaignBranchProgressionDefinition[],
  updatedAt = new Date().toISOString()
): { authorized: boolean; progress: CampaignBranchProgress } => {
  const normalizedDefinitions = normalizeCampaignBranchDefinitions(definitions);
  const progress = sanitizeCampaignBranchProgress(current, normalizedDefinitions);
  if (!isFounderCampaignBranchDeveloper(authorization)) return { authorized: false, progress };
  if (!normalizedDefinitions.some((definition) => definition.branchId === branchId)) {
    return { authorized: true, progress };
  }
  const unlocked = new Set(progress.unlockedBranchIds);
  const founderLocked = new Set(progress.founderLockedBranchIds);
  const viewed = new Set(progress.viewedBranchIds);
  const completed = new Set(progress.completedBranchIds);
  const claimed = new Set(progress.claimedBranchIds);
  let newBranchIds = [...progress.newBranchIds];
  let attemptReceipts = [...progress.attemptReceipts];
  let processedAttemptIds = [...progress.processedAttemptIds];
  let claimedRewardReceiptIds = [...progress.claimedRewardReceiptIds];
  if (action === 'unlock') {
    founderLocked.delete(branchId);
    unlocked.add(branchId);
    if (!viewed.has(branchId) && !completed.has(branchId)) newBranchIds = Array.from(new Set([...newBranchIds, branchId]));
  } else if (action === 'lock') {
    founderLocked.add(branchId);
    unlocked.delete(branchId);
    viewed.delete(branchId);
    newBranchIds = newBranchIds.filter((id) => id !== branchId);
  } else {
    completed.delete(branchId);
    claimed.delete(branchId);
    const removed = attemptReceipts.filter((receipt) => receipt.branchId === branchId);
    const removedAttemptIds = new Set(removed.map((receipt) => receipt.attemptId));
    const removedRewardIds = new Set(removed.flatMap((receipt) => receipt.rewardReceiptId ? [receipt.rewardReceiptId] : []));
    attemptReceipts = attemptReceipts.filter((receipt) => receipt.branchId !== branchId);
    processedAttemptIds = processedAttemptIds.filter((id) => !removedAttemptIds.has(id));
    claimedRewardReceiptIds = claimedRewardReceiptIds.filter((id) => !removedRewardIds.has(id));
  }
  return {
    authorized: true,
    progress: {
      ...progress,
      founderLockedBranchIds: normalizedDefinitions
        .map((definition) => definition.branchId)
        .filter((id) => founderLocked.has(id)),
      unlockedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => unlocked.has(id)),
      newBranchIds,
      viewedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => viewed.has(id)),
      completedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => completed.has(id)),
      claimedBranchIds: normalizedDefinitions.map((definition) => definition.branchId).filter((id) => claimed.has(id)),
      processedAttemptIds,
      claimedRewardReceiptIds,
      attemptReceipts,
      updatedAt: isoDate(updatedAt, progress.updatedAt)
    }
  };
};
