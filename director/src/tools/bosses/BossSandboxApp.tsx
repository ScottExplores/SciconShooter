import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {
  GameEditorCanvas
} from '@game/components/GameEditorCanvas';
import { ASSET_CATALOG } from '@game/game-config/catalog';
import type { GameCampaignConfig } from '@game/game-config/types';
import {
  PLAYER_SHIPS,
  PLAYABLE_PLAYER_SHIP_IDS,
  type PlayerShipId
} from '@game/services/playerShipService';
import {
  MINI_SHIP_CATALOG,
  MINI_SHIP_MAX_LEVEL,
  type MiniShipId,
  type SquadSlotId
} from '@game/services/squadProgression';
import { getWeeklyBoundaryMeta } from '@game/shared/weeklyCompetitionBoundary.browser';
import {
  DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON,
  DEFAULT_PREVIEW_DEBUG_OVERLAYS,
  type PreviewBossReferenceComparisonState,
  type PreviewCommand,
  type PreviewCommandResult,
  type PreviewDebugOverlayState,
  type PreviewSnapshot
} from '@game/services/gameplay/previewSession';
import {
  fetchGameCampaign,
  type GameCampaignDiskState
} from '@director/api/directorClient';
import {
  BOSS_SANDBOX_VERSION,
  BOSS_SANDBOX_CATEGORIES,
  BOSS_SANDBOX_HOST_MODES,
  BOSS_SANDBOX_RAIL_MAX_WIDTH,
  BOSS_SANDBOX_RAIL_MIN_WIDTH,
  BOSS_SANDBOX_VIEWPORTS,
  DEFAULT_BOSS_SANDBOX_CATEGORY_ID,
  buildBossSandboxGroups,
  buildBossSandboxPreview,
  buildBossSandboxWeeklyLineup,
  clampBossSandboxRailWidth,
  createSandboxOnlyBossArtwork,
  fitBossSandboxRailWidths,
  filterBossSandboxGroups,
  getBossSandboxEventId,
  getBossSandboxAttacks,
  getBossSandboxChoiceOptionLabel,
  getDefaultBossSandboxChoice,
  getBossSandboxPerformingAttackId,
  getBossSandboxSelectorLabel,
  getSandboxBossArtworkRegistration,
  getBossSandboxPhases,
  isSandboxBossPrototypePreview,
  normalizeBossSandboxRailWidths,
  resolveBossSandboxFitScale,
  type BossSandboxCategory,
  type BossSandboxHostMode,
  type BossSandboxRailWidths,
  type BossSandboxChoice
} from './bossSandboxModel';
import {
  BOSS_SANDBOX_FIRE_RATE_MAX,
  BOSS_SANDBOX_SPEED_MAX,
  type BossSandboxCompanionSelection,
  useBossSandboxLoadout
} from './useBossSandboxLoadout';
import { getBossSandboxIntegrityAssets } from './bossSandboxArtworkAssets';
import { BossFactoryDebugPanel } from './BossFactoryDebugPanel';
import { BossHealthTuningPanel } from './BossHealthTuningPanel';
import { PrismMothAttackTuningPanel } from './PrismMothAttackTuningPanel';
import {
  DEFAULT_PRISM_MOTH_ATTACK_TUNING,
  applyPrismMothAttackTuningToTimeline,
  type PrismMothAttackTuning
} from './prismMothAttackTuning';
import { FrontierCrownclawAttackTuningPanel } from './FrontierCrownclawAttackTuningPanel';
import {
  DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING,
  applyFrontierCrownclawAttackTuningToTimeline,
  type FrontierCrownclawAttackTuning
} from './frontierCrownclawAttackTuning';
import './boss-sandbox.css';

const PREVIEW_SEED = 'scicon-simple-boss-sandbox';
const BOSS_SANDBOX_RAIL_STORAGE_KEY = 'scicon:boss-sandbox:rail-widths:v1';
type BossSandboxRailSide = 'left' | 'right';
interface BossSandboxRailResizeSession {
  readonly side: BossSandboxRailSide;
  readonly startX: number;
  readonly startWidth: number;
}
type PreviewArtworkStatus = 'not-needed' | 'checking' | 'ready' | 'unavailable';
type PreviewCanvasStatus = 'loading' | 'ready' | 'error';
type PreviewCommandInput = PreviewCommand extends infer Command
  ? Command extends { nonce: number }
    ? Omit<Command, 'nonce'>
    : never
  : never;

interface BossSandboxWorkspaceProps {
  initialState: GameCampaignDiskState<GameCampaignConfig>;
}

const readBossSandboxRailWidths = (): BossSandboxRailWidths => {
  if (typeof window === 'undefined') return normalizeBossSandboxRailWidths(null);
  try {
    const stored = window.localStorage.getItem(BOSS_SANDBOX_RAIL_STORAGE_KEY);
    return normalizeBossSandboxRailWidths(stored ? JSON.parse(stored) : null);
  } catch {
    return normalizeBossSandboxRailWidths(null);
  }
};

const getBossChoiceArtworkUrl = (
  campaign: GameCampaignConfig,
  choice: BossSandboxChoice
): string | null => {
  if (choice.artworkUrl) return choice.artworkUrl;
  if (choice.artworkAssetId) {
    return ASSET_CATALOG[choice.artworkAssetId]?.paths[0] ?? null;
  }
  const registration = getSandboxBossArtworkRegistration(choice.prototypeId);
  if (registration) return registration.assembled.url;

  const bossEvent = choice.source === 'campaign'
    ? campaign.levels
      .find((level) => level.id === choice.levelId)
      ?.waves.find((wave) => wave.id === choice.waveId)
      ?.events.find((event) => event.id === choice.eventId)
    : buildBossSandboxPreview(campaign, choice).previewWave.events
      .find((event) => event.kind === 'boss');

  if (!bossEvent || bossEvent.kind !== 'boss') return null;
  return ASSET_CATALOG[bossEvent.spriteKey]?.paths[0] ?? null;
};

const getBossInitials = (label: string): string => (
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
);

function SandboxCompanionControl({
  slot,
  selection,
  unavailableId,
  onChange
}: {
  slot: SquadSlotId;
  selection: BossSandboxCompanionSelection;
  unavailableId: MiniShipId | '';
  onChange: (selection: BossSandboxCompanionSelection) => void;
}) {
  return (
    <label className="boss-sandbox__support-select">
      <span>{slot === 'left' ? 'Left support' : 'Right support'}</span>
      <select
        aria-label={slot === 'left' ? 'Left support ship' : 'Right support ship'}
        value={selection.id}
        onChange={(event) => onChange({
          id: event.target.value as MiniShipId | '',
          level: selection.level
        })}
      >
        <option value="">None</option>
        {MINI_SHIP_CATALOG.map((miniShip) => (
          <option
            key={miniShip.id}
            value={miniShip.id}
            disabled={miniShip.id === unavailableId}
          >
            {miniShip.name}
          </option>
        ))}
      </select>
      <select
        aria-label={slot === 'left' ? 'Left support level' : 'Right support level'}
        value={selection.level}
        disabled={!selection.id}
        onChange={(event) => onChange({
          ...selection,
          level: Number(event.target.value)
        })}
      >
        {Array.from({ length: MINI_SHIP_MAX_LEVEL }, (_, index) => index + 1)
          .map((level) => (
            <option key={level} value={level}>Lv {level}</option>
          ))}
      </select>
    </label>
  );
}

function BossSandboxWorkspace({ initialState }: BossSandboxWorkspaceProps) {
  const allGroups = useMemo(
    () => buildBossSandboxGroups(initialState.campaign),
    [initialState.campaign]
  );
  const weeklyWeekKey = useMemo(
    () => getWeeklyBoundaryMeta(new Date()).weekKey,
    []
  );
  const weeklyLineup = useMemo(
    () => buildBossSandboxWeeklyLineup(initialState.campaign, weeklyWeekKey),
    [initialState.campaign, weeklyWeekKey]
  );
  const [categoryId, setCategoryId] = useState<BossSandboxCategory['id']>(
    DEFAULT_BOSS_SANDBOX_CATEGORY_ID
  );
  const groups = useMemo(
    () => filterBossSandboxGroups(allGroups, categoryId),
    [allGroups, categoryId]
  );
  const choices = useMemo(
    () => groups.flatMap((group) => group.choices),
    [groups]
  );
  const choiceArtworkUrls = useMemo(
    () => new Map(choices.map((choice) => [
      choice.id,
      getBossChoiceArtworkUrl(initialState.campaign, choice)
    ])),
    [choices, initialState.campaign]
  );
  const firstChoice = getDefaultBossSandboxChoice(choices);
  const [selectedChoiceId, setSelectedChoiceId] = useState(firstChoice?.id ?? '');
  const [playing, setPlaying] = useState(true);
  const [invincible, setInvincible] = useState(true);
  const {
    companions,
    fireRateLevel,
    mainShipId,
    previewSettings,
    setCompanion,
    setFireRateLevel,
    setMainShipId,
    setSpeedLevel,
    speedLevel
  } = useBossSandboxLoadout({ invincible, seed: PREVIEW_SEED });
  const [restartToken, setRestartToken] = useState(0);
  const [previewCommand, setPreviewCommand] = useState<PreviewCommand | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [selectedAttackId, setSelectedAttackId] = useState<string | null>(null);
  const [attackLoopEnabled, setAttackLoopEnabled] = useState(false);
  const [signatureLoopEnabled, setSignatureLoopEnabled] = useState(false);
  const [miniBossShieldEnabled, setMiniBossShieldEnabled] = useState(true);
  const [compactHealthBarsEnabled, setCompactHealthBarsEnabled] = useState(true);
  const [wallSide, setWallSide] = useState<'left' | 'right'>('left');
  const [hostMode, setHostMode] = useState<BossSandboxHostMode>('mobile-shell');
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [previewTimeScale, setPreviewTimeScale] = useState(1);
  const [debugOverlays, setDebugOverlays] = useState<PreviewDebugOverlayState>(
    DEFAULT_PREVIEW_DEBUG_OVERLAYS
  );
  const [referenceComparison, setReferenceComparison] =
    useState<PreviewBossReferenceComparisonState>(
      DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON
    );
  const [previewArtworkStatus, setPreviewArtworkStatus] =
    useState<PreviewArtworkStatus>('checking');
  const [previewHostSize, setPreviewHostSize] = useState({ width: 0, height: 0 });
  const [previewMountToken, setPreviewMountToken] = useState(0);
  const [previewCanvasStatus, setPreviewCanvasStatus] =
    useState<PreviewCanvasStatus>('loading');
  const [prismMothAttackTuning, setPrismMothAttackTuning] =
    useState<Readonly<PrismMothAttackTuning>>(DEFAULT_PRISM_MOTH_ATTACK_TUNING);
  const [frontierCrownclawAttackTuning, setFrontierCrownclawAttackTuning] =
    useState<Readonly<FrontierCrownclawAttackTuning>>(
      DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING
    );
  const [notice, setNotice] = useState('Ready');
  const [railWidths, setRailWidths] = useState<BossSandboxRailWidths>(
    readBossSandboxRailWidths
  );
  const [workspaceWidth, setWorkspaceWidth] = useState(() => (
    typeof window === 'undefined' ? 0 : window.innerWidth
  ));
  const commandNonce = useRef(0);
  const sandboxRef = useRef<HTMLDivElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const railResizeSession = useRef<BossSandboxRailResizeSession | null>(null);

  const sandboxStyle = useMemo(() => ({
    '--bs-left-rail-width': `${railWidths.left}px`,
    '--bs-right-rail-width': `${railWidths.right}px`
  } as CSSProperties), [railWidths.left, railWidths.right]);
  const leftRailMaximum = clampBossSandboxRailWidth({
    requestedWidth: BOSS_SANDBOX_RAIL_MAX_WIDTH,
    otherRailWidth: railWidths.right,
    workspaceWidth
  });
  const rightRailMaximum = clampBossSandboxRailWidth({
    requestedWidth: BOSS_SANDBOX_RAIL_MAX_WIDTH,
    otherRailWidth: railWidths.left,
    workspaceWidth
  });

  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId)
    ?? firstChoice;
  const selectedChoiceArtworkUrl = selectedChoice
    ? choiceArtworkUrls.get(selectedChoice.id) ?? null
    : null;
  const preview = useMemo(() => {
    if (!selectedChoice) return null;
    const basePreview = buildBossSandboxPreview(initialState.campaign, selectedChoice);
    const isPrismMoth = selectedChoice.prototypeId === 'prism-moth-brood';
    const isFrontierCrownclaw = selectedChoice.prototypeId === 'frontier-crownclaw';
    if (!isPrismMoth && !isFrontierCrownclaw) return basePreview;

    const sourceBoss = basePreview.previewWave.events.find((event) => (
      event.kind === 'boss' && event.id === basePreview.eventId
    ));
    if (!sourceBoss || sourceBoss.kind !== 'boss' || !sourceBoss.timeline) {
      return basePreview;
    }

    const tunedTimeline = isPrismMoth
      ? applyPrismMothAttackTuningToTimeline(
          sourceBoss.timeline,
          prismMothAttackTuning
        )
      : applyFrontierCrownclawAttackTuningToTimeline(
          sourceBoss.timeline,
          frontierCrownclawAttackTuning
        );
    const tuneEvents = (events: typeof basePreview.previewWave.events) => (
      events.map((event) => (
        event.kind === 'boss' && event.id === basePreview.eventId
          ? { ...event, timeline: tunedTimeline }
          : event
      ))
    );
    const previewWave = {
      ...basePreview.previewWave,
      events: tuneEvents(basePreview.previewWave.events)
    };
    const campaign = {
      ...basePreview.campaign,
      levels: basePreview.campaign.levels.map((level) => (
        level.id !== basePreview.levelId
          ? level
          : {
            ...level,
            waves: level.waves.map((wave) => (
              wave.id === basePreview.waveId
                ? { ...wave, events: tuneEvents(wave.events) }
                : wave
            ))
          }
      ))
    };
    return {
      ...basePreview,
      campaign,
      previewWave
    };
  }, [
    frontierCrownclawAttackTuning,
    initialState.campaign,
    prismMothAttackTuning,
    selectedChoice
  ]);
  const artworkRegistration = getSandboxBossArtworkRegistration(selectedChoice?.prototypeId);

  useEffect(() => {
    if (!artworkRegistration) {
      setPreviewArtworkStatus('not-needed');
      return;
    }

    const controller = new AbortController();
    setPreviewArtworkStatus('checking');
    const verifyLocalPng = async (url: string, expectedHash: string) => {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok || response.headers.get('content-type') !== 'image/png') {
        throw new Error('Local Sandbox artwork is unavailable');
      }
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== expectedHash) {
        throw new Error('Local Sandbox artwork failed its browser integrity check');
      }
    };
    void Promise.all(
      getBossSandboxIntegrityAssets(artworkRegistration).map((asset) => (
        verifyLocalPng(asset.url, asset.contentHash)
      ))
    )
      .then(() => {
        setPreviewArtworkStatus('ready');
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setPreviewArtworkStatus('unavailable');
      });

    return () => controller.abort();
  }, [artworkRegistration]);

  const previewBossArtwork = useMemo(() => (
    preview
    && isSandboxBossPrototypePreview(preview)
    && artworkRegistration
    && previewArtworkStatus === 'ready'
      ? createSandboxOnlyBossArtwork(preview)
      : undefined
  ), [artworkRegistration, preview, previewArtworkStatus]);
  const previewViewport = BOSS_SANDBOX_VIEWPORTS.mobile;
  const previewScale = resolveBossSandboxFitScale(
    previewHostSize,
    previewViewport,
    0,
    hostMode === 'mobile-shell' ? 1 : Number.POSITIVE_INFINITY
  );
  const previewCanMount = !artworkRegistration || previewArtworkStatus !== 'checking';
  const phases = useMemo(
    () => preview ? getBossSandboxPhases(preview) : [],
    [preview]
  );
  const attacks = useMemo(
    () => preview ? getBossSandboxAttacks(preview, selectedPhaseId) : [],
    [preview, selectedPhaseId]
  );
  const selectedAttack = useMemo(
    () => attacks.find((attack) => attack.id === selectedAttackId) ?? null,
    [attacks, selectedAttackId]
  );
  const performingAttackId = getBossSandboxPerformingAttackId(
    previewSnapshot?.boss?.activeAttack
  );
  const eventId = preview ? getBossSandboxEventId(preview) : null;
  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) return undefined;
    const measure = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 64 || height < 64) return;
      setPreviewHostSize({ width, height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const workspace = sandboxRef.current;
    if (!workspace) return undefined;
    const measure = () => {
      const width = workspace.clientWidth;
      if (width <= 0) return;
      setWorkspaceWidth(width);
      if (width > 861) {
        setRailWidths((current) => fitBossSandboxRailWidths(current, width));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (workspaceWidth <= 0) return;
    try {
      window.localStorage.setItem(
        BOSS_SANDBOX_RAIL_STORAGE_KEY,
        JSON.stringify(railWidths)
      );
    } catch {
      // Local preferences are optional; the validated in-memory widths remain usable.
    }
  }, [railWidths, workspaceWidth]);

  const resizeRail = useCallback((
    side: BossSandboxRailSide,
    requestedWidth: number
  ) => {
    const measuredWorkspaceWidth = sandboxRef.current?.clientWidth ?? workspaceWidth;
    setRailWidths((current) => {
      const nextWidth = clampBossSandboxRailWidth({
        requestedWidth,
        otherRailWidth: side === 'left' ? current.right : current.left,
        workspaceWidth: measuredWorkspaceWidth
      });
      if (current[side] === nextWidth) return current;
      return side === 'left'
        ? { ...current, left: nextWidth }
        : { ...current, right: nextWidth };
    });
  }, [workspaceWidth]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = railResizeSession.current;
      if (!session) return;
      const delta = event.clientX - session.startX;
      resizeRail(
        session.side,
        session.startWidth + (session.side === 'left' ? delta : -delta)
      );
    };
    const finishPointerResize = () => {
      if (!railResizeSession.current) return;
      railResizeSession.current = null;
      setNotice('Panel widths saved for this browser');
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishPointerResize);
    window.addEventListener('pointercancel', finishPointerResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPointerResize);
      window.removeEventListener('pointercancel', finishPointerResize);
    };
  }, [resizeRail]);

  const beginRailResize = useCallback((
    side: BossSandboxRailSide,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (window.matchMedia('(max-width: 861px)').matches) return;
    railResizeSession.current = {
      side,
      startX: event.clientX,
      startWidth: railWidths[side]
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [railWidths]);

  const handleRailResizeKeyDown = useCallback((
    side: BossSandboxRailSide,
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    const step = event.shiftKey ? 24 : 12;
    let nextWidth: number | null = null;
    if (event.key === 'Home') nextWidth = BOSS_SANDBOX_RAIL_MIN_WIDTH;
    if (event.key === 'End') nextWidth = BOSS_SANDBOX_RAIL_MAX_WIDTH;
    if (event.key === 'ArrowLeft') {
      nextWidth = railWidths[side] + (side === 'right' ? step : -step);
    }
    if (event.key === 'ArrowRight') {
      nextWidth = railWidths[side] + (side === 'left' ? step : -step);
    }
    if (nextWidth === null) return;
    event.preventDefault();
    resizeRail(side, nextWidth);
    setNotice('Panel width saved for this browser');
  }, [railWidths, resizeRail]);

  const sendCommand = useCallback((command: PreviewCommandInput) => {
    commandNonce.current += 1;
    setPreviewCommand({
      ...command,
      nonce: commandNonce.current
    } as PreviewCommand);
  }, []);

  const restart = useCallback(() => {
    setPlaying(true);
    setSelectedPhaseId(null);
    setSelectedAttackId(null);
    setAttackLoopEnabled(false);
    setSignatureLoopEnabled(false);
    setPreviewSnapshot(null);
    setRestartToken((value) => value + 1);
    setNotice('Boss restarted');
  }, []);

  const retryPreview = useCallback(() => {
    setPlaying(true);
    setPreviewCommand(null);
    setPreviewTimeScale(1);
    setDebugOverlays(DEFAULT_PREVIEW_DEBUG_OVERLAYS);
    setReferenceComparison(DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON);
    setPreviewCanvasStatus('loading');
    setPreviewMountToken((value) => value + 1);
    setNotice('Reloading the game view');
  }, []);

  const handlePreviewReady = useCallback(() => {
    setPreviewCanvasStatus('ready');
  }, []);

  const handlePreviewInitializationError = useCallback(() => {
    setPreviewCanvasStatus('error');
    setNotice('The game view could not start');
  }, []);

  const announceLiveLoadoutChange = useCallback((message: string) => {
    setNotice(`${message} without restarting the fight`);
  }, []);

  const selectMainShip = useCallback((shipId: PlayerShipId) => {
    setMainShipId(shipId);
    announceLiveLoadoutChange(`${PLAYER_SHIPS[shipId].name} equipped`);
  }, [announceLiveLoadoutChange, setMainShipId]);

  const updateCompanion = useCallback((
    slot: SquadSlotId,
    selection: BossSandboxCompanionSelection
  ) => {
    setCompanion(slot, selection);
    announceLiveLoadoutChange('Support ship loadout applied');
  }, [announceLiveLoadoutChange, setCompanion]);

  const spawnBoss = useCallback(() => {
    if (!eventId) return;
    setAttackLoopEnabled(false);
    sendCommand({ type: 'spawn-event-now', eventId });
    setPlaying(true);
    setNotice('Boss spawned');
  }, [eventId, sendCommand]);

  const toggleInvincibility = useCallback(() => {
    const enabled = !invincible;
    setInvincible(enabled);
    sendCommand({ type: 'set-invincibility', enabled });
    setNotice(enabled ? 'Watch mode: player cannot take damage' : 'Fight mode: damage is enabled');
  }, [invincible, sendCommand]);

  const changePreviewTimeScale = useCallback((timeScale: number) => {
    setPreviewTimeScale(timeScale);
    sendCommand({ type: 'set-time-scale', timeScale });
    setNotice(`Simulation speed set to ${timeScale}×`);
  }, [sendCommand]);

  const changeDebugOverlay = useCallback((
    key: keyof PreviewDebugOverlayState,
    enabled: boolean
  ) => {
    const overlays = { ...debugOverlays, [key]: enabled };
    setDebugOverlays(overlays);
    sendCommand({ type: 'set-debug-overlays', overlays });
  }, [debugOverlays, sendCommand]);

  const changeReferenceComparison = useCallback((
    comparison: PreviewBossReferenceComparisonState
  ) => {
    setReferenceComparison(comparison);
    sendCommand({ type: 'set-boss-reference-comparison', comparison });
  }, [sendCommand]);

  const changeBossHealth = useCallback((healthRatio: number) => {
    if (!eventId) return;
    sendCommand({ type: 'set-boss-health', eventId, healthRatio });
    setNotice(`Boss health set to ${Math.round(healthRatio * 100)}%`);
  }, [eventId, sendCommand]);

  const clearBossHazards = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'clear-boss-hazards', eventId });
    setAttackLoopEnabled(false);
    setNotice('Boss hazards cleared without restarting the fight');
  }, [eventId, sendCommand]);

  const toggleMiniBossSignatureLoop = useCallback(() => {
    if (!eventId) return;
    const enabled = !signatureLoopEnabled;
    setSignatureLoopEnabled(enabled);
    sendCommand({ type: 'set-mini-boss-signature-loop', eventId, enabled });
    setPlaying(true);
    setNotice(enabled ? 'Signature maneuver loop enabled' : 'Signature maneuver loop disabled');
  }, [eventId, sendCommand, signatureLoopEnabled]);

  const triggerMiniBossSupport = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'trigger-mini-boss-support', eventId });
    setPlaying(true);
    setNotice('Supporting behavior triggered');
  }, [eventId, sendCommand]);

  const triggerMiniBossLowHealth = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'set-mini-boss-low-health', eventId });
    setNotice('Low-health presentation triggered');
  }, [eventId, sendCommand]);

  const triggerMiniBossHit = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'trigger-mini-boss-hit', eventId });
    setNotice('Hit reaction triggered');
  }, [eventId, sendCommand]);

  const triggerMiniBossDeath = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'trigger-mini-boss-death', eventId });
    setNotice('Death cleanup sequence triggered');
  }, [eventId, sendCommand]);

  const destroyMiniBossUnit = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'destroy-mini-boss-unit', eventId });
    setNotice('One linked unit destroyed');
  }, [eventId, sendCommand]);

  const destroyMiniBossGuardians = useCallback(() => {
    if (!eventId) return;
    sendCommand({ type: 'destroy-mini-boss-guardians', eventId });
    setNotice('Guardians destroyed for vulnerability test');
  }, [eventId, sendCommand]);

  const toggleMiniBossShield = useCallback(() => {
    if (!eventId) return;
    const enabled = !miniBossShieldEnabled;
    setMiniBossShieldEnabled(enabled);
    sendCommand({ type: 'set-mini-boss-shield', eventId, enabled });
    setNotice(`Mini-boss shield ${enabled ? 'enabled' : 'disabled'}`);
  }, [eventId, miniBossShieldEnabled, sendCommand]);

  const changeMiniBossWallSide = useCallback((side: 'left' | 'right') => {
    if (!eventId) return;
    setWallSide(side);
    sendCommand({ type: 'set-mini-boss-wall-side', eventId, side });
    setNotice(`Wall encounter moved to the ${side} edge`);
  }, [eventId, sendCommand]);

  const toggleCompactHealthBars = useCallback(() => {
    const enabled = !compactHealthBarsEnabled;
    setCompactHealthBarsEnabled(enabled);
    sendCommand({ type: 'set-compact-health-bars', enabled });
    setNotice(`Compact health bars ${enabled ? 'shown' : 'hidden'}`);
  }, [compactHealthBarsEnabled, sendCommand]);

  const changeBossMaxHealth = useCallback((maxHealth: number) => {
    if (!eventId) return;
    sendCommand({ type: 'set-boss-max-health', eventId, maxHealth });
    setNotice(`Boss test health set to ${maxHealth.toLocaleString()} HP without restarting`);
  }, [eventId, sendCommand]);

  const changeBossComponentMaxHealth = useCallback((
    componentId: string,
    maxHealth: number
  ) => {
    if (!eventId) return;
    sendCommand({
      type: 'set-boss-component-max-health',
      eventId,
      componentId,
      maxHealth
    });
    setNotice(`Part test health set to ${maxHealth.toLocaleString()} HP without restarting`);
  }, [eventId, sendCommand]);

  const changeBossHullInvincibility = useCallback((enabled: boolean) => {
    if (!eventId) return;
    sendCommand({ type: 'set-boss-hull-invincibility', eventId, enabled });
    setNotice(`Boss hull invincibility ${enabled ? 'on' : 'off'} for this fight`);
  }, [eventId, sendCommand]);

  const changeBossComponentInvincibility = useCallback((
    componentId: string,
    enabled: boolean
  ) => {
    if (!eventId) return;
    sendCommand({
      type: 'set-boss-component-invincibility',
      eventId,
      componentId,
      enabled
    });
    setNotice(`Boss part invincibility ${enabled ? 'on' : 'off'} for this fight`);
  }, [eventId, sendCommand]);

  const jumpToPhase = useCallback((phaseId: string) => {
    if (!eventId) return;
    setSelectedPhaseId(phaseId);
    setSelectedAttackId(null);
    setAttackLoopEnabled(false);
    setPreviewSnapshot(null);
    sendCommand({ type: 'jump-to-boss-phase', phaseId, eventId });
    setPlaying(true);
    setNotice('Jumped to selected phase');
  }, [eventId, sendCommand]);

  const triggerAttack = useCallback((
    attackId: string,
    phaseId: string,
    attackNumber: number
  ) => {
    if (!eventId) return;
    setSelectedAttackId(attackId);
    setSelectedPhaseId(phaseId);
    setAttackLoopEnabled(false);
    sendCommand({
      type: 'trigger-boss-attack',
      attackId,
      phaseId,
      eventId,
      loop: false
    });
    setPlaying(true);
    setNotice(`Starting Attack ${attackNumber}`);
  }, [eventId, sendCommand]);

  const replaySelectedAttack = useCallback(() => {
    if (!eventId || !selectedAttack) return;
    sendCommand({
      type: 'trigger-boss-attack',
      attackId: selectedAttack.id,
      phaseId: selectedAttack.phaseId,
      eventId,
      loop: attackLoopEnabled
    });
    setPlaying(true);
    setNotice('Restarted selected attack from its first warning');
  }, [attackLoopEnabled, eventId, selectedAttack, sendCommand]);

  const toggleSelectedAttackLoop = useCallback(() => {
    if (
      !eventId
      || !selectedAttack
      || selectedAttack.source === 'configured-weapon'
    ) return;
    const enabled = !attackLoopEnabled;
    setAttackLoopEnabled(enabled);
    sendCommand({
      type: 'trigger-boss-attack',
      attackId: selectedAttack.id,
      phaseId: selectedAttack.phaseId,
      eventId,
      loop: enabled
    });
    setPlaying(true);
    setNotice(enabled
      ? 'Looping selected attack from its first warning'
      : 'Attack loop stopped and restarted once');
  }, [attackLoopEnabled, eventId, selectedAttack, sendCommand]);

  const handleCommandResult = useCallback((result: PreviewCommandResult) => {
    if (!previewCommand || result.nonce !== previewCommand.nonce) return;
    if (!result.handled && previewCommand.type === 'trigger-boss-attack' && previewCommand.loop) {
      setAttackLoopEnabled(false);
    }
    if (!result.handled) setNotice('That action is not ready yet—restart and try again');
    if (result.capture) {
      const link = document.createElement('a');
      link.href = result.capture.dataUrl;
      link.download = `${selectedChoice?.bossLabel ?? 'boss'}-frame-${result.snapshot?.frame ?? 0}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setNotice('Pixi frame downloaded as PNG');
    }
    setPreviewCommand(null);
  }, [previewCommand, selectedChoice?.bossLabel]);

  const selectBoss = useCallback((choiceId: string) => {
    if (choiceId === selectedChoiceId) return;
    const nextChoice = choices.find((choice) => choice.id === choiceId);
    setSelectedChoiceId(choiceId);
    setPreviewArtworkStatus(
      getSandboxBossArtworkRegistration(nextChoice?.prototypeId) ? 'checking' : 'not-needed'
    );
    setSelectedPhaseId(null);
    setSelectedAttackId(null);
    setAttackLoopEnabled(false);
    setSignatureLoopEnabled(false);
    setMiniBossShieldEnabled(true);
    setCompactHealthBarsEnabled(true);
    setWallSide('left');
    setPreviewTimeScale(1);
    setDebugOverlays(DEFAULT_PREVIEW_DEBUG_OVERLAYS);
    setReferenceComparison(DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON);
    setPlaying(true);
    setPreviewCanvasStatus('loading');
    setRestartToken((value) => value + 1);
    setNotice('Loaded a fresh isolated boss fight');
  }, [choices, selectedChoiceId]);

  const selectCategory = useCallback((nextCategoryId: BossSandboxCategory['id']) => {
    setCategoryId(nextCategoryId);
    const nextChoices = filterBossSandboxGroups(allGroups, nextCategoryId)
      .flatMap((group) => group.choices);
    if (!nextChoices.some((choice) => choice.id === selectedChoiceId) && nextChoices[0]) {
      selectBoss(nextChoices[0].id);
    }
  }, [allGroups, selectBoss, selectedChoiceId]);

  if (!selectedChoice || !preview) {
    return <div className="boss-sandbox boss-sandbox--state">No configured bosses are available.</div>;
  }

  return (
    <div
      className="boss-sandbox"
      ref={sandboxRef}
      style={sandboxStyle}
    >
      <header className="boss-sandbox__header">
        <div>
          <span aria-hidden="true">BS</span>
          <div>
            <strong>Boss Sandbox</strong>
            <small>Choose a boss, fight it, then tell Codex what to change.</small>
          </div>
        </div>
        <nav aria-label="Boss Sandbox links">
          <span className="boss-sandbox__version">{BOSS_SANDBOX_VERSION}</span>
          <a href="/">Hub</a>
          <a href="/sandbox">Advanced tools</a>
        </nav>
      </header>

      <main className="boss-sandbox__main">
        <aside className="boss-sandbox__picker" id="boss-sandbox-picker">
          <div>
            <nav className="boss-sandbox__categories" aria-label="Encounter categories">
              {BOSS_SANDBOX_CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  aria-pressed={categoryId === category.id}
                  onClick={() => selectCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </nav>
            <p>{getBossSandboxSelectorLabel(categoryId)}</p>
            <select
              aria-label={getBossSandboxSelectorLabel(categoryId)}
              value={selectedChoice.id}
              onChange={(event) => selectBoss(event.target.value)}
            >
              {groups.map((group) => (
                <optgroup label={group.label} key={group.id}>
                  {group.choices.map((choice) => (
                    <option value={choice.id} key={choice.id}>
                      {getBossSandboxChoiceOptionLabel(choice)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <nav
              className="boss-sandbox__artwork-strip"
              aria-label="Boss artwork choices"
            >
              {choices.map((choice) => {
                const artworkUrl = choiceArtworkUrls.get(choice.id);
                return (
                  <button
                    type="button"
                    key={choice.id}
                    aria-label={`Test ${choice.bossLabel}`}
                    aria-pressed={choice.id === selectedChoice.id}
                    title={`${choice.encounterClass === 'full-boss' ? 'BOSS' : 'ELITE ENEMY'} · ${choice.bossLabel} · ${choice.missionLabel}`}
                    onClick={() => selectBoss(choice.id)}
                  >
                    <span className="boss-sandbox__choice-art">
                      <span aria-hidden="true">{getBossInitials(choice.bossLabel)}</span>
                      {artworkUrl ? (
                        <img
                          src={artworkUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <span
                        className="boss-sandbox__choice-class"
                        data-encounter-class={choice.encounterClass}
                      >
                        {choice.encounterClass === 'full-boss' ? 'BOSS' : 'ELITE'}
                      </span>
                    </span>
                    <span>{choice.bossLabel}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <details className="boss-sandbox__weekly-lineup" open>
            <summary>
              <span>Weekly lineup</span>
              <small>{weeklyWeekKey}</small>
            </summary>
            <ol aria-label={`Weekly Run encounter order for ${weeklyWeekKey}`}>
              {weeklyLineup.map((encounter) => (
                <li
                  key={`${encounter.stageNumber}:${encounter.bossId}`}
                  data-kind={encounter.kind}
                  title={`${encounter.missionLabel} · ${encounter.waveCount} waves`}
                >
                  <span>{encounter.stageNumber}</span>
                  <strong>{encounter.kind === 'boss' ? 'BOSS' : 'ELITE'}</strong>
                  <span>{encounter.label}</span>
                </li>
              ))}
            </ol>
          </details>

          <section aria-live="polite">
            <div className="boss-sandbox__selected-art">
              <span aria-hidden="true">{getBossInitials(selectedChoice.bossLabel)}</span>
              {selectedChoiceArtworkUrl ? (
                <img
                  key={selectedChoice.id}
                  src={selectedChoiceArtworkUrl}
                  alt={`${selectedChoice.bossLabel} ${selectedChoice.encounterClass === 'full-boss' ? 'boss' : 'elite enemy'} artwork`}
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
            </div>
            <span
              data-source={selectedChoice.source}
              data-encounter-class={selectedChoice.encounterClass}
            >
              {selectedChoice.encounterClass === 'mini-boss'
                ? 'ELITE ENEMY'
                : selectedChoice.source === 'campaign'
                ? 'CAMPAIGN BOSS'
                : 'TEST BOSS'}
            </span>
            <h1>{selectedChoice.bossLabel}</h1>
            <p>{selectedChoice.missionLabel}</p>
            <small>{selectedChoice.waveLabel}</small>
            {selectedChoice.miniBoss ? (
              <div className="boss-sandbox__encounter-details">
                <div className="boss-sandbox__category-chips" aria-label="Encounter categories">
                  {selectedChoice.miniBoss.categories.map((encounterCategoryId) => (
                    <span key={encounterCategoryId}>
                      {BOSS_SANDBOX_CATEGORIES.find((category) => (
                        category.id === encounterCategoryId
                      ))?.label}
                    </span>
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>Encounter ID</dt>
                    <dd>{selectedChoice.miniBoss.encounterId}</dd>
                  </div>
                  <div>
                    <dt>Expected fight</dt>
                    <dd>{selectedChoice.miniBoss.expectedDurationSeconds}s</dd>
                  </div>
                  <div>
                    <dt>Signature</dt>
                    <dd>{selectedChoice.miniBoss.signatureManeuver}</dd>
                  </div>
                  <div>
                    <dt>Support</dt>
                    <dd>{selectedChoice.miniBoss.supportingBehavior}</dd>
                  </div>
                  <div>
                    <dt>Linked units</dt>
                    <dd>{selectedChoice.miniBoss.linkedUnitCount}</dd>
                  </div>
                  <div>
                    <dt>Assets</dt>
                    <dd>Approved and bound by stable ID</dd>
                  </div>
                </dl>
                <p className="boss-sandbox__test-only-note">
                  Campaign-assigned | Sandbox preview ready
                </p>
              </div>
            ) : null}
            {artworkRegistration ? (
              <p
                className={`boss-sandbox__art-status is-${previewArtworkStatus}`}
                role="status"
              >
                {previewArtworkStatus === 'ready'
                  ? 'Animated modular boss rig connected'
                  : previewArtworkStatus === 'unavailable'
                    ? 'Local concept art unavailable — showing safe fallback art'
                    : 'Checking local modular boss art…'}
              </p>
            ) : null}
          </section>

          <div className="boss-sandbox__controls" aria-label="Boss test controls">
            <button type="button" className="is-primary" onClick={restart}>
              Restart
            </button>
            <button type="button" onClick={spawnBoss}>
              {selectedChoice.miniBoss ? 'Spawn encounter' : 'Spawn boss'}
            </button>
            <button
              type="button"
              aria-pressed={invincible}
              className={invincible ? 'is-active' : ''}
              onClick={toggleInvincibility}
            >
              {invincible ? 'Watch safely' : 'Fight normally'}
            </button>
            <button type="button" onClick={() => setPlaying((value) => !value)}>
              {playing ? 'Pause' : 'Resume'}
            </button>
          </div>

          {selectedChoice.miniBoss ? (
            <section className="boss-sandbox__mini-lab" aria-label="Mini-Boss Lab controls">
              <span>Mini-Boss Lab</span>
              <div className="boss-sandbox__mini-lab-grid">
                <button
                  type="button"
                  aria-pressed={signatureLoopEnabled}
                  className={signatureLoopEnabled ? 'is-active' : ''}
                  onClick={toggleMiniBossSignatureLoop}
                >
                  {signatureLoopEnabled ? 'Signature loop on' : 'Loop signature'}
                </button>
                <button type="button" onClick={triggerMiniBossSupport}>
                  Support behavior
                </button>
                <button type="button" onClick={triggerMiniBossHit}>Trigger hit</button>
                <button type="button" onClick={triggerMiniBossLowHealth}>Low health</button>
                <button type="button" onClick={triggerMiniBossDeath}>Trigger death</button>
                <button
                  type="button"
                  aria-pressed={compactHealthBarsEnabled}
                  className={compactHealthBarsEnabled ? 'is-active' : ''}
                  onClick={toggleCompactHealthBars}
                >
                  Compact bars
                </button>
                {[1, 0.5, 0.15].map((healthRatio) => (
                  <button
                    type="button"
                    key={healthRatio}
                    onClick={() => changeBossHealth(healthRatio)}
                  >
                    Health {Math.round(healthRatio * 100)}%
                  </button>
                ))}
                {selectedChoice.categories.includes('paired-encounters') ? (
                  <button type="button" onClick={destroyMiniBossUnit}>
                    Destroy one unit
                  </button>
                ) : null}
                {selectedChoice.categories.includes('guardian-formations') ? (
                  <>
                    <button type="button" onClick={destroyMiniBossGuardians}>
                      Destroy guardians
                    </button>
                    <button
                      type="button"
                      aria-pressed={miniBossShieldEnabled}
                      className={miniBossShieldEnabled ? 'is-active' : ''}
                      onClick={toggleMiniBossShield}
                    >
                      {miniBossShieldEnabled ? 'Shield on' : 'Shield off'}
                    </button>
                  </>
                ) : null}
              </div>
              {selectedChoice.categories.includes('wall-encounters') ? (
                <div className="boss-sandbox__mini-lab-segment" role="group" aria-label="Wall side">
                  <span>Wall</span>
                  {(['left', 'right'] as const).map((side) => (
                    <button
                      type="button"
                      key={side}
                      aria-pressed={wallSide === side}
                      className={wallSide === side ? 'is-active' : ''}
                      onClick={() => changeMiniBossWallSide(side)}
                    >
                      {side === 'left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="boss-sandbox__mini-lab-segment" role="group" aria-label="Preview host">
                <span>Host</span>
                {BOSS_SANDBOX_HOST_MODES.map((mode) => (
                  <button
                    type="button"
                    key={mode.id}
                    aria-pressed={hostMode === mode.id}
                    className={hostMode === mode.id ? 'is-active' : ''}
                    onClick={() => setHostMode(mode.id)}
                    title="The gameplay arena remains the canonical 390 by 844 mobile field"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!selectedChoice.miniBoss ? (
            <>
          <nav className="boss-sandbox__attacks" aria-label="Boss attacks">
            <span>Start attack</span>
            {previewSnapshot?.boss?.activeAttack ? (
              <small className="boss-sandbox__attack-status" aria-live="polite">
                {previewSnapshot.boss.activeAttack.label}
                {' · '}
                {previewSnapshot.boss.activeAttack.stage}
                {' · beat '}
                {previewSnapshot.boss.activeAttack.beatIndex}
                /{previewSnapshot.boss.activeAttack.beatCount}
              </small>
            ) : null}
            {previewSnapshot?.boss?.bossId === 'singularity-crab' ? (
              <small className="boss-sandbox__mechanics-status" aria-live="polite">
                Phase {previewSnapshot.boss.phaseIndex + 1}
                {' | wells '}{previewSnapshot.boss.activeWells}
                {' | hazards '}{previewSnapshot.boss.hazardCount}
                {' | cooldown '}{previewSnapshot.boss.cooldownFrames}f
              </small>
            ) : null}
            <div>
              {attacks.map((attack) => (
                <button
                  type="button"
                  key={attack.id}
                  aria-label={`Attack ${attack.attackNumber}: ${attack.sourceLabel}`}
                  aria-pressed={performingAttackId === attack.id}
                  className={performingAttackId === attack.id ? 'is-performing' : ''}
                  title={attack.sourceLabel}
                  onClick={() => triggerAttack(
                    attack.id,
                    attack.phaseId,
                    attack.attackNumber
                  )}
                >
                  Attack {attack.attackNumber}
                </button>
              ))}
            </div>
            <div
              className="boss-sandbox__attack-playback"
              role="group"
              aria-label="Selected attack playback"
            >
              <button
                type="button"
                disabled={!selectedAttack}
                onClick={replaySelectedAttack}
              >
                Replay selected
              </button>
              <button
                type="button"
                aria-pressed={attackLoopEnabled}
                className={attackLoopEnabled ? 'is-active' : ''}
                disabled={!selectedAttack || selectedAttack.source === 'configured-weapon'}
                title={selectedAttack?.source === 'configured-weapon'
                  ? 'Configured weapon attacks already use their production cadence'
                  : 'Restart this attack after its recovery window'}
                onClick={toggleSelectedAttackLoop}
              >
                {attackLoopEnabled ? 'Loop on' : 'Loop off'}
              </button>
              <button type="button" onClick={clearBossHazards}>
                Clear hazards
              </button>
            </div>
          </nav>

          {phases.length > 1 ? (
            <nav className="boss-sandbox__phases" aria-label="Boss phases">
              <span>Jump to phase</span>
              {phases.map((phase, index) => (
                <button
                  type="button"
                  key={phase.id}
                  aria-pressed={selectedPhaseId === phase.id}
                  onClick={() => jumpToPhase(phase.id)}
                >
                  {index + 1}. {phase.label}
                </button>
              ))}
            </nav>
          ) : null}
            </>
          ) : null}

          <BossFactoryDebugPanel
            playing={playing}
            timeScale={previewTimeScale}
            overlays={debugOverlays}
            safeRegionGuide={previewSnapshot?.boss?.safeRegionGuide ?? null}
            referenceComparisonAvailable={Boolean(
              previewBossArtwork?.modularReferenceComparison
            )}
            referenceComparison={referenceComparison}
            onTimeScaleChange={changePreviewTimeScale}
            onStepFrame={() => {
              sendCommand({ type: 'step-frame' });
              setNotice('Advanced one fixed simulation frame');
            }}
            onResetSeed={() => {
              sendCommand({ type: 'set-seed', seed: PREVIEW_SEED });
              setNotice('Restarted with the fixed test seed');
            }}
            onBossHealthChange={changeBossHealth}
            onOverlayChange={changeDebugOverlay}
            onReferenceComparisonChange={changeReferenceComparison}
            onCapture={() => {
              sendCommand({ type: 'capture-frame' });
              setNotice('Preparing Pixi frame capture…');
            }}
          />

          <div className="boss-sandbox__codex-note">
            <strong>Want a change?</strong>
            <p>
              Describe it in this Codex task. I will update the isolated boss,
              and you can reload this screen to test the next version.
            </p>
          </div>

          <footer>
            <i aria-hidden="true" />
            No campaign writes
          </footer>
        </aside>

        <div
          className="boss-sandbox__rail-resizer boss-sandbox__rail-resizer--left"
          role="separator"
          aria-label="Resize boss controls"
          aria-controls="boss-sandbox-picker"
          aria-orientation="vertical"
          aria-valuemin={BOSS_SANDBOX_RAIL_MIN_WIDTH}
          aria-valuemax={leftRailMaximum}
          aria-valuenow={railWidths.left}
          aria-valuetext={`${railWidths.left} pixels wide`}
          tabIndex={0}
          onPointerDown={(event) => beginRailResize('left', event)}
          onKeyDown={(event) => handleRailResizeKeyDown('left', event)}
        />

        <section className="boss-sandbox__play" aria-label="Live mobile boss preview">
          <div
            className="boss-sandbox__stage"
            data-host-mode={hostMode}
            ref={previewHostRef}
          >
            {previewCanMount ? (
              <div
                className="boss-sandbox__viewport-scale-box"
                style={{
                  width: `${Math.ceil(previewViewport.width * previewScale)}px`,
                  height: `${Math.ceil(previewViewport.height * previewScale)}px`
                }}
              >
                <div
                  className="boss-sandbox__viewport-frame"
                  data-viewport-mode="mobile"
                  style={{
                    width: `${previewViewport.width}px`,
                    height: `${previewViewport.height}px`,
                    transform: `scale(${previewScale})`
                  }}
                >
                  <GameEditorCanvas
                    key={`${selectedChoice.id}:${previewMountToken}`}
                    campaign={preview.campaign}
                    levelId={preview.levelId}
                    waveId={preview.waveId}
                    playing={playing}
                    restartToken={restartToken}
                    onPlayingChange={setPlaying}
                    previewCommand={previewCommand}
                    onPreviewCommandResult={handleCommandResult}
                    onPreviewSnapshot={setPreviewSnapshot}
                    previewSettings={previewSettings}
                    previewViewport={previewViewport}
                    previewBossArtwork={previewBossArtwork}
                    fieldUpgradesEnabled={false}
                    onReady={handlePreviewReady}
                    onInitializationError={handlePreviewInitializationError}
                  />
                </div>
              </div>
            ) : null}

            {!previewCanMount || previewCanvasStatus !== 'ready' ? (
              <div className="boss-sandbox__preview-state" role="status">
                {previewCanvasStatus === 'error' ? (
                  <>
                    <strong>Preview could not start</strong>
                    <span>The game renderer stopped before its first frame.</span>
                    <button type="button" onClick={retryPreview}>Try preview again</button>
                  </>
                ) : (
                  <>
                    <strong>
                      {!previewCanMount ? 'Preparing local boss art…' : 'Loading game preview…'}
                    </strong>
                    <span>The full fight will appear here when it is ready.</span>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <div
          className="boss-sandbox__rail-resizer boss-sandbox__rail-resizer--right"
          role="separator"
          aria-label="Resize ship and loadout controls"
          aria-controls="boss-sandbox-loadout"
          aria-orientation="vertical"
          aria-valuemin={BOSS_SANDBOX_RAIL_MIN_WIDTH}
          aria-valuemax={rightRailMaximum}
          aria-valuenow={railWidths.right}
          aria-valuetext={`${railWidths.right} pixels wide`}
          tabIndex={0}
          onPointerDown={(event) => beginRailResize('right', event)}
          onKeyDown={(event) => handleRailResizeKeyDown('right', event)}
        />

        <aside
          className="boss-sandbox__loadout"
          id="boss-sandbox-loadout"
          aria-label="Ship and loadout controls"
        >
          <section className="boss-sandbox__ship-tuning" aria-label="Ship loadout">
              <span>Ship loadout</span>
              <div className="boss-sandbox__main-ships" aria-label="Main ship">
                {PLAYABLE_PLAYER_SHIP_IDS.map((shipId) => {
                  const ship = PLAYER_SHIPS[shipId];
                  return (
                    <button
                      type="button"
                      key={shipId}
                      aria-label={`Use ${ship.name}`}
                      aria-pressed={mainShipId === shipId}
                      className={mainShipId === shipId ? 'is-active' : ''}
                      onClick={() => selectMainShip(shipId)}
                    >
                      <img src={ship.assetUrl} alt="" />
                      <span>{ship.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="boss-sandbox__stepper">
                <strong>Fire rate</strong>
                <button
                  type="button"
                  aria-label="Decrease fire rate"
                  disabled={fireRateLevel <= 0}
                  onClick={() => {
                    setFireRateLevel(fireRateLevel - 1);
                    announceLiveLoadoutChange('Fire rate updated');
                  }}
                >
                  −
                </button>
                <output aria-label="Fire rate level">{fireRateLevel}</output>
                <button
                  type="button"
                  aria-label="Increase fire rate"
                  disabled={fireRateLevel >= BOSS_SANDBOX_FIRE_RATE_MAX}
                  onClick={() => {
                    setFireRateLevel(fireRateLevel + 1);
                    announceLiveLoadoutChange('Fire rate updated');
                  }}
                >
                  +
                </button>
              </div>
              <div className="boss-sandbox__stepper">
                <strong>Speed</strong>
                <button
                  type="button"
                  aria-label="Decrease speed"
                  disabled={speedLevel <= 0}
                  onClick={() => {
                    setSpeedLevel(speedLevel - 1);
                    announceLiveLoadoutChange('Ship speed updated');
                  }}
                >
                  −
                </button>
                <output aria-label="Speed level">{speedLevel}</output>
                <button
                  type="button"
                  aria-label="Increase speed"
                  disabled={speedLevel >= BOSS_SANDBOX_SPEED_MAX}
                  onClick={() => {
                    setSpeedLevel(speedLevel + 1);
                    announceLiveLoadoutChange('Ship speed updated');
                  }}
                >
                  +
                </button>
              </div>
              <SandboxCompanionControl
                slot="left"
                selection={companions.left}
                unavailableId={companions.right.id}
                onChange={(selection) => updateCompanion('left', selection)}
              />
              <SandboxCompanionControl
                slot="right"
                selection={companions.right}
                unavailableId={companions.left.id}
                onChange={(selection) => updateCompanion('right', selection)}
              />
          </section>
          {!selectedChoice.miniBoss ? (
            <BossHealthTuningPanel
              boss={previewSnapshot?.boss ?? null}
              onBossHealthRatioChange={changeBossHealth}
              onBossMaxHealthChange={changeBossMaxHealth}
              onComponentMaxHealthChange={changeBossComponentMaxHealth}
              onBossInvincibilityChange={changeBossHullInvincibility}
              onComponentInvincibilityChange={changeBossComponentInvincibility}
            />
          ) : null}
          {selectedChoice.prototypeId === 'prism-moth-brood' ? (
            <details className="boss-sandbox__prism-tuning">
              <summary>Prism attack tuning</summary>
              <p>Changes rebuild this isolated test fight. Mobile-safe limits stay enforced.</p>
              <button
                type="button"
                onClick={() => {
                  setPrismMothAttackTuning(DEFAULT_PRISM_MOTH_ATTACK_TUNING);
                  setNotice('Prism attack tuning reset to its validated defaults');
                }}
              >
                Reset Prism tuning
              </button>
              <PrismMothAttackTuningPanel
                value={prismMothAttackTuning}
                onChange={(value) => {
                  setPrismMothAttackTuning(value);
                  setNotice('Prism attack tuning applied to the isolated preview');
                }}
              />
            </details>
          ) : null}
          {selectedChoice.prototypeId === 'frontier-crownclaw' ? (
            <details className="boss-sandbox__frontier-tuning">
              <summary>Frontier attack tuning</summary>
              <p>
                Changes rebuild only this isolated fight. Reset values retain the
                route-proven timing; schema-v1 geometry budgets stay explicitly bounded.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFrontierCrownclawAttackTuning(
                    DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING
                  );
                  setNotice('Frontier attack tuning reset to its route-proven defaults');
                }}
              >
                Reset Frontier tuning
              </button>
              <FrontierCrownclawAttackTuningPanel
                value={frontierCrownclawAttackTuning}
                onChange={(value) => {
                  setFrontierCrownclawAttackTuning(value);
                  setNotice('Frontier attack tuning applied to the isolated preview');
                }}
              />
            </details>
          ) : null}
          <p className="boss-sandbox__notice" role="status">{notice}</p>
        </aside>
      </main>
    </div>
  );
}

export default function BossSandboxApp() {
  const [state, setState] = useState<GameCampaignDiskState<GameCampaignConfig> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGameCampaign<GameCampaignConfig>()
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Could not open the boss campaign');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="boss-sandbox boss-sandbox--state">
        <strong>Boss Sandbox could not start</strong>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (!state) {
    return <div className="boss-sandbox boss-sandbox--state">Loading boss fights…</div>;
  }
  return <BossSandboxWorkspace initialState={state} />;
}
