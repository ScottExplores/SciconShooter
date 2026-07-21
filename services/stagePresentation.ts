export const STAGE_NAMES = [
  'Open Orbit',
  'Citation Storm',
  'Paywall Siege',
  'Open Galaxy',
  'Bastion Protocol'
] as const;

export const getStageName = (wave: number): string => {
  const stage = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
  return STAGE_NAMES[(stage - 1) % STAGE_NAMES.length];
};
