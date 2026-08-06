const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const executeTypeScriptModule = (relativePath) => {
  const source = read(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, exports: moduleBox.exports, Math, Number }
  );
  return { source, ...moduleBox.exports };
};

const maskRuntime = executeTypeScriptModule(
  'services/gameplay/bosses/BossCollisionMask.ts'
);
const generatedMasks = executeTypeScriptModule(
  'services/gameplay/bosses/generatedBossCollisionMasks.ts'
);

const isOccupied = (mask, column, row) => {
  const wordsPerRow = Math.ceil(mask.width / 32);
  const word = mask.rowWords[row * wordsPerRow + Math.floor(column / 32)] ?? 0;
  return (word & (1 << (column % 32))) !== 0;
};

const findCell = (mask, occupied, emptyMargin = 0) => {
  for (let row = emptyMargin; row < mask.height - emptyMargin; row += 1) {
    for (let column = emptyMargin; column < mask.width - emptyMargin; column += 1) {
      if (isOccupied(mask, column, row) !== occupied) continue;
      if (!occupied && emptyMargin > 0) {
        let clear = true;
        for (let y = row - emptyMargin; y <= row + emptyMargin && clear; y += 1) {
          for (let x = column - emptyMargin; x <= column + emptyMargin; x += 1) {
            if (isOccupied(mask, x, y)) {
              clear = false;
              break;
            }
          }
        }
        if (!clear) continue;
      }
      return { column, row };
    }
  }
  throw new Error(`No ${occupied ? 'occupied' : 'transparent'} mask cell found`);
};

const projectileAtCell = (mask, bounds, cell, size = 2) => {
  const cellWidth = bounds.width / mask.width;
  const cellHeight = bounds.height / mask.height;
  return {
    x: bounds.x + (cell.column + 0.5) * cellWidth - size / 2,
    y: bounds.y + (cell.row + 0.5) * cellHeight - size / 2,
    width: size,
    height: size
  };
};

test('generated alpha masks reject transparent space inside a boss AABB', () => {
  const mask = generatedMasks.getCampaignBossCollisionMask(
    '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/orbit-gyroscope.png'
  );
  assert.ok(mask, 'the ring-shaped boss must have a generated collision mask');

  const bounds = { x: 100, y: 50, width: 640, height: 640 };
  const visibleCell = findCell(mask, true);
  const transparentCell = findCell(mask, false, 2);

  assert.equal(
    maskRuntime.intersectsBossCollisionMask(
      mask,
      bounds,
      projectileAtCell(mask, bounds, visibleCell)
    ),
    true,
    'a shot touching an opaque sprite cell must hit'
  );
  assert.equal(
    maskRuntime.intersectsBossCollisionMask(
      mask,
      bounds,
      projectileAtCell(mask, bounds, transparentCell)
    ),
    false,
    'a shot through transparent pixels must not hit the invisible rectangle'
  );
});

test('component masks reject transparent cannon padding and rotate with the boss', () => {
  const mask = generatedMasks.getBossComponentCollisionMask(
    'open-orbit',
    'left-cannon'
  );
  assert.ok(mask, 'the detachable cannon must own an alpha-derived mask');

  const bounds = { x: 0, y: 0, width: 640, height: 640 };
  const visibleCell = findCell(mask, true);
  const transparentCell = findCell(mask, false, 2);
  const visibleShot = projectileAtCell(mask, bounds, visibleCell);
  const transparentShot = projectileAtCell(mask, bounds, transparentCell);

  assert.equal(
    maskRuntime.intersectsBossCollisionMask(mask, bounds, visibleShot),
    true
  );
  assert.equal(
    maskRuntime.intersectsBossCollisionMask(mask, bounds, transparentShot),
    false
  );

  const tinyMask = {
    width: 8,
    height: 8,
    rowWords: [0, 1 << 1, 0, 0, 0, 0, 0, 0]
  };
  const tinyBounds = { x: 0, y: 0, width: 80, height: 80 };
  assert.equal(
    maskRuntime.intersectsBossCollisionMask(
      tinyMask,
      tinyBounds,
      { x: 63, y: 13, width: 4, height: 4 },
      Math.PI / 2
    ),
    true,
    'the visible cell must follow presentation banking'
  );
  assert.equal(
    maskRuntime.intersectsBossCollisionMask(
      tinyMask,
      tinyBounds,
      { x: 13, y: 13, width: 4, height: 4 },
      Math.PI / 2
    ),
    false,
    'the sprite cell old location must no longer collide after rotation'
  );
});

test('standard shots and both continuous player beams share boss silhouette collision', () => {
  const engine = read('services/gameLogic.ts');
  const bioLaser = engine.slice(
    engine.indexOf('private applyBioLaserPulse(level: number)'),
    engine.indexOf('countPlayerShots(', engine.indexOf('private applyBioLaserPulse(level: number)'))
  );
  const researchBeam = engine.slice(
    engine.indexOf('applyResearchBeamDamage()'),
    engine.indexOf('updateEnemyFire()', engine.indexOf('applyResearchBeamDamage()'))
  );
  const playerShotCollision = engine.slice(
    engine.indexOf('for (const shot of playerShots)'),
    engine.indexOf('getBossWarningComms(_type: BossWarningType)')
  );

  assert.match(bioLaser, /this\.bossSilhouetteIntersectsBox\(target, beamBox\)/);
  assert.match(researchBeam, /this\.bossSilhouetteIntersectsBox\(target, beamBox\)/);
  assert.match(playerShotCollision, /this\.bossSilhouetteIntersectsBox\(target, shotBox\)/);
  assert.ok(
    playerShotCollision.indexOf('this.bossSilhouetteIntersectsBox(target, shotBox)')
      < playerShotCollision.indexOf("shot.shipAbilityKind === 'research-charge'"),
    'a transparent miss must be rejected before a projectile is consumed or detonated'
  );
  assert.ok(
    playerShotCollision.indexOf('this.bossSilhouetteIntersectsBox(target, shotBox)')
      < playerShotCollision.indexOf('shot.markedForDeletion = true'),
    'a transparent miss must not consume an ordinary player shot'
  );
});

test('boss component selection requires visible component-mask overlap', () => {
  const engine = read('services/gameLogic.ts');
  const helperStart = engine.indexOf('getBossCollisionMask(boss: Entity)');
  const helperEnd = engine.indexOf('detonateBitcoinHashBurst(', helperStart);
  const collisionHelpers = engine.slice(
    helperStart,
    helperEnd
  );
  const componentHit = collisionHelpers.slice(
    collisionHelpers.indexOf('getBossComponentHit(boss: Entity'),
    collisionHelpers.indexOf('detonateBitcoinHashBurst(')
  );
  const hullHit = collisionHelpers.slice(
    collisionHelpers.indexOf('bossSilhouetteIntersectsBoxAt('),
    collisionHelpers.indexOf('bossComponentSilhouetteIntersectsBox(')
  );

  assert.match(hullHit, /if \(!mask\) \{[\s\S]*?const collisionBox = this\.getCollisionBox\(boss\);[\s\S]*?return this\.boxesIntersect\(box,/);
  assert.match(hullHit, /return this\.bossSilhouetteIntersectsBoxAt\(boss, box, boss\.x, boss\.y\)/);
  assert.match(hullHit, /boss\.bossPresentationBankRadians/);
  assert.match(
    collisionHelpers,
    /bossComponentSilhouetteIntersectsBox\([\s\S]*?getBossComponentCollisionMask\(boss\.bossRigId, component\.id\)/
  );
  assert.match(
    collisionHelpers,
    /intersectsBossCollisionMask\([\s\S]*?componentBox,[\s\S]*?box/
  );
  assert.match(
    componentHit,
    /visibleHit: this\.bossComponentSilhouetteIntersectsBox\([\s\S]*?boss,[\s\S]*?component,[\s\S]*?shotBox/
  );
  assert.match(componentHit, /\.filter\(\(candidate\) => candidate\.visibleHit\)/);
  assert.doesNotMatch(componentHit, /crossesProtectedCoreLane|shotCenterX >= helmetBox/);
});

test('collision masks are generated, immutable, and hash-bound to Sandbox art', () => {
  const generator = read('tools/generate-boss-collision-masks.mjs');
  const campaignMasks = read('services/gameplay/bosses/generatedBossCollisionMasks.ts');
  const sandboxMasks = read(
    'director/src/tools/bosses/generatedSandboxBossCollisionMasks.ts'
  );
  const sandboxModel = read('director/src/tools/bosses/bossSandboxModel.ts');
  const contracts = read('services/pixi/boss-rigs/PreviewBossRigContracts.ts');
  const canvas = read('components/GameCanvas.tsx');

  assert.match(generator, /const ALPHA_THRESHOLD = 48/);
  assert.match(generator, /PNG\.sync\.read/);
  assert.match(generator, /createHash\('sha256'\)/);
  assert.match(generator, /new Uint32Array/);
  assert.match(campaignMasks, /Generated by tools\/generate-boss-collision-masks\.mjs/);
  assert.match(sandboxMasks, /readonly contentHash: string/);
  assert.match(sandboxMasks, /Object\.freeze\(\{ width: 64, height: 64, rowWords: Object\.freeze/);
  assert.match(
    sandboxModel,
    /collisionMaskAsset\.contentHash !== registration\.assembled\.contentHash/
  );
  assert.match(sandboxModel, /collisionMask: collisionMaskAsset\.mask/);
  assert.match(contracts, /readonly collisionMask\?: BossCollisionMask/);
  assert.match(canvas, /previewBossCollisionMask: setupBossArtwork\?\.collisionMask/);
});
