import { ArchivedWinner } from '../types';

const WINNERS_API_URL = (import.meta.env.VITE_WEEKLY_COMPETITIONS_API_URL as string | undefined)?.trim() || '/api/weekly-competitions';

type RawWinner = Record<string, any>;

const asString = (value: unknown, maxLength = 500): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const safeUrl = (value: unknown) => {
  const url = asString(value);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
};

const formatPeriodLabel = (winner: RawWinner) => {
  const periodStart = asString(winner.starts_at);
  const periodEnd = asString(winner.ends_at);
  const periodKey = asString(winner.week_key, 20);

  if (!periodStart) return periodKey || 'Past pick';

  const startDate = new Date(periodStart);
  const endDate = periodEnd ? new Date(periodEnd) : null;
  if (!Number.isFinite(startDate.getTime())) return periodKey || 'Past pick';

  const startLabel = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!endDate || !Number.isFinite(endDate.getTime())) return startLabel;

  const endLabel = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
};

const normalizeWinner = (winner: RawWinner): ArchivedWinner | null => {
  const winnerName = asString(winner.winner_name, 15);
  const score = asNumber(winner.winning_score);
  if (!winnerName || typeof score !== 'number') return null;

  return {
    periodKey: asString(winner.week_key, 20) || asString(winner.id, 20) || `${winnerName}-${score}`,
    periodLabel: formatPeriodLabel(winner),
    winnerName: winnerName.toUpperCase(),
    score: Math.max(0, Math.floor(score)),
    wave: Math.max(1, Math.floor(asNumber(winner.winning_wave) || 1)),
    scoreDate: asString(winner.finalized_at),
    proposalId: asString(winner.proposal_id, 80),
    proposalTitle: asString(winner.proposal_title, 180),
    proposalUrl: safeUrl(winner.proposal_url),
    proposalAuthor: asString(winner.proposal_author, 100),
    proposalImageUrl: safeUrl(winner.proposal_image_url),
    allocationRsc: Math.max(0, Math.floor(asNumber(winner.allocation_rsc) || 100)),
    status: asString(winner.status, 20) as ArchivedWinner['status'],
    claimDeadline: asString(winner.claim_deadline),
    allocationTxHash: asString(winner.allocation_tx_hash, 100),
    championTokenId: asString(winner.champion_token_id, 100),
    winnerWallet: asString(winner.winner_wallet, 80),
    winnerRunId: asString(winner.winner_run_id, 80)
  };
};

export const getArchivedWeeklyWinners = async (): Promise<ArchivedWinner[] | null> => {
  try {
    const response = await fetch(WINNERS_API_URL, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const winners = Array.isArray(payload?.competitions) ? payload.competitions : [];

    return winners
      .filter((winner): winner is RawWinner => Boolean(winner) && typeof winner === 'object' && !Array.isArray(winner))
      .map(normalizeWinner)
      .filter((winner): winner is ArchivedWinner => Boolean(winner));
  } catch {
    return null;
  }
};
