const assert = require('node:assert/strict');
// REVAMP(G), category (b): REVAMP_NOTES_I.md replaces B's small wings with
// 30–40 hull grids and two specialists, followed by recovery or one commander.
const isRevampMission = level => level.waves.some(wave => wave.id.includes('-revamp-'));
const spawns = wave => wave.events.filter(event => event.kind === 'spawn');
const bosses = level => level.waves.flatMap(wave => wave.events.filter(event => event.kind === 'boss'));
const assertMissionCadence = level => {
  const role = level.campaignProgression.missionRole;
  const minimum = isRevampMission(level) ? 3 : role === 'major-boss' ? 2 : 4;
  const maximum = isRevampMission(level) ? 4 : 8;
  assert.ok(level.waves.length >= minimum && level.waves.length <= maximum, `${level.id} bounded wave count`);
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
  const combatWaves = level.waves.filter(wave => spawns(wave).length);
  assert.ok(combatWaves.length >= 2 && combatWaves.length <= 3, `${level.id} full squadron beats`);
  assert.equal(combatWaves[0].rhythm, 'introduce');
  assert.equal(combatWaves[1].rhythm, 'variation');
  assert.ok(new Set(combatWaves.map(wave => spawns(wave)[0].formationBehavior.entryPathId)).size >= 2,
    `${level.id} varies entry choreography`);
  const pressure = wave => spawns(wave).reduce((sum, event) => sum + event.count
    * roles.get(event.enemies[0].roleId).threatCost / event.enemies[0].attackIntervalSeconds, 0);
  assert.ok(pressure(combatWaves[1]) > pressure(combatWaves[0]), `${level.id} teaches before increasing fire pressure`);
  if (combatWaves.length === 3) {
    assert.equal(combatWaves[2].rhythm, 'recovery');
    assert.ok(pressure(combatWaves[2]) < pressure(combatWaves[1]), `${level.id} eases pressure after the peak`);
  }
  for (const wave of level.waves) {
    assert.ok(level.campaignProgression.combatBudget >= wave.combatBudget);
    const starts = wave.events.map(event => event.startSeconds);
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    assert.ok(wave.events.every(event => event.startSeconds >= 0 && event.startSeconds <= wave.durationSeconds));
    assert.ok(spawns(wave).every(event => event.spawnIntervalSeconds >= .12 && event.spawnIntervalSeconds <= .9));
    for (const event of spawns(wave)) {
      assert.ok(event.count >= 2 && event.count <= wave.threatCap, event.id);
      assert.ok(event.enemies.every(enemy => roles.has(enemy.roleId)), event.id);
      assert.ok(event.formationBehavior.telegraphSeconds >= .6, event.id);
      assert.ok(event.formationBehavior.attackGroupSize <= event.count, event.id);
      assert.ok(event.startSeconds + (event.count - 1) * event.spawnIntervalSeconds <= wave.durationSeconds, event.id);
    }
    if (!spawns(wave).length) continue;
    const [grid, specials] = spawns(wave);
    assert.equal(spawns(wave).length, 2, `${wave.id} one grid and one specialist cohort`);
    assert.equal(grid.enemies[0].roleId, 'role-revamp-linefighter');
    assert.ok(grid.count >= 28 && grid.count <= 38, `${wave.id} dense ordinary hulls`);
    assert.equal(specials.count, 2, `${wave.id} limits special mechanics`);
    assert.ok(grid.count + specials.count <= wave.threatCap);
    assert.ok(wave.events.some(event => event.kind === 'recovery' && event.powerupIds.includes('projectile-upgrade')),
      `${wave.id} guarantees power during combat`);
    for (const event of [grid, specials]) {
      assert.equal(event.patternId, 'grid');
      assert.equal(event.formationSlots.length, event.count);
      assert.equal(event.enemies.length, 1, 'each cohort has one predictable role');
      assert.ok(event.enemies[0].sizeMultiplier >= .6 && event.enemies[0].sizeMultiplier <= .8);
      assert.ok(event.enemies[0].projectileSpeed >= 1.5 && event.enemies[0].projectileSpeed <= 3);
      assert.ok(event.formationSlots.every(slot => slot.x >= .1 && slot.x <= .9 && slot.y >= .1 && slot.y <= .45));
      assert.equal(new Set(event.formationSlots.map(slot => `${slot.x},${slot.y}`)).size, event.count);
      assert.ok(event.formationBehavior.telegraphSeconds >= .7);
      assert.equal(event.formationBehavior.returnId, 'reform');
    }
    assert.ok(grid.startSeconds < specials.startSeconds);
    assert.ok(grid.startSeconds + (grid.count - 1) * grid.spawnIntervalSeconds > specials.startSeconds,
      `${wave.id} overlaps staggered arrivals`);
  }
  if (bosses(level).length) {
    assert.equal(bosses(level).length, 1);
    assert.equal(spawns(level.waves.at(-1)).length, 0, `${level.id} clears the lane for its commander`);
    assert.equal(level.waves.at(-1).events[0].kind, 'boss');
  } else assert.equal(combatWaves.length, 3, `${level.id} ends with a full recovery grid`);
  if (level.id === 'operation-open-galaxy') {
    assert.ok(bosses(level).some(event => event.label === 'PEER REVIEWER'));
    assert.ok(level.waves[0].events.some(event => event.kind === 'recovery' && event.startSeconds === 6));
  }
};
module.exports = { isRevampMission, assertMissionCadence, assertRevampMission, spawns, bosses };
