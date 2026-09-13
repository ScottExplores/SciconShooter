export const OBSERVATION_SIZE = Object.freeze({ width: 96, height: 208 });

/** Integer BT.601 luminance, then nonoverlapping integer box means. No game metadata enters this path. */
export const rgbaToGray = (rgba: ArrayLike<number>, width: number, height: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 96 || height < 208 || rgba.length !== width * height * 4) {
    throw new Error('Expected a complete RGBA framebuffer at least 96 by 208 pixels.');
  }
  const gray = new Uint8Array(OBSERVATION_SIZE.width * OBSERVATION_SIZE.height);
  for (let y = 0; y < OBSERVATION_SIZE.height; y++) {
    const top = Math.floor(y * height / OBSERVATION_SIZE.height);
    const bottom = Math.floor((y + 1) * height / OBSERVATION_SIZE.height);
    for (let x = 0; x < OBSERVATION_SIZE.width; x++) {
      const left = Math.floor(x * width / OBSERVATION_SIZE.width);
      const right = Math.floor((x + 1) * width / OBSERVATION_SIZE.width);
      let total = 0;
      for (let sourceY = top; sourceY < bottom; sourceY++) {
        for (let sourceX = left; sourceX < right; sourceX++) {
          const offset = (sourceY * width + sourceX) * 4;
          total += (77 * rgba[offset] + 150 * rgba[offset + 1] + 29 * rgba[offset + 2] + 128) >> 8;
        }
      }
      gray[y * OBSERVATION_SIZE.width + x] = Math.round(total / ((bottom - top) * (right - left)));
    }
  }
  return gray;
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
};
