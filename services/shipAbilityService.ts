import type { PlayerShipId } from './playerShipService';

const LEGACY_WEAPON_FX_ROOT = '/game-art/legacy/weapon-fx';
const numberedFrameUrls = (root: string, prefix: string, count: number) => Object.freeze(
  Array.from({ length: count }, (_, index) => `${root}/${prefix}${index + 1}.png`)
);

export const RESEARCH_SPARK_FRAME_URLS = numberedFrameUrls(
  `${LEGACY_WEAPON_FX_ROOT}/research-spark`,
  'spark-preview',
  5
);
export const RESEARCH_BOLT_FRAME_URLS = numberedFrameUrls(
  `${LEGACY_WEAPON_FX_ROOT}/research-bolt`,
  'bolt',
  4
);
export const RESEARCH_CHARGED_FRAME_URLS = numberedFrameUrls(
  `${LEGACY_WEAPON_FX_ROOT}/research-charge`,
  'charged',
  6
);

export type ResearchSignatureProjectileTier = 'spark' | 'bolt' | 'charged';
export type ResearchSignatureImpactTier = 1 | 2 | 3 | 4;

export const RESEARCH_PROJECTILE_FRAME_URLS_BY_TIER: Readonly<
  Record<ResearchSignatureProjectileTier, readonly string[]>
> = Object.freeze({
  spark: RESEARCH_SPARK_FRAME_URLS,
  bolt: RESEARCH_BOLT_FRAME_URLS,
  charged: RESEARCH_CHARGED_FRAME_URLS
});

export const RESEARCH_IMPACT_FRAME_URLS_BY_TIER: Readonly<
  Record<ResearchSignatureImpactTier, readonly string[]>
> = Object.freeze({
  1: numberedFrameUrls(`${LEGACY_WEAPON_FX_ROOT}/research-impact/hits-1`, 'hits-1-', 5),
  2: numberedFrameUrls(`${LEGACY_WEAPON_FX_ROOT}/research-impact/hits-2`, 'hits-2-', 7),
  3: numberedFrameUrls(`${LEGACY_WEAPON_FX_ROOT}/research-impact/hits-3`, 'hits-3-', 5),
  4: numberedFrameUrls(`${LEGACY_WEAPON_FX_ROOT}/research-impact/hits-4`, 'hits-4-', 7)
});
export const RESEARCH_IMPACT_ALL_FRAME_URLS = Object.freeze([
  ...RESEARCH_IMPACT_FRAME_URLS_BY_TIER[1],
  ...RESEARCH_IMPACT_FRAME_URLS_BY_TIER[2],
  ...RESEARCH_IMPACT_FRAME_URLS_BY_TIER[3],
  ...RESEARCH_IMPACT_FRAME_URLS_BY_TIER[4]
]);

/** Backwards-compatible level-zero aliases while engine call sites migrate to the profile helper. */
export const RESEARCH_CHARGE_FRAME_URLS = RESEARCH_SPARK_FRAME_URLS;
export const RESEARCH_IMPACT_FRAME_URLS = RESEARCH_IMPACT_FRAME_URLS_BY_TIER[1];
export const RESEARCH_CHARGE_ICON_URL = RESEARCH_SPARK_FRAME_URLS[2];
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

/** The Signature Move track bottoms out at a 35% cooldown reduction. */
export const SHIP_ABILITY_COOLDOWN_MIN_MULTIPLIER = 0.65;

/**
 * Six upgrades preserve the former max balance while making every purchase
 * legible: four cooldown beats, three projectile identities, and four impact
 * sizes. Level zero is part of the table because it is the Hangar preview and
 * the unupgraded in-mission move.
 */
export const SHIP_ABILITY_MAX_LEVEL = 6;
export const SHIP_ABILITY_DAMAGE_MAX_MULTIPLIER = 2.4;
export const SHIP_ABILITY_RADIUS_MAX_MULTIPLIER = 1.55;
export const SHIP_ABILITY_DAMAGE_PER_LEVEL = (
  SHIP_ABILITY_DAMAGE_MAX_MULTIPLIER - 1
) / SHIP_ABILITY_MAX_LEVEL;
export const SHIP_ABILITY_RADIUS_PER_LEVEL = (
  SHIP_ABILITY_RADIUS_MAX_MULTIPLIER - 1
) / SHIP_ABILITY_MAX_LEVEL;

export const SHIP_ABILITY_COOLDOWN_STEP_BY_LEVEL = Object.freeze([
  0, 1, 1, 2, 2, 3, 4
] as const);
const SHIP_ABILITY_PROJECTILE_TIER_BY_LEVEL = Object.freeze([
  'spark', 'spark', 'bolt', 'bolt', 'charged', 'charged', 'charged'
] as const satisfies readonly ResearchSignatureProjectileTier[]);
const SHIP_ABILITY_IMPACT_TIER_BY_LEVEL = Object.freeze([
  1, 1, 2, 2, 3, 3, 4
] as const satisfies readonly ResearchSignatureImpactTier[]);
const SHIP_ABILITY_COOLDOWN_STEP_COUNT = 4;

export const normalizeShipAbilityLevel = (abilityLevel: number) => (
  Math.max(0, Math.min(SHIP_ABILITY_MAX_LEVEL, Math.floor(Number(abilityLevel) || 0)))
);

export const getShipAbilityDamageMultiplier = (abilityLevel: number) => (
  1 + normalizeShipAbilityLevel(abilityLevel) * SHIP_ABILITY_DAMAGE_PER_LEVEL
);

export const getShipAbilityRadiusMultiplier = (abilityLevel: number) => (
  1 + normalizeShipAbilityLevel(abilityLevel) * SHIP_ABILITY_RADIUS_PER_LEVEL
);

export const getShipAbilityCooldownMultiplier = (abilityLevel: number) => {
  const level = normalizeShipAbilityLevel(abilityLevel);
  const cooldownStep = SHIP_ABILITY_COOLDOWN_STEP_BY_LEVEL[level];
  const reductionProgress = cooldownStep / SHIP_ABILITY_COOLDOWN_STEP_COUNT;
  return 1 - (1 - SHIP_ABILITY_COOLDOWN_MIN_MULTIPLIER) * reductionProgress;
};

export const getShipAbilityCooldownFrames = (
  baseCooldownFrames: number,
  abilityLevel: number
) => {
  const safeBaseFrames = Math.max(1, Math.round(Number(baseCooldownFrames) || 1));
  return Math.max(1, Math.round(safeBaseFrames * getShipAbilityCooldownMultiplier(abilityLevel)));
};

export interface ShipAbilityUpgradeProfile {
  level: number;
  maxLevel: number;
  projectileTier: ResearchSignatureProjectileTier;
  projectileFrames: readonly string[];
  projectileIconUrl: string;
  impactTier: ResearchSignatureImpactTier;
  impactFrames: readonly string[];
  cooldownStep: number;
  cooldownMultiplier: number;
  damageMultiplier: number;
  radiusMultiplier: number;
}

/**
 * Authoritative pure profile for combat, HUD, and Hangar previews.
 *
 * L0 Spark/hit 1; L1 cooldown; L2 Bolt/hit 2; L3 cooldown;
 * L4 Charged/hit 3; L5 cooldown; L6 cooldown plus hit 4/max.
 */
export const getShipAbilityUpgradeProfile = (abilityLevel: number): ShipAbilityUpgradeProfile => {
  const level = normalizeShipAbilityLevel(abilityLevel);
  const projectileTier = SHIP_ABILITY_PROJECTILE_TIER_BY_LEVEL[level];
  const impactTier = SHIP_ABILITY_IMPACT_TIER_BY_LEVEL[level];
  const projectileFrames = RESEARCH_PROJECTILE_FRAME_URLS_BY_TIER[projectileTier];
  return Object.freeze({
    level,
    maxLevel: SHIP_ABILITY_MAX_LEVEL,
    projectileTier,
    projectileFrames,
    projectileIconUrl: projectileFrames[Math.floor(projectileFrames.length / 2)],
    impactTier,
    impactFrames: RESEARCH_IMPACT_FRAME_URLS_BY_TIER[impactTier],
    cooldownStep: SHIP_ABILITY_COOLDOWN_STEP_BY_LEVEL[level],
    cooldownMultiplier: getShipAbilityCooldownMultiplier(level),
    damageMultiplier: getShipAbilityDamageMultiplier(level),
    radiusMultiplier: getShipAbilityRadiusMultiplier(level)
  });
};

/**
 * BIO, ETH and BTC use animated energy sprites, not mechanical rocket shapes.
 * Their signatures retain the hull palette while size, pattern, trails and
 * impact behavior distinguish them from primary fire. RSC's CC0 ladder stays
 * unchanged. Source/provenance: docs/COMBAT_EVOLUTION_ART.md;
 * reproducible alpha extraction: tools/compile-combat-lab-art.mjs.
 */
const SIGNATURE_MOVE_FX_ROOT = '/game-art/generated/scicon-combat-evolution-v1';
const SIGNATURE_MOVE_FRAME_COUNT = 6;
const getSignatureMoveFrames = (ship: 'researchhub' | 'bio' | 'eth' | 'btc') => (
  Array.from(
    { length: SIGNATURE_MOVE_FRAME_COUNT },
    (_, index) => `${SIGNATURE_MOVE_FX_ROOT}/${ship}-${index + 1}.png`
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
  ...RESEARCH_SPARK_FRAME_URLS,
  ...RESEARCH_BOLT_FRAME_URLS,
  ...RESEARCH_CHARGED_FRAME_URLS,
  ...RESEARCH_IMPACT_ALL_FRAME_URLS,
  ...BIO_GENOME_LANCE_FRAME_URLS,
  ...ETH_PRISM_VOLLEY_FRAME_URLS,
  ...BTC_HASH_BURST_FRAME_URLS
];

export const getShipAbilityDefinition = (shipId: PlayerShipId) => SHIP_ABILITY_DEFINITIONS[shipId];

