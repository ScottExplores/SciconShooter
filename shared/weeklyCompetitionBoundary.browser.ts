import './weeklyCompetitionBoundary.js';

interface WeeklyBoundaryMeta {
  weekKey: string;
  startsAt: Date;
  endsAt: Date;
  daysLeft: number;
  endLabel: string;
}

interface WeeklyPresentationMeta extends WeeklyBoundaryMeta {
  scoringWeekKey: string;
  isFinalizing: boolean;
  publishesAt: Date;
}

interface WeeklyDashboardPublication {
  presentationTime: number;
  visibleWeekKey: string;
  waitingForArchive: boolean;
  requiredArchiveWeekKey: string | null;
}

interface PublicPrizeState {
  phase: 'big-event' | 'big-event-closed' | 'weekly';
  name: string;
  allocationRsc: number;
  startsAt: Date;
  closesAt: Date;
  weeklyResumesAt: Date;
  proposalOpenUntil: Date;
  scoreWindow: { start: Date; end: Date };
  snapshotFrozen: boolean;
  statusLabel: string | null;
  daysLeft: number;
}

interface RunAttemptPolicy {
  scopeId: string;
  freeAttempts: number;
  resetAt: Date;
  resetAtMs: number;
  eventWide: boolean;
  weekKey: string;
  countedScopeIds: readonly string[];
}

interface WeeklyCompetitionBoundary {
  WEEKLY_ALLOCATION_RSC: number;
  SCICON_EVENT_ATTEMPT_LIMIT: number;
  SCICON_EVENT_ATTEMPT_SCOPE_ID: string;
  WEEKLY_RUN_FREE_ATTEMPT_LIMIT: number;
  SCICON_BIG_EVENT: {
    name: string;
    allocationRsc: number;
    startsAt: string;
    closesAt: string;
    proposalOpenUntil: string;
    winnerAnnouncedLabel: string;
    weeklyResumesWeekKey: string;
  };
  SCICON_EVENT_CHOICE_COPY: string;
  SCICON_EVENT_PAUSE_COPY: string;
  WEEKLY_SCORE_SETTLEMENT_MS: number;
  getPublicPrizeState: (now?: Date | string | number) => PublicPrizeState;
  resolveRunAttemptPolicy: (now?: Date | string | number) => RunAttemptPolicy;
  weekKeyOverlapsPlayableEvent: (weekKey: string) => boolean;
  getWeeklyBoundaryMeta: (
    now?: Date | string | number,
    locale?: string | string[]
  ) => WeeklyBoundaryMeta;
  getWeeklyPresentationMeta: (
    now?: Date | string | number,
    locale?: string | string[]
  ) => WeeklyPresentationMeta;
  resolveWeeklyDashboardPublication: (
    completedWeekKeys: readonly string[],
    now?: Date | string | number
  ) => WeeklyDashboardPublication;
}

const boundary = (globalThis as typeof globalThis & {
  __SCICON_WEEKLY_COMPETITION_BOUNDARY__?: WeeklyCompetitionBoundary;
}).__SCICON_WEEKLY_COMPETITION_BOUNDARY__;

if (!boundary) {
  throw new Error('Weekly competition boundary failed to initialize.');
}

export const getWeeklyBoundaryMeta = boundary.getWeeklyBoundaryMeta;
export const getPublicPrizeState = boundary.getPublicPrizeState;
export const resolveRunAttemptPolicy = boundary.resolveRunAttemptPolicy;
export const weekKeyOverlapsPlayableEvent = boundary.weekKeyOverlapsPlayableEvent;
export const SCICON_EVENT_ATTEMPT_LIMIT = boundary.SCICON_EVENT_ATTEMPT_LIMIT;
export const SCICON_EVENT_ATTEMPT_SCOPE_ID = boundary.SCICON_EVENT_ATTEMPT_SCOPE_ID;
export const getWeeklyPresentationMeta = boundary.getWeeklyPresentationMeta;
export const resolveWeeklyDashboardPublication = boundary.resolveWeeklyDashboardPublication;
export const WEEKLY_ALLOCATION_RSC = boundary.WEEKLY_ALLOCATION_RSC;
export const SCICON_BIG_EVENT = boundary.SCICON_BIG_EVENT;
export const SCICON_EVENT_CHOICE_COPY = boundary.SCICON_EVENT_CHOICE_COPY;
export const SCICON_EVENT_PAUSE_COPY = boundary.SCICON_EVENT_PAUSE_COPY;
export const WEEKLY_SCORE_SETTLEMENT_MS = boundary.WEEKLY_SCORE_SETTLEMENT_MS;
