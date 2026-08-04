import React from 'react';
import type { GamePolishSettings } from '../types';
import type { MatchMusicTrackId } from '../services/audioService';
import PixelActionButton from './PixelActionButton';
import AudioSettingsControls from './AudioSettingsControls';
import '../styles/pause-menu.css';

interface PauseMenuProps {
  audioMuted: boolean;
  missionNumber: number;
  missionName: string;
  waveNumber: number;
  waveTotal: number;
  absoluteWaveNumber?: number;
  continuousRun?: boolean;
  sfxVolumeLevel: number;
  musicVolumeLevel: number;
  matchMusicTrackId: MatchMusicTrackId;
  polishSettings: GamePolishSettings;
  onResume: () => void;
  onQuit: () => void;
  onToggleAudio: () => void;
  onSfxVolumeChange: (level: number) => void;
  onMusicVolumeChange: (level: number) => void;
  onMatchMusicTrackChange: (trackId: MatchMusicTrackId) => void;
  onTogglePolishSetting: (key: keyof GamePolishSettings) => void;
  quitLabel?: string;
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
  absoluteWaveNumber = waveNumber,
  continuousRun = false,
  sfxVolumeLevel,
  musicVolumeLevel,
  matchMusicTrackId,
  polishSettings,
  onResume,
  onQuit,
  onToggleAudio,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onMatchMusicTrackChange,
  onTogglePolishSetting,
  quitLabel = 'Exit Run',
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
            aria-label={continuousRun
              ? `Weekly Run, wave ${absoluteWaveNumber}`
              : `Mission ${missionNumber}, ${missionName}, wave ${waveNumber} of ${waveTotal}`}
          >
            <span className="sci-pause-mission-position__mission">
              {continuousRun ? 'Weekly Run' : `Mission ${String(missionNumber).padStart(2, '0')}`}
            </span>
            <strong>{continuousRun ? `Wave ${absoluteWaveNumber}` : missionName}</strong>
            {!continuousRun ? (
              <span className="sci-pause-mission-position__wave">
                Wave {waveNumber}/{waveTotal}
              </span>
            ) : null}
          </div>

          <div className="sci-pause-actions">
            <PixelActionButton
              tone="danger"
              onClick={onQuit}
              className="sci-pause-action sci-pause-action--quit"
            >
              <span>{quitLabel}</span>
            </PixelActionButton>
            <PixelActionButton
              tone="green"
              shine
              onClick={onResume}
              className="sci-pause-action sci-pause-action--resume"
            >
              <span>Resume Mission</span>
            </PixelActionButton>
          </div>

          <div className="sci-pause-settings" role="group" aria-label="Mission settings">
            <div className="sci-pause-settings__title">
              <span>Mission Settings</span>
            </div>
            <AudioSettingsControls
              idPrefix="sci-pause"
              audioMuted={audioMuted}
              sfxVolumeLevel={sfxVolumeLevel}
              musicVolumeLevel={musicVolumeLevel}
              matchMusicTrackId={matchMusicTrackId}
              onToggleAudio={onToggleAudio}
              onSfxVolumeChange={onSfxVolumeChange}
              onMusicVolumeChange={onMusicVolumeChange}
              onMatchMusicTrackChange={onMatchMusicTrackChange}
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
