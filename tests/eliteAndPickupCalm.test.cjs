const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const src = fs.readFileSync(require('node:path').join(__dirname, '../services/pixi/PixiGameRenderer.ts'), 'utf8');

test('elites have no lavender ring', () => {
  assert.ok(!src.includes('entity.width * 0.58, entity.height * 0.52'));
  assert.ok(src.includes('view.sprite.tint = ELITE_ENEMY_TINT'));
});
test('elite bar is thin, upright and only after damage', () => {
  const body = src.slice(src.indexOf('private drawEliteDamageBar'), src.indexOf('private alignMiniBossHealthOverlay'));
  assert.match(body, /progress >= 1\) return/);
  assert.match(body, /width, 3\)/);
  assert.match(body, /view\.health\.rotation = -rotation/);
});
test('pickups fall straight with no spin or bob', () => {
  const body = src.slice(src.indexOf('entity.type === EntityType.POWERUP) {\n      const isMaxShot'));
  const block = body.slice(0, 600);
  assert.match(block, /view\.root\.rotation = 0/);
  assert.match(block, /view\.sprite\.y = 0/);
  assert.ok(!src.includes('const squash = 1 + Math.sin(phase * 0.17)'));
});
