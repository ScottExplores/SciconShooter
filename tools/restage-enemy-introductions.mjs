#!/usr/bin/env node
// Restages when each enemy role first appears in the Campaign.
//
// Revision 24 declared every one of the nineteen enemy roles as an
// introductionSector of 1 or 2, so the authored content honoured the schedule
// perfectly and still handed the player the entire bestiary before Sector 3.
// Sectors 4-10 introduced nothing new, and three roles were never authored at
// all. This walks the declared schedule out across all ten sectors and rewrites
// the authored spawn events so each Sector actually debuts something.
//
// Usage: node tools/restage-enemy-introductions.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCampaignFormationAuthoring } from './campaign-formation-authoring.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');

// One debut per Sector, ordered so each Sector adds a genuinely new problem
// rather than a higher-health version of the last one. Two constraints pin the
// early slots: the twelve generated silhouettes may not appear before Sector 2,
// and Sector 1's terrain Missions (stage-paywall-siege, stage-open-galaxy) are
// authored to fly only jet-family and journal art over ground, so those roles
// cannot be pushed later without undoing that environment art.
const INTRODUCTION_SCHEDULE = {
  // Sector 1 keeps the seven starter roles. Its two terrain Missions are
  // authored to fly the whole jet family and journal art over ground, so those
  // roles cannot move later without redoing that environment art.
  'role-orbit-scout': [1, 1],
  'role-citation-swarm': [1, 2],
  'role-research-drone': [1, 2],
  'role-jet-scout': [1, 3],
  'role-jet-interceptor': [1, 3],
  'role-jet-heavy': [1, 4],
  'role-journal-priority': [1, 4],

  // The remaining twelve used to arrive almost entirely in Sector 2, which left
  // Sectors 4-10 with nothing new to show. One or two now debut per Sector, in
  // rough order of how much new behaviour they ask the player to read.
  // stage-dark-matter-run and stage-shard-tempest carry dark-sentinel art on
  // their scorecards, so that role stays in Sector 2. Its pack, pack-dark-lanes,
  // also rosters crescent-minelayer, and a pack is only usable once every role
  // in it has been introduced -- splitting the pair stranded the pack and cost
  // those Missions their identity, so the two debut together.
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

  'role-ring-emitter': [10, 2]
};

const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));

for (const [roleId, [sector, mission]] of Object.entries(INTRODUCTION_SCHEDULE)) {
  const role = rolesById.get(roleId);
  if (!role) throw new Error(`Unknown role in schedule: ${roleId}`);
  role.introductionSector = sector;
  role.introductionMission = mission;
}
const unscheduled = campaign.enemyRoles.filter((role) => !(role.id in INTRODUCTION_SCHEDULE));
if (unscheduled.length > 0) {
  throw new Error(`Roles missing from the schedule: ${unscheduled.map((role) => role.id).join(', ')}`);
}

// Mission slot lookup, matching how validate.ts derives a Wave's graph
// position. Route alternates are not in sector.missionIds -- they hang off
// campaignGraph route nodes and inherit the slot of the main node at the same
// depth. Missing them was why the first pass left illegal roles behind.
const graphNodeById = new Map((campaign.campaignGraph?.nodes ?? []).map((node) => [node.nodeId, node]));
const slotByMissionId = new Map();
for (const sector of campaign.sectors) {
  sector.missionIds.forEach((missionId, missionIndex) => {
    slotByMissionId.set(missionId, { sectorOrder: sector.order, missionSlot: missionIndex + 1 });
  });
  const mainDepthToSlot = new Map();
  (sector.mainNodeIds ?? []).forEach((nodeId, nodeIndex) => {
    const node = graphNodeById.get(nodeId);
    if (node && typeof node.depth === 'number') mainDepthToSlot.set(node.depth, nodeIndex + 1);
  });
  for (const nodeId of sector.routeNodeIds ?? []) {
    const node = graphNodeById.get(nodeId);
    if (!node?.missionDefinitionId) continue;
    const missionSlot = mainDepthToSlot.get(node.depth);
    if (missionSlot !== undefined) {
      slotByMissionId.set(node.missionDefinitionId, { sectorOrder: sector.order, missionSlot });
    }
  }
}
const unscheduledLevels = campaign.levels.filter((level) => !slotByMissionId.has(level.id));
if (unscheduledLevels.length > 0) {
  throw new Error(`Missions with no graph slot: ${unscheduledLevels.map((level) => level.id).join(', ')}`);
}

const isAvailable = (role, slot) => role.introductionSector < slot.sectorOrder
  || (role.introductionSector === slot.sectorOrder && role.introductionMission <= slot.missionSlot);

// Sector 1's two terrain Missions fly over desert and river backgrounds and are
// authored to show only jet-family and journal art. A substitution that drops
// orbit or swarm art into them breaks that environment, so restrict their pool.
const TERRAIN_MISSION_IDS = new Set(['stage-paywall-siege', 'stage-open-galaxy']);
const isRoleAllowedInMission = (role, level) => !TERRAIN_MISSION_IDS.has(level.id)
  || role.spriteKey.startsWith('PIXI_JET_')
  || role.spriteKey === 'ENEMY_JOURNAL_FRAMES';

// Scores a replacement for a role that is no longer legal at this slot. Keeping
// the same tactical job matters more than matching threat exactly, because the
// authored Wave was built around what the enemy *does*.
const scoreSubstitute = (candidate, original) => {
  let score = 0;
  // Record cards and Sector art draw the headline enemy out of the authored
  // Waves, so a generated silhouette must not be swapped for legacy Sector 1
  // art. Downgrading these was what made Stage 7 and 8 cards show basic drones.
  const isGenerated = (role) => role.spriteKey.startsWith('CAMPAIGN_ENEMY_');
  if (isGenerated(original)) score += isGenerated(candidate) ? 120 : -120;
  if (candidate.role === original.role) score += 100;
  if (candidate.entryBehavior === original.entryBehavior) score += 40;
  if (candidate.fireBehavior === original.fireBehavior) score += 25;
  if (candidate.durabilityClass === original.durabilityClass) score += 15;
  // Never let a substitution inflate a Wave past its authored combat budget.
  const drift = candidate.threatCost - original.threatCost;
  score -= Math.abs(drift) * 8;
  if (drift > 0) score -= drift * 12;
  return score;
};

const applyRole = (enemy, role) => {
  enemy.roleId = role.id;
  enemy.enemyId = role.enemyId;
  enemy.spriteKey = role.spriteKey;
};

// A pack is usable in a Mission only if the graph has introduced every role in
// its roster and the pack itself is authored for this Sector and Mission role.
const isPackLegal = (pack, slot, level, wave) => {
  if (typeof pack.minimumSector === 'number' && pack.minimumSector > slot.sectorOrder) return false;
  const progression = level.campaignProgression ?? {};
  if (Array.isArray(pack.compatibleSectorIds) && progression.sectorId
    && !pack.compatibleSectorIds.includes(progression.sectorId)) return false;
  // validate.ts treats every Wave of a major-boss Mission except the last as
  // boss-preparation, because no pack is authored to sit beside the boss
  // itself. Reading missionRole straight off the Mission rejected every pack.
  const waveIndex = wave ? level.waves.indexOf(wave) : -1;
  const compatibilityRole = progression.missionRole === 'major-boss'
    && waveIndex >= 0 && waveIndex < level.waves.length - 1
    ? 'boss-preparation'
    : progression.missionRole;
  if (Array.isArray(pack.compatibleMissionRoles) && compatibilityRole
    && !pack.compatibleMissionRoles.includes(compatibilityRole)) return false;
  return pack.enemyRoleIds.every((roleId) => {
    const role = rolesById.get(roleId);
    return role ? isAvailable(role, slot) : false;
  });
};

// A grouped pattern is one validate.ts expects to bind to a formation pack.
const isGroupedSpawn = (event) => {
  const normalized = typeof event.patternId === 'string' ? event.patternId.trim().toLowerCase() : '';
  return normalized.length > 0 && !normalized.includes('single') && !normalized.includes('random');
};

const forEachSpawnEnemy = (visit) => {
  for (const level of campaign.levels) {
    const slot = slotByMissionId.get(level.id);
    if (!slot) continue;
    for (const wave of level.waves) {
      for (const event of wave.events ?? []) {
        if (event.kind !== 'spawn') continue;
        for (const enemy of event.enemies ?? []) {
          if (enemy.roleId) visit(enemy, { level, wave, event, slot });
        }
      }
    }
  }
};

// Pass 1: replace every role that the new schedule pushes past its Wave.
let substitutions = 0;
let dropped = 0;
let packlessGroupedEvents = 0;
const substitutionLog = new Map();
for (const level of campaign.levels) {
  const slot = slotByMissionId.get(level.id);
  if (!slot) continue;
  for (const wave of level.waves) {
    // Pack selection is Wave-scoped, not event-scoped: every pack a Wave ends
    // up declaring is charged against one shared combat budget. Choosing the
    // best-fitting pack per event independently produced Waves whose packs
    // could not all be declared, which left their events unbindable.
    const wavePacks = new Set(campaign.formationPacks.filter((pack) => (
      (wave.formationPackIds ?? []).includes(pack.id) && isPackLegal(pack, slot, level, wave)
    )));
    const declaredThreat = () => [...wavePacks].reduce((sum, pack) => sum + pack.totalThreatCost, 0);

    for (const event of wave.events ?? []) {
      if (event.kind !== 'spawn' || !Array.isArray(event.enemies)) continue;
      if (event.enemies.every((enemy) => {
        const role = enemy.roleId ? rolesById.get(enemy.roleId) : undefined;
        return !role || isAvailable(role, slot);
      })) continue;

      // Substitute at the event level, not per enemy. A grouped event must end
      // up with a role set that some formation pack fully contains, so pick the
      // replacement pack first and draw every role out of its roster. Scoring
      // roles individually produced combinations no pack covered.
      const substitutePool = isGroupedSpawn(event)
        ? (() => {
            const budget = typeof wave.combatBudget === 'number' ? wave.combatBudget : Infinity;
            const legalPacks = campaign.formationPacks.filter((pack) => isPackLegal(pack, slot, level, wave)
              // A pack already declared by this Wave is free; a new one must fit
              // in what the Wave's combat budget still has left.
              && (wavePacks.has(pack) || declaredThreat() + pack.totalThreatCost <= budget));
            // No pack is authored for this Sector/Mission-role yet. Fall back to
            // the full introduced roster so the roles are at least legal; pass 3
            // reports anything that still cannot bind.
            if (legalPacks.length === 0) {
              packlessGroupedEvents += 1;
              return campaign.enemyRoles.filter((role) => isAvailable(role, slot) && isRoleAllowedInMission(role, level));
            }
            const originals = event.enemies.map((enemy) => rolesById.get(enemy.roleId)).filter(Boolean);
            const scorePack = (pack) => {
              const roles = pack.enemyRoleIds.map((roleId) => rolesById.get(roleId)).filter(Boolean);
              const fit = originals.reduce((sum, original) => sum
                + Math.max(0, ...roles.map((role) => scoreSubstitute(role, original))), 0);
              return fit + (pack.formationShape === event.patternId ? 60 : 0)
                + (wavePacks.has(pack) ? 80 : 0)
                - Math.abs(roles.length - originals.length) * 20;
            };
            legalPacks.sort((a, b) => scorePack(b) - scorePack(a) || a.id.localeCompare(b.id));
            wavePacks.add(legalPacks[0]);
            return legalPacks[0].enemyRoleIds.map((roleId) => rolesById.get(roleId))
              .filter((role) => role && isRoleAllowedInMission(role, level));
          })()
        : campaign.enemyRoles.filter((role) => isAvailable(role, slot) && isRoleAllowedInMission(role, level));

      const kept = [];
      for (const enemy of event.enemies) {
        const original = enemy.roleId ? rolesById.get(enemy.roleId) : undefined;
        const taken = new Set(kept.map((sibling) => rolesById.get(sibling.roleId)?.enemyId).filter(Boolean));
        if (original && isAvailable(original, slot) && substitutePool.some((role) => role.id === original.id)
          && !taken.has(original.enemyId)) {
          kept.push(enemy);
          continue;
        }
        const pool = substitutePool.filter((role) => !taken.has(role.enemyId));
        if (!original || pool.length === 0) {
          // Early Sectors expose fewer distinct base enemies than some authored
          // events have entries. Drop the surplus rather than duplicate a base
          // enemy; the event count and renormalized weights keep the volume.
          dropped += 1;
          continue;
        }
        pool.sort((a, b) => scoreSubstitute(b, original) - scoreSubstitute(a, original)
          || a.id.localeCompare(b.id));
        const replacement = pool[0];
        if (replacement.id !== original.id) {
          applyRole(enemy, replacement);
          substitutions += 1;
          const key = `${original.id} -> ${replacement.id}`;
          substitutionLog.set(key, (substitutionLog.get(key) ?? 0) + 1);
        }
        kept.push(enemy);
      }
      if (kept.length > 0 && kept.length !== event.enemies.length) {
        // Enemy weights are a mix distribution and must sum to exactly 1, so
        // renormalize the survivors and settle rounding on the last entry.
        const keptTotal = kept.reduce((sum, enemy) => sum + (enemy.weight ?? 0), 0);
        if (keptTotal > 0) {
          let assigned = 0;
          kept.forEach((enemy, index) => {
            if (index === kept.length - 1) {
              enemy.weight = Number((1 - assigned).toFixed(4));
            } else {
              enemy.weight = Number(((enemy.weight ?? 0) / keptTotal).toFixed(4));
              assigned += enemy.weight;
            }
          });
        } else {
          kept.forEach((enemy, index) => { enemy.weight = index === 0 ? 1 : 0; });
        }
        event.enemies = kept;
      }
    }
  }
}

// Mirrors validate.ts: a Wave's weighted threat is the sum over spawn events of
// count * sum(weight * threatCost), and it may not exceed the combat budget.
const weightedThreatOf = (wave) => {
  let total = 0;
  for (const event of wave.events ?? []) {
    if (event.kind !== 'spawn' || typeof event.count !== 'number') continue;
    let unit = 0;
    for (const enemy of event.enemies ?? []) {
      const role = rolesById.get(enemy.roleId);
      if (role && typeof enemy.weight === 'number') unit += enemy.weight * role.threatCost;
    }
    total += event.count * unit;
  }
  return total;
};

// Pass 2: guarantee every role actually debuts in the Sector that claims it.
// Without this the later Sectors would simply keep recycling Sector 1 roles.
let debutPromotions = 0;
const debutLog = [];
for (const role of campaign.enemyRoles) {
  const debutSector = campaign.sectors[role.introductionSector - 1];
  if (!debutSector) continue;
  const missionIds = new Set(debutSector.missionIds);
  let alreadyPresent = false;
  const candidates = [];
  forEachSpawnEnemy((enemy, ctx) => {
    if (!missionIds.has(ctx.level.id)) return;
    if (enemy.roleId === role.id) alreadyPresent = true;
    if (!isAvailable(role, ctx.slot)) return;
    const current = rolesById.get(enemy.roleId);
    if (!current || current.id === role.id) return;
    const siblingEnemyIds = new Set((ctx.event.enemies ?? [])
      .filter((sibling) => sibling !== enemy)
      .map((sibling) => rolesById.get(sibling.roleId)?.enemyId)
      .filter(Boolean));
    if (siblingEnemyIds.has(role.enemyId)) return;
    // A heavier debut role is allowed only where the Wave's authored combat
    // budget still absorbs it -- the late Sectors exist to escalate, and the
    // top-tier roles have no equal-cost slot to trade into.
    candidates.push({ enemy, ctx, current, score: scoreSubstitute(role, current) });
  });
  if (alreadyPresent || candidates.length === 0) continue;
  candidates.sort((a, b) => b.score - a.score
    || a.ctx.slot.missionSlot - b.ctx.slot.missionSlot
    || a.ctx.event.id.localeCompare(b.ctx.event.id));
  const chosen = candidates.find(({ enemy, ctx, current }) => {
    const before = enemy.roleId;
    applyRole(enemy, role);
    // A debut must leave the event's role set inside some legal formation pack,
    // otherwise the Wave has nothing it can declare and the event goes unbound.
    const roleIds = [...new Set((ctx.event.enemies ?? []).map((entry) => entry.roleId).filter(Boolean))];
    const covered = !isGroupedSpawn(ctx.event) || campaign.formationPacks.some((pack) => (
      roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId))
      && isPackLegal(pack, ctx.slot, ctx.level, ctx.wave)
      && pack.totalThreatCost <= (ctx.wave.combatBudget ?? Infinity)
    ));
    const fits = role.threatCost <= current.threatCost
      || weightedThreatOf(ctx.wave) <= ctx.wave.combatBudget + 1e-9;
    applyRole(enemy, rolesById.get(before));
    return covered && fits;
  });
  if (!chosen) continue;
  applyRole(chosen.enemy, role);
  debutPromotions += 1;
  debutLog.push(`${role.id} debuts in ${chosen.ctx.level.id} (was ${chosen.current.id})`);
}

// Pass 3: rebuild each Wave's formation-pack bindings from the events it now
// actually spawns. validate.ts derives the binding the same way and rejects any
// declared pack no grouped event resolves to, so filtering the old list is not
// enough once the roles inside those events have changed.
const isGroupedFormationPattern = (patternId) => {
  // Retained for pass 3 readability; same rule as isGroupedSpawn above.
  const normalized = typeof patternId === 'string' ? patternId.trim().toLowerCase() : '';
  return normalized.length > 0 && !normalized.includes('single') && !normalized.includes('random');
};
// Mirrors validate.ts resolveDeclaredFormationPack, which only ever considers
// the packs the Wave itself declares.
const resolveAgainst = (event, declared) => {
  const roleIds = [...new Set((event.enemies ?? []).map((enemy) => enemy.roleId).filter(Boolean))];
  if (roleIds.length === 0) return undefined;
  const compatible = declared.filter((pack) => roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId)));
  if (compatible.length === 1) return compatible[0];
  const shapeMatches = compatible.filter((pack) => pack.formationShape === event.patternId);
  return shapeMatches.length === 1 ? shapeMatches[0] : undefined;
};

let packsRebound = 0;
let unbindableEvents = 0;
for (const level of campaign.levels) {
  const slot = slotByMissionId.get(level.id);
  for (const wave of level.waves) {
    if (!Array.isArray(wave.formationPackIds)) continue;
    const grouped = (wave.events ?? [])
      .filter((event) => event.kind === 'spawn' && isGroupedFormationPattern(event.patternId)
        && Array.isArray(event.enemies) && event.enemies.length > 0);

    // Greedy set cover under one shared budget: reuse a pack the Wave has
    // already declared before spending budget on a new one, so a Wave with
    // several grouped events still fits inside its authored combat budget.
    const budget = typeof wave.combatBudget === 'number' ? wave.combatBudget : Infinity;
    const declared = [];
    const spent = () => declared.reduce((sum, pack) => sum + pack.totalThreatCost, 0);
    const covers = (pack, roleIds) => roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId));

    for (const event of grouped) {
      const roleIds = [...new Set(event.enemies.map((enemy) => enemy.roleId).filter(Boolean))];
      if (roleIds.length === 0) continue;
      if (declared.some((pack) => covers(pack, roleIds))) continue;
      // A declared pack must cover the event's roles without smuggling in one
      // the player has not met, and must itself be authored for this Mission.
      const candidates = campaign.formationPacks.filter((pack) => covers(pack, roleIds)
        && isPackLegal(pack, slot, level, wave)
        && spent() + pack.totalThreatCost <= budget);
      if (candidates.length === 0) { unbindableEvents += 1; continue; }
      candidates.sort((a, b) => (b.formationShape === event.patternId) - (a.formationShape === event.patternId)
        || a.totalThreatCost - b.totalThreatCost
        || a.id.localeCompare(b.id));
      declared.push(candidates[0]);
    }

    // Resolution is by role set first and formation shape only as a tiebreak,
    // so an event whose roles sit inside two declared packs is ambiguous. Point
    // its pattern at the pack it was assigned, which is the shape that pack
    // actually flies anyway.
    for (const event of grouped) {
      if (resolveAgainst(event, declared)) continue;
      const roleIds = [...new Set(event.enemies.map((enemy) => enemy.roleId).filter(Boolean))];
      const owning = declared.filter((pack) => covers(pack, roleIds));
      if (owning.length === 0) { unbindableEvents += 1; continue; }
      event.patternId = owning[0].formationShape;
      if (!resolveAgainst(event, declared)) unbindableEvents += 1;
    }

    const ids = declared.map((pack) => pack.id);
    if (ids.join('|') !== wave.formationPackIds.join('|')) {
      wave.formationPackIds = ids;
      packsRebound += 1;
    }
  }
}

// Pass 4: hand the result to the repository's own formation normalizer so the
// checked-in manifest is already in its canonical form. Passes 1-3 keep the
// data legal; this makes it byte-identical to what the normalizer would emit,
// which is what the idempotence test checks.
const normalization = normalizeCampaignFormationAuthoring(campaign);
console.log(`Normalizer settled ${normalization.declarationChanges.length} declarations`
  + ` and ${normalization.cooldownChanges.length} cooldowns across`
  + ` ${normalization.groupedSpawnCount} grouped spawns.`);

// Report the resulting curve.
const firstSeen = new Map();
forEachSpawnEnemy((enemy, ctx) => {
  const seen = firstSeen.get(enemy.roleId);
  if (seen === undefined || ctx.slot.sectorOrder < seen) firstSeen.set(enemy.roleId, ctx.slot.sectorOrder);
});

console.log(`Substituted ${substitutions} authored enemy entries, dropped ${dropped} with no legal base enemy.`);
for (const [key, count] of [...substitutionLog].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key} x${count}`);
}
console.log(`\nForced ${debutPromotions} Sector debuts.`);
debutLog.forEach((line) => console.log(`  ${line}`));
console.log(`\nRebound formation packs on ${packsRebound} Waves.\n`);

console.log('New introduction curve:');
for (let sectorOrder = 1; sectorOrder <= campaign.sectors.length; sectorOrder += 1) {
  const debuts = campaign.enemyRoles.filter((role) => role.introductionSector === sectorOrder);
  const actual = debuts.filter((role) => firstSeen.get(role.id) === sectorOrder);
  const missing = debuts.filter((role) => firstSeen.get(role.id) !== sectorOrder);
  console.log(`  Sector ${String(sectorOrder).padStart(2)}: ${actual.length}/${debuts.length} debut  ${actual.map((role) => role.id).join(', ')}`
    + (missing.length > 0 ? `  [NOT AUTHORED: ${missing.map((role) => role.id).join(', ')}]` : ''));
}
const never = campaign.enemyRoles.filter((role) => !firstSeen.has(role.id));
console.log(`\nRoles never authored: ${never.length === 0 ? 'none' : never.map((role) => role.id).join(', ')}`);

if (process.argv.includes('--write')) {
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(root, campaignPath)}`);
} else {
  console.log('\nDry run. Pass --write to apply.');
}
