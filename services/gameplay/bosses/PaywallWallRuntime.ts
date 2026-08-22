export const PAYWALL_WALL_MARCH_STEP_PIXELS = 2;
export const PAYWALL_WALL_MARCH_STEP_FRAMES = 4;

export const resolvePaywallWallColumnCount = ({
  arenaWidth,
  wave
}: Readonly<{
  arenaWidth: number;
  wave: number;
}>) => {
  const mobile = Number.isFinite(arenaWidth) && arenaWidth < 600;
  const authoredWave = Math.max(1, Math.floor(Number(wave) || 1));
  return Math.min(mobile ? 6 : 8, 4 + authoredWave);
};

export const samplePaywallWallMarchOffset = ({
  frameCount,
  startFrame,
  amplitude,
  stepPixels = PAYWALL_WALL_MARCH_STEP_PIXELS,
  stepFrames = PAYWALL_WALL_MARCH_STEP_FRAMES
}: Readonly<{
  frameCount: number;
  startFrame: number;
  amplitude: number;
  stepPixels?: number;
  stepFrames?: number;
}>) => {
  const safeAmplitude = Math.max(0, Number.isFinite(amplitude) ? amplitude : 0);
  const safeStepPixels = Math.max(1, Math.floor(Number(stepPixels) || 1));
  const safeStepFrames = Math.max(1, Math.floor(Number(stepFrames) || 1));
  if (safeAmplitude === 0) return 0;

  const stepsPerLeg = Math.max(1, Math.floor(safeAmplitude / safeStepPixels));
  const cycleSteps = stepsPerLeg * 4;
  const elapsedFrames = Math.max(
    0,
    Math.floor(Number(frameCount) || 0) - Math.floor(Number(startFrame) || 0)
  );
  const cycleStep = Math.floor(elapsedFrames / safeStepFrames) % cycleSteps;
  const signedStep = cycleStep <= stepsPerLeg
    ? cycleStep
    : cycleStep <= stepsPerLeg * 3
      ? stepsPerLeg * 2 - cycleStep
      : cycleStep - stepsPerLeg * 4;

  return Math.max(-safeAmplitude, Math.min(safeAmplitude, signedStep * safeStepPixels));
};
