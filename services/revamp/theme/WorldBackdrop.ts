import type { GameCampaign } from '../../../game-config/types';
import { hashBackdropSeed, resolveMissionBackdrop, type BackgroundTheme, type MissionBackdropSelection } from '../backgrounds/themes';
import { WEEKLY_THEME } from './WorldTheme';

const WEEKLY_BACKDROP: BackgroundTheme = Object.freeze({
  id: WEEKLY_THEME.id, sectorId: WEEKLY_THEME.sectorId, name: WEEKLY_THEME.name,
  palette: WEEKLY_THEME.palette, signature: 'rings', secondarySignature: 'archive',
  nebulaStyle: 'ribbon', debrisStyle: 'crystal',
});

/** Extend N's scenery to the ranked broadcast without altering its mission plan. */
export function resolveWorldBackdrop(campaign: GameCampaign, missionId: string | undefined): MissionBackdropSelection | null {
  if (!missionId) return null;
  const stage = /^weekly-run-stage-(\d+)$/.exec(missionId);
  if (!stage || !campaign.id.startsWith('weekly-run-')) return resolveMissionBackdrop(campaign, missionId);
  const missionIndex = Math.max(0, Number(stage[1]) - 1);
  return {
    theme: WEEKLY_BACKDROP, missionId, sectorId: WEEKLY_THEME.sectorId,
    missionIndex, sectorIndex: 0, seed: hashBackdropSeed(`${campaign.id}/${missionId}`),
    variant: missionIndex % 4, isBranch: false,
  };
}
