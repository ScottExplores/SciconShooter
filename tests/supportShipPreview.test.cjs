const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('esbuild');
const load = entry => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const mod = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
};
global.Image = class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const preview = load('services/supportShipPreview.ts');
const squad = load('services/squadProgression.ts');
const { GameEngine, Entity } = load('services/gameLogic.ts');
const { parseGameCampaign } = load('game-config/validate.ts');
const state = squad.createWeeklySquadState('pilot:support-preview-test');
const fixture = (id, level = 5) => {
  const engine = new GameEngine(preview.createSupportPreviewStats(), {
    campaign: preview.createSupportPreviewCampaign(), previewMode: true, previewInvincible: true,
    squadLoadout: preview.createSupportPreviewLoadout(state, 'researchhub', id, level),
    audioEnabled: false, preloadCanvasAssets: false, randomSeed: 'support-preview-test'
  });
  engine.init(346, 390);
  engine.introFlightFrames = 0;
  return engine;
};

test('all ten supports use real level 1–5 progression without changing ownership, equipment or Tokens', () => {
  const original = JSON.stringify(state);
  for (const entry of squad.MINI_SHIP_CATALOG) for (let level = 1; level <= 5; level++) {
    const result = preview.createSupportPreviewLoadout(state, 'researchhub', entry.id, level);
    assert.equal(result.profileId, 'support-preview');
    assert.equal(result.companions.length, 1);
    assert.equal(result.companions[0].id, entry.id);
    assert.equal(result.companions[0].level, level);
    assert.equal(result.companions[0].ability, entry.ability);
    assert.deepEqual(result.companions[0].frames, entry.frames);
  }
  assert.equal(JSON.stringify(state), original);
});

test('preview campaign remains valid and supplies both hostile targets and real salvage', () => {
  const campaign = preview.createSupportPreviewCampaign();
  try { parseGameCampaign(campaign); } catch (error) { assert.fail(JSON.stringify(error.issues ?? error.message)); }
  const wave = campaign.levels[0].waves[0];
  assert.equal(wave.events.filter(event => event.kind === 'spawn').length, 5);
  assert.equal(wave.events.filter(event => event.kind === 'recovery').length, 5);
  assert.ok(wave.events.every(event => event.startSeconds + event.durationSeconds <= wave.durationSeconds));
});

test('real support fire runs while the main ship remains silent', () => {
  for (const entry of squad.MINI_SHIP_CATALOG) {
    const engine = fixture(entry.id);
    let supportShots = 0;
    let mainShots = 0;
    for (let frame = 0; frame < 180; frame++) {
      engine.update();
      supportShots += engine.entities.filter(entity => entity.isPlayerShot && entity.squadAbilityKind).length;
      mainShots += engine.entities.filter(entity => entity.isPlayerShot && !entity.squadAbilityKind).length;
    }
    assert.ok(supportShots > 0, `${entry.id} must fire its real weapon`);
    assert.equal(mainShots, 0, `${entry.id} must not be obscured by main-ship fire`);
  }
});

test('support ships render at seventy percent with a matching intercept radius', () => {
  const utility = load('services/supportUtility.ts');
  const engine = fixture('axiom-orbiter');
  const wing = engine.getSquadCompanionVisuals()[0];
  assert.equal(utility.SQUAD_COMPANION_DISPLAY_SCALE, 0.7);
  assert.equal(wing.width, Math.round(74 * 0.7));
  assert.equal(wing.height, wing.width);
  assert.equal(utility.getInterceptorRadius(1), Math.round(47 * 0.7));
  assert.equal(utility.getInterceptorRadius(5), Math.round(67 * 0.7));
});

test('the preview collector retrieves coins and the guard intercepts hostile shots', () => {
  const collector = fixture('quorum-crab');
  const coin = new Entity('COIN', collector.player.x + 80, collector.player.y - 80, 0.5);
  coin.width = 16; coin.height = 16;
  collector.entities = [coin];
  for (let frame = 0; frame < 90; frame++) {
    collector.updateSquadCompanions();
    if (!coin.markedForDeletion) collector.updateCoinEntity(coin);
  }
  assert.ok(coin.markedForDeletion);
  assert.ok(collector.stats.coins > 0);
  assert.equal(state.coins, 0);
  const guard = fixture('axiom-orbiter');
  for (let frame = 0; frame < 40; frame++) guard.updateSquadCompanions();
  const wing = guard.getSquadCompanionVisuals()[0];
  const shot = new Entity('PROJECTILE', wing.x, wing.y, 0.5);
  shot.width = 4; shot.height = 8; shot.isPlayerShot = false;
  guard.entities = [shot];
  guard.updateSquadCompanions();
  assert.ok(shot.markedForDeletion);
});

test('the live preview encounter provides incoming bullets for the guard demonstration', () => {
  const engine = fixture('axiom-orbiter');
  let incoming = false;
  for (let frame = 0; frame < 900; frame++) {
    engine.update();
    incoming ||= engine.entities.some(entity => entity.type === 'PROJECTILE' && !entity.isPlayerShot);
  }
  assert.ok(incoming, 'guard needs real hostile rounds, not just harmless formations');
});

test('Hangar preview is lazy, modal, passive, and has explicit return navigation', () => {
  const hangar = fs.readFileSync('components/SquadHangar.tsx', 'utf8');
  const dialog = fs.readFileSync('components/SupportShipPreviewDialog.tsx', 'utf8');
  assert.match(hangar, /lazy\(\(\) => import\('\.\/SupportShipPreviewDialog'\)\)/);
  assert.match(hangar, /Support ship actions/);
  assert.match(hangar, /support ability before unlocking/);
  assert.match(hangar, /← Main ships/);
  assert.match(hangar, /← All support ships/);
  assert.doesNotMatch(hangar, />\s*Fleet\s*</);
  assert.doesNotMatch(hangar, /sci-weapon-spec-row/);
  assert.match(dialog, /dialog\?\.showModal\(\)/);
  assert.match(dialog, /opened \? <GameStage/);
  assert.match(dialog, /inert: ''/);
  assert.match(dialog, /previewMode: true, autoFire: false/);
  assert.match(dialog, /previousFocus\.focus\(\)/);
  assert.doesNotMatch(dialog, /onPurchase|onEquip|saveWeekly|localStorage/);
});

test('test level cannot diverge from the startup loadout while a preview initializes or retries', () => {
  const dialog = fs.readFileSync('components/SupportShipPreviewDialog.tsx', 'utf8');
  assert.match(dialog, /const \[ready, setReady\] = useState\(false\)/);
  assert.match(dialog, /<select aria-label="Support preview level"[^>]*disabled=\{!ready \|\| failed\}/);
  assert.match(dialog, /const replay = \(\) => \{[\s\S]*?setReady\(false\);[\s\S]*?setRun\(/);
  assert.match(dialog, /onReady: \(\) => setReady\(true\)/);
});
