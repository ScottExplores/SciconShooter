import { CAMPAIGN_BOSS_ECONOMY_BY_MISSION } from '../../campaignBossEconomy.ts';
import { CURVE, missionCurve, regularHealth, roundCurve, waveThreat } from './difficultyCurve.ts';

/** Explicit authoring source; curve-report --write applies it idempotently. */
export const REVAMP_ROSTER = [
  ['diver', 'Diver', 'drone', 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES', 'diver', 1.4, 1, 1, 'light', 'aimed-burst', 'diver'],
  ['escort', 'Escort Pair', 'swarm', 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES', 'formation-unit', 1.5, 1, 2, 'light', 'aimed-burst', 'diver'],
  ['shield-bearer', 'Shield Bearer', 'brick', 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES', 'armored-unit', 2, 1, 3, 'armored', 'post-formation', 'holder'],
  ['splitter', 'Splitter', 'swarm', 'ENEMY_SWARM_FRAMES', 'priority-target', 2, 1, 4, 'standard', 'post-formation', 'holder'],
  ['mine-layer', 'Mine Layer', 'journal', 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER', 'support-unit', 2.2, 2, 1, 'standard', 'post-formation', 'flanker'],
  ['sniper', 'Sniper', 'drone', 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT', 'shooter', 2.4, 2, 2, 'standard', 'aimed-burst', 'artillery'],
  ['teleporter', 'Teleporter', 'drone', 'SCICON_ENEMY_RIFT_WEAVER_FRAMES', 'flanker', 2.2, 2, 3, 'standard', 'post-formation', 'flanker'],
  ['carrier', 'Carrier', 'journal', 'CAMPAIGN_ENEMY_DNA_CONDUCTOR', 'formation-leader', 3.4, 2, 4, 'elite', 'post-formation', 'commander'],
];

export const ENTRY_LIBRARY = [
  ['swoop', 'v', 'top'], ['loop', 'arc', 'top'], ['s-curve', 'snake', 'top'],
  ['side-sweep', 'row', 'left'], ['pincer', 'double-v', 'split'],
  ['corkscrew', 'spiral', 'top'], ['bottom-flank', 'crescent', 'split'], ['train', 'snake', 'top'],
];
const clone = (value) => structuredClone(value);
const allMissionRoles = ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'];
const roleId = (slug) => `role-revamp-${slug}`;
const packId = (slug) => `pack-revamp-${slug}`;
const powerup = (id, start, type) => ({
  id, kind: 'recovery', label: type === 'projectile-upgrade' ? 'Guaranteed power increase' : 'Magnet pickup',
  startSeconds: start, durationSeconds: 0.1, delayAfterSeconds: 0, blocksWaveClock: false,
  positionId: 'center-top', coinCount: 0, powerupIds: [type],
});

export function authorRevampCampaign(source) {
  const campaign = clone(source);
  const sectors = campaign.sectors.slice(0, 3);
  const sectorIds = sectors.map((sector) => sector.id);
  campaign.enemyRoles = campaign.enemyRoles.filter((role) => !role.id.startsWith('role-revamp-'));
  const newRoles = REVAMP_ROSTER.map(([slug, label, enemyId, spriteKey, role, threatCost, introductionSector,
    introductionMission, durabilityClass, fireBehavior, characteristic]) => ({
      id: roleId(slug), label, enemyId, spriteKey, role, threatCost, introductionSector,
      introductionMission, durabilityClass, fireBehavior, fireDelaySeconds: 1.2,
      entryBehavior: characteristic === 'diver' ? 'dive' : characteristic === 'flanker' ? 'flank' : 'formation',
      compatibleFormationPackIds: [packId(slug)], synergyTags: [`revamp-${slug}`], reuseCooldownWaves: 0,
      maximumSimultaneousCount: slug === 'carrier' ? 3 : slug === 'escort' ? 6 : 8, performanceCost: slug === 'carrier' ? 3 : 1, characteristic,
    }));
  // Keep the catalog's exact art key; never duplicate or recolor Scott's files.
  const rift = campaign.enemyRoles.find((role) => role.id === 'role-rift-weaver');
  newRoles.find((role) => role.id === roleId('teleporter')).spriteKey = rift.spriteKey;
  // REVAMP(I): Ordinary formation hulls keep density separate from special-mechanic count.
  const linefighter = {
    id: roleId('linefighter'), label: 'Orbit Wing', enemyId: 'drone', spriteKey: 'LEGACY_ENEMY_DRONE_FRAMES',
    role: 'formation-unit', threatCost: 1, introductionSector: 1, introductionMission: 1,
    durabilityClass: 'light', fireBehavior: 'post-formation', fireDelaySeconds: 1.2,
    entryBehavior: 'formation', compatibleFormationPackIds: [packId('linefighter')],
    synergyTags: ['formation-pressure'], reuseCooldownWaves: 0, maximumSimultaneousCount: 40,
    performanceCost: 1, characteristic: 'diver',
  };
  campaign.enemyRoles.push(...newRoles, linefighter);
  const scout = campaign.enemyRoles.find((role) => role.id === 'role-orbit-scout');
  campaign.formationPacks = campaign.formationPacks.filter((pack) => !pack.id.startsWith('pack-revamp-'));
  const packRoles = [scout, ...newRoles, linefighter];
  for (const [index, role] of packRoles.entries()) {
    const slug = role === linefighter ? 'linefighter' : index === 0 ? 'swoop' : REVAMP_ROSTER[index - 1][0];
    const [entry, shape, direction] = ENTRY_LIBRARY[index % ENTRY_LIBRARY.length];
    const escort = slug === 'escort';
    const count = role === linefighter ? 36 : escort ? 6 : Math.min(role.maximumSimultaneousCount, 6);
    campaign.formationPacks.push({
      id: packId(slug), label: `Revamp ${role.label}`, enemyRoleIds: [role.id], enemyCount: count,
      totalThreatCost: roundCurve(count * role.threatCost), entryDirection: role === linefighter ? 'split' : direction,
      entryPath: `revamp-${entry}`, formationShape: escort ? 'v' : shape,
      movementBehavior: 'revamp-breathe', attackBehavior: escort ? 'revamp-escort' : 'revamp-dive',
      firingBehavior: role.fireBehavior === 'none' ? 'none' : role.characteristic === 'diver' ? 'staggered' : 'post-formation', returnBehavior: 'reform',
      holdSeconds: 2.8, telegraphSeconds: 0.8, attackDurationSeconds: 3.4,
      attackRecoverySeconds: 2.2, attackGroupSize: escort ? 3 : 1, attackCycles: role.characteristic === 'diver' ? 3 : 0,
      synergyAdjustment: 0, minimumSector: role.introductionSector, maximumSimultaneousInstances: 1,
      recoveryRequiredSeconds: 0.7, compatibleMissionRoles: allMissionRoles,
      compatibleSectorIds: sectorIds, mobilePerformanceCost: count * role.performanceCost,
    });
    if (!role.compatibleFormationPackIds.includes(packId(slug))) role.compatibleFormationPackIds.push(packId(slug));
  }

  const packsByRole = new Map(campaign.formationPacks.filter((pack) => pack.id.startsWith('pack-revamp-'))
    .map((pack) => [pack.enemyRoleIds[0], pack]));
  const miniTemplate = source.levels.flatMap((level) => level.waves).flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.bossId === 'bottleneck-drone');

  function spawn(level, waveId, role, threat, waveIndex, start = 0, forcedCount) {
    const curve = missionCurve(level.__depth);
    const escort = role.id === roleId('escort');
    let count = forcedCount ?? Math.max(2, Math.floor(threat / role.threatCost));
    if (escort) count = Math.max(3, Math.floor(count / 3) * 3);
    count = Math.min(count, role.maximumSimultaneousCount);
    const cadence = roundCurve(CURVE.referenceFireIntervalSeconds * count * role.threatCost / threat, 5);
    const pack = packsByRole.get(role.id);
    const entryIndex = Math.min(curve.sector === 1 ? 4 : 7, (waveIndex + curve.slot - 1) % 8);
    const [entry, shape] = ENTRY_LIBRARY[entryIndex];
    return {
      id: `${waveId}-formation`, kind: 'spawn', label: `${role.label} ${entry} formation`,
      startSeconds: start, durationSeconds: 4, delayAfterSeconds: 0, blocksWaveClock: false,
      count, patternId: escort ? 'v' : shape, positionId: 'formation-top',
      spawnIntervalSeconds: entry === 'train' ? 0.26 : 0.24,
      enemies: [{ enemyId: role.enemyId, roleId: role.id, spriteKey: role.spriteKey,
        weight: 1, health: regularHealth(curve.mission, role.durabilityClass), speed: 2.25 + (curve.sector - 1) * 0.1,
        damage: 1, scoreValue: Math.round(role.threatCost * 18), powerupDropChance: 0.025,
        ...(role.fireBehavior !== 'none' ? { attackIntervalSeconds: Math.min(3, cadence), projectileSpeed: 2.8 + curve.sector * 0.15, burstCount: 1 } : {}),
      }],
      formationBehavior: { entryPathId: `revamp-${entry}`, movementId: 'revamp-breathe',
        attackId: escort ? 'revamp-escort' : 'revamp-dive', firingBehavior: pack.firingBehavior,
        returnId: 'reform', holdSeconds: roundCurve(Math.max(1.6, 3.2 - (curve.slot - 1) * 0.14 - waveIndex * 0.08)),
        telegraphSeconds: 0.8, attackDurationSeconds: 3.4, recoverySeconds: 2.2,
        attackGroupSize: escort ? 3 : 1, attackCycles: role.characteristic === 'diver' ? 3 : 0,
      },
    };
  }

  function wave(level, index, rhythm, events, duration = 24) {
    const usedRoles = [...new Set(events.filter((event) => event.kind === 'spawn').flatMap((event) => event.enemies.map((enemy) => enemy.roleId)))];
    const formationPackIds = usedRoles.map((id) => packsByRole.get(id).id);
    const declaredCost = formationPackIds.reduce((sum, id) => sum + campaign.formationPacks.find((pack) => pack.id === id).totalThreatCost, 0);
    return {
      id: `${level.id}-revamp-wave-${index + 1}`, name: ['FIRST CONTACT', 'BREAK FORMATION', 'CROSSING LANES', 'PRESS THE ATTACK', 'CATCH YOUR BREATH', 'CLEAR SKIES'][index % 6],
      order: index + 1, accent: level.waves[0]?.accent ?? '#67e8f9', backgroundId: level.backgroundId,
      completionRule: 'clear-after-duration', difficultyMultiplier: 1, durationSeconds: duration,
      introSeconds: 0.25, delayAfterSeconds: 0, scoreMultiplier: level.waves[0]?.scoreMultiplier ?? 1,
      threatCap: Math.max(12, events.filter(event => event.kind === 'spawn').reduce((sum, event) => sum + event.count, 0) + 2,
        Math.ceil(waveThreat(events, campaign.enemyRoles) + 3)),
      combatBudget: Math.ceil(Math.max(declaredCost, waveThreat(events, campaign.enemyRoles)) + 2),
      rhythm, formationPackIds, events,
    };
  }

  for (const level of campaign.levels.filter((level) => sectorIds.includes(level.campaignProgression.sectorId))) {
    const node = campaign.campaignGraph.nodes.find((node) => node.missionDefinitionId === level.id);
    const depth = node.depth;
    level.__depth = depth;
    const curve = missionCurve(depth);
    const originalBoss = level.waves.flatMap((wave) => wave.events).find((event) => event.kind === 'boss');
    const available = newRoles.filter((role) => role.introductionSector < curve.sector
      || (role.introductionSector === curve.sector && role.introductionMission <= curve.slot));
    const newest = available.at(-1);
    const own = (suffix) => `${level.id}-revamp-${suffix}`;
    let waves;
    // REVAMP(I): A squadron is a full breathing grid plus two named specials. Four
    // short combat beats replace six tiny packs; boss lead-ins reserve time for the fight.
    const major = level.campaignProgression.missionRole === 'major-boss';
    const hasMini = Boolean(originalBoss) && !major;
    const formationCount = major || depth === 1 || hasMini ? 2 : 3;
    const factors = formationCount === 2 ? [0.9, 1.1]
      : formationCount === 3 ? [0.9, 1.1, 1] : [0.9, 1.05, 0.85, 1.2];
    waves = factors.map((factor, index) => {
      const total = Math.min(40, 30 + (curve.slot >= 3 || !node.mainPath ? 2 : 0) + (index === 3 ? 2 : 0));
      const special = index % 2 === 0 ? newest : available[Math.max(0, (index + curve.slot - 1) % available.length)];
      const specialCount = 2;
      const regularCount = total - specialCount;
      const targetThreat = curve.threat * factor;
      const cadence = roundCurve(CURVE.referenceFireIntervalSeconds * (regularCount + specialCount * special.threatCost) / targetThreat, 5);
      const entry = ['swoop', 'loop', 's-curve', 'pincer'][(index + curve.slot - 1) % 4];
      const regular = spawn(level, own(`wave-${index + 1}-grid`), linefighter, targetThreat, index, 0, regularCount);
      regular.count = regularCount;
      regular.patternId = 'grid';
      regular.durationSeconds = 9;
      regular.spawnIntervalSeconds = 0.1333333333;
      regular.formationSlots = Array.from({ length: regularCount }, (_, slot) => ({
        x: 0.16 + (slot % 6) * 0.136,
        y: 0.145 + Math.floor(slot / 6) * 0.054,
      }));
      regular.enemies[0].sizeMultiplier = 0.68;
      regular.enemies[0].health = roundCurve(curve.expectedDps * 0.4);
      regular.enemies[0].attackIntervalSeconds = cadence;
      regular.enemies[0].projectileSpeed = roundCurve(1.75 + (depth - 1) * 0.065);
      regular.enemies[0].powerupDropChance = 0.012;
      regular.formationBehavior = { ...regular.formationBehavior,
        entryPathId: `revamp-${entry}`, firingBehavior: 'post-formation',
        holdSeconds: 0.9, attackGroupSize: 2, recoverySeconds: 1.2, attackCycles: 0,
      };
      const support = spawn(level, own(`wave-${index + 1}-divers`), special, targetThreat, index, 0.4, specialCount);
      support.count = specialCount;
      support.patternId = 'grid';
      support.spawnIntervalSeconds = 0.24;
      support.formationSlots = [{ x: 0.37, y: 0.105 }, { x: 0.63, y: 0.105 }];
      support.enemies[0].sizeMultiplier = 0.72;
      support.enemies[0].attackIntervalSeconds = cadence;
      support.enemies[0].projectileSpeed = regular.enemies[0].projectileSpeed;
      support.formationBehavior.holdSeconds = 1.0;
      support.formationBehavior.attackGroupSize = specialCount;
      support.formationBehavior.entryPathId = `revamp-${entry}`;
      const events = [regular, support];
      events.push(powerup(own(index === 0 ? 'power-six-seconds' : `power-wave-${index + 1}`), index === 0 ? 6 : 1, 'projectile-upgrade'));
      if (index === 1) events.push(powerup(own('magnet-eighteen-seconds'), 3, 'magnet'));
      const entryWave = wave(level, index, ['introduce', 'variation', 'recovery', 'peak'][index], events, 18);
      entryWave.introSeconds = index === 0 ? 0 : 0.65;
      return entryWave;
    });
    if (originalBoss || depth === 1) {
      const boss = clone(originalBoss ?? miniTemplate);
      boss.id = major ? `${level.id}-major-boss` : own(depth === 1 ? 'peer-reviewer' : 'checkpoint');
      boss.startSeconds = 0;
      if (depth === 1) {
        Object.assign(boss, { label: 'PEER REVIEWER', durationSeconds: 20, warningSeconds: 1.2,
          blocksWaveClock: false, health: 110, speed: 1.2, shieldCount: 1, damage: 1, scoreReward: 450,
          weapons: [{ id: 'peer-reviewer-shot', weaponId: 'aimed-shot', attackIntervalSeconds: 3.8, damage: 1, projectileSpeed: 2.7, burstCount: 1 }],
          phases: [{ id: 'peer-reviewer-standard', label: 'Read the telegraph', triggerHealthRatio: 1,
            movementPatternId: 'track-player', speedMultiplier: 1, weaponSettingIds: ['peer-reviewer-shot'] }],
        });
      } else if (major && curve.sector === 1) {
        boss.health = CAMPAIGN_BOSS_ECONOMY_BY_MISSION[5].hullHealth;
        boss.componentHealth = clone(CAMPAIGN_BOSS_ECONOMY_BY_MISSION[5].componentHealth);
      } else if (!major) {
        boss.health = Math.round(curve.expectedDps * 15);
        boss.warningSeconds = Math.max(1.2, boss.warningSeconds);
      }
      const bossWave = wave(level, waves.length, 'boss', [boss], major ? 45 : 22);
      bossWave.id = `${level.id}-revamp-boss-wave`;
      bossWave.name = boss.label;
      bossWave.completionRule = major ? 'boss-defeat' : 'clear-after-duration';
      bossWave.combatBudget = Math.max(24, Math.ceil(curve.threat * 3));
      bossWave.introSeconds = 0.7;
      waves.push(bossWave);
    }
    level.description = 'Mirrored squadrons sweep into a breathing grid, trade slow readable fire, and peel into announced dives before the command encounter.';
    waves.forEach((entry, index) => { entry.order = index + 1; });
    level.waves = waves;
    level.loopWaves = false;
    level.startingDifficulty = 1;
    level.durationSeconds = null;
    level.campaignProgression.combatBudget = Math.max(...waves.map((wave) => wave.combatBudget));
    level.campaignProgression.recommendedPower = curve.recommendedPower;
    level.campaignProgression.testedLoadouts = {
      lowPower: 'Curve estimate: 80% expected DPS; no paid upgrades assumed',
      expectedPower: 'Curve estimate: base gun plus earned projectile pickups; 0.48–1.10 s regular TTK; 30–34 hull formations',
      upgraded: 'Curve estimate: 125% expected DPS; convenience upgrades optional',
    };
    node.recommendedPower = clone(curve.recommendedPower);
    node.routeSummary.estimatedWaveCount = waves.length;
    if (depth === 1) {
      node.miniBossIds = ['bottleneck-drone'];
      node.routeSummary.miniBossPresence = 'required';
    }
    delete level.__depth;
  }
  campaign.revision = Math.max(source.revision, 25);
  campaign.updatedAt = '2026-10-17T00:00:00.000Z';
  return campaign;
}

/** Refresh only generated events; discard obsolete first-three-sector escalation keys. */
export function authorEscalationBase(campaign, source) {
  const firstSectorIds = new Set(campaign.sectors.slice(0, 3).map((sector) => sector.id));
  const levels = campaign.levels.filter((level) => firstSectorIds.has(level.campaignProgression.sectorId));
  const missionIds = new Set(levels.map((level) => level.id));
  const result = Object.fromEntries(Object.entries(source).filter(([key]) => !missionIds.has(key.split('/')[0])));
  for (const level of levels) for (const wave of level.waves) for (const event of wave.events) {
    if (event.kind === 'spawn') result[`${level.id}/${wave.id}/${event.id}`] = event.count;
  }
  return result;
}
