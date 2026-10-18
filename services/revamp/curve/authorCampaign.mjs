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
  campaign.enemyRoles.push(...newRoles);
  const scout = campaign.enemyRoles.find((role) => role.id === 'role-orbit-scout');
  campaign.formationPacks = campaign.formationPacks.filter((pack) => !pack.id.startsWith('pack-revamp-'));
  const packRoles = [scout, ...newRoles];
  for (const [index, role] of packRoles.entries()) {
    const slug = index === 0 ? 'swoop' : REVAMP_ROSTER[index - 1][0];
    const [entry, shape, direction] = ENTRY_LIBRARY[index % ENTRY_LIBRARY.length];
    const escort = slug === 'escort';
    const count = escort ? 6 : Math.min(role.maximumSimultaneousCount, 6);
    campaign.formationPacks.push({
      id: packId(slug), label: `Revamp ${role.label}`, enemyRoleIds: [role.id], enemyCount: count,
      totalThreatCost: roundCurve(count * role.threatCost), entryDirection: direction,
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

  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
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
      threatCap: Math.max(12, Math.ceil(waveThreat(events, campaign.enemyRoles) + 3)),
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
    if (depth === 1) {
      const swoop = spawn(level, own('onboarding'), scout, 6, 0, 0, 6);
      swoop.formationBehavior.attackId = 'aimed-volley';
      const dive = spawn(level, own('divers'), rolesById.get(roleId('diver')), 10, 1, 10, 6);
      dive.formationBehavior.entryPathId = 'revamp-loop';
      dive.formationBehavior.holdSeconds = 0.9;
      const train = spawn(level, own('reinforcement-train'), rolesById.get(roleId('diver')), 8, 2, 20, 4);
      train.formationBehavior.entryPathId = 'revamp-train';
      train.formationBehavior.holdSeconds = 0.9;
      train.spawnIntervalSeconds = 0.26;
      const peer = { ...clone(miniTemplate), id: own('peer-reviewer'), label: 'PEER REVIEWER',
        startSeconds: 28.8, durationSeconds: 20, warningSeconds: 1.2, blocksWaveClock: false,
        health: 120, speed: 1.2, shieldCount: 1, damage: 1, scoreReward: 450,
        weapons: [{ id: 'peer-reviewer-shot', weaponId: 'aimed-shot', attackIntervalSeconds: 3.8, damage: 1, projectileSpeed: 2.7, burstCount: 1 }],
        phases: [{ id: 'peer-reviewer-standard', label: 'Read the telegraph', triggerHealthRatio: 1,
          movementPatternId: 'track-player', speedMultiplier: 1, weaponSettingIds: ['peer-reviewer-shot'] }],
      };
      waves = [wave(level, 0, 'introduce', [swoop, powerup(own('power-six-seconds'), 6, 'projectile-upgrade'), dive,
        powerup(own('magnet-eighteen-seconds'), 18, 'magnet'), train, peer], 50)];
      waves[0].name = 'FIRST FLIGHT';
      waves[0].introSeconds = 0;
      level.description = 'Swoop into action, collect power at six seconds, read the diving formation, then face the Peer Reviewer at thirty seconds.';
    } else {
      const major = level.campaignProgression.missionRole === 'major-boss';
      const factors = major ? [0.85, 1, 1.1, 0.8, 1.25] : [0.85, 1, 1.1, 1.25, 0.7, 1.1];
      waves = factors.map((factor, index) => {
        // One newly introduced idea, practiced twice; other waves remix already learned roles.
        const role = index === 1 || index === 3 ? newest : available[Math.max(0, (index + curve.slot - 1) % available.length)];
        const event = spawn(level, own(`wave-${index + 1}`), role, curve.threat * factor, index);
        const events = [event];
        if (index === 0 || index === 4) events.push(powerup(own(`power-${index + 1}`), 6, index === 4 ? 'magnet' : 'projectile-upgrade'));
        if (index === 4) events.push({ id: own('recovery'), kind: 'recovery', label: 'Breath and salvage', startSeconds: 8,
          durationSeconds: 3, delayAfterSeconds: 0, blocksWaveClock: false, positionId: 'center-top', coinCount: 8, powerupIds: ['shield'] });
        return wave(level, index, ['warm-up', 'introduce', 'variation', 'peak', 'recovery', 'clear'][index], events, depth <= 3 ? 19 : 24);
      });
      if (originalBoss) {
        const boss = clone(originalBoss);
        boss.startSeconds = 0;
        const index = major ? waves.length : 4;
        const bossWave = wave(level, index, 'boss', [boss], major ? 90 : 24);
        bossWave.id = `${level.id}-revamp-boss-wave`;
        bossWave.name = boss.label;
        bossWave.completionRule = major ? 'boss-defeat' : 'clear-after-duration';
        bossWave.combatBudget = Math.max(24, Math.ceil(curve.threat * 3));
        if (!major) {
          boss.health = Math.round(curve.expectedDps * 12);
          boss.warningSeconds = Math.max(1.2, boss.warningSeconds);
        }
        waves.splice(index, 0, bossWave);
      }
    }
    waves.forEach((entry, index) => { entry.order = index + 1; });
    level.waves = waves;
    level.loopWaves = false;
    level.startingDifficulty = 1;
    level.durationSeconds = null;
    level.campaignProgression.combatBudget = Math.max(...waves.map((wave) => wave.combatBudget));
    level.campaignProgression.recommendedPower = curve.recommendedPower;
    level.campaignProgression.testedLoadouts = {
      lowPower: 'Curve estimate: 80% expected DPS; no paid upgrades assumed',
      expectedPower: 'Curve estimate: base gun plus earned projectile pickups; 0.48–1.10 s regular TTK',
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
