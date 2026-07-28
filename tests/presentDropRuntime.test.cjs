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

test('authored asteroid encounters propagate Present Drop metadata and use supply labeling', () => {
  const spawnSource = sliceMethod('spawnAsteroidBelt(configured?: RuntimeAsteroidEvent)', '\n  updateWallBoss()');

  assert.match(spawnSource, /asteroid\.coinDropValue\s*=/);
  assert.match(spawnSource, /asteroid\.bonusTargetKind\s*=\s*bonusTargetKind/);
  assert.match(spawnSource, /bonusTargetKind\s*\?\s*'SUPPLY DROP'\s*:\s*'ASTEROID BELT'/);
  assert.match(engineSource, /configuredBonusDrop[\s\S]*?'SUPPLY DROP'/);
});

test('Present Drop targets advance the timed wave without masquerading as a boss belt', () => {
  const countSource = sliceMethod('getAsteroidBeltCount()', '\n  getActiveMiniBosses()');
  const updateSource = sliceMethod('update(cinematicPause: boolean = false)', '\n  getGunPodOffsets()');

  assert.match(countSource, /!entity\.bonusTargetKind/);
  assert.match(updateSource, /entity\.variant\s*>=\s*900[\s\S]*?!entity\.bonusTargetKind/);
  assert.match(updateSource, /const isBossAlive = !!this\.bossRef[\s\S]*?asteroidBeltCount > 0/);
  assert.match(engineSource, /activeThreatCount:\s*this\.getActiveThreatCount\(\)/);
});

test('destroyed presents release only their bounded authored coin value and no random drops', () => {
  const destroySource = sliceMethod('handleEnemyDestroyed(target: Entity)', '\n  applyResearchBeamDamage()');
  const burstSource = sliceMethod('private spawnPresentDropCoinBurst(target: Entity)', '\n  spawnBossCoinBurst(target: Entity)');

  assert.match(destroySource, /this\.presentDropDestroyed\[bonusTargetKind\]\+\+/);
  assert.match(destroySource, /this\.presentDropCoinValueSpawned \+= this\.spawnPresentDropCoinBurst\(target\)/);
  assert.match(destroySource, /!isBonusTarget && target\.type !== EntityType\.BOSS[\s\S]*?spawnPowerup\(target\.x, target\.y\)/);
  assert.match(destroySource, /!isBonusTarget && target\.type !== EntityType\.BOSS && this\.lives/);
  assert.match(destroySource, /!isBonusTarget && target\.type !== EntityType\.BOSS && !this\.isBombResolving/);
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
