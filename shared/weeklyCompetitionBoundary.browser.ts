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

interface PrizeEventMeta {
  startsAt: Date;
  endsAt: Date;
  proposalOpenUntil: Date;
  daysLeft: number;
  endLabel: string;
  closed: boolean;
  allocationRsc: number;
}

interface WeeklyCompetitionBoundary {
  WEEKLY_ALLOCATION_RSC: number;
  PRIZE_EVENT_ALLOCATION_RSC: number;
  WEEKLY_SCORE_SETTLEMENT_MS: number;
  getPrizeEventMeta: (now?: Date | string | number) => PrizeEventMeta;
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
export const getPrizeEventMeta = boundary.getPrizeEventMeta;
export const getWeeklyPresentationMeta = boundary.getWeeklyPresentationMeta;
export const resolveWeeklyDashboardPublication = boundary.resolveWeeklyDashboardPublication;
export const WEEKLY_ALLOCATION_RSC = boundary.WEEKLY_ALLOCATION_RSC;
export const PRIZE_EVENT_ALLOCATION_RSC = boundary.PRIZE_EVENT_ALLOCATION_RSC;
export const WEEKLY_SCORE_SETTLEMENT_MS = boundary.WEEKLY_SCORE_SETTLEMENT_MS;
