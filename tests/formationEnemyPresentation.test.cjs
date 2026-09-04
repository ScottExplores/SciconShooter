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
  assert.match(configured, /presentation\.telegraphVisible/);
  assert.doesNotMatch(configured, /entity\.[A-Za-z]+\s*=(?!=)/, 'Pixi must not mutate simulation state');
});
