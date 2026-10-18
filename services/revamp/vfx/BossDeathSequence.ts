import { registerBossDeath } from './BossCompletionGate';
/** REVAMP(S): Public, renderer-independent death API. No rewards, timers or RNG. */
export interface BossDeathRequest {
  readonly id: string;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly mini: boolean;
  readonly parts: readonly { x: number; y: number }[];
}

interface DeathEngine { frameCount: number; feel?: { resetGeneration: number } }
interface DeathHull {
  id: string; x: number; y: number; width: number; height: number;
  bossComponents?: readonly { centerXRatio: number; centerYRatio: number; destroyed?: boolean }[];
}
type Queue = { generation: number; seen: WeakSet<object>; pending: BossDeathRequest[] };
const queues = new WeakMap<object, Queue>();
export const BOSS_DEATH_DURATION_MS = 2400;
export const BOSS_DEATH_FINALE_MS = 1440;
export const MINI_DEATH_DURATION_MS = 1850;
export const MINI_DEATH_FINALE_MS = 1050;
export const MAX_BOSS_DEATHS = 4;

const queueFor = (engine: DeathEngine) => {
  let queue = queues.get(engine);
  const generation = engine.feel?.resetGeneration ?? 0;
  if (!queue || queue.generation !== generation) {
    queue = { generation, seen: new WeakSet(), pending: [] };
    queues.set(engine, queue);
  }
  return queue;
};

/**
 * Call once on terminal death (O's interactive bosses can call this directly).
 * Common feel receipts call it too: entity-identity deduplication makes that safe.
 * Never call for revival/escape. Real coins stay in spawnBossCoinBurst.
 */
export function playBossDeathSequence(engine: DeathEngine, hull: DeathHull, mini = false): boolean {
  if (![hull.x, hull.y, hull.width, hull.height].every(Number.isFinite) || hull.width <= 0 || hull.height <= 0) return false;
  const queue = queueFor(engine);
  if (queue.seen.has(hull)) return false;
  queue.seen.add(hull);
  const parts = (hull.bossComponents ?? []).slice(0, 12)
    .filter(part => Number.isFinite(part.centerXRatio) && Number.isFinite(part.centerYRatio))
    // Destroyed sockets lead the walk: the chain visibly follows damaged anatomy.
    .sort((a, b) => Number(Boolean(b.destroyed)) - Number(Boolean(a.destroyed)))
    .map(part => ({ x: Math.max(-0.42, Math.min(0.42, part.centerXRatio - 0.5)),
      y: Math.max(-0.42, Math.min(0.42, part.centerYRatio - 0.5)) }));
  if (queue.pending.length >= MAX_BOSS_DEATHS) queue.pending.shift();
  const request = Object.freeze({ id: hull.id, frame: engine.frameCount,
    x: hull.x + hull.width / 2, y: hull.y + hull.height / 2,
    width: hull.width, height: hull.height, mini, parts });
  queue.pending.push(request);
  registerBossDeath(engine, request); // REVAMP(T): Ownership lasts through the final particle tail.
  return true;
}

export function consumeBossDeathSequences(engine: DeathEngine): BossDeathRequest[] {
  const queue = queueFor(engine);
  const pending = queue.pending;
  queue.pending = [];
  return pending;
}

/** Read-only ownership survives queue consumption, but never crosses a run reset. */
export function hasBossDeathSequence(engine: DeathEngine, hull: DeathHull): boolean {
  const queue = queues.get(engine);
  return Boolean(queue && queue.generation === (engine.feel?.resetGeneration ?? 0) && queue.seen.has(hull));
}

export interface DeathBurst { at: number; x: number; y: number; size: number; tier: 'medium' | 'large' | 'mega'; seed: number }
const WALK = [[-0.3, -0.2], [0.29, 0.16], [-0.23, 0.27], [0.3, -0.24], [0, -0.1], [-0.13, 0.06], [0.15, 0.21], [0, 0]];

export function bossDeathTimeline(request: BossDeathRequest): readonly DeathBurst[] {
  const finale = request.mini ? MINI_DEATH_FINALE_MS : BOSS_DEATH_FINALE_MS;
  const count = request.mini ? 6 : 8;
  return Array.from({ length: count }, (_, index) => {
    const final = index === count - 1;
    const point = request.parts[index] ?? { x: WALK[index][0], y: WALK[index][1] };
    return {
      at: final ? finale : index * finale / (count - 0.5),
      x: request.x + (final ? 0 : point.x * request.width),
      y: request.y + (final ? 0 : point.y * request.height),
      size: final ? Math.max(96, Math.min(216, request.width * 0.8))
        : Math.max(32, Math.min(index % 3 === 2 ? 88 : 64, request.width * (index % 3 === 2 ? 0.3 : 0.23))),
      tier: final ? 'mega' : index % 3 === 2 ? 'large' : 'medium',
      seed: index + request.frame * 17
    };
  });
}

/** Absolute-clock sampling avoids frame-rate drift and catch-up bursts on resume. */
export function deathBurstDue(burst: DeathBurst, previous: number, age: number, density: number) {
  if (burst.at <= previous || burst.at > age) return false;
  if (age - previous > 250) return false;
  return burst.tier === 'mega' || density >= 0.7 || burst.seed % 2 === 0;
}

export function bossDeathPose(age: number, mini: boolean, reducedMotion: boolean, reducedShake: boolean) {
  const finale = mini ? MINI_DEATH_FINALE_MS : BOSS_DEATH_FINALE_MS;
  const after = Math.max(0, age - finale);
  const strength = reducedMotion ? 0 : (reducedShake ? 0.4 : 2.5)
    * (age < finale ? 0.15 + 0.85 * age / finale : Math.max(0, 1 - after / 350));
  return {
    hullVisible: age < finale,
    shakeX: Math.sin(age * 0.083) * strength,
    shakeY: Math.cos(age * 0.071) * strength * 0.6,
    // Single short white frame; no full-screen flash under reduced motion.
    flash: reducedMotion || reducedShake || age < finale || after > 55 ? 0 : 0.11 * (1 - after / 55),
    fragmentSeconds: after / 1000,
    fragmentAlpha: Math.min(1, Math.max(0, 1 - (after - 350) / 600)),
    complete: age >= (mini ? MINI_DEATH_DURATION_MS : BOSS_DEATH_DURATION_MS)
  };
}
