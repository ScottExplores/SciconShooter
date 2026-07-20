export const RESEARCH_CHARGE_FRAME_URLS = Array.from(
  { length: 6 },
  (_, index) => `/game-art/legacy/weapon-fx/research-charge/charged${index + 1}.png`
);

export const RESEARCH_IMPACT_FRAME_URLS = Array.from(
  { length: 7 },
  (_, index) => `/game-art/legacy/weapon-fx/research-impact/hits-5-${index + 1}.png`
);

export const RESEARCH_CHARGE_ICON_URL = RESEARCH_CHARGE_FRAME_URLS[5];
export const RESEARCH_CHARGE_COOLDOWN_FRAMES = 16 * 60;
export const RESEARCH_CHARGE_COOLDOWN_SECONDS = 16;
export const RESEARCH_CHARGE_BLAST_RADIUS = 124;

