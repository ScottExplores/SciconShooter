import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPermanentSquadState, loadWeeklySquadState, type PermanentSquadState, type WeeklySquadState } from '../../squadProgression';
import { claimRevampGoal, purchaseRevampUpgrade, recordRevampEvent, sanitizeRevampProgress, settleRevampMission, touchRevampLogin } from '../progression';
import type { WaveVictorySummary } from '../../gameLogic';
import type { RevampBranch, RevampProgress } from '../progression/types';
import { acknowledgeRevampEvents, aggregateRevampEventTotals, pendingRevampEvents } from './flight';
import { withRevampCredits, grantRevampWings } from './profile';

interface Options {
  profileId: string;
  read: () => { weekly: WeeklySquadState; permanent: PermanentSquadState };
  commit: (weekly: WeeklySquadState, permanent: PermanentSquadState) => void;
}
/** Normal reads stay in memory. A failed commit must replay the existing
 * two-key journal before any subsequent action can replace it from stale refs. */
export const createRevampTransactionAccess = (options: () => Options) => {
  const needsRecovery = new Set<string>();
  const commit: Options['commit'] = (weekly, permanent) => {
    try {
      options().commit(weekly, permanent);
      needsRecovery.delete(weekly.profileId);
    } catch (error) {
      needsRecovery.add(weekly.profileId);
      throw error;
    }
  };
  const read: Options['read'] = () => {
    const current = options();
    if (needsRecovery.has(current.profileId)) {
      // The weekly loader throws while a valid journal remains unrecoverable.
      // Republish the recovered pair before reading the host's live refs again.
      const weekly = loadWeeklySquadState(current.profileId);
      const permanent = loadPermanentSquadState(current.profileId);
      commit(weekly, permanent);
    }
    return current.read();
  };
  return { read, commit };
};
/** Uses the existing atomic journal and cloud dirty marker supplied by App. */
export const useRevampProgression = (options: Options) => {
  const latest = useRef(options); latest.current = options;
  const transactionRef = useRef<ReturnType<typeof createRevampTransactionAccess> | null>(null);
  if (!transactionRef.current) transactionRef.current = createRevampTransactionAccess(() => latest.current);
  const transaction = transactionRef.current;
  const [notice, setNotice] = useState('');
  const flush = useCallback(() => {
    const { profileId } = latest.current;
    const { weekly, permanent } = transaction.read();
    if (weekly.profileId !== profileId || permanent.profileId !== profileId) return;
    const pending = pendingRevampEvents(profileId);
    if (!pending.length) return;
    let revamp = sanitizeRevampProgress(permanent.revamp);
    for (const event of aggregateRevampEventTotals(pending)) {
      revamp = recordRevampEvent(revamp, event, new Date(event.occurredAt));
    }
    transaction.commit(weekly, { ...permanent, revamp });
    acknowledgeRevampEvents(pending.map(event => event.id));
  }, []);
  useEffect(() => {
    const save = () => { try { flush(); } catch { setNotice('Progress save needs storage space. Your flight events remain queued.'); } };
    const timer = window.setInterval(save, 1500);
    window.addEventListener('pagehide', save);
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', save); save(); };
  }, [flush, options.profileId]);
  useEffect(() => {
    try {
      const { weekly, permanent } = transaction.read();
      const revamp = touchRevampLogin(sanitizeRevampProgress(permanent.revamp));
      const earnedWings = !weekly.unlockedSlots.left || (!weekly.unlockedSlots.right && permanent.campaignProgress.completedMissionIds.length > 0)
        ? grantRevampWings(weekly, [], permanent.campaignProgress.completedMissionIds.length > 0) : weekly;
      if (earnedWings !== weekly || JSON.stringify(revamp) !== JSON.stringify(permanent.revamp)) {
        transaction.commit(earnedWings, { ...permanent, revamp });
      }
    } catch { setNotice('Free some device storage to finish saving your progress.'); }
  }, [options.profileId]);
  const mutate = (action: (state: RevampProgress, credits: number) => { state: RevampProgress; credits: number; accepted: boolean; reason?: string }) => {
    try {
      flush();
      const { weekly, permanent } = transaction.read();
      const result = action(sanitizeRevampProgress(permanent.revamp), weekly.coins);
      if (!result.accepted) { setNotice(result.reason === 'locked' ? 'Keep flying to open this research tier.' : 'Earn the displayed Credits and Research Data to continue.'); return; }
      transaction.commit(withRevampCredits(weekly, result.credits), { ...permanent, revamp: result.state });
      setNotice('Progress saved. Ready for your next flight.');
    } catch { setNotice('Save interrupted. Progress may already be saved. Free some device storage and retry to finish recovery.'); }
  };
  return {
    flush, notice,
    recordFailure: (summary?: WaveVictorySummary) => {
      if (!summary?.revampMetrics || !summary.revampRunId) return;
      try {
        flush();
        const { weekly, permanent } = transaction.read();
        const result = settleRevampMission(permanent.revamp, {
          runId: `${summary.revampRunId}:failed:${summary.levelId}`, missionId: summary.levelId, cleared: false,
          kills: summary.revampMetrics.kills, spawned: summary.revampMetrics.spawned,
          damageTaken: Math.max(summary.damageTaken, summary.revampMetrics.hits), durationMs: summary.elapsedSeconds * 1000
        });
        if (result.accepted) transaction.commit(grantRevampWings(weekly, result.unlocks), { ...permanent, revamp: result.state });
      } catch { setNotice('Your flight progress is waiting for device storage.'); }
    },
    purchase: (branch: RevampBranch) => mutate((state, credits) => purchaseRevampUpgrade(state, branch, credits)),
    claim: (id: string) => mutate((state, credits) => claimRevampGoal(state, id, credits)),
    preference: (update: Partial<Pick<RevampProgress, 'wingAutoCast'>> & { equippedCosmeticId?: string | null }) => mutate((state, credits) => ({ state: sanitizeRevampProgress({ ...state, ...update }), credits, accepted: true }))
  };
};
