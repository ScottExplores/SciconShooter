import './core.js';
import type { RevampCore } from './types';
export type * from './types';

const core = (globalThis as typeof globalThis & { __SCICON_REVAMP_PROGRESSION__?: RevampCore }).__SCICON_REVAMP_PROGRESSION__;
if (!core) throw new Error('Revamp progression rules failed to initialize.');

export const {
  REVAMP_PROGRESS_VERSION, REVAMP_BRANCHES, REVAMP_EVENT_KINDS, REVAMP_MEDALS,
  REVAMP_CREDIT_COSTS, REVAMP_RESEARCH_COSTS, REVAMP_TREE_UNLOCK_MINUTES,
  REVAMP_MEDAL_DATA, REVAMP_UNLOCK_CADENCE,
  getRevampLocalDateKey, getRevampIsoWeekKey,
  sanitizeRevampProgress, createRevampProgress, touchRevampLogin,
  mergeRevampProgress, getRevampCreditLedger, getRevampSpendableCredits, recordRevampEarnedCredits, getUpgradeNodes,
  purchaseRevampUpgrade, getRevampBonuses, getRevampGoals,
  recordRevampEvent, claimRevampGoal, settleRevampMission
} = core;
