import { ValidationError } from './validation.mjs';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const EPSILON = 1e-6;

const ASSET_KEYS = new Set([
  'PLAYER_SHIP', 'RSC_TOKEN', 'REAL_RSC_ICON', 'GAME_BG_BACK', 'GAME_BG_STARS',
  'GAME_BG_PLANET', 'GAME_PARALLAX_BACK', 'GAME_PARALLAX_STARS',
  'GAME_PARALLAX_FAR_PLANETS', 'GAME_PARALLAX_BIG_PLANET', 'GAME_PARALLAX_RING_PLANET',
  'ENEMY_DRONE_FRAMES', 'ENEMY_SWARM_FRAMES', 'ENEMY_BRICK_FRAMES', 'ENEMY_JOURNAL',
  'MINI_BOSS', 'WALL_BOSS_SEGMENT', 'FINAL_BOSS'
]);
const ENEMY_SPRITE_KEYS = new Set([
  'ENEMY_DRONE_FRAMES', 'ENEMY_SWARM_FRAMES', 'ENEMY_BRICK_FRAMES', 'ENEMY_JOURNAL'
]);
const BOSS_SPRITE_KEYS = new Set(['MINI_BOSS', 'WALL_BOSS_SEGMENT', 'FINAL_BOSS']);
const ASTEROID_SPRITE_KEYS = new Set(['ENEMY_BRICK_FRAMES']);
const ENEMY_IDS = new Set(['drone', 'swarm', 'brick', 'journal']);
const BOSS_IDS = new Set(['bottleneck-drone', 'paywall-wall', 'gatekeeper']);
const POWERUP_IDS = new Set(['double-shot', 'triple-shot', 'magnet', 'shield', 'research-beam', 'extra-life']);
const BACKGROUND_IDS = new Set(['open-orbit', 'citation-storm', 'paywall-siege', 'open-galaxy']);
const MUSIC_IDS = new Set(['procedural-main']);
const SPAWN_PATTERNS = new Set(['single-random', 'row', 'v', 'sine', 'pincer', 'asteroid-lanes']);
const SPAWN_POSITIONS = new Set(['random-top', 'formation-top', 'center-top', 'lane-top']);
const MOVEMENT_PATTERNS = new Set(['drift-down', 'sine-drift', 'track-player', 'wall-march', 'asteroid-drift', 'gatekeeper-cycle']);
const WEAPON_IDS = new Set(['aimed-shot', 'wall-bolt', 'burst-volley', 'lane-beam']);
const SCORECARD_METRICS = new Set(['wave', 'targets', 'coins', 'flight']);
const EVENT_KINDS = new Set(['spawn', 'boss', 'asteroid-belt', 'powerup', 'recovery']);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value, maximum = 240) => (
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
);

const requireObject = (value, location, errors) => {
  if (!isPlainObject(value)) {
    errors.push(`${location} must be an object`);
    return false;
  }
  return true;
};

const allowedKeys = (value, allowed, location, errors) => {
  if (!isPlainObject(value)) return;
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) errors.push(`${location} contains unsupported fields: ${unsupported.join(', ')}`);
};

const requireId = (value, location, errors) => {
  if (!isNonEmptyString(value, 80) || !ID_PATTERN.test(value)) {
    errors.push(`${location} must be a lowercase kebab-case ID`);
  }
};

const requireString = (value, location, errors, maximum = 240) => {
  if (!isNonEmptyString(value, maximum)) errors.push(`${location} must be a non-empty string`);
};

const requireEnum = (value, values, location, errors) => {
  if (!values.has(value)) errors.push(`${location} has unsupported value: ${String(value)}`);
};

const requireNumber = (value, location, errors, { minimum = -Infinity, maximum = Infinity, integer = false } = {}) => {
  if (!isFiniteNumber(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    errors.push(`${location} must be a${integer ? 'n integer' : ' number'} between ${minimum} and ${maximum}`);
  }
};

const validateUniqueEnumArray = (values, allowed, location, errors, { minimumItems = 0 } = {}) => {
  if (!Array.isArray(values) || values.length < minimumItems) {
    errors.push(`${location} must be an array with at least ${minimumItems} item(s)`);
    return;
  }
  const seen = new Set();
  values.forEach((value, index) => {
    requireEnum(value, allowed, `${location}/${index}`, errors);
    if (seen.has(value)) errors.push(`${location} contains duplicate value: ${String(value)}`);
    seen.add(value);
  });
};

const validateSpawnAnchor = (anchor, location, errors) => {
  if (anchor === undefined) return;
  if (!requireObject(anchor, location, errors)) return;
  allowedKeys(anchor, ['x', 'y'], location, errors);
  requireNumber(anchor.x, `${location}/x`, errors, { minimum: 0, maximum: 1 });
  requireNumber(anchor.y, `${location}/y`, errors, { minimum: 0, maximum: 1 });
};

const validateSpriteStyle = (style, location, errors) => {
  if (style === undefined) return;
  if (!requireObject(style, location, errors)) return;
  allowedKeys(style, [
    'scale',
    'rotationDegrees',
    'flipX',
    'opacity',
    'hueRotateDegrees',
    'saturation',
    'brightness',
    'glowColor',
    'glowBlur'
  ], location, errors);
  if (Object.hasOwn(style, 'scale')) requireNumber(style.scale, `${location}/scale`, errors, { minimum: 0.25, maximum: 3 });
  if (Object.hasOwn(style, 'rotationDegrees')) requireNumber(style.rotationDegrees, `${location}/rotationDegrees`, errors, { minimum: -180, maximum: 180 });
  if (Object.hasOwn(style, 'flipX') && typeof style.flipX !== 'boolean') errors.push(`${location}/flipX must be a boolean`);
  if (Object.hasOwn(style, 'opacity')) requireNumber(style.opacity, `${location}/opacity`, errors, { minimum: 0.1, maximum: 1 });
  if (Object.hasOwn(style, 'hueRotateDegrees')) requireNumber(style.hueRotateDegrees, `${location}/hueRotateDegrees`, errors, { minimum: -180, maximum: 180 });
  if (Object.hasOwn(style, 'saturation')) requireNumber(style.saturation, `${location}/saturation`, errors, { minimum: 0, maximum: 2 });
  if (Object.hasOwn(style, 'brightness')) requireNumber(style.brightness, `${location}/brightness`, errors, { minimum: 0.25, maximum: 2 });
  if (Object.hasOwn(style, 'glowColor') && (typeof style.glowColor !== 'string' || !HEX_COLOR_PATTERN.test(style.glowColor))) {
    errors.push(`${location}/glowColor must be a six-digit hexadecimal color`);
  }
  if (Object.hasOwn(style, 'glowBlur')) requireNumber(style.glowBlur, `${location}/glowBlur`, errors, { minimum: 0, maximum: 40 });
};

const validateRecordCardRegion = (region, location, errors) => {
  if (!requireObject(region, location, errors)) return;
  allowedKeys(region, ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible'], location, errors);
  requireNumber(region.x, `${location}/x`, errors, { minimum: 0, maximum: 1200 });
  requireNumber(region.y, `${location}/y`, errors, { minimum: 0, maximum: 1200 });
  requireNumber(region.width, `${location}/width`, errors, { minimum: 1, maximum: 1200 });
  requireNumber(region.height, `${location}/height`, errors, { minimum: 1, maximum: 1200 });
  requireNumber(region.rotation, `${location}/rotation`, errors, { minimum: -180, maximum: 180 });
  requireNumber(region.opacity, `${location}/opacity`, errors, { minimum: 0, maximum: 1 });
  if (typeof region.visible !== 'boolean') errors.push(`${location}/visible must be a boolean`);
  if (isFiniteNumber(region.x) && isFiniteNumber(region.width) && region.x + region.width > 1200) errors.push(`${location} must fit inside the 1200px card width`);
  if (isFiniteNumber(region.y) && isFiniteNumber(region.height) && region.y + region.height > 1200) errors.push(`${location} must fit inside the 1200px card height`);
};

const validateRecordCard = (recordCard, location, errors) => {
  // Optional only so immutable pre-card schema-v1 revisions can still be rolled back.
  if (recordCard === undefined) return;
  if (!requireObject(recordCard, location, errors)) return;
  allowedKeys(recordCard, ['copy', 'colors', 'showGrid', 'shipAssetKey', 'encounterAssetKey', 'art'], location, errors);
  if (requireObject(recordCard.copy, `${location}/copy`, errors)) {
    allowedKeys(recordCard.copy, ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'verifiedLabel', 'reviewLabel', 'metricLabels'], `${location}/copy`, errors);
    ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'verifiedLabel', 'reviewLabel'].forEach((key) => requireString(recordCard.copy[key], `${location}/copy/${key}`, errors, 80));
    if (requireObject(recordCard.copy.metricLabels, `${location}/copy/metricLabels`, errors)) {
      allowedKeys(recordCard.copy.metricLabels, ['wave', 'targets', 'coins', 'flight'], `${location}/copy/metricLabels`, errors);
      ['wave', 'targets', 'coins', 'flight'].forEach((key) => requireString(recordCard.copy.metricLabels[key], `${location}/copy/metricLabels/${key}`, errors, 40));
    }
  }
  if (requireObject(recordCard.colors, `${location}/colors`, errors)) {
    const colorKeys = ['background', 'panel', 'primary', 'secondary', 'success', 'warning', 'text', 'muted'];
    allowedKeys(recordCard.colors, colorKeys, `${location}/colors`, errors);
    colorKeys.forEach((key) => {
      if (typeof recordCard.colors[key] !== 'string' || !HEX_COLOR_PATTERN.test(recordCard.colors[key])) errors.push(`${location}/colors/${key} must be a six-digit hex color`);
    });
  }
  if (typeof recordCard.showGrid !== 'boolean') errors.push(`${location}/showGrid must be a boolean`);
  requireEnum(recordCard.shipAssetKey, ASSET_KEYS, `${location}/shipAssetKey`, errors);
  requireEnum(recordCard.encounterAssetKey, new Set(['AUTO', ...ASSET_KEYS]), `${location}/encounterAssetKey`, errors);
  if (requireObject(recordCard.art, `${location}/art`, errors)) {
    allowedKeys(recordCard.art, ['ship', 'encounter'], `${location}/art`, errors);
    validateRecordCardRegion(recordCard.art.ship, `${location}/art/ship`, errors);
    validateRecordCardRegion(recordCard.art.encounter, `${location}/art/encounter`, errors);
  }
};

const validateScorecard = (scorecard, location, errors) => {
  if (!requireObject(scorecard, location, errors)) return;
  allowedKeys(scorecard, ['trigger', 'title', 'subtitle', 'scoreLabel', 'metrics', 'showEncounterArt', 'encounterAssetKey'], location, errors);
  requireEnum(scorecard.trigger, new Set(['mission-end', 'level-complete']), `${location}/trigger`, errors);
  requireString(scorecard.title, `${location}/title`, errors, 120);
  requireString(scorecard.subtitle, `${location}/subtitle`, errors, 200);
  requireString(scorecard.scoreLabel, `${location}/scoreLabel`, errors, 80);
  validateUniqueEnumArray(scorecard.metrics, SCORECARD_METRICS, `${location}/metrics`, errors, { minimumItems: 1 });
  if (typeof scorecard.showEncounterArt !== 'boolean') errors.push(`${location}/showEncounterArt must be a boolean`);
  requireEnum(scorecard.encounterAssetKey, ASSET_KEYS, `${location}/encounterAssetKey`, errors);
};

const validateBaseEvent = (event, location, waveDuration, errors) => {
  requireId(event.id, `${location}/id`, errors);
  requireString(event.label, `${location}/label`, errors, 120);
  requireNumber(event.startSeconds, `${location}/startSeconds`, errors, { minimum: 0, maximum: waveDuration });
  requireNumber(event.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 0.01, maximum: 86400 });
  requireNumber(event.delayAfterSeconds, `${location}/delayAfterSeconds`, errors, { minimum: 0, maximum: 3600 });
  if (typeof event.blocksWaveClock !== 'boolean') errors.push(`${location}/blocksWaveClock must be a boolean`);
  validateSpawnAnchor(event.spawnAnchor, `${location}/spawnAnchor`, errors);
};

const validateSpawnEnemy = (enemy, location, errors) => {
  if (!requireObject(enemy, location, errors)) return;
  allowedKeys(enemy, ['enemyId', 'spriteKey', 'spriteStyle', 'weight', 'health', 'speed', 'damage', 'scoreValue', 'powerupDropChance'], location, errors);
  requireEnum(enemy.enemyId, ENEMY_IDS, `${location}/enemyId`, errors);
  requireEnum(enemy.spriteKey, ENEMY_SPRITE_KEYS, `${location}/spriteKey`, errors);
  validateSpriteStyle(enemy.spriteStyle, `${location}/spriteStyle`, errors);
  requireNumber(enemy.weight, `${location}/weight`, errors, { minimum: 0, maximum: 1 });
  requireNumber(enemy.health, `${location}/health`, errors, { minimum: 0.01, maximum: 100000000 });
  requireNumber(enemy.speed, `${location}/speed`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(enemy.damage, `${location}/damage`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(enemy.scoreValue, `${location}/scoreValue`, errors, { minimum: 0, maximum: 100000000 });
  requireNumber(enemy.powerupDropChance, `${location}/powerupDropChance`, errors, { minimum: 0, maximum: 1 });
};

const validateSpawnEvent = (event, location, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'count', 'patternId', 'positionId', 'spawnIntervalSeconds', 'enemies'], location, errors);
  requireNumber(event.count, `${location}/count`, errors, { minimum: 1, maximum: 10000, integer: true });
  requireEnum(event.patternId, SPAWN_PATTERNS, `${location}/patternId`, errors);
  requireEnum(event.positionId, SPAWN_POSITIONS, `${location}/positionId`, errors);
  requireNumber(event.spawnIntervalSeconds, `${location}/spawnIntervalSeconds`, errors, { minimum: 0.01, maximum: 3600 });
  if (!Array.isArray(event.enemies) || event.enemies.length === 0) {
    errors.push(`${location}/enemies must be a non-empty array`);
    return;
  }
  const enemyIds = new Set();
  event.enemies.forEach((enemy, index) => {
    validateSpawnEnemy(enemy, `${location}/enemies/${index}`, errors);
    if (enemyIds.has(enemy?.enemyId)) errors.push(`${location}/enemies contains duplicate enemyId: ${String(enemy?.enemyId)}`);
    enemyIds.add(enemy?.enemyId);
  });
  const weights = event.enemies.map((enemy) => enemy?.weight);
  if (weights.every(isFiniteNumber) && Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > EPSILON) {
    errors.push(`${location}/enemies weights must sum to 1`);
  }
};

const validateBossWeapon = (weapon, location, errors) => {
  if (!requireObject(weapon, location, errors)) return;
  allowedKeys(weapon, ['id', 'weaponId', 'attackIntervalSeconds', 'damage', 'projectileSpeed', 'burstCount'], location, errors);
  requireId(weapon.id, `${location}/id`, errors);
  requireEnum(weapon.weaponId, WEAPON_IDS, `${location}/weaponId`, errors);
  requireNumber(weapon.attackIntervalSeconds, `${location}/attackIntervalSeconds`, errors, { minimum: 0.01, maximum: 3600 });
  requireNumber(weapon.damage, `${location}/damage`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(weapon.projectileSpeed, `${location}/projectileSpeed`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(weapon.burstCount, `${location}/burstCount`, errors, { minimum: 1, maximum: 1000, integer: true });
};

const validateBossPhase = (phase, location, weaponIds, previousRatio, errors) => {
  if (!requireObject(phase, location, errors)) return previousRatio;
  allowedKeys(phase, ['id', 'label', 'triggerHealthRatio', 'movementPatternId', 'speedMultiplier', 'weaponSettingIds'], location, errors);
  requireId(phase.id, `${location}/id`, errors);
  requireString(phase.label, `${location}/label`, errors, 120);
  requireNumber(phase.triggerHealthRatio, `${location}/triggerHealthRatio`, errors, { minimum: 0, maximum: 1 });
  if (isFiniteNumber(previousRatio) && isFiniteNumber(phase.triggerHealthRatio) && phase.triggerHealthRatio >= previousRatio) {
    errors.push(`${location}/triggerHealthRatio must be strictly lower than the previous phase`);
  }
  requireEnum(phase.movementPatternId, MOVEMENT_PATTERNS, `${location}/movementPatternId`, errors);
  requireNumber(phase.speedMultiplier, `${location}/speedMultiplier`, errors, { minimum: 0.01, maximum: 1000 });
  if (!Array.isArray(phase.weaponSettingIds) || phase.weaponSettingIds.length === 0) {
    errors.push(`${location}/weaponSettingIds must be a non-empty array`);
  } else {
    const seen = new Set();
    phase.weaponSettingIds.forEach((id, index) => {
      requireId(id, `${location}/weaponSettingIds/${index}`, errors);
      if (!weaponIds.has(id)) errors.push(`${location}/weaponSettingIds/${index} references unknown weapon setting: ${String(id)}`);
      if (seen.has(id)) errors.push(`${location}/weaponSettingIds contains duplicate value: ${String(id)}`);
      seen.add(id);
    });
  }
  return phase.triggerHealthRatio;
};

const validateBossEvent = (event, location, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'bossId', 'spriteKey', 'spriteStyle', 'positionId', 'movementPatternId', 'warningSeconds', 'health', 'speed', 'damage', 'scoreReward', 'powerupDropChance', 'shieldCount', 'weapons', 'phases'], location, errors);
  requireEnum(event.bossId, BOSS_IDS, `${location}/bossId`, errors);
  requireEnum(event.spriteKey, BOSS_SPRITE_KEYS, `${location}/spriteKey`, errors);
  validateSpriteStyle(event.spriteStyle, `${location}/spriteStyle`, errors);
  requireEnum(event.positionId, SPAWN_POSITIONS, `${location}/positionId`, errors);
  requireEnum(event.movementPatternId, MOVEMENT_PATTERNS, `${location}/movementPatternId`, errors);
  requireNumber(event.warningSeconds, `${location}/warningSeconds`, errors, { minimum: 0, maximum: 300 });
  requireNumber(event.health, `${location}/health`, errors, { minimum: 0.01, maximum: 100000000 });
  requireNumber(event.speed, `${location}/speed`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(event.damage, `${location}/damage`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(event.scoreReward, `${location}/scoreReward`, errors, { minimum: 0, maximum: 100000000 });
  requireNumber(event.powerupDropChance, `${location}/powerupDropChance`, errors, { minimum: 0, maximum: 1 });
  requireNumber(event.shieldCount, `${location}/shieldCount`, errors, { minimum: 0, maximum: 1000, integer: true });

  if (!Array.isArray(event.weapons) || event.weapons.length === 0) {
    errors.push(`${location}/weapons must be a non-empty array`);
    return;
  }
  const weaponIds = new Set();
  event.weapons.forEach((weapon, index) => {
    validateBossWeapon(weapon, `${location}/weapons/${index}`, errors);
    if (weaponIds.has(weapon?.id)) errors.push(`${location}/weapons contains duplicate id: ${String(weapon?.id)}`);
    weaponIds.add(weapon?.id);
  });
  if (!Array.isArray(event.phases) || event.phases.length === 0) {
    errors.push(`${location}/phases must be a non-empty array`);
    return;
  }
  let previousRatio = Infinity;
  event.phases.forEach((phase, index) => {
    previousRatio = validateBossPhase(phase, `${location}/phases/${index}`, weaponIds, previousRatio, errors);
  });
  if (isFiniteNumber(event.phases[0]?.triggerHealthRatio) && Math.abs(event.phases[0].triggerHealthRatio - 1) > EPSILON) {
    errors.push(`${location}/phases/0/triggerHealthRatio must be 1`);
  }
};

const validateAsteroidEvent = (event, location, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'spriteKey', 'spriteStyle', 'count', 'density', 'patternId', 'positionId', 'spawnIntervalSeconds', 'warningSeconds', 'health', 'speed', 'damage', 'scoreValue', 'powerupDropChance'], location, errors);
  requireEnum(event.spriteKey, ASTEROID_SPRITE_KEYS, `${location}/spriteKey`, errors);
  validateSpriteStyle(event.spriteStyle, `${location}/spriteStyle`, errors);
  requireNumber(event.count, `${location}/count`, errors, { minimum: 1, maximum: 10000, integer: true });
  requireNumber(event.density, `${location}/density`, errors, { minimum: 0, maximum: 1 });
  requireEnum(event.patternId, SPAWN_PATTERNS, `${location}/patternId`, errors);
  requireEnum(event.positionId, SPAWN_POSITIONS, `${location}/positionId`, errors);
  requireNumber(event.spawnIntervalSeconds, `${location}/spawnIntervalSeconds`, errors, { minimum: 0.01, maximum: 3600 });
  requireNumber(event.warningSeconds, `${location}/warningSeconds`, errors, { minimum: 0, maximum: 300 });
  requireNumber(event.health, `${location}/health`, errors, { minimum: 0.01, maximum: 100000000 });
  requireNumber(event.speed, `${location}/speed`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(event.damage, `${location}/damage`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(event.scoreValue, `${location}/scoreValue`, errors, { minimum: 0, maximum: 100000000 });
  requireNumber(event.powerupDropChance, `${location}/powerupDropChance`, errors, { minimum: 0, maximum: 1 });
};

const validatePowerupEvent = (event, location, availablePowerups, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'positionId', 'spawnIntervalSeconds', 'powerupIds'], location, errors);
  requireEnum(event.positionId, SPAWN_POSITIONS, `${location}/positionId`, errors);
  requireNumber(event.spawnIntervalSeconds, `${location}/spawnIntervalSeconds`, errors, { minimum: 0.01, maximum: 3600 });
  validateUniqueEnumArray(event.powerupIds, POWERUP_IDS, `${location}/powerupIds`, errors, { minimumItems: 1 });
  (event.powerupIds || []).forEach((id, index) => {
    if (!availablePowerups.has(id)) errors.push(`${location}/powerupIds/${index} is not available in the owning level`);
  });
};

const validateRecoveryEvent = (event, location, availablePowerups, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'positionId', 'coinCount', 'powerupIds'], location, errors);
  requireEnum(event.positionId, SPAWN_POSITIONS, `${location}/positionId`, errors);
  requireNumber(event.coinCount, `${location}/coinCount`, errors, { minimum: 0, maximum: 10000, integer: true });
  validateUniqueEnumArray(event.powerupIds, POWERUP_IDS, `${location}/powerupIds`, errors);
  (event.powerupIds || []).forEach((id, index) => {
    if (!availablePowerups.has(id)) errors.push(`${location}/powerupIds/${index} is not available in the owning level`);
  });
};

const validateEvent = (event, location, waveDuration, availablePowerups, errors) => {
  if (!requireObject(event, location, errors)) return;
  validateBaseEvent(event, location, waveDuration, errors);
  requireEnum(event.kind, EVENT_KINDS, `${location}/kind`, errors);
  if (event.kind === 'spawn') validateSpawnEvent(event, location, errors);
  else if (event.kind === 'boss') validateBossEvent(event, location, errors);
  else if (event.kind === 'asteroid-belt') validateAsteroidEvent(event, location, errors);
  else if (event.kind === 'powerup') validatePowerupEvent(event, location, availablePowerups, errors);
  else if (event.kind === 'recovery') validateRecoveryEvent(event, location, availablePowerups, errors);
};

const validateWave = (wave, location, availablePowerups, errors) => {
  if (!requireObject(wave, location, errors)) return;
  allowedKeys(wave, ['id', 'name', 'order', 'accent', 'backgroundId', 'difficultyMultiplier', 'durationSeconds', 'introSeconds', 'delayAfterSeconds', 'scoreMultiplier', 'threatCap', 'events'], location, errors);
  requireId(wave.id, `${location}/id`, errors);
  requireString(wave.name, `${location}/name`, errors, 120);
  requireNumber(wave.order, `${location}/order`, errors, { minimum: 1, maximum: 10000, integer: true });
  if (typeof wave.accent !== 'string' || !HEX_COLOR_PATTERN.test(wave.accent)) errors.push(`${location}/accent must be a six-digit hex color`);
  requireEnum(wave.backgroundId, BACKGROUND_IDS, `${location}/backgroundId`, errors);
  requireNumber(wave.difficultyMultiplier, `${location}/difficultyMultiplier`, errors, { minimum: 0.01, maximum: 1000 });
  requireNumber(wave.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 0.01, maximum: 86400 });
  requireNumber(wave.introSeconds, `${location}/introSeconds`, errors, { minimum: 0, maximum: 3600 });
  requireNumber(wave.delayAfterSeconds, `${location}/delayAfterSeconds`, errors, { minimum: 0, maximum: 3600 });
  requireNumber(wave.scoreMultiplier, `${location}/scoreMultiplier`, errors, { minimum: 0, maximum: 1000000 });
  requireNumber(wave.threatCap, `${location}/threatCap`, errors, { minimum: 1, maximum: 10000, integer: true });
  if (!Array.isArray(wave.events) || wave.events.length === 0) {
    errors.push(`${location}/events must be a non-empty array`);
    return;
  }
  const eventIds = new Set();
  let previousStart = -Infinity;
  wave.events.forEach((event, index) => {
    validateEvent(event, `${location}/events/${index}`, wave.durationSeconds, availablePowerups, errors);
    if (eventIds.has(event?.id)) errors.push(`${location}/events contains duplicate id: ${String(event?.id)}`);
    eventIds.add(event?.id);
    if (isFiniteNumber(event?.startSeconds) && event.startSeconds < previousStart) {
      errors.push(`${location}/events must be ordered by startSeconds`);
    }
    if (isFiniteNumber(event?.startSeconds)) previousStart = event.startSeconds;
  });
};

const validateLevel = (level, location, errors) => {
  if (!requireObject(level, location, errors)) return;
  allowedKeys(level, ['id', 'name', 'description', 'order', 'backgroundId', 'musicId', 'startingDifficulty', 'scoreTarget', 'durationSeconds', 'loopWaves', 'availablePowerupIds', 'scorecard', 'waves'], location, errors);
  requireId(level.id, `${location}/id`, errors);
  requireString(level.name, `${location}/name`, errors, 120);
  if (typeof level.description !== 'string' || level.description.length > 1000) errors.push(`${location}/description must be a string of 1000 characters or fewer`);
  requireNumber(level.order, `${location}/order`, errors, { minimum: 1, maximum: 10000, integer: true });
  requireEnum(level.backgroundId, BACKGROUND_IDS, `${location}/backgroundId`, errors);
  requireEnum(level.musicId, MUSIC_IDS, `${location}/musicId`, errors);
  requireNumber(level.startingDifficulty, `${location}/startingDifficulty`, errors, { minimum: 0.01, maximum: 1000 });
  requireNumber(level.scoreTarget, `${location}/scoreTarget`, errors, { minimum: 0, maximum: 1000000000 });
  if (level.durationSeconds !== null) requireNumber(level.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 0.01, maximum: 604800 });
  if (typeof level.loopWaves !== 'boolean') errors.push(`${location}/loopWaves must be a boolean`);
  validateUniqueEnumArray(level.availablePowerupIds, POWERUP_IDS, `${location}/availablePowerupIds`, errors, { minimumItems: 1 });
  validateScorecard(level.scorecard, `${location}/scorecard`, errors);
  if (!Array.isArray(level.waves) || level.waves.length === 0) {
    errors.push(`${location}/waves must be a non-empty array`);
    return;
  }
  const availablePowerups = new Set(level.availablePowerupIds || []);
  const waveIds = new Set();
  const waveOrders = new Set();
  level.waves.forEach((wave, index) => {
    validateWave(wave, `${location}/waves/${index}`, availablePowerups, errors);
    if (waveIds.has(wave?.id)) errors.push(`${location}/waves contains duplicate id: ${String(wave?.id)}`);
    if (waveOrders.has(wave?.order)) errors.push(`${location}/waves contains duplicate order: ${String(wave?.order)}`);
    waveIds.add(wave?.id);
    waveOrders.add(wave?.order);
  });
};

export const validateGameCampaign = (campaign) => {
  const errors = [];
  if (!requireObject(campaign, '/', errors)) return { valid: false, errors };
  allowedKeys(campaign, ['schemaVersion', 'revision', 'id', 'name', 'updatedAt', 'fps', 'recordCard', 'levels'], '/', errors);
  if (campaign.schemaVersion !== 1) errors.push('/schemaVersion must be 1');
  requireNumber(campaign.revision, '/revision', errors, { minimum: 1, maximum: 1000000000, integer: true });
  requireId(campaign.id, '/id', errors);
  requireString(campaign.name, '/name', errors, 120);
  if (typeof campaign.updatedAt !== 'string' || !Number.isFinite(Date.parse(campaign.updatedAt))) errors.push('/updatedAt must be an ISO date-time string');
  if (campaign.fps !== 60) errors.push('/fps must be 60');
  validateRecordCard(campaign.recordCard, '/recordCard', errors);
  if (!Array.isArray(campaign.levels) || campaign.levels.length === 0) {
    errors.push('/levels must be a non-empty array');
    return { valid: false, errors: [...new Set(errors)] };
  }
  const levelIds = new Set();
  const levelOrders = new Set();
  campaign.levels.forEach((level, index) => {
    validateLevel(level, `/levels/${index}`, errors);
    if (levelIds.has(level?.id)) errors.push(`/levels contains duplicate id: ${String(level?.id)}`);
    if (levelOrders.has(level?.order)) errors.push(`/levels contains duplicate order: ${String(level?.order)}`);
    levelIds.add(level?.id);
    levelOrders.add(level?.order);
  });
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
};

export const assertValidGameCampaign = (campaign, message = 'Invalid game campaign configuration') => {
  const result = validateGameCampaign(campaign);
  if (!result.valid) throw new ValidationError(message, result.errors);
  return campaign;
};
