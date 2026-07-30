import React from 'react';

export type CampaignMapCelestialRole =
  | 'introduction'
  | 'formation-remix'
  | 'elite-checkpoint'
  | 'boss-preparation'
  | 'major-boss';

export const CAMPAIGN_MAP_CELESTIALS = Object.freeze({
  ocean: '/game-art/generated/ui/scicon-campaign-map-celestials-v1/campaign-ocean-world.png',
  crater: '/game-art/generated/ui/scicon-campaign-map-celestials-v1/campaign-crater-moon.png',
  ice: '/game-art/generated/ui/scicon-campaign-map-celestials-v1/campaign-ice-moon.png',
  ringed: '/game-art/generated/ui/scicon-campaign-map-celestials-v1/campaign-ringed-gas-dwarf.png'
} as const);

export type CampaignMapCelestialKind = keyof typeof CAMPAIGN_MAP_CELESTIALS;

export const getCampaignMapCelestialKind = (
  role: CampaignMapCelestialRole,
  missionNumber: number
): CampaignMapCelestialKind => {
  if (role === 'formation-remix') return missionNumber % 2 === 0 ? 'ice' : 'ringed';
  if (role === 'elite-checkpoint') return 'ringed';
  if (role === 'boss-preparation') return missionNumber % 2 === 0 ? 'crater' : 'ice';
  return missionNumber % 2 === 0 ? 'crater' : 'ocean';
};

export const getCampaignMapCelestialUrl = (
  role: CampaignMapCelestialRole,
  missionNumber: number
) => CAMPAIGN_MAP_CELESTIALS[getCampaignMapCelestialKind(role, missionNumber)];

interface CampaignMapCelestialProps {
  readonly role: CampaignMapCelestialRole;
  readonly missionNumber: number;
  readonly missionLabel: string;
  readonly className?: string;
}

const CampaignMapCelestial: React.FC<CampaignMapCelestialProps> = ({
  role,
  missionNumber,
  missionLabel,
  className = ''
}) => {
  const kind = getCampaignMapCelestialKind(role, missionNumber);
  return (
    <span
      className={`campaign-map-celestial ${className}`.trim()}
      data-celestial-kind={kind}
      aria-hidden="true"
    >
      <img
        className="campaign-map-celestial__sprite"
        src={CAMPAIGN_MAP_CELESTIALS[kind]}
        alt=""
        width={128}
        height={128}
        loading="eager"
        decoding="sync"
        draggable={false}
      />
      <span className="campaign-map-celestial__label">{missionLabel}</span>
    </span>
  );
};

export default CampaignMapCelestial;
