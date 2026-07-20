import type { PlayerShipId } from './playerShipService';

export const RESEARCH_CHARGE_FRAME_URLS = Array.from(
  { length: 6 },
  (_, index) => `/game-art/legacy/weapon-fx/research-charge/charged${index + 1}.png`
);

export const RESEARCH_IMPACT_FRAME_URLS = Array.from(
  { length: 7 },
  (_, index) => `/game-art/legacy/weapon-fx/research-impact/hits-5-${index + 1}.png`
);

export const RESEARCH_CHARGE_ICON_URL = RESEARCH_CHARGE_FRAME_URLS[5];
export const RESEARCH_CHARGE_COOLDOWN_FRAMES = 16 * 60;
export const RESEARCH_CHARGE_COOLDOWN_SECONDS = 16;
export const RESEARCH_CHARGE_BLAST_RADIUS = 124;

const PLAYER_WEAPON_FX_ROOT = '/game-art/generated/scicon-player-weapon-fx-v1';
const getGalleryAbilityFrames = (ship: 'bio' | 'eth' | 'btc') => (
  Array.from({ length: 4 }, (_, index) => `${PLAYER_WEAPON_FX_ROOT}/${ship}/level-7/frame-${index + 1}.png`)
);

export const BIO_GENOME_LANCE_FRAME_URLS = getGalleryAbilityFrames('bio');
export const ETH_PRISM_VOLLEY_FRAME_URLS = getGalleryAbilityFrames('eth');
export const BTC_HASH_BURST_FRAME_URLS = getGalleryAbilityFrames('btc');
export const BTC_HASH_BURST_RADIUS = 96;

export type ShipAbilityKind =
  | 'research-charge'
  | 'bio-genome-lance'
  | 'eth-prism-volley'
  | 'btc-hash-burst';

export interface ShipAbilityDefinition {
  id: ShipAbilityKind;
  name: string;
  actionLabel: string;
  frames: readonly string[];
  iconUrl: string;
  iconRotationDegrees: number;
  cooldownFrames: number;
  cooldownSeconds: number;
  color: string;
  glow: string;
}

export const SHIP_ABILITY_DEFINITIONS: Readonly<Record<PlayerShipId, ShipAbilityDefinition>> = Object.freeze({
  researchhub: {
    id: 'research-charge',
    name: 'Research Charge',
    actionLabel: 'Launch ResearchHub charge',
    frames: RESEARCH_CHARGE_FRAME_URLS,
    iconUrl: RESEARCH_CHARGE_ICON_URL,
    iconRotationDegrees: -90,
    cooldownFrames: RESEARCH_CHARGE_COOLDOWN_FRAMES,
    cooldownSeconds: RESEARCH_CHARGE_COOLDOWN_SECONDS,
    color: '#67e8f9',
    glow: 'rgba(34,211,238,0.26)'
  },
  bio: {
    id: 'bio-genome-lance',
    name: 'Genome Lance',
    actionLabel: 'Fire BIO Genome Lance',
    frames: BIO_GENOME_LANCE_FRAME_URLS,
    iconUrl: BIO_GENOME_LANCE_FRAME_URLS[3],
    iconRotationDegrees: 0,
    cooldownFrames: RESEARCH_CHARGE_COOLDOWN_FRAMES,
    cooldownSeconds: RESEARCH_CHARGE_COOLDOWN_SECONDS,
    color: '#86efac',
    glow: 'rgba(74,222,128,0.3)'
  },
  eth: {
    id: 'eth-prism-volley',
    name: 'Prism Volley',
    actionLabel: 'Launch ETH Prism Volley',
    frames: ETH_PRISM_VOLLEY_FRAME_URLS,
    iconUrl: ETH_PRISM_VOLLEY_FRAME_URLS[3],
    iconRotationDegrees: 0,
    cooldownFrames: RESEARCH_CHARGE_COOLDOWN_FRAMES,
    cooldownSeconds: RESEARCH_CHARGE_COOLDOWN_SECONDS,
    color: '#c4b5fd',
    glow: 'rgba(167,139,250,0.3)'
  },
  btc: {
    id: 'btc-hash-burst',
    name: 'Hash Burst',
    actionLabel: 'Launch BTC Hash Burst',
    frames: BTC_HASH_BURST_FRAME_URLS,
    iconUrl: BTC_HASH_BURST_FRAME_URLS[3],
    iconRotationDegrees: 0,
    cooldownFrames: RESEARCH_CHARGE_COOLDOWN_FRAMES,
    cooldownSeconds: RESEARCH_CHARGE_COOLDOWN_SECONDS,
    color: '#facc15',
    glow: 'rgba(250,204,21,0.3)'
  }
});

export const SHIP_ABILITY_FRAME_URLS = [
  ...RESEARCH_CHARGE_FRAME_URLS,
  ...BIO_GENOME_LANCE_FRAME_URLS,
  ...ETH_PRISM_VOLLEY_FRAME_URLS,
  ...BTC_HASH_BURST_FRAME_URLS
];

export const getShipAbilityDefinition = (shipId: PlayerShipId) => SHIP_ABILITY_DEFINITIONS[shipId];

