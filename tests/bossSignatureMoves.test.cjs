const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

class TestImage {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = '';
  src = '';
}

global.Image = TestImage;

const bundle = (entryPoint) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    loaded,
    loaded.exports
  );
  return loaded.exports;
};

const { GameEngine } = bundle('services/gameLogic.ts');
const { getSandboxBossKit } = bundle('services/gameplay/sandboxBossRoster.ts');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));

const PRESENTATION_PRIMITIVES = new Set(['telegraph', 'effect-cue', 'camera-cue']);

const campaignBossEvents = () => {
  const events = [];
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      for (const event of wave.events) {
        if (event.kind === 'boss') events.push(event);
      }
    }
  }
  return events;
};

const firstCampaignBoss = (bossId) => {
  const event = campaignBossEvents().find((candidate) => (
    candidate.bossId === bossId && candidate.timeline?.clips?.length
  ));
  assert.ok(event, `${bossId} needs an authored campaign timeline`);
  return event;
};

const openingMoves = (event) => {
  const phaseId = event.phases[0]?.id;
  return [...new Set(
    (event.timeline?.clips ?? [])
      .filter((clip) => clip.phaseId === phaseId && !PRESENTATION_PRIMITIVES.has(clip.primitiveId))
      .map((clip) => clip.primitiveId)
  )];
};

const createEngine = () => {
  const engine = new GameEngine({
    score: 0,
    highScore: 0,
    wave: 1,
    coins: 0,
    totalCoins: 0,
    enemiesDefeated: 0,
    bombs: 2,
    bombCharge: 0,
    bombChargeMax: 100,
    shipAbilityCooldown: 0,
    shipAbilityCooldownMax: 960,
    lives: 9,
    repairsCount: 0,
    upgrades: { fireRate: 0, speed: 0, ability: 0 },
    powerupUses: {},
    bossProgress: 0,
    isBossActive: true,
    bossHp: 0,
    bossMaxHp: 100
  }, {
    campaign,
    audioEnabled: false,
    preloadCanvasAssets: false,
    previewMode: true,
    previewInvincible: true,
    randomSeed: 'boss-signature-moves'
  });
  engine.init(390, 844);
  engine.gameActive = true;
  engine.introFlightFrames = 0;
  engine.lives = 9;
  engine.invincibleTimer = 999999;
  return engine;
};

const playOpeningPhase = (event) => {
  const engine = createEngine();
  const seen = new Set();
  let charged = false;
  const original = engine.dispatchBossTimelineCue.bind(engine);
  engine.dispatchBossTimelineCue = (boss, cue, phase, stage) => {
    if (!PRESENTATION_PRIMITIVES.has(cue.clip.primitiveId)) seen.add(cue.clip.primitiveId);
    const result = original(boss, cue, phase, stage);
    if (boss.bossCornerAmbushRamState?.stage === 'charge') charged = true;
    return result;
  };
  engine.spawnBoss(structuredClone(event));
  const boss = engine.entities.find((entity) => entity.type === 'BOSS');
  assert.ok(boss?.bossTimeline, `${event.bossId} should enter with its authored timeline`);
  const entrance = Math.max(72, Math.min(engine.height * 0.13, 116));
  boss.y = entrance;
  boss.hp = boss.maxHp;
  const frames = Math.ceil(((event.timeline?.durationSeconds ?? 30) + 0.5) * 60);
  for (let frame = 0; frame < frames; frame += 1) {
    boss.hp = boss.maxHp;
    engine.frameCount += 1;
    engine.updateBoss(boss);
    if (openingMoves(event).every((primitive) => seen.has(primitive)) && (event.bossId !== 'umbra-needlewing' || charged)) {
      break;
    }
  }
  return { seen, charged, boss };
};

const SIGNATURE_BOSSES = [
  'umbra-needlewing',
  'helios-clawcarrier',
  'frontier-crownclaw'
];

test('campaign and Boss Lab play every opening signature move from the sandbox runner', () => {
  for (const bossId of SIGNATURE_BOSSES) {
    const campaignEvent = firstCampaignBoss(bossId);
    const sandboxEvent = getSandboxBossKit(bossId);
    for (const [source, event] of [['campaign', campaignEvent], ['boss lab', sandboxEvent]]) {
      const expected = openingMoves(event);
      assert.ok(expected.length > 0, `${bossId} ${source} opening phase has no damaging moves`);
      const result = playOpeningPhase(event);
      for (const primitive of expected) {
        assert.ok(
          result.seen.has(primitive),
          `${bossId} ${source} never triggered ${primitive}; saw ${[...result.seen].join(', ')}`
        );
      }
      if (bossId === 'umbra-needlewing') {
        assert.equal(result.charged, true, `${source} Umbra should blackout-charge the player`);
        assert.ok(result.seen.has('corner-ambush-ram'));
      }
      if (bossId === 'helios-clawcarrier') {
        assert.ok(result.seen.has('paired-cannon-burst'));
        assert.ok(result.seen.has('tracking-pincer-dive'));
      }
      if (bossId === 'frontier-crownclaw') {
        assert.ok(result.seen.has('chainclaw-harpoon'));
        assert.ok(result.seen.has('bastion-crabwalk-barrage'));
        assert.ok(result.seen.has('crown-reactor-beam'));
      }
    }
  }
});

test('every other authored campaign boss fires its opening moves', () => {
  const covered = new Set(SIGNATURE_BOSSES);
  const authored = campaignBossEvents().filter((event) => (
    event.timeline?.clips?.length && !covered.has(event.bossId)
  ));
  const checked = new Set();
  for (const event of authored) {
    if (checked.has(event.bossId)) continue;
    checked.add(event.bossId);
    const expected = openingMoves(event);
    if (expected.length === 0) continue;
    const result = playOpeningPhase(event);
    for (const primitive of expected) {
      assert.ok(
        result.seen.has(primitive),
        `${event.bossId} never triggered ${primitive}; saw ${[...result.seen].join(', ')}`
      );
    }
  }
  assert.ok(checked.size >= 4, 'expected the other authored campaign bosses to be checked');
});

const settleUmbra = (event) => {
  const engine = createEngine();
  engine.spawnBoss(structuredClone(event));
  const boss = engine.entities.find((entity) => entity.type === 'BOSS');
  assert.ok(boss, 'Umbra should spawn');
  const entrance = Math.max(72, Math.min(engine.height * 0.13, 116));
  boss.y = entrance;
  boss.hp = boss.maxHp;
  for (let frame = 0; frame < 20; frame += 1) {
    boss.hp = boss.maxHp;
    engine.frameCount += 1;
    engine.updateBoss(boss);
  }
  assert.equal(boss.bossUmbraBlackoutRamFired, false);
  assert.equal(boss.bossUmbraBlackoutRamDue, false);
  return { engine, boss };
};

const stepUntilCornerCharge = (engine, boss, frames) => {
  let hiddenRun = 0;
  let maxHiddenRun = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    engine.frameCount += 1;
    engine.updateBoss(boss);
    if (boss.bossVanishReentryStage === 'hidden') {
      hiddenRun += 1;
      maxHiddenRun = Math.max(maxHiddenRun, hiddenRun);
    } else {
      hiddenRun = 0;
    }
    const ram = boss.bossCornerAmbushRamState;
    if (ram?.stage === 'charge') {
      return { ram, maxHiddenRun, frames: frame + 1 };
    }
  }
  return { ram: null, maxHiddenRun, frames };
};

test('a skipped Umbra phase still charges from a lower corner within a few seconds', () => {
  const event = firstCampaignBoss('umbra-needlewing');
  const { engine, boss } = settleUmbra(event);
  boss.hp = boss.maxHp * 0.7;
  const result = stepUntilCornerCharge(engine, boss, 220);
  assert.ok(result.ram, 'phase change before the authored ram should still charge');
  assert.equal(result.ram.lock.sequence, 1);
  assert.ok(
    result.ram.lock.startY >= engine.height * 0.5,
    `charge should leave a lower corner, startY=${result.ram.lock.startY}`
  );
  assert.equal(boss.bossUmbraBlackoutRamFired, true);
  assert.ok(result.maxHiddenRun <= 90, `pure-black hidden beat ran ${result.maxHiddenRun} frames`);
  assert.ok(result.frames <= 180, `charge took ${result.frames} frames`);
});

test('the Umbra finale opens with a lower-corner charge', () => {
  const event = firstCampaignBoss('umbra-needlewing');
  const sandbox = getSandboxBossKit('umbra-needlewing');
  for (const [source, candidate] of [['campaign', event], ['boss lab', sandbox]]) {
    const rams = (candidate.timeline?.clips ?? [])
      .filter((clip) => (
        clip.phaseId === 'sandbox-umbra-finale-echo'
        && clip.primitiveId === 'corner-ambush-ram'
      ))
      .sort((left, right) => left.startSeconds - right.startSeconds);
    assert.ok(rams.length >= 1, `${source} finale needs a corner charge`);
    assert.ok(
      rams[0].startSeconds > 0.5 && rams[0].startSeconds < 2,
      `${source} finale ram starts at ${rams[0].startSeconds}s`
    );
    assert.equal(rams[0].parameters?.sequence, 1);
  }
  const { engine, boss } = settleUmbra(event);
  boss.hp = boss.maxHp * 0.1;
  const result = stepUntilCornerCharge(engine, boss, 180);
  assert.equal(boss.activeBossPhaseId, 'sandbox-umbra-finale-echo');
  assert.ok(result.ram, 'a fast drop into the finale should still charge');
  assert.ok(result.ram.lock.startY >= engine.height * 0.5);
  assert.notEqual(result.ram.actionClipId, 'umbra-guaranteed-lower-corner-ram');
  assert.ok(result.maxHiddenRun <= 90, `pure-black hidden beat ran ${result.maxHiddenRun} frames`);
});

test('an Umbra fight that already charged does not arm a second makeup ram', () => {
  const event = firstCampaignBoss('umbra-needlewing');
  const { engine, boss } = settleUmbra(event);
  const first = stepUntilCornerCharge(engine, boss, 1600);
  assert.ok(first.ram, 'phase-one authored ram should still charge');
  assert.equal(boss.bossUmbraBlackoutRamFired, true);
  boss.hp = boss.maxHp * 0.7;
  engine.frameCount += 1;
  engine.updateBoss(boss);
  assert.equal(boss.activeBossPhaseId, 'sandbox-umbra-blackout-hunt');
  assert.equal(boss.bossUmbraBlackoutRamDue, false);
  for (let frame = 0; frame < 90; frame += 1) {
    engine.frameCount += 1;
    engine.updateBoss(boss);
    assert.notEqual(
      boss.bossCornerAmbushRamState?.actionClipId,
      'umbra-guaranteed-lower-corner-ram'
    );
  }
});
