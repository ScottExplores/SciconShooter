import React from 'react';
import type { GamePolishSettings } from '../types';
import {
  MISSION_MUSIC_TRACKS,
  type MissionMusicTrackId
} from '../services/audioService';
import PixelActionButton from './PixelActionButton';
import '../styles/pause-menu.css';

interface PauseMenuProps {
  audioMuted: boolean;
  audioVolumeLevel: number;
  musicTrackId: MissionMusicTrackId;
  polishSettings: GamePolishSettings;
  onResume: () => void;
  onQuit: () => void;
  onToggleAudio: () => void;
  onAudioVolumeChange: (level: number) => void;
  onMusicTrackChange: (trackId: MissionMusicTrackId) => void;
  onTogglePolishSetting: (key: keyof GamePolishSettings) => void;
  founderControls?: React.ReactNode;
}

const INTERFACE_ROOT = '/game-art/generated/ui/scicon-interface-pack-v1';
const AUDIO_VOLUME_NOTCHES = Array.from({ length: 6 }, (_, index) => index);

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
  audioVolumeLevel,
  musicTrackId,
  polishSettings,
  onResume,
  onQuit,
  onToggleAudio,
  onAudioVolumeChange,
  onMusicTrackChange,
  onTogglePolishSetting,
  founderControls
}) => {
  const selectedTrackIndex = Math.max(
    0,
    MISSION_MUSIC_TRACKS.findIndex((track) => track.id === musicTrackId)
  );
  const selectedTrack = MISSION_MUSIC_TRACKS[selectedTrackIndex];
  const selectAdjacentTrack = (direction: -1 | 1) => {
    const nextIndex = (
      selectedTrackIndex
      + direction
      + MISSION_MUSIC_TRACKS.length
    ) % MISSION_MUSIC_TRACKS.length;
    onMusicTrackChange(MISSION_MUSIC_TRACKS[nextIndex].id);
  };

  return (
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
              <span>Exit Run</span>
            </PixelActionButton>
          </div>

          <div className="sci-pause-settings" role="group" aria-label="Mission settings">
            <div className="sci-pause-settings__title">
              <img src={`${INTERFACE_ROOT}/icons/system/settings.png`} alt="" aria-hidden="true" />
              <span>Mission Settings</span>
            </div>
            <PauseSettingRow
              label="Game audio"
              enabled={!audioMuted}
              onToggle={onToggleAudio}
              kind="audio"
            />
            <div className="sci-pause-music" role="group" aria-label="Mission music">
              <span className="sci-pause-music__label">Mission music</span>
              <div className="sci-pause-music__switcher">
                <button
                  type="button"
                  onClick={() => selectAdjacentTrack(-1)}
                  aria-label="Previous mission music track"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <output aria-live="polite">
                  <strong>{selectedTrack.title}</strong>
                  <span>{selectedTrack.artist}</span>
                </output>
                <button
                  type="button"
                  onClick={() => selectAdjacentTrack(1)}
                  aria-label="Next mission music track"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
              <span className="sci-pause-music__position" aria-hidden="true">
                {selectedTrackIndex + 1} / {MISSION_MUSIC_TRACKS.length}
              </span>
            </div>
            <label className="sci-pause-volume" htmlFor="sci-pause-volume-level">
              <span className="sci-pause-volume__header">
                <span>Master volume</span>
                <output htmlFor="sci-pause-volume-level" aria-live="polite">
                  {audioVolumeLevel === 0 ? 'Muted' : `${audioVolumeLevel} / 5`}
                </output>
              </span>
              <span className="sci-pause-volume__control">
                <input
                  id="sci-pause-volume-level"
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={audioVolumeLevel}
                  aria-label="Master volume level"
                  onChange={(event) => onAudioVolumeChange(Number(event.currentTarget.value))}
                />
                <span className="sci-pause-volume__notches" aria-hidden="true">
                  {AUDIO_VOLUME_NOTCHES.map((notch) => (
                    <span
                      key={notch}
                      className="sci-pause-volume__notch"
                      data-active={notch <= audioVolumeLevel ? 'true' : 'false'}
                    />
                  ))}
                </span>
              </span>
            </label>
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
};

export default PauseMenu;
