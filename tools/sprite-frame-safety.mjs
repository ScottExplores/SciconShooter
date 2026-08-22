const NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
]);

const isOpaque = (png, x, y) => png.data[(y * png.width + x) * 4 + 3] > 0;

export const analyzeOpaqueComponents = (png, bounds = {}) => {
  const left = Math.max(0, Math.floor(bounds.left ?? 0));
  const top = Math.max(0, Math.floor(bounds.top ?? 0));
  const right = Math.min(png.width - 1, Math.floor(bounds.right ?? png.width - 1));
  const bottom = Math.min(png.height - 1, Math.floor(bounds.bottom ?? png.height - 1));
  const visited = new Uint8Array(png.width * png.height);
  const components = [];

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const startIndex = y * png.width + x;
      if (visited[startIndex] || !isOpaque(png, x, y)) continue;

      const stack = [startIndex];
      const pixels = [];
      visited[startIndex] = 1;
      let minimumX = x;
      let maximumX = x;
      let minimumY = y;
      let maximumY = y;

      while (stack.length > 0) {
        const pixelIndex = stack.pop();
        const pixelX = pixelIndex % png.width;
        const pixelY = Math.floor(pixelIndex / png.width);
        pixels.push(pixelIndex);
        minimumX = Math.min(minimumX, pixelX);
        maximumX = Math.max(maximumX, pixelX);
        minimumY = Math.min(minimumY, pixelY);
        maximumY = Math.max(maximumY, pixelY);

        for (const [offsetX, offsetY] of NEIGHBOR_OFFSETS) {
          const neighborX = pixelX + offsetX;
          const neighborY = pixelY + offsetY;
          if (
            neighborX < left
            || neighborX > right
            || neighborY < top
            || neighborY > bottom
          ) continue;
          const neighborIndex = neighborY * png.width + neighborX;
          if (visited[neighborIndex] || !isOpaque(png, neighborX, neighborY)) continue;
          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        }
      }

      components.push(Object.freeze({
        pixelCount: pixels.length,
        pixels: Object.freeze(pixels),
        bounds: Object.freeze({
          x: minimumX,
          y: minimumY,
          width: maximumX - minimumX + 1,
          height: maximumY - minimumY + 1
        })
      }));
    }
  }

  return components.sort((first, second) => second.pixelCount - first.pixelCount);
};

export const keepLargestOpaqueComponent = (png, bounds = {}, options = {}) => {
  const components = analyzeOpaqueComponents(png, bounds);
  if (components.length === 0) {
    throw new Error('Sprite frame contains no opaque structural pixels.');
  }

  const largest = components[0];
  const maximumDetachedRatio = Number(options.maximumDetachedRatio ?? 0.15);
  const oversizedDetached = components.slice(1).find(
    (component) => component.pixelCount / largest.pixelCount > maximumDetachedRatio
  );
  if (oversizedDetached) {
    throw new Error(
      `Sprite frame contains a second subject occupying ${(
        oversizedDetached.pixelCount / largest.pixelCount * 100
      ).toFixed(1)}% of the primary subject.`
    );
  }

  for (const component of components.slice(1)) {
    for (const pixelIndex of component.pixels) {
      const offset = pixelIndex * 4;
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
      png.data[offset + 3] = 0;
    }
  }

  return Object.freeze({
    primary: largest,
    discardedComponentCount: Math.max(0, components.length - 1),
    discardedPixelCount: components.slice(1).reduce(
      (total, component) => total + component.pixelCount,
      0
    )
  });
};

export const assertTransparentFrameMargin = (png, marginPixels = 4) => {
  const margin = Math.max(1, Math.floor(marginPixels));
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (!isOpaque(png, x, y)) continue;
      if (
        x < margin
        || y < margin
        || x >= png.width - margin
        || y >= png.height - margin
      ) {
        throw new Error(
          `Sprite frame has opaque pixels inside its ${margin}px safety margin at ${x},${y}.`
        );
      }
    }
  }
};

export const assertTransparentFrameGutters = (png, frameCount, gutterPixels = 4) => {
  const count = Math.max(2, Math.floor(frameCount));
  const halfGutter = Math.max(1, Math.floor(gutterPixels));
  for (let frameIndex = 1; frameIndex < count; frameIndex += 1) {
    const boundaryX = Math.floor(frameIndex * png.width / count);
    const left = Math.max(0, boundaryX - halfGutter);
    const right = Math.min(png.width - 1, boundaryX + halfGutter - 1);
    let opaquePixelCount = 0;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (isOpaque(png, x, y)) opaquePixelCount += 1;
      }
    }
    if (opaquePixelCount > 0) {
      throw new Error(
        `Sprite-sheet divider ${frameIndex}/${count} at x=${boundaryX} contains ${opaquePixelCount} opaque pixels inside its ${halfGutter}px gutter.`
      );
    }
  }
};

export const calculateOpaqueCentroid = (png) => {
  let opaquePixelCount = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (!isOpaque(png, x, y)) continue;
      opaquePixelCount += 1;
      weightedX += x;
      weightedY += y;
    }
  }
  if (opaquePixelCount === 0) throw new Error('Sprite frame contains no opaque pixels.');
  return Object.freeze({
    x: weightedX / opaquePixelCount,
    y: weightedY / opaquePixelCount,
    opaquePixelCount
  });
};
