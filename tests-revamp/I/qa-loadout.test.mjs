import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the real launch expression: QA uses campaign-lab only to exclude settlement,
// and must not accidentally select the older wing/combat runtime for the same mission.
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const expression = app.match(/const squadLoadout = (runMode === 'weekly-streak'[\s\S]*?);/);
assert.ok(expression, 'App launch must expose its squad loadout selection');
const selectLoadout = new Function(
  'runMode', 'QA_CONFIG', 'authorizedCampaignLabRequest', 'campaignLabState',
  'permanentSquadStateRef', 'runShipId', 'buildWeeklyRankedLoadout',
  'buildRevampCampaignLoadout', 'buildRuntimeSquadLoadout',
  `return (${expression[1]});`
);

const weekly = { equipped: { left: 'citation-dart' } };
const permanent = { current: { campaignProgress: { completedMissionIds: [] } } };
const choose = (mode, qa, lab = null) => selectLoadout(
  mode, { enabled: qa }, lab, weekly, permanent, 'researchhub',
  (...args) => ({ builder: 'ranked', args }),
  (...args) => ({ builder: 'campaign', args }),
  (...args) => ({ builder: 'legacy', args })
);

test('QA mission and boss launches receive the exact Campaign loadout inputs', () => {
  const campaign = choose('campaign', false);
  assert.deepEqual(campaign, { builder: 'campaign', args: [weekly, permanent.current, 'researchhub'] });
  assert.deepEqual(choose('campaign-replay', false), campaign);
  assert.deepEqual(choose('campaign-lab', true), campaign);
});

test('QA loadout parity preserves authorized lab, ranked and other launch policies', () => {
  assert.equal(choose('campaign-lab', false).builder, 'legacy');
  for (const qa of [false, true]) {
    for (const mode of ['campaign-lab', 'campaign', 'campaign-replay']) {
      assert.equal(choose(mode, qa, { upgradeLevels: {} }).builder, 'legacy', `${mode}: explicit lab`);
    }
    assert.deepEqual(choose('weekly-streak', qa), { builder: 'ranked', args: [weekly] });
    for (const mode of ['standard', 'campaign-branch', 'owner-test', 'boss-archive']) {
      assert.deepEqual(choose(mode, qa), { builder: 'legacy', args: [weekly, 'researchhub'] }, mode);
    }
  }
});
