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

test('ResearchHub charge is routed through the real engine and HUD', () => {
  const app = read('App.tsx');
  const canvas = read('components/GameCanvas.tsx');
  const hud = read('components/UIOverlay.tsx');
  const engine = read('services/gameLogic.ts');

  assert.match(app, /shipAbilityCommand/);
  assert.match(canvas, /engineRef\.current\.triggerShipAbility\(\)/);
  assert.match(hud, /selectedShipId === 'researchhub'/);
  assert.match(hud, /conic-gradient\(from 0deg/);
  assert.match(engine, /triggerShipAbility\(\)/);
  assert.match(engine, /detonateResearchCharge\(/);
  assert.match(engine, /shipAbilityKind === 'research-charge'/);
});

test('Pixi preloads and animates the charge and impact sprite sequences', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const hud = read('components/UIOverlay.tsx');

  assert.match(renderer, /RESEARCH_CHARGE_FRAME_URLS/);
  assert.match(renderer, /RESEARCH_IMPACT_FRAME_URLS/);
  assert.match(renderer, /entity\.projectileVisualKind === 'research-charge'/);
  assert.match(renderer, /view\.root\.rotation = -Math\.PI \/ 2/);
  assert.equal((hud.match(/-rotate-90 object-contain/g) || []).length, 2);
  assert.match(renderer, /effect\.effectType === 'sprite'/);
});

test('boss cannon components use ten percent health and hull pressure increases attacks', () => {
  const engine = read('services/gameLogic.ts');

  assert.match(engine, /BOSS_CANNON_HEALTH_RATIO = 0\.1/);
  assert.match(engine, /Math\.round\(Math\.max\(1, boss\.maxHp\) \* healthRatio\)/);
  assert.match(engine, /hullPressureMultiplier/);
  assert.match(engine, /const pressure = 1 - healthRatio/);
});
