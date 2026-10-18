import { bakeSpline, clamp, type Cubic, type Point, type TimedSpline } from './spline';

export interface GalagaDiveInput {
  start: Point;
  target: Point;
  /** Immutable grid slot; start may contain the hold animation's sway offset. */
  returnSlot?: Point;
  world: { width: number; height: number };
  speedPerSecond: number;
  cycle: number;
  escortPosition?: -1 | 0 | 1;
}
export interface GalagaDive {
  spline: TimedSpline;
  shotAtSeconds: number;
}

/** Target is committed at peel-off. Steering never tracks a dodging player. */
export const createGalagaDive = (input: GalagaDiveInput): GalagaDive => {
  const { start, world: { width: w, height: h }, target } = input;
  const returnSlot = input.returnSlot ?? start;
  const side = input.cycle % 2 === 0 ? -1 : 1;
  const wing = input.escortPosition ?? 0;
  const margin = Math.min(44, w * 0.1);
  const shoulder = { x: clamp(start.x + side * w * 0.21, margin, w - margin), y: Math.max(24, start.y - h * 0.065) };
  const bottom = { x: clamp(target.x + wing * Math.min(28, w * 0.07), margin + w * 0.14, w * 0.86 - margin),
    y: clamp(target.y - h * 0.18, h * 0.48, h * 0.68) - Math.abs(wing) * 16 };
  const returnShoulder = { x: clamp(bottom.x + side * w * 0.24, margin, w - margin),
    y: Math.min(returnSlot.y + h * 0.1, bottom.y - h * 0.1) };
  const curves: Cubic[] = [
    [start, { x: start.x, y: shoulder.y }, { x: shoulder.x - side * w * 0.09, y: shoulder.y }, shoulder],
    [shoulder, { x: shoulder.x + side * w * 0.09, y: shoulder.y }, { x: bottom.x - side * w * 0.17, y: bottom.y }, bottom],
    [bottom, { x: bottom.x + side * w * 0.17, y: bottom.y }, { x: returnShoulder.x, y: returnShoulder.y + h * 0.16 }, returnShoulder],
    [returnShoulder, { x: returnShoulder.x, y: returnShoulder.y - h * 0.08 },
      { x: returnSlot.x, y: returnSlot.y + h * 0.07 }, returnSlot]
  ];
  const spline = bakeSpline(curves, input.speedPerSecond);
  return { spline, shotAtSeconds: spline.segmentEnds[1] / Math.max(1, input.speedPerSecond) };
};

/** Small monotone adjustments; the floor preserves a readable safe interval. */
export const resolveDiveCadenceSeconds = (input: { waveProgress: number; difficultyTier: number; mission?: number }): number => {
  const progress = clamp(input.waveProgress, 0, 1);
  const tier = clamp(Math.floor(input.difficultyTier), 0, 3);
  const mission = Math.max(1, input.mission ?? 1);
  return Math.max(2.1, 5.4 - progress * 1.35 - tier * 0.55 - Math.min(0.75, (mission - 1) * 0.05));
};

/** A crossing test emits exactly one shot even with uneven update batches. */
export const crossedDiveShot = (previousAge: number, age: number, shotAtAge: number): boolean => (
  previousAge < shotAtAge && age >= shotAtAge
);
