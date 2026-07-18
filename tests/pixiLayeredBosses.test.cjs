const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('campaign gatekeepers use five-state layered damage art', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const constants = read('constants.ts');
  const expected = new Map([
    ['open-orbit-gatekeeper', 'PIXI_BOSS_OPEN_ORBIT_FRAMES'],
    ['citation-storm-gatekeeper', 'PIXI_BOSS_CITATION_FRAMES'],
    ['paywall-siege-gatekeeper', 'PIXI_BOSS_PAYWALL_FRAMES'],
    ['open-galaxy-gatekeeper', 'PIXI_BOSS_CROWNCLAW_FRAMES']
  ]);
  const bossEvents = campaign.levels.flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .filter((event) => expected.has(event.id));

  assert.equal(bossEvents.length, expected.size);
  for (const event of bossEvents) {
    assert.equal(event.spriteKey, expected.get(event.id));
    assert.match(constants, new RegExp(`${event.spriteKey}: (?:\\[|Array\\.from)`));
  }

  for (const directory of ['open-orbit', 'citation-storm', 'paywall-decimator/body']) {
    for (let frame = 1; frame <= 5; frame++) {
      assert.ok(fs.existsSync(path.join(root, 'public/game-art/pixi/bosses', directory, `frame-${frame}.png`)));
    }
  }
  for (let frame = 1; frame <= 6; frame++) {
    assert.ok(fs.existsSync(path.join(
      root,
      'public/game-art/generated/bosses/astral-crownclaw/animations/decay/frames',
      `astral-crownclaw-decay-frame-0${frame}.png`
    )));
  }
});

test('configured gatekeepers start before the Director wave boundary', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  for (const wave of campaign.levels.flatMap((level) => level.waves)) {
    const gatekeepers = wave.events.filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper');
    for (const gatekeeper of gatekeepers) {
      assert.ok(
        gatekeeper.startSeconds < wave.durationSeconds,
        `${gatekeeper.id} must start before ${wave.durationSeconds}s so preview playback cannot stop first`
      );
    }
  }
});

test('Paywall Decimator parts independently control bolt cannons and the core ray', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');

  assert.match(engine, /type BossPartId = 'left-cannon' \| 'right-cannon' \| 'helmet'/);
  assert.match(engine, /damageBossComponent\(boss: Entity, component: BossComponentState/);
  assert.match(engine, /if \(boss\.bossRigId === 'paywall-siege'\)/);
  assert.match(engine, /spawnPaywallBossRay\(boss: Entity, enraged: boolean\)/);
  assert.match(engine, /spawnPaywallBossBoltVolley\(boss: Entity, component: BossComponentState, enraged: boolean\)/);
  assert.match(engine, /cannons\.forEach\(\(component\) => this\.spawnPaywallBossBoltVolley/);
  assert.match(engine, /'CORE RAY CHARGING'/);
  assert.match(engine, /const coreEmitterOperational = boss\.hp > 0/);
  assert.match(engine, /isBossHullProtected\(boss: Entity\)/);
  assert.match(engine, /component\.id === 'helmet' && !component\.destroyed/);
  assert.match(engine, /projectileVisualKind = 'boss-ray'/);
  assert.match(engine, /projectileVisualKind = 'boss-bolt'/);
  assert.match(renderer, /drawBossComponents\(view: EntityView, entity: Entity/);
  assert.match(renderer, /ASSETS\.PIXI_BOSS_THRUSTER_FRAMES/);
  assert.match(renderer, /entity\.bossDecayStage/);
  assert.match(renderer, /spawnDetachedSprite/);
  assert.match(renderer, /spawnBossExplosion/);
  assert.match(renderer, /drawBossComponentHealthBar/);
  assert.match(renderer, /componentHealth/);

  const requiredAssets = [
    'cannon-left.png',
    'cannon-right.png',
    'helmet.png',
    'rays/frame-11.png',
    'bolts/frame-2.png',
    'thrust/frame-2.png'
  ];
  for (const asset of requiredAssets) {
    assert.ok(fs.existsSync(path.join(root, 'public/game-art/pixi/bosses/paywall-decimator', asset)));
  }
});

test('the first two gatekeepers use optional detachable weapon weak points', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const constants = read('constants.ts');

  assert.match(engine, /boss\.bossRigId === 'open-orbit' \|\| boss\.bossRigId === 'citation-storm'/);
  assert.match(engine, /LEFT RAILGUN/);
  assert.match(engine, /LEFT PLASMA CLAW/);
  const hullDamage = engine.slice(
    engine.indexOf('damageBossHull(boss: Entity'),
    engine.indexOf('spawnBoss(configured?: RuntimeBossEvent')
  );
  assert.match(hullDamage, /this\.isBossHullProtected\(boss\)/);
  assert.doesNotMatch(hullDamage, /left-cannon|right-cannon/);
  assert.match(engine, /if \(cannonComponents\.length > 0 && activeCannons\.length === 0\) \{\s*this\.spawnBossCoreVolley\(boss, phase\)/);
  assert.match(engine, /const origins = activeCannons\.length > 0/);
  assert.match(renderer, /PIXI_BOSS_OPEN_ORBIT_ARM_LEFT/);
  assert.match(renderer, /PIXI_BOSS_CITATION_CLAW_LEFT/);
  assert.match(renderer, /rightDestroyed && !leftDestroyed/);
  assert.match(constants, /generated\/boss-weapons\/open-orbit-railgun-arm-left\.png/);
  assert.match(constants, /generated\/boss-weapons\/citation-storm-plasma-claw-left\.png/);

  for (const asset of [
    'open-orbit-railgun-arm-left.png',
    'open-orbit-railgun-arm-right.png',
    'citation-storm-plasma-claw-left.png',
    'citation-storm-plasma-claw-right.png'
  ]) {
    assert.ok(fs.existsSync(path.join(root, 'public/game-art/generated/boss-weapons', asset)));
  }
});

test('boss components use predictable health shares while reserving the helmet for Boss 3', () => {
  const engine = read('services/gameLogic.ts');
  const componentFactory = engine.slice(
    engine.indexOf('createBossComponents(boss: Entity)'),
    engine.indexOf('getBossComponentBox(boss: Entity')
  );

  assert.match(engine, /'open-orbit': Object\.freeze\(\{ 'left-cannon': 5, 'right-cannon': 5 \}\)/);
  assert.match(engine, /'citation-storm': Object\.freeze\(\{ 'left-cannon': 6, 'right-cannon': 6 \}\)/);
  assert.match(engine, /'paywall-siege': Object\.freeze\(\{ 'left-cannon': 7, 'right-cannon': 7, helmet: 7 \}\)/);
  assert.match(engine, /'crown-claw': Object\.freeze\(\{ 'left-cannon': 8, 'right-cannon': 8 \}\)/);
  assert.match(engine, /const BOSS_CANNON_HEALTH_RATIO = 0\.25/);
  assert.match(engine, /const BOSS_HELMET_HEALTH_RATIO = 0\.18/);
  assert.match(engine, /getBossComponentDurability\(boss: Entity, componentId: BossPartId\)/);
  assert.match(engine, /Math\.round\(Math\.max\(1, boss\.maxHp\) \* healthRatio\)/);
  assert.match(componentFactory, /this\.getBossComponentDurability\(boss, layout\.id\)/);
  assert.match(engine, /const BOSS_COMPONENT_WEAK_POINT_MULTIPLIER = 1/);
  assert.match(engine, /component\.hp -= Math\.max\(0, damage\) \* BOSS_COMPONENT_WEAK_POINT_MULTIPLIER/);
  assert.match(componentFactory, /widthRatio: 0\.38/);
  assert.match(componentFactory, /widthRatio: 0\.34/);
  assert.match(engine, /const PAYWALL_BOSS_COMPONENT_LAYOUT/);

  const beforePaywall = componentFactory.slice(0, componentFactory.indexOf("if (boss.bossRigId === 'paywall-siege')"));
  const afterPaywall = componentFactory.slice(componentFactory.indexOf("if (boss.bossRigId === 'paywall-siege')"));
  const crownClawFactory = componentFactory.slice(componentFactory.indexOf("if (boss.bossRigId === 'crown-claw')"));
  assert.doesNotMatch(beforePaywall, /id: 'helmet'/);
  assert.match(afterPaywall, /PAYWALL_BOSS_COMPONENT_LAYOUT/);
  assert.doesNotMatch(crownClawFactory, /id: 'helmet'/);
});

test('boss cannons use enlarged visuals with focused collision footprints', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const componentHitbox = engine.slice(
    engine.indexOf('getBossComponentBox(boss: Entity'),
    engine.indexOf('getBossComponentHit(boss: Entity')
  );

  assert.match(engine, /export const BOSS_CANNON_SCALE = 1\.6/);
  assert.match(engine, /export const CROWNCLAW_ARM_SCALE = 1\.42/);
  assert.match(engine, /export const BOSS_CANNON_HITBOX_SCALE = 1\.12/);
  assert.match(engine, /export const CROWNCLAW_ARM_HITBOX_SCALE = 1\.12/);
  assert.match(renderer, /getBossComponentVisualScale\(entity: Entity, component: BossComponentState\)/);
  assert.match(renderer, /entity\.bossRigId === 'crown-claw' \? CROWNCLAW_ARM_SCALE : BOSS_CANNON_SCALE/);
  assert.match(renderer, /drawBossComponentHealthBar\(/);
  assert.match(renderer, /component\.hp \/ Math\.max\(1, component\.maxHp\)/);
  assert.match(renderer, /sprite\.width = entity\.width \* component\.widthRatio \* visualScale/);
  assert.match(renderer, /sprite\.height = entity\.height \* component\.heightRatio \* visualScale/);
  assert.match(componentHitbox, /boss\.bossRigId === 'crown-claw' \? CROWNCLAW_ARM_HITBOX_SCALE : BOSS_CANNON_HITBOX_SCALE/);
  assert.match(componentHitbox, /component\.widthRatio \* targetScale/);
  assert.match(componentHitbox, /component\.heightRatio \* targetScale/);

  const hullProtection = engine.slice(
    engine.indexOf('isBossHullProtected(boss: Entity)'),
    engine.indexOf('spawnBoss(configured?: RuntimeBossEvent')
  );
  assert.match(hullProtection, /component\.id === 'helmet' && !component\.destroyed/);
  assert.doesNotMatch(hullProtection, /left-cannon|right-cannon/);
});

test('boss cannon and hull hits use geometry-matched collision and sprite-shaped flashes', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const collisionFlow = engine.slice(
    engine.indexOf('const bossShieldedNow = this.isBossShielded()'),
    engine.indexOf('getBossWarningComms(_type: BossWarningType)')
  );
  const componentDamage = engine.slice(
    engine.indexOf('damageBossComponent(boss: Entity'),
    engine.indexOf('isBossHullProtected(boss: Entity)')
  );
  const hullDamage = engine.slice(
    engine.indexOf('damageBossHull(boss: Entity'),
    engine.indexOf('spawnBoss(configured?: RuntimeBossEvent')
  );
  const flashRenderer = renderer.slice(
    renderer.indexOf('private drawFlash(view: EntityView'),
    renderer.indexOf('private updateEntityView(view: EntityView')
  );

  assert.match(engine, /flashFrames: number;/);
  assert.match(engine, /lastDamageFlashFrame: number;/);
  assert.match(engine, /if \(component\.flashFrames > 0\) component\.flashFrames--/);
  assert.match(componentDamage, /this\.pulseBossComponentFlash\(component\)/);
  assert.match(hullDamage, /this\.pulseDamageFlash\(boss\)/);
  assert.match(engine, /const BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES = 5/);
  assert.match(collisionFlow, /const bossComponent = target\.type === EntityType\.BOSS[\s\S]*?getBossComponentHit\(target, shotBox\)/);
  assert.match(collisionFlow, /if \(!bossComponent && \([\s\S]*?shotBox\.x > target\.x \+ target\.width \+ padding/);
  assert.match(collisionFlow, /if \(!bossComponent && !this\.boxesIntersect\(shotBox, getBox\(target\)\)\) continue/);
  assert.match(renderer, /ColorMatrixFilter/);
  assert.match(renderer, /sprite\.filters = component\.flashFrames > 0 \? WHITE_HIT_FILTERS : null/);
  assert.match(flashRenderer, /entity\.type === EntityType\.BOSS \|\| entity\.type === EntityType\.MINI_BOSS/);
  assert.match(flashRenderer, /view\.sprite\.filters = filters/);
  assert.match(flashRenderer, /view\.bossRig\.parts\.filters = filters/);
  assert.match(flashRenderer, /view\.bossRig\.crownClaw\.root\.filters = filters/);
});

test('boss shield escorts are large readable targets with low-wave durability', () => {
  const engine = read('services/gameLogic.ts');

  assert.match(engine, /BOSS_SHIELD_ESCORT_MOBILE_SIZE = Object\.freeze\(\{ width: 48, height: 42 \}\)/);
  assert.match(engine, /BOSS_SHIELD_ESCORT_DESKTOP_SIZE = Object\.freeze\(\{ width: 54, height: 48 \}\)/);
  assert.match(engine, /getBossShieldEscortHp = \(wave: number\) => Math\.min\(8, Math\.max\(2, Math\.round\(wave\)\)\)/);
  assert.match(engine, /const hp = getBossShieldEscortHp\(phase\)/);
  assert.match(engine, /shield\.width = escortSize\.width/);
  assert.match(engine, /shield\.height = escortSize\.height/);
});

test('destroyed side weapons leave distinct health-scaled core attacks active', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const constants = read('constants.ts');

  assert.match(engine, /spawnBossCoreVolley\(boss: Entity, phase: number\)/);
  assert.match(engine, /'open-orbit': \{\s*shotCounts: \[1, 3, 5\]/);
  assert.match(engine, /'citation-storm': \{\s*shotCounts: \[3, 5, 7\]/);
  assert.match(engine, /'paywall-siege': \{\s*shotCounts: \[3, 5, 7\]/);
  assert.match(engine, /'crown-claw': \{\s*shotCounts: \[3, 5, 7\]/);
  assert.match(engine, /const pressure = 1 - healthRatio/);
  assert.match(engine, /const allowsBeam = !hasConfiguredWeapons/);
  assert.match(engine, /cannons\.length === 0/);
  assert.match(engine, /healthRatio <= 0\.25 \? 232 : healthRatio <= 0\.55 \? 274 : 318/);
  assert.match(renderer, /thrusterSprites: readonly \[Sprite, Sprite\]/);
  assert.match(renderer, /thrustFrameOrder = \[0, 1, 2, 1\]/);
  assert.match(constants, /PIXI_BOSS_THRUSTER_FRAMES/);
  assert.doesNotMatch(renderer, /ASSETS\.PIXI_BOSS_PAYWALL_THRUST_FRAMES\[Math\.floor\(engine\.frameCount/);
});

test('Wave 1 gatekeeper has an approachable arcade health budget', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const openingBoss = campaign.levels.flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.id === 'open-orbit-gatekeeper');

  assert.ok(openingBoss);
  assert.equal(openingBoss.health, 170);
  assert.equal(openingBoss.shieldCount, 0);
});

test('Astral Crownclaw uses an animated six-leg rig with destructible claws', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const crownEvent = campaign.levels.flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.id === 'open-galaxy-gatekeeper');

  assert.ok(crownEvent);
  assert.equal(crownEvent.spriteKey, 'PIXI_BOSS_CROWNCLAW_FRAMES');
  assert.equal(crownEvent.shieldCount, 0);
  assert.match(engine, /boss\.bossRigId === 'crown-claw'/);
  assert.match(engine, /spawnCrownClawStrike\(boss: Entity, component: BossComponentState/);
  assert.match(engine, /updateCrownClawBoss\(boss: Entity\)/);
  assert.match(engine, /LEFT CLAW/);
  assert.match(engine, /RIGHT CLAW/);
  assert.match(renderer, /CROWNCLAW_LEG_LAYOUT/);
  assert.match(renderer, /drawCrownClawComponents\(view: EntityView, entity: Entity/);
  assert.match(renderer, /crown\.root\.scale\.set\(entity\.width \/ 1024\)/);
  assert.match(renderer, /leg\.rotation = layout\.direction/);
  assert.match(renderer, /crown\.claws\[side\]\.scale\.set\(CROWNCLAW_ARM_SCALE\)/);
  assert.match(renderer, /strikeInFlight/);
  assert.match(renderer, /if \(!isCrownClaw\) \{[\s\S]*?view\.aura\.circle/);
  assert.match(engine, /claw\.bossOwnerId = boss\.id/);
  assert.match(engine, /claw\.clawReturning = true/);
  assert.match(engine, /updateCrownClawProjectile\(claw: Entity\)/);

  const requiredAssets = [
    'rig/astral-crownclaw-core-chassis.png',
    'rig/legs/astral-crownclaw-leg-front-left.png',
    'rig/legs/astral-crownclaw-leg-front-right.png',
    'rig/legs/astral-crownclaw-leg-middle-left.png',
    'rig/legs/astral-crownclaw-leg-middle-right.png',
    'rig/legs/astral-crownclaw-leg-rear-left.png',
    'rig/legs/astral-crownclaw-leg-rear-right.png',
    'rig/weapons/astral-crownclaw-sharp-claw-projectile-left.png',
    'rig/weapons/astral-crownclaw-sharp-claw-projectile-right.png'
  ];
  for (const asset of requiredAssets) {
    assert.ok(fs.existsSync(path.join(root, 'public/game-art/generated/bosses/astral-crownclaw', asset)));
  }
});

test('boss overlays rely on sprite damage feedback and expose Boss 3 helmet health', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const healthBar = renderer.slice(
    renderer.indexOf('drawBossComponentHealthBar('),
    renderer.indexOf('drawCrownClawComponents(')
  );
  const bossRig = renderer.slice(
    renderer.indexOf('drawBossRig('),
    renderer.indexOf('startBossDeath(')
  );

  assert.doesNotMatch(healthBar, /component\.id === 'helmet'\) return/);
  assert.match(healthBar, /component\.id === 'helmet'/);
  assert.doesNotMatch(bossRig, /view\.aura\.(?:circle|ellipse)/);
  assert.doesNotMatch(bossRig, /view\.trail\.(?:rect|moveTo|lineTo)/);
  assert.doesNotMatch(bossRig, /const cracks/);
});

test('boss wound stages use the checked-in gallery explosion sequence', () => {
  const constants = read('constants.ts');
  const effects = read('services/pixi/ArcadeEffectPool.ts');

  assert.match(constants, /PIXI_BOSS_DAMAGE_EXPLOSION_FRAMES: \[/);
  assert.match(effects, /setBossExplosionTextures/);
  assert.match(effects, /'boss-sprite-explosion'/);
  for (let frame = 1; frame <= 5; frame++) {
    assert.ok(fs.existsSync(path.join(root, 'public/game-art/pixi/effects/boss-damage', `frame-${frame}.png`)));
  }
});

test('later campaign cycles keep bosses and add telegraphed escalation patterns', () => {
  const engine = read('services/gameLogic.ts');

  assert.match(engine, /this\.currentCampaignIndex \+= 1/);
  assert.doesNotMatch(engine, /currentCampaignIndex = \(this\.currentCampaignIndex \+ 1\) %/);
  assert.match(engine, /spawnBossGapRing\(boss: Entity\)/);
  assert.match(engine, /queueBossTargetStrike\(boss: Entity\)/);
  assert.match(engine, /MISSILE LOCK/);
  assert.match(engine, /SIDE ENTRY/);
  assert.match(engine, /ENDLESS_CYCLE_DIFFICULTY_CAP/);
});
