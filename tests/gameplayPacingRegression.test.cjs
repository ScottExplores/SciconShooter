const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

test('protected entrance precedes modal comms while revamp inline comms keep combat moving', () => {
  assert.match(appSource, /isTransmissionOpen:\s*introMissionLocked\s*\|\|\s*Boolean\(activeStoryBeat && activeStoryBeat\.presentation !== 'inline'\)/);

  const updateStart = engineSource.indexOf('update(cinematicPause: boolean = false)');
  const introGate = engineSource.indexOf('if (this.introFlightFrames > 0)', updateStart);
  const transmissionGate = engineSource.indexOf('if (cinematicPause)', introGate);
  const enemySpawn = engineSource.indexOf('this.spawnEnemies()', transmissionGate);

  assert.ok(updateStart >= 0);
  assert.ok(introGate > updateStart);
  assert.ok(transmissionGate > introGate);
  assert.ok(enemySpawn > transmissionGate);
  assert.match(
    engineSource.slice(introGate, transmissionGate),
    /if \(this\.introFlightFrames > 0\)[\s\S]*?this\.updateIntroFlight\(\)[\s\S]*?return;/,
    'the non-combat ship entrance must remain visible behind the transmission'
  );
  assert.match(engineSource.slice(transmissionGate, enemySpawn), /if \(cinematicPause\)[\s\S]*?return;/);
});

test('formations stay visual and ten sector bosses provide an intentional five-second loot window', () => {
  assert.doesNotMatch(engineSource, /LINE SWARM|V-SWARM|WAVE SWARM|PINCER!/);
  assert.doesNotMatch(engineSource, /bossCoinDrops|bossPowerupDrops|bossBombDrops/);

  const waves = campaign.levels.flatMap((level) => level.waves);
  assert.ok(waves.length > 0);
  const majorBossWaves = campaign.sectors.map((sector) => {
    const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
    const wave = level.waves.at(-1);
    const bossEvents = wave.events.filter((event) => event.kind === 'boss');
    assert.equal(bossEvents.length, 1);
    assert.equal(bossEvents[0].bossId, sector.majorBossId);
    return wave;
  });
  assert.equal(majorBossWaves.length, campaign.sectors.length);
  const { loadService } = require('./helpers/loadService.cjs');
  const { getMissionRewardCollectionSeconds } = loadService(path.join(root, 'services/gameplay/missionRewardWindow.ts'));
  majorBossWaves.forEach((wave) => assert.equal(getMissionRewardCollectionSeconds({
    authoredSeconds: wave.delayAfterSeconds, liveCoins: true, majorBossFinale: true
  }), 5));
  campaign.levels.forEach((level) => {
    const finalWave = level.waves.at(-1);
    assert.ok(finalWave.delayAfterSeconds >= 0 && finalWave.delayAfterSeconds <= 5);
    level.waves.slice(0, -1).forEach((wave) => assert.ok(wave.delayAfterSeconds <= 1.5));
  });
  assert.match(engineSource, /stageRewardCollectionFrames/);
  assert.match(engineSource, /STAGE_TAKEOFF_FRAMES = 180/);
});

test('sector major bosses ramp durability and projectile pressure without exceeding the authored cap', () => {
  const bosses = campaign.sectors.map((sector) => {
    const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
    return level.waves.at(-1).events.find((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
  });
  const projectileWeapons = bosses.map((boss) => boss.weapons.find((weapon) => weapon.projectileSpeed > 0));

  assert.deepEqual(bosses.map((boss) => boss.health), [500, 800, 1300, 1600, 2350, 2500, 2700, 2900, 3150, 3400]);
  assert.deepEqual(projectileWeapons.map((weapon) => weapon.burstCount), [3, 7, 4, 4, 4, 4, 1, 4, 4, 4]);
  assert.deepEqual(projectileWeapons.map((weapon) => weapon.projectileSpeed), [6.55, 7.65, 5.8, 5.8, 5.8, 5.8, 4.8, 5.8, 5.8, 5.8]);
  bosses.slice(1).forEach((boss, index) => assert.ok(boss.health > bosses[index].health));
  assert.ok(projectileWeapons.every((weapon) => weapon.projectileSpeed <= 7.65));
  assert.match(engineSource, /WAVE_ONE_GATEKEEPER_START_INTERVAL_MULTIPLIER = 1\.45/);
  assert.match(engineSource, /WAVE_ONE_GATEKEEPER_MAX_SPEED_HEALTH_RATIO = 0\.35/);
  assert.match(engineSource, /getGatekeeperBurstInterval\(baseFireRate, healthRatio, cadenceConfig\)/);
  assert.match(engineSource, /Math\.max\(baseInterval, Math\.round\(baseInterval \* intervalMultiplier\)\)/);
});

test('adaptive performance preserves the planetary background instead of popping layers on and off', () => {
  assert.doesNotMatch(engineSource, /if \(!adaptiveLow \|\| this\.frameCount % 2 === 0\)/);
  assert.doesNotMatch(engineSource, /if \(!adaptiveLow\) \{\s*ctx\.save\(\);\s*ctx\.translate\(this\.width - 130/s);
  assert.match(engineSource, /alpha: adaptiveLow \? \(lowDetail \? 0\.28 : 0\.4\)/);
  assert.match(engineSource, /const backgroundSpriteLimit = this\.bgEntities\.length/);
});

test('main bosses use the authored boss alert before the transmission panel', () => {
  const audioSource = fs.readFileSync(path.join(root, 'services', 'audioService.ts'), 'utf8');

  assert.match(engineSource, /MAIN_BOSS_ALERT_FRAMES = 120/);
  assert.match(engineSource, /drawMainBossAlert\(ctx/);
  assert.match(engineSource, /GATEKEEPER SIGNAL DETECTED/);
  assert.match(engineSource, /warningAge < alertFrames[\s\S]*?drawMainBossAlert\(ctx\)[\s\S]*?drawBossWarningComms\(ctx\)/);
  assert.match(engineSource, /this\.playSound\(type === 'gatekeeper' \? 'boss_alert' : 'siren'\)/);
  assert.match(engineSource, /this\.playSound\(this\.pendingBossType === 'gatekeeper' \? 'boss_alert' : 'siren'\)/);
  assert.match(audioSource, /'boss-warning': '\/audio\/sfx\/boss-warning\.wav'/);
  assert.match(audioSource, /boss_alert: \{ sample: 'boss-warning'/);
  assert.match(audioSource, /boss_alert:\s*2_600/);
});

test('white Citation Wraiths and standard red Paywall Interceptors use enlarged gameplay bounds', () => {
  assert.match(engineSource, /REGULAR_ENEMY_SIZE_SCALE = 1\.1/);
  assert.match(engineSource, /PAYWALL_INTERCEPTOR_SCALE = 1\.1/);
  assert.match(engineSource, /SPIRAL_PAYWALL_INTERCEPTOR_SCALE = 1\.05/);
  assert.match(engineSource, /CITATION_WRAITH_SCALE = 1\.32/);
  assert.match(engineSource, /Math\.round\(44 \* PAYWALL_INTERCEPTOR_SCALE\)/);
  assert.match(engineSource, /Math\.round\(34 \* CITATION_WRAITH_SCALE\)/);
  assert.match(engineSource, /effectiveSizeMultiplier = configuredSizeMultiplier \* REGULAR_ENEMY_SIZE_SCALE/);
  assert.match(engineSource, /SPIRAL_PAYWALL_INTERCEPTOR_SCALE \* REGULAR_ENEMY_SIZE_SCALE/);
  assert.match(engineSource, /formation === 'spiral' && enemy\.type === EntityType\.ENEMY_DRONE/);
  assert.match(engineSource, /e\.formation === 'spiral' \? Math\.PI \/ 2 \+ e\.angle : 0/);
});

test('player ship uses a five-percent smaller gameplay footprint', () => {
  assert.match(engineSource, /PLAYER_SHIP_SCALE = 0\.95/);
  assert.match(engineSource, /this\.player\.width = Math\.round\(128 \* PLAYER_SHIP_SCALE\)/);
  assert.match(engineSource, /this\.player\.height = Math\.round\(128 \* PLAYER_SHIP_SCALE\)/);
});

test('Research keeps tight fire-rate tiers while BIO swaps to equal-damage straight twin rails', () => {
  assert.match(engineSource, /const fireInterval = getFireRateIntervalFrames\(level\)/);
  assert.match(engineSource, /const volleySize = Math\.min\(FIRE_RATE_MAX_VOLLEY_SIZE, getFireRateVolleySize\(this\.stats\.upgrades\.fireRate \|\| 0\) \+ \(this\.squadLoadout\?\.revamp\?\.extraProjectiles \?\? 0\)\)/);
  assert.match(engineSource, /getTightVolleyOffsets\(volleySize\)\.map/);
  assert.match(engineSource, /const weaponKind: PlayerWeaponKind = hullProfile\.primaryKind === 'btc-bolt' \? 'btc-bolt' : 'pulse'/);
  assert.match(engineSource, /this\.playerShipId === 'bio'[\s\S]*getBioPrimaryShotPlan/);
  assert.match(engineSource, /hasPlayerShotCapacity\(bioPrimaryPlan\.simulationEntityCount\)/);
  assert.match(engineSource, /'bio-primary'/);
  assert.match(engineSource, /const weaponSpeed = weaponKind === 'btc-bolt' \? 9 : 10/);
  assert.match(engineSource, /b\.weaponVisualLevel = Math\.min\(7, Math\.max\(\r?\n\s*hullVisualLevel,\r?\n\s*overdrivePrimary \? this\.missionOverdriveLevel : 0/);
  assert.doesNotMatch(engineSource, /if \(bioLaserEquipped\)/);
});
