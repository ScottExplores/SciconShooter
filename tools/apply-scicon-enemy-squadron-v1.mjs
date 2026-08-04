#!/usr/bin/env node
// Rebinds the regular Campaign roster to Scicon Enemy Squadron v1 without
// changing any role's combat tuning. Boss and Stage-20 source art remain
// registered for their existing boss/sandbox uses.
//
// Usage:
//   node tools/apply-scicon-enemy-squadron-v1.mjs          # verify/dry run
//   node tools/apply-scicon-enemy-squadron-v1.mjs --write  # update campaign.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');

export const SCICON_ENEMY_FAMILY_BY_ROLE = Object.freeze({
  'role-orbit-scout': 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  'role-jet-scout': 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  'role-orbit-disc': 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  'role-citation-swarm': 'SCICON_ENEMY_CITATION_DART_FRAMES',
  'role-jet-interceptor': 'SCICON_ENEMY_CITATION_DART_FRAMES',
  'role-research-drone': 'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES',
  'role-jet-heavy': 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'role-dark-sentinel': 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'role-shield-rammer': 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'role-protocol-vanguard': 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'role-journal-priority': 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  'role-crescent-minelayer': 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  'role-laser-hunter': 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  'role-dna-conductor': 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  'role-ring-sentinel': 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  'role-laser-stalker': 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  'role-wall-sniper-left': 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  'role-wall-sniper-right': 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  'role-prism-artillery': 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  'role-ring-emitter': 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'
});

const SCORECARD_REPLACEMENTS = Object.freeze({
  LEGACY_ENEMY_DRONE_FRAMES: 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  ENEMY_DRONE_FRAMES: 'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES',
  ENEMY_SWARM_FRAMES: 'SCICON_ENEMY_CITATION_DART_FRAMES',
  LEGACY_ENEMY_SWARM_FRAMES: 'SCICON_ENEMY_CITATION_DART_FRAMES',
  ENEMY_BRICK_FRAMES: 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  ENEMY_JOURNAL: 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  ENEMY_JOURNAL_FRAMES: 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  PIXI_JET_SCOUT_FRAMES: 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  PIXI_JET_INTERCEPTOR_FRAMES: 'SCICON_ENEMY_CITATION_DART_FRAMES',
  PIXI_JET_HEAVY_FRAMES: 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  CAMPAIGN_ENEMY_BULLET_RING_EMITTER: 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  CAMPAIGN_ENEMY_CRESCENT_MINELAYER: 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL: 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  CAMPAIGN_ENEMY_DNA_CONDUCTOR: 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  CAMPAIGN_ENEMY_LASER_HUNTER: 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  CAMPAIGN_ENEMY_LASER_STALKER: 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  CAMPAIGN_ENEMY_ORBIT_DISC: 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES: 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  CAMPAIGN_ENEMY_PRISM_ARTILLERY: 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  CAMPAIGN_ENEMY_RING_SENTINEL: 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  CAMPAIGN_ENEMY_SHIELD_RAMMER: 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  CAMPAIGN_ENEMY_WALL_SNIPER_LEFT: 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES',
  CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT: 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'
});

const normalizeWeights = (enemies) => {
  if (enemies.length === 0) throw new Error('A spawn event cannot lose every enemy while staging the new roster.');
  const total = enemies.reduce((sum, enemy) => sum + (Number(enemy.weight) || 0), 0);
  let assigned = 0;
  enemies.forEach((enemy, index) => {
    if (index === enemies.length - 1) {
      enemy.weight = Number((1 - assigned).toFixed(6));
      return;
    }
    enemy.weight = total > 0
      ? Number(((Number(enemy.weight) || 0) / total).toFixed(6))
      : Number((1 / enemies.length).toFixed(6));
    assigned += enemy.weight;
  });
};

const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
const expectedRoleIds = Object.keys(SCICON_ENEMY_FAMILY_BY_ROLE);
if (campaign.enemyRoles.length !== expectedRoleIds.length
  || expectedRoleIds.some((roleId) => !rolesById.has(roleId))) {
  const missing = expectedRoleIds.filter((roleId) => !rolesById.has(roleId));
  const extra = campaign.enemyRoles.map((role) => role.id).filter((roleId) => !(roleId in SCICON_ENEMY_FAMILY_BY_ROLE));
  throw new Error(`Squadron mapping must cover the exact active roster. Missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}.`);
}

// Mission 4 already debuts the Bulwark family. Hold the Journal family until
// the Mission 5 intercept so no Wave introduces two unseen silhouettes at once.
const missionFour = campaign.levels.find((level) => level.id === 'stage-open-galaxy');
if (!missionFour) throw new Error('Could not find the Mission 4 Bastion Approach definition.');
for (const wave of missionFour.waves) {
  for (const event of wave.events ?? []) {
    if (event.kind !== 'spawn' || !Array.isArray(event.enemies)) continue;
    const staged = event.enemies.filter((enemy) => enemy.roleId !== 'role-journal-priority');
    if (staged.length !== event.enemies.length) {
      normalizeWeights(staged);
      event.enemies = staged;
    }
  }
}

const journalRole = rolesById.get('role-journal-priority');
journalRole.introductionSector = 1;
// The Priority Diamond pack is already taught in Mission 4 and its manifest
// includes this tactical role, so pack eligibility stays at Mission 4. The
// actual Journal Raider sprite remains absent until Mission 5 below.
journalRole.introductionMission = 4;

let roleChanges = 0;
for (const role of campaign.enemyRoles) {
  const spriteKey = SCICON_ENEMY_FAMILY_BY_ROLE[role.id];
  if (role.spriteKey !== spriteKey) roleChanges += 1;
  role.spriteKey = spriteKey;
}

let eventChanges = 0;
for (const level of campaign.levels) {
  const replacement = SCORECARD_REPLACEMENTS[level.scorecard?.encounterAssetKey];
  if (replacement) level.scorecard.encounterAssetKey = replacement;
  for (const wave of level.waves) {
    for (const event of wave.events ?? []) {
      if (event.kind !== 'spawn' || !Array.isArray(event.enemies)) continue;
      for (const enemy of event.enemies) {
        const role = rolesById.get(enemy.roleId);
        if (!role) throw new Error(`${level.id}/${wave.id}/${event.id} references unknown role ${String(enemy.roleId)}.`);
        if (enemy.spriteKey !== role.spriteKey) eventChanges += 1;
        enemy.spriteKey = role.spriteKey;
      }
    }
  }
}

// Campaign branches carry their own compact encounter definitions instead of
// referencing level Waves, so they must be rebound independently.
for (const branch of campaign.campaignBranches ?? []) {
  for (const event of branch.missionDefinition?.events ?? []) {
    if (event.kind !== 'spawn' || !Array.isArray(event.enemies)) continue;
    for (const enemy of event.enemies) {
      const role = rolesById.get(enemy.roleId);
      if (!role) throw new Error(`${branch.branchId}/${event.id} references unknown role ${String(enemy.roleId)}.`);
      if (enemy.spriteKey !== role.spriteKey) eventChanges += 1;
      enemy.spriteKey = role.spriteKey;
    }
  }
}

const globalCardReplacement = SCORECARD_REPLACEMENTS[campaign.recordCard?.encounterAssetKey];
if (globalCardReplacement) campaign.recordCard.encounterAssetKey = globalCardReplacement;

const seenFamilies = new Set();
for (const level of [...campaign.levels].sort((left, right) => left.order - right.order)) {
  for (const wave of level.waves) {
    const waveFamilies = new Set((wave.events ?? [])
      .filter((event) => event.kind === 'spawn')
      .flatMap((event) => (event.enemies ?? []).map((enemy) => enemy.spriteKey)));
    const unseen = [...waveFamilies].filter((key) => !seenFamilies.has(key));
    if (unseen.length > 1) {
      throw new Error(`${level.id}/${wave.id} introduces ${unseen.length} unseen enemy families: ${unseen.join(', ')}.`);
    }
    unseen.forEach((key) => seenFamilies.add(key));
  }
}
if (seenFamilies.size !== 7) throw new Error(`Campaign uses ${seenFamilies.size} Squadron families; expected 7.`);

const output = `${JSON.stringify(campaign, null, 2)}\n`;
const current = fs.readFileSync(campaignPath, 'utf8');
console.log(`Mapped ${campaign.enemyRoles.length} roles to ${seenFamilies.size} families (${roleChanges} role and ${eventChanges} event key changes).`);
if (process.argv.includes('--write')) {
  if (current !== output) fs.writeFileSync(campaignPath, output);
  console.log(current === output ? 'Campaign already matches Squadron v1.' : 'Wrote game-config/campaign.json.');
} else {
  console.log(current === output ? 'Campaign already matches Squadron v1.' : 'Dry run complete; pass --write to apply.');
}
