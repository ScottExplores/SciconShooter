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

test('the engine applies separation only to assembled holders before collision work', () => {
  assert.match(engineSource, /separateAssembledFormationMembers\(\);\s*this\.checkCollisions\(\)/);
  assert.match(engineSource, /if \(member\.formationState !== 'hold'\) return;/);
  assert.match(engineSource, /member\.formationState === 'hold' \? member\.x/);
  assert.match(engineSource, /campaignFormationPackInstanceId[\s\S]*?sourceEventId/);
});
