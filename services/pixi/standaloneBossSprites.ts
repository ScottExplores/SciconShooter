import { ASSETS } from '../../constants';

const intactCampaignBossSprites = new Set<string>([
  ASSETS.CAMPAIGN_BOSS_HELIOS_CLAWCARRIER,
  ASSETS.CAMPAIGN_BOSS_MERIDIAN_HARROWER,
  ASSETS.CAMPAIGN_BOSS_CINDERJAW_SIEGE_BEETLE,
  ASSETS.CAMPAIGN_BOSS_VESPERGLASS_MOTHMOTHER
]);

/** Scott's intact boss paintings. The renderer must not lay another rig's pods on these. */
export const isIntactCampaignBossSprite = (spriteUrl: string | null | undefined) => (
  Boolean(spriteUrl && (
    spriteUrl.includes('/scicon-stage20-expansion-v1/bosses/')
    || intactCampaignBossSprites.has(spriteUrl)
  ))
);
