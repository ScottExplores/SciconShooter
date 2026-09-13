export type Action = { movement: string; fire: boolean };
export type HistoryRow = { tick: number; seconds: number; score: number; reward: number; lives: number; movement: string; fire: boolean };
export type LabStatus = {
  status: string; running: boolean; runId: string | null; seq: number; tick: number; simTimeMs: number;
  score: number; lives: number; kills: number; reward: number; totalReward: number; action: Action;
  history: HistoryRow[]; config: any; error: string | null; dataset: any; gates: Record<string, any>;
  neural: any; frameAvailable: boolean; evidence?: string; runtimeIdentity?: any; timings?: any;
};
export type Run = { id: string; summary: any; config: any };
export type Draft = { controller: string; seed: number; timeLimitSeconds: number; constantFire: boolean; neuralConfig: string; renderProfile: string };
export const DEFAULT_DRAFT: Draft = { controller: 'random', seed: 42, timeLimitSeconds: 90, constantFire: false, neuralConfig: '', renderProfile: 'swiftshader' };
export const CONTROLLERS = [
  ['random', 'Random baseline'], ['idle', 'Idle baseline'], ['manual', 'Manual control'],
  ['neural-fixed', 'Neural · frozen'], ['neural-plastic', 'Neural · plastic'],
];
export const labelController = (key: string) => CONTROLLERS.find(([value]) => value === key)?.[1] || key || 'No controller';
export const formatNumber = (value: number | undefined, digits = 0) => value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
export async function api<T = any>(path: string, body?: any, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/lab-api${path}`, { method: body === undefined ? 'GET' : 'POST', signal: signal || (body === undefined ? AbortSignal.timeout(10000) : undefined),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json', 'X-Scicon-Lab': '1' },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  let value: any;
  try { value = await response.json(); } catch (error) { if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') throw new Error('The local coordinator response timed out. Retry the request.'); throw new Error(`Coordinator response was not valid JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`);
  return value;
}
export async function downloadArtifact(runId: string, kind: 'export' | 'report') {
  const response = await fetch(`/lab-api/runs/${encodeURIComponent(runId)}/${kind}`);
  if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Export unavailable'); }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = `${runId}.${kind === 'export' ? 'zip' : 'md'}`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
