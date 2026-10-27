const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('ResearchHub Signature Move ships every Spark, Bolt, Charged, and Hit I-IV frame', () => {
  const source = read('services/shipAbilityService.ts');

  const frameGroups = [
    ['research-spark', /^spark-preview\d+\.png$/, 5],
    ['research-bolt', /^bolt\d+\.png$/, 4],
    ['research-charge', /^charged\d+\.png$/, 6],
    ['research-impact/hits-1', /^hits-1-\d+\.png$/, 5],
    ['research-impact/hits-2', /^hits-2-\d+\.png$/, 7],
    ['research-impact/hits-3', /^hits-3-\d+\.png$/, 5],
    ['research-impact/hits-4', /^hits-4-\d+\.png$/, 7]
  ];
  for (const [relativePath, pattern, expectedCount] of frameGroups) {
    const directory = path.join(root, 'public/game-art/legacy/weapon-fx', relativePath);
    const frames = fs.readdirSync(directory).filter((name) => pattern.test(name));
    assert.equal(frames.length, expectedCount, `${relativePath} frame count`);
    frames.forEach((name) => {
      const png = fs.readFileSync(path.join(directory, name));
      assert.equal(png[25], 6, `${relativePath}/${name} must preserve transparency`);
    });
  }

  assert.match(source, /RESEARCH_SPARK_FRAME_URLS/);
  assert.match(source, /RESEARCH_BOLT_FRAME_URLS/);
  assert.match(source, /RESEARCH_CHARGED_FRAME_URLS/);
  assert.match(source, /RESEARCH_IMPACT_FRAME_URLS_BY_TIER/);
  assert.match(source, /RESEARCH_CHARGE_COOLDOWN_FRAMES = 16 \* 60/);
  assert.match(source, /RESEARCH_CHARGE_BLAST_RADIUS = 124/);
});

test('every playable ship ability is routed through the real engine and shared HUD slot', () => {
  const abilities = read('services/shipAbilityService.ts');
  const app = read('App.tsx');
  const canvas = read('components/GameCanvas.tsx');
  const hud = read('components/UIOverlay.tsx');
  const hangar = read('components/SquadHangar.tsx');
  const engine = read('services/gameLogic.ts');

  for (const ability of ['research-charge', 'bio-genome-lance', 'eth-prism-volley', 'btc-hash-burst']) {
    assert.match(abilities, new RegExp(ability));
    assert.match(engine, new RegExp(ability));
  }
  assert.match(app, /shipAbilityCommand/);
  assert.match(app, /playerShipId: activeMissionShipId/);
  assert.match(canvas, /engineRef\.current\.triggerShipAbility\(\)/);
  assert.match(canvas, /playerShipId,/);
  assert.match(hud, /selectedShipId && onUseShipAbility/);
  assert.match(hud, /getShipAbilityDefinition\(selectedShipId \?\? 'researchhub'\)/);
  assert.match(hud, /conic-gradient\(from 0deg/);
  assert.match(engine, /triggerShipAbility\(\)/);
  assert.match(engine, /detonateResearchCharge\(/);
  assert.match(engine, /detonateBitcoinHashBurst\(/);
  assert.match(engine, /frames: abilityUpgradeProfile\.projectileFrames/);
  assert.match(engine, /impact\.spriteFrames = \[\.\.\.abilityUpgradeProfile\.impactFrames\]/);
  assert.match(engine, /this\.stats\.upgrades\?\.ability \|\| 0/);
  assert.match(hud, /getShipAbilityUpgradeProfile/);
  assert.match(hangar, /getShipAbilityUpgradeProfile/);
});

test('Pixi preloads and animates all ship ability sprite sequences', () => {
  const abilities = read('services/shipAbilityService.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const hud = read('components/UIOverlay.tsx');

  assert.match(renderer, /SHIP_ABILITY_FRAME_URLS/);
  assert.match(renderer, /RESEARCH_IMPACT_ALL_FRAME_URLS/);
  assert.match(renderer, /entity\.projectileVisualKind === 'research-charge'/);
  assert.match(renderer, /entity\.projectileVisualKind === 'bio-genome-lance'/);
  assert.match(renderer, /entity\.projectileVisualKind === 'eth-prism-volley'/);
  assert.match(renderer, /entity\.projectileVisualKind === 'btc-hash-burst'/);
  assert.match(renderer, /view\.root\.rotation = -Math\.PI \/ 2/);
  assert.match(renderer, /researchChargeArtPointsLeft\(textureKey\)/);
  assert.match(renderer, /researchPrimaryArtPointsDown\(shotFamily\)/);
  const weaponVisuals = read('services/playerWeaponVisuals.ts');
  assert.match(weaponVisuals, /researchChargeArtPointsLeft = \(frameUrl: string\) => \(\s*frameUrl\.includes\('\/research-bolt\/'\)\s*\)/);
  assert.doesNotMatch(weaponVisuals, /research-spark\/'\) \|\| frameUrl\.includes\('\/research-charge\/'\)/);
  assert.match(weaponVisuals, /researchPrimaryArtPointsDown = \(_family: PlayerWeaponVisualFamily\) => false/);
  assert.match(renderer, /view\.sprite\.scale\.y = -Math\.abs\(view\.sprite\.scale\.y\)/);
  assert.match(read('services/playerWeaponVisuals.ts'), /research-spark/);
  assert.match(read('services/playerWeaponVisuals.ts'), /research-charge/);
  assert.match(hud, /abilityDefinition\.iconRotationDegrees/);
  assert.match(renderer, /effect\.effectType === 'sprite'/);

  // All three hulls share their clean energy identity across primary and
  // signature shots. Size, pattern and impact differentiate the signature.
  assert.doesNotMatch(abilities, /getGalleryAbilityFrames/);
  assert.match(abilities, /SIGNATURE_MOVE_FX_ROOT = '\/game-art\/generated\/scicon-combat-evolution-v1'/);
  for (const ship of ['bio', 'eth', 'btc']) {
    assert.match(abilities, new RegExp(`getSignatureMoveFrames\\('${ship}'\\)`));
    for (let frame = 1; frame <= 6; frame++) {
      const icon = fs.readFileSync(path.join(root, 'public/game-art/generated/scicon-combat-evolution-v1', `${ship}-${frame}.png`));
      assert.equal(icon[25], 6, `${ship} ability frame ${frame} must retain an alpha channel`);
    }
  }
  // ResearchHub uses the selected CC0 ladder rather than generated frames.
  assert.match(abilities, /RESEARCH_CHARGE_FRAME_URLS = RESEARCH_SPARK_FRAME_URLS/);
  assert.match(abilities, /legacy\/weapon-fx/);
  assert.match(abilities, /research-spark/);
  assert.match(abilities, /research-bolt/);
  assert.match(abilities, /research-impact\/hits-4/);
});

test('boss cannon components use seven percent health and hull pressure increases attacks', () => {
  const engine = read('services/gameLogic.ts');

  assert.match(engine, /BOSS_CANNON_HEALTH_RATIO = 0\.07/);
  assert.match(engine, /Math\.round\(Math\.max\(1, boss\.maxHp\) \* healthRatio\)/);
  assert.match(engine, /hullPressureMultiplier/);
  assert.match(engine, /const pressure = 1 - healthRatio/);
});
