export interface BossCollisionMask {
  readonly width: number;
  readonly height: number;
  /**
   * Row-major 32-bit occupancy words. Bit 0 is the left-most cell in each
   * word. Masks are generated from source PNG alpha, never from Pixi bounds.
   */
  readonly rowWords: readonly number[];
}

export interface BossCollisionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const isOccupied = (
  mask: BossCollisionMask,
  column: number,
  row: number
) => {
  const wordsPerRow = Math.ceil(mask.width / 32);
  const word = mask.rowWords[row * wordsPerRow + Math.floor(column / 32)] ?? 0;
  return (word & (1 << (column % 32))) !== 0;
};

const clampCell = (value: number, maximum: number) => (
  Math.max(0, Math.min(maximum, value))
);

/**
 * Tests an axis-aligned projectile box against a generated alpha silhouette.
 *
 * The source art is reduced to a 64x64 occupancy grid during authoring. At
 * runtime only the small row/column range underneath the projectile is read,
 * keeping the check bounded on mobile while still rejecting transparent
 * corners, limb gaps, ring centers, and empty space between weapons.
 */
export const intersectsBossCollisionMask = (
  mask: BossCollisionMask,
  bossBounds: BossCollisionBounds,
  projectileBounds: BossCollisionBounds,
  rotationRadians: number = 0
) => {
  if (
    mask.width <= 0
    || mask.height <= 0
    || bossBounds.width <= 0
    || bossBounds.height <= 0
    || projectileBounds.width <= 0
    || projectileBounds.height <= 0
  ) {
    return false;
  }

  const bossCenterX = bossBounds.x + bossBounds.width / 2;
  const bossCenterY = bossBounds.y + bossBounds.height / 2;
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const projectileCorners = [
    [projectileBounds.x, projectileBounds.y],
    [projectileBounds.x + projectileBounds.width, projectileBounds.y],
    [projectileBounds.x, projectileBounds.y + projectileBounds.height],
    [
      projectileBounds.x + projectileBounds.width,
      projectileBounds.y + projectileBounds.height
    ]
  ] as const;

  let minimumLocalX = Number.POSITIVE_INFINITY;
  let maximumLocalX = Number.NEGATIVE_INFINITY;
  let minimumLocalY = Number.POSITIVE_INFINITY;
  let maximumLocalY = Number.NEGATIVE_INFINITY;
  for (const [worldX, worldY] of projectileCorners) {
    const offsetX = worldX - bossCenterX;
    const offsetY = worldY - bossCenterY;
    const localX = offsetX * cosine + offsetY * sine + bossBounds.width / 2;
    const localY = -offsetX * sine + offsetY * cosine + bossBounds.height / 2;
    minimumLocalX = Math.min(minimumLocalX, localX);
    maximumLocalX = Math.max(maximumLocalX, localX);
    minimumLocalY = Math.min(minimumLocalY, localY);
    maximumLocalY = Math.max(maximumLocalY, localY);
  }

  if (
    maximumLocalX < 0
    || minimumLocalX > bossBounds.width
    || maximumLocalY < 0
    || minimumLocalY > bossBounds.height
  ) {
    return false;
  }

  const cellWidth = bossBounds.width / mask.width;
  const cellHeight = bossBounds.height / mask.height;
  const startColumn = clampCell(
    Math.floor(minimumLocalX / cellWidth) - 1,
    mask.width - 1
  );
  const endColumn = clampCell(
    Math.floor(maximumLocalX / cellWidth) + 1,
    mask.width - 1
  );
  const startRow = clampCell(
    Math.floor(minimumLocalY / cellHeight) - 1,
    mask.height - 1
  );
  const endRow = clampCell(
    Math.floor(maximumLocalY / cellHeight) + 1,
    mask.height - 1
  );
  const rotatedCellHalfWidth = (
    Math.abs(cosine) * cellWidth + Math.abs(sine) * cellHeight
  ) / 2;
  const rotatedCellHalfHeight = (
    Math.abs(sine) * cellWidth + Math.abs(cosine) * cellHeight
  ) / 2;

  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      if (!isOccupied(mask, column, row)) continue;

      const localCenterX = (column + 0.5) * cellWidth - bossBounds.width / 2;
      const localCenterY = (row + 0.5) * cellHeight - bossBounds.height / 2;
      const worldCenterX =
        bossCenterX + localCenterX * cosine - localCenterY * sine;
      const worldCenterY =
        bossCenterY + localCenterX * sine + localCenterY * cosine;
      if (
        worldCenterX + rotatedCellHalfWidth >= projectileBounds.x
        && worldCenterX - rotatedCellHalfWidth
          <= projectileBounds.x + projectileBounds.width
        && worldCenterY + rotatedCellHalfHeight >= projectileBounds.y
        && worldCenterY - rotatedCellHalfHeight
          <= projectileBounds.y + projectileBounds.height
      ) {
        return true;
      }
    }
  }

  return false;
};
