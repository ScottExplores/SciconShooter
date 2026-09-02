#!/usr/bin/env node
// Galaxiga-style escalation: the deeper the campaign, the fuller the
// squadrons and the more often they peel off to attack.
//
// Scott's brief (2026-08-04): "the higher the missions then you start getting
// more enemies". Before this pass the average block only grew ~1.6x from
// sector 1 to sector 10. This pass scales every non-boss spawn block by
// sector. Dive aggression (bigger attack groups, shorter holds) escalates in
// the engine instead -- see services/sectorEscalation.ts -- because Wave
// choreography overrides are a hand-authored, inventoried set.
//
// Guard rails kept by construction:
//   - a block never exceeds its resolved pack's authored enemyCount
//   - the Wave threatCap rises with the block so the validator's
//     "count cannot exceed threat cap" rule keeps holding
//   - introduction Missions in sectors 1-2 are untouched (the teaching floor)
//   - boss-ended Missions scale their regular blocks like everything else,
//     but their finale events (bosses, mini-bosses) are never spawn blocks
//
// Idempotent: spawn events carry a strict key allow-list, so the pre-scale
// counts live in a sidecar (game-config/campaign-escalation-base.json) keyed
// by event id; re-running scales from those, never compounding.
//
// Usage: node tools/author-sector-escalation.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAuthoredFormationPack } from './campaign-formation-authoring.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const basePath = path.join(root, 'game-config', 'campaign-escalation-base.json');
const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const baseCounts = fs.existsSync(basePath)
  ? JSON.parse(fs.readFileSync(basePath, 'utf8'))
  : {};

const SECTOR_COUNT_SCALE = Object.freeze({
  1: 1, 2: 1, 3: 1.06, 4: 1.12, 5: 1.18, 6: 1.25, 7: 1.32, 8: 1.4, 9: 1.46, 10: 1.52
});

const sectorsById = new Map(campaign.sectors.map((sector) => [sector.id, sector]));
const isGroupedSpawn = (event) => (
  event.kind === 'spawn'
  && !String(event.patternId).includes('single')
  && !String(event.patternId).includes('random')
);

let blocksScaled = 0;
let extraEnemies = 0;

for (const level of campaign.levels) {
  const role = level.campaignProgression?.missionRole;
  const sectorOrder = sectorsById.get(level.campaignProgression?.sectorId)?.order ?? 1;
  const scale = SECTOR_COUNT_SCALE[sectorOrder] ?? 1;
  if (role === 'introduction' && sectorOrder <= 2) continue;

  for (const wave of level.waves) {
    let waveMaxCount = 0;
    for (const event of wave.events ?? []) {
      if (!isGroupedSpawn(event)) continue;
      // The late-sector advanced cohorts are authored (and density-checked)
      // by their own deterministic tool; they already carry their escalation.
      if (String(event.id).includes('-advanced-enemy-v1-')) continue;
      const pack = resolveAuthoredFormationPack(event, campaign.formationPacks);
      const baseKey = `${level.id}/${wave.id}/${event.id}`;
      const baseCount = Number(baseCounts[baseKey] ?? event.count) || 0;
      if (baseCount <= 0) continue;
      baseCounts[baseKey] = baseCount;
      // Twelve is the largest block the authored campaign ever fields; the
      // diversity suite pins the advanced cohorts to it and a phone reads
      // one twelve-ship train cleanly. Escalation fills the smaller blocks
      // toward it rather than growing the biggest ones past it.
      const ceiling = Math.min(12, pack?.enemyCount ?? baseCount + 6);
      const scaled = Math.min(ceiling, Math.round(baseCount * scale));
      if (scaled !== event.count) {
        extraEnemies += scaled - event.count;
        event.count = scaled;
        blocksScaled += 1;
      }
      waveMaxCount = Math.max(waveMaxCount, event.count);
    }
    if (waveMaxCount > 0 && Number(wave.threatCap) < waveMaxCount + 6) {
      wave.threatCap = waveMaxCount + 6;
    }
  }
}

const perSector = campaign.sectors.map((sector) => {
  let enemies = 0;
  let waves = 0;
  for (const missionId of sector.missionIds) {
    const level = campaign.levels.find((candidate) => candidate.id === missionId);
    if (!level || level.campaignProgression.missionRole === 'major-boss') continue;
    waves += level.waves.length;
    for (const wave of level.waves) {
      for (const event of wave.events ?? []) if (event.kind === 'spawn') enemies += event.count;
    }
  }
  return (enemies / Math.max(1, waves)).toFixed(1);
});

console.log(`Scaled ${blocksScaled} blocks (+${extraEnemies} enemies).`);
console.log('Average enemies per wave by sector:', perSector.join(' -> '));

if (process.argv.includes('--write')) {
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  fs.writeFileSync(basePath, `${JSON.stringify(baseCounts, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, campaignPath)} and ${path.relative(root, basePath)}`);
} else {
  console.log('Dry run. Pass --write to apply.');
}
