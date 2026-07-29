const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

const sliceMethod = (startMarker, endMarker) => {
  const start = engineSource.indexOf(startMarker);
  const end = engineSource.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return engineSource.slice(start, end);
};

test('authored Supply Drops use their own non-hostile entity path and package metadata', () => {
  const asteroidSource = sliceMethod('spawnAsteroidBelt(configured?: RuntimeAsteroidEvent)', '\n  spawnSupplyDrop(');
  const spawnSource = sliceMethod('spawnSupplyDrop(configured: RuntimeSupplyDropEvent)', '\n  updateWallBoss()');

  assert.match(spawnSource, /EntityType\.SUPPLY_DROP/);
  assert.match(spawnSource, /packageEntity\.supplyDropKind\s*=\s*configured\.presentKind/);
  assert.match(spawnSource, /packageEntity\.coinDropValue\s*=/);
  assert.match(spawnSource, /packageEntity\.contactDamage\s*=\s*0/);
  assert.match(spawnSource, /'SUPPLY DROP'/);
  assert.doesNotMatch(asteroidSource, /supplyDropKind|coinDropValue|SUPPLY DROP/);
});

test('Supply Drop targets advance the timed wave without masquerading as an asteroid belt', () => {
  const countSource = sliceMethod('getAsteroidBeltCount()', '\n  getActiveMiniBosses()');
  const updateSource = sliceMethod('update(cinematicPause: boolean = false)', '\n  getGunPodOffsets()');

  assert.doesNotMatch(countSource, /supplyDropKind|bonusTargetKind/);
  assert.doesNotMatch(updateSource, /bonusTargetKind/);
  assert.match(updateSource, /const isBossAlive = Boolean\([\s\S]*?activeMiniBossLabState[\s\S]*?asteroidBeltCount > 0[\s\S]*?\);/);
  assert.match(engineSource, /currentWaveHasPresentDrop[\s\S]*?event\.kind === 'supply-drop'/);
  assert.match(engineSource, /queueConfiguredEncounter[\s\S]*?event\.kind === 'supply-drop'[\s\S]*?spawnSupplyDrop/);
  assert.match(engineSource, /activeThreatCount:\s*this\.getActiveThreatCount\(\)/);
});

test('destroyed presents release only their bounded authored coin value and no random drops', () => {
  const destroySource = sliceMethod('handleEnemyDestroyed(target: Entity)', '\n  applyResearchBeamDamage()');
  const burstSource = sliceMethod('private spawnPresentDropCoinBurst(target: Entity)', '\n  spawnBossCoinBurst(target: Entity)');

  assert.match(destroySource, /this\.presentDropDestroyed\[supplyDropKind\]\+\+/);
  assert.match(destroySource, /this\.presentDropCoinValueSpawned \+= this\.spawnPresentDropCoinBurst\(target\)/);
  assert.match(destroySource, /!isSupplyDrop && target\.type !== EntityType\.BOSS[\s\S]*?spawnPowerup\(target\.x, target\.y\)/);
  assert.match(destroySource, /!isSupplyDrop && target\.type !== EntityType\.BOSS && this\.lives/);
  assert.match(destroySource, /!isSupplyDrop && target\.type !== EntityType\.BOSS && !this\.isBombResolving/);
  assert.match(burstSource, /Math\.min\([\s\S]*?MAX_ACTIVE_BOSS_REWARD_COINS,[\s\S]*?Math\.floor\(configuredCoinValue\)/);
  assert.match(burstSource, /MAX_ACTIVE_BOSS_REWARD_COINS - activeCoinCount/);
  assert.match(burstSource, /for \(let index = 0; index < spawnCount; index\+\+\)/);
  assert.match(burstSource, /return spawnCount/);
});

test('victory summaries expose optional Present Drop destruction and spawned-value totals', () => {
  assert.match(engineSource, /presentDrop\?: PresentDropVictoryStats/);
  assert.match(engineSource, /destroyedTotal:\s*getPresentDropDestroyedTotal\(presentDropDestroyed\)/);
  assert.match(engineSource, /coinValueSpawned:\s*Math\.max\(0, presentDropCoinValueSpawned\)/);
  assert.match(engineSource, /this\.tacticalPresentDropDestroyedStart = \{ \.\.\.this\.presentDropDestroyed \}/);
});
