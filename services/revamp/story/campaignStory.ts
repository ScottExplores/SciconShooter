/** Narrative cues follow authored sector membership, including alternate routes. */
export type CampaignStoryKind = 'cold-open' | 'intro' | 'midpoint' | 'boss' | 'victory' | 'bridge';
export type CampaignStoryEvent = 'launch' | 'intro' | 'midpoint' | 'boss' | 'victory';

interface StoryCampaign {
  sectors: ReadonlyArray<{ id: string; order: number; missionIds: readonly string[] }>;
  levels: ReadonlyArray<{ id: string; order: number; campaignProgression?: { sectorId?: string } }>;
}

export interface CampaignStoryCue {
  sectorId: string;
  sectorNumber: number;
  missionId: string;
  kind: CampaignStoryKind;
}

export const getCampaignStoryCue = (
  campaign: StoryCampaign,
  missionId: string,
  event: CampaignStoryEvent = 'launch'
): CampaignStoryCue | null => {
  const mission = campaign.levels.find((level) => level.id === missionId);
  if (!mission) return null;
  const sector = campaign.sectors.find((entry) => entry.id === mission.campaignProgression?.sectorId)
    ?? campaign.sectors.find((entry) => entry.missionIds.includes(missionId));
  if (!sector) return null;
  const position = sector.missionIds.indexOf(missionId);
  const finalMission = position >= 0 && position === sector.missionIds.length - 1;
  if (event === 'victory' && !finalMission) return null;

  let kind: CampaignStoryKind = event === 'launch' ? 'bridge' : event;
  if (event === 'launch') {
    if (finalMission) kind = 'boss';
    else if (sector.order === 1 && position === 0) kind = 'cold-open';
    else if (position === 0 || (sector.order === 1 && position === 1)) kind = 'intro';
    else if (position < 0 || position === Math.floor(sector.missionIds.length / 2)) kind = 'midpoint';
  }
  return { sectorId: sector.id, sectorNumber: sector.order, missionId, kind };
};

/** Keep the overlay visible long enough to read without blocking ship controls. */
export const getInlineTransmissionDurationMs = (text: string): number => (
  Math.max(5200, Math.min(9000, text.trim().split(/\s+/).length * 260 + 1200))
);
