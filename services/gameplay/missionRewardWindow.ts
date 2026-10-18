/** Major-boss coins keep their established collection window across authored revisions. */
export const getMissionRewardCollectionSeconds = ({
  authoredSeconds,
  liveCoins,
  majorBossFinale
}: {
  authoredSeconds: number;
  liveCoins: boolean;
  majorBossFinale: boolean;
}): number => Math.max(
  Number.isFinite(authoredSeconds) ? Math.max(0, authoredSeconds) : 0,
  majorBossFinale ? 5 : liveCoins ? 2.5 : 0
);
