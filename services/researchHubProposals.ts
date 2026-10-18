import { getWeeklyBoundaryMeta } from '../shared/weeklyCompetitionBoundary.browser';
import { isFundingDeadlineAfter } from '../shared/researchHubProposalEligibility.browser';
import { getProposalFundingMetrics } from './proposalFunding';
import { fetchProposalJson, readProposalSnapshot, writeProposalSnapshot } from './revamp/researchhub/feedSnapshot';

const RESEARCHHUB_FUND_URL = 'https://www.researchhub.com/fund';
const PROPOSAL_FEED_PATH = '/api/researchhub-proposals';

type RawRecord = Record<string, any>;

export interface ResearchHubProposal {
  id: string;
  title: string;
  author: string;
  authors?: string[];
  organization?: string;
  goalCurrency?: string;
  requestedUsd?: number;
  raisedUsd?: number;
  requestedRsc?: number;
  raisedRsc?: number;
  backers: number;
  votes: number;
  comments: number;
  peerReview?: number;
  imageUrl?: string;
  status?: string;
  endDate?: string;
  url: string;
}

export interface ResearchHubProposalFeedOptions {
  requiredOpenUntil?: Date | string | number;
  includeProposalIds?: readonly string[];
}

export interface ResearchHubProposalFeedResult {
  eligibleProposals: ResearchHubProposal[];
  source: 'live' | 'server-cache' | 'local-cache' | 'dev-fixture';
  fetchedAt: string;
  /**
   * Exact requested proposal snapshots, including proposals that are no
   * longer eligible. A requested ID missing from this array has unknown
   * status; callers must never infer that it completed from absence.
   */
  referencedProposals: ResearchHubProposal[];
}

const isRecord = (value: unknown): value is RawRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.replace(/[$,]/g, '').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getMoneyAmount = (value: unknown, currency: 'usd' | 'rsc'): number | undefined => {
  if (!isRecord(value)) return asNumber(value);
  return asNumber(value[currency]) ?? asNumber(value.amount);
};

export const isWeeklyProposalEligible = (
  proposal: ResearchHubProposal,
  requiredOpenUntil: Date | string | number
) => {
  const status = proposal.status?.trim().toUpperCase() || 'OPEN';
  // Match the authoritative server rule; unknown states are never eligible.
  if (status !== 'OPEN') return false;
  if (!isFundingDeadlineAfter(proposal.endDate, requiredOpenUntil)) return false;
  const funding = getProposalFundingMetrics(proposal);
  if (funding.progressPercent !== null && funding.progressPercent >= 100) return false;

  return true;
};

const fullName = (source: unknown): string | undefined => {
  if (!isRecord(source)) return undefined;

  if (isRecord(source.author_profile)) return fullName(source.author_profile);
  const firstName = asString(source.first_name);
  const lastName = asString(source.last_name);
  return [firstName, lastName].filter(Boolean).join(' ') || asString(source.name) || undefined;
};

const validImageUrl = (value: unknown): string | undefined => {
  const url = asString(value);
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  return url;
};

const firstAssessedReviewScore = (reviews: unknown): number | undefined => {
  if (!Array.isArray(reviews)) return undefined;

  const assessed = reviews.find((review) => isRecord(review) && review.is_assessed);
  if (isRecord(assessed)) {
    return asNumber(assessed.score);
  }

  const firstReview = reviews.find(isRecord);
  return isRecord(firstReview) ? asNumber(firstReview.score) : undefined;
};

const normalizeProposal = (entry: RawRecord): ResearchHubProposal | null => {
  const content = isRecord(entry.content_object) ? entry.content_object : entry;
  const fundraise = isRecord(content.fundraise) ? content.fundraise : isRecord(entry.fundraise) ? entry.fundraise : undefined;
  const authorProfile = isRecord(entry.author)
    ? entry.author
    : isRecord(fundraise?.created_by?.author_profile)
      ? fundraise?.created_by?.author_profile
      : isRecord(fundraise?.created_by)
        ? fundraise?.created_by
        : undefined;
  const firstGrant = Array.isArray(entry.associated_grants) && isRecord(entry.associated_grants[0])
    ? entry.associated_grants[0]
    : undefined;
  const title = asString(content.title);
  const id = String(content.id ?? entry.id ?? '');

  if (!title || !/^\d{1,20}$/.test(id)) return null;
  const authors = Array.isArray(content.authors)
    ? [...new Set(content.authors.map(fullName).filter((name): name is string => Boolean(name)))]
    : [];
  if (authors.length === 0 && fullName(authorProfile)) authors.push(fullName(authorProfile)!);

  const slug = asString(content.slug);
  const metrics = isRecord(entry.metrics) ? entry.metrics : undefined;
  const reviewMetrics = isRecord(metrics?.review_metrics) ? metrics?.review_metrics : undefined;
  const contributors = isRecord(fundraise?.contributors) ? fundraise?.contributors : undefined;
  const requestedUsd = getMoneyAmount(fundraise?.goal_amount, 'usd');
  const raisedUsd = getMoneyAmount(fundraise?.amount_raised, 'usd');
  const requestedRsc = getMoneyAmount(fundraise?.goal_amount, 'rsc');
  const raisedRsc = getMoneyAmount(fundraise?.amount_raised, 'rsc');
  const endDate = asString(fundraise?.end_date);

  return {
    id: String(id),
    title,
    author: authors.join(', ') || 'ResearchHub researcher',
    authors,
    organization: asString(entry.nonprofit?.name)
      ?? asString(firstGrant?.organization)
      ?? asString(authorProfile?.headline),
    goalCurrency: asString(fundraise?.goal_currency)?.toUpperCase(),
    requestedUsd,
    raisedUsd,
    requestedRsc,
    raisedRsc,
    backers: Math.max(0, Math.floor(asNumber(contributors?.total) ?? 0)),
    votes: Math.max(0, Math.floor(asNumber(metrics?.votes) ?? asNumber(entry.adjusted_score) ?? 0)),
    comments: Math.max(0, Math.floor(asNumber(metrics?.replies) ?? 0)),
    peerReview: asNumber(reviewMetrics?.avg) ?? firstAssessedReviewScore(content.reviews),
    imageUrl: validImageUrl(content.image_url) ?? validImageUrl(firstGrant?.image) ?? validImageUrl(authorProfile?.profile_image),
    status: asString(fundraise?.status),
    endDate,
    url: slug ? `https://www.researchhub.com/post/${id}/${slug}` : RESEARCHHUB_FUND_URL
  };
};

export const formatUsd = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000).toLocaleString()}K`;
  return `$${Math.round(value).toLocaleString()}`;
};

const normalizeIncludedProposalIds = (proposalIds: readonly string[] = []) => {
  const uniqueIds: string[] = [];
  const seen = new Set<string>();

  proposalIds.forEach((value) => {
    const proposalId = String(value).trim();
    if (!/^\d{1,20}$/.test(proposalId) || seen.has(proposalId) || uniqueIds.length >= 1) return;
    seen.add(proposalId);
    uniqueIds.push(proposalId);
  });

  return uniqueIds;
};

const normalizeProposalEntries = (entries: unknown): ResearchHubProposal[] => (
  Array.isArray(entries)
    ? entries
      .filter(isRecord)
      .map(normalizeProposal)
      .filter((proposal): proposal is ResearchHubProposal => Boolean(proposal))
    : []
);

export const getResearchHubProposalFeed = async ({
  requiredOpenUntil = getWeeklyBoundaryMeta().endsAt,
  includeProposalIds = []
}: ResearchHubProposalFeedOptions = {}): Promise<ResearchHubProposalFeedResult> => {
  const requestedProposalIds = normalizeIncludedProposalIds(includeProposalIds);
  const proposalFeedUrl = requestedProposalIds.length
    ? `${PROPOSAL_FEED_PATH}?includeProposalIds=${requestedProposalIds.join(',')}`
    : PROPOSAL_FEED_PATH;
  let payload: any;
  let source: ResearchHubProposalFeedResult['source'] = 'live';
  let fetchedAt = new Date().toISOString();
  try {
    payload = await fetchProposalJson(proposalFeedUrl);
    if (!Array.isArray(payload?.results) && !Array.isArray(payload?.proposals)) {
      throw new Error('Proposal feed returned an invalid snapshot.');
    }
    if (payload.cached === true) source = 'server-cache';
    if (typeof payload.fetchedAt === 'string' && Number.isFinite(Date.parse(payload.fetchedAt))) {
      fetchedAt = payload.fetchedAt;
    }
    writeProposalSnapshot(payload.results ?? payload.proposals, fetchedAt);
  } catch (error) {
    const snapshot = readProposalSnapshot();
    if (snapshot) {
      payload = snapshot;
      fetchedAt = snapshot.fetchedAt;
      source = 'local-cache';
    } else if (import.meta.env.DEV) {
      // Local fixtures are deliberately labeled and never treated as live evidence.
      payload = await fetchProposalJson('/dev-researchhub-proposals.json');
      source = 'dev-fixture';
    } else {
      throw error;
    }
  }
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.proposals) ? payload.proposals : [];
  const proposals = normalizeProposalEntries(results);
  const referencedResults = normalizeProposalEntries(payload?.referencedProposals);
  const referencedById = new Map<string, ResearchHubProposal>();

  // Snapshot data is display-only. Never infer archive/completion state from stale references.
  (source === 'live' ? [...proposals, ...referencedResults] : []).forEach((proposal) => {
    if (requestedProposalIds.includes(proposal.id)) {
      referencedById.set(proposal.id, proposal);
    }
  });

  return {
    source,
    fetchedAt,
    eligibleProposals: proposals.filter((proposal) => (
      isWeeklyProposalEligible(proposal, requiredOpenUntil)
    )),
    referencedProposals: requestedProposalIds
      .map((proposalId) => referencedById.get(proposalId))
      .filter((proposal): proposal is ResearchHubProposal => Boolean(proposal))
  };
};

/**
 * Backward-compatible eligible-list wrapper used by existing callers.
 */
export const getResearchHubFundingProposals = async (
  requiredOpenUntil: Date | string | number = getWeeklyBoundaryMeta().endsAt
): Promise<ResearchHubProposal[]> => {
  const { eligibleProposals } = await getResearchHubProposalFeed({ requiredOpenUntil });
  return eligibleProposals;
};
