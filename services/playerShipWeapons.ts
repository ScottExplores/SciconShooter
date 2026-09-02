/**
 * Hull primary-weapon identities.
 *
 * Scott's brief (2026-08-04): the paid hulls must each be better than the free
 * RSC ship in their OWN way, with BTC the strongest. Before this pass ETH and
 * BTC fired the RSC pulse with RSC art (their own projectile families only
 * appeared during a signature move or an Overdrive pickup), and BTC's gun was
 * byte-for-byte the free gun.
 *
 *   RSC  pulse column      1.00x per lane, 1 lane        the free baseline
 *   BIO  twin bio rails    0.58x per rail, 2 rails       different, +16%, rails
 *                                                        pierce from Tier 4
 *   ETH  prism spread      0.62x per lane, 3 lanes       up to 1.86x on a full
 *                                                        spread hit, best crowd
 *                                                        coverage
 *   BTC  hash bolt         2.10x, 1 heavy lane, pierces  15% slower cadence,
 *                          the first hull it meets       best single-target DPS
 *                                                        and punches through
 *                                                        lines
 *
 * Measured in the engine (probe, Fire Rate tier 1 -> 4): BIO 1.16-1.18x RSC,
 * ETH 1.86x with every lane landing (0.62x when only the centre lane does),
 * BTC 1.83x on the first target and about 3x on a line thanks to the pierce.
 * Overdrive amplifies whichever of these you fly.
 */
import type { PlayerShipId } from './playerShipService';

export type PlayerShipPrimaryWeaponKind = 'pulse' | 'bio-primary' | 'btc-bolt';

export interface PlayerShipWeaponProfile {
  readonly primaryKind: PlayerShipPrimaryWeaponKind;
  /** Multiplies the Fire Rate cadence interval; >1 fires slower. */
  readonly cadenceScale: number;
  /** Multiplies each lane's per-round damage (BIO rails use their own module). */
  readonly laneDamageScale: number;
  /** Hulls the primary round passes through before expiring. */
  readonly pierce: number;
  /** Fire Rate tier at which the primary round gains its pierce (BIO). */
  readonly pierceFromTier: number;
}

export const PLAYER_SHIP_WEAPON_PROFILES: Readonly<Record<PlayerShipId, PlayerShipWeaponProfile>> = Object.freeze({
  researchhub: { primaryKind: 'pulse', cadenceScale: 1, laneDamageScale: 1, pierce: 0, pierceFromTier: 99 },
  bio: { primaryKind: 'bio-primary', cadenceScale: 1, laneDamageScale: 1, pierce: 1, pierceFromTier: 4 },
  eth: { primaryKind: 'pulse', cadenceScale: 1, laneDamageScale: 0.62, pierce: 0, pierceFromTier: 99 },
  btc: { primaryKind: 'btc-bolt', cadenceScale: 1.15, laneDamageScale: 2.1, pierce: 1, pierceFromTier: 1 }
});

export const getPlayerShipWeaponProfile = (shipId: string): PlayerShipWeaponProfile => (
  PLAYER_SHIP_WEAPON_PROFILES[(shipId as PlayerShipId)] ?? PLAYER_SHIP_WEAPON_PROFILES.researchhub
);

/** BTC's heavy bolt: a wide, tall round that reads as a slab of gold. */
export const BTC_BOLT_WIDTH = 16;
export const BTC_BOLT_HEIGHT = 40;
export const BTC_BOLT_COLOR = '#fbbf24';
