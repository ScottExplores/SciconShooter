import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GameEditorCanvas,
  type GameEditorPreviewSettings,
  type GameEditorSnapshot
} from '@game/components/GameEditorCanvas';
import { GAME_CONFIG } from '@game/constants';
import { getBossEncounterClass } from '@game/game-config/catalog';
import type { GameCampaignConfig, SpawnEvent, WaveDefinition, WaveEvent } from '@game/game-config/types';
import { validateGameCampaign } from '@game/game-config/validate';
import type { GameEngineDebugSnapshot, GameRuntimeState } from '@game/services/gameLogic';
import { resolveCampaignFormationPackForSpawn } from '@game/services/campaignFormationBudget';
import type {
  PreviewCommand,
  PreviewCommandResult
} from '@game/services/gameplay/previewSession';
import type { GameplayTelemetrySnapshot } from '@game/services/gameplay/telemetry';
import { PLAYABLE_PLAYER_SHIP_IDS, PLAYER_SHIPS, type PlayerShipId } from '@game/services/playerShipService';
import {
  getFireRateTier,
  getFireRateTierProgress
} from '@game/services/weaponTierProgression';
import {
  MAIN_SHIP_UPGRADE_MAX_LEVEL,
  MAIN_SHIP_FIRE_RATE_MAX_LEVEL,
  MINI_SHIP_MAX_LEVEL,
  MINI_SHIP_CATALOG,
  type MiniShipId,
  type SquadSlotId
} from '@game/services/squadProgression';
import { fetchGameCampaign, type GameCampaignDiskState } from '@director/api/directorClient';
import { savePlaytestSession } from '@director/api/playtestSessions';
import { EditorIcon } from '@director/editor/EditorIcon';
import { CombatLabInspector } from './CombatLabInspector';
import { CombatLabLibrary } from './CombatLabLibrary';
import { SandboxBossPrototypePicker } from './SandboxBossPrototypePicker';
import {
  FormationDesignBoard,
  FormationTemplateRail,
  FormationWorkshopInspector
} from './FormationWorkshop';
import type { FormationTemplate } from './formationWorkshopModel';
import {
  buildCombatLabCatalog,
  type CombatLabCatalogItem,
  type CombatLabCategoryId
} from './contentCatalog';
import { calculateCombatLabDps } from './combatLabTelemetry';
import {
  buildCombatLabRuntimeSquadLoadout,
  cloneCombatLabCampaign,
  createCombatLabPreset,
  createFocusedPreviewCampaign,
  createPreviewCampaignFromPreset,
  createPromotionCampaign,
  duplicateCombatLabPreset,
  loadCombatLabPreset,
  type CombatLabFocus,
  type CombatLabLoadoutSelection,
  type CombatLabPresetEnvelope,
  type CombatLabPreviewResult
} from './experimentModel';
import {
  buildSandboxBossPrototypePreview,
  SANDBOX_BOSS_PROTOTYPE_BY_ID,
  type SandboxBossPrototypeId,
  type SandboxBossPrototypeProvenance
} from './sandboxBossPrototypes';
import './combat-lab.css';

const PRESET_STORAGE_KEY = 'scicon-combat-lab-presets-v1';
const LEVEL_EDITOR_DRAFT_KEY = 'scicon-director-game-campaign-draft-v1';
const MAX_STARTING_HEARTS = Math.min(
  GAME_CONFIG.MAX_LIVES,
  GAME_CONFIG.PLAYER_LIVES + MAIN_SHIP_UPGRADE_MAX_LEVEL
);

type MobilePanel = 'library' | 'waves' | 'tune';
type Notice = { message: string; error?: boolean } | null;
type PromotionMode = 'event' | 'wave';
type AuthoringMode = 'playtest' | 'formation';
type PreviewScaleMode = 'fit' | '50' | '75' | '100';
type PreviewDeviceId = 'small-phone' | 'pixel-8' | 'iphone-15' | 'ipad-mini' | 'desktop';

export const resolveCombatLabHubCategory = (pathname: string): CombatLabCategoryId => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/formations') return 'formations';
  if (normalized === '/loadouts') return 'main-ships';
  if (normalized === '/assets') return 'effects-assets';
  return 'stages-waves';
};

interface PreviewDevicePreset {
  id: PreviewDeviceId;
  label: string;
  width: number;
  height: number;
}

const PREVIEW_DEVICES: readonly PreviewDevicePreset[] = [
  { id: 'small-phone', label: 'Small phone', width: 360, height: 800 },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915 },
  { id: 'iphone-15', label: 'iPhone 15', width: 393, height: 852 },
  { id: 'ipad-mini', label: 'iPad mini', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 }
];

const DEFAULT_LOADOUT: CombatLabLoadoutSelection = {
  mainShipId: 'researchhub',
  upgrades: { fireRate: 2, speed: 1, startingHearts: 0 },
  companions: []
};

const cloneLoadout = (loadout: CombatLabLoadoutSelection): CombatLabLoadoutSelection => (
  cloneCombatLabCampaign(loadout)
);

const clampLevel = (value: unknown, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || minimum)))
);

const sanitizeLoadout = (loadout: CombatLabLoadoutSelection): CombatLabLoadoutSelection => ({
  mainShipId: loadout.mainShipId,
  upgrades: {
    fireRate: clampLevel(loadout.upgrades?.fireRate, 0, MAIN_SHIP_FIRE_RATE_MAX_LEVEL),
    speed: clampLevel(loadout.upgrades?.speed, 0, MAIN_SHIP_UPGRADE_MAX_LEVEL),
    startingHearts: clampLevel(loadout.upgrades?.startingHearts, 0, MAIN_SHIP_UPGRADE_MAX_LEVEL)
  },
  companions: (loadout.companions ?? []).map((companion) => ({
    ...companion,
    level: clampLevel(companion.level, 1, MINI_SHIP_MAX_LEVEL)
  }))
});

const sanitizeFileName = (name: string) => name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'combat-lab-experiment';

const readStoredPresets = (campaign: GameCampaignConfig): CombatLabPresetEnvelope[] => {
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values)) throw new Error('Preset storage is not an array');
    return values.flatMap((value) => {
      try {
        return [loadCombatLabPreset(value, campaign)];
      } catch {
        return [];
      }
    });
  } catch {
    window.localStorage.removeItem(PRESET_STORAGE_KEY);
    return [];
  }
};

const persistPresets = (presets: readonly CombatLabPresetEnvelope[]) => {
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
};

const replaceWave = (
  campaign: GameCampaignConfig,
  levelId: string,
  waveId: string,
  wave: WaveDefinition
): GameCampaignConfig => {
  const next = cloneCombatLabCampaign(campaign);
  const level = next.levels.find((item) => item.id === levelId);
  if (!level) throw new Error(`Unknown preview level: ${levelId}`);
  const waveIndex = level.waves.findIndex((item) => item.id === waveId);
  if (waveIndex < 0) throw new Error(`Unknown preview wave: ${waveId}`);
  level.waves[waveIndex] = cloneCombatLabCampaign(wave);
  return next;
};

const getFirstPreview = (campaign: GameCampaignConfig): CombatLabPreviewResult => {
  const level = [...campaign.levels].sort((left, right) => left.order - right.order)[0];
  const wave = level && [...level.waves].sort((left, right) => left.order - right.order)[0];
  if (!level || !wave) throw new Error('Combat Lab requires at least one mission and wave');
  return createFocusedPreviewCampaign(campaign, { kind: 'wave', levelId: level.id, waveId: wave.id });
};

const focusForItem = (item: CombatLabCatalogItem): CombatLabFocus | null => {
  const target = item.target;
  if ((item.kind === 'stage' || item.kind === 'wave') && target.levelId && target.waveId) {
    return { kind: 'wave', levelId: target.levelId, waveId: target.waveId };
  }
  if (item.kind === 'formation' && target.patternId) {
    return { kind: 'formation', patternId: target.patternId, levelId: target.levelId, waveId: target.waveId, eventId: target.eventId };
  }
  if (item.kind === 'enemy' && target.enemyId) {
    return { kind: 'enemy', enemyId: target.enemyId, levelId: target.levelId, waveId: target.waveId, eventId: target.eventId };
  }
  if (item.kind === 'boss' && target.eventId) {
    return { kind: 'boss', eventId: target.eventId, levelId: target.levelId, waveId: target.waveId };
  }
  if (item.kind === 'boss-weapon' && target.eventId && target.weaponSettingId) {
    return { kind: 'boss-weapon', eventId: target.eventId, weaponSettingId: target.weaponSettingId, levelId: target.levelId, waveId: target.waveId };
  }
  if (item.kind === 'boss-phase' && target.eventId && target.phaseId) {
    return { kind: 'boss-phase', eventId: target.eventId, phaseId: target.phaseId, levelId: target.levelId, waveId: target.waveId };
  }
  if (item.kind === 'weapon' && target.eventId && target.weaponSettingId) {
    return { kind: 'boss-weapon', eventId: target.eventId, weaponSettingId: target.weaponSettingId, levelId: target.levelId, waveId: target.waveId };
  }
  if (item.kind === 'powerup' && target.powerupId) {
    return { kind: 'powerup', powerupId: target.powerupId, levelId: target.levelId, waveId: target.waveId, eventId: target.eventId };
  }
  return null;
};

const createPreviewFromPreset = (
  campaign: GameCampaignConfig,
  preset: CombatLabPresetEnvelope
): CombatLabPreviewResult => {
  const previewCampaign = createPreviewCampaignFromPreset(campaign, preset);
  const level = previewCampaign.levels.find((item) => item.id === preset.source.levelId);
  const wave = level?.waves.find((item) => item.id === preset.source.waveId);
  if (!wave) throw new Error('Preset preview wave is no longer available');
  return {
    campaign: previewCampaign,
    focus: cloneCombatLabCampaign(preset.focus),
    levelId: preset.source.levelId,
    waveId: preset.source.waveId,
    eventId: preset.source.eventId,
    previewWave: cloneCombatLabCampaign(wave),
    limitations: []
  };
};

function CombatLabMark() {
  return <div className="cl-mark" aria-hidden="true">CL</div>;
}

function Toggle({ label, pressed, onChange }: { label: string; pressed: boolean; onChange: (pressed: boolean) => void }) {
  return <button type="button" className={`cl-control-toggle${pressed ? ' is-on' : ''}`} aria-pressed={pressed} onClick={() => onChange(!pressed)}><i />{label}</button>;
}

function CombatLabGuide({
  onClose,
  onReloadSource
}: {
  onClose: () => void;
  onReloadSource: () => void;
}) {
  return (
    <aside className="cl-guide" id="combat-lab-guide" aria-label="How to use Combat Lab">
      <header className="cl-guide__header">
        <div>
          <strong>From experiment to game-ready mission</strong>
          <span>A safe workflow you can come back to anytime. No coding is required.</span>
        </div>
        <button className="cl-button cl-button--quiet" type="button" onClick={onClose}>Hide guide</button>
      </header>
      <ol className="cl-guide__steps">
        <li><b>1</b><div><strong>Build or tune</strong><span>Use Playtest for real encounters or Formation Workshop to draw a custom enemy shape.</span></div></li>
        <li><b>2</b><div><strong>Play and save</strong><span>Test in the real game engine, then save a browser preset without touching the game.</span></div></li>
        <li><b>3</b><div><strong>Review a draft</strong><span>Send one encounter or a whole wave to Mission Builder. A draft does not update the game.</span></div></li>
        <li><b>4</b><div><strong>Apply when ready</strong><span>Only Apply to game in Mission Builder updates game-config/campaign.json.</span></div></li>
      </ol>
      <footer className="cl-guide__footer">
        <div>
          <strong>Mission → Wave → Encounter → Formation</strong>
          <span>A mission is the full match. Add as many waves as you need in Mission Builder, then combine the encounters and formations you prove here. Source-code changes in this same project appear after reload.</span>
        </div>
        <button className="cl-button cl-button--cyan" type="button" onClick={onReloadSource}><EditorIcon name="restart" /> Reload source</button>
      </footer>
    </aside>
  );
}

function ShipSetup({
  loadout,
  onChange
}: {
  loadout: CombatLabLoadoutSelection;
  onChange: (loadout: CombatLabLoadoutSelection) => void;
}) {
  const companions = loadout.companions ?? [];
  const fireRateLevel = loadout.upgrades?.fireRate ?? 0;
  const fireRateTier = getFireRateTier(fireRateLevel);
  const fireRateTierProgress = getFireRateTierProgress(fireRateLevel);
  const companionFor = (slot: SquadSlotId) => companions.find((item) => item.slot === slot);
  const updateCompanion = (slot: SquadSlotId, miniShipId: MiniShipId | '') => {
    const next = companions.filter((item) => item.slot !== slot && (!miniShipId || item.miniShipId !== miniShipId));
    if (miniShipId) next.push({ slot, miniShipId, level: companionFor(slot)?.level ?? 1 });
    onChange({ ...loadout, companions: next });
  };
  const updateCompanionLevel = (slot: SquadSlotId, level: number) => {
    onChange({
      ...loadout,
      companions: companions.map((item) => item.slot === slot ? { ...item, level: Math.max(1, Math.min(5, Math.round(level))) } : item)
    });
  };

  return (
    <details className="cl-ship-setup">
      <summary><strong>Player test loadout</strong><span>No unlocks or save data used</span></summary>
      <div className="cl-ship-grid">
        <label><span>Main ship</span><select value={loadout.mainShipId} onChange={(input) => onChange({ ...loadout, mainShipId: input.target.value as PlayerShipId })}>{PLAYABLE_PLAYER_SHIP_IDS.map((id) => <option value={id} key={id}>{PLAYER_SHIPS[id].name}</option>)}</select></label>
        <label><span>Starting hearts</span><input type="number" min={GAME_CONFIG.PLAYER_LIVES} max={MAX_STARTING_HEARTS} value={GAME_CONFIG.PLAYER_LIVES + (loadout.upgrades?.startingHearts ?? 0)} onChange={(input) => onChange({ ...loadout, upgrades: { ...loadout.upgrades, startingHearts: Math.max(0, Number(input.target.value) - GAME_CONFIG.PLAYER_LIVES) } })} /></label>
        {(['left', 'right'] as const).map((slot) => {
          const companion = companionFor(slot);
          const otherCompanion = companionFor(slot === 'left' ? 'right' : 'left');
          const availableMiniShips = MINI_SHIP_CATALOG.filter((ship) => (
            ship.id === companion?.miniShipId || ship.id !== otherCompanion?.miniShipId
          ));
          return (
            <label key={slot}><span>{slot} mini-ship</span><select value={companion?.miniShipId ?? ''} onChange={(input) => updateCompanion(slot, input.target.value as MiniShipId | '')}><option value="">Empty slot</option>{availableMiniShips.map((ship) => <option value={ship.id} key={ship.id}>{ship.name}</option>)}</select></label>
          );
        })}
        {(['left', 'right'] as const).map((slot) => {
          const companion = companionFor(slot);
          return <label key={`${slot}-level`}><span>{slot} mini level</span><input type="number" min={1} max={MINI_SHIP_MAX_LEVEL} disabled={!companion} value={companion?.level ?? 1} onChange={(input) => updateCompanionLevel(slot, Number(input.target.value))} /></label>;
        })}
        <label><span>Fire-rate level · T{fireRateTier} ({fireRateTierProgress}/{MAIN_SHIP_UPGRADE_MAX_LEVEL})</span><input type="number" min={0} max={MAIN_SHIP_FIRE_RATE_MAX_LEVEL} value={fireRateLevel} onChange={(input) => onChange({ ...loadout, upgrades: { ...loadout.upgrades, fireRate: Number(input.target.value) } })} /></label>
        <label><span>Speed level</span><input type="number" min={0} max={MAIN_SHIP_UPGRADE_MAX_LEVEL} value={loadout.upgrades?.speed ?? 0} onChange={(input) => onChange({ ...loadout, upgrades: { ...loadout.upgrades, speed: Number(input.target.value) } })} /></label>
      </div>
    </details>
  );
}

function Workspace({ initialState }: { initialState: GameCampaignDiskState<GameCampaignConfig> }) {
  const sourceCampaign = useMemo(() => cloneCombatLabCampaign(initialState.campaign), [initialState.campaign]);
  const catalog = useMemo(() => buildCombatLabCatalog(sourceCampaign), [sourceCampaign]);
  const initialPreview = useMemo(() => getFirstPreview(sourceCampaign), [sourceCampaign]);
  const initialHubCategory = useMemo(
    () => resolveCombatLabHubCategory(window.location.pathname),
    []
  );
  const sandboxPrototypeSurface = useMemo(() => {
    const normalized = window.location.pathname.replace(/\/+$/, '') || '/';
    return normalized === '/sandbox' || normalized === '/combat-lab';
  }, []);
  const [preview, setPreview] = useState<CombatLabPreviewResult>(initialPreview);
  const [baselinePreview, setBaselinePreview] = useState<CombatLabPreviewResult>(initialPreview);
  const [selectedEventId, setSelectedEventId] = useState(initialPreview.previewWave.events[0]?.id ?? null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(`wave:${initialPreview.waveId}`);
  const [selectedCategory, setSelectedCategory] = useState<CombatLabCategoryId>(initialHubCategory);
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState(true);
  const [restartToken, setRestartToken] = useState(0);
  const [sequenceLevelId, setSequenceLevelId] = useState(initialPreview.levelId);
  const [queuedWaveIds, setQueuedWaveIds] = useState<string[]>([initialPreview.waveId]);
  const [sequenceActive, setSequenceActive] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(1);
  const [invincible, setInvincible] = useState(true);
  const [showBounds, setShowBounds] = useState(false);
  const [useCollisionBounds, setUseCollisionBounds] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [runtimeState, setRuntimeState] = useState<GameRuntimeState | null>(null);
  const [debugSnapshot, setDebugSnapshot] = useState<GameEngineDebugSnapshot | null>(null);
  const [editorSnapshot, setEditorSnapshot] = useState<GameEditorSnapshot | null>(null);
  const [telemetrySnapshot, setTelemetrySnapshot] = useState<GameplayTelemetrySnapshot | null>(null);
  const [previewSeed, setPreviewSeed] = useState('scicon-lab-baseline');
  const [seedDraft, setSeedDraft] = useState('scicon-lab-baseline');
  const [previewCommand, setPreviewCommand] = useState<PreviewCommand | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [activeSandboxPrototype, setActiveSandboxPrototype] = useState<SandboxBossPrototypeProvenance | null>(null);
  const [loadout, setLoadout] = useState<CombatLabLoadoutSelection>(() => cloneLoadout(DEFAULT_LOADOUT));
  const [baselineLoadout, setBaselineLoadout] = useState<CombatLabLoadoutSelection>(() => cloneLoadout(DEFAULT_LOADOUT));
  const [presets, setPresets] = useState<CombatLabPresetEnvelope[]>(() => readStoredPresets(sourceCampaign));
  const [presetName, setPresetName] = useState(initialPreview.previewWave.name);
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [deletePresetArmed, setDeletePresetArmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(
    initialHubCategory === 'stages-waves' ? 'tune' : 'library'
  );
  const [promotionMode, setPromotionMode] = useState<PromotionMode>('event');
  const [authoringMode, setAuthoringMode] = useState<AuthoringMode>('playtest');
  const [guideOpen, setGuideOpen] = useState(true);
  const [previewDeviceId, setPreviewDeviceId] = useState<PreviewDeviceId>('pixel-8');
  const [previewLandscape, setPreviewLandscape] = useState(false);
  const [previewScaleMode, setPreviewScaleMode] = useState<PreviewScaleMode>('fit');
  const [previewHostSize, setPreviewHostSize] = useState({ width: 0, height: 0 });
  const allowNavigationRef = useRef(false);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const previewCommandNonceRef = useRef(0);
  const hubRouteInitializedRef = useRef(false);

  const selectedItem = selectedItemId ? catalog.byId[selectedItemId] : undefined;
  const activeSandboxDescriptor = activeSandboxPrototype
    ? SANDBOX_BOSS_PROTOTYPE_BY_ID[activeSandboxPrototype.prototypeId]
    : null;
  const selectedEvent = preview.previewWave.events.find((event) => event.id === selectedEventId)
    ?? preview.previewWave.events[0]
    ?? null;
  const selectedSpawnEvent = selectedEvent?.kind === 'spawn' ? selectedEvent : null;
  const selectedFormationPack = useMemo(() => {
    if (!selectedSpawnEvent || selectedSpawnEvent.patternId === 'single-random' || selectedSpawnEvent.patternId === 'asteroid-lanes') return undefined;
    const declaredPacks = preview.previewWave.formationPackIds.flatMap((packId) => {
      const pack = preview.campaign.formationPacks.find((candidate) => candidate.id === packId);
      return pack ? [pack] : [];
    });
    return resolveCampaignFormationPackForSpawn(selectedSpawnEvent, declaredPacks)
      ?? resolveCampaignFormationPackForSpawn(selectedSpawnEvent, preview.campaign.formationPacks);
  }, [preview.campaign.formationPacks, preview.previewWave.formationPackIds, selectedSpawnEvent]);
  const selectedLevel = preview.campaign.levels.find((level) => level.id === preview.levelId);
  const selectedWaveIndex = selectedLevel?.waves.findIndex((wave) => wave.id === preview.waveId) ?? -1;
  const missionOptions = useMemo(
    () => [...preview.campaign.levels].sort((left, right) => left.order - right.order),
    [preview.campaign.levels]
  );
  const checkpointOptions = useMemo(() => (selectedLevel?.waves.flatMap((wave) => (
    wave.events.flatMap((event) => {
      if (event.kind === 'boss') {
        return [{
          id: `${wave.id}:${event.id}`,
          waveId: wave.id,
          eventId: event.id,
          label: `Wave ${wave.order} · ${getBossEncounterClass(event.bossId) === 'boss' ? 'BOSS' : 'ELITE ENEMY'} · ${event.label}`
        }];
      }
      if (event.kind === 'spawn' && event.enemies.some((enemy) => enemy.rank === 'elite')) {
        return [{
          id: `${wave.id}:${event.id}`,
          waveId: wave.id,
          eventId: event.id,
          label: `Wave ${wave.order} · ELITE UNIT · ${event.label}`
        }];
      }
      return [];
    })
  )) ?? []), [selectedLevel]);
  const previewDevice = PREVIEW_DEVICES.find((device) => device.id === previewDeviceId) ?? PREVIEW_DEVICES[1];
  const previewDimensions = previewLandscape
    ? { width: previewDevice.height, height: previewDevice.width }
    : { width: previewDevice.width, height: previewDevice.height };
  const fitPreviewScale = previewHostSize.width > 0 && previewHostSize.height > 0
    ? Math.max(.2, Math.min(
      1,
      (previewHostSize.width - 36) / previewDimensions.width,
      (previewHostSize.height - 36) / previewDimensions.height
    ))
    : .6;
  const previewScale = previewScaleMode === 'fit' ? fitPreviewScale : Number(previewScaleMode) / 100;
  const previewScalePercent = Math.round(previewScale * 100);
  const queuedWaves = useMemo(() => {
    const level = preview.campaign.levels.find((item) => item.id === sequenceLevelId);
    if (!level) return [];
    const selected = new Set(queuedWaveIds);
    return level.waves.filter((wave) => selected.has(wave.id)).sort((left, right) => left.order - right.order);
  }, [preview.campaign.levels, queuedWaveIds, sequenceLevelId]);
  const runtimeSquadLoadout = useMemo(() => {
    try {
      return buildCombatLabRuntimeSquadLoadout(loadout);
    } catch {
      return undefined;
    }
  }, [loadout]);
  const previewSettings = useMemo<GameEditorPreviewSettings>(() => ({
    playerShipId: loadout.mainShipId,
    squadLoadout: runtimeSquadLoadout,
    gameSpeed,
    invinciblePlayer: invincible,
    seed: previewSeed,
    startingLives: Math.min(GAME_CONFIG.MAX_LIVES, GAME_CONFIG.PLAYER_LIVES + (runtimeSquadLoadout?.upgrades.startingHearts ?? 0)),
    upgrades: {
      fireRate: runtimeSquadLoadout?.upgrades.fireRate ?? 2,
      speed: runtimeSquadLoadout?.upgrades.speed ?? 1,
      missile: 0
    }
  }), [gameSpeed, invincible, loadout, previewSeed, runtimeSquadLoadout]);
  const canvasKey = useMemo(() => JSON.stringify({
    mainShipId: loadout.mainShipId,
    upgrades: loadout.upgrades,
    companions: loadout.companions
  }), [loadout]);

  const notify = useCallback((message: string, error = false) => {
    setNotice({ message, error });
    window.setTimeout(() => setNotice((current) => current?.message === message ? null : current), error ? 6000 : 3200);
  }, []);

  const setPreviewPlaying = useCallback((nextPlaying: boolean) => {
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: nextPlaying ? 'play' : 'pause'
    });
    setPlaying(nextPlaying);
  }, []);

  const updateGameSpeed = useCallback((nextSpeed: number) => {
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: 'set-time-scale',
      timeScale: nextSpeed
    });
    setGameSpeed(nextSpeed);
  }, []);

  const updateInvincibility = useCallback((enabled: boolean) => {
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: 'set-invincibility',
      enabled
    });
    setInvincible(enabled);
  }, []);

  const applyPreviewSeed = useCallback(() => {
    const seed = seedDraft.trim();
    if (!seed) {
      notify('A deterministic preview seed is required', true);
      return;
    }
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: 'set-seed',
      seed
    });
    setTelemetrySnapshot(null);
    setCleared(false);
    setPlaying(true);
    notify(`Preview restarted with seed “${seed}”`);
  }, [notify, seedDraft]);

  const spawnSelectedEventNow = useCallback(() => {
    if (!selectedEvent) {
      notify('Select an encounter before spawning it', true);
      return;
    }
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: 'spawn-event-now',
      eventId: selectedEvent.id
    });
    setCleared(false);
    setPlaying(true);
  }, [notify, selectedEvent]);

  const jumpToSelectedBossPhase = useCallback(() => {
    if (selectedEvent?.kind !== 'boss' || !selectedPhaseId) {
      notify('Select a boss phase before jumping to it', true);
      return;
    }
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: 'jump-to-boss-phase',
      eventId: selectedEvent.id,
      phaseId: selectedPhaseId
    });
    setCleared(false);
    setPlaying(true);
  }, [notify, selectedEvent, selectedPhaseId]);

  const fastForwardFiveSeconds = useCallback(() => {
    previewCommandNonceRef.current += 1;
    setPreviewCommand({
      nonce: previewCommandNonceRef.current,
      type: 'fast-forward',
      frames: GAME_CONFIG.FPS * 5
    });
    setCleared(false);
  }, []);

  const handlePreviewCommandResult = useCallback((result: PreviewCommandResult) => {
    if (!previewCommand || previewCommand.nonce !== result.nonce) return;
    if (result.handled && previewCommand.type === 'set-seed') {
      setPreviewSeed(String(previewCommand.seed));
    }
    if (!result.handled) {
      notify(`Preview command could not run: ${previewCommand.type}`, true);
    }
    setPreviewCommand(null);
  }, [notify, previewCommand]);

  const saveCurrentPlaytest = useCallback(async () => {
    if (!telemetrySnapshot || telemetrySnapshot.aggregate.recordedEventCount === 0) {
      notify('Run the preview before saving a playtest session', true);
      return;
    }
    setSavingSession(true);
    try {
      const response = await savePlaytestSession({
        name: presetName.trim() || preview.previewWave.name,
        campaignHash: initialState.contentHash,
        seed: previewSeed,
        target: {
          levelId: preview.levelId,
          waveId: preview.waveId,
          ...(selectedEvent?.id ? { eventId: selectedEvent.id } : {})
        },
        viewport: previewDimensions,
        loadoutLabel: [
          PLAYER_SHIPS[loadout.mainShipId].name,
          `fire ${loadout.upgrades?.fireRate ?? 0}`,
          `speed ${loadout.upgrades?.speed ?? 0}`,
          `${loadout.companions?.length ?? 0} mini`
        ].join(' · '),
        ...(activeSandboxPrototype ? {
          notes: [
            `Sandbox-only prototype ${activeSandboxPrototype.prototypeId}.`,
            `Prototype ${activeSandboxPrototype.prototypeHash}.`,
            `Preview ${activeSandboxPrototype.previewHash}.`,
            'No campaign or workspace content was written.'
          ].join(' ')
        } : dirty ? { notes: 'Saved from an unapplied local Combat Lab experiment.' } : {}),
        snapshot: telemetrySnapshot
      });
      notify(`Saved “${response.session.name}” to local Analytics`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Could not save the local playtest session', true);
    } finally {
      setSavingSession(false);
    }
  }, [
    activeSandboxPrototype,
    dirty,
    initialState.contentHash,
    loadout,
    notify,
    presetName,
    preview.levelId,
    preview.previewWave.name,
    preview.waveId,
    previewDimensions,
    previewSeed,
    selectedEvent?.id,
    telemetrySnapshot
  ]);

  const replaceSelection = useCallback((
    next: CombatLabPreviewResult,
    itemId: string | null = null,
    options: {
      preserveSequence?: boolean;
      sandboxPrototype?: SandboxBossPrototypeProvenance;
    } = {}
  ) => {
    setPreview(next);
    setBaselinePreview(cloneCombatLabCampaign(next));
    setSelectedEventId(next.eventId ?? next.previewWave.events[0]?.id ?? null);
    const focusedPhase = next.focus.kind === 'boss-phase' ? next.focus.phaseId : null;
    setSelectedPhaseId(focusedPhase);
    setSelectedItemId(itemId);
    setPlaying(true);
    setCleared(false);
    setEditorSnapshot(null);
    setDebugSnapshot(null);
    setRuntimeState(null);
    setTelemetrySnapshot(null);
    setRestartToken((value) => value + 1);
    setDirty(false);
    setActivePresetId('');
    setActiveSandboxPrototype(options.sandboxPrototype ?? null);
    if (!options.preserveSequence) {
      setSequenceActive(false);
      setSequenceIndex(0);
    }
  }, []);

  const canDiscard = useCallback(() => !dirty || window.confirm('Discard the unsaved Combat Lab experiment and open another test?'), [dirty]);

  const selectSandboxBossPrototype = useCallback((prototypeId: SandboxBossPrototypeId) => {
    if (!canDiscard()) return;
    const descriptor = SANDBOX_BOSS_PROTOTYPE_BY_ID[prototypeId];
    try {
      const next = buildSandboxBossPrototypePreview(sourceCampaign, prototypeId);
      replaceSelection(next, null, { sandboxPrototype: next.sandboxPrototype });
      setBaselineLoadout(cloneLoadout(loadout));
      setPresetName(descriptor.label);
      setSelectedCategory('bosses');
      setAuthoringMode('playtest');
      setMobilePanel('tune');
      notify(`${descriptor.label} loaded as an editable Sandbox-only run from a frozen definition`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load the Sandbox boss prototype', true);
    }
  }, [canDiscard, loadout, notify, replaceSelection, sourceCampaign]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty || allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) return undefined;
    const measure = () => setPreviewHostSize({ width: host.clientWidth, height: host.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const guardNavigation = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!canDiscard()) {
      event.preventDefault();
      return;
    }
    allowNavigationRef.current = true;
  }, [canDiscard]);

  const reloadSource = useCallback(() => {
    if (!canDiscard()) return;
    allowNavigationRef.current = true;
    window.location.reload();
  }, [canDiscard]);

  const selectItem = useCallback((item: CombatLabCatalogItem) => {
    const focus = focusForItem(item);

    if (!focus) {
      setSelectedItemId(item.id);
      setPresetName(item.name);
      let loadoutChanged = false;
      if (item.target.playerShipId) {
        setLoadout((current) => ({ ...current, mainShipId: item.target.playerShipId as PlayerShipId }));
        loadoutChanged = true;
      }
      if (item.target.miniShipId) {
        const miniShipId = item.target.miniShipId;
        setLoadout((current) => ({ ...current, companions: [{ slot: 'left', miniShipId, level: 1 }] }));
        loadoutChanged = true;
      }
      if (loadoutChanged) {
        setDirty(true);
        setActivePresetId('');
        setCleared(false);
        setEditorSnapshot(null);
      }
      setMobilePanel(item.kind === 'main-ship' || item.kind === 'mini-ship' ? 'tune' : 'library');
      notify(item.kind === 'asset' || item.kind === 'effect' ? 'Inspecting the real runtime source and asset metadata' : 'Player loadout updated');
      return;
    }

    if (!canDiscard()) return;
    setSelectedItemId(item.id);
    setPresetName(item.name);
    if (item.target.playerShipId) {
      setLoadout((current) => ({ ...current, mainShipId: item.target.playerShipId as PlayerShipId }));
    }
    if (item.target.miniShipId) {
      const miniShipId = item.target.miniShipId;
      setLoadout((current) => ({ ...current, companions: [{ slot: 'left', miniShipId, level: 1 }] }));
    }
    try {
      const next = createFocusedPreviewCampaign(sourceCampaign, focus);
      const focusedEvent = next.previewWave.events.find((event) => event.id === next.eventId);
      const opensFormationWorkshop = item.kind === 'formation' && focusedEvent?.kind === 'spawn';
      replaceSelection(next, item.id);
      setAuthoringMode(opensFormationWorkshop ? 'formation' : 'playtest');
      if (focus.kind === 'wave') {
        setSequenceLevelId(next.levelId);
        setQueuedWaveIds((current) => sequenceLevelId === next.levelId
          ? Array.from(new Set([...current, next.waveId]))
          : [next.waveId]);
      }
      setBaselineLoadout(cloneLoadout(loadout));
      setMobilePanel(opensFormationWorkshop ? 'library' : 'tune');
      if (item.kind === 'formation' && !opensFormationWorkshop) {
        notify('Asteroid lanes are a hazard encounter, so they open in Playtest instead of Formation Workshop');
      } else if (next.limitations.length > 0) notify(next.limitations[0]);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not focus this content', true);
    }
  }, [canDiscard, loadout, notify, replaceSelection, sequenceLevelId, sourceCampaign]);

  useEffect(() => {
    if (hubRouteInitializedRef.current) return;
    hubRouteInitializedRef.current = true;
    setSelectedCategory(initialHubCategory);
    if (initialHubCategory !== 'formations') return;
    const formation = catalog.formations.find((item) => (
      item.target.levelId && item.target.waveId && item.target.eventId
    ));
    if (formation) selectItem(formation);
  }, [catalog.formations, initialHubCategory, selectItem]);

  const selectWave = (levelId: string, waveId: string) => {
    try {
      const next = createFocusedPreviewCampaign(preview.campaign, { kind: 'wave', levelId, waveId });
      replaceSelection(next, `wave:${waveId}`);
      setSequenceLevelId(levelId);
      setQueuedWaveIds((current) => sequenceLevelId === levelId
        ? Array.from(new Set([...current, waveId]))
        : [waveId]);
      setAuthoringMode('playtest');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not select that Wave', true);
    }
  };

  const selectMission = (levelId: string) => {
    const level = preview.campaign.levels.find((candidate) => candidate.id === levelId);
    const firstWave = level?.waves.slice().sort((left, right) => left.order - right.order)[0];
    if (!level || !firstWave) return;
    setSequenceLevelId(level.id);
    setQueuedWaveIds([firstWave.id]);
    selectWave(level.id, firstWave.id);
  };

  const selectEvent = (event: WaveEvent) => {
    setSelectedEventId(event.id);
    setSelectedPhaseId(event.kind === 'boss' ? event.phases[0]?.id ?? null : null);
    setSelectedItemId(null);
    if (event.kind !== 'spawn') setAuthoringMode('playtest');
    setMobilePanel('tune');
  };

  const toggleQueuedWave = (waveId: string, include: boolean) => {
    if (!selectedLevel) return;
    setSequenceActive(false);
    setSequenceIndex(0);
    if (sequenceLevelId !== selectedLevel.id) {
      setSequenceLevelId(selectedLevel.id);
      setQueuedWaveIds(include ? [waveId] : []);
      return;
    }
    setQueuedWaveIds((current) => include
      ? Array.from(new Set([...current, waveId]))
      : current.filter((id) => id !== waveId));
  };

  const startWaveSequence = (levelId: string, waves: readonly WaveDefinition[], label: string) => {
    if (waves.length === 0) {
      notify('Select at least one wave for the sequence', true);
      return;
    }
    const first = waves[0];
    try {
      const next = createFocusedPreviewCampaign(preview.campaign, {
        kind: 'wave',
        levelId,
        waveId: first.id
      });
      setSequenceLevelId(levelId);
      setQueuedWaveIds(waves.map((wave) => wave.id));
      setSequenceActive(true);
      setSequenceIndex(0);
      setBaselineLoadout(cloneLoadout(loadout));
      replaceSelection(next, `wave:${first.id}`, { preserveSequence: true });
      setMobilePanel('waves');
      notify(`${label} · ${waves.length} Wave${waves.length === 1 ? '' : 's'} in campaign order`);
    } catch (error) {
      setSequenceActive(false);
      notify(error instanceof Error ? error.message : 'Could not start the selected waves', true);
    }
  };

  const playQueuedWaves = () => startWaveSequence(sequenceLevelId, queuedWaves, 'Running selection');

  const runFullMission = () => {
    if (!selectedLevel) return;
    const waves = [...selectedLevel.waves].sort((left, right) => left.order - right.order);
    startWaveSequence(selectedLevel.id, waves, `Running ${selectedLevel.name}`);
  };

  const restartWaveSequence = () => startWaveSequence(sequenceLevelId, queuedWaves, 'Restarting sequence');

  const jumpToCheckpoint = (checkpointId: string) => {
    const checkpoint = checkpointOptions.find((item) => item.id === checkpointId);
    if (!checkpoint || !selectedLevel) return;
    try {
      const next = createFocusedPreviewCampaign(preview.campaign, {
        kind: 'wave',
        levelId: selectedLevel.id,
        waveId: checkpoint.waveId
      });
      replaceSelection(next, `wave:${checkpoint.waveId}`);
      setSelectedEventId(checkpoint.eventId);
      const event = next.previewWave.events.find((candidate) => candidate.id === checkpoint.eventId);
      setSelectedPhaseId(event?.kind === 'boss' ? event.phases[0]?.id ?? null : null);
      setSequenceLevelId(selectedLevel.id);
      setQueuedWaveIds((current) => Array.from(new Set([...current, checkpoint.waveId])));
      setAuthoringMode('playtest');
      notify(`Jumped to ${checkpoint.label}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not jump to that checkpoint', true);
    }
  };

  const selectAdjacentWave = (offset: -1 | 1) => {
    if (!selectedLevel) return;
    const currentIndex = selectedLevel.waves.findIndex((wave) => wave.id === preview.waveId);
    const next = selectedLevel.waves[currentIndex + offset];
    if (next) selectWave(selectedLevel.id, next.id);
  };

  useEffect(() => {
    if (!sequenceActive || !runtimeState?.complete) return;
    const nextIndex = sequenceIndex + 1;
    const nextWave = queuedWaves[nextIndex];
    if (!nextWave) {
      setSequenceActive(false);
      setPlaying(false);
      notify(`Completed ${queuedWaves.length} selected wave${queuedWaves.length === 1 ? '' : 's'}`);
      return;
    }
    try {
      const next = createFocusedPreviewCampaign(preview.campaign, {
        kind: 'wave',
        levelId: sequenceLevelId,
        waveId: nextWave.id
      });
      setSequenceIndex(nextIndex);
      replaceSelection(next, `wave:${nextWave.id}`, { preserveSequence: true });
    } catch (error) {
      setSequenceActive(false);
      setPlaying(false);
      notify(error instanceof Error ? error.message : 'Could not continue the selected waves', true);
    }
  }, [notify, preview.campaign, queuedWaves, replaceSelection, runtimeState?.complete, sequenceActive, sequenceIndex, sequenceLevelId]);

  const updateSelectedEvent = (event: WaveEvent) => {
    const nextWave: WaveDefinition = {
      ...preview.previewWave,
      durationSeconds: Math.max(preview.previewWave.durationSeconds, event.startSeconds + (event.blocksWaveClock ? 0 : event.durationSeconds)),
      events: preview.previewWave.events
        .map((item) => item.id === event.id ? event : item)
        .sort((left, right) => left.startSeconds - right.startSeconds)
    };
    const nextCampaign = replaceWave(preview.campaign, preview.levelId, preview.waveId, nextWave);
    const owningLevel = nextCampaign.levels.find((level) => level.id === preview.levelId);
    if (owningLevel && (event.kind === 'powerup' || event.kind === 'recovery')) {
      event.powerupIds.forEach((id) => { if (!owningLevel.availablePowerupIds.includes(id)) owningLevel.availablePowerupIds.push(id); });
    }
    const validation = validateGameCampaign(nextCampaign);
    if (!validation.valid) {
      notify(`${validation.issues[0].path}: ${validation.issues[0].message}`, true);
      return;
    }
    setPreview((current) => ({ ...current, campaign: nextCampaign, previewWave: nextWave, eventId: event.id }));
    setSelectedEventId(event.id);
    setCleared(false);
    setEditorSnapshot(null);
    setDirty(true);
  };

  const updateLoadout = (next: CombatLabLoadoutSelection) => {
    try {
      const sanitized = sanitizeLoadout(next);
      buildCombatLabRuntimeSquadLoadout(sanitized);
      setLoadout(sanitized);
      setDirty(true);
      setCleared(false);
      setEditorSnapshot(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Invalid player loadout', true);
    }
  };

  const resetSelection = () => {
    setSequenceActive(false);
    setSequenceIndex(0);
    setPreview(cloneCombatLabCampaign(baselinePreview));
    setLoadout(cloneLoadout(baselineLoadout));
    setSelectedEventId(baselinePreview.eventId ?? baselinePreview.previewWave.events[0]?.id ?? null);
    setSelectedPhaseId(baselinePreview.focus.kind === 'boss-phase' ? baselinePreview.focus.phaseId : null);
    setDirty(false);
    setCleared(false);
    setRestartToken((value) => value + 1);
    setRuntimeState(null);
    setDebugSnapshot(null);
    setEditorSnapshot(null);
    setTelemetrySnapshot(null);
    notify('Experiment reset to its catalog values');
  };

  const restart = () => {
    setCleared(false);
    setPlaying(true);
    setRestartToken((value) => value + 1);
    setEditorSnapshot(null);
    setTelemetrySnapshot(null);
  };

  const openFormationWorkshop = () => {
    const spawn = selectedSpawnEvent ?? preview.previewWave.events.find((event): event is SpawnEvent => event.kind === 'spawn');
    if (!spawn) {
      notify('Choose a wave with an enemy formation encounter first', true);
      return;
    }
    setSelectedEventId(spawn.id);
    setSelectedPhaseId(null);
    setAuthoringMode('formation');
    setPlaying(false);
    setCleared(false);
    setMobilePanel('library');
  };

  const applyFormationTemplate = (template: FormationTemplate) => {
    if (!selectedSpawnEvent) return;
    const slots = template.slots.map((slot) => ({ ...slot }));
    updateSelectedEvent({
      ...selectedSpawnEvent,
      label: `${template.label} formation`,
      patternId: template.choreography,
      count: slots.length,
      durationSeconds: Math.max(
        selectedSpawnEvent.durationSeconds,
        Math.max(0, slots.length - 1) * selectedSpawnEvent.spawnIntervalSeconds
      ),
      formationSlots: slots
    });
    setPresetName(`${template.label} formation`);
  };

  const playFormation = () => {
    setAuthoringMode('playtest');
    setMobilePanel('tune');
    restart();
    notify('Playing the authored formation in the real game runtime');
  };

  const savePreset = () => {
    if (activeSandboxPrototype) {
      notify('Sandbox boss fixtures are immutable and cannot be saved as promotable presets', true);
      return;
    }
    const proposed = (authoringMode === 'formation' ? selectedSpawnEvent?.label.trim() : presetName.trim())
      || selectedItem?.name
      || selectedEvent?.label
      || preview.previewWave.name;
    try {
      const preset = createCombatLabPreset({
        name: proposed,
        sourceCampaign,
        preview,
        loadout,
        contentHash: initialState.contentHash
      }, { idFactory: (prefix) => `${prefix}-${Date.now().toString(36)}` });
      const next = [...presets.filter((item) => item.id !== preset.id), preset];
      persistPresets(next);
      setPresets(next);
      setActivePresetId(preset.id);
      setDeletePresetArmed(false);
      setPresetName(preset.name);
      setBaselinePreview(cloneCombatLabCampaign(preview));
      setBaselineLoadout(cloneLoadout(loadout));
      setDirty(false);
      notify(`Saved “${preset.name}” on this computer`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save preset', true);
    }
  };

  const loadPreset = (presetId: string) => {
    if (!presetId) return;
    if (!canDiscard()) return;
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    try {
      const next = createPreviewFromPreset(sourceCampaign, preset);
      setPreview(next);
      setBaselinePreview(cloneCombatLabCampaign(next));
      const nextLoadout = sanitizeLoadout(cloneLoadout(preset.loadout ?? DEFAULT_LOADOUT));
      setLoadout(nextLoadout);
      setBaselineLoadout(cloneLoadout(nextLoadout));
      setSelectedEventId(preset.source.eventId ?? preset.previewWave.events[0]?.id ?? null);
      setSelectedPhaseId(preset.focus.kind === 'boss-phase' ? preset.focus.phaseId : null);
      setSelectedItemId(null);
      setActivePresetId(preset.id);
      setActiveSandboxPrototype(null);
      setDeletePresetArmed(false);
      setSequenceActive(false);
      setSequenceIndex(0);
      setPresetName(preset.name);
      setDirty(false);
      setCleared(false);
      setPlaying(true);
      setRuntimeState(null);
      setDebugSnapshot(null);
      setEditorSnapshot(null);
      setRestartToken((value) => value + 1);
      notify(`Loaded “${preset.name}”`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load preset', true);
    }
  };

  const duplicatePreset = () => {
    const source = presets.find((item) => item.id === activePresetId);
    if (!source) {
      savePreset();
      return;
    }
    const duplicate = duplicateCombatLabPreset(source, undefined, { idFactory: (prefix) => `${prefix}-${Date.now().toString(36)}` });
    const next = [...presets, duplicate];
    persistPresets(next);
    setPresets(next);
    setActivePresetId(duplicate.id);
    setDeletePresetArmed(false);
    notify(`Duplicated as “${duplicate.name}”`);
  };

  const deletePreset = () => {
    if (!activePresetId) return;
    const preset = presets.find((item) => item.id === activePresetId);
    if (!preset) return;
    if (!deletePresetArmed) {
      setDeletePresetArmed(true);
      notify(`Click Confirm delete to remove “${preset.name}”`);
      return;
    }
    const next = presets.filter((item) => item.id !== activePresetId);
    persistPresets(next);
    setPresets(next);
    setActivePresetId('');
    setDeletePresetArmed(false);
    notify('Local preset deleted');
  };

  const exportCampaign = () => {
    if (activeSandboxPrototype) {
      notify('Sandbox boss fixtures cannot be exported as campaign JSON', true);
      return;
    }
    const validation = validateGameCampaign(preview.campaign);
    if (!validation.valid) {
      notify(`Export blocked: ${validation.issues[0].path} ${validation.issues[0].message}`, true);
      return;
    }
    const blob = new Blob([`${JSON.stringify(preview.campaign, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(selectedEvent?.label ?? preview.previewWave.name)}-combat-lab.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Exported a validated campaign experiment');
  };

  const promoteToLevelEditor = async () => {
    if (activeSandboxPrototype) {
      notify('Sandbox boss fixtures cannot be promoted or applied to the Mission Builder workspace', true);
      return;
    }
    try {
      const latestState = await fetchGameCampaign<GameCampaignConfig>();
      const event = selectedEvent ?? preview.previewWave.events[0];
      const result = promotionMode === 'event' && event
        ? createPromotionCampaign(latestState.campaign, {
          kind: 'event',
          targetLevelId: preview.levelId,
          targetWaveId: preview.waveId,
          event,
          startSeconds: event.startSeconds
        })
        : createPromotionCampaign(latestState.campaign, {
          kind: 'wave',
          targetLevelId: preview.levelId,
          wave: preview.previewWave,
          insertAfterWaveId: preview.waveId
        });
      const existingDraft = window.localStorage.getItem(LEVEL_EDITOR_DRAFT_KEY);
      if (existingDraft && !window.confirm('Replace the existing local Mission Builder draft with this Combat Lab promotion? The applied game will not change.')) return;
      window.localStorage.setItem(LEVEL_EDITOR_DRAFT_KEY, JSON.stringify({
        baseContentHash: latestState.contentHash,
        campaign: result.campaign,
        savedAt: new Date().toISOString(),
        source: 'combat-lab'
      }));
      allowNavigationRef.current = true;
      window.location.assign('/level-editor?from=combat-lab');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not prepare Mission Builder draft', true);
    }
  };

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    debugSnapshot?.entities.forEach((entity) => { counts[entity.type] = (counts[entity.type] ?? 0) + 1; });
    return counts;
  }, [debugSnapshot]);
  const hostileCount = Object.entries(eventCounts).filter(([type]) => /ENEMY|BOSS|ASTEROID|INVADER/.test(type)).reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="cl-shell">
      <header className="cl-topbar">
        <CombatLabMark />
        <div className="cl-brand"><strong>Combat Lab</strong><small>Real-runtime encounter workbench</small></div>
        <span className="cl-local-badge"><i />Local only</span>
        <div className="cl-topbar__context"><span>Source campaign</span><strong>{catalog.campaign.name} · revision {catalog.campaign.revision}</strong></div>
        <div className="cl-topbar__actions">
          <button className="cl-button cl-button--help" type="button" aria-label="How to use" aria-expanded={guideOpen} aria-controls="combat-lab-guide" onClick={() => setGuideOpen((open) => !open)}><EditorIcon name="review" /><span>How to use</span></button>
          <button className="cl-button cl-button--quiet" type="button" onClick={resetSelection}><EditorIcon name="undo" /><span>Reset</span></button>
          <button className="cl-button cl-button--quiet" type="button" disabled={Boolean(activeSandboxPrototype)} onClick={exportCampaign}><EditorIcon name="save" /><span>Export JSON</span></button>
          <a className="cl-button cl-button--cyan" href="/level-editor" aria-label="Open Mission Builder" onClick={guardNavigation}><EditorIcon name="forward" /><span>Mission Builder</span></a>
          <a className="cl-button cl-button--icon" href="/studio" aria-label="Open legacy Director" onClick={guardNavigation}>D</a>
        </div>
      </header>

      {guideOpen ? <CombatLabGuide onClose={() => setGuideOpen(false)} onReloadSource={reloadSource} /> : null}

      <main className="cl-workspace">
        <aside className={`cl-panel cl-library-panel${mobilePanel !== 'library' ? ' cl-mobile-off' : ''}`}>
          {authoringMode === 'formation' && selectedSpawnEvent ? (
            <FormationTemplateRail event={selectedSpawnEvent} onApply={applyFormationTemplate} />
          ) : (
            <CombatLabLibrary
              catalog={catalog}
              categoryId={selectedCategory}
              search={search}
              selectedItemId={selectedItemId}
              onCategoryChange={setSelectedCategory}
              onSearchChange={setSearch}
              onSelect={selectItem}
            />
          )}
        </aside>

        <section className="cl-stage-panel">
          <header className="cl-stage-heading">
            <div><p>Live simulation · PixiJS · shared engine</p><strong>{selectedEvent?.label ?? preview.previewWave.name}</strong></div>
            <nav className="cl-authoring-mode" aria-label="Combat Lab mode">
              <button type="button" className={authoringMode === 'playtest' ? 'is-selected' : ''} aria-pressed={authoringMode === 'playtest'} onClick={() => setAuthoringMode('playtest')}><EditorIcon name="play" /> Playtest</button>
              <button type="button" className={authoringMode === 'formation' ? 'is-selected' : ''} aria-pressed={authoringMode === 'formation'} onClick={openFormationWorkshop}><EditorIcon name="edit" /> Formation Workshop</button>
              <a href="/level-editor" onClick={guardNavigation}><EditorIcon name="review" /> Mission Builder</a>
            </nav>
            <div className="cl-stage-heading__status">
              <span className={`cl-unsaved${dirty || activeSandboxPrototype ? '' : ' is-saved'}`}>
                {activeSandboxPrototype ? 'Sandbox prototype' : dirty ? 'Unsaved experiment' : 'Catalog baseline'}
              </span>
            </div>
          </header>

          {sandboxPrototypeSurface ? (
            <SandboxBossPrototypePicker
              activePrototypeId={activeSandboxPrototype?.prototypeId ?? null}
              onSelect={selectSandboxBossPrototype}
            />
          ) : null}

          <div className="cl-device-toolbar" aria-label="Preview screen controls">
            <div className="cl-device-toolbar__group">
              <label htmlFor="combat-lab-device">Preview screen</label>
              <select id="combat-lab-device" value={previewDeviceId} onChange={(input) => setPreviewDeviceId(input.target.value as PreviewDeviceId)}>
                {PREVIEW_DEVICES.map((device) => <option value={device.id} key={device.id}>{device.label} · {device.width}×{device.height}</option>)}
              </select>
            </div>
            <button className="cl-button" type="button" onClick={() => setPreviewLandscape((landscape) => !landscape)} aria-label="Rotate preview orientation"><EditorIcon name="restart" /><span>Rotate</span></button>
            {authoringMode === 'playtest' ? <div className="cl-device-toolbar__group cl-device-toolbar__group--scale">
              <label htmlFor="combat-lab-scale">Zoom</label>
              <select id="combat-lab-scale" value={previewScaleMode} onChange={(input) => setPreviewScaleMode(input.target.value as PreviewScaleMode)}>
                <option value="fit">Fit screen</option>
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
              </select>
            </div> : null}
            <output className="cl-device-readout" aria-live="polite">{previewDimensions.width}×{previewDimensions.height}{authoringMode === 'playtest' ? ` · ${previewScalePercent}%` : ' · design grid'}</output>
          </div>

          {authoringMode === 'formation' && selectedSpawnEvent ? (
            <div className="cl-game-area cl-game-area--formation" ref={previewHostRef}>
              <FormationDesignBoard event={selectedSpawnEvent} viewport={previewDimensions} onChange={updateSelectedEvent} onPlay={playFormation} />
            </div>
          ) : (
            <div className="cl-game-area" ref={previewHostRef}>
              <div className="cl-game-scale-box" style={{ width: `${Math.ceil(previewDimensions.width * previewScale)}px`, height: `${Math.ceil(previewDimensions.height * previewScale)}px` }}>
                <div
                  className="cl-game-frame cl-game-frame--device"
                  data-preview-device={previewDevice.id}
                  style={{ width: `${previewDimensions.width}px`, height: `${previewDimensions.height}px`, transform: `scale(${previewScale})` }}
                >
                  <GameEditorCanvas
                    key={`${canvasKey}:${restartToken}`}
                    campaign={preview.campaign}
                    levelId={preview.levelId}
                    waveId={preview.waveId}
                    playing={playing && !cleared}
                    restartToken={restartToken}
                    previewSettings={previewSettings}
                    previewViewport={previewDimensions}
                    previewCommand={previewCommand}
                    onPreviewCommandResult={handlePreviewCommandResult}
                    onPlayingChange={setPlaying}
                    onRuntimeState={setRuntimeState}
                    onDebugSnapshot={setDebugSnapshot}
                    onEditorSnapshot={setEditorSnapshot}
                    onTelemetrySnapshot={setTelemetrySnapshot}
                  />
                  {cleared ? <div className="cl-preview-cleared">Wave cleared</div> : null}
                  {(showBounds || showNames) && editorSnapshot ? (
                    <div className="cl-bounds-overlay" aria-hidden="true">
                      {editorSnapshot.entities.map((entity) => {
                        const collisionBounds = (entity as typeof entity & { collisionBounds?: typeof entity.bounds }).collisionBounds;
                        const bounds = useCollisionBounds && collisionBounds ? collisionBounds : entity.bounds;
                        return (
                          <div
                            key={entity.id}
                            className={`cl-bound${useCollisionBounds ? ' cl-bound--collision' : ''}${!showBounds ? ' cl-bound--names-only' : ''}`}
                            style={{ left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }}
                          >
                            {showNames ? <span>{entity.sourceItemId ?? entity.sourceEventId ?? entity.type}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {authoringMode === 'playtest' ? <div className="cl-preview-controls">
            <button className="cl-button cl-button--cyan" type="button" aria-label={playing && !cleared ? 'Pause preview' : 'Play preview'} onClick={() => { setCleared(false); setPreviewPlaying(!(playing && !cleared)); }}><EditorIcon name={playing && !cleared ? 'pause' : 'play'} /><span>{playing && !cleared ? 'Pause' : 'Play'}</span></button>
            <button className="cl-button" type="button" aria-label="Restart preview" onClick={restart}><EditorIcon name="restart" /><span>Restart</span></button>
            <button className="cl-button" type="button" aria-label="Clear preview" onClick={() => { setSequenceActive(false); setSequenceIndex(0); setCleared(true); setPlaying(false); setRestartToken((value) => value + 1); setEditorSnapshot(null); setDebugSnapshot(null); setTelemetrySnapshot(null); }}><EditorIcon name="delete" /><span>Clear</span></button>
            <button className="cl-button" type="button" disabled={!selectedEvent} onClick={spawnSelectedEventNow}><EditorIcon name="play" /><span>Spawn now</span></button>
            <button className="cl-button" type="button" onClick={fastForwardFiveSeconds}><span>+5 seconds</span></button>
            {selectedEvent?.kind === 'boss' ? (
              <button className="cl-button" type="button" disabled={!selectedPhaseId} onClick={jumpToSelectedBossPhase}><EditorIcon name="boss" /><span>Jump phase</span></button>
            ) : null}
            <select className="cl-speed-select" aria-label="Simulation speed" value={gameSpeed} onChange={(input) => updateGameSpeed(Number(input.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select>
            <Toggle label="Invincible" pressed={invincible} onChange={updateInvincibility} />
            <Toggle label="Bounds" pressed={showBounds} onChange={setShowBounds} />
            <Toggle label="Collision" pressed={useCollisionBounds} onChange={(value) => { setUseCollisionBounds(value); if (value) setShowBounds(true); }} />
            <Toggle label="Names" pressed={showNames} onChange={setShowNames} />
            <label className="cl-seed-control">
              <span>Seed</span>
              <input
                value={seedDraft}
                maxLength={128}
                onChange={(input) => setSeedDraft(input.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') applyPreviewSeed(); }}
                aria-label="Deterministic preview seed"
              />
              <button type="button" onClick={applyPreviewSeed}>Apply</button>
            </label>
          </div> : null}

          <nav className="cl-mobile-tabs" aria-label="Combat Lab mobile panels">
            {(['library', 'waves', 'tune'] as const).map((panel) => <button type="button" key={panel} className={mobilePanel === panel ? 'is-selected' : ''} onClick={() => setMobilePanel(panel)}>{panel === 'library' ? (authoringMode === 'formation' ? 'Build' : 'Library') : panel === 'waves' ? 'Timeline' : 'Tune'}</button>)}
          </nav>

          <section className={`cl-wave-section${mobilePanel === 'waves' ? ' cl-mobile-current' : ' cl-mobile-off'}`}>
            <header>
              <div><p>Mission wave sequence</p><span>{selectedLevel?.name ?? 'Mission'} · {sequenceActive ? `${sequenceIndex + 1}/${queuedWaves.length} running` : `${queuedWaves.length} selected`}</span></div>
              <div className="cl-wave-sequence-actions">
                <button type="button" aria-label="Previous wave" disabled={selectedWaveIndex <= 0} onClick={() => selectAdjacentWave(-1)}>‹</button>
                <button type="button" className="is-primary" disabled={queuedWaves.length === 0} onClick={playQueuedWaves}>{sequenceActive ? 'Running' : 'Run selected'}</button>
                <button type="button" disabled={!selectedLevel} onClick={runFullMission}>Run Mission</button>
                <button type="button" disabled={queuedWaves.length === 0} onClick={restartWaveSequence}>Restart sequence</button>
                <button type="button" aria-label="Next wave" disabled={!selectedLevel || selectedWaveIndex < 0 || selectedWaveIndex >= selectedLevel.waves.length - 1} onClick={() => selectAdjacentWave(1)}>›</button>
              </div>
            </header>
            <div className="cl-wave-pickers">
              <label>
                <span>Mission</span>
                <select value={selectedLevel?.id ?? ''} onChange={(input) => selectMission(input.target.value)}>
                  {missionOptions.map((level) => <option value={level.id} key={level.id}>{level.order}. {level.name}</option>)}
                </select>
              </label>
              <label>
                <span>Wave</span>
                <select value={preview.waveId} onChange={(input) => selectedLevel && selectWave(selectedLevel.id, input.target.value)}>
                  {selectedLevel?.waves.slice().sort((left, right) => left.order - right.order).map((wave) => <option value={wave.id} key={wave.id}>{wave.order}. {wave.name}</option>)}
                </select>
              </label>
              <label>
                <span>Jump to checkpoint</span>
                <select value="" disabled={checkpointOptions.length === 0} onChange={(input) => jumpToCheckpoint(input.target.value)}>
                  <option value="">{checkpointOptions.length ? 'Elite unit, elite enemy, or boss…' : 'No checkpoints in this Mission'}</option>
                  {checkpointOptions.map((checkpoint) => <option value={checkpoint.id} key={checkpoint.id}>{checkpoint.label}</option>)}
                </select>
              </label>
            </div>
            <div className="cl-wave-strip">
              {selectedLevel?.waves.map((wave) => (
                <div className="cl-wave-choice" key={wave.id}>
                  <button type="button" className={wave.id === preview.waveId ? 'is-selected' : ''} style={{ '--wave-accent': wave.accent } as React.CSSProperties} onClick={() => selectWave(selectedLevel.id, wave.id)}><strong>{wave.order}. {wave.name}</strong><small>{wave.events.length} events · {wave.durationSeconds}s</small></button>
                  <label><input type="checkbox" aria-label={`Include ${wave.name} in selected wave sequence`} checked={sequenceLevelId === selectedLevel.id && queuedWaveIds.includes(wave.id)} onChange={(input) => toggleQueuedWave(wave.id, input.target.checked)} /><span>Sequence</span></label>
                </div>
              ))}
            </div>
            <div className="cl-wave-strip" style={{ marginTop: 6 }}>
              {preview.previewWave.events.map((event, index) => <button type="button" key={event.id} className={event.id === selectedEvent?.id ? 'is-selected' : ''} style={{ '--wave-accent': preview.previewWave.accent } as React.CSSProperties} onClick={() => selectEvent(event)}><strong>{index + 1}. {event.label}</strong><small>{event.kind} · {event.startSeconds}s</small></button>)}
            </div>
          </section>

          <div className="cl-telemetry">
            <div><span>Runtime</span><strong>{runtimeState?.complete ? 'Complete' : playing ? 'Running' : 'Paused'}</strong></div>
            <div><span>Wave clock</span><strong>{runtimeState ? `${runtimeState.elapsedSeconds.toFixed(1)} / ${runtimeState.durationSeconds.toFixed(0)}s` : 'Starting…'}</strong></div>
            <div><span>Live threats</span><strong>{hostileCount}</strong></div>
            <div><span>Difficulty</span><strong>{debugSnapshot ? `${debugSnapshot.difficultyMultiplier.toFixed(2)}×` : '—'}</strong></div>
            <div><span>DPS</span><strong>{calculateCombatLabDps(telemetrySnapshot).toFixed(1)}</strong></div>
            <div><span>Damage dealt / taken</span><strong>{telemetrySnapshot ? `${Math.round(telemetrySnapshot.aggregate.damageDealt)} / ${Math.round(telemetrySnapshot.aggregate.damageTaken)}` : '0 / 0'}</strong></div>
            <div><span>Deaths / boss phases</span><strong>{telemetrySnapshot ? `${telemetrySnapshot.aggregate.playerDeaths} / ${telemetrySnapshot.aggregate.bossPhaseTransitions}` : '0 / 0'}</strong></div>
            <div className="cl-telemetry__save">
              <span>{telemetrySnapshot?.aggregate.recordedEventCount ?? 0} bounded events</span>
              <button type="button" disabled={savingSession} onClick={() => void saveCurrentPlaytest()}>
                {savingSession ? 'Saving…' : 'Save session'}
              </button>
              <a href="/analytics">Analytics</a>
            </div>
          </div>
        </section>

        <aside className={`cl-panel cl-inspector-panel${mobilePanel !== 'tune' ? ' cl-mobile-off' : ''}`}>
          {authoringMode === 'formation' && selectedSpawnEvent ? (
            <FormationWorkshopInspector
              event={selectedSpawnEvent}
              viewport={previewDimensions}
              onChange={updateSelectedEvent}
              onSave={savePreset}
              onPromote={promoteToLevelEditor}
              promotionMode={promotionMode}
              onPromotionModeChange={setPromotionMode}
              formationPack={selectedFormationPack}
            />
          ) : <>
            <header className="cl-panel-heading"><div><p>Safe live edits</p><strong>Tuning inspector</strong></div><span>{selectedEvent ? selectedEvent.kind : 'No event'}</span></header>
            <div className="cl-inspector-scroll">
              <ShipSetup loadout={loadout} onChange={updateLoadout} />
              <CombatLabInspector
                event={selectedEvent}
                selectedPhaseId={selectedPhaseId}
                onSelectedPhaseIdChange={setSelectedPhaseId}
                onChange={updateSelectedEvent}
                onReset={resetSelection}
                onReplay={restart}
                formationPack={selectedFormationPack}
              />
              {activeSandboxPrototype && activeSandboxDescriptor ? (
                <section className="cl-sandbox-provenance" role="note">
                  <header>
                    <strong>Sandbox-only provenance</strong>
                    <span>Frozen definition</span>
                  </header>
                  <p>{activeSandboxDescriptor.description}</p>
                  <ul>
                    {activeSandboxDescriptor.designIntent.map((intent) => <li key={intent}>{intent}</li>)}
                  </ul>
                  <code>{activeSandboxPrototype.prototypeHash}</code>
                  <code>{activeSandboxPrototype.previewHash}</code>
                  <small>This run is editable in memory and resets to its frozen definition. Preset save, campaign export, Mission Builder promotion, and workspace apply are disabled.</small>
                </section>
              ) : null}
              {selectedItem ? (
                <details className="cl-source-card">
                  <summary>Source-backed metadata</summary>
                  <p>{selectedItem.description}</p>
                  {selectedItem.sourceRefs.slice(0, 5).map((ref, index) => <code key={`${ref.path}-${index}`}>{ref.path}{ref.symbol ? ` · ${ref.symbol}` : ''}{ref.eventId ? ` · ${ref.eventId}` : ''}</code>)}
                </details>
              ) : null}
            </div>
            <footer className="cl-inspector-footer">
              {activeSandboxPrototype ? (
                <div className="cl-sandbox-footer-lock" role="note">
                  <div>
                    <strong>Sandbox-only run</strong>
                    <span>Save, export, and promotion stay locked. Reset restores the frozen definition.</span>
                  </div>
                  <button className="cl-button" type="button" onClick={resetSelection}><EditorIcon name="undo" /> Reset</button>
                </div>
              ) : (
                <>
                  <input className="cl-preset-name" value={presetName} maxLength={80} onChange={(input) => setPresetName(input.target.value)} aria-label="Preset name" placeholder="Name this experiment" />
                  <select className="cl-preset-select" value={activePresetId} onChange={(input) => loadPreset(input.target.value)} aria-label="Saved Combat Lab presets"><option value="">{presets.length ? `${presets.length} local presets…` : 'No local presets yet'}</option>{presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}</select>
                  <div className="cl-inspector-footer__row">
                    <button className="cl-button" type="button" onClick={savePreset}><EditorIcon name="save" /> Save preset</button>
                    <button className="cl-button" type="button" onClick={duplicatePreset}><EditorIcon name="copy" /> Duplicate</button>
                    <button className="cl-button" type="button" onClick={deletePreset} disabled={!activePresetId}><EditorIcon name="delete" /> {deletePresetArmed ? 'Confirm delete' : 'Delete'}</button>
                    <button className="cl-button" type="button" onClick={exportCampaign}><EditorIcon name="save" /> Export JSON</button>
                  </div>
                  <select className="cl-preset-select" value={promotionMode} onChange={(input) => setPromotionMode(input.target.value as PromotionMode)} aria-label="Promotion mode"><option value="event">Add selected encounter to this wave</option><option value="wave">Add experiment as a new wave</option></select>
                  <p className="cl-promotion-note"><strong>Draft only:</strong> the normal game stays unchanged until you review it and choose <b>Apply to game</b> in Mission Builder.</p>
                  <button className="cl-button cl-button--amber" type="button" onClick={promoteToLevelEditor}><EditorIcon name="forward" /> Review draft in Mission Builder</button>
                </>
              )}
            </footer>
          </>}
        </aside>
      </main>
      {notice ? <div className={`cl-toast${notice.error ? ' cl-toast--error' : ''}`} role="status">{notice.message}</div> : null}
    </div>
  );
}

export default function CombatLabApp() {
  const [state, setState] = useState<GameCampaignDiskState<GameCampaignConfig> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGameCampaign<GameCampaignConfig>()
      .then((result) => { if (!cancelled) setState(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not open the game campaign'); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="cl-shell cl-load-error"><div><strong>Combat Lab could not start</strong><p>{error}</p><button className="cl-button cl-button--cyan" type="button" onClick={() => window.location.reload()}>Try again</button></div></div>;
  if (!state) return <div className="cl-shell cl-loading"><div><i />Loading real campaign content…</div></div>;
  return <Workspace initialState={state} />;
}
