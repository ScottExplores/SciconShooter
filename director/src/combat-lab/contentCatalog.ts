import {
  ASSET_CATALOG,
  BACKGROUND_CATALOG,
  BOSS_CATALOG,
  ENEMY_CATALOG,
  MOVEMENT_PATTERN_CATALOG,
  POWERUP_CATALOG,
  SPAWN_PATTERN_CATALOG,
  SPAWN_POSITION_CATALOG,
  WEAPON_CATALOG
} from '@game/game-config/catalog';
import type {
  AssetKey,
  AsteroidEvent,
  BossEvent,
  BossHealthPhase,
  BossWeaponSetting,
  EnemyId,
  GameCampaignConfig,
  LevelDefinition,
  PowerupId,
  SpawnEnemySetting,
  SpawnEvent,
  SpawnPatternId,
  WaveDefinition,
  WaveEvent,
  WeaponId
} from '@game/game-config/types';
import {
  PLAYABLE_PLAYER_SHIP_IDS,
  PLAYER_SHIPS,
  type PlayerShipId
} from '@game/services/playerShipService';
import { SHIP_ABILITY_DEFINITIONS } from '@game/services/shipAbilityService';
import {
  MAIN_SHIP_UPGRADES,
  MINI_SHIP_CATALOG,
  type MiniShipId
} from '@game/services/squadProgression';
import {
  SANDBOX_BOSS_ARTWORK_REGISTRATIONS,
  type SandboxBossArtworkRegistration
} from '../tools/bosses/bossSandboxModel';
import {
  SANDBOX_BOSS_PROTOTYPE_BY_ID
} from './sandboxBossPrototypes';

export const COMBAT_LAB_CATEGORY_IDS = [
  'formations',
  'enemies',
  'bosses',
  'boss-moves',
  'stages-waves',
  'main-ships',
  'mini-ships',
  'weapons',
  'powerups',
  'effects-assets'
] as const;

export type CombatLabCategoryId = typeof COMBAT_LAB_CATEGORY_IDS[number];

export type CombatLabItemKind =
  | 'formation'
  | 'enemy'
  | 'boss'
  | 'boss-weapon'
  | 'boss-phase'
  | 'stage'
  | 'wave'
  | 'main-ship'
  | 'mini-ship'
  | 'weapon'
  | 'powerup'
  | 'effect'
  | 'asset';

export type CombatLabFactValue = string | number | boolean | readonly string[];

export interface CombatLabFact {
  label: string;
  value: CombatLabFactValue;
  source: 'catalog' | 'campaign' | 'runtime';
  note?: string;
}

export interface CombatLabSourceRef {
  path: string;
  symbol?: string;
  catalogId?: string;
  levelId?: string;
  waveId?: string;
  eventId?: string;
  itemId?: string;
}

/** IDs needed to turn a catalog selection into a real-runtime preview. */
export interface CombatLabTarget {
  levelId?: string;
  waveId?: string;
  eventId?: string;
  enemyId?: EnemyId;
  bossId?: BossEvent['bossId'];
  weaponId?: WeaponId;
  weaponSettingId?: string;
  phaseId?: string;
  powerupId?: PowerupId;
  patternId?: SpawnPatternId;
  playerShipId?: PlayerShipId;
  miniShipId?: MiniShipId;
  assetKey?: AssetKey;
  effectId?: string;
}

export interface CombatLabCatalogItem {
  id: string;
  category: CombatLabCategoryId;
  kind: CombatLabItemKind;
  name: string;
  description: string;
  imagePaths: readonly string[];
  facts: readonly CombatLabFact[];
  sourceRefs: readonly CombatLabSourceRef[];
  relatedIds: readonly string[];
  target: Readonly<CombatLabTarget>;
  /** True when the current shipped campaign or an always-enabled game path consumes this item. */
  production: boolean;
}

export interface CombatLabCategory {
  id: CombatLabCategoryId;
  label: string;
  items: readonly CombatLabCatalogItem[];
}

export interface CombatLabCatalog {
  campaign: Readonly<{
    id: string;
    name: string;
    revision: number;
    updatedAt: string;
  }>;
  formations: readonly CombatLabCatalogItem[];
  enemies: readonly CombatLabCatalogItem[];
  bosses: readonly CombatLabCatalogItem[];
  bossMoves: readonly CombatLabCatalogItem[];
  stagesWaves: readonly CombatLabCatalogItem[];
  mainShips: readonly CombatLabCatalogItem[];
  miniShips: readonly CombatLabCatalogItem[];
  weapons: readonly CombatLabCatalogItem[];
  powerups: readonly CombatLabCatalogItem[];
  effectsAssets: readonly CombatLabCatalogItem[];
  categories: readonly CombatLabCategory[];
  allItems: readonly CombatLabCatalogItem[];
  byId: Readonly<Record<string, CombatLabCatalogItem>>;
  summary: Readonly<Record<CombatLabCategoryId, number>>;
}

interface EventContext<T extends WaveEvent = WaveEvent> {
  level: LevelDefinition;
  wave: WaveDefinition;
  event: T;
}

interface EnemyUse extends EventContext<SpawnEvent> {
  setting: SpawnEnemySetting;
}

type FormationEvent = SpawnEvent | AsteroidEvent;

interface BossWeaponUse extends EventContext<BossEvent> {
  setting: BossWeaponSetting;
  index: number;
}

interface BossPhaseUse extends EventContext<BossEvent> {
  phase: BossHealthPhase;
}

const CATEGORY_LABELS: Record<CombatLabCategoryId, string> = {
  formations: 'Formations',
  enemies: 'Enemies',
  bosses: 'Bosses',
  'boss-moves': 'Boss Moves',
  'stages-waves': 'Missions & Waves',
  'main-ships': 'Main Ships',
  'mini-ships': 'Mini-Ships',
  weapons: 'Weapons',
  powerups: 'Power-Ups',
  'effects-assets': 'Effects & Assets'
};

const EFFECT_DESCRIPTORS = [
  {
    id: 'particle-burst',
    name: 'Particle Burst',
    description: 'The real GameEngine particle burst used by impacts, weapons, pickups, and explosions.',
    symbol: 'GameEngine.spawnBurst',
    facts: [
      { label: 'Adaptive detail', value: true, source: 'runtime' as const },
      { label: 'Frequent objects', value: 'Pooled by the Pixi renderer', source: 'runtime' as const }
    ]
  },
  {
    id: 'ring-effect',
    name: 'Energy Ring',
    description: 'The real GameEngine ring effect used for abilities, pickups, warnings, and impacts.',
    symbol: 'GameEngine.spawnRingEffect',
    facts: [{ label: 'Runtime entity', value: 'VisualEffect', source: 'runtime' as const }]
  },
  {
    id: 'explosion',
    name: 'Explosion',
    description: 'The real combat explosion path, combining runtime particles with renderer presentation.',
    symbol: 'GameEngine.spawnExplosion',
    facts: [{ label: 'Uses particle density caps', value: true, source: 'runtime' as const }]
  },
  {
    id: 'screen-shake',
    name: 'Screen Shake',
    description: 'The optional GameEngine camera-shake response controlled by the shared polish settings.',
    symbol: 'GameEngine.addShake',
    facts: [{ label: 'Polish setting', value: 'screenShake', source: 'runtime' as const }]
  },
  {
    id: 'hit-stop',
    name: 'Hit Stop',
    description: 'The real short simulation-impact pause used to emphasize heavy combat hits.',
    symbol: 'GameEngine.addHitStop',
    facts: [{ label: 'Unit', value: 'simulation frames', source: 'runtime' as const }]
  }
] as const;

const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];

const numericRange = (values: readonly number[], suffix = ''): string => {
  if (values.length === 0) return 'Not configured';
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum ? `${minimum}${suffix}` : `${minimum}${suffix}–${maximum}${suffix}`;
};

const campaignRef = (context: EventContext, itemId?: string): CombatLabSourceRef => ({
  path: 'game-config/campaign.json',
  levelId: context.level.id,
  waveId: context.wave.id,
  eventId: context.event.id,
  ...(itemId ? { itemId } : {})
});

const targetFromContext = (context?: EventContext): CombatLabTarget => context ? ({
  levelId: context.level.id,
  waveId: context.wave.id,
  eventId: context.event.id
}) : {};

const imagePathsForAsset = (key?: AssetKey): readonly string[] => (
  key && ASSET_CATALOG[key] ? ASSET_CATALOG[key].paths : []
);

const collectEventContexts = (campaign: GameCampaignConfig): EventContext[] => (
  campaign.levels.flatMap((level) => level.waves.flatMap((wave) => (
    wave.events.map((event) => ({ level, wave, event }))
  )))
);

const collectAssetRefs = (
  campaign: GameCampaignConfig,
  contexts: readonly EventContext[]
): Map<AssetKey, CombatLabSourceRef[]> => {
  const refs = new Map<AssetKey, CombatLabSourceRef[]>();
  const add = (key: AssetKey | 'AUTO' | undefined, ref: CombatLabSourceRef) => {
    if (!key || key === 'AUTO' || !ASSET_CATALOG[key]) return;
    refs.set(key, [...(refs.get(key) ?? []), ref]);
  };

  add(campaign.recordCard.shipAssetKey, {
    path: 'game-config/campaign.json',
    itemId: 'recordCard.shipAssetKey'
  });
  add(campaign.recordCard.encounterAssetKey, {
    path: 'game-config/campaign.json',
    itemId: 'recordCard.encounterAssetKey'
  });
  add(campaign.hudAssets.bombIconAssetKey, {
    path: 'game-config/campaign.json',
    itemId: 'hudAssets.bombIconAssetKey'
  });

  for (const level of campaign.levels) {
    add(level.scorecard.encounterAssetKey, {
      path: 'game-config/campaign.json',
      levelId: level.id,
      itemId: 'scorecard.encounterAssetKey'
    });
    for (const key of BACKGROUND_CATALOG[level.backgroundId]?.layerAssetKeys ?? []) {
      add(key, {
        path: 'game-config/catalog.ts',
        symbol: 'BACKGROUND_CATALOG',
        catalogId: level.backgroundId,
        levelId: level.id
      });
    }
  }

  for (const context of contexts) {
    const ref = campaignRef(context);
    if (context.event.kind === 'spawn') {
      for (const enemy of context.event.enemies) add(enemy.spriteKey, { ...ref, itemId: enemy.enemyId });
    } else if (context.event.kind === 'boss' || context.event.kind === 'asteroid-belt') {
      add(context.event.spriteKey, ref);
    }
  }
  return refs;
};

const createFormationItems = (
  formationContexts: readonly EventContext<FormationEvent>[]
): CombatLabCatalogItem[] => Object.values(SPAWN_PATTERN_CATALOG).map((pattern) => {
  const uses = formationContexts.filter(({ event }) => event.patternId === pattern.id);
  const first = uses[0];
  const spawnUses = uses.filter((context): context is EventContext<SpawnEvent> => context.event.kind === 'spawn');
  const asteroidUses = uses.filter((context): context is EventContext<AsteroidEvent> => context.event.kind === 'asteroid-belt');
  const enemyIds = unique(spawnUses.flatMap(({ event }) => event.enemies.map((enemy) => enemy.enemyId)));
  const spriteKeys = unique([
    ...spawnUses.flatMap(({ event }) => event.enemies.map((enemy) => enemy.spriteKey)),
    ...asteroidUses.map(({ event }) => event.spriteKey)
  ]);
  const runtimeDescription = pattern.id === 'asteroid-lanes'
    ? 'It runs through the production asteroid-belt lane spawner.'
    : pattern.id === 'single-random'
      ? 'It places independent enemies without entering the grouped formation state machine.'
      : 'It runs through the shared enter, assemble, dive, and return formation states.';
  return {
    id: `formation:${pattern.id}`,
    category: 'formations',
    kind: 'formation',
    name: pattern.label,
    description: uses.length > 0
      ? `${pattern.label} is used by ${uses.length} production event${uses.length === 1 ? '' : 's'}. ${runtimeDescription}`
      : pattern.id === 'asteroid-lanes'
        ? `${pattern.label} is supported by the real asteroid-belt runtime but is not used by the current campaign.`
        : `${pattern.label} is supported by the real enemy-spawn runtime but is not used by the current campaign.`,
    imagePaths: spriteKeys.flatMap((key) => imagePathsForAsset(key)).slice(0, 6),
    facts: [
      { label: 'Production event uses', value: uses.length, source: 'campaign' },
      { label: 'Configured entity count', value: numericRange(uses.map(({ event }) => event.count)), source: 'campaign' },
      { label: 'Spawn positions', value: unique(uses.map(({ event }) => SPAWN_POSITION_CATALOG[event.positionId].label)), source: 'campaign' },
      { label: 'Enemy families', value: enemyIds.map((id) => ENEMY_CATALOG[id].label), source: 'campaign' },
      {
        label: 'Runtime path',
        value: pattern.id === 'asteroid-lanes'
          ? 'asteroid lane spawner'
          : pattern.id === 'single-random'
            ? 'independent random spawn'
            : ['entry', 'hold', 'dive', 'return'],
        source: 'runtime'
      }
    ],
    sourceRefs: [
      { path: 'game-config/catalog.ts', symbol: 'SPAWN_PATTERN_CATALOG', catalogId: pattern.id },
      {
        path: 'services/gameLogic.ts',
        symbol: pattern.id === 'asteroid-lanes'
          ? 'GameEngine.spawnAsteroidBelt'
          : pattern.id === 'single-random'
            ? 'GameEngine.spawnConfiguredEnemies'
            : 'GameEngine.updateConfiguredEnemyFormation'
      },
      ...uses.map((context) => campaignRef(context))
    ],
    relatedIds: [
      ...enemyIds.map((id) => `enemy:${id}`),
      ...unique(uses.map(({ wave }) => `wave:${wave.id}`))
    ],
    target: { ...targetFromContext(first), patternId: pattern.id },
    production: uses.length > 0
  };
});

const createEnemyItems = (enemyUses: readonly EnemyUse[]): CombatLabCatalogItem[] => (
  Object.values(ENEMY_CATALOG).map((enemy) => {
    const uses = enemyUses.filter(({ setting }) => setting.enemyId === enemy.id);
    const first = uses[0];
    const attackPatterns = unique(uses
      .map(({ setting }) => setting.attackPatternId)
      .filter((id): id is NonNullable<typeof id> => Boolean(id)));
    return {
      id: `enemy:${enemy.id}`,
      category: 'enemies',
      kind: 'enemy',
      name: enemy.label,
      description: `${enemy.label} is the ${enemy.entityType} runtime family. Campaign spawn rows provide its effective combat values; catalog values are authoring defaults for new rows and synthetic previews.`,
      imagePaths: imagePathsForAsset(enemy.defaultSpriteKey),
      facts: [
        { label: 'Default movement', value: MOVEMENT_PATTERN_CATALOG[enemy.defaultMovementPatternId].label, source: 'catalog' },
        { label: 'Base health', value: enemy.baseHealth, source: 'catalog' },
        { label: 'Base speed', value: enemy.baseSpeed, source: 'catalog' },
        { label: 'Base damage', value: enemy.baseDamage, source: 'catalog' },
        { label: 'Base score value', value: enemy.baseScoreValue, source: 'catalog' },
        { label: 'Campaign health', value: numericRange(uses.map(({ setting }) => setting.health)), source: 'campaign' },
        { label: 'Campaign speed', value: numericRange(uses.map(({ setting }) => setting.speed)), source: 'campaign' },
        { label: 'Campaign damage', value: numericRange(uses.map(({ setting }) => setting.damage)), source: 'campaign' },
        { label: 'Spawn-row uses', value: uses.length, source: 'campaign' },
        { label: 'Ranks', value: unique(uses.map(({ setting }) => setting.rank ?? 'standard')), source: 'campaign' },
        { label: 'Attack patterns', value: attackPatterns.length > 0 ? attackPatterns : ['none configured'], source: 'campaign' }
      ],
      sourceRefs: [
        { path: 'game-config/catalog.ts', symbol: 'ENEMY_CATALOG', catalogId: enemy.id },
        { path: 'services/gameLogic.ts', symbol: 'GameEngine.spawnConfiguredEnemies' },
        ...uses.map((use) => campaignRef(use, use.setting.enemyId))
      ],
      relatedIds: [
        ...unique(uses.map(({ event }) => `formation:${event.patternId}`)),
        ...unique(uses.map(({ wave }) => `wave:${wave.id}`))
      ],
      target: {
        ...targetFromContext(first),
        enemyId: enemy.id
      },
      production: uses.length > 0
    };
  })
);

const createBossItems = (
  bossContexts: readonly EventContext<BossEvent>[]
): CombatLabCatalogItem[] => bossContexts.map((context) => {
  const { event, level, wave } = context;
  const catalog = BOSS_CATALOG[event.bossId];
  const rigDescription = event.rigId
    ? ` Its explicit ${event.rigId} renderer rig is preserved in focused previews.`
    : '';
  const rigFact = event.bossId !== 'gatekeeper'
    ? 'Not used by this boss family'
    : event.rigId ?? 'Compatibility event mapping, then open-orbit fallback';
  return {
    id: `boss:${event.id}`,
    category: 'bosses',
    kind: 'boss',
    name: event.label,
    description: `${event.label} is a configured ${catalog.label} encounter in ${wave.name}.${rigDescription} Focused previews also preserve its source event ID for diagnostics and campaign traceability.`,
    imagePaths: imagePathsForAsset(event.spriteKey),
    facts: [
      { label: 'Boss family', value: catalog.label, source: 'catalog' },
      { label: 'Mission / wave', value: `${level.name} / ${wave.name}`, source: 'campaign' },
      { label: 'Health', value: event.health, source: 'campaign' },
      { label: 'Speed', value: event.speed, source: 'campaign' },
      { label: 'Contact damage', value: event.damage, source: 'campaign' },
      { label: 'Movement', value: MOVEMENT_PATTERN_CATALOG[event.movementPatternId].label, source: 'campaign' },
      { label: 'Renderer rig', value: rigFact, source: event.rigId ? 'campaign' : 'runtime' },
      { label: 'Warning', value: `${event.warningSeconds}s`, source: 'campaign' },
      { label: 'Count / rows', value: event.count ?? 1, source: 'campaign' },
      { label: 'Orbiting shields', value: event.shieldCount, source: 'campaign' },
      { label: 'Weapons', value: event.weapons.map((weapon) => WEAPON_CATALOG[weapon.weaponId].label), source: 'campaign' },
      { label: 'Authored phases', value: event.phases.length, source: 'campaign' }
    ],
    sourceRefs: [
      { path: 'game-config/catalog.ts', symbol: 'BOSS_CATALOG', catalogId: event.bossId },
      { path: 'services/gameLogic.ts', symbol: 'GameEngine.spawnConfiguredEncounter' },
      campaignRef(context)
    ],
    relatedIds: [
      `wave:${wave.id}`,
      ...event.weapons.map((weapon) => `boss-move:weapon:${event.id}:${weapon.id}`),
      ...event.phases.map((phase) => `boss-move:phase:${event.id}:${phase.id}`)
    ],
    target: {
      ...targetFromContext(context),
      bossId: event.bossId
    },
    production: true
  };
});

const createBossMoveItems = (
  weaponUses: readonly BossWeaponUse[],
  phaseUses: readonly BossPhaseUse[]
): CombatLabCatalogItem[] => [
  ...weaponUses.map(({ level, wave, event, setting, index }): CombatLabCatalogItem => {
    const context = { level, wave, event };
    const phaseUseCount = event.phases.filter((phase) => phase.weaponSettingIds.includes(setting.id)).length;
    const phasePrimaryCount = event.phases.filter((phase) => phase.weaponSettingIds[0] === setting.id).length;
    const wallPrimary = event.bossId === 'paywall-wall' && index === 0;
    const providesNumericTuning = wallPrimary || phasePrimaryCount > 0;
    return {
      id: `boss-move:weapon:${event.id}:${setting.id}`,
      category: 'boss-moves' as const,
      kind: 'boss-weapon' as const,
      name: `${event.label} · ${WEAPON_CATALOG[setting.weaponId].label}`,
      description: event.bossId === 'paywall-wall'
        ? (wallPrimary
          ? `The primary ${WEAPON_CATALOG[setting.weaponId].label} row for ${event.label}; the wall runtime consumes this row's cadence, damage, speed, and burst values.`
          : `${WEAPON_CATALOG[setting.weaponId].label} is a secondary authored row for ${event.label}; the wall runtime currently takes numeric tuning from the event's first row.`)
        : (providesNumericTuning
          ? `${WEAPON_CATALOG[setting.weaponId].label} is the primary referenced weapon in ${phasePrimaryCount} phase${phasePrimaryCount === 1 ? '' : 's'} of ${event.label}; the phase runtime applies its cadence, damage, speed, and burst values when that phase is active.`
          : `${WEAPON_CATALOG[setting.weaponId].label} is an authored secondary attack mode for ${event.label}. Active phases enable every referenced weapon mode while their first referenced row supplies numeric projectile tuning.`),
      imagePaths: imagePathsForAsset(event.spriteKey),
      facts: [
        { label: 'Weapon ID', value: setting.weaponId, source: 'campaign' },
        { label: 'Attack interval', value: `${setting.attackIntervalSeconds}s`, source: 'campaign' },
        { label: 'Damage', value: setting.damage, source: 'campaign' },
        { label: 'Projectile speed', value: setting.projectileSpeed, source: 'campaign' },
        { label: 'Burst count', value: setting.burstCount, source: 'campaign' },
        { label: 'Referenced by phases', value: phaseUseCount, source: 'campaign' },
        { label: 'Primary in phases', value: phasePrimaryCount, source: 'campaign' },
        {
          label: 'Current numeric runtime source',
          value: providesNumericTuning
            ? 'this row when its phase (or wall encounter) is active'
            : 'the active phase or wall encounter primary row',
          source: 'runtime'
        }
      ],
      sourceRefs: event.bossId === 'paywall-wall'
        ? [
          campaignRef(context, setting.id),
          { path: 'game-config/catalog.ts', symbol: 'WEAPON_CATALOG', catalogId: setting.weaponId },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.spawnWallBoss' },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.updateWallBoss' }
        ]
        : [
          campaignRef(context, setting.id),
          { path: 'game-config/catalog.ts', symbol: 'WEAPON_CATALOG', catalogId: setting.weaponId },
          { path: 'services/bossPhaseConfig.ts', symbol: 'resolveBossPhaseConfig' },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.applyConfiguredBossPhase' }
        ],
      relatedIds: [`boss:${event.id}`, `weapon:${setting.weaponId}`, `wave:${wave.id}`],
      target: {
        ...targetFromContext(context),
        bossId: event.bossId,
        weaponId: setting.weaponId,
        weaponSettingId: setting.id
      },
      production: event.bossId === 'paywall-wall' ? index === 0 : phaseUseCount > 0
    };
  }),
  ...phaseUses.map(({ level, wave, event, phase }): CombatLabCatalogItem => {
    const context = { level, wave, event };
    return {
      id: `boss-move:phase:${event.id}:${phase.id}`,
      category: 'boss-moves' as const,
      kind: 'boss-phase' as const,
      name: `${event.label} · ${phase.label}`,
      description: event.bossId === 'paywall-wall'
        ? `${phase.label} is an authored health phase for ${event.label}. Paywall wall rows use fixed lane movement plus event-level speed and primary-weapon tuning, so phase movement remains authored-only for that encounter family.`
        : `${phase.label} is a production health phase for ${event.label}. When its threshold is crossed, the runtime applies its movement pattern, speed multiplier, and referenced weapon settings.`,
      imagePaths: imagePathsForAsset(event.spriteKey),
      facts: [
        { label: 'Trigger health', value: `${Math.round(phase.triggerHealthRatio * 100)}%`, source: 'campaign' },
        { label: 'Authored movement', value: MOVEMENT_PATTERN_CATALOG[phase.movementPatternId].label, source: 'campaign' },
        { label: 'Authored speed multiplier', value: `${phase.speedMultiplier}×`, source: 'campaign' },
        { label: 'Authored weapon rows', value: [...phase.weaponSettingIds], source: 'campaign' },
        {
          label: 'Current runtime behavior',
          value: event.bossId === 'paywall-wall'
            ? 'fixed wall movement; focused preview can project phase speed and primary weapon only'
            : 'movement, speed multiplier, and referenced weapons are applied at the threshold',
          source: 'runtime'
        }
      ],
      sourceRefs: event.bossId === 'paywall-wall'
        ? [
          campaignRef(context, phase.id),
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.spawnWallBoss' },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.updateWallBoss' }
        ]
        : [
          campaignRef(context, phase.id),
          { path: 'services/bossPhaseConfig.ts', symbol: 'resolveBossPhaseConfig' },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.applyConfiguredBossPhase' },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.updateBoss' },
          { path: 'services/gameLogic.ts', symbol: 'GameEngine.updateMiniBoss' }
        ],
      relatedIds: [
        `boss:${event.id}`,
        ...phase.weaponSettingIds.map((id) => `boss-move:weapon:${event.id}:${id}`),
        `wave:${wave.id}`
      ],
      target: {
        ...targetFromContext(context),
        bossId: event.bossId,
        phaseId: phase.id
      },
      production: event.bossId !== 'paywall-wall'
    };
  })
];

const createStageWaveItems = (campaign: GameCampaignConfig): CombatLabCatalogItem[] => (
  campaign.levels.flatMap((level) => {
    const firstWave = level.waves[0];
    const stage: CombatLabCatalogItem = {
      id: `stage:${level.id}`,
      category: 'stages-waves',
      kind: 'stage',
      name: level.name,
      description: level.description,
      imagePaths: (BACKGROUND_CATALOG[level.backgroundId]?.layerAssetKeys ?? [])
        .flatMap((key) => imagePathsForAsset(key))
        .slice(0, 4),
      facts: [
        { label: 'Order', value: level.order, source: 'campaign' },
        { label: 'Waves', value: level.waves.length, source: 'campaign' },
        { label: 'Background', value: BACKGROUND_CATALOG[level.backgroundId].label, source: 'campaign' },
        { label: 'Starting difficulty', value: `${level.startingDifficulty}×`, source: 'campaign' },
        { label: 'Loops waves', value: level.loopWaves, source: 'campaign' },
        { label: 'Available power-ups', value: level.availablePowerupIds.map((id) => POWERUP_CATALOG[id].label), source: 'campaign' }
      ],
      sourceRefs: [{ path: 'game-config/campaign.json', levelId: level.id }],
      relatedIds: level.waves.map((wave) => `wave:${wave.id}`),
      target: { levelId: level.id, waveId: firstWave?.id },
      production: true
    };
    const waves: CombatLabCatalogItem[] = level.waves.map((wave) => {
      const bosses = wave.events.filter((event): event is BossEvent => event.kind === 'boss');
      const formations = unique(wave.events
        .filter((event): event is SpawnEvent => event.kind === 'spawn')
        .map((event) => event.patternId));
      return {
        id: `wave:${wave.id}`,
        category: 'stages-waves',
        kind: 'wave',
        name: `${level.name} · ${wave.name}`,
        description: `${wave.name} is production wave ${wave.order}, containing ${wave.events.length} scheduled combat event${wave.events.length === 1 ? '' : 's'}.`,
        imagePaths: bosses.flatMap((event) => imagePathsForAsset(event.spriteKey)).slice(0, 4),
        facts: [
          { label: 'Wave order', value: wave.order, source: 'campaign' },
          { label: 'Active duration', value: `${wave.durationSeconds}s`, source: 'campaign' },
          { label: 'Difficulty', value: `${wave.difficultyMultiplier}×`, source: 'campaign' },
          { label: 'Threat cap', value: wave.threatCap, source: 'campaign' },
          { label: 'Events', value: wave.events.length, source: 'campaign' },
          { label: 'Formations', value: formations.map((id) => SPAWN_PATTERN_CATALOG[id].label), source: 'campaign' },
          { label: 'Bosses', value: bosses.map((event) => event.label), source: 'campaign' }
        ],
        sourceRefs: [{ path: 'game-config/campaign.json', levelId: level.id, waveId: wave.id }],
        relatedIds: [
          `stage:${level.id}`,
          ...formations.map((id) => `formation:${id}`),
          ...bosses.map((event) => `boss:${event.id}`)
        ],
        target: { levelId: level.id, waveId: wave.id },
        production: true
      };
    });
    return [stage, ...waves];
  })
);

const createMainShipItems = (): CombatLabCatalogItem[] => PLAYABLE_PLAYER_SHIP_IDS.map((id) => {
  const ship = PLAYER_SHIPS[id];
  const ability = SHIP_ABILITY_DEFINITIONS[id];
  return {
    id: `main-ship:${id}`,
    category: 'main-ships',
    kind: 'main-ship',
    name: ship.name,
    description: `${ship.name} is a playable production main ship with the ${ability.name} ship ability.`,
    imagePaths: [ship.assetUrl, ...ability.frames],
    facts: [
      { label: 'Ship ID', value: id, source: 'catalog' },
      { label: 'Ability', value: ability.name, source: 'catalog' },
      { label: 'Ability cooldown', value: `${ability.cooldownSeconds}s`, source: 'catalog' },
      { label: 'Upgrade tracks', value: MAIN_SHIP_UPGRADES.map((upgrade) => upgrade.name), source: 'catalog' }
    ],
    sourceRefs: [
      { path: 'services/playerShipService.ts', symbol: 'PLAYER_SHIPS', catalogId: id },
      { path: 'services/shipAbilityService.ts', symbol: 'SHIP_ABILITY_DEFINITIONS', catalogId: ability.id }
    ],
    relatedIds: [`weapon:ship-ability:${ability.id}`],
    target: { playerShipId: id },
    production: true
  };
});

const createMiniShipItems = (): CombatLabCatalogItem[] => MINI_SHIP_CATALOG.map((ship) => ({
  id: `mini-ship:${ship.id}`,
  category: 'mini-ships',
  kind: 'mini-ship',
  name: ship.name,
  description: ship.description,
  imagePaths: [...ship.frames],
  facts: [
    { label: 'Role', value: ship.role, source: 'catalog' },
    { label: 'Ability', value: ship.ability, source: 'catalog' },
    { label: 'Base fire interval', value: `${ship.fireIntervalFrames} frames`, source: 'catalog' },
    { label: 'Base projectile damage', value: ship.projectileDamage, source: 'catalog' },
    { label: 'Maximum level', value: ship.maxLevel, source: 'catalog' }
  ],
  sourceRefs: [{ path: 'services/squadProgression.ts', symbol: 'MINI_SHIP_CATALOG', catalogId: ship.id }],
  relatedIds: [],
  target: { miniShipId: ship.id },
  production: true
}));

const createWeaponItems = (uses: readonly BossWeaponUse[]): CombatLabCatalogItem[] => {
  const bossWeapons = Object.values(WEAPON_CATALOG).map((weapon) => {
    const weaponUses = uses.filter(({ setting }) => setting.weaponId === weapon.id);
    const first = weaponUses[0];
    return {
      id: `weapon:${weapon.id}`,
      category: 'weapons' as const,
      kind: 'weapon' as const,
      name: weapon.label,
      description: `${weapon.label} is an allowlisted boss weapon ID used by ${weaponUses.length} configured weapon row${weaponUses.length === 1 ? '' : 's'}. Numeric cadence and projectile values live on each boss event.`,
      imagePaths: first ? imagePathsForAsset(first.event.spriteKey) : [],
      facts: [
        { label: 'Configured uses', value: weaponUses.length, source: 'campaign' as const },
        { label: 'Attack intervals', value: numericRange(weaponUses.map(({ setting }) => setting.attackIntervalSeconds), 's'), source: 'campaign' as const },
        { label: 'Damage', value: numericRange(weaponUses.map(({ setting }) => setting.damage)), source: 'campaign' as const },
        { label: 'Projectile speed', value: numericRange(weaponUses.map(({ setting }) => setting.projectileSpeed)), source: 'campaign' as const },
        { label: 'Burst count', value: numericRange(weaponUses.map(({ setting }) => setting.burstCount)), source: 'campaign' as const }
      ],
      sourceRefs: [
        { path: 'game-config/catalog.ts', symbol: 'WEAPON_CATALOG', catalogId: weapon.id },
        ...weaponUses.map((use) => campaignRef(use, use.setting.id))
      ],
      relatedIds: weaponUses.map(({ event, setting }) => `boss-move:weapon:${event.id}:${setting.id}`),
      target: {
        ...targetFromContext(first),
        weaponId: weapon.id,
        weaponSettingId: first?.setting.id
      },
      production: weaponUses.length > 0
    } satisfies CombatLabCatalogItem;
  });

  const shipAbilities = PLAYABLE_PLAYER_SHIP_IDS.map((shipId) => {
    const ability = SHIP_ABILITY_DEFINITIONS[shipId];
    return {
      id: `weapon:ship-ability:${ability.id}`,
      category: 'weapons' as const,
      kind: 'weapon' as const,
      name: ability.name,
      description: `${ability.name} is the production ship ability for ${PLAYER_SHIPS[shipId].name}.`,
      imagePaths: [...ability.frames],
      facts: [
        { label: 'Ship', value: PLAYER_SHIPS[shipId].name, source: 'catalog' as const },
        { label: 'Cooldown', value: `${ability.cooldownSeconds}s`, source: 'catalog' as const },
        { label: 'Action', value: ability.actionLabel, source: 'catalog' as const }
      ],
      sourceRefs: [{ path: 'services/shipAbilityService.ts', symbol: 'SHIP_ABILITY_DEFINITIONS', catalogId: shipId }],
      relatedIds: [`main-ship:${shipId}`],
      target: { playerShipId: shipId },
      production: true
    } satisfies CombatLabCatalogItem;
  });
  return [...bossWeapons, ...shipAbilities];
};

const createPowerupItems = (
  campaign: GameCampaignConfig,
  contexts: readonly EventContext[]
): CombatLabCatalogItem[] => Object.values(POWERUP_CATALOG).map((powerup) => {
  const scheduled = contexts.filter((context) => (
    (context.event.kind === 'powerup' || context.event.kind === 'recovery')
    && context.event.powerupIds.includes(powerup.id)
  ));
  const availableLevels = campaign.levels.filter((level) => level.availablePowerupIds.includes(powerup.id));
  const first = scheduled[0];
  return {
    id: `powerup:${powerup.id}`,
    category: 'powerups',
    kind: 'powerup',
    name: powerup.label,
    description: `${powerup.label} maps to the real ${powerup.runtimeType} power-up runtime type. Its catalog weight drives configured multi-pickup event selection; ambient combat drops use runtime-specific weights, and scheduled campaign uses are counted separately.`,
    imagePaths: [],
    facts: [
      { label: 'Runtime type', value: powerup.runtimeType, source: 'catalog' },
      { label: 'Configured-event weight', value: powerup.defaultWeight, source: 'catalog' },
      { label: 'Available in missions', value: availableLevels.length, source: 'campaign' },
      { label: 'Scheduled event uses', value: scheduled.length, source: 'campaign' }
    ],
    sourceRefs: [
      { path: 'game-config/catalog.ts', symbol: 'POWERUP_CATALOG', catalogId: powerup.id },
      { path: 'services/gameLogic.ts', symbol: 'GameEngine.spawnPowerup' },
      ...scheduled.map((context) => campaignRef(context, powerup.id))
    ],
    relatedIds: unique(scheduled.map(({ wave }) => `wave:${wave.id}`)),
    target: {
      ...targetFromContext(first),
      powerupId: powerup.id
    },
    production: availableLevels.length > 0
  };
});

const createSandboxPrototypeAssetItems = (): CombatLabCatalogItem[] => {
  const registrations = Object.values(SANDBOX_BOSS_ARTWORK_REGISTRATIONS)
    .filter((registration): registration is SandboxBossArtworkRegistration => (
      Boolean(registration)
    ));
  const items = registrations.flatMap((registration): CombatLabCatalogItem[] => {
    const prototype = SANDBOX_BOSS_PROTOTYPE_BY_ID[registration.prototypeId];
    const bossLabel = prototype?.label ?? registration.prototypeId;
    const primaryAssetUrls = new Set([
      registration.assembled.url,
      registration.sheet.url,
      ...(registration.modularReferenceComparison
        ? [registration.modularReferenceComparison.url]
        : [])
    ]);
    const primaryItems = ([
      ['assembled', 'Assembled sprite', registration.assembled],
      ['sheet', 'Modular sprite sheet', registration.sheet]
    ] as const).map(([variant, variantLabel, asset]): CombatLabCatalogItem => ({
      id: `prototype-asset:${registration.prototypeId}:${variant}`,
      category: 'effects-assets',
      kind: 'asset',
      name: `${bossLabel} · ${variantLabel}`,
      description: `${variantLabel} generated for the sandbox-only ${bossLabel} test boss. It remains local authoring art and is not a production campaign asset.`,
      imagePaths: [asset.url],
      facts: [
        { label: 'Boss', value: bossLabel, source: 'catalog' },
        { label: 'Variant', value: variantLabel, source: 'catalog' },
        { label: 'Dimensions', value: `${asset.width}×${asset.height}`, source: 'catalog' },
        { label: 'Generated', value: true, source: 'catalog' }
      ],
      sourceRefs: [{
        path: 'director/server/prototypeAssetCatalog.mjs',
        symbol: 'PROTOTYPE_ASSET_DEFINITIONS',
        catalogId: `${registration.prototypeId}:${variant}`
      }],
      relatedIds: [],
      target: {},
      production: false
    }));
    const referenceItems = registration.modularReferenceComparison
      ? [{
          id: `prototype-asset:${registration.prototypeId}:reference`,
          category: 'effects-assets' as const,
          kind: 'asset' as const,
          name: `${bossLabel} Â· Canonical reference`,
          description: `Pinned canonical comparison artwork used to prove the sandbox-only ${bossLabel} modular rig remains cohesive and correctly registered.`,
          imagePaths: [registration.modularReferenceComparison.url],
          facts: [
            { label: 'Boss', value: bossLabel, source: 'catalog' as const },
            { label: 'Variant', value: 'Canonical rig reference', source: 'catalog' as const },
            {
              label: 'Dimensions',
              value: `${registration.modularReferenceComparison.width}Ã—${registration.modularReferenceComparison.height}`,
              source: 'catalog' as const
            },
            { label: 'Generated', value: false, source: 'catalog' as const }
          ],
          sourceRefs: [{
            path: 'director/server/prototypeAssetCatalog.mjs',
            symbol: 'PROTOTYPE_ASSET_DEFINITIONS',
            catalogId: `${registration.prototypeId}:reference`
          }],
          relatedIds: [],
          target: {},
          production: false
        } satisfies CombatLabCatalogItem]
      : [];
    const supplementalAtlasItems = (registration.modularRig?.atlases ?? [])
      .filter((asset) => !primaryAssetUrls.has(asset.url))
      .map((asset, index): CombatLabCatalogItem => {
        const variant = asset.url.match(/\/([^/]+)\.png$/)?.[1]
          ?? `supplemental-atlas-${index + 1}`;
        return {
          id: `prototype-asset:${registration.prototypeId}:${variant}`,
          category: 'effects-assets',
          kind: 'asset',
          name: `${bossLabel} · Supplemental animation atlas`,
          description: `Generated supplemental animation frames used by the sandbox-only ${bossLabel} modular rig. They remain local authoring art and are not a production campaign asset.`,
          imagePaths: [asset.url],
          facts: [
            { label: 'Boss', value: bossLabel, source: 'catalog' },
            { label: 'Variant', value: variant, source: 'catalog' },
            { label: 'Dimensions', value: `${asset.width}×${asset.height}`, source: 'catalog' },
            { label: 'Generated', value: true, source: 'catalog' }
          ],
          sourceRefs: [{
            path: 'director/server/prototypeAssetCatalog.mjs',
            symbol: 'PROTOTYPE_ASSET_DEFINITIONS',
            catalogId: `${registration.prototypeId}:${variant}`
          }],
          relatedIds: [],
          target: {},
          production: false
        };
      });
    return [...primaryItems, ...referenceItems, ...supplementalAtlasItems];
  });

  const sharedVfx = registrations.find((registration) => registration.vfxAtlas)?.vfxAtlas;
  if (sharedVfx) {
    items.push({
      id: 'prototype-asset:sandbox-boss-vfx:sheet',
      category: 'effects-assets',
      kind: 'asset',
      name: 'Sandbox boss projectile and laser VFX sheet',
      description: 'Shared generated pixel-art atlas for boss projectiles, laser warnings, live beams, impacts, pods, and animated hazard sprites.',
      imagePaths: [sharedVfx.url],
      facts: [
        { label: 'Variant', value: 'VFX sprite sheet', source: 'catalog' },
        { label: 'Dimensions', value: `${sharedVfx.width}×${sharedVfx.height}`, source: 'catalog' },
        { label: 'Frames', value: Object.keys(sharedVfx.frames).length, source: 'catalog' },
        { label: 'Generated', value: true, source: 'catalog' }
      ],
      sourceRefs: [{
        path: 'director/server/prototypeAssetCatalog.mjs',
        symbol: 'PROTOTYPE_ASSET_DEFINITIONS',
        catalogId: 'sandbox-boss-vfx:sheet'
      }],
      relatedIds: [],
      target: {},
      production: false
    });
  }
  return items;
};

const createEffectsAssetsItems = (
  campaign: GameCampaignConfig,
  contexts: readonly EventContext[]
): CombatLabCatalogItem[] => {
  const assetRefs = collectAssetRefs(campaign, contexts);
  const effects: CombatLabCatalogItem[] = EFFECT_DESCRIPTORS.map((effect) => ({
    id: `effect:${effect.id}`,
    category: 'effects-assets',
    kind: 'effect',
    name: effect.name,
    description: effect.description,
    imagePaths: [],
    facts: effect.facts,
    sourceRefs: [{ path: 'services/gameLogic.ts', symbol: effect.symbol }],
    relatedIds: [],
    target: { effectId: effect.id },
    production: true
  }));
  const assets: CombatLabCatalogItem[] = Object.values(ASSET_CATALOG).map((asset) => {
    const refs = assetRefs.get(asset.id) ?? [];
    return {
      id: `asset:${asset.id}`,
      category: 'effects-assets',
      kind: 'asset',
      name: asset.label,
      description: `${asset.label} is a role-constrained ${asset.generated ? 'generated' : 'built-in'} runtime asset with ${asset.paths.length} frame${asset.paths.length === 1 ? '' : 's'}.`,
      imagePaths: [...asset.paths],
      facts: [
        { label: 'Asset key', value: asset.id, source: 'catalog' },
        { label: 'Roles', value: [...asset.roles], source: 'catalog' },
        { label: 'Frames', value: asset.paths.length, source: 'catalog' },
        { label: 'Campaign references', value: refs.length, source: 'campaign' },
        { label: 'Generated', value: Boolean(asset.generated), source: 'catalog' }
      ],
      sourceRefs: [
        { path: asset.generated ? 'game-config/generated-assets.json' : 'game-config/catalog.ts', symbol: 'ASSET_CATALOG', catalogId: asset.id },
        ...refs
      ],
      relatedIds: [],
      target: { assetKey: asset.id },
      production: refs.length > 0
    };
  });
  return [...createSandboxPrototypeAssetItems(), ...effects, ...assets];
};

/**
 * Builds the Combat Lab browser from the same campaign and catalogs used by the
 * game. Nothing in this projection is a second gameplay model: items retain
 * source IDs so the UI can ask experimentModel for a real-runtime preview.
 */
export const buildCombatLabCatalog = (campaign: GameCampaignConfig): CombatLabCatalog => {
  const contexts = collectEventContexts(campaign);
  const spawnContexts = contexts.filter((context): context is EventContext<SpawnEvent> => context.event.kind === 'spawn');
  const asteroidContexts = contexts.filter((context): context is EventContext<AsteroidEvent> => context.event.kind === 'asteroid-belt');
  const formationContexts: EventContext<FormationEvent>[] = [...spawnContexts, ...asteroidContexts];
  const bossContexts = contexts.filter((context): context is EventContext<BossEvent> => context.event.kind === 'boss');
  const enemyUses = spawnContexts.flatMap((context) => (
    context.event.enemies.map((setting) => ({ ...context, setting }))
  ));
  const weaponUses = bossContexts.flatMap((context) => (
    context.event.weapons.map((setting, index) => ({ ...context, setting, index }))
  ));
  const phaseUses = bossContexts.flatMap((context) => (
    context.event.phases.map((phase) => ({ ...context, phase }))
  ));

  const formations = createFormationItems(formationContexts);
  const enemies = createEnemyItems(enemyUses);
  const bosses = createBossItems(bossContexts);
  const bossMoves = createBossMoveItems(weaponUses, phaseUses);
  const stagesWaves = createStageWaveItems(campaign);
  const mainShips = createMainShipItems();
  const miniShips = createMiniShipItems();
  const weapons = createWeaponItems(weaponUses);
  const powerups = createPowerupItems(campaign, contexts);
  const effectsAssets = createEffectsAssetsItems(campaign, contexts);

  const itemGroups: Record<CombatLabCategoryId, readonly CombatLabCatalogItem[]> = {
    formations,
    enemies,
    bosses,
    'boss-moves': bossMoves,
    'stages-waves': stagesWaves,
    'main-ships': mainShips,
    'mini-ships': miniShips,
    weapons,
    powerups,
    'effects-assets': effectsAssets
  };
  const categories = COMBAT_LAB_CATEGORY_IDS.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    items: itemGroups[id]
  }));
  const allItems = categories.flatMap((category) => category.items);
  const byId = Object.fromEntries(allItems.map((item) => [item.id, item]));
  if (Object.keys(byId).length !== allItems.length) {
    throw new Error('Combat Lab catalog generated duplicate item IDs');
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      revision: campaign.revision,
      updatedAt: campaign.updatedAt
    },
    formations,
    enemies,
    bosses,
    bossMoves,
    stagesWaves,
    mainShips,
    miniShips,
    weapons,
    powerups,
    effectsAssets,
    categories,
    allItems,
    byId,
    summary: Object.fromEntries(categories.map((category) => [category.id, category.items.length])) as Record<CombatLabCategoryId, number>
  };
};

export const buildCombatLabContentCatalog = buildCombatLabCatalog;
