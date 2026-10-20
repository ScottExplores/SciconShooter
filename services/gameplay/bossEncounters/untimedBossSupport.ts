/**
 * Fights that have no authored timeline.
 *
 * The later commanders already run long clip timelines. The checkpoints and
 * the first two majors do not, so they fell through to one burst-then-beam
 * cycle. This module only decides the readable beats. The engine still owns
 * spawning, damage, and movement.
 */

export type UntimedBossBand = 0 | 1 | 2;

const PATTERN_NAMES: Readonly<Record<string, readonly [string, string, string]>> = Object.freeze({
  'bottleneck-drone': ['ORBIT', 'DIVE MARK', 'RUSH'],
  'paywall-wall': ['MARCH', 'COLUMN', 'GAP'],
  'gatekeeper-prime': ['CANNON WALK', 'CROSS LANE', 'CORE OPEN'],
  'fracture-engine-elite': ['SPINE', 'SHEAR', 'SPLIT'],
  'aegis-brood-core': ['BROOD', 'RING', 'CORE'],
  'paywall-decimator': ['WALL STEP', 'GAP HUNT', 'BREACH'],
  'railspine-wallcrawler': ['CRAWL', 'RAIL', 'DROP'],
  'maw-carrier': ['CARRY', 'BAY OPEN', 'RELEASE'],
  'twin-meridian-sentinels': ['PAIR', 'CROSS', 'BREAK'],
  'prism-bloom': ['BLOOM', 'FAN', 'SHED'],
  'aegis-convoy-captain': ['CONVOY', 'ESCORT', 'FLAG'],
  'gridline-sentries': ['GRID', 'LOCK', 'FIRE']
});

export const resolveUntimedBossBand = (healthRatio: number): UntimedBossBand => {
  const ratio = Number.isFinite(healthRatio) ? healthRatio : 1;
  if (ratio > 0.66) return 0;
  if (ratio > 0.33) return 1;
  return 2;
};

export const untimedBossPatternLabel = (bossId: string, band: UntimedBossBand) => {
  const row = PATTERN_NAMES[String(bossId || '')] ?? (['HOLD', 'FAN', 'RAM'] as const);
  return row[band];
};

/** A short window, after the first phase, where hull shots matter more. */
export const untimedBossWeakPointOpen = (band: UntimedBossBand, attackTimer: number) => {
  if (band < 1) return false;
  const tick = Math.max(0, Math.floor(attackTimer)) % 240;
  return tick >= 36 && tick < 96;
};

export const untimedBossShouldSummon = (previousBand: number, band: UntimedBossBand) => (
  previousBand >= 0 && band > previousBand
);

export const resolveUntimedFan = (attackTimer: number): 'telegraph' | 'fire' | null => {
  const timer = Math.floor(attackTimer);
  if (timer < 90) return null;
  const tick = timer % 220;
  if (tick === 0) return 'telegraph';
  if (tick === 24) return 'fire';
  return null;
};

/** Last two words of an authored phase id, short enough for a floating label. */
export const readableBossPhaseLabel = (phaseId: string | undefined) => {
  const parts = String(phaseId || 'pattern shift').split(/[-_\s]+/).filter(Boolean);
  const tail = (parts.length > 1 ? parts.slice(-2) : parts).join(' ');
  const label = tail.toUpperCase();
  return label.length > 18 ? label.slice(0, 18).trim() : label;
};
