import type {
  ConfigKind,
  DirectorBootstrap,
  ReviewRequest,
  SaveResult,
  VersionEnvelope
} from '../domain/types';

const API_ROOT = '/__director';

const readJson = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Director request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
};

const mutation = async <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Promise<T> => {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Scicon-Director': 'local'
    },
    body: JSON.stringify(body),
    credentials: 'same-origin'
  });
  return readJson<T>(response);
};

export const fetchBootstrap = async () => readJson<DirectorBootstrap>(
  await fetch(`${API_ROOT}/bootstrap`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
);

export const fetchRealRuns = async () => readJson<{ runs: DirectorBootstrap['runs'] }>(
  await fetch(`${API_ROOT}/real-runs`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
);

export const saveDraft = async <T,>(kind: ConfigKind, payload: T, baseVersionId: string) => (
  mutation<SaveResult<T>>(`/drafts/${kind}`, 'POST', { payload, baseVersionId })
);

export const clearDraft = async (kind: ConfigKind, baseVersionId: string) => (
  mutation<{ ok: boolean; message: string }>(`/drafts/${kind}`, 'DELETE', { baseVersionId })
);

export const publishConfig = async <T,>(kind: ConfigKind, payload: T, changeNote: string, baseVersionId: string) => (
  mutation<SaveResult<T>>(`/publish/${kind}`, 'POST', { payload, changeNote, baseVersionId })
);

export const rollbackConfig = async <T,>(kind: ConfigKind, versionId: string, baseVersionId: string) => (
  mutation<SaveResult<T>>(`/rollback/${kind}`, 'POST', { versionId, baseVersionId })
);

export const fetchVersions = async <T,>(kind: ConfigKind) => readJson<{ versions: VersionEnvelope<T>[] }>(
  await fetch(`${API_ROOT}/versions/${kind}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
);

export const createReview = async (request: Omit<ReviewRequest, 'id' | 'sequence' | 'createdAt'>) => (
  mutation<{ review: ReviewRequest }>('/reviews', 'POST', request)
);

export const updateReview = async (id: string, updates: Partial<Pick<ReviewRequest, 'note' | 'status' | 'target'>>) => (
  mutation<{ review: ReviewRequest }>(`/reviews/${encodeURIComponent(id)}`, 'PATCH', updates)
);
