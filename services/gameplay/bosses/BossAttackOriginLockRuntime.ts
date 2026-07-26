export interface BossAttackOriginPoint {
  readonly x: number;
  readonly y: number;
}

export interface BossAttackOriginLock {
  readonly clipId: string;
  readonly executionIndex: number;
  readonly origins: readonly BossAttackOriginPoint[];
}

export interface ConsumedBossAttackOriginLock {
  readonly lock?: Readonly<BossAttackOriginLock>;
  readonly remaining: readonly BossAttackOriginLock[];
}

export const MAX_BOSS_ATTACK_ORIGIN_LOCKS = 8;
export const MAX_BOSS_ATTACK_ORIGINS_PER_LOCK = 8;

const validKey = (clipId: string, executionIndex: number) => (
  clipId.length > 0
  && clipId.length <= 200
  && Number.isInteger(executionIndex)
  && executionIndex >= 0
  && executionIndex < 8
);

const copyOrigins = (
  origins: readonly BossAttackOriginPoint[]
): readonly BossAttackOriginPoint[] | null => {
  if (origins.length === 0 || origins.length > MAX_BOSS_ATTACK_ORIGINS_PER_LOCK) return null;
  const copied: BossAttackOriginPoint[] = [];
  for (const origin of origins) {
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
    copied.push({ x: origin.x, y: origin.y });
  }
  return copied;
};

/**
 * Captures the exact simulation-space origins used by an authored warning.
 * Replacing an existing key keeps retries idempotent; copying coordinates
 * prevents later boss, limb, or socket motion from mutating the warning lock.
 */
export const captureBossAttackOriginLock = (
  current: readonly BossAttackOriginLock[],
  clipId: string,
  executionIndex: number,
  origins: readonly BossAttackOriginPoint[]
): readonly BossAttackOriginLock[] => {
  if (!validKey(clipId, executionIndex)) return current;
  const copiedOrigins = copyOrigins(origins);
  if (!copiedOrigins) return current;
  const next = current.filter((lock) => (
    lock.clipId !== clipId || lock.executionIndex !== executionIndex
  ));
  next.push({ clipId, executionIndex, origins: copiedOrigins });
  return next.slice(-MAX_BOSS_ATTACK_ORIGIN_LOCKS);
};

export const getBossAttackOriginLock = (
  current: readonly BossAttackOriginLock[],
  clipId: string,
  executionIndex: number
): Readonly<BossAttackOriginLock> | undefined => current.find((lock) => (
  lock.clipId === clipId && lock.executionIndex === executionIndex
));

/**
 * Firing consumes only its exact clip/execution key. Other overlapping warned
 * actions remain intact and cannot accidentally borrow this origin.
 */
export const consumeBossAttackOriginLock = (
  current: readonly BossAttackOriginLock[],
  clipId: string,
  executionIndex: number
): ConsumedBossAttackOriginLock => ({
  lock: getBossAttackOriginLock(current, clipId, executionIndex),
  remaining: current.filter((candidate) => (
    candidate.clipId !== clipId || candidate.executionIndex !== executionIndex
  ))
});

export const clearBossAttackOriginLocks = (): readonly BossAttackOriginLock[] => [];
