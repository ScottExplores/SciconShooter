const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'game-config', 'types.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const gameLogicSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const pixiRendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

const vanguardKey = 'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES';
const vanguardRoot = path.join(
  root,
  'public',
  'game-art',
  'generated',
  'scicon-protocol-vanguard-v1',
  'enemies',
  'protocol-vanguard'
);

const spawnEnemies = (level) => level.waves
  .flatMap((wave) => wave.events)
  .flatMap((event) => event.enemies ?? []);

test('Protocol Vanguard uses a complete four-frame authored enemy animation', () => {
  assert.match(constantsSource, new RegExp(`${vanguardKey}:\\s*\\[`));
  assert.match(typesSource, new RegExp(`'${vanguardKey}'`));
  assert.match(catalogSource, new RegExp(`${vanguardKey}: asset\\('${vanguardKey}'`));

  for (const suffix of ['01-neutral', '02-charge', '03-fire', '04-damage']) {
    assert.equal(
      fs.existsSync(path.join(vanguardRoot, 'frames', `protocol-vanguard-${suffix}.png`)),
      true,
      suffix
    );
  }
  assert.equal(fs.existsSync(path.join(vanguardRoot, 'sprite-sheet.png')), true);
  assert.match(gameLogicSource, /source\.campaignLastFireFrame = this\.frameCount/);
  assert.match(pixiRendererSource, /entity\.campaignRoleId === 'role-protocol-vanguard'/);
  assert.match(pixiRendererSource, /entity\.flashFrames > 0[\s\S]*?entity\.spriteFrames\[3\]/);
  assert.match(pixiRendererSource, /engine\.frameCount - entity\.campaignLastFireFrame <= 8[\s\S]*?entity\.spriteFrames\[2\]/);
});

test('Mission 2 keeps early formations standard-size and reserves the Vanguard for Mission 4', () => {
  const citationCrossing = campaign.levels.find((level) => level.id === 'stage-citation-storm');
  const firstVanguardMission = campaign.levels.find((level) => level.id === 'stage-open-galaxy');
  const routeBOpening = campaign.levels.find((level) => level.id === 'stage-open-orbit-route-b');

  for (const enemy of [...spawnEnemies(citationCrossing), ...spawnEnemies(routeBOpening)]) {
    assert.notEqual(enemy.rank, 'elite');
    assert.ok((enemy.sizeMultiplier ?? 1) <= 1, `${enemy.roleId ?? enemy.enemyId} stays standard-size`);
  }

  const vanguards = spawnEnemies(firstVanguardMission).filter((enemy) => enemy.roleId === 'role-protocol-vanguard');
  assert.ok(vanguards.length > 0);
  assert.ok(vanguards.every((enemy) => enemy.spriteKey === vanguardKey));
  assert.ok(vanguards.every((enemy) => enemy.enemyId === 'drone'));
  assert.ok(vanguards.every((enemy) => enemy.rank !== 'elite'));
});

test('later side-mounted threats are named Rift Leeches and share the wall-crossfire pack', () => {
  const port = campaign.enemyRoles.find((role) => role.id === 'role-wall-sniper-left');
  const starboard = campaign.enemyRoles.find((role) => role.id === 'role-wall-sniper-right');

  assert.equal(port.label, 'Port Rift Leech');
  assert.equal(starboard.label, 'Starboard Rift Leech');
  assert.ok(port.compatibleFormationPackIds.includes('pack-wall-crossfire'));
  assert.ok(starboard.compatibleFormationPackIds.includes('pack-wall-crossfire'));

  for (const role of [port, starboard]) {
    for (const packId of role.compatibleFormationPackIds) {
      const pack = campaign.formationPacks.find((candidate) => candidate.id === packId);
      assert.ok(pack.enemyRoleIds.includes(role.id), `${packId} binds ${role.id} in both directions`);
    }
  }
});

test('Protocol Vanguard formation compatibility is symmetric', () => {
  const vanguard = campaign.enemyRoles.find((role) => role.id === 'role-protocol-vanguard');
  for (const packId of vanguard.compatibleFormationPackIds) {
    const pack = campaign.formationPacks.find((candidate) => candidate.id === packId);
    assert.ok(pack.enemyRoleIds.includes(vanguard.id), `${packId} binds ${vanguard.id} in both directions`);
  }
});
