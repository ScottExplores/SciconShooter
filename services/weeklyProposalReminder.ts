export const WEEKLY_PROPOSAL_REMINDER_STORAGE_KEY = 'scicon.weekly-proposal-reminder';
export const WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000;

interface WeeklyProposalReminderStorageValue {
  version: 1;
  shownAt: number;
}

export const parseWeeklyProposalReminderTimestamp = (value: string | null): number | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<WeeklyProposalReminderStorageValue>;
    return parsed.version === 1 && Number.isFinite(parsed.shownAt) && Number(parsed.shownAt) >= 0
      ? Number(parsed.shownAt)
      : null;
  } catch {
    return null;
  }
};

export const serializeWeeklyProposalReminderTimestamp = (shownAt: number): string => JSON.stringify({
  version: 1,
  shownAt
} satisfies WeeklyProposalReminderStorageValue);

export const isWeeklyProposalReminderDue = (
  now: number,
  lastShownAt: number | null
): boolean => (
  lastShownAt === null
  || (now >= lastShownAt && now - lastShownAt >= WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS)
);
