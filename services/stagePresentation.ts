export const STAGE_NAMES = [
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
] as const;

export const getStageName = (wave: number): string => {
  const stage = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
  return STAGE_NAMES[Math.min(stage, STAGE_NAMES.length) - 1];
};
