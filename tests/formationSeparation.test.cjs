const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'services', 'gameplay', 'formations', 'FormationRuntime.ts');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

const loadRuntime = () => {
  const result = esbuild.buildSync({
    entryPoints: [runtimePath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const runtime = loadRuntime();
const bounds = { minX: 4, minY: 48, maxX: 408, maxY: 530 };
const padding = 5;

const overlaps = (left, right) => (
  left.x < right.x + right.width + padding
  && left.x + left.width + padding > right.x
  && left.y < right.y + right.height + padding
  && left.y + left.height + padding > right.y
);

test('mixed-size mobile formations pack deterministically without any assembled overlap', () => {
  const members = Array.from({ length: 15 }, (_, index) => ({
    id: `member-${String(index).padStart(2, '0')}`,
    order: index,
    x: index % 2 === 0 ? 76 : 266,
    y: 72 + Math.floor(index / 2) * 40,
    width: index % 3 === 0 ? 70 : 56,
    height: index % 4 === 0 ? 83 : 58
  }));
  const first = runtime.resolveNonOverlappingFormationPositions(members, bounds, padding);
  const repeated = runtime.resolveNonOverlappingFormationPositions(members, bounds, padding);
  assert.deepEqual(first, repeated, 'same desired formation must never accumulate drift or jitter');

  const byId = new Map(members.map((member) => [member.id, member]));
  const resolved = first.map((point) => ({ ...byId.get(point.id), ...point }));
  resolved.forEach((member) => {
    assert.ok(member.x >= bounds.minX && member.x + member.width <= bounds.maxX + 0.001);
    assert.ok(member.y >= bounds.minY && member.y + member.height <= bounds.maxY + 0.001);
  });
  resolved.forEach((left, leftIndex) => {
    resolved.slice(leftIndex + 1).forEach((right) => {
      assert.equal(overlaps(left, right), false, `${left.id} and ${right.id} stay separated`);
    });
  });
});

test('a settling cohort keeps its shape clear of target slots reserved by another event', () => {
  const reserved = Array.from({ length: 6 }, (_, index) => ({
    id: `alpha-${index}`,
    order: index,
    x: 82 + (index % 3) * 58,
    y: 90 + Math.floor(index / 3) * 58,
    width: 52,
    height: 52
  }));
  const incoming = reserved.map((member, index) => ({
    ...member,
    id: `beta-${index}`
  }));
  const reservedBefore = structuredClone(reserved);
  const first = runtime.resolveNonOverlappingFormationCohortPositions(
    incoming,
    reserved,
    bounds,
    padding
  );
  const repeated = runtime.resolveNonOverlappingFormationCohortPositions(
    incoming,
    reserved,
    bounds,
    padding
  );

  assert.deepEqual(first, repeated, 'concurrent event placement is deterministic');
  assert.deepEqual(reserved, reservedBefore, 'the already-reserved cohort never moves');
  const incomingById = new Map(incoming.map((member) => [member.id, member]));
  const positioned = first.map((point) => ({ ...incomingById.get(point.id), ...point }));
  positioned.forEach((member) => {
    reserved.forEach((reservation) => {
      assert.equal(overlaps(member, reservation), false, `${member.id} stays clear of ${reservation.id}`);
    });
  });
});

test('collision-safe slot reassignment eases from the live position without a snap', () => {
  const input = {
    current: { x: 42, y: -18 },
    previousTarget: { x: 118, y: 104 },
    resolvedTarget: { x: 196, y: 132 }
  };
  const plan = runtime.resolveFormationSlotTransition(input);
  const repeated = runtime.resolveFormationSlotTransition(input);
  assert.deepEqual(plan, repeated, 'slot correction is deterministic');
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.start, input.current, 'the rendered position, never the old slot, owns frame zero');
  assert.deepEqual(plan.target, input.resolvedTarget);
  assert.ok(plan.durationFrames >= 28 && plan.durationFrames <= 56);

  const samples = Array.from({ length: plan.durationFrames + 1 }, (_, frame) => (
    runtime.sampleFormationSlotTransition({
      start: plan.start,
      target: plan.target,
      progress: frame / plan.durationFrames
    })
  ));
  assert.deepEqual(samples[0], input.current, 'reassignment cannot teleport on its first frame');
  assert.deepEqual(samples.at(-1), input.resolvedTarget, 'settling finishes exactly on the safe slot');
  samples.slice(1).forEach((sample, index) => {
    const previous = samples[index];
    const step = Math.hypot(sample.x - previous.x, sample.y - previous.y);
    assert.ok(step < 10, `frame ${index + 1} stays within the bounded settle speed`);
    assert.ok(sample.x >= previous.x, 'this fixture advances monotonically toward its slot');
  });
});

test('the engine applies separation only to assembled holders before collision work', () => {
  assert.match(engineSource, /separateAssembledFormationMembers\(\);[\s\S]{0,200}this\.revampEnemies\.enforceBulletCap\(this\);\s*this\.checkCollisions\(\)/);
  assert.match(engineSource, /members\.every\(\(member\) => member\.formationState === 'hold'\)/);
  assert.match(engineSource, /const cohortSpawned = spawnedCount >= targetCount/);
  assert.match(engineSource, /cohortSpawned && members\.some\(\(member\) => !member\.formationSlotLocked\)/);
  assert.match(engineSource, /resolveNonOverlappingFormationCohortPositions\([\s\S]*?reservedTargets/);
  assert.match(engineSource, /assembledHolders\.push\(\.\.\.members\)[\s\S]*?globallySeparated = resolveNonOverlappingFormationPositions/);
  assert.match(engineSource, /maxCorrectionPerFrame = member\.formationEntryPath\?\.startsWith\('revamp-'\) \? 4 : this\.mobileProfile \? 4 : 6/);
  assert.match(engineSource, /member\.x = moveToward\(member\.x, point\.x, maxCorrectionPerFrame\)/);
  assert.match(engineSource, /member\.y = moveToward\(member\.y, point\.y, maxCorrectionPerFrame\)/);
  assert.doesNotMatch(engineSource, /member\.x = transition\.target\.x/);
  assert.match(engineSource, /resolveFormationSlotTransition\([\s\S]*?formationStartX = transition\.start\.x/);
  assert.match(engineSource, /sampleFormationSlotTransition\([\s\S]*?formationSlotTransitionActive = false/);
  assert.match(engineSource, /if \(!enemy\.formationGroupReady\)[\s\S]*?enemy\.x = targetX[\s\S]*?return true/);
  assert.match(engineSource, /enemy\.x = lerp\(targetX, point\.x \+ strafeOffset/);
  assert.match(engineSource, /entity\.formationState === 'entry' \|\| entity\.formationState === 'hold'/);
  assert.match(engineSource, /enemy\.formationCohortId = this\.getCampaignFormationPackInstanceId\(event\.id\)/);
  assert.match(engineSource, /this\.isSameFormationCohort\(entity, leader\)/);
});
