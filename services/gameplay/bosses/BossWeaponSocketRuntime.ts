export const BOSS_WEAPON_SOCKET_ROLES = [
  'core',
  'port',
  'starboard'
] as const;

/** Shared simulation window for a deliberate large-hit or component-break pose. */
export const BOSS_SIGNIFICANT_REACTION_FRAMES = 16;

export type BossWeaponSocketRole = (typeof BOSS_WEAPON_SOCKET_ROLES)[number];

export interface BossWeaponSocket {
  readonly id: string;
  readonly role: BossWeaponSocketRole;
  /** Normalized against the simulation-owned boss bounds. */
  readonly xRatio: number;
  readonly yRatio: number;
}

export interface BossWeaponSocketProfile {
  readonly kind: 'normalized-boss-sockets-v1';
  readonly sockets: readonly BossWeaponSocket[];
}

export interface BossWeaponSocketPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly phaseIndex: number;
  readonly entranceProgress?: number | null;
  readonly damageStage?: number | null;
  readonly phaseProgress?: number | null;
  readonly revivalStage?: 'none' | 'armed' | 'shutdown' | 'rebooting' | 'complete' | null;
  readonly revivalProgress?: number | null;
  readonly revived?: boolean;
  readonly reaction?: {
    readonly kind: 'impact' | 'stagger';
    readonly progress: number;
    readonly direction: -1 | 1;
    readonly strength: number;
  } | null;
  readonly action?: {
    readonly primitiveId?: string | null;
    readonly stage?: string | null;
    readonly progress?: number | null;
    readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
    readonly sequence?: number | null;
    readonly motionCue?: string | null;
    readonly elapsedFrames?: number | null;
    readonly framesPerSecond?: number | null;
    readonly projectileCount?: number | null;
  } | null;
}

/** Preview-only callback; production campaign content never carries functions. */
export type BossWeaponSocketPoseSampler = (
  input: BossWeaponSocketPoseInput
) => BossWeaponSocketProfile;

export interface SampledBossWeaponSocket extends BossWeaponSocket {
  readonly x: number;
  readonly y: number;
}

const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Converts authored normalized sockets into deterministic simulation points.
 * The renderer can use the same profile without owning projectile geometry.
 */
export const sampleBossWeaponSockets = ({
  profile,
  role,
  x,
  y,
  width,
  height
}: {
  profile: BossWeaponSocketProfile | undefined;
  role?: BossWeaponSocketRole;
  x: number;
  y: number;
  width: number;
  height: number;
}): readonly SampledBossWeaponSocket[] => {
  if (!profile || profile.kind !== 'normalized-boss-sockets-v1') return [];
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
  const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
  return Object.freeze(profile.sockets
    .filter((socket) => role === undefined || socket.role === role)
    .map((socket) => Object.freeze({
      ...socket,
      x: x + clampRatio(socket.xRatio) * safeWidth,
      y: y + clampRatio(socket.yRatio) * safeHeight
    })));
};
