/** Orbitron bold is wide, and the renderer adds 1px of letter-spacing. Estimate high so the clamp stays inside the screen. */
const FLOATING_LABEL_EM_WIDTH = 0.92;
const FLOATING_LABEL_LETTER_SPACING = 1;

export const FLOATING_LABEL_SAFE_INSET = 8;

export const estimateFloatingLabelWidth = (text: string, fontSize: number) => {
  const letters = Array.from(text).length;
  if (letters <= 0 || fontSize <= 0) return 0;
  return letters * fontSize * FLOATING_LABEL_EM_WIDTH + Math.max(0, letters - 1) * FLOATING_LABEL_LETTER_SPACING;
};

export const clampFloatingLabelCenter = (
  centerX: number,
  text: string,
  fontSize: number,
  viewportWidth: number,
  inset = FLOATING_LABEL_SAFE_INSET
) => {
  if (!Number.isFinite(centerX)) return 0;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= inset * 2) return centerX;
  const labelWidth = estimateFloatingLabelWidth(text, fontSize);
  if (labelWidth >= viewportWidth - inset * 2) return viewportWidth / 2;
  const half = labelWidth / 2;
  const minCenter = inset + half;
  const maxCenter = viewportWidth - inset - half;
  return Math.max(minCenter, Math.min(maxCenter, centerX));
};
