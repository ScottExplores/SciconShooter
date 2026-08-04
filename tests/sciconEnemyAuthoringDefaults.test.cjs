const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const migrationPath = path.join(root, 'tools', 'restage-enemy-introductions.mjs');
const digest = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const expectedDefaults = Object.freeze({
  drone: 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES',
  swarm: 'SCICON_ENEMY_CITATION_DART_FRAMES',
  brick: 'SCICON_ENEMY_PEER_BULWARK_FRAMES',
  journal: 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES'
});

test('enemy catalog and Director authoring surfaces default to Squadron families', () => {
  const catalog = read('game-config/catalog.ts');
  for (const [enemyId, spriteKey] of Object.entries(expectedDefaults)) {
    assert.match(
      catalog,
      new RegExp(`${enemyId}: \\{[\\s\\S]*?defaultSpriteKey: '${spriteKey}'`),
      `${enemyId} defaults to ${spriteKey}`
    );
  }

  const authoringSources = [
    read('director/src/editor/editorOperations.ts'),
    read('director/src/editor/GameplayPlacementOverlay.tsx'),
    read('director/src/combat-lab/FormationWorkshop.tsx')
  ];
  for (const source of authoringSources) {
    assert.match(source, /SCICON_ENEMY_ORBIT_SCOUT_FRAMES/);
    assert.doesNotMatch(source, /(?:^|\W)ENEMY_DRONE_FRAMES(?:\W|$)/);
  }
});

test('retired introduction migration audits the complete current Squadron roster', async () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const { auditEnemyIntroductionSchedule } = await import(pathToFileURL(migrationPath).href);
  const current = auditEnemyIntroductionSchedule(campaign);
  assert.deepEqual(current, {
    issues: [],
    roleCount: 20,
    familyCount: 7,
    authoredRoleCount: 20
  });

  const invalid = structuredClone(campaign);
  const firstSpawn = invalid.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'spawn');
  firstSpawn.enemies[0].spriteKey = 'ENEMY_DRONE_FRAMES';
  const rejected = auditEnemyIntroductionSchedule(invalid);
  assert.ok(rejected.issues.some((issue) => issue.includes('reintroduces retired sprite key ENEMY_DRONE_FRAMES')));
  assert.ok(rejected.issues.some((issue) => issue.includes('expected SCICON_ENEMY_')));
});

test('retired introduction command is repeatable, non-mutating, and rejects write mode', () => {
  const before = digest(campaignPath);
  const first = spawnSync(process.execPath, [migrationPath], { cwd: root, encoding: 'utf8' });
  const second = spawnSync(process.execPath, [migrationPath], { cwd: root, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /Roles 20\/20; Squadron families 7\/7\./);
  assert.match(first.stdout, /No files written\./);
  assert.equal(digest(campaignPath), before);

  const writeAttempt = spawnSync(process.execPath, [migrationPath, '--write'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.notEqual(writeAttempt.status, 0);
  assert.match(writeAttempt.stderr, /rewrite is retired and no longer accepts --write/);
  assert.equal(digest(campaignPath), before);
});
