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

export const RETRACTION_FLEET_ROLE_UPDATES = Object.freeze({
  'role-jet-scout': Object.freeze({
    label: 'Redline Skirmisher',
    spriteKey: 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES'
  }),
  'role-jet-interceptor': Object.freeze({
    label: 'Crosscut Raider',
    spriteKey: 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES'
  }),
  'role-jet-heavy': Object.freeze({
    label: 'Audit Bulwark',
    spriteKey: 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES'
  })
});

const THEMED_PACK_ROLE_IDS = Object.freeze({
  'role-quasar-lancer': Object.freeze(['role-quasar-lancer', 'role-jet-scout', 'role-jet-heavy']),
  'role-null-bastion': Object.freeze(['role-null-bastion', 'role-jet-heavy', 'role-research-drone']),
  'role-vector-reaver': Object.freeze(['role-vector-reaver', 'role-jet-interceptor', 'role-jet-scout']),
  'role-rift-weaver': Object.freeze(['role-rift-weaver', 'role-vector-reaver', 'role-orbit-disc']),
  'role-pulse-herald': Object.freeze(['role-pulse-herald', 'role-quasar-lancer', 'role-vector-reaver'])
});

const LIGHT_RETRACTION_ROLE_IDS = new Set(['role-jet-scout', 'role-jet-interceptor']);
const EARLY_ESCORT_ROLE_IDS = Object.freeze(['role-research-drone', 'role-citation-swarm']);
const DIVERSITY_ESCORT_ROLE_IDS = new Set([
  'role-jet-scout',
  'role-jet-interceptor',
  'role-jet-heavy',
  ...EARLY_ESCORT_ROLE_IDS,
  'role-protocol-vanguard'
]);
const STORY_ROLE_EXCLUSIONS_BY_EVENT = Object.freeze({
  // Journal Priority is deliberately held for Bastion Protocol even though
  // this earlier Wave declares the broader Priority Diamond pack.
  'stage-open-galaxy-wave-2-primary': Object.freeze(['role-journal-priority'])
});
const SURGICAL_PATTERN_BY_EVENT = Object.freeze({
  'stage-citation-storm-wave-2-primary': 'spiral',
  'stage-citation-storm-wave-6-primary': 'grid',
  'stage-paywall-siege-wave-2-primary': 'pincer',
  'stage-open-galaxy-wave-2-primary': 'diamond',
  'stage-open-orbit-route-b-wave-2-event-1': 'spiral',
  'stage-open-orbit-route-b-wave-6-event-1': 'grid'
});
const RETRACTION_DIVERSITY_LABEL = ' · Retraction mix';
const RETIRED_SPRITE_KEY_REPLACEMENTS = Object.freeze({
  PIXI_JET_SCOUT_FRAMES: 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES',
  PIXI_JET_INTERCEPTOR_FRAMES: 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES',
  PIXI_JET_HEAVY_FRAMES: 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES',
  SCICON_ENEMY_QUASAR_LANCER_FRAMES: 'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES',
  SCICON_ENEMY_VECTOR_REAVER_FRAMES: 'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES'
});
const DIVERSITY_PROFILES = Object.freeze([
  Object.freeze({
    patternId: 'pincer',
    entryPathId: 'paired-flank',
    movementId: 'lateral-sweep',
    attackId: 'pincer-pass',
    firingBehavior: 'priority',
    returnId: 'reform'
  }),
  Object.freeze({
    patternId: 'sine',
    entryPathId: 'serpentine-weave',
    movementId: 'snake-weave',
    attackId: 'alternating-wings',
    firingBehavior: 'staggered',
    returnId: 'transform'
  }),
  Object.freeze({
    patternId: 'grid',
    entryPathId: 'formation-drop',
    movementId: 'expand-collapse',
    attackId: 'row-sequence',
    firingBehavior: 'staggered',
    returnId: 'reform'
  }),
  Object.freeze({
    patternId: 'v',
    entryPathId: 'loop-the-loop',
    movementId: 'gentle-drift',
    attackId: 'paired-dive',
    firingBehavior: 'priority',
    returnId: 'retreat'
  })
]);

export const ADVANCED_ENEMY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'role-quasar-lancer',
    label: 'Quasar Lancer',
    enemyId: 'journal',
    spriteKey: 'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES',
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
    synergyTags: ['retraction-fleet', 'ranged-pressure', 'lane-control'],
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
    synergyTags: ['retraction-fleet', 'armor', 'sustained-damage'],
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
    spriteKey: 'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES',
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
    synergyTags: ['retraction-fleet', 'formation-pressure', 'ranged-pressure'],
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
    synergyTags: ['retraction-fleet', 'support', 'formation-pressure'],
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
    synergyTags: ['retraction-fleet', 'formation-pressure', 'priority'],
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

const buildPack = (campaign, definition, roleById) => {
  const tuning = PACK_TUNING_BY_ROLE[definition.id];
  const enemyRoleIds = [...THEMED_PACK_ROLE_IDS[definition.id]];
  const meanThreatCost = enemyRoleIds.reduce((sum, roleId) => (
    sum + Number(roleById.get(roleId)?.threatCost || definition.threatCost)
  ), 0) / enemyRoleIds.length;
  return {
    id: definition.packId,
    label: tuning.label,
    enemyRoleIds,
    // Weekly Run can grow these trains to its bounded 28-enemy ceiling.
    enemyCount: 28,
    totalThreatCost: round(meanThreatCost * 28 + tuning.synergyAdjustment, 2),
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

const buildRoleSetting = ({
  roleId,
  sectorOrder,
  definitionById,
  roleById,
  settingTemplateByRoleId,
  existingSetting,
  weight
}) => {
  const definition = definitionById.get(roleId);
  if (definition) return { ...buildEnemySetting(definition, sectorOrder), weight };
  const role = roleById.get(roleId);
  const template = existingSetting ?? settingTemplateByRoleId.get(roleId);
  if (!role || !template) {
    throw new Error(`Could not resolve authored enemy setting for themed escort ${roleId}.`);
  }
  return {
    ...structuredClone(template),
    enemyId: role.enemyId,
    spriteKey: role.spriteKey,
    roleId: role.id,
    weight,
    damage: 1,
    powerupDropChance: 0
  };
};

const weightedThreatForEvent = (event, roleById) => {
  if (event?.kind !== 'spawn' || !Array.isArray(event.enemies)) return 0;
  return event.enemies.reduce((sum, enemy) => (
    sum + Number(enemy.weight || 0) * Number(roleById.get(enemy.roleId)?.threatCost || 0)
  ), 0) * Number(event.count || 0);
};

const isAdvancedEvent = (event) => (
  typeof event?.id === 'string' && event.id.includes(AUTHORED_EVENT_MARKER)
);

const rewriteRetiredSpriteKeys = (value) => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      if (typeof entry === 'string' && RETIRED_SPRITE_KEY_REPLACEMENTS[entry]) {
        value[index] = RETIRED_SPRITE_KEY_REPLACEMENTS[entry];
      } else {
        rewriteRetiredSpriteKeys(entry);
      }
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && RETIRED_SPRITE_KEY_REPLACEMENTS[entry]) {
      value[key] = RETIRED_SPRITE_KEY_REPLACEMENTS[entry];
    } else {
      rewriteRetiredSpriteKeys(entry);
    }
  }
};

const waveLightRetractionShare = (wave) => {
  let total = 0;
  let light = 0;
  for (const event of wave.events ?? []) {
    if (event.kind !== 'spawn') continue;
    for (const enemy of event.enemies ?? []) {
      const expected = Number(event.count || 0) * Number(enemy.weight || 0);
      total += expected;
      if (LIGHT_RETRACTION_ROLE_IDS.has(enemy.roleId)) light += expected;
    }
  }
  return total > 0 ? light / total : 0;
};

const getRoleCompatiblePacks = (event, wave, packById) => {
  const roleIds = new Set((event.enemies ?? []).map((enemy) => enemy.roleId));
  return (wave.formationPackIds ?? [])
    .map((packId) => packById.get(packId))
    .filter((pack) => pack && [...roleIds].every((roleId) => pack.enemyRoleIds.includes(roleId)));
};

const normalizeWeights = (enemies) => {
  const light = enemies.filter((enemy) => LIGHT_RETRACTION_ROLE_IDS.has(enemy.roleId));
  const escorts = enemies.filter((enemy) => !LIGHT_RETRACTION_ROLE_IDS.has(enemy.roleId));
  if (light.length === 0 || escorts.length === 0) return enemies;
  const scaleGroup = (group, target) => {
    const sum = group.reduce((total, enemy) => total + Math.max(0, Number(enemy.weight) || 0), 0);
    const denominator = sum > 0 ? sum : group.length;
    group.forEach((enemy, index) => {
      const basis = sum > 0 ? Math.max(0, Number(enemy.weight) || 0) : 1;
      enemy.weight = index === group.length - 1
        ? round(target - group.slice(0, -1).reduce((total, entry) => total + entry.weight, 0), 6)
        : round(target * basis / denominator, 6);
    });
  };
  scaleGroup(light, 0.58);
  scaleGroup(escorts, 0.42);
  return enemies;
};

const diversifyLightRetractionWaves = ({
  campaign,
  roleById,
  packById,
  definitionById,
  settingTemplateByRoleId
}) => {
  const targetWaves = campaign.levels.flatMap((level) => level.waves
    // Sector-specific packs own their choreography and whole-wing role pools.
    // This legacy remix recipe must not rewrite a newly authored sector.
    .filter((wave) => !(wave.formationPackIds ?? []).some((packId) => (
      packById.get(packId)?.compatibleSectorIds.length === 1
    )))
    .filter((wave) => (
      waveLightRetractionShare(wave) > 0.5
      || (wave.events ?? []).some((event) => event.label?.endsWith(RETRACTION_DIVERSITY_LABEL))
    ))
    .map((wave) => ({ level, wave })));

  targetWaves.forEach(({ level, wave }, waveIndex) => {
    const sectorOrder = Number(level.campaignProgression?.sectorOrder || 1);
    (wave.events ?? []).filter((event) => event.kind === 'spawn').forEach((event, eventIndex) => {
      if (!(event.enemies ?? []).some((enemy) => LIGHT_RETRACTION_ROLE_IDS.has(enemy.roleId))) return;
      // A completed remix is authored content. Re-indexing all later shapes
      // when an earlier Mission changes would silently replace that content.
      if (event.label?.endsWith(RETRACTION_DIVERSITY_LABEL)) return;
      const storyExclusions = new Set(STORY_ROLE_EXCLUSIONS_BY_EVENT[event.id] ?? []);
      event.enemies = event.enemies.filter((enemy) => !storyExclusions.has(enemy.roleId));
      const existingRoleIds = new Set(event.enemies.map((enemy) => enemy.roleId));
      const compatiblePacks = getRoleCompatiblePacks(event, wave, packById);
      const shapeMatches = compatiblePacks.filter((pack) => pack.formationShape === event.patternId);
      const compatiblePack = compatiblePacks.length === 1
        ? compatiblePacks[0]
        : shapeMatches.length === 1 ? shapeMatches[0] : null;
      const candidates = compatiblePack
        ? compatiblePack.enemyRoleIds.filter((roleId) => (
            !existingRoleIds.has(roleId)
            && !storyExclusions.has(roleId)
            && DIVERSITY_ESCORT_ROLE_IDS.has(roleId)
          ))
        : event.patternId === 'single-random'
          ? EARLY_ESCORT_ROLE_IDS.filter((roleId) => !existingRoleIds.has(roleId))
          : [];
      for (const roleId of candidates) {
        if (existingRoleIds.size >= 3) break;
        event.enemies.push(buildRoleSetting({
          roleId,
          sectorOrder,
          definitionById,
          roleById,
          settingTemplateByRoleId,
          weight: 1
        }));
        existingRoleIds.add(roleId);
      }
      normalizeWeights(event.enemies);
      event.label = `${String(event.label || 'Retraction Fleet').replace(RETRACTION_DIVERSITY_LABEL, '')}${RETRACTION_DIVERSITY_LABEL}`;

      const postMixCompatible = getRoleCompatiblePacks(event, wave, packById);
      const surgicalPattern = SURGICAL_PATTERN_BY_EVENT[event.id];
      if (surgicalPattern) {
        event.patternId = surgicalPattern;
      } else {
        // Only six hand-audited events own bespoke choreography. Other fleet
        // remixes vary their shape while inheriting the selected pack's safe
        // movement contract instead of growing one-off behavior overrides.
        delete event.formationBehavior;
      }
      if (!surgicalPattern && event.patternId !== 'single-random' && postMixCompatible.length === 1) {
        const profile = DIVERSITY_PROFILES[(waveIndex + eventIndex + 1) % DIVERSITY_PROFILES.length];
        event.patternId = profile.patternId;
      }
    });
  });
  return targetWaves.length;
};

const advancedThreatInEvents = (events, roleById) => events.reduce((total, event) => {
  if (!isAdvancedEvent(event) || event.kind !== 'spawn') return total;
  return total + weightedThreatForEvent(event, roleById);
}, 0);

const authorWaveTrain = ({
  wave,
  definitions,
  sectorOrder,
  packById,
  roleById,
  definitionById,
  settingTemplateByRoleId,
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
    ? 6 + Math.floor((sectorOrder - 6) / 2)
    : 7 + (sectorOrder - 6);
  const spawnIntervalSeconds = round(Math.max(0.16, 0.21 - (sectorOrder - 6) * 0.01), 3);
  const newEvents = definitions.map((definition, index) => {
    const packRoleIds = THEMED_PACK_ROLE_IDS[definition.id];
    const weights = [0.5, 0.3, 0.2];
    const eventId = `${wave.id}${AUTHORED_EVENT_MARKER}${definition.id.replace(/^role-/, '')}-${index + 1}`;
    const previousEvent = previousEvents.find((event) => event.id === eventId);
    return {
      id: eventId,
      kind: 'spawn',
      label: `${definition.label} ${trainKind === 'introduction' ? 'arrival' : 'fleet cohort'}`,
      startSeconds: round(firstStart + index * startStride, 2),
      durationSeconds: 8,
      delayAfterSeconds: 0,
      blocksWaveClock: false,
      count: Math.min(12, baseCount + Math.min(index, 1)),
      patternId: PACK_TUNING_BY_ROLE[definition.id].formationShape,
      positionId: 'formation-top',
      spawnIntervalSeconds,
      enemies: packRoleIds.map((roleId, roleIndex) => buildRoleSetting({
        roleId,
        sectorOrder,
        definitionById,
        roleById,
        settingTemplateByRoleId,
        // Rebuilding an advanced lead must not replace tuned late escorts
        // with whichever early-Mission template was encountered first.
        existingSetting: previousEvent?.enemies?.find((enemy) => enemy.roleId === roleId),
        weight: weights[roleIndex]
      }))
    };
  });
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

  const newThreat = newEvents.reduce((total, event) => (
    total + weightedThreatForEvent(event, roleById)
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

  rewriteRetiredSpriteKeys(campaign);

  for (const definition of ADVANCED_ENEMY_DEFINITIONS) {
    upsertById(campaign.enemyRoles, buildRole(definition));
  }

  for (const [roleId, update] of Object.entries(RETRACTION_FLEET_ROLE_UPDATES)) {
    const role = campaign.enemyRoles.find((candidate) => candidate.id === roleId);
    if (!role) throw new Error(`Could not resolve Retraction Fleet role ${roleId}.`);
    role.label = update.label;
    role.spriteKey = update.spriteKey;
    role.synergyTags = [...new Set(['retraction-fleet', ...(role.synergyTags ?? [])])];
  }

  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const definitionById = new Map(ADVANCED_ENEMY_DEFINITIONS.map((definition) => [definition.id, definition]));
  for (const definition of ADVANCED_ENEMY_DEFINITIONS) {
    upsertById(campaign.formationPacks, buildPack(campaign, definition, roleById));
  }

  const lightPack = campaign.formationPacks.find((pack) => pack.id === 'pack-light-jet-pincer');
  if (!lightPack) throw new Error('Could not resolve the early Retraction Fleet formation pack.');
  lightPack.label = 'Retraction Scout Screen';
  lightPack.enemyRoleIds = [
    'role-jet-scout',
    'role-jet-interceptor',
    ...EARLY_ESCORT_ROLE_IDS
  ];

  const packById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  for (const pack of campaign.formationPacks) {
    // Sector authors bind their own variants at the Wave. This roster recipe
    // only extends role back-references for portable and owned advanced packs.
    if (pack.compatibleSectorIds.length === 1
      && !ADVANCED_ENEMY_DEFINITIONS.some((definition) => definition.packId === pack.id)) continue;
    for (const roleId of pack.enemyRoleIds) {
      const role = roleById.get(roleId);
      if (!role) continue;
      role.compatibleFormationPackIds = [...new Set([
        ...(role.compatibleFormationPackIds ?? []),
        pack.id
      ])];
    }
  }

  for (const level of campaign.levels) {
    for (const wave of level.waves ?? []) {
      for (const event of wave.events ?? []) {
        if (event.kind !== 'spawn') continue;
        for (const enemy of event.enemies ?? []) {
          const role = roleById.get(enemy.roleId);
          if (role) enemy.spriteKey = role.spriteKey;
        }
      }
    }
  }

  const settingTemplateByRoleId = new Map();
  for (const level of campaign.levels) {
    for (const wave of level.waves ?? []) {
      for (const event of wave.events ?? []) {
        if (event.kind !== 'spawn') continue;
        for (const enemy of event.enemies ?? []) {
          if (!settingTemplateByRoleId.has(enemy.roleId)) {
            settingTemplateByRoleId.set(enemy.roleId, structuredClone(enemy));
          }
        }
      }
    }
  }

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
      definitionById,
      settingTemplateByRoleId,
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
        definitionById,
        settingTemplateByRoleId,
        trainKind: kind
      });
    }
  }

  const diversifiedWaveCount = diversifyLightRetractionWaves({
    campaign,
    roleById,
    packById,
    definitionById,
    settingTemplateByRoleId
  });

  return {
    roleCount: ADVANCED_ENEMY_DEFINITIONS.length,
    packCount: ADVANCED_ENEMY_DEFINITIONS.length,
    authoredEventCount,
    diversifiedWaveCount
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
