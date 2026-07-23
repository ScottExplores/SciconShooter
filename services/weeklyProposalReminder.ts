export const WEEKLY_PROPOSAL_REMINDER_STORAGE_KEY = 'scicon.weekly-proposal-reminder';
export const WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type WeeklyProposalReminderReason = 'missing' | 'completed';

interface WeeklyProposalReminderStorageValue {
  version: 1;
  shownAt: number;
}

interface WeeklyProposalReminderKeyInput {
  runId?: string | null;
  reason?: WeeklyProposalReminderReason | null;
  proposalId?: string | null;
}

/**
 * Scope reminders to the exact current-leading run and attention reason.
 * Completed-proposal reminders also include the exact proposal ID, allowing a
 * later replacement on the same run to receive its own reminder if necessary.
 */
export const getWeeklyProposalReminderStorageKey = ({
  runId,
  reason,
  proposalId
}: WeeklyProposalReminderKeyInput): string | null => {
  const normalizedRunId = runId?.trim();
  if (!normalizedRunId || !reason) return null;

  const normalizedProposalId = proposalId?.trim();
  if (reason === 'completed' && !normalizedProposalId) return null;

  const keyParts = [
    WEEKLY_PROPOSAL_REMINDER_STORAGE_KEY,
    encodeURIComponent(normalizedRunId),
    reason
  ];
  if (reason === 'completed') keyParts.push(encodeURIComponent(normalizedProposalId as string));
  return keyParts.join(':');
};

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
