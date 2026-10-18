/** The CSS HUD occupies 48 physical pixels, including on the shortest phone. */
export function compactBossHealthLayout(width: number) {
  const frameWidth = Math.min(Math.max(210, Math.min(342, width * 0.76)), Math.max(180, width - 20));
  return { frameWidth, frameHeight: frameWidth * (143 / 737) * 0.58, y: 94 };
}

export const BOSS_STATUS_Y = 120;
export const BOSS_STATUS_TOP = 111;
export const BOSS_STATUS_HEIGHT = 19;
export const BOSS_INTRO_CARD_Y = 92;
export const BOSS_INTRO_CARD_HEIGHT = 58;
