import React, { useSyncExternalStore } from 'react';
import { getFeelSettings, getServerFeelSettings, setFeelSetting, subscribeFeelSettings } from './FeelSettings';

const FeelSettingRow: React.FC<{ label: string; enabled: boolean; onToggle: () => void }> = ({ label, enabled, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={enabled}
    aria-label={`${label}: ${enabled ? 'on' : 'off'}`}
    className="sci-pause-setting sci-pause-setting--controls"
  >
    <span className="sci-pause-setting__label">{label}</span>
    <span className={`sci-pause-setting__toggle ${enabled ? 'sci-pause-setting__toggle--on' : ''}`} aria-hidden="true">
      <span className="sci-pause-setting__toggle-track" />
      <span className="sci-pause-setting__toggle-knob" />
      <span className="sci-pause-setting__toggle-copy">{enabled ? 'ON' : 'OFF'}</span>
    </span>
  </button>
);

/** Drop into either existing settings surface; both share the same stored state. */
const FeelSettingsControls: React.FC = () => {
  const settings = useSyncExternalStore(subscribeFeelSettings, getFeelSettings, getServerFeelSettings);
  return (
    <>
      <FeelSettingRow
        label="Reduce screen shake"
        enabled={settings.reduceScreenShake}
        onToggle={() => setFeelSetting('reduceScreenShake', !settings.reduceScreenShake)}
      />
      <FeelSettingRow
        label="Score numbers"
        enabled={settings.showScoreNumbers}
        onToggle={() => setFeelSetting('showScoreNumbers', !settings.showScoreNumbers)}
      />
    </>
  );
};

export default FeelSettingsControls;
