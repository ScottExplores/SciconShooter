/**
 * What an enemy actually *does* once it reaches the field.
 *
 * The role catalog already described where an enemy enters from
 * (`entryBehavior`) and when it is allowed to shoot (`fireBehavior`), but every
 * hostile ultimately ran the same loop: hold the slot, peel off, dive, fly
 * offscreen, re-enter, repeat. So a swarm body, a wall sniper, and an armoured
 * heavy all read as "the thing flying at me".
 *
 * A characteristic is the missing piece: the policy that decides whether a hull
 * ever leaves formation, whether it commits or returns, and how it moves while
 * it is holding. Waves are composed from these, which is what lets a wave be
 * "a grid of holders with two kamikazes and a pair of flankers" rather than a
 * pile of interchangeable ships.
 */

export type EnemyCharacteristic =
  /** Never leaves the block. Fires down its lane and is killed where it sits. */
  | 'holder'
  /** Classic peel-off: dives the player, flies past, loops back into the block. */
  | 'diver'
  /** Commits. Accelerates at the player and does not return. */
  | 'kamikaze'
  /** Enters from a side and slides across the field instead of holding a slot. */
  | 'flanker'
  /** Holds high, sliding laterally, and lobs aimed fire. Never dives. */
  | 'artillery'
  /** Leads the block: when it dives, the units around it go with it. */
  | 'commander';

export const ENEMY_CHARACTERISTICS: readonly EnemyCharacteristic[] = Object.freeze([
  'holder',
  'diver',
  'kamikaze',
  'flanker',
  'artillery',
  'commander'
]);

export interface EnemyCharacteristicProfile {
  readonly id: EnemyCharacteristic;
  readonly label: string;
  readonly summary: string;
  /** May this hull ever leave its formation slot? */
  readonly divesFromFormation: boolean;
  /** After diving, does it loop back into the block, or is the dive one-way? */
  readonly returnsToFormation: boolean;
  /** Does the dive steer toward where the player actually is? */
  readonly tracksPlayer: boolean;
  /** Lateral drift while holding, in pixels. Zero holds a rigid block. */
  readonly holdStrafePixels: number;
  /** Pulls nearby formation members into its dive. */
  readonly leadsFormation: boolean;
  /**
   * Multiplies the authored shot interval. Below 1 fires faster.
   *
   * A hull that never leaves the block has to threaten the player with fire,
   * or it is just scenery -- when only the divers pressured the player, the
   * Campaign clear rate jumped from 88% to 94%.
   */
  readonly fireIntervalScale: number;
}

export const ENEMY_CHARACTERISTIC_PROFILES:
Readonly<Record<EnemyCharacteristic, EnemyCharacteristicProfile>> = Object.freeze({
  holder: {
    id: 'holder',
    label: 'Holder',
    summary: 'Holds the block and fires down its lane. Never dives.',
    divesFromFormation: false,
    returnsToFormation: false,
    tracksPlayer: false,
    holdStrafePixels: 0,
    leadsFormation: false,
    fireIntervalScale: 1
  },
  diver: {
    id: 'diver',
    label: 'Diver',
    summary: 'Peels out of the block, dives past the player, loops back in.',
    divesFromFormation: true,
    returnsToFormation: true,
    tracksPlayer: true,
    holdStrafePixels: 0,
    leadsFormation: false,
    fireIntervalScale: 1.25
  },
  kamikaze: {
    id: 'kamikaze',
    label: 'Kamikaze',
    summary: 'Commits at the player and does not come back.',
    divesFromFormation: true,
    returnsToFormation: false,
    tracksPlayer: true,
    holdStrafePixels: 0,
    leadsFormation: false,
    fireIntervalScale: 1.4
  },
  flanker: {
    id: 'flanker',
    label: 'Flanker',
    summary: 'Comes in from the side and slides across the field.',
    divesFromFormation: true,
    returnsToFormation: true,
    tracksPlayer: false,
    holdStrafePixels: 26,
    leadsFormation: false,
    fireIntervalScale: 1.05
  },
  artillery: {
    id: 'artillery',
    label: 'Artillery',
    summary: 'Holds high, drifts sideways, lobs aimed fire. Never dives.',
    divesFromFormation: false,
    returnsToFormation: false,
    tracksPlayer: false,
    holdStrafePixels: 18,
    leadsFormation: false,
    fireIntervalScale: 0.66
  },
  commander: {
    id: 'commander',
    label: 'Commander',
    summary: 'Leads the block: when it dives, its neighbours dive with it.',
    divesFromFormation: true,
    returnsToFormation: true,
    tracksPlayer: true,
    holdStrafePixels: 0,
    leadsFormation: true,
    fireIntervalScale: 0.9
  }
});

const isCharacteristic = (value: unknown): value is EnemyCharacteristic => (
  typeof value === 'string' && (ENEMY_CHARACTERISTICS as readonly string[]).includes(value)
);

/**
 * Resolves a hull's characteristic, falling back to its legacy role/entry data.
 *
 * Legacy and arcade enemies carry no characteristic at all, and must keep
 * behaving exactly as they did, so the fallback reproduces the old universal
 * dive loop rather than inventing a policy.
 */
export const resolveEnemyCharacteristic = (
  characteristic: unknown,
  fallback?: { role?: string; entryBehavior?: string }
): EnemyCharacteristic => {
  if (isCharacteristic(characteristic)) return characteristic;
  if (fallback?.entryBehavior === 'dive') return 'kamikaze';
  if (fallback?.entryBehavior === 'flank') return 'flanker';
  if (fallback?.role === 'formation-leader') return 'commander';
  return 'diver';
};

export const getEnemyCharacteristicProfile = (
  characteristic: unknown,
  fallback?: { role?: string; entryBehavior?: string }
): EnemyCharacteristicProfile => (
  ENEMY_CHARACTERISTIC_PROFILES[resolveEnemyCharacteristic(characteristic, fallback)]
);
