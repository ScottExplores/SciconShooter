import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairCampaignOverhaulV22 } from './lib/campaign-overhaul-v22-normalizer.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const migrationPath = path.join(repositoryRoot, 'game-config', 'campaign-migration-v22.json');
const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));

if (campaign.revision !== 21 || campaign.sectors) {
  throw new Error('Campaign overhaul v22 must run exactly once against revision 21.');
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const allEvents = campaign.levels.flatMap((level) => level.waves.flatMap((wave) => wave.events));
const originalEventById = new Map(allEvents.map((event) => [event.id, clone(event)]));
const originalMissionByEventId = new Map(campaign.levels.flatMap((level) => (
  level.waves.flatMap((wave) => wave.events.map((event) => [event.id, level.order]))
)));
const allMiniBosses = allEvents.filter((event) => (
  event.kind === 'boss' && ['bottleneck-drone', 'paywall-wall'].includes(event.bossId)
));

const roleSeed = [
  ['role-orbit-scout', 'Orbit Scout', 'drone', 'LEGACY_ENEMY_DRONE_FRAMES', 'formation-unit', 1, 1, 1, 'light', 'none', 0, 'formation', 0, 14, 1],
  ['role-research-drone', 'Research Drone', 'drone', 'ENEMY_DRONE_FRAMES', 'shooter', 2, 1, 1, 'standard', 'post-formation', 2.4, 'formation', 1, 10, 1],
  ['role-citation-swarm', 'Citation Swarm', 'swarm', 'ENEMY_SWARM_FRAMES', 'diver', 1, 1, 2, 'light', 'none', 0, 'dive', 0, 14, 1],
  ['role-jet-scout', 'Jet Scout', 'drone', 'PIXI_JET_SCOUT_FRAMES', 'flanker', 2, 1, 3, 'standard', 'post-formation', 2.2, 'flank', 1, 10, 1],
  ['role-jet-interceptor', 'Jet Interceptor', 'swarm', 'PIXI_JET_INTERCEPTOR_FRAMES', 'burst-shooter', 3, 1, 3, 'standard', 'aimed-burst', 2.6, 'flank', 1, 8, 2],
  ['role-jet-heavy', 'Jet Heavy', 'brick', 'PIXI_JET_HEAVY_FRAMES', 'armored-unit', 5, 1, 4, 'armored', 'post-formation', 2.4, 'lane', 2, 5, 3],
  ['role-journal-priority', 'Journal Priority', 'journal', 'ENEMY_JOURNAL_FRAMES', 'priority-target', 4, 1, 4, 'standard', 'aimed-burst', 2.8, 'formation', 2, 6, 2],
  ['role-dna-conductor', 'DNA Conductor', 'journal', 'CAMPAIGN_ENEMY_DNA_CONDUCTOR', 'support-unit', 5, 2, 1, 'elite', 'post-formation', 2, 'formation', 2, 4, 3],
  ['role-laser-stalker', 'Laser Stalker', 'drone', 'CAMPAIGN_ENEMY_LASER_STALKER', 'suppressor', 4, 2, 1, 'standard', 'aimed-burst', 2.4, 'lane', 2, 5, 3],
  ['role-orbit-disc', 'Orbit Disc', 'swarm', 'CAMPAIGN_ENEMY_ORBIT_DISC', 'flanker', 3, 2, 1, 'standard', 'post-formation', 2, 'flank', 1, 8, 2],
  ['role-wall-sniper-left', 'Port Wall Sniper', 'drone', 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT', 'shooter', 4, 2, 2, 'standard', 'aimed-burst', 2.6, 'lane', 2, 4, 2],
  ['role-wall-sniper-right', 'Starboard Wall Sniper', 'drone', 'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT', 'shooter', 4, 2, 2, 'standard', 'aimed-burst', 2.6, 'lane', 2, 4, 2],
  ['role-laser-hunter', 'Laser Hunter', 'journal', 'CAMPAIGN_ENEMY_LASER_HUNTER', 'priority-target', 5, 2, 2, 'elite', 'aimed-burst', 2.4, 'formation', 2, 3, 3],
  ['role-dark-sentinel', 'Dark Asteroid Sentinel', 'brick', 'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL', 'armored-unit', 6, 2, 3, 'armored', 'post-formation', 2.2, 'lane', 2, 4, 3],
  ['role-crescent-minelayer', 'Crescent Minelayer', 'journal', 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER', 'support-unit', 5, 2, 3, 'standard', 'post-formation', 2.2, 'flank', 2, 4, 3],
  ['role-shield-rammer', 'Shield Rammer', 'brick', 'CAMPAIGN_ENEMY_SHIELD_RAMMER', 'armored-unit', 6, 2, 3, 'armored', 'none', 0, 'dive', 2, 4, 3],
  ['role-prism-artillery', 'Prism Artillery', 'journal', 'CAMPAIGN_ENEMY_PRISM_ARTILLERY', 'suppressor', 6, 2, 4, 'elite', 'aimed-burst', 2.6, 'formation', 2, 3, 4],
  ['role-ring-sentinel', 'Ring Sentinel', 'brick', 'CAMPAIGN_ENEMY_RING_SENTINEL', 'formation-leader', 6, 2, 4, 'elite', 'formation-command', 1.8, 'formation', 2, 3, 4],
  ['role-ring-emitter', 'Bullet Ring Emitter', 'journal', 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER', 'suppressor', 7, 2, 4, 'elite', 'elite-only', 2.4, 'formation', 3, 3, 4]
];

const packs = [
  ['pack-orbit-v', 'Orbit V', ['role-orbit-scout', 'role-research-drone'], 10, 14, 'top', 'sweep-bank-reentry', 'v', 'post-formation', 0, 1, 1, 2, ['introduction', 'formation-remix'], ['sector-open-orbit'], 10],
  ['pack-orbit-grid', 'Orbit Grid', ['role-research-drone'], 12, 24, 'top', 'formation-drop', 'grid', 'staggered', 1, 1, 1, 3, ['formation-remix', 'boss-preparation'], ['sector-open-orbit'], 12],
  ['pack-citation-spiral', 'Citation Spiral', ['role-citation-swarm', 'role-research-drone'], 14, 20, 'split', 'spiral-entry', 'spiral', 'staggered', 1, 1, 1, 3, ['formation-remix', 'elite-checkpoint'], ['sector-open-orbit'], 14],
  ['pack-jet-pincer', 'Jet Pincer', ['role-jet-scout', 'role-jet-interceptor', 'role-jet-heavy'], 14, 39, 'split', 'paired-flank', 'pincer', 'priority', 2, 1, 1, 4, ['elite-checkpoint', 'boss-preparation'], ['sector-open-orbit'], 17],
  ['pack-priority-diamond', 'Priority Diamond', ['role-journal-priority', 'role-jet-interceptor'], 9, 30, 'top', 'diamond-lock', 'diamond', 'priority', 2, 1, 1, 3, ['elite-checkpoint', 'boss-preparation'], ['sector-open-orbit'], 14],
  ['pack-dna-helix', 'DNA Helix', ['role-dna-conductor', 'role-laser-stalker', 'role-orbit-disc'], 15, 60, 'split', 'double-helix', 'sine', 'priority', 3, 2, 1, 4, ['introduction', 'formation-remix', 'boss-preparation'], ['sector-redline', 'sector-gravity'], 20],
  ['pack-wall-crossfire', 'Redline Crossfire', ['role-wall-sniper-left', 'role-wall-sniper-right', 'role-laser-hunter'], 10, 43, 'split', 'side-wall-entry', 'pincer', 'staggered', 3, 2, 1, 4, ['formation-remix', 'elite-checkpoint', 'boss-preparation'], ['sector-redline', 'sector-terminus'], 18],
  ['pack-dark-lanes', 'Dark Matter Lanes', ['role-dark-sentinel', 'role-crescent-minelayer', 'role-shield-rammer'], 12, 68, 'top', 'lane-stagger', 'row', 'priority', 4, 2, 1, 5, ['introduction', 'formation-remix', 'boss-preparation'], ['sector-redline', 'sector-gravity'], 22],
  ['pack-prism-ring', 'Prism Ring', ['role-prism-artillery', 'role-ring-sentinel', 'role-ring-emitter'], 12, 76, 'top', 'ring-assemble', 'spiral', 'priority', 5, 2, 1, 5, ['elite-checkpoint', 'boss-preparation'], ['sector-redline', 'sector-gravity', 'sector-terminus'], 24],
  ['pack-heavy-grid', 'Terminus Grid', ['role-jet-heavy', 'role-journal-priority', 'role-ring-emitter'], 15, 79, 'top', 'armored-grid', 'grid', 'staggered', 4, 3, 1, 5, ['formation-remix', 'elite-checkpoint', 'boss-preparation'], ['sector-gravity', 'sector-terminus'], 24]
];

const formationPacks = packs.map(([
  id, label, enemyRoleIds, enemyCount, totalThreatCost, entryDirection, entryPath,
  formationShape, firingBehavior, synergyAdjustment, minimumSector,
  maximumSimultaneousInstances, recoveryRequiredSeconds, compatibleMissionRoles,
  compatibleSectorIds, mobilePerformanceCost
]) => ({
  id, label, enemyRoleIds, enemyCount, totalThreatCost, entryDirection, entryPath,
  formationShape, firingBehavior, synergyAdjustment, minimumSector,
  maximumSimultaneousInstances, recoveryRequiredSeconds, compatibleMissionRoles,
  compatibleSectorIds, mobilePerformanceCost
}));

const enemyRoles = roleSeed.map(([
  id, label, enemyId, spriteKey, role, threatCost, introductionSector,
  introductionMission, durabilityClass, fireBehavior, fireDelaySeconds, entryBehavior,
  reuseCooldownWaves, maximumSimultaneousCount, performanceCost
]) => ({
  id,
  label,
  enemyId,
  spriteKey,
  role,
  threatCost,
  introductionSector,
  introductionMission,
  durabilityClass,
  fireBehavior,
  fireDelaySeconds,
  entryBehavior,
  compatibleFormationPackIds: formationPacks
    .filter((pack) => pack.enemyRoleIds.includes(id))
    .map((pack) => pack.id),
  synergyTags: role === 'support-unit'
    ? ['support', 'priority']
    : durabilityClass === 'armored'
      ? ['armor', 'sustained-damage']
      : role.includes('shooter') || role === 'suppressor'
        ? ['ranged-pressure']
        : ['formation-pressure'],
  reuseCooldownWaves,
  maximumSimultaneousCount,
  performanceCost
}));

const roleBySprite = new Map(enemyRoles.map((entry) => [entry.spriteKey, entry.id]));
const roleCost = new Map(enemyRoles.map((entry) => [entry.id, entry.threatCost]));

const visualThemes = [
  { id: 'theme-open-orbit', label: 'Open Orbit', backgroundId: 'open-orbit', accent: '#35f2d0', description: 'Clean orbital lanes and research traffic.' },
  { id: 'theme-redline', label: 'Redline Frontier', backgroundId: 'shattered-void', accent: '#f97373', description: 'Fractured space crossed by hostile firing lanes.' },
  { id: 'theme-gravity', label: 'Gravity Rift', backgroundId: 'gravity-rift', accent: '#a78bfa', description: 'Dense formations distort around the rift.' },
  { id: 'theme-terminus', label: 'Terminus Frontier', backgroundId: 'terminus-frontier', accent: '#facc15', description: 'The final research corridor and tribunal defenses.' }
];

const sectorSeeds = [
  ['sector-open-orbit', 'OPEN ORBIT', 'theme-open-orbit', 'gatekeeper-prime'],
  ['sector-redline', 'REDLINE FRONTIER', 'theme-redline', 'eclipse-engine'],
  ['sector-gravity', 'GRAVITY RIFT', 'theme-gravity', 'helix-leviathan'],
  ['sector-terminus', 'TERMINUS FRONTIER', 'theme-terminus', 'research-tribunal']
];

const roleByPosition = ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'];
const waveCounts = { introduction: 5, 'formation-remix': 6, 'elite-checkpoint': 5, 'boss-preparation': 7, 'major-boss': 1 };
const rhythmByRole = {
  introduction: ['warm-up', 'introduce', 'variation', 'recovery', 'peak'],
  'formation-remix': ['warm-up', 'introduce', 'variation', 'support', 'recovery', 'peak'],
  'elite-checkpoint': ['warm-up', 'introduce', 'variation', 'recovery', 'peak'],
  'boss-preparation': ['warm-up', 'introduce', 'variation', 'support', 'recovery', 'peak', 'clear'],
  'major-boss': ['boss']
};

const bossAssignments = new Map([
  [5, { sourceMission: 1, sourceEventId: 'open-orbit-gatekeeper', bossId: 'gatekeeper-prime', label: 'Gatekeeper Prime' }],
  [10, { sourceMission: 10, sourceEventId: 'null-sector-final-boss', bossId: 'eclipse-engine', label: 'Eclipse Engine' }],
  [15, { sourceMission: 15, sourceEventId: 'ion-citadel-final-boss', bossId: 'helix-leviathan', label: 'Helix Leviathan' }],
  [20, { sourceMission: 20, sourceEventId: 'terminus-ascendant-final-boss', bossId: 'research-tribunal', label: 'Research Tribunal' }]
]);

const majorBossAssetByMission = new Map([
  [5, 'PIXI_BOSS_OPEN_ORBIT_FRAMES'],
  [10, 'CAMPAIGN_BOSS_ECLIPSE_ENGINE'],
  [15, 'CAMPAIGN_BOSS_HELIX_LEVIATHAN'],
  [20, 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT']
]);

// Keep the late-sector bosses threatening without turning their final phases into
// attrition walls. These values are backed by tools/simulate-campaign-boss-balance.mjs
// and intentionally leave shields, phase triggers, burst counts, and attack types intact.
const majorBossBalanceByMission = new Map([
  [10, {
    health: 1180,
    speed: 2.25,
    burstIntervalSeconds: 1.15,
    burstProjectileSpeed: 8.9,
    laneIntervalSeconds: 1.25,
    phaseSpeedMultipliers: [1, 1.08, 1.18]
  }],
  [15, {
    health: 1650,
    speed: 2.5,
    burstIntervalSeconds: 1.2,
    burstProjectileSpeed: 9.25,
    laneIntervalSeconds: 1.3,
    phaseTriggerRatios: [1, 0.5, 0.18],
    phaseSpeedMultipliers: [1, 1.09, 1.2]
  }],
  [20, {
    health: 2100,
    speed: 2.75,
    burstIntervalSeconds: 1.25,
    burstProjectileSpeed: 9.5,
    laneIntervalSeconds: 1.35,
    phaseTriggerRatios: [1, 0.46, 0.15],
    phaseSpeedMultipliers: [1, 1.1, 1.22]
  }]
]);

const findEvent = (_missionNumber, eventId) => originalEventById.get(eventId);

const inferPackId = (event) => {
  const sprites = event.enemies?.map((enemy) => enemy.spriteKey) ?? [];
  if (sprites.some((key) => key.includes('DNA_') || key.includes('LASER_STALKER') || key.includes('ORBIT_DISC'))) return 'pack-dna-helix';
  if (sprites.some((key) => key.includes('WALL_SNIPER') || key.includes('LASER_HUNTER'))) return 'pack-wall-crossfire';
  if (sprites.some((key) => key.includes('DARK_ASTEROID') || key.includes('MINELAYER') || key.includes('SHIELD_RAMMER'))) return 'pack-dark-lanes';
  if (sprites.some((key) => key.includes('PRISM_') || key.includes('RING_'))) return 'pack-prism-ring';
  if (sprites.some((key) => key.includes('JET_HEAVY')) || event.patternId === 'grid') return 'pack-heavy-grid';
  if (sprites.some((key) => key.includes('JOURNAL')) || event.patternId === 'diamond') return 'pack-priority-diamond';
  if (sprites.some((key) => key.includes('JET_')) || event.patternId === 'pincer') return 'pack-jet-pincer';
  if (event.patternId === 'spiral' || sprites.some((key) => key.includes('SWARM'))) return 'pack-citation-spiral';
  if (event.patternId === 'grid') return 'pack-orbit-grid';
  return 'pack-orbit-v';
};

const normalizeSpawn = (source, id, startSeconds, sectorNumber) => {
  const event = clone(source);
  event.id = id;
  event.startSeconds = startSeconds;
  event.durationSeconds = 8;
  event.delayAfterSeconds = 0;
  event.blocksWaveClock = false;
  event.count = Math.min(event.count, 12 + sectorNumber * 3);
  event.spawnIntervalSeconds = Math.max(0.28, event.spawnIntervalSeconds);
  event.enemies = event.enemies.map((enemy) => {
    const roleId = roleBySprite.get(enemy.spriteKey)
      ?? (enemy.enemyId === 'brick' ? 'role-jet-heavy' : enemy.enemyId === 'journal' ? 'role-journal-priority' : enemy.enemyId === 'swarm' ? 'role-citation-swarm' : 'role-research-drone');
    const role = enemyRoles.find((entry) => entry.id === roleId);
    const durability = role?.durabilityClass ?? 'standard';
    const maxHealth = durability === 'light' ? 2 : durability === 'standard' ? 4 + sectorNumber : durability === 'armored' ? 8 + sectorNumber * 2 : 12 + sectorNumber * 3;
    return {
      ...enemy,
      enemyId: role.enemyId,
      spriteKey: role.spriteKey,
      roleId,
      health: Math.max(1, Math.min(enemy.health, maxHealth)),
      speed: Math.max(1.7, Math.min(enemy.speed, 5.1)),
      damage: 1,
      attackIntervalSeconds: enemy.attackIntervalSeconds === undefined
        ? undefined
        : Math.max(1.35, enemy.attackIntervalSeconds),
      projectileSpeed: enemy.projectileSpeed === undefined
        ? undefined
        : Math.min(8.5, enemy.projectileSpeed),
      burstCount: enemy.burstCount === undefined ? undefined : Math.min(3, enemy.burstCount)
    };
  });
  return event;
};

const normalizeMiniBoss = (source, id, startSeconds, sectorNumber, label) => {
  const event = clone(source);
  event.id = id;
  event.label = label;
  event.startSeconds = startSeconds;
  event.durationSeconds = 14;
  event.delayAfterSeconds = 1.5;
  event.blocksWaveClock = true;
  event.warningSeconds = Math.max(1.2, Math.min(event.warningSeconds ?? 2, 3));
  event.health = Math.min(event.health, 120 + sectorNumber * 55);
  event.speed = Math.min(event.speed, 3.1);
  event.damage = 1;
  event.count = Math.min(event.count ?? 1, sectorNumber >= 3 && event.bossId === 'bottleneck-drone' ? 2 : 1);
  event.weapons = event.weapons.map((weapon) => ({
    ...weapon,
    attackIntervalSeconds: Math.max(1.15, weapon.attackIntervalSeconds),
    damage: 1,
    projectileSpeed: Math.min(9, weapon.projectileSpeed),
    burstCount: Math.min(4, weapon.burstCount)
  }));
  return event;
};

const makeRecovery = (levelId, waveNumber, powerupIds) => ({
  id: `${levelId}-wave-${waveNumber}-recovery`,
  kind: 'recovery',
  label: 'Research recovery window',
  startSeconds: 0,
  durationSeconds: 4,
  delayAfterSeconds: 1,
  blocksWaveClock: false,
  positionId: 'center-top',
  coinCount: 4,
  powerupIds: powerupIds.includes('shield') ? ['shield'] : powerupIds.slice(0, 1)
});

const makeRecoveryDrifters = (source, levelId, waveNumber, sectorNumber) => {
  const event = normalizeSpawn(source, `${levelId}-wave-${waveNumber}-drifters`, 0, sectorNumber);
  const lightestEnemy = [...event.enemies].sort((left, right) => (
    (roleCost.get(left.roleId) ?? Number.POSITIVE_INFINITY)
    - (roleCost.get(right.roleId) ?? Number.POSITIVE_INFINITY)
  ))[0];
  const recoveryEnemy = {
    ...lightestEnemy,
    weight: 1,
    health: Math.min(4, Math.max(1, lightestEnemy.health)),
    powerupDropChance: 0,
    rank: 'standard',
    sizeMultiplier: Math.min(1, lightestEnemy.sizeMultiplier ?? 1)
  };
  delete recoveryEnemy.attackPatternId;
  delete recoveryEnemy.attackIntervalSeconds;
  delete recoveryEnemy.projectileSpeed;
  delete recoveryEnemy.burstCount;
  delete event.spawnAnchor;
  delete event.formationSlots;
  return {
    ...event,
    label: 'Loose interceptors',
    durationSeconds: 4,
    count: 3,
    patternId: 'single-random',
    positionId: 'random-top',
    spawnIntervalSeconds: 1.25,
    enemies: [recoveryEnemy]
  };
};

const makePowerup = (source, id) => ({
  ...clone(source),
  id,
  startSeconds: 1,
  durationSeconds: 5,
  delayAfterSeconds: 0,
  blocksWaveClock: false,
  spawnIntervalSeconds: Math.max(1, source.spawnIntervalSeconds)
});

const normalizeMajorBoss = (source, assignment, missionNumber) => {
  const event = clone(source);
  const balance = majorBossBalanceByMission.get(missionNumber);
  event.bossId = assignment.bossId;
  event.label = assignment.label;
  event.startSeconds = 0.8;
  event.durationSeconds = Math.max(60, event.durationSeconds);
  event.delayAfterSeconds = 0;
  event.blocksWaveClock = true;
  event.warningSeconds = Math.max(2.2, Math.min(event.warningSeconds ?? 3, 4));
  event.health = balance?.health ?? event.health;
  event.speed = balance?.speed ?? Math.min(event.speed, 3.2);
  event.damage = 1;
  event.sizeMultiplier = Math.min(event.sizeMultiplier ?? 1, 1.25);
  event.weapons = event.weapons.map((weapon) => {
    const isLaneWeapon = weapon.weaponId === 'lane-beam';
    return {
      ...weapon,
      attackIntervalSeconds: balance
        ? (isLaneWeapon ? balance.laneIntervalSeconds : balance.burstIntervalSeconds)
        : Math.max(1.05, weapon.attackIntervalSeconds),
      damage: 1,
      projectileSpeed: balance && !isLaneWeapon
        ? balance.burstProjectileSpeed
        : Math.min(10.5, weapon.projectileSpeed),
      burstCount: Math.min(6, weapon.burstCount)
    };
  });
  event.phases = event.phases.map((phase, phaseIndex) => ({
    ...phase,
    triggerHealthRatio: balance?.phaseTriggerRatios?.[phaseIndex]
      ?? phase.triggerHealthRatio,
    speedMultiplier: balance?.phaseSpeedMultipliers[phaseIndex]
      ?? Math.min(1.25, phase.speedMultiplier)
  }));
  return event;
};

const oldMissionWaves = Object.fromEntries(campaign.levels.map((level) => [
  level.id,
  level.waves.map((wave) => wave.id)
]));
const removedBossEventIds = allEvents
  .filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper')
  .map((event) => event.id);

for (const level of campaign.levels) {
  const missionNumber = level.order;
  const sectorNumber = Math.ceil(missionNumber / 5);
  const missionRole = roleByPosition[(missionNumber - 1) % 5];
  const sectorId = sectorSeeds[sectorNumber - 1][0];
  const oldWaves = clone(level.waves);
  const sourceSpawns = oldWaves.flatMap((wave) => wave.events).filter((event) => event.kind === 'spawn');
  const sourcePowerup = oldWaves.flatMap((wave) => wave.events).find((event) => event.kind === 'powerup');
  const localMiniBosses = oldWaves.flatMap((wave) => wave.events).filter((event) => (
    event.kind === 'boss' && ['bottleneck-drone', 'paywall-wall'].includes(event.bossId)
  ));
  const waveCount = waveCounts[missionRole];
  const rhythms = rhythmByRole[missionRole];
  const authoredWaves = [];

  if (missionRole === 'major-boss') {
    const assignment = bossAssignments.get(missionNumber);
    const source = findEvent(assignment.sourceMission, assignment.sourceEventId);
    if (!source) throw new Error(`Missing major boss source ${assignment.sourceEventId}`);
    const sourceWaveId = missionNumber === 5
      ? 'bastion-protocol-crownclaw'
      : oldWaves.at(-1).id;
    authoredWaves.push({
      id: sourceWaveId,
      name: assignment.label.toUpperCase(),
      order: 1,
      accent: level.waves.at(-1).accent,
      backgroundId: level.backgroundId,
      completionRule: 'boss-defeat',
      difficultyMultiplier: 1 + (sectorNumber - 1) * 0.04,
      durationSeconds: 180,
      introSeconds: 3,
      delayAfterSeconds: 5,
      scoreMultiplier: Math.pow(2, missionNumber - 1),
      threatCap: 18 + sectorNumber * 3,
      combatBudget: 48 + sectorNumber * 18,
      rhythm: 'boss',
      formationPackIds: [],
      events: [normalizeMajorBoss(source, assignment, missionNumber)]
    });
    level.scorecard.encounterAssetKey = majorBossAssetByMission.get(missionNumber);
  } else {
    const recoveryIndex = missionRole === 'boss-preparation' ? 4 : missionRole === 'formation-remix' ? 4 : 3;
    for (let index = 0; index < waveCount; index += 1) {
      const waveNumber = index + 1;
      const rhythm = rhythms[index];
      const isRecovery = index === recoveryIndex;
      const isPeak = index === waveCount - 1;
      const firstSource = sourceSpawns[index % sourceSpawns.length];
      const secondSource = sourceSpawns[(index + 1) % sourceSpawns.length];
      const packId = inferPackId(firstSource);
      const events = [];
      if (isRecovery) {
        events.push(makeRecoveryDrifters(firstSource, level.id, waveNumber, sectorNumber));
        events.push(makeRecovery(level.id, waveNumber, level.availablePowerupIds));
      } else {
        events.push(normalizeSpawn(firstSource, `${level.id}-wave-${waveNumber}-primary`, 0, sectorNumber));
        if (['variation', 'support', 'peak', 'clear'].includes(rhythm)) {
          events.push(normalizeSpawn(secondSource, `${level.id}-wave-${waveNumber}-support`, 6, sectorNumber));
        }
        if (index === 0 && sourcePowerup) {
          events.push(makePowerup(sourcePowerup, `${level.id}-wave-${waveNumber}-powerup`));
          events.sort((left, right) => left.startSeconds - right.startSeconds);
        }
        if (isPeak && ['elite-checkpoint', 'boss-preparation'].includes(missionRole)) {
          const miniSource = localMiniBosses[0]
            ?? allMiniBosses[(missionNumber + sectorNumber) % allMiniBosses.length];
          events.push(normalizeMiniBoss(
            miniSource,
            `${level.id}-wave-${waveNumber}-checkpoint`,
            8,
            sectorNumber,
            missionRole === 'elite-checkpoint' ? `${level.name} ELITE` : `${level.name} BOSS SIGNAL`
          ));
        }
        events.sort((left, right) => left.startSeconds - right.startSeconds);
      }

      const eventRoleIds = events.flatMap((event) => event.enemies?.map((enemy) => enemy.roleId) ?? []);
      const estimatedThreat = eventRoleIds.reduce((total, id) => total + (roleCost.get(id) ?? 2), 0);
      const combatBudget = Math.max(12 + sectorNumber * 8 + index * 3, estimatedThreat);
      authoredWaves.push({
        id: `${level.id}-wave-${waveNumber}`,
        name: `${rhythm.replace('-', ' ').toUpperCase()} ${String(waveNumber).padStart(2, '0')}`,
        order: waveNumber,
        accent: oldWaves[index % oldWaves.length].accent,
        backgroundId: level.backgroundId,
        completionRule: 'clear-after-duration',
        difficultyMultiplier: 1 + (sectorNumber - 1) * 0.035 + index * 0.012,
        durationSeconds: isRecovery ? 5 : isPeak ? 20 : 16,
        introSeconds: index === 0 ? 1.4 : 0.45,
        delayAfterSeconds: isPeak ? 1.8 : 0.8,
        scoreMultiplier: Math.pow(2, missionNumber - 1),
        threatCap: Math.min(40, 18 + sectorNumber * 4 + index),
        combatBudget,
        rhythm,
        formationPackIds: isRecovery ? [] : [packId],
        events
      });
    }
  }

  level.waves = authoredWaves;
  level.startingDifficulty = 1 + (missionNumber - 1) * 0.015;
  level.durationSeconds = authoredWaves.reduce((sum, wave) => sum + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds, 0);
  level.description = [
    'Chart the first research lanes beyond the command network.',
    'Read the shifting signal before the formation closes.',
    'Break the command pattern and secure the checkpoint.',
    'Trace the boss signal through the sector perimeter.',
    'A major hostile signature blocks the research route.'
  ][(missionNumber - 1) % 5];

  const waveClearCoins = 12 + sectorNumber * 4;
  const missionClearCoins = 35 + sectorNumber * 15;
  const firstClearCoins = 80 + sectorNumber * 35;
  const starOne = 35 + sectorNumber * 10;
  const starTwo = 55 + sectorNumber * 15;
  const starThree = 90 + sectorNumber * 25;
  const progression = level.campaignProgression ?? {};
  const starTwoKind = missionRole === 'introduction'
    ? 'coins-at-least'
    : missionRole === 'formation-remix'
      ? 'time-at-most'
      : missionRole === 'elite-checkpoint'
        ? 'score-at-least'
        : 'damage-at-most';
  const starTwoTarget = starTwoKind === 'coins-at-least'
    ? 8 + sectorNumber * 2
    : starTwoKind === 'time-at-most'
      ? Math.ceil(level.durationSeconds * 0.9)
      : starTwoKind === 'score-at-least'
        ? 900 * missionNumber
        : 1;
  level.campaignProgression = {
    ...progression,
    reward: {
      waveClearCoins,
      missionClearCoins,
      firstClearCoins,
      bossFirstClearCoins: missionRole === 'major-boss' ? 140 + sectorNumber * 70 : missionRole === 'elite-checkpoint' ? 45 + sectorNumber * 20 : 0,
      replayMultiplier: 0.25
    },
    masteryObjectives: [
      { id: `${level.id}:complete`, label: 'Clear the mission', kind: 'complete', target: 1, rewardCoins: starOne },
      {
        id: `${level.id}:performance`,
        label: starTwoKind === 'coins-at-least'
          ? `Recover at least ${starTwoTarget} research coins`
          : starTwoKind === 'time-at-most'
            ? `Clear in ${starTwoTarget} seconds or less`
            : starTwoKind === 'score-at-least'
              ? `Reach ${starTwoTarget.toLocaleString()} points`
              : 'Clear while taking no more than one hit',
        kind: starTwoKind,
        target: starTwoTarget,
        rewardCoins: starTwo
      },
      { id: `${level.id}:master`, label: 'Master Clear: take no damage', kind: 'damage-at-most', target: 0, rewardCoins: starThree }
    ],
    masterySetBonusCoins: 110 + sectorNumber * 35,
    sectorId,
    missionRole,
    combatBudget: authoredWaves.reduce((sum, wave) => sum + wave.combatBudget, 0),
    recommendedPower: {
      minimum: 850 + (missionNumber - 1) * 230,
      expected: 1100 + (missionNumber - 1) * 300,
      comfortable: 1450 + (missionNumber - 1) * 390
    },
    testedLoadouts: {
      lowPower: 'Tier-appropriate main ship, no support, minimum recommended power',
      expectedPower: 'Expected main-ship power with one relevant support role',
      upgraded: 'Comfortable power with two complementary support roles'
    },
    recommendedSupportTags: missionRole === 'major-boss'
      ? ['boss-damage', 'survival']
      : missionRole === 'elite-checkpoint'
        ? ['anti-armor', 'lane-control']
        : missionRole === 'boss-preparation'
          ? ['survival', 'anti-summon']
          : ['anti-swarm', 'lane-control'],
    mapPosition: {
      x: [0.28, 0.45, 0.68, 0.52, 0.74][(missionNumber - 1) % 5],
      y: (missionNumber - 1) / 19
    },
    nextMissionId: campaign.levels[missionNumber]?.id ?? null
  };
}

const sectors = sectorSeeds.map(([id, name, themeId, majorBossId], index) => ({
  id,
  order: index + 1,
  name,
  themeId,
  missionIds: campaign.levels.slice(index * 5, index * 5 + 5).map((level) => level.id),
  majorBossId,
  branchIds: index === 0 ? campaign.campaignBranches.map((branch) => branch.branchId) : []
}));

campaign.revision = 22;
campaign.updatedAt = '2026-07-27T20:00:00.000Z';
campaign.sectors = sectors;
campaign.visualThemes = visualThemes;
campaign.enemyRoles = enemyRoles;
campaign.formationPacks = formationPacks;
campaign.miniBosses = [
  {
    id: 'mini-boss-bottleneck-drone',
    bossId: 'bottleneck-drone',
    label: 'Bottleneck Drone',
    visualIdentity: 'Articulated research-blocker drone with exposed central core',
    combatRole: 'Mobile priority target and aimed-burst lane test',
    mainAttacks: ['Tracked aimed burst', 'Bounded lateral sweep'],
    suitableSectorIds: sectors.map((sector) => sector.id),
    threatCost: 18,
    recommendedPower: 1200,
    usage: 'solo-or-paired',
    campaignReady: true,
    validationStatus: 'validated'
  },
  {
    id: 'mini-boss-paywall-wall',
    bossId: 'paywall-wall',
    label: 'Paywall Wall',
    visualIdentity: 'Segmented armored wall with visible firing lanes',
    combatRole: 'Lane-control checkpoint and boss-pattern foreshadow',
    mainAttacks: ['Telegraphed wall bolts', 'Bounded lane advance'],
    suitableSectorIds: sectors.map((sector) => sector.id),
    threatCost: 24,
    recommendedPower: 1650,
    usage: 'solo',
    campaignReady: true,
    validationStatus: 'validated'
  }
];

repairCampaignOverhaulV22(campaign);

const newMissionWaves = Object.fromEntries(campaign.levels.map((level) => [
  level.id,
  level.waves.map((wave) => wave.id)
]));

const bossEventAliases = Object.fromEntries(removedBossEventIds.map((id) => {
  const order = originalMissionByEventId.get(id) ?? 1;
  const sectorBossMission = Math.min(20, Math.ceil(order / 5) * 5);
  return [id, bossAssignments.get(sectorBossMission).sourceEventId];
}));

const waveAliases = Object.fromEntries(Object.entries(oldMissionWaves).map(([missionId, oldWaveIds]) => {
  const nextWaveIds = newMissionWaves[missionId];
  return [missionId, Object.fromEntries(oldWaveIds.map((oldWaveId, index) => [
    oldWaveId,
    nextWaveIds[Math.min(nextWaveIds.length - 1, Math.round(index * (nextWaveIds.length - 1) / Math.max(1, oldWaveIds.length - 1)))]
  ]))];
}));

await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
await writeFile(migrationPath, `${JSON.stringify({
  id: 'campaign-revision-21-to-22',
  fromRevision: 21,
  toRevision: 22,
  generatedAt: campaign.updatedAt,
  missionIdsPreserved: campaign.levels.map((level) => level.id),
  waveAliases,
  bossEventAliases,
  notes: [
    'Completed missions remain complete and expand to the full authored v22 wave list.',
    'Partial checkpoints map monotonically by their relative old-wave position.',
    'Historical major-boss event unlocks map to the canonical fifth-mission boss for their sector.',
    'Mission 5 keeps stage-bastion-protocol so its mastery branch and claims remain valid.'
  ]
}, null, 2)}\n`, 'utf8');

console.log(`Authored campaign revision ${campaign.revision}: ${campaign.levels.length} missions, ${campaign.levels.reduce((sum, level) => sum + level.waves.length, 0)} waves.`);
