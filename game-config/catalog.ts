import { ASSETS } from '../constants';
import generatedAssetsManifest from './generated-assets.json' with { type: 'json' };
import type {
  AssetCatalogEntry,
  AssetKey,
  BackgroundCatalogEntry,
  BackgroundId,
  BossCatalogEntry,
  BossId,
  BuiltInAssetKey,
  EnemyCatalogEntry,
  EnemyId,
  GeneratedAssetKey,
  GeneratedAssetRole,
  MovementPatternId,
  MusicCatalogEntry,
  MusicId,
  NamedCatalogEntry,
  PowerupCatalogEntry,
  PowerupId,
  SpawnPatternId,
  SpawnPositionId,
  WeaponId
} from './types';

const GENERATED_ASSET_ROLES = new Set<GeneratedAssetRole>([
  'enemy',
  'boss',
  'asteroid',
  'hud',
  'player',
  'background',
  'scorecard'
]);
const GENERATED_ASSET_ID_PATTERN = /^GENERATED_[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const GENERATED_ASSET_PATH_PATTERN = /^\/game-art\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const asset = (
  id: BuiltInAssetKey,
  label: string,
  value: string | readonly string[],
  roles: readonly GeneratedAssetRole[]
): AssetCatalogEntry => ({
  id,
  label,
  paths: Object.freeze(Array.isArray(value) ? [...value] : [value as string]),
  roles: Object.freeze([...roles])
});

/** Built-in art is still resolved through the real game's ASSETS constants. */
export const BUILT_IN_ASSET_CATALOG: Readonly<Record<BuiltInAssetKey, AssetCatalogEntry>> = Object.freeze({
  PLAYER_SHIP: asset('PLAYER_SHIP', 'ResearchHub ship', ASSETS.PLAYER_SHIP, ['player', 'scorecard']),
  RSC_TOKEN: asset('RSC_TOKEN', 'RSC token', ASSETS.RSC_TOKEN, ['hud', 'scorecard']),
  REAL_RSC_ICON: asset('REAL_RSC_ICON', 'RSC flask', ASSETS.REAL_RSC_ICON, ['hud', 'scorecard']),
  GAME_BG_BACK: asset('GAME_BG_BACK', 'Deep space', ASSETS.GAME_BG_BACK, ['background']),
  GAME_BG_STARS: asset('GAME_BG_STARS', 'Star field', ASSETS.GAME_BG_STARS, ['background']),
  GAME_BG_PLANET: asset('GAME_BG_PLANET', 'Planet horizon', ASSETS.GAME_BG_PLANET, ['background']),
  GAME_PARALLAX_BACK: asset('GAME_PARALLAX_BACK', 'Parallax space', ASSETS.GAME_PARALLAX_BACK, ['background']),
  GAME_PARALLAX_STARS: asset('GAME_PARALLAX_STARS', 'Parallax stars', ASSETS.GAME_PARALLAX_STARS, ['background']),
  GAME_PARALLAX_FAR_PLANETS: asset('GAME_PARALLAX_FAR_PLANETS', 'Far planets', ASSETS.GAME_PARALLAX_FAR_PLANETS, ['background']),
  GAME_PARALLAX_BIG_PLANET: asset('GAME_PARALLAX_BIG_PLANET', 'Big planet', ASSETS.GAME_PARALLAX_BIG_PLANET, ['background']),
  GAME_PARALLAX_RING_PLANET: asset('GAME_PARALLAX_RING_PLANET', 'Ring planet', ASSETS.GAME_PARALLAX_RING_PLANET, ['background']),
  PIXI_JET_SCOUT_FRAMES: asset('PIXI_JET_SCOUT_FRAMES', 'Terrain jet scout', ASSETS.PIXI_JET_SCOUT_FRAMES, ['enemy']),
  PIXI_JET_INTERCEPTOR_FRAMES: asset('PIXI_JET_INTERCEPTOR_FRAMES', 'Terrain jet interceptor', ASSETS.PIXI_JET_INTERCEPTOR_FRAMES, ['enemy']),
  PIXI_JET_HEAVY_FRAMES: asset('PIXI_JET_HEAVY_FRAMES', 'Terrain heavy jet', ASSETS.PIXI_JET_HEAVY_FRAMES, ['enemy']),
  PIXI_BOSS_OPEN_ORBIT_FRAMES: asset('PIXI_BOSS_OPEN_ORBIT_FRAMES', 'Open Orbit Gatekeeper', ASSETS.PIXI_BOSS_OPEN_ORBIT_FRAMES, ['boss', 'scorecard']),
  PIXI_BOSS_CITATION_FRAMES: asset('PIXI_BOSS_CITATION_FRAMES', 'Citation Storm Arbiter', ASSETS.PIXI_BOSS_CITATION_FRAMES, ['boss', 'scorecard']),
  PIXI_BOSS_PAYWALL_FRAMES: asset('PIXI_BOSS_PAYWALL_FRAMES', 'Paywall Decimator', ASSETS.PIXI_BOSS_PAYWALL_FRAMES, ['boss', 'scorecard']),
  PIXI_BOSS_OPEN_GALAXY_FRAMES: asset('PIXI_BOSS_OPEN_GALAXY_FRAMES', 'Open Galaxy Dreadnought', ASSETS.PIXI_BOSS_OPEN_GALAXY_FRAMES, ['boss', 'scorecard']),
  PIXI_BOSS_CROWNCLAW_FRAMES: asset('PIXI_BOSS_CROWNCLAW_FRAMES', 'Astral Crownclaw', ASSETS.PIXI_BOSS_CROWNCLAW_FRAMES, ['boss', 'scorecard']),
  ENEMY_DRONE_FRAMES: asset('ENEMY_DRONE_FRAMES', 'Paywall Interceptor', ASSETS.ENEMY_DRONE_FRAMES, ['enemy', 'scorecard']),
  LEGACY_ENEMY_DRONE_FRAMES: asset('LEGACY_ENEMY_DRONE_FRAMES', 'Legacy Research Drone', ASSETS.LEGACY_ENEMY_DRONE_FRAMES, ['enemy']),
  ENEMY_SWARM_FRAMES: asset('ENEMY_SWARM_FRAMES', 'Citation Wraith', ASSETS.ENEMY_SWARM_FRAMES, ['enemy', 'scorecard']),
  LEGACY_ENEMY_SWARM_FRAMES: asset('LEGACY_ENEMY_SWARM_FRAMES', 'Legacy Citation Drone', ASSETS.LEGACY_ENEMY_SWARM_FRAMES, ['enemy']),
  ENEMY_BRICK_FRAMES: asset('ENEMY_BRICK_FRAMES', 'Peer Review Bulwark', ASSETS.ENEMY_BRICK_FRAMES, ['enemy', 'scorecard']),
  ASTEROID_BELT_FRAMES: asset('ASTEROID_BELT_FRAMES', 'Asteroid belt', ASSETS.ASTEROID_BELT_FRAMES, ['asteroid', 'scorecard']),
  ENEMY_JOURNAL: asset('ENEMY_JOURNAL', 'Predatory Journal Raider', ASSETS.ENEMY_JOURNAL, ['enemy', 'scorecard']),
  ENEMY_JOURNAL_FRAMES: asset('ENEMY_JOURNAL_FRAMES', 'Predatory Journal Raider', ASSETS.ENEMY_JOURNAL_FRAMES, ['enemy', 'scorecard']),
  MINI_BOSS: asset('MINI_BOSS', 'Bottleneck drone', ASSETS.MINI_BOSS, ['boss', 'scorecard']),
  WALL_BOSS_SEGMENT: asset('WALL_BOSS_SEGMENT', 'Paywall segment', ASSETS.WALL_BOSS_SEGMENT, ['boss', 'scorecard']),
  PAYWALL_BASTION_FRAMES: asset('PAYWALL_BASTION_FRAMES', 'Paywall Bastion', ASSETS.PAYWALL_BASTION_FRAMES, ['boss', 'scorecard']),
  FINAL_BOSS: asset('FINAL_BOSS', 'Gatekeeper sentinel', ASSETS.FINAL_BOSS, ['boss', 'scorecard'])
});

const parseGeneratedAssetCatalog = (manifest: unknown): Readonly<Record<GeneratedAssetKey, AssetCatalogEntry>> => {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('generated-assets.json must contain an object');
  }
  const root = manifest as Record<string, unknown>;
  const rootKeys = Object.keys(root);
  if (root.schemaVersion !== 1 || rootKeys.some((key) => key !== 'schemaVersion' && key !== 'assets')) {
    throw new Error('generated-assets.json must use schemaVersion 1 and only known fields');
  }
  if (!Array.isArray(root.assets)) throw new Error('generated-assets.json assets must be an array');

  const catalog: Partial<Record<GeneratedAssetKey, AssetCatalogEntry>> = {};
  const paths = new Set<string>();
  for (const [index, value] of root.assets.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`generated-assets.json assets/${index} must be an object`);
    }
    const entry = value as Record<string, unknown>;
    const allowedKeys = new Set(['id', 'label', 'roles', 'path', 'sha256', 'width', 'height', 'createdAt']);
    if (Object.keys(entry).some((key) => !allowedKeys.has(key))) {
      throw new Error(`generated-assets.json assets/${index} contains unsupported fields`);
    }
    if (typeof entry.id !== 'string' || !GENERATED_ASSET_ID_PATTERN.test(entry.id)) {
      throw new Error(`generated-assets.json assets/${index}/id is invalid`);
    }
    const id = entry.id as GeneratedAssetKey;
    if (Object.hasOwn(BUILT_IN_ASSET_CATALOG, id) || Object.hasOwn(catalog, id)) {
      throw new Error(`generated-assets.json contains duplicate asset id: ${id}`);
    }
    if (typeof entry.label !== 'string' || entry.label.trim().length === 0 || entry.label.length > 80) {
      throw new Error(`generated-assets.json assets/${index}/label is invalid`);
    }
    if (!Array.isArray(entry.roles) || entry.roles.length === 0) {
      throw new Error(`generated-assets.json assets/${index}/roles must be non-empty`);
    }
    const roles = entry.roles as unknown[];
    if (roles.some((role) => typeof role !== 'string' || !GENERATED_ASSET_ROLES.has(role as GeneratedAssetRole))) {
      throw new Error(`generated-assets.json assets/${index}/roles contains an unsupported role`);
    }
    if (new Set(roles).size !== roles.length) {
      throw new Error(`generated-assets.json assets/${index}/roles contains duplicates`);
    }
    if (typeof entry.path !== 'string' || !GENERATED_ASSET_PATH_PATTERN.test(entry.path)) {
      throw new Error(`generated-assets.json assets/${index}/path must stay under /game-art/generated`);
    }
    if (paths.has(entry.path)) throw new Error(`generated-assets.json contains duplicate path: ${entry.path}`);
    paths.add(entry.path);
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) {
      throw new Error(`generated-assets.json assets/${index}/sha256 is invalid`);
    }
    const shortHash = entry.sha256.slice(0, 12);
    if (!id.endsWith(`_${shortHash.toUpperCase()}`) || !entry.path.endsWith(`-${shortHash}.png`)) {
      throw new Error(`generated-assets.json assets/${index} id and path must match its content hash`);
    }
    if (!Number.isInteger(entry.width) || (entry.width as number) < 1 || (entry.width as number) > 4096) {
      throw new Error(`generated-assets.json assets/${index}/width is invalid`);
    }
    if (!Number.isInteger(entry.height) || (entry.height as number) < 1 || (entry.height as number) > 4096) {
      throw new Error(`generated-assets.json assets/${index}/height is invalid`);
    }
    if (typeof entry.createdAt !== 'string' || Number.isNaN(Date.parse(entry.createdAt))) {
      throw new Error(`generated-assets.json assets/${index}/createdAt is invalid`);
    }
    catalog[id] = Object.freeze({
      id,
      label: entry.label,
      paths: Object.freeze([entry.path]),
      roles: Object.freeze(roles as GeneratedAssetRole[]),
      generated: Object.freeze({
        sha256: entry.sha256,
        width: entry.width as number,
        height: entry.height as number,
        createdAt: entry.createdAt
      })
    });
  }
  return Object.freeze(catalog) as Readonly<Record<GeneratedAssetKey, AssetCatalogEntry>>;
};

export const GENERATED_ASSET_CATALOG = parseGeneratedAssetCatalog(generatedAssetsManifest);

/** Campaign JSON accepts registered keys only; direct filesystem or URL paths stay forbidden. */
const runtimeAssetCatalog = {
  ...BUILT_IN_ASSET_CATALOG,
  ...GENERATED_ASSET_CATALOG
} as Record<AssetKey, AssetCatalogEntry>;
export const ASSET_CATALOG = runtimeAssetCatalog as Readonly<Record<AssetKey, AssetCatalogEntry>>;

/**
 * Makes an API-verified local generation immediately available to the live
 * preview while Vite observes the atomic manifest update. Campaign validation
 * still requires that same ID to exist in generated-assets.json before save.
 */
export const registerGeneratedAssetForPreview = (entry: AssetCatalogEntry): AssetCatalogEntry => {
  const id = entry?.id;
  const generated = entry?.generated;
  const path = entry?.paths?.[0];
  if (
    typeof id !== 'string'
    || !GENERATED_ASSET_ID_PATTERN.test(id)
    || typeof entry.label !== 'string'
    || entry.label.trim().length === 0
    || entry.label.length > 80
    || entry.paths.length !== 1
    || typeof path !== 'string'
    || !GENERATED_ASSET_PATH_PATTERN.test(path)
    || !Array.isArray(entry.roles)
    || entry.roles.length === 0
    || entry.roles.some((role) => !GENERATED_ASSET_ROLES.has(role))
    || new Set(entry.roles).size !== entry.roles.length
    || !generated
    || !SHA256_PATTERN.test(generated.sha256)
    || !Number.isInteger(generated.width)
    || generated.width < 1
    || generated.width > 4096
    || !Number.isInteger(generated.height)
    || generated.height < 1
    || generated.height > 4096
    || typeof generated.createdAt !== 'string'
    || Number.isNaN(Date.parse(generated.createdAt))
  ) {
    throw new Error('Generated preview asset failed catalog validation');
  }
  const shortHash = generated.sha256.slice(0, 12);
  if (!id.endsWith(`_${shortHash.toUpperCase()}`) || !path.endsWith(`-${shortHash}.png`)) {
    throw new Error('Generated preview asset ID and path do not match its content hash');
  }
  const existing = runtimeAssetCatalog[id as AssetKey];
  if (existing) {
    if (existing.generated?.sha256 !== generated.sha256 || existing.paths[0] !== path) {
      throw new Error(`Generated preview asset collides with catalog id: ${id}`);
    }
    return existing;
  }
  if (Object.values(runtimeAssetCatalog).some((candidate) => candidate.paths.includes(path))) {
    throw new Error(`Generated preview asset path is already registered: ${path}`);
  }
  const normalized = Object.freeze({
    id: id as GeneratedAssetKey,
    label: entry.label,
    paths: Object.freeze([path]),
    roles: Object.freeze([...entry.roles]),
    generated: Object.freeze({ ...generated })
  });
  runtimeAssetCatalog[id as AssetKey] = normalized;
  return normalized;
};

export const isGeneratedAssetKey = (id: string): id is GeneratedAssetKey => (
  GENERATED_ASSET_ID_PATTERN.test(id) && Object.prototype.hasOwnProperty.call(runtimeAssetCatalog, id)
);

export const isAssetAllowedForRole = (id: string, role: GeneratedAssetRole): id is AssetKey => {
  const entry = ASSET_CATALOG[id as AssetKey];
  return Boolean(entry?.roles.includes(role));
};

export const getAssetKeysForRole = (role: GeneratedAssetRole): AssetKey[] => (
  Object.values(ASSET_CATALOG)
    .filter((entry) => entry.roles.includes(role))
    .map((entry) => entry.id)
);

export const ENEMY_CATALOG: Record<EnemyId, EnemyCatalogEntry> = {
  drone: {
    id: 'drone',
    label: 'Paywall Interceptor',
    entityType: 'ENEMY_DRONE',
    defaultSpriteKey: 'ENEMY_DRONE_FRAMES',
    defaultMovementPatternId: 'drift-down',
    baseHealth: 2,
    baseSpeed: 2.5,
    baseDamage: 1,
    baseScoreValue: 10,
    basePowerupDropChance: 0
  },
  swarm: {
    id: 'swarm',
    label: 'Citation Wraith',
    entityType: 'ENEMY_SWARM',
    defaultSpriteKey: 'ENEMY_SWARM_FRAMES',
    defaultMovementPatternId: 'track-player',
    baseHealth: 1,
    baseSpeed: 3.5,
    baseDamage: 1,
    baseScoreValue: 12,
    basePowerupDropChance: 0
  },
  brick: {
    id: 'brick',
    label: 'Peer Review Bulwark',
    entityType: 'ENEMY_BRICK',
    defaultSpriteKey: 'ENEMY_BRICK_FRAMES',
    defaultMovementPatternId: 'drift-down',
    baseHealth: 8,
    baseSpeed: 1.5,
    baseDamage: 1,
    baseScoreValue: 20,
    basePowerupDropChance: 0.08
  },
  journal: {
    id: 'journal',
    label: 'Predatory Journal Raider',
    entityType: 'ENEMY_JOURNAL',
    defaultSpriteKey: 'ENEMY_JOURNAL_FRAMES',
    defaultMovementPatternId: 'sine-drift',
    baseHealth: 3,
    baseSpeed: 4.4,
    baseDamage: 1,
    baseScoreValue: 30,
    basePowerupDropChance: 0.08
  }
};

export const BOSS_CATALOG: Record<BossId, BossCatalogEntry> = {
  'bottleneck-drone': {
    id: 'bottleneck-drone',
    label: 'Bottleneck Drone',
    entityType: 'MINI_BOSS',
    defaultSpriteKey: 'MINI_BOSS',
    defaultMovementPatternId: 'track-player',
    allowedWeaponIds: ['aimed-shot']
  },
  'paywall-wall': {
    id: 'paywall-wall',
    label: 'Paywall Wall',
    entityType: 'ENEMY_INVADER',
    defaultSpriteKey: 'PAYWALL_BASTION_FRAMES',
    defaultMovementPatternId: 'wall-march',
    allowedWeaponIds: ['wall-bolt']
  },
  gatekeeper: {
    id: 'gatekeeper',
    label: 'Gatekeeper',
    entityType: 'BOSS',
    defaultSpriteKey: 'FINAL_BOSS',
    defaultMovementPatternId: 'gatekeeper-cycle',
    allowedWeaponIds: ['burst-volley', 'lane-beam']
  }
};

export const POWERUP_CATALOG: Record<PowerupId, PowerupCatalogEntry> = {
  'double-shot': { id: 'double-shot', label: 'Double Shot', runtimeType: 'DOUBLE_SHOT', defaultWeight: 0.36 },
  'triple-shot': { id: 'triple-shot', label: 'Triple Shot', runtimeType: 'TRIPLE_SHOT', defaultWeight: 0.34 },
  magnet: { id: 'magnet', label: 'Magnet', runtimeType: 'MAGNET', defaultWeight: 0.12 },
  shield: { id: 'shield', label: 'Shield', runtimeType: 'SHIELD', defaultWeight: 0.1 },
  'research-beam': { id: 'research-beam', label: 'Research Beam', runtimeType: 'RESEARCH_BEAM', defaultWeight: 0.08 },
  'extra-life': { id: 'extra-life', label: 'Extra Life', runtimeType: 'EXTRA_LIFE', defaultWeight: 0 }
};

const commonBackgroundLayers: AssetKey[] = [
  'GAME_PARALLAX_BACK',
  'GAME_PARALLAX_STARS',
  'GAME_BG_BACK',
  'GAME_BG_STARS',
  'GAME_PARALLAX_FAR_PLANETS',
  'GAME_BG_PLANET',
  'GAME_PARALLAX_BIG_PLANET',
  'GAME_PARALLAX_RING_PLANET'
];

export const BACKGROUND_CATALOG: Record<BackgroundId, BackgroundCatalogEntry> = {
  'open-orbit': { id: 'open-orbit', label: 'Open Orbit', layerAssetKeys: [...commonBackgroundLayers], tint: '#0f4c81' },
  'citation-storm': { id: 'citation-storm', label: 'Citation Storm', layerAssetKeys: [...commonBackgroundLayers], tint: '#4f46e5' },
  'paywall-siege': { id: 'paywall-siege', label: 'Paywall Siege', layerAssetKeys: [...commonBackgroundLayers], tint: '#d97706' },
  'open-galaxy': { id: 'open-galaxy', label: 'Open Galaxy', layerAssetKeys: [...commonBackgroundLayers], tint: '#10b981' },
  'bastion-protocol': { id: 'bastion-protocol', label: 'Bastion Protocol', layerAssetKeys: [...commonBackgroundLayers], tint: '#db2777' }
};

export const MUSIC_CATALOG: Record<MusicId, MusicCatalogEntry> = {
  'procedural-main': { id: 'procedural-main', label: 'Scicon procedural pulse', runtimeCue: 'procedural-main' }
};

export const SPAWN_PATTERN_CATALOG: Record<SpawnPatternId, NamedCatalogEntry<SpawnPatternId>> = {
  'single-random': { id: 'single-random', label: 'Random singles' },
  row: { id: 'row', label: 'Row' },
  v: { id: 'v', label: 'V formation' },
  sine: { id: 'sine', label: 'Sine wave' },
  pincer: { id: 'pincer', label: 'Pincer' },
  grid: { id: 'grid', label: 'Formation wall' },
  diamond: { id: 'diamond', label: 'Diamond pack' },
  spiral: { id: 'spiral', label: 'Spiral entry' },
  'asteroid-lanes': { id: 'asteroid-lanes', label: 'Asteroid lanes' }
};

export const SPAWN_POSITION_CATALOG: Record<SpawnPositionId, NamedCatalogEntry<SpawnPositionId>> = {
  'random-top': { id: 'random-top', label: 'Random top edge' },
  'formation-top': { id: 'formation-top', label: 'Centered formation' },
  'center-top': { id: 'center-top', label: 'Top center' },
  'lane-top': { id: 'lane-top', label: 'Top lanes' }
};

export const MOVEMENT_PATTERN_CATALOG: Record<MovementPatternId, NamedCatalogEntry<MovementPatternId>> = {
  'drift-down': { id: 'drift-down', label: 'Downward drift' },
  'sine-drift': { id: 'sine-drift', label: 'Sine drift' },
  'track-player': { id: 'track-player', label: 'Track player' },
  'wall-march': { id: 'wall-march', label: 'Wall march' },
  'asteroid-drift': { id: 'asteroid-drift', label: 'Asteroid drift' },
  'gatekeeper-cycle': { id: 'gatekeeper-cycle', label: 'Gatekeeper attack cycle' },
  'arena-roam': { id: 'arena-roam', label: 'Arena roam' }
};

export const WEAPON_CATALOG: Record<WeaponId, NamedCatalogEntry<WeaponId>> = {
  'aimed-shot': { id: 'aimed-shot', label: 'Aimed shot' },
  'wall-bolt': { id: 'wall-bolt', label: 'Wall bolt' },
  'burst-volley': { id: 'burst-volley', label: 'Burst volley' },
  'lane-beam': { id: 'lane-beam', label: 'Lane beam' }
};
