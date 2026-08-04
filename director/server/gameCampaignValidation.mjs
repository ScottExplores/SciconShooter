import { ValidationError } from './validation.mjs';
import { readFileSync } from 'node:fs';
export {
  migrateLegacyGameCampaign,
  migrateLegacyStageWaveHierarchy,
  migrateLegacyWaveCompletionRule
} from '../../game-config/legacyCampaignMigration.mjs';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const EPSILON = 1e-6;
const BOSS_TIMELINE_EPSILON = 0.0001;
const BOSS_TIMELINE_FPS = 60;
const BOSS_TIMELINE_MAX_CUES_PER_FRAME = 8;
const toBossTimelineFrame = (seconds) => Math.max(
  1,
  Math.round(Math.max(0, seconds) * BOSS_TIMELINE_FPS)
);

const CAMPAIGN_BOSS_ASSET_KEYS = [
  'CAMPAIGN_BOSS_ECLIPSE_ENGINE',
  'CAMPAIGN_BOSS_FRONTIER_CROWNCLAW',
  'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE',
  'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER',
  'CAMPAIGN_BOSS_HELIX_LEVIATHAN',
  'CAMPAIGN_BOSS_ORBIT_GYROSCOPE',
  'CAMPAIGN_BOSS_NULLWAKE_REVENANT',
  'CAMPAIGN_BOSS_PRISM_MOTH',
  'CAMPAIGN_BOSS_RAIL_SERPENT',
  'CAMPAIGN_BOSS_SINGULARITY_CRAB',
  'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT'
];
const CAMPAIGN_ENEMY_ASSET_KEYS = [
  'CAMPAIGN_ENEMY_BULLET_RING_EMITTER',
  'CAMPAIGN_ENEMY_CRESCENT_MINELAYER',
  'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL',
  'CAMPAIGN_ENEMY_DNA_CONDUCTOR',
  'CAMPAIGN_ENEMY_LASER_HUNTER',
  'CAMPAIGN_ENEMY_LASER_STALKER',
  'CAMPAIGN_ENEMY_ORBIT_DISC',
  'CAMPAIGN_ENEMY_PRISM_ARTILLERY',
  'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES',
  'CAMPAIGN_ENEMY_RING_SENTINEL',
  'CAMPAIGN_ENEMY_SHIELD_RAMMER',
  'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT',
  'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT'
];
const CAMPAIGN_MINI_BOSS_ASSET_KEYS = [
  'CAMPAIGN_ENEMY_BULLET_RING_EMITTER',
  'CAMPAIGN_ENEMY_LASER_HUNTER',
  'CAMPAIGN_ENEMY_PRISM_ARTILLERY',
  'CAMPAIGN_ENEMY_RING_SENTINEL'
];
const SCICON_ENEMY_SQUADRON_ASSET_KEYS = [
  'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  'SCICON_ENEMY_CITATION_DART_FRAMES',
  'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES',
  'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'
];

const BUILT_IN_ASSET_KEYS = [
  'PLAYER_SHIP', 'RSC_TOKEN', 'REAL_RSC_ICON', 'GAME_BG_BACK', 'GAME_BG_STARS',
  'GAME_BG_PLANET', 'GAME_PARALLAX_BACK', 'GAME_PARALLAX_STARS',
  'GAME_PARALLAX_FAR_PLANETS', 'GAME_PARALLAX_BIG_PLANET', 'GAME_PARALLAX_RING_PLANET',
  'PIXI_SPACE_RUN_HELIX_REDLINE_PROPS', 'PIXI_SPACE_RUN_SHATTERED_VOID_PROPS',
  'PIXI_SPACE_RUN_GRAVITY_RIFT_PROPS', 'PIXI_SPACE_RUN_ION_ECLIPSE_PROPS',
  'PIXI_SPACE_RUN_TERMINUS_FRONTIER_PROPS',
  'ENEMY_DRONE_FRAMES', 'LEGACY_ENEMY_DRONE_FRAMES', 'ENEMY_SWARM_FRAMES', 'LEGACY_ENEMY_SWARM_FRAMES',
  'ENEMY_BRICK_FRAMES', 'ASTEROID_BELT_FRAMES', 'ENEMY_JOURNAL', 'ENEMY_JOURNAL_FRAMES',
  'PIXI_JET_SCOUT_FRAMES', 'PIXI_JET_INTERCEPTOR_FRAMES', 'PIXI_JET_HEAVY_FRAMES',
  'MINI_BOSS', 'WALL_BOSS_SEGMENT', 'PAYWALL_BASTION_FRAMES', 'FINAL_BOSS',
  'PIXI_BOSS_OPEN_ORBIT_FRAMES', 'PIXI_BOSS_CITATION_FRAMES',
  'PIXI_BOSS_PAYWALL_FRAMES', 'PIXI_BOSS_OPEN_GALAXY_FRAMES', 'PIXI_BOSS_CROWNCLAW_FRAMES',
  ...CAMPAIGN_BOSS_ASSET_KEYS,
  ...CAMPAIGN_ENEMY_ASSET_KEYS,
  ...SCICON_ENEMY_SQUADRON_ASSET_KEYS,
  'POWERUP_MAX_SHOT_AURA_FRAMES'
];
const GENERATED_ASSET_ROLES = new Set(['enemy', 'boss', 'asteroid', 'supply-drop', 'hud', 'player', 'background', 'scorecard']);
const GENERATED_ASSET_ID_PATTERN = /^GENERATED_[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const GENERATED_ASSET_PATH_PATTERN = /^\/game-art\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GENERATED_ASSET_MANIFEST_URL = new URL('../../game-config/generated-assets.json', import.meta.url);

const readGeneratedAssets = (manifest) => {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('generated-assets.json must contain an object');
  }
  if (manifest.schemaVersion !== 1 || Object.keys(manifest).some((key) => key !== 'schemaVersion' && key !== 'assets')) {
    throw new Error('generated-assets.json must use schemaVersion 1 and only known fields');
  }
  if (!Array.isArray(manifest.assets)) throw new Error('generated-assets.json assets must be an array');
  const entries = [];
  const ids = new Set(BUILT_IN_ASSET_KEYS);
  const paths = new Set();
  manifest.assets.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`generated-assets.json assets/${index} must be an object`);
    }
    const allowed = new Set(['id', 'label', 'roles', 'path', 'sha256', 'width', 'height', 'createdAt']);
    if (Object.keys(entry).some((key) => !allowed.has(key))) throw new Error(`generated-assets.json assets/${index} contains unsupported fields`);
    if (typeof entry.id !== 'string' || !GENERATED_ASSET_ID_PATTERN.test(entry.id) || ids.has(entry.id)) {
      throw new Error(`generated-assets.json assets/${index}/id is invalid or duplicated`);
    }
    if (typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 80) throw new Error(`generated-assets.json assets/${index}/label is invalid`);
    if (!Array.isArray(entry.roles) || entry.roles.length === 0 || entry.roles.some((role) => !GENERATED_ASSET_ROLES.has(role)) || new Set(entry.roles).size !== entry.roles.length) {
      throw new Error(`generated-assets.json assets/${index}/roles is invalid`);
    }
    if (typeof entry.path !== 'string' || !GENERATED_ASSET_PATH_PATTERN.test(entry.path) || paths.has(entry.path)) throw new Error(`generated-assets.json assets/${index}/path is invalid or duplicated`);
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) throw new Error(`generated-assets.json assets/${index}/sha256 is invalid`);
    const shortHash = entry.sha256.slice(0, 12);
    if (!entry.id.endsWith(`_${shortHash.toUpperCase()}`) || !entry.path.endsWith(`-${shortHash}.png`)) throw new Error(`generated-assets.json assets/${index} id and path must match its content hash`);
    if (!Number.isInteger(entry.width) || entry.width < 1 || entry.width > 4096) throw new Error(`generated-assets.json assets/${index}/width is invalid`);
    if (!Number.isInteger(entry.height) || entry.height < 1 || entry.height > 4096) throw new Error(`generated-assets.json assets/${index}/height is invalid`);
    if (typeof entry.createdAt !== 'string' || Number.isNaN(Date.parse(entry.createdAt))) throw new Error(`generated-assets.json assets/${index}/createdAt is invalid`);
    ids.add(entry.id);
    paths.add(entry.path);
    entries.push(entry);
  });
  return entries;
};

const ASSET_KEYS = new Set();
const ENEMY_SPRITE_KEYS = new Set();
const BOSS_SPRITE_KEYS = new Set();
const ASTEROID_SPRITE_KEYS = new Set();
const SUPPLY_DROP_SPRITE_KEYS = new Set();
const HUD_ASSET_KEYS = new Set();
const SCORECARD_ASSET_KEYS = new Set();

const replaceSet = (target, values) => {
  target.clear();
  values.forEach((value) => target.add(value));
};

/** Reloads after each atomic generator write, so newly created art can be applied without restarting. */
const refreshGeneratedAssetCatalog = () => {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(GENERATED_ASSET_MANIFEST_URL, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read generated-assets.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const generatedAssets = readGeneratedAssets(manifest);
  const generatedForRole = (role) => generatedAssets
    .filter((entry) => entry.roles.includes(role))
    .map((entry) => entry.id);
  replaceSet(ASSET_KEYS, [...BUILT_IN_ASSET_KEYS, ...generatedAssets.map((entry) => entry.id)]);
  replaceSet(ENEMY_SPRITE_KEYS, [
    'ENEMY_DRONE_FRAMES',
    'LEGACY_ENEMY_DRONE_FRAMES',
    'ENEMY_SWARM_FRAMES',
    'LEGACY_ENEMY_SWARM_FRAMES',
    'ENEMY_BRICK_FRAMES',
    'ENEMY_JOURNAL',
    'ENEMY_JOURNAL_FRAMES',
    'PIXI_JET_SCOUT_FRAMES',
    'PIXI_JET_INTERCEPTOR_FRAMES',
    'PIXI_JET_HEAVY_FRAMES',
    ...CAMPAIGN_ENEMY_ASSET_KEYS,
    ...SCICON_ENEMY_SQUADRON_ASSET_KEYS,
    ...generatedForRole('enemy')
  ]);
  replaceSet(BOSS_SPRITE_KEYS, [
    'MINI_BOSS',
    'WALL_BOSS_SEGMENT',
    'PAYWALL_BASTION_FRAMES',
    'FINAL_BOSS',
    'PIXI_BOSS_OPEN_ORBIT_FRAMES',
    'PIXI_BOSS_CITATION_FRAMES',
    'PIXI_BOSS_PAYWALL_FRAMES',
    'PIXI_BOSS_OPEN_GALAXY_FRAMES',
    'PIXI_BOSS_CROWNCLAW_FRAMES',
    ...CAMPAIGN_BOSS_ASSET_KEYS,
    ...CAMPAIGN_MINI_BOSS_ASSET_KEYS,
    ...generatedForRole('boss')
  ]);
  replaceSet(ASTEROID_SPRITE_KEYS, ['ASTEROID_BELT_FRAMES', 'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL', ...generatedForRole('asteroid')]);
  replaceSet(SUPPLY_DROP_SPRITE_KEYS, generatedForRole('supply-drop'));
  replaceSet(HUD_ASSET_KEYS, ['RSC_TOKEN', 'REAL_RSC_ICON', ...generatedForRole('hud')]);
  replaceSet(SCORECARD_ASSET_KEYS, [
    'PLAYER_SHIP', 'RSC_TOKEN', 'REAL_RSC_ICON',
    'ENEMY_DRONE_FRAMES', 'ENEMY_SWARM_FRAMES', 'ENEMY_BRICK_FRAMES', 'ASTEROID_BELT_FRAMES', 'ENEMY_JOURNAL', 'ENEMY_JOURNAL_FRAMES',
    'MINI_BOSS', 'WALL_BOSS_SEGMENT', 'PAYWALL_BASTION_FRAMES', 'FINAL_BOSS',
    'PIXI_BOSS_OPEN_ORBIT_FRAMES', 'PIXI_BOSS_CITATION_FRAMES', 'PIXI_BOSS_PAYWALL_FRAMES', 'PIXI_BOSS_OPEN_GALAXY_FRAMES', 'PIXI_BOSS_CROWNCLAW_FRAMES',
    ...CAMPAIGN_BOSS_ASSET_KEYS,
    ...CAMPAIGN_ENEMY_ASSET_KEYS,
    ...SCICON_ENEMY_SQUADRON_ASSET_KEYS,
    ...generatedForRole('scorecard')
  ]);
};

refreshGeneratedAssetCatalog();
const ENEMY_IDS = new Set(['drone', 'swarm', 'brick', 'journal']);
const BOSS_IDS = new Set([
  'bottleneck-drone', 'paywall-wall', 'fracture-engine-elite', 'aegis-brood-core',
  'railspine-wallcrawler', 'maw-carrier', 'twin-meridian-sentinels', 'prism-bloom',
  'aegis-convoy-captain', 'gridline-sentries', 'gatekeeper', 'gatekeeper-prime', 'paywall-decimator',
  'helios-clawcarrier', 'helix-leviathan',
  'eclipse-engine', 'research-tribunal', 'prism-moth', 'rail-serpent', 'singularity-crab',
  'orbit-gyroscope', 'hammerhead-siege', 'frontier-crownclaw', 'nullwake-revenant'
]);
const MAJOR_BOSS_IDS = new Set([
  'gatekeeper', 'gatekeeper-prime', 'paywall-decimator', 'helios-clawcarrier', 'helix-leviathan',
  'eclipse-engine', 'research-tribunal',
  'prism-moth', 'rail-serpent', 'singularity-crab', 'orbit-gyroscope', 'hammerhead-siege',
  'frontier-crownclaw', 'nullwake-revenant'
]);
const BOSS_RIG_IDS = new Set(['open-orbit', 'citation-storm', 'paywall-siege', 'crown-claw']);
const POWERUP_IDS = new Set(['projectile-upgrade', 'max-shot', 'magnet', 'shield', 'research-beam', 'extra-life']);
const BACKGROUND_IDS = new Set([
  'open-orbit',
  'citation-storm',
  'paywall-siege',
  'open-galaxy',
  'bastion-protocol',
  'helix-redline',
  'shattered-void',
  'gravity-rift',
  'ion-eclipse',
  'terminus-frontier'
]);
const MUSIC_IDS = new Set(['procedural-main']);
const SPAWN_PATTERNS = new Set([
  'single-random',
  'row',
  'staggered-row',
  'v',
  'double-v',
  'sine',
  'pincer',
  'grid',
  'diamond',
  'crescent',
  'arc',
  'ring',
  'pods',
  'wheel',
  'snake',
  'escort',
  'shield-wall',
  'lanes',
  'spiral',
  'asteroid-lanes'
]);
const SPAWN_POSITIONS = new Set(['random-top', 'formation-top', 'center-top', 'lane-top']);
const MOVEMENT_PATTERNS = new Set(['drift-down', 'sine-drift', 'track-player', 'wall-march', 'asteroid-drift', 'gatekeeper-cycle', 'arena-roam']);
const MOVEMENT_PATH_IDS = new Set(['sweep-bank-reentry']);
const WEAPON_IDS = new Set(['aimed-shot', 'wall-bolt', 'burst-volley', 'lane-beam']);
const ENEMY_RANKS = new Set(['standard', 'elite']);
const ENEMY_ATTACK_PATTERNS = new Set(['aimed-burst']);
const WAVE_COMPLETION_RULES = new Set(['boss-defeat', 'clear-after-duration']);
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
];
const CAMPAIGN_WAVE_RHYTHMS = new Set([
  'warm-up', 'introduce', 'variation', 'support', 'recovery', 'peak', 'clear', 'boss'
]);
const ENEMY_DURABILITY_CLASSES = new Set(['light', 'standard', 'armored', 'elite']);
const ENEMY_GAMEPLAY_ROLES = new Set([
  'formation-unit', 'diver', 'flanker', 'shooter', 'burst-shooter', 'suppressor',
  'armored-unit', 'support-unit', 'priority-target', 'formation-leader', 'elite'
]);
const ENEMY_FIRE_BEHAVIORS = new Set([
  'none', 'post-formation', 'aimed-burst', 'formation-command', 'elite-only'
]);
const ENEMY_ENTRY_BEHAVIORS = new Set(['formation', 'dive', 'flank', 'lane']);
/** What a hull does once it holds a slot. See services/enemyCharacteristics.ts. */
const ENEMY_CHARACTERISTICS = new Set(['holder', 'diver', 'kamikaze', 'flanker', 'artillery', 'commander']);
const FORMATION_ENTRY_DIRECTIONS = new Set(['top', 'left', 'right', 'split']);
const FORMATION_ENTRY_PATHS = new Set([
  'sweep-bank-reentry', 'formation-drop', 'spiral-entry', 'paired-flank', 'diamond-lock',
  'double-helix', 'side-wall-entry', 'lane-stagger', 'ring-assemble', 'armored-grid',
  'mirrored-swoop', 'pod-converge', 'convoy-column'
]);
const FORMATION_MOVEMENTS = new Set([
  'gentle-drift', 'lateral-sweep', 'expand-collapse', 'rotating-wheel',
  'snake-weave', 'split-pods', 'lane-shift'
]);
const FORMATION_ATTACK_BEHAVIORS = new Set([
  'single-dive', 'paired-dive', 'alternating-wings', 'leader-escorts', 'row-sequence',
  'diagonal-groups', 'sweep-strafe', 'pincer-pass', 'ring-collapse', 'aimed-volley',
  'spread-volley', 'lane-pass', 'split-hunt'
]);
const FORMATION_FIRING_BEHAVIORS = new Set(['none', 'post-formation', 'staggered', 'priority']);
const FORMATION_RETURN_BEHAVIORS = new Set(['reform', 'transform', 'retreat', 'exit']);
const SUPPORT_RECOMMENDATION_TAGS = new Set([
  'anti-swarm', 'anti-armor', 'lane-control', 'boss-damage', 'survival', 'anti-summon'
]);
const CAMPAIGN_ROUTE_EDGE_KINDS = new Set([
  'progression', 'route-choice', 'rejoin', 'optional', 'crossing'
]);
const CAMPAIGN_ROUTE_RISKS = new Set(['low', 'moderate', 'high']);
const CAMPAIGN_REWARD_PROFILES = new Set([
  'standard', 'combat-premium', 'support-safe', 'boss', 'mastery', 'one-time'
]);
const CAMPAIGN_ROUTE_MINI_BOSS_PRESENCE = new Set(['none', 'optional', 'required']);
const MINI_BOSS_IDS = new Set([
  'bottleneck-drone',
  'paywall-wall',
  'fracture-engine-elite',
  'aegis-brood-core',
  'railspine-wallcrawler',
  'maw-carrier',
  'twin-meridian-sentinels',
  'prism-bloom',
  'aegis-convoy-captain',
  'gridline-sentries'
]);
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
const CAMPAIGN_BRANCH_REWARD_CATEGORIES = new Set(['upgrade-coins', 'coins-and-trophy', 'cosmetic', 'support-preview']);
const CAMPAIGN_BRANCH_REPLAY_POLICIES = new Set(['no-replay-after-claim', 'repeatable-no-reward', 'repeatable-rewarded']);
const CAMPAIGN_BRANCH_UNLOCK_KINDS = new Set([
  'all-stars-earned', 'sector-mastered', 'branch-completed', 'boss-defeated', 'achievement-earned',
  'hidden-object-discovered', 'support-challenge-completed'
]);
const CAMPAIGN_BRANCH_DISCOVERY_STATES = new Set(['encrypted', 'revealed']);
const PRESENT_DROP_PRESENT_KINDS = new Set(['standard', 'armored', 'fast', 'golden']);
const PRESENT_DROP_PATTERN_IDS = new Set(['lane-rain', 'staggered-columns', 'sine-sweep', 'final-center']);
const EVENT_KINDS = new Set(['spawn', 'boss', 'asteroid-belt', 'supply-drop', 'powerup', 'recovery']);
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
const CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS = 0.8;
const CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS = 2.5;
const CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS = 0.3;
const CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS = 1.25;
const CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS = 0.45;
const CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS = 1.4;
const BOSS_COMPONENT_MODES = new Set(['legacy-rig', 'hull-only']);
const BOSS_COMPONENT_IDS = new Set(['left-cannon', 'right-cannon', 'helmet']);
const BOSS_TIMELINE_COMPONENT_IDS = new Set(['left-cannon', 'right-cannon', 'helmet']);
const BOSS_TIMELINE_SIDES = new Set(['port', 'starboard']);
const BOSS_TIMELINE_HANDEDNESS = new Set(['left', 'right']);
const FRONTIER_CROWNCLAW_BOSS_ID = 'frontier-crownclaw';
const FRONTIER_CROWNCLAW_SANDBOX_PRIMITIVES = new Set([
  'chainclaw-harpoon',
  'crown-reactor-beam',
  'bastion-crabwalk-barrage'
]);
const BOSS_TIMELINE_PRIMITIVES = new Map([
  ['telegraph', { track: 'presentation', damaging: false, supportsRepeat: true, parameterKeys: ['warningSeconds', 'telegraphStyle', 'color'] }],
  ['aimed-burst', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount'] }],
  ['gap-ring', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence', 'rotationDirection'] }],
  ['rotor-hazard-sentence', { track: 'attack', damaging: true, supportsRepeat: false, parameterKeys: ['projectileCount', 'sequence', 'pulseIntervalSeconds', 'motionCue'] }],
  ['radial-beam-array', { track: 'laser', damaging: true, supportsRepeat: false, parameterKeys: ['sequence', 'motionCue', 'rotationDirection'] }],
  ['corner-ambush-beam', { track: 'laser', damaging: true, supportsRepeat: false, parameterKeys: ['sequence'] }],
  ['corner-ambush-ram', { track: 'movement', damaging: true, supportsRepeat: false, parameterKeys: ['sequence'] }],
  ['paired-cannon-burst', {
    track: 'attack',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: [
      'projectileCount',
      'side',
      'sequence',
      'motionCue',
      'shotIntervalFrames',
      'projectileSpeedScale',
      'channelWidthPixels',
      'sweepRangeRatio',
      'sweepPasses'
    ]
  }],
  ['articulated-melee-sweep', { track: 'attack', damaging: true, supportsRepeat: false, parameterKeys: ['side', 'sequence', 'motionCue'] }],
  ['reactor-aperture-pattern', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence', 'rotationDirection', 'motionCue'] }],
  ['tracking-pincer-dive', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['sequence', 'motionCue'] }],
  ['prism-wingbeat-weave', {
    track: 'attack',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['projectileCount', 'sequence', 'motionCue', 'shotIntervalFrames', 'projectileSpeedScale', 'channelWidthPixels', 'sweepRangeRatio', 'sweepPasses']
  }],
  ['prism-brood-procession', {
    track: 'summon',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['projectileCount', 'sequence', 'motionCue', 'shotIntervalFrames', 'projectileSpeedScale', 'channelWidthPixels', 'sweepRangeRatio', 'sweepPasses']
  }],
  ['prism-lunar-swoop', {
    track: 'movement',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['sequence', 'motionCue', 'projectileCount', 'shotIntervalFrames', 'projectileSpeedScale', 'sweepRangeRatio', 'sweepPasses']
  }],
  ['prism-kaleidoscope-brood', {
    track: 'summon',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['projectileCount', 'sequence', 'motionCue', 'pulseIntervalSeconds', 'shotIntervalFrames', 'projectileSpeedScale', 'channelWidthPixels', 'sweepRangeRatio', 'sweepPasses']
  }],
  ['chainclaw-harpoon', {
    track: 'attack',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['sequence', 'side', 'motionCue', 'projectileSpeedScale']
  }],
  ['crown-reactor-beam', {
    track: 'laser',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['sequence', 'motionCue', 'rotationDirection']
  }],
  ['bastion-crabwalk-barrage', {
    track: 'attack',
    damaging: true,
    supportsRepeat: true,
    parameterKeys: ['projectileCount', 'sequence', 'motionCue', 'shotIntervalFrames', 'projectileSpeedScale']
  }],
  ['cross-beam', { track: 'laser', damaging: true, supportsRepeat: true, parameterKeys: [] }],
  ['rail-sweep', { track: 'laser', damaging: true, supportsRepeat: true, parameterKeys: ['sequence'] }],
  ['tail-fan', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence'] }],
  ['inward-collapse', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence'] }],
  ['rotating-cross', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence'] }],
  ['helix-volley', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence', 'handedness'] }],
  ['side-barrage', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'side', 'motionCue'] }],
  ['pod-volley', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence'] }],
  ['weave-wall', { track: 'attack', damaging: true, supportsRepeat: true, parameterKeys: ['projectileCount', 'sequence'] }],
  ['summon-formation', { track: 'summon', damaging: true, supportsRepeat: false, parameterKeys: ['summonCount', 'enemyId', 'formationPatternId'] }],
  ['set-shield', { track: 'defense', damaging: false, supportsRepeat: false, parameterKeys: ['shieldCount', 'enabled'] }],
  ['set-weak-point', { track: 'defense', damaging: false, supportsRepeat: false, parameterKeys: ['componentId', 'enabled'] }],
  ['set-movement', { track: 'movement', damaging: false, supportsRepeat: false, parameterKeys: ['movementPatternId', 'speedMultiplier'] }],
  ['follow-path', { track: 'movement', damaging: false, supportsRepeat: false, parameterKeys: ['movementPathId'] }],
  ['effect-cue', { track: 'presentation', damaging: false, supportsRepeat: false, parameterKeys: ['color', 'motionCue'] }],
  ['camera-cue', { track: 'presentation', damaging: false, supportsRepeat: false, parameterKeys: ['strength'] }]
]);

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
    ['title', 'subtitle', 'callsignLabel', 'scoreLabel', 'reviewLabel'].forEach((key) => requireString(recordCard.copy[key], `${location}/copy/${key}`, errors, 80));
    if (typeof recordCard.copy.verifiedLabel !== 'string' || recordCard.copy.verifiedLabel.length > 80) {
      errors.push(`${location}/copy/verifiedLabel must be a string of at most 80 characters`);
    }
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
  requireEnum(recordCard.shipAssetKey, SCORECARD_ASSET_KEYS, `${location}/shipAssetKey`, errors);
  requireEnum(recordCard.encounterAssetKey, new Set(['AUTO', ...SCORECARD_ASSET_KEYS]), `${location}/encounterAssetKey`, errors);
  if (requireObject(recordCard.art, `${location}/art`, errors)) {
    allowedKeys(recordCard.art, ['ship', 'encounter'], `${location}/art`, errors);
    validateRecordCardRegion(recordCard.art.ship, `${location}/art/ship`, errors);
    validateRecordCardRegion(recordCard.art.encounter, `${location}/art/encounter`, errors);
  }
};

const validateHudAssets = (hudAssets, location, errors) => {
  // Optional only for immutable schema-v1 revisions created before shared HUD artwork.
  if (hudAssets === undefined) return;
  if (!requireObject(hudAssets, location, errors)) return;
  allowedKeys(hudAssets, ['bombIconAssetKey'], location, errors);
  requireEnum(hudAssets.bombIconAssetKey, HUD_ASSET_KEYS, `${location}/bombIconAssetKey`, errors);
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
  requireEnum(scorecard.encounterAssetKey, SCORECARD_ASSET_KEYS, `${location}/encounterAssetKey`, errors);
};

const validateCampaignProgression = (progression, location, levelId, errors) => {
  if (progression === undefined) return;
  if (!requireObject(progression, location, errors)) return;
  allowedKeys(progression, [
    'reward', 'masteryObjectives', 'masterySetBonusCoins', 'sectorId', 'missionRole', 'combatBudget',
    'recommendedPower', 'testedLoadouts', 'recommendedSupportTags', 'mapPosition', 'nextMissionId'
  ], location, errors);

  if (requireObject(progression.reward, `${location}/reward`, errors)) {
    allowedKeys(
      progression.reward,
      ['waveClearCoins', 'missionClearCoins', 'firstClearCoins', 'bossFirstClearCoins', 'replayMultiplier'],
      `${location}/reward`,
      errors
    );
    ['waveClearCoins', 'missionClearCoins', 'firstClearCoins', 'bossFirstClearCoins'].forEach((key) => {
      requireNumber(progression.reward[key], `${location}/reward/${key}`, errors, {
        minimum: 0,
        maximum: 1000000,
        integer: true
      });
    });
    requireNumber(progression.reward.replayMultiplier, `${location}/reward/replayMultiplier`, errors, {
      minimum: Number.EPSILON,
      maximum: 1
    });
  }

  if (!Array.isArray(progression.masteryObjectives) || progression.masteryObjectives.length !== 3) {
    errors.push(`${location}/masteryObjectives must contain exactly three mastery objectives`);
  } else {
    const objectiveIds = new Set();
    let completionObjectiveCount = 0;
    progression.masteryObjectives.forEach((objective, index) => {
      const objectiveLocation = `${location}/masteryObjectives/${index}`;
      if (!requireObject(objective, objectiveLocation, errors)) return;
      allowedKeys(objective, ['id', 'label', 'kind', 'target', 'rewardCoins'], objectiveLocation, errors);
      requireString(objective.id, `${objectiveLocation}/id`, errors, 160);
      if (typeof objective.id === 'string' && typeof levelId === 'string' && !objective.id.startsWith(`${levelId}:`)) {
        errors.push(`${objectiveLocation}/id must be scoped to its owning Mission`);
      }
      if (objectiveIds.has(objective.id)) errors.push(`${location}/masteryObjectives contains duplicate id: ${String(objective.id)}`);
      objectiveIds.add(objective.id);
      requireString(objective.label, `${objectiveLocation}/label`, errors, 160);
      requireEnum(objective.kind, CAMPAIGN_MASTERY_OBJECTIVE_KINDS, `${objectiveLocation}/kind`, errors);
      if (objective.kind === 'complete') {
        completionObjectiveCount += 1;
        if (objective.target !== 1) errors.push(`${objectiveLocation}/target must be 1 for a completion objective`);
      } else {
        requireNumber(objective.target, `${objectiveLocation}/target`, errors, { minimum: 0, maximum: 1000000000 });
        if (
          ['coins-at-least', 'score-at-least', 'time-at-most'].includes(objective.kind)
          && isFiniteNumber(objective.target)
          && objective.target <= 0
        ) {
          errors.push(`${objectiveLocation}/target must be positive for ${objective.kind}`);
        }
      }
      requireNumber(objective.rewardCoins, `${objectiveLocation}/rewardCoins`, errors, {
        minimum: 0,
        maximum: 1000000,
        integer: true
      });
    });
    if (completionObjectiveCount !== 1) {
      errors.push(`${location}/masteryObjectives must contain exactly one completion objective`);
    }
  }

  requireNumber(progression.masterySetBonusCoins, `${location}/masterySetBonusCoins`, errors, {
    minimum: 0,
    maximum: 1000000,
    integer: true
  });
  requireId(progression.sectorId, `${location}/sectorId`, errors);
  requireEnum(progression.missionRole, CAMPAIGN_MISSION_ROLES, `${location}/missionRole`, errors);
  requireNumber(progression.combatBudget, `${location}/combatBudget`, errors, {
    minimum: Number.EPSILON,
    maximum: 1000000
  });
  if (requireObject(progression.recommendedPower, `${location}/recommendedPower`, errors)) {
    const keys = ['minimum', 'expected', 'comfortable'];
    allowedKeys(progression.recommendedPower, keys, `${location}/recommendedPower`, errors);
    keys.forEach((key) => requireNumber(
      progression.recommendedPower[key],
      `${location}/recommendedPower/${key}`,
      errors,
      { minimum: 0, maximum: 1000000000, integer: true }
    ));
    if (keys.every((key) => isFiniteNumber(progression.recommendedPower[key])) && !(
      progression.recommendedPower.minimum <= progression.recommendedPower.expected
      && progression.recommendedPower.expected <= progression.recommendedPower.comfortable
    )) {
      errors.push(`${location}/recommendedPower must be ordered minimum <= expected <= comfortable`);
    }
  }
  if (requireObject(progression.testedLoadouts, `${location}/testedLoadouts`, errors)) {
    const keys = ['lowPower', 'expectedPower', 'upgraded'];
    allowedKeys(progression.testedLoadouts, keys, `${location}/testedLoadouts`, errors);
    keys.forEach((key) => requireString(progression.testedLoadouts[key], `${location}/testedLoadouts/${key}`, errors, 200));
  }
  validateUniqueEnumArray(
    progression.recommendedSupportTags,
    SUPPORT_RECOMMENDATION_TAGS,
    `${location}/recommendedSupportTags`,
    errors,
    { minimumItems: 0 }
  );

  if (progression.mapPosition !== undefined) {
    const mapLocation = `${location}/mapPosition`;
    if (requireObject(progression.mapPosition, mapLocation, errors)) {
      allowedKeys(progression.mapPosition, ['x', 'y'], mapLocation, errors);
      requireNumber(progression.mapPosition.x, `${mapLocation}/x`, errors, { minimum: 0, maximum: 1 });
      requireNumber(progression.mapPosition.y, `${mapLocation}/y`, errors, { minimum: 0, maximum: 1 });
    }
  }

  if (progression.nextMissionId !== undefined && progression.nextMissionId !== null) {
    requireId(progression.nextMissionId, `${location}/nextMissionId`, errors);
  }
};

const validateCampaignSectors = (sectors, errors) => {
  if (!Array.isArray(sectors) || sectors.length === 0) {
    errors.push('/sectors must be a non-empty array');
    return;
  }
  const ids = new Set();
  const orders = new Set();
  sectors.forEach((sector, index) => {
    const location = `/sectors/${index}`;
    if (!requireObject(sector, location, errors)) return;
    allowedKeys(sector, [
      'id', 'order', 'name', 'themeId', 'missionIds', 'mainNodeIds', 'routeNodeIds', 'majorBossId', 'branchIds'
    ], location, errors);
    requireId(sector.id, `${location}/id`, errors);
    if (ids.has(sector.id)) errors.push(`/sectors contains duplicate id: ${String(sector.id)}`);
    ids.add(sector.id);
    requireNumber(sector.order, `${location}/order`, errors, { minimum: 1, maximum: 1000, integer: true });
    if (orders.has(sector.order)) errors.push(`/sectors contains duplicate order: ${String(sector.order)}`);
    orders.add(sector.order);
    requireString(sector.name, `${location}/name`, errors, 120);
    requireId(sector.themeId, `${location}/themeId`, errors);
    if (!Array.isArray(sector.missionIds) || sector.missionIds.length !== 5) {
      errors.push(`${location}/missionIds must contain exactly five Missions`);
    } else {
      const missionIds = new Set();
      sector.missionIds.forEach((missionId, missionIndex) => {
        requireId(missionId, `${location}/missionIds/${missionIndex}`, errors);
        if (missionIds.has(missionId)) errors.push(`${location}/missionIds contains duplicate value: ${String(missionId)}`);
        missionIds.add(missionId);
      });
    }
    requireEnum(sector.majorBossId, MAJOR_BOSS_IDS, `${location}/majorBossId`, errors);
    if (sector.mainNodeIds !== undefined) {
      if (!Array.isArray(sector.mainNodeIds) || sector.mainNodeIds.length !== 5) {
        errors.push(`${location}/mainNodeIds must contain exactly five Campaign graph nodes`);
      } else {
        const mainNodeIds = new Set();
        sector.mainNodeIds.forEach((nodeId, nodeIndex) => {
          requireId(nodeId, `${location}/mainNodeIds/${nodeIndex}`, errors);
          if (mainNodeIds.has(nodeId)) errors.push(`${location}/mainNodeIds contains duplicate value: ${String(nodeId)}`);
          mainNodeIds.add(nodeId);
        });
      }
    }
    if (sector.routeNodeIds !== undefined) {
      if (!Array.isArray(sector.routeNodeIds)) {
        errors.push(`${location}/routeNodeIds must be an array`);
      } else {
        const routeNodeIds = new Set();
        sector.routeNodeIds.forEach((nodeId, nodeIndex) => {
          requireId(nodeId, `${location}/routeNodeIds/${nodeIndex}`, errors);
          if (routeNodeIds.has(nodeId)) errors.push(`${location}/routeNodeIds contains duplicate value: ${String(nodeId)}`);
          routeNodeIds.add(nodeId);
        });
      }
    }
    if (!Array.isArray(sector.branchIds)) {
      errors.push(`${location}/branchIds must be an array`);
    } else {
      const branchIds = new Set();
      sector.branchIds.forEach((branchId, branchIndex) => {
        requireId(branchId, `${location}/branchIds/${branchIndex}`, errors);
        if (branchIds.has(branchId)) errors.push(`${location}/branchIds contains duplicate value: ${String(branchId)}`);
        branchIds.add(branchId);
      });
    }
  });
};

const validateCampaignVisualThemes = (themes, errors) => {
  if (!Array.isArray(themes) || themes.length === 0) {
    errors.push('/visualThemes must be a non-empty array');
    return;
  }
  const ids = new Set();
  themes.forEach((theme, index) => {
    const location = `/visualThemes/${index}`;
    if (!requireObject(theme, location, errors)) return;
    allowedKeys(theme, ['id', 'label', 'backgroundId', 'accent', 'description'], location, errors);
    requireId(theme.id, `${location}/id`, errors);
    if (ids.has(theme.id)) errors.push(`/visualThemes contains duplicate id: ${String(theme.id)}`);
    ids.add(theme.id);
    requireString(theme.label, `${location}/label`, errors, 120);
    requireEnum(theme.backgroundId, BACKGROUND_IDS, `${location}/backgroundId`, errors);
    if (typeof theme.accent !== 'string' || !HEX_COLOR_PATTERN.test(theme.accent)) errors.push(`${location}/accent must be a six-digit hex color`);
    requireString(theme.description, `${location}/description`, errors, 500);
  });
};

const validateEnemyRoleManifest = (roles, errors) => {
  if (!Array.isArray(roles) || roles.length === 0) {
    errors.push('/enemyRoles must be a non-empty array');
    return;
  }
  const ids = new Set();
  roles.forEach((role, index) => {
    const location = `/enemyRoles/${index}`;
    if (!requireObject(role, location, errors)) return;
    allowedKeys(role, [
      'id', 'label', 'enemyId', 'spriteKey', 'role', 'threatCost', 'introductionSector',
      'introductionMission', 'durabilityClass', 'fireBehavior', 'fireDelaySeconds', 'entryBehavior',
      'compatibleFormationPackIds', 'synergyTags', 'reuseCooldownWaves', 'maximumSimultaneousCount',
      'performanceCost', 'characteristic'
    ], location, errors);
    requireId(role.id, `${location}/id`, errors);
    if (ids.has(role.id)) errors.push(`/enemyRoles contains duplicate id: ${String(role.id)}`);
    ids.add(role.id);
    requireString(role.label, `${location}/label`, errors, 120);
    requireEnum(role.enemyId, ENEMY_IDS, `${location}/enemyId`, errors);
    requireEnum(role.spriteKey, ENEMY_SPRITE_KEYS, `${location}/spriteKey`, errors);
    requireEnum(role.role, ENEMY_GAMEPLAY_ROLES, `${location}/role`, errors);
    requireNumber(role.threatCost, `${location}/threatCost`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
    requireNumber(role.introductionSector, `${location}/introductionSector`, errors, { minimum: 1, maximum: 1000, integer: true });
    requireNumber(role.introductionMission, `${location}/introductionMission`, errors, { minimum: 1, maximum: 5, integer: true });
    requireEnum(role.durabilityClass, ENEMY_DURABILITY_CLASSES, `${location}/durabilityClass`, errors);
    requireEnum(role.fireBehavior, ENEMY_FIRE_BEHAVIORS, `${location}/fireBehavior`, errors);
    requireNumber(role.fireDelaySeconds, `${location}/fireDelaySeconds`, errors, { minimum: 0, maximum: 30 });
    if (role.fireBehavior === 'none' && role.fireDelaySeconds !== 0) {
      errors.push(`${location}/fireDelaySeconds must be zero when fireBehavior is none`);
    }
    if (role.fireBehavior !== 'none' && isFiniteNumber(role.fireDelaySeconds) && role.fireDelaySeconds < 0.5) {
      errors.push(`${location}/fireDelaySeconds must be at least 0.5 seconds for firing roles`);
    }
    if (role.fireBehavior === 'elite-only' && role.durabilityClass !== 'elite') {
      errors.push(`${location}/fireBehavior elite-only requires elite durability`);
    }
    requireEnum(role.entryBehavior, ENEMY_ENTRY_BEHAVIORS, `${location}/entryBehavior`, errors);
    requireEnum(role.characteristic, ENEMY_CHARACTERISTICS, `${location}/characteristic`, errors);
    if (!Array.isArray(role.compatibleFormationPackIds)) errors.push(`${location}/compatibleFormationPackIds must be an array`);
    else role.compatibleFormationPackIds.forEach((id, itemIndex) => requireId(id, `${location}/compatibleFormationPackIds/${itemIndex}`, errors));
    if (!Array.isArray(role.synergyTags)) errors.push(`${location}/synergyTags must be an array`);
    else role.synergyTags.forEach((tag, itemIndex) => requireId(tag, `${location}/synergyTags/${itemIndex}`, errors));
    requireNumber(role.reuseCooldownWaves, `${location}/reuseCooldownWaves`, errors, { minimum: 0, maximum: 100, integer: true });
    requireNumber(role.maximumSimultaneousCount, `${location}/maximumSimultaneousCount`, errors, { minimum: 1, maximum: 1000, integer: true });
    requireNumber(role.performanceCost, `${location}/performanceCost`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
  });
};

const validateFormationPackManifest = (packs, errors) => {
  if (!Array.isArray(packs) || packs.length === 0) {
    errors.push('/formationPacks must be a non-empty array');
    return;
  }
  const ids = new Set();
  packs.forEach((pack, index) => {
    const location = `/formationPacks/${index}`;
    if (!requireObject(pack, location, errors)) return;
    allowedKeys(pack, [
      'id', 'label', 'enemyRoleIds', 'enemyCount', 'totalThreatCost', 'entryDirection', 'entryPath',
      'formationShape', 'movementBehavior', 'attackBehavior', 'firingBehavior', 'returnBehavior',
      'holdSeconds', 'telegraphSeconds', 'attackDurationSeconds', 'attackRecoverySeconds',
      'attackGroupSize', 'attackCycles', 'synergyAdjustment', 'minimumSector',
      'maximumSimultaneousInstances', 'recoveryRequiredSeconds', 'compatibleMissionRoles',
      'compatibleSectorIds', 'mobilePerformanceCost'
    ], location, errors);
    requireId(pack.id, `${location}/id`, errors);
    if (ids.has(pack.id)) errors.push(`/formationPacks contains duplicate id: ${String(pack.id)}`);
    ids.add(pack.id);
    requireString(pack.label, `${location}/label`, errors, 120);
    if (!Array.isArray(pack.enemyRoleIds) || pack.enemyRoleIds.length === 0) errors.push(`${location}/enemyRoleIds must be a non-empty array`);
    else pack.enemyRoleIds.forEach((id, itemIndex) => requireId(id, `${location}/enemyRoleIds/${itemIndex}`, errors));
    requireNumber(pack.enemyCount, `${location}/enemyCount`, errors, { minimum: 1, maximum: 1000, integer: true });
    requireNumber(pack.totalThreatCost, `${location}/totalThreatCost`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
    requireEnum(pack.entryDirection, FORMATION_ENTRY_DIRECTIONS, `${location}/entryDirection`, errors);
    requireEnum(pack.entryPath, FORMATION_ENTRY_PATHS, `${location}/entryPath`, errors);
    requireEnum(pack.formationShape, SPAWN_PATTERNS, `${location}/formationShape`, errors);
    requireEnum(pack.movementBehavior, FORMATION_MOVEMENTS, `${location}/movementBehavior`, errors);
    requireEnum(pack.attackBehavior, FORMATION_ATTACK_BEHAVIORS, `${location}/attackBehavior`, errors);
    requireEnum(pack.firingBehavior, FORMATION_FIRING_BEHAVIORS, `${location}/firingBehavior`, errors);
    requireEnum(pack.returnBehavior, FORMATION_RETURN_BEHAVIORS, `${location}/returnBehavior`, errors);
    requireNumber(pack.holdSeconds, `${location}/holdSeconds`, errors, { minimum: 0.35, maximum: 12 });
    requireNumber(pack.telegraphSeconds, `${location}/telegraphSeconds`, errors, { minimum: 0.2, maximum: 4 });
    requireNumber(pack.attackDurationSeconds, `${location}/attackDurationSeconds`, errors, { minimum: 0.3, maximum: 8 });
    requireNumber(pack.attackRecoverySeconds, `${location}/attackRecoverySeconds`, errors, { minimum: 0.35, maximum: 12 });
    requireNumber(pack.attackGroupSize, `${location}/attackGroupSize`, errors, { minimum: 1, maximum: 48, integer: true });
    requireNumber(pack.attackCycles, `${location}/attackCycles`, errors, { minimum: 0, maximum: 100, integer: true });
    requireNumber(pack.synergyAdjustment, `${location}/synergyAdjustment`, errors, { minimum: -1000000, maximum: 1000000 });
    requireNumber(pack.minimumSector, `${location}/minimumSector`, errors, { minimum: 1, maximum: 1000, integer: true });
    requireNumber(pack.maximumSimultaneousInstances, `${location}/maximumSimultaneousInstances`, errors, { minimum: 1, maximum: 100, integer: true });
    requireNumber(pack.recoveryRequiredSeconds, `${location}/recoveryRequiredSeconds`, errors, { minimum: 0, maximum: 600 });
    validateUniqueEnumArray(pack.compatibleMissionRoles, CAMPAIGN_MISSION_ROLES, `${location}/compatibleMissionRoles`, errors, { minimumItems: 1 });
    if (!Array.isArray(pack.compatibleSectorIds) || pack.compatibleSectorIds.length === 0) errors.push(`${location}/compatibleSectorIds must be a non-empty array`);
    else pack.compatibleSectorIds.forEach((id, itemIndex) => requireId(id, `${location}/compatibleSectorIds/${itemIndex}`, errors));
    requireNumber(pack.mobilePerformanceCost, `${location}/mobilePerformanceCost`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
  });
};

const validateMiniBossManifest = (miniBosses, errors) => {
  if (!Array.isArray(miniBosses) || miniBosses.length === 0) {
    errors.push('/miniBosses must be a non-empty array');
    return;
  }
  const ids = new Set();
  miniBosses.forEach((miniBoss, index) => {
    const location = `/miniBosses/${index}`;
    if (!requireObject(miniBoss, location, errors)) return;
    allowedKeys(miniBoss, [
      'id', 'bossId', 'label', 'visualIdentity', 'combatRole', 'mainAttacks', 'suitableSectorIds',
      'threatCost', 'recommendedPower', 'usage', 'campaignReady', 'validationStatus'
    ], location, errors);
    requireId(miniBoss.id, `${location}/id`, errors);
    if (ids.has(miniBoss.id)) errors.push(`/miniBosses contains duplicate id: ${String(miniBoss.id)}`);
    ids.add(miniBoss.id);
    requireEnum(miniBoss.bossId, MINI_BOSS_IDS, `${location}/bossId`, errors);
    requireString(miniBoss.label, `${location}/label`, errors, 120);
    requireString(miniBoss.visualIdentity, `${location}/visualIdentity`, errors, 500);
    requireString(miniBoss.combatRole, `${location}/combatRole`, errors, 240);
    if (!Array.isArray(miniBoss.mainAttacks) || miniBoss.mainAttacks.length < 2 || miniBoss.mainAttacks.length > 3) {
      errors.push(`${location}/mainAttacks must contain two or three attacks`);
    } else miniBoss.mainAttacks.forEach((attack, itemIndex) => requireString(attack, `${location}/mainAttacks/${itemIndex}`, errors, 160));
    if (!Array.isArray(miniBoss.suitableSectorIds) || miniBoss.suitableSectorIds.length === 0) errors.push(`${location}/suitableSectorIds must be a non-empty array`);
    else miniBoss.suitableSectorIds.forEach((id, itemIndex) => requireId(id, `${location}/suitableSectorIds/${itemIndex}`, errors));
    requireNumber(miniBoss.threatCost, `${location}/threatCost`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
    requireNumber(miniBoss.recommendedPower, `${location}/recommendedPower`, errors, { minimum: 0, maximum: 1000000000, integer: true });
    requireEnum(miniBoss.usage, MINI_BOSS_USAGES, `${location}/usage`, errors);
    if (typeof miniBoss.campaignReady !== 'boolean') errors.push(`${location}/campaignReady must be a boolean`);
    requireEnum(miniBoss.validationStatus, MINI_BOSS_VALIDATION_STATUSES, `${location}/validationStatus`, errors);
  });
};

const validateCampaignMapPosition = (position, location, errors) => {
  if (!requireObject(position, location, errors)) return false;
  allowedKeys(position, ['x', 'y'], location, errors);
  requireNumber(position.x, `${location}/x`, errors, { minimum: 0, maximum: 1 });
  requireNumber(position.y, `${location}/y`, errors, { minimum: 0, maximum: 1 });
  return isFiniteNumber(position.x) && isFiniteNumber(position.y)
    && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1;
};

const validateCampaignRouteSummary = (summary, location, errors) => {
  if (!requireObject(summary, location, errors)) return;
  allowedKeys(summary, [
    'combatIntensity', 'miniBossPresence', 'rewardType', 'recommendedSupportTags', 'estimatedWaveCount'
  ], location, errors);
  requireEnum(summary.combatIntensity, CAMPAIGN_ROUTE_RISKS, `${location}/combatIntensity`, errors);
  requireEnum(summary.miniBossPresence, CAMPAIGN_ROUTE_MINI_BOSS_PRESENCE, `${location}/miniBossPresence`, errors);
  requireString(summary.rewardType, `${location}/rewardType`, errors, 120);
  validateUniqueEnumArray(
    summary.recommendedSupportTags,
    SUPPORT_RECOMMENDATION_TAGS,
    `${location}/recommendedSupportTags`,
    errors
  );
  requireNumber(summary.estimatedWaveCount, `${location}/estimatedWaveCount`, errors, {
    minimum: 1,
    maximum: 100,
    integer: true
  });
};

const validateCampaignGraph = (graph, campaign, errors) => {
  if (graph === undefined) return;
  if (!requireObject(graph, '/campaignGraph', errors)) return;
  allowedKeys(graph, ['entryNodeId', 'nodes'], '/campaignGraph', errors);
  requireId(graph.entryNodeId, '/campaignGraph/entryNodeId', errors);
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    errors.push('/campaignGraph/nodes must be a non-empty array');
    return;
  }

  const levels = Array.isArray(campaign.levels) ? campaign.levels.filter(isPlainObject) : [];
  const sectors = Array.isArray(campaign.sectors) ? campaign.sectors.filter(isPlainObject) : [];
  const levelsById = new Map(levels.flatMap((level) => typeof level.id === 'string' ? [[level.id, level]] : []));
  const sectorsById = new Map(sectors.flatMap((sector) => typeof sector.id === 'string' ? [[sector.id, sector]] : []));
  const nodes = graph.nodes.filter(isPlainObject);
  const nodesById = new Map();
  const missionOwnerById = new Map();
  const edgeOwnerById = new Map();

  graph.nodes.forEach((node, nodeIndex) => {
    const location = `/campaignGraph/nodes/${nodeIndex}`;
    if (!requireObject(node, location, errors)) return;
    allowedKeys(node, [
      'nodeId', 'sectorId', 'depth', 'routeId', 'displayLabel', 'missionDefinitionId',
      'prerequisiteNodeIds', 'prerequisiteMode', 'outgoingEdges', 'rejoinNodeId', 'optional',
      'mainPath', 'masteryBranch', 'oneTime', 'bossId', 'miniBossIds', 'weeklyStreakEligible',
      'weeklyScoreMultiplier', 'recommendedPower', 'rewardProfile', 'mapPosition',
      'routeControlPoints', 'routeSummary'
    ], location, errors);
    requireId(node.nodeId, `${location}/nodeId`, errors);
    if (nodesById.has(node.nodeId)) errors.push(`/campaignGraph/nodes contains duplicate nodeId: ${String(node.nodeId)}`);
    else if (typeof node.nodeId === 'string') nodesById.set(node.nodeId, node);
    requireId(node.sectorId, `${location}/sectorId`, errors);
    requireNumber(node.depth, `${location}/depth`, errors, { minimum: 1, maximum: 100000, integer: true });
    requireId(node.routeId, `${location}/routeId`, errors);
    requireString(node.displayLabel, `${location}/displayLabel`, errors, 120);
    requireId(node.missionDefinitionId, `${location}/missionDefinitionId`, errors);
    if (typeof node.missionDefinitionId === 'string') {
      const priorOwner = missionOwnerById.get(node.missionDefinitionId);
      if (priorOwner) {
        errors.push(`${location}/missionDefinitionId must be unique; already owned by Campaign graph node ${priorOwner}`);
      } else missionOwnerById.set(node.missionDefinitionId, node.nodeId);
    }
    if (!Array.isArray(node.prerequisiteNodeIds)) {
      errors.push(`${location}/prerequisiteNodeIds must be an array`);
    } else {
      const prerequisiteIds = new Set();
      node.prerequisiteNodeIds.forEach((nodeId, itemIndex) => {
        requireId(nodeId, `${location}/prerequisiteNodeIds/${itemIndex}`, errors);
        if (prerequisiteIds.has(nodeId)) errors.push(`${location}/prerequisiteNodeIds contains duplicate value: ${String(nodeId)}`);
        prerequisiteIds.add(nodeId);
      });
    }
    requireEnum(node.prerequisiteMode, new Set(['any', 'all']), `${location}/prerequisiteMode`, errors);
    if (!Array.isArray(node.outgoingEdges)) {
      errors.push(`${location}/outgoingEdges must be an array`);
    } else {
      const routeChoiceLabels = new Set();
      const routeChoiceIds = new Set();
      node.outgoingEdges.forEach((edge, edgeIndex) => {
        const edgeLocation = `${location}/outgoingEdges/${edgeIndex}`;
        if (!requireObject(edge, edgeLocation, errors)) return;
        allowedKeys(edge, [
          'edgeId', 'toNodeId', 'routeId', 'label', 'kind', 'risk', 'weeklyScoreMultiplier'
        ], edgeLocation, errors);
        requireId(edge.edgeId, `${edgeLocation}/edgeId`, errors);
        if (edgeOwnerById.has(edge.edgeId)) {
          errors.push(`${edgeLocation}/edgeId must be globally unique; already owned by ${edgeOwnerById.get(edge.edgeId)}`);
        } else if (typeof edge.edgeId === 'string') edgeOwnerById.set(edge.edgeId, node.nodeId);
        requireId(edge.toNodeId, `${edgeLocation}/toNodeId`, errors);
        requireId(edge.routeId, `${edgeLocation}/routeId`, errors);
        requireString(edge.label, `${edgeLocation}/label`, errors, 120);
        requireEnum(edge.kind, CAMPAIGN_ROUTE_EDGE_KINDS, `${edgeLocation}/kind`, errors);
        requireEnum(edge.risk, CAMPAIGN_ROUTE_RISKS, `${edgeLocation}/risk`, errors);
        requireNumber(edge.weeklyScoreMultiplier, `${edgeLocation}/weeklyScoreMultiplier`, errors, {
          minimum: 0.1,
          maximum: 10
        });
        if (edge.kind === 'route-choice') {
          const normalizedLabel = typeof edge.label === 'string' ? edge.label.trim().toLowerCase() : edge.label;
          if (routeChoiceLabels.has(normalizedLabel)) errors.push(`${location}/outgoingEdges route-choice labels must be unique`);
          if (routeChoiceIds.has(edge.routeId)) errors.push(`${location}/outgoingEdges route-choice routeIds must be unique`);
          routeChoiceLabels.add(normalizedLabel);
          routeChoiceIds.add(edge.routeId);
        }
      });
    }
    if (node.rejoinNodeId !== null) requireId(node.rejoinNodeId, `${location}/rejoinNodeId`, errors);
    ['optional', 'mainPath', 'masteryBranch', 'oneTime', 'weeklyStreakEligible'].forEach((key) => {
      if (typeof node[key] !== 'boolean') errors.push(`${location}/${key} must be a boolean`);
    });
    if (node.bossId !== null) requireEnum(node.bossId, MAJOR_BOSS_IDS, `${location}/bossId`, errors);
    validateUniqueEnumArray(node.miniBossIds, MINI_BOSS_IDS, `${location}/miniBossIds`, errors);
    requireNumber(node.weeklyScoreMultiplier, `${location}/weeklyScoreMultiplier`, errors, {
      minimum: 0.1,
      maximum: 10
    });
    if (requireObject(node.recommendedPower, `${location}/recommendedPower`, errors)) {
      const powerKeys = ['minimum', 'expected', 'comfortable'];
      allowedKeys(node.recommendedPower, powerKeys, `${location}/recommendedPower`, errors);
      powerKeys.forEach((key) => requireNumber(
        node.recommendedPower[key],
        `${location}/recommendedPower/${key}`,
        errors,
        { minimum: 0, maximum: 1000000000, integer: true }
      ));
      if (powerKeys.every((key) => isFiniteNumber(node.recommendedPower[key])) && !(
        node.recommendedPower.minimum <= node.recommendedPower.expected
        && node.recommendedPower.expected <= node.recommendedPower.comfortable
      )) errors.push(`${location}/recommendedPower must be ordered minimum <= expected <= comfortable`);
    }
    requireEnum(node.rewardProfile, CAMPAIGN_REWARD_PROFILES, `${location}/rewardProfile`, errors);
    validateCampaignMapPosition(node.mapPosition, `${location}/mapPosition`, errors);
    if (!Array.isArray(node.routeControlPoints) || node.routeControlPoints.length > 12) {
      errors.push(`${location}/routeControlPoints must be an array with at most 12 map points`);
    } else {
      node.routeControlPoints.forEach((position, pointIndex) => (
        validateCampaignMapPosition(position, `${location}/routeControlPoints/${pointIndex}`, errors)
      ));
    }
    validateCampaignRouteSummary(node.routeSummary, `${location}/routeSummary`, errors);
  });

  if (!nodesById.has(graph.entryNodeId)) {
    errors.push(`/campaignGraph/entryNodeId references unknown Campaign graph node: ${String(graph.entryNodeId)}`);
  }

  const incomingSources = new Map([...nodesById.keys()].map((nodeId) => [nodeId, new Set()]));
  nodes.forEach((node) => {
    const nodeIndex = graph.nodes.indexOf(node);
    const location = `/campaignGraph/nodes/${nodeIndex}`;
    if (typeof node.sectorId === 'string' && !sectorsById.has(node.sectorId)) {
      errors.push(`${location}/sectorId references unknown Campaign sector: ${node.sectorId}`);
    }
    const level = typeof node.missionDefinitionId === 'string' ? levelsById.get(node.missionDefinitionId) : undefined;
    if (!level && typeof node.missionDefinitionId === 'string') {
      errors.push(`${location}/missionDefinitionId references unknown Campaign Mission: ${node.missionDefinitionId}`);
    } else if (level) {
      if (level.campaignProgression?.sectorId !== node.sectorId) {
        errors.push(`${location}/missionDefinitionId must reference a Mission owned by sector ${String(node.sectorId)}`);
      }
      if (isFiniteNumber(node.routeSummary?.estimatedWaveCount) && Array.isArray(level.waves)
        && node.routeSummary.estimatedWaveCount !== level.waves.length) {
        errors.push(`${location}/routeSummary/estimatedWaveCount must match the referenced Mission wave count`);
      }
    }
    if (Array.isArray(node.prerequisiteNodeIds)) node.prerequisiteNodeIds.forEach((prerequisiteId, itemIndex) => {
      const prerequisite = nodesById.get(prerequisiteId);
      if (!prerequisite) {
        errors.push(`${location}/prerequisiteNodeIds/${itemIndex} references unknown Campaign graph node: ${String(prerequisiteId)}`);
      } else if (prerequisiteId === node.nodeId) {
        errors.push(`${location}/prerequisiteNodeIds/${itemIndex} cannot reference its owning node`);
      } else if (isFiniteNumber(prerequisite.depth) && isFiniteNumber(node.depth) && prerequisite.depth >= node.depth) {
        errors.push(`${location}/prerequisiteNodeIds/${itemIndex} must reference a lower-depth node`);
      }
    });
    if (node.nodeId === graph.entryNodeId && Array.isArray(node.prerequisiteNodeIds) && node.prerequisiteNodeIds.length > 0) {
      errors.push(`${location}/prerequisiteNodeIds must be empty for the Campaign graph entry node`);
    }
    if (node.nodeId !== graph.entryNodeId && Array.isArray(node.prerequisiteNodeIds) && node.prerequisiteNodeIds.length === 0) {
      errors.push(`${location}/prerequisiteNodeIds must identify how this non-entry node unlocks`);
    }
    if (Array.isArray(node.outgoingEdges)) node.outgoingEdges.forEach((edge, edgeIndex) => {
      if (!isPlainObject(edge)) return;
      const edgeLocation = `${location}/outgoingEdges/${edgeIndex}`;
      const target = nodesById.get(edge.toNodeId);
      if (!target) {
        errors.push(`${edgeLocation}/toNodeId references unknown Campaign graph node: ${String(edge.toNodeId)}`);
        return;
      }
      incomingSources.get(target.nodeId)?.add(node.nodeId);
      if (edge.toNodeId === node.nodeId) errors.push(`${edgeLocation}/toNodeId cannot reference its owning node`);
      if (isFiniteNumber(node.depth) && isFiniteNumber(target.depth) && target.depth <= node.depth) {
        errors.push(`${edgeLocation}/toNodeId must advance to a higher-depth node`);
      }
      if (Array.isArray(target.prerequisiteNodeIds) && !target.prerequisiteNodeIds.includes(node.nodeId)) {
        errors.push(`${edgeLocation}/toNodeId must list ${String(node.nodeId)} as a prerequisite`);
      }
      if (edge.kind === 'rejoin' && node.rejoinNodeId !== edge.toNodeId) {
        errors.push(`${edgeLocation} must target the owning node's rejoinNodeId`);
      }
    });
    if (node.rejoinNodeId !== null) {
      const target = nodesById.get(node.rejoinNodeId);
      if (!target) errors.push(`${location}/rejoinNodeId references unknown Campaign graph node: ${String(node.rejoinNodeId)}`);
      else {
        if (target.sectorId !== node.sectorId) errors.push(`${location}/rejoinNodeId must remain inside sector ${String(node.sectorId)}`);
        if (isFiniteNumber(node.depth) && isFiniteNumber(target.depth) && target.depth <= node.depth) {
          errors.push(`${location}/rejoinNodeId must reference a higher-depth node`);
        }
      }
    }
  });

  const canReach = (fromNodeId, toNodeId) => {
    const pending = [fromNodeId];
    const visited = new Set();
    while (pending.length > 0) {
      const currentId = pending.shift();
      if (currentId === toNodeId) return true;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const current = nodesById.get(currentId);
      if (!current || !Array.isArray(current.outgoingEdges)) continue;
      current.outgoingEdges.forEach((edge) => {
        if (isPlainObject(edge) && typeof edge.toNodeId === 'string' && !visited.has(edge.toNodeId)) pending.push(edge.toNodeId);
      });
    }
    return false;
  };

  nodes.forEach((node) => {
    const nodeIndex = graph.nodes.indexOf(node);
    const location = `/campaignGraph/nodes/${nodeIndex}`;
    if (node.nodeId !== graph.entryNodeId && (incomingSources.get(node.nodeId)?.size ?? 0) === 0) {
      errors.push(`${location} is disconnected because it has no incoming route edge`);
    }
    if (node.rejoinNodeId !== null && nodesById.has(node.rejoinNodeId) && !canReach(node.nodeId, node.rejoinNodeId)) {
      errors.push(`${location}/rejoinNodeId must be reachable through this node's outgoing route edges`);
    }
  });

  if (nodesById.has(graph.entryNodeId)) {
    const reachable = new Set();
    const pending = [graph.entryNodeId];
    while (pending.length > 0) {
      const nodeId = pending.shift();
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      const node = nodesById.get(nodeId);
      if (!node || !Array.isArray(node.outgoingEdges)) continue;
      node.outgoingEdges.forEach((edge) => {
        if (isPlainObject(edge) && nodesById.has(edge.toNodeId)) pending.push(edge.toNodeId);
      });
    }
    nodesById.forEach((_node, nodeId) => {
      if (!reachable.has(nodeId)) errors.push(`/campaignGraph/nodes node ${nodeId} is unreachable from entryNodeId`);
    });
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) {
      errors.push(`/campaignGraph contains a directed cycle through node ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = nodesById.get(nodeId);
    if (node && Array.isArray(node.outgoingEdges)) node.outgoingEdges.forEach((edge) => {
      if (isPlainObject(edge) && nodesById.has(edge.toNodeId)) visit(edge.toNodeId);
    });
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  nodesById.forEach((_node, nodeId) => visit(nodeId));

  const siblingGroups = new Map();
  nodes.forEach((node) => {
    const key = `${String(node.sectorId)}:${String(node.depth)}`;
    siblingGroups.set(key, [...(siblingGroups.get(key) ?? []), node]);
  });
  siblingGroups.forEach((siblings, key) => {
    if (siblings.length < 2) return;
    const labels = new Set();
    const routeIds = new Set();
    const rejoinIds = new Set(siblings.map((node) => node.rejoinNodeId));
    siblings.forEach((node) => {
      const label = typeof node.displayLabel === 'string' ? node.displayLabel.trim().toLowerCase() : node.displayLabel;
      if (labels.has(label)) errors.push(`/campaignGraph sibling nodes at ${key} must use distinct displayLabel values`);
      if (routeIds.has(node.routeId)) errors.push(`/campaignGraph sibling nodes at ${key} must use distinct routeId values`);
      labels.add(label);
      routeIds.add(node.routeId);
    });
    if (rejoinIds.size > 1) errors.push(`/campaignGraph sibling nodes at ${key} must share one rejoinNodeId`);
  });

  const referencedNodeOwners = new Map();
  sectors.forEach((sector, sectorIndex) => {
    const sectorLocation = `/sectors/${sectorIndex}`;
    if (!Array.isArray(sector.mainNodeIds) || sector.mainNodeIds.length !== 5) {
      errors.push(`${sectorLocation}/mainNodeIds is required when campaignGraph is present`);
      return;
    }
    if (!Array.isArray(sector.routeNodeIds)) {
      errors.push(`${sectorLocation}/routeNodeIds is required when campaignGraph is present`);
      return;
    }
    const listedNodeIds = [...sector.mainNodeIds, ...sector.routeNodeIds];
    const localIds = new Set();
    listedNodeIds.forEach((nodeId, listedIndex) => {
      const node = nodesById.get(nodeId);
      const key = listedIndex < 5 ? 'mainNodeIds' : 'routeNodeIds';
      const keyIndex = listedIndex < 5 ? listedIndex : listedIndex - 5;
      if (!node) errors.push(`${sectorLocation}/${key}/${keyIndex} references unknown Campaign graph node: ${String(nodeId)}`);
      else if (node.sectorId !== sector.id) errors.push(`${sectorLocation}/${key}/${keyIndex} must reference a node owned by sector ${String(sector.id)}`);
      if (localIds.has(nodeId)) errors.push(`${sectorLocation} lists Campaign graph node ${String(nodeId)} more than once`);
      localIds.add(nodeId);
      referencedNodeOwners.set(nodeId, [...(referencedNodeOwners.get(nodeId) ?? []), sector.id]);
    });
    sector.mainNodeIds.forEach((nodeId, mainIndex) => {
      const node = nodesById.get(nodeId);
      if (!node) return;
      if (node.mainPath !== true) errors.push(`${sectorLocation}/mainNodeIds/${mainIndex} must reference a mainPath node`);
      if (node.missionDefinitionId !== sector.missionIds?.[mainIndex]) {
        errors.push(`${sectorLocation}/mainNodeIds/${mainIndex} must reference Mission ${String(sector.missionIds?.[mainIndex])}`);
      }
    });
    sector.routeNodeIds.forEach((nodeId, routeIndex) => {
      const node = nodesById.get(nodeId);
      if (node?.mainPath === true) errors.push(`${sectorLocation}/routeNodeIds/${routeIndex} cannot reference a mainPath node`);
    });
    const bossNodes = listedNodeIds.map((nodeId) => nodesById.get(nodeId)).filter((node) => node?.bossId !== null);
    if (bossNodes.length !== 1) errors.push(`${sectorLocation} must contain exactly one major boss Campaign graph node`);
    else {
      if (bossNodes[0].bossId !== sector.majorBossId) errors.push(`${sectorLocation} boss graph node must reference ${String(sector.majorBossId)}`);
      if (bossNodes[0].nodeId !== sector.mainNodeIds[4]) errors.push(`${sectorLocation}/mainNodeIds/4 must be the sector major boss graph node`);
    }
  });
  nodesById.forEach((node, nodeId) => {
    const owners = referencedNodeOwners.get(nodeId) ?? [];
    if (owners.length !== 1) errors.push(`/campaignGraph/nodes node ${nodeId} must be listed by exactly one owning sector`);
  });
};

const validateCampaignBranchUnlockCondition = (
  condition,
  location,
  missionIds,
  branchIds,
  bossEventIds,
  errors
) => {
  if (!requireObject(condition, location, errors)) return;
  if (!CAMPAIGN_BRANCH_UNLOCK_KINDS.has(condition.kind)) {
    allowedKeys(condition, ['kind'], location, errors);
    requireEnum(condition.kind, CAMPAIGN_BRANCH_UNLOCK_KINDS, `${location}/kind`, errors);
    return;
  }
  if (condition.kind === 'all-stars-earned') {
    allowedKeys(condition, ['kind', 'missionId'], location, errors);
    requireId(condition.missionId, `${location}/missionId`, errors);
    if (typeof condition.missionId === 'string' && !missionIds.has(condition.missionId)) {
      errors.push(`${location}/missionId references unknown Campaign Mission: ${condition.missionId}`);
    }
  } else if (condition.kind === 'sector-mastered') {
    allowedKeys(condition, ['kind', 'missionIds'], location, errors);
    if (!Array.isArray(condition.missionIds) || condition.missionIds.length === 0) {
      errors.push(`${location}/missionIds must be a non-empty array`);
    } else {
      const seen = new Set();
      condition.missionIds.forEach((missionId, index) => {
        requireId(missionId, `${location}/missionIds/${index}`, errors);
        if (seen.has(missionId)) errors.push(`${location}/missionIds contains duplicate value: ${String(missionId)}`);
        if (typeof missionId === 'string' && !missionIds.has(missionId)) {
          errors.push(`${location}/missionIds/${index} references unknown Campaign Mission: ${missionId}`);
        }
        seen.add(missionId);
      });
    }
  } else if (condition.kind === 'branch-completed') {
    allowedKeys(condition, ['kind', 'branchId'], location, errors);
    requireId(condition.branchId, `${location}/branchId`, errors);
    if (typeof condition.branchId === 'string' && !branchIds.has(condition.branchId)) {
      errors.push(`${location}/branchId references unknown Campaign branch: ${condition.branchId}`);
    }
  } else if (condition.kind === 'boss-defeated') {
    allowedKeys(condition, ['kind', 'bossEventId'], location, errors);
    requireId(condition.bossEventId, `${location}/bossEventId`, errors);
    if (typeof condition.bossEventId === 'string' && !bossEventIds.has(condition.bossEventId)) {
      errors.push(`${location}/bossEventId references unknown Campaign boss event: ${condition.bossEventId}`);
    }
  } else {
    const key = condition.kind === 'achievement-earned'
      ? 'achievementId'
      : condition.kind === 'hidden-object-discovered'
        ? 'discoveryId'
        : 'challengeId';
    allowedKeys(condition, ['kind', key], location, errors);
    requireId(condition[key], `${location}/${key}`, errors);
  }
};

const validateCampaignPresentDropMission = (mission, location, errors) => {
  if (!requireObject(mission, location, errors)) return 0;
  allowedKeys(
    mission,
    ['id', 'kind', 'backgroundId', 'musicId', 'introSeconds', 'durationSeconds', 'exitSeconds', 'successCondition', 'presentTypes', 'spawnGroups'],
    location,
    errors
  );
  requireId(mission.id, `${location}/id`, errors);
  if (mission.kind !== 'present-drop') errors.push(`${location}/kind must be present-drop`);
  requireEnum(mission.backgroundId, BACKGROUND_IDS, `${location}/backgroundId`, errors);
  requireEnum(mission.musicId, MUSIC_IDS, `${location}/musicId`, errors);
  requireNumber(mission.introSeconds, `${location}/introSeconds`, errors, { minimum: 0, maximum: 10 });
  requireNumber(mission.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 20, maximum: 120 });
  requireNumber(mission.exitSeconds, `${location}/exitSeconds`, errors, { minimum: 0, maximum: 10 });
  if (mission.successCondition !== 'complete-timed-drop') errors.push(`${location}/successCondition must be complete-timed-drop`);

  const presentTypes = new Map();
  const presentKinds = new Set();
  if (!Array.isArray(mission.presentTypes) || mission.presentTypes.length === 0 || mission.presentTypes.length > 6) {
    errors.push(`${location}/presentTypes must contain between 1 and 6 target types`);
  } else {
    const presentTypeIds = new Set();
    mission.presentTypes.forEach((present, index) => {
      const presentLocation = `${location}/presentTypes/${index}`;
      if (!requireObject(present, presentLocation, errors)) return;
      allowedKeys(present, ['id', 'displayName', 'kind', 'spriteKey', 'health', 'coinValue', 'speedMultiplier', 'sizeMultiplier'], presentLocation, errors);
      requireId(present.id, `${presentLocation}/id`, errors);
      requireString(present.displayName, `${presentLocation}/displayName`, errors, 80);
      requireEnum(present.kind, PRESENT_DROP_PRESENT_KINDS, `${presentLocation}/kind`, errors);
      requireEnum(present.spriteKey, SUPPLY_DROP_SPRITE_KEYS, `${presentLocation}/spriteKey`, errors);
      requireNumber(present.health, `${presentLocation}/health`, errors, { minimum: Number.EPSILON, maximum: 1000 });
      requireNumber(present.coinValue, `${presentLocation}/coinValue`, errors, { minimum: 1, maximum: 100000, integer: true });
      requireNumber(present.speedMultiplier, `${presentLocation}/speedMultiplier`, errors, { minimum: 0.25, maximum: 3 });
      requireNumber(present.sizeMultiplier, `${presentLocation}/sizeMultiplier`, errors, { minimum: 0.5, maximum: 2 });
      if (presentTypeIds.has(present.id)) errors.push(`${location}/presentTypes contains duplicate id: ${String(present.id)}`);
      if (presentKinds.has(present.kind)) errors.push(`${location}/presentTypes contains duplicate kind: ${String(present.kind)}`);
      presentTypeIds.add(present.id);
      presentKinds.add(present.kind);
      if (typeof present.id === 'string' && isFiniteNumber(present.coinValue)) {
        presentTypes.set(present.id, { coinValue: present.coinValue });
      }
    });
    if (!presentKinds.has('standard') || !presentKinds.has('golden')) {
      errors.push(`${location}/presentTypes must include standard and golden targets`);
    }
  }

  let maximumPerformanceCoins = 0;
  const usedPresentTypeIds = new Set();
  if (!Array.isArray(mission.spawnGroups) || mission.spawnGroups.length === 0 || mission.spawnGroups.length > 32) {
    errors.push(`${location}/spawnGroups must contain between 1 and 32 groups`);
  } else {
    const groupIds = new Set();
    let previousStart = -Infinity;
    mission.spawnGroups.forEach((group, index) => {
      const groupLocation = `${location}/spawnGroups/${index}`;
      if (!requireObject(group, groupLocation, errors)) return;
      allowedKeys(group, ['id', 'startSeconds', 'count', 'presentTypeId', 'patternId', 'spawnIntervalSeconds'], groupLocation, errors);
      requireId(group.id, `${groupLocation}/id`, errors);
      requireNumber(group.startSeconds, `${groupLocation}/startSeconds`, errors, { minimum: 0, maximum: mission.durationSeconds });
      requireNumber(group.count, `${groupLocation}/count`, errors, { minimum: 1, maximum: 100, integer: true });
      requireId(group.presentTypeId, `${groupLocation}/presentTypeId`, errors);
      requireEnum(group.patternId, PRESENT_DROP_PATTERN_IDS, `${groupLocation}/patternId`, errors);
      requireNumber(group.spawnIntervalSeconds, `${groupLocation}/spawnIntervalSeconds`, errors, { minimum: 0.05, maximum: 10 });
      if (groupIds.has(group.id)) errors.push(`${location}/spawnGroups contains duplicate id: ${String(group.id)}`);
      groupIds.add(group.id);
      if (isFiniteNumber(group.startSeconds) && group.startSeconds < previousStart) {
        errors.push(`${location}/spawnGroups must be ordered by startSeconds`);
      }
      if (isFiniteNumber(group.startSeconds)) previousStart = group.startSeconds;
      const presentType = presentTypes.get(group.presentTypeId);
      if (!presentType) {
        errors.push(`${groupLocation}/presentTypeId references unknown Present Drop target: ${String(group.presentTypeId)}`);
      } else {
        usedPresentTypeIds.add(group.presentTypeId);
        if (Number.isInteger(group.count)) maximumPerformanceCoins += group.count * presentType.coinValue;
      }
      if (
        isFiniteNumber(group.startSeconds)
        && Number.isInteger(group.count)
        && isFiniteNumber(group.spawnIntervalSeconds)
        && isFiniteNumber(mission.durationSeconds)
        && group.startSeconds + Math.max(0, group.count - 1) * group.spawnIntervalSeconds > mission.durationSeconds + EPSILON
      ) {
        errors.push(`${groupLocation} spawns must fit inside the Present Drop duration`);
      }
    });
  }
  for (const presentTypeId of presentTypes.keys()) {
    if (!usedPresentTypeIds.has(presentTypeId)) errors.push(`${location}/presentTypes contains unused target type: ${presentTypeId}`);
  }
  return maximumPerformanceCoins;
};

const validateCampaignCombatBranchMission = (mission, location, enemyRoles, errors) => {
  if (!requireObject(mission, location, errors)) return 0;
  allowedKeys(mission, [
    'id', 'kind', 'backgroundId', 'musicId', 'introSeconds', 'durationSeconds', 'exitSeconds',
    'successCondition', 'threatCap', 'combatBudget', 'rhythm', 'availablePowerupIds', 'events'
  ], location, errors);
  requireId(mission.id, `${location}/id`, errors);
  requireEnum(mission.kind, CAMPAIGN_COMBAT_BRANCH_MISSION_TYPES, `${location}/kind`, errors);
  requireEnum(mission.backgroundId, BACKGROUND_IDS, `${location}/backgroundId`, errors);
  requireEnum(mission.musicId, MUSIC_IDS, `${location}/musicId`, errors);
  requireNumber(mission.introSeconds, `${location}/introSeconds`, errors, { minimum: 0, maximum: 10 });
  requireNumber(mission.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 20, maximum: 120 });
  requireNumber(mission.exitSeconds, `${location}/exitSeconds`, errors, { minimum: 0, maximum: 10 });
  if (mission.successCondition !== 'clear-authored-encounters') {
    errors.push(`${location}/successCondition must be clear-authored-encounters`);
  }
  requireNumber(mission.threatCap, `${location}/threatCap`, errors, { minimum: 1, maximum: 1000, integer: true });
  requireNumber(mission.combatBudget, `${location}/combatBudget`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
  requireEnum(mission.rhythm, CAMPAIGN_WAVE_RHYTHMS, `${location}/rhythm`, errors);
  validateUniqueEnumArray(mission.availablePowerupIds, POWERUP_IDS, `${location}/availablePowerupIds`, errors);
  const availablePowerups = new Set(Array.isArray(mission.availablePowerupIds) ? mission.availablePowerupIds : []);
  const rolesById = new Map(
    (Array.isArray(enemyRoles) ? enemyRoles.filter(isPlainObject) : [])
      .filter((role) => typeof role.id === 'string')
      .map((role) => [role.id, role])
  );
  if (!Array.isArray(mission.events) || mission.events.length === 0 || mission.events.length > 32) {
    errors.push(`${location}/events must contain between 1 and 32 authored events`);
    return 0;
  }
  const eventIds = new Set();
  const formationPatterns = new Set();
  let previousStartSeconds = -Infinity;
  let weightedThreat = 0;
  let hostileEventCount = 0;
  let powerupEventCount = 0;
  let eliteEnemyCount = 0;
  let nonEliteEnemyCount = 0;
  mission.events.forEach((event, eventIndex) => {
    const eventLocation = `${location}/events/${eventIndex}`;
    validateEvent(event, eventLocation, mission.durationSeconds, availablePowerups, errors);
    if (eventIds.has(event?.id)) errors.push(`${location}/events contains duplicate id: ${String(event?.id)}`);
    eventIds.add(event?.id);
    if (isFiniteNumber(event?.startSeconds) && event.startSeconds < previousStartSeconds) {
      errors.push(`${location}/events must be ordered by startSeconds`);
    }
    if (isFiniteNumber(event?.startSeconds)) previousStartSeconds = event.startSeconds;
    if (isFiniteNumber(event?.startSeconds) && isFiniteNumber(event?.durationSeconds)
      && event.blocksWaveClock !== true
      && event.startSeconds + event.durationSeconds > mission.durationSeconds + EPSILON) {
      errors.push(`${eventLocation} must finish inside the combat branch duration`);
    }
    if (event?.kind === 'boss') {
      errors.push(`${eventLocation}/kind cannot contain major or mini-boss events`);
    }
    if (event?.kind === 'supply-drop') {
      errors.push(`${eventLocation}/kind belongs only to Present Drop branches`);
    }
    if (event?.kind === 'powerup') powerupEventCount += 1;
    if (event?.kind === 'spawn') {
      hostileEventCount += 1;
      formationPatterns.add(event.patternId);
      if (isFiniteNumber(event.count) && isFiniteNumber(mission.threatCap) && event.count > mission.threatCap) {
        errors.push(`${eventLocation}/count exceeds the combat branch threat cap`);
      }
      let weightedUnitThreat = 0;
      if (Array.isArray(event.enemies)) event.enemies.forEach((enemy, enemyIndex) => {
        const roleLocation = `${eventLocation}/enemies/${enemyIndex}/roleId`;
        const role = typeof enemy?.roleId === 'string' ? rolesById.get(enemy.roleId) : undefined;
        if (!role) {
          errors.push(`${roleLocation} references unknown enemy role: ${String(enemy?.roleId)}`);
        } else {
          if (role.enemyId !== enemy.enemyId) {
            errors.push(`${roleLocation} belongs to ${String(role.enemyId)}, not ${String(enemy.enemyId)}`);
          }
          if (role.spriteKey !== enemy.spriteKey) {
            errors.push(`${eventLocation}/enemies/${enemyIndex}/spriteKey must match role ${String(enemy.roleId)}`);
          }
          if (isFiniteNumber(enemy.weight) && isFiniteNumber(role.threatCost)) {
            weightedUnitThreat += enemy.weight * role.threatCost;
          }
        }
        if (enemy?.rank === 'elite') eliteEnemyCount += 1;
        else nonEliteEnemyCount += 1;
      });
      if (isFiniteNumber(event.count)) weightedThreat += event.count * weightedUnitThreat;
    } else if (event?.kind === 'asteroid-belt') {
      hostileEventCount += 1;
    }
  });
  if (hostileEventCount === 0) errors.push(`${location}/events requires at least one hostile encounter`);
  if (isFiniteNumber(mission.combatBudget) && weightedThreat > mission.combatBudget + EPSILON) {
    errors.push(`${location}/combatBudget is below authored enemy-role threat ${weightedThreat}`);
  }
  if (mission.kind === 'formation-challenge' && formationPatterns.size < 2) {
    errors.push(`${location}/events formation challenges require at least two formation patterns`);
  }
  if (mission.kind === 'support-trial' && powerupEventCount === 0) {
    errors.push(`${location}/events support trials require at least one power-up event`);
  }
  if (mission.kind === 'elite-remix' && (eliteEnemyCount === 0 || nonEliteEnemyCount > 0)) {
    errors.push(`${location}/events elite remixes require every spawn enemy to use elite rank`);
  }
  return 0;
};

const validateCampaignBranches = (branches, levels, enemyRoles, errors) => {
  if (branches === undefined) return;
  if (!Array.isArray(branches)) {
    errors.push('/campaignBranches must be an array');
    return;
  }
  const levelRows = Array.isArray(levels) ? levels.filter(isPlainObject) : [];
  const missionIds = new Set(levelRows.map((level) => level.id).filter((id) => typeof id === 'string'));
  const bossEventIds = new Set(levelRows.flatMap((level) => Array.isArray(level.waves) ? level.waves : []).flatMap((wave) => (
    isPlainObject(wave) && Array.isArray(wave.events)
      ? wave.events.filter((event) => isPlainObject(event) && event.kind === 'boss').map((event) => event.id).filter((id) => typeof id === 'string')
      : []
  )));
  const missionPositions = new Map(levelRows.flatMap((level) => (
    typeof level.id === 'string' && isPlainObject(level.campaignProgression) && isPlainObject(level.campaignProgression.mapPosition)
      ? [[level.id, level.campaignProgression.mapPosition]]
      : []
  )));
  const branchRows = branches.filter(isPlainObject);
  const branchIds = new Set(branchRows.map((branch) => branch.branchId).filter((id) => typeof id === 'string'));
  const seenBranchIds = new Set();
  const seenMissionDefinitionIds = new Set();
  const branchPositions = [];

  branches.forEach((branch, index) => {
    const location = `/campaignBranches/${index}`;
    if (!requireObject(branch, location, errors)) return;
    allowedKeys(branch, [
      'branchId', 'sourceMissionId', 'unlockCondition', 'requiredStars', 'missionType', 'displayName',
      'hiddenName', 'mapPosition', 'routeControlPoints', 'icon', 'lockedIcon', 'rewardPreview',
      'oneTimeCompletion', 'replayPolicy', 'failurePolicy', 'rewardCommitPolicy', 'missionDefinitionId',
      'missionDefinition', 'completionReward', 'returnNodeId', 'nextBranchNodeId', 'discoveryState'
    ], location, errors);
    requireId(branch.branchId, `${location}/branchId`, errors);
    if (seenBranchIds.has(branch.branchId)) errors.push('/campaignBranches contains duplicate branchId');
    seenBranchIds.add(branch.branchId);
    requireId(branch.sourceMissionId, `${location}/sourceMissionId`, errors);
    if (typeof branch.sourceMissionId === 'string' && !missionIds.has(branch.sourceMissionId)) {
      errors.push(`${location}/sourceMissionId references unknown Campaign Mission: ${branch.sourceMissionId}`);
    }
    validateCampaignBranchUnlockCondition(branch.unlockCondition, `${location}/unlockCondition`, missionIds, branchIds, bossEventIds, errors);
    requireNumber(branch.requiredStars, `${location}/requiredStars`, errors, { minimum: 0, maximum: 3, integer: true });
    if (isPlainObject(branch.unlockCondition) && branch.unlockCondition.kind === 'all-stars-earned') {
      if (branch.requiredStars !== 3) errors.push(`${location}/requiredStars must be 3 for an all-stars branch`);
      if (branch.unlockCondition.missionId !== branch.sourceMissionId) {
        errors.push(`${location}/unlockCondition/missionId must reference the source Mission`);
      }
    }
    requireEnum(branch.missionType, CAMPAIGN_BRANCH_MISSION_TYPES, `${location}/missionType`, errors);
    requireString(branch.displayName, `${location}/displayName`, errors, 80);
    requireString(branch.hiddenName, `${location}/hiddenName`, errors, 80);
    if (validateCampaignMapPosition(branch.mapPosition, `${location}/mapPosition`, errors)) {
      branchPositions.push({ location: `${location}/mapPosition`, x: branch.mapPosition.x, y: branch.mapPosition.y });
    }
    if (!Array.isArray(branch.routeControlPoints) || branch.routeControlPoints.length < 2 || branch.routeControlPoints.length > 12) {
      errors.push(`${location}/routeControlPoints must contain between 2 and 12 map points`);
    } else {
      branch.routeControlPoints.forEach((point, pointIndex) => validateCampaignMapPosition(point, `${location}/routeControlPoints/${pointIndex}`, errors));
      const sourcePosition = missionPositions.get(branch.sourceMissionId);
      const firstPoint = branch.routeControlPoints[0];
      const lastPoint = branch.routeControlPoints.at(-1);
      if (sourcePosition && isPlainObject(firstPoint) && (
        Math.abs(Number(firstPoint.x) - Number(sourcePosition.x)) > EPSILON
        || Math.abs(Number(firstPoint.y) - Number(sourcePosition.y)) > EPSILON
      )) errors.push(`${location}/routeControlPoints/0 must equal the source Mission position`);
      if (isPlainObject(lastPoint) && isPlainObject(branch.mapPosition) && (
        Math.abs(Number(lastPoint.x) - Number(branch.mapPosition.x)) > EPSILON
        || Math.abs(Number(lastPoint.y) - Number(branch.mapPosition.y)) > EPSILON
      )) errors.push(`${location}/routeControlPoints must end at the branch map position`);
    }
    requireEnum(branch.icon, CAMPAIGN_BRANCH_NODE_ICONS, `${location}/icon`, errors);
    requireEnum(branch.lockedIcon, CAMPAIGN_BRANCH_NODE_ICONS, `${location}/lockedIcon`, errors);
    if (requireObject(branch.rewardPreview, `${location}/rewardPreview`, errors)) {
      allowedKeys(branch.rewardPreview, ['category', 'label', 'minimumCoins', 'maximumCoins', 'hiddenUntilUnlocked'], `${location}/rewardPreview`, errors);
      requireEnum(branch.rewardPreview.category, CAMPAIGN_BRANCH_REWARD_CATEGORIES, `${location}/rewardPreview/category`, errors);
      requireString(branch.rewardPreview.label, `${location}/rewardPreview/label`, errors, 80);
      requireNumber(branch.rewardPreview.minimumCoins, `${location}/rewardPreview/minimumCoins`, errors, { minimum: 0, maximum: 1000000, integer: true });
      requireNumber(branch.rewardPreview.maximumCoins, `${location}/rewardPreview/maximumCoins`, errors, { minimum: 0, maximum: 1000000, integer: true });
      if (typeof branch.rewardPreview.hiddenUntilUnlocked !== 'boolean') errors.push(`${location}/rewardPreview/hiddenUntilUnlocked must be a boolean`);
      if (isFiniteNumber(branch.rewardPreview.minimumCoins) && isFiniteNumber(branch.rewardPreview.maximumCoins) && branch.rewardPreview.maximumCoins < branch.rewardPreview.minimumCoins) {
        errors.push(`${location}/rewardPreview maximum must be at least minimum`);
      }
    }
    if (typeof branch.oneTimeCompletion !== 'boolean') errors.push(`${location}/oneTimeCompletion must be a boolean`);
    requireEnum(branch.replayPolicy, CAMPAIGN_BRANCH_REPLAY_POLICIES, `${location}/replayPolicy`, errors);
    if (branch.oneTimeCompletion === true && branch.replayPolicy !== 'no-replay-after-claim') {
      errors.push(`${location}/replayPolicy must disable replay for a one-time branch`);
    }
    if (branch.oneTimeCompletion === false && branch.replayPolicy === 'no-replay-after-claim') {
      errors.push(`${location}/replayPolicy must be repeatable for a repeatable branch`);
    }
    if (branch.failurePolicy !== 'retry-no-reward') errors.push(`${location}/failurePolicy must be retry-no-reward`);
    if (branch.rewardCommitPolicy !== 'authoritative-idempotent-on-success') {
      errors.push(`${location}/rewardCommitPolicy must be authoritative-idempotent-on-success`);
    }
    requireId(branch.missionDefinitionId, `${location}/missionDefinitionId`, errors);
    if (seenMissionDefinitionIds.has(branch.missionDefinitionId)) errors.push('/campaignBranches contains duplicate missionDefinitionId');
    seenMissionDefinitionIds.add(branch.missionDefinitionId);
    const maximumPerformanceCoins = branch.missionType === 'present-drop'
      ? validateCampaignPresentDropMission(branch.missionDefinition, `${location}/missionDefinition`, errors)
      : CAMPAIGN_COMBAT_BRANCH_MISSION_TYPES.has(branch.missionType)
        ? validateCampaignCombatBranchMission(branch.missionDefinition, `${location}/missionDefinition`, enemyRoles, errors)
        : 0;
    if (!isPlainObject(branch.missionDefinition) || branch.missionDefinition.kind !== branch.missionType) {
      errors.push(`${location}/missionDefinition/kind must match missionType`);
    }
    if (isPlainObject(branch.missionDefinition) && branch.missionDefinition.id !== branch.missionDefinitionId) {
      errors.push(`${location}/missionDefinition/id must match missionDefinitionId`);
    }
    if (requireObject(branch.completionReward, `${location}/completionReward`, errors)) {
      allowedKeys(branch.completionReward, ['baseCoins', 'oneTimeBonusCoins', 'maximumPerformanceCoins', 'totalMinimumCoins', 'totalMaximumCoins'], `${location}/completionReward`, errors);
      ['baseCoins', 'oneTimeBonusCoins', 'maximumPerformanceCoins', 'totalMinimumCoins', 'totalMaximumCoins'].forEach((key) => {
        requireNumber(branch.completionReward[key], `${location}/completionReward/${key}`, errors, { minimum: 0, maximum: 1000000, integer: true });
      });
      const totalMinimumCoins = Number(branch.completionReward.baseCoins) + Number(branch.completionReward.oneTimeBonusCoins);
      const totalMaximumCoins = totalMinimumCoins + Number(branch.completionReward.maximumPerformanceCoins);
      if (branch.completionReward.maximumPerformanceCoins !== maximumPerformanceCoins) {
        errors.push(`${location}/completionReward/maximumPerformanceCoins must equal the authored target value`);
      }
      if (branch.completionReward.totalMinimumCoins !== totalMinimumCoins) {
        errors.push(`${location}/completionReward/totalMinimumCoins must equal base plus one-time bonus`);
      }
      if (branch.completionReward.totalMaximumCoins !== totalMaximumCoins) {
        errors.push(`${location}/completionReward/totalMaximumCoins must include all target coins`);
      }
      if (isPlainObject(branch.rewardPreview) && (
        branch.rewardPreview.minimumCoins !== branch.completionReward.totalMinimumCoins
        || branch.rewardPreview.maximumCoins !== branch.completionReward.totalMaximumCoins
      )) errors.push(`${location}/rewardPreview must match completionReward bounds`);
    }
    requireId(branch.returnNodeId, `${location}/returnNodeId`, errors);
    if (typeof branch.returnNodeId === 'string' && !missionIds.has(branch.returnNodeId) && !branchIds.has(branch.returnNodeId)) {
      errors.push(`${location}/returnNodeId references unknown map node: ${branch.returnNodeId}`);
    }
    if (branch.nextBranchNodeId !== undefined && branch.nextBranchNodeId !== null) {
      requireId(branch.nextBranchNodeId, `${location}/nextBranchNodeId`, errors);
      if (typeof branch.nextBranchNodeId === 'string' && !branchIds.has(branch.nextBranchNodeId)) {
        errors.push(`${location}/nextBranchNodeId references unknown Campaign branch: ${branch.nextBranchNodeId}`);
      }
      if (branch.nextBranchNodeId === branch.branchId) errors.push(`${location}/nextBranchNodeId cannot reference itself`);
    }
    requireEnum(branch.discoveryState, CAMPAIGN_BRANCH_DISCOVERY_STATES, `${location}/discoveryState`, errors);
  });

  const occupiedPositions = levelRows.flatMap((level) => (
    isPlainObject(level.campaignProgression) && isPlainObject(level.campaignProgression.mapPosition)
      ? [{ location: `/levels/${String(level.id)}/campaignProgression/mapPosition`, x: Number(level.campaignProgression.mapPosition.x), y: Number(level.campaignProgression.mapPosition.y) }]
      : []
  ));
  branchPositions.forEach((position, index) => {
    [...occupiedPositions, ...branchPositions.slice(0, index)].forEach((other) => {
      if (isFiniteNumber(other.x) && isFiniteNumber(other.y) && Math.hypot(position.x - other.x, position.y - other.y) < 0.04) {
        errors.push(`${position.location} is too close to ${other.location}`);
      }
    });
  });
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
  allowedKeys(enemy, ['enemyId', 'roleId', 'spriteKey', 'spriteStyle', 'weight', 'health', 'speed', 'damage', 'scoreValue', 'powerupDropChance', 'rank', 'sizeMultiplier', 'attackPatternId', 'attackIntervalSeconds', 'projectileSpeed', 'burstCount'], location, errors);
  requireEnum(enemy.enemyId, ENEMY_IDS, `${location}/enemyId`, errors);
  if (enemy.roleId !== undefined) requireId(enemy.roleId, `${location}/roleId`, errors);
  requireEnum(enemy.spriteKey, ENEMY_SPRITE_KEYS, `${location}/spriteKey`, errors);
  validateSpriteStyle(enemy.spriteStyle, `${location}/spriteStyle`, errors);
  requireNumber(enemy.weight, `${location}/weight`, errors, { minimum: 0, maximum: 1 });
  requireNumber(enemy.health, `${location}/health`, errors, { minimum: 0.01, maximum: 100000000 });
  requireNumber(enemy.speed, `${location}/speed`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(enemy.damage, `${location}/damage`, errors, { minimum: 0, maximum: 100000 });
  requireNumber(enemy.scoreValue, `${location}/scoreValue`, errors, { minimum: 0, maximum: 100000000 });
  requireNumber(enemy.powerupDropChance, `${location}/powerupDropChance`, errors, { minimum: 0, maximum: 1 });
  if (enemy.rank !== undefined) requireEnum(enemy.rank, ENEMY_RANKS, `${location}/rank`, errors);
  if (enemy.sizeMultiplier !== undefined) requireNumber(enemy.sizeMultiplier, `${location}/sizeMultiplier`, errors, { minimum: 0.5, maximum: 2.5 });
  if (enemy.attackPatternId !== undefined) requireEnum(enemy.attackPatternId, ENEMY_ATTACK_PATTERNS, `${location}/attackPatternId`, errors);
  if (enemy.attackIntervalSeconds !== undefined) requireNumber(enemy.attackIntervalSeconds, `${location}/attackIntervalSeconds`, errors, { minimum: 0.1, maximum: 30 });
  if (enemy.projectileSpeed !== undefined) requireNumber(enemy.projectileSpeed, `${location}/projectileSpeed`, errors, { minimum: 0.1, maximum: 30 });
  if (enemy.burstCount !== undefined) requireNumber(enemy.burstCount, `${location}/burstCount`, errors, { minimum: 1, maximum: 8, integer: true });
};

const validateFormationSlots = (slots, location, count, patternId, errors) => {
  if (slots === undefined) return;
  if (!Array.isArray(slots)) {
    errors.push(`${location} must be an array`);
    return;
  }
  if (slots.length < 2 || slots.length > 48) errors.push(`${location} must contain between 2 and 48 slots`);
  if (Number.isInteger(count) && count !== slots.length) errors.push(`${location} length must match the spawn count`);
  if (patternId === 'single-random' || patternId === 'asteroid-lanes') errors.push(`${location} requires a grouped formation choreography`);
  const positions = new Set();
  slots.forEach((slot, index) => {
    const slotLocation = `${location}/${index}`;
    if (!requireObject(slot, slotLocation, errors)) return;
    allowedKeys(slot, ['x', 'y'], slotLocation, errors);
    requireNumber(slot.x, `${slotLocation}/x`, errors, { minimum: 0.06, maximum: 0.94 });
    requireNumber(slot.y, `${slotLocation}/y`, errors, { minimum: 0.08, maximum: 0.46 });
    if (isFiniteNumber(slot.x) && isFiniteNumber(slot.y)) {
      const key = `${slot.x.toFixed(4)}:${slot.y.toFixed(4)}`;
      if (positions.has(key)) errors.push(`${slotLocation} duplicates another formation slot`);
      positions.add(key);
    }
  });
};

const validateFormationBehavior = (behavior, location, errors) => {
  if (behavior === undefined) return;
  if (!requireObject(behavior, location, errors)) return;
  allowedKeys(behavior, [
    'entryPathId', 'movementId', 'attackId', 'firingBehavior', 'returnId',
    'holdSeconds', 'telegraphSeconds', 'attackDurationSeconds', 'recoverySeconds',
    'attackGroupSize', 'attackCycles'
  ], location, errors);
  if (behavior.entryPathId !== undefined) requireEnum(behavior.entryPathId, FORMATION_ENTRY_PATHS, `${location}/entryPathId`, errors);
  if (behavior.movementId !== undefined) requireEnum(behavior.movementId, FORMATION_MOVEMENTS, `${location}/movementId`, errors);
  if (behavior.attackId !== undefined) requireEnum(behavior.attackId, FORMATION_ATTACK_BEHAVIORS, `${location}/attackId`, errors);
  if (behavior.firingBehavior !== undefined) requireEnum(behavior.firingBehavior, FORMATION_FIRING_BEHAVIORS, `${location}/firingBehavior`, errors);
  if (behavior.returnId !== undefined) requireEnum(behavior.returnId, FORMATION_RETURN_BEHAVIORS, `${location}/returnId`, errors);
  if (behavior.holdSeconds !== undefined) requireNumber(behavior.holdSeconds, `${location}/holdSeconds`, errors, { minimum: 0.35, maximum: 12 });
  if (behavior.telegraphSeconds !== undefined) requireNumber(behavior.telegraphSeconds, `${location}/telegraphSeconds`, errors, { minimum: 0.2, maximum: 4 });
  if (behavior.attackDurationSeconds !== undefined) requireNumber(behavior.attackDurationSeconds, `${location}/attackDurationSeconds`, errors, { minimum: 0.3, maximum: 8 });
  if (behavior.recoverySeconds !== undefined) requireNumber(behavior.recoverySeconds, `${location}/recoverySeconds`, errors, { minimum: 0.35, maximum: 12 });
  if (behavior.attackGroupSize !== undefined) requireNumber(behavior.attackGroupSize, `${location}/attackGroupSize`, errors, { minimum: 1, maximum: 48, integer: true });
  if (behavior.attackCycles !== undefined) requireNumber(behavior.attackCycles, `${location}/attackCycles`, errors, { minimum: 0, maximum: 100, integer: true });
};

const validateSpawnEvent = (event, location, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'count', 'patternId', 'positionId', 'spawnIntervalSeconds', 'formationSlots', 'formationBehavior', 'enemies'], location, errors);
  requireNumber(event.count, `${location}/count`, errors, { minimum: 1, maximum: 10000, integer: true });
  requireEnum(event.patternId, SPAWN_PATTERNS, `${location}/patternId`, errors);
  requireEnum(event.positionId, SPAWN_POSITIONS, `${location}/positionId`, errors);
  requireNumber(event.spawnIntervalSeconds, `${location}/spawnIntervalSeconds`, errors, { minimum: 0.01, maximum: 3600 });
  validateFormationSlots(event.formationSlots, `${location}/formationSlots`, event.count, event.patternId, errors);
  validateFormationBehavior(event.formationBehavior, `${location}/formationBehavior`, errors);
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

const validateBossTimeline = (
  timeline,
  location,
  phaseIds,
  errors,
  allowFrontierCrownclawSandboxPrimitives = false
) => {
  if (timeline === undefined) return;
  if (!requireObject(timeline, location, errors)) return;
  allowedKeys(timeline, ['durationSeconds', 'loop', 'clips', 'attacks'], location, errors);
  requireNumber(timeline.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 0.1, maximum: 180 });
  if (typeof timeline.loop !== 'boolean') errors.push(`${location}/loop must be a boolean`);
  if (!Array.isArray(timeline.clips)) {
    errors.push(`${location}/clips must be an array`);
    return;
  }
  if (timeline.clips.length > 128) errors.push(`${location}/clips must contain at most 128 items`);

  const clipIds = new Set();
  const clipsById = new Map();
  timeline.clips.forEach((clip, index) => {
    const clipLocation = `${location}/clips/${index}`;
    if (!requireObject(clip, clipLocation, errors)) return;
    allowedKeys(clip, [
      'id',
      'label',
      'track',
      'primitiveId',
      'trigger',
      'startSeconds',
      'durationSeconds',
      'phaseId',
      'telegraphClipId',
      'repeat',
      'parameters'
    ], clipLocation, errors);
    requireId(clip.id, `${clipLocation}/id`, errors);
    if (clipIds.has(clip.id)) errors.push(`${location}/clips contains duplicate id: ${String(clip.id)}`);
    if (typeof clip.id === 'string') {
      clipIds.add(clip.id);
      clipsById.set(clip.id, clip);
    }
    requireString(clip.label, `${clipLocation}/label`, errors, 100);

    const primitive = BOSS_TIMELINE_PRIMITIVES.get(clip.primitiveId);
    if (!primitive) {
      errors.push(`${clipLocation}/primitiveId has unsupported value: ${String(clip.primitiveId)}`);
    } else if (
      !allowFrontierCrownclawSandboxPrimitives
      && FRONTIER_CROWNCLAW_SANDBOX_PRIMITIVES.has(clip.primitiveId)
    ) {
      errors.push(
        `${clipLocation}/primitiveId is restricted to the Frontier Crownclaw Boss Sandbox prototype`
      );
    } else if (clip.track !== primitive.track) {
      errors.push(`${clipLocation}/track must be ${primitive.track} for ${clip.primitiveId}`);
    }
    requireEnum(clip.trigger, BOSS_TIMELINE_TRIGGERS, `${clipLocation}/trigger`, errors);
    requireNumber(clip.startSeconds, `${clipLocation}/startSeconds`, errors, { minimum: 0, maximum: 180 });
    requireNumber(clip.durationSeconds, `${clipLocation}/durationSeconds`, errors, { minimum: 0.01, maximum: 60 });
    if (
      isFiniteNumber(timeline.durationSeconds)
      && isFiniteNumber(clip.startSeconds)
      && clip.startSeconds > timeline.durationSeconds
    ) {
      errors.push(`${clipLocation}/startSeconds must be inside the timeline duration`);
    }
    if (clip.phaseId !== undefined && !phaseIds.has(clip.phaseId)) {
      errors.push(`${clipLocation}/phaseId references unknown boss phase: ${String(clip.phaseId)}`);
    }
    if (clip.telegraphClipId !== undefined) requireId(clip.telegraphClipId, `${clipLocation}/telegraphClipId`, errors);

    if (clip.repeat !== undefined) {
      const repeatLocation = `${clipLocation}/repeat`;
      if (requireObject(clip.repeat, repeatLocation, errors)) {
        allowedKeys(clip.repeat, ['count', 'intervalSeconds'], repeatLocation, errors);
        requireNumber(clip.repeat.count, `${repeatLocation}/count`, errors, { minimum: 1, maximum: 8, integer: true });
        requireNumber(clip.repeat.intervalSeconds, `${repeatLocation}/intervalSeconds`, errors, { minimum: 0.05, maximum: 30 });
        if (primitive && !primitive.supportsRepeat) {
          errors.push(`${repeatLocation} is not supported by ${clip.primitiveId}`);
        }
        if (clip.trigger !== 'time') {
          errors.push(`${repeatLocation} is supported only by time-based clips`);
        }
        if (
          clip.trigger === 'time'
          && isFiniteNumber(clip.startSeconds)
          && isFiniteNumber(clip.repeat.count)
          && isFiniteNumber(clip.repeat.intervalSeconds)
          && isFiniteNumber(timeline.durationSeconds)
        ) {
          const repeatCount = Math.max(1, Math.min(8, Math.floor(clip.repeat.count)));
          const finalExecutionSeconds = clip.startSeconds
            + ((repeatCount - 1) * clip.repeat.intervalSeconds);
          const finalExecutionFrame = toBossTimelineFrame(finalExecutionSeconds);
          const durationFrame = toBossTimelineFrame(timeline.durationSeconds);
          const outsideTimeline = timeline.loop === true
            ? finalExecutionFrame >= durationFrame
            : finalExecutionSeconds > timeline.durationSeconds + BOSS_TIMELINE_EPSILON;
          if (outsideTimeline) {
            errors.push(`${repeatLocation} must keep every execution inside the boss timeline`);
          }
        }
      }
    }
    if (
      clip.trigger === 'time'
      && timeline.loop === true
      && isFiniteNumber(clip.startSeconds)
      && isFiniteNumber(timeline.durationSeconds)
      && toBossTimelineFrame(clip.startSeconds) >= toBossTimelineFrame(timeline.durationSeconds)
    ) {
      errors.push(`${clipLocation}/startSeconds must execute before the loop endpoint`);
    }

    if (clip.parameters !== undefined) {
      const parameterLocation = `${clipLocation}/parameters`;
      if (requireObject(clip.parameters, parameterLocation, errors)) {
        const parameters = clip.parameters;
        allowedKeys(parameters, [
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
        ], parameterLocation, errors);
        if (primitive) {
          Object.keys(parameters).forEach((parameterKey) => {
            if (primitive.parameterKeys.includes(parameterKey)) return;
            errors.push(`${parameterLocation}/${parameterKey} is not supported by ${clip.primitiveId}`);
          });
        }
        if (parameters.sequence !== undefined) requireNumber(parameters.sequence, `${parameterLocation}/sequence`, errors, { minimum: 0, maximum: 100000, integer: true });
        if (parameters.projectileCount !== undefined) requireNumber(parameters.projectileCount, `${parameterLocation}/projectileCount`, errors, { minimum: 1, maximum: 24, integer: true });
        if (parameters.pulseIntervalSeconds !== undefined) requireNumber(parameters.pulseIntervalSeconds, `${parameterLocation}/pulseIntervalSeconds`, errors, { minimum: 0.5, maximum: 2 });
        if (parameters.shotIntervalFrames !== undefined) requireNumber(parameters.shotIntervalFrames, `${parameterLocation}/shotIntervalFrames`, errors, { minimum: 2, maximum: 12, integer: true });
        if (parameters.projectileSpeedScale !== undefined) requireNumber(parameters.projectileSpeedScale, `${parameterLocation}/projectileSpeedScale`, errors, { minimum: 0.5, maximum: 2 });
        if (parameters.channelWidthPixels !== undefined) requireNumber(parameters.channelWidthPixels, `${parameterLocation}/channelWidthPixels`, errors, { minimum: 72, maximum: 320 });
        if (parameters.sweepRangeRatio !== undefined) requireNumber(parameters.sweepRangeRatio, `${parameterLocation}/sweepRangeRatio`, errors, { minimum: 0.1, maximum: 0.8 });
        if (parameters.sweepPasses !== undefined) requireNumber(parameters.sweepPasses, `${parameterLocation}/sweepPasses`, errors, { minimum: 1, maximum: 3, integer: true });
        if (parameters.warningSeconds !== undefined) requireNumber(parameters.warningSeconds, `${parameterLocation}/warningSeconds`, errors, { minimum: 0.1, maximum: 10 });
        if (parameters.shieldCount !== undefined) requireNumber(parameters.shieldCount, `${parameterLocation}/shieldCount`, errors, { minimum: 0, maximum: 12, integer: true });
        if (parameters.summonCount !== undefined) requireNumber(parameters.summonCount, `${parameterLocation}/summonCount`, errors, { minimum: 1, maximum: 12, integer: true });
        if (parameters.enemyId !== undefined) requireEnum(parameters.enemyId, ENEMY_IDS, `${parameterLocation}/enemyId`, errors);
        if (parameters.formationPatternId !== undefined) requireEnum(parameters.formationPatternId, SPAWN_PATTERNS, `${parameterLocation}/formationPatternId`, errors);
        if (parameters.movementPatternId !== undefined) requireEnum(parameters.movementPatternId, MOVEMENT_PATTERNS, `${parameterLocation}/movementPatternId`, errors);
        if (parameters.movementPathId !== undefined) requireEnum(parameters.movementPathId, MOVEMENT_PATH_IDS, `${parameterLocation}/movementPathId`, errors);
        if (parameters.speedMultiplier !== undefined) requireNumber(parameters.speedMultiplier, `${parameterLocation}/speedMultiplier`, errors, { minimum: 0.1, maximum: 8 });
        if (parameters.componentId !== undefined) requireEnum(parameters.componentId, BOSS_TIMELINE_COMPONENT_IDS, `${parameterLocation}/componentId`, errors);
        if (parameters.enabled !== undefined && typeof parameters.enabled !== 'boolean') errors.push(`${parameterLocation}/enabled must be a boolean`);
        if (parameters.side !== undefined) requireEnum(parameters.side, BOSS_TIMELINE_SIDES, `${parameterLocation}/side`, errors);
        if (parameters.handedness !== undefined) requireEnum(parameters.handedness, BOSS_TIMELINE_HANDEDNESS, `${parameterLocation}/handedness`, errors);
        if (parameters.telegraphStyle !== undefined) requireEnum(parameters.telegraphStyle, BOSS_TIMELINE_TELEGRAPH_STYLES, `${parameterLocation}/telegraphStyle`, errors);
        if (parameters.motionCue !== undefined) requireEnum(parameters.motionCue, BOSS_TIMELINE_MOTION_CUES, `${parameterLocation}/motionCue`, errors);
        if (parameters.rotationDirection !== undefined) requireEnum(parameters.rotationDirection, BOSS_TIMELINE_ROTATION_DIRECTIONS, `${parameterLocation}/rotationDirection`, errors);
        if (parameters.color !== undefined && (typeof parameters.color !== 'string' || !HEX_COLOR_PATTERN.test(parameters.color))) {
          errors.push(`${parameterLocation}/color must be a six-digit hex color`);
        }
        if (parameters.strength !== undefined) requireNumber(parameters.strength, `${parameterLocation}/strength`, errors, { minimum: 0, maximum: 10 });
      }
    }
    if (clip.primitiveId === 'follow-path') {
      if (clip.trigger !== 'time') {
        errors.push(`${clipLocation}/trigger must use the deterministic phase clock for follow-path`);
      }
      if (!isPlainObject(clip.parameters) || clip.parameters.movementPathId === undefined) {
        errors.push(`${clipLocation}/parameters/movementPathId is required for follow-path`);
      }
      if (
        isFiniteNumber(timeline.durationSeconds)
        && isFiniteNumber(clip.startSeconds)
        && isFiniteNumber(clip.durationSeconds)
        && clip.startSeconds + clip.durationSeconds > timeline.durationSeconds + EPSILON
      ) {
        errors.push(`${clipLocation}/durationSeconds must finish before the timeline endpoint`);
      }
    }
    if (
      clip.primitiveId === 'corner-ambush-beam'
      && (
        !isFiniteNumber(clip.durationSeconds)
        || clip.durationSeconds < CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS
        || clip.durationSeconds > CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS
      )
    ) {
      errors.push(
        `${clipLocation}/durationSeconds must keep a corner ambush beam live for `
        + `${CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS}-${CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS} seconds`
      );
    }
    if (
      clip.primitiveId === 'corner-ambush-ram'
      && (
        !isFiniteNumber(clip.durationSeconds)
        || clip.durationSeconds < CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS
        || clip.durationSeconds > CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS
      )
    ) {
      errors.push(
        `${clipLocation}/durationSeconds must keep a corner ambush ram live for `
        + `${CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS}-${CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS} seconds`
      );
    }
    if (
      (
        clip.primitiveId === 'corner-ambush-beam'
        || clip.primitiveId === 'corner-ambush-ram'
      )
      && isFiniteNumber(timeline.durationSeconds)
      && isFiniteNumber(clip.startSeconds)
      && isFiniteNumber(clip.durationSeconds)
      && clip.startSeconds + clip.durationSeconds > timeline.durationSeconds + EPSILON
    ) {
      errors.push(`${clipLocation}/durationSeconds must finish a corner ambush action before the timeline endpoint`);
    }
  });

  timeline.clips.forEach((clip, index) => {
    const primitive = isPlainObject(clip)
      ? BOSS_TIMELINE_PRIMITIVES.get(clip.primitiveId)
      : undefined;
    if (!primitive?.damaging) return;
    const clipLocation = `${location}/clips/${index}`;
    if (clip.trigger !== 'time') {
      errors.push(`${clipLocation}/trigger must be time for a damaging action`);
    }
    const telegraph = clipsById.get(clip.telegraphClipId);
    if (!telegraph || telegraph.primitiveId !== 'telegraph') {
      errors.push(`${clipLocation}/telegraphClipId must reference a telegraph clip`);
      return;
    }
    if (telegraph.trigger !== 'time') {
      errors.push(`${clipLocation}/telegraphClipId must reference a time-based telegraph`);
    }
    if (typeof telegraph.phaseId === 'string' && telegraph.phaseId !== clip.phaseId) {
      errors.push(`${clipLocation}/telegraphClipId must reference a telegraph in the same boss phase`);
    }
    if (
      (
        clip.primitiveId === 'cross-beam'
        || clip.primitiveId === 'rail-sweep'
        || clip.primitiveId === 'weave-wall'
      )
      && (!isPlainObject(telegraph.parameters) || telegraph.parameters.telegraphStyle !== 'lane')
    ) {
      errors.push(
        `${clipLocation}/telegraphClipId must reference a lane telegraph for ${
          clip.primitiveId === 'weave-wall' ? 'the deterministic safe channel' : 'a laser primitive'
        }`
      );
    }
    if (
      clip.primitiveId === 'radial-beam-array'
      && (!isPlainObject(telegraph.parameters) || telegraph.parameters.telegraphStyle !== 'spokes')
    ) {
      errors.push(`${clipLocation}/telegraphClipId must reference a spoke telegraph on the damaging geometry`);
    }
    if (
      (
        clip.primitiveId === 'corner-ambush-beam'
        || clip.primitiveId === 'corner-ambush-ram'
      )
      && (!isPlainObject(telegraph.parameters) || telegraph.parameters.telegraphStyle !== 'target')
    ) {
      errors.push(`${clipLocation}/telegraphClipId must reference a target telegraph that locks the exact damaging geometry`);
    }
    if (
      (
        clip.primitiveId === 'corner-ambush-beam'
        || clip.primitiveId === 'corner-ambush-ram'
      )
      && isPlainObject(telegraph.repeat)
    ) {
      errors.push(`${clipLocation}/telegraphClipId cannot repeat a corner ambush beam warning inside one clip`);
    }
    if (
      (
        clip.primitiveId === 'corner-ambush-beam'
        || clip.primitiveId === 'corner-ambush-ram'
      )
      && timeline.clips.filter((candidate) => (
        isPlainObject(candidate) && candidate.telegraphClipId === clip.telegraphClipId
      )).length !== 1
    ) {
      errors.push(`${clipLocation}/telegraphClipId must be dedicated to one corner ambush beam`);
    }
    if (
      clip.trigger === 'time'
      && telegraph.trigger === 'time'
      && isFiniteNumber(clip.startSeconds)
      && isFiniteNumber(telegraph.startSeconds)
      && telegraph.startSeconds >= clip.startSeconds
    ) {
      errors.push(`${clipLocation}/telegraphClipId must begin before the damaging action`);
    } else if (
      clip.trigger === 'time'
      && telegraph.trigger === 'time'
      && isFiniteNumber(clip.startSeconds)
      && isFiniteNumber(telegraph.startSeconds)
    ) {
      const warningLeadSeconds = clip.startSeconds - telegraph.startSeconds;
      if (warningLeadSeconds < 0.1) {
        errors.push(`${clipLocation}/telegraphClipId must provide at least 0.1 seconds of warning lead`);
      }
      const declaredWarningSeconds = isPlainObject(telegraph.parameters)
        && isFiniteNumber(telegraph.parameters.warningSeconds)
        ? telegraph.parameters.warningSeconds
        : undefined;
      if (
        declaredWarningSeconds !== undefined
        && warningLeadSeconds + BOSS_TIMELINE_EPSILON < declaredWarningSeconds
      ) {
        errors.push(`${clipLocation}/telegraphClipId warning lead is shorter than its declared warningSeconds`);
      }
      if (
        (
          clip.primitiveId === 'corner-ambush-beam'
          || clip.primitiveId === 'corner-ambush-ram'
        )
        && (
          warningLeadSeconds < CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS
          || warningLeadSeconds > CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS
        )
      ) {
        errors.push(
          `${clipLocation}/telegraphClipId must provide `
          + `${CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS}-${CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS} seconds of warning`
        );
      }
      if (
        (
          clip.primitiveId === 'corner-ambush-beam'
          || clip.primitiveId === 'corner-ambush-ram'
        )
        && (
          declaredWarningSeconds === undefined
          || declaredWarningSeconds < CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS
          || declaredWarningSeconds > CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS
        )
      ) {
        errors.push(
          `${clipLocation}/telegraphClipId target telegraph must declare `
          + `${CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS}-${CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS} warningSeconds`
        );
      }
    }

    const attackRepeatCount = isPlainObject(clip.repeat)
      && isFiniteNumber(clip.repeat.count)
      ? Math.max(1, Math.min(8, Math.floor(clip.repeat.count)))
      : 1;
    if (attackRepeatCount > 1) {
      const telegraphRepeatCount = isPlainObject(telegraph.repeat)
        && isFiniteNumber(telegraph.repeat.count)
        ? Math.max(1, Math.min(8, Math.floor(telegraph.repeat.count)))
        : 1;
      const attackInterval = isPlainObject(clip.repeat)
        && isFiniteNumber(clip.repeat.intervalSeconds)
        ? clip.repeat.intervalSeconds
        : undefined;
      const telegraphInterval = isPlainObject(telegraph.repeat)
        && isFiniteNumber(telegraph.repeat.intervalSeconds)
        ? telegraph.repeat.intervalSeconds
        : undefined;
      if (telegraphRepeatCount < attackRepeatCount) {
        errors.push(`${clipLocation}/telegraphClipId must repeat before every damaging execution`);
      }
      if (
        attackInterval !== undefined
        && (
          telegraphInterval === undefined
          || Math.abs(attackInterval - telegraphInterval) > BOSS_TIMELINE_EPSILON
        )
      ) {
        errors.push(`${clipLocation}/telegraphClipId must use the same repeat interval as the damaging action`);
      }
    }
  });

  if (timeline.attacks !== undefined) {
    const attacksLocation = `${location}/attacks`;
    if (!Array.isArray(timeline.attacks) || timeline.attacks.length === 0) {
      errors.push(`${attacksLocation} must be a non-empty array`);
    } else {
      if (timeline.attacks.length !== 4) {
        errors.push(`${attacksLocation} must contain exactly three core attacks and one signature attack`);
      }
      const attackIds = new Set();
      const usedBeatReferences = new Set();
      const usedRecoveryReferences = new Set();
      let coreAttackCount = 0;
      let signatureAttackCount = 0;
      const windowsByPhase = new Map();
      timeline.attacks.forEach((attack, attackIndex) => {
        const attackLocation = `${attacksLocation}/${attackIndex}`;
        if (!requireObject(attack, attackLocation, errors)) return;
        allowedKeys(attack, BOSS_ATTACK_SENTENCE_KEYS, attackLocation, errors);
        requireId(attack.id, `${attackLocation}/id`, errors);
        if (attackIds.has(attack.id)) errors.push(`${attacksLocation} contains duplicate id: ${String(attack.id)}`);
        if (clipIds.has(attack.id)) errors.push(`${attackLocation}/id cannot collide with a timeline clip id`);
        if (typeof attack.id === 'string') attackIds.add(attack.id);
        requireString(attack.label, `${attackLocation}/label`, errors, 100);
        requireEnum(attack.role, BOSS_ATTACK_SENTENCE_ROLES, `${attackLocation}/role`, errors);
        if (attack.role === 'core') coreAttackCount += 1;
        if (attack.role === 'signature') signatureAttackCount += 1;
        requireEnum(attack.skillTest, BOSS_ATTACK_SKILL_TESTS, `${attackLocation}/skillTest`, errors);
        requireString(attack.recognitionCue, `${attackLocation}/recognitionCue`, errors, 160);
        requireString(attack.solution, `${attackLocation}/solution`, errors, 200);
        requireEnum(attack.safeRouteRule, BOSS_ATTACK_SAFE_ROUTE_RULES, `${attackLocation}/safeRouteRule`, errors);
        if (!Array.isArray(attack.sourceSocketRoles) || attack.sourceSocketRoles.length === 0) {
          errors.push(`${attackLocation}/sourceSocketRoles must be a non-empty array`);
        } else {
          if (attack.sourceSocketRoles.length > 3) {
            errors.push(`${attackLocation}/sourceSocketRoles must contain at most 3 items`);
          }
          const sourceRoles = new Set();
          attack.sourceSocketRoles.forEach((role, roleIndex) => {
            requireEnum(role, BOSS_ATTACK_SOCKET_ROLES, `${attackLocation}/sourceSocketRoles/${roleIndex}`, errors);
            if (sourceRoles.has(role)) {
              errors.push(`${attackLocation}/sourceSocketRoles contains duplicate value: ${String(role)}`);
            }
            sourceRoles.add(role);
          });
        }
        if (!Array.isArray(attack.variants) || attack.variants.length === 0) {
          errors.push(`${attackLocation}/variants must be a non-empty array`);
          return;
        }
        const variantPhases = new Set();
        attack.variants.forEach((variant, variantIndex) => {
          const variantLocation = `${attackLocation}/variants/${variantIndex}`;
          if (!requireObject(variant, variantLocation, errors)) return;
          allowedKeys(variant, BOSS_ATTACK_SENTENCE_VARIANT_KEYS, variantLocation, errors);
          requireId(variant.phaseId, `${variantLocation}/phaseId`, errors);
          const phaseId = typeof variant.phaseId === 'string' ? variant.phaseId : '';
          if (!phaseIds.has(phaseId)) {
            errors.push(`${variantLocation}/phaseId references unknown boss phase: ${String(variant.phaseId)}`);
          }
          if (variantPhases.has(phaseId)) {
            errors.push(`${variantLocation}/phaseId duplicates attack phase variant: ${phaseId}`);
          }
          variantPhases.add(phaseId);
          let firstWarningStart = Number.POSITIVE_INFINITY;
          let finalBeatEnd = Number.NEGATIVE_INFINITY;
          let previousBeatStart = Number.NEGATIVE_INFINITY;
          let expandedBeatCount = 0;
          if (!Array.isArray(variant.beatClipIds) || variant.beatClipIds.length === 0) {
            errors.push(`${variantLocation}/beatClipIds must be a non-empty array`);
          } else {
            if (variant.beatClipIds.length > 8) {
              errors.push(`${variantLocation}/beatClipIds must contain at most 8 items`);
            }
            const localBeatIds = new Set();
            variant.beatClipIds.forEach((clipId, beatIndex) => {
              const beatLocation = `${variantLocation}/beatClipIds/${beatIndex}`;
              requireId(clipId, beatLocation, errors);
              if (localBeatIds.has(clipId)) {
                errors.push(`${variantLocation}/beatClipIds contains duplicate value: ${String(clipId)}`);
              }
              localBeatIds.add(clipId);
              const beat = clipsById.get(clipId);
              if (!beat) {
                errors.push(`${beatLocation} references unknown timeline clip: ${String(clipId)}`);
                return;
              }
              const primitive = BOSS_TIMELINE_PRIMITIVES.get(beat.primitiveId);
              if (!primitive?.damaging || beat.trigger !== 'time') {
                errors.push(`${beatLocation} must reference a damaging time-based clip`);
              }
              if (beat.phaseId !== phaseId) {
                errors.push(`${beatLocation} must reference a clip in phase ${phaseId}`);
              }
              const startSeconds = isFiniteNumber(beat.startSeconds) ? beat.startSeconds : 0;
              if (startSeconds <= previousBeatStart) {
                errors.push(`${beatLocation} must be strictly chronological`);
              }
              previousBeatStart = startSeconds;
              const repeatCount = isPlainObject(beat.repeat) && isFiniteNumber(beat.repeat.count)
                ? Math.max(1, Math.min(8, Math.floor(beat.repeat.count)))
                : 1;
              const repeatInterval = isPlainObject(beat.repeat) && isFiniteNumber(beat.repeat.intervalSeconds)
                ? beat.repeat.intervalSeconds
                : 0;
              expandedBeatCount += repeatCount;
              finalBeatEnd = Math.max(
                finalBeatEnd,
                startSeconds + (repeatCount - 1) * repeatInterval
                  + (isFiniteNumber(beat.durationSeconds) ? beat.durationSeconds : 0)
              );
              const warning = typeof beat.telegraphClipId === 'string'
                ? clipsById.get(beat.telegraphClipId)
                : undefined;
              if (warning && isFiniteNumber(warning.startSeconds)) {
                firstWarningStart = Math.min(firstWarningStart, warning.startSeconds);
              }
              const ownershipKey = `${phaseId}:${String(clipId)}`;
              if (usedBeatReferences.has(ownershipKey)) {
                errors.push(`${beatLocation} is already owned by another attack variant in this phase`);
              }
              usedBeatReferences.add(ownershipKey);
            });
          }
          const requiredBeats = attack.role === 'signature' ? 4 : 2;
          if (expandedBeatCount < requiredBeats) {
            errors.push(`${variantLocation}/beatClipIds must expand to at least ${requiredBeats} connected beats`);
          }
          requireId(variant.recoveryClipId, `${variantLocation}/recoveryClipId`, errors);
          const recovery = clipsById.get(variant.recoveryClipId);
          if (!recovery) {
            errors.push(`${variantLocation}/recoveryClipId references unknown timeline clip: ${String(variant.recoveryClipId)}`);
            return;
          }
          if (recovery.primitiveId !== 'effect-cue' || recovery.trigger !== 'time') {
            errors.push(`${variantLocation}/recoveryClipId must reference a time-based effect-cue`);
          }
          if (recovery.phaseId !== phaseId) {
            errors.push(`${variantLocation}/recoveryClipId must reference a clip in phase ${phaseId}`);
          }
          const recoveryOwnershipKey = `${phaseId}:${String(variant.recoveryClipId)}`;
          if (usedRecoveryReferences.has(recoveryOwnershipKey)) {
            errors.push(`${variantLocation}/recoveryClipId is already owned by another attack variant in this phase`);
          }
          usedRecoveryReferences.add(recoveryOwnershipKey);
          const recoveryStart = isFiniteNumber(recovery.startSeconds) ? recovery.startSeconds : 0;
          if (Number.isFinite(finalBeatEnd) && recoveryStart + BOSS_TIMELINE_EPSILON < finalBeatEnd) {
            errors.push(`${variantLocation}/recoveryClipId must start after the final repeated beat`);
          }
          if (Number.isFinite(firstWarningStart)) {
            const phaseWindows = windowsByPhase.get(phaseId) ?? [];
            phaseWindows.push({
              startSeconds: firstWarningStart,
              endSeconds: recoveryStart + (isFiniteNumber(recovery.durationSeconds) ? recovery.durationSeconds : 0),
              location: variantLocation
            });
            windowsByPhase.set(phaseId, phaseWindows);
          }
        });
        if (
          variantPhases.size !== phaseIds.size
          || [...phaseIds].some((phaseId) => !variantPhases.has(phaseId))
        ) {
          errors.push(`${attackLocation}/variants must contain exactly one variant for every boss phase`);
        }
      });
      if (coreAttackCount !== 3 || signatureAttackCount !== 1) {
        errors.push(`${attacksLocation} must contain exactly three core attacks and one signature attack`);
      }
      timeline.clips.forEach((clip, clipIndex) => {
        if (!isPlainObject(clip) || clip.trigger !== 'time') return;
        const primitive = BOSS_TIMELINE_PRIMITIVES.get(clip.primitiveId);
        if (!primitive?.damaging) return;
        const phaseId = typeof clip.phaseId === 'string' ? clip.phaseId : '';
        if (typeof clip.id === 'string' && usedBeatReferences.has(`${phaseId}:${clip.id}`)) return;
        errors.push(`${location}/clips/${clipIndex}/id must belong to exactly one Boss Factory attack variant`);
      });
      windowsByPhase.forEach((windows) => {
        windows.sort((left, right) => left.startSeconds - right.startSeconds);
        for (let index = 1; index < windows.length; index += 1) {
          if (windows[index].startSeconds + BOSS_TIMELINE_EPSILON < windows[index - 1].endSeconds) {
            errors.push(`${windows[index].location} overlaps another attack sentence in the same phase`);
          }
        }
      });
    }
  }

  const phaseContexts = phaseIds.size > 0 ? [...phaseIds] : [undefined];
  const entityCost = (clip) => {
    const parameters = isPlainObject(clip.parameters) ? clip.parameters : {};
    if (clip.primitiveId === 'cross-beam') return 2;
    if (clip.primitiveId === 'rail-sweep') return 1;
    if (clip.primitiveId === 'radial-beam-array') return 4;
    if (clip.primitiveId === 'corner-ambush-beam') return 1;
    if (clip.primitiveId === 'corner-ambush-ram') return 1;
    if (clip.primitiveId === 'rotor-hazard-sentence') {
      const pulseIntervalSeconds = isFiniteNumber(parameters.pulseIntervalSeconds)
        ? parameters.pulseIntervalSeconds
        : 1;
      const pulses = Math.max(
        1,
        Math.ceil((Number(clip.durationSeconds) || 1) / pulseIntervalSeconds)
      );
      const pelletCount = isFiniteNumber(parameters.projectileCount)
        ? parameters.projectileCount
        : 6;
      return pulses * pelletCount + Math.floor(pulses / 2) * 2;
    }
    if (clip.primitiveId === 'summon-formation') {
      return isFiniteNumber(parameters.summonCount) ? parameters.summonCount : 4;
    }
    const defaults = {
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
    return isFiniteNumber(parameters.projectileCount)
      ? parameters.projectileCount
      : (defaults[clip.primitiveId] ?? 0);
  };
  phaseContexts.forEach((phaseId) => {
    const frameBudgets = new Map();
    const frameCueCounts = new Map();
    let loopBudget = 0;
    timeline.clips.forEach((clip) => {
      const primitive = isPlainObject(clip)
        ? BOSS_TIMELINE_PRIMITIVES.get(clip.primitiveId)
        : undefined;
      if (
        !primitive
        || clip.trigger !== 'time'
        || (clip.phaseId !== undefined && clip.phaseId !== phaseId)
      ) return;
      const repeatCount = isPlainObject(clip.repeat) && isFiniteNumber(clip.repeat.count)
        ? Math.max(1, Math.min(8, Math.floor(clip.repeat.count)))
        : 1;
      const intervalSeconds = isPlainObject(clip.repeat) && isFiniteNumber(clip.repeat.intervalSeconds)
        ? clip.repeat.intervalSeconds
        : 0;
      const startSeconds = isFiniteNumber(clip.startSeconds) ? clip.startSeconds : 0;
      const cost = primitive.damaging ? Math.max(0, entityCost(clip)) : 0;
      if (primitive.damaging) loopBudget += cost * repeatCount;
      for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
        const executionFrame = toBossTimelineFrame(
          startSeconds + repeatIndex * intervalSeconds
        );
        frameCueCounts.set(
          executionFrame,
          (frameCueCounts.get(executionFrame) ?? 0) + 1
        );
        if (primitive.damaging) {
          frameBudgets.set(
            executionFrame,
            (frameBudgets.get(executionFrame) ?? 0) + cost
          );
        }
      }
    });
    const phaseLabel = phaseId ?? 'all phases';
    if (loopBudget > 512) {
      errors.push(`${location}/clips exceeds the 512-entity loop budget in ${phaseLabel}`);
    }
    for (const [executionFrame, cueCount] of frameCueCounts) {
      if (cueCount > BOSS_TIMELINE_MAX_CUES_PER_FRAME) {
        errors.push(`${location}/clips schedules ${cueCount} cues on simulation frame ${executionFrame} in ${phaseLabel}; the limit is ${BOSS_TIMELINE_MAX_CUES_PER_FRAME}`);
      }
    }
    for (const [executionFrame, budget] of frameBudgets) {
      if (budget > 64) {
        errors.push(`${location}/clips requests ${budget} damaging entities on simulation frame ${executionFrame} in ${phaseLabel}; the limit is 64`);
      }
    }
    for (const trigger of ['phase-enter', 'death']) {
      const cueCount = timeline.clips.filter((clip) => (
        isPlainObject(clip)
        && clip.trigger === trigger
        && (clip.phaseId === undefined || clip.phaseId === phaseId)
      )).length;
      if (cueCount > BOSS_TIMELINE_MAX_CUES_PER_FRAME) {
        errors.push(`${location}/clips schedules ${cueCount} ${trigger} cues in ${phaseLabel}; the limit is ${BOSS_TIMELINE_MAX_CUES_PER_FRAME}`);
      }
    }
  });
};

const validateBossEvent = (event, location, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'bossId', 'rigId', 'componentMode', 'componentHealth', 'count', 'spriteKey', 'spriteStyle', 'positionId', 'movementPatternId', 'warningSeconds', 'health', 'speed', 'damage', 'scoreReward', 'powerupDropChance', 'shieldCount', 'sizeMultiplier', 'weapons', 'phases', 'revival', 'timeline'], location, errors);
  requireEnum(event.bossId, BOSS_IDS, `${location}/bossId`, errors);
  if (event.rigId !== undefined) {
    requireEnum(event.rigId, BOSS_RIG_IDS, `${location}/rigId`, errors);
    if (!MAJOR_BOSS_IDS.has(event.bossId)) errors.push(`${location}/rigId supports canonical major-boss encounters only`);
  }
  if (event.componentMode !== undefined) {
    requireEnum(event.componentMode, BOSS_COMPONENT_MODES, `${location}/componentMode`, errors);
  }
  if (event.componentHealth !== undefined) {
    const componentLocation = `${location}/componentHealth`;
    if (requireObject(event.componentHealth, componentLocation, errors)) {
      allowedKeys(
        event.componentHealth,
        [...BOSS_COMPONENT_IDS],
        componentLocation,
        errors
      );
      if (Object.keys(event.componentHealth).length === 0) {
        errors.push(`${componentLocation} must configure at least one component`);
      }
      for (const componentId of BOSS_COMPONENT_IDS) {
        if (event.componentHealth[componentId] !== undefined) {
          requireNumber(
            event.componentHealth[componentId],
            `${componentLocation}/${componentId}`,
            errors,
            { minimum: Number.EPSILON, maximum: 10000000 }
          );
        }
      }
    }
    if (event.componentMode === 'hull-only') {
      errors.push(`${componentLocation} is not supported when componentMode is hull-only`);
    }
  }
  if (event.count !== undefined) {
    requireNumber(event.count, `${location}/count`, errors, { minimum: 1, maximum: 4, integer: true });
    if (!['bottleneck-drone', 'paywall-wall'].includes(event.bossId) && event.count > 1) {
      errors.push(`${location}/count supports groups only for bottleneck-drone or paywall-wall`);
    }
  }
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
  if (event.sizeMultiplier !== undefined) requireNumber(event.sizeMultiplier, `${location}/sizeMultiplier`, errors, { minimum: 0.5, maximum: 2.5 });

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
  if (event.revival !== undefined) {
    const revivalLocation = `${location}/revival`;
    if (requireObject(event.revival, revivalLocation, errors)) {
      allowedKeys(event.revival, ['phaseId', 'shutdownSeconds', 'rebootSeconds', 'restoreHealthRatio', 'awakenedSizeMultiplier'], revivalLocation, errors);
      requireId(event.revival.phaseId, `${revivalLocation}/phaseId`, errors);
      requireNumber(event.revival.shutdownSeconds, `${revivalLocation}/shutdownSeconds`, errors, { minimum: 0.1, maximum: 10 });
      requireNumber(event.revival.rebootSeconds, `${revivalLocation}/rebootSeconds`, errors, { minimum: 0.1, maximum: 10 });
      requireNumber(event.revival.restoreHealthRatio, `${revivalLocation}/restoreHealthRatio`, errors, { minimum: Number.EPSILON, maximum: 1 });
      requireNumber(event.revival.awakenedSizeMultiplier, `${revivalLocation}/awakenedSizeMultiplier`, errors, { minimum: 1, maximum: 1.5 });
      const phaseIds = new Set(event.phases.map((phase) => phase?.id).filter((id) => typeof id === 'string'));
      if (typeof event.revival.phaseId === 'string' && !phaseIds.has(event.revival.phaseId)) {
        errors.push(`${revivalLocation}/phaseId references unknown boss phase: ${event.revival.phaseId}`);
      }
      if (event.revival.phaseId === event.phases[0]?.id) {
        errors.push(`${revivalLocation}/phaseId must reference a phase after the opening phase`);
      }
    }
  }
  validateBossTimeline(
    event.timeline,
    `${location}/timeline`,
    new Set(event.phases.map((phase) => phase?.id).filter((id) => typeof id === 'string')),
    errors,
    event.bossId === FRONTIER_CROWNCLAW_BOSS_ID
  );
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
  requireNumber(event.damage, `${location}/damage`, errors, { minimum: Number.EPSILON, maximum: 100000 });
  requireNumber(event.scoreValue, `${location}/scoreValue`, errors, { minimum: 0, maximum: 100000000 });
  requireNumber(event.powerupDropChance, `${location}/powerupDropChance`, errors, { minimum: 0, maximum: 1 });
};

const validateSupplyDropEvent = (event, location, errors) => {
  allowedKeys(event, ['id', 'label', 'kind', 'startSeconds', 'durationSeconds', 'delayAfterSeconds', 'blocksWaveClock', 'spawnAnchor', 'spriteKey', 'spriteStyle', 'presentKind', 'positionId', 'health', 'speed', 'scoreValue', 'coinDropValue'], location, errors);
  requireEnum(event.spriteKey, SUPPLY_DROP_SPRITE_KEYS, `${location}/spriteKey`, errors);
  validateSpriteStyle(event.spriteStyle, `${location}/spriteStyle`, errors);
  requireEnum(event.presentKind, PRESENT_DROP_PRESENT_KINDS, `${location}/presentKind`, errors);
  if (event.positionId !== 'formation-top') errors.push(`${location}/positionId must be formation-top`);
  requireNumber(event.health, `${location}/health`, errors, { minimum: Number.EPSILON, maximum: 100000000 });
  requireNumber(event.speed, `${location}/speed`, errors, { minimum: Number.EPSILON, maximum: 100000 });
  requireNumber(event.scoreValue, `${location}/scoreValue`, errors, { minimum: 0, maximum: 100000000 });
  requireNumber(event.coinDropValue, `${location}/coinDropValue`, errors, { minimum: 1, maximum: 1000000, integer: true });
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
  else if (event.kind === 'supply-drop') validateSupplyDropEvent(event, location, errors);
  else if (event.kind === 'powerup') validatePowerupEvent(event, location, availablePowerups, errors);
  else if (event.kind === 'recovery') validateRecoveryEvent(event, location, availablePowerups, errors);
};

const validateWave = (wave, location, availablePowerups, errors) => {
  if (!requireObject(wave, location, errors)) return;
  allowedKeys(wave, ['id', 'name', 'order', 'accent', 'backgroundId', 'completionRule', 'difficultyMultiplier', 'durationSeconds', 'introSeconds', 'delayAfterSeconds', 'scoreMultiplier', 'threatCap', 'combatBudget', 'rhythm', 'formationPackIds', 'events'], location, errors);
  requireId(wave.id, `${location}/id`, errors);
  requireString(wave.name, `${location}/name`, errors, 120);
  requireNumber(wave.order, `${location}/order`, errors, { minimum: 1, maximum: 10000, integer: true });
  if (typeof wave.accent !== 'string' || !HEX_COLOR_PATTERN.test(wave.accent)) errors.push(`${location}/accent must be a six-digit hex color`);
  requireEnum(wave.backgroundId, BACKGROUND_IDS, `${location}/backgroundId`, errors);
  requireEnum(wave.completionRule, WAVE_COMPLETION_RULES, `${location}/completionRule`, errors);
  requireNumber(wave.difficultyMultiplier, `${location}/difficultyMultiplier`, errors, { minimum: 0.01, maximum: 1000 });
  requireNumber(wave.durationSeconds, `${location}/durationSeconds`, errors, { minimum: 0.01, maximum: 86400 });
  requireNumber(wave.introSeconds, `${location}/introSeconds`, errors, { minimum: 0, maximum: 3600 });
  requireNumber(wave.delayAfterSeconds, `${location}/delayAfterSeconds`, errors, { minimum: 0, maximum: 3600 });
  requireNumber(wave.scoreMultiplier, `${location}/scoreMultiplier`, errors, { minimum: 0, maximum: 1000000 });
  requireNumber(wave.threatCap, `${location}/threatCap`, errors, { minimum: 1, maximum: 10000, integer: true });
  requireNumber(wave.combatBudget, `${location}/combatBudget`, errors, { minimum: Number.EPSILON, maximum: 1000000 });
  requireEnum(wave.rhythm, CAMPAIGN_WAVE_RHYTHMS, `${location}/rhythm`, errors);
  if (!Array.isArray(wave.formationPackIds)) errors.push(`${location}/formationPackIds must be an array`);
  else {
    const packIds = new Set();
    wave.formationPackIds.forEach((id, index) => {
      requireId(id, `${location}/formationPackIds/${index}`, errors);
      if (packIds.has(id)) errors.push(`${location}/formationPackIds contains duplicate value: ${String(id)}`);
      packIds.add(id);
    });
  }
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
  const mainBossCount = wave.events.filter((event) => event?.kind === 'boss' && MAJOR_BOSS_IDS.has(event?.bossId)).length;
  if (wave.completionRule === 'boss-defeat' && mainBossCount === 0) {
    errors.push(`${location}/completionRule boss-defeat requires a canonical major-boss event`);
  }
  if (wave.completionRule === 'clear-after-duration' && mainBossCount > 0) {
    errors.push(`${location}/completionRule clear-after-duration cannot contain a canonical major-boss event`);
  }
};

const validateLevel = (level, location, errors) => {
  if (!requireObject(level, location, errors)) return;
  allowedKeys(level, ['id', 'name', 'description', 'order', 'backgroundId', 'musicId', 'startingDifficulty', 'scoreTarget', 'durationSeconds', 'loopWaves', 'availablePowerupIds', 'scorecard', 'campaignProgression', 'waves'], location, errors);
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
  validateCampaignProgression(level.campaignProgression, `${location}/campaignProgression`, level.id, errors);
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

const validateCampaignManifestCrossReferences = (campaign, errors) => {
  const levels = Array.isArray(campaign.levels) ? campaign.levels.filter(isPlainObject) : [];
  const sectors = Array.isArray(campaign.sectors) ? campaign.sectors.filter(isPlainObject) : [];
  const themes = Array.isArray(campaign.visualThemes) ? campaign.visualThemes.filter(isPlainObject) : [];
  const roles = Array.isArray(campaign.enemyRoles) ? campaign.enemyRoles.filter(isPlainObject) : [];
  const packs = Array.isArray(campaign.formationPacks) ? campaign.formationPacks.filter(isPlainObject) : [];
  const miniBosses = Array.isArray(campaign.miniBosses) ? campaign.miniBosses.filter(isPlainObject) : [];
  const branches = Array.isArray(campaign.campaignBranches) ? campaign.campaignBranches.filter(isPlainObject) : [];
  const graphNodes = isPlainObject(campaign.campaignGraph) && Array.isArray(campaign.campaignGraph.nodes)
    ? campaign.campaignGraph.nodes.filter(isPlainObject)
    : [];
  const usesCampaignGraph = graphNodes.length > 0;
  const levelsById = new Map(levels.flatMap((level) => typeof level.id === 'string' ? [[level.id, level]] : []));
  const sectorsById = new Map(sectors.flatMap((sector) => typeof sector.id === 'string' ? [[sector.id, sector]] : []));
  const themeIds = new Set(themes.flatMap((theme) => typeof theme.id === 'string' ? [theme.id] : []));
  const rolesById = new Map(roles.flatMap((role) => typeof role.id === 'string' ? [[role.id, role]] : []));
  const packsById = new Map(packs.flatMap((pack) => typeof pack.id === 'string' ? [[pack.id, pack]] : []));
  const branchIds = new Set(branches.flatMap((branch) => typeof branch.branchId === 'string' ? [branch.branchId] : []));
  const missionOwners = new Map();
  const graphMissionOwners = new Map();
  graphNodes.forEach((node) => {
    if (typeof node.missionDefinitionId !== 'string' || typeof node.sectorId !== 'string') return;
    graphMissionOwners.set(
      node.missionDefinitionId,
      [...(graphMissionOwners.get(node.missionDefinitionId) ?? []), node.sectorId]
    );
  });
  const isGroupedFormationPattern = (patternId) => {
    const normalized = typeof patternId === 'string' ? patternId.trim().toLowerCase() : '';
    return normalized.length > 0
      && !normalized.includes('single')
      && !normalized.includes('random');
  };
  const resolveDeclaredFormationPack = (event, declaredPacks) => {
    if (!isGroupedFormationPattern(event.patternId) || !Array.isArray(event.enemies)) return undefined;
    const roleIds = [...new Set(event.enemies.flatMap((enemy) => (
      isPlainObject(enemy) && typeof enemy.roleId === 'string' ? [enemy.roleId] : []
    )))];
    if (roleIds.length === 0) return undefined;
    const compatible = declaredPacks.filter((pack) => (
      Array.isArray(pack.enemyRoleIds)
      && roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId))
    ));
    if (compatible.length === 1) return compatible[0];
    const shapeMatches = compatible.filter((pack) => pack.formationShape === event.patternId);
    return shapeMatches.length === 1 ? shapeMatches[0] : undefined;
  };

  sectors.forEach((sector, sectorIndex) => {
    const sectorLocation = `/sectors/${sectorIndex}`;
    if (typeof sector.themeId === 'string' && !themeIds.has(sector.themeId)) errors.push(`${sectorLocation}/themeId references unknown visual theme: ${sector.themeId}`);
    if (Array.isArray(sector.branchIds)) sector.branchIds.forEach((branchId, branchIndex) => {
      if (typeof branchId === 'string' && !branchIds.has(branchId)) errors.push(`${sectorLocation}/branchIds/${branchIndex} references unknown Campaign branch: ${branchId}`);
    });
    if (!Array.isArray(sector.missionIds) || sector.missionIds.length !== 5) return;
    sector.missionIds.forEach((missionId, missionIndex) => {
      if (typeof missionId !== 'string') return;
      const level = levelsById.get(missionId);
      if (!level) {
        errors.push(`${sectorLocation}/missionIds/${missionIndex} references unknown Mission: ${missionId}`);
        return;
      }
      missionOwners.set(missionId, [...(missionOwners.get(missionId) ?? []), sector.id]);
      const levelIndex = levels.indexOf(level);
      const progression = isPlainObject(level.campaignProgression) ? level.campaignProgression : undefined;
      if (!progression) {
        errors.push(`/levels/${levelIndex}/campaignProgression is required for sector Missions`);
        return;
      }
      if (progression.sectorId !== sector.id) errors.push(`/levels/${levelIndex}/campaignProgression/sectorId must reference owning sector ${String(sector.id)}`);
      const expectedRole = CAMPAIGN_MISSION_ROLE_ORDER[missionIndex];
      if (progression.missionRole !== expectedRole) errors.push(`/levels/${levelIndex}/campaignProgression/missionRole must be ${expectedRole} for sector position ${missionIndex + 1}`);
      const waveCount = Array.isArray(level.waves) ? level.waves.length : 0;
      const range = {
        // Mirrors game-config/validate.ts: combat Missions may run up to seven
        // waves (introduction 6, formation-remix 7); boss-ended Missions stay
        // at four so their climax remains the fourth beat.
        introduction: [4, 7],
        'formation-remix': [4, 8],
        'elite-checkpoint': [4, 7],
        'boss-preparation': [4, 7],
        'major-boss': usesCampaignGraph ? [2, 2] : [1, 1]
      }[expectedRole];
      if (waveCount < range[0] || waveCount > range[1]) errors.push(`/levels/${levelIndex}/waves must contain ${range[0] === range[1] ? range[0] : `${range[0]}-${range[1]}`} waves for ${expectedRole}`);
      if (expectedRole === 'major-boss' && Array.isArray(level.waves) && level.waves.length > 0) {
        if (!usesCampaignGraph && isPlainObject(level.waves[0])) {
          const bossEvents = Array.isArray(level.waves[0].events)
            ? level.waves[0].events.filter((event) => isPlainObject(event) && event.kind === 'boss')
            : [];
          if (level.waves[0].completionRule !== 'boss-defeat' || bossEvents.length !== 1 || bossEvents[0]?.bossId !== sector.majorBossId) {
            errors.push(`/levels/${levelIndex}/waves/0 must be one direct encounter with sector major boss ${String(sector.majorBossId)}`);
          }
        } else if (usesCampaignGraph) {
          const finalWaveIndex = level.waves.length - 1;
          level.waves.forEach((wave, waveIndex) => {
            if (!isPlainObject(wave)) return;
            const majorBossEvents = Array.isArray(wave.events)
              ? wave.events.filter((event) => isPlainObject(event) && event.kind === 'boss' && MAJOR_BOSS_IDS.has(event.bossId))
              : [];
            if (waveIndex < finalWaveIndex) {
              if (wave.completionRule === 'boss-defeat' || majorBossEvents.length > 0) {
                errors.push(`/levels/${levelIndex}/waves/${waveIndex} must be a non-major-boss lead-in or recovery Wave`);
              }
            } else if (wave.completionRule !== 'boss-defeat' || majorBossEvents.length !== 1 || majorBossEvents[0]?.bossId !== sector.majorBossId) {
              errors.push(`/levels/${levelIndex}/waves/${waveIndex} must be the only matching sector major boss encounter: ${String(sector.majorBossId)}`);
            }
          });
        }
      }
    });
  });

  levels.forEach((level, levelIndex) => {
    const owningSectors = usesCampaignGraph ? graphMissionOwners.get(level.id) : missionOwners.get(level.id);
    if (typeof level.id === 'string' && (owningSectors ?? []).length !== 1) {
      errors.push(`/levels/${levelIndex}/campaignProgression/sectorId must place the Mission in exactly one sector`);
    }
    const progression = isPlainObject(level.campaignProgression) ? level.campaignProgression : undefined;
    if (progression && typeof progression.sectorId === 'string' && !sectorsById.has(progression.sectorId)) errors.push(`/levels/${levelIndex}/campaignProgression/sectorId references unknown sector: ${progression.sectorId}`);
    if (!Array.isArray(level.waves)) return;
    const previousWaveOrderByRole = new Map();
    level.waves.forEach((wave, waveIndex) => {
      if (!isPlainObject(wave)) return;
      if (isFiniteNumber(progression?.combatBudget) && isFiniteNumber(wave.combatBudget) && wave.combatBudget > progression.combatBudget) errors.push(`/levels/${levelIndex}/waves/${waveIndex}/combatBudget exceeds owning Mission budget`);
      const compatibilityRole = usesCampaignGraph
        && progression?.missionRole === 'major-boss'
        && waveIndex < level.waves.length - 1
        ? 'boss-preparation'
        : progression?.missionRole;
      let packBudget = 0;
      if (Array.isArray(wave.formationPackIds)) wave.formationPackIds.forEach((packId, packIndex) => {
        if (typeof packId !== 'string') return;
        const pack = packsById.get(packId);
        if (!pack) {
          errors.push(`/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex} references unknown formation pack: ${packId}`);
          return;
        }
        if (isFiniteNumber(pack.totalThreatCost)) packBudget += pack.totalThreatCost;
        if (typeof progression?.sectorId === 'string' && Array.isArray(pack.compatibleSectorIds) && !pack.compatibleSectorIds.includes(progression.sectorId)) errors.push(`/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex} is incompatible with sector ${progression.sectorId}`);
        if (typeof compatibilityRole === 'string' && Array.isArray(pack.compatibleMissionRoles) && !pack.compatibleMissionRoles.includes(compatibilityRole)) errors.push(`/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex} is incompatible with Mission role ${compatibilityRole}`);
      });
      if (isFiniteNumber(wave.combatBudget) && packBudget > wave.combatBudget + EPSILON) errors.push(`/levels/${levelIndex}/waves/${waveIndex}/formationPackIds exceed wave combat budget`);
      if (!Array.isArray(wave.events)) return;
      const declaredPacks = Array.isArray(wave.formationPackIds)
        ? wave.formationPackIds.flatMap((packId) => (
            typeof packId === 'string' && packsById.has(packId) ? [packsById.get(packId)] : []
          ))
        : [];
      const usedPackIds = new Set();
      const waveRoleIds = new Set();
      wave.events.forEach((event, eventIndex) => {
        if (!isPlainObject(event) || event.kind !== 'spawn' || !Array.isArray(event.enemies)) return;
        if (isGroupedFormationPattern(event.patternId)) {
          const resolvedPack = resolveDeclaredFormationPack(event, declaredPacks);
          if (!resolvedPack || typeof resolvedPack.id !== 'string') {
            errors.push(`/levels/${levelIndex}/waves/${waveIndex}/events/${eventIndex} grouped Campaign spawn must resolve to exactly one declared role-compatible formation pack`);
          } else {
            usedPackIds.add(resolvedPack.id);
          }
        }
        event.enemies.forEach((enemy, enemyIndex) => {
          if (!isPlainObject(enemy) || enemy.roleId === undefined) return;
          const role = typeof enemy.roleId === 'string' ? rolesById.get(enemy.roleId) : undefined;
          const roleLocation = `/levels/${levelIndex}/waves/${waveIndex}/events/${eventIndex}/enemies/${enemyIndex}/roleId`;
          if (typeof enemy.roleId === 'string') waveRoleIds.add(enemy.roleId);
          if (!role) errors.push(`${roleLocation} references unknown enemy role: ${String(enemy.roleId)}`);
          else {
            if (role.enemyId !== enemy.enemyId) errors.push(`${roleLocation} belongs to ${String(role.enemyId)}, not ${String(enemy.enemyId)}`);
            if (usesCampaignGraph) {
              const sector = sectorsById.get(progression?.sectorId);
              const sectorOrder = sector?.order;
              const missionSlot = Array.isArray(sector?.missionIds) && sector.missionIds.includes(level.id)
                ? sector.missionIds.indexOf(level.id) + 1
                : CAMPAIGN_MISSION_ROLE_ORDER.indexOf(progression?.missionRole) + 1;
              if (isFiniteNumber(sectorOrder) && isFiniteNumber(role.introductionSector) && (
                sectorOrder < role.introductionSector
                || (sectorOrder === role.introductionSector && missionSlot > 0 && missionSlot < role.introductionMission)
              )) {
                errors.push(`${roleLocation} uses ${String(role.id)} before its Sector ${String(role.introductionSector)} Mission ${String(role.introductionMission)} introduction`);
              }
            }
          }
        });
      });
      if (Array.isArray(wave.formationPackIds)) wave.formationPackIds.forEach((packId, packIndex) => {
        if (typeof packId === 'string' && packsById.has(packId) && !usedPackIds.has(packId)) {
          errors.push(`/levels/${levelIndex}/waves/${waveIndex}/formationPackIds/${packIndex} formation pack ${packId} is not used by any grouped spawn event in this Wave`);
        }
      });
      waveRoleIds.forEach((roleId) => {
        const role = rolesById.get(roleId);
        const currentOrder = typeof wave.order === 'number' ? wave.order : waveIndex + 1;
        const previousOrder = previousWaveOrderByRole.get(roleId);
        if (role && previousOrder !== undefined && typeof role.reuseCooldownWaves === 'number') {
          const interveningWaves = Math.max(0, currentOrder - previousOrder - 1);
          if (interveningWaves < role.reuseCooldownWaves) {
            errors.push(`/levels/${levelIndex}/waves/${waveIndex}/events enemy role ${roleId} requires ${role.reuseCooldownWaves} intervening Wave(s); found ${interveningWaves}`);
          }
        }
        previousWaveOrderByRole.set(roleId, currentOrder);
      });
    });
  });

  roles.forEach((role, roleIndex) => {
    if (Array.isArray(role.compatibleFormationPackIds)) role.compatibleFormationPackIds.forEach((packId, packIndex) => {
      if (typeof packId === 'string' && !packsById.has(packId)) errors.push(`/enemyRoles/${roleIndex}/compatibleFormationPackIds/${packIndex} references unknown formation pack: ${packId}`);
    });
    if (isFiniteNumber(role.introductionSector) && !sectors.some((sector) => sector.order === role.introductionSector)) errors.push(`/enemyRoles/${roleIndex}/introductionSector references missing sector order ${role.introductionSector}`);
  });
  packs.forEach((pack, packIndex) => {
    if (Array.isArray(pack.enemyRoleIds)) pack.enemyRoleIds.forEach((roleId, roleIndex) => {
      if (typeof roleId === 'string' && !rolesById.has(roleId)) errors.push(`/formationPacks/${packIndex}/enemyRoleIds/${roleIndex} references unknown enemy role: ${roleId}`);
    });
    if (Array.isArray(pack.compatibleSectorIds)) pack.compatibleSectorIds.forEach((sectorId, sectorIndex) => {
      if (typeof sectorId === 'string' && !sectorsById.has(sectorId)) errors.push(`/formationPacks/${packIndex}/compatibleSectorIds/${sectorIndex} references unknown sector: ${sectorId}`);
    });
  });
  miniBosses.forEach((miniBoss, miniBossIndex) => {
    if (Array.isArray(miniBoss.suitableSectorIds)) miniBoss.suitableSectorIds.forEach((sectorId, sectorIndex) => {
      if (typeof sectorId === 'string' && !sectorsById.has(sectorId)) errors.push(`/miniBosses/${miniBossIndex}/suitableSectorIds/${sectorIndex} references unknown sector: ${sectorId}`);
    });
  });
};

export const validateGameCampaign = (campaign) => {
  refreshGeneratedAssetCatalog();
  const errors = [];
  if (!requireObject(campaign, '/', errors)) return { valid: false, errors };
  allowedKeys(campaign, [
    'schemaVersion', 'revision', 'id', 'name', 'updatedAt', 'fps', 'recordCard', 'hudAssets', 'levels',
    'sectors', 'visualThemes', 'enemyRoles', 'formationPacks', 'miniBosses', 'campaignBranches', 'campaignGraph'
  ], '/', errors);
  if (campaign.schemaVersion !== 1) errors.push('/schemaVersion must be 1');
  requireNumber(campaign.revision, '/revision', errors, { minimum: 1, maximum: 1000000000, integer: true });
  requireId(campaign.id, '/id', errors);
  requireString(campaign.name, '/name', errors, 120);
  if (typeof campaign.updatedAt !== 'string' || !Number.isFinite(Date.parse(campaign.updatedAt))) errors.push('/updatedAt must be an ISO date-time string');
  if (campaign.fps !== 60) errors.push('/fps must be 60');
  validateRecordCard(campaign.recordCard, '/recordCard', errors);
  validateHudAssets(campaign.hudAssets, '/hudAssets', errors);
  validateCampaignSectors(campaign.sectors, errors);
  validateCampaignVisualThemes(campaign.visualThemes, errors);
  validateEnemyRoleManifest(campaign.enemyRoles, errors);
  validateFormationPackManifest(campaign.formationPacks, errors);
  validateMiniBossManifest(campaign.miniBosses, errors);
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
  campaign.levels.forEach((level, index) => {
    const nextMissionId = level?.campaignProgression?.nextMissionId;
    if (typeof nextMissionId !== 'string') return;
    if (!levelIds.has(nextMissionId)) {
      errors.push(`/levels/${index}/campaignProgression/nextMissionId references unknown Mission: ${nextMissionId}`);
    } else if (nextMissionId === level?.id) {
      errors.push(`/levels/${index}/campaignProgression/nextMissionId cannot reference its owning Mission`);
    }
  });
  validateCampaignBranches(campaign.campaignBranches, campaign.levels, campaign.enemyRoles, errors);
  validateCampaignGraph(campaign.campaignGraph, campaign, errors);
  validateCampaignManifestCrossReferences(campaign, errors);
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
};

export const assertValidGameCampaign = (campaign, message = 'Invalid game campaign configuration') => {
  const result = validateGameCampaign(campaign);
  if (!result.valid) throw new ValidationError(message, result.errors);
  return campaign;
};
