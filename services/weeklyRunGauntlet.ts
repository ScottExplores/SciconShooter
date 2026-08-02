import type { GameCampaignConfig, LevelDefinition } from '../game-config/types';
import { DEFAULT_GAME_CAMPAIGN, cloneGameCampaign } from './levelConfig';

/**
 * Weekly Run is one long continuous mission that runs the player through every
 * production-ready boss, with the authored formation waves and elite
 * encounters between them acting as the connective tissue.
 *
 * It deliberately reuses the Campaign's authored levels rather than duplicating
 * bosses or enemy controllers: the gauntlet is an *ordering* of existing
 * content. Adding a new production-ready boss to the run means adding its
 * sector to WEEKLY_RUN_SECTOR_ORDER, not touching this controller.
 */

export const WEEKLY_RUN_STARTING_LIVES = 10;

/**
 * Sector order for the run. Each sector contributes its authored ramp — an
 * elite checkpoint, a boss-preparation mission, then the sector's major boss —
 * so difficulty escalates while the player still gets transition beats.
 *
 * `sector-terminus` and `sector-crownclaw-frontier` share `frontier-crownclaw`
 * as their major boss, so only the later one is used; a gauntlet that fought
 * the same boss twice would read as a bug.
 */
export const WEEKLY_RUN_SECTOR_ORDER: readonly string[] = Object.freeze([
  'sector-open-orbit',
  'sector-redline',
  'sector-gravity',
  'sector-prism-expanse',
  'sector-rail-meridian',
  'sector-singularity-reach',
  'sector-gyroscope-array',
  'sector-hammerhead-line',
  'sector-crownclaw-frontier'
]);

/**
 * Mission roles pulled into each sector's leg of the run, in play order.
 *
 * Introduction and formation-remix missions are skipped: they exist in Campaign
 * to teach a sector, and repeating that teaching nine times is exactly the
 * filler the run is supposed to avoid.
 */
export const WEEKLY_RUN_MISSION_ROLES: readonly string[] = Object.freeze([
  'elite-checkpoint',
  'boss-preparation',
  'major-boss'
]);

export interface WeeklyRunSector {
  readonly sectorId: string;
  readonly index: number;
  readonly majorBossId: string;
  readonly missionIds: readonly string[];
}

export interface WeeklyRunRoute {
  readonly sectors: readonly WeeklyRunSector[];
  readonly levelIds: readonly string[];
  readonly bossIds: readonly string[];
}

const missionRoleOf = (level: LevelDefinition) => level.campaignProgression?.missionRole;

/**
 * Resolves the ordered mission route for the run from a campaign definition.
 * Sectors or roles that are not present are skipped rather than throwing, so a
 * partially authored campaign still produces a playable run.
 */
export const buildWeeklyRunRoute = (
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  sectorOrder: readonly string[] = WEEKLY_RUN_SECTOR_ORDER
): WeeklyRunRoute => {
  const sectors: WeeklyRunSector[] = [];
  const levelIds: string[] = [];
  const bossIds: string[] = [];

  sectorOrder.forEach((sectorId) => {
    const sector = campaign.sectors.find((candidate) => candidate.id === sectorId);
    if (!sector) return;

    const sectorLevels = sector.missionIds
      .map((missionId) => campaign.levels.find((level) => level.id === missionId))
      .filter((level): level is LevelDefinition => Boolean(level));

    const missionIds = WEEKLY_RUN_MISSION_ROLES.flatMap((role) => (
      sectorLevels.filter((level) => missionRoleOf(level) === role).map((level) => level.id)
    ));
    if (missionIds.length === 0) return;

    sectors.push({
      sectorId,
      index: sectors.length,
      majorBossId: sector.majorBossId,
      missionIds
    });
    levelIds.push(...missionIds);
    if (sector.majorBossId) bossIds.push(sector.majorBossId);
  });

  return {
    sectors: Object.freeze(sectors),
    levelIds: Object.freeze(levelIds),
    bossIds: Object.freeze(bossIds)
  };
};

/**
 * Whether a Mission is the Sector boss on the Weekly Run route. Graph nodes
 * carry no encounter kind, so the role has to come from the route itself:
 * WEEKLY_RUN_MISSION_ROLES puts 'major-boss' last in every Sector.
 */
export const isWeeklyRunBossMission = (
  missionId: string | null | undefined,
  route: WeeklyRunRoute = buildWeeklyRunRoute()
): boolean => {
  if (!missionId) return false;
  return route.sectors.some((sector) => sector.missionIds.at(-1) === missionId);
};

/**
 * The 1-based Sector a Weekly Run Mission belongs to, or 0 when the Mission is
 * not on the route. Achievements report depth in Sectors because that is what
 * the run screen shows the player, not raw Mission counts.
 */
export const getWeeklyRunSectorNumber = (
  missionId: string | null | undefined,
  route: WeeklyRunRoute = buildWeeklyRunRoute()
): number => {
  if (!missionId) return 0;
  const sector = route.sectors.find((candidate) => candidate.missionIds.includes(missionId));
  return sector ? sector.index + 1 : 0;
};

/**
 * Builds the campaign the engine actually runs for a Weekly Run: the same
 * authored levels, filtered and reordered into the gauntlet route.
 *
 * The engine advances through `levels` by `order`, so the route order is
 * written back onto each level. That makes the whole run one continuous
 * mission from the engine's point of view — clearing a boss rolls straight
 * into the next sector instead of returning to the home screen.
 */
export const buildWeeklyRunCampaign = (
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  sectorOrder: readonly string[] = WEEKLY_RUN_SECTOR_ORDER
): GameCampaignConfig => {
  const route = buildWeeklyRunRoute(campaign, sectorOrder);
  const clone = cloneGameCampaign(campaign);
  const byId = new Map(clone.levels.map((level) => [level.id, level]));

  const orderedLevels = route.levelIds
    .map((levelId) => byId.get(levelId))
    .filter((level): level is LevelDefinition => Boolean(level))
    .map((level, index) => ({ ...level, order: index }));

  return { ...clone, levels: orderedLevels };
};

/** First mission of the run, used as the engine's entry point. */
export const getWeeklyRunEntryPoint = (
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  sectorOrder: readonly string[] = WEEKLY_RUN_SECTOR_ORDER
) => {
  const runCampaign = buildWeeklyRunCampaign(campaign, sectorOrder);
  const first = runCampaign.levels[0];
  if (!first) return null;
  return { levelId: first.id, waveId: first.waves[0]?.id ?? null };
};

/** Which sector a given mission belongs to, for run progress reporting. */
export const getWeeklyRunSectorForMission = (
  missionId: string,
  route: WeeklyRunRoute
): WeeklyRunSector | null => (
  route.sectors.find((sector) => sector.missionIds.includes(missionId)) ?? null
);
