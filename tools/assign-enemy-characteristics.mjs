#!/usr/bin/env node
// Assigns a combat characteristic to every enemy role.
//
// Chosen so the roster reads as a mix rather than a pile of interchangeable
// ships: something always holds the block, something always commits at you,
// something always comes in from the side, and the heavy hitters sit high and
// shell you instead of joining the melee.
//
// Usage: node tools/assign-enemy-characteristics.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');

const ASSIGNMENTS = {
  // Light bodies are the ones that peel off and dive, the classic arcade beat.
  'role-orbit-scout': 'diver',
  'role-citation-swarm': 'kamikaze',

  // Standard shooters anchor the block so there is always something to shoot at.
  'role-research-drone': 'holder',
  'role-jet-heavy': 'holder',
  'role-dna-conductor': 'holder',
  'role-dark-sentinel': 'holder',

  // Side pressure, so the player cannot camp the bottom centre.
  'role-jet-scout': 'flanker',
  'role-orbit-disc': 'flanker',
  'role-crescent-minelayer': 'flanker',

  // Hunters commit to the dive and loop back for another pass.
  'role-jet-interceptor': 'diver',
  'role-journal-priority': 'diver',
  'role-laser-hunter': 'diver',

  // Armour that commits is the threat you have to shoot down, not dodge past.
  'role-shield-rammer': 'kamikaze',

  // Everything with aimed fire sits high and shells the player.
  'role-wall-sniper-left': 'artillery',
  'role-wall-sniper-right': 'artillery',
  'role-laser-stalker': 'artillery',
  'role-prism-artillery': 'artillery',
  'role-ring-emitter': 'artillery',

  // The one hull that pulls its neighbours out of the block with it.
  'role-ring-sentinel': 'commander'
};

const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const missing = campaign.enemyRoles.filter((role) => !(role.id in ASSIGNMENTS));
if (missing.length > 0) {
  throw new Error(`Roles with no characteristic: ${missing.map((role) => role.id).join(', ')}`);
}
const unknown = Object.keys(ASSIGNMENTS).filter(
  (id) => !campaign.enemyRoles.some((role) => role.id === id)
);
if (unknown.length > 0) {
  throw new Error(`Assignments for roles that do not exist: ${unknown.join(', ')}`);
}

const counts = {};
for (const role of campaign.enemyRoles) {
  role.characteristic = ASSIGNMENTS[role.id];
  counts[role.characteristic] = (counts[role.characteristic] ?? 0) + 1;
}

console.log('Characteristic spread across the roster:');
for (const [characteristic, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${characteristic.padEnd(10)} ${count}`);
}
console.log('\nPer role:');
for (const role of campaign.enemyRoles) {
  console.log(`  ${role.id.padEnd(24)} ${role.characteristic.padEnd(10)} (${role.role}, ${role.entryBehavior}, ${role.fireBehavior})`);
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(root, campaignPath)}`);
} else {
  console.log('\nDry run. Pass --write to apply.');
}
