/**
 * Replaces `single-random` drifter spawn events with real authored squadron
 * formations.
 *
 * `single-random` drops loose enemies at random x positions, which is why waves
 * read as "stuff wanders in" rather than Galaga-style squadrons flying a shape.
 *
 * Formations are not a free pattern swap: every grouped spawn must resolve to
 * exactly one formation pack, and packs carry the threat and mobile-performance
 * budget. So a drifter is only converted when a pack genuinely covers it:
 *
 *   - the pack's enemyRoleIds cover every role the event spawns;
 *   - the pack allows this sector and this mission role;
 *   - the pack's shape uniquely identifies it among the role-compatible packs,
 *     which is what resolveCampaignFormationPackForSpawn requires.
 *
 * Drifters whose role mix no pack covers are left alone rather than inventing
 * packs and silently moving the budget. They are reported so the remainder can
 * be authored deliberately in the Combat Lab.
 *
 *   node tools/author-formation-variety.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const checkOnly = process.argv.includes('--check');

const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const packs = campaign.formationPacks ?? [];

const sectorByMission = new Map();
for (const sector of campaign.sectors ?? []) {
  for (const missionId of sector.missionIds ?? []) sectorByMission.set(missionId, sector.id);
}

const rolesOf = (event) => [...new Set(
  (event.enemies ?? []).map((enemy) => enemy.roleId).filter(Boolean)
)];

const compatiblePacks = (roles, sectorId, missionRole) => packs.filter((pack) => (
  roles.length > 0
  && roles.every((roleId) => pack.enemyRoleIds.includes(roleId))
  && (!pack.compatibleSectorIds || pack.compatibleSectorIds.includes(sectorId))
  && (!pack.compatibleMissionRoles || pack.compatibleMissionRoles.includes(missionRole))
));

let converted = 0;
let skippedNoPack = 0;
let skippedAmbiguousShape = 0;
const byShape = {};
const unresolvedRoleCombos = {};

for (const level of campaign.levels) {
  const sectorId = sectorByMission.get(level.id);
  const missionRole = level.campaignProgression?.missionRole;

  for (const wave of level.waves) {
    const declared = new Set(wave.formationPackIds ?? []);

    for (const event of wave.events ?? []) {
      if (event.kind !== 'spawn' || event.patternId !== 'single-random') continue;

      const roles = rolesOf(event);
      const candidates = compatiblePacks(roles, sectorId, missionRole);
      if (candidates.length === 0) {
        skippedNoPack += 1;
        const key = roles.join('+') || '(no roles)';
        unresolvedRoleCombos[key] = (unresolvedRoleCombos[key] ?? 0) + 1;
        continue;
      }

      // The resolver takes a single role-compatible pack outright; otherwise
      // the shape must select exactly one. So only packs whose shape is unique
      // among the candidates are usable, and among those prefer one the wave
      // already declares so conversion does not widen its formation budget.
      const usable = candidates.length === 1
        ? candidates
        : candidates.filter((pack) => (
            candidates.filter((other) => other.formationShape === pack.formationShape).length === 1
          ));
      if (usable.length === 0) {
        skippedAmbiguousShape += 1;
        continue;
      }
      const preferred = usable.find((pack) => declared.has(pack.id)) ?? usable[0];

      if (!checkOnly) {
        event.patternId = preferred.formationShape;
        if (event.positionId === 'random-top' || event.positionId === 'random-top-fast') {
          event.positionId = 'formation-top';
        }
        if (!declared.has(preferred.id)) {
          declared.add(preferred.id);
          wave.formationPackIds = [...declared];
        }
      }
      converted += 1;
      byShape[preferred.formationShape] = (byShape[preferred.formationShape] ?? 0) + 1;
    }
  }
}

if (!checkOnly) {
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
}

console.log(`${checkOnly ? 'Would convert' : 'Converted'} ${converted} drifter events into authored formations.`);
console.log('Shapes assigned:', JSON.stringify(byShape));
console.log(`Left as drifters - no compatible pack: ${skippedNoPack}, shape stayed ambiguous: ${skippedAmbiguousShape}`);
if (Object.keys(unresolvedRoleCombos).length > 0) {
  console.log('Role combos still needing an authored pack:', JSON.stringify(unresolvedRoleCombos));
}
