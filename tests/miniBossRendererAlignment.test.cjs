const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
).replace(/\r\n/g, '\n');
const collisionMasks = fs.readFileSync(
  path.join(root, 'services', 'gameplay', 'bosses', 'generatedBossCollisionMasks.ts'),
  'utf8'
);
const collisionMaskGenerator = fs.readFileSync(
  path.join(root, 'tools', 'generate-boss-collision-masks.mjs'),
  'utf8'
);

const section = (startMarker, endMarker, fromIndex = 0) => {
  const start = renderer.indexOf(startMarker, fromIndex);
  assert.notEqual(start, -1, `missing renderer section: ${startMarker}`);
  const end = renderer.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing renderer section terminator: ${endMarker}`);
  return renderer.slice(start, end);
};

test('Mini-Boss structural pixels stay aligned with simulation collision geometry', () => {
  const updateStart = renderer.indexOf('private updateEntityView(');
  const miniBoss = section(
    '} else if (entity.type === EntityType.MINI_BOSS) {',
    '} else if (entity.type === EntityType.ENEMY_DRONE) {',
    updateStart
  );

  assert.match(miniBoss, /view\.sprite\.position\.set\(0, 0\)/);
  assert.match(miniBoss, /view\.root\.rotation = entity\.bossPresentationBankRadians/);
  assert.match(miniBoss, /view\.root\.scale\.set\(1\)/);
  assert.doesNotMatch(miniBoss, /view\.sprite\.y\s*=/);
  assert.doesNotMatch(miniBoss, /view\.root\.position\.[xy]\s*\+=/);
  assert.doesNotMatch(miniBoss, /view\.root\.rotation\s*\+=/);
  assert.doesNotMatch(miniBoss, /miniBossLabPresentationScale/);

  assert.match(miniBoss, /view\.sprite\.tint = '#dbeafe'/);
  assert.match(miniBoss, /view\.sprite\.alpha = 0\.9 \+ pulse \* 0\.1/);
  assert.match(
    renderer,
    /entity\.type === EntityType\.MINI_BOSS && entity\.miniBossLabEncounterId && entity\.spriteUrl[\s\S]{0,120}return entity\.spriteUrl/,
    'the renderer must display the exact simulation-owned frame used by alpha collision'
  );
});

test('Mini-Boss shield graphics are rebuilt from a clean frame and disappear when disabled', () => {
  const updateStart = renderer.indexOf('private updateEntityView(');
  const miniBoss = section(
    '} else if (entity.type === EntityType.MINI_BOSS) {',
    '} else if (entity.type === EntityType.ENEMY_DRONE) {',
    updateStart
  );
  const clearIndex = miniBoss.indexOf('view.aura.clear();');
  const shieldIndex = miniBoss.indexOf('if (entity.miniBossLabShielded && entity.hp > 0)');

  assert.ok(clearIndex >= 0, 'the aura graphics must be cleared every Mini-Boss frame');
  assert.ok(shieldIndex > clearIndex, 'the shield may only be redrawn after the unconditional clear');
});

test('Mini-Boss compact health presentation counter-transforms root rotation and scale', () => {
  const overlay = section(
    'private alignMiniBossHealthOverlay(',
    'private drawFallbackBody('
  );

  assert.match(renderer, /const drawY = entity\.type === EntityType\.MINI_BOSS \? 0 : y/);
  assert.match(overlay, /const inverseRotation = -rotation/);
  assert.match(overlay, /const inverseScaleX = 1 \/ rootScaleX/);
  assert.match(overlay, /displayObject\.rotation = inverseRotation/);
  assert.match(overlay, /displayObject\.scale\.set\(inverseScaleX, inverseScaleY\)/);
  assert.match(renderer, /this\.drawHealthBar\(view, entity\);[\s\S]{0,160}this\.alignMiniBossHealthOverlay\(view, entity\)/);
});

test('Fracture Engine visual states use exact per-frame alpha collision masks', () => {
  for (const frame of [
    '01-idle',
    '02-neutral',
    '03-attack',
    '04-damage-50',
    '05-critical-15'
  ]) {
    const url = `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-${frame}.png`;
    assert.ok(collisionMasks.includes(JSON.stringify(url)), `${frame} needs a generated mask`);
    assert.match(
      collisionMaskGenerator,
      new RegExp(`key: '${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)
    );
  }
  const fractureGeneratorSection = collisionMaskGenerator.slice(
    collisionMaskGenerator.indexOf('bottleneck-harvester-01-idle.png'),
    collisionMaskGenerator.indexOf('paywall-bastion-01-idle.png')
  );
  assert.doesNotMatch(
    fractureGeneratorSection,
    /sources:/,
    'Fracture states must not share a union mask that includes invisible pixels from another pose'
  );
});
