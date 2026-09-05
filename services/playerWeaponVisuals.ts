export type PlayerWeaponVisualFamily = 'research' | 'bio' | 'eth' | 'btc';

// Optical centers measured from the checked-in alpha silhouettes (threshold
// 32/255). The artwork's energy core shifts inside its 128px source cell;
// anchoring every frame at 0.5 made the gun wobble sideways over the hull.
const ENERGY_FRAME_CENTERS = {
  bio: [[76.5, 67], [74.5, 67.5], [68.5, 67], [61.5, 68]],
  eth: [[76.5, 65.5], [73.5, 64.5], [68, 65.5], [60.5, 66]],
  btc: [[77, 62], [73.5, 64.5], [68, 64.5], [60.5, 64.5]]
} as const;

export const getPlayerWeaponFrameAnchor = (family: PlayerWeaponVisualFamily, frame: number) => {
  if (family === 'research') return { x: 0.5, y: 0.5 };
  const point = ENERGY_FRAME_CENTERS[family][Math.max(0, Math.min(3, Math.floor(frame)))];
  return { x: point[0] / 128, y: point[1] / 128 };
};

export interface PlayerEnergyBoltPresentation {
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly color: string;
  readonly coreColor: string;
  readonly coreWidth: number;
  readonly coreHeight: number;
  readonly coreY: number;
  readonly wakeLength: number;
  readonly wakeWidth: number;
  readonly wakeStartY: number;
  readonly wakeAlpha: number;
}

const finiteNonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Reference-driven, render-only polish. Never use this slimmer silhouette to
 * alter collision geometry, the live muzzle, projectile speed or firing time. */
export const getPlayerEnergyBoltPresentation = (
  family: PlayerWeaponVisualFamily,
  level: number,
  ageFrames: number,
  speed: number,
  layout: { readonly width: number; readonly height: number }
): PlayerEnergyBoltPresentation | null => {
  if (family === 'research') return null;
  const tier = Math.min(5, finiteNonNegative(level));
  const heavy = family === 'btc';
  const spriteWidth = Math.min(heavy ? 22 : 20, Math.max(14, finiteNonNegative(layout.width) * (heavy ? 0.72 : 0.66)));
  const spriteHeight = Math.min(34, Math.max(22, finiteNonNegative(layout.height) * 0.82));
  return {
    spriteWidth, spriteHeight,
    color: family === 'bio' ? '#a6ff68' : family === 'eth' ? '#b9c7ff' : '#ffc75e',
    coreColor: family === 'bio' ? '#f3ffe8' : family === 'eth' ? '#f0f7ff' : '#fff8da',
    coreWidth: (heavy ? 1.4 : 1.1) + tier * 0.08,
    coreHeight: Math.min(13, spriteHeight * (heavy ? 0.36 : 0.4)),
    coreY: -spriteHeight * 0.08,
    wakeLength: Math.min(heavy ? 12 : 14,
      finiteNonNegative(ageFrames) * finiteNonNegative(speed) * 0.35),
    wakeWidth: (heavy ? 1.55 : 1.25) + tier * 0.05,
    wakeStartY: spriteHeight * 0.27,
    wakeAlpha: 0.38
  };
};

const PLAYER_WEAPON_FX_ROOT = '/game-art/generated/scicon-player-weapon-fx-v1';

const research = [
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-0/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-0/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-0/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-0/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-1/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-1/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-1/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-1/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-2/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-2/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-2/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-2/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-3/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-3/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-3/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-3/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-4/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-4/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-4/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-4/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-5/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-5/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-5/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-5/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-6/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-6/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-6/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-6/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/research/level-7/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-7/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-7/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/research/level-7/frame-4.png`]
] as const;

const bio = [
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-0/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-0/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-0/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-0/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-1/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-1/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-1/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-1/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-2/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-2/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-2/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-2/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-3/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-3/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-3/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-3/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-4/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-4/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-4/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-4/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-5/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-5/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-5/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-5/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-6/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-6/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-6/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-6/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/bio/level-7/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-7/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-7/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/bio/level-7/frame-4.png`]
] as const;

const eth = [
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-0/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-0/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-0/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-0/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-1/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-1/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-1/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-1/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-2/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-2/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-2/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-2/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-3/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-3/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-3/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-3/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-4/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-4/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-4/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-4/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-5/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-5/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-5/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-5/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-6/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-6/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-6/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-6/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/eth/level-7/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-7/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-7/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/eth/level-7/frame-4.png`]
] as const;

const btc = [
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-0/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-0/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-0/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-0/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-1/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-1/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-1/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-1/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-2/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-2/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-2/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-2/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-3/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-3/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-3/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-3/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-4/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-4/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-4/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-4/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-5/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-5/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-5/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-5/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-6/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-6/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-6/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-6/frame-4.png`],
  [`${PLAYER_WEAPON_FX_ROOT}/btc/level-7/frame-1.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-7/frame-2.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-7/frame-3.png`, `${PLAYER_WEAPON_FX_ROOT}/btc/level-7/frame-4.png`]
] as const;

const evolvedFrames = (family: 'bio' | 'eth' | 'btc', tiers: readonly (readonly string[])[]) => (
  // Every tier keeps the same clean energy-bolt silhouette. Strength is shown
  // by bounded scale, brighter wakes and animation, never by adding rocket fins.
  tiers.map(() => [1, 2, 3, 4].map(frame =>
    `/game-art/generated/scicon-combat-evolution-v1/${family}-${frame}.png`))
);
export const PLAYER_WEAPON_VISUALS = {
  research, bio: evolvedFrames('bio', bio), eth: evolvedFrames('eth', eth), btc: evolvedFrames('btc', btc)
} as const;

/** Original RSC launch family remains unchanged. */
export const UNIVERSAL_PLAYER_WEAPON_FRAMES = research[0];
/** BIO's half-strength twin rails use the checked-in green launch family. */
export const BIO_PRIMARY_PLAYER_WEAPON_FRAMES = PLAYER_WEAPON_VISUALS.bio[0];

/**
 * Every distinct upgrade frame is decoded before play to avoid first-volley
 * missing textures on a phone. Repeated tier URLs share cached textures.
 */
export const PLAYER_WEAPON_FRAME_URLS = Object.freeze([
  ...research.flat(),
  ...PLAYER_WEAPON_VISUALS.bio.flat(),
  ...PLAYER_WEAPON_VISUALS.eth.flat(),
  ...PLAYER_WEAPON_VISUALS.btc.flat()
]);

export const PLAYER_WEAPON_LAUNCH_TICKS_PER_FRAME = 2;

export const getPlayerWeaponLaunchFrameIndex = (ageFrames: number, frameCount: number) => {
  const lastFrame = Math.max(0, Math.floor(frameCount) - 1);
  const launchFrame = Math.floor(Math.max(0, ageFrames) / PLAYER_WEAPON_LAUNCH_TICKS_PER_FRAME);
  return Math.min(lastFrame, launchFrame);
};

/**
 * Higher Projectile Upgrade levels keep their last launch pixels alive after
 * the initial four-frame ignition. This is presentation-only: it does not
 * affect projectile lifetime, speed, damage, or collision geometry.
 */
export const getPlayerWeaponFlightFrameIndex = (
  ageFrames: number,
  frameCount: number,
  visualLevel: number
) => {
  const lastFrame = Math.max(0, Math.floor(frameCount) - 1);
  const age = Math.max(0, Math.floor(Number(ageFrames) || 0));
  const launchFrame = getPlayerWeaponLaunchFrameIndex(age, frameCount);
  if (launchFrame < lastFrame || lastFrame === 0) return launchFrame;

  const level = Math.max(0, Math.min(5, Math.floor(Number(visualLevel) || 0)));
  if (level < 2) return lastFrame;

  const launchDuration = lastFrame * PLAYER_WEAPON_LAUNCH_TICKS_PER_FRAME;
  const flightAge = Math.max(0, age - launchDuration);
  if (level < 4 || lastFrame < 2) {
    return lastFrame - (Math.floor(flightAge / 5) % 2);
  }

  const shimmerFrames = [lastFrame, lastFrame - 1, lastFrame, lastFrame - 2];
  const holdTicks = level === 5 ? 2 : 3;
  return shimmerFrames[Math.floor(flightAge / holdTicks) % shimmerFrames.length];
};

export interface PlayerProjectileUpgradePresentation {
  readonly level: number;
  /** Presentation-only multiplier applied after collision geometry is resolved. */
  readonly spriteScale: number;
  readonly pulseAmount: number;
  readonly trailLength: number;
  readonly trailWidth: number;
  readonly trailAlpha: number;
  readonly sparkCount: number;
}

/**
 * Six bounded presentation tiers: base plus the five in-mission upgrades.
 * These values strengthen the same energy silhouette during dense mobile
 * combat without spawning objects or increasing collision dimensions.
 */
export const PLAYER_PROJECTILE_UPGRADE_PRESENTATION: readonly PlayerProjectileUpgradePresentation[] = Object.freeze([
  { level: 0, spriteScale: 1, pulseAmount: 0, trailLength: 0, trailWidth: 0, trailAlpha: 0, sparkCount: 0 },
  { level: 1, spriteScale: 1.06, pulseAmount: 0.012, trailLength: 12, trailWidth: 1.2, trailAlpha: 0.28, sparkCount: 0 },
  { level: 2, spriteScale: 1.12, pulseAmount: 0.022, trailLength: 18, trailWidth: 1.55, trailAlpha: 0.34, sparkCount: 1 },
  { level: 3, spriteScale: 1.18, pulseAmount: 0.032, trailLength: 24, trailWidth: 1.9, trailAlpha: 0.4, sparkCount: 1 },
  { level: 4, spriteScale: 1.25, pulseAmount: 0.044, trailLength: 31, trailWidth: 2.3, trailAlpha: 0.48, sparkCount: 2 },
  { level: 5, spriteScale: 1.32, pulseAmount: 0.056, trailLength: 40, trailWidth: 2.75, trailAlpha: 0.56, sparkCount: 3 }
]);

export const getPlayerProjectileUpgradePresentation = (
  level: number
): PlayerProjectileUpgradePresentation => (
  PLAYER_PROJECTILE_UPGRADE_PRESENTATION[
    Math.max(0, Math.min(5, Math.floor(Number(level) || 0)))
  ]
);

export const getPlayerWeaponVisualFamily = (weaponKind: string): PlayerWeaponVisualFamily => {
  if (weaponKind === 'bio-primary') return 'bio';
  if (weaponKind === 'bio-laser') return 'bio';
  if (weaponKind === 'eth-shard') return 'eth';
  if (weaponKind === 'btc-hash') return 'btc';
  if (weaponKind === 'btc-bolt') return 'btc';
  return 'research';
};

export const getPlayerShipWeaponVisualFamily = (shipId: string): PlayerWeaponVisualFamily => {
  if (shipId === 'bio') return 'bio';
  if (shipId === 'eth') return 'eth';
  if (shipId === 'btc') return 'btc';
  return 'research';
};

export const getPlayerWeaponFrames = (
  weaponKind: string,
  level: number,
  familyOverride?: PlayerWeaponVisualFamily
): readonly string[] => {
  const family = familyOverride ?? getPlayerWeaponVisualFamily(weaponKind);
  const visualLevel = Math.max(0, Math.min(7, Math.floor(Number(level) || 0)));
  return PLAYER_WEAPON_VISUALS[family][visualLevel];
};
