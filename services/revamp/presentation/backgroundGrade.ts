/** Preserve pixel edges and alpha; lower colour intensity without a live GPU filter. */
export const BACKGROUND_DESATURATION = 0.4;

export function desaturateBackgroundPixels(data: Uint8ClampedArray) {
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    for (let channel = 0; channel < 3; channel++) {
      data[index + channel] += (luminance - data[index + channel]) * BACKGROUND_DESATURATION;
    }
  }
}
