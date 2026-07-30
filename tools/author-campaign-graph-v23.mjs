import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCampaignFormationAuthoring } from './campaign-formation-authoring.mjs';
import { applyCampaignMiniBossAssignments } from './campaign-mini-boss-authoring.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const migrationPath = path.join(repositoryRoot, 'game-config', 'campaign-migration-v23.json');
const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));

// Historical migration only. The live revision-23 Campaign now contains
// user-approved boss placements and authored boss timelines that this original
// graph generator cannot reconstruct from its revision-22 templates.
if (campaign.revision === 23 && campaign.campaignGraph) {
  throw new Error(
    'Campaign graph v23 is a historical migration and must not overwrite the current authored Campaign.'
  );
}

if (campaign.revision !== 22 || campaign.campaignGraph) {
  throw new Error('Campaign graph v23 requires the historical revision-22 input package.');
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sectorSeeds = [
  ['sector-open-orbit', 'OPEN ORBIT', 'theme-open-orbit', 'open-orbit', 'gatekeeper-prime', 'PIXI_BOSS_OPEN_ORBIT_FRAMES'],
  ['sector-redline', 'REDLINE FRONTIER', 'theme-redline', 'shattered-void', 'eclipse-engine', 'CAMPAIGN_BOSS_ECLIPSE_ENGINE'],
  ['sector-gravity', 'GRAVITY RIFT', 'theme-gravity', 'gravity-rift', 'helix-leviathan', 'CAMPAIGN_BOSS_HELIX_LEVIATHAN'],
  ['sector-terminus', 'TERMINUS FRONTIER', 'theme-terminus', 'terminus-frontier', 'research-tribunal', 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT'],
  ['sector-prism-expanse', 'PRISM EXPANSE', 'theme-prism-expanse', 'ion-eclipse', 'prism-moth', 'CAMPAIGN_BOSS_PRISM_MOTH'],
  ['sector-rail-meridian', 'RAIL MERIDIAN', 'theme-rail-meridian', 'helix-redline', 'rail-serpent', 'CAMPAIGN_BOSS_RAIL_SERPENT'],
  ['sector-singularity-reach', 'SINGULARITY REACH', 'theme-singularity-reach', 'gravity-rift', 'singularity-crab', 'CAMPAIGN_BOSS_SINGULARITY_CRAB'],
  ['sector-gyroscope-array', 'GYROSCOPE ARRAY', 'theme-gyroscope-array', 'open-galaxy', 'orbit-gyroscope', 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE'],
  ['sector-hammerhead-line', 'HAMMERHEAD LINE', 'theme-hammerhead-line', 'shattered-void', 'hammerhead-siege', 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE'],
  ['sector-crownclaw-frontier', 'CROWNCLAW FRONTIER', 'theme-crownclaw-frontier', 'terminus-frontier', 'frontier-crownclaw', 'PIXI_BOSS_CROWNCLAW_FRAMES']
];

const legacyMainIds = campaign.levels
  .filter((level) => Number(level.order) <= 20)
  .sort((left, right) => Number(left.order) - Number(right.order))
  .map((level) => level.id);
const levelById = new Map(campaign.levels.map((level) => [level.id, level]));
const templateByRole = new Map(
  campaign.levels.slice(15, 20).map((level) => [level.campaignProgression.missionRole, level])
);
const bossTemplate = clone(templateByRole.get('major-boss'));
const masteryTemplate = clone(campaign.campaignBranches.find((branch) => branch.missionType === 'elite-remix'));

if (!bossTemplate || !masteryTemplate) throw new Error('Missing v22 boss or mastery template.');

// Campaign score values stay deliberately linear across the fifty main
// progression depths. The v22 templates used powers of two, which became both
// non-monotonic and explosively large when those templates were cloned into
// the six new sectors. Route alternatives share their main-path depth so a
// route choice changes encounter risk instead of silently changing the base
// enemy-value scale.
const scoreMultiplierForDepth = (sectorNumber, slot) => ((sectorNumber - 1) * 5) + slot;
const bossScoreRewardForSector = (sectorNumber) => 1010 + ((sectorNumber - 1) * 4000);

// Real-engine mobile/desktop matrix tuning. These values keep the ten boss
// identities distinct while replacing the old near-linear HP/projectile ramp,
// which produced hard walls at Missions 10/15/35/50. Generated compatibility
// bosses also consume the authored burst count as a per-cue projectile budget
// in GameEngine, so pattern density remains owned by Campaign data.
const bossBalanceBySector = Object.freeze([
  Object.freeze({ health: 170, speed: 2.12, projectileSpeed: 6.52, attackInterval: 1.465, burstCount: 2, phaseSpeeds: [1, 1] }),
  Object.freeze({ health: 650, speed: 2.15, projectileSpeed: 7.0, attackInterval: 1.52, burstCount: 3, phaseSpeeds: [0.82, 0.9, 1] }),
  Object.freeze({ health: 950, speed: 2.18, projectileSpeed: 6.0, attackInterval: 2.0, burstCount: 1, phaseSpeeds: [0.8, 0.88, 0.98] }),
  Object.freeze({ health: 1400, speed: 2.2, projectileSpeed: 6.4, attackInterval: 1.48, burstCount: 3, phaseSpeeds: [0.84, 0.92, 1.02] }),
  Object.freeze({ health: 1750, speed: 2.22, projectileSpeed: 6.2, attackInterval: 1.46, burstCount: 2, phaseSpeeds: [0.78, 0.86, 0.96] }),
  Object.freeze({ health: 1850, speed: 2.25, projectileSpeed: 6.8, attackInterval: 1.44, burstCount: 3, phaseSpeeds: [0.82, 0.9, 1] }),
  Object.freeze({ health: 1950, speed: 2.28, projectileSpeed: 4.6, attackInterval: 1.42, burstCount: 1, phaseSpeeds: [0.72, 0.8, 0.9] }),
  Object.freeze({ health: 2100, speed: 2.3, projectileSpeed: 6.2, attackInterval: 1.4, burstCount: 2, phaseSpeeds: [0.68, 0.76, 0.86] }),
  Object.freeze({ health: 2300, speed: 2.32, projectileSpeed: 5.6, attackInterval: 1.38, burstCount: 1, phaseSpeeds: [0.7, 0.78, 0.88] }),
  Object.freeze({ health: 2450, speed: 2.35, projectileSpeed: 7.6, attackInterval: 5.4, burstCount: 3, phaseSpeeds: [0.72, 0.8, 0.9], movementPatternId: 'gatekeeper-cycle' })
]);

const rewriteWaveIds = (level, missionId) => {
  level.waves.forEach((wave, waveIndex) => {
    wave.id = `${missionId}-wave-${waveIndex + 1}`;
    wave.order = waveIndex + 1;
    wave.events.forEach((event, eventIndex) => {
      event.id = `${missionId}-wave-${waveIndex + 1}-event-${eventIndex + 1}`;
    });
  });
};

const retuneLevel = (level, sectorNumber, slot, route = 'main') => {
  const routePremium = route === 'b' ? 1.12 : 1;
  const progression = level.campaignProgression;
  const waveCoins = 8 + (sectorNumber * 2);
  const missionCoins = 24 + (sectorNumber * 5);
  const firstCoins = 46 + (sectorNumber * 11);
  progression.reward = {
    waveClearCoins: Math.round(waveCoins * routePremium),
    missionClearCoins: Math.round(missionCoins * routePremium),
    firstClearCoins: Math.round(firstCoins * routePremium),
    bossFirstClearCoins: slot === 5 ? 70 + (sectorNumber * 22) : slot === 3 ? 22 + (sectorNumber * 6) : 0,
    replayMultiplier: 0.2
  };
  progression.masteryObjectives = [
    { id: `${level.id}:complete`, label: 'Clear the Mission', kind: 'complete', target: 1, rewardCoins: 14 + sectorNumber * 3 },
    { id: `${level.id}:performance`, label: 'Clear while taking no more than two hits', kind: 'damage-at-most', target: 2, rewardCoins: 22 + sectorNumber * 5 },
    { id: `${level.id}:master`, label: 'Master Clear: take no damage', kind: 'damage-at-most', target: 0, rewardCoins: 34 + sectorNumber * 8 }
  ];
  progression.masterySetBonusCoins = 48 + sectorNumber * 12;
  progression.recommendedPower = {
    minimum: 800 + ((sectorNumber - 1) * 720) + ((slot - 1) * 120),
    expected: 1050 + ((sectorNumber - 1) * 900) + ((slot - 1) * 160),
    comfortable: 1350 + ((sectorNumber - 1) * 1100) + ((slot - 1) * 210)
  };
  progression.testedLoadouts = {
    lowPower: 'Tier-appropriate main ship at the minimum recommendation',
    expectedPower: 'Expected main-ship power with one relevant support role',
    upgraded: 'Comfortable power with complementary support roles'
  };
  progression.combatBudget = level.waves.reduce((total, wave) => total + Number(wave.combatBudget || 0), 0);
  const scoreMultiplier = scoreMultiplierForDepth(sectorNumber, slot);
  level.waves.forEach((wave) => {
    wave.scoreMultiplier = scoreMultiplier;
  });
  level.startingDifficulty = 1 + ((sectorNumber - 1) * 0.055) + ((slot - 1) * 0.012);
  level.durationSeconds = level.waves.reduce((total, wave) => (
    total + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds
  ), 0);
};

const cloneLevel = ({ source, id, name, order, sector, sectorNumber, slot, role, route = 'main' }) => {
  const level = clone(source);
  level.id = id;
  level.name = name;
  level.order = order;
  level.backgroundId = sector[3];
  level.description = route === 'b'
    ? `Take the higher-risk ${sector[1]} route for stronger first-clear rewards.`
    : `Advance through ${sector[1]} with a readable escalation toward its sector boss.`;
  level.campaignProgression.sectorId = sector[0];
  level.campaignProgression.missionRole = role;
  level.campaignProgression.mapPosition = {
    x: route === 'b' ? 0.68 : slot === 2 ? 0.32 : slot === 4 ? 0.43 : 0.5,
    y: ((sectorNumber - 1) * 5 + slot - 1) / 49
  };
  rewriteWaveIds(level, id);
  level.waves.forEach((wave) => {
    wave.backgroundId = sector[3];
    wave.difficultyMultiplier = Math.max(1, level.startingDifficulty ?? 1) * (route === 'b' ? 1.08 : 1);
    wave.events.forEach((event) => {
      if (event.kind !== 'spawn' || !Array.isArray(event.enemies)) return;
      event.count = Math.min(20, Math.max(3, Math.round(event.count * (1 + Math.max(0, sectorNumber - 4) * 0.025))));
      event.spawnIntervalSeconds = Math.max(0.3, Number(event.spawnIntervalSeconds || 0.5));
      event.enemies.forEach((enemy) => {
        enemy.health = Math.max(1, Math.round(enemy.health * (1 + Math.max(0, sectorNumber - 4) * 0.08)));
        enemy.speed = Math.min(5.2, enemy.speed * (1 + Math.max(0, sectorNumber - 4) * 0.015));
        if (enemy.attackIntervalSeconds !== undefined) enemy.attackIntervalSeconds = Math.max(1.05, enemy.attackIntervalSeconds);
        if (enemy.burstCount !== undefined) enemy.burstCount = Math.min(3, enemy.burstCount);
      });
    });
  });
  retuneLevel(level, sectorNumber, slot, route);
  return level;
};

const cloneLeadInWave = (sourceWave, missionId, waveNumber, backgroundId, rhythm) => {
  const wave = clone(sourceWave);
  wave.id = `${missionId}-wave-${waveNumber}`;
  wave.name = rhythm === 'recovery'
    ? 'FINAL RECOVERY WINDOW'
    : waveNumber === 1
      ? 'BOSS SIGNAL APPROACH'
      : 'COMMAND SCREEN';
  wave.order = waveNumber;
  wave.backgroundId = backgroundId;
  wave.completionRule = 'clear-after-duration';
  wave.rhythm = rhythm;
  wave.introSeconds = rhythm === 'recovery' ? 0.6 : waveNumber === 1 ? 1.6 : 0.9;
  wave.delayAfterSeconds = 1;
  wave.durationSeconds = rhythm === 'recovery' ? 7 : waveNumber === 1 ? 11 : 12;
  // Boss Missions use bespoke low-pressure lead-ins rather than a reusable
  // formation pack. The spawned enemies below remain authored and visible,
  // while avoiding a misleading formation-role compatibility declaration.
  wave.formationPackIds = [];
  wave.events = wave.events.filter((event) => event.kind !== 'boss');
  wave.events.forEach((event, eventIndex) => {
    event.id = `${missionId}-wave-${waveNumber}-event-${eventIndex + 1}`;
    if (event.durationSeconds !== undefined) {
      event.durationSeconds = Math.min(
        event.durationSeconds,
        Math.max(0.1, wave.durationSeconds - Number(event.startSeconds || 0))
      );
    }
    if (event.kind === 'spawn') {
      const maximumSpawnCount = rhythm === 'recovery' ? 4 : waveNumber === 1 ? 7 : 8;
      event.count = Math.min(maximumSpawnCount, event.count);
      event.spawnIntervalSeconds = Math.max(0.55, event.spawnIntervalSeconds);
      event.enemies?.forEach((enemy) => {
        const maximumEnemyHealth = rhythm === 'recovery' ? 5 : waveNumber === 1 ? 10 : 12;
        enemy.health = Math.max(1, Math.min(enemy.health, maximumEnemyHealth));
        if (enemy.attackIntervalSeconds !== undefined) enemy.attackIntervalSeconds = Math.max(1.8, enemy.attackIntervalSeconds);
        if (enemy.burstCount !== undefined) enemy.burstCount = Math.min(2, enemy.burstCount);
      });
    }
  });
  return wave;
};

const configureBossMission = (level, sector, sectorNumber) => {
  const missionId = level.id;
  const bossBackgroundId = level.backgroundId ?? sector[3];
  const priorLevelId = sector.mainIds[3];
  const prior = levelById.get(priorLevelId) ?? sector.generatedLevels?.find((entry) => entry.id === priorLevelId);
  const warmupSource = prior?.waves.find((wave) => wave.rhythm === 'warm-up') ?? prior?.waves[0];
  const pressureSource = prior?.waves.find((wave) => wave.rhythm === 'variation')
    ?? prior?.waves.find((wave) => wave.rhythm === 'introduce')
    ?? prior?.waves[1];
  const recoverySource = prior?.waves.find((wave) => wave.rhythm === 'recovery') ?? prior?.waves.at(-2);
  const oldBossWave = clone(level.waves.find((wave) => wave.completionRule === 'boss-defeat') ?? level.waves.at(-1));
  const bossEvent = oldBossWave.events.find((event) => event.kind === 'boss');
  const balance = bossBalanceBySector[sectorNumber - 1];
  if (!warmupSource || !pressureSource || !recoverySource || !bossEvent || !balance) throw new Error(`Missing boss lead-in source or balance row for ${missionId}.`);

  oldBossWave.id = `${missionId}-wave-4`;
  oldBossWave.name = sector[1] + ' COMMANDER';
  oldBossWave.order = 4;
  oldBossWave.backgroundId = bossBackgroundId;
  oldBossWave.rhythm = 'boss';
  oldBossWave.introSeconds = 2.8;
  oldBossWave.delayAfterSeconds = 5;
  oldBossWave.durationSeconds = Math.max(150, oldBossWave.durationSeconds);
  oldBossWave.events = [bossEvent];
  bossEvent.id = `${missionId}-major-boss`;
  bossEvent.bossId = sector[4];
  bossEvent.label = sector[1] + ' COMMANDER';
  bossEvent.spriteKey = sector[5];
  bossEvent.rigId = sectorNumber <= 4 ? bossEvent.rigId : 'crown-claw';
  bossEvent.movementPatternId = balance.movementPatternId ?? (
    ['prism-moth', 'singularity-crab', 'orbit-gyroscope'].includes(sector[4])
      ? 'arena-roam'
      : 'gatekeeper-cycle'
  );
  bossEvent.health = balance.health;
  bossEvent.scoreReward = bossScoreRewardForSector(sectorNumber);
  bossEvent.speed = balance.speed;
  bossEvent.sizeMultiplier = 1.14;
  bossEvent.warningSeconds = 3;
  bossEvent.weapons.forEach((weapon) => {
    weapon.damage = 1;
    weapon.attackIntervalSeconds = balance.attackInterval;
    weapon.projectileSpeed = weapon.weaponId === 'lane-beam' ? 0 : balance.projectileSpeed;
    weapon.burstCount = balance.burstCount;
  });
  bossEvent.phases.forEach((phase, phaseIndex) => {
    phase.speedMultiplier = balance.phaseSpeeds[Math.min(phaseIndex, balance.phaseSpeeds.length - 1)];
    if (balance.movementPatternId) phase.movementPatternId = balance.movementPatternId;
  });
  level.waves = [
    cloneLeadInWave(warmupSource, missionId, 1, bossBackgroundId, 'warm-up'),
    cloneLeadInWave(pressureSource, missionId, 2, bossBackgroundId, 'variation'),
    cloneLeadInWave(recoverySource, missionId, 3, bossBackgroundId, 'recovery'),
    oldBossWave
  ];
  const missionScoreMultiplier = scoreMultiplierForDepth(sectorNumber, 5);
  level.waves.forEach((wave) => {
    wave.scoreMultiplier = missionScoreMultiplier;
  });
  level.scorecard.encounterAssetKey = sector[5];
  level.campaignProgression.combatBudget = level.waves.reduce((total, wave) => total + wave.combatBudget, 0);
  level.durationSeconds = level.waves.reduce((total, wave) => total + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds, 0);
};

const missionNamesBySector = [
  ['ORBIT ENTRY', 'CITATION CROSSING', 'PAYWALL CHECKPOINT', 'BASTION APPROACH', 'BASTION PROTOCOL'],
  ['HELIX SIGNAL', 'REDLINE CROSSING', 'DARK MATTER CHECKPOINT', 'MIRROR APPROACH', 'NULL SECTOR'],
  ['SHARD SIGNAL', 'QUANTUM CROSSING', 'GRAVITY CHECKPOINT', 'EVENT HORIZON', 'ION CITADEL'],
  ['CRIMSON SIGNAL', 'ECLIPSE CROSSING', 'FRACTURE CHECKPOINT', 'LAST LIGHT', 'TERMINUS ASCENDANT'],
  ['PRISM SIGNAL', 'SPECTRUM CROSSING', 'BROOD CHECKPOINT', 'LUMEN APPROACH', 'PRISM SANCTUM'],
  ['RAIL SIGNAL', 'MERIDIAN CROSSING', 'COIL CHECKPOINT', 'SERPENT APPROACH', 'RAIL NEXUS'],
  ['GRAVITY SIGNAL', 'EVENTIDE CROSSING', 'WELL CHECKPOINT', 'COLLAPSE APPROACH', 'SINGULARITY CORE'],
  ['ORBIT SIGNAL', 'AXIS CROSSING', 'GYRO CHECKPOINT', 'ROTATION APPROACH', 'GYROSCOPE ARRAY'],
  ['SIEGE SIGNAL', 'BREACH CROSSING', 'HAMMER CHECKPOINT', 'DREAD APPROACH', 'HAMMERHEAD LINE'],
  ['FRONTIER SIGNAL', 'CLAW CROSSING', 'CROWN CHECKPOINT', 'REDLINE APPROACH', 'CROWNCLAW THRONE']
];

const roleBySlot = ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'];
const sectors = [];
const generatedMainLevels = [];
let nextOrder = 21;

for (let sectorIndex = 0; sectorIndex < sectorSeeds.length; sectorIndex += 1) {
  const sectorNumber = sectorIndex + 1;
  const seed = sectorSeeds[sectorIndex];
  const mainIds = sectorNumber <= 4
    ? legacyMainIds.slice(sectorIndex * 5, sectorIndex * 5 + 5)
    : Array.from({ length: 5 }, (_, slotIndex) => `stage-${slug(seed[1])}-${['signal', 'crossing', 'checkpoint', 'approach', 'commander'][slotIndex]}`);
  seed.mainIds = mainIds;
  seed.generatedLevels = [];
  if (sectorNumber > 4) {
    for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
      const role = roleBySlot[slotIndex];
      const source = role === 'major-boss' ? bossTemplate : templateByRole.get(role);
      const level = cloneLevel({
        source,
        id: mainIds[slotIndex],
        name: missionNamesBySector[sectorIndex][slotIndex],
        order: nextOrder++,
        sector: seed,
        sectorNumber,
        slot: slotIndex + 1,
        role
      });
      seed.generatedLevels.push(level);
      generatedMainLevels.push(level);
      levelById.set(level.id, level);
    }
  } else {
    mainIds.forEach((id, slotIndex) => {
      const level = levelById.get(id);
      level.name = missionNamesBySector[sectorIndex][slotIndex];
      level.campaignProgression.sectorId = seed[0];
      level.campaignProgression.mapPosition = {
        x: slotIndex === 1 ? 0.32 : slotIndex === 3 ? 0.43 : 0.5,
        y: ((sectorNumber - 1) * 5 + slotIndex) / 49
      };
      retuneLevel(level, sectorNumber, slotIndex + 1);
    });
  }
}

campaign.levels.push(...generatedMainLevels);

const alternateLevels = [];
for (let sectorIndex = 0; sectorIndex < sectorSeeds.length; sectorIndex += 1) {
  const sectorNumber = sectorIndex + 1;
  const seed = sectorSeeds[sectorIndex];
  const source = levelById.get(seed.mainIds[1]);
  const id = `stage-${slug(seed[1])}-route-b`;
  const alternate = cloneLevel({
    source,
    id,
    name: `${seed[1]} HIGH-RISK ROUTE`,
    order: nextOrder++,
    sector: seed,
    sectorNumber,
    slot: 2,
    role: 'formation-remix',
    route: 'b'
  });
  alternateLevels.push(alternate);
  levelById.set(id, alternate);
  seed.alternateId = id;
}
campaign.levels.push(...alternateLevels);

for (let sectorIndex = 0; sectorIndex < sectorSeeds.length; sectorIndex += 1) {
  const seed = sectorSeeds[sectorIndex];
  const sectorNumber = sectorIndex + 1;
  const primaryNext = sectorNumber < 10 ? sectorSeeds[sectorIndex + 1].mainIds[0] : null;
  const [d1, d2, d3, d4, d5] = seed.mainIds;
  levelById.get(d1).campaignProgression.nextMissionId = d2;
  levelById.get(d2).campaignProgression.nextMissionId = d3;
  levelById.get(seed.alternateId).campaignProgression.nextMissionId = d3;
  levelById.get(d3).campaignProgression.nextMissionId = d4;
  levelById.get(d4).campaignProgression.nextMissionId = d5;
  levelById.get(d5).campaignProgression.nextMissionId = primaryNext;
  configureBossMission(levelById.get(d5), seed, sectorNumber);
}

// Mission 7 is intentionally a readable formation remix rather than the old
// density/fire spike. It remains beatable with ordinary Sector-1 earnings.
const missionSeven = levelById.get('stage-redline-corridor');
missionSeven.startingDifficulty = 1.07;
missionSeven.campaignProgression.recommendedPower = { minimum: 1250, expected: 1650, comfortable: 2200 };
missionSeven.waves.forEach((wave, waveIndex) => wave.events.forEach((event) => {
  if (event.kind !== 'spawn') return;
  event.count = Math.min(event.count, waveIndex < 2 ? 7 : 10);
  event.spawnIntervalSeconds = Math.max(0.58, event.spawnIntervalSeconds);
  event.enemies.forEach((enemy) => {
    enemy.health = Math.min(enemy.health, waveIndex < 2 ? 4 : 7);
    if (waveIndex < 2) {
      delete enemy.attackPatternId;
      delete enemy.attackIntervalSeconds;
      delete enemy.projectileSpeed;
      delete enemy.burstCount;
    } else if (enemy.attackIntervalSeconds !== undefined) {
      enemy.attackIntervalSeconds = Math.max(2, enemy.attackIntervalSeconds);
      enemy.burstCount = Math.min(2, enemy.burstCount ?? 1);
    }
  });
}));
missionSeven.campaignProgression.combatBudget = missionSeven.waves.reduce((total, wave) => total + wave.combatBudget, 0);

// Preserve the role-introduction cadence in the first two sectors. Several
// legacy Wave templates previewed late-role enemies before the Mission that
// formally teaches them; route clones would otherwise repeat that mismatch.
const roleCatalogById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
const formationPackById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
const introductionPositionByMissionId = new Map();
sectorSeeds.forEach((seed, sectorIndex) => {
  seed.mainIds.forEach((missionId, slotIndex) => {
    introductionPositionByMissionId.set(missionId, { sector: sectorIndex + 1, mission: slotIndex + 1 });
  });
  introductionPositionByMissionId.set(seed.alternateId, { sector: sectorIndex + 1, mission: 2 });
});

const roleIsIntroduced = (roleId, position) => {
  const role = roleCatalogById.get(roleId);
  if (!role || !position) return true;
  return Number(role.introductionSector) < position.sector || (
    Number(role.introductionSector) === position.sector
      && Number(role.introductionMission) <= position.mission
  );
};

const earlyRoleFallbacks = new Map([
  ['role-journal-priority', 'role-research-drone'],
  ['role-jet-interceptor', 'role-citation-swarm'],
  ['role-jet-heavy', 'role-jet-scout'],
  ['role-dark-sentinel', 'role-wall-sniper-left'],
  ['role-crescent-minelayer', 'role-laser-hunter']
]);
const earlyPackFallbacks = new Map([
  ['pack-priority-diamond', 'pack-citation-spiral'],
  ['pack-jet-pincer', 'pack-citation-spiral'],
  ['pack-dark-lanes', 'pack-wall-crossfire']
]);

campaign.levels.forEach((level) => {
  const position = introductionPositionByMissionId.get(level.id);
  if (!position) return;
  level.waves.forEach((wave) => {
    wave.formationPackIds = (wave.formationPackIds ?? []).map((packId) => {
      const pack = formationPackById.get(packId);
      if (!pack || pack.enemyRoleIds.every((roleId) => roleIsIntroduced(roleId, position))) return packId;
      return earlyPackFallbacks.get(packId) ?? packId;
    });
    wave.events.forEach((event) => {
      if (event.kind !== 'spawn' || !Array.isArray(event.enemies)) return;
      event.enemies.forEach((enemy) => {
        if (roleIsIntroduced(enemy.roleId, position)) return;
        const fallbackRoleId = earlyRoleFallbacks.get(enemy.roleId);
        const fallbackRole = roleCatalogById.get(fallbackRoleId);
        if (!fallbackRole || !roleIsIntroduced(fallbackRole.id, position)) {
          throw new Error(`No introduced fallback for ${enemy.roleId} in ${level.id}.`);
        }
        enemy.roleId = fallbackRole.id;
        enemy.enemyId = fallbackRole.enemyId;
        enemy.spriteKey = fallbackRole.spriteKey;
        if (fallbackRole.fireBehavior === 'none') {
          delete enemy.attackPatternId;
          delete enemy.attackIntervalSeconds;
          delete enemy.projectileSpeed;
          delete enemy.burstCount;
        }
      });
      // An early-role fallback can intentionally collapse an armored variant
      // into an already-present scout family. Merge that duplicate instead of
      // authoring two indistinguishable enemy IDs in one weighted pool.
      const deduplicatedEnemies = [];
      event.enemies.forEach((enemy) => {
        const existing = deduplicatedEnemies.find((candidate) => candidate.enemyId === enemy.enemyId);
        if (existing) {
          existing.weight = Number(existing.weight ?? 0) + Number(enemy.weight ?? 0);
          return;
        }
        deduplicatedEnemies.push(enemy);
      });
      const totalWeight = deduplicatedEnemies.reduce((total, enemy) => total + Number(enemy.weight ?? 0), 0);
      if (totalWeight > 0) deduplicatedEnemies.forEach((enemy) => { enemy.weight = Number(enemy.weight ?? 0) / totalWeight; });
      event.enemies = deduplicatedEnemies;
    });
  });
});

// Non-boss production envelope proven against the fixed-step GameEngine
// matrix. The source templates intentionally preserve their formation and
// enemy-role identity, but cloning their old density/HP ramp into every later
// sector produced forty-elite overlaps and effectively unavoidable fire. Keep
// boss Missions and boss events untouched; normalize only ordinary spawn
// events so Campaign difficulty comes from readable patterns and role mixes
// instead of raw concurrency.
const nonBossSpawnCapsByWave = [7, 8, 5, 4, 3, 5, 5];
campaign.levels.forEach((level) => {
  if (level.campaignProgression?.missionRole === 'major-boss') return;
  const position = introductionPositionByMissionId.get(level.id);
  if (!position) return;
  const sectorNumber = position.sector;
  const routePremium = level.id.endsWith('-route-b') ? 1 : 0;
  const densityPremium = routePremium && sectorNumber < 8 ? 1 : 0;
  const standardHealthCap = 4 + Math.floor((sectorNumber - 1) / 3);
  const eliteHealthCap = 6 + Math.floor((sectorNumber - 1) / 2);
  const projectileSpeedCap = 4.7 + Math.min(0.5, (sectorNumber - 1) * 0.055);

  level.waves.forEach((wave, waveIndex) => {
    const spawnEvents = wave.events.filter((event) => event.kind === 'spawn');
    spawnEvents.forEach((event) => {
      const eliteEncounter = event.enemies.some((enemy) => enemy.rank === 'elite');
      const waveCap = nonBossSpawnCapsByWave[Math.min(waveIndex, nonBossSpawnCapsByWave.length - 1)];
      const eventCap = eliteEncounter ? 3 + densityPremium : waveCap + densityPremium;
      event.count = Math.max(1, Math.min(event.count, eventCap));
      event.spawnIntervalSeconds = wave.rhythm === 'introduce'
        ? Math.min(0.6, Math.max(0.52, Number(event.spawnIntervalSeconds || 0.5)))
        : Math.max(
            eliteEncounter ? 0.95 : 0.72,
            Number(event.spawnIntervalSeconds || 0.5)
          );

      event.enemies.forEach((enemy) => {
        const role = roleCatalogById.get(enemy.roleId);
        const firingRole = role?.fireBehavior && role.fireBehavior !== 'none';
        const elite = enemy.rank === 'elite';
        enemy.health = Math.max(1, Math.min(enemy.health, elite ? eliteHealthCap : standardHealthCap));
        const speedCap = sectorNumber >= 8
          ? (elite ? 2.75 : 3.25)
          : (elite ? 2.9 : 3.45);
        enemy.speed = Math.min(enemy.speed, speedCap);

        if (!firingRole) {
          delete enemy.attackPatternId;
          delete enemy.attackIntervalSeconds;
          delete enemy.projectileSpeed;
          delete enemy.burstCount;
          return;
        }

        enemy.attackIntervalSeconds = Math.max(
          elite ? 3.15 - routePremium * 0.2 : 2.45 - routePremium * 0.15,
          Number(enemy.attackIntervalSeconds || 0)
        );
        enemy.projectileSpeed = Math.min(
          projectileSpeedCap + routePremium * 0.12,
          Number(enemy.projectileSpeed || projectileSpeedCap)
        );
        enemy.burstCount = Math.min(
          role.fireBehavior === 'aimed-burst' ? 2 : 1,
          Math.max(1, Number(enemy.burstCount || 1))
        );
      });
    });

    // Checkpoint mini-bosses use the same encounter contract as ordinary
    // Campaign waves. Their cloned v22 values had reached two 340-HP drones
    // firing four-shot volleys every 1.15 seconds, which was more pressure than
    // the major bosses surrounding them. Keep the twin-drone/wall identities,
    // but fit their durability and fire windows to the non-boss envelope.
    wave.events.filter((event) => event.kind === 'boss').forEach((event) => {
      const climaxHealthCap = level.campaignProgression.missionRole === 'elite-checkpoint'
        ? 108 + sectorNumber * 12
        : 116 + sectorNumber * 12;
      event.health = Math.min(event.health, climaxHealthCap);
      if (event.bossId === 'bottleneck-drone') {
        event.speed = Math.min(event.speed, 2.1);
        event.weapons.forEach((weapon) => {
          weapon.attackIntervalSeconds = Math.max(3.2, weapon.attackIntervalSeconds);
          weapon.projectileSpeed = Math.min(4.4, weapon.projectileSpeed);
          weapon.burstCount = 1;
        });
      } else if (event.bossId === 'paywall-wall') {
        event.speed = Math.min(event.speed, 1.9);
        event.weapons.forEach((weapon) => {
          weapon.attackIntervalSeconds = Math.max(1.8, weapon.attackIntervalSeconds);
          weapon.projectileSpeed = Math.min(5.4, weapon.projectileSpeed);
          weapon.burstCount = Math.min(2, weapon.burstCount);
        });
      }
    });
  });
});

const existingThemeIds = new Set(campaign.visualThemes.map((theme) => theme.id));
sectorSeeds.slice(4).forEach((seed) => {
  if (existingThemeIds.has(seed[2])) return;
  campaign.visualThemes.push({
    id: seed[2],
    label: seed[1],
    backgroundId: seed[3],
    accent: ['#f0abfc', '#fb7185', '#c084fc', '#38bdf8', '#fb923c', '#f43f5e'][campaign.visualThemes.length - 4],
    description: `A late-Campaign combat region themed around ${seed[1].toLowerCase()}.`
  });
});

campaign.formationPacks.forEach((pack) => {
  pack.compatibleSectorIds = sectorSeeds.map((seed) => seed[0]);
});
campaign.miniBosses.forEach((miniBoss) => {
  miniBoss.suitableSectorIds = sectorSeeds.map((seed) => seed[0]);
});

const reIdBranchEvents = (branch, branchSlug) => {
  branch.missionDefinition.events?.forEach((event, index) => {
    event.id = `${branchSlug}-event-${index + 1}`;
  });
};

const addedBranches = sectorSeeds.slice(4).map((seed, offset) => {
  const sectorNumber = offset + 5;
  const branchSlug = slug(seed[1]);
  const sourceMissionId = seed.mainIds[4];
  const branch = clone(masteryTemplate);
  branch.branchId = `branch-${branchSlug}-mastery`;
  branch.sourceMissionId = sourceMissionId;
  branch.unlockCondition.missionId = sourceMissionId;
  branch.displayName = `${seed[1]} MASTERY PROTOCOL`;
  branch.hiddenName = 'ENCRYPTED MASTERY ROUTE';
  branch.mapPosition = { x: 0.86, y: Math.min(0.99, (sectorNumber * 5 - 1) / 49) };
  branch.routeControlPoints = [
    { x: 0.5, y: (sectorNumber * 5 - 1) / 49 },
    { x: 0.72, y: Math.min(0.99, (sectorNumber * 5 - 0.5) / 49) },
    { ...branch.mapPosition }
  ];
  branch.rewardPreview.label = `${seed[1]} MASTERY CACHE`;
  branch.rewardPreview.minimumCoins = 150 + sectorNumber * 35;
  branch.rewardPreview.maximumCoins = branch.rewardPreview.minimumCoins;
  branch.missionDefinitionId = `mastery-${branchSlug}-01`;
  branch.missionDefinition.id = branch.missionDefinitionId;
  branch.missionDefinition.backgroundId = seed[3];
  branch.missionDefinition.combatBudget = Math.min(420, 150 + sectorNumber * 20);
  branch.completionReward = {
    baseCoins: 60 + sectorNumber * 10,
    oneTimeBonusCoins: 90 + sectorNumber * 25,
    maximumPerformanceCoins: 0,
    totalMinimumCoins: 150 + sectorNumber * 35,
    totalMaximumCoins: 150 + sectorNumber * 35
  };
  branch.returnNodeId = sourceMissionId;
  reIdBranchEvents(branch, branchSlug);
  return branch;
});
campaign.campaignBranches.push(...addedBranches);

// Give every mastery route its own outer map rail. Alternating sides prevents
// branches from stacking on each other while leaving the primary graph clear.
campaign.campaignBranches.forEach((branch, index) => {
  const sourcePosition = clone(levelById.get(branch.sourceMissionId)?.campaignProgression?.mapPosition ?? {
    x: 0.5,
    y: Math.min(1, ((index + 1) * 5 - 1) / 49)
  });
  const y = sourcePosition.y;
  const x = index % 2 === 0 ? 0.09 : 0.91;
  branch.mapPosition = { x, y };
  branch.routeControlPoints = [
    sourcePosition,
    { x: index % 2 === 0 ? 0.28 : 0.72, y },
    { x, y }
  ];
});

const branchIdBySourceMissionId = new Map(campaign.campaignBranches.map((branch) => [branch.sourceMissionId, branch.branchId]));

const graphNodes = [];
const nodeId = (sectorNumber, slot, route = '') => `node-s${String(sectorNumber).padStart(2, '0')}-d${String(slot).padStart(2, '0')}${route}`;
const edge = (id, toNodeId, routeId, label, kind, risk, weeklyScoreMultiplier) => ({
  edgeId: id, toNodeId, routeId, label, kind, risk, weeklyScoreMultiplier
});

for (let sectorIndex = 0; sectorIndex < sectorSeeds.length; sectorIndex += 1) {
  const sectorNumber = sectorIndex + 1;
  const seed = sectorSeeds[sectorIndex];
  const globalStart = (sectorNumber - 1) * 5;
  const ids = {
    d1: nodeId(sectorNumber, 1),
    d2a: nodeId(sectorNumber, 2, 'a'),
    d2b: nodeId(sectorNumber, 2, 'b'),
    d3: nodeId(sectorNumber, 3),
    d4: nodeId(sectorNumber, 4),
    d5: nodeId(sectorNumber, 5)
  };
  const nextEntry = sectorNumber < 10 ? nodeId(sectorNumber + 1, 1) : null;
  const makeNode = ({ id, slot, routeId, label, missionDefinitionId, prerequisites, outgoingEdges, rejoinNodeId = null, risk = 'low', rewardProfile = 'standard', bossId = null, miniBossIds = [] }) => {
    const depth = globalStart + slot;
    const level = levelById.get(missionDefinitionId);
    return {
      nodeId: id,
      sectorId: seed[0],
      depth,
      routeId,
      displayLabel: label,
      missionDefinitionId,
      prerequisiteNodeIds: prerequisites,
      prerequisiteMode: prerequisites.length > 1 ? 'any' : 'all',
      outgoingEdges,
      rejoinNodeId,
      optional: false,
      mainPath: routeId !== `${seed[0]}-route-b`,
      masteryBranch: false,
      oneTime: false,
      bossId,
      miniBossIds,
      weeklyStreakEligible: true,
      weeklyScoreMultiplier: risk === 'high' ? 1.14 : risk === 'moderate' ? 1.05 : 1,
      recommendedPower: clone(level.campaignProgression.recommendedPower),
      rewardProfile,
      mapPosition: { x: routeId.endsWith('route-b') ? 0.68 : routeId.endsWith('route-a') ? 0.32 : slot === 4 ? 0.43 : 0.5, y: (depth - 1) / 49 },
      routeControlPoints: [],
      routeSummary: {
        combatIntensity: risk,
        miniBossPresence: miniBossIds.length ? 'required' : 'none',
        rewardType: rewardProfile,
        recommendedSupportTags: clone(level.campaignProgression.recommendedSupportTags),
        estimatedWaveCount: level.waves.length
      }
    };
  };
  graphNodes.push(
    makeNode({
      id: ids.d1, slot: 1, routeId: `${seed[0]}-main`, label: String(globalStart + 1).padStart(2, '0'),
      missionDefinitionId: seed.mainIds[0], prerequisites: sectorNumber === 1 ? [] : [nodeId(sectorNumber - 1, 5)],
      outgoingEdges: [
        edge(`edge-s${sectorNumber}-fork-a`, ids.d2a, `${seed[0]}-route-a`, 'Balanced route', 'route-choice', 'moderate', 1.05),
        edge(`edge-s${sectorNumber}-fork-b`, ids.d2b, `${seed[0]}-route-b`, 'High-risk reward route', 'route-choice', 'high', 1.14)
      ]
    }),
    makeNode({
      id: ids.d2a, slot: 2, routeId: `${seed[0]}-route-a`, label: `${String(globalStart + 2).padStart(2, '0')}A`,
      missionDefinitionId: seed.mainIds[1], prerequisites: [ids.d1], rejoinNodeId: ids.d3, risk: 'moderate',
      outgoingEdges: [edge(`edge-s${sectorNumber}-a-rejoin`, ids.d3, `${seed[0]}-route-a`, 'Rejoin command lane', 'rejoin', 'moderate', 1.05)]
    }),
    makeNode({
      id: ids.d2b, slot: 2, routeId: `${seed[0]}-route-b`, label: `${String(globalStart + 2).padStart(2, '0')}B`,
      missionDefinitionId: seed.alternateId, prerequisites: [ids.d1], rejoinNodeId: ids.d3, risk: 'high', rewardProfile: 'combat-premium',
      outgoingEdges: [edge(`edge-s${sectorNumber}-b-rejoin`, ids.d3, `${seed[0]}-route-b`, 'Rejoin command lane', 'rejoin', 'high', 1.14)]
    }),
    makeNode({
      id: ids.d3, slot: 3, routeId: `${seed[0]}-main`, label: String(globalStart + 3).padStart(2, '0'),
      missionDefinitionId: seed.mainIds[2], prerequisites: [ids.d2a, ids.d2b], miniBossIds: ['bottleneck-drone'],
      outgoingEdges: [edge(`edge-s${sectorNumber}-d3-d4`, ids.d4, `${seed[0]}-main`, 'Advance to boss signal', 'progression', 'moderate', 1.04)]
    }),
    makeNode({
      id: ids.d4, slot: 4, routeId: `${seed[0]}-main`, label: String(globalStart + 4).padStart(2, '0'),
      missionDefinitionId: seed.mainIds[3], prerequisites: [ids.d3], risk: 'moderate', miniBossIds: ['paywall-wall'],
      outgoingEdges: [edge(`edge-s${sectorNumber}-d4-boss`, ids.d5, `${seed[0]}-main`, 'Challenge sector commander', 'progression', 'moderate', 1.06)]
    }),
    makeNode({
      id: ids.d5, slot: 5, routeId: `${seed[0]}-main`, label: String(globalStart + 5).padStart(2, '0'),
      missionDefinitionId: seed.mainIds[4], prerequisites: [ids.d4], risk: 'high', rewardProfile: 'boss', bossId: seed[4],
      outgoingEdges: nextEntry ? [edge(`edge-s${sectorNumber}-boss-next`, nextEntry, `${seed[0]}-main`, 'Enter next sector', 'progression', 'moderate', 1.04)] : []
    })
  );
}

const graphNodeById = new Map(graphNodes.map((node) => [node.nodeId, node]));
graphNodes.forEach((node) => {
  node.routeControlPoints = node.outgoingEdges.map((routeEdge) => clone(graphNodeById.get(routeEdge.toNodeId)?.mapPosition ?? node.mapPosition));
  if (node.routeControlPoints.length === 0) node.routeControlPoints = [clone(node.mapPosition)];
});

campaign.campaignGraph = { entryNodeId: 'node-s01-d01', nodes: graphNodes };
campaign.sectors = sectorSeeds.map((seed, index) => ({
  id: seed[0],
  order: index + 1,
  name: seed[1],
  themeId: seed[2],
  missionIds: seed.mainIds,
  mainNodeIds: [nodeId(index + 1, 1), nodeId(index + 1, 2, 'a'), nodeId(index + 1, 3), nodeId(index + 1, 4), nodeId(index + 1, 5)],
  routeNodeIds: [nodeId(index + 1, 2, 'b')],
  majorBossId: seed[4],
  branchIds: [branchIdBySourceMissionId.get(seed.mainIds[4])]
}));

campaign.revision = 23;
campaign.updatedAt = '2026-07-28T20:00:00.000Z';

// A Mission owns its visual environment. Cloned lead-ins used to retain their
// source sector background in a few legacy boss Missions (notably M5 and M15),
// creating a visible environment jump between waves. Normalize at the final
// authoring boundary so every generated wave inherits its containing Mission.
campaign.levels.forEach((level) => {
  if (!level.backgroundId) return;
  level.waves.forEach((wave) => {
    wave.backgroundId = level.backgroundId;
  });
});

// Cloning and early-role fallback can change the role set represented by a
// Wave. Rebind packs from the final authored spawn data and lower only cooldown
// metadata that contradicts intentional adjacent-Wave reuse. This pass never
// changes route topology, enemy choreography, or encounter timing.
normalizeCampaignFormationAuthoring(campaign);
applyCampaignMiniBossAssignments(campaign);

await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
await writeFile(migrationPath, `${JSON.stringify({
  id: 'campaign-revision-22-to-23',
  fromRevision: 22,
  toRevision: 23,
  generatedAt: campaign.updatedAt,
  preservedMissionIds: legacyMainIds,
  graphEntryNodeId: campaign.campaignGraph.entryNodeId,
  missionNodeAliases: Object.fromEntries(graphNodes.map((node) => [node.missionDefinitionId, node.nodeId])),
  notes: [
    'All twenty revision-22 Mission IDs remain valid and retain their records.',
    'Legacy checkpoints map to the graph node that owns the same Mission definition.',
    'Alternate route nodes never replace or regress the furthest main checkpoint.',
    'Six new sectors extend the Campaign to fifty main depths and ten major bosses.'
  ]
}, null, 2)}\n`, 'utf8');

console.log(`Authored campaign revision ${campaign.revision}: ${campaign.sectors.length} sectors, ${campaign.levels.length} Mission definitions, ${campaign.campaignGraph.nodes.length} graph nodes.`);
