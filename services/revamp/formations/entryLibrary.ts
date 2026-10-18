import { bakeSpline, catmullRomCurves, clamp, sampleSplineDistance, type Cubic, type Point, type TimedSpline } from './spline';

export const REVAMP_ENTRY_PATHS = [
  'revamp-swoop', 'revamp-loop', 'revamp-s-curve', 'revamp-side-sweep',
  'revamp-pincer', 'revamp-corkscrew', 'revamp-bottom-flank', 'revamp-train'
] as const;
export type RevampEntryPath = typeof REVAMP_ENTRY_PATHS[number];
export const isRevampEntryPath = (path: string | undefined): path is RevampEntryPath => (
  REVAMP_ENTRY_PATHS.includes(path as RevampEntryPath)
);
export interface EntryInput {
  path: RevampEntryPath;
  world: { width: number; height: number };
  start: Point;
  slot: Point;
  hullWidth?: number;
  side: -1 | 1;
}
export interface EntryFlight {
  spline: TimedSpline;
  settleStartsAtSeconds: number;
  cruiseSpeed: number;
  brakeDistance: number;
}
export const ENTRY_WARNING_SECONDS = 0.8;
export const TRAIN_STAGGER_SECONDS = 0.16;

export const entrySide = (direction: string | undefined, seed: number, index: number, path?: string): -1 | 1 => {
  if (direction === 'left') return -1;
  if (direction === 'right') return 1;
  // A pincer consists of two coherent trains; all other top entries share one gate.
  return (seed + (direction === 'split' || path === 'revamp-pincer' ? index : 0)) % 2 === 0 ? -1 : 1;
};

export const entrySpawn = (path: RevampEntryPath, world: { width: number; height: number }, side: -1 | 1): Point => {
  if (path === 'revamp-bottom-flank') return { x: world.width * (side < 0 ? 0.08 : 0.84), y: world.height + 72 };
  if (path === 'revamp-side-sweep' || path === 'revamp-pincer') {
    return { x: side < 0 ? -72 : world.width + 72, y: world.height * 0.13 };
  }
  return { x: world.width * (side < 0 ? 0.15 : 0.73), y: -76 };
};

/** Warning location is independent of the player's device and input method. */
export const getEntryWarning = ({ path, side, world }: Pick<EntryInput, 'path' | 'side' | 'world'>) => {
  if (path === 'revamp-bottom-flank') {
    return { edge: 'bottom' as const, x: world.width * (side < 0 ? 0.12 : 0.88), y: world.height - 14, seconds: ENTRY_WARNING_SECONDS };
  }
  if (path === 'revamp-side-sweep' || path === 'revamp-pincer') {
    return { edge: side < 0 ? 'left' as const : 'right' as const, x: side < 0 ? 14 : world.width - 14,
      y: world.height * 0.13 + 24, seconds: ENTRY_WARNING_SECONDS };
  }
  return undefined;
};

const entryCache = new Map<string, EntryFlight>();
const createEntryFlight = (input: EntryInput): EntryFlight => {
  const { world, path } = input;
  const w = world.width;
  const h = world.height;
  const mirror = (point: Point): Point => input.side < 0 ? point : { x: w - (input.hullWidth ?? 48) - point.x, y: point.y };
  const start = mirror(input.start);
  const target = mirror(input.slot);
  const p = (x: number, y: number): Point => ({ x: x * w, y: y * h });
  let knots: Point[];
  let body: Cubic[];
  if (path === 'revamp-loop') {
    // Four cubic quarters form a readable loop; the initial climb and final
    // glide continue its horizontal tangent. k is the circle approximation.
    const cx = w * 0.47, cy = h * 0.22, r = Math.min(w * 0.2, h * 0.13), k = r * 0.55228475;
    const bottom = { x: cx, y: cy + r };
    body = [
      [start, p(0.13, 0.17), { x: cx - r, y: bottom.y }, bottom],
      [bottom, { x: cx + k, y: cy + r }, { x: cx + r, y: cy + k }, { x: cx + r, y: cy }],
      [{ x: cx + r, y: cy }, { x: cx + r, y: cy - k }, { x: cx + k, y: cy - r }, { x: cx, y: cy - r }],
      [{ x: cx, y: cy - r }, { x: cx - k, y: cy - r }, { x: cx - r, y: cy - k }, { x: cx - r, y: cy }],
      [{ x: cx - r, y: cy }, { x: cx - r, y: cy + k }, { x: cx - k, y: cy + r }, bottom]
    ];
  } else {
    if (path === 'revamp-s-curve' || path === 'revamp-train') {
      knots = [start, p(0.18, 0.06), p(0.78, 0.13), p(0.77, 0.22), p(0.2, 0.29), p(0.35, 0.35)];
    } else if (path === 'revamp-side-sweep') {
      knots = [start, p(0.18, 0.2), p(0.73, 0.2), p(0.82, 0.29), p(0.58, 0.34)];
    } else if (path === 'revamp-pincer') {
      knots = [start, p(0.16, 0.25), p(0.38, 0.33), p(0.55, 0.23), p(0.48, 0.16)];
    } else if (path === 'revamp-corkscrew') {
      knots = [start, p(0.2, 0.06), p(0.7, 0.13), p(0.65, 0.23), p(0.27, 0.21),
        p(0.31, 0.13), p(0.62, 0.18), p(0.57, 0.28), p(0.4, 0.27)];
    } else if (path === 'revamp-bottom-flank') {
      // Low entries climb the outer lane. They never cut across the player's
      // starting area, and the engine holds them offscreen during the warning.
      knots = [start, p(0.045, 0.76), p(0.045, 0.51), p(0.15, 0.3), p(0.35, 0.23)];
    } else {
      knots = [start, p(0.17, 0.06), p(0.25, 0.24), p(0.55, 0.32), p(0.75, 0.2)];
    }
    body = catmullRomCurves(knots, 0.8);
  }
  const finalBody = body[body.length - 1];
  const end = finalBody[3];
  const tangent = { x: end.x - finalBody[2].x, y: end.y - finalBody[2].y };
  const tail: Cubic = [end, { x: end.x + tangent.x, y: end.y + tangent.y },
    { x: target.x, y: target.y + Math.min(h * 0.07, 50) }, target];
  const curves = [...body, tail].map((curve) => curve.map(mirror) as unknown as Cubic);
  // Physical speed scales only with the fixed world, never screen DPR or input.
  const speed = Math.max(140, w * (path === 'revamp-loop' || path === 'revamp-train' ? 0.67 : 0.6));
  const baked = bakeSpline(curves, speed);
  const brakeDistance = Math.min(w * 0.075, baked.length * 0.1);
  const spline = { ...baked, durationSeconds: baked.durationSeconds + brakeDistance / speed };
  return { spline, settleStartsAtSeconds: spline.segmentEnds[body.length - 1] / speed,
    cruiseSpeed: speed, brakeDistance };
};

export const getEntryFlight = (input: EntryInput): EntryFlight => {
  const key = [input.path, input.world.width, input.world.height, input.start.x, input.start.y,
    input.slot.x, input.slot.y, input.side, input.hullWidth ?? 48].join(':');
  let flight = entryCache.get(key);
  if (!flight) {
    flight = createEntryFlight(input);
    if (entryCache.size >= 192) entryCache.delete(entryCache.keys().next().value!);
    entryCache.set(key, flight);
  }
  return flight;
};

/** Train delays belong to the shared wave clock, never accumulated frame dt. */
export const sampleEntry = (flight: EntryFlight, elapsedSeconds: number, trainIndex = 0) => {
  const age = elapsedSeconds - Math.max(0, trainIndex) * TRAIN_STAGGER_SECONDS;
  const sample = (time: number) => {
    const brakingAt = (flight.spline.length - flight.brakeDistance) / flight.cruiseSpeed;
    if (time <= brakingAt) return sampleSplineDistance(flight.spline, Math.max(0, time) * flight.cruiseSpeed);
    const t = clamp((time - brakingAt) / (flight.brakeDistance * 2 / flight.cruiseSpeed), 0, 1);
    return sampleSplineDistance(flight.spline, flight.spline.length - flight.brakeDistance
      + flight.brakeDistance * (2 * t - t * t));
  };
  const point = sample(age);
  const next = sample(age + 1 / 120);
  const settle = clamp((age - flight.settleStartsAtSeconds)
    / Math.max(0.001, flight.spline.durationSeconds - flight.settleStartsAtSeconds), 0, 1);
  return { ...point, angle: age >= flight.spline.durationSeconds ? 0
    : clamp(Math.atan2(next.x - point.x, Math.max(0.001, next.y - point.y)), -0.82, 0.82),
    assemblyProgress: settle * settle * (3 - 2 * settle), complete: age >= flight.spline.durationSeconds };
};

/** Immutable slot sampling avoids drift, and keeps neighbours phase coherent. */
export const breatheFormationSlot = (input: { slot: Point; center: Point; elapsedSeconds: number; seed?: number }): Point => {
  const phase = input.elapsedSeconds * 1.08 + ((input.seed ?? 0) % 31) * 0.09;
  const breath = 1 + Math.sin(phase * 0.72) * 0.025;
  return {
    x: input.center.x + (input.slot.x - input.center.x) * breath + Math.sin(phase) * 8,
    y: input.center.y + (input.slot.y - input.center.y) * breath + Math.cos(phase * 0.83) * 3
  };
};
