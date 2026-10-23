/**
 * Wave forensics: measures how many enemies leave the field WITHOUT being
 * killed by the player, per wave, using the real GameEngine.
 *
 * Run:  node <this> [--mission stage-id] [--passive]
 *   --passive  disables player fire, isolating system-driven despawns.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.SCICON_ROOT || path.resolve(here, '..');

globalThis.Image ??= class { complete = true; naturalWidth = 1; naturalHeight = 1; crossOrigin = ''; src = ''; };
globalThis.document ??= { hidden: false, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.CustomEvent ??= class { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
globalThis.window ??= { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const missionId = arg('mission', 'operation-open-galaxy');
const passive = flag('passive');
const maxSeconds = Number(arg('max-seconds', 90));

const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@game': root, '@director': path.join(root, 'director', 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom'
});

try {
  const [levelConfig, gameLogic, entityTypes, combatLab] = await Promise.all([
    vite.ssrLoadModule('/services/levelConfig.ts'),
    vite.ssrLoadModule('/services/gameLogic.ts'),
    vite.ssrLoadModule('/types.ts'),
    vite.ssrLoadModule('/director/src/combat-lab/experimentModel.ts')
  ]);
  const { DEFAULT_GAME_CAMPAIGN } = levelConfig;
  const { GameEngine } = gameLogic;
  const { EntityType } = entityTypes;
  const { buildCombatLabRuntimeSquadLoadout } = combatLab;

  const level = DEFAULT_GAME_CAMPAIGN.levels.find((l) => l.id === missionId);
  if (!level) throw new Error(`no mission ${missionId}`);

  const stats = {
    score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
    bombs: 0, bombCharge: 0, bombChargeMax: 100,
    shipAbilityCooldown: 0, shipAbilityCooldownMax: 960,
    lives: 99, repairsCount: 0,
    upgrades: { fireRate: 0, speed: 0 },
    powerupUses: {},
    bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100
  };
  const engine = new GameEngine(stats, {
    campaign: DEFAULT_GAME_CAMPAIGN,
    previewMode: false,
    previewInvincible: true,
    audioEnabled: false,
    playerShipId: 'researchhub',
    initialLevelId: level.id,
    initialWaveId: level.waves[0].id,
    squadLoadout: buildCombatLabRuntimeSquadLoadout({ mainShipId: 'researchhub', upgrades: {}, companions: [] }),
    randomSeed: 'wave-forensics-v1'
  });
  engine.init(390, 844);
  engine.bgEntities = [];
  engine.stars = [];
  engine.spawnThrusterParticles = () => {};
  engine.spawnBurst = () => {};
  engine.spawnExplosion = () => {};
  engine.spawnFloatingText = () => {};
  engine.spawnRingEffect = () => {};
  engine.addPlayerAfterimage = () => {};

  const isEnemyBody = (e) => e.type === EntityType.ENEMY_DRONE || e.type === EntityType.ENEMY_BRICK
    || e.type === EntityType.ENEMY_JOURNAL || e.type === EntityType.ENEMY_SWARM
    || e.type === EntityType.ENEMY_INVADER || e.type === EntityType.MINI_BOSS || e.type === EntityType.BOSS;

  // ---- instrumentation -------------------------------------------------
  const waves = [];
  let cur = null;
  const newWave = () => {
    const rt = engine.getRuntimeState();
    const def = engine.getCurrentWaveDefinition();
    cur = {
      waveId: rt.waveId, waveNumber: rt.waveNumber,
      rule: def?.completionRule, authoredDuration: def?.durationSeconds,
      frames: 0, spawned: 0, killedByPlayer: 0,
      retiredMidLoop: 0, retiredOffscreen: 0, retiredFiller: 0,
      clearedAtTransition: 0, escaped: 0, retiredStates: {}
    };
    waves.push(cur);
  };

  const trackedSpawn = engine.spawnConfiguredEnemyFromEvent.bind(engine);
  engine.spawnConfiguredEnemyFromEvent = (...a) => {
    const before = engine.entities.length;
    const r = trackedSpawn(...a);
    if (r && engine.entities.length > before && cur) cur.spawned++;
    return r;
  };

  const origRetire = engine.retireStrandedRegularThreatsAtWaveEnd.bind(engine);
  engine.retireStrandedRegularThreatsAtWaveEnd = () => {
    const before = new Set(engine.entities.filter((e) => !e.markedForDeletion && isEnemyBody(e)));
    const n = origRetire();
    if (n > 0 && cur) {
      for (const e of before) {
        if (!e.markedForDeletion) continue;
        const st = e.formationState || 'loose';
        cur.retiredStates[st] = (cur.retiredStates[st] || 0) + 1;
        if (e.campaignFiller) cur.retiredFiller++;
        else if (st === 'dive' || st === 'return') cur.retiredMidLoop++;
        else cur.retiredOffscreen++;
      }
    }
    return n;
  };

  const origClear = engine.clearStageBoundaryDebris.bind(engine);
  engine.clearStageBoundaryDebris = (...a) => {
    const alive = engine.entities.filter((e) => !e.markedForDeletion && isEnemyBody(e));
    const r = origClear(...a);
    if (cur) cur.clearedAtTransition += alive.filter((e) => e.markedForDeletion).length;
    return r;
  };

  let lastDefeated = 0;
  if (passive) {
    engine.firePlayerWeapon = () => {};
    engine.shoot = () => {};
    if (engine.spawnPlayerShot) engine.spawnPlayerShot = () => {};
  }

  newWave();
  let lastWaveId = cur.waveId;
  const frameLimit = Math.round(maxSeconds * 60);
  for (let f = 0; f < frameLimit; f++) {
    if (!passive && f % 8 === 0) {
      // park under the lowest hostile so auto-fire connects
      const t = engine.entities.filter((e) => !e.markedForDeletion && isEnemyBody(e))
        .sort((a, b) => b.y - a.y)[0];
      const x = t ? t.x + t.width / 2 : 195;
      engine.handleInput({}, { x: Math.max(2, Math.min(388, x)), y: 760 });
    }
    // Snapshot living enemies, then attribute any that die this frame without
    // a player kill and without a system retire to "escaped off the field".
    const before = engine.entities.filter((e) => !e.markedForDeletion && isEnemyBody(e));
    const retiredBefore = cur ? cur.retiredMidLoop + cur.retiredOffscreen + cur.retiredFiller + cur.clearedAtTransition : 0;
    const defeatedBefore = stats.enemiesDefeated;

    engine.update();
    if (cur) cur.frames++;
    const defeated = stats.enemiesDefeated;
    if (defeated > lastDefeated && cur) { cur.killedByPlayer += defeated - lastDefeated; lastDefeated = defeated; }
    if (cur) {
      const goneNow = before.filter((e) => e.markedForDeletion).length;
      const retiredNow = (cur.retiredMidLoop + cur.retiredOffscreen + cur.retiredFiller + cur.clearedAtTransition) - retiredBefore;
      const killedNow = stats.enemiesDefeated - defeatedBefore;
      cur.escaped += Math.max(0, goneNow - retiredNow - killedNow);
    }

    const rt = engine.getRuntimeState();
    if (rt.waveId !== lastWaveId) { lastWaveId = rt.waveId; newWave(); }
    if (!engine.gameActive || engine.campaignComplete) break;
  }

  const pad = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);
  console.log(`\nMission: ${level.name}  (${level.id})   mode=${passive ? 'PASSIVE (no player fire)' : 'auto-fire'}`);
  console.log('='.repeat(118));
  console.log(pad('wave', 34) + rpad('authored', 9) + rpad('actual', 8)
    + rpad('spawn', 7) + rpad('killed', 7) + rpad('RETIRED', 9) + rpad('escaped', 9) + '  breakdown');
  console.log('-'.repeat(118));
  let totSpawn = 0, totKill = 0, totGone = 0, totEsc = 0;
  for (const w of waves) {
    const gone = w.retiredMidLoop + w.retiredOffscreen + w.retiredFiller + w.clearedAtTransition;
    totSpawn += w.spawned; totKill += w.killedByPlayer; totGone += gone; totEsc += w.escaped;
    const bits = [];
    if (w.retiredMidLoop) bits.push(`mid-dive/return:${w.retiredMidLoop}`);
    if (w.retiredOffscreen) bits.push(`offscreen:${w.retiredOffscreen}`);
    if (w.retiredFiller) bits.push(`filler:${w.retiredFiller}`);
    if (w.clearedAtTransition) bits.push(`cleared-at-transition:${w.clearedAtTransition}`);
    console.log(pad(w.waveId, 34) + rpad((w.authoredDuration ?? '-') + 's', 9)
      + rpad((w.frames / 60).toFixed(1) + 's', 8) + rpad(w.spawned, 7) + rpad(w.killedByPlayer, 7)
      + rpad(gone, 9) + rpad(w.escaped, 9) + '  ' + bits.join(' '));
  }
  console.log('-'.repeat(118));
  const unshot = totGone + totEsc;
  console.log(pad('TOTAL', 34) + rpad('', 9) + rpad('', 8)
    + rpad(totSpawn, 7) + rpad(totKill, 7) + rpad(totGone, 9) + rpad(totEsc, 9)
    + `  -> ${totSpawn ? Math.round((unshot / totSpawn) * 100) : 0}% of spawns left the field unshot`);
  console.log();
} finally {
  await vite.close();
}
