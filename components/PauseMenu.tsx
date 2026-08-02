import React from 'react';
import type { GamePolishSettings } from '../types';
import PixelActionButton from './PixelActionButton';
import AudioSettingsControls from './AudioSettingsControls';
import '../styles/pause-menu.css';

interface PauseMenuProps {
  audioMuted: boolean;
  missionNumber: number;
  missionName: string;
  waveNumber: number;
  waveTotal: number;
  sfxVolumeLevel: number;
  musicVolumeLevel: number;
  polishSettings: GamePolishSettings;
  onResume: () => void;
  onQuit: () => void;
  onToggleAudio: () => void;
  onSfxVolumeChange: (level: number) => void;
  onMusicVolumeChange: (level: number) => void;
  onTogglePolishSetting: (key: keyof GamePolishSettings) => void;
  quitLabel?: string;
  quitWarning?: string;
  founderControls?: React.ReactNode;
}

const INTERFACE_ROOT = '/game-art/generated/ui/scicon-interface-pack-v1';
interface PauseSettingRowProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  kind?: 'audio' | 'controls';
}

const PauseSettingRow: React.FC<PauseSettingRowProps> = ({ label, enabled, onToggle, kind = 'controls' }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={enabled}
    aria-label={`${label}: ${enabled ? 'on' : 'off'}`}
    className={`sci-pause-setting sci-pause-setting--${kind}`}
  >
    <span className="sci-pause-setting__label">{label}</span>
    <span
      className={`sci-pause-setting__toggle ${enabled ? 'sci-pause-setting__toggle--on' : ''}`}
      aria-hidden="true"
    >
      <span className="sci-pause-setting__toggle-track" />
      <span className="sci-pause-setting__toggle-knob" />
      <span className="sci-pause-setting__toggle-copy">{enabled ? 'ON' : 'OFF'}</span>
    </span>
  </button>
);

const PauseMenu: React.FC<PauseMenuProps> = ({
  audioMuted,
  missionNumber,
  missionName,
  waveNumber,
  waveTotal,
  sfxVolumeLevel,
  musicVolumeLevel,
  polishSettings,
  onResume,
  onQuit,
  onToggleAudio,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onTogglePolishSetting,
  quitLabel = 'Exit Run',
  quitWarning,
  founderControls
}) => (
  <div className="sci-pause-overlay">
    <div className="sci-pause-overlay__grid" aria-hidden="true"></div>
    <div className="sci-pause-scroll custom-scrollbar">
      <section className="sci-pause-shell" aria-labelledby="mission-pause-title">
        <div className="sci-pause-shell__scan" aria-hidden="true"></div>
        <div className="sci-pause-content">
          <header className="sci-pause-header">
            <img src={`${INTERFACE_ROOT}/icons/system/pause.png`} alt="" aria-hidden="true" />
            <div>
              <p>Scicon flight control</p>
              <h2 id="mission-pause-title">Mission Paused</h2>
            </div>
          </header>

          <div
            className="sci-pause-mission-position"
            aria-label={`Mission ${missionNumber}, ${missionName}, wave ${waveNumber} of ${waveTotal}`}
          >
            <span className="sci-pause-mission-position__mission">
              Mission {String(missionNumber).padStart(2, '0')}
            </span>
            <strong>{missionName}</strong>
            <span className="sci-pause-mission-position__wave">
              Wave {waveNumber}/{waveTotal}
            </span>
          </div>

          <div className="sci-pause-actions">
            <PixelActionButton
              tone="green"
              shine
              onClick={onResume}
              className="sci-pause-action sci-pause-action--resume"
            >
              <span>Resume Mission</span>
            </PixelActionButton>
            <PixelActionButton
              tone="neutral"
              onClick={onQuit}
              className="sci-pause-action sci-pause-action--quit"
            >
              <span>{quitLabel}</span>
            </PixelActionButton>
          </div>
          {quitWarning ? (
            <p className="sci-pause-quit-warning" role="note">{quitWarning}</p>
          ) : null}

          <div className="sci-pause-settings" role="group" aria-label="Mission settings">
            <div className="sci-pause-settings__title">
              <img src={`${INTERFACE_ROOT}/icons/system/settings.png`} alt="" aria-hidden="true" />
              <span>Mission Settings</span>
            </div>
            <AudioSettingsControls
              idPrefix="sci-pause"
              audioMuted={audioMuted}
              sfxVolumeLevel={sfxVolumeLevel}
              musicVolumeLevel={musicVolumeLevel}
              onToggleAudio={onToggleAudio}
              onSfxVolumeChange={onSfxVolumeChange}
              onMusicVolumeChange={onMusicVolumeChange}
            />
            <PauseSettingRow
              label="Screen shake"
              enabled={polishSettings.screenShake}
              onToggle={() => onTogglePolishSetting('screenShake')}
            />
            <PauseSettingRow
              label="Impact particles"
              enabled={polishSettings.highDensityParticles}
              onToggle={() => onTogglePolishSetting('highDensityParticles')}
            />
          </div>
        </div>
      </section>

      {founderControls ? (
        <section className="sci-pause-founder" aria-label="Founder test controls">
          {founderControls}
        </section>
      ) : null}
    </div>
  </div>
);

export default PauseMenu;
