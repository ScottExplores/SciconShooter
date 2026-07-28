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

const CAMPAIGN_KEYS = [
  'schemaVersion', 'revision', 'id', 'name', 'updatedAt', 'fps', 'recordCard', 'hudAssets', 'levels',
  'sectors', 'visualThemes', 'enemyRoles', 'formationPacks', 'miniBosses', 'campaignBranches'
];
const HUD_ASSET_KEYS = ['bombIconAssetKey'];
const LEVEL_KEYS = ['id', 'name', 'description', 'order', 'backgroundId', 'musicId', 'startingDifficulty', 'scoreTarget', 'durationSeconds', 'loopWaves', 'availablePowerupIds', 'scorecard', 'campaignProgression', 'waves'];
const SCORECARD_KEYS = ['trigger', 'title', 'subtitle', 'scoreLabel', 'metrics', 'showEncounterArt', 'encounterAssetKey'];
const CAMPAIGN_PROGRESSION_KEYS = [
  'reward', 'masteryObjectives', 'masterySetBonusCoins', 'sectorId', 'missionRole', 'combatBudget',
  'recommendedPower', 'testedLoadouts', 'recommendedSupportTags', 'mapPosition', 'nextMissionId'
];
const CAMPAIGN_RECOMMENDED_POWER_KEYS = ['minimum', 'expected', 'comfortable'];
const CAMPAIGN_TESTED_LOADOUT_KEYS = ['lowPower', 'expectedPower', 'upgraded'];
const CAMPAIGN_SECTOR_KEYS = ['id', 'order', 'name', 'themeId', 'missionIds', 'majorBossId', 'branchIds'];
const CAMPAIGN_VISUAL_THEME_KEYS = ['id', 'label', 'backgroundId', 'accent', 'description'];
const ENEMY_ROLE_KEYS = [
  'id', 'label', 'enemyId', 'spriteKey', 'role', 'threatCost', 'introductionSector',
  'introductionMission', 'durabilityClass', 'fireBehavior', 'entryBehavior',
  'compatibleFormationPackIds', 'synergyTags', 'reuseCooldownWaves', 'maximumSimultaneousCount',
  'performanceCost'
];
const FORMATION_PACK_KEYS = [
  'id', 'label', 'enemyRoleIds', 'enemyCount', 'totalThreatCost', 'entryDirection', 'entryPath',
  'formationShape', 'firingBehavior', 'synergyAdjustment', 'minimumSector',
  'maximumSimultaneousInstances', 'recoveryRequiredSeconds', 'compatibleMissionRoles',
  'compatibleSectorIds', 'mobilePerformanceCost'
];
const MINI_BOSS_KEYS = [
  'id', 'bossId', 'label', 'visualIdentity', 'combatRole', 'mainAttacks', 'suitableSectorIds',
  'threatCost', 'recommendedPower', 'usage', 'campaignReady', 'validationStatus'
];
const CAMPAIGN_REWARD_KEYS = ['waveClearCoins', 'missionClearCoins', 'firstClearCoins', 'bossFirstClearCoins', 'replayMultiplier'];
const CAMPAIGN_MASTERY_OBJECTIVE_KEYS = ['id', 'label', 'kind', 'target', 'rewardCoins'];
const CAMPAIGN_MAP_POSITION_KEYS = ['x', 'y'];
const CAMPAIGN_BRANCH_KEYS = [
  'branchId', 'sourceMissionId', 'unlockCondition', 'requiredStars', 'missionType', 'displayName',
  'hiddenName', 'mapPosition', 'routeControlPoints', 'icon', 'lockedIcon', 'rewardPreview',
  'oneTimeCompletion', 'replayPolicy', 'failurePolicy', 'rewardCommitPolicy', 'missionDefinitionId',
  'missionDefinition', 'completionReward', 'returnNodeId', 'nextBranchNodeId', 'discoveryState'
];
const CAMPAIGN_BRANCH_REWARD_PREVIEW_KEYS = ['category', 'label', 'minimumCoins', 'maximumCoins', 'hiddenUntilUnlocked'];
const CAMPAIGN_BRANCH_COMPLETION_REWARD_KEYS = [
  'baseCoins', 'oneTimeBonusCoins', 'maximumPerformanceCoins', 'totalMinimumCoins', 'totalMaximumCoins'
];
const CAMPAIGN_PRESENT_DROP_MISSION_KEYS = [
  'id', 'kind', 'backgroundId', 'musicId', 'introSeconds', 'durationSeconds', 'exitSeconds',
  'successCondition', 'presentTypes', 'spawnGroups'
];
const CAMPAIGN_COMBAT_BRANCH_MISSION_KEYS = [
  'id', 'kind', 'backgroundId', 'musicId', 'introSeconds', 'durationSeconds', 'exitSeconds',
  'successCondition', 'threatCap', 'combatBudget', 'rhythm', 'availablePowerupIds', 'events'
];
const CAMPAIGN_PRESENT_TYPE_KEYS = [
  'id', 'displayName', 'kind', 'spriteKey', 'health', 'coinValue', 'speedMultiplier', 'sizeMultiplier'
];
const CAMPAIGN_PRESENT_GROUP_KEYS = [
  'id', 'startSeconds', 'count', 'presentTypeId', 'patternId', 'spawnIntervalSeconds'
];
const RECORD_CARD_KEYS = ['copy', 'colors', 'showGrid', 'shipAssetKey', 'encounterAssetKey', 'art'];
const RECORD_CARD_COPY_KEYS = ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'verifiedLabel', 'reviewLabel', 'metricLabels'];
const RECORD_CARD_METRIC_LABEL_KEYS = ['wave', 'targets', 'coins', 'flight'];
const RECORD_CARD_COLOR_KEYS = ['background', 'panel', 'primary', 'secondary', 'success', 'warning', 'text', 'muted'];
const RECORD_CARD_ART_KEYS = ['ship', 'encounter'];
const RECORD_CARD_REGION_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible'];
const WAVE_KEYS = [
  'id', 'name', 'order', 'accent', 'backgroundId', 'completionRule', 'difficultyMultiplier',
  'durationSeconds', 'introSeconds', 'delayAfterSeconds', 'scoreMultiplier', 'threatCap',
  'combatBudget', 'rhythm', 'formationPackIds', 'events'
];
const BASE_EVENT_KEYS = ['id', 'kind', 'label', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor'];
const EVENT_KEYS: Record<string, string[]> = {
  spawn: [...BASE_EVENT_KEYS, 'count', 'patternId', 'positionId', 'spawnIntervalSeconds', 'formationSlots', 'enemies'],
  boss: [...BASE_EVENT_KEYS, 'bossId', 'rigId', 'componentMode', 'componentHealth', 'count', 'spriteKey', 'spriteStyle', 'positionId', 'movementPatternId', 'warningSeconds', 'health', 'speed', 'damage', 'scoreReward', 'powerupDropChance', 'shieldCount', 'sizeMultiplier', 'weapons', 'phases', 'revival', 'timeline'],
  'asteroid-belt': [...BASE_EVENT_KEYS, 'spriteKey', 'spriteStyle', 'count', 'density', 'patternId', 'positionId', 'spawnIntervalSeconds', 'warningSeconds', 'health', 'speed', 'damage', 'scoreValue', 'powerupDropChance', 'coinDropValue', 'bonusTargetKind'],
  powerup: [...BASE_EVENT_KEYS, 'positionId', 'spawnIntervalSeconds', 'powerupIds'],
  recovery: [...BASE_EVENT_KEYS, 'positionId', 'coinCount', 'powerupIds']
};
const SPAWN_ENEMY_KEYS = [
  'enemyId',
  'roleId',
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
const CAMPAIGN_MISSION_ROLES = new Set([
  'introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'
]);
const CAMPAIGN_MISSION_ROLE_ORDER = [
  'introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'
] as const;
const CAMPAIGN_WAVE_RHYTHMS = new Set([
  'warm-up', 'introduce', 'variation', 'support', 'recovery', 'peak', 'clear', 'boss'
]);
const ENEMY_DURABILITY_CLASSES = new Set(['light', 'standard', 'armored', 'elite']);
const ENEMY_GAMEPLAY_ROLES = new Set([
  'formation-unit', 'diver', 'flanker', 'shooter', 'burst-shooter', 'suppressor',
  'armored-unit', 'support-unit', 'priority-target', 'formation-leader', 'elite'
]);
const ENEMY_FIRE_BEHAVIORS = new Set(['none', 'post-formation', 'aimed-burst']);
const ENEMY_ENTRY_BEHAVIORS = new Set(['formation', 'dive', 'flank', 'lane']);
const FORMATION_ENTRY_DIRECTIONS = new Set(['top', 'left', 'right', 'split']);
const FORMATION_FIRING_BEHAVIORS = new Set(['none', 'post-formation', 'staggered', 'priority']);
const SUPPORT_RECOMMENDATION_TAGS = new Set([
  'anti-swarm', 'anti-armor', 'lane-control', 'boss-damage', 'survival', 'anti-summon'
]);
const MINI_BOSS_IDS = new Set(['bottleneck-drone', 'paywall-wall']);
const MINI_BOSS_USAGES = new Set(['solo', 'paired', 'solo-or-paired']);
const MINI_BOSS_VALIDATION_STATUSES = new Set(['validated', 'provisional']);
const CAMPAIGN_BRANCH_MISSION_TYPES = new Set([
  'present-drop', 'elite-remix', 'mini-boss-signal', 'formation-challenge', 'support-trial',
  'mastery-mission', 'hidden-research-signal', 'research-cache'
]);
const CAMPAIGN_COMBAT_BRANCH_MISSION_TYPES = new Set([
  'elite-remix', 'formation-challenge', 'support-trial'
]);
const CAMPAIGN_BRANCH_NODE_ICONS = new Set([
  'present-drop-cache', 'encrypted-branch', 'elite-warning', 'mini-boss-signal',
  'formation-challenge', 'support-trial', 'mastery-prism', 'research-signal'
]);
const CAMPAIGN_BRANCH_REWARD_CATEGORIES = new Set([
  'upgrade-coins', 'coins-and-trophy', 'cosmetic', 'support-preview'
]);
const CAMPAIGN_BRANCH_REPLAY_POLICIES = new Set([
  'no-replay-after-claim', 'repeatable-no-reward', 'repeatable-rewarded'
]);
const CAMPAIGN_BRANCH_UNLOCK_KINDS = new Set([
  'all-stars-earned', 'sector-mastered', 'branch-completed', 'boss-defeated', 'achievement-earned',
  'hidden-object-discovered', 'support-challenge-completed'
]);
const CAMPAIGN_BRANCH_DISCOVERY_STATES = new Set(['encrypted', 'revealed']);
const PRESENT_DROP_PRESENT_KINDS = new Set(['standard', 'armored', 'fast', 'golden']);
const PRESENT_DROP_PATTERN_IDS = new Set(['lane-rain', 'staggered-columns', 'sine-sweep', 'final-center']);
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
  'prism-metamorphosis',
  'frontier-chainclaw-harpoon',
  'frontier-crown-cross-link',
  'frontier-reactor-charge',
  'frontier-reactor-fire',
  'frontier-bastion-crabwalk',
  'frontier-critical-cross-link',
  'frontier-stagger',
  'frontier-death'
]);
const BOSS_TIMELINE_ROTATION_DIRECTIONS = new Set([
  'clockwise',
  'counterclockwise',
  'seeded-random'
]);
const FRONTIER_CROWNCLAW_SANDBOX_EVENT_ID = 'sandbox-frontier-crownclaw';
const FRONTIER_CROWNCLAW_SANDBOX_PRIMITIVES = new Set([
  'chainclaw-harpoon',
  'crown-reactor-beam',
  'bastion-crabwalk-barrage'
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

  checkNumber(value.masterySetBonusCoins, `${path}/masterySetBonusCoins`, issues, 0, 1000000, true);
  checkString(value.sectorId, `${path}/sectorId`, issues, { id: true });
  if (typeof value.missionRole !== 'string' || !CAMPAIGN_MISSION_ROLES.has(value.missionRole)) {
    pushIssue(issues, `${path}/missionRole`, 'unknown_reference', `Unknown Campaign Mission role: ${String(value.missionRole)}`);
  }
  checkNumber(value.combatBudget, `${path}/combatBudget`, issues, Number.EPSILON, 1000000);

  if (!isRecord(value.recommendedPower)) {
    pushIssue(issues, `${path}/recommendedPower`, 'required_object', 'Recommended power bands are required');
  } else {
    const recommendedPower = value.recommendedPower;
    checkKeys(recommendedPower, CAMPAIGN_RECOMMENDED_POWER_KEYS, `${path}/recommendedPower`, issues);
    const bands = CAMPAIGN_RECOMMENDED_POWER_KEYS.map((key) => recommendedPower[key]);
    CAMPAIGN_RECOMMENDED_POWER_KEYS.forEach((key) => {
      checkNumber(recommendedPower[key], `${path}/recommendedPower/${key}`, issues, 0, 1000000000, true);
    });
    if (bands.every((band) => typeof band === 'number') && !(
      (bands[0] as number) <= (bands[1] as number) && (bands[1] as number) <= (bands[2] as number)
    )) {
      pushIssue(issues, `${path}/recommendedPower`, 'invalid_power_curve', 'Power bands must be ordered minimum <= expected <= comfortable');
    }
  }

  if (!isRecord(value.testedLoadouts)) {
    pushIssue(issues, `${path}/testedLoadouts`, 'required_object', 'Tested loadout bands are required');
  } else {
    const testedLoadouts = value.testedLoadouts;
    checkKeys(testedLoadouts, CAMPAIGN_TESTED_LOADOUT_KEYS, `${path}/testedLoadouts`, issues);
    CAMPAIGN_TESTED_LOADOUT_KEYS.forEach((key) => {
      checkString(testedLoadouts[key], `${path}/testedLoadouts/${key}`, issues, { max: 200 });
    });
  }

  if (checkArray(value.recommendedSupportTags, `${path}/recommendedSupportTags`, issues, true)) {
    checkUniqueStrings(value.recommendedSupportTags, `${path}/recommendedSupportTags`, issues);
    value.recommendedSupportTags.forEach((tag, index) => {
      if (typeof tag !== 'string' || !SUPPORT_RECOMMENDATION_TAGS.has(tag)) {
        pushIssue(issues, `${path}/recommendedSupportTags/${index}`, 'unknown_reference', `Unknown support recommendation tag: ${String(tag)}`);
      }
    });
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

const validateCampaignSectors = (value: unknown, issues: CampaignValidationIssue[]) => {
  if (!checkArray(value, '/sectors', issues)) return;
  const ids: unknown[] = [];
  const orders = new Set<number>();
  value.forEach((sector, index) => {
    const path = `/sectors/${index}`;
    if (!isRecord(sector)) {
      pushIssue(issues, path, 'required_object', 'Campaign sectors must be objects');
      return;
    }
    checkKeys(sector, CAMPAIGN_SECTOR_KEYS, path, issues);
    if (checkString(sector.id, `${path}/id`, issues, { id: true })) ids.push(sector.id);
    if (checkNumber(sector.order, `${path}/order`, issues, 1, 1000, true)) {
      if (orders.has(sector.order as number)) pushIssue(issues, `${path}/order`, 'duplicate_order', `Duplicate sector order: ${sector.order}`);
      orders.add(sector.order as number);
    }
    checkString(sector.name, `${path}/name`, issues, { max: 120 });
    checkString(sector.themeId, `${path}/themeId`, issues, { id: true });
    if (!Array.isArray(sector.missionIds) || sector.missionIds.length !== 5) {
      pushIssue(issues, `${path}/missionIds`, 'invalid_sector_shape', 'Campaign sectors must contain exactly five Missions');
    } else {
      sector.missionIds.forEach((missionId, missionIndex) => checkString(missionId, `${path}/missionIds/${missionIndex}`, issues, { id: true }));
      checkUniqueStrings(sector.missionIds, `${path}/missionIds`, issues);
    }
    if (!checkCatalogRef(sector.majorBossId, BOSS_CATALOG, `${path}/majorBossId`, issues)
      || BOSS_CATALOG[sector.majorBossId as keyof typeof BOSS_CATALOG]?.entityType !== 'BOSS') {
      pushIssue(issues, `${path}/majorBossId`, 'invalid_main_boss', 'Sector majorBossId must reference a canonical major boss');
    }
    if (checkArray(sector.branchIds, `${path}/branchIds`, issues, true)) {
      sector.branchIds.forEach((branchId, branchIndex) => checkString(branchId, `${path}/branchIds/${branchIndex}`, issues, { id: true }));
      checkUniqueStrings(sector.branchIds, `${path}/branchIds`, issues);
    }
  });
  checkUniqueStrings(ids, '/sectors/id', issues);
};

const validateCampaignVisualThemes = (value: unknown, issues: CampaignValidationIssue[]) => {
  if (!checkArray(value, '/visualThemes', issues)) return;
  const ids: unknown[] = [];
  value.forEach((theme, index) => {
    const path = `/visualThemes/${index}`;
    if (!isRecord(theme)) {
      pushIssue(issues, path, 'required_object', 'Campaign visual themes must be objects');
      return;
    }
    checkKeys(theme, CAMPAIGN_VISUAL_THEME_KEYS, path, issues);
    if (checkString(theme.id, `${path}/id`, issues, { id: true })) ids.push(theme.id);
    checkString(theme.label, `${path}/label`, issues, { max: 120 });
    checkCatalogRef(theme.backgroundId, BACKGROUND_CATALOG, `${path}/backgroundId`, issues);
    checkString(theme.accent, `${path}/accent`, issues, { color: true });
    checkString(theme.description, `${path}/description`, issues, { max: 500 });
  });
  checkUniqueStrings(ids, '/visualThemes/id', issues);
};

const validateEnemyRoleManifest = (value: unknown, issues: CampaignValidationIssue[]) => {
  if (!checkArray(value, '/enemyRoles', issues)) return;
  const ids: unknown[] = [];
  value.forEach((role, index) => {
    const path = `/enemyRoles/${index}`;
    if (!isRecord(role)) {
      pushIssue(issues, path, 'required_object', 'Enemy roles must be objects');
      return;
    }
    checkKeys(role, ENEMY_ROLE_KEYS, path, issues);
    if (checkString(role.id, `${path}/id`, issues, { id: true })) ids.push(role.id);
    checkString(role.label, `${path}/label`, issues, { max: 120 });
    checkCatalogRef(role.enemyId, ENEMY_CATALOG, `${path}/enemyId`, issues);
    const spriteKnown = checkCatalogRef(role.spriteKey, ASSET_CATALOG, `${path}/spriteKey`, issues);
    if (spriteKnown && !isAssetAllowedForRole(role.spriteKey as string, 'enemy')) {
      pushIssue(issues, `${path}/spriteKey`, 'invalid_asset_role', 'Enemy role sprites must be registered for enemies');
    }
    if (typeof role.role !== 'string' || !ENEMY_GAMEPLAY_ROLES.has(role.role)) {
      pushIssue(issues, `${path}/role`, 'unknown_reference', `Unknown enemy gameplay role: ${String(role.role)}`);
    }
    checkNumber(role.threatCost, `${path}/threatCost`, issues, Number.EPSILON, 1000000);
    checkNumber(role.introductionSector, `${path}/introductionSector`, issues, 1, 1000, true);
    checkNumber(role.introductionMission, `${path}/introductionMission`, issues, 1, 5, true);
    if (typeof role.durabilityClass !== 'string' || !ENEMY_DURABILITY_CLASSES.has(role.durabilityClass)) {
      pushIssue(issues, `${path}/durabilityClass`, 'unknown_reference', `Unknown enemy durability class: ${String(role.durabilityClass)}`);
    }
    if (typeof role.fireBehavior !== 'string' || !ENEMY_FIRE_BEHAVIORS.has(role.fireBehavior)) {
      pushIssue(issues, `${path}/fireBehavior`, 'unknown_reference', `Unknown enemy fire behavior: ${String(role.fireBehavior)}`);
    }
    if (typeof role.entryBehavior !== 'string' || !ENEMY_ENTRY_BEHAVIORS.has(role.entryBehavior)) {
      pushIssue(issues, `${path}/entryBehavior`, 'unknown_reference', `Unknown enemy entry behavior: ${String(role.entryBehavior)}`);
    }
    if (checkArray(role.compatibleFormationPackIds, `${path}/compatibleFormationPackIds`, issues, true)) {
      role.compatibleFormationPackIds.forEach((id, itemIndex) => checkString(id, `${path}/compatibleFormationPackIds/${itemIndex}`, issues, { id: true }));
      checkUniqueStrings(role.compatibleFormationPackIds, `${path}/compatibleFormationPackIds`, issues);
    }
    if (checkArray(role.synergyTags, `${path}/synergyTags`, issues, true)) {
      role.synergyTags.forEach((tag, itemIndex) => checkString(tag, `${path}/synergyTags/${itemIndex}`, issues, { id: true }));
      checkUniqueStrings(role.synergyTags, `${path}/synergyTags`, issues);
    }
    checkNumber(role.reuseCooldownWaves, `${path}/reuseCooldownWaves`, issues, 0, 100, true);
    checkNumber(role.maximumSimultaneousCount, `${path}/maximumSimultaneousCount`, issues, 1, 1000, true);
    checkNumber(role.performanceCost, `${path}/performanceCost`, issues, Number.EPSILON, 1000000);
  });
  checkUniqueStrings(ids, '/enemyRoles/id', issues);
};

const validateFormationPackManifest = (value: unknown, issues: CampaignValidationIssue[]) => {
  if (!checkArray(value, '/formationPacks', issues)) return;
  const ids: unknown[] = [];
  value.forEach((pack, index) => {
    const path = `/formationPacks/${index}`;
    if (!isRecord(pack)) {
      pushIssue(issues, path, 'required_object', 'Formation packs must be objects');
      return;
    }
    checkKeys(pack, FORMATION_PACK_KEYS, path, issues);
    if (checkString(pack.id, `${path}/id`, issues, { id: true })) ids.push(pack.id);
    checkString(pack.label, `${path}/label`, issues, { max: 120 });
    if (checkArray(pack.enemyRoleIds, `${path}/enemyRoleIds`, issues)) {
      pack.enemyRoleIds.forEach((id, itemIndex) => checkString(id, `${path}/enemyRoleIds/${itemIndex}`, issues, { id: true }));
      checkUniqueStrings(pack.enemyRoleIds, `${path}/enemyRoleIds`, issues);
    }
    checkNumber(pack.enemyCount, `${path}/enemyCount`, issues, 1, 1000, true);
    checkNumber(pack.totalThreatCost, `${path}/totalThreatCost`, issues, Number.EPSILON, 1000000);
    if (typeof pack.entryDirection !== 'string' || !FORMATION_ENTRY_DIRECTIONS.has(pack.entryDirection)) {
      pushIssue(issues, `${path}/entryDirection`, 'unknown_reference', `Unknown formation entry direction: ${String(pack.entryDirection)}`);
    }
    checkString(pack.entryPath, `${path}/entryPath`, issues, { id: true });
    checkCatalogRef(pack.formationShape, SPAWN_PATTERN_CATALOG, `${path}/formationShape`, issues);
    if (typeof pack.firingBehavior !== 'string' || !FORMATION_FIRING_BEHAVIORS.has(pack.firingBehavior)) {
      pushIssue(issues, `${path}/firingBehavior`, 'unknown_reference', `Unknown formation firing behavior: ${String(pack.firingBehavior)}`);
    }
    checkNumber(pack.synergyAdjustment, `${path}/synergyAdjustment`, issues, -1000000, 1000000);
    checkNumber(pack.minimumSector, `${path}/minimumSector`, issues, 1, 1000, true);
    checkNumber(pack.maximumSimultaneousInstances, `${path}/maximumSimultaneousInstances`, issues, 1, 100, true);
    checkNumber(pack.recoveryRequiredSeconds, `${path}/recoveryRequiredSeconds`, issues, 0, 600);
    if (checkArray(pack.compatibleMissionRoles, `${path}/compatibleMissionRoles`, issues)) {
      checkUniqueStrings(pack.compatibleMissionRoles, `${path}/compatibleMissionRoles`, issues);
      pack.compatibleMissionRoles.forEach((role, itemIndex) => {
        if (typeof role !== 'string' || !CAMPAIGN_MISSION_ROLES.has(role)) {
          pushIssue(issues, `${path}/compatibleMissionRoles/${itemIndex}`, 'unknown_reference', `Unknown Campaign Mission role: ${String(role)}`);
        }
      });
    }
    if (checkArray(pack.compatibleSectorIds, `${path}/compatibleSectorIds`, issues)) {
      pack.compatibleSectorIds.forEach((id, itemIndex) => checkString(id, `${path}/compatibleSectorIds/${itemIndex}`, issues, { id: true }));
      checkUniqueStrings(pack.compatibleSectorIds, `${path}/compatibleSectorIds`, issues);
    }
    checkNumber(pack.mobilePerformanceCost, `${path}/mobilePerformanceCost`, issues, Number.EPSILON, 1000000);
  });
  checkUniqueStrings(ids, '/formationPacks/id', issues);
};

const validateMiniBossManifest = (value: unknown, issues: CampaignValidationIssue[]) => {
  if (!checkArray(value, '/miniBosses', issues)) return;
  const ids: unknown[] = [];
  value.forEach((miniBoss, index) => {
    const path = `/miniBosses/${index}`;
    if (!isRecord(miniBoss)) {
      pushIssue(issues, path, 'required_object', 'Mini-boss catalog entries must be objects');
      return;
    }
    checkKeys(miniBoss, MINI_BOSS_KEYS, path, issues);
    if (checkString(miniBoss.id, `${path}/id`, issues, { id: true })) ids.push(miniBoss.id);
    if (typeof miniBoss.bossId !== 'string' || !MINI_BOSS_IDS.has(miniBoss.bossId)) {
      pushIssue(issues, `${path}/bossId`, 'unknown_reference', `Unknown campaign mini-boss: ${String(miniBoss.bossId)}`);
    }
    checkString(miniBoss.label, `${path}/label`, issues, { max: 120 });
    checkString(miniBoss.visualIdentity, `${path}/visualIdentity`, issues, { max: 500 });
    checkString(miniBoss.combatRole, `${path}/combatRole`, issues, { max: 240 });
    if (checkArray(miniBoss.mainAttacks, `${path}/mainAttacks`, issues)) {
      if (miniBoss.mainAttacks.length < 2 || miniBoss.mainAttacks.length > 3) {
        pushIssue(issues, `${path}/mainAttacks`, 'invalid_attack_count', 'Campaign mini-bosses require two or three coherent main attacks');
      }
      miniBoss.mainAttacks.forEach((attack, itemIndex) => checkString(attack, `${path}/mainAttacks/${itemIndex}`, issues, { max: 160 }));
      checkUniqueStrings(miniBoss.mainAttacks, `${path}/mainAttacks`, issues);
    }
    if (checkArray(miniBoss.suitableSectorIds, `${path}/suitableSectorIds`, issues)) {
      miniBoss.suitableSectorIds.forEach((id, itemIndex) => checkString(id, `${path}/suitableSectorIds/${itemIndex}`, issues, { id: true }));
      checkUniqueStrings(miniBoss.suitableSectorIds, `${path}/suitableSectorIds`, issues);
    }
    checkNumber(miniBoss.threatCost, `${path}/threatCost`, issues, Number.EPSILON, 1000000);
    checkNumber(miniBoss.recommendedPower, `${path}/recommendedPower`, issues, 0, 1000000000, true);
    if (typeof miniBoss.usage !== 'string' || !MINI_BOSS_USAGES.has(miniBoss.usage)) {
      pushIssue(issues, `${path}/usage`, 'unknown_reference', `Unknown mini-boss usage: ${String(miniBoss.usage)}`);
    }
    checkBoolean(miniBoss.campaignReady, `${path}/campaignReady`, issues);
    if (typeof miniBoss.validationStatus !== 'string' || !MINI_BOSS_VALIDATION_STATUSES.has(miniBoss.validationStatus)) {
      pushIssue(issues, `${path}/validationStatus`, 'unknown_reference', `Unknown mini-boss validation status: ${String(miniBoss.validationStatus)}`);
    }
  });
  checkUniqueStrings(ids, '/miniBosses/id', issues);
};

const validateCampaignMapPosition = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[]
) => {
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Campaign map positions must be objects');
    return false;
  }
  checkKeys(value, CAMPAIGN_MAP_POSITION_KEYS, path, issues);
  const xValid = checkNumber(value.x, `${path}/x`, issues, 0, 1);
  const yValid = checkNumber(value.y, `${path}/y`, issues, 0, 1);
  return xValid && yValid;
};

const validateCampaignBranchUnlockCondition = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  missionIds: ReadonlySet<string>,
  branchIds: ReadonlySet<string>,
  bossEventIds: ReadonlySet<string>
) => {
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Branch unlock conditions must be objects');
    return;
  }
  if (typeof value.kind !== 'string' || !CAMPAIGN_BRANCH_UNLOCK_KINDS.has(value.kind)) {
    checkKeys(value, ['kind'], path, issues);
    pushIssue(issues, `${path}/kind`, 'unknown_reference', `Unknown branch unlock condition: ${String(value.kind)}`);
    return;
  }
  if (value.kind === 'all-stars-earned') {
    checkKeys(value, ['kind', 'missionId'], path, issues);
    if (checkString(value.missionId, `${path}/missionId`, issues, { id: true }) && !missionIds.has(String(value.missionId))) {
      pushIssue(issues, `${path}/missionId`, 'unknown_reference', `Unknown Campaign Mission: ${String(value.missionId)}`);
    }
  } else if (value.kind === 'sector-mastered') {
    checkKeys(value, ['kind', 'missionIds'], path, issues);
    if (checkArray(value.missionIds, `${path}/missionIds`, issues)) {
      checkUniqueStrings(value.missionIds, `${path}/missionIds`, issues);
      value.missionIds.forEach((missionId, index) => {
        if (checkString(missionId, `${path}/missionIds/${index}`, issues, { id: true }) && !missionIds.has(String(missionId))) {
          pushIssue(issues, `${path}/missionIds/${index}`, 'unknown_reference', `Unknown Campaign Mission: ${String(missionId)}`);
        }
      });
    }
  } else if (value.kind === 'branch-completed') {
    checkKeys(value, ['kind', 'branchId'], path, issues);
    if (checkString(value.branchId, `${path}/branchId`, issues, { id: true }) && !branchIds.has(String(value.branchId))) {
      pushIssue(issues, `${path}/branchId`, 'unknown_reference', `Unknown Campaign branch: ${String(value.branchId)}`);
    }
  } else if (value.kind === 'boss-defeated') {
    checkKeys(value, ['kind', 'bossEventId'], path, issues);
    if (checkString(value.bossEventId, `${path}/bossEventId`, issues, { id: true }) && !bossEventIds.has(String(value.bossEventId))) {
      pushIssue(issues, `${path}/bossEventId`, 'unknown_reference', `Unknown Campaign boss event: ${String(value.bossEventId)}`);
    }
  } else {
    const key = value.kind === 'achievement-earned'
      ? 'achievementId'
      : value.kind === 'hidden-object-discovered'
        ? 'discoveryId'
        : 'challengeId';
    checkKeys(value, ['kind', key], path, issues);
    checkString(value[key], `${path}/${key}`, issues, { id: true });
  }
};

const validateCampaignPresentDropMission = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[]
) => {
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Present Drop mission definitions must be objects');
    return 0;
  }
  checkKeys(value, CAMPAIGN_PRESENT_DROP_MISSION_KEYS, path, issues);
  checkString(value.id, `${path}/id`, issues, { id: true });
  if (value.kind !== 'present-drop') {
    pushIssue(issues, `${path}/kind`, 'unknown_reference', 'The initial branch mission definition must be present-drop');
  }
  checkCatalogRef(value.backgroundId, BACKGROUND_CATALOG, `${path}/backgroundId`, issues);
  checkCatalogRef(value.musicId, MUSIC_CATALOG, `${path}/musicId`, issues);
  checkNumber(value.introSeconds, `${path}/introSeconds`, issues, 0, 10);
  checkNumber(value.durationSeconds, `${path}/durationSeconds`, issues, 20, 120);
  checkNumber(value.exitSeconds, `${path}/exitSeconds`, issues, 0, 10);
  if (value.successCondition !== 'complete-timed-drop') {
    pushIssue(issues, `${path}/successCondition`, 'unknown_reference', 'Present Drops must use complete-timed-drop');
  }

  const presentTypes = new Map<string, { coinValue: number }>();
  const presentTypeIds: unknown[] = [];
  const presentKinds: unknown[] = [];
  if (checkArray(value.presentTypes, `${path}/presentTypes`, issues)) {
    if (value.presentTypes.length > 6) {
      pushIssue(issues, `${path}/presentTypes`, 'collection_too_large', 'Present Drops support at most six distinct target types');
    }
    value.presentTypes.forEach((present, index) => {
      const presentPath = `${path}/presentTypes/${index}`;
      if (!isRecord(present)) {
        pushIssue(issues, presentPath, 'required_object', 'Present target definitions must be objects');
        return;
      }
      checkKeys(present, CAMPAIGN_PRESENT_TYPE_KEYS, presentPath, issues);
      const idValid = checkString(present.id, `${presentPath}/id`, issues, { id: true });
      checkString(present.displayName, `${presentPath}/displayName`, issues, { max: 80 });
      if (typeof present.kind !== 'string' || !PRESENT_DROP_PRESENT_KINDS.has(present.kind)) {
        pushIssue(issues, `${presentPath}/kind`, 'unknown_reference', `Unknown Present Drop target kind: ${String(present.kind)}`);
      }
      const spriteKnown = checkCatalogRef(present.spriteKey, ASSET_CATALOG, `${presentPath}/spriteKey`, issues);
      if (spriteKnown && !isAssetAllowedForRole(present.spriteKey as string, 'asteroid')) {
        pushIssue(issues, `${presentPath}/spriteKey`, 'invalid_asset_role', 'Present Drop targets must use an asset registered for asteroids');
      }
      checkNumber(present.health, `${presentPath}/health`, issues, Number.EPSILON, 1000);
      const coinValid = checkNumber(present.coinValue, `${presentPath}/coinValue`, issues, 1, 100000, true);
      checkNumber(present.speedMultiplier, `${presentPath}/speedMultiplier`, issues, 0.25, 3);
      checkNumber(present.sizeMultiplier, `${presentPath}/sizeMultiplier`, issues, 0.5, 2);
      if (idValid) presentTypeIds.push(present.id);
      if (typeof present.kind === 'string') presentKinds.push(present.kind);
      if (idValid && coinValid) presentTypes.set(String(present.id), { coinValue: Number(present.coinValue) });
    });
    checkUniqueStrings(presentTypeIds, `${path}/presentTypes/id`, issues);
    checkUniqueStrings(presentKinds, `${path}/presentTypes/kind`, issues);
    if (!presentKinds.includes('standard') || !presentKinds.includes('golden')) {
      pushIssue(issues, `${path}/presentTypes`, 'missing_present_kind', 'Present Drops require standard and golden targets');
    }
  }

  let maximumPerformanceCoins = 0;
  const spawnGroupIds: unknown[] = [];
  const usedPresentTypeIds = new Set<string>();
  if (checkArray(value.spawnGroups, `${path}/spawnGroups`, issues)) {
    if (value.spawnGroups.length > 32) {
      pushIssue(issues, `${path}/spawnGroups`, 'collection_too_large', 'Present Drops support at most 32 authored spawn groups');
    }
    let previousStart = -Infinity;
    value.spawnGroups.forEach((group, index) => {
      const groupPath = `${path}/spawnGroups/${index}`;
      if (!isRecord(group)) {
        pushIssue(issues, groupPath, 'required_object', 'Present Drop spawn groups must be objects');
        return;
      }
      checkKeys(group, CAMPAIGN_PRESENT_GROUP_KEYS, groupPath, issues);
      if (checkString(group.id, `${groupPath}/id`, issues, { id: true })) spawnGroupIds.push(group.id);
      const startValid = checkNumber(group.startSeconds, `${groupPath}/startSeconds`, issues, 0, Number(value.durationSeconds) || 120);
      const countValid = checkNumber(group.count, `${groupPath}/count`, issues, 1, 100, true);
      const typeValid = checkString(group.presentTypeId, `${groupPath}/presentTypeId`, issues, { id: true });
      if (typeValid && !presentTypes.has(String(group.presentTypeId))) {
        pushIssue(issues, `${groupPath}/presentTypeId`, 'unknown_reference', `Unknown Present Drop target type: ${String(group.presentTypeId)}`);
      }
      if (typeValid) usedPresentTypeIds.add(String(group.presentTypeId));
      if (typeof group.patternId !== 'string' || !PRESENT_DROP_PATTERN_IDS.has(group.patternId)) {
        pushIssue(issues, `${groupPath}/patternId`, 'unknown_reference', `Unknown Present Drop spawn pattern: ${String(group.patternId)}`);
      }
      const intervalValid = checkNumber(group.spawnIntervalSeconds, `${groupPath}/spawnIntervalSeconds`, issues, 0.05, 10);
      if (startValid && Number(group.startSeconds) < previousStart) {
        pushIssue(issues, `${groupPath}/startSeconds`, 'invalid_order', 'Present Drop spawn groups must be stored in time order');
      }
      if (startValid) previousStart = Number(group.startSeconds);
      if (startValid && countValid && intervalValid && typeof value.durationSeconds === 'number') {
        const endSeconds = Number(group.startSeconds) + Math.max(0, Number(group.count) - 1) * Number(group.spawnIntervalSeconds);
        if (endSeconds > value.durationSeconds + EPSILON) {
          pushIssue(issues, groupPath, 'invalid_timing', 'Present Drop group spawns must fit inside the mission duration');
        }
      }
      const presentType = presentTypes.get(String(group.presentTypeId));
      if (presentType && countValid) maximumPerformanceCoins += Number(group.count) * presentType.coinValue;
    });
    checkUniqueStrings(spawnGroupIds, `${path}/spawnGroups/id`, issues);
  }
  for (const presentTypeId of presentTypes.keys()) {
    if (!usedPresentTypeIds.has(presentTypeId)) {
      pushIssue(issues, `${path}/presentTypes`, 'unused_present_type', `Present Drop target type is never spawned: ${presentTypeId}`);
    }
  }
  return maximumPerformanceCoins;
};

const validateCampaignCombatBranchMission = (
  value: unknown,
  path: string,
  issues: CampaignValidationIssue[],
  enemyRoles: unknown
) => {
  if (!isRecord(value)) {
    pushIssue(issues, path, 'required_object', 'Combat branch mission definitions must be objects');
    return 0;
  }
  checkKeys(value, CAMPAIGN_COMBAT_BRANCH_MISSION_KEYS, path, issues);
  checkString(value.id, `${path}/id`, issues, { id: true });
  if (typeof value.kind !== 'string' || !CAMPAIGN_COMBAT_BRANCH_MISSION_TYPES.has(value.kind)) {
    pushIssue(issues, `${path}/kind`, 'unknown_reference', `Unsupported combat branch mission kind: ${String(value.kind)}`);
  }
  checkCatalogRef(value.backgroundId, BACKGROUND_CATALOG, `${path}/backgroundId`, issues);
  checkCatalogRef(value.musicId, MUSIC_CATALOG, `${path}/musicId`, issues);
  checkNumber(value.introSeconds, `${path}/introSeconds`, issues, 0, 10);
  checkNumber(value.durationSeconds, `${path}/durationSeconds`, issues, 20, 120);
  checkNumber(value.exitSeconds, `${path}/exitSeconds`, issues, 0, 10);
  if (value.successCondition !== 'clear-authored-encounters') {
    pushIssue(issues, `${path}/successCondition`, 'unknown_reference', 'Combat branches must clear their authored encounters');
  }
  checkNumber(value.threatCap, `${path}/threatCap`, issues, 1, 1000, true);
  checkNumber(value.combatBudget, `${path}/combatBudget`, issues, Number.EPSILON, 1000000);
  if (typeof value.rhythm !== 'string' || !CAMPAIGN_WAVE_RHYTHMS.has(value.rhythm)) {
    pushIssue(issues, `${path}/rhythm`, 'unknown_reference', `Unknown Campaign wave rhythm: ${String(value.rhythm)}`);
  }
  const levelPowerups = new Set<string>();
  if (checkArray(value.availablePowerupIds, `${path}/availablePowerupIds`, issues, true)) {
    checkUniqueStrings(value.availablePowerupIds, `${path}/availablePowerupIds`, issues);
    value.availablePowerupIds.forEach((powerupId, index) => {
      if (checkCatalogRef(powerupId, POWERUP_CATALOG, `${path}/availablePowerupIds/${index}`, issues)) {
        levelPowerups.add(String(powerupId));
      }
    });
  }

  const rolesById = new Map(
    (Array.isArray(enemyRoles) ? enemyRoles.filter(isRecord) : []).flatMap((role) => (
      typeof role.id === 'string' ? [[role.id, role] as const] : []
    ))
  );
  let weightedThreat = 0;
  const eventIds = new Set<string>();
  const formationPatterns = new Set<string>();
  let previousStartSeconds = -1;
  let hostileEventCount = 0;
  let powerupEventCount = 0;
  let eliteEnemyCount = 0;
  let nonEliteEnemyCount = 0;
  const waveContext: UnknownRecord = { durationSeconds: value.durationSeconds };
  if (checkArray(value.events, `${path}/events`, issues)) {
    if (value.events.length > 32) {
      pushIssue(issues, `${path}/events`, 'collection_too_large', 'Combat branches support at most 32 authored events');
    }
    value.events.forEach((event, eventIndex) => {
      const eventPath = `${path}/events/${eventIndex}`;
      if (isRecord(event)) {
        if (typeof event.id === 'string') {
          if (eventIds.has(event.id)) pushIssue(issues, `${eventPath}/id`, 'duplicate_id', `Duplicate branch event id: ${event.id}`);
          eventIds.add(event.id);
        }
        if (typeof event.startSeconds === 'number') {
          if (event.startSeconds < previousStartSeconds) {
            pushIssue(issues, `${eventPath}/startSeconds`, 'invalid_timing', 'Combat branch events must be ordered by startSeconds');
          }
          previousStartSeconds = event.startSeconds;
        }
        if (event.kind === 'boss') {
          pushIssue(issues, `${eventPath}/kind`, 'unsupported_value', 'Optional combat branches cannot contain major or mini-boss events');
        }
        if (event.kind === 'asteroid-belt' && event.bonusTargetKind !== undefined) {
          pushIssue(issues, `${eventPath}/bonusTargetKind`, 'unsupported_value', 'Bonus targets belong only to Present Drop branches');
        }
        if (event.kind === 'powerup') powerupEventCount += 1;
        if (event.kind === 'spawn') {
          hostileEventCount += 1;
          if (typeof event.patternId === 'string') formationPatterns.add(event.patternId);
          if (typeof event.count === 'number' && typeof value.threatCap === 'number' && event.count > value.threatCap) {
            pushIssue(issues, `${eventPath}/count`, 'budget_exceeded', 'Spawn count cannot exceed the combat branch threat cap');
          }
          if (Array.isArray(event.enemies) && typeof event.count === 'number') {
            let weightedUnitThreat = 0;
            event.enemies.forEach((enemy, enemyIndex) => {
              if (!isRecord(enemy)) return;
              const rolePath = `${eventPath}/enemies/${enemyIndex}/roleId`;
              const role = typeof enemy.roleId === 'string' ? rolesById.get(enemy.roleId) : undefined;
              if (!role) {
                pushIssue(issues, rolePath, 'unknown_reference', `Unknown enemy role: ${String(enemy.roleId)}`);
              } else {
                if (role.enemyId !== enemy.enemyId) {
                  pushIssue(issues, rolePath, 'incompatible_reference', `Enemy role ${String(enemy.roleId)} belongs to ${String(role.enemyId)}, not ${String(enemy.enemyId)}`);
                }
                if (role.spriteKey !== enemy.spriteKey) {
                  pushIssue(issues, `${eventPath}/enemies/${enemyIndex}/spriteKey`, 'incompatible_reference', `Enemy sprite must match role ${String(enemy.roleId)}`);
                }
                if (typeof enemy.weight === 'number' && typeof role.threatCost === 'number') {
                  weightedUnitThreat += enemy.weight * role.threatCost;
                }
              }
              if (enemy.rank === 'elite') eliteEnemyCount += 1;
              else nonEliteEnemyCount += 1;
            });
            weightedThreat += event.count * weightedUnitThreat;
          }
        } else if (event.kind === 'asteroid-belt') {
          hostileEventCount += 1;
        }
      }
      validateEvent(event, eventPath, issues, waveContext, levelPowerups);
    });
  }
  if (hostileEventCount === 0) {
    pushIssue(issues, `${path}/events`, 'missing_encounter', 'Combat branches require at least one hostile encounter');
  }
  if (typeof value.combatBudget === 'number' && weightedThreat > value.combatBudget + EPSILON) {
    pushIssue(issues, `${path}/combatBudget`, 'budget_exceeded', `Authored enemy-role threat ${weightedThreat} exceeds the combat branch budget`);
  }
  if (value.kind === 'formation-challenge' && formationPatterns.size < 2) {
    pushIssue(issues, `${path}/events`, 'insufficient_variation', 'Formation challenges require at least two distinct formation patterns');
  }
  if (value.kind === 'support-trial' && powerupEventCount === 0) {
    pushIssue(issues, `${path}/events`, 'missing_support_event', 'Support trials require at least one authored power-up event');
  }
  if (value.kind === 'elite-remix' && (eliteEnemyCount === 0 || nonEliteEnemyCount > 0)) {
    pushIssue(issues, `${path}/events`, 'invalid_elite_remix', 'Elite remixes require every authored spawn enemy to use elite rank');
  }
  return 0;
};

const validateCampaignBranches = (
  value: unknown,
  levels: unknown,
  enemyRoles: unknown,
  issues: CampaignValidationIssue[]
) => {
  if (value === undefined) return;
  if (!checkArray(value, '/campaignBranches', issues, true)) return;

  const levelRows = Array.isArray(levels) ? levels.filter(isRecord) : [];
  const missionIds = new Set(levelRows.flatMap((level) => typeof level.id === 'string' ? [level.id] : []));
  const bossEventIds = new Set(levelRows.flatMap((level) => Array.isArray(level.waves) ? level.waves : []).flatMap((wave) => (
    isRecord(wave) && Array.isArray(wave.events)
      ? wave.events.flatMap((event) => isRecord(event) && event.kind === 'boss' && typeof event.id === 'string' ? [event.id] : [])
      : []
  )));
  const missionPositions = new Map<string, UnknownRecord>();
  levelRows.forEach((level) => {
    if (typeof level.id === 'string' && isRecord(level.campaignProgression) && isRecord(level.campaignProgression.mapPosition)) {
      missionPositions.set(level.id, level.campaignProgression.mapPosition);
    }
  });
  const branchRows = value.filter(isRecord);
  const branchIds = new Set(branchRows.flatMap((branch) => typeof branch.branchId === 'string' ? [branch.branchId] : []));
  const branchIdList: unknown[] = [];
  const missionDefinitionIds: unknown[] = [];
  const branchPositions: Array<{ path: string; x: number; y: number }> = [];

  value.forEach((branch, index) => {
    const path = `/campaignBranches/${index}`;
    if (!isRecord(branch)) {
      pushIssue(issues, path, 'required_object', 'Campaign branches must be objects');
      return;
    }
    checkKeys(branch, CAMPAIGN_BRANCH_KEYS, path, issues);
    if (checkString(branch.branchId, `${path}/branchId`, issues, { id: true })) branchIdList.push(branch.branchId);
    const sourceValid = checkString(branch.sourceMissionId, `${path}/sourceMissionId`, issues, { id: true });
    if (sourceValid && !missionIds.has(String(branch.sourceMissionId))) {
      pushIssue(issues, `${path}/sourceMissionId`, 'unknown_reference', `Unknown source Campaign Mission: ${String(branch.sourceMissionId)}`);
    }
    validateCampaignBranchUnlockCondition(branch.unlockCondition, `${path}/unlockCondition`, issues, missionIds, branchIds, bossEventIds);
    checkNumber(branch.requiredStars, `${path}/requiredStars`, issues, 0, 3, true);
    if (isRecord(branch.unlockCondition) && branch.unlockCondition.kind === 'all-stars-earned') {
      if (branch.requiredStars !== 3) {
        pushIssue(issues, `${path}/requiredStars`, 'invalid_mastery_count', 'All-stars branches require exactly three stars');
      }
      if (branch.unlockCondition.missionId !== branch.sourceMissionId) {
        pushIssue(issues, `${path}/unlockCondition/missionId`, 'invalid_reference', 'All-stars branch unlocks must reference their source Mission');
      }
    }
    if (typeof branch.missionType !== 'string' || !CAMPAIGN_BRANCH_MISSION_TYPES.has(branch.missionType)) {
      pushIssue(issues, `${path}/missionType`, 'unknown_reference', `Unknown branch mission type: ${String(branch.missionType)}`);
    }
    checkString(branch.displayName, `${path}/displayName`, issues, { max: 80 });
    checkString(branch.hiddenName, `${path}/hiddenName`, issues, { max: 80 });
    if (validateCampaignMapPosition(branch.mapPosition, `${path}/mapPosition`, issues) && isRecord(branch.mapPosition)) {
      branchPositions.push({ path: `${path}/mapPosition`, x: Number(branch.mapPosition.x), y: Number(branch.mapPosition.y) });
    }
    if (checkArray(branch.routeControlPoints, `${path}/routeControlPoints`, issues)) {
      if (branch.routeControlPoints.length < 2 || branch.routeControlPoints.length > 12) {
        pushIssue(issues, `${path}/routeControlPoints`, 'invalid_route', 'Branch routes require 2 to 12 control points');
      }
      branch.routeControlPoints.forEach((point, pointIndex) => {
        validateCampaignMapPosition(point, `${path}/routeControlPoints/${pointIndex}`, issues);
      });
      const sourcePosition = missionPositions.get(String(branch.sourceMissionId));
      const firstPoint = branch.routeControlPoints[0];
      const lastPoint = branch.routeControlPoints.at(-1);
      if (sourcePosition && isRecord(firstPoint) && (
        Math.abs(Number(firstPoint.x) - Number(sourcePosition.x)) > EPSILON
        || Math.abs(Number(firstPoint.y) - Number(sourcePosition.y)) > EPSILON
      )) {
        pushIssue(issues, `${path}/routeControlPoints/0`, 'invalid_route', 'Branch route must begin at the source Mission position');
      }
      if (isRecord(lastPoint) && isRecord(branch.mapPosition) && (
        Math.abs(Number(lastPoint.x) - Number(branch.mapPosition.x)) > EPSILON
        || Math.abs(Number(lastPoint.y) - Number(branch.mapPosition.y)) > EPSILON
      )) {
        pushIssue(issues, `${path}/routeControlPoints/${Math.max(0, branch.routeControlPoints.length - 1)}`, 'invalid_route', 'Branch route must end at the branch node position');
      }
    }
    if (typeof branch.icon !== 'string' || !CAMPAIGN_BRANCH_NODE_ICONS.has(branch.icon)) {
      pushIssue(issues, `${path}/icon`, 'unknown_reference', `Unknown branch node icon: ${String(branch.icon)}`);
    }
    if (typeof branch.lockedIcon !== 'string' || !CAMPAIGN_BRANCH_NODE_ICONS.has(branch.lockedIcon)) {
      pushIssue(issues, `${path}/lockedIcon`, 'unknown_reference', `Unknown locked branch node icon: ${String(branch.lockedIcon)}`);
    }
    if (!isRecord(branch.rewardPreview)) {
      pushIssue(issues, `${path}/rewardPreview`, 'required_object', 'Branch reward previews must be objects');
    } else {
      checkKeys(branch.rewardPreview, CAMPAIGN_BRANCH_REWARD_PREVIEW_KEYS, `${path}/rewardPreview`, issues);
      if (typeof branch.rewardPreview.category !== 'string' || !CAMPAIGN_BRANCH_REWARD_CATEGORIES.has(branch.rewardPreview.category)) {
        pushIssue(issues, `${path}/rewardPreview/category`, 'unknown_reference', `Unknown branch reward category: ${String(branch.rewardPreview.category)}`);
      }
      checkString(branch.rewardPreview.label, `${path}/rewardPreview/label`, issues, { max: 80 });
      checkNumber(branch.rewardPreview.minimumCoins, `${path}/rewardPreview/minimumCoins`, issues, 0, 1000000, true);
      checkNumber(branch.rewardPreview.maximumCoins, `${path}/rewardPreview/maximumCoins`, issues, 0, 1000000, true);
      checkBoolean(branch.rewardPreview.hiddenUntilUnlocked, `${path}/rewardPreview/hiddenUntilUnlocked`, issues);
      if (typeof branch.rewardPreview.minimumCoins === 'number' && typeof branch.rewardPreview.maximumCoins === 'number' && branch.rewardPreview.maximumCoins < branch.rewardPreview.minimumCoins) {
        pushIssue(issues, `${path}/rewardPreview/maximumCoins`, 'invalid_reward_bounds', 'Maximum reward must be at least the minimum reward');
      }
    }
    checkBoolean(branch.oneTimeCompletion, `${path}/oneTimeCompletion`, issues);
    if (typeof branch.replayPolicy !== 'string' || !CAMPAIGN_BRANCH_REPLAY_POLICIES.has(branch.replayPolicy)) {
      pushIssue(issues, `${path}/replayPolicy`, 'unknown_reference', `Unknown branch replay policy: ${String(branch.replayPolicy)}`);
    }
    if (branch.oneTimeCompletion === true && branch.replayPolicy !== 'no-replay-after-claim') {
      pushIssue(issues, `${path}/replayPolicy`, 'invalid_replay_policy', 'One-time branches must disable replay after claim');
    }
    if (branch.oneTimeCompletion === false && branch.replayPolicy === 'no-replay-after-claim') {
      pushIssue(issues, `${path}/replayPolicy`, 'invalid_replay_policy', 'Repeatable branches require a repeatable replay policy');
    }
    if (branch.failurePolicy !== 'retry-no-reward') {
      pushIssue(issues, `${path}/failurePolicy`, 'unknown_reference', 'Branch failures must remain retryable without permanent rewards');
    }
    if (branch.rewardCommitPolicy !== 'authoritative-idempotent-on-success') {
      pushIssue(issues, `${path}/rewardCommitPolicy`, 'unknown_reference', 'Branch rewards must use authoritative idempotent settlement');
    }
    if (checkString(branch.missionDefinitionId, `${path}/missionDefinitionId`, issues, { id: true })) {
      missionDefinitionIds.push(branch.missionDefinitionId);
    }
    const maximumPerformanceCoins = branch.missionType === 'present-drop'
      ? validateCampaignPresentDropMission(branch.missionDefinition, `${path}/missionDefinition`, issues)
      : CAMPAIGN_COMBAT_BRANCH_MISSION_TYPES.has(String(branch.missionType))
        ? validateCampaignCombatBranchMission(branch.missionDefinition, `${path}/missionDefinition`, issues, enemyRoles)
        : 0;
    if (!isRecord(branch.missionDefinition) || branch.missionDefinition.kind !== branch.missionType) {
      pushIssue(issues, `${path}/missionDefinition/kind`, 'invalid_reference', 'Mission definition kind must match the branch mission type');
    }
    if (isRecord(branch.missionDefinition) && branch.missionDefinition.id !== branch.missionDefinitionId) {
      pushIssue(issues, `${path}/missionDefinition/id`, 'invalid_reference', 'Mission definition ID must match missionDefinitionId');
    }
    if (!isRecord(branch.completionReward)) {
      pushIssue(issues, `${path}/completionReward`, 'required_object', 'Branch completion rewards must be objects');
    } else {
      checkKeys(branch.completionReward, CAMPAIGN_BRANCH_COMPLETION_REWARD_KEYS, `${path}/completionReward`, issues);
      for (const key of CAMPAIGN_BRANCH_COMPLETION_REWARD_KEYS) {
        checkNumber(branch.completionReward[key], `${path}/completionReward/${key}`, issues, 0, 1000000, true);
      }
      const baseCoins = Number(branch.completionReward.baseCoins);
      const bonusCoins = Number(branch.completionReward.oneTimeBonusCoins);
      const authoredPerformanceCoins = Number(branch.completionReward.maximumPerformanceCoins);
      const totalMinimumCoins = baseCoins + bonusCoins;
      const totalMaximumCoins = totalMinimumCoins + authoredPerformanceCoins;
      if (authoredPerformanceCoins !== maximumPerformanceCoins) {
        pushIssue(issues, `${path}/completionReward/maximumPerformanceCoins`, 'invalid_reward_bounds', 'Maximum performance coins must equal the authored branch target value');
      }
      if (Number(branch.completionReward.totalMinimumCoins) !== totalMinimumCoins) {
        pushIssue(issues, `${path}/completionReward/totalMinimumCoins`, 'invalid_reward_bounds', 'Minimum reward must equal base coins plus the one-time bonus');
      }
      if (Number(branch.completionReward.totalMaximumCoins) !== totalMaximumCoins) {
        pushIssue(issues, `${path}/completionReward/totalMaximumCoins`, 'invalid_reward_bounds', 'Maximum reward must include every authored branch target');
      }
      if (isRecord(branch.rewardPreview) && (
        branch.rewardPreview.minimumCoins !== branch.completionReward.totalMinimumCoins
        || branch.rewardPreview.maximumCoins !== branch.completionReward.totalMaximumCoins
      )) {
        pushIssue(issues, `${path}/rewardPreview`, 'invalid_reward_bounds', 'Reward preview must match the authoritative completion reward bounds');
      }
    }
    if (checkString(branch.returnNodeId, `${path}/returnNodeId`, issues, { id: true }) && !missionIds.has(String(branch.returnNodeId)) && !branchIds.has(String(branch.returnNodeId))) {
      pushIssue(issues, `${path}/returnNodeId`, 'unknown_reference', `Unknown branch return node: ${String(branch.returnNodeId)}`);
    }
    if (branch.nextBranchNodeId !== undefined && branch.nextBranchNodeId !== null) {
      if (checkString(branch.nextBranchNodeId, `${path}/nextBranchNodeId`, issues, { id: true }) && !branchIds.has(String(branch.nextBranchNodeId))) {
        pushIssue(issues, `${path}/nextBranchNodeId`, 'unknown_reference', `Unknown next Campaign branch: ${String(branch.nextBranchNodeId)}`);
      }
      if (branch.nextBranchNodeId === branch.branchId) {
        pushIssue(issues, `${path}/nextBranchNodeId`, 'circular_reference', 'A Campaign branch cannot route to itself');
      }
    }
    if (typeof branch.discoveryState !== 'string' || !CAMPAIGN_BRANCH_DISCOVERY_STATES.has(branch.discoveryState)) {
      pushIssue(issues, `${path}/discoveryState`, 'unknown_reference', `Unknown branch discovery state: ${String(branch.discoveryState)}`);
    }
  });
  checkUniqueStrings(branchIdList, '/campaignBranches/branchId', issues);
  checkUniqueStrings(missionDefinitionIds, '/campaignBranches/missionDefinitionId', issues);

  const occupiedPositions = levelRows.flatMap((level) => (
    isRecord(level.campaignProgression) && isRecord(level.campaignProgression.mapPosition)
      ? [{ path: `/levels/${String(level.id)}/campaignProgression/mapPosition`, x: Number(level.campaignProgression.mapPosition.x), y: Number(level.campaignProgression.mapPosition.y) }]
      : []
  ));
  branchPositions.forEach((position, index) => {
    [...occupiedPositions, ...branchPositions.slice(0, index)].forEach((other) => {
      if (Number.isFinite(other.x) && Number.isFinite(other.y) && Math.hypot(position.x - other.x, position.y - other.y) < 0.04) {
        pushIssue(issues, position.path, 'map_node_overlap', `Campaign branch node is too close to ${other.path}`);
      }
    });
  });
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
    if (candidate.roleId !== undefined) checkString(candidate.roleId, `${itemPath}/roleId`, issues, { id: true });
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
  phaseIds: ReadonlySet<string>,
  allowFrontierCrownclawSandboxPrimitives = false
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
      !allowFrontierCrownclawSandboxPrimitives
      && FRONTIER_CROWNCLAW_SANDBOX_PRIMITIVES.has(candidate.primitiveId as string)
    ) {
      pushIssue(
        issues,
        `${itemPath}/primitiveId`,
        'sandbox_only_primitive',
        `${String(candidate.primitiveId)} is restricted to the Frontier Crownclaw Boss Sandbox prototype`
      );
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
    if (
      typeof event.bossId !== 'string'
      || !Object.prototype.hasOwnProperty.call(BOSS_CATALOG, event.bossId)
      || BOSS_CATALOG[event.bossId as keyof typeof BOSS_CATALOG].entityType !== 'BOSS'
    ) {
      pushIssue(issues, `${path}/rigId`, 'unsupported_boss_rig', 'Layered boss rigs are supported only by canonical major bosses');
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
  if (event.componentHealth !== undefined) {
    if (!isRecord(event.componentHealth)) {
      pushIssue(
        issues,
        `${path}/componentHealth`,
        'required_object',
        'Boss component health must be an object'
      );
    } else {
      checkKeys(
        event.componentHealth,
        [...BOSS_COMPONENT_IDS],
        `${path}/componentHealth`,
        issues
      );
      if (Object.keys(event.componentHealth).length === 0) {
        pushIssue(
          issues,
          `${path}/componentHealth`,
          'empty_collection',
          'Boss component health must configure at least one component'
        );
      }
      for (const componentId of BOSS_COMPONENT_IDS) {
        const health = event.componentHealth[componentId];
        if (health !== undefined) {
          checkNumber(
            health,
            `${path}/componentHealth/${componentId}`,
            issues,
            Number.EPSILON,
            10000000
          );
        }
      }
    }
    if (event.componentMode === 'hull-only') {
      pushIssue(
        issues,
        `${path}/componentHealth`,
        'incompatible_value',
        'Hull-only bosses cannot configure component health'
      );
    }
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
  validateBossTimeline(
    event.timeline,
    `${path}/timeline`,
    issues,
    phaseIds,
    event.id === FRONTIER_CROWNCLAW_SANDBOX_EVENT_ID
  );
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
    checkNumber(candidate.damage, `${path}/damage`, issues, candidate.bonusTargetKind === undefined ? Number.EPSILON : 0, 1000);
    checkNumber(candidate.scoreValue, `${path}/scoreValue`, issues, 0, 10000000);
    checkNumber(candidate.powerupDropChance, `${path}/powerupDropChance`, issues, 0, 1);
    if (candidate.coinDropValue !== undefined) {
      checkNumber(candidate.coinDropValue, `${path}/coinDropValue`, issues, 1, 1000000, true);
    }
    if (candidate.bonusTargetKind !== undefined) {
      if (typeof candidate.bonusTargetKind !== 'string' || !PRESENT_DROP_PRESENT_KINDS.has(candidate.bonusTargetKind)) {
        pushIssue(issues, `${path}/bonusTargetKind`, 'unknown_reference', `Unknown bonus target kind: ${String(candidate.bonusTargetKind)}`);
      }
      if (candidate.coinDropValue === undefined) {
        pushIssue(issues, `${path}/coinDropValue`, 'required_number', 'Bonus targets require a positive provisional coin value');
      }
    } else if (candidate.coinDropValue !== undefined) {
      pushIssue(issues, `${path}/bonusTargetKind`, 'required_string', 'Coin-dropping bonus targets require a bonus target kind');
    }
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
  checkNumber(candidate.combatBudget, `${path}/combatBudget`, issues, Number.EPSILON, 1000000);
  if (typeof candidate.rhythm !== 'string' || !CAMPAIGN_WAVE_RHYTHMS.has(candidate.rhythm)) {
    pushIssue(issues, `${path}/rhythm`, 'unknown_reference', `Unknown Campaign wave rhythm: ${String(candidate.rhythm)}`);
  }
  if (checkArray(candidate.formationPackIds, `${path}/formationPackIds`, issues, true)) {
    candidate.formationPackIds.forEach((id, index) => checkString(id, `${path}/formationPackIds/${index}`, issues, { id: true }));
    checkUniqueStrings(candidate.formationPackIds, `${path}/formationPackIds`, issues);
  }

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
      isRecord(event)
      && event.kind === 'boss'
      && typeof event.bossId === 'string'
      && Object.prototype.hasOwnProperty.call(BOSS_CATALOG, event.bossId)
      && BOSS_CATALOG[event.bossId as keyof typeof BOSS_CATALOG].entityType === 'BOSS'
    )).length;
    if (candidate.completionRule === 'boss-defeat' && mainBossCount === 0) {
      pushIssue(issues, `${path}/completionRule`, 'missing_main_boss', 'Boss-defeat waves require a canonical major-boss event');
    }
    if (candidate.completionRule === 'clear-after-duration' && mainBossCount > 0) {
      pushIssue(issues, `${path}/completionRule`, 'unexpected_main_boss', 'Clear-after-duration waves cannot contain a canonical major-boss event');
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

const validateCampaignManifestCrossReferences = (
  campaign: UnknownRecord,
  issues: CampaignValidationIssue[]
) => {
  const levels = Array.isArray(campaign.levels) ? campaign.levels.filter(isRecord) : [];
  const sectors = Array.isArray(campaign.sectors) ? campaign.sectors.filter(isRecord) : [];
  const visualThemes = Array.isArray(campaign.visualThemes) ? campaign.visualThemes.filter(isRecord) : [];
  const enemyRoles = Array.isArray(campaign.enemyRoles) ? campaign.enemyRoles.filter(isRecord) : [];
  const formationPacks = Array.isArray(campaign.formationPacks) ? campaign.formationPacks.filter(isRecord) : [];
  const miniBosses = Array.isArray(campaign.miniBosses) ? campaign.miniBosses.filter(isRecord) : [];
  const branches = Array.isArray(campaign.campaignBranches) ? campaign.campaignBranches.filter(isRecord) : [];
  const levelsById = new Map(levels.flatMap((level) => typeof level.id === 'string' ? [[level.id, level] as const] : []));
  const sectorsById = new Map(sectors.flatMap((sector) => typeof sector.id === 'string' ? [[sector.id, sector] as const] : []));
  const themesById = new Map(visualThemes.flatMap((theme) => typeof theme.id === 'string' ? [[theme.id, theme] as const] : []));
  const rolesById = new Map(enemyRoles.flatMap((role) => typeof role.id === 'string' ? [[role.id, role] as const] : []));
  const packsById = new Map(formationPacks.flatMap((pack) => typeof pack.id === 'string' ? [[pack.id, pack] as const] : []));
  const branchIds = new Set(branches.flatMap((branch) => typeof branch.branchId === 'string' ? [branch.branchId] : []));
  const missionOwners = new Map<string, string[]>();

  sectors.forEach((sector, sectorIndex) => {
    const sectorPath = `/sectors/${sectorIndex}`;
    if (typeof sector.themeId === 'string' && !themesById.has(sector.themeId)) {
      pushIssue(issues, `${sectorPath}/themeId`, 'unknown_reference', `Unknown Campaign visual theme: ${sector.themeId}`);
    }
    if (Array.isArray(sector.branchIds)) sector.branchIds.forEach((branchId, branchIndex) => {
      if (typeof branchId === 'string' && !branchIds.has(branchId)) {
        pushIssue(issues, `${sectorPath}/branchIds/${branchIndex}`, 'unknown_reference', `Unknown Campaign branch: ${branchId}`);
      }
    });
    if (!Array.isArray(sector.missionIds) || sector.missionIds.length !== 5) return;
    sector.missionIds.forEach((missionId, missionIndex) => {
      if (typeof missionId !== 'string') return;
      const level = levelsById.get(missionId);
      if (!level) {
        pushIssue(issues, `${sectorPath}/missionIds/${missionIndex}`, 'unknown_reference', `Unknown Campaign Mission: ${missionId}`);
        return;
      }
      missionOwners.set(missionId, [...(missionOwners.get(missionId) ?? []), String(sector.id)]);
      const progression = isRecord(level.campaignProgression) ? level.campaignProgression : undefined;
      if (!progression) {
        pushIssue(issues, `/levels/${levels.indexOf(level)}/campaignProgression`, 'required_object', 'Sector Missions require Campaign progression metadata');
        return;
      }
      if (progression.sectorId !== sector.id) {
        pushIssue(issues, `/levels/${levels.indexOf(level)}/campaignProgression/sectorId`, 'invalid_reference', `Mission must reference owning sector ${String(sector.id)}`);
      }
      const expectedRole = CAMPAIGN_MISSION_ROLE_ORDER[missionIndex];
      if (progression.missionRole !== expectedRole) {
        pushIssue(issues, `/levels/${levels.indexOf(level)}/campaignProgression/missionRole`, 'invalid_sector_shape', `Sector Mission ${missionIndex + 1} must use role ${expectedRole}`);
      }
      const waveCount = Array.isArray(level.waves) ? level.waves.length : 0;
      const waveRange: Record<string, [number, number]> = {
        introduction: [5, 5],
        'formation-remix': [5, 6],
        'elite-checkpoint': [4, 6],
        'boss-preparation': [6, 7],
        'major-boss': [1, 1]
      };
      const range = waveRange[expectedRole];
      if (waveCount < range[0] || waveCount > range[1]) {
        pushIssue(issues, `/levels/${levels.indexOf(level)}/waves`, 'invalid_wave_count', `${expectedRole} Missions require ${range[0] === range[1] ? range[0] : `${range[0]}-${range[1]}`} waves`);
      }
      if (expectedRole === 'major-boss' && Array.isArray(level.waves) && isRecord(level.waves[0])) {
        const bossEvents = Array.isArray(level.waves[0].events)
          ? level.waves[0].events.filter((event) => isRecord(event) && event.kind === 'boss')
          : [];
        if (level.waves[0].completionRule !== 'boss-defeat'
          || bossEvents.length !== 1
          || bossEvents[0]?.bossId !== sector.majorBossId) {
          pushIssue(issues, `/levels/${levels.indexOf(level)}/waves/0`, 'invalid_major_boss_mission', 'Major-boss Missions must be one direct encounter with the sector major boss');
        }
      }
    });
  });

  levels.forEach((level, levelIndex) => {
    if (typeof level.id === 'string') {
      const owners = missionOwners.get(level.id) ?? [];
      if (owners.length !== 1) {
        pushIssue(issues, `/levels/${levelIndex}/campaignProgression/sectorId`, 'invalid_sector_membership', `Campaign Missions must belong to exactly one sector; found ${owners.length}`);
      }
    }
    const progression = isRecord(level.campaignProgression) ? level.campaignProgression : undefined;
    if (progression && typeof progression.sectorId === 'string' && !sectorsById.has(progression.sectorId)) {
      pushIssue(issues, `/levels/${levelIndex}/campaignProgression/sectorId`, 'unknown_reference', `Unknown Campaign sector: ${progression.sectorId}`);
    }
    if (!Array.isArray(level.waves)) return;
    level.waves.forEach((wave, waveIndex) => {
      if (!isRecord(wave)) return;
      if (typeof progression?.combatBudget === 'number' && typeof wave.combatBudget === 'number' && wave.combatBudget > progression.combatBudget) {
        pushIssue(issues, `/levels/${levelIndex}/waves/${waveIndex}/combatBudget`, 'budget_exceeded', 'Wave combat budget cannot exceed its owning Mission budget');
      }
      let packBudget = 0;
      if (Array.isArray(wave.formationPackIds)) wave.formationPackIds.forEach((packId, packIndex) => {
        if (typeof packId !== 'string') return;
        const pack = packsById.get(packId);
        if (!pack) {
          pushIssue(issues, `/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex}`, 'unknown_reference', `Unknown formation pack: ${packId}`);
          return;
        }
        if (typeof pack.totalThreatCost === 'number') packBudget += pack.totalThreatCost;
        if (typeof progression?.sectorId === 'string' && Array.isArray(pack.compatibleSectorIds) && !pack.compatibleSectorIds.includes(progression.sectorId)) {
          pushIssue(issues, `/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex}`, 'incompatible_reference', `Formation pack ${packId} is not compatible with sector ${progression.sectorId}`);
        }
        if (typeof progression?.missionRole === 'string' && Array.isArray(pack.compatibleMissionRoles) && !pack.compatibleMissionRoles.includes(progression.missionRole)) {
          pushIssue(issues, `/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex}`, 'incompatible_reference', `Formation pack ${packId} is not compatible with Mission role ${progression.missionRole}`);
        }
      });
      if (typeof wave.combatBudget === 'number' && packBudget > wave.combatBudget + EPSILON) {
        pushIssue(issues, `/levels/${levelIndex}/waves/${waveIndex}/formationPackIds`, 'budget_exceeded', 'Formation pack threat costs exceed the authored wave combat budget');
      }
      if (!Array.isArray(wave.events)) return;
      wave.events.forEach((event, eventIndex) => {
        if (!isRecord(event) || event.kind !== 'spawn' || !Array.isArray(event.enemies)) return;
        event.enemies.forEach((enemy, enemyIndex) => {
          if (!isRecord(enemy) || enemy.roleId === undefined) return;
          const rolePath = `/levels/${levelIndex}/waves/${waveIndex}/events/${eventIndex}/enemies/${enemyIndex}/roleId`;
          const role = typeof enemy.roleId === 'string' ? rolesById.get(enemy.roleId) : undefined;
          if (!role) {
            pushIssue(issues, rolePath, 'unknown_reference', `Unknown enemy role: ${String(enemy.roleId)}`);
          } else if (role.enemyId !== enemy.enemyId) {
            pushIssue(issues, rolePath, 'incompatible_reference', `Enemy role ${String(enemy.roleId)} belongs to ${String(role.enemyId)}, not ${String(enemy.enemyId)}`);
          }
        });
      });
    });
  });

  enemyRoles.forEach((role, roleIndex) => {
    if (Array.isArray(role.compatibleFormationPackIds)) role.compatibleFormationPackIds.forEach((packId, packIndex) => {
      if (typeof packId === 'string' && !packsById.has(packId)) {
        pushIssue(issues, `/enemyRoles/${roleIndex}/compatibleFormationPackIds/${packIndex}`, 'unknown_reference', `Unknown formation pack: ${packId}`);
      }
    });
    if (typeof role.introductionSector === 'number'
      && !sectors.some((sector) => sector.order === role.introductionSector)) {
      pushIssue(issues, `/enemyRoles/${roleIndex}/introductionSector`, 'unknown_reference', `No sector uses order ${role.introductionSector}`);
    }
  });
  formationPacks.forEach((pack, packIndex) => {
    if (Array.isArray(pack.enemyRoleIds)) pack.enemyRoleIds.forEach((roleId, roleIndex) => {
      if (typeof roleId === 'string' && !rolesById.has(roleId)) {
        pushIssue(issues, `/formationPacks/${packIndex}/enemyRoleIds/${roleIndex}`, 'unknown_reference', `Unknown enemy role: ${roleId}`);
      }
    });
    if (Array.isArray(pack.compatibleSectorIds)) pack.compatibleSectorIds.forEach((sectorId, sectorIndex) => {
      if (typeof sectorId === 'string' && !sectorsById.has(sectorId)) {
        pushIssue(issues, `/formationPacks/${packIndex}/compatibleSectorIds/${sectorIndex}`, 'unknown_reference', `Unknown Campaign sector: ${sectorId}`);
      }
    });
  });
  miniBosses.forEach((miniBoss, miniBossIndex) => {
    if (Array.isArray(miniBoss.suitableSectorIds)) miniBoss.suitableSectorIds.forEach((sectorId, sectorIndex) => {
      if (typeof sectorId === 'string' && !sectorsById.has(sectorId)) {
        pushIssue(issues, `/miniBosses/${miniBossIndex}/suitableSectorIds/${sectorIndex}`, 'unknown_reference', `Unknown Campaign sector: ${sectorId}`);
      }
    });
  });
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
  validateCampaignSectors(value.sectors, issues);
  validateCampaignVisualThemes(value.visualThemes, issues);
  validateEnemyRoleManifest(value.enemyRoles, issues);
  validateFormationPackManifest(value.formationPacks, issues);
  validateMiniBossManifest(value.miniBosses, issues);

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
  validateCampaignBranches(value.campaignBranches, value.levels, value.enemyRoles, issues);
  validateCampaignManifestCrossReferences(value, issues);
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
