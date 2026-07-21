export type BossCoinRewardKind = 'mini-boss' | 'main-boss';

export type BossCoinBurstKinematics = Readonly<{
  offsetX: number;
  offsetY: number;
  vx: number;
  vy: number;
  gravity: number;
  floorOffset: number;
  bounces: number;
  variant: number;
}>;

export const MAX_ACTIVE_BOSS_REWARD_COINS = 128;
export const BOSS_COIN_BURST_FRAMES = 156;

const MINI_BOSS_BASE_COINS = 12;
const MINI_BOSS_COINS_PER_STAGE = 2;
const MINI_BOSS_MAX_COINS = 20;
const MAIN_BOSS_BASE_COINS = 50;
const MAIN_BOSS_COINS_PER_STAGE = 5;
const MAIN_BOSS_MAX_COINS = 80;

const clampStage = (wave: number) => Math.max(0, Math.floor(Number(wave) || 1) - 1);

/**
 * Authoritative boss coin reward curve. The first mini-boss shower is readable
 * without flooding mobile, while later main bosses visibly pay out more.
 */
export const getBossCoinBurstCount = (kind: BossCoinRewardKind, wave: number) => {
  const stage = clampStage(wave);
  return kind === 'main-boss'
    ? Math.min(MAIN_BOSS_MAX_COINS, MAIN_BOSS_BASE_COINS + stage * MAIN_BOSS_COINS_PER_STAGE)
    : Math.min(MINI_BOSS_MAX_COINS, MINI_BOSS_BASE_COINS + stage * MINI_BOSS_COINS_PER_STAGE);
};

const deterministicWave = (index: number, seed: number) => (
  Math.sin((index + 1) * 12.9898 + seed * 0.137) * 0.5
  + Math.sin((index + 1) * 4.1414 + seed * 0.071) * 0.5
);

/**
 * Produces a repeatable upward fan. Runtime IDs remain free to be random; all
 * player-visible boss-reward motion is derived from the wave and coin index.
 */
export const getBossCoinBurstKinematics = (
  index: number,
  count: number,
  wave: number,
  seed: number = 0
): BossCoinBurstKinematics => {
  const safeCount = Math.max(1, Math.floor(count));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Math.floor(index)));
  const t = (safeIndex + 0.5) / safeCount;
  const lane = t * 2 - 1;
  const arc = Math.sin(Math.PI * t);
  const jitter = deterministicWave(safeIndex, seed + clampStage(wave) * 31);

  return Object.freeze({
    offsetX: lane * 22 + jitter * 3.5,
    offsetY: ((safeIndex % 5) - 2) * 2.2,
    vx: lane * 5.6 + jitter * 0.72,
    vy: -(4.7 + arc * 3.9 + Math.abs(jitter) * 0.42),
    gravity: 0.185 + (safeIndex % 5) * 0.007,
    floorOffset: 74 + (safeIndex % 7) * 7,
    bounces: 1,
    variant: Math.abs((seed * 53 + clampStage(wave) * 97 + safeIndex * 37) % 1000)
  });
};
