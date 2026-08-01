/**
 * Caps the gap between consecutive spawn groups inside a Wave.
 *
 * Most authored waves already space their groups 1.5-1.9s apart, but a
 * generated tail sits at 2.1s and 2.35s. Those are the waves that breach the
 * visible-combat dead-air ceiling: a two-enemy group lands, the player clears
 * it, and the playfield reads as empty until the next group is due.
 *
 * Pulling the later group earlier is a content fix. Four attempts to solve the
 * same problem in the engine all regressed something else (see the ledger), so
 * pacing is corrected where it is authored.
 *
 *   node tools/tighten-wave-spawn-gaps.mjs [--check] [--max-gap=1.8]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const checkOnly = process.argv.includes('--check');
const maxGapArg = process.argv.find((arg) => arg.startsWith('--max-gap='));
const MAX_GAP = maxGapArg ? Number(maxGapArg.split('=')[1]) : 1.8;

const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

let wavesTouched = 0;
let groupsMoved = 0;
let largestGapBefore = 0;
let largestGapAfter = 0;
const examples = [];

for (const level of campaign.levels) {
  for (const wave of level.waves) {
    const spawns = (wave.events ?? [])
      .filter((event) => event.kind === 'spawn')
      .sort((left, right) => left.startSeconds - right.startSeconds);
    if (spawns.length < 2) continue;

    const before = spawns.map((event) => event.startSeconds);
    let moved = 0;

    // Walk forward so each shift cascades into the following gap rather than
    // just relocating the problem one group later.
    for (let index = 1; index < spawns.length; index += 1) {
      const previous = spawns[index - 1].startSeconds;
      const gap = spawns[index].startSeconds - previous;
      largestGapBefore = Math.max(largestGapBefore, gap);
      if (gap <= MAX_GAP) continue;
      const next = Number((previous + MAX_GAP).toFixed(2));
      if (!checkOnly) spawns[index].startSeconds = next;
      else spawns[index] = { ...spawns[index], startSeconds: next };
      moved += 1;
    }

    for (let index = 1; index < spawns.length; index += 1) {
      largestGapAfter = Math.max(largestGapAfter, spawns[index].startSeconds - spawns[index - 1].startSeconds);
    }

    if (moved > 0 && !checkOnly) {
      // The campaign schema requires each wave's events to stay ordered by
      // startSeconds. Adjusting times without re-sorting the array breaks that.
      wave.events.sort((left, right) => left.startSeconds - right.startSeconds);
    }

    if (moved > 0) {
      wavesTouched += 1;
      groupsMoved += moved;
      if (examples.length < 4) {
        examples.push(`${wave.id}: ${before.join(', ')} -> ${spawns.map((e) => e.startSeconds).join(', ')}`);
      }
    }
  }
}

if (!checkOnly) {
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
}

console.log(`${checkOnly ? 'Would move' : 'Moved'} ${groupsMoved} spawn groups across ${wavesTouched} waves (max gap ${MAX_GAP}s).`);
console.log(`Largest inter-group gap: ${largestGapBefore.toFixed(2)}s -> ${largestGapAfter.toFixed(2)}s`);
examples.forEach((line) => console.log(`  ${line}`));
