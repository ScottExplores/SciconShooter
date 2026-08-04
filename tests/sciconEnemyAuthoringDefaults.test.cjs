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

// Scott restored the legacy animated roster on 2026-08-03: every enemy family
// keeps its original art (flight-motion pack, jets, stage-20 specialists)
// instead of the consolidated seven-key Squadron pass.
const expectedDefaults = Object.freeze({
  drone: 'ENEMY_DRONE_FRAMES',
  swarm: 'ENEMY_SWARM_FRAMES',
  brick: 'ENEMY_BRICK_FRAMES',
  journal: 'ENEMY_JOURNAL_FRAMES'
});

test('enemy catalog and Director authoring surfaces default to the legacy roster', () => {
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
    assert.match(source, /(?:^|\W)ENEMY_DRONE_FRAMES(?:\W|$)/);
    assert.doesNotMatch(source, /SCICON_ENEMY_ORBIT_SCOUT_FRAMES/);
  }
});

test('retired introduction migration audits the complete legacy roster', async () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const { auditEnemyIntroductionSchedule } = await import(pathToFileURL(migrationPath).href);
  const current = auditEnemyIntroductionSchedule(campaign);
  assert.deepEqual(current, {
    issues: [],
    roleCount: 20,
    familyCount: 20,
    authoredRoleCount: 20
  });

  const invalid = structuredClone(campaign);
  const firstSpawn = invalid.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'spawn');
  firstSpawn.enemies[0].spriteKey = 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES';
  const rejected = auditEnemyIntroductionSchedule(invalid);
  assert.ok(rejected.issues.some((issue) => issue.includes('reintroduces retired sprite key SCICON_ENEMY_ORBIT_SCOUT_FRAMES')));
  assert.ok(rejected.issues.some((issue) => issue.includes('the restored legacy roster expects') || issue.includes('maps ')));
});

test('retired introduction command is repeatable, non-mutating, and rejects write mode', () => {
  const before = digest(campaignPath);
  const first = spawnSync(process.execPath, [migrationPath], { cwd: root, encoding: 'utf8' });
  const second = spawnSync(process.execPath, [migrationPath], { cwd: root, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /Roles 20\/20; Squadron families 20\/20\./);
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
