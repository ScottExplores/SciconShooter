import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import pngjs from 'pngjs';
import { resolveWithin } from './security.mjs';
import { ValidationError } from './validation.mjs';

const { PNG } = pngjs;

export const GENERATED_ASSET_ROLES = Object.freeze([
  'enemy',
  'boss',
  'asteroid',
  'hud',
  'player',
  'background',
  'scorecard'
]);

const ROLE_SET = new Set(GENERATED_ASSET_ROLES);
const SCORECARD_COMPANION_ROLES = new Set(['enemy', 'boss', 'asteroid', 'player']);
const MANIFEST_SCHEMA_VERSION = 1;
const MAX_PROMPT_LENGTH = 1_500;
const MAX_LABEL_LENGTH = 80;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_EDGE = 4_096;
const MAX_IMAGE_PIXELS = 16_777_216;
const GENERATED_ID_PATTERN = /^GENERATED_[A-Z0-9_]+_[A-F0-9]{12}$/;
const GENERATED_PATH_PATTERN = /^\/game-art\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{12}\.png$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const isPlainObject = (value) => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const cleanText = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

const slugify = (value, fallback) => {
  const slug = cleanText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || fallback;
};

export const normalizeGeneratedAssetRequest = (value) => {
  const errors = [];
  if (!isPlainObject(value)) {
    throw new ValidationError('Invalid generated asset request', ['request body must be an object']);
  }

  const unsupported = Object.keys(value).filter((key) => !['prompt', 'label', 'role'].includes(key));
  if (unsupported.length > 0) errors.push(`unsupported fields: ${unsupported.join(', ')}`);

  const prompt = cleanText(value.prompt);
  const label = cleanText(value.label);
  const role = cleanText(value.role).toLowerCase();

  if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`prompt must contain between 3 and ${MAX_PROMPT_LENGTH} characters`);
  }
  if (label.length < 1 || label.length > MAX_LABEL_LENGTH) {
    errors.push(`label must contain between 1 and ${MAX_LABEL_LENGTH} characters`);
  }
  if (!ROLE_SET.has(role)) {
    errors.push(`role must be one of: ${GENERATED_ASSET_ROLES.join(', ')}`);
  }

  if (errors.length > 0) throw new ValidationError('Invalid generated asset request', errors);
  return { prompt, label, role };
};

const validateManifestEntry = (entry, index, errors) => {
  const location = `/assets/${index}`;
  if (!isPlainObject(entry)) {
    errors.push(`${location} must be an object`);
    return;
  }
  const expectedKeys = ['id', 'label', 'roles', 'path', 'sha256', 'width', 'height', 'createdAt'];
  const unsupported = Object.keys(entry).filter((key) => !expectedKeys.includes(key));
  if (unsupported.length > 0) errors.push(`${location} contains unsupported fields: ${unsupported.join(', ')}`);
  if (typeof entry.id !== 'string' || !GENERATED_ID_PATTERN.test(entry.id)) errors.push(`${location}/id is invalid`);
  if (typeof entry.label !== 'string' || entry.label.length < 1 || entry.label.length > MAX_LABEL_LENGTH) errors.push(`${location}/label is invalid`);
  if (!Array.isArray(entry.roles) || entry.roles.length < 1 || entry.roles.some((role) => !ROLE_SET.has(role))) errors.push(`${location}/roles is invalid`);
  if (Array.isArray(entry.roles) && new Set(entry.roles).size !== entry.roles.length) errors.push(`${location}/roles contains duplicates`);
  if (typeof entry.path !== 'string' || !GENERATED_PATH_PATTERN.test(entry.path)) errors.push(`${location}/path is invalid`);
  if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) errors.push(`${location}/sha256 is invalid`);
  if (!Number.isInteger(entry.width) || entry.width < 1 || entry.width > MAX_IMAGE_EDGE) errors.push(`${location}/width is invalid`);
  if (!Number.isInteger(entry.height) || entry.height < 1 || entry.height > MAX_IMAGE_EDGE) errors.push(`${location}/height is invalid`);
  if (typeof entry.createdAt !== 'string' || Number.isNaN(Date.parse(entry.createdAt))) errors.push(`${location}/createdAt is invalid`);

  if (typeof entry.path === 'string' && typeof entry.sha256 === 'string' && SHA256_PATTERN.test(entry.sha256)) {
    const shortHash = entry.sha256.slice(0, 12);
    if (!entry.path.endsWith(`-${shortHash}.png`)) errors.push(`${location}/path does not match its content hash`);
  }
};

export const assertValidGeneratedAssetManifest = (value) => {
  const errors = [];
  if (!isPlainObject(value)) {
    throw new ValidationError('Invalid generated asset manifest', ['manifest must be an object']);
  }
  const unsupported = Object.keys(value).filter((key) => !['schemaVersion', 'assets'].includes(key));
  if (unsupported.length > 0) errors.push(`manifest contains unsupported fields: ${unsupported.join(', ')}`);
  if (value.schemaVersion !== MANIFEST_SCHEMA_VERSION) errors.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  if (!Array.isArray(value.assets)) {
    errors.push('assets must be an array');
  } else {
    value.assets.forEach((entry, index) => validateManifestEntry(entry, index, errors));
    const ids = value.assets.map((entry) => entry?.id).filter((id) => typeof id === 'string');
    const paths = value.assets.map((entry) => entry?.path).filter((assetPath) => typeof assetPath === 'string');
    if (new Set(ids).size !== ids.length) errors.push('asset IDs must be unique');
    if (new Set(paths).size !== paths.length) errors.push('asset paths must be unique');
  }
  if (errors.length > 0) throw new ValidationError('Invalid generated asset manifest', errors);
};

const parsePng = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.length > MAX_SOURCE_BYTES) {
    throw new ValidationError('Invalid generated image', ['generated image must be a PNG within the local size limit']);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 29 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ValidationError('Invalid generated image', ['image-generation response is not a valid PNG']);
  }
  const declaredWidth = buffer.readUInt32BE(16);
  const declaredHeight = buffer.readUInt32BE(20);
  if (
    declaredWidth < 1
    || declaredHeight < 1
    || declaredWidth > MAX_IMAGE_EDGE
    || declaredHeight > MAX_IMAGE_EDGE
    || declaredWidth * declaredHeight > MAX_IMAGE_PIXELS
  ) {
    throw new ValidationError('Invalid generated image', ['generated PNG dimensions exceed the local safety limit']);
  }

  let image;
  try {
    image = PNG.sync.read(buffer, { checkCRC: true });
  } catch {
    throw new ValidationError('Invalid generated image', ['image-generation response is not a valid PNG']);
  }
  if (
    !Number.isInteger(image.width)
    || !Number.isInteger(image.height)
    || image.width < 1
    || image.height < 1
    || image.width > MAX_IMAGE_EDGE
    || image.height > MAX_IMAGE_EDGE
    || image.width * image.height > MAX_IMAGE_PIXELS
  ) {
    throw new ValidationError('Invalid generated image', ['generated PNG dimensions exceed the local safety limit']);
  }
  return image;
};

const smoothstep = (value) => {
  const normalized = Math.max(0, Math.min(1, value));
  return normalized * normalized * (3 - (2 * normalized));
};

/** Converts the model's flat magenta backdrop into an antialiased alpha matte. */
export const removeMagentaChroma = (sourcePng) => {
  const image = parsePng(sourcePng);
  const innerThreshold = 18;
  const outerThreshold = 125;
  let transparentPixels = 0;
  let visiblePixels = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const originalAlpha = image.data[offset + 3];
    const keyDistance = Math.hypot(255 - red, green, 255 - blue);
    const matte = smoothstep((keyDistance - innerThreshold) / (outerThreshold - innerThreshold));
    const alpha = Math.round(originalAlpha * matte);

    if (matte < 1) {
      const spill = Math.max(0, Math.min(red, blue) - green);
      const reduction = spill * (1 - matte) * 0.92;
      image.data[offset] = Math.max(0, Math.round(red - reduction));
      image.data[offset + 2] = Math.max(0, Math.round(blue - reduction));
    }
    image.data[offset + 3] = alpha;
    if (alpha <= 8) transparentPixels += 1;
    if (alpha >= 32) visiblePixels += 1;
  }

  const pixelCount = image.width * image.height;
  if (transparentPixels < Math.max(1, Math.floor(pixelCount * 0.005))) {
    throw new ValidationError('Background removal failed', ['generated image does not contain a removable flat #ff00ff background']);
  }
  if (visiblePixels < Math.max(1, Math.floor(pixelCount * 0.002))) {
    throw new ValidationError('Background removal failed', ['generated image does not contain a visible sprite subject']);
  }

  return {
    png: PNG.sync.write(image, { colorType: 6, inputColorType: 6 }),
    width: image.width,
    height: image.height,
    transparentPixels,
    visiblePixels
  };
};

const readJson = async (filePath, missingValue) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return missingValue;
    if (error instanceof SyntaxError) throw new ValidationError('Invalid generated asset manifest', ['generated-assets.json is not valid JSON']);
    throw error;
  }
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

const writeImmutable = async (filePath, buffer) => {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporaryPath, buffer, { flag: 'wx' });
  try {
    await rename(temporaryPath, filePath);
    return true;
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    const existing = await readFile(filePath).catch(() => null);
    if (!existing || !existing.equals(buffer)) throw error;
    return false;
  } finally {
    await rm(temporaryPath, { force: true });
  }
};

export class GeneratedAssetRepository {
  constructor({
    repositoryRoot,
    dataRoot = path.join(repositoryRoot, 'director-data'),
    clock = () => new Date()
  } = {}) {
    if (!repositoryRoot) throw new Error('Generated asset repository requires repositoryRoot');
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.dataRoot = resolveWithin(this.repositoryRoot, path.resolve(dataRoot));
    this.manifestFile = resolveWithin(this.repositoryRoot, 'game-config', 'generated-assets.json');
    this.assetRoot = resolveWithin(this.repositoryRoot, 'public', 'game-art', 'generated');
    this.metadataRoot = resolveWithin(this.dataRoot, 'generated-assets');
    this.clock = clock;
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await Promise.all([
      mkdir(path.dirname(this.manifestFile), { recursive: true }),
      mkdir(this.assetRoot, { recursive: true }),
      mkdir(this.metadataRoot, { recursive: true })
    ]);
  }

  async _readManifest() {
    const manifest = await readJson(this.manifestFile, { schemaVersion: MANIFEST_SCHEMA_VERSION, assets: [] });
    assertValidGeneratedAssetManifest(manifest);
    return manifest;
  }

  async listAssets() {
    await this.initialize();
    const manifest = await this._readManifest();
    return cloneJson(manifest.assets);
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

  async createAsset({ request, sourcePng, model, normalizedPrompt }) {
    const normalized = normalizeGeneratedAssetRequest(request);
    const converted = removeMagentaChroma(sourcePng);
    const digest = sha256(converted.png);
    const shortHash = digest.slice(0, 12);
    const roleToken = normalized.role.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const id = `GENERATED_${roleToken}_${shortHash.toUpperCase()}`;
    const filename = `${slugify(normalized.label, `${normalized.role}-sprite`)}-${shortHash}.png`;
    const publicPath = `/game-art/generated/${filename}`;
    const filePath = resolveWithin(this.assetRoot, filename);
    const metadataPath = resolveWithin(this.metadataRoot, `${id}.json`);
    const createdAt = this.clock().toISOString();
    const roles = SCORECARD_COMPANION_ROLES.has(normalized.role)
      ? [normalized.role, 'scorecard']
      : [normalized.role];
    const entry = {
      id,
      label: normalized.label,
      roles,
      path: publicPath,
      sha256: digest,
      width: converted.width,
      height: converted.height,
      createdAt
    };

    return this._withWriteLock(async () => {
      await this.initialize();
      const manifest = await this._readManifest();
      const idCollision = manifest.assets.find((asset) => asset.id === id && asset.sha256 !== entry.sha256);
      if (idCollision) {
        throw new ValidationError('Generated asset collision', ['generated asset ID is already registered with different content']);
      }
      const existing = manifest.assets.find((asset) => asset.id === id || (
        asset.sha256 === entry.sha256 && asset.roles.includes(normalized.role)
      ));
      if (existing) return { asset: cloneJson(existing), created: false };

      const collidingPath = manifest.assets.find((asset) => asset.path === publicPath);
      if (collidingPath) {
        throw new ValidationError('Generated asset collision', ['generated asset path is already registered with different content']);
      }

      let assetCreated = false;
      let metadataCreated = false;
      try {
        assetCreated = await writeImmutable(filePath, converted.png);
        await writeJsonAtomic(metadataPath, {
          schemaVersion: 1,
          kind: 'generated-asset-metadata',
          id,
          sourcePrompt: normalized.prompt,
          normalizedPrompt: typeof normalizedPrompt === 'string' ? normalizedPrompt : '',
          model: typeof model === 'string' ? model : 'unknown',
          createdAt,
          asset: entry
        });
        metadataCreated = true;
        const nextManifest = {
          schemaVersion: MANIFEST_SCHEMA_VERSION,
          assets: [...manifest.assets, entry]
        };
        assertValidGeneratedAssetManifest(nextManifest);
        await writeJsonAtomic(this.manifestFile, nextManifest);
      } catch (error) {
        if (assetCreated) await rm(filePath, { force: true });
        if (metadataCreated) await rm(metadataPath, { force: true });
        throw error;
      }

      return { asset: cloneJson(entry), created: true };
    });
  }
}
