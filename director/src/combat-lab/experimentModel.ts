import {
  ENEMY_CATALOG,
  POWERUP_CATALOG,
  SPAWN_PATTERN_CATALOG,
  isMajorBossId
} from '@game/game-config/catalog';
import type {
  AsteroidEvent,
  BossEvent,
  BossHealthPhase,
  BossWeaponSetting,
  EnemyId,
  GameCampaignConfig,
  LevelDefinition,
  PowerupEvent,
  PowerupId,
  SpawnEvent,
  SpawnPatternId,
  WaveDefinition,
  WaveEvent
} from '@game/game-config/types';
import { assertValidGameCampaign, migrateLegacyWaveCompletionRule } from '@game/game-config/validate';
import {
  PLAYABLE_PLAYER_SHIP_IDS,
  type PlayerShipId
} from '@game/services/playerShipService';
import {
  MINI_SHIP_BY_ID,
  MINI_SHIP_MAX_LEVEL,
  buildRuntimeSquadLoadout as buildProductionRuntimeSquadLoadout,
  createWeeklySquadState,
  getMainShipUpgradeMaxLevel,
  type MainShipUpgradeId,
  type MainShipUpgradeLevels,
  type MiniShipId,
  type RuntimeSquadLoadout,
  type SquadSlotId
} from '@game/services/squadProgression';

export const COMBAT_LAB_PRESET_SCHEMA_VERSION = 1 as const;

export type CombatLabFocus =
  | { kind: 'wave'; levelId: string; waveId: string }
  | { kind: 'event'; levelId?: string; waveId?: string; eventId: string }
  | { kind: 'formation'; patternId: SpawnPatternId; levelId?: string; waveId?: string; eventId?: string }
  | { kind: 'enemy'; enemyId: EnemyId; levelId?: string; waveId?: string; eventId?: string }
  | { kind: 'boss'; eventId: string; levelId?: string; waveId?: string }
  | { kind: 'boss-weapon'; eventId: string; weaponSettingId: string; levelId?: string; waveId?: string }
  | { kind: 'boss-phase'; eventId: string; phaseId: string; levelId?: string; waveId?: string }
  | { kind: 'powerup'; powerupId: PowerupId; levelId?: string; waveId?: string; eventId?: string };

export interface CombatLabPreviewResult {
  campaign: GameCampaignConfig;
  focus: CombatLabFocus;
  levelId: string;
  waveId: string;
  eventId?: string;
  previewWave: WaveDefinition;
  limitations: readonly string[];
}

export interface CombatLabLoadoutCompanionSelection {
  slot: SquadSlotId;
  miniShipId: MiniShipId;
  level: number;
}

export interface CombatLabLoadoutSelection {
  mainShipId: PlayerShipId;
  upgrades?: Partial<MainShipUpgradeLevels>;
  companions?: readonly CombatLabLoadoutCompanionSelection[];
}

export interface CombatLabPresetSource {
  campaignId: string;
  campaignRevision: number;
  levelId: string;
  waveId: string;
  eventId?: string;
  contentHash?: string;
}

export interface CombatLabPresetEnvelope {
  schemaVersion: typeof COMBAT_LAB_PRESET_SCHEMA_VERSION;
  status: 'test-preset';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: CombatLabPresetSource;
  focus: CombatLabFocus;
  previewWave: WaveDefinition;
  loadout?: CombatLabLoadoutSelection;
}

export interface CreateCombatLabPresetInput {
  name: string;
  sourceCampaign: GameCampaignConfig;
  preview: CombatLabPreviewResult;
  loadout?: CombatLabLoadoutSelection;
  contentHash?: string;
}

export interface CombatLabModelOptions {
  now?: () => Date | string;
  idFactory?: (prefix: string, attempt: number) => string;
}

export type CombatLabPromotionInput =
  | {
    kind: 'wave';
    targetLevelId: string;
    wave: WaveDefinition;
    insertAfterWaveId?: string;
  }
  | {
    kind: 'event';
    targetLevelId: string;
    targetWaveId: string;
    event: WaveEvent;
    startSeconds?: number;
  };

export interface CombatLabPromotionResult {
  campaign: GameCampaignConfig;
  idMap: Readonly<Record<string, string>>;
  insertedWaveId?: string;
  insertedEventId?: string;
  warnings: readonly string[];
}

interface LocatedWave {
  level: LevelDefinition;
  wave: WaveDefinition;
}

interface LocatedEvent extends LocatedWave {
  event: WaveEvent;
}

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAYER_SHIP_IDS = new Set<string>(PLAYABLE_PLAYER_SHIP_IDS);
const MAIN_SHIP_UPGRADE_IDS: readonly MainShipUpgradeId[] = ['fireRate', 'speed', 'startingHearts'];

const clone = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const toIsoString = (options: CombatLabModelOptions): string => {
  const value = options.now?.() ?? new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Combat Lab received an invalid timestamp');
  return date.toISOString();
};

const sanitizeId = (value: string, fallback: string): string => {
  const safe = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return safe || fallback;
};

const collectIds = (campaign: GameCampaignConfig): Set<string> => {
  const ids = new Set<string>([campaign.id]);
  for (const level of campaign.levels) {
    ids.add(level.id);
    for (const wave of level.waves) {
      ids.add(wave.id);
      for (const event of wave.events) {
        ids.add(event.id);
        if (event.kind !== 'boss') continue;
        event.weapons.forEach((weapon) => ids.add(weapon.id));
        event.phases.forEach((phase) => ids.add(phase.id));
      }
    }
  }
  return ids;
};

const createUniqueIdAllocator = (
  reserved: Set<string>,
  options: CombatLabModelOptions
) => (prefix: string): string => {
  const base = sanitizeId(prefix, 'combat-lab-item');
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidateSource = options.idFactory?.(base, attempt)
      ?? (attempt === 0 ? `${base}-lab` : `${base}-lab-${attempt + 1}`);
    const candidate = sanitizeId(candidateSource, `${base}-lab-${attempt + 1}`);
    if (!reserved.has(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Unable to allocate a unique Combat Lab ID for ${prefix}`);
};

const findWave = (
  campaign: GameCampaignConfig,
  levelId: string,
  waveId: string
): LocatedWave => {
  const level = campaign.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error(`Unknown Combat Lab source level: ${levelId}`);
  const wave = level.waves.find((candidate) => candidate.id === waveId);
  if (!wave) throw new Error(`Unknown Combat Lab source wave: ${waveId}`);
  return { level, wave };
};

const findEvent = (
  campaign: GameCampaignConfig,
  eventId: string,
  levelId?: string,
  waveId?: string
): LocatedEvent => {
  for (const level of campaign.levels) {
    if (levelId && level.id !== levelId) continue;
    for (const wave of level.waves) {
      if (waveId && wave.id !== waveId) continue;
      const event = wave.events.find((candidate) => candidate.id === eventId);
      if (event) return { level, wave, event };
    }
  }
  throw new Error(`Unknown Combat Lab source event: ${eventId}`);
};

const findOptionalEventByPredicate = (
  campaign: GameCampaignConfig,
  predicate: (event: WaveEvent) => boolean,
  hints: { levelId?: string; waveId?: string; eventId?: string }
): LocatedEvent | undefined => {
  if (hints.eventId) {
    const located = findEvent(campaign, hints.eventId, hints.levelId, hints.waveId);
    return predicate(located.event) ? located : undefined;
  }
  for (const level of campaign.levels) {
    if (hints.levelId && level.id !== hints.levelId) continue;
    for (const wave of level.waves) {
      if (hints.waveId && wave.id !== hints.waveId) continue;
      const event = wave.events.find(predicate);
      if (event) return { level, wave, event };
    }
  }
  return undefined;
};

const findHostWave = (
  campaign: GameCampaignConfig,
  hints: { levelId?: string; waveId?: string; eventId?: string }
): LocatedWave => {
  if (hints.eventId) {
    const { level, wave } = findEvent(campaign, hints.eventId, hints.levelId, hints.waveId);
    return { level, wave };
  }
  if (hints.levelId && hints.waveId) return findWave(campaign, hints.levelId, hints.waveId);
  for (const level of campaign.levels) {
    if (hints.levelId && level.id !== hints.levelId) continue;
    const wave = hints.waveId
      ? level.waves.find((candidate) => candidate.id === hints.waveId)
      : level.waves[0];
    if (wave) return { level, wave };
  }
  throw new Error('The Combat Lab campaign does not contain a wave that can host this focus');
};

const allocateSyntheticEventId = (campaign: GameCampaignConfig, prefix: string): string => (
  createUniqueIdAllocator(collectIds(campaign), {})(`combat-lab-${prefix}`)
);

const createSyntheticSpawnEvent = (
  campaign: GameCampaignConfig,
  patternId: SpawnPatternId,
  enemyId: EnemyId = 'drone'
): SpawnEvent => {
  const enemy = ENEMY_CATALOG[enemyId];
  return {
    id: allocateSyntheticEventId(campaign, `${patternId}-${enemyId}`),
    kind: 'spawn',
    label: `Combat Lab ${patternId} ${enemyId} preview`,
    startSeconds: 0,
    durationSeconds: 8,
    delayAfterSeconds: 0,
    blocksWaveClock: false,
    count: 8,
    patternId,
    positionId: patternId === 'asteroid-lanes' ? 'lane-top' : 'formation-top',
    spawnIntervalSeconds: 0.45,
    enemies: [{
      enemyId,
      spriteKey: enemy.defaultSpriteKey,
      weight: 1,
      health: enemy.baseHealth,
      speed: enemy.baseSpeed,
      damage: enemy.baseDamage,
      scoreValue: enemy.baseScoreValue,
      powerupDropChance: enemy.basePowerupDropChance
    }]
  };
};

const createSyntheticAsteroidEvent = (
  campaign: GameCampaignConfig
): AsteroidEvent => ({
  id: allocateSyntheticEventId(campaign, 'asteroid-lanes'),
  kind: 'asteroid-belt',
  label: 'Combat Lab asteroid lanes preview',
  startSeconds: 0,
  durationSeconds: 8,
  delayAfterSeconds: 0,
  blocksWaveClock: false,
  spriteKey: 'ASTEROID_BELT_FRAMES',
  count: 14,
  density: 0.72,
  patternId: 'asteroid-lanes',
  positionId: 'lane-top',
  spawnIntervalSeconds: 0.35,
  warningSeconds: 1,
  health: 2,
  speed: 2.5,
  damage: 1,
  scoreValue: 10,
  powerupDropChance: 0
});

const createSyntheticPowerupEvent = (
  campaign: GameCampaignConfig,
  powerupId: PowerupId
): PowerupEvent => ({
  id: allocateSyntheticEventId(campaign, `${powerupId}-powerup`),
  kind: 'powerup',
  label: `Combat Lab ${powerupId} preview`,
  startSeconds: 0,
  durationSeconds: 3,
  delayAfterSeconds: 0,
  blocksWaveClock: false,
  positionId: 'center-top',
  spawnIntervalSeconds: 1,
  powerupIds: [powerupId]
});

const eventFitsWave = (event: WaveEvent): number => (
  event.blocksWaveClock ? event.startSeconds : event.startSeconds + event.durationSeconds
);

const normalizeFocusedEventTiming = (event: WaveEvent): WaveEvent => ({
  ...event,
  startSeconds: 0,
  delayAfterSeconds: 0
});

const replaceWave = (
  campaign: GameCampaignConfig,
  levelId: string,
  waveId: string,
  replacement: WaveDefinition
): GameCampaignConfig => {
  const next = clone(campaign);
  const level = next.levels.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error(`Unknown Combat Lab source level: ${levelId}`);
  const index = level.waves.findIndex((candidate) => candidate.id === waveId);
  if (index < 0) throw new Error(`Unknown Combat Lab source wave: ${waveId}`);
  level.waves[index] = clone(replacement);
  return next;
};

const validatePreviewInSourceContext = (
  campaign: GameCampaignConfig,
  levelId: string,
  waveId: string,
  previewWave: WaveDefinition
) => {
  const validationCampaign = replaceWave(campaign, levelId, waveId, previewWave);
  const owningLevel = validationCampaign.levels.find((level) => level.id === levelId);
  if (!owningLevel) throw new Error(`Unknown Combat Lab source level: ${levelId}`);
  for (const event of previewWave.events) {
    if (event.kind !== 'powerup' && event.kind !== 'recovery') continue;
    for (const powerupId of event.powerupIds) {
      if (!owningLevel.availablePowerupIds.includes(powerupId)) {
        owningLevel.availablePowerupIds.push(powerupId);
      }
    }
  }
  assertValidGameCampaign(validationCampaign);
};

const focusBossWeapon = (
  event: BossEvent,
  weaponSettingId: string
): BossEvent => {
  const weapon = event.weapons.find((candidate) => candidate.id === weaponSettingId);
  if (!weapon) throw new Error(`Unknown boss weapon setting: ${weaponSettingId}`);
  return {
    ...event,
    weapons: [clone(weapon)],
    phases: event.phases.map((phase) => ({
      ...phase,
      weaponSettingIds: [weapon.id]
    }))
  };
};

const focusBossPhase = (
  event: BossEvent,
  phaseId: string
): BossEvent => {
  const phase = event.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`Unknown boss phase: ${phaseId}`);
  const phaseWeaponIds = phase.weaponSettingIds.length > 0
    ? phase.weaponSettingIds
    : [event.weapons[0]?.id].filter((id): id is string => Boolean(id));
  const weapons = event.weapons.filter((weapon) => phaseWeaponIds.includes(weapon.id));
  if (weapons.length === 0) throw new Error(`Boss phase ${phaseId} has no usable weapon settings`);
  const remappedWeaponIds = weapons.map((weapon) => weapon.id);
  const focusedPhase = {
    ...clone(phase),
    triggerHealthRatio: 1,
    weaponSettingIds: remappedWeaponIds
  };
  if (event.bossId === 'paywall-wall') {
    return {
      ...event,
      movementPatternId: phase.movementPatternId,
      speed: event.speed * phase.speedMultiplier,
      weapons: clone(weapons),
      phases: [{ ...focusedPhase, speedMultiplier: 1 }]
    };
  }
  return {
    ...event,
    weapons: clone(weapons),
    phases: [focusedPhase]
  };
};

/**
 * Produces a validated full campaign for the real GameStage/GameCanvas path.
 * The selected wave keeps its source level/wave/event IDs; all other campaign
 * context remains present so stage-specific encounter rigs keep working.
 */
export const createFocusedPreviewCampaign = (
  sourceCampaign: GameCampaignConfig,
  focus: CombatLabFocus
): CombatLabPreviewResult => {
  assertValidGameCampaign(sourceCampaign);
  const limitations: string[] = [];
  let located: LocatedWave;
  let previewWave: WaveDefinition;
  let eventId: string | undefined;

  if (focus.kind === 'wave') {
    located = findWave(sourceCampaign, focus.levelId, focus.waveId);
    previewWave = clone(located.wave);
  } else {
    let locatedEvent: LocatedEvent;
    let focusedEvent: WaveEvent;

    if (focus.kind === 'event' || focus.kind === 'boss') {
      locatedEvent = findEvent(sourceCampaign, focus.eventId, focus.levelId, focus.waveId);
      if (focus.kind === 'boss' && locatedEvent.event.kind !== 'boss') {
        throw new Error(`Combat Lab event ${focus.eventId} is not a boss`);
      }
      focusedEvent = clone(locatedEvent.event);
    } else if (focus.kind === 'boss-weapon') {
      locatedEvent = findEvent(sourceCampaign, focus.eventId, focus.levelId, focus.waveId);
      if (locatedEvent.event.kind !== 'boss') throw new Error(`Combat Lab event ${focus.eventId} is not a boss`);
      focusedEvent = focusBossWeapon(locatedEvent.event, focus.weaponSettingId);
      limitations.push('The focused weapon is intentionally made the sole active weapon in every phase; the source encounter may combine it with other phase weapon modes.');
    } else if (focus.kind === 'boss-phase') {
      locatedEvent = findEvent(sourceCampaign, focus.eventId, focus.levelId, focus.waveId);
      if (locatedEvent.event.kind !== 'boss') throw new Error(`Combat Lab event ${focus.eventId} is not a boss`);
      focusedEvent = focusBossPhase(locatedEvent.event, focus.phaseId);
      if (locatedEvent.event.bossId === 'paywall-wall') {
        limitations.push('Paywall wall rows use fixed lane movement, so this focused preview projects the selected phase speed and primary weapon onto event-level settings; its authored phase movement is not representable by the current wall runtime.');
      }
    } else if (focus.kind === 'enemy') {
      const productionUse = findOptionalEventByPredicate(sourceCampaign, (event) => (
        event.kind === 'spawn' && event.enemies.some((enemy) => enemy.enemyId === focus.enemyId)
      ), focus);
      if (productionUse) {
        locatedEvent = productionUse;
        const spawn = locatedEvent.event as SpawnEvent;
        const enemy = spawn.enemies.find((candidate) => candidate.enemyId === focus.enemyId);
        if (!enemy) throw new Error(`Unknown configured enemy: ${focus.enemyId}`);
        focusedEvent = {
          ...clone(spawn),
          enemies: [{ ...clone(enemy), weight: 1 }]
        };
      } else {
        const host = findHostWave(sourceCampaign, focus);
        focusedEvent = createSyntheticSpawnEvent(sourceCampaign, 'single-random', focus.enemyId);
        locatedEvent = { ...host, event: focusedEvent };
      }
    } else if (focus.kind === 'formation') {
      const productionUse = findOptionalEventByPredicate(sourceCampaign, (event) => (
        (event.kind === 'spawn' || event.kind === 'asteroid-belt')
        && event.patternId === focus.patternId
      ), focus);
      if (productionUse) {
        locatedEvent = productionUse;
        focusedEvent = clone(locatedEvent.event);
      } else {
        const host = findHostWave(sourceCampaign, focus);
        focusedEvent = focus.patternId === 'asteroid-lanes'
          ? createSyntheticAsteroidEvent(sourceCampaign)
          : createSyntheticSpawnEvent(sourceCampaign, focus.patternId);
        locatedEvent = { ...host, event: focusedEvent };
      }
    } else {
      if (focus.kind !== 'powerup') throw new Error('Unsupported Combat Lab focus');
      const productionUse = findOptionalEventByPredicate(sourceCampaign, (event) => (
        (event.kind === 'powerup' || event.kind === 'recovery')
        && event.powerupIds.includes(focus.powerupId)
      ), focus);
      if (productionUse) {
        locatedEvent = productionUse;
        if (locatedEvent.event.kind !== 'powerup' && locatedEvent.event.kind !== 'recovery') {
          throw new Error('Combat Lab power-up focus requires a pickup event');
        }
        focusedEvent = {
          ...clone(locatedEvent.event),
          powerupIds: [focus.powerupId]
        };
      } else {
        const reusablePickup = findOptionalEventByPredicate(sourceCampaign, (event) => (
          event.kind === 'powerup' || event.kind === 'recovery'
        ), focus);
        const host = reusablePickup ?? findHostWave(sourceCampaign, focus);
        focusedEvent = createSyntheticPowerupEvent(sourceCampaign, focus.powerupId);
        locatedEvent = { level: host.level, wave: host.wave, event: focusedEvent };
      }
    }

    focusedEvent = normalizeFocusedEventTiming(focusedEvent);
    located = locatedEvent;
    eventId = focusedEvent.id;
    previewWave = {
      ...clone(located.wave),
      completionRule: focusedEvent.kind === 'boss' && isMajorBossId(focusedEvent.bossId)
        ? 'boss-defeat'
        : 'clear-after-duration',
      introSeconds: 0,
      delayAfterSeconds: 0,
      durationSeconds: Math.max(located.wave.durationSeconds, eventFitsWave(focusedEvent)),
      events: [focusedEvent]
    };
  }

  const campaign = replaceWave(sourceCampaign, located.level.id, located.wave.id, previewWave);
  const previewLevel = campaign.levels.find((level) => level.id === located.level.id);
  if (!previewLevel) throw new Error(`Unknown Combat Lab source level: ${located.level.id}`);
  for (const event of previewWave.events) {
    if (event.kind !== 'powerup' && event.kind !== 'recovery') continue;
    for (const powerupId of event.powerupIds) {
      if (!previewLevel.availablePowerupIds.includes(powerupId)) previewLevel.availablePowerupIds.push(powerupId);
    }
  }
  assertValidGameCampaign(campaign);

  const campaignPreviewWave = previewLevel.waves.find((wave) => wave.id === located.wave.id);
  if (!campaignPreviewWave) throw new Error(`Unknown Combat Lab source wave: ${located.wave.id}`);
  return {
    campaign,
    focus: clone(focus),
    levelId: located.level.id,
    waveId: located.wave.id,
    eventId,
    previewWave: clone(campaignPreviewWave),
    limitations
  };
};

const remapBossInternals = (
  event: BossEvent,
  allocate: (prefix: string) => string,
  idMap: Record<string, string>
): BossEvent => {
  const weaponIdMap = Object.fromEntries(event.weapons.map((weapon) => {
    const id = allocate(weapon.id);
    idMap[weapon.id] = id;
    return [weapon.id, id];
  }));
  const weapons: BossWeaponSetting[] = event.weapons.map((weapon) => ({
    ...clone(weapon),
    id: weaponIdMap[weapon.id]
  }));
  const phaseIdMap = Object.fromEntries(event.phases.map((phase) => {
    const id = allocate(phase.id);
    idMap[phase.id] = id;
    return [phase.id, id];
  }));
  const phases: BossHealthPhase[] = event.phases.map((phase) => {
    return {
      ...clone(phase),
      id: phaseIdMap[phase.id],
      weaponSettingIds: phase.weaponSettingIds.map((weaponId) => {
        const mapped = weaponIdMap[weaponId];
        if (!mapped) throw new Error(`Boss phase ${phase.id} references unknown weapon setting ${weaponId}`);
        return mapped;
      })
    };
  });
  const timelineAttackIds = new Set(event.timeline?.attacks?.map((attack) => attack.id) ?? []);
  const timelineClipIdMap = Object.fromEntries((event.timeline?.clips ?? []).map((clip) => {
    let id = allocate(clip.id);
    while (timelineAttackIds.has(id)) id = allocate(`${clip.id}-clip`);
    idMap[clip.id] = id;
    return [clip.id, id];
  }));
  const timeline = event.timeline ? {
    ...clone(event.timeline),
    clips: event.timeline.clips.map((clip) => ({
      ...clone(clip),
      id: timelineClipIdMap[clip.id],
      phaseId: clip.phaseId ? phaseIdMap[clip.phaseId] : undefined,
      telegraphClipId: clip.telegraphClipId
        ? timelineClipIdMap[clip.telegraphClipId]
      : undefined
    })),
    ...(event.timeline.attacks ? {
      attacks: event.timeline.attacks.map((attack) => ({
        ...clone(attack),
        variants: attack.variants.map((variant) => ({
          ...clone(variant),
          phaseId: phaseIdMap[variant.phaseId],
          beatClipIds: variant.beatClipIds.map((clipId) => timelineClipIdMap[clipId]),
          recoveryClipId: timelineClipIdMap[variant.recoveryClipId]
        }))
      }))
    } : {})
  } : undefined;
  const revival = event.revival ? {
    ...clone(event.revival),
    phaseId: phaseIdMap[event.revival.phaseId]
  } : undefined;
  return { ...clone(event), weapons, phases, revival, timeline };
};

const remapEvent = (
  source: WaveEvent,
  allocate: (prefix: string) => string,
  idMap: Record<string, string>
): WaveEvent => {
  const id = allocate(source.id);
  idMap[source.id] = id;
  const event = source.kind === 'boss'
    ? remapBossInternals(source, allocate, idMap)
    : clone(source);
  return { ...event, id };
};

const reindexWaves = (level: LevelDefinition) => {
  level.waves.forEach((wave, index) => {
    wave.order = index + 1;
  });
};

/**
 * Atomically inserts a cloned experiment into a cloned full campaign. IDs for
 * the inserted wave/event and nested boss rows are always remapped before the
 * final campaign is validated.
 */
export const createPromotionCampaign = (
  sourceCampaign: GameCampaignConfig,
  input: CombatLabPromotionInput,
  options: CombatLabModelOptions = {}
): CombatLabPromotionResult => {
  assertValidGameCampaign(sourceCampaign);
  const campaign = clone(sourceCampaign);
  const targetLevel = campaign.levels.find((level) => level.id === input.targetLevelId);
  if (!targetLevel) throw new Error(`Unknown Combat Lab promotion level: ${input.targetLevelId}`);
  const idMap: Record<string, string> = {};
  const allocate = createUniqueIdAllocator(collectIds(campaign), options);
  const warnings: string[] = [];
  let insertedWaveId: string | undefined;
  let insertedEventId: string | undefined;

  if (input.kind === 'wave') {
    const sourceWave = clone(input.wave);
    insertedWaveId = allocate(sourceWave.id);
    idMap[sourceWave.id] = insertedWaveId;
    const promotedWave: WaveDefinition = {
      ...sourceWave,
      id: insertedWaveId,
      events: sourceWave.events.map((event) => remapEvent(event, allocate, idMap))
    };
    const afterIndex = input.insertAfterWaveId === undefined
      ? targetLevel.waves.length - 1
      : targetLevel.waves.findIndex((wave) => wave.id === input.insertAfterWaveId);
    if (input.insertAfterWaveId !== undefined && afterIndex < 0) {
      throw new Error(`Unknown Combat Lab insertion wave: ${input.insertAfterWaveId}`);
    }
    targetLevel.waves.splice(afterIndex + 1, 0, promotedWave);
    for (const event of promotedWave.events) {
      if (event.kind !== 'powerup' && event.kind !== 'recovery') continue;
      for (const powerupId of event.powerupIds) {
        if (!targetLevel.availablePowerupIds.includes(powerupId)) targetLevel.availablePowerupIds.push(powerupId);
      }
    }
    reindexWaves(targetLevel);
  } else {
    const targetWave = targetLevel.waves.find((wave) => wave.id === input.targetWaveId);
    if (!targetWave) throw new Error(`Unknown Combat Lab promotion wave: ${input.targetWaveId}`);
    const promotedEvent = remapEvent(input.event, allocate, idMap);
    insertedEventId = promotedEvent.id;
    if (input.startSeconds !== undefined) {
      promotedEvent.startSeconds = Math.max(0, Math.min(3600, input.startSeconds));
    }
    if (!promotedEvent.blocksWaveClock) {
      targetWave.durationSeconds = Math.max(targetWave.durationSeconds, eventFitsWave(promotedEvent));
    } else {
      targetWave.durationSeconds = Math.max(targetWave.durationSeconds, promotedEvent.startSeconds);
    }
    targetWave.events.push(promotedEvent);
    targetWave.events.sort((left, right) => left.startSeconds - right.startSeconds);
    if (promotedEvent.kind === 'powerup' || promotedEvent.kind === 'recovery') {
      for (const powerupId of promotedEvent.powerupIds) {
        if (!targetLevel.availablePowerupIds.includes(powerupId)) targetLevel.availablePowerupIds.push(powerupId);
      }
    }
  }

  campaign.levels.forEach((level, index) => {
    level.order = index + 1;
  });
  const promotedBosses = input.kind === 'wave'
    ? input.wave.events.filter((event): event is BossEvent => event.kind === 'boss')
    : input.event.kind === 'boss' ? [input.event] : [];
  if (promotedBosses.some((boss) => isMajorBossId(boss.bossId) && !boss.rigId)) {
    warnings.push('This promoted major boss does not declare rigId, so the runtime will use its compatibility fallback; select an explicit renderer rig before release.');
  }
  campaign.revision += 1;
  campaign.updatedAt = toIsoString(options);
  assertValidGameCampaign(campaign);
  return { campaign, idMap, insertedWaveId, insertedEventId, warnings };
};

export const promoteExperimentIntoCampaign = createPromotionCampaign;

/** Uses the production progression formulas without writing weekly/player state. */
export const buildCombatLabRuntimeSquadLoadout = (
  selection: CombatLabLoadoutSelection
): RuntimeSquadLoadout => {
  if (!PLAYER_SHIP_IDS.has(selection.mainShipId)) {
    throw new Error(`Unknown Combat Lab main ship: ${String(selection.mainShipId)}`);
  }
  const companions = selection.companions ?? [];
  if (new Set(companions.map((companion) => companion.slot)).size !== companions.length) {
    throw new Error('Combat Lab loadout cannot equip more than one mini-ship in a slot');
  }
  if (new Set(companions.map((companion) => companion.miniShipId)).size !== companions.length) {
    throw new Error('Combat Lab loadout cannot equip one mini-ship in both slots');
  }

  const state = createWeeklySquadState(undefined, 'combat-lab');
  state.profileId = 'combat-lab';
  state.shipUpgrades[selection.mainShipId] = Object.fromEntries(
    MAIN_SHIP_UPGRADE_IDS.map((id) => [
      id,
      Math.max(0, Math.min(
        getMainShipUpgradeMaxLevel(id),
        Math.floor(Number(selection.upgrades?.[id]) || 0)
      ))
    ])
  ) as MainShipUpgradeLevels;

  for (const companion of companions) {
    if (companion.slot !== 'left' && companion.slot !== 'right') {
      throw new Error(`Unknown Combat Lab squad slot: ${String(companion.slot)}`);
    }
    if (!Object.hasOwn(MINI_SHIP_BY_ID, companion.miniShipId)) {
      throw new Error(`Unknown Combat Lab mini-ship: ${String(companion.miniShipId)}`);
    }
    const level = Math.max(1, Math.min(MINI_SHIP_MAX_LEVEL, Math.floor(Number(companion.level) || 1)));
    state.unlockedSlots[companion.slot] = true;
    state.ownedMiniShips[companion.miniShipId] = level;
    state.equipped[companion.slot] = companion.miniShipId;
  }
  return buildProductionRuntimeSquadLoadout(state, selection.mainShipId);
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const requirePresetString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Combat Lab preset requires ${field}`);
  return value;
};

const assertFocusShape = (value: Record<string, unknown>) => {
  const kind = requirePresetString(value.kind, 'focus.kind');
  for (const hint of ['levelId', 'waveId', 'eventId'] as const) {
    if (value[hint] !== undefined) requirePresetString(value[hint], `focus.${hint}`);
  }
  if (kind === 'wave') {
    requirePresetString(value.levelId, 'focus.levelId');
    requirePresetString(value.waveId, 'focus.waveId');
  } else if (kind === 'event' || kind === 'boss') {
    requirePresetString(value.eventId, 'focus.eventId');
  } else if (kind === 'formation') {
    const id = requirePresetString(value.patternId, 'focus.patternId');
    if (!Object.hasOwn(SPAWN_PATTERN_CATALOG, id)) throw new Error(`Unknown Combat Lab formation focus: ${id}`);
  } else if (kind === 'enemy') {
    const id = requirePresetString(value.enemyId, 'focus.enemyId');
    if (!Object.hasOwn(ENEMY_CATALOG, id)) throw new Error(`Unknown Combat Lab enemy focus: ${id}`);
  } else if (kind === 'boss-weapon') {
    requirePresetString(value.eventId, 'focus.eventId');
    requirePresetString(value.weaponSettingId, 'focus.weaponSettingId');
  } else if (kind === 'boss-phase') {
    requirePresetString(value.eventId, 'focus.eventId');
    requirePresetString(value.phaseId, 'focus.phaseId');
  } else if (kind === 'powerup') {
    const id = requirePresetString(value.powerupId, 'focus.powerupId');
    if (!Object.hasOwn(POWERUP_CATALOG, id)) throw new Error(`Unknown Combat Lab power-up focus: ${id}`);
  } else {
    throw new Error(`Unsupported Combat Lab preset focus: ${kind}`);
  }
};

const assertPresetShape: (value: unknown) => asserts value is CombatLabPresetEnvelope = (value) => {
  if (!isObject(value)) throw new Error('Combat Lab preset must be an object');
  if (value.schemaVersion !== COMBAT_LAB_PRESET_SCHEMA_VERSION) {
    throw new Error(`Unsupported Combat Lab preset schema: ${String(value.schemaVersion)}`);
  }
  if (value.status !== 'test-preset') throw new Error('Combat Lab presets must remain marked as test-preset');
  for (const key of ['id', 'name', 'createdAt', 'updatedAt'] as const) requirePresetString(value[key], key);
  if (!SAFE_ID.test(value.id as string)) throw new Error('Combat Lab preset ID is invalid');
  if (!Number.isFinite(new Date(value.createdAt as string).getTime()) || !Number.isFinite(new Date(value.updatedAt as string).getTime())) {
    throw new Error('Combat Lab preset timestamps must be valid ISO-compatible dates');
  }
  if (!isObject(value.source) || !isObject(value.focus) || !isObject(value.previewWave)) {
    throw new Error('Combat Lab preset is missing source, focus, or preview wave data');
  }
  if (typeof value.source.campaignId !== 'string' || typeof value.source.campaignRevision !== 'number'
    || typeof value.source.levelId !== 'string' || typeof value.source.waveId !== 'string') {
    throw new Error('Combat Lab preset source metadata is invalid');
  }
  if (!Number.isInteger(value.source.campaignRevision) || value.source.campaignRevision < 1) {
    throw new Error('Combat Lab preset campaign revision is invalid');
  }
  if (value.source.eventId !== undefined) requirePresetString(value.source.eventId, 'source.eventId');
  if (value.source.contentHash !== undefined) requirePresetString(value.source.contentHash, 'source.contentHash');
  assertFocusShape(value.focus);
  if (typeof value.previewWave.id !== 'string' || value.previewWave.id !== value.source.waveId
    || !Array.isArray(value.previewWave.events)) {
    throw new Error('Combat Lab preset preview wave does not match its source metadata');
  }
};

export const createCombatLabPreset = (
  input: CreateCombatLabPresetInput,
  options: CombatLabModelOptions = {}
): CombatLabPresetEnvelope => {
  const name = input.name.trim();
  if (!name) throw new Error('Combat Lab preset name is required');
  if (input.preview.campaign === input.sourceCampaign) {
    throw new Error('Combat Lab preview campaign must be an isolated clone');
  }
  validatePreviewInSourceContext(
    input.sourceCampaign,
    input.preview.levelId,
    input.preview.waveId,
    input.preview.previewWave
  );
  if (input.loadout) buildCombatLabRuntimeSquadLoadout(input.loadout);
  const timestamp = toIsoString(options);
  const allocate = createUniqueIdAllocator(new Set(), options);
  const preset: CombatLabPresetEnvelope = {
    schemaVersion: COMBAT_LAB_PRESET_SCHEMA_VERSION,
    status: 'test-preset',
    id: allocate(`combat-lab-${name}`),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      campaignId: input.sourceCampaign.id,
      campaignRevision: input.sourceCampaign.revision,
      levelId: input.preview.levelId,
      waveId: input.preview.waveId,
      ...(input.preview.eventId ? { eventId: input.preview.eventId } : {}),
      ...(input.contentHash ? { contentHash: input.contentHash } : {})
    },
    focus: clone(input.preview.focus),
    previewWave: clone(input.preview.previewWave),
    ...(input.loadout ? { loadout: clone(input.loadout) } : {})
  };
  return preset;
};

export const loadCombatLabPreset = (
  value: unknown,
  sourceCampaign?: GameCampaignConfig
): CombatLabPresetEnvelope => {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  assertPresetShape(parsed);
  const preset = clone(parsed);
  preset.previewWave = migrateLegacyWaveCompletionRule(preset.previewWave);
  if (sourceCampaign) {
    if (preset.source.campaignId !== sourceCampaign.id) {
      throw new Error(`Combat Lab preset belongs to campaign ${preset.source.campaignId}, not ${sourceCampaign.id}`);
    }
    validatePreviewInSourceContext(
      sourceCampaign,
      preset.source.levelId,
      preset.source.waveId,
      preset.previewWave
    );
  }
  if (preset.loadout) buildCombatLabRuntimeSquadLoadout(preset.loadout);
  return preset;
};

export const duplicateCombatLabPreset = (
  source: CombatLabPresetEnvelope | string,
  name?: string,
  options: CombatLabModelOptions = {}
): CombatLabPresetEnvelope => {
  const original = loadCombatLabPreset(source);
  const duplicateName = name?.trim() || `${original.name} Copy`;
  const timestamp = toIsoString(options);
  const allocate = createUniqueIdAllocator(new Set([original.id]), options);
  return {
    ...clone(original),
    id: allocate(`combat-lab-${duplicateName}`),
    name: duplicateName,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createPreviewCampaignFromPreset = (
  sourceCampaign: GameCampaignConfig,
  value: CombatLabPresetEnvelope | string
): GameCampaignConfig => {
  const preset = loadCombatLabPreset(value, sourceCampaign);
  const campaign = replaceWave(
    sourceCampaign,
    preset.source.levelId,
    preset.source.waveId,
    preset.previewWave
  );
  const owningLevel = campaign.levels.find((level) => level.id === preset.source.levelId);
  if (!owningLevel) throw new Error(`Unknown Combat Lab source level: ${preset.source.levelId}`);
  for (const event of preset.previewWave.events) {
    if (event.kind !== 'powerup' && event.kind !== 'recovery') continue;
    for (const powerupId of event.powerupIds) {
      if (!owningLevel.availablePowerupIds.includes(powerupId)) owningLevel.availablePowerupIds.push(powerupId);
    }
  }
  assertValidGameCampaign(campaign);
  return campaign;
};

/** Exposed for callers that need an explicit safe campaign copy before editing. */
export const cloneCombatLabCampaign = clone;

/** Catalog fallback data for UIs that want to seed an enemy control from defaults. */
export const getCombatLabEnemyDefaults = (enemyId: EnemyId) => clone(ENEMY_CATALOG[enemyId]);
