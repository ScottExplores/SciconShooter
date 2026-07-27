import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BossArchiveEntry } from '../services/bossArchive';
import { getBackground, getPrimaryAssetPath } from '../services/levelConfig';
import {
  getBossArchiveDailyChargeStatus,
  getBossArchiveProgressionConfig,
  sanitizeBossArchiveBossRecord,
  type BossArchiveDailyChargeStatus,
  type BossArchiveProgress
} from '../services/bossArchiveProgression';
import BossArchiveCarousel from './boss-archive/BossArchiveCarousel';
import {
  buildBossArchiveViewEntries,
  formatBossArchiveClearTime,
  getBossArchiveChallengeDisabledReason,
  getLoopedBossArchiveIndex,
  resolveBossArchiveInitialIndex,
  type BossArchiveBossRecord,
  type BossArchiveDailyChallengeState,
  type BossArchiveDeveloperControls,
  type BossArchiveFightRequest,
  type BossArchiveMode,
  type BossArchivePresentation,
  type BossArchiveResult,
  type BossArchiveRewardPreview,
  type BossArchiveViewEntry
} from './boss-archive/BossArchiveModel';
import PixelActionButton from './PixelActionButton';
import './boss-archive/boss-archive.css';

const ARCHIVE_EMBLEM = '/game-art/bosses/final-boss-sentinel.png';
const LAST_SELECTION_KEY = 'scicon:boss-archive:last-selected';

export type {
  BossArchiveDailyChallengeState,
  BossArchiveDeveloperControls,
  BossArchiveFightRequest,
  BossArchiveMode,
  BossArchivePresentation,
  BossArchiveResult,
  BossArchiveRewardPreview
} from './boss-archive/BossArchiveModel';

export interface BossArchiveProps {
  /** Unlocked bosses. Regular players should receive only defeated bosses. */
  entries: readonly BossArchiveEntry[];
  /** Optional full catalog used for founder/dev locked-state previews. */
  catalogEntries?: readonly BossArchiveEntry[];
  revealLockedEntries?: boolean;
  newEncounterIds: ReadonlySet<string> | readonly string[];
  onClose: () => void;
  /** Existing practice launcher retained for backward compatibility. */
  onChallenge: (entry: BossArchiveEntry) => void;
  onLaunch?: (entry: BossArchiveEntry, request: BossArchiveFightRequest) => void;
  onSelectionChange?: (eventId: string) => void;
  onNewEncounterViewed?: (eventId: string) => void;
  onClaimMastery?: (eventId: string, objectiveId: string) => void;
  selectedEncounterId?: string | null;
  progress?: BossArchiveProgress;
  dailyChargeStatus?: BossArchiveDailyChargeStatus;
  dailyChallenge?: BossArchiveDailyChallengeState;
  presentations?: Readonly<Record<string, BossArchivePresentation>>;
  records?: Readonly<Record<string, BossArchiveBossRecord>>;
  result?: BossArchiveResult | null;
  onDismissResult?: () => void;
  developerControls?: BossArchiveDeveloperControls | null;
}

const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => (
  Array.from(root?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) ?? []).filter((element) => (
    element.getAttribute('aria-hidden') !== 'true'
    && !element.hasAttribute('hidden')
  ))
);

const getRememberedSelection = () => {
  try {
    return window.localStorage.getItem(LAST_SELECTION_KEY);
  } catch {
    return null;
  }
};

const formatResetLabel = (resetsAt: string, now = Date.now()) => {
  const reset = new Date(resetsAt);
  if (!Number.isFinite(reset.getTime())) return 'Resets at 00:00 UTC';
  const remainingMs = Math.max(0, reset.getTime() - now);
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `Reset ${hours}h ${minutes}m` : `Reset ${Math.max(1, minutes)}m`;
};

const toDailyChallengeState = (
  progress?: BossArchiveProgress,
  suppliedStatus?: BossArchiveDailyChargeStatus,
  suppliedState?: BossArchiveDailyChallengeState,
  now = Date.now()
): BossArchiveDailyChallengeState | undefined => {
  if (suppliedState) return suppliedState;
  const status = progress
    ? getBossArchiveDailyChargeStatus(
        progress,
        new Date(now),
        suppliedStatus?.limit
      )
    : suppliedStatus;
  return status ? {
    limit: status.limit,
    remaining: status.remaining,
    resetLabel: formatResetLabel(status.resetsAt, now),
    available: true
  } : undefined;
};

const toPresentationOverrides = (
  entries: readonly BossArchiveEntry[],
  supplied?: Readonly<Record<string, BossArchivePresentation>>
) => Object.fromEntries(entries.map((entry) => {
  const progression = getBossArchiveProgressionConfig(entry.eventId);
  const existing = supplied?.[entry.eventId];
  const masteryObjectives = progression?.masteryObjectives.map((objective) => ({
    id: objective.id,
    title: objective.label,
    description: objective.description,
    completed: false,
    reward: {
      id: `${entry.eventId}:${objective.id}:reward`,
      label: 'Coins',
      amount: objective.rewardCoins,
      tone: 'coin' as const
    }
  }));
  const challengeReward = progression ? [{
    id: `${entry.eventId}:challenge-reward`,
    label: entry.challenge.reward.label,
    amount: progression.challengeRewardCoins,
    tone: 'coin' as const
  }] : [];
  const background = getBackground(entry.theme.backgroundId);
  const backdropAssetKey = background.layerAssetKeys[0];
  return [entry.eventId, {
    subtitle: entry.subtitle,
    description: entry.description,
    difficultyLabel: entry.difficulty.label,
    threatLevel: entry.difficulty.tier,
    mechanicTags: entry.mechanicTags,
    portraitUrl: entry.preview.portraitUrl,
    idleFrameUrls: entry.preview.idleFrameUrls,
    idleFps: entry.preview.idleFramesPerSecond,
    backdropUrl: backdropAssetKey ? getPrimaryAssetPath(backdropAssetKey) : undefined,
    accentColor: entry.theme.accentColor,
    variants: entry.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      description: variant.description
    })),
    ...existing,
    challengeReward: existing?.challengeReward ?? challengeReward,
    masteryObjectives: existing?.masteryObjectives ?? masteryObjectives
  }];
}));

const toRecordOverrides = (
  entries: readonly BossArchiveEntry[],
  progress?: BossArchiveProgress,
  supplied?: Readonly<Record<string, BossArchiveBossRecord>>
) => Object.fromEntries(entries.map((entry) => {
  const suppliedRecord = supplied?.[entry.eventId];
  if (suppliedRecord) return [entry.eventId, suppliedRecord];
  const record = sanitizeBossArchiveBossRecord(progress?.records?.[entry.eventId]);
  const progression = getBossArchiveProgressionConfig(entry.eventId);
  return [entry.eventId, {
    timesDefeated: record.totalClears,
    totalClears: record.totalClears,
    challengeAttempts: record.challengeAttempts,
    challengeClears: record.challengeClears,
    noHitClears: record.noHitClears,
    bestClearTimeMs: record.bestClearTimeMs,
    bestChallengeTimeMs: record.bestChallengeTimeMs,
    bestNoHitTimeMs: record.bestNoHitTimeMs,
    masteryObjectives: progression?.masteryObjectives.map((objective) => ({
      id: objective.id,
      title: objective.label,
      description: objective.description,
      completed: Boolean(record.mastery[objective.id].completedAt),
      claimed: Boolean(record.mastery[objective.id].claimedAt),
      progress: record.mastery[objective.id].completedAt ? 1 : 0,
      target: 1,
      reward: {
        id: `${entry.eventId}:${objective.id}:reward`,
        label: `${
          entry.masteryObjectives.find((item) => item.id === objective.id)?.cosmeticRewardLabel
            ?? 'Archive cosmetic'
        } + ${objective.rewardCoins} coins`,
        tone: 'cosmetic' as const
      }
    }))
  }];
}));

const RewardList = ({ rewards }: { rewards: readonly BossArchiveRewardPreview[] }) => (
  <div className="boss-archive-rewards" aria-label="Reward preview">
    {rewards.length > 0 ? rewards.map((reward) => (
      <span key={reward.id} data-tone={reward.tone ?? 'record'}>
        {reward.iconUrl ? <img src={reward.iconUrl} alt="" /> : <i aria-hidden="true" />}
        <b>{reward.amount !== undefined ? `${reward.amount} ` : ''}{reward.label}</b>
      </span>
    )) : (
      <span data-tone="record"><i aria-hidden="true" /><b>Personal records</b></span>
    )}
  </div>
);

const BossMasteryPanel = ({
  item,
  onClaim
}: {
  item: BossArchiveViewEntry;
  onClaim?: (eventId: string, objectiveId: string) => void;
}) => {
  const objectives = item.record.masteryObjectives
    ?? item.presentation.masteryObjectives
    ?? [];
  return (
    <section className="boss-archive-mastery" aria-labelledby="boss-archive-mastery-title">
      <div className="boss-archive-panel-heading">
        <div>
          <small>Permanent dossier progress</small>
          <h4 id="boss-archive-mastery-title">Mastery Protocol</h4>
        </div>
        <strong>{objectives.filter((objective) => objective.completed).length} / {objectives.length || 3}</strong>
      </div>
      <div className="boss-archive-mastery__nodes">
        {(objectives.length ? objectives : [0, 1, 2].map((index) => ({
          id: `pending-${index}`,
          title: ['Rechallenge Victory', 'Untouchable', 'Rapid Response'][index],
          description: 'Complete this objective in Challenge mode.',
          completed: false
        }))).map((objective, index) => {
          const claimable = objective.completed && !objective.claimed && Boolean(onClaim);
          return (
            <article
              key={objective.id}
              data-completed={objective.completed ? 'true' : 'false'}
              data-claimable={claimable ? 'true' : 'false'}
            >
              <span className="boss-archive-mastery__medal" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{objective.title}</strong>
                <p>{objective.description}</p>
                {objective.reward ? (
                  <small>{objective.reward.amount} {objective.reward.label}</small>
                ) : null}
              </div>
              {claimable ? (
                <button type="button" onClick={() => onClaim?.(item.entry.eventId, objective.id)}>
                  Claim
                </button>
              ) : (
                <span className="boss-archive-mastery__state">
                  {objective.claimed ? 'Claimed' : objective.completed ? 'Complete' : 'Locked'}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const BossArchiveResultPanel = ({
  result,
  item,
  panelRef,
  onDismiss,
  onReplay
}: {
  result: BossArchiveResult;
  item?: BossArchiveViewEntry;
  panelRef?: React.Ref<HTMLElement>;
  onDismiss?: () => void;
  onReplay: () => void;
}) => (
  <div className="boss-archive-result-backdrop" role="presentation">
    <section
      ref={panelRef}
      className="boss-archive-result"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boss-archive-result-title"
      data-outcome={result.outcome}
      tabIndex={-1}
    >
      <small>Combat simulation complete</small>
      <h3 id="boss-archive-result-title">{result.outcome === 'victory' ? 'Threat Cleared' : 'Simulation Failed'}</h3>
      <p>{item?.entry.label ?? 'Archived threat'}</p>
      <div className="boss-archive-result__stats">
        <span><small>Clear time</small><b>{formatBossArchiveClearTime(result.clearTimeMs)}</b></span>
        <span>
          <small>Hull damage</small>
          <b>{result.noHit
            ? 'No hit'
            : Number.isFinite(result.damageTaken)
              ? `${Math.max(0, Math.round(result.damageTaken ?? 0))} damage`
              : result.outcome === 'victory' ? 'Recorded' : '--'}</b>
        </span>
        <span><small>Charges</small><b>{result.chargesRemaining ?? '--'} remaining</b></span>
      </div>
      {result.newPersonalRecord ? <strong className="boss-archive-result__record">New personal record</strong> : null}
      {result.reward?.length ? <RewardList rewards={result.reward} /> : null}
      {result.masteryCompletedIds?.length ? (
        <p className="boss-archive-result__mastery">Mastery advanced: {result.masteryCompletedIds.length} objective{result.masteryCompletedIds.length === 1 ? '' : 's'}</p>
      ) : null}
      {result.notice ? <p className="boss-archive-result__notice" role="alert">{result.notice}</p> : null}
      <div className="boss-archive-result__actions">
        <PixelActionButton tone="cyan" onClick={onDismiss}>Return to Archive</PixelActionButton>
        <PixelActionButton tone={result.outcome === 'victory' ? 'green' : 'gold'} onClick={onReplay}>Replay Boss</PixelActionButton>
      </div>
    </section>
  </div>
);

/**
 * Portrait-first Boss Archive presentation. Progression, charges, rewards and
 * fight launching are injected; this menu never creates a gameplay renderer.
 */
const BossArchive: React.FC<BossArchiveProps> = ({
  entries,
  catalogEntries,
  revealLockedEntries = false,
  newEncounterIds,
  onClose,
  onChallenge,
  onLaunch,
  onSelectionChange,
  onNewEncounterViewed,
  onClaimMastery,
  selectedEncounterId,
  progress,
  dailyChargeStatus,
  dailyChallenge,
  presentations,
  records,
  result,
  onDismissResult,
  developerControls
}) => {
  const dialogRef = useRef<HTMLElement>(null);
  const resultDialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hadResultRef = useRef(Boolean(result));
  const revealedIdsRef = useRef(new Set<string>());
  const notifiedRevealIdsRef = useRef(new Set<string>());
  const [viewedNewIds, setViewedNewIds] = useState<ReadonlySet<string>>(() => new Set());
  const allEntries = catalogEntries?.length ? catalogEntries : entries;
  const presentationOverrides = useMemo(
    () => toPresentationOverrides(allEntries, presentations),
    [allEntries, presentations]
  );
  const recordOverrides = useMemo(
    () => toRecordOverrides(allEntries, progress, records),
    [allEntries, progress, records]
  );
  const visibleNewEncounterIds = useMemo(() => (
    Array.from(newEncounterIds).filter((eventId) => !viewedNewIds.has(eventId))
  ), [newEncounterIds, viewedNewIds]);
  const archiveItems = useMemo(() => buildBossArchiveViewEntries({
    unlockedEntries: entries,
    catalogEntries,
    newEncounterIds: visibleNewEncounterIds,
    presentations: presentationOverrides,
    records: recordOverrides,
    revealLockedEntries
  }), [
    catalogEntries,
    entries,
    presentationOverrides,
    recordOverrides,
    revealLockedEntries,
    visibleNewEncounterIds
  ]);
  const preferredSelection = selectedEncounterId ?? progress?.lastSelectedEventId ?? null;
  const appliedPreferredSelectionRef = useRef(preferredSelection);
  const initialIndexRef = useRef<number | null>(null);
  if (initialIndexRef.current === null) {
    initialIndexRef.current = resolveBossArchiveInitialIndex(
      archiveItems,
      preferredSelection,
      getRememberedSelection()
    );
  }
  const [selectedIndex, setSelectedIndex] = useState(initialIndexRef.current);
  const [mode, setMode] = useState<BossArchiveMode>('practice');
  const [variantId, setVariantId] = useState('standard');
  const [activePanel, setActivePanel] = useState<'intel' | 'mastery'>('intel');
  const [showIndex, setShowIndex] = useState(false);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const [revealEventId, setRevealEventId] = useState<string | null>(null);
  const [resetClock, setResetClock] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  const selectedItem = archiveItems[selectedIndex] ?? archiveItems[0];
  const challenge = toDailyChallengeState(
    progress,
    dailyChargeStatus,
    dailyChallenge,
    resetClock
  );
  const challengeDisabledReason = getBossArchiveChallengeDisabledReason(selectedItem, challenge)
    ?? (!onLaunch ? 'Rewarded challenge launching is not connected yet.' : null);
  const unlockedCount = archiveItems.filter((item) => item.unlocked).length;

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const sync = () => setReducedMotion(query.matches);
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setResetClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!result && !hadResultRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (result) {
        hadResultRef.current = true;
        const firstResultControl = getFocusableElements(resultDialogRef.current)[0];
        (firstResultControl ?? resultDialogRef.current)?.focus({ preventScroll: true });
        return;
      }
      hadResultRef.current = false;
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  useEffect(() => {
    if (archiveItems.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((current) => Math.max(0, Math.min(current ?? 0, archiveItems.length - 1)));
  }, [archiveItems.length]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      if (!result) closeButtonRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  const markEncounterViewed = useCallback((eventId: string) => {
    setRevealEventId((current) => current === eventId ? null : current);
    setViewedNewIds((current) => {
      if (current.has(eventId)) return current;
      const next = new Set(current);
      next.add(eventId);
      return next;
    });
    if (!notifiedRevealIdsRef.current.has(eventId)) {
      notifiedRevealIdsRef.current.add(eventId);
      onNewEncounterViewed?.(eventId);
    }
  }, [onNewEncounterViewed]);

  useEffect(() => {
    if (!selectedItem) return;
    try { window.localStorage.setItem(LAST_SELECTION_KEY, selectedItem.entry.eventId); } catch { /* storage is optional */ }
    onSelectionChange?.(selectedItem.entry.eventId);
    const firstVariant = selectedItem.presentation.variants?.find((variant) => !variant.disabled);
    setVariantId(firstVariant?.id ?? 'standard');
    if (selectedItem.isNew && !revealedIdsRef.current.has(selectedItem.entry.eventId)) {
      const eventId = selectedItem.entry.eventId;
      revealedIdsRef.current.add(eventId);
      setRevealEventId(eventId);
      let completed = false;
      const timer = window.setTimeout(
        () => {
          completed = true;
          markEncounterViewed(eventId);
        },
        reducedMotion ? 500 : 1700
      );
      return () => {
        window.clearTimeout(timer);
        if (!completed && !notifiedRevealIdsRef.current.has(eventId)) {
          revealedIdsRef.current.delete(eventId);
          setRevealEventId((current) => current === eventId ? null : current);
        }
      };
    }
    return undefined;
  }, [markEncounterViewed, onSelectionChange, reducedMotion, selectedItem]);

  useEffect(() => {
    if (!selectedItem?.unlocked && mode === 'challenge') setMode('practice');
  }, [mode, selectedItem?.unlocked]);

  useEffect(() => {
    if (!selectedItem?.unlocked && activePanel === 'mastery') setActivePanel('intel');
  }, [activePanel, selectedItem?.unlocked]);

  useEffect(() => {
    if (!preferredSelection || appliedPreferredSelectionRef.current === preferredSelection) return;
    appliedPreferredSelectionRef.current = preferredSelection;
    const nextIndex = archiveItems.findIndex((item) => item.entry.eventId === preferredSelection);
    if (nextIndex >= 0) setSelectedIndex(nextIndex);
  }, [archiveItems, preferredSelection]);

  useEffect(() => {
    if (mode === 'challenge' && challengeDisabledReason) setMode('practice');
  }, [challengeDisabledReason, mode]);

  const selectIndex = (index: number) => {
    if (!archiveItems.length) return;
    setSelectedIndex(getLoopedBossArchiveIndex(archiveItems.length, index));
  };

  const launchSelected = () => {
    if (!selectedItem?.unlocked) return;
    if (mode === 'challenge' && challengeDisabledReason) return;
    if (onLaunch) onLaunch(selectedItem.entry, { mode, variantId });
    else onChallenge(selectedItem.entry);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (showIndex) setShowIndex(false);
      else if (result) onDismissResult?.();
      else onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusRoot = result ? resultDialogRef.current : dialogRef.current;
    const focusable = getFocusableElements(focusRoot);
    if (!focusable.length) {
      event.preventDefault();
      focusRoot?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const selectedRewards = mode === 'challenge'
    ? selectedItem?.presentation.challengeReward ?? []
    : [];
  const selectedMastery = selectedItem?.unlocked
    ? selectedItem.record.masteryObjectives
      ?? selectedItem.presentation.masteryObjectives
      ?? []
    : [];
  const accent = selectedItem?.presentation.accentColor ?? '#22d3ee';

  return (
    <div className="boss-archive-overlay" data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <section
        ref={dialogRef}
        className="boss-archive-shell sci-neon-frame-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boss-archive-title"
        aria-describedby="boss-archive-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        style={{ '--boss-accent': accent } as React.CSSProperties}
      >
        <div className="boss-archive-shell__backdrop" aria-hidden="true">
          {selectedItem?.unlocked && selectedItem.presentation.backdropUrl
            ? <img src={selectedItem.presentation.backdropUrl} alt="" />
            : null}
          <i />
        </div>

        <header className="boss-archive-header">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="boss-archive-icon-button boss-archive-header__back"
            aria-label="Return to Home"
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
          <img className="boss-archive-header__emblem" src={ARCHIVE_EMBLEM} alt="" draggable={false} />
          <div className="boss-archive-header__title">
            <small>Research Command // Threat Archive</small>
            <h2 id="boss-archive-title">Boss Archive</h2>
            <p id="boss-archive-description">Recovered threats and controlled rechallenges.</p>
          </div>
          <div className="boss-archive-header__status">
            <span><small>Recovered</small><b>{unlockedCount} / {archiveItems.length || unlockedCount}</b></span>
            <span data-empty={challenge?.remaining === 0 ? 'true' : 'false'}>
              <small>Daily charges</small>
              <b>{challenge ? `${challenge.remaining} / ${challenge.limit}` : '-- / --'}</b>
              <em>{challenge?.resetLabel ?? 'Profile link pending'}</em>
            </span>
          </div>
        </header>

        <div className="boss-archive-main custom-scrollbar">
          {archiveItems.length ? (
            <>
              <BossArchiveCarousel
                items={archiveItems}
                selectedIndex={selectedIndex}
                reducedMotion={reducedMotion}
                onSelectIndex={selectIndex}
                onOpenIndex={() => setShowIndex(true)}
              />

              {selectedItem ? (
                <section className="boss-archive-intel" data-locked={selectedItem.unlocked ? 'false' : 'true'}>
                  <div className="boss-archive-intel__identity">
                    <div>
                      <small>{selectedItem.unlocked
                        ? `Mission ${String(selectedItem.entry.missionNumber).padStart(2, '0')} // ${selectedItem.presentation.difficultyLabel}`
                        : selectedItem.entry.lockedPresentation.campaignHint}</small>
                      <h3>{selectedItem.unlocked ? selectedItem.entry.label : 'Unknown Signal'}</h3>
                      <p>{selectedItem.unlocked
                        ? selectedItem.presentation.subtitle
                        : selectedItem.entry.lockedPresentation.subtitle}</p>
                    </div>
                    <div
                      className="boss-archive-threat"
                      aria-label={selectedItem.unlocked
                        ? `Threat level ${selectedItem.presentation.threatLevel ?? 1} of 5`
                        : 'Threat level unknown'}
                    >
                      {Array.from({ length: 5 }, (_, index) => (
                        <i
                          key={index}
                          data-active={selectedItem.unlocked && index < (selectedItem.presentation.threatLevel ?? 1) ? 'true' : 'false'}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="boss-archive-stats" aria-label="Boss records">
                    <span><small>Defeated</small><b>{selectedItem.unlocked ? selectedItem.record.timesDefeated ?? selectedItem.record.totalClears ?? 0 : '--'}</b></span>
                    <span><small>Best clear</small><b>{selectedItem.unlocked ? formatBossArchiveClearTime(selectedItem.record.bestClearTimeMs) : '--:--.--'}</b></span>
                    <span><small>No-hit</small><b>{selectedItem.unlocked ? selectedItem.record.noHitClears ?? 0 : '--'}</b></span>
                    <span><small>Mastery</small><b>{selectedItem.unlocked ? `${selectedMastery.filter((item) => item.completed).length} / ${selectedMastery.length || 3}` : '-- / 3'}</b></span>
                  </div>

                  <nav className="boss-archive-tabs" aria-label="Boss dossier sections">
                    <button type="button" aria-pressed={activePanel === 'intel'} onClick={() => setActivePanel('intel')}>Dossier</button>
                    <button
                      type="button"
                      aria-pressed={activePanel === 'mastery'}
                      disabled={!selectedItem.unlocked}
                      onClick={() => setActivePanel('mastery')}
                    >
                      Mastery
                      {selectedMastery.some((item) => item.completed && !item.claimed) ? <i aria-label="Unclaimed mastery reward" /> : null}
                    </button>
                  </nav>

                  {activePanel === 'intel' ? (
                    <div className="boss-archive-dossier">
                      <p>{selectedItem.unlocked
                        ? selectedItem.presentation.description
                        : selectedItem.entry.lockedPresentation.description}</p>
                      <div className="boss-archive-tags">
                        {selectedItem.unlocked
                          ? selectedItem.presentation.mechanicTags?.map((tag) => <span key={tag}>{tag}</span>)
                          : <span>Unknown mechanics</span>}
                      </div>
                      {selectedItem.unlocked ? (
                        <div className="boss-archive-dossier__records" aria-label="Challenge records">
                          <span><small>Challenge clears</small><b>{selectedItem.record.challengeClears ?? 0}</b></span>
                          <span><small>Best challenge</small><b>{formatBossArchiveClearTime(selectedItem.record.bestChallengeTimeMs)}</b></span>
                          <span><small>Best no-hit</small><b>{formatBossArchiveClearTime(selectedItem.record.bestNoHitTimeMs)}</b></span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <BossMasteryPanel item={selectedItem} onClaim={onClaimMastery} />
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <div className="boss-archive-empty">
              <img src={ARCHIVE_EMBLEM} alt="" />
              <h3>No records recovered</h3>
              <p>Defeat your first mission boss to unlock its archive entry.</p>
            </div>
          )}
        </div>

        {selectedItem ? (
          <footer className="boss-archive-action">
            <div className="boss-archive-mode" role="group" aria-label="Rechallenge mode">
              <button
                type="button"
                aria-label="Practice. Unlimited attempts. Records only."
                aria-pressed={mode === 'practice'}
                onClick={() => setMode('practice')}
                disabled={!selectedItem.unlocked}
              >
                <span>Practice</span><small>Unlimited // records only</small>
              </button>
              <button
                type="button"
                aria-label={challenge
                  ? `Challenge. One charge. ${challenge.remaining} ready.`
                  : 'Challenge. Reward channel offline.'}
                aria-pressed={mode === 'challenge'}
                onClick={() => setMode('challenge')}
                disabled={Boolean(challengeDisabledReason)}
                title={challengeDisabledReason ?? 'One charge is consumed only after a successful clear.'}
              >
                <span>Challenge</span><small>{challenge ? `1 charge // ${challenge.remaining} ready` : 'Reward channel offline'}</small>
              </button>
            </div>

            <div className="boss-archive-action__launch">
              <div className="boss-archive-action__meta">
                {selectedItem.presentation.variants && selectedItem.presentation.variants.length > 1 ? (
                  <label>
                    <span>Variant</span>
                    <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                      {selectedItem.presentation.variants.map((variant) => (
                        <option key={variant.id} value={variant.id} disabled={variant.disabled}>{variant.label}</option>
                      ))}
                    </select>
                  </label>
                ) : <span><small>Variant</small><b>{selectedItem.presentation.variants?.[0]?.label ?? 'Standard'}</b></span>}
                <div>
                  <small>{mode === 'challenge' ? 'Victory reward' : 'Practice reward'}</small>
                  <RewardList rewards={selectedRewards} />
                </div>
              </div>
              <PixelActionButton
                tone={mode === 'challenge' ? 'gold' : 'cyan'}
                ready={mode === 'challenge' && !challengeDisabledReason}
                shine={mode === 'challenge'}
                disabled={!selectedItem.unlocked || (mode === 'challenge' && Boolean(challengeDisabledReason))}
                onClick={launchSelected}
                className="boss-archive-action__button"
                aria-label={selectedItem.unlocked
                  ? mode === 'challenge' ? 'Challenge Boss' : 'Start Practice'
                  : 'Signal Locked'}
              >
                {selectedItem.unlocked
                  ? mode === 'challenge' ? 'Challenge Boss' : 'Start Practice'
                  : 'Signal Locked'}
              </PixelActionButton>
            </div>
            <p className="boss-archive-action__note" role="status">
              {mode === 'challenge'
                ? challengeDisabledReason ?? 'A charge is spent only after victory. Failed attempts are free.'
                : 'Practice attempts never use a daily charge and do not award repeatable resources.'}
            </p>
          </footer>
        ) : null}

        {showIndex ? (
          <div className="boss-archive-index-backdrop" role="presentation" onPointerDown={(event) => {
            if (event.target === event.currentTarget) setShowIndex(false);
          }}>
            <section className="boss-archive-index" role="dialog" aria-modal="true" aria-labelledby="boss-archive-index-title">
              <header><div><small>Rapid target selection</small><h3 id="boss-archive-index-title">Archive Index</h3></div><button type="button" onClick={() => setShowIndex(false)} aria-label="Close archive index">&times;</button></header>
              <div className="boss-archive-index__grid custom-scrollbar">
                {archiveItems.map((item, index) => (
                  <button
                    type="button"
                    key={item.entry.eventId}
                    data-selected={index === selectedIndex ? 'true' : 'false'}
                    data-locked={item.unlocked ? 'false' : 'true'}
                    onClick={() => { selectIndex(index); setShowIndex(false); }}
                  >
                    <span>{item.unlocked
                      ? <img src={item.presentation.portraitUrl ?? item.entry.artUrl} alt="" />
                      : <i className="boss-archive-index__unknown" aria-hidden="true">?</i>}</span>
                    <small>M-{String(item.entry.missionNumber).padStart(2, '0')}</small>
                    <strong>{item.unlocked ? item.entry.label : 'Unknown Signal'}</strong>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {revealEventId && selectedItem?.entry.eventId === revealEventId ? (
          <button type="button" className="boss-archive-reveal" onClick={() => {
            markEncounterViewed(selectedItem.entry.eventId);
          }} aria-label={`New boss unlocked: ${selectedItem.entry.label}. Skip reveal.`}>
            <span className="boss-archive-reveal__scan" aria-hidden="true" />
            <img src={selectedItem.presentation.portraitUrl ?? selectedItem.entry.artUrl} alt="" />
            <small>Archive signal resolved</small>
            <strong>{selectedItem.entry.label}</strong>
            <em>Tap to continue</em>
          </button>
        ) : null}

        {result ? (
          <BossArchiveResultPanel
            result={result}
            item={archiveItems.find((item) => item.entry.eventId === result.eventId)}
            panelRef={resultDialogRef}
            onDismiss={onDismissResult}
            onReplay={() => {
              const replayItem = archiveItems.find((item) => item.entry.eventId === result.eventId) ?? selectedItem;
              if (!replayItem?.unlocked) return;
              const replayMode = result.mode === 'challenge' && challengeDisabledReason
                ? 'practice'
                : result.mode ?? mode;
              if (onLaunch) onLaunch(replayItem.entry, {
                mode: replayMode,
                variantId: result.variantId ?? variantId
              });
              else onChallenge(replayItem.entry);
            }}
          />
        ) : null}

        {developerControls?.enabled ? (
          <aside className="boss-archive-dev" data-open={showDeveloperTools ? 'true' : 'false'}>
            <button type="button" onClick={() => setShowDeveloperTools((open) => !open)} aria-expanded={showDeveloperTools}>DEV</button>
            {showDeveloperTools ? (
              <div>
                {developerControls.onDailyLimitChange ? (
                  <label>
                    Daily limit
                    <input
                      type="number"
                      min={0}
                      max={9}
                      value={developerControls.dailyLimit ?? 3}
                      onChange={(event) => developerControls.onDailyLimitChange?.(
                        Math.max(0, Math.min(9, Math.round(Number(event.target.value) || 0)))
                      )}
                    />
                  </label>
                ) : null}
                {developerControls.onShowLockedEntriesChange ? (
                  <button
                    type="button"
                    onClick={() => developerControls.onShowLockedEntriesChange?.(
                      !developerControls.showLockedEntries
                    )}
                  >
                    {developerControls.showLockedEntries ? 'Hide locked' : 'Show locked'}
                  </button>
                ) : null}
                <button type="button" onClick={developerControls.onUnlockAll}>Unlock all</button>
                <button type="button" onClick={developerControls.onResetProgress}>Reset archive</button>
                <button type="button" onClick={developerControls.onResetDailyCharges}>Reset charges</button>
                <button type="button" onClick={() => {
                  if (!selectedItem) return;
                  setShowDeveloperTools(false);
                  developerControls.onSimulateNewUnlock?.(selectedItem.entry.eventId);
                }}>New unlock</button>
                <button type="button" onClick={() => selectedItem && developerControls.onSimulateMastery?.(selectedItem.entry.eventId)}>Mastery</button>
                <button type="button" onClick={() => {
                  setShowDeveloperTools(false);
                  developerControls.onPreviewResult?.('victory');
                }}>Win result</button>
                <button type="button" onClick={() => {
                  setShowDeveloperTools(false);
                  developerControls.onPreviewResult?.('defeat');
                }}>Loss result</button>
              </div>
            ) : null}
          </aside>
        ) : null}
      </section>
    </div>
  );
};

export default BossArchive;
