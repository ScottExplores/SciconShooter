export const TRIPLE_SHOT_SIDE_ANGLE_MIN_DEGREES = 15;
export const TRIPLE_SHOT_SIDE_ANGLE_MAX_DEGREES = 20;

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);
const clampUnit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const sampleTripleShotSideAngleRadians = (
  side: -1 | 1,
  randomUnit: number
) => {
  const degrees = TRIPLE_SHOT_SIDE_ANGLE_MIN_DEGREES
    + clampUnit(randomUnit) * (TRIPLE_SHOT_SIDE_ANGLE_MAX_DEGREES - TRIPLE_SHOT_SIDE_ANGLE_MIN_DEGREES);
  return side * degreesToRadians(degrees);
};
