const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const STAGE_NAMES = Object.freeze([
  'Open Orbit',
  'Citation Storm',
  'Paywall Siege',
  'Open Galaxy',
  'Bastion Protocol',
  'Helix Convergence',
  'Redline Corridor',
  'Dark Matter Run',
  'Mirror Array',
  'Null Sector',
  'Shard Tempest',
  'Quantum Cage',
  'Gravity Well',
  'Event Horizon',
  'Ion Citadel',
  'Crimson Vector',
  'Eclipse Swarm',
  'Fracture Engine',
  'Last Light Gauntlet',
  'Terminus Ascendant'
]);

const getEncounter = (stage) => {
  const stageNumber = Math.max(1, Math.floor(toNumber(stage, 1)));
  return STAGE_NAMES[Math.min(stageNumber, STAGE_NAMES.length) - 1];
};

const getPlayerShipId = (value) => (
  value === 'bio' || value === 'eth' || value === 'btc' ? value : 'researchhub'
);

const formatDuration = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(toNumber(durationMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const getRecordPresentation = (receipt, leaderboardRow = null) => {
  const wave = Math.max(1, Math.floor(toNumber(receipt?.wave ?? leaderboardRow?.wave, 1)));
  return {
    pilotName: String(leaderboardRow?.name || 'PILOT').slice(0, 15).toUpperCase(),
    score: Math.max(0, Math.floor(toNumber(receipt?.score ?? leaderboardRow?.score))),
    wave,
    encounter: getEncounter(wave),
    targetsDefeated: Math.max(0, Math.floor(toNumber(receipt?.enemies_defeated))),
    coinsCollected: Math.max(0, Math.floor(toNumber(receipt?.coins_collected))),
    durationMs: Math.max(0, Math.floor(toNumber(receipt?.duration_ms))),
    durationLabel: formatDuration(receipt?.duration_ms),
    playerShipId: getPlayerShipId(receipt?.player_ship_id),
    finishedAt: receipt?.finished_at || leaderboardRow?.date || null,
    gameVersion: receipt?.game_version || 'unknown',
    integrity: receipt?.integrity_status || 'review'
  };
};

module.exports = { formatDuration, getEncounter, getPlayerShipId, getRecordPresentation };
