const assert = require('node:assert/strict');
// REVAMP(G), category (b): REVAMP_NOTES_B.md and REVAMP_DESIGN.md §2/§8
// replace the v24 surge-count snapshot with clear-driven, bounded authoring.
const isRevampMission = level => level.waves.some(wave => wave.id.includes('-revamp-'));
const spawns = wave => wave.events.filter(event => event.kind === 'spawn');
const bosses = level => level.waves.flatMap(wave => wave.events.filter(event => event.kind === 'boss'));
const assertMissionCadence = level => {
  const role = level.campaignProgression.missionRole;
  const minimum = level.id === 'operation-open-galaxy' ? 1 : role === 'major-boss' ? 2 : 4;
  assert.ok(level.waves.length >= minimum && level.waves.length <= 8, `${level.id} bounded wave count`);
  assert.deepEqual(level.waves.map(wave => wave.order), level.waves.map((_, index) => index + 1));
  for (const [index, wave] of level.waves.entries()) {
    assert.equal(wave.completionRule, role === 'major-boss' && index === level.waves.length - 1 ? 'boss-defeat' : 'clear-after-duration');
    assert.ok(wave.durationSeconds > 0 && wave.durationSeconds <= 200, wave.id);
    assert.ok(wave.events.some(event => ['spawn', 'boss'].includes(event.kind)), `${wave.id} active encounter`);
  }
};
const assertRevampMission = (level, campaign) => {
  assertMissionCadence(level);
  const roles = new Map(campaign.enemyRoles.map(role => [role.id, role]));
  for (const wave of level.waves) {
    assert.ok(level.campaignProgression.combatBudget >= wave.combatBudget);
    const starts = wave.events.map(event => event.startSeconds);
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    assert.ok(wave.events.every(event => event.startSeconds >= 0 && event.startSeconds <= wave.durationSeconds));
    assert.ok(spawns(wave).every(event => event.spawnIntervalSeconds >= .2 && event.spawnIntervalSeconds <= .9));
    for (const event of spawns(wave)) {
      assert.ok(event.count >= 2 && event.count <= wave.threatCap, event.id);
      assert.ok(event.enemies.every(enemy => roles.has(enemy.roleId)), event.id);
      assert.ok(event.formationBehavior.telegraphSeconds >= .6, event.id);
      assert.ok(event.formationBehavior.attackGroupSize <= event.count, event.id);
      assert.ok(event.startSeconds + (event.count - 1) * event.spawnIntervalSeconds <= wave.durationSeconds, event.id);
    }
  }
  if (level.id !== 'operation-open-galaxy') {
    const teaching = level.waves.findIndex(wave => wave.rhythm === 'introduce');
    const peak = level.waves.findIndex(wave => wave.rhythm === 'peak');
    assert.ok(teaching >= 0 && peak > teaching, `${level.id} teaches before peak`);
    assert.ok(level.waves.some(wave => wave.rhythm === 'recovery' && wave.events.some(event => event.kind === 'recovery')), `${level.id} breath beat with pickups`);
  } else {
    assert.ok(bosses(level).some(event => event.label === 'PEER REVIEWER'));
    assert.ok(level.waves[0].events.some(event => event.kind === 'recovery' && event.startSeconds === 6));
  }
};
module.exports = { isRevampMission, assertMissionCadence, assertRevampMission, spawns, bosses };
