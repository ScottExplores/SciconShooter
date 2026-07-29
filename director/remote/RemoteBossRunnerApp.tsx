import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  GameEditorCanvas
} from '../../components/GameEditorCanvas';
import campaignJson from '../../game-config/campaign.json';
import { ASSET_CATALOG } from '../../game-config/catalog';
import type { GameCampaignConfig } from '../../game-config/types';
import { audioService } from '../../services/audioService';
import {
  DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON,
  DEFAULT_PREVIEW_DEBUG_OVERLAYS,
  type PreviewBossReferenceComparisonState,
  type PreviewCommand,
  type PreviewCommandResult,
  type PreviewDebugOverlayState,
  type PreviewSnapshot
} from '../../services/gameplay/previewSession';
import {
  PLAYER_SHIPS,
  PLAYABLE_PLAYER_SHIP_IDS
} from '../../services/playerShipService';
import {
  MINI_SHIP_CATALOG,
  MINI_SHIP_MAX_LEVEL,
  type MiniShipId,
  type SquadSlotId
} from '../../services/squadProgression';
import '../src/combat-lab/sandboxBossPrototypes';
import {
  BOSS_SANDBOX_VERSION,
  BOSS_SANDBOX_VIEWPORTS,
  buildBossSandboxGroups,
  buildBossSandboxPreview,
  createSandboxOnlyBossArtwork,
  getBossSandboxAttacks,
  getBossSandboxEventId,
  getBossSandboxPerformingAttackId,
  getBossSandboxPhases,
  getSandboxBossArtworkRegistration,
  isSandboxBossPrototypePreview,
  type BossSandboxChoice
} from '../src/tools/bosses/bossSandboxModel';
import {
  BOSS_SANDBOX_FIRE_RATE_MAX,
  BOSS_SANDBOX_SPEED_MAX,
  type BossSandboxCompanionSelection,
  useBossSandboxLoadout
} from '../src/tools/bosses/useBossSandboxLoadout';
import { getBossSandboxIntegrityAssets } from '../src/tools/bosses/bossSandboxArtworkAssets';
import { BossFactoryDebugPanel } from '../src/tools/bosses/BossFactoryDebugPanel';
import { BossHealthTuningPanel } from '../src/tools/bosses/BossHealthTuningPanel';

const STATIC_CAMPAIGN = campaignJson as unknown as GameCampaignConfig;
const PREVIEW_SEED = 'scicon-hosted-boss-runner';
type DrawerTab = 'boss' | 'ship' | 'test';
type ArtworkStatus = 'not-needed' | 'checking' | 'ready' | 'unavailable';
type CanvasStatus = 'loading' | 'ready' | 'error';
type PreviewCommandInput = PreviewCommand extends infer Command
  ? Command extends { nonce: number }
    ? Omit<Command, 'nonce'>
    : never
  : never;

const verifyPng = async (
  url: string,
  expectedHash: string,
  signal: AbortSignal
) => {
  const response = await fetch(url, { cache: 'force-cache', signal });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.startsWith('image/png')) {
    throw new Error(`Artwork is unavailable: ${url}`);
  }
  const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (actualHash !== expectedHash) {
    throw new Error(`Artwork integrity check failed: ${url}`);
  }
};

const resolveBossChoiceThumbnailUrl = (
  choice: BossSandboxChoice
): string | undefined => {
  const registration = getSandboxBossArtworkRegistration(choice.prototypeId);
  if (registration) return registration.assembled.url;

  if (choice.source === 'campaign') {
    const level = STATIC_CAMPAIGN.levels.find(
      (candidate) => candidate.id === choice.levelId
    );
    const wave = level?.waves.find((candidate) => candidate.id === choice.waveId);
    const event = wave?.events.find(
      (candidate) => candidate.kind === 'boss' && candidate.id === choice.eventId
    );
    return event?.kind === 'boss'
      ? ASSET_CATALOG[event.spriteKey]?.paths[0]
      : undefined;
  }

  try {
    const preview = buildBossSandboxPreview(STATIC_CAMPAIGN, choice);
    const event = preview.previewWave.events.find(
      (candidate) => candidate.kind === 'boss'
    );
    return event?.kind === 'boss'
      ? ASSET_CATALOG[event.spriteKey]?.paths[0]
      : undefined;
  } catch {
    return undefined;
  }
};

function BossArtwork({
  choice,
  url,
  selected = false
}: {
  choice: BossSandboxChoice;
  url: string | undefined;
  selected?: boolean;
}) {
  return (
    <span
      className={selected
        ? 'remote-runner__boss-portrait'
        : 'remote-runner__boss-option-art'}
      data-has-image={Boolean(url)}
    >
      <span aria-hidden="true">{choice.bossLabel.slice(0, 1)}</span>
      {url ? (
        <img
          src={url}
          alt={selected ? `Artwork preview of ${choice.bossLabel}` : ''}
          loading={selected ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={(event) => {
            event.currentTarget.hidden = true;
            event.currentTarget.parentElement?.setAttribute('data-image-error', 'true');
          }}
        />
      ) : null}
    </span>
  );
}

function Stepper({
  label,
  value,
  min = 0,
  max,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="remote-runner__stepper">
      <span>
        <strong>{label}</strong>
        <small>Level {value} / {max}</small>
      </span>
      <div>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <output aria-label={`${label} level`}>{value}</output>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function CompanionControl({
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
  const selected = selection.id
    ? MINI_SHIP_CATALOG.find((candidate) => candidate.id === selection.id)
    : undefined;
  return (
    <section className="remote-runner__companion">
      <header>
        <strong>{slot === 'left' ? 'Left mini-ship' : 'Right mini-ship'}</strong>
        <span>{selected?.role ?? 'Empty slot'}</span>
      </header>
      <label>
        <span>Companion</span>
        <select
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
              {miniShip.name} · {miniShip.role}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Level</span>
        <select
          value={selection.level}
          disabled={!selection.id}
          onChange={(event) => onChange({
            ...selection,
            level: Math.max(
              1,
              Math.min(MINI_SHIP_MAX_LEVEL, Number(event.target.value))
            )
          })}
        >
          {Array.from({ length: MINI_SHIP_MAX_LEVEL }, (_, index) => index + 1)
            .map((level) => (
              <option key={level} value={level}>Level {level}</option>
            ))}
        </select>
      </label>
    </section>
  );
}

export default function RemoteBossRunnerApp() {
  const groups = useMemo(
    () => buildBossSandboxGroups(STATIC_CAMPAIGN),
    []
  );
  const choices = useMemo(
    () => groups.flatMap((group) => group.choices),
    [groups]
  );
  const choiceThumbnailUrls = useMemo(
    () => new Map(
      choices.map((choice) => [choice.id, resolveBossChoiceThumbnailUrl(choice)])
    ),
    [choices]
  );
  const bossPickerSections = groups;
  const firstChoice = choices.find(
    (choice) => choice.prototypeId === 'aurora-storm-engine'
  ) ?? choices[0];
  const [selectedChoiceId, setSelectedChoiceId] = useState(firstChoice?.id ?? '');
  const [playing, setPlaying] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('boss');
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
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [previewTimeScale, setPreviewTimeScale] = useState(1);
  const [debugOverlays, setDebugOverlays] = useState<PreviewDebugOverlayState>(
    DEFAULT_PREVIEW_DEBUG_OVERLAYS
  );
  const [referenceComparison, setReferenceComparison] =
    useState<PreviewBossReferenceComparisonState>(
      DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON
    );
  const [artworkStatus, setArtworkStatus] = useState<ArtworkStatus>('checking');
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>('loading');
  const [notice, setNotice] = useState('Drag anywhere in the arena to fly.');
  const commandNonce = useRef(0);

  useEffect(() => {
    let listening = true;
    function stopListening() {
      window.removeEventListener('pointerdown', initializeAudio, true);
      window.removeEventListener('touchstart', initializeAudio, true);
      window.removeEventListener('keydown', initializeAudio, true);
    }
    function initializeAudio() {
      if (!listening) return;
      listening = false;
      audioService.init();
      stopListening();
    }

    window.addEventListener('pointerdown', initializeAudio, true);
    window.addEventListener('touchstart', initializeAudio, true);
    window.addEventListener('keydown', initializeAudio, true);
    return () => {
      listening = false;
      stopListening();
    };
  }, []);

  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId)
    ?? firstChoice;
  const selectedThumbnailUrl = selectedChoice
    ? choiceThumbnailUrls.get(selectedChoice.id)
    : undefined;
  const preview = useMemo(
    () => selectedChoice
      ? buildBossSandboxPreview(STATIC_CAMPAIGN, selectedChoice)
      : null,
    [selectedChoice]
  );
  const artworkRegistration = getSandboxBossArtworkRegistration(
    selectedChoice?.prototypeId
  );
  const phases = useMemo(
    () => preview ? getBossSandboxPhases(preview) : [],
    [preview]
  );
  const attacks = useMemo(
    () => preview ? getBossSandboxAttacks(preview) : [],
    [preview]
  );
  const performingAttackId = getBossSandboxPerformingAttackId(
    previewSnapshot?.boss?.activeAttack
  );
  const eventId = preview ? getBossSandboxEventId(preview) : null;
  const campaignBossCount = useMemo(
    () => choices.filter((choice) => choice.source === 'campaign').length,
    [choices]
  );
  const testBossCount = useMemo(
    () => choices.filter((choice) => choice.source === 'test').length,
    [choices]
  );

  useEffect(() => {
    if (!artworkRegistration) {
      setArtworkStatus('not-needed');
      return;
    }
    const controller = new AbortController();
    setArtworkStatus('checking');
    void Promise.all(
      getBossSandboxIntegrityAssets(artworkRegistration).map((asset) => (
        verifyPng(asset.url, asset.contentHash, controller.signal)
      ))
    )
      .then(() => setArtworkStatus('ready'))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setArtworkStatus('unavailable');
      });
    return () => controller.abort();
  }, [artworkRegistration]);

  const previewBossArtwork = useMemo(() => (
    preview
    && isSandboxBossPrototypePreview(preview)
    && artworkRegistration
    && artworkStatus === 'ready'
      ? createSandboxOnlyBossArtwork(preview)
      : undefined
  ), [artworkRegistration, artworkStatus, preview]);
  const previewCanMount = !artworkRegistration || artworkStatus !== 'checking';

  const sendCommand = useCallback((command: PreviewCommandInput) => {
    commandNonce.current += 1;
    setPreviewCommand({
      ...command,
      nonce: commandNonce.current
    } as PreviewCommand);
  }, []);

  const resume = useCallback(() => {
    setPlaying(true);
    setDrawerOpen(false);
    setNotice('Fight resumed.');
  }, []);

  const handlePlayingChange = useCallback((nextPlaying: boolean) => {
    setPlaying(nextPlaying);
    setDrawerOpen(!nextPlaying);
    if (!nextPlaying) setNotice('Paused. Choose a boss, ship, or test action.');
  }, []);

  const restart = useCallback(() => {
    setRestartToken((value) => value + 1);
    setSelectedPhaseId(null);
    setNotice('Restarting the selected boss.');
    resume();
  }, [resume]);

  const selectBoss = useCallback((choiceId: string) => {
    if (choiceId === selectedChoiceId) return;
    const choice = choices.find((candidate) => candidate.id === choiceId);
    setSelectedChoiceId(choiceId);
    setSelectedPhaseId(null);
    setPreviewSnapshot(null);
    setPreviewTimeScale(1);
    setDebugOverlays(DEFAULT_PREVIEW_DEBUG_OVERLAYS);
    setReferenceComparison(DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON);
    setCanvasStatus('loading');
    setArtworkStatus(
      getSandboxBossArtworkRegistration(choice?.prototypeId)
        ? 'checking'
        : 'not-needed'
    );
    setNotice('Boss loaded. Resume when ready.');
  }, [choices, selectedChoiceId]);

  const updateCompanion = useCallback((
    slot: SquadSlotId,
    selection: BossSandboxCompanionSelection
  ) => {
    setCompanion(slot, selection);
    setNotice('Mini-ship loadout applied without restarting the fight.');
  }, [setCompanion]);

  const toggleInvincibility = useCallback(() => {
    const enabled = !invincible;
    setInvincible(enabled);
    sendCommand({ type: 'set-invincibility', enabled });
    setNotice(enabled ? 'Invincibility enabled.' : 'Damage enabled.');
  }, [invincible, sendCommand]);

  const changePreviewTimeScale = useCallback((timeScale: number) => {
    setPreviewTimeScale(timeScale);
    sendCommand({ type: 'set-time-scale', timeScale });
    setNotice(`Simulation speed set to ${timeScale}×.`);
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
    setNotice(`Boss health set to ${Math.round(healthRatio * 100)}%.`);
  }, [eventId, sendCommand]);

  const changeBossMaxHealth = useCallback((maxHealth: number) => {
    if (!eventId) return;
    sendCommand({ type: 'set-boss-max-health', eventId, maxHealth });
    setNotice(`Boss test health set to ${maxHealth.toLocaleString()} HP without restarting.`);
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
    setNotice(`Part test health set to ${maxHealth.toLocaleString()} HP without restarting.`);
  }, [eventId, sendCommand]);

  const changeBossHullInvincibility = useCallback((enabled: boolean) => {
    if (!eventId) return;
    sendCommand({ type: 'set-boss-hull-invincibility', eventId, enabled });
    setNotice(`Boss hull invincibility ${enabled ? 'on' : 'off'} for this fight.`);
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
    setNotice(`Boss part invincibility ${enabled ? 'on' : 'off'} for this fight.`);
  }, [eventId, sendCommand]);

  const jumpToPhase = useCallback((phaseId: string) => {
    if (!eventId) return;
    setSelectedPhaseId(phaseId);
    sendCommand({ type: 'jump-to-boss-phase', phaseId, eventId });
    setNotice('Jumping to the selected phase.');
    resume();
  }, [eventId, resume, sendCommand]);

  const triggerAttack = useCallback((
    attackId: string,
    phaseId: string,
    attackNumber: number
  ) => {
    if (!eventId) return;
    setSelectedPhaseId(phaseId);
    sendCommand({
      type: 'trigger-boss-attack',
      attackId,
      phaseId,
      eventId,
      loop: false
    });
    setNotice(`Starting Attack ${attackNumber}.`);
  }, [eventId, sendCommand]);

  const handleCommandResult = useCallback((result: PreviewCommandResult) => {
    if (!previewCommand || previewCommand.nonce !== result.nonce) return;
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
      setNotice('Pixi frame downloaded as PNG.');
    } else if (!result.handled) {
      setNotice('That action was not ready. Restart the fight and try again.');
    } else if (previewCommand.type === 'trigger-boss-attack') {
      setPlaying(true);
      setDrawerOpen(false);
      setNotice('Selected attack started from its first warning.');
    }
    setPreviewCommand(null);
  }, [previewCommand, selectedChoice?.bossLabel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drawerOpen) return;
      event.preventDefault();
      resume();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, resume]);

  if (!selectedChoice || !preview) {
    return (
      <main className="remote-runner remote-runner--state">
        No boss encounters are available in this build.
      </main>
    );
  }

  return (
    <main
      className="remote-runner"
      data-playing={playing}
      data-drawer-open={drawerOpen}
    >
      <section className="remote-runner__arena" aria-label="Boss test arena">
        {previewCanMount ? (
          <GameEditorCanvas
            key={`${selectedChoice.id}:${artworkStatus}`}
            campaign={preview.campaign}
            levelId={preview.levelId}
            waveId={preview.waveId}
            playing={playing}
            restartToken={restartToken}
            onPlayingChange={handlePlayingChange}
            previewCommand={previewCommand}
            onPreviewCommandResult={handleCommandResult}
            onPreviewSnapshot={setPreviewSnapshot}
            previewSettings={previewSettings}
            previewViewport={BOSS_SANDBOX_VIEWPORTS.mobile}
            previewBossArtwork={previewBossArtwork}
            audioEnabled
            musicEnabled={false}
            fieldUpgradesEnabled={false}
            onReady={() => setCanvasStatus('ready')}
            onInitializationError={() => {
              setCanvasStatus('error');
              setNotice('The game renderer could not start.');
            }}
          />
        ) : null}

        {canvasStatus !== 'ready' ? (
          <div className="remote-runner__loading" role="status">
            <i aria-hidden="true" />
            <strong>
              {canvasStatus === 'error'
                ? 'Arena could not start'
                : artworkStatus === 'checking'
                  ? 'Checking boss artwork'
                  : 'Loading boss arena'}
            </strong>
            <span>
              {canvasStatus === 'error'
                ? 'Use Reload below to retry the canonical game view.'
                : 'Preparing the full boss fight…'}
            </span>
            {canvasStatus === 'error' ? (
              <button type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
            ) : null}
          </div>
        ) : null}
        <output
          className="remote-runner__version"
          aria-label={`Boss Sandbox version ${BOSS_SANDBOX_VERSION}`}
        >
          {BOSS_SANDBOX_VERSION}
        </output>
      </section>

      {drawerOpen ? (
        <div className="remote-runner__pause-layer">
          <button
            type="button"
            className="remote-runner__scrim"
            aria-label="Resume boss fight"
            onClick={resume}
          />
          <aside
            className="remote-runner__drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-runner-drawer-title"
          >
            <header className="remote-runner__drawer-header">
              <div>
                <small>PAUSED · REMOTE TEST RUNNER</small>
                <strong id="remote-runner-drawer-title">
                  {selectedChoice.bossLabel}
                </strong>
                <span>{selectedChoice.missionLabel}</span>
              </div>
              <button type="button" onClick={resume} aria-label="Resume fight">▶</button>
            </header>

            <nav className="remote-runner__tabs" aria-label="Test runner controls">
              {([
                ['boss', 'Boss'],
                ['ship', 'Ship'],
                ['test', 'Test']
              ] as const).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-selected={drawerTab === id}
                  className={drawerTab === id ? 'is-active' : ''}
                  onClick={() => setDrawerTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="remote-runner__drawer-body">
              {drawerTab === 'boss' ? (
                <section className="remote-runner__panel" aria-label="Boss picker">
                  <div className="remote-runner__section-title">
                    <span>Fight library</span>
                    <small>
                      {campaignBossCount} main · {testBossCount} test
                    </small>
                  </div>
                  <article className="remote-runner__boss-card">
                    <BossArtwork
                      choice={selectedChoice}
                      url={selectedThumbnailUrl}
                      selected
                    />
                    <div className="remote-runner__boss-card-copy">
                      <span data-source={selectedChoice.source}>
                        {selectedChoice.source === 'campaign'
                          ? 'MAIN GAME'
                          : 'TEST ONLY'}
                      </span>
                      <h2>{selectedChoice.bossLabel}</h2>
                      <p>{selectedChoice.missionLabel}</p>
                      <small>{selectedChoice.waveLabel}</small>
                      {artworkRegistration ? (
                        <em data-status={artworkStatus}>
                          {artworkStatus === 'ready'
                            ? 'Animated modular art verified'
                            : artworkStatus === 'unavailable'
                              ? 'Using safe fallback art'
                              : 'Verifying modular art…'}
                        </em>
                      ) : null}
                    </div>
                  </article>
                  <div
                    className="remote-runner__boss-library"
                    aria-label="Boss encounters"
                  >
                    {bossPickerSections.map((section) => (
                      <section key={section.id}>
                        <h3>
                          <span>{section.label}</span>
                          <small>{section.choices.length}</small>
                        </h3>
                        <div className="remote-runner__boss-options">
                          {section.choices.map((choice) => (
                            <button
                              type="button"
                              key={choice.id}
                              className={choice.id === selectedChoice.id
                                ? 'is-active'
                                : ''}
                              aria-pressed={choice.id === selectedChoice.id}
                              aria-label={`Choose ${choice.bossLabel}, ${choice.missionLabel}`}
                              onClick={() => selectBoss(choice.id)}
                            >
                              <BossArtwork
                                choice={choice}
                                url={choiceThumbnailUrls.get(choice.id)}
                              />
                              <span className="remote-runner__boss-option-copy">
                                <strong>{choice.bossLabel}</strong>
                                <small>
                                  {choice.source === 'campaign'
                                    ? choice.missionLabel
                                    : 'Test mission'}
                                </small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  <p className="remote-runner__hint">
                    Choose any encounter, resume, then drag in the arena to move
                    while the ship fires automatically.
                  </p>
                </section>
              ) : null}

              {drawerTab === 'ship' ? (
                <section className="remote-runner__panel" aria-label="Ship loadout">
                  <div className="remote-runner__section-title">
                    <span>Main ship</span>
                    <small>All four test-unlocked</small>
                  </div>
                  <div className="remote-runner__ship-grid">
                    {PLAYABLE_PLAYER_SHIP_IDS.map((shipId) => {
                      const ship = PLAYER_SHIPS[shipId];
                      return (
                        <button
                          type="button"
                          key={shipId}
                          aria-pressed={mainShipId === shipId}
                          className={mainShipId === shipId ? 'is-active' : ''}
                          onClick={() => {
                            setMainShipId(shipId);
                            setNotice(`${ship.name} equipped without restarting the fight.`);
                          }}
                        >
                          <img src={ship.assetUrl} alt="" />
                          <strong>{ship.name}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="remote-runner__upgrade-grid">
                    <Stepper
                      label="Fire rate"
                      value={fireRateLevel}
                      max={BOSS_SANDBOX_FIRE_RATE_MAX}
                      onChange={(next) => {
                        setFireRateLevel(next);
                        setNotice('Fire rate updated without restarting the fight.');
                      }}
                    />
                    <Stepper
                      label="Speed"
                      value={speedLevel}
                      max={BOSS_SANDBOX_SPEED_MAX}
                      onChange={(next) => {
                        setSpeedLevel(next);
                        setNotice('Ship speed updated without restarting the fight.');
                      }}
                    />
                  </div>
                  <CompanionControl
                    slot="left"
                    selection={companions.left}
                    unavailableId={companions.right.id}
                    onChange={(selection) => updateCompanion('left', selection)}
                  />
                  <CompanionControl
                    slot="right"
                    selection={companions.right}
                    unavailableId={companions.left.id}
                    onChange={(selection) => updateCompanion('right', selection)}
                  />
                  <BossHealthTuningPanel
                    boss={previewSnapshot?.boss ?? null}
                    onBossHealthRatioChange={changeBossHealth}
                    onBossMaxHealthChange={changeBossMaxHealth}
                    onComponentMaxHealthChange={changeBossComponentMaxHealth}
                    onBossInvincibilityChange={changeBossHullInvincibility}
                    onComponentInvincibilityChange={changeBossComponentInvincibility}
                  />
                </section>
              ) : null}

              {drawerTab === 'test' ? (
                <section className="remote-runner__panel" aria-label="Fight controls">
                  <div className="remote-runner__section-title">
                    <span>Test controls</span>
                    <small>Read-only sandbox</small>
                  </div>
                  <button
                    type="button"
                    className={`remote-runner__toggle${invincible ? ' is-active' : ''}`}
                    aria-pressed={invincible}
                    onClick={toggleInvincibility}
                  >
                    <span aria-hidden="true">{invincible ? '✓' : ''}</span>
                    <strong>Invincibility</strong>
                    <small>{invincible ? 'Watch safely' : 'Player can take damage'}</small>
                  </button>
                  <div className="remote-runner__attacks">
                    <strong>Start an attack</strong>
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
                  </div>
                  <div className="remote-runner__phases">
                    <strong>Jump to phase</strong>
                    <div>
                      {phases.map((phase, index) => (
                        <button
                          type="button"
                          key={phase.id}
                          aria-pressed={selectedPhaseId === phase.id}
                          onClick={() => jumpToPhase(phase.id)}
                        >
                          <span>{index + 1}</span>
                          {phase.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="remote-runner__restart"
                    onClick={restart}
                  >
                    ↻ Restart boss
                  </button>
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
                      setNotice('Advanced one fixed simulation frame.');
                    }}
                    onResetSeed={() => {
                      sendCommand({ type: 'set-seed', seed: PREVIEW_SEED });
                      setNotice('Restarted with the fixed hosted test seed.');
                    }}
                    onBossHealthChange={changeBossHealth}
                    onOverlayChange={changeDebugOverlay}
                    onReferenceComparisonChange={changeReferenceComparison}
                    onCapture={() => {
                      sendCommand({ type: 'capture-frame' });
                      setNotice('Preparing Pixi frame capture…');
                    }}
                  />
                  <p className="remote-runner__safety">
                    This hosted runner cannot save campaign data, call the local
                    Director, connect a wallet, or submit gameplay analytics.
                  </p>
                </section>
              ) : null}
            </div>

            <footer className="remote-runner__drawer-footer">
              <output aria-live="polite">{notice}</output>
              <button type="button" onClick={resume}>Resume fight</button>
            </footer>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
