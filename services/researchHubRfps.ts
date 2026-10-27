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

export const fetchEligibleRfps = async (): Promise<ResearchHubRfp[]> => {
  const response = await fetch('/api/researchhub-rfps', { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `RFP feed failed with ${response.status}`);
  return Array.isArray(data.rfps) ? data.rfps.map(asRfp).filter((rfp): rfp is ResearchHubRfp => Boolean(rfp)) : [];
};
