/**
 * This branch is the Google Play shell, served from its own origin
 * (https://scicon-play.vercel.app). The flag stays on so wallet, purchase,
 * and on-chain surfaces remain in source for merges from main and do not render.
 */
export const PLAY_BUILD = true;

export const PLAY_ANDROID_PACKAGE = 'xyz.sciconshooter.play';

export const PLAY_ORIGIN = 'https://scicon-play.vercel.app';

const PLAY_SHIP_LABELS: Record<string, string> = {
  researchhub: 'Research ship',
  bio: 'NIH',
  eth: 'Prism ship',
  btc: 'Solar ship'
};

/** Visible hull name. Art and ids stay; ticker words do not. */
export const playShipLabel = (shipId: string, fallback: string): string => (
  PLAY_BUILD ? (PLAY_SHIP_LABELS[shipId] ?? fallback) : fallback
);
