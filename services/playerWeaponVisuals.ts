export type PlayerWeaponVisualFamily = 'research' | 'bio' | 'eth' | 'btc';

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

export const PLAYER_WEAPON_VISUALS = { research, bio, eth, btc } as const;

/** Default four-frame launch family retained by Research, ETH, and BTC. */
export const UNIVERSAL_PLAYER_WEAPON_FRAMES = research[0];
/** BIO's half-strength twin rails use the checked-in green launch family. */
export const BIO_PRIMARY_PLAYER_WEAPON_FRAMES = bio[0];

export const PLAYER_WEAPON_FRAME_URLS = [
  ...UNIVERSAL_PLAYER_WEAPON_FRAMES,
  ...BIO_PRIMARY_PLAYER_WEAPON_FRAMES
];

export const PLAYER_WEAPON_LAUNCH_TICKS_PER_FRAME = 2;

export const getPlayerWeaponLaunchFrameIndex = (ageFrames: number, frameCount: number) => {
  const lastFrame = Math.max(0, Math.floor(frameCount) - 1);
  const launchFrame = Math.floor(Math.max(0, ageFrames) / PLAYER_WEAPON_LAUNCH_TICKS_PER_FRAME);
  return Math.min(lastFrame, launchFrame);
};

export const getPlayerWeaponVisualFamily = (weaponKind: string): PlayerWeaponVisualFamily => {
  if (weaponKind === 'bio-primary') return 'bio';
  if (weaponKind === 'bio-laser') return 'bio';
  if (weaponKind === 'eth-shard') return 'eth';
  if (weaponKind === 'btc-hash') return 'btc';
  return 'research';
};

export const getPlayerWeaponFrames = (weaponKind: string, level: number): readonly string[] => {
  void level;
  if (weaponKind === 'bio-primary') return BIO_PRIMARY_PLAYER_WEAPON_FRAMES;
  return UNIVERSAL_PLAYER_WEAPON_FRAMES;
};
