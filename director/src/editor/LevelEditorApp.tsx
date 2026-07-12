import { useCallback, useEffect, useMemo, useState } from 'react';
import { GameEditorCanvas, type GameEditorSnapshot } from '../../../components/GameEditorCanvas';
import { isAssetAllowedForRole } from '../../../game-config/catalog';
import { normalizeGameCampaignRecordCard } from '../../../game-config/recordCard';
import type { GameCampaignConfig, LevelDefinition, WaveDefinition, WaveEvent } from '../../../game-config/types';
import {
  applyGameCampaign,
  createReview,
  fetchGameCampaign,
  fetchGameCampaignVersions,
  fetchReviews,
  revertGameCampaignEdits,
  rollbackGameCampaign,
  updateReview,
  type GameCampaignDiskState,
  type GameCampaignVersionSummary
} from '@director/api/directorClient';
import type { ReviewRequest } from '@director/domain/types';
import { useUndoableState } from '@director/hooks/useUndoableState';
import { EditorIcon } from './EditorIcon';
import { EditorInspector, type InspectorTab } from './EditorInspector';
import { EventTimeline } from './EventTimeline';
import { LevelRail } from './LevelRail';
import { GameplayPlacementOverlay } from './GameplayPlacementOverlay';
import { LivePreviewAnnotations } from './LivePreviewAnnotations';
import { RecordCardEditorSurface } from './RecordCardEditorSurface';
import { ReviewNotesPanel } from './ReviewNotesPanel';
import { WaveStrip } from './WaveStrip';
import {
  cloneJson,
  cloneLevel,
  cloneWave,
  createBossEvent,
  createSpawnEvent,
  moveLevel,
  moveWave,
  reorderWave,
  sortWaveEvents,
  updateLevelInCampaign
} from './editorOperations';
import './level-editor.css';

const DRAFT_KEY = 'scicon-director-game-campaign-draft-v1';

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
};

const hashDraftCampaign = async (campaign: GameCampaignConfig) => {
  const bytes = new TextEncoder().encode(canonicalJson(campaign));
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
};

type PreviewRuntimeState = {
  levelId: string;
  levelName: string;
  waveId: string;
  waveName: string;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  complete: boolean;
};

type Notice = { message: string; error?: boolean } | null;
type EditorSurface = 'game' | 'card' | 'review';

const readEditorSurface = (): EditorSurface => {
  const surface = new URLSearchParams(window.location.search).get('surface');
  if (surface === 'scorecard') return 'card';
  if (surface === 'review') return 'review';
  return 'game';
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Local revision';
};

function DirectorMark() {
  return (
    <svg viewBox="0 0 32 42" aria-hidden="true">
      <path d="M12 3h8l-1 6 5 8-2 19H10L8 17l5-8-1-6Z" />
      <path d="M10 25h12M8.8 31h14.4M13 9h6" />
    </svg>
  );
}

function HistoryDrawer({
  open,
  versions,
  activeVersionId,
  busy,
  onClose,
  onRollback
}: {
  open: boolean;
  versions: GameCampaignVersionSummary[];
  activeVersionId: string | null;
  busy: boolean;
  onClose: () => void;
  onRollback: (versionId: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="le-history-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="le-history" role="dialog" aria-modal="true" aria-labelledby="le-history-title">
        <header>
          <div><p>Actual game configuration</p><h2 id="le-history-title">Version history</h2></div>
          <button className="le-icon-button" type="button" aria-label="Close version history" onClick={onClose}>×</button>
        </header>
        <div className="le-history-list">
          {versions.map((version) => {
            const active = version.id === activeVersionId;
            return (
              <article key={version.id} className={`le-history-card${active ? ' is-active' : ''}`}>
                <header><strong>Revision {version.revision}</strong>{active ? <span>Active</span> : null}</header>
                <p>{version.changeNote}</p>
                <p>{formatDate(version.createdAt)} · {version.source}</p>
                <code>{version.contentHash.replace('sha256:', '').slice(0, 14)}</code>
                <button className="le-button" type="button" disabled={active || busy} onClick={() => onRollback(version.id)}><EditorIcon name="restart" /> Roll back into a new revision</button>
              </article>
            );
          })}
          {versions.length === 0 ? <p className="le-validation">No applied revisions yet. The first Apply to game action will capture the tracked baseline.</p> : null}
        </div>
      </aside>
    </div>
  );
}

function LevelEditorWorkspace({ initialState }: { initialState: GameCampaignDiskState<GameCampaignConfig> }) {
  const initialSurface = readEditorSurface();
  const campaign = useUndoableState<GameCampaignConfig>(normalizeGameCampaignRecordCard(cloneJson(initialState.campaign)));
  const [contentHash, setContentHash] = useState(initialState.contentHash);
  const [activeVersionId, setActiveVersionId] = useState(initialState.activeVersionId);
  const [selectedLevelId, setSelectedLevelId] = useState(initialState.campaign.levels[0]?.id ?? '');
  const [selectedWaveId, setSelectedWaveId] = useState(initialState.campaign.levels[0]?.waves[0]?.id ?? '');
  const [selectedEventId, setSelectedEventId] = useState(initialState.campaign.levels[0]?.waves[0]?.events[0]?.id ?? '');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(initialSurface === 'card' ? 'card' : 'wave');
  const [playing, setPlaying] = useState(initialSurface === 'game');
  const [restartToken, setRestartToken] = useState(0);
  const [runtimeState, setRuntimeState] = useState<PreviewRuntimeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<GameCampaignVersionSummary[]>([]);
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [annotationMode, setAnnotationMode] = useState(initialSurface === 'review');
  const [placementMode, setPlacementMode] = useState(false);
  const [surfaceMode, setSurfaceMode] = useState<EditorSurface>(initialSurface);
  const [editorSnapshot, setEditorSnapshot] = useState<GameEditorSnapshot | null>(null);
  const [draftContentHash, setDraftContentHash] = useState<string | null>(null);
  const [updatingReviewId, setUpdatingReviewId] = useState<string | null>(null);

  const selectedLevel = campaign.value.levels.find((level) => level.id === selectedLevelId) ?? campaign.value.levels[0];
  const selectedWave = selectedLevel?.waves.find((wave) => wave.id === selectedWaveId) ?? selectedLevel?.waves[0];

  const notify = useCallback((message: string, error = false) => {
    setNotice({ message, error });
    window.setTimeout(() => setNotice((current) => current?.message === message ? null : current), error ? 6500 : 3600);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { baseContentHash?: string; campaign?: GameCampaignConfig };
      if (saved.baseContentHash === initialState.contentHash && saved.campaign?.schemaVersion === 1) {
        campaign.set(normalizeGameCampaignRecordCard(cloneJson(saved.campaign)));
        notify('Recovered your local level-editor draft');
      }
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchReviews()
      .then((result) => { if (!cancelled) setReviews(result.reviews); })
      .catch((error) => {
        if (!cancelled) notify(error instanceof Error ? error.message : 'Review notes are unavailable', true);
      });
    return () => { cancelled = true; };
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    if (!campaign.isDirty) {
      setDraftContentHash(null);
      return () => { cancelled = true; };
    }
    setDraftContentHash(null);
    void hashDraftCampaign(campaign.value)
      .then((hash) => { if (!cancelled) setDraftContentHash(hash); })
      .catch(() => { if (!cancelled) notify('Could not fingerprint the current draft for annotations', true); });
    return () => { cancelled = true; };
  }, [campaign.isDirty, campaign.value, notify]);

  useEffect(() => {
    if (!selectedLevel) return;
    if (!selectedLevel.waves.some((wave) => wave.id === selectedWaveId)) {
      const nextWave = selectedLevel.waves[0];
      setSelectedWaveId(nextWave?.id ?? '');
      setSelectedEventId(nextWave?.events[0]?.id ?? '');
    }
  }, [selectedLevel, selectedWaveId]);

  useEffect(() => {
    if (!selectedWave) return;
    if (!selectedWave.events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(selectedWave.events[0]?.id ?? '');
    }
  }, [selectedEventId, selectedWave]);

  const setCampaign = (next: GameCampaignConfig) => {
    campaign.set(next);
    setValidationErrors([]);
  };

  const updateSelectedLevel = (update: (level: LevelDefinition) => LevelDefinition) => {
    if (!selectedLevel) return;
    setCampaign(updateLevelInCampaign(campaign.value, selectedLevel.id, update));
  };

  const updateSelectedWave = (update: (wave: WaveDefinition) => WaveDefinition) => {
    if (!selectedWave) return;
    updateSelectedLevel((level) => ({
      ...level,
      waves: level.waves.map((wave) => wave.id === selectedWave.id ? update(wave) : wave)
    }));
  };

  const handleSelectLevel = (levelId: string) => {
    const level = campaign.value.levels.find((item) => item.id === levelId);
    const wave = level?.waves[0];
    setSelectedLevelId(levelId);
    setSelectedWaveId(wave?.id ?? '');
    setSelectedEventId(wave?.events[0]?.id ?? '');
    setAnnotationMode(false);
    setPlacementMode(false);
    setRestartToken((value) => value + 1);
  };

  const handleAddLevel = () => {
    if (!selectedLevel) return;
    const next = cloneLevel(selectedLevel, `New Level ${campaign.value.levels.length + 1}`);
    next.order = campaign.value.levels.length + 1;
    setCampaign({ ...campaign.value, levels: [...campaign.value.levels, next] });
    handleSelectLevelAfterChange(next);
  };

  const handleSelectLevelAfterChange = (level: LevelDefinition) => {
    setSelectedLevelId(level.id);
    setSelectedWaveId(level.waves[0]?.id ?? '');
    setSelectedEventId(level.waves[0]?.events[0]?.id ?? '');
    setInspectorTab('level');
    setAnnotationMode(false);
    setPlacementMode(false);
    setRestartToken((value) => value + 1);
  };

  const handleDuplicateLevel = () => {
    if (!selectedLevel) return;
    const next = cloneLevel(selectedLevel);
    next.order = campaign.value.levels.length + 1;
    setCampaign({ ...campaign.value, levels: [...campaign.value.levels, next] });
    handleSelectLevelAfterChange(next);
  };

  const handleRenameLevel = () => {
    if (!selectedLevel) return;
    const name = window.prompt('Level name', selectedLevel.name)?.trim();
    if (name) updateSelectedLevel((level) => ({ ...level, name }));
  };

  const handleDeleteLevel = () => {
    if (!selectedLevel || campaign.value.levels.length <= 1) return;
    if (!window.confirm(`Delete “${selectedLevel.name}”? Version history can restore it after an apply.`)) return;
    const levels = campaign.value.levels.filter((level) => level.id !== selectedLevel.id).map((level, index) => ({ ...level, order: index + 1 }));
    setCampaign({ ...campaign.value, levels });
    handleSelectLevelAfterChange(levels[0]);
  };

  const handleAddWave = () => {
    if (!selectedLevel || !selectedWave) return;
    const next = cloneWave(selectedWave, `New Wave ${selectedLevel.waves.length + 1}`);
    next.order = selectedLevel.waves.length + 1;
    updateSelectedLevel((level) => ({ ...level, waves: [...level.waves, next] }));
    setSelectedWaveId(next.id);
    setSelectedEventId(next.events[0]?.id ?? '');
    setRestartToken((value) => value + 1);
  };

  const handleDuplicateWave = () => {
    if (!selectedLevel || !selectedWave) return;
    const next = cloneWave(selectedWave);
    const insertAt = selectedLevel.waves.findIndex((wave) => wave.id === selectedWave.id) + 1;
    const waves = [...selectedLevel.waves];
    waves.splice(insertAt, 0, next);
    updateSelectedLevel((level) => ({ ...level, waves: waves.map((wave, index) => ({ ...wave, order: index + 1 })) }));
    setSelectedWaveId(next.id);
    setSelectedEventId(next.events[0]?.id ?? '');
  };

  const handleDeleteWave = () => {
    if (!selectedLevel || !selectedWave || selectedLevel.waves.length <= 1) return;
    if (!window.confirm(`Delete “${selectedWave.name}”?`)) return;
    const index = selectedLevel.waves.findIndex((wave) => wave.id === selectedWave.id);
    const waves = selectedLevel.waves.filter((wave) => wave.id !== selectedWave.id).map((wave, waveIndex) => ({ ...wave, order: waveIndex + 1 }));
    const next = waves[Math.min(index, waves.length - 1)];
    updateSelectedLevel((level) => ({ ...level, waves }));
    setSelectedWaveId(next.id);
    setSelectedEventId(next.events[0]?.id ?? '');
  };

  const handleMoveWave = (direction: -1 | 1) => {
    if (!selectedLevel || !selectedWave) return;
    updateSelectedLevel((level) => moveWave(level, selectedWave.id, direction));
  };

  const handleSelectWave = (waveId: string) => {
    const wave = selectedLevel?.waves.find((item) => item.id === waveId);
    setSelectedWaveId(waveId);
    setSelectedEventId(wave?.events[0]?.id ?? '');
    setAnnotationMode(false);
    setPlacementMode(false);
    setRestartToken((value) => value + 1);
  };

  const selectAdjacentWave = (direction: -1 | 1) => {
    if (!selectedLevel || !selectedWave) return;
    const index = selectedLevel.waves.findIndex((wave) => wave.id === selectedWave.id);
    const next = selectedLevel.waves[index + direction];
    if (next) handleSelectWave(next.id);
  };

  const handleUpdateLevel = (patch: Partial<LevelDefinition>) => {
    updateSelectedLevel((level) => ({
      ...level,
      ...patch,
      waves: patch.backgroundId ? level.waves.map((wave) => ({ ...wave, backgroundId: patch.backgroundId! })) : level.waves
    }));
  };

  const handleUpdateWave = (patch: Partial<WaveDefinition>) => {
    updateSelectedWave((wave) => ({ ...wave, ...patch }));
  };

  const handleUpdateEvent = (nextEvent: WaveEvent) => {
    updateSelectedWave((wave) => ({
      ...wave,
      events: sortWaveEvents(wave.events.map((event) => event.id === nextEvent.id ? nextEvent : event))
    }));
  };

  const handleAddEvent = (kind: 'spawn' | 'boss') => {
    if (!selectedWave) return;
    const next = kind === 'spawn' ? createSpawnEvent(selectedWave) : createBossEvent(selectedWave);
    updateSelectedWave((wave) => ({ ...wave, events: sortWaveEvents([...wave.events, next]) }));
    setSelectedEventId(next.id);
    setInspectorTab(kind === 'boss' ? 'boss' : 'wave');
  };

  const handleDeleteEvent = (eventId: string) => {
    if (!selectedWave || selectedWave.events.length <= 1) return;
    const events = selectedWave.events.filter((event) => event.id !== eventId);
    updateSelectedWave((wave) => ({ ...wave, events }));
    setSelectedEventId(events[0]?.id ?? '');
  };

  const handleSelectEvent = (eventId: string) => {
    const event = selectedWave?.events.find((item) => item.id === eventId);
    setSelectedEventId(eventId);
    if (event?.kind === 'boss' || event?.kind === 'asteroid-belt') setInspectorTab('boss');
    else if (event) setInspectorTab('wave');
  };

  const saveDraft = () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ baseContentHash: contentHash, campaign: campaign.value, savedAt: new Date().toISOString() }));
    notify('Draft saved in this browser on this computer');
  };

  const revert = async () => {
    setBusy(true);
    setValidationErrors([]);
    try {
      const state = await revertGameCampaignEdits<GameCampaignConfig>();
      campaign.replace(normalizeGameCampaignRecordCard(cloneJson(state.campaign)));
      setContentHash(state.contentHash);
      setActiveVersionId(state.activeVersionId);
      window.localStorage.removeItem(DRAFT_KEY);
      handleSelectLevelAfterChange(state.campaign.levels[0]);
      notify('Reverted to the campaign currently used by the game');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not revert the campaign', true);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setValidationErrors([]);
    try {
      const result = await applyGameCampaign<GameCampaignConfig>(campaign.value, contentHash, 'Applied from the visual level editor');
      campaign.replace(normalizeGameCampaignRecordCard(cloneJson(result.campaign)));
      setContentHash(result.contentHash);
      setActiveVersionId(result.activeVersionId);
      window.localStorage.removeItem(DRAFT_KEY);
      notify(`Revision ${result.campaign.revision} is now used by the local game`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Campaign could not be applied';
      const errorList = message.split(/\n|; /).filter(Boolean);
      setValidationErrors(errorList);
      notify(message, true);
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    try {
      const result = await fetchGameCampaignVersions();
      setVersions(result.versions);
      setActiveVersionId(result.activeVersionId);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Version history is unavailable', true);
    }
  };

  const rollback = async (versionId: string) => {
    setBusy(true);
    try {
      const result = await rollbackGameCampaign<GameCampaignConfig>(versionId, contentHash, `Rollback from the visual level editor to ${versionId}`);
      campaign.replace(normalizeGameCampaignRecordCard(cloneJson(result.campaign)));
      setContentHash(result.contentHash);
      setActiveVersionId(result.activeVersionId);
      setHistoryOpen(false);
      window.localStorage.removeItem(DRAFT_KEY);
      handleSelectLevelAfterChange(result.campaign.levels[0]);
      notify(`Rollback created revision ${result.campaign.revision}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Rollback failed', true);
    } finally {
      setBusy(false);
    }
  };

  const previewLabel = useMemo(() => {
    if (!runtimeState) return playing ? 'Live shared game' : 'Preview paused';
    if (!playing) return `${annotationMode ? 'Annotating' : placementMode ? 'Placing objects' : 'Paused'} at ${runtimeState.elapsedSeconds.toFixed(1)} seconds`;
    return `${runtimeState.elapsedSeconds.toFixed(1)} / ${runtimeState.durationSeconds.toFixed(0)} seconds`;
  }, [annotationMode, placementMode, playing, runtimeState]);

  const runtimeEvent = useMemo(() => {
    if (!selectedWave) return undefined;
    const elapsedSeconds = runtimeState?.elapsedSeconds ?? 0;
    return selectedWave.events
      .filter((event) => event.startSeconds <= elapsedSeconds + 1e-6)
      .at(-1) ?? selectedWave.events.find((event) => event.id === selectedEventId);
  }, [runtimeState?.elapsedSeconds, selectedEventId, selectedWave]);

  const appliedReviewConfigVersion = activeVersionId
    ?? `game-campaign-disk-r${campaign.value.revision}-${contentHash.slice(7, 19)}`;
  const reviewConfigVersion = campaign.isDirty
    ? draftContentHash
      ? `game-campaign-draft-r${campaign.value.revision}-${draftContentHash.slice(7, 19)}`
      : null
    : appliedReviewConfigVersion;

  const previewReviews = useMemo(() => reviews.filter((review) => (
    review.surface === 'wave'
    && review.configVersion === reviewConfigVersion
    && review.context?.source === 'level-editor'
    && review.context.levelId === selectedLevel?.id
    && review.context.waveId === selectedWave?.id
  )), [reviewConfigVersion, reviews, selectedLevel?.id, selectedWave?.id]);

  const setAnnotating = (enabled: boolean) => {
    setAnnotationMode(enabled);
    if (enabled) {
      setPlacementMode(false);
      setPlaying(false);
    }
  };

  const setPlacing = (enabled: boolean) => {
    setPlacementMode(enabled);
    if (enabled) {
      setAnnotationMode(false);
      setPlaying(false);
    }
  };

  const selectSurface = (surface: EditorSurface) => {
    setSurfaceMode(surface);
    const url = new URL(window.location.href);
    if (surface === 'card') url.searchParams.set('surface', 'scorecard');
    else if (surface === 'review') url.searchParams.set('surface', 'review');
    else url.searchParams.delete('surface');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    setAnnotationMode(surface === 'review');
    setPlacementMode(false);
    if (surface !== 'game') {
      setPlaying(false);
    }
    if (surface === 'card') {
      setInspectorTab('card');
    } else if (inspectorTab === 'card') {
      setInspectorTab('wave');
    }
  };

  const commitEventAnchor = (eventId: string, spawnAnchor: { x: number; y: number }) => {
    if (!selectedWave) return;
    const event = selectedWave.events.find((candidate) => candidate.id === eventId);
    if (!event) return;
    handleUpdateEvent({ ...event, spawnAnchor });
    setSelectedEventId(eventId);
    setRestartToken((value) => value + 1);
    notify(`${event.label} placement updated`);
  };

  const dropEventAsset = (eventId: string, assetKey: string, spawnAnchor: { x: number; y: number }) => {
    if (!selectedWave) return;
    const event = selectedWave.events.find((candidate) => candidate.id === eventId);
    if (!event) return;
    let next: WaveEvent | null = null;
    if (event.kind === 'spawn' && isAssetAllowedForRole(assetKey, 'enemy') && event.enemies[0]) {
      next = {
        ...event,
        spawnAnchor,
        enemies: event.enemies.map((enemy, index) => index === 0
          ? { ...enemy, spriteKey: assetKey as typeof enemy.spriteKey }
          : enemy)
      };
    } else if (event.kind === 'boss' && isAssetAllowedForRole(assetKey, 'boss')) {
      next = { ...event, spawnAnchor, spriteKey: assetKey as typeof event.spriteKey };
    } else if (event.kind === 'asteroid-belt' && isAssetAllowedForRole(assetKey, 'asteroid')) {
      next = { ...event, spawnAnchor, spriteKey: assetKey };
    }
    if (!next) {
      notify('That sprite is not compatible with the selected gameplay object', true);
      return;
    }
    handleUpdateEvent(next);
    setRestartToken((value) => value + 1);
    notify(`${event.label} artwork and placement updated`);
  };

  const createPreviewReview = async (anchor: ReviewRequest['anchor'], note: string) => {
    if (!selectedLevel || !selectedWave) return;
    try {
      const event = runtimeEvent;
      const isDraft = campaign.isDirty;
      const currentDraftHash = isDraft ? await hashDraftCampaign(campaign.value) : null;
      const configVersion = currentDraftHash
        ? `game-campaign-draft-r${campaign.value.revision}-${currentDraftHash.slice(7, 19)}`
        : appliedReviewConfigVersion;
      const result = await createReview({
        surface: 'wave',
        configVersion,
        target: `${selectedLevel.name} / ${selectedWave.name}${event ? ` / ${event.label}` : ''}`,
        note,
        status: 'open',
        anchor,
        context: {
          source: 'level-editor',
          campaignId: campaign.value.id,
          campaignRevision: campaign.value.revision,
          campaignContentHash: contentHash,
          ...(currentDraftHash ? { draftContentHash: currentDraftHash } : {}),
          levelId: selectedLevel.id,
          levelName: selectedLevel.name,
          waveId: selectedWave.id,
          waveName: selectedWave.name,
          ...(event ? { eventId: event.id, eventLabel: event.label, eventKind: event.kind } : {}),
          elapsedSeconds: runtimeState?.elapsedSeconds ?? 0,
          draft: isDraft
        },
        ...(isDraft ? { draftCampaign: campaign.value } : {})
      });
      setReviews((current) => [...current, result.review]);
      notify(`Review note ${result.review.sequence} pinned to the live preview`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save the review note', true);
      throw error;
    }
  };

  const togglePreviewReviewStatus = async (review: ReviewRequest) => {
    setUpdatingReviewId(review.id);
    const nextStatus = review.status === 'open' ? 'resolved' : 'open';
    try {
      const result = await updateReview(review.id, { status: nextStatus });
      setReviews((current) => current.map((item) => item.id === review.id ? result.review : item));
      notify(nextStatus === 'resolved' ? `Review note ${review.sequence} resolved` : `Review note ${review.sequence} reopened`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update the review note', true);
    } finally {
      setUpdatingReviewId(null);
    }
  };

  if (!selectedLevel || !selectedWave) {
    return <div className="le-preview__error">The campaign requires at least one level and one wave.</div>;
  }

  return (
    <div className="le-shell">
      <header className="le-topbar">
        <div className="le-brand">
          <span className="le-brand__mark"><DirectorMark /></span>
          <strong>Scicon Level Editor</strong>
          <span className="le-local"><i />Local only</span>
        </div>
        <nav className="le-topnav" aria-label="Director tools">
          <a href="/level-editor" aria-current={surfaceMode === 'game' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); selectSurface('game'); }}>Level editor</a>
          <a href="/level-editor?surface=scorecard" aria-current={surfaceMode === 'card' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); selectSurface('card'); }}>Scorecard</a>
          <a href="/level-editor?surface=review" aria-current={surfaceMode === 'review' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); selectSurface('review'); }}>Review notes</a>
        </nav>
        <div className="le-top-actions">
          <button className="le-button le-button--quiet" type="button" disabled={!campaign.canUndo || busy} onClick={campaign.undo}><EditorIcon name="undo" /><span>Undo</span></button>
          <button className="le-button le-button--quiet" type="button" disabled={busy} onClick={() => void revert()}><EditorIcon name="restart" /><span>Revert</span></button>
          <button className="le-button le-button--quiet" type="button" disabled={busy} onClick={saveDraft}><EditorIcon name="save" /><span>Save draft</span></button>
          <button className="le-button le-button--quiet" type="button" disabled={busy} onClick={() => void openHistory()}><EditorIcon name="history" /><span>History</span></button>
          <span className="le-separator" />
          <button className="le-button le-button--primary" type="button" disabled={busy || !campaign.isDirty} onClick={() => void apply()}>{busy ? 'Working…' : 'Apply to game'} <EditorIcon name="play" /></button>
        </div>
      </header>

      <div className="le-workspace">
        <LevelRail
          levels={campaign.value.levels}
          selectedLevelId={selectedLevel.id}
          onSelect={handleSelectLevel}
          onAdd={handleAddLevel}
          onDuplicate={handleDuplicateLevel}
          onRename={handleRenameLevel}
          onDelete={handleDeleteLevel}
          onMove={(direction) => setCampaign(moveLevel(campaign.value, selectedLevel.id, direction))}
        />

        <main className="le-stage-column">
          <header className="le-preview-heading">
            <div>
              <h1>{surfaceMode === 'game'
                ? `Previewing Wave ${selectedWave.order} · ${selectedWave.name}`
                : surfaceMode === 'review' ? `Reviewing Wave ${selectedWave.order} · ${selectedWave.name}` : 'Mission / NFT Record Card'}</h1>
              <p>{surfaceMode === 'game'
                ? previewLabel
                : surfaceMode === 'review' ? 'Frozen actual-game frame · click to pin a change request' : 'One shared production renderer · local sample data'}</p>
            </div>
            <div className="le-surface-toggle" aria-label="Editing surface">
              <button type="button" className={surfaceMode === 'game' ? 'is-active' : ''} onClick={() => selectSurface('game')}>Game</button>
              <button type="button" className={surfaceMode === 'card' ? 'is-active' : ''} onClick={() => selectSurface('card')}>Scorecard</button>
              <button type="button" className={surfaceMode === 'review' ? 'is-active' : ''} onClick={() => selectSurface('review')}>Review</button>
            </div>
          </header>
          {surfaceMode !== 'card' ? (
          <section className="le-preview" aria-label="Live Scicon Shooter game preview">
            <GameEditorCanvas
              campaign={campaign.value}
              levelId={selectedLevel.id}
              waveId={selectedWave.id}
              playing={playing}
              restartToken={restartToken}
              onRuntimeState={(state) => setRuntimeState(state as PreviewRuntimeState)}
              onEditorSnapshot={setEditorSnapshot}
              onPlayingChange={setPlaying}
            />
            <GameplayPlacementOverlay
              enabled={surfaceMode === 'game' && placementMode}
              wave={selectedWave}
              entities={editorSnapshot?.entities ?? []}
              selectedEventId={selectedEventId}
              onSelectEvent={handleSelectEvent}
              onCommitAnchor={commitEventAnchor}
              onDropAsset={dropEventAsset}
            />
            <LivePreviewAnnotations
              enabled={surfaceMode === 'review' || annotationMode}
              reviews={previewReviews}
              contextLabel={`${selectedLevel.name} · ${selectedWave.name}${runtimeEvent ? ` · ${runtimeEvent.label}` : ''}`}
              disabled={busy || (campaign.isDirty && !draftContentHash)}
              onCreate={createPreviewReview}
            />
            <div className="le-preview__badge">{surfaceMode === 'review' ? 'ACTUAL GAME REVIEW SURFACE' : 'ACTUAL GAME SURFACE'} · {selectedWave.name}</div>
          </section>
          ) : (
            <section className="le-preview le-preview--card" aria-label="Shared mission and NFT scorecard preview">
              <RecordCardEditorSurface
                config={campaign.value.recordCard}
                wave={selectedWave}
                onChange={(recordCard) => setCampaign({ ...campaign.value, recordCard })}
              />
              <div className="le-preview__badge">ACTUAL SHARED RECORD SVG</div>
            </section>
          )}
          {surfaceMode !== 'card'
            ? <EventTimeline events={selectedWave.events} selectedEventId={selectedEventId} onSelect={(event) => handleSelectEvent(event.id)} />
            : <div className="le-card-mode-strip">Drag ship or encounter art directly on the card. Edit copy, color, size, and coordinates at right.</div>}
          <div>
            {surfaceMode === 'game' ? (
            <div className="le-preview-controls" aria-label="Game preview controls">
              <button className="le-button" type="button" disabled={selectedWave.order <= 1} onClick={() => selectAdjacentWave(-1)}><EditorIcon name="back" /> Previous</button>
              <button className={`le-button${playing ? ' is-active' : ''}`} type="button" onClick={() => { setAnnotationMode(false); setPlacementMode(false); setPlaying(true); }}><EditorIcon name="play" /> Play</button>
              <button className={`le-button${!playing && !annotationMode && !placementMode ? ' is-active' : ''}`} type="button" onClick={() => { setAnnotationMode(false); setPlacementMode(false); setPlaying(false); }}><EditorIcon name="pause" /> Pause</button>
              <button className="le-button" type="button" onClick={() => setRestartToken((value) => value + 1)}><EditorIcon name="restart" /> Restart</button>
              <button className={`le-button${placementMode ? ' is-active' : ''}`} type="button" aria-pressed={placementMode} onClick={() => setPlacing(!placementMode)}><EditorIcon name="edit" /> {placementMode ? 'Done' : 'Place'}</button>
              <button className={`le-button${annotationMode ? ' is-active' : ''}`} type="button" disabled={busy || (campaign.isDirty && !draftContentHash)} aria-pressed={annotationMode} onClick={() => setAnnotating(!annotationMode)}><EditorIcon name="review" /> {annotationMode ? 'Done' : 'Annotate'}</button>
              <button className="le-button" type="button" disabled={selectedWave.order >= selectedLevel.waves.length} onClick={() => selectAdjacentWave(1)}>Next <EditorIcon name="forward" /></button>
            </div>
            ) : surfaceMode === 'review' ? (
              <div className="le-preview-controls" aria-label="Review preview controls">
                <button className="le-button" type="button" disabled={selectedWave.order <= 1} onClick={() => selectAdjacentWave(-1)}><EditorIcon name="back" /> Previous</button>
                <button className="le-button" type="button" onClick={() => setRestartToken((value) => value + 1)}><EditorIcon name="restart" /> Restart frame</button>
                <button className="le-button is-active" type="button" onClick={() => selectSurface('game')}><EditorIcon name="edit" /> Back to editing</button>
                <button className="le-button" type="button" disabled={selectedWave.order >= selectedLevel.waves.length} onClick={() => selectAdjacentWave(1)}>Next <EditorIcon name="forward" /></button>
              </div>
            ) : (
              <div className="le-preview-controls" aria-label="Scorecard preview controls">
                <button className="le-button" type="button" disabled={selectedWave.order <= 1} onClick={() => selectAdjacentWave(-1)}><EditorIcon name="back" /> Previous wave art</button>
                <button className="le-button is-active" type="button" onClick={() => setInspectorTab('card')}><EditorIcon name="edit" /> Edit card</button>
                <button className="le-button" type="button" disabled={selectedWave.order >= selectedLevel.waves.length} onClick={() => selectAdjacentWave(1)}>Next wave art <EditorIcon name="forward" /></button>
              </div>
            )}
            <WaveStrip
              waves={selectedLevel.waves}
              selectedWaveId={selectedWave.id}
              onSelect={handleSelectWave}
              onAdd={handleAddWave}
              onDuplicate={handleDuplicateWave}
              onDelete={handleDeleteWave}
              onMove={handleMoveWave}
              onReorder={(sourceId, targetId) => updateSelectedLevel((level) => reorderWave(level, sourceId, targetId))}
            />
          </div>
        </main>

        {surfaceMode === 'review' ? (
          <ReviewNotesPanel
            level={selectedLevel}
            wave={selectedWave}
            reviews={previewReviews}
            configVersion={reviewConfigVersion}
            updatingReviewId={updatingReviewId}
            onToggleStatus={(review) => void togglePreviewReviewStatus(review)}
          />
        ) : <EditorInspector
          recordCard={campaign.value.recordCard}
          hudAssets={campaign.value.hudAssets}
          level={selectedLevel}
          wave={selectedWave}
          selectedEventId={selectedEventId}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onSelectEvent={handleSelectEvent}
          onUpdateRecordCard={(recordCard) => setCampaign({ ...campaign.value, recordCard })}
          onUpdateHudAssets={(hudAssets) => setCampaign({ ...campaign.value, hudAssets })}
          onUpdateLevel={handleUpdateLevel}
          onUpdateWave={handleUpdateWave}
          onUpdateEvent={handleUpdateEvent}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
        />}
      </div>

      <HistoryDrawer open={historyOpen} versions={versions} activeVersionId={activeVersionId} busy={busy} onClose={() => setHistoryOpen(false)} onRollback={(versionId) => void rollback(versionId)} />
      {validationErrors.length > 0 ? <div className="le-statusbar is-error" role="alert">Fix before applying: {validationErrors.join(' · ')}</div> : null}
      {notice ? <div className={`le-statusbar${notice.error ? ' is-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.message}</div> : null}
    </div>
  );
}

export default function LevelEditorApp() {
  const [state, setState] = useState<GameCampaignDiskState<GameCampaignConfig> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGameCampaign<GameCampaignConfig>()
      .then((result) => { if (!cancelled) setState(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not open the game campaign'); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="le-shell"><div className="le-preview__error">Scicon Level Editor could not start: {error}</div></div>;
  if (!state) return <div className="le-shell"><div className="le-preview__loading">Loading the real Scicon Shooter campaign…</div></div>;
  return <LevelEditorWorkspace initialState={state} />;
}
