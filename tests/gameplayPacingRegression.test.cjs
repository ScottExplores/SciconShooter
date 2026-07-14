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

test('the wave-one Gatekeeper ramps its three-shot cadence without exceeding the original speed', () => {
  const firstWave = campaign.levels[0].waves[0];
  const gatekeeper = firstWave.events.find((event) => event.id === 'open-orbit-gatekeeper');
  const burstWeapon = gatekeeper.weapons.find((weapon) => weapon.id === 'gatekeeper-burst');

  assert.equal(burstWeapon.burstCount, 3);
  assert.equal(burstWeapon.attackIntervalSeconds, 0.883);
  assert.match(engineSource, /WAVE_ONE_GATEKEEPER_START_INTERVAL_MULTIPLIER = 1\.45/);
  assert.match(engineSource, /WAVE_ONE_GATEKEEPER_MAX_SPEED_HEALTH_RATIO = 0\.35/);
  assert.match(engineSource, /getWaveOneGatekeeperBurstInterval\(baseFireRate, healthRatio\)/);
  assert.match(engineSource, /Math\.max\(baseInterval, Math\.round\(baseInterval \* intervalMultiplier\)\)/);
});

test('main bosses use a siren alert before the transmission panel', () => {
  assert.match(engineSource, /MAIN_BOSS_ALERT_FRAMES = 120/);
  assert.match(engineSource, /drawMainBossAlert\(ctx/);
  assert.match(engineSource, /GATEKEEPER SIGNAL DETECTED/);
  assert.match(engineSource, /warningAge < alertFrames[\s\S]*?drawMainBossAlert\(ctx\)[\s\S]*?drawBossWarningComms\(ctx\)/);
  assert.match(engineSource, /this\.playSound\('siren'\)/);
});

test('white Citation Wraiths and red Paywall Interceptors use enlarged gameplay bounds', () => {
  assert.match(engineSource, /PAYWALL_INTERCEPTOR_SCALE = 1\.05/);
  assert.match(engineSource, /CITATION_WRAITH_SCALE = 1\.2/);
  assert.match(engineSource, /Math\.round\(44 \* PAYWALL_INTERCEPTOR_SCALE\)/);
  assert.match(engineSource, /Math\.round\(34 \* CITATION_WRAITH_SCALE\)/);
});
