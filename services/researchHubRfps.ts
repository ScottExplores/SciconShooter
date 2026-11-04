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
  raisedRsc: number | null;
  description?: string | null;
  imageUrl?: string | null;
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
    raisedRsc: typeof value.raisedRsc === 'number' ? value.raisedRsc : null,
    description: typeof value.description === 'string' ? value.description : null,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null
  };
};

const RFP_CACHE_MS = 5 * 60 * 1000;
let rfpCache: { at: number; promise: Promise<ResearchHubRfp[]> } | null = null;

const loadEligibleRfps = async (): Promise<ResearchHubRfp[]> => {
  const response = await fetch('/api/researchhub-rfps', { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `RFP feed failed with ${response.status}`);
  return Array.isArray(data.rfps) ? data.rfps.map(asRfp).filter((rfp): rfp is ResearchHubRfp => Boolean(rfp)) : [];
};

// One shared request so the post-run picker opens on a list that is already
// loading or loaded. A failure is not cached, so Retry fetches again.
export const fetchEligibleRfps = (): Promise<ResearchHubRfp[]> => {
  if (rfpCache && Date.now() - rfpCache.at < RFP_CACHE_MS) return rfpCache.promise;
  const promise = loadEligibleRfps();
  rfpCache = { at: Date.now(), promise };
  promise.catch(() => {
    if (rfpCache?.promise === promise) rfpCache = null;
  });
  return promise;
};

export const prefetchEligibleRfps = (): void => {
  fetchEligibleRfps().catch(() => undefined);
};
