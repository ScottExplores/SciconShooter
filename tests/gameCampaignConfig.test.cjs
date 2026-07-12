const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const collectKeysAndStrings = (value, keys = [], strings = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeysAndStrings(item, keys, strings));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      keys.push(key);
      collectKeysAndStrings(item, keys, strings);
    });
  } else if (typeof value === 'string') {
    strings.push(value);
  }
  return { keys, strings };
};

test('tracked campaign contains the current four real-game sector waves', () => {
  assert.equal(campaign.schemaVersion, 1);
  assert.equal(campaign.revision, 3);
  assert.equal(campaign.fps, 60);
  assert.equal(campaign.hudAssets.bombIconAssetKey, 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F');
  assert.equal(campaign.levels.length, 1);

  const level = campaign.levels[0];
  assert.equal(level.id, 'operation-open-galaxy');
  assert.equal(level.loopWaves, true);
  assert.equal(level.durationSeconds, null);
  assert.deepEqual(
    level.waves.map((wave) => wave.name),
    ['OPEN ORBIT', 'CITATION STORM', 'PAYWALL SIEGE', 'OPEN GALAXY']
  );
  assert.deepEqual(level.waves.map((wave) => wave.order), [1, 2, 3, 4]);
  assert.deepEqual(level.waves.map((wave) => wave.scoreMultiplier), [1, 2, 4, 8]);
  assert.equal(level.startingDifficulty, 1);
  assert.deepEqual(level.waves.map((wave) => wave.difficultyMultiplier), [1, 1, 1, 1]);
});

test('every wave exposes editable spawns, mini-boss, checkpoint encounter, final boss, and power-ups', () => {
  const waves = campaign.levels[0].waves;

  waves.forEach((wave, index) => {
    assert.equal(wave.durationSeconds, 60);
    assert.ok(wave.events.some((event) => event.kind === 'spawn'));
    assert.ok(wave.events.some((event) => event.kind === 'powerup'));
    assert.ok(wave.events.some((event) => event.kind === 'boss' && event.bossId === 'bottleneck-drone'));
    assert.ok(wave.events.some((event) => event.kind === 'boss' && event.bossId === 'gatekeeper'));

    const expectedCheckpoint = index % 2 === 0 ? 'paywall-wall' : 'asteroid-belt';
    assert.ok(wave.events.some((event) => (
      expectedCheckpoint === 'asteroid-belt'
        ? event.kind === 'asteroid-belt'
        : event.kind === 'boss' && event.bossId === expectedCheckpoint
    )));

    const starts = wave.events.map((event) => event.startSeconds);
    assert.deepEqual(starts, [...starts].sort((left, right) => left - right));
    assert.ok(wave.events.every((event) => event.startSeconds <= wave.durationSeconds));
  });
});

test('later waves escalate Bottleneck Drones from a relay to a simultaneous pair', () => {
  const [, citationStorm, paywallSiege] = campaign.levels[0].waves;
  const citationBottlenecks = citationStorm.events.filter((event) => (
    event.kind === 'boss' && event.bossId === 'bottleneck-drone'
  ));
  const siegeBottlenecks = paywallSiege.events.filter((event) => (
    event.kind === 'boss' && event.bossId === 'bottleneck-drone'
  ));

  assert.deepEqual(citationBottlenecks.map((event) => event.startSeconds), [19.8, 21.8]);
  assert.deepEqual(citationBottlenecks.map((event) => event.count ?? 1), [1, 1]);
  assert.equal(new Set(citationBottlenecks.map((event) => event.id)).size, 2);
  assert.equal(siegeBottlenecks.length, 1);
  assert.equal(siegeBottlenecks[0].count, 2);
  assert.equal(siegeBottlenecks[0].label, 'Twin Bottleneck Drones');
});

test('ids are unique and boss health phases are strictly descending with valid weapon references', () => {
  const ids = [];
  for (const level of campaign.levels) {
    ids.push(level.id);
    for (const wave of level.waves) {
      ids.push(wave.id);
      for (const event of wave.events) {
        ids.push(event.id);
        if (event.kind !== 'boss') continue;

        const weaponIds = new Set(event.weapons.map((weapon) => weapon.id));
        assert.ok(event.weapons.length > 0);
        assert.ok(event.phases.length > 0);
        assert.equal(event.phases[0].triggerHealthRatio, 1);

        let previous = Number.POSITIVE_INFINITY;
        event.phases.forEach((phase) => {
          assert.ok(phase.triggerHealthRatio < previous);
          previous = phase.triggerHealthRatio;
          assert.ok(phase.weaponSettingIds.length > 0);
          phase.weaponSettingIds.forEach((weaponId) => assert.ok(weaponIds.has(weaponId)));
        });
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('spawn pools are complete, weighted, and contain directly editable combat values', () => {
  const spawnEvents = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => wave.events.filter((event) => event.kind === 'spawn'))
  ));
  assert.ok(spawnEvents.length > 0);

  spawnEvents.forEach((event) => {
    assert.ok(event.count > 0);
    assert.ok(event.spawnIntervalSeconds > 0);
    assert.ok(event.enemies.length > 0);
    const sum = event.enemies.reduce((total, enemy) => total + enemy.weight, 0);
    assert.ok(Math.abs(sum - 1) < 0.0001);
    event.enemies.forEach((enemy) => {
      assert.ok(enemy.health > 0);
      assert.ok(enemy.speed >= 0);
      assert.ok(enemy.damage > 0);
      assert.ok(enemy.scoreValue >= 0);
      assert.ok(enemy.powerupDropChance >= 0 && enemy.powerupDropChance <= 1);
    });
  });
});

test('campaign JSON contains catalog keys only, never arbitrary asset paths or executable fields', () => {
  const { keys, strings } = collectKeysAndStrings(campaign);
  const forbiddenKeys = new Set(['assetPath', 'path', 'url', 'script', 'code', 'handler', 'function']);
  keys.forEach((key) => assert.equal(forbiddenKeys.has(key), false, `forbidden key: ${key}`));
  strings.forEach((value) => {
    assert.equal(value.startsWith('/game-art/'), false, `raw asset path: ${value}`);
    assert.equal(/^javascript:/i.test(value), false, `executable URI: ${value}`);
  });
});

test('shared loader validates campaign JSON before exposing it to the game', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'levelConfig.ts'), 'utf8');
  assert.match(source, /parseGameCampaign\(campaignJson\)/);
  assert.match(source, /DEFAULT_GAME_CAMPAIGN/);
  assert.match(source, /cloneGameCampaign/);
  assert.match(source, /getPrimaryAssetPath/);
  assert.match(source, /getDifficultyMultiplier/);
});
