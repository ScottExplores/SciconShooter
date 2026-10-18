import type { BossEvent, GameCampaign } from '../../../game-config/types';
import type { BossProfile } from './catalog';
import { FAIR_ARENA_HEIGHT, FAIR_ARENA_WIDTH } from '../../gameplay/fairArena';

export const BOSS_LAB_VIEWPORT = Object.freeze({ width: FAIR_ARENA_WIDTH, height: FAIR_ARENA_HEIGHT });
export const BOSS_LAB_UPGRADES = Object.freeze({ fireRate: 49, ability: 6, speed: 7 });

export interface BossLabRequest {
  readonly bossId: string;
  readonly unknownId: string | null;
  readonly watch: boolean;
  readonly healthRatio: number;
}

/** Pure URL parsing: the lab never reads an account, writes a score, or persists equipment. */
export const readBossLabRequest = (
  search: string,
  bosses: readonly Pick<BossProfile, 'id'>[]
): BossLabRequest | null => {
  const query = new URLSearchParams(search);
  if (!query.has('bosslab') || bosses.length === 0) return null;
  const requested = (query.get('bosslab') ?? '').trim().toLowerCase();
  const selected = bosses.find(boss => boss.id === requested);
  const hp = Number(query.get('bosshp') ?? '1');
  return {
    bossId: selected?.id ?? bosses[0].id,
    unknownId: requested && !selected ? requested : null,
    watch: query.get('bosswatch') === '1',
    healthRatio: Number.isFinite(hp) ? Math.max(0.01, Math.min(1, hp)) : 1
  };
};

/** Preserve the source rig/art ID; the event ID selects the revamp story variant. */
export const createBossLabEncounter = (source: GameCampaign, profile: BossProfile) => {
  const campaign: GameCampaign = structuredClone(source);
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const template = wave.events.find((event): event is BossEvent => (
        event.kind === 'boss' && event.bossId === profile.sourceBossId
      ));
      if (!template) continue;
      const boss: BossEvent = {
        ...template,
        id: `revamp:${profile.id}`,
        label: profile.name,
        startSeconds: 0,
        warningSeconds: 0,
        blocksWaveClock: true
      };
      wave.name = profile.name;
      wave.introSeconds = 0;
      wave.delayAfterSeconds = 0;
      wave.durationSeconds = 1;
      wave.completionRule = 'boss-defeat';
      wave.events = [boss];
      return { campaign, levelId: level.id, waveId: wave.id, eventId: boss.id };
    }
  }
  throw new Error(`Boss Lab source encounter is missing: ${profile.sourceBossId}`);
};
/** Preview health is rounded by the engine; presets must land below their gate. */
export const bossLabHealthCommandRatio = (ratio: number, maxHealth: number): number => (
  Math.max(1, Math.floor(maxHealth * ratio)) / Math.max(1, maxHealth)
);
