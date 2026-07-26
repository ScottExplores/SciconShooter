import type {
  BossEvent,
  GameCampaignConfig,
  LevelDefinition,
  SpawnEvent,
  WaveDefinition,
  WaveEvent
} from '../../../game-config/types';

export const cloneJson = <T,>(value: T): T => structuredClone(value);

export const createEditorId = (prefix: string) => (
  `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`
);

const cloneBossEvent = (event: BossEvent): BossEvent => {
  const weaponIdMap = new Map<string, string>();
  const phaseIdMap = new Map<string, string>();
  const timelineClipIdMap = new Map<string, string>();
  const weapons = event.weapons.map((weapon) => {
    const nextId = createEditorId('weapon');
    weaponIdMap.set(weapon.id, nextId);
    return { ...cloneJson(weapon), id: nextId };
  });
  event.phases.forEach((phase) => {
    phaseIdMap.set(phase.id, createEditorId('phase'));
  });
  const timelineAttackIds = new Set(event.timeline?.attacks?.map((attack) => attack.id) ?? []);
  event.timeline?.clips.forEach((clip) => {
    let nextId = createEditorId('boss-clip');
    while (timelineAttackIds.has(nextId)) nextId = createEditorId('boss-clip');
    timelineClipIdMap.set(clip.id, nextId);
  });
  return {
    ...cloneJson(event),
    id: createEditorId('boss'),
    weapons,
    phases: event.phases.map((phase) => ({
      ...cloneJson(phase),
      id: phaseIdMap.get(phase.id)!,
      weaponSettingIds: phase.weaponSettingIds.map((id) => weaponIdMap.get(id)).filter((id): id is string => Boolean(id))
    })),
    revival: event.revival ? {
      ...cloneJson(event.revival),
      phaseId: phaseIdMap.get(event.revival.phaseId)!
    } : undefined,
    timeline: event.timeline ? {
      ...cloneJson(event.timeline),
      clips: event.timeline.clips.map((clip) => ({
        ...cloneJson(clip),
        id: timelineClipIdMap.get(clip.id)!,
        phaseId: clip.phaseId ? phaseIdMap.get(clip.phaseId) : undefined,
        telegraphClipId: clip.telegraphClipId
          ? timelineClipIdMap.get(clip.telegraphClipId)
          : undefined
      })),
      ...(event.timeline.attacks ? {
        attacks: event.timeline.attacks.map((attack) => ({
          ...cloneJson(attack),
          variants: attack.variants.map((variant) => ({
            ...cloneJson(variant),
            phaseId: phaseIdMap.get(variant.phaseId)!,
            beatClipIds: variant.beatClipIds.map((clipId) => timelineClipIdMap.get(clipId)!),
            recoveryClipId: timelineClipIdMap.get(variant.recoveryClipId)!
          }))
        }))
      } : {})
    } : undefined
  };
};

export const cloneWaveEvent = (event: WaveEvent): WaveEvent => {
  if (event.kind === 'boss') return cloneBossEvent(event);
  return { ...cloneJson(event), id: createEditorId(event.kind) };
};

export const cloneWave = (wave: WaveDefinition, name = `${wave.name} Copy`): WaveDefinition => ({
  ...cloneJson(wave),
  id: createEditorId('wave'),
  name,
  events: wave.events.map(cloneWaveEvent)
});

export const cloneLevel = (level: LevelDefinition, name = `${level.name} Copy`): LevelDefinition => ({
  ...cloneJson(level),
  id: createEditorId('level'),
  name,
  waves: level.waves.map((wave) => cloneWave(wave, wave.name))
});

const normalizeLevelOrder = (levels: LevelDefinition[]) => levels.map((level, index) => ({
  ...level,
  order: index + 1,
  waves: level.waves.map((wave, waveIndex) => ({ ...wave, order: waveIndex + 1 }))
}));

export const updateLevelInCampaign = (
  campaign: GameCampaignConfig,
  levelId: string,
  update: (level: LevelDefinition) => LevelDefinition
): GameCampaignConfig => ({
  ...campaign,
  levels: normalizeLevelOrder(campaign.levels.map((level) => level.id === levelId ? update(level) : level))
});

export const moveLevel = (campaign: GameCampaignConfig, levelId: string, direction: -1 | 1) => {
  const levels = [...campaign.levels];
  const index = levels.findIndex((level) => level.id === levelId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= levels.length) return campaign;
  [levels[index], levels[target]] = [levels[target], levels[index]];
  return { ...campaign, levels: normalizeLevelOrder(levels) };
};

export const moveWave = (level: LevelDefinition, waveId: string, direction: -1 | 1): LevelDefinition => {
  const waves = [...level.waves];
  const index = waves.findIndex((wave) => wave.id === waveId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= waves.length) return level;
  [waves[index], waves[target]] = [waves[target], waves[index]];
  return { ...level, waves: waves.map((wave, waveIndex) => ({ ...wave, order: waveIndex + 1 })) };
};

export const reorderWave = (level: LevelDefinition, sourceId: string, targetId: string): LevelDefinition => {
  const waves = [...level.waves];
  const sourceIndex = waves.findIndex((wave) => wave.id === sourceId);
  const targetIndex = waves.findIndex((wave) => wave.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return level;
  const [source] = waves.splice(sourceIndex, 1);
  waves.splice(targetIndex, 0, source);
  return { ...level, waves: waves.map((wave, index) => ({ ...wave, order: index + 1 })) };
};

export const sortWaveEvents = (events: WaveEvent[]) => [...events].sort((left, right) => (
  left.startSeconds - right.startSeconds || left.label.localeCompare(right.label)
));

export const createSpawnEvent = (wave: WaveDefinition): SpawnEvent => {
  const startSeconds = Math.min(Math.max(0, wave.durationSeconds * 0.1), Math.max(0, wave.durationSeconds - 5));
  return {
    id: createEditorId('spawn'),
    kind: 'spawn',
    label: 'New formation encounter',
    startSeconds,
    durationSeconds: Math.max(1, Math.min(12, wave.durationSeconds - startSeconds)),
    delayAfterSeconds: 0,
    blocksWaveClock: false,
    count: 12,
    patternId: 'v',
    positionId: 'formation-top',
    spawnIntervalSeconds: 0.8,
    enemies: [{
      enemyId: 'drone',
      spriteKey: 'ENEMY_DRONE_FRAMES',
      weight: 1,
      health: 2,
      speed: 2.5,
      damage: 1,
      scoreValue: 100,
      powerupDropChance: 0.08
    }]
  };
};

/**
 * Creates a clean wave from the selected wave's presentation and tuning.
 * Unlike duplicate, this intentionally starts with one formation encounter.
 */
export const createStarterWave = (source: WaveDefinition, order: number): WaveDefinition => {
  const wave: WaveDefinition = {
    ...cloneJson(source),
    id: createEditorId('wave'),
    name: `New Wave ${order}`,
    order,
    completionRule: 'clear-after-duration',
    durationSeconds: Math.max(20, source.durationSeconds),
    scoreMultiplier: Math.min(1_000_000, 2 ** Math.max(0, order - 1)),
    events: []
  };
  const openingFormation = createSpawnEvent(wave);

  return {
    ...wave,
    events: [{ ...openingFormation, label: 'Opening formation', startSeconds: 0 }]
  };
};

/**
 * Creates a clean mission while retaining safe campaign-level presentation
 * choices such as the background, music, power-up pool, and scorecard style.
 */
export const createStarterLevel = (source: LevelDefinition, order: number): LevelDefinition => {
  const sourceWave = source.waves[0];
  if (!sourceWave) throw new Error('A mission template requires at least one wave');

  return {
    ...cloneJson(source),
    id: createEditorId('level'),
    name: `New Mission ${order}`,
    description: 'A new mission with one starter wave and one formation encounter.',
    order,
    startingDifficulty: 1,
    scoreTarget: 0,
    durationSeconds: null,
    loopWaves: false,
    waves: [createStarterWave(sourceWave, 1)]
  };
};

export const createBossEvent = (wave: WaveDefinition): BossEvent => {
  const startSeconds = Math.max(0, Math.min(wave.durationSeconds - 4, wave.durationSeconds * 0.75));
  const weaponId = createEditorId('weapon');
  return {
    id: createEditorId('boss'),
    kind: 'boss',
    label: 'New mini-boss',
    startSeconds,
    durationSeconds: Math.max(1, Math.min(10, wave.durationSeconds - startSeconds)),
    delayAfterSeconds: 0,
    blocksWaveClock: true,
    bossId: 'bottleneck-drone',
    count: 1,
    spriteKey: 'MINI_BOSS',
    positionId: 'center-top',
    movementPatternId: 'track-player',
    warningSeconds: 2,
    health: 40,
    speed: 1.4,
    damage: 1,
    scoreReward: 1500,
    powerupDropChance: 0.4,
    shieldCount: 0,
    weapons: [{ id: weaponId, weaponId: 'aimed-shot', attackIntervalSeconds: 1.3, damage: 1, projectileSpeed: 4, burstCount: 1 }],
    phases: [{ id: createEditorId('phase'), label: 'Opening', triggerHealthRatio: 1, movementPatternId: 'track-player', speedMultiplier: 1, weaponSettingIds: [weaponId] }]
  };
};
