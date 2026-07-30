export const PAYWALL_BOSS_MINIMUM_RAY_WARNING_FRAMES = 32;

export interface PaywallBossCadence {
  readonly attackTempoMultiplier: number;
  readonly rayCycleLength: number;
  readonly rayChargeStart: number;
  readonly rayChargeFrames: number;
  readonly rayFireFrame: number;
  readonly rayLifetimeFrames: number;
  readonly boltInterval: number;
  readonly coreInterval: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const normalizeAttackTempoMultiplier = (value: number) => (
  clamp(Number.isFinite(value) ? value : 1, 1, 1.35)
);

const scaleFrames = (frames: number, tempoMultiplier: number, minimum: number) => (
  Math.max(minimum, Math.round(frames / normalizeAttackTempoMultiplier(tempoMultiplier)))
);

/**
 * Resolves the complete custom Paywall cadence from integer simulation
 * frames. Easy (1x) returns the original values exactly. Harder Archive modes
 * shorten recovery/cycle spacing while retaining a readable ray warning.
 */
export const resolvePaywallBossCadence = ({
  healthRatio,
  allArmorDestroyed,
  coreExposed,
  attackTempoMultiplier = 1
}: {
  readonly healthRatio: number;
  readonly allArmorDestroyed: boolean;
  readonly coreExposed: boolean;
  readonly attackTempoMultiplier?: number;
}): PaywallBossCadence => {
  const health = clamp(Number(healthRatio) || 0, 0, 1);
  const tempo = normalizeAttackTempoMultiplier(attackTempoMultiplier);
  const authoredRayCycleLength = health <= 0.25 ? 232 : health <= 0.55 ? 274 : 318;
  const rayCycleLength = scaleFrames(authoredRayCycleLength, tempo, 120);
  const authoredRayChargeFrames = health <= 0.25 ? 32 : health <= 0.55 ? 40 : 48;
  const rayChargeFrames = scaleFrames(
    authoredRayChargeFrames,
    tempo,
    PAYWALL_BOSS_MINIMUM_RAY_WARNING_FRAMES
  );
  const rayChargeStart = Math.round(rayCycleLength * (coreExposed ? 0.46 : 0.52));
  const rayFireFrame = Math.min(rayCycleLength - 1, rayChargeStart + rayChargeFrames);
  const rayLifetimeFrames = scaleFrames(
    health <= 0.35 || coreExposed ? 70 : 62,
    tempo,
    42
  );
  const authoredBoltInterval = Math.max(
    46,
    Math.round((allArmorDestroyed ? 54 : 76) * (0.72 + health * 0.28))
  );
  const authoredCoreInterval = health <= 0.25 ? 42 : health <= 0.55 ? 56 : 74;

  return Object.freeze({
    attackTempoMultiplier: tempo,
    rayCycleLength,
    rayChargeStart,
    rayChargeFrames,
    rayFireFrame,
    rayLifetimeFrames,
    boltInterval: scaleFrames(authoredBoltInterval, tempo, 30),
    coreInterval: scaleFrames(authoredCoreInterval, tempo, 28)
  });
};
