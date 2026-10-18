import type { GameCampaign } from '../../../game-config/types';

export const FIRST_FLIGHT_HINT_MS = 3_000;

/** Mission 1 only; an authored mini-boss/boss wave is quiet even before its warning. */
export function canShowFirstFlightHint(
  campaign: Pick<GameCampaign, 'levels' | 'sectors'>,
  missionId: string | undefined,
  waveId: string | undefined,
  bossActive: boolean
) {
  if (bossActive || !missionId || !waveId) return false;
  const firstMissionId = campaign.sectors[0]?.missionIds[0];
  if (missionId !== firstMissionId) return false;
  const wave = campaign.levels.find(level => level.id === missionId)?.waves.find(entry => entry.id === waveId);
  return Boolean(wave && !wave.events.some(event => event.kind === 'boss'));
}

export const isSteeringKey = (key: string) => /^(Arrow(?:Up|Down|Left|Right)|[wasd])$/i.test(key);
