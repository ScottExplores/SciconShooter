import React from 'react';
import {
  MATCH_MUSIC_TRACKS,
  type MatchMusicTrackId
} from '../services/audioService';
import '../styles/pause-menu.css';

export interface AudioSettingsControlsProps {
  idPrefix: string;
  audioMuted: boolean;
  sfxVolumeLevel: number;
  musicVolumeLevel: number;
  matchMusicTrackId: MatchMusicTrackId;
  onToggleAudio: () => void;
  onSfxVolumeChange: (level: number) => void;
  onMusicVolumeChange: (level: number) => void;
  onMatchMusicTrackChange: (trackId: MatchMusicTrackId) => void;
}

const AUDIO_VOLUME_NOTCHES = Array.from({ length: 6 }, (_, index) => index);

interface AudioVolumeSliderProps {
  id: string;
  label: string;
  level: number;
  onChange: (level: number) => void;
}

const AudioVolumeSlider: React.FC<AudioVolumeSliderProps> = ({
  id,
  label,
  level,
  onChange
}) => (
  <label className="sci-pause-volume" htmlFor={id}>
    <span className="sci-pause-volume__header">
      <span>{label}</span>
      <output htmlFor={id} aria-live="polite">
        {level === 0 ? 'Muted' : `${level} / 5`}
      </output>
    </span>
    <span className="sci-pause-volume__control">
      <input
        id={id}
        type="range"
        min={0}
        max={5}
        step={1}
        value={level}
        aria-label={`${label} level`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="sci-pause-volume__notches" aria-hidden="true">
        {AUDIO_VOLUME_NOTCHES.map((notch) => (
          <span
            key={notch}
            className="sci-pause-volume__notch"
            data-active={notch <= level ? 'true' : 'false'}
          />
        ))}
      </span>
    </span>
  </label>
);

const AudioToggleRow: React.FC<{
  enabled: boolean;
  onToggle: () => void;
}> = ({ enabled, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={enabled}
    aria-label={`Game audio: ${enabled ? 'on' : 'off'}`}
    className="sci-pause-setting sci-pause-setting--audio"
  >
    <span className="sci-pause-setting__label">Game audio</span>
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

const MatchMusicSelector: React.FC<{
  id: string;
  trackId: MatchMusicTrackId;
  onChange: (trackId: MatchMusicTrackId) => void;
}> = ({ id, trackId, onChange }) => (
  <label className="sci-pause-track" htmlFor={id}>
    <span>Match music</span>
    <span className="sci-pause-track__select">
      <select
        id={id}
        value={trackId}
        aria-label="Match music track"
        onChange={(event) => onChange(event.currentTarget.value as MatchMusicTrackId)}
      >
        {MATCH_MUSIC_TRACKS.map((track) => (
          <option key={track.id} value={track.id}>{track.name}</option>
        ))}
      </select>
      <span aria-hidden="true">▾</span>
    </span>
  </label>
);

/**
 * The one canonical audio-settings surface. Both the pause overlay and the
 * More dashboard bind these controls to the same AudioService-backed state.
 */
const AudioSettingsControls: React.FC<AudioSettingsControlsProps> = ({
  idPrefix,
  audioMuted,
  sfxVolumeLevel,
  musicVolumeLevel,
  matchMusicTrackId,
  onToggleAudio,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onMatchMusicTrackChange
}) => (
  <>
    <AudioToggleRow enabled={!audioMuted} onToggle={onToggleAudio} />
    <AudioVolumeSlider
      id={`${idPrefix}-sfx-volume-level`}
      label="Sound effects"
      level={sfxVolumeLevel}
      onChange={onSfxVolumeChange}
    />
    <AudioVolumeSlider
      id={`${idPrefix}-music-volume-level`}
      label="Music"
      level={musicVolumeLevel}
      onChange={onMusicVolumeChange}
    />
    <MatchMusicSelector
      id={`${idPrefix}-match-music-track`}
      trackId={matchMusicTrackId}
      onChange={onMatchMusicTrackChange}
    />
  </>
);

export default AudioSettingsControls;
