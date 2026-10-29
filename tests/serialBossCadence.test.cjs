const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
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

const motion = bundle('services/gameplay/serialQuietBeatMotion.ts');
const { getSandboxBossKit } = bundle('services/gameplay/sandboxBossRoster.ts');
const { GameEngine } = bundle('services/gameLogic.ts');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));

const NAMED_BOSSES = [
  ['cinderjaw-siege-beetle', 4.5, 'cinderjaw'],
  ['vesperglass-mothmother', 4.35, 'vesperglass'],
  ['twin-halo-wardens', 4.2, 'twin-halo'],
  ['riftcoil-wyrm', 4.1, 'riftcoil'],
  ['gloamforge-mantis', 4, 'gloamforge']
];

const volleyGaps = (timeline) => {
  const gaps = [];
  const phases = [...new Set(timeline.clips.map((clip) => clip.phaseId).filter(Boolean))];
  for (const phaseId of phases) {
    const clips = timeline.clips.filter((clip) => clip.phaseId === phaseId);
    const actions = clips
      .filter((clip) => clip.track === 'attack' || clip.track === 'laser')
      .sort((left, right) => left.startSeconds - right.startSeconds);
    for (let index = 0; index < actions.length - 1; index += 1) {
      const action = actions[index];
      const next = actions[index + 1];
      const recovery = clips.find((clip) => clip.id === `${action.id}-recovery`);
      assert.ok(recovery, `${action.id} keeps its recovery`);
      const recoveryEnd = recovery.startSeconds + recovery.durationSeconds;
      assert.ok(
        next.startSeconds + 0.02 >= recoveryEnd,
        `${phaseId} ${next.id} overlaps ${action.id}`
      );
      gaps.push(next.startSeconds - action.startSeconds);
    }
  }
  return gaps;
};

test('serial volleys land about every 4 to 4.5 seconds and later kits step up', () => {
  let previousInterval = 5;
  for (const [bossId, interval] of NAMED_BOSSES) {
    const gaps = volleyGaps(getSandboxBossKit(bossId).timeline);
    assert.ok(gaps.length >= 3, `${bossId} chains several volleys`);
    for (const gap of gaps) {
      assert.ok(
        gap >= interval - 0.16 && gap <= 4.55,
        `${bossId} volley gap ${gap} (target ${interval}; all ${gaps.map((value) => value.toFixed(2)).join(', ')})`
      );
    }
    assert.ok(interval < previousInterval, `${bossId} should step up`);
    assert.ok(Math.min(...gaps) <= interval + 0.05, `${bossId} should reach its ${interval}s beat`);
    previousInterval = interval;
  }
});

test('campaign Gloamforge uses the packed mantis cadence', () => {
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.timeline?.clips?.some((clip) => clip.id === 'sandbox-gloamforge-measure-port-cannon'));
  assert.ok(event, 'M45 should carry the Gloamforge timeline');
  const kit = getSandboxBossKit('gloamforge-mantis').timeline;
  assert.equal(event.timeline.clips.length, kit.clips.length);
  for (const clip of kit.clips) {
    const authored = event.timeline.clips.find((candidate) => candidate.id === clip.id);
    assert.ok(authored, clip.id);
    assert.equal(authored.startSeconds, clip.startSeconds, clip.id);
  }
  assert.equal(event.timeline.durationSeconds, kit.durationSeconds);
  const gaps = volleyGaps(event.timeline);
  assert.ok(gaps.some((gap) => gap >= 3.95 && gap <= 4.55));
});

test('each serial boss crosses the top band without leaving the screen or the player lane', () => {
  const arenaWidth = 412;
  const arenaHeight = 915;
  const entranceY = 116;
  const widths = {
    cinderjaw: 338,
    vesperglass: 275,
    'twin-halo': 362,
    riftcoil: 362,
    gloamforge: 395
  };
  for (const [, , kind] of NAMED_BOSSES) {
    const bossWidth = widths[kind];
    const samples = [];
    for (let step = 0; step <= 48; step += 1) {
      samples.push(motion.sampleSerialQuietBeat({
        kind,
        elapsedSeconds: step / 20,
        arenaWidth,
        arenaHeight,
        bossWidth,
        entranceY
      }));
    }
    const travel = Math.max(...samples.map((sample) => sample.x)) - Math.min(...samples.map((sample) => sample.x));
    const slack = arenaWidth - bossWidth - 16;
    assert.ok(travel >= Math.min(96, Math.max(0, slack)) - 0.5, `${kind} only travels ${travel}px`);
    for (const sample of samples) {
      assert.ok(sample.y >= entranceY - 0.01, `${kind} climbs above the anchor`);
      assert.ok(sample.y <= entranceY + 80, `${kind} drops toward the player lane`);
      if (bossWidth <= arenaWidth) {
        assert.ok(sample.x >= -0.5, `${kind} leaves the left edge`);
        assert.ok(sample.x + bossWidth <= arenaWidth + 0.5, `${kind} leaves the right edge`);
      }
    }
  }
  const planted = motion.sampleSerialQuietBeat({
    kind: 'cinderjaw',
    elapsedSeconds: 0,
    arenaWidth,
    arenaHeight,
    bossWidth: widths.cinderjaw,
    entranceY
  });
  const lunging = motion.sampleSerialQuietBeat({
    kind: 'gloamforge',
    elapsedSeconds: 0.6,
    arenaWidth,
    arenaHeight,
    bossWidth: widths.gloamforge,
    entranceY
  });
  assert.ok(lunging.y > planted.y + 20, 'the mantis lunge dips while the beetle strafe stays high');
});

test('the live bosses actually cross the top during the beat and still fire', () => {
  class TestImage {
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
    crossOrigin = '';
    src = '';
  }
  global.Image = TestImage;
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
    randomSeed: 'serial-quiet-beat'
  });
  engine.init(412, 915);
  engine.gameActive = true;
  engine.introFlightFrames = 0;
  engine.invincibleTimer = 999999;
  for (const [bossId] of NAMED_BOSSES) {
    engine.entities = engine.entities.filter((entity) => entity.type !== 'BOSS' && entity.type !== 'PROJECTILE');
    engine.spawnBoss(structuredClone(getSandboxBossKit(bossId)));
    const boss = engine.entities.find((entity) => entity.type === 'BOSS');
    assert.ok(boss, bossId);
    const entrance = Math.max(72, Math.min(engine.height * 0.13, 116));
    boss.y = entrance;
    boss.hp = boss.maxHp;
    const xs = [];
    let fired = false;
    const original = engine.dispatchBossTimelineCue.bind(engine);
    engine.dispatchBossTimelineCue = (candidate, cue, phase, stage) => {
      if (cue.clip.track === 'attack' || cue.clip.track === 'laser') fired = true;
      return original(candidate, cue, phase, stage);
    };
    for (let frame = 0; frame < 220; frame += 1) {
      boss.hp = boss.maxHp;
      engine.frameCount += 1;
      engine.updateBoss(boss);
      xs.push(boss.x);
      assert.ok(boss.y >= entrance - 0.5, `${bossId} rose above the anchor and rewound the clock`);
      assert.ok(boss.y <= entrance + 80, `${bossId} dropped out of the top band`);
    }
    const travel = Math.max(...xs) - Math.min(...xs);
    const slack = engine.width - boss.width - 16;
    assert.ok(travel >= Math.min(24, Math.max(0, slack * 0.45)), `${bossId} traveled ${travel.toFixed(1)}px`);
    if (boss.width <= engine.width) {
      assert.ok(Math.min(...xs) >= -1, `${bossId} left the portrait screen`);
      assert.ok(Math.max(...xs) + boss.width <= engine.width + 1, `${bossId} left the portrait screen`);
    }
    assert.ok(boss.attackTimer > 120, `${bossId} rewound its phase clock`);
    assert.equal(fired, true, `${bossId} did not fire during the crossing`);
    engine.dispatchBossTimelineCue = original;
  }
});
