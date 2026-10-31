const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadPresentation = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'pixi', 'FormationEnemyPresentation.ts')],
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

const {
  FORMATION_ENEMY_MAX_BANK_RADIANS,
  sampleFormationEnemyPresentation
} = loadPresentation();

const configuredEnemy = (overrides = {}) => ({
  angle: 0.32,
  formationState: 'entry',
  formationAttackSelected: false,
  formationAttackActive: false,
  formationDiveFrame: 160,
  currentFrame: 100,
  formationIndex: 2,
  variant: 5,
  ...overrides
});

test('configured formation presentation consumes simulation banking without changing geometry', () => {
  assert.equal(sampleFormationEnemyPresentation(configuredEnemy()).bankRadians, 0.32);
  assert.equal(sampleFormationEnemyPresentation(configuredEnemy({ angle: -0.27 })).bankRadians, -0.27);
  assert.equal(
    sampleFormationEnemyPresentation(configuredEnemy({ angle: 8 })).bankRadians,
    FORMATION_ENEMY_MAX_BANK_RADIANS
  );
  assert.equal(sampleFormationEnemyPresentation(configuredEnemy({ formationState: undefined })).bankRadians, 0);
});

test('attack telegraph is driven only by the selected pre-attack simulation state', () => {
  const selected = sampleFormationEnemyPresentation(configuredEnemy({
    formationState: 'hold',
    formationAttackSelected: true
  }));
  assert.equal(selected.telegraphVisible, true);
  assert.equal(selected.telegraphReadiness, 0);
  assert.ok(selected.telegraphPulse >= 0 && selected.telegraphPulse <= 1);

  const nearlyReady = sampleFormationEnemyPresentation(configuredEnemy({
    formationState: 'hold',
    formationAttackSelected: true,
    formationDiveFrame: 105
  }));
  assert.ok(nearlyReady.telegraphReadiness > selected.telegraphReadiness);
  assert.equal(sampleFormationEnemyPresentation(configuredEnemy({
    formationAttackSelected: true,
    formationAttackActive: true
  })).telegraphVisible, false);
  assert.equal(sampleFormationEnemyPresentation(configuredEnemy({
    formationAttackSelected: false
  })).telegraphVisible, false);
});

test('Pixi applies the shared presentation sample to every configured formation enemy family', () => {
  const renderer = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  ).replace(/\r\n/g, '\n');
  const familyStart = renderer.indexOf('const isFormationMotionEnemy =');
  const familyEnd = renderer.indexOf('\nconst getFormationMotionFrameIndex', familyStart);
  const family = renderer.slice(familyStart, familyEnd);
  const updateStart = renderer.indexOf('  private updateEntityView(');
  const configuredStart = renderer.indexOf(
    '} else if (isFormationMotionEnemy(entity) && entity.formationState) {',
    updateStart
  );
  const configuredEnd = renderer.indexOf(
    '} else if (entity.type === EntityType.ENEMY_DRONE) {',
    configuredStart
  );
  const configured = renderer.slice(configuredStart, configuredEnd);

  for (const enemyType of [
    'ENEMY_DRONE',
    'ENEMY_SWARM',
    'ENEMY_BRICK',
    'ENEMY_JOURNAL'
  ]) {
    assert.match(family, new RegExp(`EntityType\\.${enemyType}`));
  }
  assert.ok(configuredStart >= 0 && configuredEnd > configuredStart);
  assert.match(configured, /sampleFormationEnemyPresentation\(\{/);
  assert.match(configured, /formationAttackSelected: entity\.formationAttackSelected/);
  assert.match(configured, /formationAttackActive: entity\.formationAttackActive/);
  assert.match(configured, /view\.root\.rotation = presentation\.bankRadians/);
  assert.match(configured, /view\.aura\.clear\(\)/);
  assert.doesNotMatch(configured, /presentation\.telegraphVisible/, 'regular fighters must not draw the enclosing pre-attack overlay');
  assert.doesNotMatch(configured, /\.ellipse\(|\.stroke\(|#fde047|#fef08a/, 'yellow attack rings and brackets must stay removed');
  assert.match(configured, /view\.aura\.rect\(/, 'the short flight exhaust remains visible');
  assert.doesNotMatch(configured, /entity\.[A-Za-z]+\s*=(?!=)/, 'Pixi must not mutate simulation state');
});

test('formation idle life is slow, transform-only, and honors reduced motion', () => {
  const { sampleFormationIdleLife, sampleHitSquash, FORMATION_IDLE_LIFE_RADIANS_PER_FRAME } = loadPresentation();
  // Period must be >= ~1 s at 60 fps so nothing strobes.
  assert.ok((2 * Math.PI) / FORMATION_IDLE_LIFE_RADIANS_PER_FRAME >= 60);
  for (let f = 0; f < 240; f += 7) {
    const s = sampleFormationIdleLife({ currentFrame: f, formationIndex: 3, formationState: 'hold' });
    assert.ok(s.scaleX <= 1 && s.scaleX >= 0.92);
    assert.ok(Math.abs(s.scaleY - 1) <= 0.02);
    assert.ok(Math.abs(s.swayRadians) <= 0.06);
  }
  assert.deepEqual(sampleFormationIdleLife({ currentFrame: 50, formationState: 'hold', reducedMotion: true }), { scaleX: 1, scaleY: 1, swayRadians: 0 });
  assert.deepEqual(sampleHitSquash(6, true), { scaleX: 1, scaleY: 1 });
  assert.ok(sampleHitSquash(12).scaleY < 1);
});
