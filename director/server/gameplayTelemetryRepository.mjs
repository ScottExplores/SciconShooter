import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { HttpError, resolveWithin } from './security.mjs';
import { ValidationError } from './validation.mjs';

const PLAYTEST_SESSION_SCHEMA_VERSION = 1;
const SESSION_ID_PATTERN = /^playtest-[a-z0-9]+-[a-f0-9]{8}$/;
const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RESOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SESSION_BYTES = 512 * 1024;
const MAX_RETAINED_EVENTS = 1024;
const MAX_STORED_SESSIONS = 100;
const MAX_TEXT_LENGTH = 120;
const MAX_NOTES_LENGTH = 2_000;
const MAX_METRIC_VALUE = 1_000_000_000;

const EVENT_TYPES = new Set([
  'session-start',
  'session-end',
  'wave-start',
  'boss-phase',
  'entity-damage',
  'player-death',
  'completion'
]);
const END_REASONS = new Set(['disposed', 'restart', 'complete', 'defeat']);
const COMPLETION_SCOPES = new Set(['wave', 'mission', 'campaign', 'preview']);
const DAMAGE_SOURCES = new Set(['player', 'enemy', 'environment']);
const EVENT_BASE_FIELDS = ['type', 'frame', 'elapsedSeconds', 'levelId', 'waveId'];
const EVENT_FIELDS = {
  'session-start': [...EVENT_BASE_FIELDS, 'seed', 'viewportWidth', 'viewportHeight'],
  'session-end': [...EVENT_BASE_FIELDS, 'reason'],
  'wave-start': [...EVENT_BASE_FIELDS, 'levelNumber', 'waveNumber'],
  'boss-phase': [...EVENT_BASE_FIELDS, 'bossId', 'phaseId', 'phaseIndex', 'healthRatio'],
  'entity-damage': [
    ...EVENT_BASE_FIELDS,
    'targetId',
    'targetKind',
    'sourceKind',
    'amount',
    'remainingHealth',
    'fatal'
  ],
  'player-death': [...EVENT_BASE_FIELDS, 'livesRemaining'],
  completion: [...EVENT_BASE_FIELDS, 'scope', 'score']
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

const readJson = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Local playtest session is not valid JSON: ${path.basename(filePath)}`);
    }
    throw error;
  }
};

const writeJsonAtomic = async (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx'
  });
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await rm(filePath, { force: true });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
};

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Invalid playtest session', [`${label} must be an object`]);
  }
  return value;
};

const assertAllowedKeys = (value, allowed, label) => {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    throw new ValidationError('Invalid playtest session', [
      `${label} contains unsupported fields: ${unsupported.join(', ')}`
    ]);
  }
};

const finiteNumber = (value, label, { min = 0, max = MAX_METRIC_VALUE, integer = false } = {}) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError('Invalid playtest session', [
      `${label} must be a finite number from ${min} to ${max}`
    ]);
  }
  if (integer && !Number.isInteger(value)) {
    throw new ValidationError('Invalid playtest session', [`${label} must be an integer`]);
  }
  return value;
};

const boundedString = (value, label, maximum = MAX_TEXT_LENGTH, { optional = false } = {}) => {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError('Invalid playtest session', [`${label} must be a string`]);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ValidationError('Invalid playtest session', [
      `${label} must contain 1 to ${maximum} characters`
    ]);
  }
  return normalized;
};

const resourceId = (value, label) => {
  const normalized = boundedString(value, label, 120);
  if (!RESOURCE_ID_PATTERN.test(normalized)) {
    throw new ValidationError('Invalid playtest session', [`${label} must be a stable kebab-case ID`]);
  }
  return normalized;
};

const normalizeTarget = (candidate) => {
  const target = assertPlainObject(candidate, 'target');
  assertAllowedKeys(target, ['levelId', 'waveId', 'eventId'], 'target');
  return {
    levelId: resourceId(target.levelId, 'target.levelId'),
    waveId: resourceId(target.waveId, 'target.waveId'),
    ...(target.eventId === undefined
      ? {}
      : { eventId: resourceId(target.eventId, 'target.eventId') })
  };
};

const normalizeViewport = (candidate) => {
  const viewport = assertPlainObject(candidate, 'viewport');
  assertAllowedKeys(viewport, ['width', 'height'], 'viewport');
  return {
    width: finiteNumber(viewport.width, 'viewport.width', { min: 240, max: 4096, integer: true }),
    height: finiteNumber(viewport.height, 'viewport.height', { min: 240, max: 4096, integer: true })
  };
};

const normalizeAggregate = (candidate) => {
  const aggregate = assertPlainObject(candidate, 'snapshot.aggregate');
  const fields = [
    'recordedEventCount',
    'retainedEventCount',
    'droppedEventCount',
    'latestFrame',
    'damageDealt',
    'damageTaken',
    'entitiesDestroyed',
    'playerDeaths',
    'wavesStarted',
    'wavesCompleted',
    'bossPhaseTransitions',
    'completions'
  ];
  assertAllowedKeys(aggregate, fields, 'snapshot.aggregate');
  return Object.fromEntries(fields.map((field) => [
    field,
    finiteNumber(aggregate[field], `snapshot.aggregate.${field}`, {
      integer: !['damageDealt', 'damageTaken'].includes(field)
    })
  ]));
};

const normalizeEvent = (candidate, index) => {
  const event = assertPlainObject(candidate, `snapshot.events[${index}]`);
  if (!EVENT_TYPES.has(event.type)) {
    throw new ValidationError('Invalid playtest session', [
      `snapshot.events[${index}].type is not a registered telemetry event`
    ]);
  }
  assertAllowedKeys(event, EVENT_FIELDS[event.type], `snapshot.events[${index}]`);

  const normalized = {
    ...cloneJson(event),
    type: event.type,
    frame: finiteNumber(event.frame, `snapshot.events[${index}].frame`, { integer: true }),
    elapsedSeconds: finiteNumber(
      event.elapsedSeconds,
      `snapshot.events[${index}].elapsedSeconds`,
      { max: 86_400 }
    ),
    levelId: resourceId(event.levelId, `snapshot.events[${index}].levelId`),
    waveId: resourceId(event.waveId, `snapshot.events[${index}].waveId`)
  };

  switch (event.type) {
    case 'session-start':
      if (typeof event.seed === 'number') {
        finiteNumber(event.seed, `snapshot.events[${index}].seed`, {
          max: Number.MAX_SAFE_INTEGER,
          integer: true
        });
      } else {
        boundedString(event.seed, `snapshot.events[${index}].seed`, 128);
      }
      normalizeViewport({
        width: event.viewportWidth,
        height: event.viewportHeight
      });
      break;
    case 'session-end':
      if (!END_REASONS.has(event.reason)) {
        throw new ValidationError('Invalid playtest session', [`snapshot.events[${index}].reason is invalid`]);
      }
      break;
    case 'wave-start':
      finiteNumber(event.levelNumber, `snapshot.events[${index}].levelNumber`, { min: 1, max: 10_000, integer: true });
      finiteNumber(event.waveNumber, `snapshot.events[${index}].waveNumber`, { min: 1, max: 10_000, integer: true });
      break;
    case 'boss-phase':
      boundedString(event.bossId, `snapshot.events[${index}].bossId`);
      resourceId(event.phaseId, `snapshot.events[${index}].phaseId`);
      finiteNumber(event.phaseIndex, `snapshot.events[${index}].phaseIndex`, { max: 256, integer: true });
      finiteNumber(event.healthRatio, `snapshot.events[${index}].healthRatio`, { max: 1 });
      break;
    case 'entity-damage':
      boundedString(event.targetId, `snapshot.events[${index}].targetId`);
      boundedString(event.targetKind, `snapshot.events[${index}].targetKind`);
      if (!DAMAGE_SOURCES.has(event.sourceKind)) {
        throw new ValidationError('Invalid playtest session', [`snapshot.events[${index}].sourceKind is invalid`]);
      }
      finiteNumber(event.amount, `snapshot.events[${index}].amount`);
      finiteNumber(event.remainingHealth, `snapshot.events[${index}].remainingHealth`);
      if (typeof event.fatal !== 'boolean') {
        throw new ValidationError('Invalid playtest session', [`snapshot.events[${index}].fatal must be boolean`]);
      }
      break;
    case 'player-death':
      finiteNumber(event.livesRemaining, `snapshot.events[${index}].livesRemaining`, { max: 100, integer: true });
      break;
    case 'completion':
      if (!COMPLETION_SCOPES.has(event.scope)) {
        throw new ValidationError('Invalid playtest session', [`snapshot.events[${index}].scope is invalid`]);
      }
      finiteNumber(event.score, `snapshot.events[${index}].score`);
      break;
  }
  return normalized;
};

const normalizeSnapshot = (candidate) => {
  const snapshot = assertPlainObject(candidate, 'snapshot');
  assertAllowedKeys(snapshot, ['events', 'aggregate'], 'snapshot');
  if (!Array.isArray(snapshot.events) || snapshot.events.length > MAX_RETAINED_EVENTS) {
    throw new ValidationError('Invalid playtest session', [
      `snapshot.events must contain at most ${MAX_RETAINED_EVENTS} events`
    ]);
  }
  const events = snapshot.events.map(normalizeEvent);
  const aggregate = normalizeAggregate(snapshot.aggregate);
  if (aggregate.retainedEventCount !== events.length) {
    throw new ValidationError('Invalid playtest session', [
      'snapshot.aggregate.retainedEventCount must match snapshot.events.length'
    ]);
  }
  if (aggregate.recordedEventCount !== aggregate.retainedEventCount + aggregate.droppedEventCount) {
    throw new ValidationError('Invalid playtest session', [
      'snapshot aggregate event counters are inconsistent'
    ]);
  }
  for (let index = 1; index < events.length; index += 1) {
    if (
      events[index].frame < events[index - 1].frame
      || events[index].elapsedSeconds < events[index - 1].elapsedSeconds
    ) {
      throw new ValidationError('Invalid playtest session', [
        'snapshot.events must be ordered by simulation frame and elapsed time'
      ]);
    }
  }

  const retained = events.reduce((summary, event) => {
    summary.latestFrame = Math.max(summary.latestFrame, event.frame);
    if (event.type === 'wave-start') summary.wavesStarted += 1;
    if (event.type === 'boss-phase') summary.bossPhaseTransitions += 1;
    if (event.type === 'player-death') summary.playerDeaths += 1;
    if (event.type === 'completion') {
      summary.completions += 1;
      if (event.scope === 'wave') summary.wavesCompleted += 1;
    }
    if (event.type === 'entity-damage') {
      if (event.sourceKind === 'player') summary.damageDealt += event.amount;
      if (event.targetKind === 'player') summary.damageTaken += event.amount;
      if (event.fatal && event.targetKind !== 'player') summary.entitiesDestroyed += 1;
    }
    return summary;
  }, {
    latestFrame: 0,
    damageDealt: 0,
    damageTaken: 0,
    entitiesDestroyed: 0,
    playerDeaths: 0,
    wavesStarted: 0,
    wavesCompleted: 0,
    bossPhaseTransitions: 0,
    completions: 0
  });
  const aggregateFields = Object.keys(retained);
  const invalidAggregate = aggregateFields.some((field) => (
    aggregate.droppedEventCount === 0
      ? Math.abs(aggregate[field] - retained[field]) > 1e-6
      : aggregate[field] + 1e-6 < retained[field]
  ));
  if (invalidAggregate) {
    throw new ValidationError('Invalid playtest session', [
      'snapshot aggregate metrics do not match the retained event evidence'
    ]);
  }
  return { events, aggregate };
};

const normalizeSeed = (value) => {
  if (typeof value === 'number') return finiteNumber(value, 'seed', { max: Number.MAX_SAFE_INTEGER, integer: true });
  return boundedString(value, 'seed', 128);
};

const deriveMetrics = (snapshot) => {
  const elapsedSeconds = snapshot.events.reduce(
    (maximum, event) => Math.max(maximum, event.elapsedSeconds),
    snapshot.aggregate.latestFrame / 60
  );
  const bossDamage = snapshot.events.reduce((sum, event) => (
    event.type === 'entity-damage'
      && event.sourceKind === 'player'
      && /boss/i.test(event.targetKind)
      ? sum + event.amount
      : sum
  ), 0);
  const completionEvents = snapshot.events.filter((event) => event.type === 'completion');
  const lastCompletion = completionEvents.at(-1);
  const firstDeath = snapshot.events.find((event) => event.type === 'player-death');

  return {
    elapsedSeconds,
    survivalSeconds: firstDeath?.elapsedSeconds ?? elapsedSeconds,
    dps: elapsedSeconds > 0 ? snapshot.aggregate.damageDealt / elapsedSeconds : 0,
    damageDealt: snapshot.aggregate.damageDealt,
    bossDamage,
    damageTaken: snapshot.aggregate.damageTaken,
    playerDeaths: snapshot.aggregate.playerDeaths,
    bossPhaseTransitions: snapshot.aggregate.bossPhaseTransitions,
    wavesCompleted: snapshot.aggregate.wavesCompleted,
    completions: snapshot.aggregate.completions,
    completed: snapshot.aggregate.completions > 0,
    completionScope: lastCompletion?.scope ?? null,
    score: lastCompletion?.score ?? 0
  };
};

export const normalizePlaytestSessionRequest = (candidate) => {
  const session = assertPlainObject(candidate, 'session');
  assertAllowedKeys(session, [
    'name',
    'campaignHash',
    'seed',
    'target',
    'viewport',
    'loadoutLabel',
    'notes',
    'snapshot'
  ], 'session');
  if (!CONTENT_HASH_PATTERN.test(session.campaignHash)) {
    throw new ValidationError('Invalid playtest session', [
      'campaignHash must be a sha256 content hash'
    ]);
  }
  const snapshot = normalizeSnapshot(session.snapshot);
  const normalized = {
    name: boundedString(session.name, 'name', 80),
    campaignHash: session.campaignHash,
    seed: normalizeSeed(session.seed),
    target: normalizeTarget(session.target),
    viewport: normalizeViewport(session.viewport),
    loadoutLabel: boundedString(session.loadoutLabel, 'loadoutLabel', MAX_TEXT_LENGTH),
    ...(session.notes === undefined
      ? {}
      : { notes: boundedString(session.notes, 'notes', MAX_NOTES_LENGTH, { optional: true }) }),
    snapshot
  };
  if (serializedBytes(normalized) > MAX_SESSION_BYTES) {
    throw new HttpError(413, `Playtest session exceeds the ${MAX_SESSION_BYTES}-byte limit`);
  }
  return normalized;
};

const sessionSummary = (session) => ({
  schemaVersion: session.schemaVersion,
  id: session.id,
  createdAt: session.createdAt,
  name: session.name,
  campaignHash: session.campaignHash,
  seed: session.seed,
  target: cloneJson(session.target),
  viewport: cloneJson(session.viewport),
  loadoutLabel: session.loadoutLabel,
  ...(session.notes ? { notes: session.notes } : {}),
  metrics: cloneJson(session.metrics)
});

export class GameplayTelemetryRepository {
  constructor({
    repositoryRoot,
    dataRoot = path.join(repositoryRoot, 'director-data'),
    clock = () => new Date()
  } = {}) {
    if (!repositoryRoot) throw new Error('Gameplay telemetry requires repositoryRoot');
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.dataRoot = resolveWithin(this.repositoryRoot, path.resolve(dataRoot));
    this.clock = clock;
    this.initializing = null;
    this.writeQueue = Promise.resolve();
    this.sessionRoot = resolveWithin(this.dataRoot, 'playtest-sessions');
  }

  async initialize() {
    if (!this.initializing) {
      this.initializing = mkdir(this.sessionRoot, { recursive: true }).catch((error) => {
        this.initializing = null;
        throw error;
      });
    }
    return this.initializing;
  }

  _sessionPath(sessionId) {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new HttpError(400, 'Invalid playtest session ID');
    }
    return resolveWithin(this.sessionRoot, `${sessionId}.json`);
  }

  _enqueue(operation) {
    const pending = this.writeQueue.then(operation, operation);
    this.writeQueue = pending.catch(() => undefined);
    return pending;
  }

  async _sessionIds() {
    await this.initialize();
    const entries = await readdir(this.sessionRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^playtest-[a-z0-9]+-[a-f0-9]{8}\.json$/.test(entry.name))
      .map((entry) => entry.name.slice(0, -5));
  }

  async listSessions() {
    const sessions = await Promise.all((await this._sessionIds()).map(async (id) => (
      sessionSummary(await readJson(this._sessionPath(id)))
    )));
    return sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async readSession(sessionId) {
    await this.initialize();
    try {
      return await readJson(this._sessionPath(sessionId));
    } catch (error) {
      if (error?.code === 'ENOENT') throw new HttpError(404, 'Playtest session not found');
      throw error;
    }
  }

  async createSession(candidate) {
    const normalized = normalizePlaytestSessionRequest(candidate);
    return this._enqueue(async () => {
      await this.initialize();
      const existingIds = await this._sessionIds();
      if (existingIds.length >= MAX_STORED_SESSIONS) {
        throw new HttpError(
          409,
          `Local playtest storage is full (${MAX_STORED_SESSIONS} sessions); delete an older session first`
        );
      }
      const id = `playtest-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
      const session = {
        schemaVersion: PLAYTEST_SESSION_SCHEMA_VERSION,
        id,
        createdAt: this.clock().toISOString(),
        ...normalized,
        metrics: deriveMetrics(normalized.snapshot)
      };
      await writeJsonAtomic(this._sessionPath(id), session);
      return cloneJson(session);
    });
  }

  async deleteSession(sessionId) {
    return this._enqueue(async () => {
      await this.initialize();
      const filePath = this._sessionPath(sessionId);
      try {
        await rm(filePath);
      } catch (error) {
        if (error?.code === 'ENOENT') throw new HttpError(404, 'Playtest session not found');
        throw error;
      }
      return { id: sessionId };
    });
  }
}
