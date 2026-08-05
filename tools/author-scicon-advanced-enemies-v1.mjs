#!/usr/bin/env node
/**
 * Adds the Scicon Advanced Enemy Pack v1 to the tracked Campaign and authors
 * its late-game formation trains. The pass is deterministic and idempotent:
 * run without --write to verify the checked-in JSON, or with --write to apply.
 *
 * Usage:
 *   node tools/author-scicon-advanced-enemies-v1.mjs
 *   node tools/author-scicon-advanced-enemies-v1.mjs --write
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const AUTHORED_EVENT_MARKER = '-advanced-enemy-v1-';

export const ADVANCED_ENEMY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'role-quasar-lancer',
    label: 'Quasar Lancer',
    enemyId: 'journal',
    spriteKey: 'SCICON_ENEMY_QUASAR_LANCER_FRAMES',
    role: 'suppressor',
    threatCost: 7,
    introductionSector: 6,
    introductionMission: 1,
    durabilityClass: 'elite',
    fireBehavior: 'elite-only',
    specialAttack: 'lane-laser',
    fireDelaySeconds: 2.8,
    entryBehavior: 'lane',
    characteristic: 'artillery',
    packId: 'pack-quasar-lance',
    synergyTags: ['ranged-pressure', 'lane-control'],
    maximumSimultaneousCount: 6,
    performanceCost: 4,
    baseHealth: 12,
    baseSpeed: 2.18,
    attackIntervalSeconds: 3.6,
    projectileSpeed: 4.8,
    burstCount: 1
  }),
  Object.freeze({
    id: 'role-null-bastion',
    label: 'Null Bastion',
    enemyId: 'brick',
    spriteKey: 'SCICON_ENEMY_NULL_BASTION_FRAMES',
    role: 'armored-unit',
    threatCost: 8,
    introductionSector: 7,
    introductionMission: 1,
    durabilityClass: 'elite',
    fireBehavior: 'post-formation',
    fireDelaySeconds: 2.6,
    entryBehavior: 'formation',
    characteristic: 'holder',
    packId: 'pack-null-bastion-phalanx',
    synergyTags: ['armor', 'sustained-damage'],
    maximumSimultaneousCount: 8,
    performanceCost: 5,
    baseHealth: 20,
    baseSpeed: 1.82,
    projectileSpeed: 4.2,
    burstCount: 1
  }),
  Object.freeze({
    id: 'role-vector-reaver',
    label: 'Vector Reaver',
    enemyId: 'swarm',
    spriteKey: 'SCICON_ENEMY_VECTOR_REAVER_FRAMES',
    role: 'flanker',
    threatCost: 7,
    introductionSector: 8,
    introductionMission: 1,
    durabilityClass: 'armored',
    fireBehavior: 'aimed-burst',
    fireDelaySeconds: 2.2,
    entryBehavior: 'flank',
    characteristic: 'flanker',
    packId: 'pack-vector-reaver-scissors',
    synergyTags: ['formation-pressure', 'ranged-pressure'],
    maximumSimultaneousCount: 14,
    performanceCost: 3,
    baseHealth: 10,
    baseSpeed: 3.05,
    projectileSpeed: 5.2,
    burstCount: 3
  }),
  Object.freeze({
    id: 'role-rift-weaver',
    label: 'Rift Weaver',
    enemyId: 'drone',
    spriteKey: 'SCICON_ENEMY_RIFT_WEAVER_FRAMES',
    role: 'support-unit',
    threatCost: 8,
    introductionSector: 9,
    introductionMission: 1,
    durabilityClass: 'elite',
    fireBehavior: 'elite-only',
    specialAttack: 'mine-fan',
    fireDelaySeconds: 2.5,
    entryBehavior: 'flank',
    characteristic: 'flanker',
    packId: 'pack-rift-weaver-helix',
    synergyTags: ['support', 'formation-pressure'],
    maximumSimultaneousCount: 8,
    performanceCost: 4,
    baseHealth: 15,
    baseSpeed: 2.62,
    attackIntervalSeconds: 3.2,
    projectileSpeed: 4.4,
    burstCount: 3
  }),
  Object.freeze({
    id: 'role-pulse-herald',
    label: 'Pulse Herald',
    enemyId: 'journal',
    spriteKey: 'SCICON_ENEMY_PULSE_HERALD_FRAMES',
    role: 'formation-leader',
    threatCost: 9,
    introductionSector: 10,
    introductionMission: 1,
    durabilityClass: 'elite',
    fireBehavior: 'formation-command',
    specialAttack: 'ring-burst',
    fireDelaySeconds: 2.7,
    entryBehavior: 'formation',
    characteristic: 'commander',
    packId: 'pack-pulse-herald-orbit',
    synergyTags: ['formation-pressure', 'priority'],
    maximumSimultaneousCount: 6,
    performanceCost: 5,
    baseHealth: 18,
    baseSpeed: 2.28,
    attackIntervalSeconds: 3.5,
    projectileSpeed: 4.1,
    burstCount: 6
  })
]);

const PACK_TUNING_BY_ROLE = Object.freeze({
  'role-quasar-lancer': Object.freeze({
    label: 'Quasar Cross-Lane',
    entryDirection: 'split',
    entryPath: 'side-wall-entry',
    formationShape: 'pincer',
    movementBehavior: 'lane-shift',
    attackBehavior: 'aimed-volley',
    firingBehavior: 'priority',
    returnBehavior: 'retreat',
    holdSeconds: 1.75,
    telegraphSeconds: 1,
    attackDurationSeconds: 1.7,
    attackRecoverySeconds: 1.5,
    attackGroupSize: 2,
    attackCycles: 2,
    synergyAdjustment: 4,
    mobilePerformanceCost: 20
  }),
  'role-null-bastion': Object.freeze({
    label: 'Null Bastion Phalanx',
    entryDirection: 'split',
    // loop-the-loop is the existing collision-safe low-side train gate.
    entryPath: 'loop-the-loop',
    formationShape: 'grid',
    movementBehavior: 'expand-collapse',
    attackBehavior: 'row-sequence',
    firingBehavior: 'staggered',
    returnBehavior: 'reform',
    holdSeconds: 1.9,
    telegraphSeconds: 1,
    attackDurationSeconds: 1.8,
    attackRecoverySeconds: 1.55,
    attackGroupSize: 3,
    attackCycles: 3,
    synergyAdjustment: 5,
    mobilePerformanceCost: 22
  }),
  'role-vector-reaver': Object.freeze({
    label: 'Vector Reaver Scissors',
    entryDirection: 'split',
    entryPath: 'paired-flank',
    formationShape: 'pincer',
    movementBehavior: 'lateral-sweep',
    attackBehavior: 'pincer-pass',
    firingBehavior: 'priority',
    returnBehavior: 'reform',
    holdSeconds: 1.25,
    telegraphSeconds: 0.7,
    attackDurationSeconds: 1.55,
    attackRecoverySeconds: 1.15,
    attackGroupSize: 4,
    attackCycles: 4,
    synergyAdjustment: 5,
    mobilePerformanceCost: 24
  }),
  'role-rift-weaver': Object.freeze({
    label: 'Rift Weaver Helix',
    entryDirection: 'split',
    entryPath: 'serpentine-weave',
    formationShape: 'sine',
    movementBehavior: 'snake-weave',
    attackBehavior: 'alternating-wings',
    firingBehavior: 'priority',
    returnBehavior: 'transform',
    holdSeconds: 1.45,
    telegraphSeconds: 0.85,
    attackDurationSeconds: 1.7,
    attackRecoverySeconds: 1.35,
    attackGroupSize: 3,
    attackCycles: 3,
    synergyAdjustment: 6,
    mobilePerformanceCost: 26
  }),
  'role-pulse-herald': Object.freeze({
    label: 'Pulse Herald Orbit',
    entryDirection: 'split',
    entryPath: 'ring-assemble',
    formationShape: 'spiral',
    movementBehavior: 'rotating-wheel',
    attackBehavior: 'ring-collapse',
    firingBehavior: 'priority',
    returnBehavior: 'transform',
    holdSeconds: 1.6,
    telegraphSeconds: 1.05,
    attackDurationSeconds: 1.9,
    attackRecoverySeconds: 1.6,
    attackGroupSize: 3,
    attackCycles: 3,
    synergyAdjustment: 7,
    mobilePerformanceCost: 28
  })
});

const round = (value, places = 3) => Number(value.toFixed(places));

const upsertById = (rows, next) => {
  const index = rows.findIndex((row) => row.id === next.id);
  if (index < 0) rows.push(next);
  else rows[index] = next;
};

const buildRole = (definition) => ({
  id: definition.id,
  label: definition.label,
  enemyId: definition.enemyId,
  spriteKey: definition.spriteKey,
  role: definition.role,
  threatCost: definition.threatCost,
  introductionSector: definition.introductionSector,
  introductionMission: definition.introductionMission,
  durabilityClass: definition.durabilityClass,
  fireBehavior: definition.fireBehavior,
  ...(definition.specialAttack ? { specialAttack: definition.specialAttack } : {}),
  fireDelaySeconds: definition.fireDelaySeconds,
  entryBehavior: definition.entryBehavior,
  compatibleFormationPackIds: [definition.packId],
  synergyTags: [...definition.synergyTags],
  reuseCooldownWaves: 0,
  maximumSimultaneousCount: definition.maximumSimultaneousCount,
  performanceCost: definition.performanceCost,
  characteristic: definition.characteristic
});

const buildPack = (campaign, definition) => {
  const tuning = PACK_TUNING_BY_ROLE[definition.id];
  return {
    id: definition.packId,
    label: tuning.label,
    enemyRoleIds: [definition.id],
    // Weekly Run can grow these trains to its bounded 28-enemy ceiling.
    enemyCount: 28,
    totalThreatCost: definition.threatCost * 28,
    entryDirection: tuning.entryDirection,
    entryPath: tuning.entryPath,
    formationShape: tuning.formationShape,
    firingBehavior: tuning.firingBehavior,
    synergyAdjustment: tuning.synergyAdjustment,
    minimumSector: definition.introductionSector,
    maximumSimultaneousInstances: 3,
    recoveryRequiredSeconds: 0.4,
    compatibleMissionRoles: ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation'],
    compatibleSectorIds: campaign.sectors
      .filter((sector) => sector.order >= definition.introductionSector)
      .map((sector) => sector.id),
    mobilePerformanceCost: tuning.mobilePerformanceCost,
    movementBehavior: tuning.movementBehavior,
    attackBehavior: tuning.attackBehavior,
    returnBehavior: tuning.returnBehavior,
    holdSeconds: tuning.holdSeconds,
    telegraphSeconds: tuning.telegraphSeconds,
    attackDurationSeconds: tuning.attackDurationSeconds,
    attackRecoverySeconds: tuning.attackRecoverySeconds,
    attackGroupSize: tuning.attackGroupSize,
    attackCycles: tuning.attackCycles
  };
};

const buildEnemySetting = (definition, sectorOrder) => ({
  enemyId: definition.enemyId,
  spriteKey: definition.spriteKey,
  weight: 1,
  health: round(definition.baseHealth + (sectorOrder - definition.introductionSector) * 1.75, 2),
  speed: round(definition.baseSpeed + (sectorOrder - definition.introductionSector) * 0.045, 3),
  // All enemy contact, projectiles, mines, rings, and beams cost one heart.
  damage: 1,
  scoreValue: 120 + sectorOrder * 15 + definition.threatCost * 10,
  powerupDropChance: 0,
  roleId: definition.id,
  ...(definition.specialAttack ? {
    rank: 'elite',
    attackPatternId: 'aimed-burst',
    attackIntervalSeconds: definition.attackIntervalSeconds,
    projectileSpeed: definition.projectileSpeed,
    burstCount: definition.burstCount
  } : definition.fireBehavior === 'aimed-burst' ? {
    projectileSpeed: definition.projectileSpeed,
    burstCount: definition.burstCount
  } : {})
});

const isAdvancedEvent = (event) => (
  typeof event?.id === 'string' && event.id.includes(AUTHORED_EVENT_MARKER)
);

const advancedThreatInEvents = (events, roleById) => events.reduce((total, event) => {
  if (!isAdvancedEvent(event) || event.kind !== 'spawn') return total;
  const role = roleById.get(event.enemies?.[0]?.roleId);
  return total + (role ? role.threatCost * Number(event.count || 0) : 0);
}, 0);

const authorWaveTrain = ({
  wave,
  definitions,
  sectorOrder,
  packById,
  roleById,
  trainKind
}) => {
  const previousEvents = Array.isArray(wave.events) ? wave.events : [];
  const removedThreat = advancedThreatInEvents(previousEvents, roleById);
  wave.events = previousEvents.filter((event) => !isAdvancedEvent(event));
  const advancedPackIds = new Set(ADVANCED_ENEMY_DEFINITIONS.map((entry) => entry.packId));
  wave.formationPackIds = (wave.formationPackIds ?? []).filter((packId) => !advancedPackIds.has(packId));

  const baseSpawns = wave.events.filter((event) => event.kind === 'spawn');
  const baseLastStart = baseSpawns.reduce(
    (latest, event) => Math.max(latest, Number(event.startSeconds) || 0),
    0
  );
  const firstStart = trainKind === 'introduction' ? baseLastStart + 1.45 : baseLastStart + 1.8;
  const startStride = 1.8;
  const baseCount = trainKind === 'introduction'
    ? 8 + (sectorOrder - 6)
    : 10 + (sectorOrder - 6);
  const spawnIntervalSeconds = round(Math.max(0.16, 0.21 - (sectorOrder - 6) * 0.01), 3);
  const newEvents = definitions.map((definition, index) => ({
    id: `${wave.id}${AUTHORED_EVENT_MARKER}${definition.id.replace(/^role-/, '')}-${index + 1}`,
    kind: 'spawn',
    label: `${definition.label} ${trainKind === 'introduction' ? 'arrival' : 'reinforcement train'}`,
    startSeconds: round(firstStart + index * startStride, 2),
    durationSeconds: 8,
    delayAfterSeconds: 0,
    blocksWaveClock: false,
    count: Math.min(18, baseCount + index),
    patternId: PACK_TUNING_BY_ROLE[definition.id].formationShape,
    positionId: 'formation-top',
    spawnIntervalSeconds,
    enemies: [buildEnemySetting(definition, sectorOrder)]
  }));
  wave.events.push(...newEvents);
  for (const definition of definitions) {
    if (!wave.formationPackIds.includes(definition.packId)) {
      wave.formationPackIds.push(definition.packId);
    }
  }

  const finalEvent = newEvents.at(-1);
  const requiredDuration = finalEvent
    ? finalEvent.startSeconds + finalEvent.count * finalEvent.spawnIntervalSeconds + 5
    : Number(wave.durationSeconds) || 0;
  wave.durationSeconds = Math.max(Number(wave.durationSeconds) || 0, round(requiredDuration, 2));
  for (const event of newEvents) {
    event.durationSeconds = round(Math.max(0.5, wave.durationSeconds - event.startSeconds), 2);
  }

  const newThreat = definitions.reduce((total, definition, index) => (
    total + definition.threatCost * Math.min(18, baseCount + index)
  ), 0);
  const baseBudget = Math.max(0, Number(wave.combatBudget || 0) - removedThreat);
  const declaredPackBudget = wave.formationPackIds.reduce((total, packId) => (
    total + Number(packById.get(packId)?.totalThreatCost || 0)
  ), 0);
  wave.combatBudget = round(Math.max(declaredPackBudget, baseBudget + newThreat), 2);
  wave.threatCap = Math.max(Number(wave.threatCap) || 0, 52 + (sectorOrder - 6) * 7);
  return newEvents.length;
};

export const authorSciconAdvancedEnemies = (campaign) => {
  if (!Array.isArray(campaign?.enemyRoles)
    || !Array.isArray(campaign?.formationPacks)
    || !Array.isArray(campaign?.levels)
    || !Array.isArray(campaign?.sectors)) {
    throw new Error('Advanced enemy authoring requires a complete Campaign config.');
  }

  for (const definition of ADVANCED_ENEMY_DEFINITIONS) {
    upsertById(campaign.enemyRoles, buildRole(definition));
    upsertById(campaign.formationPacks, buildPack(campaign, definition));
  }

  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const packById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  const levelById = new Map(campaign.levels.map((level) => [level.id, level]));
  const graphNodeById = new Map((campaign.campaignGraph?.nodes ?? []).map((node) => [node.nodeId, node]));
  let authoredEventCount = 0;

  for (const definition of ADVANCED_ENEMY_DEFINITIONS) {
    const sector = campaign.sectors.find((candidate) => candidate.order === definition.introductionSector);
    const introduction = levelById.get(sector?.missionIds?.[0]);
    if (!sector || !introduction?.waves?.[0]) {
      throw new Error(`Could not resolve Sector ${definition.introductionSector} introduction Mission.`);
    }
    authoredEventCount += authorWaveTrain({
      wave: introduction.waves[0],
      definitions: [definition],
      sectorOrder: sector.order,
      packById,
      roleById,
      trainKind: 'introduction'
    });
  }

  for (const sector of campaign.sectors.filter((candidate) => candidate.order >= 6)) {
    const available = ADVANCED_ENEMY_DEFINITIONS
      .filter((definition) => definition.introductionSector <= sector.order)
      .slice(-3);
    const mainRemix = levelById.get(sector.missionIds?.[1]);
    const routeNode = graphNodeById.get(sector.routeNodeIds?.[0]);
    const routeRemix = levelById.get(routeNode?.missionDefinitionId);
    for (const [kind, level] of [['main-route', mainRemix], ['alternate-route', routeRemix]]) {
      const targetWave = level?.waves?.at(-2);
      if (!targetWave) throw new Error(`Could not resolve ${sector.id} ${kind} late pressure Wave.`);
      authoredEventCount += authorWaveTrain({
        wave: targetWave,
        definitions: available,
        sectorOrder: sector.order,
        packById,
        roleById,
        trainKind: kind
      });
    }
  }

  return {
    roleCount: ADVANCED_ENEMY_DEFINITIONS.length,
    packCount: ADVANCED_ENEMY_DEFINITIONS.length,
    authoredEventCount
  };
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
  const result = authorSciconAdvancedEnemies(campaign);
  const output = `${JSON.stringify(campaign, null, 2)}\n`;
  const current = fs.readFileSync(campaignPath, 'utf8');
  console.log(
    `Advanced roster: ${result.roleCount} roles, ${result.packCount} packs, `
      + `${result.authoredEventCount} staged Campaign cohorts.`
  );
  if (process.argv.includes('--write')) {
    if (output !== current) fs.writeFileSync(campaignPath, output);
    console.log(output === current
      ? 'Campaign already includes Scicon Advanced Enemy Pack v1.'
      : 'Wrote game-config/campaign.json.');
  } else {
    console.log(output === current
      ? 'Campaign already includes Scicon Advanced Enemy Pack v1.'
      : 'Dry run differs; pass --write to apply.');
  }
}
