const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('Boss Sandbox resource overrides stay preview-only from UI through engine', () => {
  const editor = read('components', 'GameEditorCanvas.tsx');
  const canvas = read('components', 'GameCanvas.tsx');
  const engine = read('services', 'gameLogic.ts');
  const hud = read('components', 'UIOverlay.tsx');
  const loadout = read(
    'director',
    'src',
    'tools',
    'bosses',
    'useBossSandboxLoadout.ts'
  );

  assert.match(loadout, /unlimitedBombs: true/);
  assert.match(loadout, /shipAbilityNoCooldown: true/);
  assert.match(editor, /previewUnlimitedBombs: previewSettings\.unlimitedBombs \?\? false/);
  assert.match(
    editor,
    /previewShipAbilityNoCooldown: previewSettings\.shipAbilityNoCooldown \?\? false/
  );
  assert.match(canvas, /previewUnlimitedBombs,/);
  assert.match(canvas, /previewShipAbilityNoCooldown,/);

  assert.match(
    engine,
    /this\.previewUnlimitedBombs = this\.previewMode && Boolean\(options\.previewUnlimitedBombs\)/
  );
  assert.match(
    engine,
    /this\.previewShipAbilityNoCooldown =[\s\S]*this\.previewMode && Boolean\(options\.previewShipAbilityNoCooldown\)/
  );
  assert.match(
    engine,
    /if \(!this\.previewUnlimitedBombs\) \{[\s\S]*this\.stats\.bombs = Math\.max/
  );
  assert.match(
    engine,
    /this\.stats\.shipAbilityCooldown = this\.previewShipAbilityNoCooldown[\s\S]*\? 0[\s\S]*: abilityCooldownFrames/
  );
  assert.match(hud, /\{unlimitedBombs \? '∞' : bombs\}/);
});

test('desktop and hosted Boss Sandbox shells consume the same loadout controller', () => {
  const local = read(
    'director',
    'src',
    'tools',
    'bosses',
    'BossSandboxApp.tsx'
  );
  const hosted = read('director', 'remote', 'RemoteBossRunnerApp.tsx');

  assert.match(local, /useBossSandboxLoadout\(\{ invincible, seed: PREVIEW_SEED \}\)/);
  assert.match(hosted, /useBossSandboxLoadout\(\{ invincible, seed: PREVIEW_SEED \}\)/);
  assert.match(local, /PLAYABLE_PLAYER_SHIP_IDS\.map/);
  assert.match(local, /Left support ship/);
  assert.match(local, /Right support ship/);
});

test('every new Boss Sandbox session starts from the neutral ship baseline', () => {
  const loadout = read(
    'director',
    'src',
    'tools',
    'bosses',
    'useBossSandboxLoadout.ts'
  );

  assert.match(loadout, /BOSS_SANDBOX_DEFAULT_FIRE_RATE_LEVEL = 1/);
  assert.match(loadout, /BOSS_SANDBOX_DEFAULT_SPEED_LEVEL = 1/);
  assert.match(loadout, /left: \{ id: '', level: 1 \}/);
  assert.match(loadout, /right: \{ id: '', level: 1 \}/);
  assert.match(
    loadout,
    /useState\(\s*BOSS_SANDBOX_DEFAULT_FIRE_RATE_LEVEL\s*\)/
  );
  assert.match(
    loadout,
    /useState\(\s*BOSS_SANDBOX_DEFAULT_SPEED_LEVEL\s*\)/
  );
});

test('desktop and hosted sandboxes share live preview-only boss health tuning and locks', () => {
  const panel = read(
    'director',
    'src',
    'tools',
    'bosses',
    'BossHealthTuningPanel.tsx'
  );
  const local = read(
    'director',
    'src',
    'tools',
    'bosses',
    'BossSandboxApp.tsx'
  );
  const hosted = read('director', 'remote', 'RemoteBossRunnerApp.tsx');

  assert.match(panel, /Boss test health/);
  assert.match(panel, /This fight only · resets on restart/);
  assert.match(panel, /Health - test balancing/);
  assert.match(panel, /boss\.components\.map/);
  assert.match(panel, /role="switch"/);
  assert.match(panel, /aria-checked=\{invincible\}/);
  assert.match(panel, /aria-label=\{`\$\{label\} health invincibility`\}/);
  assert.match(panel, /onBossInvincibilityChange/);
  assert.match(panel, /onComponentInvincibilityChange\(component\.id, enabled\)/);
  assert.match(panel, /Current test HP/);
  assert.match(panel, /Test max HP/);
  assert.match(panel, /current health/);
  assert.match(panel, /onBossHealthRatioChange\(health \/ Math\.max\(1, boss\.maxHealth\)\)/);
  assert.match(local, /<BossHealthTuningPanel/);
  assert.match(hosted, /<BossHealthTuningPanel/);
  assert.match(local, /onBossHealthRatioChange=\{changeBossHealth\}/);
  assert.match(hosted, /onBossHealthRatioChange=\{changeBossHealth\}/);
  assert.match(local, /type: 'set-boss-max-health'/);
  assert.match(local, /type: 'set-boss-component-max-health'/);
  assert.match(local, /type: 'set-boss-hull-invincibility'/);
  assert.match(local, /type: 'set-boss-component-invincibility'/);
  assert.match(hosted, /type: 'set-boss-max-health'/);
  assert.match(hosted, /type: 'set-boss-component-max-health'/);
  assert.match(hosted, /type: 'set-boss-hull-invincibility'/);
  assert.match(hosted, /type: 'set-boss-component-invincibility'/);
  assert.match(local, /onBossInvincibilityChange=\{changeBossHullInvincibility\}/);
  assert.match(hosted, /onBossInvincibilityChange=\{changeBossHullInvincibility\}/);
  assert.doesNotMatch(panel, /fetch\(|localStorage|save|apply-workspace/);
});

test('desktop and hosted Boss Sandbox shells display one shared version label', () => {
  const model = read(
    'director',
    'src',
    'tools',
    'bosses',
    'bossSandboxModel.ts'
  );
  const local = read(
    'director',
    'src',
    'tools',
    'bosses',
    'BossSandboxApp.tsx'
  );
  const hosted = read('director', 'remote', 'RemoteBossRunnerApp.tsx');

  assert.match(model, /BOSS_SANDBOX_VERSION = 'V 0\.\d+'/);
  assert.match(local, /boss-sandbox__version/);
  assert.match(local, /\{BOSS_SANDBOX_VERSION\}/);
  assert.match(hosted, /remote-runner__version/);
  assert.match(hosted, /\{BOSS_SANDBOX_VERSION\}/);
});

test('boss anatomy sockets travel from shared Test and Campaign artwork into simulation', () => {
  const model = read(
    'director',
    'src',
    'tools',
    'bosses',
    'bossSandboxModel.ts'
  );
  const canvas = read('components', 'GameCanvas.tsx');
  const engine = read('services', 'gameLogic.ts');

  assert.match(model, /weaponSockets: Object\.freeze\(\{/);
  assert.match(model, /id: 'revenant-core', role: 'core'/);
  assert.match(canvas, /previewBossWeaponSockets: activeBossArtwork\?\.weaponSockets/);
  assert.match(canvas, /createModularBossWeaponSocketPoseSampler/);
  assert.match(canvas, /previewBossWeaponSocketPoseSampler,/);
  assert.match(canvas, /previewBossWeaponSocketEventId: activeBossArtwork\?\.eventId/);
  assert.match(engine, /previewBossWeaponSockets\?: BossWeaponSocketProfile/);
  assert.match(engine, /previewBossWeaponSocketPoseSampler\?: BossWeaponSocketPoseSampler/);
  assert.match(engine, /previewBossWeaponSocketEventId\?: string/);
  assert.match(engine, /sampleBossWeaponSockets\(\{/);
  assert.match(engine, /this\.previewBossWeaponSocketPoseSampler[\s\S]*getPreviewBossWeaponSocketPoseInput/);
  assert.match(engine, /boss\.sourceEventId !== this\.previewBossWeaponSocketEventId/);
});
