import {
  ASSET_CATALOG,
  BACKGROUND_CATALOG,
  BOSS_CATALOG,
  ENEMY_CATALOG,
  MOVEMENT_PATTERN_CATALOG,
  MUSIC_CATALOG,
  POWERUP_CATALOG,
  SPAWN_PATTERN_CATALOG,
  SPAWN_POSITION_CATALOG,
  WEAPON_CATALOG,
  isAssetAllowedForRole
} from './catalog';
import type {
  BossEvent,
  GameCampaignConfig,
  LevelDefinition,
  WaveDefinition,
  WaveEvent
} from './types';

export interface CampaignValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface CampaignValidationResult {
  valid: boolean;
  issues: CampaignValidationIssue[];
}

export class CampaignValidationError extends Error {
  readonly issues: CampaignValidationIssue[];

  constructor(issues: CampaignValidationIssue[]) {
    super(`Invalid game campaign (${issues.length} issue${issues.length === 1 ? '' : 's'})`);
    this.name = 'CampaignValidationError';
    this.issues = issues;
  }
}

type UnknownRecord = Record<string, unknown>;

const CAMPAIGN_KEYS = ['schemaVersion', 'revision', 'id', 'name', 'updatedAt', 'fps', 'recordCard', 'hudAssets', 'levels'];
const HUD_ASSET_KEYS = ['bombIconAssetKey'];
const LEVEL_KEYS = ['id', 'name', 'description', 'order', 'backgroundId', 'musicId', 'startingDifficulty', 'scoreTarget', 'durationSeconds', 'loopWaves', 'availablePowerupIds', 'scorecard', 'waves'];
const SCORECARD_KEYS = ['trigger', 'title', 'subtitle', 'scoreLabel', 'metrics', 'showEncounterArt', 'encounterAssetKey'];
const RECORD_CARD_KEYS = ['copy', 'colors', 'showGrid', 'shipAssetKey', 'encounterAssetKey', 'art'];
const RECORD_CARD_COPY_KEYS = ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'verifiedLabel', 'reviewLabel', 'metricLabels'];
const RECORD_CARD_METRIC_LABEL_KEYS = ['wave', 'targets', 'coins', 'flight'];
const RECORD_CARD_COLOR_KEYS = ['background', 'panel', 'primary', 'secondary', 'success', 'warning', 'text', 'muted'];
const RECORD_CARD_ART_KEYS = ['ship', 'encounter'];
const RECORD_CARD_REGION_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible'];
const WAVE_KEYS = ['id', 'name', 'order', 'accent', 'backgroundId', 'difficultyMultiplier', 'durationSeconds', 'introSeconds', 'delayAfterSeconds', 'scoreMultiplier', 'threatCap', 'events'];
const BASE_EVENT_KEYS = ['id', 'kind', 'label', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor'];
const EVENT_KEYS: Record<string, string[]> = {
  spawn: [...BASE_EVENT_KEYS, 'count', 'patternId', 'positionId', 'spawnIntervalSeconds', 'enemies'],
  boss: [...BASE_EVENT_KEYS, 'bossId', 'count', 'spriteKey', 'spriteStyle', 'positionId', 'movementPatternId', 'warningSeconds', 'health', 'speed', 'damage', 'scoreReward', 'powerupDropChance', 'shieldCount', 'sizeMultiplier', 'weapons', 'phases'],
  'asteroid-belt': [...BASE_EVENT_KEYS, 'spriteKey', 'spriteStyle', 'count', 'density', 'patternId', 'positionId', 'spawnIntervalSeconds', 'warningSeconds', 'health', 'speed', 'damage', 'scoreValue', 'powerupDropChance'],
  powerup: [...BASE_EVENT_KEYS, 'positionId', 'spawnIntervalSeconds', 'powerupIds'],
  recovery: [...BASE_EVENT_KEYS, 'positionId', 'coinCount', 'powerupIds']
};
const SPAWN_ENEMY_KEYS = [
  'enemyId',
  'spriteKey',
  'spriteStyle',
  'weight',
  'health',
  'speed',
  'damage',
  'scoreValue',
  'powerupDropChance',
  'rank',
  'sizeMultiplier',
  'attackPatternId',
  'attackIntervalSeconds',
  'projectileSpeed',
  'burstCount'
];
const BOSS_WEAPON_KEYS = ['id', 'weaponId', 'attackIntervalSeconds', 'damage', 'projectileSpeed', 'burstCount'];
const BOSS_PHASE_KEYS = ['id', 'label', 'triggerHealthRatio', 'movementPatternId', 'speedMultiplier', 'weaponSettingIds'];
const SPAWN_ANCHOR_KEYS = ['x', 'y'];
const SPRITE_STYLE_KEYS = ['scale', 'rotationDegrees', 'flipX', 'opacity', 'hueRotateDegrees', 'saturation', 'brightness', 'glowColor', 'glowBlur'];

const SCORECARD_METRICS = new Set(['wave', 'targets', 'coins', 'flight']);
const EVENT_KINDS = new Set(Object.keys(EVENT_KEYS));
const ENEMY_RANKS = new Set(['standard', 'elite']);
const ENEMY_ATTACK_PATTERNS = new Set(['aimed-burst']);
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EPSILON = 0.0001;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasCatalogId = (catalog: object, id: unknown) => (
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(catalog, id)
);

const pushIssue = (
  issues: CampaignValidationIssue[],
  path: string,
  code: string,
  message: string
) => issues.push({ path, code, message });

const checkKeys = (value: UnknownRecord, allowed: readonly string[], path: string, issues: CampaignValidationIssue[]) => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      pushIssue(issues, `${path}/${key}`, 'unknown_property', 'Unknown properties are not allowed in campaign JSON');
    }
  }
};

const checkString = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  options: { id?: boolean; max?: number; color?: boolean; allowEmpty?: boolean } = {}
) => {
  if (typeof value !== 'string' || (!options.allowEmpty && value.trim().length === 0)) {
    pushIssue(issues, path, 'required_string', 'A non-empty string is required');
    return false;
  }
  if (value.length > (options.max ?? 160)) {
    pushIssue(issues, path, 'string_too_long', `Must contain at most ${options.max ?? 160} characters`);
  }
  if (options.id && !SAFE_ID.test(value)) {
    pushIssue(issues, path, 'invalid_id', 'IDs must use lowercase letters, numbers, and single hyphens');
  }
  if (options.color && !HEX_COLOR.test(value)) {
    pushIssue(issues, path, 'invalid_color', 'Expected a six-digit hexadecimal color');
  }
  return true;
};

const checkNumber = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  min: number,
  max: number,
  integer = false
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    pushIssue(issues, path, 'required_number', 'A finite number is required');
    return false;
  }
  if (value < min || value > max) {
    pushIssue(issues, path, 'out_of_range', `Must be between ${min} and ${max}`);
  }
  if (integer && !Number.isInteger(value)) {
    pushIssue(issues, path, 'expected_integer', 'Must be an integer');
  }
  return true;
};

const checkBoolean = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  if (typeof value !== 'boolean') {
    pushIssue(issues, path, 'required_boolean', 'A boolean is required');
    return false;
  }
  return true;
};

const checkArray = (value: unknown, path: string, issues: CampaignValidationIssue[], allowEmpty = false): value is unknown[] => {
  if (!Array.isArray(value)) {
    pushIssue(issues, path, 'required_array', 'An array is required');
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    pushIssue(issues, path, 'empty_collection', 'At least one item is required');
  }
  return true;
};

const validateSpawnAnchor = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  if (value === undefined) return;
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Spawn anchors must be objects');
    return;
  }
  checkKeys(value, SPAWN_ANCHOR_KEYS, path, issues);
  checkNumber(value.x, `${path}/x`, issues, 0, 1);
  checkNumber(value.y, `${path}/y`, issues, 0, 1);
};

const validateSpriteStyle = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  if (value === undefined) return;
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Sprite styles must be objects');
    return;
  }
  checkKeys(value, SPRITE_STYLE_KEYS, path, issues);
  if (Object.hasOwn(value, 'scale')) checkNumber(value.scale, `${path}/scale`, issues, 0.25, 3);
  if (Object.hasOwn(value, 'rotationDegrees')) checkNumber(value.rotationDegrees, `${path}/rotationDegrees`, issues, -180, 180);
  if (Object.hasOwn(value, 'flipX')) checkBoolean(value.flipX, `${path}/flipX`, issues);
  if (Object.hasOwn(value, 'opacity')) checkNumber(value.opacity, `${path}/opacity`, issues, 0.1, 1);
  if (Object.hasOwn(value, 'hueRotateDegrees')) checkNumber(value.hueRotateDegrees, `${path}/hueRotateDegrees`, issues, -180, 180);
  if (Object.hasOwn(value, 'saturation')) checkNumber(value.saturation, `${path}/saturation`, issues, 0, 2);
  if (Object.hasOwn(value, 'brightness')) checkNumber(value.brightness, `${path}/brightness`, issues, 0.25, 2);
  if (Object.hasOwn(value, 'glowColor')) checkString(value.glowColor, `${path}/glowColor`, issues, { max: 7, color: true });
  if (Object.hasOwn(value, 'glowBlur')) checkNumber(value.glowBlur, `${path}/glowBlur`, issues, 0, 40);
};

const validateRecordCardRegion = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Record-card art regions must be objects');
    return;
  }
  checkKeys(value, RECORD_CARD_REGION_KEYS, path, issues);
  const xValid = checkNumber(value.x, `${path}/x`, issues, 0, 1200);
  const yValid = checkNumber(value.y, `${path}/y`, issues, 0, 1200);
  const widthValid = checkNumber(value.width, `${path}/width`, issues, 1, 1200);
  const heightValid = checkNumber(value.height, `${path}/height`, issues, 1, 1200);
  checkNumber(value.rotation, `${path}/rotation`, issues, -180, 180);
  checkNumber(value.opacity, `${path}/opacity`, issues, 0, 1);
  checkBoolean(value.visible, `${path}/visible`, issues);
  if (xValid && widthValid && (value.x as number) + (value.width as number) > 1200) {
    pushIssue(issues, `${path}/width`, 'out_of_bounds', 'Art regions must fit inside the 1200px card width');
  }
  if (yValid && heightValid && (value.y as number) + (value.height as number) > 1200) {
    pushIssue(issues, `${path}/height`, 'out_of_bounds', 'Art regions must fit inside the 1200px card height');
  }
};

const validateRecordCard = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  // Optional only for schema-v1 rollback compatibility; the tracked campaign includes it.
  if (value === undefined) return;
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Shared record-card presentation is required');
    return;
  }
  checkKeys(value, RECORD_CARD_KEYS, path, issues);
  if (!isRecord(value.copy)) {
    pushIssue(issues, `${path}/copy`, 'required_object', 'Record-card copy settings are required');
  } else {
    const copy = value.copy;
    checkKeys(copy, RECORD_CARD_COPY_KEYS, `${path}/copy`, issues);
    ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'reviewLabel'].forEach((key) => {
      checkString(copy[key], `${path}/copy/${key}`, issues, { max: 80 });
    });
    checkString(copy.verifiedLabel, `${path}/copy/verifiedLabel`, issues, { max: 80, allowEmpty: true });
    if (!isRecord(copy.metricLabels)) {
      pushIssue(issues, `${path}/copy/metricLabels`, 'required_object', 'Metric labels are required');
    } else {
      const metricLabels = copy.metricLabels;
      checkKeys(metricLabels, RECORD_CARD_METRIC_LABEL_KEYS, `${path}/copy/metricLabels`, issues);
      RECORD_CARD_METRIC_LABEL_KEYS.forEach((key) => checkString(metricLabels[key], `${path}/copy/metricLabels/${key}`, issues, { max: 40 }));
    }
  }
  if (!isRecord(value.colors)) {
    pushIssue(issues, `${path}/colors`, 'required_object', 'Record-card colors are required');
  } else {
    const colors = value.colors;
    checkKeys(colors, RECORD_CARD_COLOR_KEYS, `${path}/colors`, issues);
    RECORD_CARD_COLOR_KEYS.forEach((key) => checkString(colors[key], `${path}/colors/${key}`, issues, { max: 7, color: true }));
  }
  checkBoolean(value.showGrid, `${path}/showGrid`, issues);
  const shipKnown = checkCatalogRef(value.shipAssetKey, ASSET_CATALOG, `${path}/shipAssetKey`, issues);
  if (shipKnown && !isAssetAllowedForRole(value.shipAssetKey as string, 'scorecard')) {
    pushIssue(issues, `${path}/shipAssetKey`, 'invalid_asset_role', 'Record-card artwork must be registered for scorecards');
  }
  if (value.encounterAssetKey !== 'AUTO') {
    const encounterKnown = checkCatalogRef(value.encounterAssetKey, ASSET_CATALOG, `${path}/encounterAssetKey`, issues);
    if (encounterKnown && !isAssetAllowedForRole(value.encounterAssetKey as string, 'scorecard')) {
      pushIssue(issues, `${path}/encounterAssetKey`, 'invalid_asset_role', 'Record-card artwork must be registered for scorecards');
    }
  }
  if (!isRecord(value.art)) {
    pushIssue(issues, `${path}/art`, 'required_object', 'Record-card art layout is required');
  } else {
    checkKeys(value.art, RECORD_CARD_ART_KEYS, `${path}/art`, issues);
    validateRecordCardRegion(value.art.ship, `${path}/art/ship`, issues);
    validateRecordCardRegion(value.art.encounter, `${path}/art/encounter`, issues);
  }
};

const validateHudAssets = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  // Optional only so immutable schema-v1 revisions created before HUD assets can be opened and normalized.
  if (value === undefined) return;
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Shared HUD assets are required');
    return;
  }
  checkKeys(value, HUD_ASSET_KEYS, path, issues);
  const known = checkCatalogRef(value.bombIconAssetKey, ASSET_CATALOG, `${path}/bombIconAssetKey`, issues);
  if (known && !isAssetAllowedForRole(value.bombIconAssetKey as string, 'hud')) {
    pushIssue(issues, `${path}/bombIconAssetKey`, 'invalid_asset_role', 'Bomb icons must reference an asset registered for the HUD');
  }
};

const checkUniqueStrings = (values: unknown[], path: string, issues: CampaignValidationIssue[]) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (typeof value !== 'string') return;
    if (seen.has(value)) pushIssue(issues, `${path}/${index}`, 'duplicate_id', `Duplicate value: ${value}`);
    seen.add(value);
  });
};

const checkCatalogRef = (value: unknown, catalog: object, path: string, issues: CampaignValidationIssue[]) => {
  if (!hasCatalogId(catalog, value)) {
    pushIssue(issues, path, 'unknown_reference', `Unknown catalog id: ${String(value)}`);
    return false;
  }
  return true;
};

const checkPowerupRefs = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  levelPowerups?: Set<string>
) => {
  if (!checkArray(value, path, issues)) return;
  checkUniqueStrings(value, path, issues);
  value.forEach((id, index) => {
    if (checkCatalogRef(id, POWERUP_CATALOG, `${path}/${index}`, issues) && levelPowerups && !levelPowerups.has(id as string)) {
      pushIssue(issues, `${path}/${index}`, 'unavailable_powerup', 'Event power-ups must be enabled by the owning level');
    }
  });
};

const validateScorecard = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Scorecard settings are required');
    return;
  }
  checkKeys(value, SCORECARD_KEYS, path, issues);
  if (value.trigger !== 'mission-end' && value.trigger !== 'level-complete') {
    pushIssue(issues, `${path}/trigger`, 'unknown_reference', 'Unknown scorecard trigger');
  }
  checkString(value.title, `${path}/title`, issues, { max: 80 });
  checkString(value.subtitle, `${path}/subtitle`, issues, { max: 80 });
  checkString(value.scoreLabel, `${path}/scoreLabel`, issues, { max: 80 });
  if (checkArray(value.metrics, `${path}/metrics`, issues)) {
    checkUniqueStrings(value.metrics, `${path}/metrics`, issues);
    value.metrics.forEach((metric, index) => {
      if (typeof metric !== 'string' || !SCORECARD_METRICS.has(metric)) {
        pushIssue(issues, `${path}/metrics/${index}`, 'unknown_reference', `Unknown scorecard metric: ${String(metric)}`);
      }
    });
  }
  checkBoolean(value.showEncounterArt, `${path}/showEncounterArt`, issues);
  const encounterKnown = checkCatalogRef(value.encounterAssetKey, ASSET_CATALOG, `${path}/encounterAssetKey`, issues);
  if (encounterKnown && !isAssetAllowedForRole(value.encounterAssetKey as string, 'scorecard')) {
    pushIssue(issues, `${path}/encounterAssetKey`, 'invalid_asset_role', 'Level scorecard artwork must be registered for scorecards');
  }
};

const validateSpawnEnemies = (value: unknown, path: string, issues: CampaignValidationIssue[]) => {
  if (!checkArray(value, path, issues)) return;
  const ids: unknown[] = [];
  let weight = 0;
  value.forEach((candidate, index) => {
    const itemPath = `${path}/${index}`;
    if (!isRecord(candidate)) {
      pushIssue(issues, itemPath, 'required_object', 'Enemy settings must be objects');
      return;
    }
    checkKeys(candidate, SPAWN_ENEMY_KEYS, itemPath, issues);
    ids.push(candidate.enemyId);
    checkCatalogRef(candidate.enemyId, ENEMY_CATALOG, `${itemPath}/enemyId`, issues);
    if (!checkCatalogRef(candidate.spriteKey, ASSET_CATALOG, `${itemPath}/spriteKey`, issues) || !isAssetAllowedForRole(candidate.spriteKey as string, 'enemy')) {
      pushIssue(issues, `${itemPath}/spriteKey`, 'invalid_sprite', 'Enemy sprites must reference an asset registered for enemies');
    }
    validateSpriteStyle(candidate.spriteStyle, `${itemPath}/spriteStyle`, issues);
    if (checkNumber(candidate.weight, `${itemPath}/weight`, issues, Number.EPSILON, 1)) weight += candidate.weight as number;
    checkNumber(candidate.health, `${itemPath}/health`, issues, Number.EPSILON, 1000000);
    checkNumber(candidate.speed, `${itemPath}/speed`, issues, 0, 100);
    checkNumber(candidate.damage, `${itemPath}/damage`, issues, Number.EPSILON, 100);
    checkNumber(candidate.scoreValue, `${itemPath}/scoreValue`, issues, 0, 10000000);
    checkNumber(candidate.powerupDropChance, `${itemPath}/powerupDropChance`, issues, 0, 1);
    if (candidate.rank !== undefined && (typeof candidate.rank !== 'string' || !ENEMY_RANKS.has(candidate.rank))) {
      pushIssue(issues, `${itemPath}/rank`, 'unknown_reference', `Unknown enemy rank: ${String(candidate.rank)}`);
    }
    if (candidate.sizeMultiplier !== undefined) checkNumber(candidate.sizeMultiplier, `${itemPath}/sizeMultiplier`, issues, 0.5, 2.5);
    if (
      candidate.attackPatternId !== undefined
      && (typeof candidate.attackPatternId !== 'string' || !ENEMY_ATTACK_PATTERNS.has(candidate.attackPatternId))
    ) {
      pushIssue(issues, `${itemPath}/attackPatternId`, 'unknown_reference', `Unknown enemy attack pattern: ${String(candidate.attackPatternId)}`);
    }
    if (candidate.attackIntervalSeconds !== undefined) checkNumber(candidate.attackIntervalSeconds, `${itemPath}/attackIntervalSeconds`, issues, 0.1, 30);
    if (candidate.projectileSpeed !== undefined) checkNumber(candidate.projectileSpeed, `${itemPath}/projectileSpeed`, issues, 0.1, 30);
    if (candidate.burstCount !== undefined) checkNumber(candidate.burstCount, `${itemPath}/burstCount`, issues, 1, 8, true);
  });
  checkUniqueStrings(ids, `${path}/enemyId`, issues);
  if (value.length > 0 && Math.abs(weight - 1) > EPSILON) {
    pushIssue(issues, path, 'invalid_weights', `Enemy weights must sum to 1 (received ${weight})`);
  }
};

const validateBoss = (event: UnknownRecord, path: string, issues: CampaignValidationIssue[]) => {
  const bossKnown = checkCatalogRef(event.bossId, BOSS_CATALOG, `${path}/bossId`, issues);
  if (event.count !== undefined) {
    checkNumber(event.count, `${path}/count`, issues, 1, 4, true);
    if (!['bottleneck-drone', 'paywall-wall'].includes(String(event.bossId)) && Number(event.count) > 1) {
      pushIssue(issues, `${path}/count`, 'unsupported_boss_group', 'Only Bottleneck Drones and Paywall Wall rows support grouped boss counts');
    }
  }
  if (!checkCatalogRef(event.spriteKey, ASSET_CATALOG, `${path}/spriteKey`, issues) || !isAssetAllowedForRole(event.spriteKey as string, 'boss')) {
    pushIssue(issues, `${path}/spriteKey`, 'invalid_sprite', 'Boss sprites must reference an asset registered for bosses');
  }
  validateSpriteStyle(event.spriteStyle, `${path}/spriteStyle`, issues);
  checkCatalogRef(event.positionId, SPAWN_POSITION_CATALOG, `${path}/positionId`, issues);
  checkCatalogRef(event.movementPatternId, MOVEMENT_PATTERN_CATALOG, `${path}/movementPatternId`, issues);
  checkNumber(event.warningSeconds, `${path}/warningSeconds`, issues, 0, 60);
  checkNumber(event.health, `${path}/health`, issues, Number.EPSILON, 10000000);
  checkNumber(event.speed, `${path}/speed`, issues, 0, 100);
  checkNumber(event.damage, `${path}/damage`, issues, Number.EPSILON, 1000);
  checkNumber(event.scoreReward, `${path}/scoreReward`, issues, 0, 100000000);
  checkNumber(event.powerupDropChance, `${path}/powerupDropChance`, issues, 0, 1);
  checkNumber(event.shieldCount, `${path}/shieldCount`, issues, 0, 100, true);
  if (event.sizeMultiplier !== undefined) checkNumber(event.sizeMultiplier, `${path}/sizeMultiplier`, issues, 0.5, 1.5);
  if (typeof event.warningSeconds === 'number' && typeof event.durationSeconds === 'number' && event.warningSeconds > event.durationSeconds) {
    pushIssue(issues, `${path}/warningSeconds`, 'invalid_timing', 'Warning cannot exceed the event duration');
  }

  const weaponIds = new Set<string>();
  if (checkArray(event.weapons, `${path}/weapons`, issues)) {
    event.weapons.forEach((candidate, index) => {
      const itemPath = `${path}/weapons/${index}`;
      if (!isRecord(candidate)) {
        pushIssue(issues, itemPath, 'required_object', 'Boss weapon settings must be objects');
        return;
      }
      checkKeys(candidate, BOSS_WEAPON_KEYS, itemPath, issues);
      if (checkString(candidate.id, `${itemPath}/id`, issues, { id: true })) {
        if (weaponIds.has(candidate.id as string)) pushIssue(issues, `${itemPath}/id`, 'duplicate_id', `Duplicate weapon setting id: ${candidate.id}`);
        weaponIds.add(candidate.id as string);
      }
      const weaponKnown = checkCatalogRef(candidate.weaponId, WEAPON_CATALOG, `${itemPath}/weaponId`, issues);
      if (bossKnown && weaponKnown) {
        const allowed = BOSS_CATALOG[event.bossId as keyof typeof BOSS_CATALOG].allowedWeaponIds;
        if (!allowed.includes(candidate.weaponId as never)) {
          pushIssue(issues, `${itemPath}/weaponId`, 'invalid_boss_weapon', 'This weapon is not supported by the selected boss renderer');
        }
      }
      checkNumber(candidate.attackIntervalSeconds, `${itemPath}/attackIntervalSeconds`, issues, Number.EPSILON, 120);
      checkNumber(candidate.damage, `${itemPath}/damage`, issues, Number.EPSILON, 1000);
      checkNumber(candidate.projectileSpeed, `${itemPath}/projectileSpeed`, issues, 0, 100);
      checkNumber(candidate.burstCount, `${itemPath}/burstCount`, issues, 1, 100, true);
    });
  }

  const phaseIds = new Set<string>();
  let previousTrigger = Number.POSITIVE_INFINITY;
  if (checkArray(event.phases, `${path}/phases`, issues)) {
    event.phases.forEach((candidate, index) => {
      const itemPath = `${path}/phases/${index}`;
      if (!isRecord(candidate)) {
        pushIssue(issues, itemPath, 'required_object', 'Boss phases must be objects');
        return;
      }
      checkKeys(candidate, BOSS_PHASE_KEYS, itemPath, issues);
      if (checkString(candidate.id, `${itemPath}/id`, issues, { id: true })) {
        if (phaseIds.has(candidate.id as string)) pushIssue(issues, `${itemPath}/id`, 'duplicate_id', `Duplicate boss phase id: ${candidate.id}`);
        phaseIds.add(candidate.id as string);
      }
      checkString(candidate.label, `${itemPath}/label`, issues, { max: 80 });
      if (checkNumber(candidate.triggerHealthRatio, `${itemPath}/triggerHealthRatio`, issues, Number.EPSILON, 1)) {
        const trigger = candidate.triggerHealthRatio as number;
        if (index === 0 && Math.abs(trigger - 1) > EPSILON) {
          pushIssue(issues, `${itemPath}/triggerHealthRatio`, 'invalid_phase_order', 'The first boss phase must start at full health (1)');
        }
        if (trigger >= previousTrigger) {
          pushIssue(issues, `${itemPath}/triggerHealthRatio`, 'invalid_phase_order', 'Boss health phase thresholds must strictly descend');
        }
        previousTrigger = trigger;
      }
      checkCatalogRef(candidate.movementPatternId, MOVEMENT_PATTERN_CATALOG, `${itemPath}/movementPatternId`, issues);
      checkNumber(candidate.speedMultiplier, `${itemPath}/speedMultiplier`, issues, Number.EPSILON, 20);
      if (checkArray(candidate.weaponSettingIds, `${itemPath}/weaponSettingIds`, issues)) {
        checkUniqueStrings(candidate.weaponSettingIds, `${itemPath}/weaponSettingIds`, issues);
        candidate.weaponSettingIds.forEach((id, weaponIndex) => {
          if (typeof id !== 'string' || !weaponIds.has(id)) {
            pushIssue(issues, `${itemPath}/weaponSettingIds/${weaponIndex}`, 'unknown_reference', `Unknown boss weapon setting: ${String(id)}`);
          }
        });
      }
    });
  }
};

const validateEvent = (
  candidate: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  wave: UnknownRecord,
  levelPowerups: Set<string>
) => {
  if (!isRecord(candidate)) {
    pushIssue(issues, path, 'required_object', 'Wave events must be objects');
    return;
  }
  const kind = typeof candidate.kind === 'string' ? candidate.kind : '';
  if (!EVENT_KINDS.has(kind)) {
    pushIssue(issues, `${path}/kind`, 'unknown_reference', `Unknown event kind: ${String(candidate.kind)}`);
    checkKeys(candidate, BASE_EVENT_KEYS, path, issues);
    return;
  }
  checkKeys(candidate, EVENT_KEYS[kind], path, issues);
  checkString(candidate.id, `${path}/id`, issues, { id: true });
  checkString(candidate.label, `${path}/label`, issues, { max: 100 });
  checkNumber(candidate.startSeconds, `${path}/startSeconds`, issues, 0, 3600);
  checkNumber(candidate.durationSeconds, `${path}/durationSeconds`, issues, Number.EPSILON, 3600);
  checkNumber(candidate.delayAfterSeconds, `${path}/delayAfterSeconds`, issues, 0, 600);
  checkBoolean(candidate.blocksWaveClock, `${path}/blocksWaveClock`, issues);
  validateSpawnAnchor(candidate.spawnAnchor, `${path}/spawnAnchor`, issues);
  if (typeof candidate.startSeconds === 'number' && typeof wave.durationSeconds === 'number') {
    if (candidate.startSeconds > wave.durationSeconds + EPSILON) {
      pushIssue(issues, `${path}/startSeconds`, 'invalid_timing', 'Event cannot start after the active wave duration');
    }
    if (!candidate.blocksWaveClock && typeof candidate.durationSeconds === 'number' && candidate.startSeconds + candidate.durationSeconds > wave.durationSeconds + EPSILON) {
      pushIssue(issues, `${path}/durationSeconds`, 'invalid_timing', 'Non-blocking events must finish within the active wave duration');
    }
  }

  if (kind === 'spawn') {
    checkNumber(candidate.count, `${path}/count`, issues, 1, 1000, true);
    checkCatalogRef(candidate.patternId, SPAWN_PATTERN_CATALOG, `${path}/patternId`, issues);
    checkCatalogRef(candidate.positionId, SPAWN_POSITION_CATALOG, `${path}/positionId`, issues);
    checkNumber(candidate.spawnIntervalSeconds, `${path}/spawnIntervalSeconds`, issues, Number.EPSILON, 600);
    validateSpawnEnemies(candidate.enemies, `${path}/enemies`, issues);
    if (
      typeof candidate.count === 'number'
      && typeof candidate.spawnIntervalSeconds === 'number'
      && typeof candidate.durationSeconds === 'number'
      && Math.max(0, candidate.count - 1) * candidate.spawnIntervalSeconds > candidate.durationSeconds + EPSILON
    ) {
      pushIssue(issues, `${path}/count`, 'invalid_timing', 'Count and spawn interval do not fit inside the event duration');
    }
  } else if (kind === 'boss') {
    validateBoss(candidate, path, issues);
  } else if (kind === 'asteroid-belt') {
    if (!checkCatalogRef(candidate.spriteKey, ASSET_CATALOG, `${path}/spriteKey`, issues) || !isAssetAllowedForRole(candidate.spriteKey as string, 'asteroid')) {
      pushIssue(issues, `${path}/spriteKey`, 'invalid_sprite', 'Asteroid belts must reference an asset registered for asteroids');
    }
    validateSpriteStyle(candidate.spriteStyle, `${path}/spriteStyle`, issues);
    if (!checkCatalogRef(candidate.patternId, SPAWN_PATTERN_CATALOG, `${path}/patternId`, issues) || candidate.patternId !== 'asteroid-lanes') {
      pushIssue(issues, `${path}/patternId`, 'invalid_pattern', 'Asteroid belts require the asteroid-lanes pattern');
    }
    if (!checkCatalogRef(candidate.positionId, SPAWN_POSITION_CATALOG, `${path}/positionId`, issues) || candidate.positionId !== 'lane-top') {
      pushIssue(issues, `${path}/positionId`, 'invalid_position', 'Asteroid belts require lane-top positioning');
    }
    checkNumber(candidate.count, `${path}/count`, issues, 1, 1000, true);
    checkNumber(candidate.density, `${path}/density`, issues, Number.EPSILON, 1);
    checkNumber(candidate.spawnIntervalSeconds, `${path}/spawnIntervalSeconds`, issues, Number.EPSILON, 600);
    checkNumber(candidate.warningSeconds, `${path}/warningSeconds`, issues, 0, 60);
    checkNumber(candidate.health, `${path}/health`, issues, Number.EPSILON, 1000000);
    checkNumber(candidate.speed, `${path}/speed`, issues, 0, 100);
    checkNumber(candidate.damage, `${path}/damage`, issues, Number.EPSILON, 1000);
    checkNumber(candidate.scoreValue, `${path}/scoreValue`, issues, 0, 10000000);
    checkNumber(candidate.powerupDropChance, `${path}/powerupDropChance`, issues, 0, 1);
    if (typeof candidate.warningSeconds === 'number' && typeof candidate.durationSeconds === 'number' && candidate.warningSeconds > candidate.durationSeconds) {
      pushIssue(issues, `${path}/warningSeconds`, 'invalid_timing', 'Warning cannot exceed the event duration');
    }
  } else if (kind === 'powerup') {
    checkCatalogRef(candidate.positionId, SPAWN_POSITION_CATALOG, `${path}/positionId`, issues);
    checkNumber(candidate.spawnIntervalSeconds, `${path}/spawnIntervalSeconds`, issues, Number.EPSILON, 600);
    checkPowerupRefs(candidate.powerupIds, `${path}/powerupIds`, issues, levelPowerups);
  } else if (kind === 'recovery') {
    checkCatalogRef(candidate.positionId, SPAWN_POSITION_CATALOG, `${path}/positionId`, issues);
    checkNumber(candidate.coinCount, `${path}/coinCount`, issues, 0, 1000, true);
    if (Array.isArray(candidate.powerupIds) && candidate.powerupIds.length === 0 && candidate.coinCount === 0) {
      pushIssue(issues, path, 'empty_collection', 'Recovery events must contain coins or at least one power-up');
    } else if (Array.isArray(candidate.powerupIds) && candidate.powerupIds.length === 0) {
      checkUniqueStrings(candidate.powerupIds, `${path}/powerupIds`, issues);
    } else {
      checkPowerupRefs(candidate.powerupIds, `${path}/powerupIds`, issues, levelPowerups);
    }
  }
};

const validateWave = (
  candidate: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  waveIds: Set<string>,
  eventIds: Set<string>,
  waveOrders: Set<number>,
  levelPowerups: Set<string>
) => {
  if (!isRecord(candidate)) {
    pushIssue(issues, path, 'required_object', 'Waves must be objects');
    return;
  }
  checkKeys(candidate, WAVE_KEYS, path, issues);
  if (checkString(candidate.id, `${path}/id`, issues, { id: true })) {
    if (waveIds.has(candidate.id as string)) pushIssue(issues, `${path}/id`, 'duplicate_id', `Duplicate wave id: ${candidate.id}`);
    waveIds.add(candidate.id as string);
  }
  checkString(candidate.name, `${path}/name`, issues, { max: 100 });
  if (checkNumber(candidate.order, `${path}/order`, issues, 1, 10000, true)) {
    if (waveOrders.has(candidate.order as number)) pushIssue(issues, `${path}/order`, 'duplicate_order', `Duplicate wave order: ${candidate.order}`);
    waveOrders.add(candidate.order as number);
  }
  checkString(candidate.accent, `${path}/accent`, issues, { color: true });
  checkCatalogRef(candidate.backgroundId, BACKGROUND_CATALOG, `${path}/backgroundId`, issues);
  checkNumber(candidate.difficultyMultiplier, `${path}/difficultyMultiplier`, issues, Number.EPSILON, 100);
  checkNumber(candidate.durationSeconds, `${path}/durationSeconds`, issues, Number.EPSILON, 3600);
  checkNumber(candidate.introSeconds, `${path}/introSeconds`, issues, 0, 600);
  checkNumber(candidate.delayAfterSeconds, `${path}/delayAfterSeconds`, issues, 0, 600);
  checkNumber(candidate.scoreMultiplier, `${path}/scoreMultiplier`, issues, Number.EPSILON, 1000000);
  checkNumber(candidate.threatCap, `${path}/threatCap`, issues, 1, 1000, true);

  if (checkArray(candidate.events, `${path}/events`, issues)) {
    let previousStart = -1;
    candidate.events.forEach((event, index) => {
      const eventPath = `${path}/events/${index}`;
      if (isRecord(event)) {
        if (typeof event.id === 'string') {
          if (eventIds.has(event.id)) pushIssue(issues, `${eventPath}/id`, 'duplicate_id', `Duplicate event id: ${event.id}`);
          eventIds.add(event.id);
        }
        if (typeof event.startSeconds === 'number') {
          if (event.startSeconds < previousStart) pushIssue(issues, `${eventPath}/startSeconds`, 'invalid_timing', 'Wave events must be ordered by startSeconds');
          previousStart = event.startSeconds;
        }
      }
      validateEvent(event, eventPath, issues, candidate, levelPowerups);
    });
  }
};

const validateLevel = (
  candidate: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  levelIds: Set<string>,
  waveIds: Set<string>,
  eventIds: Set<string>,
  levelOrders: Set<number>
) => {
  if (!isRecord(candidate)) {
    pushIssue(issues, path, 'required_object', 'Levels must be objects');
    return;
  }
  checkKeys(candidate, LEVEL_KEYS, path, issues);
  if (checkString(candidate.id, `${path}/id`, issues, { id: true })) {
    if (levelIds.has(candidate.id as string)) pushIssue(issues, `${path}/id`, 'duplicate_id', `Duplicate level id: ${candidate.id}`);
    levelIds.add(candidate.id as string);
  }
  checkString(candidate.name, `${path}/name`, issues, { max: 100 });
  checkString(candidate.description, `${path}/description`, issues, { max: 500 });
  if (checkNumber(candidate.order, `${path}/order`, issues, 1, 10000, true)) {
    if (levelOrders.has(candidate.order as number)) pushIssue(issues, `${path}/order`, 'duplicate_order', `Duplicate level order: ${candidate.order}`);
    levelOrders.add(candidate.order as number);
  }
  checkCatalogRef(candidate.backgroundId, BACKGROUND_CATALOG, `${path}/backgroundId`, issues);
  checkCatalogRef(candidate.musicId, MUSIC_CATALOG, `${path}/musicId`, issues);
  checkNumber(candidate.startingDifficulty, `${path}/startingDifficulty`, issues, Number.EPSILON, 100);
  checkNumber(candidate.scoreTarget, `${path}/scoreTarget`, issues, 0, 1000000000);
  if (candidate.durationSeconds !== null) checkNumber(candidate.durationSeconds, `${path}/durationSeconds`, issues, Number.EPSILON, 86400);
  checkBoolean(candidate.loopWaves, `${path}/loopWaves`, issues);

  const levelPowerups = new Set<string>();
  if (checkArray(candidate.availablePowerupIds, `${path}/availablePowerupIds`, issues)) {
    checkUniqueStrings(candidate.availablePowerupIds, `${path}/availablePowerupIds`, issues);
    candidate.availablePowerupIds.forEach((id, index) => {
      if (checkCatalogRef(id, POWERUP_CATALOG, `${path}/availablePowerupIds/${index}`, issues)) levelPowerups.add(id as string);
    });
  }
  validateScorecard(candidate.scorecard, `${path}/scorecard`, issues);

  const waveOrders = new Set<number>();
  if (checkArray(candidate.waves, `${path}/waves`, issues)) {
    let previousOrder = 0;
    candidate.waves.forEach((wave, index) => {
      if (isRecord(wave) && typeof wave.order === 'number') {
        if (wave.order <= previousOrder) pushIssue(issues, `${path}/waves/${index}/order`, 'invalid_order', 'Waves must be stored in ascending order');
        previousOrder = wave.order;
      }
      validateWave(wave, `${path}/waves/${index}`, issues, waveIds, eventIds, waveOrders, levelPowerups);
    });
  }
};

export const validateGameCampaign = (value: unknown): CampaignValidationResult => {
  const issues: CampaignValidationIssue[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: '/', code: 'required_object', message: 'Campaign must be an object' }] };
  }
  checkKeys(value, CAMPAIGN_KEYS, '', issues);
  if (value.schemaVersion !== 1) pushIssue(issues, '/schemaVersion', 'unsupported_schema', 'Only schemaVersion 1 is supported');
  checkNumber(value.revision, '/revision', issues, 1, 1000000000, true);
  checkString(value.id, '/id', issues, { id: true });
  checkString(value.name, '/name', issues, { max: 100 });
  if (checkString(value.updatedAt, '/updatedAt', issues) && Number.isNaN(Date.parse(value.updatedAt as string))) {
    pushIssue(issues, '/updatedAt', 'invalid_timestamp', 'Expected an ISO-8601 timestamp');
  }
  if (value.fps !== 60) pushIssue(issues, '/fps', 'unsupported_fps', 'Scicon Shooter campaign data must use 60 FPS');
  validateRecordCard(value.recordCard, '/recordCard', issues);
  validateHudAssets(value.hudAssets, '/hudAssets', issues);

  // One namespace keeps editor selections and version diffs unambiguous across the tree.
  const allIds = new Set<string>();
  const levelIds = allIds;
  const waveIds = allIds;
  const eventIds = allIds;
  const levelOrders = new Set<number>();
  if (checkArray(value.levels, '/levels', issues)) {
    let previousOrder = 0;
    value.levels.forEach((level, index) => {
      if (isRecord(level) && typeof level.order === 'number') {
        if (level.order <= previousOrder) pushIssue(issues, `/levels/${index}/order`, 'invalid_order', 'Levels must be stored in ascending order');
        previousOrder = level.order;
      }
      validateLevel(level, `/levels/${index}`, issues, levelIds, waveIds, eventIds, levelOrders);
    });
  }
  return { valid: issues.length === 0, issues };
};

export const assertValidGameCampaign: (value: unknown) => asserts value is GameCampaignConfig = (value) => {
  const result = validateGameCampaign(value);
  if (!result.valid) throw new CampaignValidationError(result.issues);
};

export const parseGameCampaign = (value: unknown): GameCampaignConfig => {
  assertValidGameCampaign(value);
  return value;
};

/** Convenience types for editor/runtime call sites that narrow discriminated events. */
export const isBossEvent = (event: WaveEvent): event is BossEvent => event.kind === 'boss';
export const isBlockingEvent = (event: WaveEvent) => event.blocksWaveClock;
export const getLevelValidationPath = (level: LevelDefinition) => `/levels/${level.id}`;
export const getWaveValidationPath = (wave: WaveDefinition) => `/waves/${wave.id}`;
