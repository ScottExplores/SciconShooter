import React, { useCallback, useEffect, useState } from 'react';
import type { GameCampaign } from '../game-config/types';
import { FIELD_UPGRADE_CONFIG, GAME_CONFIG, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from '../constants';
import { BASE_FLASK_CHARGE_MAX, getFlaskProgress, spendStoredFlasks } from '../services/flaskProgress';
import type { GameEditorSnapshot, GameEngineDebugSnapshot, GameRuntimeState } from '../services/gameLogic';
import { getPrimaryAssetPath } from '../services/levelConfig';
import { PLAYER_SHIPS, type PlayerShipId } from '../services/playerShipService';
import type { RuntimeSquadLoadout } from '../services/squadProgression';
import type { GameplayRandomSeed } from '../services/gameplay/random';
import type { GameplayTelemetrySnapshot } from '../services/gameplay/telemetry';
import type {
  PreviewCommand,
  PreviewCommandResult,
  PreviewSnapshot
} from '../services/gameplay/previewSession';
import type { PreviewBossArtwork } from '../services/pixi/PixiGameRenderer';
import { FieldUpgradeType, PowerupType, type GamePolishSettings, type Stats } from '../types';
import GameStage from './GameStage';

export type { GameEditorEntitySnapshot, GameEditorSnapshot } from '../services/gameLogic';

const EDITOR_POLISH_SETTINGS: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
};
const DEFAULT_EDITOR_PREVIEW_SEED = 'scicon-director-preview';

export interface GameEditorPreviewSettings {
  playerShipId?: PlayerShipId;
  squadLoadout?: RuntimeSquadLoadout;
  gameSpeed?: number;
  invinciblePlayer?: boolean;
  unlimitedBombs?: boolean;
  shipAbilityNoCooldown?: boolean;
  startingLives?: number;
  upgrades?: Partial<Stats['upgrades']>;
  seed?: GameplayRandomSeed;
}

const createPreviewStats = (settings: GameEditorPreviewSettings = {}): Stats => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: BASE_FLASK_CHARGE_MAX,
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 16 * 60,
  lives: Math.max(1, Math.min(GAME_CONFIG.MAX_LIVES, Math.floor(settings.startingLives ?? 3))),
  repairsCount: 0,
  upgrades: {
    fireRate: settings.upgrades?.fireRate ?? 2,
    speed: settings.upgrades?.speed ?? 1,
    ability: settings.upgrades?.ability ?? 0
  },
  powerupUses: {
    [PowerupType.DOUBLE_SHOT]: 0,
    [PowerupType.TRIPLE_SHOT]: 0,
    [PowerupType.OVERDRIVE]: 0,
    [PowerupType.MAX_SHOT]: 0,
    [PowerupType.MAGNET]: 0,
    [PowerupType.SHIELD]: 0,
    [PowerupType.EXTRA_LIFE]: 0,
    [PowerupType.RESEARCH_BEAM]: 0
  },
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

export interface GameEditorCanvasProps {
  campaign: GameCampaign;
  levelId: string;
  waveId: string;
  playing: boolean;
  restartToken: number;
  onRuntimeState?: (state: GameRuntimeState) => void;
  onDebugSnapshot?: (snapshot: GameEngineDebugSnapshot) => void;
  onEditorSnapshot?: (snapshot: GameEditorSnapshot) => void;
  onTelemetrySnapshot?: (snapshot: GameplayTelemetrySnapshot) => void;
  onPlayingChange?: (playing: boolean) => void;
  previewCommand?: PreviewCommand | null;
  onPreviewCommandResult?: (result: PreviewCommandResult) => void;
  onPreviewSnapshot?: (snapshot: PreviewSnapshot) => void;
  previewSettings?: GameEditorPreviewSettings;
  previewViewport?: Readonly<{ width: number; height: number }>;
  previewBossArtwork?: PreviewBossArtwork;
  /** Preview sound effects are opt-in; production audio defaults are unchanged. */
  audioEnabled?: boolean;
  fieldUpgradesEnabled?: boolean;
  onReady?: () => void;
  onInitializationError?: (error: unknown) => void;
}

export const GameEditorCanvas: React.FC<GameEditorCanvasProps> = ({
  campaign,
  levelId,
  waveId,
  playing,
  restartToken,
  onRuntimeState,
  onDebugSnapshot,
  onEditorSnapshot,
  onTelemetrySnapshot,
  onPlayingChange,
  previewCommand = null,
  onPreviewCommandResult,
  onPreviewSnapshot,
  previewSettings = {},
  previewViewport,
  previewBossArtwork,
  audioEnabled = false,
  fieldUpgradesEnabled = true,
  onReady,
  onInitializationError
}) => {
  const [stats, setStats] = useState<Stats>(() => createPreviewStats(previewSettings));
  const [bombCommand, setBombCommand] = useState<{ nonce: number } | null>(null);
  const [shipAbilityCommand, setShipAbilityCommand] = useState<{ nonce: number } | null>(null);

  useEffect(() => {
    const fireRate = previewSettings.upgrades?.fireRate ?? 2;
    const speed = previewSettings.upgrades?.speed ?? 1;
    setStats((previous) => {
      if (
        previous.upgrades.fireRate === fireRate
        && previous.upgrades.speed === speed
      ) {
        return previous;
      }
      return {
        ...previous,
        upgrades: {
          ...previous.upgrades,
          fireRate,
          speed
        }
      };
    });
  }, [
    previewSettings.upgrades?.fireRate,
    previewSettings.upgrades?.speed
  ]);

  const handlePreviewUpgrade = useCallback((type: FieldUpgradeType) => {
    setStats((previous) => {
      const chargeMax = previous.bombChargeMax || BASE_FLASK_CHARGE_MAX;
      const flaskCount = getFlaskProgress(previous.bombCharge || 0, chargeMax).storedFlasks;
      const flaskCost = getFieldUpgradeFlaskCost(previous, type);
      const config = FIELD_UPGRADE_CONFIG[type];
      const level = getFieldUpgradeLevel(previous, type);
      const isLifeUpgrade = type === 'extraLife';
      const isAtCap = isLifeUpgrade
        ? previous.lives >= GAME_CONFIG.MAX_LIVES
        : level >= config.maxLevel;

      if (flaskCount < flaskCost || isAtCap) return previous;

      const bombCharge = spendStoredFlasks(previous.bombCharge || 0, flaskCost, chargeMax);
      if (isLifeUpgrade) {
        return {
          ...previous,
          bombCharge,
          lives: Math.min(GAME_CONFIG.MAX_LIVES, previous.lives + 1),
          repairsCount: (previous.repairsCount || 0) + 1
        };
      }

      return {
        ...previous,
        bombCharge,
        upgrades: {
          ...previous.upgrades,
          [type]: previous.upgrades[type] + 1
        }
      };
    });
  }, []);

  const hasStoredFlask = getFlaskProgress(
    stats.bombCharge || 0,
    stats.bombChargeMax || BASE_FLASK_CHARGE_MAX
  ).storedFlasks > 0;
  const playerShipId = previewSettings.playerShipId ?? 'researchhub';

  return (
    <GameStage
      className={previewViewport && previewViewport.width < 640 ? 'scicon-game-stage--compact-preview' : ''}
      canvas={{
        stats,
        onStatsChange: setStats,
        running: playing,
        polishSettings: EDITOR_POLISH_SETTINGS,
        campaign,
        levelId,
        waveId,
        previewMode: true,
        previewInvincible: previewSettings.invinciblePlayer ?? true,
        previewUnlimitedBombs: previewSettings.unlimitedBombs ?? false,
        previewShipAbilityNoCooldown: previewSettings.shipAbilityNoCooldown ?? false,
        previewStartingLives: previewSettings.startingLives ?? GAME_CONFIG.PLAYER_LIVES,
        previewViewport,
        previewBossArtwork,
        previewSeed: previewSettings.seed ?? DEFAULT_EDITOR_PREVIEW_SEED,
        previewCommand,
        onPreviewPlayingChange: onPlayingChange,
        onPreviewCommandResult,
        onPreviewSnapshot,
        audioEnabled,
        autoFire: true,
        timeScale: previewSettings.gameSpeed ?? 1,
        playerShipId,
        playerShipUrl: PLAYER_SHIPS[playerShipId].assetUrl,
        squadLoadout: previewSettings.squadLoadout,
        restartToken,
        bombCommand,
        shipAbilityCommand,
        onRuntimeState,
        onDebugSnapshot,
        onEditorSnapshot,
        onTelemetrySnapshot,
        onReady,
        onInitializationError
      }}
      hud={{
        showLabGlow: false,
        onDisableLabGlow: () => undefined,
        isUpgradeReady: hasStoredFlask,
        paused: !playing,
        onPause: () => onPlayingChange?.(!playing),
        onUseBomb: () => setBombCommand({ nonce: Date.now() }),
        selectedShipId: playerShipId,
        onUseShipAbility: () => setShipAbilityCommand({ nonce: Date.now() }),
        shipAbilityLocked: !playing,
        onUpgrade: handlePreviewUpgrade,
        fieldUpgradesEnabled,
        bombIconSrc: getPrimaryAssetPath(campaign.hudAssets.bombIconAssetKey),
        bombLocked: false,
        unlimitedBombs: previewSettings.unlimitedBombs ?? false
      }}
    />
  );
};

export default GameEditorCanvas;
