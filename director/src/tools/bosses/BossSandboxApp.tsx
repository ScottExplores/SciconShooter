import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  BOSS_SANDBOX_VIEWPORTS,
  DEFAULT_BOSS_SANDBOX_VIEWPORT_MODE,
  buildBossSandboxGroups,
  buildBossSandboxPreview,
  createSandboxOnlyBossArtwork,
  getBossSandboxEventId,
  getBossSandboxAttacks,
  getBossSandboxPerformingAttackId,
  getSandboxBossArtworkRegistration,
  getBossSandboxPhases,
  isSandboxBossPrototypePreview,
  resolveBossSandboxFitScale,
  type BossSandboxChoice,
  type BossSandboxViewportMode
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
import './boss-sandbox.css';

const PREVIEW_SEED = 'scicon-simple-boss-sandbox';
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

const getBossChoiceArtworkUrl = (
  campaign: GameCampaignConfig,
  choice: BossSandboxChoice
): string | null => {
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
  const groups = useMemo(
    () => buildBossSandboxGroups(initialState.campaign),
    [initialState.campaign]
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
  const firstChoice = choices.find((choice) => choice.prototypeId === 'helios-clawcarrier')
    ?? choices.find((choice) => choice.prototypeId === 'meridian-harrower')
    ?? choices[0];
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
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [previewTimeScale, setPreviewTimeScale] = useState(1);
  const [previewViewportMode, setPreviewViewportMode] =
    useState<BossSandboxViewportMode>(DEFAULT_BOSS_SANDBOX_VIEWPORT_MODE);
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
  const [notice, setNotice] = useState('Ready');
  const commandNonce = useRef(0);
  const previewHostRef = useRef<HTMLDivElement>(null);

  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId)
    ?? firstChoice;
  const selectedChoiceArtworkUrl = selectedChoice
    ? choiceArtworkUrls.get(selectedChoice.id) ?? null
    : null;
  const preview = useMemo(() => {
    if (!selectedChoice) return null;
    return buildBossSandboxPreview(initialState.campaign, selectedChoice);
  }, [initialState.campaign, selectedChoice]);
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
  const previewViewport = BOSS_SANDBOX_VIEWPORTS[previewViewportMode];
  const previewScale = resolveBossSandboxFitScale(
    previewHostSize,
    previewViewport,
    0,
    Number.POSITIVE_INFINITY
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

  const changePreviewViewportMode = useCallback((
    viewportMode: BossSandboxViewportMode
  ) => {
    setPreviewViewportMode(viewportMode);
    setPlaying(true);
    setPreviewCanvasStatus('loading');
    setPreviewMountToken((value) => value + 1);
    setNotice(viewportMode === 'mobile'
      ? 'Mobile gameplay canvas selected'
      : 'Desktop gameplay canvas selected');
  }, []);

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
    setPreviewTimeScale(1);
    setDebugOverlays(DEFAULT_PREVIEW_DEBUG_OVERLAYS);
    setReferenceComparison(DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON);
    setPlaying(true);
    setPreviewCanvasStatus('loading');
    setRestartToken((value) => value + 1);
    setNotice('Loaded a fresh isolated boss fight');
  }, [choices, selectedChoiceId]);

  if (!selectedChoice || !preview) {
    return <div className="boss-sandbox boss-sandbox--state">No configured bosses are available.</div>;
  }

  return (
    <div className="boss-sandbox">
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
        <aside className="boss-sandbox__picker">
          <div>
            <p>Boss to test</p>
            <select
              aria-label="Boss to test"
              value={selectedChoice.id}
              onChange={(event) => selectBoss(event.target.value)}
            >
              {groups.map((group) => (
                <optgroup label={group.label} key={group.id}>
                  {group.choices.map((choice) => (
                    <option value={choice.id} key={choice.id}>
                      {choice.bossLabel}
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
                    title={`${choice.bossLabel} · ${choice.missionLabel}`}
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
                    </span>
                    <span>{choice.bossLabel}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <section aria-live="polite">
            <div className="boss-sandbox__selected-art">
              <span aria-hidden="true">{getBossInitials(selectedChoice.bossLabel)}</span>
              {selectedChoiceArtworkUrl ? (
                <img
                  key={selectedChoice.id}
                  src={selectedChoiceArtworkUrl}
                  alt={`${selectedChoice.bossLabel} boss artwork`}
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
            </div>
            <span data-source={selectedChoice.source}>
              {selectedChoice.source === 'test' ? 'TEST ONLY' : 'CAMPAIGN COPY'}
            </span>
            <h1>{selectedChoice.bossLabel}</h1>
            <p>{selectedChoice.missionLabel}</p>
            <small>{selectedChoice.waveLabel}</small>
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
              Spawn boss
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
            <div>
              {attacks.map((attack, index) => (
                <button
                  type="button"
                  key={attack.id}
                  aria-label={`Attack ${index + 1}: ${attack.sourceLabel}`}
                  aria-pressed={performingAttackId === attack.id}
                  className={performingAttackId === attack.id ? 'is-performing' : ''}
                  title={attack.sourceLabel}
                  onClick={() => triggerAttack(
                    attack.id,
                    attack.phaseId,
                    index + 1
                  )}
                >
                  Attack {index + 1}
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

          <BossFactoryDebugPanel
            playing={playing}
            timeScale={previewTimeScale}
            viewportMode={previewViewportMode}
            overlays={debugOverlays}
            safeRegionGuide={previewSnapshot?.boss?.safeRegionGuide ?? null}
            referenceComparisonAvailable={Boolean(
              previewBossArtwork?.modularReferenceComparison
            )}
            referenceComparison={referenceComparison}
            onTimeScaleChange={changePreviewTimeScale}
            onViewportModeChange={changePreviewViewportMode}
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

        <section className="boss-sandbox__play" aria-label="Live mobile boss preview">
          <div className="boss-sandbox__stage" ref={previewHostRef}>
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
                  data-viewport-mode={previewViewportMode}
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

        <aside className="boss-sandbox__loadout" aria-label="Ship and loadout controls">
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
          <BossHealthTuningPanel
            boss={previewSnapshot?.boss ?? null}
            onBossHealthRatioChange={changeBossHealth}
            onBossMaxHealthChange={changeBossMaxHealth}
            onComponentMaxHealthChange={changeBossComponentMaxHealth}
            onBossInvincibilityChange={changeBossHullInvincibility}
            onComponentInvincibilityChange={changeBossComponentInvincibility}
          />
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
