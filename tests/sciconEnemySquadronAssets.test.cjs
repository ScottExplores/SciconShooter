const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const packRoot = path.join(root, 'public', 'game-art', 'generated', 'scicon-enemy-squadron-v1');
const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, 'pack-manifest.json'), 'utf8'));
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'game-config', 'types.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const directorValidatorSource = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');
const recordCardApiSource = fs.readFileSync(path.join(root, 'api', 'record-card.js'), 'utf8');
const authoringSource = fs.readFileSync(path.join(root, 'tools', 'author-campaign-overhaul-v22.mjs'), 'utf8');

const EXPECTED_FAMILY_BY_ROLE = new Map([
  ['role-orbit-scout', 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES'],
  ['role-jet-scout', 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES'],
  ['role-orbit-disc', 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES'],
  ['role-citation-swarm', 'SCICON_ENEMY_CITATION_DART_FRAMES'],
  ['role-jet-interceptor', 'SCICON_ENEMY_CITATION_DART_FRAMES'],
  ['role-research-drone', 'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES'],
  ['role-jet-heavy', 'SCICON_ENEMY_PEER_BULWARK_FRAMES'],
  ['role-dark-sentinel', 'SCICON_ENEMY_PEER_BULWARK_FRAMES'],
  ['role-shield-rammer', 'SCICON_ENEMY_PEER_BULWARK_FRAMES'],
  ['role-protocol-vanguard', 'SCICON_ENEMY_PEER_BULWARK_FRAMES'],
  ['role-journal-priority', 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES'],
  ['role-crescent-minelayer', 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES'],
  ['role-laser-hunter', 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES'],
  ['role-dna-conductor', 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES'],
  ['role-ring-sentinel', 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES'],
  ['role-laser-stalker', 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'],
  ['role-wall-sniper-left', 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'],
  ['role-wall-sniper-right', 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'],
  ['role-prism-artillery', 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'],
  ['role-ring-emitter', 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES']
]);
const ACTIVE_KEYS = new Set(EXPECTED_FAMILY_BY_ROLE.values());
const RETIRED_REGULAR_KEYS = new Set([
  'LEGACY_ENEMY_DRONE_FRAMES', 'ENEMY_DRONE_FRAMES',
  'LEGACY_ENEMY_SWARM_FRAMES', 'ENEMY_SWARM_FRAMES', 'ENEMY_BRICK_FRAMES',
  'ENEMY_JOURNAL', 'ENEMY_JOURNAL_FRAMES',
  'PIXI_JET_SCOUT_FRAMES', 'PIXI_JET_INTERCEPTOR_FRAMES', 'PIXI_JET_HEAVY_FRAMES',
  'CAMPAIGN_ENEMY_BULLET_RING_EMITTER', 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER',
  'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL', 'CAMPAIGN_ENEMY_DNA_CONDUCTOR',
  'CAMPAIGN_ENEMY_LASER_HUNTER', 'CAMPAIGN_ENEMY_LASER_STALKER',
  'CAMPAIGN_ENEMY_ORBIT_DISC', 'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES',
  'CAMPAIGN_ENEMY_PRISM_ARTILLERY', 'CAMPAIGN_ENEMY_RING_SENTINEL',
  'CAMPAIGN_ENEMY_SHIELD_RAMMER', 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT',
  'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT'
]);

const levelSpawnEnemies = campaign.levels.flatMap((level) => level.waves.flatMap(
  (wave) => wave.events.filter((event) => event.kind === 'spawn').flatMap((event) => event.enemies ?? [])
));
const branchSpawnEnemies = (campaign.campaignBranches ?? []).flatMap((branch) => (
  (branch.missionDefinition?.events ?? [])
    .filter((event) => event.kind === 'spawn')
    .flatMap((event) => event.enemies ?? [])
));
const spawnEnemies = [...levelSpawnEnemies, ...branchSpawnEnemies];

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
};

const decodeRgbaPng = (png) => {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, 'frames use 8-bit channels');
  assert.equal(png[25], 6, 'frames use RGBA color type');
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const filtered = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0, source = 0; y < height; y += 1) {
    const filter = filtered[source];
    source += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[source + x];
      const target = y * stride + x;
      const left = x >= 4 ? pixels[target - 4] : 0;
      const up = y > 0 ? pixels[target - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[target - stride - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : (() => { throw new Error(`Unsupported PNG filter ${filter}`); })();
      pixels[target] = (raw + predictor) & 0xff;
    }
    source += stride;
  }
  return { width, height, pixels };
};

test('Squadron v1 registers exactly seven family keys across runtime, Director, and record cards', () => {
  assert.equal(manifest.id, 'scicon-enemy-squadron-v1');
  assert.equal(manifest.families.length, 7);
  assert.deepEqual(new Set(manifest.families.map((family) => family.assetKey)), ACTIVE_KEYS);
  for (const family of manifest.families) {
    assert.match(constantsSource, new RegExp(`${family.assetKey}:\\s*\\[`));
    assert.match(typesSource, new RegExp(`'${family.assetKey}'`));
    assert.match(catalogSource, new RegExp(`${family.assetKey}: asset\\('${family.assetKey}'`));
    assert.match(directorValidatorSource, new RegExp(`'${family.assetKey}'`));
    assert.match(recordCardApiSource, new RegExp(`${family.assetKey}:\\s*'/game-art/generated/scicon-enemy-squadron-v1/frames/`));
  }
});

test('all twenty active roles and every authored spawn use their assigned Squadron family', () => {
  assert.equal(campaign.enemyRoles.length, 20);
  assert.deepEqual(new Set(campaign.enemyRoles.map((role) => role.id)), new Set(EXPECTED_FAMILY_BY_ROLE.keys()));
  for (const role of campaign.enemyRoles) {
    assert.equal(role.spriteKey, EXPECTED_FAMILY_BY_ROLE.get(role.id), role.id);
    assert.equal(RETIRED_REGULAR_KEYS.has(role.spriteKey), false, role.id);
  }
  assert.ok(spawnEnemies.length > 1000);
  for (const enemy of spawnEnemies) {
    assert.equal(enemy.spriteKey, EXPECTED_FAMILY_BY_ROLE.get(enemy.roleId), enemy.roleId);
    assert.equal(RETIRED_REGULAR_KEYS.has(enemy.spriteKey), false, enemy.roleId);
  }
  assert.deepEqual(new Set(spawnEnemies.map((enemy) => enemy.spriteKey)), ACTIVE_KEYS);
  for (const level of campaign.levels) {
    const key = level.scorecard?.encounterAssetKey;
    assert.equal(RETIRED_REGULAR_KEYS.has(key), false, `${level.id} scorecard`);
  }
});

test('family debuts are staged one per Wave and Journal Raider waits for Mission 5', () => {
  const seen = new Set();
  const debuts = [];
  for (const level of [...campaign.levels].sort((left, right) => left.order - right.order)) {
    for (const [waveIndex, wave] of level.waves.entries()) {
      const families = new Set(wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => (event.enemies ?? []).map((enemy) => enemy.spriteKey)));
      const unseen = [...families].filter((key) => !seen.has(key));
      assert.ok(unseen.length <= 1, `${level.id}/Wave ${waveIndex + 1} introduces ${unseen.join(', ')}`);
      unseen.forEach((key) => {
        seen.add(key);
        debuts.push({ key, levelId: level.id, wave: waveIndex + 1 });
      });
    }
  }
  assert.equal(seen.size, 7);
  assert.deepEqual(
    debuts.find((debut) => debut.key === 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES'),
    { key: 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES', levelId: 'stage-bastion-protocol', wave: 1 }
  );
  assert.equal(
    campaign.levels.find((level) => level.id === 'stage-open-galaxy').waves
      .some((wave) => wave.events.some((event) => (
        event.kind === 'spawn' && event.enemies?.some((enemy) => enemy.spriteKey === 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES')
      ))),
    false
  );
});

test('every production frame is hashed, 128px RGBA, transparent, and safely bounded', () => {
  assert.deepEqual(manifest.frameContract, {
    width: 128,
    height: 128,
    colorType: 'rgba',
    frameCount: 3,
    fps: 8,
    loop: 'ping-pong',
    sequence: [0, 1, 2, 1],
    fixedRegistration: true,
    hitboxInvariant: 'Sprite family and animation frame never change simulation collision geometry.'
  });
  for (const family of manifest.families) {
    assert.equal(family.frames.length, 3, family.id);
    assert.equal(family.sha256.length, 3, family.id);
    family.frames.forEach((url, frameIndex) => {
      const file = path.join(root, 'public', ...url.split('/').filter(Boolean));
      const png = fs.readFileSync(file);
      assert.equal(createHash('sha256').update(png).digest('hex'), family.sha256[frameIndex], url);
      const { width, height, pixels } = decodeRgbaPng(png);
      assert.equal(width, 128, url);
      assert.equal(height, 128, url);
      let visiblePixels = 0;
      let transparentPixels = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const alpha = pixels[(y * width + x) * 4 + 3];
          if (alpha === 0) {
            transparentPixels += 1;
            continue;
          }
          visiblePixels += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      assert.ok(visiblePixels >= 300, `${url} has a readable silhouette`);
      assert.ok(transparentPixels >= width * height * 0.35, `${url} preserves mobile formation breathing room`);
      assert.ok(minX > 0 && maxX < width - 1, `${url} keeps safe horizontal formation padding`);
      assert.ok(minY >= 0 && maxY < height, `${url} keeps valid vertical alpha bounds`);
      const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
      assert.deepEqual(
        [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)],
        [0, 0, 0, 0],
        `${url} keeps transparent corners`
      );
    });
  }
});

test('the legacy v22 author seeds Squadron keys and uses role-aware source inference', () => {
  const roleSeed = authoringSource.match(/const roleSeed = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  assert.ok(roleSeed.length > 0);
  for (const key of ACTIVE_KEYS) assert.match(roleSeed, new RegExp(key));
  for (const key of RETIRED_REGULAR_KEYS) assert.doesNotMatch(roleSeed, new RegExp(`'${key}'`));
  assert.match(authoringSource, /enemyRoleById\.has\(enemy\.roleId\)/);
  assert.match(authoringSource, /sourceRoleBySprite\.get\(enemy\.spriteKey\)/);
});
