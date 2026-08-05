#!/usr/bin/env node
// This path used to mutate the revision-24 Campaign by moving enemy-role
// introductions and rebinding formation packs. That migration is complete.
// Replaying the old rewrite would undo authored choreography. Keep the command
// as a non-mutating compatibility check for the restored roster plus the five
// generated late-game families.
//
// Usage: node tools/restage-enemy-introductions.mjs

// `--write` is deliberately rejected. Enemy staging now belongs in
// game-config/campaign.json and the role-aware Squadron migration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');

const INTRODUCTION_SCHEDULE = Object.freeze({
  'role-orbit-scout': [1, 1],
  'role-citation-swarm': [1, 2],
  'role-research-drone': [1, 2],
  'role-jet-scout': [1, 3],
  'role-jet-interceptor': [1, 3],
  'role-jet-heavy': [1, 4],
  'role-journal-priority': [1, 4],
  'role-protocol-vanguard': [1, 4],
  'role-dark-sentinel': [2, 2],
  'role-crescent-minelayer': [2, 2],
  'role-orbit-disc': [2, 3],
  'role-wall-sniper-left': [3, 2],
  'role-laser-stalker': [3, 4],
  'role-dna-conductor': [4, 2],
  'role-wall-sniper-right': [5, 2],
  'role-laser-hunter': [6, 2],
  'role-shield-rammer': [7, 2],
  'role-prism-artillery': [8, 2],
  'role-ring-sentinel': [9, 2],
  'role-ring-emitter': [10, 2],
  'role-quasar-lancer': [6, 1],
  'role-null-bastion': [7, 1],
  'role-vector-reaver': [8, 1],
  'role-rift-weaver': [9, 1],
  'role-pulse-herald': [10, 1]
});

// Compact Retraction Fleet art replaces the obsolete pink terrain jets and
// the two needle-shaped advanced hulls. Other established silhouettes remain
// distinct instead of being collapsed into one generic squadron family.
const ROLE_SPRITE_KEYS = Object.freeze({
  'role-orbit-scout': 'LEGACY_ENEMY_DRONE_FRAMES',
  'role-research-drone': 'ENEMY_DRONE_FRAMES',
  'role-citation-swarm': 'ENEMY_SWARM_FRAMES',
  'role-jet-scout': 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES',
  'role-jet-interceptor': 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES',
  'role-jet-heavy': 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES',
  'role-journal-priority': 'ENEMY_JOURNAL_FRAMES',
  'role-dna-conductor': 'CAMPAIGN_ENEMY_DNA_CONDUCTOR',
  'role-laser-stalker': 'CAMPAIGN_ENEMY_LASER_STALKER',
  'role-orbit-disc': 'CAMPAIGN_ENEMY_ORBIT_DISC',
  'role-protocol-vanguard': 'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES',
  'role-wall-sniper-left': 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT',
  'role-wall-sniper-right': 'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT',
  'role-laser-hunter': 'CAMPAIGN_ENEMY_LASER_HUNTER',
  'role-dark-sentinel': 'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL',
  'role-crescent-minelayer': 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER',
  'role-shield-rammer': 'CAMPAIGN_ENEMY_SHIELD_RAMMER',
  'role-prism-artillery': 'CAMPAIGN_ENEMY_PRISM_ARTILLERY',
  'role-ring-sentinel': 'CAMPAIGN_ENEMY_RING_SENTINEL',
  'role-ring-emitter': 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER',
  'role-quasar-lancer': 'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES',
  'role-null-bastion': 'SCICON_ENEMY_NULL_BASTION_FRAMES',
  'role-vector-reaver': 'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES',
  'role-rift-weaver': 'SCICON_ENEMY_RIFT_WEAVER_FRAMES',
  'role-pulse-herald': 'SCICON_ENEMY_PULSE_HERALD_FRAMES'
});

const SCICON_FAMILY_KEYS = new Set(Object.values(ROLE_SPRITE_KEYS));

const RETIRED_REGULAR_KEYS = new Set([
  'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  'SCICON_ENEMY_CITATION_DART_FRAMES',
  'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES',
  'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'
]);

const campaignSlotByMissionId = (campaign) => {
  const graphNodes = new Map((campaign.campaignGraph?.nodes ?? []).map((node) => [node.nodeId, node]));
  const slots = new Map();
  for (const sector of campaign.sectors ?? []) {
    (sector.missionIds ?? []).forEach((missionId, index) => {
      slots.set(missionId, { sector: sector.order, mission: index + 1 });
    });
    const mainSlotByDepth = new Map();
    (sector.mainNodeIds ?? []).forEach((nodeId, index) => {
      const node = graphNodes.get(nodeId);
      if (Number.isFinite(node?.depth)) mainSlotByDepth.set(node.depth, index + 1);
    });
    for (const nodeId of sector.routeNodeIds ?? []) {
      const node = graphNodes.get(nodeId);
      const mission = mainSlotByDepth.get(node?.depth);
      if (node?.missionDefinitionId && mission !== undefined) {
        slots.set(node.missionDefinitionId, { sector: sector.order, mission });
      }
    }
  }
  return slots;
};

const isEarlierThanIntroduction = (slot, role) => (
  slot.sector < role.introductionSector
  || (slot.sector === role.introductionSector && slot.mission < role.introductionMission)
);

export const auditEnemyIntroductionSchedule = (campaign) => {
  const issues = [];
  if (!Array.isArray(campaign?.enemyRoles)) issues.push('Campaign enemyRoles must be an array.');
  if (!Array.isArray(campaign?.levels)) issues.push('Campaign levels must be an array.');
  if (!Array.isArray(campaign?.sectors)) issues.push('Campaign sectors must be an array.');
  if (issues.length > 0) return { issues, roleCount: 0, familyCount: 0, authoredRoleCount: 0 };

  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const scheduledIds = new Set(Object.keys(INTRODUCTION_SCHEDULE));
  for (const [roleId, [sector, mission]] of Object.entries(INTRODUCTION_SCHEDULE)) {
    const role = rolesById.get(roleId);
    if (!role) {
      issues.push(`Introduction schedule references missing role ${roleId}.`);
      continue;
    }
    if (role.introductionSector !== sector || role.introductionMission !== mission) {
      issues.push(`${roleId} introduction is ${role.introductionSector}/${role.introductionMission}; expected ${sector}/${mission}.`);
    }
  }
  for (const role of campaign.enemyRoles) {
    if (!scheduledIds.has(role.id)) issues.push(`Role ${role.id} is missing from the introduction schedule.`);
    const expectedKey = ROLE_SPRITE_KEYS[role.id];
    if (expectedKey && role.spriteKey !== expectedKey) {
      issues.push(`Role ${role.id} uses sprite key ${role.spriteKey}; the restored legacy roster expects ${expectedKey}.`);
    } else if (!expectedKey && !SCICON_FAMILY_KEYS.has(role.spriteKey)) {
      issues.push(`Role ${role.id} uses unknown sprite key ${role.spriteKey}.`);
    }
  }

  const slots = campaignSlotByMissionId(campaign);
  const authoredRoleIds = new Set();
  const activeFamilies = new Set();
  const seenFamilies = new Set();
  const levels = campaign.levels.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  for (const level of levels) {
    const slot = slots.get(level.id);
    if (!slot) {
      issues.push(`Mission ${level.id} has no Campaign graph slot.`);
      continue;
    }
    const waves = (level.waves ?? []).slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (const wave of waves) {
      const waveFamilies = new Set();
      for (const event of wave.events ?? []) {
        if (event.kind !== 'spawn') continue;
        for (const enemy of event.enemies ?? []) {
          const role = rolesById.get(enemy.roleId);
          if (!role) {
            issues.push(`${level.id}/${wave.id}/${event.id} references unknown role ${enemy.roleId}.`);
            continue;
          }
          authoredRoleIds.add(role.id);
          if (isEarlierThanIntroduction(slot, role)) {
            issues.push(`${role.id} appears in ${level.id} before its ${role.introductionSector}/${role.introductionMission} introduction.`);
          }
          if (enemy.spriteKey !== role.spriteKey) {
            issues.push(`${level.id}/${wave.id}/${event.id} maps ${role.id} to ${enemy.spriteKey}; expected ${role.spriteKey}.`);
          }
          if (RETIRED_REGULAR_KEYS.has(enemy.spriteKey)) {
            issues.push(`${level.id}/${wave.id}/${event.id} reintroduces retired sprite key ${enemy.spriteKey}.`);
          }
          if (!SCICON_FAMILY_KEYS.has(enemy.spriteKey)) {
            issues.push(`${level.id}/${wave.id}/${event.id} uses non-Squadron regular key ${enemy.spriteKey}.`);
          } else {
            activeFamilies.add(enemy.spriteKey);
            waveFamilies.add(enemy.spriteKey);
          }
        }
      }
      const newFamilies = [...waveFamilies].filter((family) => !seenFamilies.has(family));
      // The legacy roster deliberately debuts thematic pairs together (the two
      // jets, journal + vanguard, sentinel + minelayer). Three or more new
      // silhouettes in one wave is still unreadable art soup.
      if (newFamilies.length > 2) {
        issues.push(`${level.id}/${wave.id} debuts ${newFamilies.length} enemy families at once: ${newFamilies.join(', ')}.`);
      }
      newFamilies.forEach((family) => seenFamilies.add(family));
    }
  }

  for (const role of campaign.enemyRoles) {
    if (!authoredRoleIds.has(role.id)) issues.push(`Role ${role.id} is never authored in an active spawn.`);
  }
  if (activeFamilies.size !== SCICON_FAMILY_KEYS.size) {
    issues.push(`Active Campaign uses ${activeFamilies.size}/${SCICON_FAMILY_KEYS.size} Squadron families.`);
  }

  return {
    issues,
    roleCount: campaign.enemyRoles.length,
    familyCount: activeFamilies.size,
    authoredRoleCount: authoredRoleIds.size
  };
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    throw new Error('The enemy-introduction rewrite is retired and no longer accepts --write. Edit validated Campaign data or use the role-aware Squadron migration.');
  }
  const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
  const result = auditEnemyIntroductionSchedule(campaign);
  if (result.issues.length > 0) {
    throw new Error(`Enemy introduction check failed:\n- ${result.issues.join('\n- ')}`);
  }
  console.log('Enemy introduction migration is retired; current Campaign check passed.');
  console.log(`Roles ${result.authoredRoleCount}/${result.roleCount}; Squadron families ${result.familyCount}/${SCICON_FAMILY_KEYS.size}.`);
  console.log('No files written.');
}
