/**
 * Sector signatures.
 *
 * Campaign roles already include divers, holders, flankers, artillery, and
 * kamikaze. From sector 4 onward the mix barely changes, so a late wave still
 * reads as the same block. A signature is a deterministic extra behavior for
 * that sector. It does not replace authored entry paths or packs.
 */

export type SectorSignature = 'diver' | 'shielded' | 'splitter' | 'kamikaze' | 'turret';

const ORDER: readonly SectorSignature[] = Object.freeze([
  'diver',
  'shielded',
  'splitter',
  'kamikaze',
  'turret'
]);

const hashEvent = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

export const resolveSectorIndex = (levelId: string | undefined, stageNumber: number) => {
  const weekly = /^weekly-run-stage-(\d+)$/.exec(String(levelId || ''));
  if (weekly) return Math.max(1, Number(weekly[1]) || 1);
  return Math.max(1, Math.floor(Number(stageNumber) || 1));
};

/**
 * Most of a squadron uses the sector signature. Every fourth hull borrows a
 * second signature from the event id, so a wave is a mix rather than a clone.
 */
export const resolveSectorSignature = (
  sector: number,
  eventId: string,
  spawnIndex: number
): SectorSignature => {
  const safeSector = Math.max(1, Math.floor(Number(sector) || 1));
  const base = ORDER[(safeSector - 1) % ORDER.length];
  if (Math.max(0, Math.floor(spawnIndex)) % 4 !== 3) return base;
  return ORDER[(hashEvent(String(eventId || 'squad')) + safeSector) % ORDER.length];
};

export const signatureAppliesTo = (
  signature: SectorSignature,
  characteristic: string
) => {
  if (signature === 'shielded' || signature === 'splitter' || signature === 'turret') {
    return characteristic === 'holder' || characteristic === 'artillery';
  }
  if (signature === 'kamikaze') return characteristic === 'diver' || characteristic === 'flanker';
  return characteristic === 'diver' || characteristic === 'commander';
};

/**
 * A committed dive bends toward the ship. The speed stays the dive's own
 * speed, so a kamikaze is not a faster bullet than the diver it replaced.
 */
export const steerCommittedDive = (
  vx: number,
  vy: number,
  aimX: number,
  aimY: number
) => {
  const aim = Math.hypot(aimX, aimY) || 1;
  const speed = Math.max(3.2, Math.hypot(vx, vy));
  const blend = 0.35;
  return {
    vx: vx + ((aimX / aim) * speed - vx) * blend,
    vy: vy + ((aimY / aim) * speed - vy) * blend
  };
};
