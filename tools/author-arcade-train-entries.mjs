#!/usr/bin/env node
// Retargets four formation packs onto the arcade train routes added for the
// Galaxiga-style swarm pass, and tightens member spacing on their spawn
// events so each cohort reads as a single-file procession behind its leader.
//
// Usage: node tools/author-arcade-train-entries.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAuthoredFormationPack } from './campaign-formation-authoring.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

// Loop trains commit to one chirality so the whole file loops together;
// serpentine keeps split/top so paired strands mirror-weave like the classic
// double snake. Every other pack keeps its signature entry for contrast.
const TRAIN_PACKS = new Map([
  ['pack-orbit-v', { entryPath: 'loop-the-loop', entryDirection: 'left' }],
  ['pack-priority-diamond', { entryPath: 'loop-the-loop', entryDirection: 'right' }],
  ['pack-dna-helix', { entryPath: 'serpentine-weave' }],
  ['pack-dark-lanes', { entryPath: 'serpentine-weave' }]
]);
const TRAIN_MEMBER_SPACING_SECONDS = 0.16;

let packsChanged = 0;
for (const pack of campaign.formationPacks) {
  const train = TRAIN_PACKS.get(pack.id);
  if (!train) continue;
  pack.entryPath = train.entryPath;
  if (train.entryDirection) pack.entryDirection = train.entryDirection;
  packsChanged++;
}

// Two authored rhythm contracts cap how tight a chain may run:
// - introduce Waves teach with 0.28-0.6s arrivals, so their trains stay loose;
// - late-sector triple bursts need group one's tail still entering when group
//   three starts (first.start + (count-1)*interval >= third.start).
const INTRODUCE_FLOOR_SECONDS = 0.28;

const isGroupedSpawn = (event) => (
  event.kind === 'spawn'
  && !String(event.patternId).includes('single')
  && !String(event.patternId).includes('random')
);

let eventsTightened = 0;
let eventsSeen = 0;
for (const level of campaign.levels) {
  for (const wave of level.waves) {
    const groupedSpawns = (wave.events ?? [])
      .filter(isGroupedSpawn)
      .sort((left, right) => left.startSeconds - right.startSeconds);
    const tripleBurst = groupedSpawns.length >= 3
      && groupedSpawns[2].startSeconds - groupedSpawns[0].startSeconds <= 2;

    for (const event of wave.events ?? []) {
      if (event.kind !== 'spawn') continue;
      const pack = resolveAuthoredFormationPack(event, campaign.formationPacks);
      if (!pack || !TRAIN_PACKS.has(pack.id)) continue;
      eventsSeen++;

      let spacing = TRAIN_MEMBER_SPACING_SECONDS;
      if (wave.rhythm === 'introduce') spacing = INTRODUCE_FLOOR_SECONDS;
      if (tripleBurst && event === groupedSpawns[0]) {
        const interleaveSpan = groupedSpawns[2].startSeconds - groupedSpawns[0].startSeconds;
        const memberGaps = Math.max(1, (Number(event.count) || 1) - 1);
        spacing = Math.max(spacing, Math.ceil((interleaveSpan / memberGaps) * 50) / 50);
      }

      if (event.spawnIntervalSeconds !== spacing) {
        event.spawnIntervalSeconds = spacing;
        eventsTightened++;
      }
    }
  }
}

fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
console.log(`packs retargeted: ${packsChanged}/4`);
console.log(`train events: ${eventsSeen}, spacing tightened on ${eventsTightened}`);
