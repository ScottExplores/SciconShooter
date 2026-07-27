const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const constants = read('constants.ts');
const renderer = read('services/pixi/PixiGameRenderer.ts');
const gameLogic = read('services/gameLogic.ts');

const rigAssets = {
  railSerpent: [
    'head.png',
    'body-upper.png',
    'body-lower.png',
    'tail.png',
    'energy-core.png',
    'left-shoulder.png',
    'right-shoulder.png',
    'left-rib.png',
    'right-rib.png',
    'left-cannon.png',
    'right-cannon.png'
  ],
  prismMoth: [
    'core.png',
    'crest.png',
    'prism-core.png',
    'tail.png',
    'left-upper-wing.png',
    'right-upper-wing.png',
    'left-mid-wing.png',
    'right-mid-wing.png',
    'left-lower-inner-wing.png',
    'right-lower-inner-wing.png',
    'left-lower-outer-wing.png',
    'right-lower-outer-wing.png',
    'left-weapon-pod.png',
    'right-weapon-pod.png'
  ]
};

test('Rail Serpent and Prism Moth register every runtime rig part as transparent generated art', () => {
  assert.match(constants, /PIXI_BOSS_RAIL_SERPENT_RIG:\s*\{/);
  assert.match(constants, /PIXI_BOSS_PRISM_MOTH_RIG:\s*\{/);

  for (const filename of rigAssets.railSerpent) {
    assert.equal(
      fs.existsSync(path.join(
        root,
        'public/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig',
        filename
      )),
      true,
      `rail-serpent/${filename}`
    );
    assert.match(constants, new RegExp(`rail-serpent/rig/${filename.replaceAll('.', '\\.')}`));
  }
  for (const filename of rigAssets.prismMoth) {
    assert.equal(
      fs.existsSync(path.join(
        root,
        'public/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig',
        filename
      )),
      true,
      `prism-moth/${filename}`
    );
    assert.match(constants, new RegExp(`prism-moth/rig/${filename.replaceAll('.', '\\.')}`));
  }
});

test('articulated boss sprites are constructed once per pooled boss view and loaded on demand', () => {
  const creation = renderer.slice(
    renderer.indexOf('private createEntityView(entity: Entity)'),
    renderer.indexOf('private releaseEntityView(view: EntityView)')
  );
  const load = renderer.slice(
    renderer.indexOf('private ensureArticulatedBossRigLoad'),
    renderer.indexOf('private bindRailSerpentRigTextures')
  );
  const railDraw = renderer.slice(
    renderer.indexOf('private drawRailSerpentRig'),
    renderer.indexOf('private drawPrismMothRig')
  );
  const mothDraw = renderer.slice(
    renderer.indexOf('private drawPrismMothRig'),
    renderer.indexOf('private drawArticulatedGeneratedBoss')
  );

  assert.match(creation, /createRailSerpentRigView\(\)/);
  assert.match(creation, /createPrismMothRigView\(\)/);
  assert.match(renderer, /private resetArticulatedBossRig/);
  assert.match(renderer, /this\.resetArticulatedBossRig\(reused\.bossRig\.articulated\)/);
  assert.match(renderer, /this\.resetArticulatedBossRig\(view\.bossRig\.articulated\)/);
  assert.match(load, /if \(this\.articulatedBossRigLoads\.has\(archetype\)\) return/);
  assert.match(load, /this\.textureBank\.preload\(Array\.from\(urls\)\)/);
  assert.doesNotMatch(railDraw, /new (?:Sprite|Container|Graphics)/);
  assert.doesNotMatch(mothDraw, /new (?:Sprite|Container|Graphics)/);
});

test('Rail Serpent flexes a delayed body chain and keeps its cannons independent from beam entities', () => {
  const railDraw = renderer.slice(
    renderer.indexOf('private drawRailSerpentRig'),
    renderer.indexOf('private drawPrismMothRig')
  );

  assert.match(railDraw, /chainTime - 0\.62/);
  assert.match(railDraw, /chainTime - 1\.18/);
  assert.match(railDraw, /chainTime - 1\.82/);
  assert.match(railDraw, /candidate\.bossOwnerId !== entity\.id/);
  assert.match(railDraw, /candidate\.isTelegraph/);
  assert.match(railDraw, /const recoil = liveBeam \? 7 \* motionScale : 0/);
  assert.match(railDraw, /cannon\.visible = !component\?\.destroyed/);
  assert.match(railDraw, /const leftFilters = null/);
  assert.match(railDraw, /const rightFilters = null/);
  assert.match(railDraw, /cannon\.filters = side === 'left' \? leftFilters : rightFilters/);
  assert.doesNotMatch(railDraw, /WHITE_HIT_FILTERS/);
  assert.doesNotMatch(railDraw, /Math\.random/);
});

test('Prism Moth wings flap independently while the core breathes with health and charge pressure', () => {
  const mothDraw = renderer.slice(
    renderer.indexOf('private drawPrismMothRig'),
    renderer.indexOf('private drawArticulatedGeneratedBoss')
  );

  assert.match(mothDraw, /for \(const partId of PRISM_MOTH_WING_PART_IDS\)/);
  assert.match(renderer, /'leftMidWing'/);
  assert.match(renderer, /'rightMidWing'/);
  assert.match(mothDraw, /Math\.sin\(flapTime \+ layout\.phase\)/);
  assert.match(mothDraw, /healthPressure \* 0\.025 \+ chargeEnergy \* 0\.018/);
  assert.match(mothDraw, /wing\.rotation = layout\.side/);
  assert.match(mothDraw, /wing\.scale\.set/);
  assert.match(mothDraw, /prismCore\.scale\.set/);
  assert.match(mothDraw, /pod\.visible = !component\?\.destroyed/);
  assert.match(mothDraw, /const leftFilters = null/);
  assert.match(mothDraw, /const rightFilters = null/);
  assert.match(mothDraw, /pod\.filters = side === 'left' \? leftFilters : rightFilters/);
  assert.doesNotMatch(mothDraw, /WHITE_HIT_FILTERS/);
  assert.doesNotMatch(mothDraw, /Math\.random/);
});

test('Prism Moth weapon pods stay centered on the targetable cannon geometry', () => {
  const mothDraw = renderer.slice(
    renderer.indexOf('private drawPrismMothRig'),
    renderer.indexOf('private drawArticulatedGeneratedBoss')
  );

  assert.match(gameLogic, /id: 'left-cannon',[\s\S]*?centerXRatio: isPrismMoth \? 0\.22 : 0\.17/);
  assert.match(gameLogic, /id: 'right-cannon',[\s\S]*?centerXRatio: isPrismMoth \? 0\.78 : 0\.83/);
  assert.match(mothDraw, /const podCenterXRatio = component\?\.centerXRatio \?\? \(side === 'left' \? 0\.17 : 0\.83\)/);
  assert.match(mothDraw, /const podCenterYRatio = component\?\.centerYRatio \?\? 0\.45/);
  assert.match(mothDraw, /const podX = \(podCenterXRatio - 0\.5\) \* PRISM_MOTH_DESIGN_SIZE\.width/);
  assert.match(mothDraw, /const podY = \(podCenterYRatio - 0\.5\) \* PRISM_MOTH_DESIGN_SIZE\.height/);
  assert.doesNotMatch(mothDraw, /component\.(?:centerXRatio|centerYRatio)\s*=/);
});

test('articulation remains presentation-only and falls back to the composite boss texture', () => {
  const articulation = renderer.slice(
    renderer.indexOf('private drawRailSerpentRig'),
    renderer.indexOf('private getBossComponentVisualScale')
  );
  const bossSync = renderer.slice(
    renderer.indexOf("} else if (entity.type === EntityType.BOSS)"),
    renderer.indexOf("} else if (entity.type === EntityType.MINI_BOSS)")
  );

  assert.doesNotMatch(articulation, /entity\.(?:x|y|width|height|hp)\s*[+*/-]?=/);
  assert.doesNotMatch(articulation, /bossComponents\s*=/);
  assert.match(bossSync, /this\.drawBossComponents\(view, entity, engine\)/);
  assert.match(bossSync, /this\.drawBossRig\(view, entity, engine\)/);
  assert.match(bossSync, /view\.sprite\.visible = !articulatedBossReady/);
  assert.match(renderer, /this\.drawBossComponentHealthBar/);
});
