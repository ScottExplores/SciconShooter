/* REVAMP(D): Narrow CommonJS helper for the existing wallet profile write path. */
const { sanitizeRevampProgress, REVAMP_UNLOCK_CADENCE } = require('./core.js');

/** Apply only earned level-one ships after normal server purchase protection.
 * Client equipment may choose an earned ship; it cannot inject higher levels.
 */
const applyEarnedWingEntitlements = (protectedSnapshot, requestedSnapshot) => {
  const revamp = sanitizeRevampProgress(protectedSnapshot.permanentState?.revamp);
  const weekly = protectedSnapshot.weeklyState;
  const ownedMiniShips = { ...weekly.ownedMiniShips };
  const unlockedSlots = { ...weekly.unlockedSlots, left: true };
  for (const unlock of REVAMP_UNLOCK_CADENCE) {
    if (unlock.kind !== 'wing' || !revamp.unlockIds.includes(unlock.id)) continue;
    ownedMiniShips[unlock.assetId] = Math.max(1, Number(ownedMiniShips[unlock.assetId]) || 0);
    if (unlock.id === 'wing-right') unlockedSlots.right = true;
  }
  const equipped = { ...weekly.equipped };
  for (const slot of ['left', 'right']) {
    const requested = requestedSnapshot.weeklyState?.equipped?.[slot];
    if (unlockedSlots[slot] && typeof requested === 'string' && ownedMiniShips[requested]) equipped[slot] = requested;
    if (!equipped[slot] && unlockedSlots[slot]) equipped[slot] = slot === 'left' ? 'citation-dart' : 'quorum-crab';
    if (equipped[slot] && !ownedMiniShips[equipped[slot]]) equipped[slot] = null;
  }
  return { ...protectedSnapshot, weeklyState: { ...weekly, ownedMiniShips, unlockedSlots, equipped } };
};
module.exports = { applyEarnedWingEntitlements };
