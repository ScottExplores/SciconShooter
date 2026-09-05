import { getFireRateIntervalFrames, getFireRateTier, getFireRateVolleyDamageMultiplier } from './weaponTierProgression';
import { getPlayerShipWeaponProfile } from './playerShipWeapons';

export interface PlayerPrimaryPulse {
  readonly fireDelayFrames: number;
  readonly barrel: -1 | 0 | 1;
  readonly angle: number;
  readonly damage: number;
}

/** Real temporal pulses, not copies trailing a collision bundle through the hull. */
export const isPlayerPrimaryBurstHull = (shipId: string): boolean => (
  shipId === 'bio' || shipId === 'eth' || shipId === 'btc'
);

export const getPlayerPrimaryBurst = (shipId: string, level: number, maxShot: boolean, sequence = 0) => {
  if (!isPlayerPrimaryBurstHull(shipId)) return null;
  const profile = getPlayerShipWeaponProfile(shipId);
  const tier = getFireRateTier(level);
  const beats = Math.min(3, tier);
  const baseInterval = getFireRateIntervalFrames(level) * profile.cadenceScale;
  const cycleFrames = baseInterval * beats;
  // Each beat carries one old cycle's energy. Thus beats / (interval * beats)
  // preserves sustained DPS, while at most nine real bullets are scheduled.
  const damage = getFireRateVolleyDamageMultiplier(tier)
    * (shipId === 'bio' ? 0.58 : profile.laneDamageScale) * (maxShot ? 2 : 1);
  const barrels: readonly (-1 | 0 | 1)[] = shipId === 'bio' ? [-1, 1]
    : shipId === 'eth' ? [0, -1, 1] : [0];
  const shots: PlayerPrimaryPulse[] = [];
  for (let beat = 0; beat < beats; beat++) {
    const phase = ((sequence * beats + beat) % 3) - 1;
    for (let index = 0; index < barrels.length; index++) {
      const barrel = barrels[index];
      shots.push({
        fireDelayFrames: Math.floor(beat * baseInterval) + index,
        barrel,
        angle: shipId === 'bio' ? barrel * 0.028 + phase * 0.012
          : shipId === 'eth' ? barrel * Math.PI / 10 + phase * 0.02
            : phase * 0.025,
        damage
      });
    }
  }
  return { cycleFrames, cadenceScale: beats, shots, totalDamage: shots.length * damage };
};

/** The common forward emitter remains on the nose through the authored roll
 * frames (the side pods disappear in a hard roll). Tiny dual-channel offsets
 * separate BIO's alternating rails without firing from an invisible wing. */
export const getPlayerPrimaryMuzzle = ({ shipId, x, y, width, height, drawScale, barrel }: {
  shipId: string; x: number; y: number; width: number; height: number;
  drawScale: number; barrel: -1 | 0 | 1;
}) => {
  const scale = Math.max(0.1, drawScale) * 0.95;
  const channel = shipId === 'bio' ? 0.024 : shipId === 'eth' ? 0.018 : 0;
  return {
    x: x + width / 2 + barrel * width * channel * scale,
    y: y + height / 2 - height * 0.415 * scale
  };
};

export const getPlayerPrimaryPulseLayout = (width: number, height: number, level: number) => {
  const growth = 1 + Math.min(5, Math.max(0, level)) * 0.055;
  return { width: Math.max(22, width * 1.4) * growth, height: Math.min(46, Math.max(28, height * 0.88) * growth) };
};
