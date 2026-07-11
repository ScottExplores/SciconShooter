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
import { contentHash } from './configRepository.mjs';
import { assertValidGameCampaign } from './gameCampaignValidation.mjs';
import { HttpError, resolveWithin } from './security.mjs';
import { ValidationError } from './validation.mjs';

const VERSION_ID_PATTERN = /^game-campaign-([0-9]{8}T[0-9]{9}Z)-([0-9a-f]{12})-([0-9a-f]{6})$/;
const VERSION_SOURCES = new Set(['baseline', 'apply', 'rollback']);

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const readJson = async (filePath, { missing = undefined } = {}) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && missing !== undefined) return missing;
    if (error instanceof SyntaxError) {
      throw new Error(`Game campaign data file is not valid JSON: ${path.basename(filePath)}`);
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
  if (note.length > 240) {
    throw new ValidationError('Invalid game campaign change note', [
      'changeNote must be 240 characters or fewer'
    ]);
  }
  return note;
};

const compactTimestamp = (date) => date.toISOString().replace(/[-:.]/g, '');

export class GameCampaignRepository {
  constructor({
    repositoryRoot,
    dataRoot = path.join(repositoryRoot, 'director-data'),
    clock = () => new Date(),
    randomId = () => randomBytes(3).toString('hex')
  } = {}) {
    if (!repositoryRoot) throw new Error('Game campaign repository requires repositoryRoot');
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.dataRoot = resolveWithin(this.repositoryRoot, path.resolve(dataRoot));
    this.clock = clock;
    this.randomId = randomId;
    this.initializing = null;
    this.writeQueue = Promise.resolve();

    this.campaignFile = resolveWithin(this.repositoryRoot, 'game-config', 'campaign.json');
    this.storeRoot = resolveWithin(this.dataRoot, 'game-campaign');
    this.versionRoot = resolveWithin(this.storeRoot, 'versions');
    this.manifestFile = resolveWithin(this.storeRoot, 'manifest.json');
  }

  async initialize() {
    if (!this.initializing) {
      this.initializing = mkdir(this.versionRoot, { recursive: true }).catch((error) => {
        this.initializing = null;
        throw error;
      });
    }
    return this.initializing;
  }

  async _readCampaignFile() {
    const campaign = await readJson(this.campaignFile, { missing: null });
    if (!campaign) {
      throw new HttpError(404, 'Tracked game campaign not found at game-config/campaign.json');
    }
    assertValidGameCampaign(campaign, 'Tracked game campaign is invalid');
    return campaign;
  }

  async _readManifest() {
    const manifest = await readJson(this.manifestFile, { missing: null });
    if (!manifest) return null;
    const valid = manifest.schemaVersion === 1
      && manifest.kind === 'game-campaign'
      && typeof manifest.activeVersionId === 'string'
      && VERSION_ID_PATTERN.test(manifest.activeVersionId)
      && typeof manifest.contentHash === 'string'
      && Number.isInteger(manifest.revision)
      && manifest.revision >= 1
      && typeof manifest.updatedAt === 'string';
    if (!valid) throw new Error('Game campaign manifest is invalid');
    return manifest;
  }

  async _readDiskState() {
    const [campaign, manifest] = await Promise.all([
      this._readCampaignFile(),
      this._readManifest()
    ]);
    const hash = contentHash(campaign);
    const manifestMatchesDisk = Boolean(manifest && manifest.contentHash === hash);
    if (manifestMatchesDisk) {
      const activeVersion = await this._readVersion(manifest.activeVersionId);
      if (
        activeVersion.contentHash !== hash
        || activeVersion.revision !== campaign.revision
        || manifest.revision !== campaign.revision
      ) {
        throw new Error('Game campaign manifest does not match its active version');
      }
    }
    return {
      campaign,
      contentHash: hash,
      activeVersionId: manifestMatchesDisk ? manifest.activeVersionId : null,
      manifestMatchesDisk,
      manifest
    };
  }

  async readCampaign() {
    await this.initialize();
    const state = await this._readDiskState();
    return {
      campaign: cloneJson(state.campaign),
      contentHash: state.contentHash,
      activeVersionId: state.activeVersionId,
      revision: state.campaign.revision,
      updatedAt: state.campaign.updatedAt,
      sourcePath: 'game-config/campaign.json',
      diskMatchesManifest: state.manifestMatchesDisk
    };
  }

  _versionPath(versionId) {
    if (typeof versionId !== 'string' || !VERSION_ID_PATTERN.test(versionId)) {
      throw new HttpError(400, 'Invalid game campaign version ID');
    }
    return resolveWithin(this.versionRoot, `${versionId}.json`);
  }

  _createVersion(payload, {
    parentId,
    rollbackOf = null,
    source,
    changeNote,
    createdAt
  }) {
    const hash = contentHash(payload);
    const id = `game-campaign-${compactTimestamp(new Date(createdAt))}-${hash.slice(7, 19)}-${this.randomId()}`;
    return {
      schemaVersion: 1,
      kind: 'game-campaign',
      id,
      revision: payload.revision,
      parentId,
      rollbackOf,
      source,
      createdAt,
      changeNote,
      contentHash: hash,
      payload: cloneJson(payload)
    };
  }

  async _readVersion(versionId) {
    const version = await readJson(this._versionPath(versionId), { missing: null });
    if (!version) throw new HttpError(404, `Game campaign version not found: ${versionId}`);
    const structurallyValid = version.schemaVersion === 1
      && version.kind === 'game-campaign'
      && version.id === versionId
      && Number.isInteger(version.revision)
      && version.revision >= 1
      && (version.parentId === null || VERSION_ID_PATTERN.test(version.parentId))
      && (version.rollbackOf === null || VERSION_ID_PATTERN.test(version.rollbackOf))
      && VERSION_SOURCES.has(version.source)
      && typeof version.createdAt === 'string'
      && typeof version.changeNote === 'string'
      && typeof version.contentHash === 'string';
    if (!structurallyValid) throw new Error(`Game campaign version is invalid: ${versionId}`);
    assertValidGameCampaign(version.payload, `Game campaign version payload is invalid: ${versionId}`);
    const expectedHash = contentHash(version.payload);
    if (version.contentHash !== expectedHash || !versionId.includes(expectedHash.slice(7, 19))) {
      throw new Error(`Game campaign version failed its content hash check: ${versionId}`);
    }
    return version;
  }

  async getVersion(versionId) {
    await this.initialize();
    return cloneJson(await this._readVersion(versionId));
  }

  async listVersions() {
    await this.initialize();
    const filenames = await readdir(this.versionRoot);
    const ids = filenames
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5))
      .filter((id) => VERSION_ID_PATTERN.test(id));
    const versions = await Promise.all(ids.map((id) => this._readVersion(id)));
    versions.sort((left, right) => (
      right.revision - left.revision || right.createdAt.localeCompare(left.createdAt)
    ));
    return versions.map((version) => ({
      id: version.id,
      revision: version.revision,
      parentId: version.parentId,
      rollbackOf: version.rollbackOf,
      source: version.source,
      createdAt: version.createdAt,
      changeNote: version.changeNote,
      contentHash: version.contentHash
    }));
  }

  async _withWriteLock(operation) {
    const previous = this.writeQueue;
    const current = previous.catch(() => undefined).then(operation);
    this.writeQueue = current;
    try {
      return await current;
    } finally {
      if (this.writeQueue === current) this.writeQueue = Promise.resolve();
    }
  }

  async applyCampaign(candidate, options = {}) {
    await this.initialize();
    return this._withWriteLock(() => this._applyUnlocked(candidate, options));
  }

  async _applyUnlocked(candidate, {
    expectedContentHash = undefined,
    changeNote = undefined,
    source = 'apply',
    rollbackOf = null
  } = {}) {
    if (!VERSION_SOURCES.has(source) || source === 'baseline') {
      throw new Error(`Unsupported game campaign apply source: ${source}`);
    }
    const current = await this._readDiskState();
    if (expectedContentHash !== undefined && expectedContentHash !== current.contentHash) {
      throw new HttpError(409, 'The tracked game campaign changed; revert or reload before applying edits');
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new ValidationError('Invalid game campaign configuration', ['campaign must be an object']);
    }

    const baselineCreatedAt = current.activeVersionId ? null : this.clock().toISOString();
    const now = this.clock().toISOString();
    const normalized = cloneJson(candidate);
    normalized.revision = current.campaign.revision + 1;
    normalized.updatedAt = now;
    assertValidGameCampaign(normalized);

    const oldManifest = current.manifest ? cloneJson(current.manifest) : null;
    const createdVersionPaths = [];
    let campaignWritten = false;
    let parentId = current.activeVersionId;
    let baselineVersion = null;

    if (!parentId) {
      baselineVersion = this._createVersion(current.campaign, {
        parentId: current.manifest?.activeVersionId ?? null,
        source: 'baseline',
        changeNote: 'Captured tracked campaign before first Director apply',
        createdAt: baselineCreatedAt
      });
      parentId = baselineVersion.id;
    }

    const version = this._createVersion(normalized, {
      parentId,
      rollbackOf,
      source,
      changeNote: normalizeChangeNote(
        changeNote,
        source === 'rollback' ? `Rollback to ${rollbackOf}` : 'Applied from Scicon Director'
      ),
      createdAt: now
    });
    const manifest = {
      schemaVersion: 1,
      kind: 'game-campaign',
      activeVersionId: version.id,
      revision: normalized.revision,
      contentHash: version.contentHash,
      updatedAt: now
    };

    try {
      if (baselineVersion) {
        const baselinePath = this._versionPath(baselineVersion.id);
        await writeJsonExclusive(baselinePath, baselineVersion);
        createdVersionPaths.push(baselinePath);
      }
      const versionPath = this._versionPath(version.id);
      await writeJsonExclusive(versionPath, version);
      createdVersionPaths.push(versionPath);
      await writeJsonAtomic(this.campaignFile, normalized);
      campaignWritten = true;
      await writeJsonAtomic(this.manifestFile, manifest);
    } catch (error) {
      if (campaignWritten) await writeJsonAtomic(this.campaignFile, current.campaign);
      if (oldManifest) await writeJsonAtomic(this.manifestFile, oldManifest);
      else await rm(this.manifestFile, { force: true });
      await Promise.all(createdVersionPaths.map((filePath) => rm(filePath, { force: true })));
      throw error;
    }

    return {
      campaign: cloneJson(normalized),
      contentHash: version.contentHash,
      activeVersionId: version.id,
      version: cloneJson(version)
    };
  }

  async rollback(versionId, { expectedContentHash = undefined, changeNote = undefined } = {}) {
    await this.initialize();
    return this._withWriteLock(async () => {
      const target = await this._readVersion(versionId);
      return this._applyUnlocked(target.payload, {
        expectedContentHash,
        changeNote,
        source: 'rollback',
        rollbackOf: target.id
      });
    });
  }
}

export const gameCampaignVersionIdPattern = VERSION_ID_PATTERN;
