const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

test('player ramming destroys ordinary enemies but never damages boss hulls', () => {
  const ramStart = engineSource.indexOf('resolvePlayerRamCollision(enemy: Entity');
  const ramEnd = engineSource.indexOf('\n  checkCollisions()', ramStart);
  const ramSource = engineSource.slice(ramStart, ramEnd);

  assert.ok(ramStart >= 0);
  assert.ok(ramEnd > ramStart);
  assert.match(ramSource, /PLAYER_RAM_COOLDOWN_FRAMES/);
  assert.match(ramSource, /this\.playerVel\.x \+= normalX \* recoilForce/);
  assert.match(ramSource, /this\.playerVel\.y \+= normalY \* recoilForce/);
  assert.match(ramSource, /this\.addShake\(bossContact \? 9\.5 : 6\.5\)/);
  assert.match(ramSource, /if \(!bossContact && !enemy\.markedForDeletion\) \{\s*this\.handleEnemyDestroyed\(enemy\);\s*\}/);
  assert.doesNotMatch(ramSource, /damageBossHull|enemy\.hp/);
});

test('body contact exits before protected projectile handling', () => {
  assert.match(
    engineSource,
    /if \(isEnemy\) \{\s*this\.resolvePlayerRamCollision\(e, isInvincible\);\s*continue;\s*\}/
  );
  assert.doesNotMatch(engineSource, /if \(e\.type === EntityType\.BOSS\) this\.damageBossHull\(e, 5\)/);
  assert.doesNotMatch(engineSource, /else e\.hp -= 5/);
});
