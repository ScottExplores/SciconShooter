const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const campaign = JSON.parse(read('game-config/campaign.json'));
const { assertRevampMission } = require('./helpers/campaignRevampAssertions.cjs');

const findCampaignLevel = (levelId) => {
  const level = campaign.levels.find((candidate) => candidate.id === levelId);
  assert.ok(level, `campaign stage ${levelId} exists`);
  return level;
};

const findCampaignBoss = (bossId) => {
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.kind === 'boss' && candidate.bossId === bossId);
  assert.ok(event, `campaign boss ${bossId} exists`);
  return event;
};

test('Citation Storm is a bossless formation-remix Mission with compact authored formation packs', () => {
  const stage = findCampaignLevel('stage-citation-storm');
  const events = stage.waves.flatMap((wave) => wave.events);
  const packedSpawns = events.filter((event) => event.kind === 'spawn' && event.patternId !== 'single-random');

  assert.equal(stage.campaignProgression.missionRole, 'formation-remix');
  assert.ok(packedSpawns.length >= 4);
  // REVAMP(G): I varies curved entry paths into large grids with two specialists.
  assertRevampMission(stage, campaign);
  assert.ok(new Set(packedSpawns.map(event => event.formationBehavior?.entryPathId)).size >= 3);
  assert.ok(packedSpawns.every(event => event.patternId === 'grid'));
  assert.ok(packedSpawns.every(event => event.formationBehavior?.movementId === 'revamp-breathe'));
  assert.ok(packedSpawns.every(event => ['revamp-dive', 'revamp-escort'].includes(event.formationBehavior?.attackId)));
  assert.ok(packedSpawns.every(event => event.formationBehavior?.telegraphSeconds >= 0.6
    && event.formationBehavior?.returnId === 'reform'));
  assert.ok(packedSpawns.every((event) => event.count >= 2 && event.count <= 38));
  assert.ok(packedSpawns.every((event) => event.formationPackIds === undefined));

  assert.ok(stage.waves.every((wave) => wave.completionRule === 'clear-after-duration'));
  assert.equal(events.some((event) => event.kind === 'boss'), false);

  const overseer = findCampaignBoss('gatekeeper-prime');
  assert.equal(overseer.movementPatternId, 'gatekeeper-cycle');
  assert.equal(overseer.rigId, 'open-orbit');
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
  assert.match(renderer, /const barWidth = frameWidth \* 0\.75/);
  assert.match(renderer, /const barHeight = frameHeight \* 0\.29/);
  assert.match(renderer, /const barY = -frameHeight \* 0\.17/);
  assert.match(renderer, /\.fill\('#ef233c'\)/);
  assert.match(renderer, /this\.bossHealthName\.position\.set\(0, -frameHeight \* 0\.64\)/);
  assert.doesNotMatch(renderer, /bossHealthPercent/);
  assert.match(renderer, /this\.bossHealthRoot\.position\.set\(this\.width \/ 2/);
  assert.match(renderer, /entity\.type === EntityType\.MINI_BOSS[\s\S]*?engine\.compactMiniBossHealthBarsVisible/);
  assert.match(renderer, /entity\.isElite[\s\S]*?this\.drawHealthBar\(view, entity\)/);
  assert.doesNotMatch(renderer, /entity\.type === EntityType\.BOSS \|\| entity\.type === EntityType\.MINI_BOSS\) \{\s*this\.drawHealthBar/);
});
