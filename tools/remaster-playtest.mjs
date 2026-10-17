/**
 * Headless remaster sweep. Steps every Campaign mission and every boss wave
 * on the canonical 390×844 arena with the real GameEngine.
 *
 *   node tools/remaster-playtest.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

globalThis.Image ??= class { complete = true; naturalWidth = 1; naturalHeight = 1; crossOrigin = ''; src = ''; };
globalThis.document ??= { hidden: false, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.CustomEvent ??= class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.window ??= { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@game': root, '@director': path.join(root, 'director', 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom'
});

const silence = (engine) => {
  engine.bgEntities = [];
  engine.stars = [];
  engine.spawnThrusterParticles = () => {};
  engine.spawnBurst = () => {};
  engine.spawnExplosion = () => {};
  engine.spawnFloatingText = () => {};
  engine.spawnRingEffect = () => {};
  engine.addPlayerAfterimage = () => {};
  engine.playSound = () => {};
};

const baseStats = () => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 3,
  bombCharge: 0,
  bombChargeMax: 100,
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 960,
  lives: 5,
  repairsCount: 0,
  upgrades: { fireRate: 2, speed: 1 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const step = (engine, frames) => {
  for (let frame = 0; frame < frames; frame += 1) {
    const aimX = 40 + ((frame * 17) % 310);
    engine.handleInput({ ' ': true }, { x: aimX, y: 760 });
    engine.update(false);
    if (!Number.isFinite(engine.stats.score) || engine.stats.score < 0) {
      throw new Error(`score left the finite range at frame ${frame}`);
    }
  }
};

try {
  const [{ DEFAULT_GAME_CAMPAIGN }, { GameEngine }, { EntityType }] = await Promise.all([
    vite.ssrLoadModule('/services/levelConfig.ts'),
    vite.ssrLoadModule('/services/gameLogic.ts'),
    vite.ssrLoadModule('/types.ts')
  ]);
  const levels = [...DEFAULT_GAME_CAMPAIGN.levels].sort((left, right) => left.order - right.order);
  const failures = [];
  const bossReports = [];

  for (const level of levels) {
    const opening = [...level.waves].sort((left, right) => left.order - right.order)[0];
    try {
      const engine = new GameEngine(baseStats(), {
        campaign: DEFAULT_GAME_CAMPAIGN,
        previewMode: false,
        previewInvincible: true,
        audioEnabled: false,
        playerShipId: 'researchhub',
        initialLevelId: level.id,
        initialWaveId: opening?.id,
        randomSeed: `remaster-${level.id}`
      });
      engine.init(390, 844);
      silence(engine);
      step(engine, 180);
    } catch (error) {
      failures.push({ level: level.id, phase: 'opening', error: error?.message || String(error) });
    }
  }

  for (const level of levels) {
    for (const wave of level.waves) {
      const bosses = wave.events.filter((event) => event.kind === 'boss');
      for (const bossEvent of bosses) {
        try {
          const engine = new GameEngine(baseStats(), {
            campaign: DEFAULT_GAME_CAMPAIGN,
            previewMode: false,
            previewInvincible: true,
            audioEnabled: false,
            playerShipId: 'researchhub',
            initialLevelId: level.id,
            initialWaveId: wave.id,
            randomSeed: `remaster-boss-${bossEvent.id}`
          });
          engine.init(390, 844);
          silence(engine);
          const isEncounterBody = (entity) => (
            !entity.markedForDeletion
            && (
              entity.type === EntityType.BOSS
              || entity.type === EntityType.MINI_BOSS
              || entity.sourceEventId === bossEvent.id
            )
          );
          let boss = null;
          for (let frame = 0; frame < 1500 && !boss; frame += 1) {
            engine.handleInput({}, { x: 180, y: 760 });
            engine.update(false);
            boss = engine.entities.find(isEncounterBody) ?? null;
          }
          if (!boss) throw new Error('boss did not spawn');
          if (!Number.isFinite(boss.hp) || boss.hp <= 0) throw new Error(`bad boss hp ${boss.hp}`);
          const major = String(bossEvent.id).endsWith('-major-boss');
          if (major && boss.maxHp !== Number(bossEvent.health)) {
            throw new Error(`major boss maxHp ${boss.maxHp} hp ${boss.hp} type ${boss.type} != authored ${bossEvent.health}`);
          }
          step(engine, 240);
          bossReports.push({
            mission: level.order,
            id: bossEvent.id,
            bossId: bossEvent.bossId,
            hp: boss.hp,
            authored: bossEvent.health,
            major
          });
        } catch (error) {
          failures.push({ level: level.id, boss: bossEvent.id, error: error?.message || String(error) });
        }
      }
    }
  }

  const summary = {
    levels: levels.length,
    bosses: bossReports.length,
    failures
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await vite.close();
}
