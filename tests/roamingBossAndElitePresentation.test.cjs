const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const campaign = JSON.parse(read('game-config/campaign.json'));

const findCampaignLevel = (levelId) => {
  const level = campaign.levels.find((candidate) => candidate.id === levelId);
  assert.ok(level, `campaign stage ${levelId} exists`);
  return level;
};

const findCampaignEvent = (eventId) => {
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.id === eventId);
  assert.ok(event, `campaign event ${eventId} exists`);
  return event;
};

test('Citation Storm is a bossless formation-remix Mission with compact authored formation packs', () => {
  const stage = findCampaignLevel('stage-citation-storm');
  const events = stage.waves.flatMap((wave) => wave.events);
  const packedSpawns = events.filter((event) => event.kind === 'spawn' && event.patternId !== 'single-random');

  assert.equal(stage.campaignProgression.missionRole, 'formation-remix');
  assert.ok(packedSpawns.length >= 4);
  assert.ok(packedSpawns.some((event) => event.patternId === 'spiral'));
  assert.ok(packedSpawns.some((event) => event.patternId === 'diamond'));
  assert.ok(packedSpawns.every((event) => event.count >= 3));
  assert.ok(packedSpawns.every((event) => event.formationPackIds === undefined));

  assert.ok(stage.waves.every((wave) => wave.completionRule === 'clear-after-duration'));
  assert.equal(events.some((event) => event.kind === 'boss'), false);

  const overseer = findCampaignEvent('open-orbit-gatekeeper');
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
  assert.match(renderer, /\.fill\('#ef233c'\)/);
  assert.match(renderer, /this\.bossHealthRoot\.position\.set\(this\.width \/ 2/);
  assert.match(renderer, /entity\.type === EntityType\.MINI_BOSS \|\| entity\.isElite/);
  assert.doesNotMatch(renderer, /entity\.type === EntityType\.BOSS \|\| entity\.type === EntityType\.MINI_BOSS\) \{\s*this\.drawHealthBar/);
});
