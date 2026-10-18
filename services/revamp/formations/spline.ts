/** Pure geometry in simulation-world coordinates. No viewport/device flags. */
export interface Point { x: number; y: number }
export type Cubic = readonly [Point, Point, Point, Point];
export interface TimedSpline {
  readonly points: readonly Point[];
  readonly distances: readonly number[];
  readonly segmentEnds: readonly number[];
  readonly length: number;
  readonly durationSeconds: number;
}
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const cubicPoint = ([p0, p1, p2, p3]: Cubic, t: number): Point => {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y
  };
};

/** Catmull-Rom knots become C1 continuous cubic Beziers, with exact endpoints. */
export const catmullRomCurves = (knots: readonly Point[], tension = 1): Cubic[] => {
  const result: Cubic[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const before = knots[Math.max(0, i - 1)];
    const start = knots[i];
    const end = knots[i + 1];
    const after = knots[Math.min(knots.length - 1, i + 2)];
    result.push([start,
      { x: start.x + (end.x - before.x) * tension / 6, y: start.y + (end.y - before.y) * tension / 6 },
      { x: end.x - (after.x - start.x) * tension / 6, y: end.y - (after.y - start.y) * tension / 6 }, end]);
  }
  return result;
};

/** Bake once; equal elapsed time then covers equal distance, including loops. */
export const bakeSpline = (curves: readonly Cubic[], speedPerSecond: number): TimedSpline => {
  if (!curves.length) throw new Error('A spline requires at least one curve');
  const points: Point[] = [{ ...curves[0][0] }];
  const distances = [0];
  const segmentEnds: number[] = [];
  let length = 0;
  for (const curve of curves) {
    for (let step = 1; step <= 64; step++) {
      const point = cubicPoint(curve, step / 64);
      const previous = points[points.length - 1];
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      points.push(point);
      distances.push(length);
    }
    segmentEnds.push(length);
  }
  return { points, distances, segmentEnds, length, durationSeconds: length / Math.max(1, speedPerSecond) };
};

export const sampleSplineDistance = (spline: TimedSpline, distance: number): Point => {
  if (distance <= 0 || spline.length === 0) return { ...spline.points[0] };
  if (distance >= spline.length) return { ...spline.points[spline.points.length - 1] };
  let low = 1;
  let high = spline.distances.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (spline.distances[mid] < distance) low = mid + 1;
    else high = mid;
  }
  const before = spline.distances[low - 1];
  const t = (distance - before) / Math.max(0.00001, spline.distances[low] - before);
  return {
    x: mix(spline.points[low - 1].x, spline.points[low].x, t),
    y: mix(spline.points[low - 1].y, spline.points[low].y, t)
  };
};

export const sampleTimedSpline = (spline: TimedSpline, elapsedSeconds: number): Point => (
  sampleSplineDistance(spline, clamp(elapsedSeconds / Math.max(0.00001, spline.durationSeconds), 0, 1) * spline.length)
);
