import { LeaderboardData, LeaderboardEntry } from '../types';

const API_URL = (import.meta.env.VITE_LEADERBOARD_API_URL as string | undefined)?.trim() || '/api/leaderboard';
const MAX_SCORES = 25;
const MAX_MONTHLY_SCORES = 5;

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
  const now = new Date();
  const dayOffsetFromMonday = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - dayOffsetFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return {
    start: start.getTime(),
    end: end.getTime()
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
    proposalAuthor: sanitizeText(entry.proposalAuthor, 100)
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
  const allTime = dedupeAndSort(scores, MAX_SCORES);
  const monthlyScores = dedupeAndSort(scores.filter(isCurrentWeekEntry), MAX_MONTHLY_SCORES);

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
  const scores = Array.isArray(data.scores) ? dedupeAndSort(data.scores, MAX_SCORES) : [];
  const monthlyScores = Array.isArray(data.monthlyScores)
    ? dedupeAndSort(data.monthlyScores, MAX_MONTHLY_SCORES)
    : dedupeAndSort(scores.filter(isCurrentWeekEntry), MAX_MONTHLY_SCORES);

  return { scores, monthlyScores };
};

const writeRemoteLeaderboardData = async (entry: LeaderboardEntry): Promise<LeaderboardData> => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ entry })
  });

  if (!response.ok) {
    throw new Error(`Leaderboard save failed with ${response.status}`);
  }

  const data = await response.json();
  const nextScores = Array.isArray(data.scores) ? dedupeAndSort(data.scores, MAX_SCORES) : [];
  const monthlyScores = Array.isArray(data.monthlyScores)
    ? dedupeAndSort(data.monthlyScores, MAX_MONTHLY_SCORES)
    : dedupeAndSort(nextScores.filter(isCurrentWeekEntry), MAX_MONTHLY_SCORES);

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
    proposalAuthor: sanitizeText(options.proposalAuthor, 100)
  };

  try {
    return await writeRemoteLeaderboardData(newEntry);
  } catch (error) {
    console.error("Save error:", error);
    return toLeaderboardData([newEntry], false);
  }
};
