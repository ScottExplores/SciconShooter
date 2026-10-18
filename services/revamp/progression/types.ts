export type RevampBranch = 'firepower' | 'survival' | 'support' | 'fortune' | 'overdrive';
export type RevampMedal = 'clear' | 'kills' | 'noHit';
export type RevampEventKind = 'kills' | 'noHitClears' | 'bossParts' | 'powerups' | 'clears';
export interface RevampEvent {
  /** Stable receipt; prefer `${runId}:${dateKey}:${kind}` with mode:'total'. */
  id: string;
  runId?: string;
  mode?: 'delta' | 'total';
  kind: RevampEventKind;
  amount: number;
}
export interface RevampEventReceipt extends RevampEvent { dateKey: string; weekKey: string }
export interface RevampLogin {
  lastDateKey: string | null;
  currentStreak: number;
  longestStreak: number;
  /** A missed day never removes progress or earned rewards. */
  visitDates: string[];
}
export interface RevampProgress {
  version: 1;
  researchData: number;
  /** Concurrent offline purchases retain their debit, even when it exceeds earnings. */
  researchDebt: number;
  legacyResearchData: number;
  /** Proven gameplay earnings only. Purchased Tokens/RSC never fund this tree. */
  scienceCreditsEarned: number;
  scienceCreditsSpent: number;
  earnedCreditsByRunId: Record<string, number>;
  /** Server-owned purchased-token subset. Protected from all combat-tree spending. */
  paidCreditReserve: number;
  upgrades: Record<RevampBranch, number>;
  purchasedNodeIds: string[];
  missionMedals: Record<string, RevampMedal[]>;
  /** Permanent compact receipts: duplicate results cannot advance playtime or goals. */
  settledRunIds: string[];
  /** Cumulative run counters are preferred; old periods are compacted when new events arrive. */
  events: RevampEventReceipt[];
  claimedGoalIds: string[];
  playTimeMs: number;
  unlockIds: string[];
  login: RevampLogin;
  wingAutoCast: boolean;
  equippedCosmeticId: string | null;
}
export interface RevampUpgradeNode {
  id: string;
  branch: RevampBranch;
  branchLabel: string;
  level: number;
  name: string;
  description: string;
  creditCost: number;
  researchCost: number;
  purchased: boolean;
  available: boolean;
  unlockMinutes: number;
}
export interface RevampBonuses {
  mainDamageMultiplier: number;
  extraProjectiles: number;
  shieldBonus: number;
  invulnerabilityMultiplier: number;
  extraLives: number;
  wingDamageMultiplier: number;
  wingCooldownMultiplier: number;
  magnetRadiusMultiplier: number;
  creditGainMultiplier: number;
  overdriveChargeMultiplier: number;
  overdriveDurationMultiplier: number;
}
export interface RevampGoal {
  id: string;
  period: 'daily' | 'weekly';
  periodKey: string;
  kind: RevampEventKind;
  label: string;
  target: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  creditReward: number;
  researchReward: number;
}
export interface RevampUnlock {
  id: string;
  label: string;
  kind: 'wing' | 'trail' | 'skin' | 'tree' | 'story';
  atMinutes: number;
  assetId?: string;
}
export interface RevampMissionInput {
  runId: string;
  missionId: string;
  cleared: boolean;
  kills: number;
  spawned: number;
  damageTaken: number;
  durationMs: number;
  /** Actual gameplay Credits plus the accepted mission reward grant; never wallet purchases. */
  scienceCreditsEarned?: number;
  /** Optional only for callers without live event flushing. */
  bossParts?: number;
  powerups?: number;
  /** Set false when gameplay has already recorded kills/parts/powerup deltas. */
  recordCombatEvents?: boolean;
}
export interface RevampMissionSettlement {
  state: RevampProgress;
  medals: RevampMedal[];
  newMedals: RevampMedal[];
  researchAwarded: number;
  unlocks: RevampUnlock[];
  accepted: boolean;
}
export interface RevampPurchaseResult {
  state: RevampProgress;
  credits: number;
  accepted: boolean;
  reason: 'purchased' | 'max-level' | 'locked' | 'credits' | 'research' | 'invalid';
}
export interface RevampGoalClaimResult {
  state: RevampProgress;
  credits: number;
  accepted: boolean;
  reward: { credits: number; researchData: number; cosmeticId?: string };
}

export interface RevampGoalsView {
  daily: RevampGoal[];
  weekly: RevampGoal[];
  streak: number;
  bestStreak: number;
  weeklyCosmeticId: string;
}

export interface RevampCore {
  REVAMP_PROGRESS_VERSION: 1;
  REVAMP_BRANCHES: readonly RevampBranch[];
  REVAMP_EVENT_KINDS: readonly RevampEventKind[];
  REVAMP_MEDALS: readonly RevampMedal[];
  REVAMP_CREDIT_COSTS: readonly number[];
  REVAMP_RESEARCH_COSTS: readonly number[];
  REVAMP_TREE_UNLOCK_MINUTES: readonly number[];
  REVAMP_MEDAL_DATA: Readonly<Record<RevampMedal, number>>;
  REVAMP_UNLOCK_CADENCE: readonly RevampUnlock[];
  getRevampLocalDateKey(date?: Date): string;
  getRevampIsoWeekKey(date?: Date): string;
  createRevampProgress(date?: Date): RevampProgress;
  sanitizeRevampProgress(value: unknown): RevampProgress;
  touchRevampLogin(state: RevampProgress, date?: Date): RevampProgress;
  mergeRevampProgress(left: unknown, right: unknown): RevampProgress;
  getRevampCreditLedger(state: RevampProgress): { spent: number; earned: number };
  getRevampSpendableCredits(state: RevampProgress, balance: number): number;
  /** Register already-credited gameplay currency once, without settling a new mission. */
  recordRevampEarnedCredits(state: RevampProgress, receiptId: string, amount: number): RevampProgress;
  getUpgradeNodes(state: RevampProgress): RevampUpgradeNode[];
  purchaseRevampUpgrade(state: RevampProgress, branch: RevampBranch, availableCredits: number): RevampPurchaseResult;
  getRevampBonuses(state: RevampProgress): RevampBonuses;
  getRevampGoals(state: RevampProgress, date?: Date): RevampGoalsView;
  recordRevampEvent(state: RevampProgress, event: RevampEvent, date?: Date): RevampProgress;
  claimRevampGoal(state: RevampProgress, goalId: string, availableCredits: number, date?: Date): RevampGoalClaimResult;
  settleRevampMission(state: RevampProgress, input: RevampMissionInput, date?: Date): RevampMissionSettlement;
}
