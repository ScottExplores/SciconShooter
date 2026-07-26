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

test('combat lights are fixed pooled soft gradients with no primary-fire halo', () => {
  const lighting = sliceMethod(
    'private syncCombatLighting(engine: GameEngine)',
    'private syncDamageRecoil'
  );
  const entitySync = sliceMethod(
    'private syncEntities(engine: GameEngine)',
    'private syncGunPods'
  );

  assert.doesNotMatch(renderer, /playerMuzzleLight/);
  assert.match(renderer, /private readonly combatLightNodes = Array\.from\([\s\S]*?\(\) => createSoftRadialLight\(\)/);
  assert.match(softLight, /halo\.blendMode = 'add'/);
  assert.match(softLight, /reflection\.blendMode = 'add'/);
  assert.match(softLight, /context\.createRadialGradient\(/);
  assert.ok(
    (softLight.match(/gradient\.addColorStop\(/g) || []).length >= 8,
    'the shared texture has a smooth authored falloff'
  );
  assert.match(softLight, /canvas\.width = 256/);
  assert.match(softLight, /gradient\.addColorStop\(0\.9, 'rgba\(255, 255, 255, 0\.006\)'\)/);
  assert.match(softLight, /gradient\.addColorStop\(1, 'rgba\(255, 255, 255, 0\)'\)/);
  assert.match(softLight, /const texture = getSoftRadialTexture\(\)/);
  assert.match(softLight, /const reflection = new Sprite\(texture\)/);
  assert.doesNotMatch(lighting, /engine\.lastShotFrame|muzzleActive|projectileLightBudget|projectileLights/);
  assert.match(lighting, /Ordinary primary-fire shots deliberately receive no light/);
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
  assert.match(lighting, /const coinLightBudget = reducedEffects \? 1 : engine\.mobileProfile \? 2 : 3/);
  assert.match(lighting, /coinLights < coinLightBudget/);
  assert.match(lighting, /entity\.isBeam/);
  assert.match(lighting, /entity\.isCharging/);
  assert.match(lighting, /Boolean\(entity\.shipAbilityKind\)/);
  assert.doesNotMatch(renderer, /combatScreenTint|COMBAT_SCREEN_TINT/);
  assert.doesNotMatch(lighting, /width = this\.width|height = this\.height/);
});

test('coins and Research Charge own restrained persistent lights without per-frame allocations', () => {
  const lighting = sliceMethod(
    'private syncCombatLighting(engine: GameEngine)',
    'private syncDamageRecoil'
  );

  const researchIndex = lighting.indexOf("entity.projectileVisualKind === 'research-charge'");
  const bossIndex = lighting.indexOf('entity.type === EntityType.BOSS && entity.isCharging');
  assert.ok(researchIndex >= 0 && researchIndex < bossIndex, 'Research Charge is admitted before capped boss accents');
  assert.match(lighting, /entity\.type === EntityType\.EFFECT[\s\S]*?RESEARCH_IMPACT_FRAME_URLS\[0\]/);
  assert.match(lighting, /const slowPulse = 0\.94 \+ Math\.sin/);
  assert.match(lighting, /COMBAT_LIGHT_SPECIAL_COLOR/);
  assert.match(lighting, /entity\.type !== EntityType\.COIN/);
  assert.match(lighting, /entity\.coinBurstFrames > 0/);
  assert.match(lighting, /COMBAT_LIGHT_COIN_COLOR/);
  assert.match(lighting, /this\.combatLightRoot\.visible = lightCount > 0/);
  assert.doesNotMatch(lighting, /new (?:Sprite|Container|Graphics|ColorMatrixFilter)|\.map\(|\.filter\(|\.slice\(/);
});

test('Research Charge and coin art have no hard vector aura and the charge reuses a capped beam trail', () => {
  const projectile = sliceMethod(
    'private drawProjectile(view: EntityView, entity: Entity, engine: GameEngine)',
    'private drawPlayerRig'
  );
  const researchStart = projectile.indexOf("if (entity.projectileVisualKind === 'research-charge')");
  const researchEnd = projectile.indexOf("} else if (entity.projectileVisualKind === 'bio-genome-lance')", researchStart);
  const research = projectile.slice(researchStart, researchEnd);
  const coinStart = renderer.indexOf('} else if (entity.type === EntityType.COIN)');
  const coinEnd = renderer.indexOf('} else if (entity.type === EntityType.BOMB)', coinStart);
  const coin = renderer.slice(coinStart, coinEnd);
  const playerRig = sliceMethod('private drawPlayerRig', 'private syncMaxShotPresentation');
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const triggerStart = engine.indexOf('  triggerShipAbility()');
  const triggerEnd = engine.indexOf('\n  spawnShipAbilityProjectile(', triggerStart);
  const trigger = engine.slice(triggerStart, triggerEnd);
  const detonateStart = engine.indexOf('  detonateResearchCharge(');
  const detonateEnd = engine.indexOf('\n  isEnemyTarget(', detonateStart);
  const detonate = engine.slice(detonateStart, detonateEnd);

  assert.doesNotMatch(research, /view\.aura\.(?:circle|ellipse|stroke)/);
  assert.doesNotMatch(coin, /view\.aura\.(?:circle|ellipse)/);
  assert.doesNotMatch(playerRig, /magnetized|#facc15/);
  assert.match(trigger, /if \(ability\.id !== 'research-charge'\)/);
  assert.doesNotMatch(detonate, /spawnRingEffect/);
  assert.match(detonate, /RESEARCH_IMPACT_FRAME_URLS\[0\][\s\S]*RESEARCH_IMPACT_FRAME_URLS\[1\]/);
  assert.doesNotMatch(detonate, /RESEARCH_IMPACT_FRAME_URLS\[[2-6]\]/);
  assert.match(research, /RESEARCH_CHARGE_TRAIL_SEGMENTS_REDUCED/);
  assert.match(research, /RESEARCH_CHARGE_TRAIL_SEGMENTS_MOBILE/);
  assert.match(research, /RESEARCH_CHARGE_TRAIL_SEGMENTS_DESKTOP/);
  assert.match(research, /view\.trail[\s\S]*?\.moveTo\([\s\S]*?\.lineTo\([\s\S]*?\.stroke\(/);
  assert.match(research, /const trailFade = clamp\(age \/ 7, 0, 1\) \* clamp\(entity\.life \/ 10, 0, 1\)/);
  assert.doesNotMatch(research, /new (?:Sprite|Container|Graphics)|\.push\(|\.map\(/);
});

test('magnet feedback uses the same soft gradient light rather than a vector circle', () => {
  const lighting = sliceMethod(
    'private syncCombatLighting(engine: GameEngine)',
    'private syncDamageRecoil'
  );

  assert.match(lighting, /engine\.activePowerups\.has\(PowerupType\.MAGNET\)/);
  assert.match(lighting, /COMBAT_LIGHT_COIN_COLOR/);
  assert.match(lighting, /0\.1 \* magnetPulse \* intensityScale/);
  assert.doesNotMatch(lighting, /\.circle\(|\.ellipse\(|\.stroke\(/);
});

test('whole-boss recoil follows significant impacts without moving simulation geometry', () => {
  const recoil = sliceMethod(
    'private syncDamageRecoil',
    'private drawFlash'
  );
  const entityUpdate = sliceMethod(
    'private updateEntityView',
    'private syncEntities'
  );

  assert.match(recoil, /entity\.bossSignificantImpactFrame/);
  assert.match(recoil, /entity\.bossSignificantImpactXRatio/);
  assert.match(recoil, /entity\.bossSignificantImpactYRatio/);
  assert.match(recoil, /entity\.bossSignificantImpactStrength/);
  assert.doesNotMatch(recoil, /entity\.lastDamageFlashFrame > view\.lastDamageFlashFrame/);
  assert.doesNotMatch(recoil, /component\.lastDamageFlashFrame > view\.lastComponentDamageFrames\[component\.id\]/);
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

test('boss recoil remains significant-impact feedback without white silhouette filters', () => {
  const rail = sliceMethod(
    'private drawRailSerpentRig',
    'private drawPrismMothRig'
  );
  const moth = sliceMethod(
    'private drawPrismMothRig',
    'private drawArticulatedGeneratedBoss'
  );
  const bossFlash = sliceMethod(
    'private drawFlash',
    'private updateEntityView'
  );

  assert.doesNotMatch(rail, /WHITE_HIT_FILTERS/);
  assert.doesNotMatch(moth, /WHITE_HIT_FILTERS/);
  assert.match(rail, /const leftFilters = null/);
  assert.match(rail, /const rightFilters = null/);
  assert.match(rail, /cannon\.filters = side === 'left' \? leftFilters : rightFilters/);
  assert.match(moth, /const leftFilters = null/);
  assert.match(moth, /const rightFilters = null/);
  assert.match(moth, /pod\.filters = side === 'left' \? leftFilters : rightFilters/);
  assert.doesNotMatch(bossFlash, /WHITE_HIT_FILTERS/);
  assert.match(bossFlash, /entity\.type === EntityType\.BOSS/);
  assert.match(bossFlash, /entity\.type === EntityType\.MINI_BOSS/);
  assert.match(bossFlash, /view\.sprite\.filters = null/);
  assert.match(bossFlash, /view\.body\.filters = null/);
});
