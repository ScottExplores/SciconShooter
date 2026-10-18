import { PowerupType, type Stats } from '../types';
import type { SpawnEvent, WaveEvent } from '../game-config/types';
import { cloneGameCampaign } from './levelConfig';
import { resolveCampaignFormationPackForSpawn } from './campaignFormationBudget';
import { buildRuntimeSquadLoadout, type MiniShipId, type WeeklySquadState } from './squadProgression';
import type { PlayerShipId } from './playerShipService';

/** A private loadout copy: previewing locked ships must never grant ownership. */
export const createSupportPreviewLoadout = (
  state: WeeklySquadState, mainShipId: PlayerShipId, miniId: MiniShipId, level: number
) => buildRuntimeSquadLoadout({
  ...state,
  profileId: 'support-preview',
  weekKey: 'practice',
  unlockedSlots: { left: true, right: false },
  equipped: { left: miniId, right: null },
  ownedMiniShips: { [miniId]: Math.max(1, Math.min(5, Math.floor(level) || 1)) },
  shipUpgrades: {
    ...state.shipUpgrades,
    [mainShipId]: { fireRate: 0, speed: 0, ability: 0, startingHearts: 0 }
  }
}, mainShipId);

export const createSupportPreviewStats = (): Stats => ({
  score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
  bombs: 0, bombCharge: 0, bombChargeMax: 100, lives: 10, repairsCount: 0,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960,
  upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: Object.fromEntries(Object.values(PowerupType).map(type => [type, 0])) as Stats['powerupUses'],
  bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100
});

/** Real enemies, bullets and pickups let gunner, collector and guard roles show their jobs. */
export const createSupportPreviewCampaign = () => {
  const campaign = cloneGameCampaign();
  const level = campaign.levels[0];
  const wave = level.waves[0];
  const template = wave.events.find((event): event is SpawnEvent => event.kind === 'spawn');
  if (!template) throw new Error('Support preview requires an opening formation.');
  // The real first-mission scouts are intentionally harmless. This private
  // copy needs slow incoming fire so defensive support can demonstrate catches.
  for (const enemy of template.enemies) {
    const role = campaign.enemyRoles.find(role => role.id === enemy.roleId);
    if (role) { role.fireBehavior = 'post-formation'; role.fireDelaySeconds = 0.5; }
  }
  // REVAMP(G): Preview repeats only its chosen target cohort; inherited packs
  // for other opening encounters would leave invalid, unused declarations.
  const templatePack = resolveCampaignFormationPackForSpawn(template,
    campaign.formationPacks.filter(pack => wave.formationPackIds.includes(pack.id)));
  if (!templatePack) throw new Error('Support preview requires a declared target formation pack.');
  wave.formationPackIds = [templatePack.id];
  templatePack.firingBehavior = 'post-formation';
  const events: WaveEvent[] = [];
  for (let index = 0; index < 5; index += 1) {
    events.push({
      ...structuredClone(template), id: `support-targets-${index}`, startSeconds: index * 5,
      durationSeconds: 4, spawnIntervalSeconds: 0.35,
      formationBehavior: { ...template.formationBehavior, firingBehavior: 'post-formation' },
      enemies: template.enemies.map(enemy => ({ ...enemy, health: 12, powerupDropChance: 0,
        attackIntervalSeconds: 1.2, projectileSpeed: 2.3 }))
    });
    events.push({
      id: `support-salvage-${index}`, kind: 'recovery', label: 'Practice Tokens',
      startSeconds: index * 5 + 2, durationSeconds: 1, delayAfterSeconds: 0,
      blocksWaveClock: false, positionId: 'random-top', coinCount: 8, powerupIds: []
    });
  }
  wave.name = 'SUPPORT FLIGHT';
  wave.introSeconds = 0;
  wave.durationSeconds = 30;
  wave.completionRule = 'clear-after-duration';
  wave.events = events;
  return campaign;
};
