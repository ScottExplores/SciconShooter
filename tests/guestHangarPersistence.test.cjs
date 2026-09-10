const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const compiled = esbuild.buildSync({
  stdin: {
    contents: "export * as squad from './services/squadProgression'; export * as pilot from './services/pilotProfileService';",
    resolveDir: path.resolve(__dirname, '..'), sourcefile: 'guest-hangar-test.ts'
  }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent'
});
const serviceModule = { exports: {} };
Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, serviceModule, serviceModule.exports);
const { squad, pilot } = serviceModule.exports;
const id = 'pilot:guest-hangar-test';
const key = `scicon_weekly_squad_v4:${id}`;
const permanentKey = `scicon_permanent_squad_v1:${id}`;
const journalKey = `scicon_campaign_settlement_v1:${id}`;

const setup = (t) => {
  const previous = global.window;
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  global.window = { localStorage: storage, dispatchEvent() {} };
  t.after(() => { global.window = previous; });
  const state = { ...squad.createWeeklySquadState(id), coins: 10000, durableCampaignCoins: 10000 };
  return { values, storage, state };
};

test('wallet-free identity and purchased upgrades survive a real serialize/reload cycle', (t) => {
  const { state } = setup(t);
  assert.equal(pilot.initializeLocalPilotProfile().id, pilot.initializeLocalPilotProfile().id);
  let bought = state;
  for (const ship of ['researchhub', 'bio', 'eth', 'btc']) {
    for (const upgrade of ['fireRate', 'speed', 'ability', 'startingHearts']) {
      bought = squad.upgradeMainShip(bought, ship, upgrade);
    }
  }
  squad.saveWeeklySquadState(bought);
  const reloaded = squad.loadWeeklySquadState(id);
  assert.deepEqual(reloaded.shipUpgrades, bought.shipUpgrades);
  assert.equal(reloaded.coins, bought.coins);
  for (const ship of ['researchhub', 'bio', 'eth', 'btc']) {
    assert.deepEqual(squad.buildRuntimeSquadLoadout(reloaded, ship).upgrades, bought.shipUpgrades[ship]);
  }
});

test('an older device save is migrated without deleting its original upgrade record', (t) => {
  const { storage, state } = setup(t);
  const bought = squad.upgradeMainShip(state, 'researchhub', 'speed');
  const legacyKey = `scicon_weekly_squad_v3:${id}`;
  const raw = JSON.stringify({ ...bought, version: 3 });
  storage.setItem(legacyKey, raw);
  assert.equal(squad.loadWeeklySquadState(id).shipUpgrades.researchhub.speed, 1);
  assert.equal(storage.getItem(legacyKey), raw);
  assert.equal(JSON.parse(storage.getItem(key)).shipUpgrades.researchhub.speed, 1);
});

test('opening a damaged save never replaces it with an empty Hangar', (t) => {
  const { storage } = setup(t);
  storage.setItem(key, '{interrupted-save');
  assert.throws(() => squad.loadWeeklySquadState(id), /save|storage/i);
  assert.equal(storage.getItem(key), '{interrupted-save');
});

test('weekly rollover retains Hangar upgrades and earned campaign Tokens', (t) => {
  const { state } = setup(t);
  const bought = squad.upgradeMainShip(state, 'researchhub', 'fireRate');
  squad.saveWeeklySquadState({ ...bought, weekKey: '2020-01-05' });
  const loaded = squad.loadWeeklySquadState(id);
  assert.equal(loaded.shipUpgrades.researchhub.fireRate, 1);
  assert.equal(loaded.coins, bought.durableCampaignCoins);
});

test('guest Hangar commits use the latest saved state, not a stale open tab', (t) => {
  const { state } = setup(t);
  squad.saveWeeklySquadState(state);
  squad.commitLocalHangarChange(id, { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'speed' });
  const second = squad.commitLocalHangarChange(id, { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'fireRate' });
  assert.equal(second.weeklyState.shipUpgrades.researchhub.speed, 1);
  assert.equal(second.weeklyState.shipUpgrades.researchhub.fireRate, 1);
  assert.equal(second.permanentState.lifetimeStats.hangarUpgradesPurchased, 2);
  assert.equal(squad.loadWeeklySquadState(id).coins, 10000 - 55 - 60);
});

test('an interrupted mission save cannot later roll back a guest upgrade', (t) => {
  const { storage, state } = setup(t);
  squad.saveWeeklySquadState(state);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === permanentKey) throw new Error('storage temporarily unavailable');
    write(key, value);
  };
  assert.throws(() => squad.commitCampaignSquadSettlement({
    resultId: 'mission-1', weeklyState: state, permanentState: squad.createPermanentSquadState(id)
  }));
  assert.ok(storage.getItem(journalKey));
  storage.setItem = write;
  squad.commitLocalHangarChange(id, { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'speed' });
  assert.equal(squad.loadWeeklySquadState(id).shipUpgrades.researchhub.speed, 1);
  assert.equal(storage.getItem(journalKey), null);
});

test('storage failures reject the purchase without publishing an unsaved upgrade', (t) => {
  const { storage, state } = setup(t);
  squad.saveWeeklySquadState(state);
  const before = storage.getItem(key);
  storage.setItem = () => { throw new Error('storage quota exceeded'); };
  assert.throws(() => squad.commitLocalHangarChange(id, { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'speed' }), /storage quota exceeded/);
  assert.equal(storage.getItem(key), before);
});

test('pending save recovery must finish before a new purchase can replace its journal', (t) => {
  const { storage, state } = setup(t);
  squad.saveWeeklySquadState(state);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === permanentKey) throw new Error('storage full');
    write(key, value);
  };
  assert.throws(() => squad.commitCampaignSquadSettlement({
    resultId: 'pending-mission', weeklyState: state, permanentState: squad.createPermanentSquadState(id)
  }));
  const journal = storage.getItem(journalKey);
  assert.throws(() => squad.commitLocalHangarChange(id, { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'speed' }), /recovering/);
  assert.equal(storage.getItem(journalKey), journal);
  assert.equal(JSON.parse(storage.getItem(key)).shipUpgrades.researchhub.speed, 0);
});

test('a recoverable partial purchase is finalized once without charging again', (t) => {
  const { storage, state } = setup(t);
  squad.saveWeeklySquadState(state);
  const write = storage.setItem;
  let failed = false;
  storage.setItem = (key, value) => {
    if (key === permanentKey && !failed) { failed = true; throw new Error('temporary failure'); }
    write(key, value);
  };
  const saved = squad.commitLocalHangarChange(id, { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'speed' });
  assert.equal(saved.weeklyState.coins, 9945);
  assert.equal(saved.permanentState.lifetimeStats.hangarUpgradesPurchased, 1);
  assert.equal(storage.getItem(journalKey), null);
  assert.equal(squad.loadWeeklySquadState(id).shipUpgrades.researchhub.speed, 1);
});

test('device-only purchase helper cannot mutate a wallet profile', (t) => {
  setup(t);
  assert.throws(() => squad.commitLocalHangarChange('wallet:0x123', { kind: 'upgrade-main-ship', shipId: 'researchhub', upgradeId: 'speed' }), /device Pilot/);
});
