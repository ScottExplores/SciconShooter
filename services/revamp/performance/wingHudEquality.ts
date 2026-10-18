import type { WingHudSnapshot } from '../wings/wingRuntime';

/** Compare the bounded (two-wing) HUD data without serializing or allocating. */
export const wingHudSnapshotsEqual = (previous: WingHudSnapshot | null, next: WingHudSnapshot): boolean => {
  if (previous === next) return true;
  if (!previous || previous.enabled !== next.enabled || previous.autoCast !== next.autoCast
    || previous.wings.length !== next.wings.length) return false;
  for (let index = 0; index < next.wings.length; index++) {
    const before = previous.wings[index];
    const after = next.wings[index];
    if (before.slot !== after.slot || before.id !== after.id || before.image !== after.image
      || before.level !== after.level || before.special !== after.special || before.label !== after.label
      || before.evolved !== after.evolved || before.cooldownFrames !== after.cooldownFrames
      || before.cooldownMax !== after.cooldownMax || before.ready !== after.ready) return false;
  }
  return true;
};
