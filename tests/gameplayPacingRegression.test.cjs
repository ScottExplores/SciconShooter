const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

test('Brian pauses the opening flight before its protected combat intro begins', () => {
  assert.match(appSource, /isTransmissionOpen:\s*introMissionLocked\s*\|\|\s*Boolean\(activeStoryBeat\)/);

  const updateStart = engineSource.indexOf('update(cinematicPause: boolean = false)');
  const transmissionGate = engineSource.indexOf('if (cinematicPause)', updateStart);
  const introGate = engineSource.indexOf('if (this.introFlightFrames > 0)', transmissionGate);
  const enemySpawn = engineSource.indexOf('this.spawnEnemies()', transmissionGate);

  assert.ok(updateStart >= 0);
  assert.ok(transmissionGate > updateStart);
  assert.ok(introGate > transmissionGate);
  assert.ok(enemySpawn > introGate);
  assert.match(
    engineSource.slice(transmissionGate, introGate),
    /if \(cinematicPause\)[\s\S]*?return;/,
    'the cinematic must return before updateIntroFlight can consume its frame budget'
  );
});

test('formations stay visual and ten sector bosses provide an intentional five-second loot window', () => {
  assert.doesNotMatch(engineSource, /LINE SWARM|V-SWARM|WAVE SWARM|PINCER!/);
  assert.doesNotMatch(engineSource, /bossCoinDrops|bossPowerupDrops|bossBombDrops/);

  const waves = campaign.levels.flatMap((level) => level.waves);
  assert.ok(waves.length > 0);
  const majorBossIds = new Set(campaign.sectors.map((sector) => sector.majorBossId));
  const majorBossWaves = waves.filter((wave) => wave.events.some((event) => (
    event.kind === 'boss' && majorBossIds.has(event.bossId)
  )));
  assert.equal(majorBossWaves.length, campaign.sectors.length);
  majorBossWaves.forEach((wave) => assert.equal(wave.delayAfterSeconds, 5));
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

  assert.deepEqual(bosses.map((boss) => boss.health), [170, 650, 950, 1400, 1750, 1850, 1950, 2100, 2300, 2450]);
  assert.deepEqual(projectileWeapons.map((weapon) => weapon.burstCount), [2, 3, 1, 3, 2, 3, 1, 2, 1, 3]);
  assert.deepEqual(projectileWeapons.map((weapon) => weapon.projectileSpeed), [6.52, 7, 6, 6.4, 6.2, 6.8, 4.6, 6.2, 5.6, 7.6]);
  bosses.slice(1).forEach((boss, index) => assert.ok(boss.health > bosses[index].health));
  assert.ok(projectileWeapons.every((weapon) => weapon.projectileSpeed <= 10.5));
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

test('main bosses use a siren alert before the transmission panel', () => {
  const audioSource = fs.readFileSync(path.join(root, 'services', 'audioService.ts'), 'utf8');

  assert.match(engineSource, /MAIN_BOSS_ALERT_FRAMES = 120/);
  assert.match(engineSource, /drawMainBossAlert\(ctx/);
  assert.match(engineSource, /GATEKEEPER SIGNAL DETECTED/);
  assert.match(engineSource, /warningAge < alertFrames[\s\S]*?drawMainBossAlert\(ctx\)[\s\S]*?drawBossWarningComms\(ctx\)/);
  assert.match(engineSource, /this\.playSound\('siren'\)/);
  assert.match(audioSource, /playBossWarningSiren/);
  assert.match(audioSource, /siren:\s*620/);
  assert.match(audioSource, /lowAlarm\.frequency/);
  assert.match(audioSource, /highAlarm\.frequency/);
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
  assert.match(engineSource, /const volleySize = getFireRateVolleySize\(this\.stats\.upgrades\.fireRate \|\| 0\)/);
  assert.match(engineSource, /getTightVolleyOffsets\(volleySize\)\.map/);
  assert.match(engineSource, /const weaponKind: PlayerWeaponKind = 'pulse'/);
  assert.match(engineSource, /this\.playerShipId === 'bio'[\s\S]*getBioPrimaryShotPlan/);
  assert.match(engineSource, /hasPlayerShotCapacity\(bioPrimaryPlan\.simulationEntityCount\)/);
  assert.match(engineSource, /'bio-primary'/);
  assert.match(engineSource, /const weaponSpeed = 10/);
  assert.match(engineSource, /b\.weaponVisualLevel = 0/);
  assert.doesNotMatch(engineSource, /if \(bioLaserEquipped\)/);
});
