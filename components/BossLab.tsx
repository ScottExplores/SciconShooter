import React, { useMemo, useState } from 'react';
import { GAME_CONFIG } from '../constants';
import { BASE_FLASK_CHARGE_MAX } from '../services/flaskProgress';
import { getPrimaryAssetPath } from '../services/levelConfig';
import { listBossLabEncounters, BOSS_LAB_PREVIEW_SEED } from '../services/gameplay/bossLab';
import { PLAYER_SHIPS } from '../services/playerShipService';
import { FieldUpgradeType, PowerupType, type GamePolishSettings, type Stats } from '../types';
import GameStage from './GameStage';
import './boss-lab.css';

const POLISH_SETTINGS: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
};
const PLAYER_SHIP_ID = 'researchhub' as const;
const SPEED_OPTIONS = [0.5, 1, 2] as const;

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
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 16 * 60,
  lives: Math.max(1, Math.min(GAME_CONFIG.MAX_LIVES, GAME_CONFIG.PLAYER_LIVES)),
  repairsCount: 0,
  upgrades: {
    fireRate: 2,
    speed: 1,
    ability: 0
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

const BossLab: React.FC = () => {
  const encounters = useMemo(() => listBossLabEncounters(), []);
  const [encounterId, setEncounterId] = useState(encounters[0]?.id ?? '');
  const [invincible, setInvincible] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [restartToken, setRestartToken] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [stats, setStats] = useState<Stats>(createPreviewStats);
  const [bombCommand, setBombCommand] = useState<{ nonce: number } | null>(null);
  const [shipAbilityCommand, setShipAbilityCommand] = useState<{ nonce: number } | null>(null);
  const encounter = encounters.find((entry) => entry.id === encounterId) ?? encounters[0];

  if (!encounter) {
    return <p className="scicon-boss-lab">No boss encounters are configured.</p>;
  }

  const campaignEncounters = encounters.filter((entry) => entry.group === 'campaign');
  const sandboxEncounters = encounters.filter((entry) => entry.group === 'sandbox');

  return (
    <div className="scicon-boss-lab">
      <form className="scicon-boss-lab__bar" onSubmit={(event) => event.preventDefault()}>
        <label className="scicon-boss-lab__encounter">
          Encounter
          <select
            aria-label="Boss encounter"
            value={encounter.id}
            onChange={(event) => {
              setEncounterId(event.target.value);
              setStats(createPreviewStats());
              setPlaying(true);
              setRestartToken((token) => token + 1);
            }}
          >
            <optgroup label="Campaign">
              {campaignEncounters.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </optgroup>
            <optgroup label="Sandbox">
              {sandboxEncounters.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={invincible}
            onChange={(event) => setInvincible(event.target.checked)}
          />
          Invincible
        </label>
        <label>
          Speed
          <select
            aria-label="Fight speed"
            value={String(speed)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (next === 0.5 || next === 1 || next === 2) setSpeed(next);
            }}
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}×</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setStats(createPreviewStats());
            setPlaying(true);
            setRestartToken((token) => token + 1);
          }}
        >
          Restart fight
        </button>
      </form>
      <div className="scicon-boss-lab__stage">
        <GameStage
          key={`${encounter.id}:${restartToken}`}
          canvas={{
            stats,
            onStatsChange: setStats,
            running: playing,
            polishSettings: POLISH_SETTINGS,
            campaign: encounter.campaign,
            levelId: encounter.levelId,
            waveId: encounter.waveId,
            previewMode: true,
            previewInvincible: invincible,
            audioEnabled: true,
            autoFire: true,
            timeScale: speed,
            previewBossArtwork: encounter.artwork,
            previewSeed: BOSS_LAB_PREVIEW_SEED,
            playerShipId: PLAYER_SHIP_ID,
            playerShipUrl: PLAYER_SHIPS[PLAYER_SHIP_ID].assetUrl,
            restartToken,
            bombCommand,
            shipAbilityCommand
          }}
          hud={{
            showLabGlow: false,
            onDisableLabGlow: () => undefined,
            paused: !playing,
            onPause: () => setPlaying((current) => !current),
            onUseBomb: () => setBombCommand({ nonce: Date.now() }),
            selectedShipId: PLAYER_SHIP_ID,
            onUseShipAbility: () => setShipAbilityCommand({ nonce: Date.now() }),
            shipAbilityLocked: !playing,
            onUpgrade: (_type: FieldUpgradeType) => undefined,
            fieldUpgradesEnabled: false,
            bombIconSrc: getPrimaryAssetPath(encounter.campaign.hudAssets.bombIconAssetKey),
            bombLocked: false
          }}
        />
      </div>
    </div>
  );
};

export default BossLab;
