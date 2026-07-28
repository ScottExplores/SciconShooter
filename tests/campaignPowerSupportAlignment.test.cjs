const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const powerSource = read('services', 'squadPowerRating.ts');
const squadSource = read('services', 'squadProgression.ts');
const hangarSource = read('components', 'SquadHangar.tsx');
const mapSource = read('components', 'CampaignMap.tsx');
const appSource = read('App.tsx');

test('the shared rating ceiling matches the authored final comfortable recommendation', () => {
  const base = Number(powerSource.match(/base:\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const main = Number(powerSource.match(/mainUpgradeLevel:\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const support = Number(powerSource.match(/equippedSupportLevel:\s*([\d_]+)/)?.[1].replaceAll('_', ''));

  assert.equal(base + (35 * main) + (10 * support), 8_860);
  assert.equal(base + (35 * main) + support, 6_826);
});

test('Hangar power counts equipped companions rather than every owned mini ship', () => {
  const powerBlock = hangarSource.slice(
    hangarSource.indexOf('const equippedPowerSupports'),
    hangarSource.indexOf('const tier =', hangarSource.indexOf('const equippedPowerSupports'))
  );
  assert.match(powerBlock, /state\.equipped\[slot\]/);
  assert.match(powerBlock, /calculateSquadPowerRating\(activeMainShipUpgrades, equippedPowerSupports\)/);
  assert.doesNotMatch(powerBlock, /Object\.values\(state\.ownedMiniShips\)/);
});

test('every authored support tag maps to concrete catalog mini ships', () => {
  const tagIds = ['anti-swarm', 'anti-armor', 'lane-control', 'boss-damage', 'survival', 'anti-summon'];
  const miniIds = new Set(
    [...squadSource.matchAll(/^\s+id:\s*'([^']+)',/gm)].map((match) => match[1])
  );

  tagIds.forEach((tag) => {
    const line = powerSource.match(new RegExp(`'?(?:${tag})'?: Object\\.freeze<MiniShipId\\[\\]>\\(\\[([^\\]]+)\\]\\)`));
    assert.ok(line, `${tag} needs a concrete support mapping`);
    const ids = [...line[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.ok(ids.length >= 2, `${tag} should offer a real choice`);
    ids.forEach((id) => assert.ok(miniIds.has(id), `${tag} references unknown mini ship ${id}`));
  });

  assert.match(mapSource, /getCampaignSupportRecommendations\(selectedSupportTags\)/);
  assert.match(mapSource, /recommendation\.shipNames\.slice\(0, 2\)\.join\(' \/ '\)/);
});

test('Campaign Lab launches distinct two-support combinations and reports their power', () => {
  assert.match(mapSource, /rightSupportId\?: string \| null/);
  assert.match(mapSource, /selectedRightSupportId\?: string/);
  assert.match(mapSource, />\s*Right support\s*</);
  assert.match(mapSource, /Selected loadout power/);
  assert.match(appSource, /campaignLabRightSupportId/);
  assert.match(appSource, /right: campaignLabRightSupport\?\.id \?\? null/);
  assert.match(appSource, /getCampaignRecommendedSupportIds\([\s\S]*?selectedMission\?\.recommendedSupportTags/);
  assert.match(appSource, /preset === 'low-power' \? 'none'/);
  assert.match(appSource, /preset === 'upgraded' \? recommendedSupports\[1\]/);
  assert.match(appSource, /loadoutPower: campaignLabLoadoutPower/);
});
