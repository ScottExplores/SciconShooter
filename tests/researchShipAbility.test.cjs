const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('ResearchHub charge ability keeps its asset, cooldown, and blast contract', () => {
  const source = read('services/shipAbilityService.ts');

  assert.match(source, /length: 6/);
  assert.match(source, /length: 7/);
  assert.match(source, /RESEARCH_CHARGE_COOLDOWN_FRAMES = 16 \* 60/);
  assert.match(source, /RESEARCH_CHARGE_BLAST_RADIUS = 124/);
});

test('every playable ship ability is routed through the real engine and shared HUD slot', () => {
  const abilities = read('services/shipAbilityService.ts');
  const app = read('App.tsx');
  const canvas = read('components/GameCanvas.tsx');
  const hud = read('components/UIOverlay.tsx');
  const engine = read('services/gameLogic.ts');

  for (const ability of ['research-charge', 'bio-genome-lance', 'eth-prism-volley', 'btc-hash-burst']) {
    assert.match(abilities, new RegExp(ability));
    assert.match(engine, new RegExp(ability));
  }
  assert.match(app, /shipAbilityCommand/);
  assert.match(app, /playerShipId: usableShipId/);
  assert.match(canvas, /engineRef\.current\.triggerShipAbility\(\)/);
  assert.match(canvas, /playerShipId,/);
  assert.match(hud, /selectedShipId && onUseShipAbility/);
  assert.match(hud, /getShipAbilityDefinition\(selectedShipId \?\? 'researchhub'\)/);
  assert.match(hud, /conic-gradient\(from 0deg/);
  assert.match(engine, /triggerShipAbility\(\)/);
  assert.match(engine, /detonateResearchCharge\(/);
  assert.match(engine, /detonateBitcoinHashBurst\(/);
});

test('Pixi preloads and animates all ship ability sprite sequences', () => {
  const abilities = read('services/shipAbilityService.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const hud = read('components/UIOverlay.tsx');

  assert.match(renderer, /SHIP_ABILITY_FRAME_URLS/);
  assert.match(renderer, /RESEARCH_IMPACT_FRAME_URLS/);
  assert.match(renderer, /entity\.projectileVisualKind === 'research-charge'/);
  assert.match(renderer, /entity\.projectileVisualKind === 'bio-genome-lance'/);
  assert.match(renderer, /entity\.projectileVisualKind === 'eth-prism-volley'/);
  assert.match(renderer, /entity\.projectileVisualKind === 'btc-hash-burst'/);
  assert.match(renderer, /view\.root\.rotation = -Math\.PI \/ 2/);
  assert.match(hud, /abilityDefinition\.iconRotationDegrees/);
  assert.match(renderer, /effect\.effectType === 'sprite'/);

  for (const ship of ['bio', 'eth', 'btc']) {
    assert.match(abilities, new RegExp(`getGalleryAbilityFrames\\('${ship}'\\)`));
    for (let frame = 1; frame <= 4; frame++) {
      const icon = fs.readFileSync(path.join(root, 'public/game-art/generated/scicon-player-weapon-fx-v1', ship, 'level-7', `frame-${frame}.png`));
      assert.equal(icon[25], 6, `${ship} ability frame ${frame} must retain an alpha channel`);
    }
  }
});

test('boss cannon components use seven percent health and hull pressure increases attacks', () => {
  const engine = read('services/gameLogic.ts');

  assert.match(engine, /BOSS_CANNON_HEALTH_RATIO = 0\.07/);
  assert.match(engine, /Math\.round\(Math\.max\(1, boss\.maxHp\) \* healthRatio\)/);
  assert.match(engine, /hullPressureMultiplier/);
  assert.match(engine, /const pressure = 1 - healthRatio/);
});
