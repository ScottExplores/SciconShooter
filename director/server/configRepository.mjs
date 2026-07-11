import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, resolveWithin } from './security.mjs';
import {
  assertConfigKind,
  assertValidConfig,
  assertValidReview,
  ValidationError
} from './validation.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(moduleDirectory, '..', '..');
const VERSION_ID_PATTERN = /^(scorecard|wave-campaign)-([0-9]{6,})-([0-9a-f]{12})$/;
const REVIEW_ID_PATTERN = /^review-[0-9]{4,}-[0-9a-f]{6}$/;
const CONFIG_KINDS = ['scorecard', 'wave-campaign'];

const fixtureNames = {
  scorecard: 'default-scorecard.json',
  'wave-campaign': 'default-wave-campaign.json'
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

export const canonicalJson = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
};

export const contentHash = (value) => (
  `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
);

const readJson = async (filePath, { missing = undefined } = {}) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && missing !== undefined) return missing;
    if (error instanceof SyntaxError) {
      throw new Error(`Director data file is not valid JSON: ${path.basename(filePath)}`);
    }
    throw error;
  }
};

const writeJsonExclusive = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

const writeJsonAtomic = async (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
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

const normalizeChangeNote = (value, fallback) => {
  const note = typeof value === 'string' ? value.trim() : '';
  if (!note) return fallback;
  if (note.length > 240) throw new ValidationError('Invalid change note', ['changeNote must be 240 characters or fewer']);
  return note;
};

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`Invalid ${label}`, [`${label} must be an object`]);
  }
  return value;
};

const assertAllowedKeys = (value, keys, label) => {
  const unsupported = Object.keys(value).filter((key) => !keys.includes(key));
  if (unsupported.length) {
    throw new ValidationError(`Invalid ${label}`, [`unsupported fields: ${unsupported.join(', ')}`]);
  }
};

export class ConfigRepository {
  constructor({
    repositoryRoot = defaultRepositoryRoot,
    dataRoot = path.join(repositoryRoot, 'director-data'),
    fixtureRoot = path.join(repositoryRoot, 'director-data', 'fixtures'),
    clock = () => new Date()
  } = {}) {
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.dataRoot = path.resolve(dataRoot);
    this.fixtureRoot = path.resolve(fixtureRoot);
    this.clock = clock;
    this.initializing = null;
    this.writeQueues = new Map();

    this.manifestRoot = resolveWithin(this.dataRoot, 'manifests');
    this.versionRoot = resolveWithin(this.dataRoot, 'versions');
    this.reviewRoot = resolveWithin(this.dataRoot, 'reviews');
    this.workspaceRoot = resolveWithin(this.dataRoot, 'workspace');
    this.reviewFile = resolveWithin(this.reviewRoot, 'index.json');
  }

  async initialize() {
    if (!this.initializing) {
      this.initializing = this._initialize().catch((error) => {
        this.initializing = null;
        throw error;
      });
    }
    return this.initializing;
  }

  async _initialize() {
    await Promise.all([
      mkdir(this.manifestRoot, { recursive: true }),
      mkdir(this.reviewRoot, { recursive: true }),
      mkdir(this.workspaceRoot, { recursive: true }),
      ...CONFIG_KINDS.map((kind) => mkdir(this._versionDirectory(kind), { recursive: true }))
    ]);

    await this._writeIfMissing(resolveWithin(this.workspaceRoot, '.gitignore'), '*\n!.gitignore\n');

    for (const kind of CONFIG_KINDS) await this._ensureInitialVersion(kind);
    await this._writeJsonIfMissing(this.reviewFile, await this._initialReviews());
  }

  async _writeIfMissing(filePath, contents) {
    try {
      await writeFile(filePath, contents, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }

  async _writeJsonIfMissing(filePath, value) {
    try {
      await writeJsonExclusive(filePath, value);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }

  _manifestPath(kind) {
    assertConfigKind(kind);
    return resolveWithin(this.manifestRoot, `${kind}.json`);
  }

  _versionDirectory(kind) {
    assertConfigKind(kind);
    return resolveWithin(this.versionRoot, kind);
  }

  _versionPath(kind, versionId) {
    assertConfigKind(kind);
    const match = typeof versionId === 'string' ? VERSION_ID_PATTERN.exec(versionId) : null;
    if (!match || match[1] !== kind) throw new HttpError(400, 'Invalid configuration version ID');
    return resolveWithin(this._versionDirectory(kind), `${versionId}.json`);
  }

  _draftPath(kind) {
    assertConfigKind(kind);
    return resolveWithin(this.workspaceRoot, `${kind}.draft.json`);
  }

  async _loadFixture(kind) {
    assertConfigKind(kind);
    const payload = await readJson(path.join(this.fixtureRoot, fixtureNames[kind]));
    assertValidConfig(kind, payload);
    return payload;
  }

  _createEnvelope(kind, payload, { revision, parentId, rollbackOf, changeNote, createdAt }) {
    const hash = contentHash(payload);
    const id = `${kind}-${String(revision).padStart(6, '0')}-${hash.slice('sha256:'.length, 'sha256:'.length + 12)}`;
    return {
      schemaVersion: 1,
      kind,
      id,
      revision,
      parentId,
      rollbackOf,
      createdAt,
      changeNote,
      contentHash: hash,
      payload: cloneJson(payload)
    };
  }

  async _ensureInitialVersion(kind) {
    const manifestPath = this._manifestPath(kind);
    const existingManifest = await readJson(manifestPath, { missing: null });
    if (existingManifest) {
      await this._assertManifest(kind, existingManifest);
      return;
    }

    const payload = await this._loadFixture(kind);
    let envelope = this._createEnvelope(kind, payload, {
      revision: 1,
      parentId: null,
      rollbackOf: null,
      changeNote: 'Initial Director configuration',
      createdAt: this.clock().toISOString()
    });
    const versionPath = this._versionPath(kind, envelope.id);
    try {
      await writeJsonExclusive(versionPath, envelope);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      envelope = await this._readVersionFile(kind, envelope.id);
    }

    await writeJsonAtomic(manifestPath, {
      schemaVersion: 1,
      kind,
      activeVersionId: envelope.id,
      revision: envelope.revision,
      updatedAt: envelope.createdAt
    });
  }

  async _initialReviews() {
    const activeWave = (await this._readManifest('wave-campaign')).activeVersionId;
    const requests = [
      {
        id: 'review-0001-a11ce1',
        sequence: 1,
        surface: 'wave',
        configVersion: activeWave,
        target: 'Mini-boss',
        note: 'Make this checkpoint visually distinct from normal phases and keep its warning readable.',
        status: 'open',
        anchor: { x: 0.34, y: 0.3 },
        createdAt: this.clock().toISOString()
      },
      {
        id: 'review-0002-a57e01',
        sequence: 2,
        surface: 'wave',
        configVersion: activeWave,
        target: 'Asteroid belt',
        note: 'Increase hazard contrast so the asteroid-belt transition reads at a glance.',
        status: 'open',
        anchor: { x: 0.57, y: 0.52 },
        createdAt: this.clock().toISOString()
      },
      {
        id: 'review-0003-6a7e01',
        sequence: 3,
        surface: 'wave',
        configVersion: activeWave,
        target: 'Gatekeeper',
        note: 'Strengthen the boss entrance and keep the Gatekeeper label visible in the preview.',
        status: 'open',
        anchor: { x: 0.79, y: 0.31 },
        createdAt: this.clock().toISOString()
      }
    ];
    requests.forEach(assertValidReview);
    return requests;
  }

  async _assertManifest(kind, manifest) {
    const valid = manifest
      && manifest.schemaVersion === 1
      && manifest.kind === kind
      && typeof manifest.activeVersionId === 'string'
      && Number.isInteger(manifest.revision)
      && manifest.revision >= 1;
    if (!valid) throw new Error(`Director ${kind} manifest is invalid`);
    const active = await this._readVersionFile(kind, manifest.activeVersionId);
    if (active.revision !== manifest.revision) throw new Error(`Director ${kind} manifest revision does not match its active version`);
    return manifest;
  }

  async _readManifest(kind) {
    const manifest = await readJson(this._manifestPath(kind));
    await this._assertManifest(kind, manifest);
    return manifest;
  }

  async _readVersionFile(kind, versionId) {
    const envelope = await readJson(this._versionPath(kind, versionId), { missing: null });
    if (!envelope) throw new HttpError(404, `Configuration version not found: ${versionId}`);
    const match = VERSION_ID_PATTERN.exec(versionId);
    const isEarlierVersionReference = (reference) => {
      if (reference === null) return true;
      if (typeof reference !== 'string') return false;
      const referenceMatch = VERSION_ID_PATTERN.exec(reference);
      return Boolean(referenceMatch)
        && referenceMatch[1] === kind
        && Number(referenceMatch[2]) < envelope.revision;
    };
    const structurallyValid = envelope.schemaVersion === 1
      && envelope.kind === kind
      && envelope.id === versionId
      && Number.isInteger(envelope.revision)
      && envelope.revision >= 1
      && match
      && Number(match[2]) === envelope.revision
      && isEarlierVersionReference(envelope.parentId)
      && isEarlierVersionReference(envelope.rollbackOf)
      && typeof envelope.createdAt === 'string'
      && typeof envelope.changeNote === 'string'
      && typeof envelope.contentHash === 'string';
    if (!structurallyValid) throw new Error(`Director configuration version is invalid: ${versionId}`);
    assertValidConfig(kind, envelope.payload);
    const expectedHash = contentHash(envelope.payload);
    if (envelope.contentHash !== expectedHash || match[3] !== expectedHash.slice(7, 19)) {
      throw new Error(`Director configuration version failed its content hash check: ${versionId}`);
    }
    return envelope;
  }

  async getVersion(kind, versionId) {
    await this.initialize();
    return cloneJson(await this._readVersionFile(assertConfigKind(kind), versionId));
  }

  async getActive(kind) {
    await this.initialize();
    assertConfigKind(kind);
    const manifest = await this._readManifest(kind);
    return cloneJson(await this._readVersionFile(kind, manifest.activeVersionId));
  }

  async listVersions(kind) {
    await this.initialize();
    assertConfigKind(kind);
    const directory = this._versionDirectory(kind);
    const filenames = await readdir(directory);
    const ids = filenames
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5))
      .filter((id) => VERSION_ID_PATTERN.test(id));
    const envelopes = await Promise.all(ids.map((id) => this._readVersionFile(kind, id)));
    const idSet = new Set(envelopes.map((envelope) => envelope.id));
    for (const envelope of envelopes) {
      for (const reference of [envelope.parentId, envelope.rollbackOf]) {
        if (reference && !idSet.has(reference)) {
          throw new Error(`Director configuration version references missing history: ${reference}`);
        }
      }
    }
    envelopes.sort((left, right) => right.revision - left.revision);
    return cloneJson(envelopes);
  }

  async getDraft(kind) {
    await this.initialize();
    assertConfigKind(kind);
    const draft = await readJson(this._draftPath(kind), { missing: null });
    if (!draft) return null;
    if (draft.schemaVersion !== 1 || draft.kind !== kind || typeof draft.savedAt !== 'string') {
      throw new Error(`Director ${kind} draft is invalid`);
    }
    assertValidConfig(kind, draft.payload);
    return cloneJson(draft);
  }

  async saveDraft(kind, payload, { baseVersionId = undefined } = {}) {
    await this.initialize();
    assertConfigKind(kind);
    assertValidConfig(kind, payload);
    return this._withWriteLock(kind, async () => {
      const manifest = await this._readManifest(kind);
      if (baseVersionId !== undefined && baseVersionId !== manifest.activeVersionId) {
        throw new HttpError(409, 'The active configuration changed; reset or reload before saving this draft');
      }
      const draft = {
        schemaVersion: 1,
        kind,
        savedAt: this.clock().toISOString(),
        baseVersionId: manifest.activeVersionId,
        payload: cloneJson(payload)
      };
      await writeJsonAtomic(this._draftPath(kind), draft);
      return cloneJson(draft);
    });
  }

  async clearDraft(kind, { baseVersionId = undefined } = {}) {
    await this.initialize();
    assertConfigKind(kind);
    return this._withWriteLock(kind, async () => {
      const manifest = await this._readManifest(kind);
      if (baseVersionId !== undefined && baseVersionId !== manifest.activeVersionId) {
        throw new HttpError(409, 'The active configuration changed; reload before resetting this draft');
      }
      await rm(this._draftPath(kind), { force: true });
      return { kind, baseVersionId: manifest.activeVersionId };
    });
  }

  async publish(kind, payload, options = {}) {
    await this.initialize();
    assertConfigKind(kind);
    assertValidConfig(kind, payload);
    return this._withWriteLock(kind, () => this._publishUnlocked(kind, payload, options));
  }

  async _publishUnlocked(kind, payload, {
    baseVersionId = undefined,
    changeNote = undefined,
    rollbackOf = null
  } = {}) {
    const manifest = await this._readManifest(kind);
    if (baseVersionId !== undefined && baseVersionId !== manifest.activeVersionId) {
      throw new HttpError(409, 'The active configuration changed; reset or reload before publishing');
    }

    const existingVersions = await this.listVersions(kind);
    const revision = Math.max(manifest.revision, ...existingVersions.map((version) => version.revision)) + 1;
    const createdAt = this.clock().toISOString();
    const envelope = this._createEnvelope(kind, payload, {
      revision,
      parentId: manifest.activeVersionId,
      rollbackOf,
      changeNote: normalizeChangeNote(changeNote, rollbackOf ? `Rollback to ${rollbackOf}` : 'Published from Scicon Director'),
      createdAt
    });

    await writeJsonExclusive(this._versionPath(kind, envelope.id), envelope);
    await writeJsonAtomic(this._manifestPath(kind), {
      schemaVersion: 1,
      kind,
      activeVersionId: envelope.id,
      revision: envelope.revision,
      updatedAt: createdAt
    });
    await rm(this._draftPath(kind), { force: true });
    return cloneJson(envelope);
  }

  async rollback(kind, versionId, { changeNote = undefined, baseVersionId = undefined } = {}) {
    await this.initialize();
    assertConfigKind(kind);
    return this._withWriteLock(kind, async () => {
      const target = await this._readVersionFile(kind, versionId);
      return this._publishUnlocked(kind, target.payload, {
        baseVersionId,
        changeNote,
        rollbackOf: target.id
      });
    });
  }

  async listReviews() {
    await this.initialize();
    const reviews = await readJson(this.reviewFile);
    if (!Array.isArray(reviews)) throw new Error('Director review index is invalid');
    reviews.forEach(assertValidReview);
    reviews.sort((left, right) => left.sequence - right.sequence);
    return cloneJson(reviews);
  }

  async _resolveReviewVersion(surface, requestedVersion) {
    const kind = surface === 'scorecard' ? 'scorecard' : 'wave-campaign';
    if (requestedVersion === undefined) return (await this.getActive(kind)).id;
    await this._readVersionFile(kind, requestedVersion);
    return requestedVersion;
  }

  async createReview(input) {
    await this.initialize();
    assertPlainObject(input, 'review request');
    assertAllowedKeys(input, ['surface', 'configVersion', 'target', 'note', 'anchor', 'status'], 'review request');
    if (!['scorecard', 'wave'].includes(input.surface)) {
      throw new ValidationError('Invalid review request', ['surface must be scorecard or wave']);
    }
    if (input.status !== undefined && input.status !== 'open') {
      throw new ValidationError('Invalid review request', ['new review requests must have open status']);
    }
    const configVersion = await this._resolveReviewVersion(input.surface, input.configVersion);

    return this._withWriteLock('reviews', async () => {
      const reviews = await this.listReviews();
      const sequence = reviews.reduce((maximum, review) => Math.max(maximum, review.sequence), 0) + 1;
      const review = {
        id: `review-${String(sequence).padStart(4, '0')}-${randomBytes(3).toString('hex')}`,
        sequence,
        surface: input.surface,
        configVersion,
        target: input.target,
        note: input.note,
        status: 'open',
        anchor: cloneJson(input.anchor),
        createdAt: this.clock().toISOString()
      };
      assertValidReview(review);
      reviews.push(review);
      await writeJsonAtomic(this.reviewFile, reviews);
      return cloneJson(review);
    });
  }

  async updateReview(reviewId, patch) {
    await this.initialize();
    if (typeof reviewId !== 'string' || !REVIEW_ID_PATTERN.test(reviewId)) {
      throw new HttpError(400, 'Invalid review request ID');
    }
    assertPlainObject(patch, 'review update');
    assertAllowedKeys(patch, ['target', 'note', 'anchor', 'status'], 'review update');
    if (Object.keys(patch).length === 0) throw new ValidationError('Invalid review update', ['at least one field is required']);

    return this._withWriteLock('reviews', async () => {
      const reviews = await this.listReviews();
      const index = reviews.findIndex((review) => review.id === reviewId);
      if (index < 0) throw new HttpError(404, `Review request not found: ${reviewId}`);
      const next = { ...reviews[index], ...cloneJson(patch) };
      if (next.status === 'resolved' && reviews[index].status !== 'resolved') {
        next.resolvedAt = this.clock().toISOString();
      } else if (next.status === 'open') {
        delete next.resolvedAt;
      }
      assertValidReview(next);
      reviews[index] = next;
      await writeJsonAtomic(this.reviewFile, reviews);
      return cloneJson(next);
    });
  }

  async bootstrap() {
    await this.initialize();
    const [scorecard, waveCampaign, runs, reviews, scorecardVersions, waveVersions, scorecardDraft, waveDraft] = await Promise.all([
      this.getActive('scorecard'),
      this.getActive('wave-campaign'),
      readJson(path.join(this.fixtureRoot, 'sample-runs.json')),
      this.listReviews(),
      this.listVersions('scorecard'),
      this.listVersions('wave-campaign'),
      this.getDraft('scorecard'),
      this.getDraft('wave-campaign')
    ]);
    const summarize = (activeId) => (version) => ({
      id: version.id,
      revision: version.revision,
      parentId: version.parentId,
      rollbackOf: version.rollbackOf,
      createdAt: version.createdAt,
      changeNote: version.changeNote,
      contentHash: version.contentHash,
      active: version.id === activeId
    });
    return {
      scorecard: scorecard.payload,
      waveCampaign: waveCampaign.payload,
      runs,
      reviews,
      activeVersions: {
        scorecard: scorecard.id,
        'wave-campaign': waveCampaign.id
      },
      versions: {
        scorecard: scorecardVersions.map(summarize(scorecard.id)),
        'wave-campaign': waveVersions.map(summarize(waveCampaign.id))
      },
      drafts: {
        scorecard: scorecardDraft,
        'wave-campaign': waveDraft
      },
      safety: {
        localOnly: true,
        productionWrites: false,
        mainnetTransactions: false
      }
    };
  }

  async _withWriteLock(key, operation) {
    const previous = this.writeQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.writeQueues.set(key, current);
    try {
      return await current;
    } finally {
      if (this.writeQueues.get(key) === current) this.writeQueues.delete(key);
    }
  }
}

export const versionIdPattern = VERSION_ID_PATTERN;
