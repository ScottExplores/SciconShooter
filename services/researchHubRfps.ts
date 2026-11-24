import type { ResearchHubProposal } from './researchHubProposals';
export interface ResearchHubRfp {
  id: string;
  poolId: string;
  title: string;
  url: string;
  organization: string;
  status: string;
  endDate: string;
  goalUsd: number | null;
  goalRsc: number | null;
  raisedUsd: number | null;
  raisedRsc: number | null;
  description?: string | null;
  imageUrl?: string | null;
  featured?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object'
);

const asRfp = (value: unknown): ResearchHubRfp | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const title = typeof value.title === 'string' ? value.title : '';
  const url = typeof value.url === 'string' ? value.url : '';
  const endDate = typeof value.endDate === 'string' ? value.endDate : '';
  if (!/^\d{1,20}$/.test(id) || !title || !url.startsWith('https://www.researchhub.com/rfp/') || !endDate) {
    return null;
  }
  return {
    id,
    poolId: typeof value.poolId === 'string' ? value.poolId : '',
    title,
    url,
    organization: typeof value.organization === 'string' ? value.organization : 'ResearchHub',
    status: typeof value.status === 'string' ? value.status : 'OPEN',
    endDate,
    goalUsd: typeof value.goalUsd === 'number' ? value.goalUsd : null,
    goalRsc: typeof value.goalRsc === 'number' ? value.goalRsc : null,
    raisedUsd: typeof value.raisedUsd === 'number' ? value.raisedUsd : null,
    raisedRsc: typeof value.raisedRsc === 'number' ? value.raisedRsc : null,
    description: typeof value.description === 'string' ? value.description : null,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    featured: value.featured === true
  };
};

const RFP_CACHE_MS = 5 * 60 * 1000;
const RFP_FEED_PATH = '/api/researchhub-proposals?type=rfp';

interface ResearchHubRfpLists {
  open: ResearchHubRfp[];
  eligible: ResearchHubRfp[];
}

let rfpCache: { at: number; promise: Promise<ResearchHubRfpLists> } | null = null;

const mapRfps = (value: unknown): ResearchHubRfp[] => (
  Array.isArray(value) ? value.map(asRfp).filter((rfp): rfp is ResearchHubRfp => Boolean(rfp)) : []
);

const loadRfpLists = async (): Promise<ResearchHubRfpLists> => {
  const response = await fetch(RFP_FEED_PATH, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `RFP feed failed with ${response.status}`);
  const eligible = mapRfps(data.rfps);
  return {
    open: Array.isArray(data.openRfps) ? mapRfps(data.openRfps) : eligible,
    eligible
  };
};

// One shared request so the hangar and the post-run picker open on lists that
// are already loading or loaded. A failure is not cached, so Retry fetches again.
const loadCachedRfpLists = (): Promise<ResearchHubRfpLists> => {
  if (rfpCache && Date.now() - rfpCache.at < RFP_CACHE_MS) return rfpCache.promise;
  const promise = loadRfpLists();
  rfpCache = { at: Date.now(), promise };
  promise.catch(() => {
    if (rfpCache?.promise === promise) rfpCache = null;
  });
  return promise;
};

export const fetchOpenRfps = async (): Promise<ResearchHubRfp[]> => (await loadCachedRfpLists()).open;

export const fetchEligibleRfps = async (): Promise<ResearchHubRfp[]> => (await loadCachedRfpLists()).eligible;

export const prefetchEligibleRfps = (): void => {
  fetchEligibleRfps().catch(() => undefined);
};


export const rfpAsChoice = (rfp: ResearchHubRfp): ResearchHubProposal => ({
  id: rfp.id,
  title: rfp.title,
  author: rfp.organization,
  organization: rfp.organization,
  backers: 0,
  votes: 0,
  comments: 0,
  url: rfp.url,
  imageUrl: rfp.imageUrl || undefined,
  endDate: rfp.endDate,
  status: rfp.status,
  goalCurrency: rfp.goalUsd != null ? 'USD' : rfp.goalRsc != null ? 'RSC' : undefined,
  requestedUsd: rfp.goalUsd ?? undefined,
  raisedUsd: rfp.raisedUsd ?? undefined,
  requestedRsc: rfp.goalRsc ?? undefined,
  raisedRsc: rfp.raisedRsc ?? undefined,
  fundingTargetKind: 'rfp'
});
