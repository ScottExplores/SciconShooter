import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { contentHash } from './configRepository.mjs';
import { assertValidGameCampaign } from './gameCampaignValidation.mjs';
import { HttpError, resolveWithin } from './security.mjs';
import { ValidationError } from './validation.mjs';

const WORKSPACE_SCHEMA_VERSION = 1;
const WORKSPACE_KIND = 'game-campaign-workspace';
const PENDING_KIND = 'game-campaign-workspace-pending';
const APPLY_PENDING_KIND = 'game-campaign-workspace-apply-pending';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/;
const RESOURCE_KINDS = new Set(['level', 'wave', 'boss-event']);
const MAX_RESOURCE_BYTES = 192 * 1024;
const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;
const MAX_IDEMPOTENCY_RECEIPTS = 64;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 120_000;

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

const readJson = async (filePath, { missing = undefined } = {}) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && missing !== undefined) return missing;
    if (error instanceof SyntaxError) {
      throw new Error(`Director workspace file is not valid JSON: ${path.basename(filePath)}`);
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

const writeIfMissing = async (filePath, contents) => {
  try {
    await writeFile(filePath, contents, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
};

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`Invalid ${label}`, [`${label} must be an object`]);
  }
  return value;
};

const assertId = (value, label) => {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ValidationError(`Invalid ${label}`, [`${label} must be a stable kebab-case ID`]);
  }
  return value;
};

const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

const assertResourceSize = (resource) => {
  if (serializedBytes(resource) > MAX_RESOURCE_BYTES) {
    throw new HttpError(413, `Workspace resource exceeds the ${MAX_RESOURCE_BYTES}-byte limit`);
  }
};

const editKey = (edit) => {
  if (edit.kind === 'level') return `level:${edit.levelId}`;
  if (edit.kind === 'wave') return `wave:${edit.levelId}:${edit.waveId}`;
  return `boss-event:${edit.levelId}:${edit.waveId}:${edit.eventId}`;
};

const normalizeChangeNote = (value) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError('Invalid workspace apply request', ['changeNote must be a string']);
  }
  const note = value.trim();
  if (!note) return undefined;
  if (note.length > 240) {
    throw new ValidationError('Invalid workspace apply request', [
      'changeNote must be 240 characters or fewer'
    ]);
  }
  return note;
};

const findLevel = (campaign, levelId) => campaign.levels.find((level) => level.id === levelId);

const findResource = (campaign, edit) => {
  const level = findLevel(campaign, edit.levelId);
  if (!level || edit.kind === 'level') return level ?? null;
  const wave = level.waves.find((candidate) => candidate.id === edit.waveId);
  if (!wave || edit.kind === 'wave') return wave ?? null;
  return wave.events.find((candidate) => candidate.id === edit.eventId) ?? null;
};

const resourceContentHash = (resource) => contentHash(resource ?? null);

const authoredCampaignHash = (campaign) => {
  const authored = cloneJson(campaign);
  delete authored.revision;
  delete authored.updatedAt;
  return contentHash(authored);
};

const applyResourceEdit = (campaign, edit, { rebase = false } = {}) => {
  if (edit.kind === 'level') {
    const index = campaign.levels.findIndex((level) => level.id === edit.levelId);
    if (index === -1) campaign.levels.push(cloneJson(edit.resource));
    else campaign.levels[index] = cloneJson(edit.resource);
    return;
  }

  const level = findLevel(campaign, edit.levelId);
  if (!level) {
    const message = rebase
      ? `Cannot rebase ${edit.kind} edit because level ${edit.levelId} no longer exists`
      : `Workspace level not found: ${edit.levelId}`;
    throw new HttpError(rebase ? 409 : 404, message);
  }

  if (edit.kind === 'wave') {
    const index = level.waves.findIndex((wave) => wave.id === edit.waveId);
    if (index === -1) level.waves.push(cloneJson(edit.resource));
    else level.waves[index] = cloneJson(edit.resource);
    return;
  }

  const wave = level.waves.find((candidate) => candidate.id === edit.waveId);
  if (!wave) {
    const message = rebase
      ? `Cannot rebase boss-event edit because wave ${edit.waveId} no longer exists`
      : `Workspace wave not found: ${edit.waveId}`;
    throw new HttpError(rebase ? 409 : 404, message);
  }
  const index = wave.events.findIndex((event) => event.id === edit.eventId);
  if (index === -1) wave.events.push(cloneJson(edit.resource));
  else wave.events[index] = cloneJson(edit.resource);
};

export class GameCampaignWorkspaceRepository {
  constructor({
    repositoryRoot,
    dataRoot = path.join(repositoryRoot, 'director-data'),
    gameCampaignRepository,
    clock = () => new Date()
  } = {}) {
    if (!repositoryRoot) throw new Error('Game campaign workspace requires repositoryRoot');
    if (!gameCampaignRepository) {
      throw new Error('Game campaign workspace requires a game campaign repository');
    }

    this.repositoryRoot = path.resolve(repositoryRoot);
    this.dataRoot = resolveWithin(this.repositoryRoot, path.resolve(dataRoot));
    this.gameCampaignRepository = gameCampaignRepository;
    this.clock = clock;
    this.initializing = null;
    this.writeQueue = Promise.resolve();

    this.sharedWorkspaceRoot = resolveWithin(this.dataRoot, 'workspace');
    this.workspaceRoot = resolveWithin(this.sharedWorkspaceRoot, 'game-campaign');
    this.stateFile = resolveWithin(this.workspaceRoot, 'active.json');
    this.pendingFile = resolveWithin(this.workspaceRoot, 'active.pending.json');
    this.lockDirectory = resolveWithin(this.workspaceRoot, 'active.lock');
    this.lockOwnerFile = resolveWithin(this.lockDirectory, 'owner.json');
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
    await mkdir(this.workspaceRoot, { recursive: true });
    await writeIfMissing(resolveWithin(this.sharedWorkspaceRoot, '.gitignore'), '*\n!.gitignore\n');
    const release = await this._acquireFileLock();
    try {
      await this._recoverPendingWrite();
    } finally {
      await release();
    }
  }

  async _acquireFileLock() {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() <= deadline) {
      const ownerToken = `${process.pid}-${randomBytes(8).toString('hex')}`;
      try {
        await mkdir(this.lockDirectory);
        try {
          await writeFile(this.lockOwnerFile, `${JSON.stringify({
            token: ownerToken,
            pid: process.pid,
            acquiredAt: new Date().toISOString()
          })}\n`, 'utf8');
        } catch (error) {
          await rm(this.lockDirectory, { recursive: true, force: true });
          throw error;
        }
        return async () => {
          const owner = await readJson(this.lockOwnerFile, { missing: null });
          if (owner?.token === ownerToken) {
            await rm(this.lockDirectory, { recursive: true, force: true });
          }
        };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const lockStats = await stat(this.lockDirectory);
          if (Date.now() - lockStats.mtimeMs > STALE_LOCK_MS) {
            const owner = await readJson(this.lockOwnerFile, { missing: null })
              .catch(() => null);
            if (isProcessAlive(owner?.pid)) {
              await delay(15);
              continue;
            }
            const staleLock = resolveWithin(
              this.workspaceRoot,
              `active.lock.stale.${process.pid}.${randomBytes(5).toString('hex')}`
            );
            try {
              await rename(this.lockDirectory, staleLock);
              await rm(staleLock, { recursive: true, force: true });
            } catch (staleError) {
              if (!['ENOENT', 'EACCES', 'EPERM'].includes(staleError?.code)) throw staleError;
            }
            continue;
          }
        } catch (lockError) {
          if (lockError?.code !== 'ENOENT') throw lockError;
          continue;
        }
        await delay(15);
      }
    }
    throw new HttpError(503, 'The Director workspace is busy; retry the request');
  }

  async _withWriteLock(operation) {
    await this.initialize();
    const previous = this.writeQueue;
    const current = previous.catch(() => undefined).then(async () => {
      const release = await this._acquireFileLock();
      try {
        await this._recoverPendingWrite();
        return await operation();
      } finally {
        await release();
      }
    });
    this.writeQueue = current;
    try {
      return await current;
    } finally {
      if (this.writeQueue === current) this.writeQueue = Promise.resolve();
    }
  }

  _assertWorkspaceState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('Game campaign workspace state must be an object');
    }
    if (state.schemaVersion !== WORKSPACE_SCHEMA_VERSION || state.kind !== WORKSPACE_KIND) {
      throw new Error('Game campaign workspace state has an unsupported schema');
    }
    if (!HASH_PATTERN.test(state.baseContentHash) || !HASH_PATTERN.test(state.draftContentHash)) {
      throw new Error('Game campaign workspace state has an invalid content hash');
    }
    if (!Number.isInteger(state.draftRevision) || state.draftRevision < 0) {
      throw new Error('Game campaign workspace state has an invalid draft revision');
    }
    if (typeof state.updatedAt !== 'string' || !Number.isFinite(Date.parse(state.updatedAt))) {
      throw new Error('Game campaign workspace state has an invalid updatedAt value');
    }
    if (!Array.isArray(state.resourceEdits) || !Array.isArray(state.idempotencyReceipts)) {
      throw new Error('Game campaign workspace state is missing edit or idempotency history');
    }
    if (state.idempotencyReceipts.length > MAX_IDEMPOTENCY_RECEIPTS) {
      throw new Error('Game campaign workspace has too many idempotency receipts');
    }

    const editKeys = new Set();
    for (const edit of state.resourceEdits) {
      if (!edit || typeof edit !== 'object' || !RESOURCE_KINDS.has(edit.kind)) {
        throw new Error('Game campaign workspace contains an invalid resource edit');
      }
      assertId(edit.levelId, 'workspace edit levelId');
      if (edit.kind !== 'level') assertId(edit.waveId, 'workspace edit waveId');
      if (edit.kind === 'boss-event') assertId(edit.eventId, 'workspace edit eventId');
      assertPlainObject(edit.resource, 'workspace edit resource');
      const expectedResourceId = edit.kind === 'level'
        ? edit.levelId
        : edit.kind === 'wave'
          ? edit.waveId
          : edit.eventId;
      if (edit.resource.id !== expectedResourceId) {
        throw new Error(`Game campaign workspace edit payload does not match ${editKey(edit)}`);
      }
      if (edit.kind === 'boss-event' && edit.resource.kind !== 'boss') {
        throw new Error('Game campaign workspace contains a non-boss boss-event edit');
      }
      if (edit.baseResourceHash !== undefined && !HASH_PATTERN.test(edit.baseResourceHash)) {
        throw new Error(`Game campaign workspace edit has an invalid base hash: ${editKey(edit)}`);
      }
      const key = editKey(edit);
      if (editKeys.has(key)) throw new Error(`Game campaign workspace contains duplicate edit: ${key}`);
      editKeys.add(key);
    }
    const receiptKeys = new Set();
    for (const receipt of state.idempotencyReceipts) {
      if (
        !receipt
        || typeof receipt !== 'object'
        || !IDEMPOTENCY_KEY_PATTERN.test(receipt.key)
        || !HASH_PATTERN.test(receipt.fingerprint)
        || typeof receipt.operation !== 'string'
        || typeof receipt.completedAt !== 'string'
        || !receipt.response
        || typeof receipt.response !== 'object'
      ) {
        throw new Error('Game campaign workspace contains an invalid idempotency receipt');
      }
      if (receiptKeys.has(receipt.key)) {
        throw new Error(`Game campaign workspace contains duplicate idempotency receipt: ${receipt.key}`);
      }
      receiptKeys.add(receipt.key);
    }

    assertValidGameCampaign(state.draftCampaign, 'Saved Director workspace campaign is invalid');
    if (contentHash(state.draftCampaign) !== state.draftContentHash) {
      throw new Error('Game campaign workspace failed its draft content hash check');
    }
    if (serializedBytes(state) > MAX_WORKSPACE_BYTES) {
      throw new Error(`Game campaign workspace exceeds the ${MAX_WORKSPACE_BYTES}-byte limit`);
    }
    return state;
  }

  async _recoverPendingWrite() {
    const pending = await readJson(this.pendingFile, { missing: null });
    if (!pending) return;
    if (pending.kind === APPLY_PENDING_KIND) {
      await this._recoverPendingApply(pending);
      return;
    }
    if (
      pending.schemaVersion !== WORKSPACE_SCHEMA_VERSION
      || pending.kind !== PENDING_KIND
      || !HASH_PATTERN.test(pending.stateHash)
      || contentHash(pending.state) !== pending.stateHash
    ) {
      throw new Error('Director workspace recovery journal is invalid');
    }
    this._assertWorkspaceState(pending.state);
    await writeJsonAtomic(this.stateFile, pending.state);
    await rm(this.pendingFile, { force: true });
  }

  async _writeApplyIntent(state, {
    idempotencyKey,
    fingerprint,
    changeNote
  }) {
    const pending = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      kind: APPLY_PENDING_KIND,
      stateHash: contentHash(state),
      state,
      idempotencyKey,
      fingerprint,
      ...(changeNote ? { changeNote } : {})
    };
    await writeJsonAtomic(this.pendingFile, pending);
  }

  async _writeState(state) {
    this._assertWorkspaceState(state);
    const pending = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      kind: PENDING_KIND,
      stateHash: contentHash(state),
      state
    };
    await writeJsonAtomic(this.pendingFile, pending);
    await writeJsonAtomic(this.stateFile, state);
    await rm(this.pendingFile, { force: true });
  }

  _applyResponse(nextState, applied) {
    return {
      workspace: this._summary(nextState, applied.contentHash),
      applied: {
        contentHash: applied.contentHash,
        activeVersionId: applied.activeVersionId,
        revision: applied.campaign.revision,
        updatedAt: applied.campaign.updatedAt,
        version: {
          id: applied.version.id,
          revision: applied.version.revision,
          parentId: applied.version.parentId,
          rollbackOf: applied.version.rollbackOf,
          source: applied.version.source,
          createdAt: applied.version.createdAt,
          changeNote: applied.version.changeNote,
          contentHash: applied.version.contentHash
        }
      }
    };
  }

  async _matchingAppliedVersion(state) {
    const expectedRevision = state.draftCampaign.revision + 1;
    const expectedAuthoredHash = authoredCampaignHash(state.draftCampaign);
    const summaries = await this.gameCampaignRepository.listVersions();
    for (const summary of summaries) {
      if (summary.revision !== expectedRevision || summary.source !== 'apply') continue;
      const version = await this.gameCampaignRepository.getVersion(summary.id);
      if (authoredCampaignHash(version.payload) === expectedAuthoredHash) return version;
    }
    return null;
  }

  async _promoteRecoveredVersion(version) {
    const repository = this.gameCampaignRepository;
    if (!repository.campaignFile || !repository.manifestFile) {
      throw new Error('Game campaign repository cannot repair an interrupted workspace apply');
    }
    await writeJsonAtomic(repository.campaignFile, version.payload);
    await writeJsonAtomic(repository.manifestFile, {
      schemaVersion: 1,
      kind: 'game-campaign',
      activeVersionId: version.id,
      revision: version.revision,
      contentHash: version.contentHash,
      updatedAt: version.payload.updatedAt
    });
    return {
      campaign: cloneJson(version.payload),
      contentHash: version.contentHash,
      activeVersionId: version.id,
      version: cloneJson(version)
    };
  }

  async _archiveConflictedApplyIntent() {
    const conflictFile = resolveWithin(
      this.workspaceRoot,
      `active.pending.conflict.${process.pid}.${randomBytes(5).toString('hex')}.json`
    );
    try {
      await rename(this.pendingFile, conflictFile);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  async _recoverPendingApply(pending) {
    if (
      pending.schemaVersion !== WORKSPACE_SCHEMA_VERSION
      || pending.kind !== APPLY_PENDING_KIND
      || !HASH_PATTERN.test(pending.stateHash)
      || contentHash(pending.state) !== pending.stateHash
      || !IDEMPOTENCY_KEY_PATTERN.test(pending.idempotencyKey)
      || !HASH_PATTERN.test(pending.fingerprint)
      || (pending.changeNote !== undefined && (
        typeof pending.changeNote !== 'string'
        || pending.changeNote.length > 240
      ))
    ) {
      throw new Error('Director workspace apply recovery journal is invalid');
    }

    const state = this._assertWorkspaceState(pending.state);
    if (!state.resourceEdits.length) {
      throw new Error('Director workspace apply recovery journal has no resource edits');
    }
    const expectedFingerprint = contentHash({
      operation: 'apply',
      expectedBaseContentHash: state.baseContentHash,
      expectedDraftRevision: state.draftRevision,
      ...(pending.changeNote ? { changeNote: pending.changeNote } : {})
    });
    if (pending.fingerprint !== expectedFingerprint) {
      throw new Error('Director workspace apply recovery journal failed its mutation check');
    }

    let disk = await this.gameCampaignRepository.readCampaign();
    const expectedRevision = state.draftCampaign.revision + 1;
    const diskIsBase = disk.contentHash === state.baseContentHash;
    const diskIsCandidate = (
      disk.campaign.revision === expectedRevision
      && authoredCampaignHash(disk.campaign) === authoredCampaignHash(state.draftCampaign)
    );

    if (!diskIsBase && !diskIsCandidate) {
      await this._archiveConflictedApplyIntent();
      return;
    }

    let applied;
    const matchingVersion = await this._matchingAppliedVersion(state);
    if (diskIsCandidate) {
      if (disk.activeVersionId) {
        const activeVersion = await this.gameCampaignRepository.getVersion(disk.activeVersionId);
        if (
          activeVersion.id === matchingVersion?.id
          && activeVersion.contentHash === disk.contentHash
        ) {
          applied = {
            campaign: cloneJson(disk.campaign),
            contentHash: disk.contentHash,
            activeVersionId: activeVersion.id,
            version: activeVersion
          };
        }
      }
      if (!applied) {
        if (!matchingVersion || matchingVersion.contentHash !== disk.contentHash) {
          throw new Error('Director workspace cannot identify the version for an interrupted apply');
        }
        applied = await this._promoteRecoveredVersion(matchingVersion);
      }
    } else if (matchingVersion) {
      applied = await this._promoteRecoveredVersion(matchingVersion);
    } else {
      applied = await this.gameCampaignRepository.applyCampaign(state.draftCampaign, {
        expectedContentHash: state.baseContentHash,
        changeNote: pending.changeNote
      });
    }

    disk = await this.gameCampaignRepository.readCampaign();
    if (
      disk.contentHash !== applied.contentHash
      || disk.activeVersionId !== applied.activeVersionId
    ) {
      throw new Error('Director workspace apply recovery did not produce a stable campaign state');
    }

    const nextState = this._newState(
      {
        campaign: applied.campaign,
        contentHash: applied.contentHash
      },
      state.draftRevision + 1,
      state.idempotencyReceipts
    );
    const response = this._applyResponse(nextState, applied);
    const persisted = this._withReceipt(nextState, {
      idempotencyKey: pending.idempotencyKey,
      fingerprint: pending.fingerprint,
      operation: 'apply',
      response
    });
    await this._writeState(persisted);
  }

  _newState(disk, draftRevision = 0, idempotencyReceipts = []) {
    const draftCampaign = cloneJson(disk.campaign);
    return {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      kind: WORKSPACE_KIND,
      baseContentHash: disk.contentHash,
      draftRevision,
      draftContentHash: contentHash(draftCampaign),
      updatedAt: this.clock().toISOString(),
      draftCampaign,
      resourceEdits: [],
      idempotencyReceipts: cloneJson(idempotencyReceipts)
    };
  }

  async _readOrCreateUnlocked() {
    const existing = await readJson(this.stateFile, { missing: null });
    if (existing) return this._assertWorkspaceState(existing);
    const disk = await this.gameCampaignRepository.readCampaign();
    const state = this._newState(disk);
    await this._writeState(state);
    return state;
  }

  _summary(state, currentContentHash) {
    return {
      schemaVersion: state.schemaVersion,
      baseContentHash: state.baseContentHash,
      draftRevision: state.draftRevision,
      draftContentHash: state.draftContentHash,
      updatedAt: state.updatedAt,
      hasChanges: state.resourceEdits.length > 0,
      stale: currentContentHash !== state.baseContentHash,
      changedResources: state.resourceEdits.map((edit) => ({
        kind: edit.kind,
        levelId: edit.levelId,
        ...(edit.waveId ? { waveId: edit.waveId } : {}),
        ...(edit.eventId ? { eventId: edit.eventId } : {})
      }))
    };
  }

  _assertMutationOptions(state, {
    expectedBaseContentHash,
    expectedDraftRevision,
    idempotencyKey
  }) {
    const errors = [];
    if (!HASH_PATTERN.test(expectedBaseContentHash)) {
      errors.push('expectedBaseContentHash is required and must be a SHA-256 content hash');
    }
    if (!Number.isInteger(expectedDraftRevision) || expectedDraftRevision < 0) {
      errors.push('expectedDraftRevision is required and must be a non-negative integer');
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      errors.push('idempotencyKey is required and must be 1-128 safe characters');
    }
    if (errors.length) throw new ValidationError('Invalid workspace mutation preconditions', errors);
    if (expectedBaseContentHash !== state.baseContentHash) {
      throw new HttpError(409, 'The workspace base changed; reload workspace state before editing');
    }
    if (expectedDraftRevision !== state.draftRevision) {
      throw new HttpError(409, 'The workspace draft changed; reload workspace state before editing');
    }
  }

  _findIdempotencyReceipt(state, idempotencyKey, fingerprint) {
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) return null;
    const receipt = state.idempotencyReceipts.find((candidate) => candidate.key === idempotencyKey);
    if (!receipt) return null;
    if (receipt.fingerprint !== fingerprint) {
      throw new HttpError(409, 'The idempotency key was already used for a different workspace mutation');
    }
    return cloneJson(receipt.response);
  }

  _withReceipt(state, { idempotencyKey, fingerprint, operation, response }) {
    const receipts = state.idempotencyReceipts
      .filter((receipt) => receipt.key !== idempotencyKey)
      .slice(-(MAX_IDEMPOTENCY_RECEIPTS - 1));
    receipts.push({
      key: idempotencyKey,
      fingerprint,
      operation,
      completedAt: this.clock().toISOString(),
      response: cloneJson(response)
    });
    return { ...state, idempotencyReceipts: receipts };
  }

  async readWorkspace() {
    return this._withWriteLock(async () => {
      const [state, disk] = await Promise.all([
        this._readOrCreateUnlocked(),
        this.gameCampaignRepository.readCampaign()
      ]);
      return {
        ...this._summary(state, disk.contentHash),
        draftCampaign: cloneJson(state.draftCampaign)
      };
    });
  }

  async readResource(kind, identifiers) {
    if (!RESOURCE_KINDS.has(kind)) throw new HttpError(400, 'Unsupported workspace resource kind');
    const levelId = assertId(identifiers?.levelId, 'levelId');
    const waveId = kind === 'level' ? null : assertId(identifiers?.waveId, 'waveId');
    const eventId = kind === 'boss-event' ? assertId(identifiers?.eventId, 'eventId') : null;
    const workspace = await this.readWorkspace();
    const level = findLevel(workspace.draftCampaign, levelId);
    if (!level) throw new HttpError(404, `Workspace level not found: ${levelId}`);
    let resource = level;
    if (kind !== 'level') {
      resource = level.waves.find((wave) => wave.id === waveId);
      if (!resource) throw new HttpError(404, `Workspace wave not found: ${waveId}`);
    }
    if (kind === 'boss-event') {
      resource = resource.events.find((event) => event.id === eventId && event.kind === 'boss');
      if (!resource) throw new HttpError(404, `Workspace boss event not found: ${eventId}`);
    }
    const { draftCampaign: _draftCampaign, ...summary } = workspace;
    return { workspace: summary, resource: cloneJson(resource) };
  }

  async updateResource(kind, identifiers, resource, options) {
    if (!RESOURCE_KINDS.has(kind)) throw new HttpError(400, 'Unsupported workspace resource kind');
    assertPlainObject(resource, `${kind} resource`);
    assertResourceSize(resource);
    const levelId = assertId(identifiers?.levelId, 'levelId');
    const waveId = kind === 'level' ? null : assertId(identifiers?.waveId, 'waveId');
    const eventId = kind === 'boss-event' ? assertId(identifiers?.eventId, 'eventId') : null;
    const expectedId = kind === 'level' ? levelId : kind === 'wave' ? waveId : eventId;
    if (resource.id !== expectedId) {
      throw new ValidationError(`Invalid ${kind} resource`, [
        `resource id must match route id ${expectedId}`
      ]);
    }
    if (kind === 'boss-event' && resource.kind !== 'boss') {
      throw new ValidationError('Invalid boss-event resource', ['boss-event resource kind must be boss']);
    }

    const edit = {
      kind,
      levelId,
      ...(waveId ? { waveId } : {}),
      ...(eventId ? { eventId } : {}),
      resource: cloneJson(resource)
    };
    const operation = `update:${editKey(edit)}`;
    const fingerprint = contentHash({
      operation,
      expectedBaseContentHash: options?.expectedBaseContentHash,
      expectedDraftRevision: options?.expectedDraftRevision,
      resource
    });

    return this._withWriteLock(async () => {
      const state = await this._readOrCreateUnlocked();
      const replay = this._findIdempotencyReceipt(state, options?.idempotencyKey, fingerprint);
      if (replay) return replay;
      this._assertMutationOptions(state, options ?? {});

      const disk = await this.gameCampaignRepository.readCampaign();
      if (disk.contentHash !== state.baseContentHash) {
        throw new HttpError(409, 'The tracked campaign changed; rebase or reset the workspace before editing');
      }

      const draftCampaign = cloneJson(state.draftCampaign);
      applyResourceEdit(draftCampaign, edit);
      assertValidGameCampaign(draftCampaign, 'Invalid Director workspace campaign');
      const previousEdit = state.resourceEdits.find(
        (candidate) => editKey(candidate) === editKey(edit)
      );
      const persistedEdit = {
        ...edit,
        baseResourceHash: previousEdit?.baseResourceHash
          ?? resourceContentHash(findResource(disk.campaign, edit))
      };
      const resourceEdits = state.resourceEdits
        .filter((candidate) => editKey(candidate) !== editKey(edit));
      resourceEdits.push(persistedEdit);
      const nextState = {
        ...state,
        draftRevision: state.draftRevision + 1,
        draftContentHash: contentHash(draftCampaign),
        updatedAt: this.clock().toISOString(),
        draftCampaign,
        resourceEdits
      };
      const response = {
        workspace: this._summary(nextState, disk.contentHash),
        resource: cloneJson(resource)
      };
      const persisted = this._withReceipt(nextState, {
        idempotencyKey: options.idempotencyKey,
        fingerprint,
        operation,
        response
      });
      await this._writeState(persisted);
      return cloneJson(response);
    });
  }

  async reset(options) {
    const operation = 'reset';
    const fingerprint = contentHash({
      operation,
      expectedBaseContentHash: options?.expectedBaseContentHash,
      expectedDraftRevision: options?.expectedDraftRevision
    });
    return this._withWriteLock(async () => {
      const state = await this._readOrCreateUnlocked();
      const replay = this._findIdempotencyReceipt(state, options?.idempotencyKey, fingerprint);
      if (replay) return replay;
      this._assertMutationOptions(state, options ?? {});
      const disk = await this.gameCampaignRepository.readCampaign();
      const nextState = this._newState(
        disk,
        state.draftRevision + 1,
        state.idempotencyReceipts
      );
      const response = { workspace: this._summary(nextState, disk.contentHash) };
      const persisted = this._withReceipt(nextState, {
        idempotencyKey: options.idempotencyKey,
        fingerprint,
        operation,
        response
      });
      await this._writeState(persisted);
      return cloneJson(response);
    });
  }

  async rebase(options) {
    const operation = 'rebase';
    const fingerprint = contentHash({
      operation,
      expectedBaseContentHash: options?.expectedBaseContentHash,
      expectedDraftRevision: options?.expectedDraftRevision
    });
    return this._withWriteLock(async () => {
      const state = await this._readOrCreateUnlocked();
      const replay = this._findIdempotencyReceipt(state, options?.idempotencyKey, fingerprint);
      if (replay) return replay;
      this._assertMutationOptions(state, options ?? {});
      const disk = await this.gameCampaignRepository.readCampaign();
      const editsWithoutBase = state.resourceEdits
        .filter((edit) => !edit.baseResourceHash)
        .map(editKey);
      if (editsWithoutBase.length) {
        throw new HttpError(
          409,
          `Workspace edits predate resource conflict tracking; reset and recreate: ${editsWithoutBase.join(', ')}`
        );
      }
      const conflicts = state.resourceEdits
        .filter((edit) => (
          resourceContentHash(findResource(disk.campaign, edit)) !== edit.baseResourceHash
        ))
        .map(editKey);
      if (conflicts.length) {
        throw new HttpError(
          409,
          `Workspace rebase conflicts with externally changed resources: ${conflicts.join(', ')}`
        );
      }
      const draftCampaign = cloneJson(disk.campaign);
      for (const edit of state.resourceEdits) {
        applyResourceEdit(draftCampaign, edit, { rebase: true });
      }
      assertValidGameCampaign(draftCampaign, 'Workspace edits cannot be rebased onto the tracked campaign');
      const nextState = {
        ...state,
        baseContentHash: disk.contentHash,
        draftRevision: state.draftRevision + 1,
        draftContentHash: contentHash(draftCampaign),
        updatedAt: this.clock().toISOString(),
        draftCampaign
      };
      const response = { workspace: this._summary(nextState, disk.contentHash) };
      const persisted = this._withReceipt(nextState, {
        idempotencyKey: options.idempotencyKey,
        fingerprint,
        operation,
        response
      });
      await this._writeState(persisted);
      return cloneJson(response);
    });
  }

  async apply(options) {
    const changeNote = normalizeChangeNote(options?.changeNote);
    const operation = 'apply';
    const fingerprint = contentHash({
      operation,
      expectedBaseContentHash: options?.expectedBaseContentHash,
      expectedDraftRevision: options?.expectedDraftRevision,
      ...(changeNote ? { changeNote } : {})
    });
    return this._withWriteLock(async () => {
      const state = await this._readOrCreateUnlocked();
      const replay = this._findIdempotencyReceipt(state, options?.idempotencyKey, fingerprint);
      if (replay) return replay;
      this._assertMutationOptions(state, options ?? {});
      assertValidGameCampaign(state.draftCampaign, 'Invalid Director workspace campaign');

      const disk = await this.gameCampaignRepository.readCampaign();
      if (disk.contentHash !== state.baseContentHash) {
        throw new HttpError(409, 'The tracked campaign changed; rebase or reset the workspace before applying');
      }
      if (!state.resourceEdits.length) {
        throw new ValidationError('Workspace has no changes to apply', [
          'edit at least one resource before applying'
        ]);
      }

      await this._writeApplyIntent(state, {
        idempotencyKey: options.idempotencyKey,
        fingerprint,
        changeNote
      });
      const applied = await this.gameCampaignRepository.applyCampaign(state.draftCampaign, {
        expectedContentHash: state.baseContentHash,
        changeNote
      });
      const nextState = this._newState(
        {
          campaign: applied.campaign,
          contentHash: applied.contentHash
        },
        state.draftRevision + 1,
        state.idempotencyReceipts
      );
      const response = this._applyResponse(nextState, applied);
      const persisted = this._withReceipt(nextState, {
        idempotencyKey: options.idempotencyKey,
        fingerprint,
        operation,
        response
      });
      await this._writeState(persisted);
      return cloneJson(response);
    });
  }
}

export const gameCampaignWorkspaceLimits = Object.freeze({
  maxResourceBytes: MAX_RESOURCE_BYTES,
  maxWorkspaceBytes: MAX_WORKSPACE_BYTES,
  maxIdempotencyReceipts: MAX_IDEMPOTENCY_RECEIPTS
});
