import React, { useCallback, useState } from 'react';
import type { GameCampaign } from '../game-config/types';
import { FIELD_UPGRADE_CONFIG, GAME_CONFIG, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from '../constants';
import { BASE_FLASK_CHARGE_MAX, getFlaskProgress, spendStoredFlasks } from '../services/flaskProgress';
import type { GameEditorSnapshot, GameRuntimeState } from '../services/gameLogic';
import { getPrimaryAssetPath } from '../services/levelConfig';
import { FieldUpgradeType, PowerupType, type GamePolishSettings, type Stats } from '../types';
import GameStage from './GameStage';

export type { GameEditorEntitySnapshot, GameEditorSnapshot } from '../services/gameLogic';

const EDITOR_POLISH_SETTINGS: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
};

const createPreviewStats = (): Stats => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: BASE_FLASK_CHARGE_MAX,
  lives: 3,
  repairsCount: 0,
  upgrades: { fireRate: 2, speed: 1, missile: 0 },
  powerupUses: {
    [PowerupType.DOUBLE_SHOT]: 0,
    [PowerupType.TRIPLE_SHOT]: 0,
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
  onEditorSnapshot?: (snapshot: GameEditorSnapshot) => void;
  onPlayingChange?: (playing: boolean) => void;
}

export const GameEditorCanvas: React.FC<GameEditorCanvasProps> = ({
  campaign,
  levelId,
  waveId,
  playing,
  restartToken,
  onRuntimeState,
  onEditorSnapshot,
  onPlayingChange
}) => {
  const [stats, setStats] = useState<Stats>(createPreviewStats);
  const [bombCommand, setBombCommand] = useState<{ nonce: number } | null>(null);

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

  return (
    <GameStage
      canvas={{
        stats,
        onStatsChange: setStats,
        running: playing,
        polishSettings: EDITOR_POLISH_SETTINGS,
        campaign,
        levelId,
        waveId,
        previewMode: true,
        audioEnabled: false,
        autoFire: true,
        restartToken,
        bombCommand,
        onRuntimeState,
        onEditorSnapshot
      }}
      hud={{
        showLabGlow: false,
        onDisableLabGlow: () => undefined,
        isUpgradeReady: hasStoredFlask,
        paused: !playing,
        onPause: () => onPlayingChange?.(!playing),
        onUseBomb: () => setBombCommand({ nonce: Date.now() }),
        onUpgrade: handlePreviewUpgrade,
        bombIconSrc: getPrimaryAssetPath(campaign.hudAssets.bombIconAssetKey),
        bombLocked: false,
        muted: true,
        onToggleMute: () => true
      }}
    />
  );
};

export default GameEditorCanvas;
