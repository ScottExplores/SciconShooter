/**
 * Projectile Upgrade: the in-mission gun upgrade (runtime type OVERDRIVE).
 *
 * The double/triple-shot pickups used to bolt extra fire lanes onto whatever
 * ship you flew, which erased each hull's weapon identity -- every ship ended
 * up firing the same fan. Now the fire pattern belongs to the hull (ETH is the
 * triple-spread ship, using the authored 15-20 degree side lanes), and the
 * pickup instead amplifies the ship's OWN projectiles: bigger, stronger, and a
 * new colour at every level.
 *
 * Projectile Upgrade is deliberately temporary: it stacks to five within the current
 * Mission and resets at the Mission boundary, so it is a run of good play, not
 * a permanent stat. Hangar upgrades are the permanent layer.
 */

export const WEAPON_OVERDRIVE_MAX_LEVEL = 5;

export interface WeaponOverdriveTier {
  readonly level: number;
  /** Multiplies the shot's damage. */
  readonly damageScale: number;
  /** Multiplies the projectile's width and height. */
  readonly sizeScale: number;
  /** Overrides the projectile colour; null keeps the hull's own colour. */
  readonly color: string | null;
  readonly label: string;
}

/**
 * Level 0 is the hull's native gun. The colour ladder runs cool to hot so a
 * glance at your own fire tells you the current level.
 */
export const WEAPON_OVERDRIVE_TIERS: readonly WeaponOverdriveTier[] = Object.freeze([
  // The ladder replaces the old spread pickup, which effectively TRIPLED
  // damage output while active. At the first cautious ladder (1.15..1.8) the
  // Campaign matrix collapsed to 429 clears / 169 deaths because mid-run DPS
  // fell by more than half; three stacks now roughly match the old spread and
  // a full five-stack run overtakes it, which is what "super upgrade" means.
  { level: 0, damageScale: 1, sizeScale: 1, color: null, label: 'Base' },
  { level: 1, damageScale: 1.35, sizeScale: 1.12, color: '#7dd3fc', label: 'Projectile Upgrade I' },
  { level: 2, damageScale: 1.75, sizeScale: 1.24, color: '#4ade80', label: 'Projectile Upgrade II' },
  { level: 3, damageScale: 2.2, sizeScale: 1.36, color: '#facc15', label: 'Projectile Upgrade III' },
  { level: 4, damageScale: 2.7, sizeScale: 1.48, color: '#fb923c', label: 'Projectile Upgrade IV' },
  { level: 5, damageScale: 3.25, sizeScale: 1.6, color: '#f472b6', label: 'Projectile Upgrade V' }
]);

export const getWeaponOverdriveTier = (level: number): WeaponOverdriveTier => (
  WEAPON_OVERDRIVE_TIERS[
    Math.max(0, Math.min(WEAPON_OVERDRIVE_MAX_LEVEL, Math.floor(Number(level) || 0)))
  ]
);

export interface WeaponOverdriveProjectileGeometry {
  readonly unitWidth: number;
  readonly unitHeight: number;
  readonly bundleWidth: number;
}

/**
 * Scale the authored projectile itself while leaving a multi-round bundle's
 * lane offsets untouched. Scaling the whole bundle would push spread/Max Shot
 * lanes farther apart and create an invisible collision radius, which is not
 * what Projectile Upgrade promises.
 */
export const getWeaponOverdriveProjectileGeometry = (
  baseUnitWidth: number,
  baseUnitHeight: number,
  visualHalfSpan: number,
  level: number
): WeaponOverdriveProjectileGeometry => {
  const tier = getWeaponOverdriveTier(level);
  const unitWidth = Math.max(1, Math.round(baseUnitWidth * tier.sizeScale));
  const unitHeight = Math.max(1, Math.round(baseUnitHeight * tier.sizeScale));
  return {
    unitWidth,
    unitHeight,
    bundleWidth: unitWidth + Math.max(0, visualHalfSpan) * 2
  };
};

/**
 * Each hull's primary-weapon identity, shown in the Hangar weapon details.
 * The pattern is the ship, and Overdrive amplifies it rather than replacing it.
 */
export const PLAYER_SHIP_WEAPON_SPECS: Readonly<Record<string, string>> = Object.freeze({
  researchhub: 'Pulse column - one tight centre lane, fastest tier ramp',
  bio: 'Bio volley - staggered twin lanes with piercing rounds',
  eth: 'Prism spread - triple lanes, sides angled 15-20 degrees',
  btc: 'Hash bolt - heavy centre lane, widest single projectile'
});
