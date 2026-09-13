const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');
const compiled = esbuild.buildSync({ entryPoints: [path.resolve(__dirname, '../environment/core.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const box = { exports: {} };
Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, box, box.exports);
const { EpisodeRuntime, resolveEpisode } = box.exports;
const practice = (phase = 'boss', duration = 90) => new EpisodeRuntime({ seed: 'boss-fixture', episode: { task: 'boss-practice-v1', practicePhase: phase, timeLimitSeconds: duration } });
const bossOf = runtime => runtime.engine.entities.find(entity => entity.type === 'BOSS' && !entity.markedForDeletion);

test('practice selects a frozen Gatekeeper wave and ordinary wave selection validates membership', () => {
  const boss = resolveEpisode({ seed: 1, episode: { task: 'boss-practice-v1' } });
  assert.equal(boss.levelId, 'stage-bastion-protocol');
  assert.equal(boss.waveId, 'stage-bastion-protocol-wave-4');
  assert.equal(boss.practicePhase, 'boss');
  assert.equal(boss.timeLimitSeconds, 180);
  assert.equal(boss.practicePolicy.playerInvulnerable, true);
  const wave = resolveEpisode({ seed: 1, episode: { task: 'boss-practice-v1', practicePhase: 'wave' } });
  assert.equal(wave.levelId, 'operation-open-galaxy');
  assert.equal(wave.timeLimitSeconds, 30);
  assert.equal(resolveEpisode({ seed: 1 }).practicePolicy, null);
  assert.throws(() => resolveEpisode({ seed: 1, episode: { task: 'other' } }), /Unknown/);
  assert.throws(() => resolveEpisode({ seed: 1, episode: { practicePhase: 'boss' } }), /practicePhase/);
  assert.throws(() => resolveEpisode({ seed: 1, episode: { waveId: boss.waveId } }), /Unknown wave/);
  assert.throws(() => resolveEpisode({ seed: 1, episode: { task: 'boss-practice-v1', levelId: 'operation-open-galaxy' } }), /frozen/);
  assert.equal(resolveEpisode({ seed: 1, episode: { levelId: boss.levelId, waveId: boss.waveId } }).waveId, boss.waveId);
});

test('practice fixes native horizontal control and loadout without enabling preview or test mode', () => {
  const runtime = practice();
  try {
    assert.equal(runtime.engine.previewMode, false);
    assert.equal(runtime.engine.testMode, false);
    assert.equal(runtime.engine.stats.bombs, 0);
    assert.throws(() => runtime.advanceTick({ movement: 'NE', fire: true }), /only W, idle or E/);
    assert.equal(runtime.tick, 0);
    for (let tick = 0; tick < 600; tick++) runtime.advanceTick({ movement: tick < 300 ? 'W' : 'E', fire: false });
    assert.deepEqual(runtime.getState().appliedAction, { movement: 'E', fire: true });
    assert.equal(runtime.engine.player.y, runtime.config.practicePolicy.playerTopY);
    assert.equal(runtime.engine.playerVel.y, 0);
    assert.equal(runtime.engine.touchPos, null);
    const boss = bossOf(runtime);
    assert.ok(boss, 'the actual canonical boss must spawn');
    assert.equal(boss.sourceEventId, 'stage-bastion-protocol-major-boss');
    assert.equal(boss.maxHp, 524, 'canonical Mission difficulty scales the authored 500 HP');
    const livesBefore = runtime.engine.lives;
    runtime.engine.applyPlayerLifeDamage(99);
    assert.equal(runtime.engine.lives, livesBefore);
    runtime.engine.activatePowerup('OVERDRIVE');
    runtime.engine.activatePowerup('EXTRA_LIFE');
    assert.equal(runtime.engine.missionOverdriveLevel, 0);
    assert.equal(runtime.engine.activePowerups.size, 0);
    assert.equal(runtime.engine.lives, livesBefore);
    const coin = runtime.engine.createEntity('COIN', runtime.engine.player.x, runtime.engine.player.y);
    assert.equal(runtime.engine.creditCoinValue(coin), false);
    assert.equal(runtime.engine.stats.coins, 0);
    assert.equal(runtime.takeEvents().filter(event => event.type === 'player-life-lost').length, 0);
  } finally { runtime.close(); }
});

test('canonical bullets deal actual boss damage while the arena survives and preserves the patrol', () => {
  const runtime = practice('boss', 180);
  let bossSeen = false;
  let minX = Infinity, maxX = -Infinity;
  const events = [];
  try {
    // This is an explicitly privileged engine test fixture, never a neural controller.
    for (let tick = 0; tick < runtime.config.maxTicks && !runtime.terminated; tick++) {
      const boss = bossOf(runtime);
      let desired = 195;
      if (boss) {
        bossSeen = true;
        minX = Math.min(minX, boss.x); maxX = Math.max(maxX, boss.x);
        desired = boss.x + boss.width / 2;
      }
      const error = desired - runtime.engine.player.x - runtime.engine.player.width / 2;
      runtime.advanceTick({ movement: Math.abs(error) < 6 ? 'idle' : error > 0 ? 'E' : 'W', fire: true });
      events.push(...runtime.takeEvents());
    }
    const damage = events.filter(event => event.type === 'entity-damage' && event.sourceKind === 'player' && (event.targetKind === 'BOSS' || event.targetKind.startsWith('boss-component:')));
    assert.ok(bossSeen);
    assert.ok(maxX - minX > 15, 'canonical upper-arena patrol remains active');
    assert.ok(damage.length > 0, 'real collision pipeline confirms hits');
    assert.ok(damage.every(event => event.amount > 0 && event.remainingHealth >= 0));
    assert.equal(runtime.engine.lives, 3);
    assert.equal(runtime.engine.stats.bombs, 0);
    assert.equal(runtime.engine.stats.coins, 0);
    assert.equal(runtime.engine.missionOverdriveLevel, 0);
    assert.ok(events.some(event => event.type === 'player-projectile-spawn'));
    assert.equal(runtime.getState().practice.bossDefeated, true, 'native bullets can defeat the boss within the practice limit');
    assert.equal(runtime.engine.stats.score, 1010);
    assert.equal(runtime.terminated, true);
    assert.equal(runtime.truncated, false);
    assert.equal(runtime.getState().practice.bossDefeated, damage.some(event => event.targetKind === 'BOSS' && event.fatal));
  } finally { runtime.close(); }
});

test('protected hits emit no damage and overkill emits only remaining hull HP, with defeat distinct from timeout', () => {
  const runtime = practice();
  try {
    for (let tick = 0; tick < 300; tick++) runtime.advanceTick({ movement: 'W', fire: true });
    const boss = bossOf(runtime);
    assert.ok(boss);
    runtime.takeEvents();
    const hp = boss.hp;
    // Force a noninteractive canonical arrival window to exercise blocked-hit semantics.
    const originalInteractive = runtime.engine.isBossCombatInteractive;
    runtime.engine.isBossCombatInteractive = () => false;
    runtime.engine.damageBossHull(boss, 9999);
    assert.equal(boss.hp, hp);
    assert.equal(runtime.takeEvents().filter(event => event.type === 'entity-damage').length, 0);
    runtime.engine.isBossCombatInteractive = originalInteractive;
    for (const component of boss.bossComponents) runtime.engine.damageBossComponent(boss, component, 99999);
    runtime.takeEvents();
    runtime.engine.damageBossHull(boss, 99999);
    const damage = runtime.takeEvents().find(event => event.type === 'entity-damage' && event.targetKind === 'BOSS');
    assert.ok(damage);
    assert.equal(damage.amount, hp);
    assert.equal(damage.remainingHealth, 0);
    assert.equal(damage.fatal, true);
    assert.equal(runtime.getState().practice.outcome, 'boss-defeated');
    const timeout = practice('boss', 0.1);
    try {
      for (let tick = 0; tick < 20; tick++) timeout.advanceTick({ movement: 'idle', fire: true });
      assert.equal(timeout.getState().practice.outcome, 'time-limit');
      assert.equal(timeout.getState().practice.bossDefeated, false);
    } finally { timeout.close(); }
  } finally { runtime.close(); }
});
