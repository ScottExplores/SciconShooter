import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const temp = mkdtempSync(join(tmpdir(), 'scicon-boss-content-'));
buildSync({
  entryPoints: ['services/revamp/bosses/catalog.ts', 'services/revamp/bosses/patterns.ts', 'services/revamp/bosses/safeRoute.ts'],
  bundle: true, platform: 'node', format: 'cjs', outdir: temp, logLevel: 'silent'
});
const require = createRequire(import.meta.url);
const { REVAMP_BOSSES, getRevampBoss, resolveRevampBoss } = require(join(temp, 'catalog.js'));
const { createBossAttackPlan } = require(join(temp, 'patterns.js'));
const { proveRevampBossAttack, proveRevampBossProfile } = require(join(temp, 'safeRoute.js'));
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));

test('15 complete bosses preserve existing campaign art identities and phase teaching', () => {
  const campaign = JSON.parse(readFileSync('game-config/campaign.json', 'utf8'));
  const events = campaign.levels.flatMap((level) => level.waves.flatMap((wave) => wave.events)).filter((event) => event.kind === 'boss');
  const sourceIds = new Set(events.map((event) => event.bossId));
  assert.equal(REVAMP_BOSSES.length, 15);
  assert.equal(new Set(REVAMP_BOSSES.map((boss) => boss.id)).size, 15);
  for (const boss of REVAMP_BOSSES) {
    assert.ok(sourceIds.has(boss.sourceBossId), `${boss.id} reuses installed art`);
    assert.equal(new Set(boss.attacks.map((attack) => attack.kind)).size, 4);
    assert.deepEqual(boss.phases.map((phase) => phase.threshold), [1, 0.66, 0.33]);
    assert.deepEqual(boss.phases.map((phase) => phase.attackIds.length), [2, 3, 4]);
    assert.ok(boss.attacks.some((attack) => attack.id === boss.part.disablesAttackId));
    for (const phase of boss.phases) {
      assert.ok(phase.attackIds.every((id) => boss.attacks.some((attack) => attack.id === id)));
      assert.ok(phase.attackIds.some((id) => id !== boss.part.disablesAttackId));
    }
    assert.ok(boss.attacks.every((attack) => attack.telegraphFrames >= 36));
    assert.ok(boss.attacks.some((attack) => attack.big && attack.recoveryFrames >= 60));
    assert.equal(getRevampBoss(`revamp:${boss.id}`), boss);
    assert.equal(resolveRevampBoss(boss.sourceBossId, `revamp:${boss.id}`), boss);
  }
  assert.equal(resolveRevampBoss('unknown-boss', 'anything'), undefined);
});

test('campaign identities stay stable and the deterministic weekly pool reaches all 15', () => {
  const found = new Set();
  const campaign = JSON.parse(readFileSync('game-config/campaign.json', 'utf8'));
  const { buildWeeklyRunStagePlans } = require('../../shared/weeklyRunPlan.js');
  for (const boss of REVAMP_BOSSES) {
    assert.equal(resolveRevampBoss(boss.sourceBossId, 'stage-existing-major-boss').id, boss.sourceBossId);
  }
  for (let week = 1; week <= 52; week += 1) {
    const stages = buildWeeklyRunStagePlans(`2026-W${String(week).padStart(2, '0')}`, {
      eliteBossIds: campaign.miniBosses.map((boss) => boss.bossId),
      majorBossIds: [...campaign.sectors].sort((a, b) => a.order - b.order).map((sector) => sector.majorBossId),
      stageCount: 40
    });
    for (const stage of stages.filter((candidate) => candidate.kind === 'major')) {
      const eventId = `weekly-run-stage-${stage.index}-boss-event`;
      const resolved = resolveRevampBoss(stage.bossId, eventId);
      assert.equal(resolved.sourceBossId, stage.bossId);
      assert.equal(resolveRevampBoss(stage.bossId, eventId), resolved);
      found.add(resolved.id);
    }
  }
  assert.equal(found.size, 15);
});

test('warning snapshots, rage and rendering share exact immutable geometry', () => {
  for (const boss of REVAMP_BOSSES) {
    for (const attack of boss.attacks) {
      const player = { x: 195, y: 660 };
      const plan = createBossAttackPlan({ attack, phase: 3, sequence: boss.patternOffset, origin: { x: 195, y: 200 }, player, rage: true });
      assert.ok(plan.warningFrames >= 36);
      assert.equal(plan.liveFrames, 180);
      assert.ok(plan.recoveryFrames >= 60);
      assert.ok(plan.lines.length > 0 && plan.sockets.length > 0);
      assert.ok(plan.projectiles.length <= 24);
      assert.ok(['amber', 'magenta'].includes(plan.color));
      assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.projectiles));
      const before = JSON.stringify(plan);
      player.x = 55;
      assert.equal(JSON.stringify(plan), before, 'aim cannot follow after warning lock');
      for (const zone of plan.zones) {
        assert.ok(zone.x >= 0 && zone.x + zone.width <= 390);
        assert.ok(zone.durationFrames <= plan.liveFrames);
      }
    }
  }
});

test('proof rejects missing telegraphs and arena-filling attacks', () => {
  const boss = REVAMP_BOSSES[0];
  const plan = createBossAttackPlan({ attack: boss.attacks[0], phase: 1, sequence: 0, origin: { x: 195, y: 200 }, player: { x: 195, y: 660 } });
  assert.equal(proveRevampBossAttack({ ...plan, warningFrames: 20 }, { x: 195, y: 660 }).status, 'unproven');
  assert.equal(proveRevampBossAttack({ ...plan, zones: [{ x: 0, y: 0, width: 390, height: 844, durationFrames: 180 }] }, { x: 195, y: 660 }).status, 'unproven');
});

for (const boss of REVAMP_BOSSES) {
  test(`${boss.id}: all phase/rage patterns have replayed phone-sized safe routes`, () => {
    const coverage = proveRevampBossProfile(boss);
    assert.equal(coverage.status, 'proven', coverage.failures.join('\n'));
    assert.equal(coverage.scenarios, 4860);
    assert.ok(coverage.checkedFrames >= 4860 * 216);
    assert.ok(coverage.minimumClearancePixels >= 6);
  });
}
