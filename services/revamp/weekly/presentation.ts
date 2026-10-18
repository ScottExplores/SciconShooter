import type { LeaderboardEntry } from '../../../types';
import { getWeeklyBoundaryMeta } from '../../../shared/weeklyCompetitionBoundary.browser';

export const weeklyStandings = (entries: readonly LeaderboardEntry[], now = Date.now()) => {
  const { startsAt, endsAt } = getWeeklyBoundaryMeta(now);
  return entries.filter((entry) => {
    const timestamp = Date.parse(entry.date || '');
    return Number.isFinite(entry.score) && entry.score >= 0 && timestamp >= +startsAt && timestamp < +endsAt;
  }).sort((a, b) => b.score - a.score || Date.parse(a.date!) - Date.parse(b.date!));
};

export const findPilotStanding = (
  entries: readonly LeaderboardEntry[],
  walletAddress?: string | null,
  runIds: readonly string[] = []
) => {
  const index = entries.findIndex((entry) =>
    (entry.runId && runIds.includes(entry.runId))
    || (walletAddress && entry.walletAddress?.toLowerCase() === walletAddress.toLowerCase()));
  return index < 0 ? null : { rank: index + 1, entry: entries[index], gap: Math.max(0, (entries[0]?.score || 0) - entries[index].score) };
};

export const weeklyResultNudge = (
  entries: readonly LeaderboardEntry[], score: number, runId?: string | null, now = Date.now()
) => {
  const board = weeklyStandings(entries, now);
  const saved = runId ? findPilotStanding(board, null, [runId]) : null;
  const gap = Math.max(0, (board[0]?.score || 0) - score);
  if (saved) return saved.rank === 1
    ? "You're #1 — defend your lead until the reset."
    : `You're #${saved.rank} — ${saved.gap.toLocaleString('en-US')} pts behind #1.`;
  if (!board.length) return 'Standings are not available yet. Submit to join the weekly board.';
  if (!gap) return score === board[0].score
    ? 'Level with #1 — the earlier verified score wins a tie.'
    : 'A new lead is in reach. Submit to validate your score.';
  return `${gap.toLocaleString('en-US')} pts behind #1. Submit to see your rank.`;
};

export const weeklyCountdown = (now = Date.now()) => {
  const boundary = getWeeklyBoundaryMeta(now);
  const seconds = Math.max(0, Math.ceil((+boundary.endsAt - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return { ...boundary, label: `${days ? `${days}d ` : ''}${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainder).padStart(2, '0')}s` };
};
