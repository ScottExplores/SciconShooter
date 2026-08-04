#!/usr/bin/env node
// Authors extra waves for the Campaign's pure-combat Missions.
//
// Introduction Missions go 4 -> 6 waves and formation-remix Missions -- the
// shape showcases -- go 4 -> 7. Elite-checkpoint, boss-preparation, and
// major-boss Missions are untouched: they end on a boss, and the player asked
// for more waves everywhere EXCEPT the boss and elite Missions.
//
// This is an authoring pass, not a clone pass (see the ledger for why cloning
// failed). Every new wave is composed from the Mission's own declared formation
// packs, so pack legality, the introduction schedule, and role/sprite pairing
// hold by construction:
//
//   - each spawn event uses one pack's full roster with the pack's own shape,
//     which is exactly what makes the validator's binding resolve to one pack
//   - enemy stats are copied from the Mission's existing events for the same
//     role, so authored tuning carries over instead of being reinvented
//   - the final wave's loot window moves to the new final wave
//
// Usage: node tools/author-extra-formation-waves.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCampaignFormationAuthoring } from './campaign-formation-authoring.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');

const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
const packsById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
const sectorsById = new Map(campaign.sectors.map((sector) => [sector.id, sector]));

/**
 * Scott's follow-up ask: vary the counts instead of one flat number per role,
 * and keep the pre-boss taper (elite-checkpoint, boss-preparation, and
 * major-boss Missions stay short and are never extended here).
 *
 *   introduction     6, growing to 7 from sector 7 on
 *   formation-remix  7; each sector's FIRST remix grows to 8 from sector 4 on
 */
const targetWavesFor = (level) => {
  const role = level.campaignProgression?.missionRole;
  const sector = sectorsById.get(level.campaignProgression?.sectorId);
  const sectorOrder = sector?.order ?? 1;
  if (role === 'introduction') return sectorOrder >= 7 ? 7 : 6;
  if (role === 'formation-remix') {
    const remixIds = (sector?.missionIds ?? []).filter((missionId) => (
      campaign.levels.find((candidate) => candidate.id === missionId)
        ?.campaignProgression?.missionRole === 'formation-remix'
    ));
    return remixIds[0] === level.id && sectorOrder >= 4 ? 8 : 7;
  }
  return 0;
};

/** The stats this Mission already authored for a role, so tuning carries over. */
const findAuthoredEnemyStats = (level, roleId) => {
  for (const wave of level.waves) {
    for (const event of wave.events ?? []) {
      if (event.kind !== 'spawn') continue;
      const match = (event.enemies ?? []).find((enemy) => enemy.roleId === roleId);
      if (match) return match;
    }
  }
  return null;
};

/** Weighted threat exactly as validate.ts computes it. */
const eventThreat = (event) => event.count * (event.enemies ?? [])
  .reduce((sum, enemy) => sum + enemy.weight * (rolesById.get(enemy.roleId)?.threatCost ?? 0), 0);

const buildPackEvent = (level, pack, waveId, eventIndex, startSeconds, difficultyStep) => {
  const roster = pack.enemyRoleIds
    .map((roleId) => rolesById.get(roleId))
    .filter(Boolean);
  const seen = new Set();
  const distinct = roster.filter((role) => (
    seen.has(role.enemyId) ? false : (seen.add(role.enemyId), true)
  ));
  const share = Math.floor(100 / distinct.length) / 100;
  const enemies = distinct.map((role, index) => {
    const authored = findAuthoredEnemyStats(level, role.id);
    return {
      enemyId: role.enemyId,
      spriteKey: role.spriteKey,
      weight: index === distinct.length - 1
        ? Number((1 - share * (distinct.length - 1)).toFixed(4))
        : share,
      health: authored?.health ?? 3,
      speed: authored?.speed ?? 2.4,
      damage: authored?.damage ?? 1,
      scoreValue: authored?.scoreValue ?? 12,
      powerupDropChance: 0,
      roleId: role.id
    };
  });

  return {
    id: `${waveId}-e${eventIndex}`,
    kind: 'spawn',
    label: `${pack.label} block`,
    startSeconds,
    // Non-blocking events must finish inside the 9s wave clock; the second
    // block starts at 2.2s (the pacing suite allows at most 2.5s between
    // authored entry starts) so its window is capped to fit.
    durationSeconds: startSeconds > 0 ? 6.6 : 6.5,
    delayAfterSeconds: 0,
    blocksWaveClock: false,
    // A slightly fuller block each added wave, clamped by the pack's own size.
    count: Math.min(pack.enemyCount, 5 + difficultyStep),
    patternId: pack.formationShape,
    positionId: 'formation-top',
    // Tight spacing: a 0.34s interval left the block's tail still entering
    // after fast loadouts had shredded the front, which read as dead air.
    // Tighter entry also reads more like a Galaxiga block.
    spawnIntervalSeconds: 0.24,
    enemies
  };
};

let added = 0;
let missionsTouched = 0;

for (const level of campaign.levels) {
  const role = level.campaignProgression?.missionRole;
  const target = targetWavesFor(level);
  if (!target || level.waves.length >= target) continue;

  // The packs this Mission already declares are legal at its graph slot by
  // construction; new waves draw only from them.
  const declaredPacks = [...new Set(level.waves.flatMap((wave) => wave.formationPackIds ?? []))]
    .map((packId) => packsById.get(packId))
    .filter(Boolean);
  if (declaredPacks.length === 0) continue;

  // Template from the wave just before the climax, so the surges inherit
  // mid-Mission pacing rather than finale pacing.
  const template = level.waves[level.waves.length - 2] ?? level.waves[level.waves.length - 1];
  const needed = target - level.waves.length;
  // Earlier passes already authored `-wave-extra-N` waves; keep numbering
  // (and the surge difficulty step) continuous instead of colliding with them.
  const existingExtras = level.waves.filter((wave) => wave.id.includes('-wave-extra-')).length;
  missionsTouched += 1;

  for (let offset = 1; offset <= needed; offset += 1) {
    const step = existingExtras + offset;
    const waveId = `${level.id}-wave-extra-${step}`;
    // Alternate which packs lead so consecutive waves show different blocks,
    // which also keeps role reuse from stacking the same roster back to back.
    const first = declaredPacks[(step - 1) % declaredPacks.length];
    const second = declaredPacks.length > 1
      ? declaredPacks[step % declaredPacks.length]
      : null;

    // The first matrix run with two full blocks and stepped difficulty put
    // 25-35% death rates on the extended Missions while the untouched ones sat
    // at 8-10%. Introductions get one block per surge; only the remix
    // showcase overlaps two.
    const events = [buildPackEvent(level, first, waveId, 0, 0, step)];
    if (role === 'formation-remix' && second && second.id !== first.id) {
      events.push(buildPackEvent(level, second, waveId, 1, 2.2, step));
    }

    const packBudget = (second && second.id !== first.id
      ? first.totalThreatCost + second.totalThreatCost
      : first.totalThreatCost);
    const spawnThreat = events.reduce((sum, event) => sum + eventThreat(event), 0);
    const combatBudget = Math.max(template.combatBudget ?? 0, packBudget, spawnThreat) + 1;

    const wave = {
      ...JSON.parse(JSON.stringify(template)),
      id: waveId,
      name: `${level.name} Surge ${step}`,
      completionRule: 'clear-after-duration',
      // Flat, not stepped: surges are extra waves inside an already-ramped
      // Mission, and stepping them stacked heat the Mission never budgeted.
      difficultyMultiplier: template.difficultyMultiplier ?? 1,
      durationSeconds: 9,
      introSeconds: 0,
      delayAfterSeconds: 0,
      threatCap: Math.max(template.threatCap ?? 18, events.reduce((sum, event) => Math.max(sum, event.count), 0) + 6),
      combatBudget,
      formationPackIds: [...new Set(events.map((_, index) => (index === 0 ? first.id : second.id)))],
      events
    };
    // Inserted BEFORE the authored final wave: that wave is the Mission's
    // designed climax, and the record card, loot window, and pressure checks
    // all key off it. The surges build toward it instead of trailing after it.
    level.waves.splice(level.waves.length - 1, 0, wave);
    added += 1;
  }

  level.waves.forEach((wave, index) => { wave.order = index + 1; });

  // The graph advertises each Mission's wave count, and the Director validator
  // enforces that it matches. Keep it truthful.
  for (const node of campaign.campaignGraph?.nodes ?? []) {
    if (node.missionDefinitionId === level.id && node.routeSummary) {
      node.routeSummary.estimatedWaveCount = level.waves.length;
    }
  }
}

const normalization = normalizeCampaignFormationAuthoring(campaign);

const waveCounts = {};
for (const level of campaign.levels) {
  waveCounts[level.waves.length] = (waveCounts[level.waves.length] ?? 0) + 1;
}
const sectorWaves = campaign.sectors.map((sector) => sector.missionIds
  .reduce((sum, id) => sum + (campaign.levels.find((level) => level.id === id)?.waves.length ?? 0), 0));

console.log(`Authored ${added} waves across ${missionsTouched} Missions.`);
console.log('Waves per Mission:', JSON.stringify(waveCounts));
console.log('Waves per Sector:', JSON.stringify(sectorWaves));
console.log(`Normalizer settled ${normalization.declarationChanges.length} declarations, ${normalization.cooldownChanges.length} cooldowns.`);

if (process.argv.includes('--write')) {
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, campaignPath)}`);

  // The v24 migration maps every wave id a save may reference to a current
  // wave id, and its alias table must cover each Mission's full wave list.
  // New waves alias to themselves: no old save can reference them.
  const migrationPath = path.join(root, 'game-config', 'campaign-migration-v24.json');
  const migration = JSON.parse(fs.readFileSync(migrationPath, 'utf8'));
  for (const level of campaign.levels) {
    const aliases = migration.waveAliases[level.id];
    if (!aliases) continue;
    for (const wave of level.waves) {
      if (!(wave.id in aliases)) aliases[wave.id] = wave.id;
    }
  }
  fs.writeFileSync(migrationPath, `${JSON.stringify(migration, null, 2)}\n`);
  console.log('Wrote game-config/campaign-migration-v24.json');
} else {
  console.log('Dry run. Pass --write to apply.');
}
