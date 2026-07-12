import type {
  ConfigKind,
  DirectorBootstrap,
  ReviewRequest,
  SaveResult,
  VersionEnvelope
} from '../domain/types';

const API_ROOT = '/__director';

export interface GameCampaignDiskState<T = unknown> {
  ok: true;
  campaign: T;
  contentHash: string;
  activeVersionId: string | null;
  revision: number;
  updatedAt: string;
  sourcePath: 'game-config/campaign.json';
  diskMatchesManifest: boolean;
}

export interface GameCampaignVersionSummary {
  id: string;
  revision: number;
  parentId: string | null;
  rollbackOf: string | null;
  source: 'baseline' | 'apply' | 'rollback';
  createdAt: string;
  changeNote: string;
  contentHash: string;
}

export interface GameCampaignMutationResult<T = unknown> {
  ok: true;
  message: string;
  campaign: T;
  contentHash: string;
  activeVersionId: string;
  version: GameCampaignVersionSummary & { payload: T; schemaVersion: 1; kind: 'game-campaign' };
}

export type GeneratedAssetRole = 'enemy' | 'boss' | 'asteroid' | 'hud' | 'player' | 'background' | 'scorecard';

export interface GeneratedAssetEntry {
  id: string;
  label: string;
  roles: GeneratedAssetRole[];
  path: string;
  sha256: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface GeneratedAssetLibrary {
  ok: true;
  generator: {
    available: boolean;
    model: string;
    backgroundRemoval: 'local-chroma-key';
  };
  assets: GeneratedAssetEntry[];
}

const readJson = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const headline = typeof payload?.error === 'string' ? payload.error : `Director request failed with ${response.status}`;
    const details = Array.isArray(payload?.errors)
      ? payload.errors.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const message = details.length > 0 ? `${headline}; ${details.join('; ')}` : headline;
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

export type CreateReviewInput = Omit<ReviewRequest, 'id' | 'sequence' | 'createdAt'> & {
  /** Verified by the local server for dirty level-editor references, then discarded. */
  draftCampaign?: unknown;
};

export const createReview = async (request: CreateReviewInput) => (
  mutation<{ review: ReviewRequest }>('/reviews', 'POST', request)
);

export const fetchReviews = async () => readJson<{ reviews: ReviewRequest[] }>(
  await fetch(`${API_ROOT}/reviews`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
);

export const updateReview = async (id: string, updates: Partial<Pick<ReviewRequest, 'note' | 'status' | 'target'>>) => (
  mutation<{ review: ReviewRequest }>(`/reviews/${encodeURIComponent(id)}`, 'PATCH', updates)
);

export const fetchGameCampaign = async <T = unknown>() => readJson<GameCampaignDiskState<T>>(
  await fetch(`${API_ROOT}/api/game-campaign`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  })
);

// Revert is intentionally a disk reread. Unsaved browser state never reaches the file API.
export const revertGameCampaignEdits = fetchGameCampaign;

export const applyGameCampaign = async <T>(
  campaign: T,
  expectedContentHash: string,
  changeNote?: string
) => mutation<GameCampaignMutationResult<T>>('/api/game-campaign/apply', 'POST', {
  campaign,
  expectedContentHash,
  ...(changeNote ? { changeNote } : {})
});

export const fetchGameCampaignVersions = async () => readJson<{
  ok: true;
  activeVersionId: string | null;
  currentContentHash: string;
  versions: GameCampaignVersionSummary[];
}>(
  await fetch(`${API_ROOT}/api/game-campaign/versions`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  })
);

export const rollbackGameCampaign = async <T = unknown>(
  versionId: string,
  expectedContentHash: string,
  changeNote?: string
) => mutation<GameCampaignMutationResult<T>>('/api/game-campaign/rollback', 'POST', {
  versionId,
  expectedContentHash,
  ...(changeNote ? { changeNote } : {})
});

export const fetchGeneratedAssets = async () => readJson<GeneratedAssetLibrary>(
  await fetch(`${API_ROOT}/api/generated-assets`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  })
);

export const generateAsset = async (input: {
  prompt: string;
  label: string;
  role: GeneratedAssetRole;
}) => mutation<{
  ok: true;
  message: string;
  asset: GeneratedAssetEntry;
}>('/api/generated-assets', 'POST', input);
