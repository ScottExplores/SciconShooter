import fs from 'node:fs';
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
  dispatchEvent() { return true; },
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

const missionNumbers = parseListArgument('missions', [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
const maximumSeconds = Math.max(60, parseListArgument('max-seconds', [210])[0]);
const jsonOnly = process.argv.includes('--json');
const writeArtifact = process.argv.includes('--write');
const verbose = process.argv.includes('--verbose');
const artifactPath = path.join(repositoryRoot, 'artifacts', 'campaign-balance', 'final-boss-matrix.json');
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
  const [{ DEFAULT_GAME_CAMPAIGN }, { GameEngine }, { EntityType }, combatLab, weaponProgression] = await Promise.all([
    vite.ssrLoadModule('/services/levelConfig.ts'),
    vite.ssrLoadModule('/services/gameLogic.ts'),
    vite.ssrLoadModule('/types.ts'),
    vite.ssrLoadModule('/director/src/combat-lab/experimentModel.ts'),
    vite.ssrLoadModule('/services/weaponTierProgression.ts')
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
    const bounded = clamp(
      Math.round(total),
      0,
      weaponProgression.FIRE_RATE_MAX_LEVEL + 14
    );
    const speed = Math.min(7, Math.round(bounded * 0.2));
    const startingHearts = Math.min(7, Math.round(bounded * 0.2));
    const fireRate = Math.min(
      weaponProgression.FIRE_RATE_MAX_LEVEL,
      bounded - speed - startingHearts
    );
    const assigned = fireRate + speed + startingHearts;
    return {
      fireRate: Math.min(
        weaponProgression.FIRE_RATE_MAX_LEVEL,
        fireRate + Math.max(0, bounded - assigned)
      ),
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

  const hostileRiskAt = (engine, x, y, bossMotion) => {
    let risk = 0;
    const playerRadius = Math.max(18, Math.min(engine.player.width, engine.player.height) * 0.28);
    if (
      Number.isFinite(bossMotion.hazardTargetX)
      && Number.isFinite(bossMotion.hazardTargetY)
      && Number(engine.frameCount) <= bossMotion.hazardUntilFrame
    ) {
      // Singularity Collapse locks the warning marker before any projectile
      // exists. Ignoring that authored telegraph made the bot sit on the
      // convergence point until the ring was already lethal, especially on a
      // phone-sized arena. A human reads the marker and leaves during warning.
      const escapeRadius = Math.max(104, Math.min(190, engine.width * 0.29));
      const targetDistance = Math.hypot(x - bossMotion.hazardTargetX, y - bossMotion.hazardTargetY);
      if (targetDistance < escapeRadius) {
        risk += 1900 * (1 - targetDistance / escapeRadius) ** 2;
      }
    }
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
      // Generated volleys cross a desktop-height arena for substantially
      // longer before reaching the player. An 18-frame horizon reacted after
      // a fast helix lane was already committed, understating a player's
      // ability to read the authored telegraph and move early.
      const lookaheadFrames = hostileProjectile
        ? Math.max(entity.width, entity.height) >= 48
          ? [0, 18, 36, 54]
          : [0, 12, 24, 36]
        : [0, 8];
      for (const lookahead of lookaheadFrames) {
        const centerX = entity.x + entity.width / 2 + entity.vx * lookahead;
        const centerY = entity.y + entity.height / 2 + entity.vy * lookahead;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance >= margin) continue;
        const severity = hostileProjectile
          ? Math.max(entity.width, entity.height) >= 48
            ? 2200
            : 780
          : 1040;
        risk += severity * telegraphWeight * (1 - distance / margin) ** 2;
      }
    }
    return risk;
  };

  const chooseTouchTarget = (engine, width, height, bossMotion) => {
    const playerCenterX = engine.player.x + engine.player.width / 2;
    const playerCenterY = engine.player.y + engine.player.height / 2;
    const bossCenterX = engine.bossRef
      ? engine.bossRef.x + engine.bossRef.width / 2
      : width / 2;
    const shieldTarget = engine.entities
      .filter((entity) => (
        !entity.markedForDeletion
        && entity.type === EntityType.ENEMY_SWARM
        && entity.formation === 'orbit'
        && (!engine.bossRef || entity.shieldHostId === engine.bossRef.id)
      ))
      .sort((left, right) => right.y - left.y)[0];
    // Skilled players dismantle exposed boss weapons before returning fire to
    // the hull. Model that choice so modular bosses are measured against their
    // authored counterplay rather than a controller that wastes shots on a
    // protected center mass.
    const activeComponent = (engine.bossRef?.bossComponents ?? [])
      .filter((component) => !component.destroyed && component.exposed !== false)
      .sort((left, right) => (
        (left.hp / Math.max(1, left.maxHp)) - (right.hp / Math.max(1, right.maxHp))
      ))[0];
    const componentTarget = engine.bossRef && activeComponent
      ? {
          id: `${engine.bossRef.id}:${activeComponent.id}`,
          x: engine.bossRef.x + (activeComponent.centerXRatio - activeComponent.widthRatio / 2) * engine.bossRef.width,
          y: engine.bossRef.y + (activeComponent.centerYRatio - activeComponent.heightRatio / 2) * engine.bossRef.height,
          width: activeComponent.widthRatio * engine.bossRef.width,
          height: activeComponent.heightRatio * engine.bossRef.height
        }
      : null;
    const offensiveTarget = shieldTarget ?? componentTarget ?? engine.bossRef;
    const offensiveTargetId = offensiveTarget?.id ?? 'arena-center';
    const offensiveCenterX = offensiveTarget
      ? offensiveTarget.x + offensiveTarget.width / 2
      : bossCenterX;
    const offensiveBottomY = offensiveTarget
      ? offensiveTarget.y + offensiveTarget.height
      : engine.bossRef
        ? engine.bossRef.y + engine.bossRef.height
        : height * 0.2;
    if (engine.bossRef) {
      const currentFrame = Number(engine.frameCount) || 0;
      if (bossMotion.lastTargetId !== offensiveTargetId) {
        bossMotion.lastTargetId = offensiveTargetId;
        bossMotion.lastCenterX = offensiveCenterX;
        bossMotion.lastFrame = currentFrame;
        bossMotion.velocityX = 0;
      } else if (bossMotion.lastFrame !== null && currentFrame > bossMotion.lastFrame) {
        const observedVelocity = (offensiveCenterX - bossMotion.lastCenterX)
          / (currentFrame - bossMotion.lastFrame);
        bossMotion.velocityX = bossMotion.velocityX * 0.55 + observedVelocity * 0.45;
      }
      bossMotion.lastCenterX = offensiveCenterX;
      bossMotion.lastFrame = currentFrame;
      const rawLockedTargetX = engine.bossRef.generatedBossTargetX;
      const rawLockedTargetY = engine.bossRef.generatedBossTargetY;
      const lockedTargetX = Number(rawLockedTargetX);
      const lockedTargetY = Number(rawLockedTargetY);
      if (
        rawLockedTargetX !== null
        && rawLockedTargetY !== null
        && Number.isFinite(lockedTargetX)
        && Number.isFinite(lockedTargetY)
      ) {
        bossMotion.hazardTargetX = lockedTargetX;
        bossMotion.hazardTargetY = lockedTargetY;
        bossMotion.hazardUntilFrame = currentFrame + 96;
      }
    }
    const projectileTravelFrames = engine.bossRef
      ? clamp(
          (playerCenterY - offensiveBottomY) / 12,
          8,
          42
        )
      : 0;
    const predictedAimCenterX = clamp(
      offensiveCenterX + bossMotion.velocityX * projectileTravelFrames,
      12,
      width - 12
    );
    const bossAimWindow = Math.max(
      36,
      Math.min(96, Number(offensiveTarget?.width || 96) * 0.5)
    );
    const bossAimOffset = Math.max(24, Math.min(72, bossAimWindow * 0.8));
    const xRatios = [0.08, 0.16, 0.26, 0.38, 0.5, 0.62, 0.74, 0.84, 0.92];
    const xCandidates = [...new Set([
      ...xRatios.map((ratio) => width * ratio),
      predictedAimCenterX,
      predictedAimCenterX - bossAimOffset,
      predictedAimCenterX + bossAimOffset,
      bossCenterX,
      playerCenterX
    ].map((value) => Math.round(clamp(value, width * 0.06, width * 0.94))))];
    const yRatios = [0.68, 0.78, 0.87];
    let best = { x: playerCenterX, y: playerCenterY, score: Number.POSITIVE_INFINITY };

    for (const x of xCandidates) {
      for (const yRatio of yRatios) {
        const y = Math.min(height - 82, height * yRatio);
        const risk = hostileRiskAt(engine, x, y, bossMotion);
        // A main-ship shot only contributes while it overlaps the boss lane.
        // Normalizing aim cost by the whole viewport made the desktop pilot
        // consider a several-hundred-pixel miss almost free, producing false
        // desktop deaths while the same controller cleared on mobile. Scale
        // against the actual boss hit window while still letting imminent
        // projectile/beam risk win the decision.
        const aimDistance = Math.abs(x - predictedAimCenterX);
        const aimCost = (aimDistance / bossAimWindow) ** 1.45 * 95;
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
    const bossMotion = {
      lastCenterX: null,
      lastFrame: null,
      lastTargetId: null,
      velocityX: 0,
      hazardTargetX: null,
      hazardTargetY: null,
      hazardUntilFrame: -1
    };
    // Keep the initial random stream identical across every loadout and
    // viewport for a Mission. Including the comparison axes in the seed made
    // viewport and power-tier deltas inseparable from a different boss RNG
    // sequence, which invalidated direct matrix comparisons.
    const seed = `campaign-balance:m${missionNumber}:shared-v2`;
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
    const playerHitSources = {};
    const originalHitFeedback = engine.registerPlayerProjectileHitFeedback.bind(engine);
    engine.registerPlayerProjectileHitFeedback = (projectile, blocked) => {
      if (!blocked) {
        const source = projectile.projectileVisualKind
          ?? projectile.frontierCrownclawArtifactKind
          ?? projectile.heliosMineState?.kind
          ?? projectile.type
          ?? 'unknown';
        playerHitSources[source] = (playerHitSources[source] ?? 0) + 1;
      }
      return originalHitFeedback(projectile, blocked);
    };
    const originalRamCollision = engine.resolvePlayerRamCollision.bind(engine);
    engine.resolvePlayerRamCollision = (enemy, protectedFromDamage) => {
      if (!protectedFromDamage) {
        const source = `ram:${enemy.sourceItemId ?? enemy.campaignRoleId ?? enemy.type ?? 'unknown'}`;
        playerHitSources[source] = (playerHitSources[source] ?? 0) + 1;
      }
      return originalRamCollision(enemy, protectedFromDamage);
    };
    let bossStartFrame = null;
    let maximumHostileProjectiles = 0;
    let maximumHostileProjectileBreakdown = {};
    let minimumBossHealthRatio = 1;
    let bossActiveFrames = 0;
    let bossAlignedFrames = 0;
    let cumulativeBossAimDistance = 0;
    let lastStrategicBombFrame = -9999;
    const trialDiagnostics = () => ({
      bossAlignmentRate: bossActiveFrames > 0
        ? Number((bossAlignedFrames / bossActiveFrames).toFixed(3))
        : 0,
      averageBossAimDistance: bossActiveFrames > 0
        ? Number((cumulativeBossAimDistance / bossActiveFrames).toFixed(1))
        : 0,
      maximumHostileProjectileBreakdown,
      playerHitSources,
      shieldEscortsRemaining: engine.entities.filter((entity) => (
        !entity.markedForDeletion
        && entity.type === EntityType.ENEMY_SWARM
        && entity.formation === 'orbit'
      )).length,
      bossComponents: (engine.bossRef?.bossComponents ?? []).map((component) => ({
        id: component.id,
        hp: component.hp,
        destroyed: component.destroyed
      })),
      bossProjectileDamage: Number(engine.bossRef?.projectileDamage ?? 0)
    });
    const frameLimit = Math.round(maximumSeconds * 60);
    for (let frame = 0; frame < frameLimit; frame += 1) {
      if (frame % 6 === 0) {
        engine.handleInput({}, chooseTouchTarget(engine, viewport.width, viewport.height, bossMotion));
      }
      const activeBossBeforeTick = engine.bossRef;
      if (activeBossBeforeTick && !activeBossBeforeTick.markedForDeletion) {
        if ((stats.shipAbilityCooldown || 0) <= 0) engine.triggerShipAbility();
        const bossElapsedFrames = bossStartFrame === null ? 0 : frame - bossStartFrame;
        const shieldEscortCount = engine.entities.filter((entity) => (
          !entity.markedForDeletion
          && entity.type === EntityType.ENEMY_SWARM
          && entity.formation === 'orbit'
          && entity.shieldHostId === activeBossBeforeTick.id
        )).length;
        const bossHealthRatio = activeBossBeforeTick.hp / Math.max(1, activeBossBeforeTick.maxHp);
        const shouldUseBomb = shieldEscortCount > 0 || bossHealthRatio <= 0.72;
        if (
          shouldUseBomb
          && bossElapsedFrames >= 30
          && (stats.bombs || 0) > 0
          && frame - lastStrategicBombFrame >= 240
          && engine.triggerBomb()
        ) {
          lastStrategicBombFrame = frame;
        }
      }
      engine.update();
      const boss = engine.bossRef;
      if (boss && bossStartFrame === null) bossStartFrame = frame;
      if (boss) {
        minimumBossHealthRatio = Math.min(minimumBossHealthRatio, boss.hp / Math.max(1, boss.maxHp));
        const playerCenterX = engine.player.x + engine.player.width / 2;
        const bossCenterX = boss.x + boss.width / 2;
        const aimDistance = Math.abs(playerCenterX - bossCenterX);
        bossActiveFrames += 1;
        cumulativeBossAimDistance += aimDistance;
        if (aimDistance <= Math.max(36, boss.width * 0.5)) bossAlignedFrames += 1;
      }
      const hostileProjectiles = engine.entities.filter((entity) => (
        !entity.markedForDeletion
        && entity.type === EntityType.PROJECTILE
        && !entity.isPlayerShot
        && !entity.isTelegraph
      ));
      const hostileCount = hostileProjectiles.length;
      if (hostileCount > maximumHostileProjectiles) {
        maximumHostileProjectiles = hostileCount;
        maximumHostileProjectileBreakdown = Object.fromEntries(
          [...hostileProjectiles.reduce((counts, entity) => {
            const key = entity.isBeam
              ? 'beam'
              : String(entity.variant ?? entity.projectileVisualKind ?? 'standard');
            counts.set(key, (counts.get(key) ?? 0) + 1);
            return counts;
          }, new Map())].sort(([left], [right]) => left.localeCompare(right))
        );
      }

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
          maximumHostileProjectiles,
          ...trialDiagnostics()
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
          maximumHostileProjectiles,
          ...trialDiagnostics()
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
      maximumHostileProjectiles,
      ...trialDiagnostics()
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

  const payload = { summary, results };
  if (writeArtifact) {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  if (jsonOnly) {
    console.log(JSON.stringify(payload, null, 2));
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
      console.log(`M${result.missionNumber} ${result.tier}/${result.support}/${result.viewport}: ${result.outcome}, boss ${Math.round(result.bossHealthRemaining * 100)}%, damage ${result.damage}, peak ${result.maximumHostileProjectiles}, aligned ${Math.round(result.bossAlignmentRate * 100)}%, aim ${result.averageBossAimDistance}px${verbose ? `, peak mix ${JSON.stringify(result.maximumHostileProjectileBreakdown)}, hits ${JSON.stringify(result.playerHitSources)}, boss damage ${result.bossProjectileDamage}, shields ${result.shieldEscortsRemaining}, components ${JSON.stringify(result.bossComponents)}` : ''}`);
    }
    if (writeArtifact) console.log(`\nWrote ${path.relative(repositoryRoot, artifactPath)}.`);
  }
} finally {
  await vite.close();
}
