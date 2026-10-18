export const PROPOSAL_SNAPSHOT_KEY = 'scicon.researchhub.snapshot.v1';
export const PROPOSAL_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PROPOSAL_REQUEST_TIMEOUT_MS = 12_000;
const MAX_SNAPSHOT_LENGTH = 2_000_000;

export interface ProposalSnapshot {
  version: 1;
  fetchedAt: string;
  results: unknown[];
}

type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): SnapshotStorage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export const readProposalSnapshot = (
  storage: SnapshotStorage | undefined = browserStorage(),
  now = Date.now()
): ProposalSnapshot | null => {
  try {
    const text = storage?.getItem(PROPOSAL_SNAPSHOT_KEY);
    if (!text || text.length > MAX_SNAPSHOT_LENGTH) return null;
    const snapshot = JSON.parse(text);
    const fetchedAt = Date.parse(snapshot?.fetchedAt);
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.results) || snapshot.results.length > 100
      || !Number.isFinite(fetchedAt) || fetchedAt > now + 60_000
      || now - fetchedAt > PROPOSAL_SNAPSHOT_MAX_AGE_MS) return null;
    return snapshot;
  } catch {
    // Private browsing, full storage, or corrupt data must not block the hangar.
    return null;
  }
};

export const writeProposalSnapshot = (
  results: unknown[],
  fetchedAt: string,
  storage: SnapshotStorage | undefined = browserStorage()
): void => {
  try {
    if (!Number.isFinite(Date.parse(fetchedAt))) return;
    const snapshot: ProposalSnapshot = { version: 1, fetchedAt, results: results.slice(0, 100) };
    const text = JSON.stringify(snapshot);
    if (text.length <= MAX_SNAPSHOT_LENGTH) storage?.setItem(PROPOSAL_SNAPSHOT_KEY, text);
  } catch {
    // A readable live response is still useful when persistence is unavailable.
  }
};

export const fetchProposalJson = async (
  url: string,
  timeoutMs = PROPOSAL_REQUEST_TIMEOUT_MS
): Promise<any> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error(`Proposal feed returned ${response.status}`);
        return response.json();
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Proposal feed timed out.'));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer!);
  }
};

export const fundingTimeRemaining = (endDate?: string, now = Date.now()): string => {
  const endsAt = Date.parse(endDate || '');
  if (!Number.isFinite(endsAt)) return 'Deadline not listed';
  const remaining = endsAt - now;
  if (remaining <= 0) return 'Funding ended';
  if (remaining < 24 * 60 * 60 * 1000) return 'Less than a day left';
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return `${days} days left`;
};
