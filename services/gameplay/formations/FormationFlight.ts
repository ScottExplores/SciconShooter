/** Fixed-step flight geometry. Hulls, bullets and collision stay in the same 2D plane. */
// REVAMP(B): Complete Galaga arcs and shot timing live outside the shared engine.
import { createGalagaDive } from '../../revamp/formations/galagaDive';
type Point = { x: number; y: number };
type Cubic = readonly [Point, Point, Point, Point];
export interface FormationFlight {
  readonly points: readonly Point[];
  readonly distances: readonly number[];
  readonly length: number;
  readonly duration: number;
  readonly revampShotAtAge?: number;
  readonly revampReturnsToSlot?: boolean;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const cubic = (curve: Cubic, t: number): Point => {
  const u = 1 - t;
  return {
    x: u ** 3 * curve[0].x + 3 * u * u * t * curve[1].x + 3 * u * t * t * curve[2].x + t ** 3 * curve[3].x,
    y: u ** 3 * curve[0].y + 3 * u * u * t * curve[1].y + 3 * u * t * t * curve[2].y + t ** 3 * curve[3].y
  };
};

/** Bake once per maneuver, never resample dozens of curves per hull per frame. */
const bake = (curves: readonly Cubic[], speed: number): FormationFlight => {
  const points: Point[] = [{ ...curves[0][0] }];
  const distances = [0];
  let length = 0;
  for (const curve of curves) {
    for (let step = 1; step <= 48; step++) {
      const point = cubic(curve, step / 48);
      const previous = points[points.length - 1];
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      points.push(point);
      distances.push(length);
    }
  }
  return { points, distances, length, duration: length / Math.max(1, speed) };
};

export const sampleFormationFlight = (flight: FormationFlight, age: number): Point => {
  const distance = clamp(age / flight.duration, 0, 1) * flight.length;
  let low = 1;
  let high = flight.distances.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (flight.distances[mid] < distance) low = mid + 1;
    else high = mid;
  }
  const t = (distance - flight.distances[low - 1]) / Math.max(0.0001, flight.distances[low] - flight.distances[low - 1]);
  return { x: mix(flight.points[low - 1].x, flight.points[low].x, t), y: mix(flight.points[low - 1].y, flight.points[low].y, t) };
};

export interface FormationAttackFlightInput {
  start: Point;
  target: Point;
  returnSlot?: Point;
  width: number;
  height: number;
  hullHeight: number;
  index: number;
  cycle: number;
  attack: string;
  speed: number;
}

/** A committed line: dodging changes the outcome, not the enemy's destination. */
export const createFormationAttackFlight = (input: FormationAttackFlightInput): FormationFlight => {
  // REVAMP(B): One committed shot at the arc bottom, then a continuous return to slot.
  if (input.attack === 'revamp-dive' || input.attack === 'revamp-escort') {
    const dive = createGalagaDive({ start: input.start, target: input.target, returnSlot: input.returnSlot,
      world: { width: input.width, height: input.height }, speedPerSecond: input.speed * 60,
      cycle: input.cycle, escortPosition: input.attack === 'revamp-escort'
        ? ([0, -1, 1] as const)[input.index % 3] : 0 });
    return { points: dive.spline.points, distances: dive.spline.distances, length: dive.spline.length,
      duration: dive.spline.durationSeconds * 60, revampShotAtAge: dive.shotAtSeconds * 60,
      revampReturnsToSlot: true };
  }
  const { start, width, height, index, cycle, attack } = input;
  const side = start.x < width / 2 ? -1 : 1;
  const wing = (index + cycle) % 2 === 0 ? -1 : 1;
  const strike = { x: clamp(input.target.x, 20, width - 44), y: clamp(input.target.y, height * 0.5, height * 0.82) };
  const exit = { x: strike.x, y: height + input.hullHeight + 24 };
  const reach = Math.min(width * 0.24, 105);
  let c1 = { x: start.x + wing * reach, y: start.y + 52 };
  let c2 = { x: strike.x - wing * reach * 0.5, y: strike.y - height * 0.2 };
  if (attack === 'pincer-pass' || attack === 'split-hunt') {
    c1 = { x: clamp(start.x + side * reach, 8, width - 36), y: start.y + height * 0.2 };
    c2 = { x: strike.x + side * reach, y: strike.y - height * 0.12 };
    exit.x = clamp(strike.x - side * reach, 12, width - 36);
  } else if (attack === 'sweep-strafe') {
    c1 = { x: width / 2, y: start.y + 8 };
    c2 = { x: width / 2 - side * width * 0.42, y: start.y + height * 0.22 };
    strike.x = clamp(width / 2 - side * width * 0.32, 20, width - 44);
    exit.x = strike.x;
  } else if (attack === 'lane-pass' || attack === 'row-sequence') {
    strike.x = start.x;
    exit.x = start.x;
    c1 = { x: start.x + wing * 24, y: start.y + 60 };
    c2 = { x: start.x, y: strike.y - 80 };
  } else if (attack === 'leader-escorts') {
    c1 = { x: clamp(start.x + wing * reach * 1.5, 12, width - 36), y: start.y - 38 };
    c2 = { x: strike.x - wing * reach, y: strike.y - height * 0.25 };
  } else if (attack === 'ring-collapse') {
    c1 = { x: width / 2, y: start.y - 44 };
    c2 = { x: strike.x + wing * reach, y: strike.y - height * 0.18 };
    exit.x = clamp(strike.x - wing * reach * 0.65, 12, width - 36);
  }
  const tangent = { x: strike.x - c2.x, y: strike.y - c2.y };
  return bake([
    [start, c1, c2, strike],
    [strike, { x: strike.x + tangent.x * 0.4, y: strike.y + tangent.y * 0.4 }, { x: exit.x, y: height * 0.97 }, exit]
  ], input.speed);
};

/** Follow the actual exit around a flank. No random top-edge respawn. */
export const createFormationReturnFlight = (input: {
  start: Point; target: Point; width: number; height: number; hullWidth: number; speed: number;
}): FormationFlight => {
  const { start, target, width, height, hullWidth } = input;
  const side = start.x < width / 2 ? -1 : 1;
  const edge = side < 0 ? 8 : width - hullWidth - 8;
  const bend = { x: edge, y: Math.min(height * 0.46, target.y + 90) };
  return bake([
    [start, { x: mix(start.x, edge, 0.3), y: start.y - Math.min(180, height * 0.24) }, { x: edge, y: height * 0.72 }, bend],
    [bend, { x: edge, y: target.y + 70 }, { x: target.x, y: target.y + 46 }, target]
  ], input.speed);
};

/** Shortest-angle, rate-limited yaw: nose-up pixel sprites follow the flight tangent. */
export const followFormationHeading = (previous: number | undefined, dx: number, dy: number, flying: boolean): number => {
  const desired = flying && Math.hypot(dx, dy) > 0.05 ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
  if (previous === undefined || !Number.isFinite(previous)) return desired;
  const delta = Math.atan2(Math.sin(desired - previous), Math.cos(desired - previous));
  return previous + clamp(delta, -0.16, 0.16);
};
