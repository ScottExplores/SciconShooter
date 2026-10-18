// REVAMP(H): Isolated presentation fixtures for the offline UI audit. No saves or API calls.
import { useEffect, useRef } from 'react';
import { CAMPAIGN_MISSIONS, applyCampaignCompletion, createCampaignProgress } from '../../campaignProgression';
import { DEFAULT_GAME_CAMPAIGN } from '../../levelConfig';
import type { WaveVictorySummary } from '../../gameLogic';
import { createRevampProgress, settleRevampMission } from '../progression';
import { STORY_BEATS, getStoryBeatForMission } from '../../storyBeats';
import { startWeeklyCampaignStreak } from '../../weeklyCampaignStreak';
import type { CampaignGraphIndex } from '../../campaignGraph';
import { GAME_VERSION, type RunReceipt } from '../../runReceiptService';

export type UIAuditScene = 'home' | 'victory' | 'victory-long' | 'boss-result' | 'boss-defeat' | 'campaign-complete' | 'defeat' | 'weekly-result' | 'weekly-score-entry' | 'record-preview' | 'proposal-selection' | 'story' | 'story-vault' | 'mission-help' | 'unlock-archive' | 'loading' | 'pause';
export const uiAuditEnabled = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('qa') === '1' && params.get('uiAudit') === '1';
};
export function useUIAuditBridge(ready: boolean, present: (scene: UIAuditScene) => void) {
  const latest = useRef(present); latest.current = present;
  useEffect(() => {
    if (!ready || !uiAuditEnabled()) return;
    const target = window as typeof window & { __sciconUIAudit?: { present: (scene: UIAuditScene) => void } };
    target.__sciconUIAudit = { present: scene => {
      if (!['home', 'victory', 'victory-long', 'boss-result', 'boss-defeat', 'campaign-complete', 'defeat', 'weekly-result', 'weekly-score-entry', 'record-preview', 'proposal-selection', 'story', 'story-vault', 'mission-help', 'unlock-archive', 'loading', 'pause'].includes(scene)) throw new Error('Unknown UI audit scene');
      latest.current(scene);
    } };
    return () => { delete target.__sciconUIAudit; };
  }, [ready]);
}
export const uiAuditStory = STORY_BEATS.reduce((longest, beat) => beat.text.length > longest.text.length ? beat : longest, STORY_BEATS[0]);
// Use an authored Explorer bridge with his original ship portrait for the retained full-screen transmission.
export const uiAuditVaultStory = CAMPAIGN_MISSIONS.map(mission => getStoryBeatForMission(mission.id)).find(beat => beat?.portrait) ?? uiAuditStory;
export function createUIAuditVictory(scene = 'victory') {
  const mission = CAMPAIGN_MISSIONS[0], next = CAMPAIGN_MISSIONS[1];
  const wave = mission.waves.at(-1)!;
  const summary: WaveVictorySummary = {
    id: 'ui-audit-victory', campaignId: DEFAULT_GAME_CAMPAIGN.id, campaignRevision: DEFAULT_GAME_CAMPAIGN.revision,
    levelId: mission.id, waveId: wave.id, waveNumber: wave.number, waveTotal: mission.waveIds.length,
    stageComplete: true, bossEncounterId: mission.bossEventId, stage: mission.number, stageName: mission.name,
    finalWaveName: wave.name, scoreEarned: 12850, totalScore: 12850, enemiesDefeated: 96, regularEnemyKills: 94,
    eliteKills: 1, miniBossKills: 1, majorBossKills: 0, coinsCollected: 240, waveCoinsCollected: 32,
    damageTaken: 0, revampMetrics: { kills: 96, spawned: 96, hits: 0 }, elapsedSeconds: 72, remainingLives: 3, nextLevelId: next.id, nextWaveId: next.waveIds[0],
    nextWaveNumber: 1, nextStage: next.number, hasNextStage: true, campaignComplete: false
  };
  const completion = applyCampaignCompletion(createCampaignProgress(), {
    resultId: summary.id, playerId: 'ui-audit', campaignId: summary.campaignId, campaignRevision: summary.campaignRevision,
    missionId: mission.id, waveId: wave.id, stageComplete: true, score: summary.scoreEarned,
    coinsCollected: summary.coinsCollected, damageTaken: 0, elapsedSeconds: summary.elapsedSeconds
  });
  const revamp = settleRevampMission(createRevampProgress(), {
    runId: summary.id, missionId: mission.id, cleared: true, kills: 96, spawned: 96,
    damageTaken: 0, durationMs: 72000, scienceCreditsEarned: 240
  });
  // Match the final presentation receipt after App finalizes collected Tokens.
  const settlement = { ...completion.settlement, coinsAwarded: completion.settlement.coinsAwarded + summary.coinsCollected };
  // REVAMP(Q): Real authored content, plus accepted large-score formatting, inside
  // the existing presentation-only bridge. These receipts never enter settlement.
  if (scene !== 'victory') {
    const longest = DEFAULT_GAME_CAMPAIGN.levels.reduce((a, b) => b.name.length > a.name.length ? b : a);
    summary.stageName = longest.name;
    summary.finalWaveName = longest.waves.at(-1)?.name ?? wave.name;
    summary.scoreEarned = 987654321;
    summary.totalScore = 987654321;
    summary.enemiesDefeated = 1234;
    summary.elapsedSeconds = 599;
    settlement.coinsAwarded = 12480;
  }
  if (scene === 'campaign-complete') { summary.campaignComplete = true; summary.hasNextStage = false; }
  return { summary, settlement, revamp };
}
export function createUIAuditWeekly(graph: CampaignGraphIndex) {
  const nodes = [...graph.nodeById.values()].filter(node => node.weeklyStreakEligible);
  const start = nodes[0] ?? [...graph.nodeById.values()][0];
  const streak = startWeeklyCampaignStreak(graph, { weeklyId: 'ui-audit', resetAtMs: Date.now() + 86400000,
    startNodeId: start.nodeId, unlockedNodeIds: [...graph.nodeById.keys()], nowMs: Date.now() });
  return { ...streak, score: { ...streak.score, totalPoints: 12850 }, finalization: { ...streak.finalization, status: 'finalized' as const, reason: 'loss' as const } };
}

/** A local record exercises guest controls without manufacturing server verification. */
export function createUIAuditReceipt(): RunReceipt {
  return {
    runId: 'ui-audit-local-record', gameVersion: GAME_VERSION, runMode: 'weekly-streak',
    startedAt: '2026-10-17T12:00:00.000Z', finishedAt: '2026-10-17T12:03:00.000Z',
    expiresAt: '2026-10-18T12:00:00.000Z',
    metrics: { score: 987654321, wave: 12, durationMs: 180000, enemiesDefeated: 496, coinsCollected: 1240, playerShipId: 'researchhub' },
    integrity: 'local-unverified', anomalies: [], receiptToken: '', persisted: false
  };
}
