const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

const helperStart = engineSource.indexOf('  private registerPlayerProjectileHitFeedback(');
const helperEnd = engineSource.indexOf('\n  private rotatedBeamIntersectsBox(', helperStart);
const helperSource = engineSource.slice(helperStart, helperEnd);

const collisionStart = engineSource.indexOf('  checkCollisions()');
const collisionEnd = engineSource.indexOf('\n  getBossWarningComms(', collisionStart);
const collisionSource = engineSource.slice(collisionStart, collisionEnd);

test('safe preview hits reuse the full player projectile-hit presentation', () => {
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(helperSource, /this\.playSound\('hit'\)/);
  assert.match(helperSource, /this\.spawnExplosion\(this\.player\.x, this\.player\.y, '#ffffff'\)/);
  assert.match(helperSource, /'HIT!'/);
  assert.match(helperSource, /this\.flashAlpha = Math\.max\(this\.flashAlpha, 0\.48\)/);
  assert.match(helperSource, /this\.addShake\(7\)/);
  assert.match(helperSource, /this\.addHitStop\(10\)/);
  assert.match(helperSource, /this\.kickPlayerSquash\(0\.22\)/);
  assert.match(helperSource, /this\.playerVel\.x \+= shove/);
  assert.match(helperSource, /this\.playerVel\.y \+= 2\.4/);
});

test('safe preview hit feedback is rate-limited without mutating survival state', () => {
  assert.match(
    helperSource,
    /this\.frameCount - this\.lastPreviewPlayerHitFeedbackFrame[\s\S]*?< PREVIEW_PLAYER_HIT_FEEDBACK_COOLDOWN_FRAMES/
  );
  assert.match(helperSource, /this\.lastPreviewPlayerHitFeedbackFrame = this\.frameCount/);
  assert.doesNotMatch(helperSource, /this\.lives|this\.stats\.lives|recordPlayerDamage|startDeathSequence/);
});

test('preview invincibility suppresses damage but still registers hostile projectile hits', () => {
  assert.match(
    collisionSource,
    /const isPreviewInvincible = this\.previewMode && this\.previewInvincible/
  );
  assert.match(
    collisionSource,
    /if \(isPreviewInvincible\) \{[\s\S]*?this\.registerPlayerProjectileHitFeedback\(e, true\)/
  );
  assert.match(
    collisionSource,
    /else \{[\s\S]*?this\.applyPlayerLifeDamage\(incomingDamage\)[\s\S]*?this\.registerPlayerProjectileHitFeedback\(e, false/
  );
});
