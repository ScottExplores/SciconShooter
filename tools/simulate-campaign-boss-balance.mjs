import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolDirectory, '..');

globalThis.Image ??= class ImageStub {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = 'anonymous';
  src = '';
};
globalThis.document ??= {
  hidden: false,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window ??= {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener() {},
  removeEventListener() {},
  setInterval,
  clearInterval,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};

const parseListArgument = (name, fallback) => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return raw
    ? raw.split(',').map((value) => Number(value.trim())).filter(Number.isFinite)
    : fallback;
};

const missionNumbers = parseListArgument('missions', [5, 10, 15, 20]);
const maximumSeconds = Math.max(60, parseListArgument('max-seconds', [210])[0]);
const jsonOnly = process.argv.includes('--json');
const verbose = process.argv.includes('--verbose');
const parseIdArgument = (name) => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return raw ? new Set(raw.split(',').map((value) => value.trim()).filter(Boolean)) : null;
};
const selectedTierIds = parseIdArgument('tiers');
const selectedSupportIds = parseIdArgument('supports');
const selectedViewportIds = parseIdArgument('viewports');

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});

try {
  const [{ DEFAULT_GAME_CAMPAIGN }, { GameEngine }, { EntityType }, combatLab] = await Promise.all([
    vite.ssrLoadModule('/services/levelConfig.ts'),
    vite.ssrLoadModule('/services/gameLogic.ts'),
    vite.ssrLoadModule('/types.ts'),
    vite.ssrLoadModule('/director/src/combat-lab/experimentModel.ts')
  ]);

  const viewports = Object.freeze([
    Object.freeze({ id: 'mobile', width: 390, height: 844 }),
    Object.freeze({ id: 'desktop', width: 1280, height: 720 })
  ].filter(({ id }) => !selectedViewportIds || selectedViewportIds.has(id)));
  const supportSets = Object.freeze([
    Object.freeze({ id: 'none', companions: Object.freeze([]) }),
    Object.freeze({
      id: 'prism-beacon',
      companions: Object.freeze([
        Object.freeze({ slot: 'left', miniShipId: 'prism-skimmer', level: 5 }),
        Object.freeze({ slot: 'right', miniShipId: 'beacon-kite', level: 5 })
      ])
    }),
    Object.freeze({
      id: 'photon-ledger',
      companions: Object.freeze([
        Object.freeze({ slot: 'left', miniShipId: 'photon-manta', level: 5 }),
        Object.freeze({ slot: 'right', miniShipId: 'ledger-hammer', level: 5 })
      ])
    })
  ].filter(({ id }) => !selectedSupportIds || selectedSupportIds.has(id)));

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const allocateMainUpgrades = (total) => {
    const bounded = clamp(Math.round(total), 0, 35);
    const speed = Math.min(7, Math.round(bounded * 0.2));
    const startingHearts = Math.min(7, Math.round(bounded * 0.2));
    const fireRate = Math.min(21, bounded - speed - startingHearts);
    const assigned = fireRate + speed + startingHearts;
    return {
      fireRate: Math.min(21, fireRate + Math.max(0, bounded - assigned)),
      speed,
      startingHearts
    };
  };

  const levelForMission = (missionNumber) => {
    const level = DEFAULT_GAME_CAMPAIGN.levels.find(({ order }) => order === missionNumber);
    if (!level) throw new Error(`Campaign Mission ${missionNumber} does not exist.`);
    return level;
  };

  const loadoutTiersForMission = (missionNumber) => {
    const level = levelForMission(missionNumber);
    const guidance = level.campaignProgression.recommendedPower;
    return [
      ['low', guidance.minimum],
      ['expected', guidance.expected],
      ['upgraded', guidance.comfortable]
    ].filter(([id]) => !selectedTierIds || selectedTierIds.has(id)).map(([id, power]) => Object.freeze({
      id,
      power,
      upgrades: Object.freeze(allocateMainUpgrades((power - 1000) / 160))
    }));
  };

  const createStats = (upgrades) => ({
    score: 0,
    highScore: 0,
    wave: 1,
    coins: 0,
    totalCoins: 0,
    enemiesDefeated: 0,
    bombs: 0,
    bombCharge: 0,
    bombChargeMax: 100,
    shipAbilityCooldown: 0,
    shipAbilityCooldownMax: 960,
    lives: 3 + upgrades.startingHearts,
    repairsCount: 0,
    upgrades: {
      fireRate: upgrades.fireRate,
      speed: upgrades.speed,
      missile: 0
    },
    powerupUses: {},
    bossProgress: 0,
    isBossActive: false,
    bossHp: 0,
    bossMaxHp: 100
  });

  const pointToRotatedRectangleDistance = (pointX, pointY, entity) => {
    const centerX = entity.x + entity.width / 2;
    const centerY = entity.y + entity.height / 2;
    const angle = Number(entity.beamAngleRadians) || 0;
    const cosine = Math.cos(-angle);
    const sine = Math.sin(-angle);
    const dx = pointX - centerX;
    const dy = pointY - centerY;
    const localX = dx * cosine - dy * sine;
    const localY = dx * sine + dy * cosine;
    const outsideX = Math.max(0, Math.abs(localX) - entity.width / 2);
    const outsideY = Math.max(0, Math.abs(localY) - entity.height / 2);
    return Math.hypot(outsideX, outsideY);
  };

  const hostileRiskAt = (engine, x, y) => {
    let risk = 0;
    const playerRadius = Math.max(18, Math.min(engine.player.width, engine.player.height) * 0.28);
    for (const entity of engine.entities) {
      if (entity.markedForDeletion || entity.isPlayerShot) continue;
      const hostileProjectile = entity.type === EntityType.PROJECTILE;
      const hostileBody = [
        EntityType.BOSS,
        EntityType.MINI_BOSS,
        EntityType.ENEMY_DRONE,
        EntityType.ENEMY_BRICK,
        EntityType.ENEMY_JOURNAL,
        EntityType.ENEMY_SWARM,
        EntityType.ENEMY_INVADER
      ].includes(entity.type);
      if (!hostileProjectile && !hostileBody) continue;

      const telegraphWeight = entity.isTelegraph ? 0.62 : 1;
      if (entity.isBeam) {
        const distance = pointToRotatedRectangleDistance(x, y, entity);
        const margin = playerRadius + (entity.isTelegraph ? 46 : 30);
        if (distance < margin) {
          const severity = entity.isTelegraph ? 520 : 1600;
          risk += severity * telegraphWeight * (1 - distance / margin) ** 2;
        }
        continue;
      }

      const entityRadius = Math.max(6, Math.min(52, Math.hypot(entity.width, entity.height) * 0.25));
      const margin = playerRadius + entityRadius + (hostileProjectile ? 42 : 28);
      const lookaheadFrames = hostileProjectile ? [0, 9, 18] : [0, 8];
      for (const lookahead of lookaheadFrames) {
        const centerX = entity.x + entity.width / 2 + entity.vx * lookahead;
        const centerY = entity.y + entity.height / 2 + entity.vy * lookahead;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance >= margin) continue;
        const severity = hostileProjectile ? 780 : 1040;
        risk += severity * telegraphWeight * (1 - distance / margin) ** 2;
      }
    }
    return risk;
  };

  const chooseTouchTarget = (engine, width, height) => {
    const playerCenterX = engine.player.x + engine.player.width / 2;
    const playerCenterY = engine.player.y + engine.player.height / 2;
    const bossCenterX = engine.bossRef
      ? engine.bossRef.x + engine.bossRef.width / 2
      : width / 2;
    const xRatios = [0.08, 0.16, 0.26, 0.38, 0.5, 0.62, 0.74, 0.84, 0.92];
    const xCandidates = [...new Set([
      ...xRatios.map((ratio) => width * ratio),
      bossCenterX,
      bossCenterX - width * 0.045,
      bossCenterX + width * 0.045,
      playerCenterX
    ].map((value) => Math.round(clamp(value, width * 0.06, width * 0.94))))];
    const yRatios = [0.68, 0.78, 0.87];
    let best = { x: playerCenterX, y: playerCenterY, score: Number.POSITIVE_INFINITY };

    for (const x of xCandidates) {
      for (const yRatio of yRatios) {
        const y = Math.min(height - 82, height * yRatio);
        const risk = hostileRiskAt(engine, x, y);
        const aimCost = Math.abs(x - bossCenterX) / width * 110;
        const movementCost = Math.hypot(x - playerCenterX, y - playerCenterY) / width * 24;
        const verticalCost = Math.abs(y - height * 0.8) / height * 12;
        const score = risk + aimCost + movementCost + verticalCost;
        if (score < best.score) best = { x, y, score };
      }
    }

    const touchLead = width < 520 ? 82 : 64;
    return {
      x: clamp(best.x, 2, width - 2),
      y: clamp(best.y + touchLead, 2, height - 2)
    };
  };

  const runTrial = ({ missionNumber, tier, supportSet, viewport }) => {
    const level = levelForMission(missionNumber);
    const wave = level.waves.at(-1);
    const selection = {
      mainShipId: 'researchhub',
      upgrades: tier.upgrades,
      companions: supportSet.companions
    };
    const squadLoadout = combatLab.buildCombatLabRuntimeSquadLoadout(selection);
    const stats = createStats(tier.upgrades);
    const seed = `campaign-balance:m${missionNumber}:${tier.id}:${supportSet.id}:${viewport.id}`;
    const engine = new GameEngine(stats, {
      campaign: DEFAULT_GAME_CAMPAIGN,
      previewMode: true,
      previewInvincible: false,
      audioEnabled: false,
      playerShipId: 'researchhub',
      initialLevelId: level.id,
      initialWaveId: wave.id,
      squadLoadout,
      randomSeed: seed
    });
    engine.init(viewport.width, viewport.height);

    const startingLives = stats.lives;
    let bossStartFrame = null;
    let maximumHostileProjectiles = 0;
    let minimumBossHealthRatio = 1;
    const frameLimit = Math.round(maximumSeconds * 60);
    for (let frame = 0; frame < frameLimit; frame += 1) {
      if (frame % 6 === 0) {
        engine.handleInput({}, chooseTouchTarget(engine, viewport.width, viewport.height));
      }
      engine.update();
      const boss = engine.bossRef;
      if (boss && bossStartFrame === null) bossStartFrame = frame;
      if (boss) minimumBossHealthRatio = Math.min(minimumBossHealthRatio, boss.hp / Math.max(1, boss.maxHp));
      const hostileCount = engine.entities.filter((entity) => (
        !entity.markedForDeletion
        && entity.type === EntityType.PROJECTILE
        && !entity.isPlayerShot
        && !entity.isTelegraph
      )).length;
      maximumHostileProjectiles = Math.max(maximumHostileProjectiles, hostileCount);

      if (engine.mainBossDefeated) {
        return {
          missionNumber,
          tier: tier.id,
          support: supportSet.id,
          viewport: viewport.id,
          seed,
          outcome: 'clear',
          seconds: Number(((frame - (bossStartFrame ?? 0)) / 60).toFixed(1)),
          damage: Math.max(0, startingLives - stats.lives),
          livesRemaining: stats.lives,
          bossHealthRemaining: 0,
          maximumHostileProjectiles
        };
      }
      if (!engine.gameActive && !engine.previewComplete) {
        return {
          missionNumber,
          tier: tier.id,
          support: supportSet.id,
          viewport: viewport.id,
          seed,
          outcome: 'death',
          seconds: Number(((frame - (bossStartFrame ?? 0)) / 60).toFixed(1)),
          damage: Math.max(0, startingLives - stats.lives),
          livesRemaining: stats.lives,
          bossHealthRemaining: Number(minimumBossHealthRatio.toFixed(3)),
          maximumHostileProjectiles
        };
      }
    }

    return {
      missionNumber,
      tier: tier.id,
      support: supportSet.id,
      viewport: viewport.id,
      seed,
      outcome: 'timeout',
      seconds: maximumSeconds,
      damage: Math.max(0, startingLives - stats.lives),
      livesRemaining: stats.lives,
      bossHealthRemaining: Number(minimumBossHealthRatio.toFixed(3)),
      maximumHostileProjectiles
    };
  };

  const results = [];
  for (const missionNumber of missionNumbers) {
    for (const tier of loadoutTiersForMission(missionNumber)) {
      for (const supportSet of supportSets) {
        for (const viewport of viewports) {
          results.push(runTrial({ missionNumber, tier, supportSet, viewport }));
        }
      }
    }
  }

  const summary = missionNumbers.map((missionNumber) => {
    const rows = results.filter((result) => result.missionNumber === missionNumber);
    const clears = rows.filter((result) => result.outcome === 'clear');
    return {
      missionNumber,
      clears: clears.length,
      attempts: rows.length,
      clearRate: Number((clears.length / Math.max(1, rows.length)).toFixed(3)),
      medianClearSeconds: clears.length > 0
        ? [...clears].sort((left, right) => left.seconds - right.seconds)[Math.floor(clears.length / 2)].seconds
        : null,
      deaths: rows.filter((result) => result.outcome === 'death').length,
      timeouts: rows.filter((result) => result.outcome === 'timeout').length,
      maximumHostileProjectiles: Math.max(...rows.map((result) => result.maximumHostileProjectiles))
    };
  });

  if (jsonOnly) {
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    console.log('Campaign major-boss deterministic real-engine balance matrix');
    console.log(`Viewports: ${viewports.map(({ id, width, height }) => `${id} ${width}x${height}`).join(', ')}`);
    const tierCount = loadoutTiersForMission(missionNumbers[0]).length;
    console.log(`Attempts per Mission: ${supportSets.length} supports x ${tierCount} power tiers x ${viewports.length} viewports = ${supportSets.length * tierCount * viewports.length}`);
    for (const row of summary) {
      console.log(`M${row.missionNumber}: ${row.clears}/${row.attempts} clears, ${row.deaths} deaths, ${row.timeouts} timeouts, median clear ${row.medianClearSeconds ?? '-'}s, peak hostile projectiles ${row.maximumHostileProjectiles}`);
    }
    console.log('\nFailures:');
    for (const result of results.filter(({ outcome }) => verbose || outcome !== 'clear')) {
      console.log(`M${result.missionNumber} ${result.tier}/${result.support}/${result.viewport}: ${result.outcome}, boss ${Math.round(result.bossHealthRemaining * 100)}%, damage ${result.damage}, peak ${result.maximumHostileProjectiles}`);
    }
  }
} finally {
  await vite.close();
}
