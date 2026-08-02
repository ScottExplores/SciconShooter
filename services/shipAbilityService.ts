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

/**
 * Signature cooldowns form the ship ladder.
 *
 * Every ship previously shared the ResearchHub cooldown, so a hard-won BTC
 * hull felt no better to fly than the starter. Rarer hulls now recharge
 * faster as well as hitting differently, which is what makes the Hangar
 * chase read as progression rather than a skin swap.
 */
export const SHIP_ABILITY_COOLDOWN_SECONDS = Object.freeze({
  researchhub: RESEARCH_CHARGE_COOLDOWN_SECONDS,
  bio: 13,
  eth: 11,
  btc: 9
});

/**
 * Fire Rate also tightens the signature cooldown, up to this fraction, so the
 * primary-weapon track the player is already buying visibly improves the
 * ship's signature move too.
 */
export const SHIP_ABILITY_COOLDOWN_MIN_MULTIPLIER = 0.65;

/**
 * Signature-move scaling from the Hangar's Signature Move track.
 *
 * Damage and reach are separated so blast abilities (Research Charge, Hash
 * Burst, which deal fixed area damage) and projectile abilities (Genome Lance,
 * Prism Volley) both improve in a way the player can feel. Reach grows more
 * slowly than damage so a maxed radius never trivialises positioning.
 */
export const SHIP_ABILITY_DAMAGE_PER_LEVEL = 0.28;
export const SHIP_ABILITY_RADIUS_PER_LEVEL = 0.11;

export const getShipAbilityDamageMultiplier = (abilityLevel: number) => (
  1 + Math.max(0, Math.min(SHIP_ABILITY_MAX_LEVEL, Math.floor(Number(abilityLevel) || 0)))
    * SHIP_ABILITY_DAMAGE_PER_LEVEL
);

export const getShipAbilityRadiusMultiplier = (abilityLevel: number) => (
  1 + Math.max(0, Math.min(SHIP_ABILITY_MAX_LEVEL, Math.floor(Number(abilityLevel) || 0)))
    * SHIP_ABILITY_RADIUS_PER_LEVEL
);

/** Mirrors MAIN_SHIP_ABILITY_MAX_LEVEL; kept here so the engine has no import cycle. */
export const SHIP_ABILITY_MAX_LEVEL = 5;

export const getShipAbilityCooldownFrames = (
  baseCooldownFrames: number,
  fireRateLevel: number,
  fireRateMaxLevel: number
) => {
  const safeMax = Math.max(1, Math.floor(Number(fireRateMaxLevel) || 1));
  const progress = Math.max(0, Math.min(1, (Number(fireRateLevel) || 0) / safeMax));
  const multiplier = 1 - (1 - SHIP_ABILITY_COOLDOWN_MIN_MULTIPLIER) * progress;
  return Math.max(1, Math.round(baseCooldownFrames * multiplier));
};

/**
 * BIO, ETH, and BTC borrowed their signature-move frames straight from the
 * *primary weapon* FX pack, so the move a player picked their hull for looked
 * exactly like their ordinary gun. Each now has its own art,
 * drawn on a grid matching the projectile the engine spawns for it:
 * a helix lance, a single crystal shard, and a hexagonal hash lattice.
 *
 * ResearchHub is unchanged -- RESEARCH_CHARGE_FRAME_URLS above already points
 * at dedicated hand-made art, so there is nothing to replace.
 *
 * Source: tools/generate-signature-move-fx.mjs (procedural, regenerable).
 */
const SIGNATURE_MOVE_FX_ROOT = '/game-art/generated/scicon-signature-move-fx-v1';
const SIGNATURE_MOVE_FRAME_COUNT = 6;
const getSignatureMoveFrames = (ship: 'researchhub' | 'bio' | 'eth' | 'btc') => (
  Array.from(
    { length: SIGNATURE_MOVE_FRAME_COUNT },
    (_, index) => `${SIGNATURE_MOVE_FX_ROOT}/${ship}/frame-${index + 1}.png`
  )
);

export const BIO_GENOME_LANCE_FRAME_URLS = getSignatureMoveFrames('bio');
export const ETH_PRISM_VOLLEY_FRAME_URLS = getSignatureMoveFrames('eth');
export const BTC_HASH_BURST_FRAME_URLS = getSignatureMoveFrames('btc');
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
    cooldownFrames: SHIP_ABILITY_COOLDOWN_SECONDS.bio * 60,
    cooldownSeconds: SHIP_ABILITY_COOLDOWN_SECONDS.bio,
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
    cooldownFrames: SHIP_ABILITY_COOLDOWN_SECONDS.eth * 60,
    cooldownSeconds: SHIP_ABILITY_COOLDOWN_SECONDS.eth,
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
    cooldownFrames: SHIP_ABILITY_COOLDOWN_SECONDS.btc * 60,
    cooldownSeconds: SHIP_ABILITY_COOLDOWN_SECONDS.btc,
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

