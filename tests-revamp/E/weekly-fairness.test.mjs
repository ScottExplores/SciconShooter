import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['services/revamp/weekly/rankedLoadout.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { buildWeeklyRankedLoadout } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('purchased ships, upgrades, support slots and currencies give no ranked power advantage', () => {
  const identity = { profileId: 'pilot', weekKey: '2026-10-11' };
  const guest = { ...identity, coins: 0, shipUpgrades: {}, ownedMiniShips: {}, equipped: {} };
  const paid = { ...identity, coins: 1000000, shipUpgrades: { researchhub: { fireRate: 7, speed: 7, startingHearts: 7 } }, ownedMiniShips: { 'citation-dart': 5 }, unlockedSlots: { left: true, right: true }, equipped: { left: 'citation-dart', right: 'citation-dart' } };
  const before = structuredClone(paid);
  assert.deepEqual(buildWeeklyRankedLoadout(guest), buildWeeklyRankedLoadout(paid));
  assert.deepEqual(paid, before, 'Campaign inventory must remain intact');
  assert.equal(buildWeeklyRankedLoadout(paid).mainShipId, 'researchhub');
  const previous = buildWeeklyRankedLoadout(paid);
  previous.upgrades.fireRate = 100;
  assert.equal(buildWeeklyRankedLoadout(paid).upgrades.fireRate, 0, 'each flight has fresh baseline power');
});
