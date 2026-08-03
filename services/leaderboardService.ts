import { LeaderboardData, LeaderboardEntry } from '../types';
import type { ResearchHubProposal } from './researchHubProposals';
import type { RunReceipt } from './runReceiptService';
import type { Address, Hex } from 'viem';
import { getWeeklyBoundaryMeta } from '../shared/weeklyCompetitionBoundary.browser';
import { selectWeeklyProposalWithFreshChallenge } from './weeklyProposalAuthorization';

const API_URL = (import.meta.env.VITE_LEADERBOARD_API_URL as string | undefined)?.trim() || '/api/leaderboard';
export const ALL_TIME_SCORE_LIMIT = 100;
export const WEEKLY_SCORE_LIMIT = 100;

const sanitizeText = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const sanitizeUrl = (value: unknown): string | undefined => {
  const url = sanitizeText(value, 500);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
};

const getCurrentWeekRange = () => {
  const boundary = getWeeklyBoundaryMeta();

  return {
    start: boundary.startsAt.getTime(),
    end: boundary.endsAt.getTime()
  };
};

const isCurrentWeekEntry = (entry: LeaderboardEntry) => {
  const timestamp = new Date(entry.date || 0).getTime();
  const { start, end } = getCurrentWeekRange();
  return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
};

const sanitizeEntry = (entry: Partial<LeaderboardEntry> | null | undefined): LeaderboardEntry | null => {
  if (!entry || typeof entry.name !== 'string' || typeof entry.score !== 'number') {
    return null;
  }

  return {
    name: entry.name.trim().substring(0, 15).toUpperCase(),
    score: Math.max(0, Math.floor(entry.score)),
    wave: typeof entry.wave === 'number' ? Math.max(1, Math.floor(entry.wave)) : 1,
    date: entry.date || new Date().toISOString(),
    walletAddress: typeof entry.walletAddress === 'string' ? entry.walletAddress.toLowerCase() : undefined,
    donated: Boolean(entry.donated),
    proposalId: sanitizeText(entry.proposalId, 80),
    proposalTitle: sanitizeText(entry.proposalTitle, 180),
    proposalUrl: sanitizeUrl(entry.proposalUrl),
    proposalAuthor: sanitizeText(entry.proposalAuthor, 100),
    proposalImageUrl: sanitizeUrl(entry.proposalImageUrl),
    runId: sanitizeText(entry.runId, 80),
    verified: Boolean(entry.verified)
  };
};

const dedupeAndSort = (scores: LeaderboardEntry[], limit: number): LeaderboardEntry[] => {
  const seen = new Set<string>();
  const normalized = scores
    .map(score => sanitizeEntry(score))
    .filter((score): score is LeaderboardEntry => !!score)
    .filter((score) => {
      const key = `${score.name}|${score.score}|${score.wave}|${score.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  normalized.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
  });

  return normalized.slice(0, limit);
};

const toLeaderboardData = (scores: LeaderboardEntry[], remoteSaved?: boolean): LeaderboardData => {
  const allTime = dedupeAndSort(scores, ALL_TIME_SCORE_LIMIT);
  const monthlyScores = dedupeAndSort(scores.filter(isCurrentWeekEntry), WEEKLY_SCORE_LIMIT);

  return {
    scores: allTime,
    monthlyScores,
    ...(typeof remoteSaved === 'boolean' ? { remoteSaved } : {})
  };
};

const readRemoteLeaderboardData = async (): Promise<LeaderboardData> => {
  const response = await fetch(API_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Leaderboard fetch failed with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Leaderboard endpoint did not return JSON');
  }

  const data = await response.json();
  const scores = Array.isArray(data.scores) ? dedupeAndSort(data.scores, ALL_TIME_SCORE_LIMIT) : [];
  const monthlyScores = Array.isArray(data.monthlyScores)
    ? dedupeAndSort(data.monthlyScores, WEEKLY_SCORE_LIMIT)
    : dedupeAndSort(scores.filter(isCurrentWeekEntry), WEEKLY_SCORE_LIMIT);

  return { scores, monthlyScores };
};

export const getLeaderboardWeekScores = async (
  weekKey: string
): Promise<LeaderboardEntry[] | null> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return null;

  try {
    const separator = API_URL.includes('?') ? '&' : '?';
    const response = await fetch(`${API_URL}${separator}weekKey=${encodeURIComponent(weekKey)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;

    const data = await response.json();
    if (data?.weekKey !== weekKey || !Array.isArray(data?.weekScores)) return null;
    return dedupeAndSort(data.weekScores, WEEKLY_SCORE_LIMIT);
  } catch (error) {
    console.error('Weekly leaderboard error:', error);
    return null;
  }
};

const writeRemoteLeaderboardData = async (
  entry: LeaderboardEntry,
  receipt: RunReceipt
): Promise<LeaderboardData> => {
  const response = await fetch(API_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: entry.name,
      walletAddress: entry.walletAddress,
      receiptToken: receipt.receiptToken
    })
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || details.details || `Leaderboard save failed with ${response.status}`);
  }

  const data = await response.json();
  const nextScores = Array.isArray(data.scores) ? dedupeAndSort(data.scores, ALL_TIME_SCORE_LIMIT) : [];
  const monthlyScores = Array.isArray(data.monthlyScores)
    ? dedupeAndSort(data.monthlyScores, WEEKLY_SCORE_LIMIT)
    : dedupeAndSort(nextScores.filter(isCurrentWeekEntry), WEEKLY_SCORE_LIMIT);

  return { scores: nextScores, monthlyScores, remoteSaved: true };
};

export const getLeaderboardData = async (): Promise<LeaderboardData> => {
  try {
    return await readRemoteLeaderboardData();
  } catch (error) {
    console.error("Leaderboard error:", error);
    return toLeaderboardData([]);
  }
};

export const getScores = async (): Promise<LeaderboardEntry[]> => {
  const data = await getLeaderboardData();
  return data.scores;
};

export const saveScore = async (
  name: string,
  score: number,
  wave: number,
  options: {
    date?: string;
    walletAddress?: string | null;
    donated?: boolean;
    proposalId?: string;
    proposalTitle?: string;
    proposalUrl?: string;
    proposalAuthor?: string;
    proposalImageUrl?: string;
    receipt?: RunReceipt;
  } = {}
): Promise<LeaderboardData> => {
  const newEntry: LeaderboardEntry = {
    name: name.trim().substring(0, 15).toUpperCase(),
    score: Math.max(0, Math.floor(score)),
    wave: Math.max(1, Math.floor(wave)),
    date: options.date || new Date().toISOString(),
    walletAddress: options.walletAddress ? options.walletAddress.toLowerCase() : undefined,
    donated: Boolean(options.donated),
    proposalId: sanitizeText(options.proposalId, 80),
    proposalTitle: sanitizeText(options.proposalTitle, 180),
    proposalUrl: sanitizeUrl(options.proposalUrl),
    proposalAuthor: sanitizeText(options.proposalAuthor, 100),
    proposalImageUrl: sanitizeUrl(options.proposalImageUrl)
  };

  try {
    if (!options.receipt || options.receipt.integrity === 'local-unverified' || !options.receipt.receiptToken) {
      throw new Error('This run is local-only and cannot be submitted to the global leaderboard.');
    }
    return await writeRemoteLeaderboardData(newEntry, options.receipt);
  } catch (error) {
    console.error("Save error:", error);
    return {
      ...toLeaderboardData([newEntry], false),
      remoteError: error instanceof Error ? error.message : 'Global leaderboard save failed.'
    };
  }
};

export const saveWeeklyLeaderProposal = async (
  receipt: RunReceipt,
  proposal: ResearchHubProposal,
  walletAuthorization?: {
    address: Address;
    signMessage: (address: Address, message: string) => Promise<Hex>;
  }
): Promise<LeaderboardData> => {
  if (!receipt.receiptToken || receipt.integrity === 'local-unverified' || receipt.testRun) {
    throw new Error('A verified weekly-leading run is required to choose a proposal.');
  }

  const postProposalAction = async (payload: Record<string, unknown>) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        proposalId: proposal.id,
        receiptToken: receipt.receiptToken,
        ...payload
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.details || `Proposal selection failed with ${response.status}`);
      Object.assign(error, {
        status: response.status,
        code: typeof data.code === 'string' ? data.code : undefined
      });
      throw error;
    }
    return data;
  };

  const data = walletAuthorization
    ? await selectWeeklyProposalWithFreshChallenge(walletAuthorization, postProposalAction)
    : await postProposalAction({ action: 'select-proposal' });

  const scores = Array.isArray(data.scores) ? dedupeAndSort(data.scores, ALL_TIME_SCORE_LIMIT) : [];
  const monthlyScores = Array.isArray(data.monthlyScores)
    ? dedupeAndSort(data.monthlyScores, WEEKLY_SCORE_LIMIT)
    : dedupeAndSort(scores.filter(isCurrentWeekEntry), WEEKLY_SCORE_LIMIT);

  return { scores, monthlyScores, remoteSaved: true };
};
