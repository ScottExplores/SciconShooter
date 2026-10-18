// REVAMP(G): Immutable revision-24 wave suffixes, taken from remaster's authored
// campaign. This save migration is independent of current tuning/content files.
(() => {
  const LEGACY_WAVE_SUFFIXES = Object.freeze({
    "operation-open-galaxy": ["1", "2", "3", "extra-1", "extra-2", "5"],
    "stage-citation-storm": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-paywall-siege": ["1", "2", "3", "5"],
    "stage-open-galaxy": ["1", "2", "4", "7"],
    "stage-bastion-protocol": ["1", "4"],
    "stage-helix-convergence": ["1", "2", "3", "extra-1", "extra-2", "5"],
    "stage-redline-corridor": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-dark-matter-run": ["1", "2", "3", "5"],
    "stage-mirror-array": ["1", "2", "4", "7"],
    "stage-null-sector": ["1", "4"],
    "stage-shard-tempest": ["1", "2", "3", "extra-1", "extra-2", "5"],
    "stage-quantum-cage": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-gravity-well": ["1", "2", "3", "5"],
    "stage-event-horizon": ["1", "2", "4", "7"],
    "stage-ion-citadel": ["1", "4"],
    "stage-crimson-vector": ["1", "2", "3", "extra-1", "extra-2", "5"],
    "stage-eclipse-swarm": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-fracture-engine": ["1", "2", "3", "5"],
    "stage-last-light-gauntlet": ["1", "2", "4", "7"],
    "stage-terminus-ascendant": ["1", "4"],
    "stage-prism-expanse-signal": ["1", "2", "3", "extra-1", "extra-2", "5"],
    "stage-prism-expanse-crossing": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-prism-expanse-checkpoint": ["1", "2", "3", "5"],
    "stage-prism-expanse-approach": ["1", "2", "4", "7"],
    "stage-prism-expanse-commander": ["1", "4"],
    "stage-rail-meridian-signal": ["1", "2", "3", "extra-1", "extra-2", "5"],
    "stage-rail-meridian-crossing": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-rail-meridian-checkpoint": ["1", "2", "3", "5"],
    "stage-rail-meridian-approach": ["1", "2", "4", "7"],
    "stage-rail-meridian-commander": ["1", "4"],
    "stage-singularity-reach-signal": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "5"],
    "stage-singularity-reach-crossing": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-singularity-reach-checkpoint": ["1", "2", "3", "5"],
    "stage-singularity-reach-approach": ["1", "2", "4", "7"],
    "stage-singularity-reach-commander": ["1", "4"],
    "stage-gyroscope-array-signal": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "5"],
    "stage-gyroscope-array-crossing": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-gyroscope-array-checkpoint": ["1", "2", "3", "5"],
    "stage-gyroscope-array-approach": ["1", "2", "4", "7"],
    "stage-gyroscope-array-commander": ["1", "4"],
    "stage-hammerhead-line-signal": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "5"],
    "stage-hammerhead-line-crossing": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-hammerhead-line-checkpoint": ["1", "2", "3", "5"],
    "stage-hammerhead-line-approach": ["1", "2", "4", "7"],
    "stage-hammerhead-line-commander": ["1", "4"],
    "stage-crownclaw-frontier-signal": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "5"],
    "stage-crownclaw-frontier-crossing": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "extra-4", "6"],
    "stage-crownclaw-frontier-checkpoint": ["1", "2", "3", "5"],
    "stage-crownclaw-frontier-approach": ["1", "2", "4", "7"],
    "stage-crownclaw-frontier-commander": ["1", "4"],
    "stage-open-orbit-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-redline-frontier-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-gravity-rift-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-terminus-frontier-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-prism-expanse-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-rail-meridian-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-singularity-reach-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-gyroscope-array-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-hammerhead-line-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
    "stage-crownclaw-frontier-route-b": ["1", "2", "3", "extra-1", "extra-2", "extra-3", "6"],
  });

  const resolveRevampWaveId = (missionId, waveId, currentWaveIds, storedRevision) => {
    if (typeof waveId !== 'string') return null;
    if (currentWaveIds.includes(waveId)) return waveId;
    if (storedRevision >= 25 || !currentWaveIds.some((id) => id.startsWith(`${missionId}-revamp-wave-`))) return null;
    const suffixes = LEGACY_WAVE_SUFFIXES[missionId];
    const prefix = `${missionId}-wave-`;
    if (!suffixes || !waveId.startsWith(prefix)) return null;
    const ordinal = suffixes.indexOf(waveId.slice(prefix.length));
    if (ordinal < 0) return null;
    return currentWaveIds[Math.min(ordinal, currentWaveIds.length - 1)] ?? null;
  };

  const boundRevampCompletedWaves = (missionId, originalIds, completedIds, currentWaveIds, storedRevision, explicitlyCompleted) => {
    if (explicitlyCompleted || storedRevision >= 25 || !Array.isArray(originalIds)
      || !originalIds.some((id) => typeof id === 'string' && !currentWaveIds.includes(id))
      || !currentWaveIds.some((id) => id.startsWith(`${missionId}-revamp-wave-`))) return completedIds;
    const oldIds = (LEGACY_WAVE_SUFFIXES[missionId] || []).map((suffix) => `${missionId}-wave-${suffix}`);
    if (oldIds.length && oldIds.every((id) => originalIds.includes(id))) return completedIds;
    // A shortened mission cannot turn an unfinished legacy checkpoint into a
    // fresh clear, mastery star, or reward. Resume its last remaining wave.
    return completedIds.slice(0, Math.max(0, currentWaveIds.length - 1));
  };

  const api = { resolveRevampWaveId, boundRevampCompletedWaves };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.__SCICON_CAMPAIGN_WAVE_MIGRATION__ = api;
})();
