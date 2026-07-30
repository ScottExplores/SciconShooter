const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const engineSource = fs.readFileSync(
  path.join(root, 'services', 'gameLogic.ts'),
  'utf8'
);

const sourceBetween = (startMarker, endMarker) => {
  const start = engineSource.indexOf(startMarker);
  const end = engineSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return engineSource.slice(start, end);
};

test('boss rotary audio starts once per live authored volley without changing projectile cadence', () => {
  const gatlingPulse = sourceBetween(
    'private spawnBossGatlingPulse(',
    'updateGeneratedBossMovement('
  );
  assert.match(gatlingPulse, /spawnGeneratedBossProjectile\(/);
  assert.match(
    gatlingPulse,
    /if \(pulseIndex === 0\) \{\s*this\.playSound\('boss_machinegun'/
  );
  assert.equal(
    (gatlingPulse.match(/playSound\('boss_machinegun'/g) ?? []).length,
    1
  );

  const heliosTelegraph = sourceBetween(
    'private showHeliosAnatomyTelegraph(',
    'private spawnHeliosCrossfirePulse('
  );
  assert.doesNotMatch(
    heliosTelegraph,
    /playSound\('boss_machinegun'/,
    'warning setup must not start the live rotary burst'
  );

  const heliosPulse = sourceBetween(
    'private spawnHeliosCrossfirePulse(',
    'private spawnHeliosReactorPulse('
  );
  assert.match(heliosPulse, /spawnChannelTracer\(/);
  assert.match(heliosPulse, /const projectile = this\.spawnGeneratedBossProjectile\(/);
  assert.equal(
    (heliosPulse.match(/if \(pulse\.shotIndex === 0\) \{\s*this\.playSound\('boss_machinegun'/g) ?? []).length,
    2,
    'the channel and crossfire branches each start one burst at shot zero'
  );
  assert.equal(
    (heliosPulse.match(/playSound\('boss_machinegun'/g) ?? []).length,
    2
  );

  assert.equal(
    (engineSource.match(/playSound\('boss_machinegun'/g) ?? []).length,
    3,
    'no per-projectile machine-gun audio emitters may remain elsewhere'
  );
});
