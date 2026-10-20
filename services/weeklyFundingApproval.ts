/**
 * Client-side view of the server funding gate in `shared/weeklyFundingApproval.js`.
 * The browser can explain the state. It cannot approve or record a transfer.
 */

export type WeeklyFundingReleaseState =
  | 'not-selected'
  | 'winner-selected'
  | 'admin-approved'
  | 'transfer-recorded';

export const describeWeeklyFundingRelease = (
  status?: string | null
): WeeklyFundingReleaseState => {
  switch (String(status || '').toLowerCase()) {
    case 'claimed':
      return 'winner-selected';
    case 'pending-funding':
      return 'admin-approved';
    case 'funded':
      return 'transfer-recorded';
    default:
      return 'not-selected';
  }
};

export const WEEKLY_FUNDING_RELEASE_COPY: Record<WeeklyFundingReleaseState, string> = {
  'not-selected': 'The weekly winner has not chosen a proposal.',
  'winner-selected': 'The winner chose a proposal. No RSC moves until an admin approves it.',
  'admin-approved': 'An admin approved this proposal. The transfer is still manual and unsent.',
  'transfer-recorded': 'An admin recorded a transfer hash. The game did not send the funds.'
};
