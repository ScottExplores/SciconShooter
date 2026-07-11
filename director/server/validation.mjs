import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(serverDirectory, '..', 'schemas');
const CONFIG_KINDS = new Set(['scorecard', 'wave-campaign']);
const EPSILON = 1e-6;

const readSchema = (name) => JSON.parse(
  readFileSync(path.join(schemaDirectory, name), 'utf8')
);

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: false,
  strict: true
});

const validators = {
  scorecard: ajv.compile(readSchema('scorecard.schema.json')),
  'wave-campaign': ajv.compile(readSchema('wave-campaign.schema.json')),
  review: ajv.compile(readSchema('review.schema.json'))
};

export class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = Array.isArray(errors) ? errors : [String(errors)];
  }
}

const uniqueErrors = (errors) => [...new Set(errors)];

const formatSchemaErrors = (errors = []) => errors.map((error) => {
  const rawLocation = error.instancePath ?? error.dataPath ?? '';
  const location = rawLocation
    ? rawLocation.replace(/^\./, '/').replace(/\./g, '/').replace(/\[([0-9]+)\]/g, '/$1')
    : '/';
  return `${location} ${error.message}`;
});

const duplicateValues = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

const sumsToOne = (values) => (
  values.every((value) => Number.isFinite(value))
  && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= EPSILON
);

export const isConfigKind = (value) => CONFIG_KINDS.has(value);

export const assertConfigKind = (value) => {
  if (!isConfigKind(value)) {
    throw new ValidationError('Unsupported configuration kind', [
      `kind must be one of: ${[...CONFIG_KINDS].join(', ')}`
    ]);
  }
  return value;
};

export const isLocalGameAssetPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/game-art/')) return false;
  if (value.includes('\\') || value.includes('//') || value.includes('?') || value.includes('#')) return false;
  const parts = value.split('/');
  return !parts.some((part) => part === '.' || part === '..');
};

const crossValidateScorecard = (payload) => {
  const errors = [];
  if (!payload || typeof payload !== 'object') return errors;

  const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
  const metricKeys = metrics.map((metric) => metric?.key).filter(Boolean);
  const duplicateMetricKeys = duplicateValues(metricKeys);
  if (duplicateMetricKeys.length) {
    errors.push(`/metrics contains duplicate keys: ${duplicateMetricKeys.join(', ')}`);
  }
  for (const key of ['wave', 'targets', 'coins', 'flight']) {
    if (!metricKeys.includes(key)) errors.push(`/metrics is missing required key: ${key}`);
  }

  const encounters = Array.isArray(payload.encounters) ? payload.encounters : [];
  const duplicateEncounterIds = duplicateValues(encounters.map((encounter) => encounter?.id).filter(Boolean));
  if (duplicateEncounterIds.length) {
    errors.push(`/encounters contains duplicate ids: ${duplicateEncounterIds.join(', ')}`);
  }

  encounters.forEach((encounter, index) => {
    if (Number.isInteger(encounter?.maxWave) && encounter.maxWave < encounter.minWave) {
      errors.push(`/encounters/${index}/maxWave must be greater than or equal to minWave`);
    }
    if (!isLocalGameAssetPath(encounter?.assetPath)) {
      errors.push(`/encounters/${index}/assetPath must be a traversal-free /game-art asset path`);
    }
  });

  return errors;
};

const validateSegment = (segment, location, errors) => {
  if (!segment || typeof segment !== 'object') return;
  const weights = segment.enemyWeights;

  if (weights && !sumsToOne([weights.drone, weights.swarm, weights.brick, weights.journal])) {
    errors.push(`${location}/enemyWeights must sum to 1`);
  }

  if (segment.type === 'phase') {
    for (const property of ['formation', 'formationCount', 'spawnIntervalSeconds', 'enemyWeights']) {
      if (segment[property] === undefined) errors.push(`${location}/${property} is required for phase segments`);
    }
  }

  if (segment.type === 'mini-boss' && segment.bossType !== 'mini-boss') {
    errors.push(`${location}/bossType must be mini-boss for mini-boss segments`);
  }
  if (segment.type === 'asteroid-belt' && segment.bossType !== 'asteroid-belt') {
    errors.push(`${location}/bossType must be asteroid-belt for asteroid-belt segments`);
  }
  if (segment.type === 'boss' && !segment.bossType) {
    errors.push(`${location}/bossType is required for boss segments`);
  }
  if (segment.warningSeconds !== undefined && segment.warningSeconds > segment.durationSeconds) {
    errors.push(`${location}/warningSeconds cannot exceed durationSeconds`);
  }
};

const crossValidateWaveCampaign = (payload) => {
  const errors = [];
  if (!payload || typeof payload !== 'object') return errors;

  const backgrounds = Array.isArray(payload.backgrounds) ? payload.backgrounds : [];
  const backgroundIds = backgrounds.map((background) => background?.id).filter(Boolean);
  const duplicateBackgroundIds = duplicateValues(backgroundIds);
  if (duplicateBackgroundIds.length) {
    errors.push(`/backgrounds contains duplicate ids: ${duplicateBackgroundIds.join(', ')}`);
  }
  const backgroundIdSet = new Set(backgroundIds);

  backgrounds.forEach((background, backgroundIndex) => {
    (background?.layers || []).forEach((assetPath, layerIndex) => {
      if (!isLocalGameAssetPath(assetPath)) {
        errors.push(`/backgrounds/${backgroundIndex}/layers/${layerIndex} must be a traversal-free /game-art asset path`);
      }
    });
  });

  const waves = Array.isArray(payload.waves) ? payload.waves : [];
  const duplicateWaveIds = duplicateValues(waves.map((wave) => wave?.id).filter(Boolean));
  if (duplicateWaveIds.length) errors.push(`/waves contains duplicate ids: ${duplicateWaveIds.join(', ')}`);

  const allSegmentIds = [];
  waves.forEach((wave, waveIndex) => {
    if (wave?.backgroundId && !backgroundIdSet.has(wave.backgroundId)) {
      errors.push(`/waves/${waveIndex}/backgroundId references unknown background: ${wave.backgroundId}`);
    }

    const normalSegments = Array.isArray(wave?.segments) ? wave.segments : [];
    const betweenWaves = Array.isArray(wave?.betweenWaves) ? wave.betweenWaves : [];
    normalSegments.forEach((segment, segmentIndex) => {
      if (segment?.id) allSegmentIds.push(segment.id);
      validateSegment(segment, `/waves/${waveIndex}/segments/${segmentIndex}`, errors);
      if (['recovery', 'inter-wave'].includes(segment?.type)) {
        errors.push(`/waves/${waveIndex}/segments/${segmentIndex}/type belongs in betweenWaves`);
      }
    });
    betweenWaves.forEach((segment, segmentIndex) => {
      if (segment?.id) allSegmentIds.push(segment.id);
      validateSegment(segment, `/waves/${waveIndex}/betweenWaves/${segmentIndex}`, errors);
      if (!['recovery', 'inter-wave', 'mini-boss', 'asteroid-belt'].includes(segment?.type)) {
        errors.push(`/waves/${waveIndex}/betweenWaves/${segmentIndex}/type is not an inter-wave encounter type`);
      }
    });
  });

  const duplicateSegmentIds = duplicateValues(allSegmentIds);
  if (duplicateSegmentIds.length) {
    errors.push(`/waves contains duplicate segment ids: ${duplicateSegmentIds.join(', ')}`);
  }

  const powerups = Array.isArray(payload.powerups) ? payload.powerups : [];
  const duplicatePowerupIds = duplicateValues(powerups.map((powerup) => powerup?.id).filter(Boolean));
  if (duplicatePowerupIds.length) errors.push(`/powerups contains duplicate ids: ${duplicatePowerupIds.join(', ')}`);
  if (powerups.length && !sumsToOne(powerups.map((powerup) => powerup?.weight))) {
    errors.push('/powerups weights must sum to 1');
  }

  return errors;
};

export const validateConfig = (kind, payload) => {
  assertConfigKind(kind);
  const validate = validators[kind];
  const schemaValid = validate(payload);
  const errors = schemaValid ? [] : formatSchemaErrors(validate.errors);
  errors.push(...(kind === 'scorecard'
    ? crossValidateScorecard(payload)
    : crossValidateWaveCampaign(payload)));
  return { valid: errors.length === 0, errors: uniqueErrors(errors) };
};

export const assertValidConfig = (kind, payload) => {
  const result = validateConfig(kind, payload);
  if (!result.valid) throw new ValidationError(`Invalid ${kind} configuration`, result.errors);
  return payload;
};

export const validateReview = (review) => {
  const valid = validators.review(review);
  const errors = valid ? [] : formatSchemaErrors(validators.review.errors);
  if (review?.status === 'resolved' && !review?.resolvedAt) {
    errors.push('/resolvedAt is required when status is resolved');
  }
  if (review?.status === 'open' && review?.resolvedAt !== undefined) {
    errors.push('/resolvedAt must be omitted when status is open');
  }
  if (review?.context?.source === 'level-editor') {
    if (review.surface !== 'wave') errors.push('/surface must be wave for level-editor review context');
    if (review.context.draft && review.context.draftContentHash === undefined) {
      errors.push('/context/draftContentHash is required when draft is true');
    }
    if (!review.context.draft && review.context.draftContentHash !== undefined) {
      errors.push('/context/draftContentHash must be omitted when draft is false');
    }
    const eventFields = ['eventId', 'eventLabel', 'eventKind'];
    const presentEventFields = eventFields.filter((field) => review.context[field] !== undefined);
    if (presentEventFields.length > 0 && presentEventFields.length !== eventFields.length) {
      errors.push('/context eventId, eventLabel, and eventKind must be provided together');
    }
  }
  return { valid: errors.length === 0, errors: uniqueErrors(errors) };
};

export const assertValidReview = (review) => {
  const result = validateReview(review);
  if (!result.valid) throw new ValidationError('Invalid review request', result.errors);
  return review;
};
