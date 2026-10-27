import { PowerupType, type Stats } from '../types';
import type { SpawnEvent, WaveEvent } from '../game-config/types';
import { cloneGameCampaign, DEFAULT_GAME_CAMPAIGN } from './levelConfig';
import { MINI_SHIP_BY_ID, type MiniShipId, type RuntimeSquadLoadout } from './squadProgression';
import { getMiniShipDamageMultiplier, getMiniShipFireIntervalFrames, getMiniShipVolleySize } from './miniShipCombatProgression';
import type { PlayerShipId } from './playerShipService';
import { isMajorBossId } from '../game-config/catalog';

/** Memory-only equipment: never call profile, purchase, receipt or wallet APIs. */
export const createCombatLabLoadout = (
  ship: PlayerShipId, fireRate: number, ability: number, speed: number,
  supports: readonly (MiniShipId | '')[], supportLevel: number
): RuntimeSquadLoadout => ({
  profileId: 'local-combat-lab', weekKey: 'practice', mainShipId: ship,
  upgrades: { fireRate, ability, speed, startingHearts: 7 },
  companions: supports.flatMap((id, index) => {
    if (!id) return [];
    const entry = MINI_SHIP_BY_ID[id];
    const level = Math.max(1, Math.min(5, supportLevel));
    return [{ ...entry, slot: index === 0 ? 'left' as const : 'right' as const, level,
      fireIntervalFrames: getMiniShipFireIntervalFrames(entry.fireIntervalFrames, level),
      projectileDamage: entry.projectileDamage * getMiniShipDamageMultiplier(level),
      volleySize: getMiniShipVolleySize(entry.ability, level) }];
  })
});

export const createCombatLabStats = (): Stats => ({
  score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
  bombs: 3, bombCharge: 100, bombChargeMax: 100, lives: 10, repairsCount: 0,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960,
  upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: Object.fromEntries(Object.values(PowerupType).map(type => [type, 0])) as Stats['powerupUses'],
  bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100
});

export const COMBAT_LAB_HULLS = {
  researchhub: { title: 'RSC', role: 'Precision pulse', color: '#67e8f9', detail: 'Your familiar tight pulse column. The reference for comparing every other hull.' },
  bio: { title: 'NIH', role: 'Twin plasma rails', color: '#67e8f9', detail: 'Paired cyan energy bolts with living-energy wakes. Pierces at tier 4; Pathfinder Lance delivers a piercing corridor strike.' },
  eth: { title: 'ETH', role: 'Prism fan', color: '#c4b5fd', detail: 'Three crystal lanes catch crossing swarms. Prism Volley releases a wider shattering fan.' },
  btc: { title: 'BTC', role: 'Heavy penetrator', color: '#fbbf24', detail: 'Slower gold penetrators punch through targets. Hash Burst is your concentrated siege strike.' }
} as const;

/** An authored remix using the real campaign schema, formations and bosses. */
export const createCombatLabCampaign = () => {
  const campaign = cloneGameCampaign();
  const level = campaign.levels[0];
  const template = level.waves[0].events.find((event): event is SpawnEvent => event.kind === 'spawn')!;
  campaign.enemyRoles.push({ ...structuredClone(campaign.enemyRoles.find(role => role.id === 'role-orbit-scout')!),
    id: 'lab-neon-interceptor', label: 'Neon interceptor', fireBehavior: 'post-formation',
    threatCost: 2, fireDelaySeconds: 0.7, maximumSimultaneousCount: 12 });
  campaign.enemyRoles.push({ ...structuredClone(campaign.enemyRoles.find(role => role.id === 'role-jet-scout')!),
    id: 'lab-crosscut-flanker', label: 'Crosscut flanker', introductionSector: 1, introductionMission: 1 });
  const events = DEFAULT_GAME_CAMPAIGN.levels.flatMap(level => level.waves.flatMap(wave => wave.events));
  const elite = events.find(event => event.kind === 'boss' && !isMajorBossId(event.bossId));
  const boss = events.find(event => event.kind === 'boss' && isMajorBossId(event.bossId));
  const names = ['RIBBON INTERCEPT', 'MIRRORED CROSSFIRE', 'SALVAGE WINDOW', 'ELITE BREAKER', 'PRISM CAROUSEL', 'GATEKEEPER'];
  const patterns = ['snake', 'double-v', 'diamond', 'crescent', 'ring', 'v'] as const;
  const paths = ['serpentine-weave', 'mirrored-swoop', 'diamond-lock', 'paired-flank', 'ring-assemble', 'loop-the-loop'] as const;
  level.name = 'NEON BREAKWATER';
  level.description = 'Local combat evolution showcase. No progression or competitive rewards.';
  level.startingDifficulty = 1;
  level.waves.forEach((wave, index) => {
    const i = index % names.length;
    wave.name = names[i];
    wave.introSeconds = index === 0 ? 1 : 0.3;
    wave.delayAfterSeconds = 0.25;
    wave.durationSeconds = i === 3 || i === 5 ? 22 : 12;
    wave.threatCap = 40;
    wave.combatBudget = Math.max(wave.combatBudget, 40);
    wave.formationPackIds = [];
    const spawn: SpawnEvent = {
      ...structuredClone(template), id: `${wave.id}-lab-ribbon`, label: names[i],
      startSeconds: 0, durationSeconds: 9, count: i === 2 ? 6 : 12,
      patternId: patterns[i], spawnIntervalSeconds: 0.13,
      formationBehavior: {
        entryPathId: paths[i], movementId: i === 4 ? 'rotating-wheel' : 'lateral-sweep',
        attackId: i === 1 ? 'pincer-pass' : i === 2 ? 'leader-escorts' : i === 4 ? 'ring-collapse' : 'paired-dive',
        firingBehavior: 'post-formation', returnId: 'reform', holdSeconds: 1.2,
        telegraphSeconds: 0.8, attackDurationSeconds: 1.4,
        recoverySeconds: 0.6, attackGroupSize: i === 4 ? 3 : 2, attackCycles: 3
      },
      enemies: template.enemies.map(enemy => ({ ...enemy, health: 7, speed: 2.7,
        roleId: i === 0 ? 'role-orbit-scout' : 'lab-neon-interceptor',
        spriteKey: i % 2 ? 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES' : 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES',
        attackIntervalSeconds: 2.8, projectileSpeed: 3.8, scoreValue: 30, powerupDropChance: 0.08 }))
    };
    const authored: WaveEvent[] = [spawn];
    if (i === 0 || i === 1 || i === 4) authored.push({
      ...structuredClone(spawn), id: `${wave.id}-lab-echo`, startSeconds: 5.5, durationSeconds: 6.5,
      count: 8, patternId: i === 4 ? 'crescent' : 'arc',
      formationBehavior: { ...spawn.formationBehavior, entryPathId: 'paired-flank', attackId: 'sweep-strafe' },
      enemies: spawn.enemies.map(enemy => ({ ...enemy, roleId: 'lab-crosscut-flanker',
        spriteKey: 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES', health: 9 }))
    });
    if (i === 2) authored.push({ id: `${wave.id}-lab-salvage`, kind: 'recovery',
      label: 'Salvage drone trial', startSeconds: 2, durationSeconds: 4,
      delayAfterSeconds: 0, blocksWaveClock: false, positionId: 'random-top', coinCount: 18, powerupIds: ['projectile-upgrade'] });
    const encounter = i === 3 ? elite : i === 5 ? boss : null;
    if (encounter) {
      authored.length = 0;
      authored.push({ ...structuredClone(encounter), id: `${wave.id}-lab-encounter`, startSeconds: 0 });
      wave.completionRule = i === 5 ? 'boss-defeat' : 'clear-after-duration';
      wave.durationSeconds = 3;
    }
    wave.events = authored;
    for (const event of authored) {
      if (event.kind !== 'spawn') continue;
      const packId = `lab-${event.id}`;
      const roleId = event.enemies[0].roleId!;
      const role = campaign.enemyRoles.find(role => role.id === roleId)!;
      campaign.formationPacks.push({ ...structuredClone(campaign.formationPacks[0]),
        id: packId, label: event.label, enemyCount: event.count,
        totalThreatCost: event.count * role.threatCost, formationShape: event.patternId,
        entryDirection: event.formationBehavior?.entryPathId === 'serpentine-weave' ? 'left'
          : event.formationBehavior?.entryPathId === 'ring-assemble' ? 'right' : 'split',
        entryPath: event.formationBehavior?.entryPathId ?? 'formation-drop',
        enemyRoleIds: [roleId] });
      wave.formationPackIds.push(packId);
    }
  });
  level.durationSeconds = level.waves.reduce((sum, wave) => sum + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds, 0);
  return campaign;
};

export const COMBAT_LAB_ENCOUNTERS = DEFAULT_GAME_CAMPAIGN.levels.flatMap(level => level.waves.flatMap(wave => {
  const encounter = wave.events.find(event => event.kind === 'boss');
  return encounter ? [{ id: wave.id, levelId: level.id, waveId: wave.id,
    label: `${isMajorBossId(encounter.bossId) ? 'Boss' : 'Elite'} · ${encounter.label}`, eventId: encounter.id }] : [];
}));
