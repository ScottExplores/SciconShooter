import type {
  GameplayTelemetryCompletionScope,
  GameplayTelemetrySnapshot
} from '@game/services/gameplay/telemetry';

const API_ROOT = '/__director/api/v1/playtest-sessions';

export interface PlaytestSessionTarget {
  levelId: string;
  waveId: string;
  eventId?: string;
}

export interface PlaytestSessionMetrics {
  elapsedSeconds: number;
  survivalSeconds: number;
  dps: number;
  damageDealt: number;
  bossDamage: number;
  damageTaken: number;
  playerDeaths: number;
  bossPhaseTransitions: number;
  wavesCompleted: number;
  completions: number;
  completed: boolean;
  completionScope: GameplayTelemetryCompletionScope | null;
  score: number;
}

export interface PlaytestSessionDraft {
  name: string;
  campaignHash: string;
  seed: string | number;
  target: PlaytestSessionTarget;
  viewport: Readonly<{ width: number; height: number }>;
  loadoutLabel: string;
  notes?: string;
  snapshot: GameplayTelemetrySnapshot;
}

export interface PlaytestSessionSummary extends Omit<PlaytestSessionDraft, 'snapshot'> {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  metrics: PlaytestSessionMetrics;
}

export interface PlaytestSession extends PlaytestSessionSummary {
  snapshot: GameplayTelemetrySnapshot;
}

const readJson = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const headline = typeof payload?.error === 'string'
      ? payload.error
      : `Director request failed with ${response.status}`;
    const details = Array.isArray(payload?.errors)
      ? payload.errors.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    throw new Error(details.length > 0 ? `${headline}; ${details.join('; ')}` : headline);
  }
  return payload as T;
};

const localMutation = async <T,>(
  path: string,
  method: 'POST' | 'DELETE',
  body: unknown
) => readJson<T>(await fetch(path, {
  method,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Scicon-Director': 'local'
  },
  body: JSON.stringify(body),
  credentials: 'same-origin'
}));

export const fetchPlaytestSessions = async () => readJson<{
  ok: true;
  localOnly: true;
  sessions: PlaytestSessionSummary[];
}>(await fetch(API_ROOT, {
  headers: { Accept: 'application/json' },
  credentials: 'same-origin'
}));

export const fetchPlaytestSession = async (sessionId: string) => readJson<{
  ok: true;
  localOnly: true;
  session: PlaytestSession;
}>(await fetch(`${API_ROOT}/${encodeURIComponent(sessionId)}`, {
  headers: { Accept: 'application/json' },
  credentials: 'same-origin'
}));

export const savePlaytestSession = async (session: PlaytestSessionDraft) => localMutation<{
  ok: true;
  localOnly: true;
  message: string;
  session: PlaytestSession;
}>(API_ROOT, 'POST', { session });

export const deletePlaytestSession = async (sessionId: string) => localMutation<{
  ok: true;
  localOnly: true;
  message: string;
  deleted: { id: string };
}>(`${API_ROOT}/${encodeURIComponent(sessionId)}`, 'DELETE', {});

const csvCell = (value: string | number | boolean | null) => {
  const rawText = value === null ? '' : String(value);
  const text = typeof value === 'string' && /^[=+\-@]/.test(rawText)
    ? `'${rawText}`
    : rawText;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const serializePlaytestSessionCsv = (session: PlaytestSession) => {
  const columns: Array<[string, string | number | boolean | null]> = [
    ['session_id', session.id],
    ['created_at', session.createdAt],
    ['name', session.name],
    ['campaign_hash', session.campaignHash],
    ['seed', session.seed],
    ['mission_id', session.target.levelId],
    ['wave_id', session.target.waveId],
    ['event_id', session.target.eventId ?? ''],
    ['viewport_width', session.viewport.width],
    ['viewport_height', session.viewport.height],
    ['loadout', session.loadoutLabel],
    ['elapsed_seconds', session.metrics.elapsedSeconds],
    ['survival_seconds', session.metrics.survivalSeconds],
    ['dps', session.metrics.dps],
    ['damage_dealt', session.metrics.damageDealt],
    ['boss_damage', session.metrics.bossDamage],
    ['damage_taken', session.metrics.damageTaken],
    ['player_deaths', session.metrics.playerDeaths],
    ['boss_phase_transitions', session.metrics.bossPhaseTransitions],
    ['waves_completed', session.metrics.wavesCompleted],
    ['completed', session.metrics.completed],
    ['completion_scope', session.metrics.completionScope],
    ['score', session.metrics.score],
    ['recorded_events', session.snapshot.aggregate.recordedEventCount],
    ['retained_events', session.snapshot.aggregate.retainedEventCount],
    ['dropped_events', session.snapshot.aggregate.droppedEventCount]
  ];
  return `${columns.map(([name]) => csvCell(name)).join(',')}\r\n${
    columns.map(([, value]) => csvCell(value)).join(',')
  }\r\n`;
};
