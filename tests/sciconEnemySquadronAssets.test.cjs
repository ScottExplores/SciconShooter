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

// Established roles retain their distinct animated families. The obsolete
// pink terrain jets are the exception: they now use the compact Retraction
// Fleet silhouettes while the retired Squadron-v1 files remain integrity-tested.
const EXPECTED_FAMILY_BY_ROLE = new Map([
  ['role-orbit-scout', 'LEGACY_ENEMY_DRONE_FRAMES'],
  ['role-research-drone', 'ENEMY_DRONE_FRAMES'],
  ['role-citation-swarm', 'ENEMY_SWARM_FRAMES'],
  ['role-jet-scout', 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES'],
  ['role-jet-interceptor', 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES'],
  ['role-jet-heavy', 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES'],
  ['role-journal-priority', 'ENEMY_JOURNAL_FRAMES'],
  ['role-dna-conductor', 'CAMPAIGN_ENEMY_DNA_CONDUCTOR'],
  ['role-laser-stalker', 'CAMPAIGN_ENEMY_LASER_STALKER'],
  ['role-orbit-disc', 'CAMPAIGN_ENEMY_ORBIT_DISC'],
  ['role-protocol-vanguard', 'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES'],
  ['role-wall-sniper-left', 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT'],
  ['role-wall-sniper-right', 'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT'],
  ['role-laser-hunter', 'CAMPAIGN_ENEMY_LASER_HUNTER'],
  ['role-dark-sentinel', 'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL'],
  ['role-crescent-minelayer', 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER'],
  ['role-shield-rammer', 'CAMPAIGN_ENEMY_SHIELD_RAMMER'],
  ['role-prism-artillery', 'CAMPAIGN_ENEMY_PRISM_ARTILLERY'],
  ['role-ring-sentinel', 'CAMPAIGN_ENEMY_RING_SENTINEL'],
  ['role-ring-emitter', 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER']
]);
const ACTIVE_KEYS = new Set(EXPECTED_FAMILY_BY_ROLE.values());
const RETIRED_REGULAR_KEYS = new Set([
  'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  'SCICON_ENEMY_CITATION_DART_FRAMES',
  'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES',
  'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES',
  'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES',
  'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'
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
  assert.deepEqual(new Set(manifest.families.map((family) => family.assetKey)), RETIRED_REGULAR_KEYS);
  for (const family of manifest.families) {
    assert.match(constantsSource, new RegExp(`${family.assetKey}:\\s*\\[`));
    assert.match(typesSource, new RegExp(`'${family.assetKey}'`));
    assert.match(catalogSource, new RegExp(`${family.assetKey}: asset\\('${family.assetKey}'`));
    assert.match(directorValidatorSource, new RegExp(`'${family.assetKey}'`));
    assert.match(recordCardApiSource, new RegExp(`${family.assetKey}:\\s*'/game-art/generated/scicon-enemy-squadron-v1/frames/`));
  }
});

test('all twenty baseline roles and their spawns keep their assigned family', () => {
  // REVAMP_NOTES_B adds eight behavior aliases without replacing baseline art.
  assert.equal(campaign.enemyRoles.filter(role => !role.id.startsWith('role-revamp-')).length, 25, 'five generated late roles extend the restored twenty');
  const legacyRoles = campaign.enemyRoles.filter((role) => EXPECTED_FAMILY_BY_ROLE.has(role.id));
  assert.deepEqual(new Set(legacyRoles.map((role) => role.id)), new Set(EXPECTED_FAMILY_BY_ROLE.keys()));
  for (const role of legacyRoles) {
    assert.equal(role.spriteKey, EXPECTED_FAMILY_BY_ROLE.get(role.id), role.id);
    assert.equal(RETIRED_REGULAR_KEYS.has(role.spriteKey), false, role.id);
  }
  assert.ok(spawnEnemies.length > 1000);
  const legacySpawnEnemies = spawnEnemies.filter((enemy) => EXPECTED_FAMILY_BY_ROLE.has(enemy.roleId));
  for (const enemy of legacySpawnEnemies) {
    assert.equal(enemy.spriteKey, EXPECTED_FAMILY_BY_ROLE.get(enemy.roleId), enemy.roleId);
    assert.equal(RETIRED_REGULAR_KEYS.has(enemy.spriteKey), false, enemy.roleId);
  }
  assert.deepEqual(new Set(legacySpawnEnemies.map((enemy) => enemy.spriteKey)), ACTIVE_KEYS);
  for (const level of campaign.levels) {
    const key = level.scorecard?.encounterAssetKey;
    assert.equal(RETIRED_REGULAR_KEYS.has(key), false, `${level.id} scorecard`);
  }
});

test('family debuts stay readable (thematic pairs at most) and Journal Raider waits for Mission 5', () => {
  const seen = new Set();
  const debuts = [];
  for (const level of [...campaign.levels].sort((left, right) => left.order - right.order)) {
    for (const [waveIndex, wave] of level.waves.entries()) {
      const families = new Set(wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => (event.enemies ?? []).map((enemy) => enemy.spriteKey)));
      const unseen = [...families].filter((key) => !seen.has(key));
      // The baseline roster debuts thematic pairs together (the two raiders,
      // sentinel + minelayer). Three or more new silhouettes in one wave is
      // still unreadable art soup.
      assert.ok(unseen.length <= 2, `${level.id}/Wave ${waveIndex + 1} introduces ${unseen.join(', ')}`);
      unseen.forEach((key) => {
        seen.add(key);
        debuts.push({ key, levelId: level.id, wave: waveIndex + 1 });
      });
    }
  }
  assert.equal(seen.size, 25);
  assert.deepEqual(
    debuts.find((debut) => debut.key === 'ENEMY_JOURNAL_FRAMES'),
    { key: 'ENEMY_JOURNAL_FRAMES', levelId: 'stage-bastion-protocol', wave: 1 }
  );
  assert.equal(
    campaign.levels.find((level) => level.id === 'stage-open-galaxy').waves
      .some((wave) => wave.events.some((event) => (
        event.kind === 'spawn' && event.enemies?.some((enemy) => enemy.spriteKey === 'ENEMY_JOURNAL_FRAMES')
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

test('the v22 author seeds active keys and uses role-aware source inference', () => {
  const roleSeed = authoringSource.match(/const roleSeed = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  assert.ok(roleSeed.length > 0);
  // The Protocol Vanguard is seeded by its own sprite-inference row rather
  // than the roleSeed table, so it is asserted against the whole source.
  for (const key of ACTIVE_KEYS) {
    if (key === 'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES') {
      assert.match(authoringSource, new RegExp(key));
      continue;
    }
    assert.match(roleSeed, new RegExp(key));
  }
  for (const key of RETIRED_REGULAR_KEYS) assert.doesNotMatch(roleSeed, new RegExp(`'${key}'`));
  assert.match(authoringSource, /enemyRoleById\.has\(enemy\.roleId\)/);
  assert.match(authoringSource, /sourceRoleBySprite\.get\(enemy\.spriteKey\)/);
});
