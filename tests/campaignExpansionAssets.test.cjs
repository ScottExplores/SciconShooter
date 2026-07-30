const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'game-config', 'types.ts'), 'utf8');
const recordCardApiSource = fs.readFileSync(path.join(root, 'api', 'record-card.js'), 'utf8');

const bossAssets = {
  CAMPAIGN_BOSS_ECLIPSE_ENGINE: 'bosses/frames/eclipse-engine.png',
  CAMPAIGN_BOSS_HAMMERHEAD_SIEGE: 'bosses/frames/hammerhead-siege.png',
  CAMPAIGN_BOSS_HELIX_LEVIATHAN: 'bosses/frames/helix-leviathan.png',
  CAMPAIGN_BOSS_ORBIT_GYROSCOPE: 'bosses/frames/orbit-gyroscope.png',
  CAMPAIGN_BOSS_PRISM_MOTH: 'bosses/frames/prism-moth.png',
  CAMPAIGN_BOSS_RAIL_SERPENT: 'bosses/frames/rail-serpent.png',
  CAMPAIGN_BOSS_SINGULARITY_CRAB: 'bosses/frames/singularity-crab.png',
  CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT: 'bosses/frames/tribunal-dreadnought.png'
};

const enemyAssets = {
  CAMPAIGN_ENEMY_BULLET_RING_EMITTER: 'enemies/frames/bullet-ring-emitter.png',
  CAMPAIGN_ENEMY_CRESCENT_MINELAYER: 'enemies/frames/crescent-minelayer.png',
  CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL: 'enemies/frames/dark-asteroid-sentinel.png',
  CAMPAIGN_ENEMY_DNA_CONDUCTOR: 'enemies/frames/dna-conductor.png',
  CAMPAIGN_ENEMY_LASER_HUNTER: 'enemies/frames/laser-hunter.png',
  CAMPAIGN_ENEMY_LASER_STALKER: 'enemies/frames/laser-stalker.png',
  CAMPAIGN_ENEMY_ORBIT_DISC: 'enemies/frames/orbit-disc.png',
  CAMPAIGN_ENEMY_PRISM_ARTILLERY: 'enemies/frames/prism-artillery.png',
  CAMPAIGN_ENEMY_RING_SENTINEL: 'enemies/frames/ring-sentinel.png',
  CAMPAIGN_ENEMY_SHIELD_RAMMER: 'enemies/frames/shield-rammer.png',
  CAMPAIGN_ENEMY_WALL_SNIPER_LEFT: 'enemies/frames/wall-sniper-left.png',
  CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT: 'enemies/frames/wall-sniper-right.png'
};

const expansionRoot = path.join(root, 'public', 'game-art', 'generated', 'scicon-stage20-expansion-v1');

test('the Stage 20 expansion registers every generated combat image behind a built-in catalog key', () => {
  for (const [key, relativePath] of Object.entries({ ...bossAssets, ...enemyAssets })) {
    assert.match(constantsSource, new RegExp(`${key}:\\s*\"/game-art/generated/scicon-stage20-expansion-v1/`));
    assert.match(typesSource, new RegExp(`'${key}'`));
    assert.match(catalogSource, new RegExp(`${key}: asset\\('${key}'`));
    assert.match(
      recordCardApiSource,
      new RegExp(`${key}:\\s*'/game-art/generated/scicon-stage20-expansion-v1/${relativePath.replaceAll('.', '\\.')}'`),
      `${key} server record-card mapping`
    );
    assert.equal(fs.existsSync(path.join(expansionRoot, relativePath)), true, relativePath);
  }
});

test('Max Shot exposes the complete eight-frame electric aura sequence', () => {
  assert.match(constantsSource, /POWERUP_MAX_SHOT_AURA_FRAMES:\s*Array\.from\(/);
  assert.match(typesSource, /'POWERUP_MAX_SHOT_AURA_FRAMES'/);
  assert.match(catalogSource, /POWERUP_MAX_SHOT_AURA_FRAMES: asset\('POWERUP_MAX_SHOT_AURA_FRAMES'/);
  for (let frame = 1; frame <= 8; frame += 1) {
    const filename = `max-shot-aura-${String(frame).padStart(2, '0')}.png`;
    assert.equal(fs.existsSync(path.join(expansionRoot, 'powerups', 'max-shot-aura', 'frames', filename)), true);
  }
});

test('Helios Clawcarrier exposes its promoted Campaign art through every asset registry', () => {
  const key = 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER';
  const relativePath = 'bosses/helios-clawcarrier/helios-clawcarrier-neutral.png';

  assert.match(constantsSource, new RegExp(`${key}:\\s*"/game-art/generated/${relativePath.replaceAll('.', '\\.')}`));
  assert.match(typesSource, new RegExp(`'${key}'`));
  assert.match(catalogSource, new RegExp(`${key}: asset\\('${key}'`));
  assert.match(
    recordCardApiSource,
    new RegExp(`${key}:\\s*'/game-art/generated/${relativePath.replaceAll('.', '\\.')}'`)
  );
  assert.equal(fs.existsSync(path.join(root, 'public', 'game-art', 'generated', relativePath)), true);
});

test('every revision-23 sector ends in one authored major-boss Mission', () => {
  const expectedByMissionOrder = new Map([
    [5, { bossId: 'gatekeeper-prime', spriteKey: 'PIXI_BOSS_OPEN_ORBIT_FRAMES' }],
    [10, { bossId: 'paywall-decimator', spriteKey: 'PIXI_BOSS_PAYWALL_FRAMES' }],
    [15, { bossId: 'prism-moth', spriteKey: 'CAMPAIGN_BOSS_PRISM_MOTH' }],
    [20, { bossId: 'frontier-crownclaw', spriteKey: 'PIXI_BOSS_CROWNCLAW_FRAMES' }],
    [25, { bossId: 'helios-clawcarrier', spriteKey: 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER' }],
    [30, { bossId: 'rail-serpent', spriteKey: 'CAMPAIGN_BOSS_RAIL_SERPENT' }],
    [35, { bossId: 'singularity-crab', spriteKey: 'CAMPAIGN_BOSS_SINGULARITY_CRAB' }],
    [40, { bossId: 'orbit-gyroscope', spriteKey: 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE' }],
    [45, { bossId: 'hammerhead-siege', spriteKey: 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE' }],
    [50, { bossId: 'frontier-crownclaw', spriteKey: 'PIXI_BOSS_CROWNCLAW_FRAMES' }]
  ]);

  assert.equal(campaign.revision, 23);
  assert.equal(campaign.sectors.length, 10);
  for (const sector of campaign.sectors) {
    assert.equal(sector.missionIds.length, 5, `${sector.name} has five Missions`);
    const bossMissionId = sector.missionIds.at(-1);
    const level = campaign.levels.find((candidate) => candidate.id === bossMissionId);
    const bossEvents = level.waves.flatMap((wave) => wave.events).filter((event) => event.kind === 'boss');
    const finale = bossEvents[0];
    const expected = expectedByMissionOrder.get(level.order);

    assert.equal(level.order, sector.order * 5, `${sector.name} boss occupies every fifth Mission`);
    assert.ok(expected, `${level.name} has an approved roster entry`);
    assert.equal(level.campaignProgression.missionRole, 'major-boss');
    assert.equal(level.waves.length, 4, `${level.name} preserves its authored boss runway`);
    assert.equal(bossEvents.length, 1, `${level.name} has one major boss`);
    assert.equal(sector.majorBossId, expected.bossId, `${level.name} sector roster`);
    assert.equal(finale.bossId, expected.bossId, `${level.name} uses its canonical bossId`);
    assert.equal(finale.spriteKey, expected.spriteKey, level.name);
    assert.equal(level.scorecard.encounterAssetKey, finale.spriteKey, `${level.name} scorecard`);
  }
});

test('all twelve generated enemy silhouettes remain authored enemy roles in revision 23', () => {
  const formationPackIds = new Set(campaign.formationPacks.map((pack) => pack.id));
  const generatedRoles = campaign.enemyRoles.filter((role) => role.spriteKey in enemyAssets);

  assert.equal(generatedRoles.length, Object.keys(enemyAssets).length);
  assert.deepEqual(
    new Set(generatedRoles.map((role) => role.spriteKey)),
    new Set(Object.keys(enemyAssets))
  );
  generatedRoles.forEach((role) => {
    assert.ok(role.threatCost > 0, `${role.id} has a threat cost`);
    assert.ok(role.introductionSector >= 2 && role.introductionSector <= campaign.sectors.length);
    assert.ok(role.introductionMission >= 1 && role.introductionMission <= 4);
    assert.ok(['standard', 'armored', 'elite'].includes(role.durabilityClass), role.id);
    assert.ok(role.maximumSimultaneousCount > 0 && role.maximumSimultaneousCount <= 8, role.id);
    assert.ok(role.performanceCost > 0 && role.performanceCost <= 4, role.id);
    assert.ok(role.synergyTags.length > 0, `${role.id} has authored synergy`);
    role.compatibleFormationPackIds.forEach((packId) => {
      assert.equal(formationPackIds.has(packId), true, `${role.id} references ${packId}`);
    });
  });

  for (const sector of campaign.sectors.slice(1)) {
    const combatMissionIds = sector.missionIds.slice(0, 4);
    const usedGeneratedSprites = new Set(campaign.levels
      .filter((level) => combatMissionIds.includes(level.id))
      .flatMap((level) => level.waves)
      .flatMap((wave) => wave.events)
      .flatMap((event) => [event.spriteKey, ...(event.enemies ?? []).map((enemy) => enemy.spriteKey)])
      .filter((spriteKey) => spriteKey in enemyAssets));
    assert.ok(usedGeneratedSprites.size >= 2, `${sector.name} uses multiple generated roles`);
  }
});

test('each sector checkpoint and boss-preparation Mission ends with an authored mini-boss', () => {
  const expectedSpriteByBossId = new Map([
    ['bottleneck-drone', 'MINI_BOSS'],
    ['paywall-wall', 'PAYWALL_BASTION_FRAMES'],
    ['fracture-engine-elite', 'MINI_BOSS'],
    ['aegis-brood-core', 'CAMPAIGN_ENEMY_RING_SENTINEL'],
    ['railspine-wallcrawler', 'CAMPAIGN_ENEMY_LASER_HUNTER'],
    ['maw-carrier', 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'],
    ['twin-meridian-sentinels', 'CAMPAIGN_ENEMY_RING_SENTINEL'],
    ['prism-bloom', 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'],
    ['aegis-convoy-captain', 'CAMPAIGN_ENEMY_LASER_HUNTER'],
    ['gridline-sentries', 'CAMPAIGN_ENEMY_RING_SENTINEL']
  ]);
  const miniBossIds = new Set(campaign.miniBosses.map((entry) => entry.bossId));
  assert.deepEqual(miniBossIds, new Set(expectedSpriteByBossId.keys()));

  for (const sector of campaign.sectors) {
    for (const [missionOffset, missionRole] of [[2, 'elite-checkpoint'], [3, 'boss-preparation']]) {
      const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds[missionOffset]);
      const finalWave = level.waves.at(-1);
      const miniBosses = finalWave.events.filter((event) => event.kind === 'boss');

      assert.equal(level.campaignProgression.missionRole, missionRole, level.name);
      assert.equal(miniBosses.length, 1, `${level.name} ends with one authored checkpoint`);
      assert.equal(miniBossIds.has(miniBosses[0].bossId), true, `${level.name} uses the mini-boss catalog`);
      assert.equal(
        miniBosses[0].spriteKey,
        expectedSpriteByBossId.get(miniBosses[0].bossId),
        `${level.name} resolves the authored ${miniBosses[0].bossId} sprite`
      );
    }
  }

  for (const key of new Set([...expectedSpriteByBossId.values()].filter((spriteKey) => spriteKey in enemyAssets))) {
    assert.match(catalogSource, new RegExp(`${key}: asset\\([^\\n]+\\['enemy', 'boss', 'scorecard'\\]`));
  }
});
