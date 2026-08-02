const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const sectorOrderByMissionId = new Map();
for (const sector of campaign.sectors) {
  for (const missionId of sector.missionIds) sectorOrderByMissionId.set(missionId, sector.order);
}

const firstAuthoredSectorByRole = () => {
  const firstSeen = new Map();
  for (const level of campaign.levels) {
    const sectorOrder = sectorOrderByMissionId.get(level.id);
    if (sectorOrder === undefined) continue;
    for (const wave of level.waves) {
      for (const event of wave.events ?? []) {
        if (event.kind !== 'spawn') continue;
        for (const enemy of event.enemies ?? []) {
          if (!enemy.roleId) continue;
          const seen = firstSeen.get(enemy.roleId);
          if (seen === undefined || sectorOrder < seen) firstSeen.set(enemy.roleId, sectorOrder);
        }
      }
    }
  }
  return firstSeen;
};

test('every sector introduces at least one enemy the player has not fought yet', () => {
  const firstSeen = firstAuthoredSectorByRole();
  const debutsBySector = new Map();
  for (const [roleId, sectorOrder] of firstSeen) {
    debutsBySector.set(sectorOrder, [...(debutsBySector.get(sectorOrder) ?? []), roleId]);
  }

  // Revision 24 front-loaded the roster: every role was authored by Sector 3,
  // so Sectors 4-10 escalated only through health and count. A Sector that
  // debuts nothing has no new problem to teach.
  for (const sector of campaign.sectors) {
    const debuts = debutsBySector.get(sector.order) ?? [];
    assert.ok(debuts.length >= 1, `${sector.name} must debut a new enemy role, got none`);
  }
});

test('no enemy role is authored into the Campaign without ever being used', () => {
  const firstSeen = firstAuthoredSectorByRole();
  const unused = campaign.enemyRoles.filter((role) => !firstSeen.has(role.id)).map((role) => role.id);

  // wall-sniper-right, shield-rammer, and ring-emitter shipped in the catalog
  // but were never placed in a Wave, so the art and threat budget went unspent.
  assert.deepEqual(unused, [], 'every authored enemy role must appear in some Wave');
});

test('authored spawns honour the declared introduction schedule', () => {
  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const firstSeen = firstAuthoredSectorByRole();

  for (const [roleId, sectorOrder] of firstSeen) {
    const role = rolesById.get(roleId);
    assert.ok(role, `${roleId} resolves to an authored role`);
    assert.ok(
      sectorOrder >= role.introductionSector,
      `${roleId} is authored in Sector ${sectorOrder} but declares Sector ${role.introductionSector}`
    );
  }
});

test('the late Sectors carry the heaviest roles rather than repeating Sector 1', () => {
  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const firstSeen = firstAuthoredSectorByRole();
  const debutThreat = (sectorOrder) => [...firstSeen]
    .filter(([, order]) => order === sectorOrder)
    .map(([roleId]) => rolesById.get(roleId).threatCost);

  const earlyPeak = Math.max(...[1, 2, 3].flatMap(debutThreat));
  const latePeak = Math.max(...[8, 9, 10].flatMap(debutThreat));
  assert.ok(
    latePeak >= earlyPeak,
    `late-Sector debuts (${latePeak}) must be at least as threatening as early ones (${earlyPeak})`
  );
});
