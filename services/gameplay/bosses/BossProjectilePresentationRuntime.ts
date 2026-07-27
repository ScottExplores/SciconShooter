export type BossPixelProjectileVisualKind =
  | 'boss-pixel-pink'
  | 'boss-pixel-gold'
  | 'boss-pixel-prism';

/**
 * Semantic projectile roles that a preview-only modular boss may skin with
 * frames from its own registered atlas. Gameplay owns these role names while
 * Pixi remains responsible for choosing and presenting the authored frames.
 */
export const BOSS_MODULAR_PROJECTILE_VISUAL_KINDS = [
  'boss-heavy-shell',
  'boss-gatling-tracer',
  'boss-reactor-pellet',
  'boss-helios-mine',
  'boss-prism-feather',
  'boss-prism-cocoon',
  'boss-prism-broodling'
] as const;

export type BossModularProjectileVisualKind =
  (typeof BOSS_MODULAR_PROJECTILE_VISUAL_KINDS)[number];

const GOLD_PROJECTILE_COLORS = new Set([
  '#ff9d2e',
  '#f59e0b',
  '#f97316',
  '#fbbf24',
  '#facc15',
  '#fdba74'
]);

const PRISM_PROJECTILE_COLORS = new Set([
  '#22d3ee',
  '#38bdf8',
  '#67e8f9',
  '#7c3aed',
  '#a855f7',
  '#c084fc',
  '#e879f9',
  '#f0abfc'
]);

/**
 * Gives authored boss bullets a stable semantic presentation role. Campaign
 * rendering remains unchanged unless a preview explicitly supplies the local
 * pixel VFX atlas; the simulation never reads this value back.
 */
export const resolveBossPixelProjectileVisualKind = (
  color: string
): BossPixelProjectileVisualKind => {
  const normalizedColor = String(color).toLowerCase();
  if (GOLD_PROJECTILE_COLORS.has(normalizedColor)) return 'boss-pixel-gold';
  if (PRISM_PROJECTILE_COLORS.has(normalizedColor)) return 'boss-pixel-prism';
  return 'boss-pixel-pink';
};
