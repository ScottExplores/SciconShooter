/**
 * Competitive playfield.
 *
 * Campaign score, Weekly score, and boss patterns must not change because a
 * desktop window is wider than a phone. Live play simulates one portrait
 * arena. The canvas is letterboxed inside the host; pointer mapping uses the
 * canvas box, so a tap on either device addresses the same world point.
 * Boss-sandbox previews keep their own viewport.
 */

export const FAIR_ARENA_WIDTH = 390;
export const FAIR_ARENA_HEIGHT = 844;

export interface FairArenaFrame {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
}

export const resolveFairArenaFrame = (
  hostWidth: number,
  hostHeight: number
): FairArenaFrame => {
  const displayWidth = Math.max(1, Math.round(Number(hostWidth) || FAIR_ARENA_WIDTH));
  const displayHeight = Math.max(1, Math.round(Number(hostHeight) || FAIR_ARENA_HEIGHT));
  const scale = Math.min(
    displayWidth / FAIR_ARENA_WIDTH,
    displayHeight / FAIR_ARENA_HEIGHT
  );
  const fittedWidth = FAIR_ARENA_WIDTH * scale;
  const fittedHeight = FAIR_ARENA_HEIGHT * scale;
  return {
    worldWidth: FAIR_ARENA_WIDTH,
    worldHeight: FAIR_ARENA_HEIGHT,
    displayWidth: Math.max(1, Math.round(fittedWidth)),
    displayHeight: Math.max(1, Math.round(fittedHeight)),
    offsetX: Math.max(0, Math.round((displayWidth - fittedWidth) / 2)),
    offsetY: Math.max(0, Math.round((displayHeight - fittedHeight) / 2)),
    scale
  };
};

export const applyFairArenaCanvasFrame = (
  canvas: HTMLCanvasElement,
  frame: FairArenaFrame
) => {
  canvas.style.position = 'absolute';
  canvas.style.width = `${frame.displayWidth}px`;
  canvas.style.height = `${frame.displayHeight}px`;
  canvas.style.left = `${frame.offsetX}px`;
  canvas.style.top = `${frame.offsetY}px`;
  canvas.style.maxWidth = 'none';
  canvas.style.maxHeight = 'none';
};
