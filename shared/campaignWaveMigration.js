// REVAMP(G): Immutable historical wave identities from authored remaster and
// round-1 revamp content. Save migrations are independent of current tuning.
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

  // REVAMP(G): Round-1 rev25 checkpoints predate I's dense three-wave missions.
  // Keep their identities/order immutable; never derive history from live data.
  const REVAMP_V25_WAVE_SUFFIXES = Object.freeze({
    'operation-open-galaxy': ['wave-1'],
    'stage-citation-storm': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-paywall-siege': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6'],
    'stage-open-galaxy': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6'],
    'stage-bastion-protocol': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'boss-wave'],
    'stage-helix-convergence': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-redline-corridor': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-dark-matter-run': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6'],
    'stage-mirror-array': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6'],
    'stage-null-sector': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'boss-wave'],
    'stage-shard-tempest': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-quantum-cage': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-gravity-well': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6'],
    'stage-event-horizon': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'boss-wave', 'wave-5', 'wave-6'],
    'stage-ion-citadel': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'boss-wave'],
    'stage-open-orbit-route-b': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-redline-frontier-route-b': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6'],
    'stage-gravity-rift-route-b': ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-6']
  });

  const resolveRevampWaveId = (missionId, waveId, currentWaveIds, storedRevision) => {
    if (typeof waveId !== 'string') return null;
    if (currentWaveIds.includes(waveId)) return waveId;
    if (storedRevision >= 26 || !currentWaveIds.some((id) => id.startsWith(`${missionId}-revamp-wave-`))) return null;
    const suffixes = storedRevision >= 25 ? REVAMP_V25_WAVE_SUFFIXES[missionId] : LEGACY_WAVE_SUFFIXES[missionId];
    const prefix = storedRevision >= 25 ? `${missionId}-revamp-` : `${missionId}-wave-`;
    if (!suffixes || !waveId.startsWith(prefix)) return null;
    const ordinal = suffixes.indexOf(waveId.slice(prefix.length));
    if (ordinal < 0) return null;
    return currentWaveIds[Math.min(ordinal, currentWaveIds.length - 1)] ?? null;
  };

  const boundRevampCompletedWaves = (missionId, originalIds, completedIds, currentWaveIds, storedRevision, explicitlyCompleted) => {
    if (explicitlyCompleted || !Array.isArray(originalIds)
      || !currentWaveIds.some((id) => id.startsWith(`${missionId}-revamp-wave-`))) return completedIds;
    // An explicit unfinished record never becomes a clear solely because the
    // authored mission got shorter, even when all retained IDs still match.
    if (explicitlyCompleted === false) return completedIds.slice(0, Math.max(0, currentWaveIds.length - 1));
    if (storedRevision >= 26) return completedIds;
    const prefix = storedRevision >= 25 ? `${missionId}-revamp-` : `${missionId}-wave-`;
    const suffixes = storedRevision >= 25 ? REVAMP_V25_WAVE_SUFFIXES[missionId] : LEGACY_WAVE_SUFFIXES[missionId];
    if (!suffixes || (storedRevision < 25 && !originalIds.some((id) => typeof id === 'string' && !currentWaveIds.includes(id)))) return completedIds;
    const oldIds = suffixes.map((suffix) => `${prefix}${suffix}`);
    if (oldIds.length && oldIds.every((id) => originalIds.includes(id))) return [...currentWaveIds];
    // A shortened mission cannot turn an unfinished legacy checkpoint into a
    // fresh clear, mastery star, or reward. Resume its last remaining wave.
    return completedIds.slice(0, Math.max(0, currentWaveIds.length - 1));
  };

  const api = { resolveRevampWaveId, boundRevampCompletedWaves };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.__SCICON_CAMPAIGN_WAVE_MIGRATION__ = api;
})();
