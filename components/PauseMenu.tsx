import React from 'react';
import type { GamePolishSettings } from '../types';
import '../styles/pause-menu.css';

interface PauseMenuProps {
  audioMuted: boolean;
  polishSettings: GamePolishSettings;
  onResume: () => void;
  onQuit: () => void;
  onToggleAudio: () => void;
  onTogglePolishSetting: (key: keyof GamePolishSettings) => void;
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
    <img
      className={`sci-pause-setting__toggle ${enabled ? 'sci-pause-setting__toggle--on' : ''}`}
      src={`${INTERFACE_ROOT}/controls/toggle-${enabled ? 'on' : 'off'}.png`}
      alt=""
      aria-hidden="true"
    />
  </button>
);

const PauseMenu: React.FC<PauseMenuProps> = ({
  audioMuted,
  polishSettings,
  onResume,
  onQuit,
  onToggleAudio,
  onTogglePolishSetting,
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

          <div className="sci-pause-actions">
            <button type="button" onClick={onResume} className="sci-pause-action sci-pause-action--resume">
              <span>Resume Mission</span>
            </button>
            <button type="button" onClick={onQuit} className="sci-pause-action sci-pause-action--quit">
              <span>Exit Run</span>
            </button>
          </div>

          <div className="sci-pause-settings" aria-label="Mission settings">
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
