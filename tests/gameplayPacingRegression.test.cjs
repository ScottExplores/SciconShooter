const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

test('the opening flight completes before Brian releases combat', () => {
  assert.match(appSource, /isTransmissionOpen:\s*introMissionLocked\s*\|\|\s*Boolean\(activeStoryBeat\)/);

  const introGate = engineSource.indexOf('if (this.introFlightFrames > 0)');
  const transmissionGate = engineSource.indexOf('if (cinematicPause)', introGate);
  const enemySpawn = engineSource.indexOf('this.spawnEnemies()', transmissionGate);

  assert.ok(introGate >= 0);
  assert.ok(transmissionGate > introGate);
  assert.ok(enemySpawn > transmissionGate);
});

test('formations stay visual and final bosses transition without a loot stall', () => {
  assert.doesNotMatch(engineSource, /LINE SWARM|V-SWARM|WAVE SWARM|PINCER!/);
  assert.doesNotMatch(engineSource, /bossCoinDrops|bossPowerupDrops|bossBombDrops/);

  const waves = campaign.levels.flatMap((level) => level.waves);
  assert.ok(waves.length > 0);
  waves.forEach((wave) => {
    assert.ok(wave.delayAfterSeconds <= 1.5);
  });
});
