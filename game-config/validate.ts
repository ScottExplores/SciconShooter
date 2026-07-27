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
import {
  BOSS_TIMELINE_PRIMITIVES,
  isDamagingBossTimelinePrimitive
} from './bossTimeline';
import { MOVEMENT_PATH_CATALOG } from './movementPaths';
import type {
  BossEvent,
  GameCampaignConfig,
  LevelDefinition,
  WaveDefinition,
  WaveEvent
} from './types';
import { migrateLegacyGameCampaign } from './legacyCampaignMigration.mjs';

export {
  migrateLegacyGameCampaign,
  migrateLegacyStageWaveHierarchy,
  migrateLegacyWaveCompletionRule
} from './legacyCampaignMigration.mjs';

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
const LEVEL_KEYS = ['id', 'name', 'description', 'order', 'backgroundId', 'musicId', 'startingDifficulty', 'scoreTarget', 'durationSeconds', 'loopWaves', 'availablePowerupIds', 'scorecard', 'campaignProgression', 'waves'];
const SCORECARD_KEYS = ['trigger', 'title', 'subtitle', 'scoreLabel', 'metrics', 'showEncounterArt', 'encounterAssetKey'];
const CAMPAIGN_PROGRESSION_KEYS = ['reward', 'masteryObjectives', 'mapPosition', 'nextMissionId'];
const CAMPAIGN_REWARD_KEYS = ['waveClearCoins', 'missionClearCoins', 'firstClearCoins', 'bossFirstClearCoins', 'replayMultiplier'];
const CAMPAIGN_MASTERY_OBJECTIVE_KEYS = ['id', 'label', 'kind', 'target', 'rewardCoins'];
const CAMPAIGN_MAP_POSITION_KEYS = ['x', 'y'];
const RECORD_CARD_KEYS = ['copy', 'colors', 'showGrid', 'shipAssetKey', 'encounterAssetKey', 'art'];
const RECORD_CARD_COPY_KEYS = ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'verifiedLabel', 'reviewLabel', 'metricLabels'];
const RECORD_CARD_METRIC_LABEL_KEYS = ['wave', 'targets', 'coins', 'flight'];
const RECORD_CARD_COLOR_KEYS = ['background', 'panel', 'primary', 'secondary', 'success', 'warning', 'text', 'muted'];
const RECORD_CARD_ART_KEYS = ['ship', 'encounter'];
const RECORD_CARD_REGION_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible'];
const WAVE_KEYS = ['id', 'name', 'order', 'accent', 'backgroundId', 'completionRule', 'difficultyMultiplier', 'durationSeconds', 'introSeconds', 'delayAfterSeconds', 'scoreMultiplier', 'threatCap', 'events'];
const BASE_EVENT_KEYS = ['id', 'kind', 'label', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor'];
const EVENT_KEYS: Record<string, string[]> = {
  spawn: [...BASE_EVENT_KEYS, 'count', 'patternId', 'positionId', 'spawnIntervalSeconds', 'formationSlots', 'enemies'],
  boss: [...BASE_EVENT_KEYS, 'bossId', 'rigId', 'componentMode', 'count', 'spriteKey', 'spriteStyle', 'positionId', 'movementPatternId', 'warningSeconds', 'health', 'speed', 'damage', 'scoreReward', 'powerupDropChance', 'shieldCount', 'sizeMultiplier', 'weapons', 'phases', 'revival', 'timeline'],
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
const BOSS_REVIVAL_KEYS = ['phaseId', 'shutdownSeconds', 'rebootSeconds', 'restoreHealthRatio', 'awakenedSizeMultiplier'];
const BOSS_TIMELINE_KEYS = ['durationSeconds', 'loop', 'clips', 'attacks'];
const BOSS_TIMELINE_CLIP_KEYS = ['id', 'label', 'track', 'primitiveId', 'trigger', 'startSeconds', 'durationSeconds', 'phaseId', 'telegraphClipId', 'repeat', 'parameters'];
const BOSS_TIMELINE_REPEAT_KEYS = ['count', 'intervalSeconds'];
const BOSS_ATTACK_SENTENCE_KEYS = [
  'id',
  'label',
  'role',
  'skillTest',
  'recognitionCue',
  'solution',
  'safeRouteRule',
  'sourceSocketRoles',
  'variants'
];
const BOSS_ATTACK_SENTENCE_VARIANT_KEYS = ['phaseId', 'beatClipIds', 'recoveryClipId'];
const BOSS_TIMELINE_PARAMETER_KEYS = [
  'sequence',
  'projectileCount',
  'pulseIntervalSeconds',
  'shotIntervalFrames',
  'projectileSpeedScale',
  'channelWidthPixels',
  'sweepRangeRatio',
  'sweepPasses',
  'warningSeconds',
  'shieldCount',
  'summonCount',
  'enemyId',
  'formationPatternId',
  'movementPatternId',
  'movementPathId',
  'speedMultiplier',
  'componentId',
  'enabled',
  'side',
  'handedness',
  'telegraphStyle',
  'motionCue',
  'rotationDirection',
  'color',
  'strength'
];
const SPAWN_ANCHOR_KEYS = ['x', 'y'];
const FORMATION_SLOT_KEYS = ['x', 'y'];
const SPRITE_STYLE_KEYS = ['scale', 'rotationDegrees', 'flipX', 'opacity', 'hueRotateDegrees', 'saturation', 'brightness', 'glowColor', 'glowBlur'];

const SCORECARD_METRICS = new Set(['wave', 'targets', 'coins', 'flight']);
const CAMPAIGN_MASTERY_OBJECTIVE_KINDS = new Set([
  'complete',
  'damage-at-most',
  'coins-at-least',
  'score-at-least',
  'time-at-most'
]);
const EVENT_KINDS = new Set(Object.keys(EVENT_KEYS));
const BOSS_RIG_IDS = new Set(['open-orbit', 'citation-storm', 'paywall-siege', 'crown-claw']);
const ENEMY_RANKS = new Set(['standard', 'elite']);
const ENEMY_ATTACK_PATTERNS = new Set(['aimed-burst']);
const WAVE_COMPLETION_RULES = new Set(['boss-defeat', 'clear-after-duration']);
const BOSS_TIMELINE_TRACKS = new Set(['movement', 'attack', 'laser', 'summon', 'defense', 'presentation']);
const BOSS_TIMELINE_TRIGGERS = new Set(['time', 'phase-enter', 'death']);
const BOSS_TIMELINE_TELEGRAPH_STYLES = new Set(['warning', 'lane', 'target', 'ring', 'spokes']);
const BOSS_TIMELINE_MOTION_CUES = new Set([
  'rotor-volley',
  'radial-beam',
  'heavy-cannon',
  'gatling-barrage',
  'paired-crossfire',
  'machinegun-channel',
  'claw-sweep',
  'reactor-pattern',
  'reactor-fan',
  'reactor-mines',
  'pincer-dive',
  'prism-wingbeat-weave',
  'prism-brood-procession',
  'prism-lunar-swoop',
  'prism-kaleidoscope-brood',
  'prism-wingbeat',
  'prism-brood-deploy',
  'prism-swoop',
  'prism-kaleidoscope',
  'prism-metamorphosis'
]);
const BOSS_TIMELINE_ROTATION_DIRECTIONS = new Set([
  'clockwise',
  'counterclockwise',
  'seeded-random'
]);
const BOSS_ATTACK_SENTENCE_ROLES = new Set(['core', 'signature']);
const BOSS_ATTACK_SKILL_TESTS = new Set([
  'rhythm-dodge',
  'lane-routing',
  'gap-tracking',
  'route-combination'
]);
const BOSS_ATTACK_SAFE_ROUTE_RULES = new Set([
  'opposite-side-dodge',
  'shifting-channel',
  'rotating-gap',
  'channel-to-quadrant'
]);
const BOSS_ATTACK_SOCKET_ROLES = new Set(['port', 'starboard', 'core']);
const BOSS_COMPONENT_MODES = new Set(['legacy-rig', 'hull-only']);
const BOSS_COMPONENT_IDS = new Set(['left-cannon', 'right-cannon', 'helmet']);
const BOSS_TIMELINE_SIDES = new Set(['port', 'starboard']);
const BOSS_TIMELINE_HANDEDNESS = new Set(['left', 'right']);
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EPSILON = 0.0001;
const BOSS_TIMELINE_FPS = 60;
const BOSS_TIMELINE_MAX_CUES_PER_FRAME = 8;
const CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS = 0.8;
const CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS = 2.5;
const CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS = 0.3;
const CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS = 1.25;
const CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS = 0.45;
const CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS = 1.4;
const toBossTimelineFrame = (seconds: number) => Math.max(
  1,
  Math.round(Math.max(0, seconds) * BOSS_TIMELINE_FPS)
);

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

const validateFormationSlots = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  count: unknown,
  patternId: unknown
) => {
  if (value === undefined) return;
  if (!checkArray(value, path, issues)) return;
  if (value.length < 2 || value.length > 48) {
    pushIssue(issues, path, 'invalid_formation_size', 'Custom formations require between 2 and 48 slots');
  }
  if (typeof count === 'number' && Number.isInteger(count) && count !== value.length) {
    pushIssue(issues, path, 'formation_count_mismatch', 'Custom formation slot count must match the spawn count');
  }
  if (patternId === 'single-random' || patternId === 'asteroid-lanes') {
    pushIssue(issues, path, 'invalid_formation_choreography', 'Custom formations require a grouped formation choreography');
  }

  const positions = new Set<string>();
  value.forEach((slot, index) => {
    const slotPath = `${path}/${index}`;
    if (!isRecord(slot)) {
      pushIssue(issues, slotPath, 'required_object', 'Formation slots must be objects');
      return;
    }
    checkKeys(slot, FORMATION_SLOT_KEYS, slotPath, issues);
    const xValid = checkNumber(slot.x, `${slotPath}/x`, issues, 0.06, 0.94);
    const yValid = checkNumber(slot.y, `${slotPath}/y`, issues, 0.08, 0.46);
    if (xValid && yValid) {
      const key = `${Number(slot.x).toFixed(4)}:${Number(slot.y).toFixed(4)}`;
      if (positions.has(key)) pushIssue(issues, slotPath, 'duplicate_formation_slot', 'Formation slots must use unique positions');
      positions.add(key);
    }
  });
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

const validateCampaignProgression = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  levelId: unknown
) => {
  if (value === undefined) return;
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Campaign progression settings must be an object');
    return;
  }
  checkKeys(value, CAMPAIGN_PROGRESSION_KEYS, path, issues);

  if (!isRecord(value.reward)) {
    pushIssue(issues, `${path}/reward`, 'required_object', 'Campaign reward settings are required');
  } else {
    checkKeys(value.reward, CAMPAIGN_REWARD_KEYS, `${path}/reward`, issues);
    checkNumber(value.reward.waveClearCoins, `${path}/reward/waveClearCoins`, issues, 0, 1000000, true);
    checkNumber(value.reward.missionClearCoins, `${path}/reward/missionClearCoins`, issues, 0, 1000000, true);
    checkNumber(value.reward.firstClearCoins, `${path}/reward/firstClearCoins`, issues, 0, 1000000, true);
    checkNumber(value.reward.bossFirstClearCoins, `${path}/reward/bossFirstClearCoins`, issues, 0, 1000000, true);
    checkNumber(value.reward.replayMultiplier, `${path}/reward/replayMultiplier`, issues, Number.EPSILON, 1);
  }

  if (checkArray(value.masteryObjectives, `${path}/masteryObjectives`, issues)) {
    if (value.masteryObjectives.length !== 3) {
      pushIssue(issues, `${path}/masteryObjectives`, 'invalid_mastery_count', 'Campaign Missions require exactly three mastery objectives');
    }
    const objectiveIds: unknown[] = [];
    let completionObjectiveCount = 0;
    value.masteryObjectives.forEach((objective, index) => {
      const objectivePath = `${path}/masteryObjectives/${index}`;
      if (!isRecord(objective)) {
        pushIssue(issues, objectivePath, 'required_object', 'Mastery objectives must be objects');
        return;
      }
      checkKeys(objective, CAMPAIGN_MASTERY_OBJECTIVE_KEYS, objectivePath, issues);
      if (checkString(objective.id, `${objectivePath}/id`, issues, { max: 160 })) {
        objectiveIds.push(objective.id);
        if (typeof levelId === 'string' && !String(objective.id).startsWith(`${levelId}:`)) {
          pushIssue(issues, `${objectivePath}/id`, 'invalid_mastery_id', 'Mastery objective IDs must be scoped to their owning Mission');
        }
      }
      checkString(objective.label, `${objectivePath}/label`, issues, { max: 160 });
      if (typeof objective.kind !== 'string' || !CAMPAIGN_MASTERY_OBJECTIVE_KINDS.has(objective.kind)) {
        pushIssue(issues, `${objectivePath}/kind`, 'unknown_reference', `Unknown Campaign mastery objective kind: ${String(objective.kind)}`);
      }
      if (objective.kind === 'complete') {
        completionObjectiveCount += 1;
        if (objective.target !== 1) {
          pushIssue(issues, `${objectivePath}/target`, 'invalid_mastery_target', 'Completion mastery objectives must use a target of 1');
        }
      } else {
        checkNumber(objective.target, `${objectivePath}/target`, issues, 0, 1000000000);
        if (
          ['coins-at-least', 'score-at-least', 'time-at-most'].includes(String(objective.kind))
          && typeof objective.target === 'number'
          && objective.target <= 0
        ) {
          pushIssue(issues, `${objectivePath}/target`, 'invalid_mastery_target', 'This mastery objective requires a positive target');
        }
      }
      checkNumber(objective.rewardCoins, `${objectivePath}/rewardCoins`, issues, 0, 1000000, true);
    });
    checkUniqueStrings(objectiveIds, `${path}/masteryObjectives/id`, issues);
    if (completionObjectiveCount !== 1) {
      pushIssue(issues, `${path}/masteryObjectives`, 'invalid_completion_mastery', 'Campaign Missions require exactly one completion mastery objective');
    }
  }

  if (value.mapPosition !== undefined) {
    if (!isRecord(value.mapPosition)) {
      pushIssue(issues, `${path}/mapPosition`, 'required_object', 'Campaign map positions must be objects');
    } else {
      checkKeys(value.mapPosition, CAMPAIGN_MAP_POSITION_KEYS, `${path}/mapPosition`, issues);
      checkNumber(value.mapPosition.x, `${path}/mapPosition/x`, issues, 0, 1);
      checkNumber(value.mapPosition.y, `${path}/mapPosition/y`, issues, 0, 1);
    }
  }

  if (value.nextMissionId !== undefined && value.nextMissionId !== null) {
    checkString(value.nextMissionId, `${path}/nextMissionId`, issues, { id: true });
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

const validateBossTimeline = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  phaseIds: ReadonlySet<string>
) => {
  if (value === undefined) return;
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Boss timeline must be an object');
    return;
  }

  checkKeys(value, BOSS_TIMELINE_KEYS, path, issues);
  checkNumber(value.durationSeconds, `${path}/durationSeconds`, issues, 0.1, 180);
  checkBoolean(value.loop, `${path}/loop`, issues);
  if (!checkArray(value.clips, `${path}/clips`, issues)) return;
  const timelineClips = value.clips;
  if (timelineClips.length > 128) {
    pushIssue(issues, `${path}/clips`, 'too_many_items', 'Boss timelines support at most 128 clips');
  }

  const clipIds = new Set<string>();
  const clipsById = new Map<string, UnknownRecord>();
  timelineClips.forEach((candidate, index) => {
    const itemPath = `${path}/clips/${index}`;
    if (!isRecord(candidate)) {
      pushIssue(issues, itemPath, 'required_object', 'Boss timeline clips must be objects');
      return;
    }
    checkKeys(candidate, BOSS_TIMELINE_CLIP_KEYS, itemPath, issues);
    if (checkString(candidate.id, `${itemPath}/id`, issues, { id: true })) {
      if (clipIds.has(candidate.id as string)) {
        pushIssue(issues, `${itemPath}/id`, 'duplicate_id', `Duplicate boss timeline clip id: ${candidate.id}`);
      }
      clipIds.add(candidate.id as string);
      clipsById.set(candidate.id as string, candidate);
    }
    checkString(candidate.label, `${itemPath}/label`, issues, { max: 100 });

    const trackKnown = typeof candidate.track === 'string' && BOSS_TIMELINE_TRACKS.has(candidate.track);
    if (!trackKnown) {
      pushIssue(issues, `${itemPath}/track`, 'unsupported_value', `Unsupported boss timeline track: ${String(candidate.track)}`);
    }
    const primitiveKnown = typeof candidate.primitiveId === 'string'
      && Object.prototype.hasOwnProperty.call(BOSS_TIMELINE_PRIMITIVES, candidate.primitiveId);
    if (!primitiveKnown) {
      pushIssue(issues, `${itemPath}/primitiveId`, 'unsupported_value', `Unsupported boss timeline primitive: ${String(candidate.primitiveId)}`);
    } else if (
      trackKnown
      && BOSS_TIMELINE_PRIMITIVES[candidate.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES].track !== candidate.track
    ) {
      pushIssue(
        issues,
        `${itemPath}/track`,
        'invalid_primitive_track',
        `${candidate.primitiveId} belongs on the ${BOSS_TIMELINE_PRIMITIVES[candidate.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES].track} track`
      );
    }

    if (typeof candidate.trigger !== 'string' || !BOSS_TIMELINE_TRIGGERS.has(candidate.trigger)) {
      pushIssue(issues, `${itemPath}/trigger`, 'unsupported_value', `Unsupported boss timeline trigger: ${String(candidate.trigger)}`);
    }
    checkNumber(candidate.startSeconds, `${itemPath}/startSeconds`, issues, 0, 180);
    checkNumber(candidate.durationSeconds, `${itemPath}/durationSeconds`, issues, 0.01, 60);
    if (
      typeof value.durationSeconds === 'number'
      && typeof candidate.startSeconds === 'number'
      && candidate.startSeconds > value.durationSeconds
    ) {
      pushIssue(issues, `${itemPath}/startSeconds`, 'invalid_timing', 'Timeline clip must start inside the timeline duration');
    }
    if (candidate.phaseId !== undefined && (typeof candidate.phaseId !== 'string' || !phaseIds.has(candidate.phaseId))) {
      pushIssue(issues, `${itemPath}/phaseId`, 'unknown_reference', `Unknown boss phase: ${String(candidate.phaseId)}`);
    }
    if (candidate.telegraphClipId !== undefined) {
      checkString(candidate.telegraphClipId, `${itemPath}/telegraphClipId`, issues, { id: true });
    }

    if (candidate.repeat !== undefined) {
      if (!isRecord(candidate.repeat)) {
        pushIssue(issues, `${itemPath}/repeat`, 'required_object', 'Boss timeline repeat must be an object');
      } else {
        checkKeys(candidate.repeat, BOSS_TIMELINE_REPEAT_KEYS, `${itemPath}/repeat`, issues);
        checkNumber(candidate.repeat.count, `${itemPath}/repeat/count`, issues, 1, 8, true);
        checkNumber(candidate.repeat.intervalSeconds, `${itemPath}/repeat/intervalSeconds`, issues, 0.05, 30);
        if (
          primitiveKnown
          && !BOSS_TIMELINE_PRIMITIVES[candidate.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES].supportsRepeat
        ) {
          pushIssue(issues, `${itemPath}/repeat`, 'unsupported_repeat', `${candidate.primitiveId} cannot be repeated inside one clip`);
        }
        if (candidate.trigger !== 'time') {
          pushIssue(
            issues,
            `${itemPath}/repeat`,
            'unsupported_trigger_repeat',
            'Only time-based boss timeline clips can repeat'
          );
        }
        if (
          candidate.trigger === 'time'
          && typeof candidate.startSeconds === 'number'
          && Number.isFinite(candidate.startSeconds)
          && typeof candidate.repeat.count === 'number'
          && Number.isFinite(candidate.repeat.count)
          && typeof candidate.repeat.intervalSeconds === 'number'
          && Number.isFinite(candidate.repeat.intervalSeconds)
          && typeof value.durationSeconds === 'number'
          && Number.isFinite(value.durationSeconds)
        ) {
          const repeatCount = Math.max(1, Math.min(8, Math.floor(candidate.repeat.count)));
          const finalExecutionSeconds = candidate.startSeconds
            + ((repeatCount - 1) * candidate.repeat.intervalSeconds);
          const finalExecutionFrame = toBossTimelineFrame(finalExecutionSeconds);
          const durationFrame = toBossTimelineFrame(value.durationSeconds);
          const outsideTimeline = value.loop === true
            ? finalExecutionFrame >= durationFrame
            : finalExecutionSeconds > value.durationSeconds + EPSILON;
          if (outsideTimeline) {
            pushIssue(
              issues,
              `${itemPath}/repeat`,
              'repeat_outside_timeline',
              'Every repeated execution must remain inside the boss timeline'
            );
          }
        }
      }
    }
    if (
      candidate.trigger === 'time'
      && value.loop === true
      && typeof candidate.startSeconds === 'number'
      && Number.isFinite(candidate.startSeconds)
      && typeof value.durationSeconds === 'number'
      && Number.isFinite(value.durationSeconds)
      && toBossTimelineFrame(candidate.startSeconds) >= toBossTimelineFrame(value.durationSeconds)
    ) {
      pushIssue(
        issues,
        `${itemPath}/startSeconds`,
        'unreachable_loop_cue',
        'Looping timeline clips must execute before the loop endpoint'
      );
    }

    if (candidate.parameters !== undefined) {
      if (!isRecord(candidate.parameters)) {
        pushIssue(issues, `${itemPath}/parameters`, 'required_object', 'Boss timeline parameters must be an object');
      } else {
        const parameters = candidate.parameters;
        const parameterPath = `${itemPath}/parameters`;
        checkKeys(parameters, BOSS_TIMELINE_PARAMETER_KEYS, parameterPath, issues);
        if (primitiveKnown) {
          const primitive = BOSS_TIMELINE_PRIMITIVES[
            candidate.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES
          ];
          Object.keys(parameters).forEach((parameterKey) => {
            if (primitive.parameterKeys.some((allowedKey) => allowedKey === parameterKey)) return;
            pushIssue(
              issues,
              `${parameterPath}/${parameterKey}`,
              'unsupported_primitive_parameter',
              `${parameterKey} is not supported by ${candidate.primitiveId}`
            );
          });
        }
        if (parameters.sequence !== undefined) checkNumber(parameters.sequence, `${parameterPath}/sequence`, issues, 0, 100000, true);
        if (parameters.projectileCount !== undefined) checkNumber(parameters.projectileCount, `${parameterPath}/projectileCount`, issues, 1, 24, true);
        if (parameters.pulseIntervalSeconds !== undefined) checkNumber(parameters.pulseIntervalSeconds, `${parameterPath}/pulseIntervalSeconds`, issues, 0.5, 2);
        if (parameters.shotIntervalFrames !== undefined) checkNumber(parameters.shotIntervalFrames, `${parameterPath}/shotIntervalFrames`, issues, 2, 12, true);
        if (parameters.projectileSpeedScale !== undefined) checkNumber(parameters.projectileSpeedScale, `${parameterPath}/projectileSpeedScale`, issues, 0.5, 2);
        if (parameters.channelWidthPixels !== undefined) checkNumber(parameters.channelWidthPixels, `${parameterPath}/channelWidthPixels`, issues, 72, 320);
        if (parameters.sweepRangeRatio !== undefined) checkNumber(parameters.sweepRangeRatio, `${parameterPath}/sweepRangeRatio`, issues, 0.1, 0.8);
        if (parameters.sweepPasses !== undefined) checkNumber(parameters.sweepPasses, `${parameterPath}/sweepPasses`, issues, 1, 3, true);
        if (parameters.warningSeconds !== undefined) checkNumber(parameters.warningSeconds, `${parameterPath}/warningSeconds`, issues, 0.1, 10);
        if (parameters.shieldCount !== undefined) checkNumber(parameters.shieldCount, `${parameterPath}/shieldCount`, issues, 0, 12, true);
        if (parameters.summonCount !== undefined) checkNumber(parameters.summonCount, `${parameterPath}/summonCount`, issues, 1, 12, true);
        if (parameters.enemyId !== undefined) checkCatalogRef(parameters.enemyId, ENEMY_CATALOG, `${parameterPath}/enemyId`, issues);
        if (parameters.formationPatternId !== undefined) checkCatalogRef(parameters.formationPatternId, SPAWN_PATTERN_CATALOG, `${parameterPath}/formationPatternId`, issues);
        if (parameters.movementPatternId !== undefined) checkCatalogRef(parameters.movementPatternId, MOVEMENT_PATTERN_CATALOG, `${parameterPath}/movementPatternId`, issues);
        if (parameters.movementPathId !== undefined) checkCatalogRef(parameters.movementPathId, MOVEMENT_PATH_CATALOG, `${parameterPath}/movementPathId`, issues);
        if (parameters.speedMultiplier !== undefined) checkNumber(parameters.speedMultiplier, `${parameterPath}/speedMultiplier`, issues, 0.1, 8);
        if (parameters.componentId !== undefined && (typeof parameters.componentId !== 'string' || !BOSS_COMPONENT_IDS.has(parameters.componentId))) {
          pushIssue(issues, `${parameterPath}/componentId`, 'unsupported_value', `Unsupported boss component: ${String(parameters.componentId)}`);
        }
        if (parameters.enabled !== undefined) checkBoolean(parameters.enabled, `${parameterPath}/enabled`, issues);
        if (parameters.side !== undefined && (typeof parameters.side !== 'string' || !BOSS_TIMELINE_SIDES.has(parameters.side))) {
          pushIssue(issues, `${parameterPath}/side`, 'unsupported_value', `Unsupported boss side: ${String(parameters.side)}`);
        }
        if (parameters.handedness !== undefined && (typeof parameters.handedness !== 'string' || !BOSS_TIMELINE_HANDEDNESS.has(parameters.handedness))) {
          pushIssue(issues, `${parameterPath}/handedness`, 'unsupported_value', `Unsupported helix handedness: ${String(parameters.handedness)}`);
        }
        if (parameters.telegraphStyle !== undefined && (typeof parameters.telegraphStyle !== 'string' || !BOSS_TIMELINE_TELEGRAPH_STYLES.has(parameters.telegraphStyle))) {
          pushIssue(issues, `${parameterPath}/telegraphStyle`, 'unsupported_value', `Unsupported telegraph style: ${String(parameters.telegraphStyle)}`);
        }
        if (parameters.motionCue !== undefined && (typeof parameters.motionCue !== 'string' || !BOSS_TIMELINE_MOTION_CUES.has(parameters.motionCue))) {
          pushIssue(issues, `${parameterPath}/motionCue`, 'unsupported_value', `Unsupported boss motion cue: ${String(parameters.motionCue)}`);
        }
        if (parameters.rotationDirection !== undefined && (typeof parameters.rotationDirection !== 'string' || !BOSS_TIMELINE_ROTATION_DIRECTIONS.has(parameters.rotationDirection))) {
          pushIssue(issues, `${parameterPath}/rotationDirection`, 'unsupported_value', `Unsupported boss rotation direction: ${String(parameters.rotationDirection)}`);
        }
        if (parameters.color !== undefined && (typeof parameters.color !== 'string' || !HEX_COLOR.test(parameters.color))) {
          pushIssue(issues, `${parameterPath}/color`, 'invalid_color', 'Boss timeline color must be a six-digit hexadecimal color');
        }
        if (parameters.strength !== undefined) checkNumber(parameters.strength, `${parameterPath}/strength`, issues, 0, 10);
      }
    }
    if (candidate.primitiveId === 'follow-path') {
      if (candidate.trigger !== 'time') {
        pushIssue(
          issues,
          `${itemPath}/trigger`,
          'unsupported_path_trigger',
          'Movement paths must use the deterministic phase clock'
        );
      }
      if (!isRecord(candidate.parameters) || candidate.parameters.movementPathId === undefined) {
        pushIssue(
          issues,
          `${itemPath}/parameters/movementPathId`,
          'required_reference',
          'Follow-path clips require an allowlisted movement path'
        );
      }
      if (
        typeof value.durationSeconds === 'number'
        && typeof candidate.startSeconds === 'number'
        && typeof candidate.durationSeconds === 'number'
        && candidate.startSeconds + candidate.durationSeconds > value.durationSeconds + EPSILON
      ) {
        pushIssue(
          issues,
          `${itemPath}/durationSeconds`,
          'invalid_path_timing',
          'Movement paths must finish before the timeline endpoint'
        );
      }
    }
    if (
      candidate.primitiveId === 'corner-ambush-beam'
      && (
        typeof candidate.durationSeconds !== 'number'
        || candidate.durationSeconds < CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS
        || candidate.durationSeconds > CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS
      )
    ) {
      pushIssue(
        issues,
        `${itemPath}/durationSeconds`,
        'invalid_corner_ambush_duration',
        `Corner ambush beams must remain live for ${CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS}-${CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS} seconds`
      );
    }
    if (
      candidate.primitiveId === 'corner-ambush-ram'
      && (
        typeof candidate.durationSeconds !== 'number'
        || candidate.durationSeconds < CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS
        || candidate.durationSeconds > CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS
      )
    ) {
      pushIssue(
        issues,
        `${itemPath}/durationSeconds`,
        'invalid_corner_ambush_ram_duration',
        `Corner ambush rams must remain live for ${CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS}-${CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS} seconds`
      );
    }
    if (
      (
        candidate.primitiveId === 'corner-ambush-beam'
        || candidate.primitiveId === 'corner-ambush-ram'
      )
      && typeof value.durationSeconds === 'number'
      && typeof candidate.startSeconds === 'number'
      && typeof candidate.durationSeconds === 'number'
      && candidate.startSeconds + candidate.durationSeconds > value.durationSeconds + EPSILON
    ) {
      pushIssue(
        issues,
        `${itemPath}/durationSeconds`,
        'corner_ambush_outside_timeline',
        'Corner ambush actions must finish before the timeline endpoint'
      );
    }
  });

  timelineClips.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.primitiveId !== 'string') return;
    if (!Object.prototype.hasOwnProperty.call(BOSS_TIMELINE_PRIMITIVES, candidate.primitiveId)) return;
    if (!isDamagingBossTimelinePrimitive(candidate.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES)) return;
    const itemPath = `${path}/clips/${index}`;
    if (candidate.trigger !== 'time') {
      pushIssue(
        issues,
        `${itemPath}/trigger`,
        'unsafe_damage_trigger',
        'Damaging boss timeline clips must use the time trigger so their warning can occur first'
      );
    }
    const telegraphId = candidate.telegraphClipId;
    const telegraph = typeof telegraphId === 'string' ? clipsById.get(telegraphId) : undefined;
    if (!telegraph || telegraph.primitiveId !== 'telegraph') {
      pushIssue(issues, `${itemPath}/telegraphClipId`, 'missing_telegraph', 'Damaging boss timeline clips must reference a telegraph clip');
      return;
    }
    if (telegraph.trigger !== 'time') {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        'invalid_telegraph_trigger',
        'A damaging action must reference a time-based telegraph'
      );
    }
    if (
      typeof telegraph.phaseId === 'string'
      && telegraph.phaseId !== candidate.phaseId
    ) {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        'invalid_telegraph_phase',
        'A phase-specific telegraph must belong to the same phase as its damaging action'
      );
    }
    if (
      (
        candidate.primitiveId === 'cross-beam'
        || candidate.primitiveId === 'rail-sweep'
        || candidate.primitiveId === 'weave-wall'
      )
      && (
        !isRecord(telegraph.parameters)
        || telegraph.parameters.telegraphStyle !== 'lane'
      )
    ) {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        candidate.primitiveId === 'weave-wall'
          ? 'invalid_safe_channel_telegraph'
          : 'invalid_laser_telegraph',
        candidate.primitiveId === 'weave-wall'
          ? 'Weave walls require a lane telegraph so the deterministic safe channel is visible'
          : 'Laser primitives require a lane telegraph so the damaging path is visible'
      );
    }
    if (
      candidate.primitiveId === 'radial-beam-array'
      && (
        !isRecord(telegraph.parameters)
        || telegraph.parameters.telegraphStyle !== 'spokes'
      )
    ) {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        'invalid_radial_beam_telegraph',
        'Radial beam arrays require a spoke telegraph on the exact damaging geometry'
      );
    }
    if (
      (
        candidate.primitiveId === 'corner-ambush-beam'
        || candidate.primitiveId === 'corner-ambush-ram'
      )
      && (
        !isRecord(telegraph.parameters)
        || telegraph.parameters.telegraphStyle !== 'target'
      )
    ) {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        'invalid_corner_ambush_telegraph',
        'Corner ambush actions require a target telegraph that locks their exact damaging geometry'
      );
    }
    if (
      (
        candidate.primitiveId === 'corner-ambush-beam'
        || candidate.primitiveId === 'corner-ambush-ram'
      )
      && isRecord(telegraph.repeat)
    ) {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        'unsupported_corner_ambush_repeat',
        'Corner ambush warnings cannot repeat inside one clip'
      );
    }
    if (
      (
        candidate.primitiveId === 'corner-ambush-beam'
        || candidate.primitiveId === 'corner-ambush-ram'
      )
      && timelineClips.filter((clip) => (
        isRecord(clip) && clip.telegraphClipId === telegraphId
      )).length !== 1
    ) {
      pushIssue(
        issues,
        `${itemPath}/telegraphClipId`,
        'ambiguous_corner_ambush_telegraph',
        'A corner ambush action requires one dedicated target telegraph'
      );
    }
    if (
      candidate.trigger === 'time'
      && telegraph.trigger === 'time'
      && typeof candidate.startSeconds === 'number'
      && typeof telegraph.startSeconds === 'number'
      && telegraph.startSeconds >= candidate.startSeconds
    ) {
      pushIssue(issues, `${itemPath}/telegraphClipId`, 'invalid_telegraph_order', 'Telegraph clips must begin before their damaging action');
    } else if (
      candidate.trigger === 'time'
      && telegraph.trigger === 'time'
      && typeof candidate.startSeconds === 'number'
      && typeof telegraph.startSeconds === 'number'
    ) {
      const warningLeadSeconds = candidate.startSeconds - telegraph.startSeconds;
      if (warningLeadSeconds < 0.1) {
        pushIssue(
          issues,
          `${itemPath}/telegraphClipId`,
          'insufficient_telegraph_lead',
          'Damaging actions require at least 0.1 seconds of warning lead'
        );
      }
      const declaredWarningSeconds = isRecord(telegraph.parameters)
        && typeof telegraph.parameters.warningSeconds === 'number'
        ? telegraph.parameters.warningSeconds
        : undefined;
      if (
        declaredWarningSeconds !== undefined
        && warningLeadSeconds + EPSILON < declaredWarningSeconds
      ) {
        pushIssue(
          issues,
          `${itemPath}/telegraphClipId`,
          'incomplete_telegraph_lead',
          'The damaging action begins before its declared warning lead completes'
        );
      }
      if (
        (
          candidate.primitiveId === 'corner-ambush-beam'
          || candidate.primitiveId === 'corner-ambush-ram'
        )
        && (
          warningLeadSeconds < CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS
          || warningLeadSeconds > CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS
        )
      ) {
        pushIssue(
          issues,
          `${itemPath}/telegraphClipId`,
          'invalid_corner_ambush_warning',
          `Corner ambush actions require ${CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS}-${CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS} seconds of warning`
        );
      }
      if (
        (
          candidate.primitiveId === 'corner-ambush-beam'
          || candidate.primitiveId === 'corner-ambush-ram'
        )
        && (
          declaredWarningSeconds === undefined
          || declaredWarningSeconds < CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS
          || declaredWarningSeconds > CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS
        )
      ) {
        pushIssue(
          issues,
          `${itemPath}/telegraphClipId`,
          'invalid_corner_ambush_warning_declaration',
          `Corner ambush target telegraphs must declare ${CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS}-${CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS} warningSeconds`
        );
      }
    }

    const attackRepeatCount = isRecord(candidate.repeat)
      && typeof candidate.repeat.count === 'number'
      && Number.isFinite(candidate.repeat.count)
      ? Math.max(1, Math.min(8, Math.floor(candidate.repeat.count)))
      : 1;
    if (attackRepeatCount > 1) {
      const telegraphRepeatCount = isRecord(telegraph.repeat)
        && typeof telegraph.repeat.count === 'number'
        && Number.isFinite(telegraph.repeat.count)
        ? Math.max(1, Math.min(8, Math.floor(telegraph.repeat.count)))
        : 1;
      const attackInterval = isRecord(candidate.repeat)
        && typeof candidate.repeat.intervalSeconds === 'number'
        ? candidate.repeat.intervalSeconds
        : undefined;
      const telegraphInterval = isRecord(telegraph.repeat)
        && typeof telegraph.repeat.intervalSeconds === 'number'
        ? telegraph.repeat.intervalSeconds
        : undefined;
      if (telegraphRepeatCount < attackRepeatCount) {
        pushIssue(
          issues,
          `${itemPath}/telegraphClipId`,
          'missing_repeated_telegraph',
          'Every repeated damaging execution must have a corresponding repeated telegraph'
        );
      }
      if (
        attackInterval !== undefined
        && (telegraphInterval === undefined || Math.abs(attackInterval - telegraphInterval) > EPSILON)
      ) {
        pushIssue(
          issues,
          `${itemPath}/telegraphClipId`,
          'mismatched_telegraph_repeat',
          'A repeated telegraph must use the same interval as its damaging action'
        );
      }
    }
  });

  if (value.attacks !== undefined) {
    const attacksPath = `${path}/attacks`;
    if (checkArray(value.attacks, attacksPath, issues)) {
      if (value.attacks.length !== 4) {
        pushIssue(
          issues,
          attacksPath,
          'invalid_attack_roster',
          'Boss Factory timelines require exactly three core attacks and one signature attack'
        );
      }
      const attackIds = new Set<string>();
      const usedBeatReferences = new Set<string>();
      const usedRecoveryReferences = new Set<string>();
      let coreAttackCount = 0;
      let signatureAttackCount = 0;
      const windowsByPhase = new Map<string, Array<{
        startSeconds: number;
        endSeconds: number;
        path: string;
      }>>();
      value.attacks.forEach((candidate, attackIndex) => {
        const attackPath = `${attacksPath}/${attackIndex}`;
        if (!isRecord(candidate)) {
          pushIssue(issues, attackPath, 'required_object', 'Boss attack sentences must be objects');
          return;
        }
        checkKeys(candidate, BOSS_ATTACK_SENTENCE_KEYS, attackPath, issues);
        if (checkString(candidate.id, `${attackPath}/id`, issues, { id: true })) {
          const attackId = candidate.id as string;
          if (attackIds.has(attackId)) {
            pushIssue(issues, `${attackPath}/id`, 'duplicate_id', `Duplicate boss attack sentence id: ${attackId}`);
          }
          if (clipIds.has(attackId)) {
            pushIssue(issues, `${attackPath}/id`, 'duplicate_id', 'Attack sentence IDs cannot collide with timeline clip IDs');
          }
          attackIds.add(attackId);
        }
        checkString(candidate.label, `${attackPath}/label`, issues, { max: 100 });
        if (typeof candidate.role !== 'string' || !BOSS_ATTACK_SENTENCE_ROLES.has(candidate.role)) {
          pushIssue(issues, `${attackPath}/role`, 'unsupported_value', `Unsupported boss attack role: ${String(candidate.role)}`);
        } else if (candidate.role === 'core') {
          coreAttackCount += 1;
        } else {
          signatureAttackCount += 1;
        }
        if (typeof candidate.skillTest !== 'string' || !BOSS_ATTACK_SKILL_TESTS.has(candidate.skillTest)) {
          pushIssue(issues, `${attackPath}/skillTest`, 'unsupported_value', `Unsupported boss attack skill test: ${String(candidate.skillTest)}`);
        }
        checkString(candidate.recognitionCue, `${attackPath}/recognitionCue`, issues, { max: 160 });
        checkString(candidate.solution, `${attackPath}/solution`, issues, { max: 200 });
        if (
          typeof candidate.safeRouteRule !== 'string'
          || !BOSS_ATTACK_SAFE_ROUTE_RULES.has(candidate.safeRouteRule)
        ) {
          pushIssue(
            issues,
            `${attackPath}/safeRouteRule`,
            'unsupported_value',
            `Unsupported boss attack safe-route rule: ${String(candidate.safeRouteRule)}`
          );
        }
        if (checkArray(candidate.sourceSocketRoles, `${attackPath}/sourceSocketRoles`, issues)) {
          if (candidate.sourceSocketRoles.length > 3) {
            pushIssue(issues, `${attackPath}/sourceSocketRoles`, 'too_many_items', 'Attack sentences support at most three socket roles');
          }
          const sourceRoles = new Set<string>();
          candidate.sourceSocketRoles.forEach((role, roleIndex) => {
            const rolePath = `${attackPath}/sourceSocketRoles/${roleIndex}`;
            if (typeof role !== 'string' || !BOSS_ATTACK_SOCKET_ROLES.has(role)) {
              pushIssue(issues, rolePath, 'unsupported_value', `Unsupported boss attack socket role: ${String(role)}`);
              return;
            }
            if (sourceRoles.has(role)) {
              pushIssue(issues, rolePath, 'duplicate_value', `Duplicate boss attack socket role: ${role}`);
            }
            sourceRoles.add(role);
          });
        }
        if (!checkArray(candidate.variants, `${attackPath}/variants`, issues)) return;
        const variantPhases = new Set<string>();
        candidate.variants.forEach((variant, variantIndex) => {
          const variantPath = `${attackPath}/variants/${variantIndex}`;
          if (!isRecord(variant)) {
            pushIssue(issues, variantPath, 'required_object', 'Boss attack variants must be objects');
            return;
          }
          checkKeys(variant, BOSS_ATTACK_SENTENCE_VARIANT_KEYS, variantPath, issues);
          const phaseId = typeof variant.phaseId === 'string' ? variant.phaseId : '';
          if (!phaseIds.has(phaseId)) {
            pushIssue(issues, `${variantPath}/phaseId`, 'unknown_reference', `Unknown boss phase: ${String(variant.phaseId)}`);
          }
          if (variantPhases.has(phaseId)) {
            pushIssue(issues, `${variantPath}/phaseId`, 'duplicate_value', `Attack sentence has duplicate phase variant: ${phaseId}`);
          }
          variantPhases.add(phaseId);
          let firstWarningStart = Number.POSITIVE_INFINITY;
          let finalBeatEnd = Number.NEGATIVE_INFINITY;
          let previousBeatStart = Number.NEGATIVE_INFINITY;
          let expandedBeatCount = 0;
          if (checkArray(variant.beatClipIds, `${variantPath}/beatClipIds`, issues)) {
            if (variant.beatClipIds.length > 8) {
              pushIssue(issues, `${variantPath}/beatClipIds`, 'too_many_items', 'Attack variants support at most eight clip references');
            }
            const localBeatIds = new Set<string>();
            variant.beatClipIds.forEach((clipId, beatIndex) => {
              const beatPath = `${variantPath}/beatClipIds/${beatIndex}`;
              if (!checkString(clipId, beatPath, issues, { id: true })) return;
              const beatId = clipId as string;
              if (localBeatIds.has(beatId)) {
                pushIssue(issues, beatPath, 'duplicate_value', `Duplicate attack beat clip: ${beatId}`);
              }
              localBeatIds.add(beatId);
              const beat = clipsById.get(beatId);
              if (!beat) {
                pushIssue(issues, beatPath, 'unknown_reference', `Unknown boss timeline clip: ${beatId}`);
                return;
              }
              if (
                typeof beat.primitiveId !== 'string'
                || !Object.prototype.hasOwnProperty.call(BOSS_TIMELINE_PRIMITIVES, beat.primitiveId)
                || !isDamagingBossTimelinePrimitive(beat.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES)
                || beat.trigger !== 'time'
              ) {
                pushIssue(issues, beatPath, 'invalid_reference', 'Attack beats must reference damaging time-based clips');
              }
              if (beat.phaseId !== phaseId) {
                pushIssue(issues, beatPath, 'invalid_reference', 'Attack beats must belong to the variant phase');
              }
              const startSeconds = typeof beat.startSeconds === 'number' ? beat.startSeconds : 0;
              if (startSeconds <= previousBeatStart) {
                pushIssue(issues, beatPath, 'invalid_timing', 'Attack beat clips must be strictly chronological');
              }
              previousBeatStart = startSeconds;
              const repeatCount = isRecord(beat.repeat) && typeof beat.repeat.count === 'number'
                ? Math.max(1, Math.min(8, Math.floor(beat.repeat.count)))
                : 1;
              const repeatInterval = isRecord(beat.repeat) && typeof beat.repeat.intervalSeconds === 'number'
                ? beat.repeat.intervalSeconds
                : 0;
              expandedBeatCount += repeatCount;
              finalBeatEnd = Math.max(
                finalBeatEnd,
                startSeconds + (repeatCount - 1) * repeatInterval
                  + (typeof beat.durationSeconds === 'number' ? beat.durationSeconds : 0)
              );
              const warning = typeof beat.telegraphClipId === 'string'
                ? clipsById.get(beat.telegraphClipId)
                : undefined;
              if (warning && typeof warning.startSeconds === 'number') {
                firstWarningStart = Math.min(firstWarningStart, warning.startSeconds);
              }
              const ownershipKey = `${phaseId}:${beatId}`;
              if (usedBeatReferences.has(ownershipKey)) {
                pushIssue(issues, beatPath, 'duplicate_reference', 'A damaging clip can belong to only one attack variant in a phase');
              }
              usedBeatReferences.add(ownershipKey);
            });
          }
          const requiredBeats = candidate.role === 'signature' ? 4 : 2;
          if (expandedBeatCount < requiredBeats) {
            pushIssue(
              issues,
              `${variantPath}/beatClipIds`,
              'too_few_items',
              `${candidate.role === 'signature' ? 'Signature' : 'Core'} attacks require at least ${requiredBeats} connected beats`
            );
          }
          if (!checkString(variant.recoveryClipId, `${variantPath}/recoveryClipId`, issues, { id: true })) return;
          const recovery = clipsById.get(variant.recoveryClipId as string);
          if (!recovery) {
            pushIssue(issues, `${variantPath}/recoveryClipId`, 'unknown_reference', `Unknown boss timeline clip: ${String(variant.recoveryClipId)}`);
            return;
          }
          if (recovery.primitiveId !== 'effect-cue' || recovery.trigger !== 'time') {
            pushIssue(issues, `${variantPath}/recoveryClipId`, 'invalid_reference', 'Attack recovery must reference a time-based effect cue');
          }
          if (recovery.phaseId !== phaseId) {
            pushIssue(issues, `${variantPath}/recoveryClipId`, 'invalid_reference', 'Attack recovery must belong to the variant phase');
          }
          const recoveryOwnershipKey = `${phaseId}:${String(variant.recoveryClipId)}`;
          if (usedRecoveryReferences.has(recoveryOwnershipKey)) {
            pushIssue(
              issues,
              `${variantPath}/recoveryClipId`,
              'duplicate_reference',
              'An attack recovery clip can belong to only one attack variant in a phase'
            );
          }
          usedRecoveryReferences.add(recoveryOwnershipKey);
          const recoveryStart = typeof recovery.startSeconds === 'number' ? recovery.startSeconds : 0;
          if (Number.isFinite(finalBeatEnd) && recoveryStart + EPSILON < finalBeatEnd) {
            pushIssue(issues, `${variantPath}/recoveryClipId`, 'invalid_timing', 'Attack recovery must start after the final repeated beat');
          }
          if (Number.isFinite(firstWarningStart)) {
            const phaseWindows = windowsByPhase.get(phaseId) ?? [];
            phaseWindows.push({
              startSeconds: firstWarningStart,
              endSeconds: recoveryStart + (
                typeof recovery.durationSeconds === 'number' ? recovery.durationSeconds : 0
              ),
              path: variantPath
            });
            windowsByPhase.set(phaseId, phaseWindows);
          }
        });
        if (
          variantPhases.size !== phaseIds.size
          || [...phaseIds].some((phaseId) => !variantPhases.has(phaseId))
        ) {
          pushIssue(
            issues,
            `${attackPath}/variants`,
            'missing_phase_variant',
            'Every Boss Factory attack requires exactly one variant for every boss phase'
          );
        }
      });
      if (coreAttackCount !== 3 || signatureAttackCount !== 1) {
        pushIssue(
          issues,
          attacksPath,
          'invalid_attack_roster',
          'Boss Factory timelines require exactly three core attacks and one signature attack'
        );
      }
      timelineClips.forEach((clip, clipIndex) => {
        if (
          !isRecord(clip)
          || typeof clip.primitiveId !== 'string'
          || !Object.prototype.hasOwnProperty.call(BOSS_TIMELINE_PRIMITIVES, clip.primitiveId)
          || !isDamagingBossTimelinePrimitive(clip.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES)
          || clip.trigger !== 'time'
        ) return;
        const phaseId = typeof clip.phaseId === 'string' ? clip.phaseId : '';
        if (typeof clip.id !== 'string' || usedBeatReferences.has(`${phaseId}:${clip.id}`)) return;
        pushIssue(
          issues,
          `${path}/clips/${clipIndex}/id`,
          'unowned_attack_beat',
          'Every damaging clip in a Boss Factory timeline must belong to exactly one attack variant'
        );
      });
      windowsByPhase.forEach((windows) => {
        windows.sort((left, right) => left.startSeconds - right.startSeconds);
        for (let index = 1; index < windows.length; index += 1) {
          if (windows[index].startSeconds + EPSILON < windows[index - 1].endSeconds) {
            pushIssue(
              issues,
              windows[index].path,
              'overlapping_attack_sentence',
              'Boss attack sentence windows cannot overlap within one phase'
            );
          }
        }
      });
    }
  }

  const phaseContexts = phaseIds.size > 0 ? [...phaseIds] : [undefined];
  const entityCost = (clip: UnknownRecord) => {
    const parameters = isRecord(clip.parameters) ? clip.parameters : {};
    if (clip.primitiveId === 'cross-beam') return 2;
    if (clip.primitiveId === 'rail-sweep') return 1;
    if (clip.primitiveId === 'radial-beam-array') return 4;
    if (clip.primitiveId === 'corner-ambush-beam') return 1;
    if (clip.primitiveId === 'corner-ambush-ram') return 1;
    if (clip.primitiveId === 'rotor-hazard-sentence') {
      const pulseIntervalSeconds = typeof parameters.pulseIntervalSeconds === 'number'
        ? parameters.pulseIntervalSeconds
        : 1;
      const pulses = Math.max(
        1,
        Math.ceil((Number(clip.durationSeconds) || 1) / pulseIntervalSeconds)
      );
      const pelletCount = typeof parameters.projectileCount === 'number'
        ? parameters.projectileCount
        : 6;
      return pulses * pelletCount + Math.floor(pulses / 2) * 2;
    }
    if (clip.primitiveId === 'summon-formation') {
      return typeof parameters.summonCount === 'number' ? parameters.summonCount : 4;
    }
    const defaults: Record<string, number> = {
      'aimed-burst': 24,
      'gap-ring': 24,
      'tail-fan': 5,
      'inward-collapse': 20,
      'rotating-cross': 8,
      'helix-volley': 24,
      'side-barrage': 8,
      'pod-volley': 6,
      'weave-wall': 24
    };
    return typeof parameters.projectileCount === 'number'
      ? parameters.projectileCount
      : (defaults[String(clip.primitiveId)] ?? 0);
  };
  phaseContexts.forEach((phaseId) => {
    const frameBudgets = new Map<number, number>();
    const frameCueCounts = new Map<number, number>();
    let loopBudget = 0;
    timelineClips.forEach((candidate) => {
      if (
        !isRecord(candidate)
        || candidate.trigger !== 'time'
        || (candidate.phaseId !== undefined && candidate.phaseId !== phaseId)
      ) return;
      const repeatCount = isRecord(candidate.repeat) && typeof candidate.repeat.count === 'number'
        ? Math.max(1, Math.min(8, Math.floor(candidate.repeat.count)))
        : 1;
      const intervalSeconds = isRecord(candidate.repeat) && typeof candidate.repeat.intervalSeconds === 'number'
        ? candidate.repeat.intervalSeconds
        : 0;
      const startSeconds = typeof candidate.startSeconds === 'number' ? candidate.startSeconds : 0;
      const damaging = typeof candidate.primitiveId === 'string'
        && Object.prototype.hasOwnProperty.call(BOSS_TIMELINE_PRIMITIVES, candidate.primitiveId)
        && isDamagingBossTimelinePrimitive(candidate.primitiveId as keyof typeof BOSS_TIMELINE_PRIMITIVES);
      const cost = damaging ? Math.max(0, entityCost(candidate)) : 0;
      if (damaging) loopBudget += cost * repeatCount;
      for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
        const executionFrame = toBossTimelineFrame(
          startSeconds + repeatIndex * intervalSeconds
        );
        frameCueCounts.set(
          executionFrame,
          (frameCueCounts.get(executionFrame) ?? 0) + 1
        );
        if (damaging) {
          frameBudgets.set(
            executionFrame,
            (frameBudgets.get(executionFrame) ?? 0) + cost
          );
        }
      }
    });
    const phaseLabel = phaseId ?? 'all phases';
    if (loopBudget > 512) {
      pushIssue(
        issues,
        `${path}/clips`,
        'timeline_entity_budget',
        `Boss timeline exceeds the 512-entity loop budget in ${phaseLabel}`
      );
    }
    for (const [executionFrame, cueCount] of frameCueCounts) {
      if (cueCount <= BOSS_TIMELINE_MAX_CUES_PER_FRAME) continue;
      pushIssue(
        issues,
        `${path}/clips`,
        'simultaneous_cue_budget',
        `Boss timeline schedules ${cueCount} cues on simulation frame ${executionFrame} in ${phaseLabel}; the limit is ${BOSS_TIMELINE_MAX_CUES_PER_FRAME}`
      );
    }
    for (const [executionFrame, budget] of frameBudgets) {
      if (budget <= 64) continue;
      pushIssue(
        issues,
        `${path}/clips`,
        'simultaneous_entity_budget',
        `Boss timeline requests ${budget} damaging entities on simulation frame ${executionFrame} in ${phaseLabel}; the limit is 64`
      );
    }
    for (const trigger of ['phase-enter', 'death'] as const) {
      const cueCount = timelineClips.filter((candidate) => (
        isRecord(candidate)
        && candidate.trigger === trigger
        && (candidate.phaseId === undefined || candidate.phaseId === phaseId)
      )).length;
      if (cueCount <= BOSS_TIMELINE_MAX_CUES_PER_FRAME) continue;
      pushIssue(
        issues,
        `${path}/clips`,
        'triggered_cue_budget',
        `Boss timeline schedules ${cueCount} ${trigger} cues in ${phaseLabel}; the limit is ${BOSS_TIMELINE_MAX_CUES_PER_FRAME}`
      );
    }
  });
};

const validateBoss = (event: UnknownRecord, path: string, issues: CampaignValidationIssue[]) => {
  const bossKnown = checkCatalogRef(event.bossId, BOSS_CATALOG, `${path}/bossId`, issues);
  if (event.rigId !== undefined) {
    if (typeof event.rigId !== 'string' || !BOSS_RIG_IDS.has(event.rigId)) {
      pushIssue(issues, `${path}/rigId`, 'unknown_reference', `Unknown boss rig: ${String(event.rigId)}`);
    }
    if (event.bossId !== 'gatekeeper') {
      pushIssue(issues, `${path}/rigId`, 'unsupported_boss_rig', 'Layered boss rigs are supported only by gatekeepers');
    }
  }
  if (event.componentMode !== undefined && (
    typeof event.componentMode !== 'string'
    || !BOSS_COMPONENT_MODES.has(event.componentMode)
  )) {
    pushIssue(
      issues,
      `${path}/componentMode`,
      'unsupported_value',
      `Unsupported boss component mode: ${String(event.componentMode)}`
    );
  }
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
  if (event.sizeMultiplier !== undefined) checkNumber(event.sizeMultiplier, `${path}/sizeMultiplier`, issues, 0.5, 2.5);
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
  if (event.revival !== undefined) {
    const revivalPath = `${path}/revival`;
    if (!isRecord(event.revival)) {
      pushIssue(issues, revivalPath, 'required_object', 'Boss revival must be an object');
    } else {
      checkKeys(event.revival, BOSS_REVIVAL_KEYS, revivalPath, issues);
      const phaseIdKnown = checkString(
        event.revival.phaseId,
        `${revivalPath}/phaseId`,
        issues,
        { id: true }
      );
      checkNumber(event.revival.shutdownSeconds, `${revivalPath}/shutdownSeconds`, issues, 0.1, 10);
      checkNumber(event.revival.rebootSeconds, `${revivalPath}/rebootSeconds`, issues, 0.1, 10);
      checkNumber(event.revival.restoreHealthRatio, `${revivalPath}/restoreHealthRatio`, issues, Number.EPSILON, 1);
      checkNumber(event.revival.awakenedSizeMultiplier, `${revivalPath}/awakenedSizeMultiplier`, issues, 1, 1.5);
      if (phaseIdKnown) {
        const phaseId = event.revival.phaseId as string;
        if (!phaseIds.has(phaseId)) {
          pushIssue(
            issues,
            `${revivalPath}/phaseId`,
            'unknown_reference',
            `Unknown boss revival phase: ${phaseId}`
          );
        }
        const firstPhase = Array.isArray(event.phases) && isRecord(event.phases[0])
          ? event.phases[0].id
          : undefined;
        if (phaseId === firstPhase) {
          pushIssue(
            issues,
            `${revivalPath}/phaseId`,
            'invalid_revival_phase',
            'Boss revival must target a phase after the opening phase'
          );
        }
      }
    }
  }
  validateBossTimeline(event.timeline, `${path}/timeline`, issues, phaseIds);
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
    validateFormationSlots(candidate.formationSlots, `${path}/formationSlots`, issues, candidate.count, candidate.patternId);
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
  if (typeof candidate.completionRule !== 'string' || !WAVE_COMPLETION_RULES.has(candidate.completionRule)) {
    pushIssue(
      issues,
      `${path}/completionRule`,
      'unknown_reference',
      `Unknown wave completion rule: ${String(candidate.completionRule)}`
    );
  }
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

    const mainBossCount = candidate.events.filter((event) => (
      isRecord(event) && event.kind === 'boss' && event.bossId === 'gatekeeper'
    )).length;
    if (candidate.completionRule === 'boss-defeat' && mainBossCount === 0) {
      pushIssue(issues, `${path}/completionRule`, 'missing_main_boss', 'Boss-defeat waves require a Gatekeeper event');
    }
    if (candidate.completionRule === 'clear-after-duration' && mainBossCount > 0) {
      pushIssue(issues, `${path}/completionRule`, 'unexpected_main_boss', 'Clear-after-duration waves cannot contain a Gatekeeper event');
    }
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
  validateCampaignProgression(candidate.campaignProgression, `${path}/campaignProgression`, issues, candidate.id);

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
    const campaignMissionIds = new Set(value.levels.flatMap((level) => (
      isRecord(level) && typeof level.id === 'string' ? [level.id] : []
    )));
    value.levels.forEach((level, index) => {
      if (!isRecord(level) || !isRecord(level.campaignProgression)) return;
      const nextMissionId = level.campaignProgression.nextMissionId;
      if (typeof nextMissionId !== 'string') return;
      if (!campaignMissionIds.has(nextMissionId)) {
        pushIssue(
          issues,
          `/levels/${index}/campaignProgression/nextMissionId`,
          'unknown_reference',
          `Unknown next Campaign Mission: ${nextMissionId}`
        );
      } else if (nextMissionId === level.id) {
        pushIssue(
          issues,
          `/levels/${index}/campaignProgression/nextMissionId`,
          'circular_reference',
          'A Campaign Mission cannot unlock itself'
        );
      }
    });
  }
  return { valid: issues.length === 0, issues };
};

export const assertValidGameCampaign: (value: unknown) => asserts value is GameCampaignConfig = (value) => {
  const result = validateGameCampaign(value);
  if (!result.valid) throw new CampaignValidationError(result.issues);
};

export const parseGameCampaign = (value: unknown): GameCampaignConfig => {
  const migrated = migrateLegacyGameCampaign(value);
  assertValidGameCampaign(migrated);
  return migrated;
};

/** Convenience types for editor/runtime call sites that narrow discriminated events. */
export const isBossEvent = (event: WaveEvent): event is BossEvent => event.kind === 'boss';
export const isBlockingEvent = (event: WaveEvent) => event.blocksWaveClock;
export const getLevelValidationPath = (level: LevelDefinition) => `/levels/${level.id}`;
export const getWaveValidationPath = (wave: WaveDefinition) => `/waves/${wave.id}`;
