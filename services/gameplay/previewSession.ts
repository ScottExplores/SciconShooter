import type { GameplayRandomSeed } from './random';
import type { BossTimelinePrimitiveId } from '../../game-config/types';

interface PreviewCommandBase {
  /** Monotonically changing caller token used to make command delivery idempotent. */
  readonly nonce: number;
}

export const PREVIEW_SIMULATION_FPS = 60;
/** Prevent a synchronous authoring command from monopolizing the browser. */
export const MAX_PREVIEW_SEEK_FRAMES = PREVIEW_SIMULATION_FPS * 120;
/** Keep one relative fast-forward action small enough to remain interactive. */
export const MAX_PREVIEW_FAST_FORWARD_FRAMES = PREVIEW_SIMULATION_FPS * 30;
/** Preview tuning stays inside the same authored health range as the Director. */
export const MAX_PREVIEW_HEALTH_BUDGET = 1_000_000;

export interface PreviewDebugOverlayState {
  readonly modularPivots: boolean;
  readonly weaponSockets: boolean;
  readonly bossCollision: boolean;
  readonly modularPartBounds: boolean;
  readonly safeRegions: boolean;
}

export type PreviewBossReferenceComparisonLayer = 'under' | 'over';

export interface PreviewBossReferenceComparisonState {
  readonly enabled: boolean;
  readonly opacity: number;
  readonly layer: PreviewBossReferenceComparisonLayer;
  readonly landmarks: boolean;
}

export const DEFAULT_PREVIEW_DEBUG_OVERLAYS: PreviewDebugOverlayState = Object.freeze({
  modularPivots: false,
  weaponSockets: false,
  bossCollision: false,
  modularPartBounds: false,
  safeRegions: false
});

export const DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON:
PreviewBossReferenceComparisonState = Object.freeze({
  enabled: false,
  opacity: 0.45,
  layer: 'under',
  landmarks: false
});

export type PreviewSafeRegionGuide = 'gap' | 'weave' | 'side' | 'cross';

export type PreviewCommand =
  | (PreviewCommandBase & { readonly type: 'play' })
  | (PreviewCommandBase & { readonly type: 'pause' })
  | (PreviewCommandBase & { readonly type: 'restart' })
  | (PreviewCommandBase & { readonly type: 'set-time-scale'; readonly timeScale: number })
  | (PreviewCommandBase & { readonly type: 'set-invincibility'; readonly enabled: boolean })
  | (PreviewCommandBase & { readonly type: 'set-seed'; readonly seed: GameplayRandomSeed })
  | (PreviewCommandBase & { readonly type: 'step-frame' })
  | (PreviewCommandBase & {
    readonly type: 'set-boss-health';
    readonly healthRatio: number;
    readonly eventId?: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-boss-max-health';
    /** Sandbox-only durability budget. The authored boss resource is unchanged. */
    readonly maxHealth: number;
    readonly eventId?: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-boss-component-max-health';
    /** Exact runtime component ID, such as left-cannon or right-cannon. */
    readonly componentId: string;
    /** Sandbox-only durability budget. The authored boss resource is unchanged. */
    readonly maxHealth: number;
    readonly eventId?: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-boss-hull-invincibility';
    /** Fight-local health lock. Restarting the preview clears it. */
    readonly enabled: boolean;
    readonly eventId?: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-boss-component-invincibility';
    /** Exact live component ID. The UI remains generic over component labels. */
    readonly componentId: string;
    /** Fight-local health lock. Restarting the preview clears it. */
    readonly enabled: boolean;
    readonly eventId?: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-debug-overlays';
    readonly overlays: PreviewDebugOverlayState;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-boss-reference-comparison';
    readonly comparison: PreviewBossReferenceComparisonState;
  })
  | (PreviewCommandBase & { readonly type: 'capture-frame' })
  | (PreviewCommandBase & {
    readonly type: 'load-target';
    readonly levelId: string;
    readonly waveId: string;
  })
  | (PreviewCommandBase & { readonly type: 'jump-to-stage'; readonly stage: number })
  | (PreviewCommandBase & { readonly type: 'jump-to-boss'; readonly stage: number })
  | (PreviewCommandBase & {
    readonly type: 'spawn-event-now';
    /** Exact ID of an event in the active authored wave. */
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'jump-to-boss-phase';
    /** Exact authored phase ID. */
    readonly phaseId: string;
    /** Optional exact boss event ID when a wave contains multiple bosses. */
    readonly eventId?: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'trigger-boss-attack';
    /** Authored attack sentence, legacy timeline clip, or configured weapon setting. */
    readonly attackId: string;
    /** Exact authored phase variant when an attack sentence spans phases. */
    readonly phaseId?: string;
    /** Optional exact boss event ID when a wave contains multiple bosses. */
    readonly eventId?: string;
    /** Restart at the first warning whenever the selected attack window ends. */
    readonly loop?: boolean;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-mini-boss-signature-loop';
    readonly eventId: string;
    readonly enabled: boolean;
  })
  | (PreviewCommandBase & {
    readonly type: 'trigger-mini-boss-support';
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-mini-boss-low-health';
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'trigger-mini-boss-hit';
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'trigger-mini-boss-death';
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'destroy-mini-boss-unit';
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'destroy-mini-boss-guardians';
    readonly eventId: string;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-mini-boss-shield';
    readonly eventId: string;
    readonly enabled: boolean;
  })
  | (PreviewCommandBase & {
    readonly type: 'set-mini-boss-wall-side';
    readonly eventId: string;
    readonly side: 'left' | 'right';
  })
  | (PreviewCommandBase & {
    readonly type: 'set-compact-health-bars';
    readonly enabled: boolean;
  })
  | (PreviewCommandBase & {
    readonly type: 'seek-to-frame';
    /** Absolute simulation frame reconstructed from the active wave start. */
    readonly frame: number;
  })
  | (PreviewCommandBase & {
    readonly type: 'fast-forward';
    /** Relative fixed simulation steps from the current state. */
    readonly frames: number;
  });

export interface PreviewPlaybackSnapshot {
  readonly playing: boolean;
  readonly timeScale: number;
  readonly invincible: boolean;
}

export interface PreviewBossSnapshot {
  readonly eventId: string | null;
  readonly bossId: string | null;
  readonly phaseId: string | null;
  readonly phaseIndex: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly healthRatio: number;
  readonly invincible: boolean;
  readonly components: readonly PreviewBossComponentSnapshot[];
  readonly activeAttack: PreviewBossAttackSnapshot | null;
  readonly activePrimitiveId: BossTimelinePrimitiveId | null;
  readonly safeRegionGuide: PreviewSafeRegionGuide | null;
}

export interface PreviewBossComponentSnapshot {
  readonly id: string;
  readonly label: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly healthRatio: number;
  readonly invincible: boolean;
  readonly destroyed: boolean;
  readonly exposed: boolean;
}

export interface PreviewBossAttackSnapshot {
  readonly id: string;
  readonly label: string;
  readonly role: 'core' | 'signature';
  readonly stage: 'warning' | 'fire' | 'transition' | 'recovery';
  readonly beatIndex: number;
  readonly beatCount: number;
  readonly clipId: string;
}

export interface PreviewMiniBossMemberSnapshot {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly healthRatio: number;
  readonly alive: boolean;
}

export interface PreviewMiniBossEncounterSnapshot {
  readonly eventId: string;
  readonly encounterId: string;
  readonly signatureLoop: boolean;
  readonly shieldEnabled: boolean;
  readonly wallSide: 'left' | 'right' | null;
  readonly compactHealthBars: boolean;
  readonly members: readonly PreviewMiniBossMemberSnapshot[];
}

/**
 * Compact reader-facing state for local tools. GameCanvas publishes it on the
 * existing low-frequency runtime cadence, never from every simulation step.
 */
export interface PreviewSnapshot extends PreviewPlaybackSnapshot {
  readonly seed: number;
  readonly frame: number;
  readonly levelId: string;
  readonly waveId: string;
  readonly waveProgressFrames: number;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly entityCount: number;
  readonly activeEventIds: readonly string[];
  readonly boss: PreviewBossSnapshot | null;
  readonly miniBossEncounter: PreviewMiniBossEncounterSnapshot | null;
}

export interface PreviewCommandResult {
  readonly nonce: number;
  readonly type: PreviewCommand['type'];
  readonly handled: boolean;
  readonly snapshot?: PreviewSnapshot;
  readonly capture?: {
    readonly mimeType: 'image/png';
    readonly dataUrl: string;
  };
}

export const clampPreviewTimeScale = (value: number) => (
  Math.max(0.25, Math.min(2, Number.isFinite(value) ? value : 1))
);

export const clampPreviewBossHealthRatio = (value: number) => (
  Math.max(0.01, Math.min(1, Number.isFinite(value) ? value : 1))
);

export const clampPreviewHealthBudget = (value: number) => (
  Math.max(
    1,
    Math.min(
      MAX_PREVIEW_HEALTH_BUDGET,
      Math.round(Number.isFinite(value) ? value : 1)
    )
  )
);

/**
 * Change a live preview durability budget without healing or damaging it by
 * percentage. Restarting the preview recreates the authored values.
 */
export const rescalePreviewHealthBudget = (
  health: number,
  maxHealth: number,
  nextMaxHealth: number,
  active = true
) => {
  const budget = clampPreviewHealthBudget(nextMaxHealth);
  if (!active) return Object.freeze({ health: 0, maxHealth: budget });
  const ratio = Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(health) && Number.isFinite(maxHealth) && maxHealth > 0
        ? health / maxHealth
        : 1
    )
  );
  return Object.freeze({
    health: Math.max(1, Math.round(budget * ratio)),
    maxHealth: budget
  });
};

export const normalizePreviewDebugOverlays = (
  overlays: Partial<PreviewDebugOverlayState> | null | undefined
): PreviewDebugOverlayState => Object.freeze({
  modularPivots: Boolean(overlays?.modularPivots),
  weaponSockets: Boolean(overlays?.weaponSockets),
  bossCollision: Boolean(overlays?.bossCollision),
  modularPartBounds: Boolean(overlays?.modularPartBounds),
  safeRegions: Boolean(overlays?.safeRegions)
});

export const normalizePreviewBossReferenceComparison = (
  comparison: Partial<PreviewBossReferenceComparisonState> | null | undefined
): PreviewBossReferenceComparisonState => Object.freeze({
  enabled: Boolean(comparison?.enabled),
  opacity: Math.max(0, Math.min(
    1,
    Number.isFinite(comparison?.opacity)
      ? Number(comparison?.opacity)
      : DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON.opacity
  )),
  layer: comparison?.layer === 'over' ? 'over' : 'under',
  landmarks: Boolean(comparison?.landmarks)
});

export const resolvePreviewSafeRegionGuide = (
  primitiveId: BossTimelinePrimitiveId | null | undefined
): PreviewSafeRegionGuide | null => {
  switch (primitiveId) {
    case 'gap-ring':
      return 'gap';
    case 'weave-wall':
      return 'weave';
    case 'side-barrage':
      return 'side';
    case 'cross-beam':
      return 'cross';
    default:
      return null;
  }
};

const clampWholeFrames = (value: number, maximum: number) => (
  Math.max(0, Math.min(maximum, Math.floor(Number.isFinite(value) ? value : 0)))
);

export const clampPreviewSeekFrame = (value: number) => (
  clampWholeFrames(value, MAX_PREVIEW_SEEK_FRAMES)
);

export const clampPreviewFastForwardFrames = (value: number) => (
  clampWholeFrames(value, MAX_PREVIEW_FAST_FORWARD_FRAMES)
);

/** Pure fixed-step loop boundary used by preview-only attack playback. */
export const resolvePreviewAttackLoopFrame = (
  currentFrame: number,
  startFrame: number,
  endFrame: number
) => {
  const current = Math.max(0, Math.floor(Number(currentFrame) || 0));
  const start = Math.max(0, Math.floor(Number(startFrame) || 0));
  const end = Math.max(start + 1, Math.floor(Number(endFrame) || 0));
  return current >= end ? start : current;
};
