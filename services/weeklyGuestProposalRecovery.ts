import { STORAGE_KEYS } from '../constants';
import type { LeaderboardEntry } from '../types';
import type { RunReceipt } from './runReceiptService';
import { getWeeklyBoundaryMeta } from '../shared/weeklyCompetitionBoundary.browser';

export interface WeeklyGuestProposalCapability {
  schemaVersion: 1;
  pilotName: string;
  weeklyId: string;
  storedAtMs: number;
  /** Client time when the score POST settled, regardless of response outcome. */
  scoreSettledAtMs?: number;
  proposalState: 'pending' | 'resolved' | 'displaced';
  /**
   * A leaderboard read can race the score write or a read replica. Remembering
   * one positive mismatch lets a later authoritative read recover the exact
   * run instead of permanently retiring its proposal capability.
   */
  leaderMismatchCount?: 0 | 1;
  receipt: RunReceipt;
}

export interface WeeklyGuestProposalResolution {
  recoverable: WeeklyGuestProposalCapability | null;
  retained: WeeklyGuestProposalCapability[];
  evidence: 'ambiguous-empty' | 'positive-leader';
}

// Keep every possible attempt from the current week plus the fixed three-week
// competition-recovery horizon (4 * 5), with two retry slots. Otherwise a
// valid oldest-week champion capability could be evicted before finalization.
const MAX_STORED_CAPABILITIES = 22;

// Keep reconciliation quick enough for the result screen while allowing the
// leaderboard write/read path a bounded period to converge. The final retry
// lands after this grace window so a score that truly did not commit is still
// retired rather than remaining pending forever.
export const WEEKLY_GUEST_PROPOSAL_MISMATCH_GRACE_MS = 5_000;
export const WEEKLY_GUEST_PROPOSAL_RECONCILIATION_DELAYS_MS = [
  500,
  1_000,
  2_000,
  3_000,
  1_000
] as const;

const isCapabilityShape = (value: unknown): value is WeeklyGuestProposalCapability => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const capability = value as Partial<WeeklyGuestProposalCapability>;
  const receipt = capability.receipt;
  return capability.schemaVersion === 1
    && typeof capability.pilotName === 'string'
    && typeof capability.weeklyId === 'string'
    && typeof capability.storedAtMs === 'number'
    && Number.isFinite(capability.storedAtMs)
    && (
      capability.scoreSettledAtMs === undefined
      || (typeof capability.scoreSettledAtMs === 'number'
        && Number.isFinite(capability.scoreSettledAtMs))
    )
    && (
      capability.leaderMismatchCount === undefined
      || capability.leaderMismatchCount === 0
      || capability.leaderMismatchCount === 1
    )
    && (
      capability.proposalState === undefined
      || capability.proposalState === 'pending'
      || capability.proposalState === 'resolved'
      || capability.proposalState === 'displaced'
    )
    && Boolean(receipt)
    && receipt?.runMode === 'weekly-streak'
    && receipt?.integrity === 'server-verified'
    && receipt?.persisted === true
    && receipt?.identity?.kind === 'guest'
    && typeof receipt?.receiptToken === 'string'
    && receipt.receiptToken.length > 0
    && typeof receipt?.runId === 'string'
    && receipt.runId.length > 0;
};

const normalizeCapabilities = (values: unknown[]) => {
  const byRunId = new Map<string, WeeklyGuestProposalCapability>();
  values.forEach((value) => {
    if (!isCapabilityShape(value)) return;
    const normalizedValue: WeeklyGuestProposalCapability = {
      ...value,
      proposalState: value.proposalState || 'pending',
      leaderMismatchCount: value.leaderMismatchCount === 1 ? 1 : 0
    };
    const existing = byRunId.get(value.receipt.runId);
    if (!existing || normalizedValue.storedAtMs > existing.storedAtMs) {
      byRunId.set(value.receipt.runId, normalizedValue);
    }
  });
  return [...byRunId.values()]
    .sort((a, b) => b.storedAtMs - a.storedAtMs)
    .slice(0, MAX_STORED_CAPABILITIES);
};

export const createWeeklyGuestProposalCapability = (
  receipt: RunReceipt,
  pilotName: string,
  now = Date.now()
): WeeklyGuestProposalCapability | null => {
  const weeklyId = receipt.weeklyCampaign?.weeklyId;
  const capability: WeeklyGuestProposalCapability = {
    schemaVersion: 1,
    pilotName: pilotName.trim().slice(0, 15).toUpperCase() || 'PILOT',
    weeklyId: weeklyId || '',
    storedAtMs: Math.floor(now),
    proposalState: 'pending',
    leaderMismatchCount: 0,
    receipt
  };
  return weeklyId && isCapabilityShape(capability) ? capability : null;
};

export const readWeeklyGuestProposalCapabilities = (): WeeklyGuestProposalCapability[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.WEEKLY_GUEST_PROPOSAL_CAPABILITY);
    if (!raw || raw.length > 200_000) return [];
    const value: unknown = JSON.parse(raw);
    // Accept the original single-capability draft so an in-flight browser can
    // upgrade without losing the verified receipt it already holds.
    return normalizeCapabilities(Array.isArray(value) ? value : [value]);
  } catch {
    return [];
  }
};

export const writeWeeklyGuestProposalCapabilities = (
  capabilities: WeeklyGuestProposalCapability[]
) => {
  const normalized = normalizeCapabilities(capabilities);
  try {
    if (normalized.length === 0) {
      window.localStorage.removeItem(STORAGE_KEYS.WEEKLY_GUEST_PROPOSAL_CAPABILITY);
    } else {
      window.localStorage.setItem(
        STORAGE_KEYS.WEEKLY_GUEST_PROPOSAL_CAPABILITY,
        JSON.stringify(normalized)
      );
    }
    return true;
  } catch {
    return false;
  }
};

export const writeWeeklyGuestProposalCapability = (
  capability: WeeklyGuestProposalCapability
) => {
  const next = normalizeCapabilities([
    capability,
    ...readWeeklyGuestProposalCapabilities()
  ]);
  return writeWeeklyGuestProposalCapabilities(next) ? next : null;
};

export const markWeeklyGuestProposalCapability = (
  expectedRunId: string,
  proposalState: 'resolved' | 'displaced'
) => {
  const current = readWeeklyGuestProposalCapabilities();
  const retained = current.map((capability) => (
    capability.receipt.runId === expectedRunId
      ? { ...capability, proposalState }
      : capability
  ));
  return writeWeeklyGuestProposalCapabilities(retained) ? retained : null;
};

export const markWeeklyGuestProposalScoreSettled = (
  expectedRunId: string,
  now = Date.now()
) => {
  const current = readWeeklyGuestProposalCapabilities();
  const retained = current.map((capability) => (
    capability.receipt.runId === expectedRunId
      ? {
          ...capability,
          scoreSettledAtMs: Math.floor(now),
          leaderMismatchCount: 0 as const
        }
      : capability
  ));
  return writeWeeklyGuestProposalCapabilities(retained) ? retained : null;
};

export const resolveWeeklyGuestProposalCapabilities = ({
  capabilities,
  weeklyLeaderboard,
  now = Date.now()
}: {
  capabilities: WeeklyGuestProposalCapability[];
  weeklyLeaderboard: LeaderboardEntry[];
  now?: number;
}): WeeklyGuestProposalResolution => {
  const currentWeeklyId = getWeeklyBoundaryMeta(new Date(now)).weekKey;
  const unexpired = normalizeCapabilities(capabilities).filter((capability) => {
    const expiresAt = Date.parse(capability.receipt.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  const current = unexpired.map((capability) => (
    capability.proposalState === 'pending' && (
      capability.weeklyId !== currentWeeklyId
      || capability.receipt.weeklyCampaign?.weeklyId !== capability.weeklyId
      || !String(capability.receipt.weeklyCampaign?.startNodeId || '').startsWith('weekly-run-')
    )
      ? { ...capability, proposalState: 'displaced' as const }
      : capability
  ));
  const pending = current.filter((capability) => capability.proposalState === 'pending');
  const leader = weeklyLeaderboard[0];
  if (!leader) {
    // An empty list cannot distinguish a legitimate empty week from an
    // interrupted/failed load. Keep every still-current capability until a
    // concrete leader or the receipt/week expiry gives us authoritative proof.
    return { recoverable: null, retained: current, evidence: 'ambiguous-empty' };
  }

  const matching = pending.find((capability) => (
    leader.verified === true
    && leader.runId === capability.receipt.runId
    && leader.score === capability.receipt.metrics.score
    && (leader.wave ?? 1) === capability.receipt.metrics.wave
  ));
  if (!matching) {
    return {
      recoverable: null,
      retained: current.map((capability) => {
        if (capability.proposalState !== 'pending') return capability;

        // Older stored capabilities have no settlement marker. Their first
        // concrete mismatch starts the same bounded grace instead of treating
        // an app reload as proof that the score never committed.
        if (capability.scoreSettledAtMs === undefined) {
          return {
            ...capability,
            scoreSettledAtMs: Math.floor(now),
            leaderMismatchCount: 0 as const
          };
        }
        if (now < capability.scoreSettledAtMs + WEEKLY_GUEST_PROPOSAL_MISMATCH_GRACE_MS) {
          // Reads during convergence are not cumulative evidence. This keeps a
          // series of fast stale replicas from consuming the one-mismatch
          // allowance before the final reconciliation request can return.
          return capability.leaderMismatchCount === 0
            ? capability
            : { ...capability, leaderMismatchCount: 0 as const };
        }
        if (capability.leaderMismatchCount === 0) {
          return { ...capability, leaderMismatchCount: 1 as const };
        }
        return { ...capability, proposalState: 'displaced' as const };
      }),
      evidence: 'positive-leader'
    };
  }
  if (leader.proposalId) {
    return {
      recoverable: null,
      retained: current.map((capability) => (
        capability.proposalState !== 'pending'
          ? capability
          : {
              ...capability,
              leaderMismatchCount: 0 as const,
              proposalState: capability.receipt.runId === matching.receipt.runId
                ? 'resolved' as const
                : 'displaced' as const
            }
      )),
      evidence: 'positive-leader'
    };
  }
  // A concrete No. 1 row proves that every other locally remembered run is no
  // longer the leader, while this exact receipt still owns the missing choice.
  const recovered = { ...matching, leaderMismatchCount: 0 as const };
  return {
    recoverable: recovered,
    retained: current.map((capability) => (
      capability.receipt.runId === matching.receipt.runId
        ? recovered
        : capability.proposalState === 'pending'
          ? { ...capability, proposalState: 'displaced' as const }
          : capability
    )),
    evidence: 'positive-leader'
  };
};
