const RESEARCHHUB_FUND_URL = 'https://www.researchhub.com/fund';
const PROPOSAL_FEED_PATH = '/api/researchhub-proposals';

type RawRecord = Record<string, any>;

export interface ResearchHubProposal {
  id: string;
  title: string;
  author: string;
  organization?: string;
  requestedUsd?: number;
  raisedUsd?: number;
  backers: number;
  votes: number;
  comments: number;
  peerReview?: number;
  imageUrl?: string;
  status?: string;
  endDate?: string;
  url: string;
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

  const parsed = Number(value.replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getMoneyUsd = (value: unknown): number | undefined => {
  if (!isRecord(value)) return asNumber(value);
  return asNumber(value.usd) ?? asNumber(value.amount);
};

const isPastDate = (value?: string) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};

const isOpenUnfundedProposal = (proposal: ResearchHubProposal) => {
  const status = proposal.status?.trim().toLowerCase();
  const closedStatuses = new Set([
    'closed',
    'complete',
    'completed',
    'funded',
    'fulfilled',
    'ended',
    'expired',
    'cancelled',
    'canceled',
    'inactive'
  ]);

  if (status && closedStatuses.has(status)) return false;
  if (isPastDate(proposal.endDate)) return false;
  if (
    typeof proposal.requestedUsd === 'number'
    && proposal.requestedUsd > 0
    && typeof proposal.raisedUsd === 'number'
    && proposal.raisedUsd >= proposal.requestedUsd
  ) {
    return false;
  }

  return true;
};

const fullName = (source: unknown): string | undefined => {
  if (!isRecord(source)) return undefined;

  const firstName = asString(source.first_name);
  const lastName = asString(source.last_name);
  return [firstName, lastName].filter(Boolean).join(' ') || undefined;
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
  const id = asNumber(content.id) ?? asNumber(entry.id);

  if (!title || !id) return null;

  const slug = asString(content.slug);
  const metrics = isRecord(entry.metrics) ? entry.metrics : undefined;
  const reviewMetrics = isRecord(metrics?.review_metrics) ? metrics?.review_metrics : undefined;
  const contributors = isRecord(fundraise?.contributors) ? fundraise?.contributors : undefined;
  const requestedUsd = getMoneyUsd(fundraise?.goal_amount);
  const raisedUsd = getMoneyUsd(fundraise?.amount_raised);
  const endDate = asString(fundraise?.end_date);

  return {
    id: String(id),
    title,
    author: fullName(authorProfile) ?? 'ResearchHub researcher',
    organization: asString(entry.nonprofit?.name)
      ?? asString(firstGrant?.organization)
      ?? asString(authorProfile?.headline),
    requestedUsd,
    raisedUsd,
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

export const getResearchHubFundingProposals = async (): Promise<ResearchHubProposal[]> => {
  let response = await fetch(PROPOSAL_FEED_PATH, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok && import.meta.env.DEV) {
    response = await fetch('/dev-researchhub-proposals.json', {
      headers: { Accept: 'application/json' }
    });
  }

  if (!response.ok) {
    throw new Error(`Proposal feed returned ${response.status}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.proposals)
      ? payload.proposals
      : [];

  return results
    .filter(isRecord)
    .map(normalizeProposal)
    .filter((proposal): proposal is ResearchHubProposal => Boolean(proposal))
    .filter(isOpenUnfundedProposal);
};
