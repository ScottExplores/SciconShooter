import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  CAMPAIGN_MISSIONS,
  getCampaignCheckpointLabel,
  type CampaignMissionDefinition,
  type CampaignProgress
} from '../services/campaignProgression';
import PixelActionButton from './PixelActionButton';
import './campaign-map.css';

export type CampaignMapStatus = 'ready' | 'loading' | 'empty' | 'error' | 'launch-pending' | 'launch-error';
export type CampaignLaunchKind = 'checkpoint' | 'mission' | 'replay';

export interface CampaignMapLaunchRequest {
  missionId: string;
  waveId: string;
  kind: CampaignLaunchKind;
}

export interface CampaignMapDeveloperControls {
  enabled: boolean;
  onUnlockAll: () => void;
  onSetCheckpoint: (missionId: string, waveId: string) => void;
  onCompleteWave: (missionId: string, waveId: string) => void;
  onCompleteMission: (missionId: string) => void;
  onResetProgress: () => void;
  onResetStars: () => void;
  onPreviewLocked: (enabled: boolean) => void;
  onPreviewNew: (missionId: string) => void;
  onPreviewResult: (missionId: string, waveId: string, stageComplete: boolean) => void;
}

interface CampaignMapProps {
  open: boolean;
  progress: CampaignProgress;
  missions?: CampaignMissionDefinition[];
  status?: CampaignMapStatus;
  errorMessage?: string;
  initialMissionId?: string | null;
  newMissionIds?: string[];
  readOnly?: boolean;
  onClose: () => void;
  onLaunch: (request: CampaignMapLaunchRequest) => void;
  developerControls?: CampaignMapDeveloperControls | null;
}

const NODE_STEP = 168;
const ROUTE_TOP = 96;

const formatTime = (milliseconds: number | null) => {
  if (!milliseconds) return '--';
  const seconds = Math.max(0, Math.round(milliseconds / 100) / 10);
  return `${seconds.toFixed(1)}s`;
};

const formatTheme = (backgroundId: string) => backgroundId
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getMissionBaseClearReward = (mission: CampaignMissionDefinition) => (
  (mission.reward.waveClearCoins * mission.waveIds.length) + mission.reward.missionClearCoins
);

const getMissionReplayReward = (mission: CampaignMissionDefinition) => (
  (Math.max(1, Math.round(mission.reward.waveClearCoins * mission.reward.replayMultiplier)) * mission.waveIds.length)
  + Math.max(1, Math.round(mission.reward.missionClearCoins * mission.reward.replayMultiplier))
);

const getMissionState = (mission: CampaignMissionDefinition, progress: CampaignProgress) => {
  const record = progress.missionRecords[mission.id];
  return {
    completed: Boolean(record?.completed),
    current: progress.recommendedMissionId === mission.id,
    unlocked: progress.unlockedMissionIds.includes(mission.id),
    new: progress.unviewedMissionIds.includes(mission.id),
    stars: Math.max(0, Math.min(3, record?.stars ?? 0)),
    completedWaves: record?.completedWaveIds.length ?? 0
  };
};

const getNodeTop = (mission: CampaignMissionDefinition, missionCount: number) => (
  ROUTE_TOP + ((missionCount - mission.number) * NODE_STEP)
);

const CampaignMap: React.FC<CampaignMapProps> = ({
  open,
  progress,
  missions = CAMPAIGN_MISSIONS,
  status = 'ready',
  errorMessage = '',
  initialMissionId = null,
  newMissionIds = [],
  readOnly = false,
  onClose,
  onLaunch,
  developerControls = null
}) => {
  const checkpoint = useMemo(() => getCampaignCheckpointLabel(progress), [progress]);
  const orderedMissions = useMemo(() => (
    [...missions].sort((left, right) => left.number - right.number)
  ), [missions]);
  const preferredMissionId = initialMissionId
    ?? newMissionIds.at(-1)
    ?? progress.unviewedMissionIds.at(-1)
    ?? progress.recommendedMissionId;
  const [selectedMissionId, setSelectedMissionId] = useState(preferredMissionId);
  const [developerWaveId, setDeveloperWaveId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [routeAwayFromCurrent, setRouteAwayFromCurrent] = useState(false);
  const [previewLocked, setPreviewLocked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; y: number; scrollTop: number } | null>(null);
  const gamepadStateRef = useRef({ next: false, previous: false, close: false });

  const selectedMission = orderedMissions.find((mission) => mission.id === selectedMissionId)
    ?? orderedMissions.find((mission) => mission.id === progress.recommendedMissionId)
    ?? orderedMissions[0]
    ?? null;
  const selectedState = selectedMission ? getMissionState(selectedMission, progress) : null;
  const selectedRecord = selectedMission ? progress.missionRecords[selectedMission.id] : null;
  const selectedRevealed = Boolean(selectedState?.unlocked || previewLocked);
  const selectedBaseClearReward = selectedMission ? getMissionBaseClearReward(selectedMission) : 0;
  const selectedReplayReward = selectedMission ? getMissionReplayReward(selectedMission) : 0;
  const checkpointWaveIndex = selectedMission?.id === progress.recommendedMissionId
    ? Math.max(0, selectedMission.waveIds.indexOf(progress.recommendedWaveId))
    : 0;
  const launchRequest: CampaignMapLaunchRequest | null = selectedMission && selectedState?.unlocked
    ? {
        missionId: selectedMission.id,
        waveId: selectedState.completed
          ? selectedMission.waveIds[0]
          : selectedState.current
          ? selectedMission.waveIds[checkpointWaveIndex]
          : selectedMission.waveIds[0],
        kind: selectedState.completed
          ? 'replay'
          : selectedState.current
            ? 'checkpoint'
            : 'mission'
      }
    : null;
  const launchLabel = launchRequest?.kind === 'replay'
    ? 'Replay Mission'
    : launchRequest?.kind === 'checkpoint'
      ? checkpoint.action === 'Continue Mission'
        ? `Continue Wave ${checkpointWaveIndex + 1}`
        : checkpoint.action
      : 'Start Mission';
  const routeHeight = Math.max(720, ROUTE_TOP * 2 + Math.max(0, orderedMissions.length - 1) * NODE_STEP);

  const routePoints = orderedMissions
    .slice()
    .sort((left, right) => right.number - left.number)
    .map((mission) => `${Math.round(mission.mapPosition.x * 100)},${getNodeTop(mission, orderedMissions.length) + 38}`)
    .join(' ');
  const checkpointMissionNumber = orderedMissions.find(
    (mission) => mission.id === progress.recommendedMissionId
  )?.number ?? orderedMissions[0]?.number ?? 1;
  const reachedRoutePoints = orderedMissions
    .filter((mission) => mission.number <= checkpointMissionNumber)
    .sort((left, right) => right.number - left.number)
    .map((mission) => `${Math.round(mission.mapPosition.x * 100)},${getNodeTop(mission, orderedMissions.length) + 38}`)
    .join(' ');

  const centerMissionNode = useCallback((missionId: string, behavior: ScrollBehavior = 'smooth') => {
    const target = nodeRefs.current.get(missionId);
    const scroller = routeRef.current;
    if (!target || !scroller) return;
    const targetTop = target.offsetTop - ((scroller.clientHeight - target.offsetHeight) / 2);
    scroller.scrollTo({ top: Math.max(0, targetTop), behavior });
  }, []);

  const refreshCurrentMissionDistance = useCallback(() => {
    const currentNode = nodeRefs.current.get(progress.recommendedMissionId);
    const scroller = routeRef.current;
    if (!currentNode || !scroller) {
      setRouteAwayFromCurrent(false);
      return;
    }
    const currentCenter = currentNode.offsetTop + (currentNode.offsetHeight / 2);
    const viewportCenter = scroller.scrollTop + (scroller.clientHeight / 2);
    setRouteAwayFromCurrent(
      Math.abs(currentCenter - viewportCenter) > Math.max(96, scroller.clientHeight * 0.46)
    );
  }, [progress.recommendedMissionId]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedMissionId(preferredMissionId);
  }, [open, preferredMissionId]);

  useEffect(() => {
    if (!selectedMission) return;
    const nextWaveId = selectedMission.id === progress.recommendedMissionId
      && selectedMission.waveIds.includes(progress.recommendedWaveId)
      ? progress.recommendedWaveId
      : selectedMission.waveIds[0];
    setDeveloperWaveId(nextWaveId ?? '');
  }, [progress.recommendedMissionId, progress.recommendedWaveId, selectedMission]);

  useLayoutEffect(() => {
    if (!open || !selectedMissionId) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    centerMissionNode(selectedMissionId, reduceMotion ? 'auto' : 'smooth');
  }, [centerMissionNode, open, selectedMissionId]);

  useEffect(() => {
    if (!open || typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    const poll = () => {
      const pad = Array.from(navigator.getGamepads()).find(Boolean);
      const nextPressed = Boolean(pad?.buttons[12]?.pressed || pad?.buttons[15]?.pressed);
      const previousPressed = Boolean(pad?.buttons[13]?.pressed || pad?.buttons[14]?.pressed);
      const closePressed = Boolean(pad?.buttons[1]?.pressed);
      if (nextPressed && !gamepadStateRef.current.next) {
        setSelectedMissionId((current) => {
          const index = Math.max(0, orderedMissions.findIndex((mission) => mission.id === current));
          return orderedMissions[Math.min(orderedMissions.length - 1, index + 1)]?.id ?? current;
        });
      }
      if (previousPressed && !gamepadStateRef.current.previous) {
        setSelectedMissionId((current) => {
          const index = Math.max(0, orderedMissions.findIndex((mission) => mission.id === current));
          return orderedMissions[Math.max(0, index - 1)]?.id ?? current;
        });
      }
      if (closePressed && !gamepadStateRef.current.close) onClose();
      gamepadStateRef.current = { next: nextPressed, previous: previousPressed, close: closePressed };
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [onClose, open, orderedMissions]);

  if (!open) return null;

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, y: event.clientY, scrollTop: event.currentTarget.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.currentTarget.scrollTop = dragRef.current.scrollTop - (event.clientY - dragRef.current.y);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const target = event.target as HTMLElement;
    const navigationTarget = target === dialogRef.current || Boolean(target.closest('.campaign-map-node'));
    if (!navigationTarget) return;
    event.preventDefault();
    const currentIndex = Math.max(0, orderedMissions.findIndex((mission) => mission.id === selectedMissionId));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? orderedMissions.length - 1
        : Math.max(0, Math.min(
            orderedMissions.length - 1,
            currentIndex + (event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1)
          ));
    const next = orderedMissions[nextIndex];
    if (next) {
      setSelectedMissionId(next.id);
      nodeRefs.current.get(next.id)?.focus({ preventScroll: true });
    }
  };

  return (
    <div className="campaign-map-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="campaign-map-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-map-title"
        aria-describedby="campaign-map-instructions"
        aria-busy={status === 'loading' || status === 'launch-pending'}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="campaign-map-header">
          <button className="campaign-map-close" type="button" onClick={onClose} aria-label="Close Campaign Map">&times;</button>
          <div className="campaign-map-heading">
            <span>Research Command Network</span>
            <h1 id="campaign-map-title">Campaign Map</h1>
            <p id="campaign-map-instructions">Select an unlocked Mission. Use arrow keys, touch drag, or the mouse wheel to navigate.</p>
          </div>
          <div className="campaign-map-checkpoint" aria-label={`Current checkpoint Mission ${checkpoint.missionNumber}, Wave ${checkpoint.waveNumber} of ${checkpoint.waveTotal}`}>
            <small>Current checkpoint</small>
            <strong>M{String(checkpoint.missionNumber).padStart(2, '0')} / W{checkpoint.waveNumber}/{checkpoint.waveTotal}</strong>
          </div>
        </header>

        {status === 'loading' ? (
          <div className="campaign-map-state" role="status"><span className="campaign-map-loader" aria-hidden="true" />Decoding campaign route...</div>
        ) : status === 'empty' || missions.length === 0 ? (
          <div className="campaign-map-state" role="status">No campaign Missions are configured.</div>
        ) : status === 'error' ? (
          <div className="campaign-map-state campaign-map-state--error" role="alert">{errorMessage || 'Campaign route unavailable.'}</div>
        ) : (
          <>
            <div
              ref={routeRef}
              className={`campaign-map-route-scroll ${dragging ? 'is-dragging' : ''}`}
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onScroll={refreshCurrentMissionDistance}
              onLostPointerCapture={() => {
                dragRef.current = null;
                setDragging(false);
              }}
              role="region"
              aria-label="Campaign Mission route"
            >
              <div className="campaign-map-starfield campaign-map-starfield--far" aria-hidden="true" />
              <div className="campaign-map-starfield campaign-map-starfield--near" aria-hidden="true" />
              <div className="campaign-map-route" style={{ height: routeHeight }}>
                <svg
                  className="campaign-map-route-lines"
                  viewBox={`0 0 100 ${routeHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline className="campaign-map-route-line campaign-map-route-line--future" points={routePoints} />
                  {reachedRoutePoints.includes(' ') ? (
                    <>
                      <polyline className="campaign-map-route-line campaign-map-route-line--reached" points={reachedRoutePoints} />
                      <polyline className="campaign-map-route-line campaign-map-route-line--complete" points={reachedRoutePoints} />
                    </>
                  ) : null}
                </svg>
                {orderedMissions.map((mission) => {
                  const nodeState = getMissionState(mission, progress);
                  const selected = selectedMission?.id === mission.id;
                  const newNode = nodeState.new || newMissionIds.includes(mission.id);
                  const stateName = !nodeState.unlocked
                    ? 'locked'
                    : nodeState.current
                      ? 'current'
                      : nodeState.completed
                        ? 'completed'
                        : 'unlocked';
                  const stateLabel = !nodeState.unlocked
                    ? 'Locked'
                    : nodeState.current
                      ? nodeState.completed ? 'Current checkpoint, completed' : 'Current checkpoint'
                      : nodeState.completed
                        ? 'Completed'
                        : 'Unlocked';
                  return (
                    <button
                      key={mission.id}
                      ref={(node) => {
                        if (node) nodeRefs.current.set(mission.id, node);
                        else nodeRefs.current.delete(mission.id);
                      }}
                      type="button"
                      className={`campaign-map-node campaign-map-node--${stateName} ${nodeState.completed ? 'is-completed' : ''} ${nodeState.unlocked ? 'is-unlocked' : 'is-locked'} ${mission.bossEventId && (nodeState.unlocked || previewLocked) ? 'campaign-map-node--boss' : ''} ${selected ? 'is-selected' : ''} ${newNode ? 'is-new' : ''}`}
                      style={{
                        '--campaign-node-x': `${mission.mapPosition.x * 100}%`,
                        '--campaign-node-y': `${getNodeTop(mission, orderedMissions.length)}px`,
                        '--campaign-node-tint': mission.tint
                      } as React.CSSProperties}
                      onClick={() => setSelectedMissionId(mission.id)}
                      aria-current={nodeState.current ? 'step' : undefined}
                      aria-pressed={selected}
                      tabIndex={selected ? 0 : -1}
                      aria-label={`Mission ${mission.number}: ${!nodeState.unlocked && !previewLocked ? 'Encrypted Sector' : mission.name}. ${stateLabel}. ${nodeState.stars} of 3 stars.${newNode ? ' New.' : ''}`}
                    >
                      <span className="campaign-map-node-ring" aria-hidden="true" />
                      <span className="campaign-map-node-core">
                        {nodeState.unlocked || previewLocked ? (
                          <img src={mission.previewUrl} alt="" draggable={false} />
                        ) : (
                          <span className="campaign-map-node-lock" aria-hidden="true">&#9670;</span>
                        )}
                      </span>
                      <span className="campaign-map-node-number">{String(mission.number).padStart(2, '0')}</span>
                      {newNode ? <span className="campaign-map-node-new">New</span> : null}
                      {nodeState.current ? (
                        <img
                          className="campaign-map-ship-marker"
                          src="/game-art/generated/scicon-flight-motion-pack-v1/ships/researchhub/frames/researchhub-03-neutral.png"
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                        />
                      ) : null}
                      <span className="campaign-map-node-stars" aria-hidden="true">
                        {[0, 1, 2].map((index) => <span key={index}>{index < nodeState.stars ? '\u2605' : '\u2606'}</span>)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedMission && selectedState ? (
              <section
                className="campaign-map-selection"
                aria-labelledby="campaign-map-selection-title"
              >
                <p className="campaign-map-sr-only" role="status">
                  Mission {selectedMission.number}, {selectedRevealed ? selectedMission.name : 'Encrypted Sector'}. {selectedState.current
                    ? 'Current checkpoint.'
                    : selectedState.completed
                      ? 'Completed.'
                      : selectedState.unlocked
                        ? 'Unlocked.'
                        : 'Locked.'}
                </p>
                <div className="campaign-map-selection-topline">
                  <span>Mission {String(selectedMission.number).padStart(2, '0')} / {orderedMissions.length}</span>
                  <span className={`campaign-map-selection-state campaign-map-selection-state--${selectedState.current ? 'current' : selectedState.completed ? 'completed' : selectedState.unlocked ? 'unlocked' : 'locked'}`}>
                    {selectedState.current
                      ? selectedState.completed ? 'Current / completed' : 'Current checkpoint'
                      : selectedState.completed
                        ? 'Completed'
                        : selectedState.unlocked
                          ? 'Unlocked'
                          : 'Locked'}
                  </span>
                  <span>{selectedState.completedWaves}/{selectedMission.waveIds.length} waves</span>
                </div>
                <div className="campaign-map-selection-grid">
                  <div className="campaign-map-selection-art" style={{ '--campaign-node-tint': selectedMission.tint } as React.CSSProperties}>
                    {selectedState.unlocked || previewLocked ? (
                      <img src={selectedMission.previewUrl} alt="" />
                    ) : <span aria-hidden="true">LOCKED</span>}
                  </div>
                  <div className="campaign-map-selection-copy">
                    <div className="campaign-map-selection-title">
                      <h2 id="campaign-map-selection-title">{selectedRevealed ? selectedMission.name : 'Encrypted Sector'}</h2>
                      {selectedRevealed && selectedMission.bossEventId ? (
                        <span className="campaign-map-boss-tag">{selectedMission.bossName ?? 'Boss encounter'}</span>
                      ) : null}
                    </div>
                    {selectedRevealed ? (
                      <span className="campaign-map-environment">Environment / {formatTheme(selectedMission.backgroundId)}</span>
                    ) : null}
                    <p>{selectedRevealed
                      ? selectedMission.description
                      : `Complete Mission ${Math.max(1, selectedMission.number - 1)} to reveal this sector.`}</p>
                    <div className="campaign-map-wave-list" aria-label="Mission waves">
                      {selectedMission.waves.map((wave) => {
                        const completed = selectedRecord?.completedWaveIds.includes(wave.id);
                        const unlocked = progress.unlockedWaveIdsByMission[selectedMission.id]?.includes(wave.id);
                        const waveState = completed ? 'complete' : unlocked ? 'unlocked' : 'locked';
                        return (
                          <span
                            key={wave.id}
                            className={completed ? 'is-complete' : unlocked ? 'is-unlocked' : ''}
                            aria-label={`Wave ${wave.number}: ${waveState}`}
                            title={selectedRevealed ? `${wave.name} - ${waveState}` : `Wave ${wave.number} - locked`}
                          >
                            {wave.number}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {selectedRevealed ? (
                  <>
                    <div className="campaign-map-records">
                      <span><small>Stars</small><strong>{selectedState.stars}/3</strong></span>
                      <span><small>Best score</small><strong>{(selectedRecord?.bestScore ?? 0).toLocaleString()}</strong></span>
                      <span><small>Best time</small><strong>{formatTime(selectedRecord?.bestClearTimeMs ?? null)}</strong></span>
                      <span><small>{selectedState.completed ? 'Replay total' : 'Base clear'}</small><strong>{selectedState.completed ? selectedReplayReward : selectedBaseClearReward} coins</strong></span>
                      <span><small>First-clear bonus</small><strong>{selectedMission.reward.firstClearCoins} coins</strong></span>
                      {selectedMission.bossEventId ? (
                        <span><small>Boss first-clear</small><strong>{selectedMission.reward.bossFirstClearCoins} coins</strong></span>
                      ) : null}
                    </div>
                    <div className="campaign-map-objectives" aria-label="Mission mastery objectives">
                      {selectedMission.starObjectives.map((objective, index) => (
                        <span key={objective.id} className={selectedRecord?.earnedStarIds.includes(objective.id) ? 'is-earned' : ''}>
                          <b aria-hidden="true">{index + 1}</b>{objective.label}<em>+{objective.rewardCoins}</em>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="campaign-map-locked-copy">Mission intelligence, Gatekeeper data, rewards, and mastery objectives remain encrypted.</p>
                )}
                <div className={`campaign-map-actions ${selectedMission.id === progress.recommendedMissionId ? 'is-current' : ''}`}>
                  {selectedMission.id !== progress.recommendedMissionId || routeAwayFromCurrent ? (
                    <button
                      className="campaign-map-current-button"
                      type="button"
                      onClick={() => {
                        setSelectedMissionId(progress.recommendedMissionId);
                        window.requestAnimationFrame(() => centerMissionNode(progress.recommendedMissionId));
                      }}
                    >
                      Return to current Mission
                    </button>
                  ) : null}
                  <PixelActionButton
                    tone={launchRequest && !readOnly ? 'green' : 'neutral'}
                    ready={Boolean(launchRequest) && !readOnly}
                    shine={Boolean(launchRequest) && !readOnly}
                    disabled={!launchRequest || readOnly || status === 'launch-pending'}
                    onClick={() => launchRequest && onLaunch(launchRequest)}
                    className="campaign-map-launch"
                  >
                    {status === 'launch-pending' ? 'Preparing Mission...' : readOnly ? 'Viewing active route' : launchRequest ? launchLabel : 'Locked'}
                  </PixelActionButton>
                </div>
                {status === 'launch-error' ? <p className="campaign-map-launch-error" role="alert">{errorMessage || 'Mission launch failed. Try again.'}</p> : null}
              </section>
            ) : null}
          </>
        )}

        {developerControls?.enabled ? (
          <details className="campaign-map-devtools">
            <summary>Campaign developer controls</summary>
            <div>
              <button type="button" onClick={developerControls.onUnlockAll}>Unlock all</button>
              <button type="button" onClick={developerControls.onResetProgress}>Reset progress</button>
              <button type="button" onClick={developerControls.onResetStars}>Reset stars</button>
              <button type="button" onClick={() => {
                const next = !previewLocked;
                setPreviewLocked(next);
                developerControls.onPreviewLocked(next);
              }}>{previewLocked ? 'Hide' : 'Preview'} locked</button>
              {selectedMission ? (
                <>
                  <label>
                    Test wave
                    <select value={developerWaveId} onChange={(event) => setDeveloperWaveId(event.currentTarget.value)}>
                      {selectedMission.waves.map((wave) => (
                        <option key={wave.id} value={wave.id}>Wave {wave.number}: {wave.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => developerControls.onSetCheckpoint(
                    selectedMission.id,
                    developerWaveId || selectedMission.waveIds[0]
                  )}>Set checkpoint</button>
                  <button type="button" onClick={() => developerControls.onCompleteWave(
                    selectedMission.id,
                    developerWaveId || selectedMission.waveIds[0]
                  )}>Complete wave</button>
                  <button type="button" onClick={() => developerControls.onCompleteMission(selectedMission.id)}>Complete Mission</button>
                  <button type="button" onClick={() => developerControls.onPreviewNew(selectedMission.id)}>Preview new</button>
                  <button type="button" onClick={() => developerControls.onPreviewResult(
                    selectedMission.id,
                    developerWaveId || selectedMission.waveIds[0],
                    false
                  )}>Preview Wave result</button>
                  <button type="button" onClick={() => developerControls.onPreviewResult(
                    selectedMission.id,
                    selectedMission.waveIds.at(-1) ?? selectedMission.waveIds[0],
                    true
                  )}>Preview Mission result</button>
                  <button type="button" onClick={developerControls.onUnlockAll}>Simulate 20-Mission map</button>
                </>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
};

export default CampaignMap;
