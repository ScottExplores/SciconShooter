const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const campaign = JSON.parse(read('game-config/campaign.json'));

test('Citation Storm is a bossless clear wave built around compact elite hunter packs', () => {
  const wave = campaign.levels[0].waves.find((candidate) => candidate.id === 'citation-storm');
  assert.ok(wave);

  const eliteEvent = wave.events.find((event) => event.id === 'citation-storm-elite-reviewers');
  assert.equal(eliteEvent.kind, 'spawn');
  assert.equal(eliteEvent.blocksWaveClock, false);
  assert.equal(eliteEvent.patternId, 'diamond');
  assert.equal(eliteEvent.count, 4);
  assert.equal(eliteEvent.enemies[0].rank, 'elite');
  assert.equal(eliteEvent.enemies[0].attackPatternId, 'aimed-burst');
  assert.ok(eliteEvent.enemies[0].sizeMultiplier > 1);

  assert.equal(wave.completionRule, 'clear-after-duration');
  assert.equal(wave.events.some((event) => event.kind === 'boss' && event.bossId === 'gatekeeper'), false);

  const bastion = campaign.levels[0].waves.find((candidate) => candidate.id === 'bastion-protocol');
  const overseer = bastion.events.find((event) => event.id === 'bastion-protocol-gatekeeper');
  assert.equal(overseer.movementPatternId, 'gatekeeper-cycle');
  assert.equal(overseer.rigId, 'crown-claw');
});

test('the real engine owns roaming attacks, cross-beam danger, and elite firing', () => {
  const engine = read('services/gameLogic.ts');

  assert.match(engine, /updateArenaRoamingBoss\(boss/);
  assert.match(engine, /spawnBossCrossBeamPair\(boss/);
  assert.match(engine, /beamAxis:\s*'vertical'\s*\|\s*'horizontal'/);
  assert.match(engine, /hurtsPlayer = !e\.isTelegraph/);
  assert.match(engine, /updateEliteEnemyFire\(\)/);
  assert.match(engine, /source\.eliteAttackPattern !== 'aimed-burst'/);
});

test('Pixi presents a fixed boss meter and compact elite health bars', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const constants = read('constants.ts');
  const framePath = path.join(root, 'public', 'game-art', 'generated', 'ui', 'scicon-ui-system-v2', 'base', 'hud-primary', 'boss-integrity-bar.png');

  assert.match(constants, /PIXI_BOSS_HEALTH_FRAME/);
  assert.match(constants, /scicon-ui-system-v2\/base\/hud-primary\/boss-integrity-bar\.png/);
  assert.ok(fs.existsSync(framePath));
  assert.match(renderer, /private syncBossHealthHud\(engine: GameEngine\)/);
  assert.match(renderer, /frameWidth \* \(143 \/ 737\)/);
  assert.match(renderer, /\.fill\('#ef233c'\)/);
  assert.match(renderer, /this\.bossHealthRoot\.position\.set\(this\.width \/ 2/);
  assert.match(renderer, /entity\.type === EntityType\.MINI_BOSS \|\| entity\.isElite/);
  assert.doesNotMatch(renderer, /entity\.type === EntityType\.BOSS \|\| entity\.type === EntityType\.MINI_BOSS\) \{\s*this\.drawHealthBar/);
});
