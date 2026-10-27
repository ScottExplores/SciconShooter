import { STORAGE_KEYS } from '../constants';
import type { WeeklyCampaignStreakState } from './weeklyCampaignStreak';

export interface PendingWeeklyRunAdmission {
  schemaVersion: 1;
  profileId: string;
  weeklyId: string;
  sessionKey: string;
  createdAtMs: number;
}

export const getWeeklyRunAdmissionSessionKey = (
  streak: WeeklyCampaignStreakState
) => `${streak.weeklyId}:${streak.startNodeId}:${streak.createdAtMs}`;

export const readPendingWeeklyRunAdmission = (): PendingWeeklyRunAdmission | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.WEEKLY_RUN_PENDING_ADMISSION);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingWeeklyRunAdmission>;
    if (
      value.schemaVersion !== 1
      || typeof value.profileId !== 'string'
      || typeof value.weeklyId !== 'string'
      || typeof value.sessionKey !== 'string'
      || !Number.isFinite(value.createdAtMs)
    ) return null;
    return {
      schemaVersion: 1,
      profileId: value.profileId,
      weeklyId: value.weeklyId,
      sessionKey: value.sessionKey,
      createdAtMs: Math.floor(value.createdAtMs)
    };
  } catch {
    return null;
  }
};

export const writePendingWeeklyRunAdmission = (
  marker: PendingWeeklyRunAdmission
) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.WEEKLY_RUN_PENDING_ADMISSION,
      JSON.stringify(marker)
    );
    return true;
  } catch {
    return false;
  }
};

export const clearPendingWeeklyRunAdmission = (expectedSessionKey?: string) => {
  try {
    if (expectedSessionKey) {
      const current = readPendingWeeklyRunAdmission();
      if (current && current.sessionKey !== expectedSessionKey) return false;
    }
    window.localStorage.removeItem(STORAGE_KEYS.WEEKLY_RUN_PENDING_ADMISSION);
    return true;
  } catch {
    return false;
  }
};

export const canRetryPendingWeeklyRunAdmission = ({
  marker,
  streak,
  profileId,
  weeklyId
}: {
  marker: PendingWeeklyRunAdmission | null;
  streak: WeeklyCampaignStreakState | null | undefined;
  profileId: string;
  weeklyId: string;
}) => Boolean(
  marker
  && streak
  && marker.profileId === profileId
  && marker.weeklyId === weeklyId
  && marker.sessionKey === getWeeklyRunAdmissionSessionKey(streak)
  && streak.weeklyId === weeklyId
  && streak.finalization.status === 'active'
  && streak.finalization.submissionStatus === 'not-ready'
  && streak.currentNodeId === streak.startNodeId
  && streak.revision === 1
  && streak.visitedNodeIds.length === 1
  && streak.visitedNodeIds[0] === streak.startNodeId
  && streak.committedRoutes.length === 0
  && streak.scoreEvents.length === 0
  && streak.scoredNodeIds.length === 0
  && streak.score.totalPoints === 0
  && streak.score.eventCount === 0
);

const RAW_LAUNCH_FAILURE = /^(failed to fetch|load failed|networkerror|network request failed|failed to load)$/i;

/** Browser transport failures should not land on the home card as a raw exception. */
export const weeklyRunLaunchFailureCopy = (error: unknown): string => {
  const message = error instanceof Error ? error.message.trim() : '';
  const details = (error as { details?: unknown })?.details;
  const detailList = Array.isArray(details) ? details.map((item) => String(item)) : [];
  if (detailList.includes('weekly_run_attempts_exhausted')) {
    return 'This week\'s free runs are already in. The board resets with the next week.';
  }
  if (
    error instanceof TypeError
    || message.length === 0
    || RAW_LAUNCH_FAILURE.test(message)
  ) {
    return 'The launch link dropped before the run could start. Try again.';
  }
  return message;
};

export const isRetryableWeeklyRunAdmissionError = (error: unknown) => {
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
  return !Number.isFinite(statusCode)
    || statusCode >= 500
    || statusCode === 408
    || statusCode === 425
    || statusCode === 429;
};

export const getWeeklyRunSessionQuotaOwner = (identity: {
  kind?: unknown;
  walletAddress?: unknown;
} | null | undefined) => {
  if (identity?.kind !== 'wallet') return null;
  const address = String(identity.walletAddress || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};
