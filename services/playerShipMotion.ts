import { PLAYER_SHIPS, type PlayerShipId } from './playerShipService';
import { preloadDecodedImageUrls } from './browserImagePreload';

export type PlayerSteeringState =
  | 'hard-left'
  | 'bank-left'
  | 'neutral'
  | 'bank-right'
  | 'hard-right';

type PlayerShipMotion = Readonly<{
  steeringFrames: Readonly<Record<PlayerSteeringState, string>>;
  selectionIdleFrames: readonly string[];
}>;

// Production PNG paths and timing mirror
// public/game-art/generated/scicon-flight-motion-pack-v1/pack-manifest.json.
export const PLAYER_SHIP_SELECTION_FPS = 5;
export const PLAYER_SHIP_STEERING_DEADZONE = 0.12;
export const PLAYER_SHIP_STEERING_BLEND_MS = 90;
export const PLAYER_SHIP_BASE_STEERING_BLEND_MS = 165;
export const PLAYER_SHIP_LEVEL_ONE_STEERING_BLEND_MS = 125;
export const PLAYER_SHIP_BANK_THRESHOLD = 0.42;
export const PLAYER_SHIP_HARD_BANK_THRESHOLD = 0.95;
export const PLAYER_SHIP_HARD_BANK_SWEEP_RATIO = 0.72;
export const PLAYER_SHIP_TOUCH_SPEED_SCALE = 1.34;
export const PLAYER_SHIP_HARD_BANK_HOLD_MS = 220;

export interface PlayerHardBankLatch {
  readonly direction: -1 | 0 | 1;
  readonly remainingMs: number;
  /** The direction already presented for the current continuous gesture. */
  readonly triggeredDirection: -1 | 0 | 1;
}

const packPath = '/game-art/generated/scicon-flight-motion-pack-v1/ships';

export const PLAYER_SHIP_MOTION: Readonly<Record<PlayerShipId, PlayerShipMotion>> = Object.freeze({
  researchhub: {
    steeringFrames: {
      // The generated ResearchHub left/right labels are visually mirrored. Keep
      // the runtime mapping reversed so screen-left movement banks screen-left.
      'hard-left': `${packPath}/researchhub/frames/researchhub-05-hard-right.png`,
      'bank-left': `${packPath}/researchhub/frames/researchhub-04-bank-right.png`,
      neutral: `${packPath}/researchhub/frames/researchhub-03-neutral.png`,
      'bank-right': `${packPath}/researchhub/frames/researchhub-02-bank-left.png`,
      'hard-right': `${packPath}/researchhub/frames/researchhub-01-hard-left.png`
    },
    selectionIdleFrames: [
      `${packPath}/researchhub-selection-idle/frames/researchhub-selection-idle-01-rest.png`,
      `${packPath}/researchhub-selection-idle/frames/researchhub-selection-idle-02-flask-pulse.png`,
      `${packPath}/researchhub-selection-idle/frames/researchhub-selection-idle-03-top-antenna-pulse.png`,
      `${packPath}/researchhub-selection-idle/frames/researchhub-selection-idle-04-side-sensors-pulse.png`,
      `${packPath}/researchhub-selection-idle/frames/researchhub-selection-idle-05-rest-hold.png`,
      `${packPath}/researchhub-selection-idle/frames/researchhub-selection-idle-06-settle.png`
    ]
  },
  bio: {
    steeringFrames: {
      'hard-left': `${packPath}/bio/frames/bio-01-hard-left.png`,
      'bank-left': `${packPath}/bio/frames/bio-02-bank-left.png`,
      neutral: `${packPath}/bio/frames/bio-03-neutral.png`,
      'bank-right': `${packPath}/bio/frames/bio-04-bank-right.png`,
      'hard-right': `${packPath}/bio/frames/bio-05-hard-right.png`
    },
    selectionIdleFrames: [
      `${packPath}/bio-selection-idle/frames/bio-selection-idle-01-rest.png`,
      `${packPath}/bio-selection-idle/frames/bio-selection-idle-02-gene-core-pulse.png`,
      `${packPath}/bio-selection-idle/frames/bio-selection-idle-03-upper-channel-pulse.png`,
      `${packPath}/bio-selection-idle/frames/bio-selection-idle-04-sensor-pod-pulse.png`,
      `${packPath}/bio-selection-idle/frames/bio-selection-idle-05-rest-hold.png`,
      `${packPath}/bio-selection-idle/frames/bio-selection-idle-06-settle.png`
    ]
  },
  eth: {
    steeringFrames: {
      'hard-left': `${packPath}/eth/frames/eth-01-hard-left.png`,
      'bank-left': `${packPath}/eth/frames/eth-02-bank-left.png`,
      neutral: `${packPath}/eth/frames/eth-03-neutral.png`,
      'bank-right': `${packPath}/eth/frames/eth-04-bank-right.png`,
      'hard-right': `${packPath}/eth/frames/eth-05-hard-right.png`
    },
    selectionIdleFrames: [
      `${packPath}/eth-selection-idle/frames/eth-selection-idle-01-rest.png`,
      `${packPath}/eth-selection-idle/frames/eth-selection-idle-02-reactor-pulse.png`,
      `${packPath}/eth-selection-idle/frames/eth-selection-idle-03-crystal-pulse.png`,
      `${packPath}/eth-selection-idle/frames/eth-selection-idle-04-wing-conduit-pulse.png`,
      `${packPath}/eth-selection-idle/frames/eth-selection-idle-05-rest-hold.png`,
      `${packPath}/eth-selection-idle/frames/eth-selection-idle-06-settle.png`
    ]
  },
  btc: {
    steeringFrames: {
      'hard-left': `${packPath}/btc-token-ship/frames/btc-token-ship-01-hard-left.png`,
      // The two authored mild-bank labels are visually mirrored, while the
      // hard-bank labels are correct. Swap only the mild frames so the Home
      // carousel and the shared gameplay renderer both lean outward.
      'bank-left': `${packPath}/btc-token-ship/frames/btc-token-ship-04-bank-right.png`,
      neutral: `${packPath}/btc-token-ship/frames/btc-token-ship-03-neutral.png`,
      'bank-right': `${packPath}/btc-token-ship/frames/btc-token-ship-02-bank-left.png`,
      'hard-right': `${packPath}/btc-token-ship/frames/btc-token-ship-05-hard-right.png`
    },
    selectionIdleFrames: [
      `${packPath}/btc-token-ship-selection-idle/frames/btc-token-ship-selection-idle-01-rest.png`,
      `${packPath}/btc-token-ship-selection-idle/frames/btc-token-ship-selection-idle-02-hash-rail-pulse.png`,
      `${packPath}/btc-token-ship-selection-idle/frames/btc-token-ship-selection-idle-03-upper-rail-pulse.png`,
      `${packPath}/btc-token-ship-selection-idle/frames/btc-token-ship-selection-idle-04-token-rim-pulse.png`,
      `${packPath}/btc-token-ship-selection-idle/frames/btc-token-ship-selection-idle-05-rest-hold.png`,
      `${packPath}/btc-token-ship-selection-idle/frames/btc-token-ship-selection-idle-06-settle.png`
    ]
  }
});

export const PLAYER_SHIP_STEERING_FRAME_URLS = Object.values(PLAYER_SHIP_MOTION)
  .flatMap((motion) => Object.values(motion.steeringFrames));

export const PLAYER_SHIP_SELECTION_FRAME_URLS = Object.values(PLAYER_SHIP_MOTION)
  .flatMap((motion) => motion.selectionIdleFrames);

export const PLAYER_SHIP_CAROUSEL_FRAME_URLS = [
  ...PLAYER_SHIP_STEERING_FRAME_URLS,
  ...PLAYER_SHIP_SELECTION_FRAME_URLS
] as const;

const playerShipIdByAssetUrl = new Map(
  Object.values(PLAYER_SHIPS).map((ship) => [ship.assetUrl, ship.id] as const)
);

export const getPlayerShipMotionByAssetUrl = (assetUrl: string) => {
  const shipId = playerShipIdByAssetUrl.get(assetUrl);
  return shipId ? PLAYER_SHIP_MOTION[shipId] : null;
};

export const applyPlayerSteeringDeadzone = (normalizedHorizontal: number) => {
  const clamped = Math.max(-1, Math.min(1, normalizedHorizontal));
  return Math.abs(clamped) < PLAYER_SHIP_STEERING_DEADZONE ? 0 : clamped;
};

export const getPlayerSteeringBlendMs = (speedLevel: number) => {
  if (speedLevel <= 0) return PLAYER_SHIP_BASE_STEERING_BLEND_MS;
  if (speedLevel === 1) return PLAYER_SHIP_LEVEL_ONE_STEERING_BLEND_MS;
  return PLAYER_SHIP_STEERING_BLEND_MS;
};

export const getPlayerSteeringPresentationSpeed = ({
  baseHorizontalSpeed,
  maxHorizontalSpeed,
  touchActive
}: {
  readonly baseHorizontalSpeed: number;
  readonly maxHorizontalSpeed: number;
  readonly touchActive: boolean;
}) => Math.max(
  1,
  touchActive
    ? baseHorizontalSpeed * PLAYER_SHIP_TOUCH_SPEED_SCALE
    : maxHorizontalSpeed
);

export const updatePlayerHardBankLatch = (
  current: PlayerHardBankLatch,
  {
    requestedDirection,
    hardBankDirection,
    triggerEligible,
    deltaMs
  }: {
    readonly requestedDirection: -1 | 0 | 1;
    readonly hardBankDirection: -1 | 0 | 1;
    readonly triggerEligible: boolean;
    readonly deltaMs: number;
  }
): PlayerHardBankLatch => {
  if (
    current.direction !== 0
    && requestedDirection !== 0
    && requestedDirection !== current.direction
  ) {
    return Object.freeze({
      direction: 0,
      remainingMs: 0,
      triggeredDirection: current.triggeredDirection
    });
  }
  if (
    triggerEligible
    && hardBankDirection !== 0
    && hardBankDirection !== current.triggeredDirection
  ) {
    return Object.freeze({
      direction: hardBankDirection,
      remainingMs: PLAYER_SHIP_HARD_BANK_HOLD_MS,
      triggeredDirection: hardBankDirection
    });
  }
  const remainingMs = Math.max(0, current.remainingMs - Math.max(0, deltaMs));
  return Object.freeze({
    direction: remainingMs > 0 ? current.direction : 0,
    remainingMs,
    triggeredDirection: requestedDirection === 0 ? 0 : current.triggeredDirection
  });
};

export const selectPlayerSteeringState = (
  normalizedHorizontal: number,
  hardBankEligible: boolean
): PlayerSteeringState => {
  if (normalizedHorizontal <= -PLAYER_SHIP_HARD_BANK_THRESHOLD) {
    return hardBankEligible ? 'hard-left' : 'bank-left';
  }
  if (normalizedHorizontal < -PLAYER_SHIP_BANK_THRESHOLD) return 'bank-left';
  if (normalizedHorizontal >= PLAYER_SHIP_HARD_BANK_THRESHOLD) {
    return hardBankEligible ? 'hard-right' : 'bank-right';
  }
  if (normalizedHorizontal > PLAYER_SHIP_BANK_THRESHOLD) return 'bank-right';
  return 'neutral';
};

let carouselFramePreload: Promise<void> | null = null;

export const preloadPlayerShipCarouselFrames = () => {
  if (carouselFramePreload) return carouselFramePreload;
  if (typeof Image === 'undefined') return Promise.resolve();

  carouselFramePreload = preloadDecodedImageUrls(
    PLAYER_SHIP_CAROUSEL_FRAME_URLS
  ).then(() => undefined).catch(() => {
    carouselFramePreload = null;
  });

  return carouselFramePreload;
};

// Backward-compatible name for call sites that only need the idle loop. The
// shared promise deliberately includes steering frames so a first swipe never
// flashes an unloaded bank pose.
export const preloadPlayerShipSelectionFrames = preloadPlayerShipCarouselFrames;
