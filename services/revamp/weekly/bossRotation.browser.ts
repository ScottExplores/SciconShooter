import './bossRotation.js';

export interface WeeklyBossPool { eliteBossIds: string[]; majorBossIds: string[] }
const rotation = (globalThis as typeof globalThis & {
  __SCICON_WEEKLY_BOSS_ROTATION__: {
    getCampaignWeeklyBossPool: (campaign: unknown) => WeeklyBossPool;
    getWeeklyRotationOrdinal: (weekKey: string) => number;
    selectWeeklyBossRotation: (weekKey: string, pool: Partial<WeeklyBossPool>) => WeeklyBossPool;
  };
}).__SCICON_WEEKLY_BOSS_ROTATION__;
export const { getCampaignWeeklyBossPool, getWeeklyRotationOrdinal, selectWeeklyBossRotation } = rotation;
