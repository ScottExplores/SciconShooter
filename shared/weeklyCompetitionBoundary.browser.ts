import './weeklyCompetitionBoundary.js';

interface WeeklyBoundaryMeta {
  weekKey: string;
  startsAt: Date;
  endsAt: Date;
  daysLeft: number;
  endLabel: string;
}

interface WeeklyCompetitionBoundary {
  getWeeklyBoundaryMeta: (
    now?: Date | string | number,
    locale?: string | string[]
  ) => WeeklyBoundaryMeta;
}

const boundary = (globalThis as typeof globalThis & {
  __SCICON_WEEKLY_COMPETITION_BOUNDARY__?: WeeklyCompetitionBoundary;
}).__SCICON_WEEKLY_COMPETITION_BOUNDARY__;

if (!boundary) {
  throw new Error('Weekly competition boundary failed to initialize.');
}

export const getWeeklyBoundaryMeta = boundary.getWeeklyBoundaryMeta;
