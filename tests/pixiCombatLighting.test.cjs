const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(
  path.join(root, 'services/pixi/PixiGameRenderer.ts'),
  'utf8'
);
const softLight = fs.readFileSync(
  path.join(root, 'services/pixi/SoftRadialLight.ts'),
  'utf8'
);

const sliceMethod = (start, end) => renderer.slice(
  renderer.indexOf(start),
  renderer.indexOf(end)
);

test('combat lights are fixed pooled soft gradients with one player muzzle halo', () => {
  const lighting = sliceMethod(
    'private syncCombatLighting(engine: GameEngine)',
    'private syncDamageRecoil'
  );
  const entitySync = sliceMethod(
    'private syncEntities(engine: GameEngine)',
    'private syncGunPods'
  );

  assert.match(renderer, /private readonly playerMuzzleLight = createSoftRadialLight\(\)/);
  assert.match(renderer, /private readonly combatLightNodes = Array\.from\([\s\S]*?\(\) => createSoftRadialLight\(\)/);
  assert.match(softLight, /halo\.blendMode = 'add'/);
  assert.match(softLight, /reflection\.blendMode = 'add'/);
  assert.match(softLight, /context\.createRadialGradient\(/);
  assert.ok(
    (softLight.match(/gradient\.addColorStop\(/g) || []).length >= 6,
    'the shared texture has a smooth authored falloff'
  );
  assert.match(softLight, /const texture = getSoftRadialTexture\(\)/);
  assert.match(softLight, /const reflection = new Sprite\(texture\)/);
  assert.match(lighting, /engine\.frameCount - engine\.lastShotFrame/);
  assert.match(lighting, /showSoftRadialLight\([\s\S]*?this\.playerMuzzleLight/);
  assert.match(renderer, /this\.layers\.foreground\.addChild\(this\.combatLightRoot\)/);
  assert.doesNotMatch(entitySync, /spawn\('muzzle'/);
  assert.doesNotMatch(lighting, /new (?:Sprite|Container|Graphics|ColorMatrixFilter)/);
  assert.doesNotMatch(lighting, /BlurFilter|blur/);
  assert.doesNotMatch(softLight, /BlurFilter|\.circle\(|\.ellipse\(/);

  const syncStart = renderer.indexOf('sync(engine: GameEngine');
  const syncEnd = renderer.indexOf('\n  destroy()', syncStart);
  const sync = renderer.slice(syncStart, syncEnd);
  assert.ok(
    sync.indexOf('this.effectPool.setQuality') < sync.indexOf('this.syncEntities(engine)'),
    'adaptive caps are applied before the frame can spawn effects'
  );
});

test('combat lighting stays restrained under mobile, performance, and reduced-effect settings', () => {
  const lighting = sliceMethod(
    'private syncCombatLighting(engine: GameEngine)',
    'private syncDamageRecoil'
  );

  assert.match(lighting, /this\.reducedMotion/);
  assert.match(lighting, /engine\.performanceMode/);
  assert.match(lighting, /!engine\.polishSettings\.highDensityParticles/);
  assert.match(lighting, /engine\.mobileProfile \? 2 : 3/);
  assert.match(lighting, /engine\.mobileProfile \? 4 : COMBAT_LIGHT_POOL_SIZE/);
  assert.match(lighting, /const projectileLightBudget = reducedEffects \? 0 : engine\.mobileProfile \? 1 : 2/);
  assert.match(lighting, /let index = engine\.entities\.length - 1;/);
  assert.match(lighting, /projectileLights < projectileLightBudget;[\s\S]*?index--/);
  assert.match(lighting, /entity\.isBeam/);
  assert.match(lighting, /entity\.isCharging/);
  assert.match(lighting, /Boolean\(entity\.shipAbilityKind\)/);
  assert.doesNotMatch(renderer, /combatScreenTint|COMBAT_SCREEN_TINT/);
  assert.doesNotMatch(lighting, /width = this\.width|height = this\.height/);
});

test('boss and mini-boss recoil follows damage timestamps without moving simulation geometry', () => {
  const recoil = sliceMethod(
    'private syncDamageRecoil',
    'private drawFlash'
  );
  const entityUpdate = sliceMethod(
    'private updateEntityView',
    'private syncEntities'
  );

  assert.match(recoil, /entity\.lastDamageFlashFrame > view\.lastDamageFlashFrame/);
  assert.match(recoil, /component\.lastDamageFlashFrame > view\.lastComponentDamageFrames\[component\.id\]/);
  assert.match(recoil, /impactXRatio = component\.centerXRatio/);
  assert.match(recoil, /impactYRatio = component\.centerYRatio/);
  assert.match(recoil, /MINI_BOSS_RECOIL_PX/);
  assert.match(recoil, /BOSS_COMPONENT_RECOIL_PX/);
  assert.match(recoil, /Math\.exp\(-recoilAge \* 0\.24\)/);
  assert.match(recoil, /view\.root\.position\.x \+=/);
  assert.match(recoil, /this\.effectPool\.spawn\(/);
  assert.match(recoil, /this\.effectPool\.spawnImpact\(/);
  assert.match(entityUpdate, /this\.syncDamageRecoil\(view, entity, engine\)/);
  assert.doesNotMatch(recoil, /entity\.(?:x|y|width|height|hp)\s*[+*/-]?=/);
  assert.doesNotMatch(recoil, /entity\.bossComponents\s*=/);
  assert.doesNotMatch(recoil, /new (?:Sprite|Container|Graphics|ColorMatrixFilter)|\?\? \[\]/);
});

test('timestamp recoil does not merge hull and component flash filters', () => {
  const rail = sliceMethod(
    'private drawRailSerpentRig',
    'private drawPrismMothRig'
  );
  const moth = sliceMethod(
    'private drawPrismMothRig',
    'private drawArticulatedGeneratedBoss'
  );

  assert.match(rail, /const hullFilters = entity\.flashFrames > 0 \? WHITE_HIT_FILTERS : null/);
  assert.match(rail, /cannon\.filters = side === 'left' \? leftFilters : rightFilters/);
  assert.match(moth, /pod\.filters = side === 'left' \? leftFilters : rightFilters/);
  assert.match(renderer, /Hull feedback must never bleach the separately targetable cannons/);
});
