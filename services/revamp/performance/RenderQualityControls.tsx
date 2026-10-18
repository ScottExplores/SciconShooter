import React, { useSyncExternalStore } from 'react';
import type { RenderQualityMode } from './AdaptiveRenderQuality';
import { getRenderQualityMode, getServerRenderQualityMode, setRenderQualityMode, subscribeRenderQualityMode } from './RenderQualitySettings';
import './render-quality.css';

/** The setting subscribes to user choices only, never frame samples or auto tiers. */
const RenderQualityControls: React.FC = () => {
  const mode = useSyncExternalStore(subscribeRenderQualityMode, getRenderQualityMode, getServerRenderQualityMode);
  return (
    <label className="sci-pause-setting sci-pause-setting--controls sci-render-quality">
      <span className="sci-pause-setting__label">Visual quality</span>
      <select
        aria-label="Visual quality"
        title="Auto adjusts scenery, effects, and pixel resolution for smooth play."
        value={mode}
        onChange={(event) => setRenderQualityMode(event.currentTarget.value as RenderQualityMode)}
      >
        <option value="auto">Auto</option>
        <option value="high">High</option>
        <option value="low">Low</option>
      </select>
    </label>
  );
};

export default RenderQualityControls;
