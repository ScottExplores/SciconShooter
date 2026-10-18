import { normalizeGameplayRandomSeed } from '../../gameplay/random';

export interface QAConfig {
  enabled: boolean;
  seed: number;
  autoplay: boolean;
  mission: string | null;
  bosslab: string | null;
  skipIntro: boolean;
  god: boolean;
}

export const DEFAULT_QA_SEED = 1701;

/** Every cheat/automation flag requires explicit ?qa=1, including in production. */
export function readQAConfig(search = typeof window === 'undefined' ? '' : window.location.search): QAConfig {
  const params = new URLSearchParams(search);
  const enabled = params.get('qa') === '1';
  const rawSeed = params.get('seed');
  const seed = rawSeed !== null && rawSeed.trim() !== '' && Number.isFinite(Number(rawSeed))
    ? normalizeGameplayRandomSeed(Number(rawSeed))
    : DEFAULT_QA_SEED;
  const mission = params.get('mission')?.trim() ?? '';
  const bosslab = params.get('bosslab')?.trim() ?? '';
  return Object.freeze({
    enabled,
    seed: enabled ? seed : DEFAULT_QA_SEED,
    autoplay: enabled && params.get('autoplay') === '1',
    mission: enabled && /^[a-zA-Z0-9_-]{1,120}$/.test(mission) ? mission : null,
    bosslab: enabled && /^[a-zA-Z0-9_-]{1,120}$/.test(bosslab) ? bosslab : null,
    skipIntro: enabled && params.get('skipIntro') === '1',
    god: enabled && params.get('god') === '1'
  });
}
