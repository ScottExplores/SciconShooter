import { HttpError } from './security.mjs';

export const PRODUCTION_READ_ORIGIN = 'https://www.sciconshooter.xyz';

const READ_ENDPOINTS = Object.freeze({
  leaderboard: '/api/leaderboard',
  metadata: '/api/record-metadata'
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[A-Za-z0-9-]{1,80}$/;
const MAX_RESPONSE_BYTES = 512 * 1024;

const boundedInteger = (value, minimum, maximum, fallback = minimum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(numeric)));
};

const safeText = (value, maximumLength, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text ? text.slice(0, maximumLength) : fallback;
};

const safeIsoDate = (value) => {
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};

const attributesByName = (metadata) => {
  const attributes = Array.isArray(metadata?.attributes) ? metadata.attributes : [];
  const result = new Map();
  for (const attribute of attributes) {
    if (!attribute || typeof attribute.trait_type !== 'string') continue;
    result.set(attribute.trait_type, attribute.value);
  }
  return result;
};

const normalizeRun = (entry, metadata) => {
  if (!entry || typeof entry !== 'object') return null;
  const pilotName = safeText(entry.name, 15).toUpperCase();
  if (!pilotName || !Number.isFinite(Number(entry.score))) return null;
  const attributes = attributesByName(metadata);
  const metadataPilot = safeText(metadata?.name, 120);
  const metadataPilotMatch = / - ([^-]+)$/.exec(metadataPilot)?.[1]?.trim().slice(0, 15).toUpperCase();
  const runId = typeof entry.runId === 'string' && RUN_ID_PATTERN.test(entry.runId) ? entry.runId : undefined;
  const integrityValue = safeText(attributes.get('Integrity'), 40).toLowerCase();
  const integrity = integrityValue === 'server-verified' || entry.verified === true
    ? 'server-verified'
    : integrityValue === 'local-unverified'
      ? 'local-unverified'
      : 'review';

  return {
    source: 'production-readonly',
    ...(runId ? { runId } : {}),
    pilotName: metadataPilotMatch || pilotName,
    score: boundedInteger(attributes.get('Score') ?? entry.score, 0, 2_147_483_647, 0),
    wave: boundedInteger(attributes.get('Wave') ?? entry.wave, 1, 999, 1),
    targetsDefeated: boundedInteger(attributes.get('Targets Defeated'), 0, 1_000_000, 0),
    coinsCollected: boundedInteger(
      attributes.get('Tokens Collected') ?? attributes.get('Coins Collected'),
      0,
      1_000_000,
      0
    ),
    durationLabel: safeText(attributes.get('Flight Time'), 20, '--:--'),
    ...(safeIsoDate(entry.date) ? { finishedAt: safeIsoDate(entry.date) } : {}),
    gameVersion: safeText(attributes.get('Game Version'), 80, 'production'),
    integrity
  };
};

const endpointUrl = (endpoint, parameters = {}) => {
  const pathname = READ_ENDPOINTS[endpoint];
  if (!pathname) throw new Error('Unsupported production read endpoint');
  const url = new URL(pathname, PRODUCTION_READ_ORIGIN);
  if (endpoint === 'metadata') {
    if (!UUID_PATTERN.test(parameters.runId || '')) throw new Error('Metadata reads require a UUID run ID');
    url.searchParams.set('runId', parameters.runId);
  }
  return url;
};

export class RealRunReader {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 5000, maxRuns = 12 } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.min(15_000, Math.max(500, timeoutMs));
    this.maxRuns = Math.min(25, Math.max(1, Math.floor(maxRuns)));
  }

  async _fetchJson(endpoint, parameters) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = endpointUrl(endpoint, parameters);
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`read returned HTTP ${response.status}`);
      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new Error('read response is too large');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_RESPONSE_BYTES) throw new Error('read response is too large');
      return JSON.parse(bytes.toString('utf8'));
    } finally {
      clearTimeout(timeout);
    }
  }

  async listRuns() {
    let leaderboard;
    try {
      leaderboard = await this._fetchJson('leaderboard');
    } catch (error) {
      throw new HttpError(502, 'Production runs are temporarily unavailable', [error.message]);
    }

    const scores = Array.isArray(leaderboard?.scores)
      ? leaderboard.scores.slice(0, this.maxRuns)
      : [];
    const metadata = await Promise.all(scores.map(async (entry) => {
      if (!UUID_PATTERN.test(entry?.runId || '')) return null;
      try {
        return await this._fetchJson('metadata', { runId: entry.runId });
      } catch {
        return null;
      }
    }));

    return scores
      .map((entry, index) => normalizeRun(entry, metadata[index]))
      .filter(Boolean);
  }
}

export const productionReadEndpoints = READ_ENDPOINTS;
