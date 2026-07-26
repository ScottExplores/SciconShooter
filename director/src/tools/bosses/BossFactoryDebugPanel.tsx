import type {
  PreviewBossReferenceComparisonState,
  PreviewDebugOverlayState,
  PreviewSafeRegionGuide
} from '@game/services/gameplay/previewSession';
import type { BossSandboxViewportMode } from './bossSandboxModel';
import './boss-factory-debug.css';

const TIME_SCALES = [0.25, 0.5, 1] as const;

const OVERLAY_OPTIONS = [
  ['modularPivots', 'Modular pivots'],
  ['weaponSockets', 'Weapon sockets'],
  ['bossCollision', 'Boss collision / hitbox'],
  ['modularPartBounds', 'Modular part bounds'],
  ['safeRegions', 'Intended safe-region guide']
] as const;

const SAFE_REGION_LABELS: Record<PreviewSafeRegionGuide, string> = {
  gap: 'rotating gap route',
  weave: 'weave-wall channel',
  side: 'opposite-side refuge',
  cross: 'cross-beam quadrants'
};

export interface BossFactoryDebugPanelProps {
  readonly playing: boolean;
  readonly timeScale: number;
  readonly viewportMode: BossSandboxViewportMode;
  readonly overlays: PreviewDebugOverlayState;
  readonly safeRegionGuide: PreviewSafeRegionGuide | null;
  readonly referenceComparisonAvailable: boolean;
  readonly referenceComparison: PreviewBossReferenceComparisonState;
  readonly onTimeScaleChange: (timeScale: number) => void;
  readonly onViewportModeChange: (viewportMode: BossSandboxViewportMode) => void;
  readonly onStepFrame: () => void;
  readonly onResetSeed: () => void;
  readonly onBossHealthChange: (healthRatio: number) => void;
  readonly onOverlayChange: (
    key: keyof PreviewDebugOverlayState,
    enabled: boolean
  ) => void;
  readonly onReferenceComparisonChange: (
    comparison: PreviewBossReferenceComparisonState
  ) => void;
  readonly onCapture: () => void;
}

export function BossFactoryDebugPanel({
  playing,
  timeScale,
  viewportMode,
  overlays,
  safeRegionGuide,
  referenceComparisonAvailable,
  referenceComparison,
  onTimeScaleChange,
  onViewportModeChange,
  onStepFrame,
  onResetSeed,
  onBossHealthChange,
  onOverlayChange,
  onReferenceComparisonChange,
  onCapture
}: BossFactoryDebugPanelProps) {
  return (
    <details className="boss-factory-debug">
      <summary>
        <span>Debug / Review</span>
        <small>Optional test controls</small>
      </summary>
      <div className="boss-factory-debug__body">
        <fieldset>
          <legend>Preview viewport</legend>
          <div className="boss-factory-debug__button-row">
            {([
              ['mobile', 'Mobile canvas'],
              ['desktop', 'Desktop canvas']
            ] as const).map(([mode, label]) => (
              <button
                type="button"
                key={mode}
                aria-pressed={viewportMode === mode}
                className={viewportMode === mode ? 'is-active' : ''}
                onClick={() => onViewportModeChange(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Simulation speed</legend>
          <div className="boss-factory-debug__button-row">
            {TIME_SCALES.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={timeScale === value}
                className={timeScale === value ? 'is-active' : ''}
                onClick={() => onTimeScaleChange(value)}
              >
                {value}×
              </button>
            ))}
          </div>
        </fieldset>

        <div className="boss-factory-debug__button-row">
          <button
            type="button"
            disabled={playing}
            title={playing ? 'Pause the fight before stepping one fixed frame' : undefined}
            onClick={onStepFrame}
          >
            Step 1 frame
          </button>
          <button type="button" onClick={onResetSeed}>Reset fixed seed</button>
        </div>

        <fieldset>
          <legend>Boss health</legend>
          <div className="boss-factory-debug__button-row">
            {[1, 0.5, 0.25, 0.01].map((healthRatio) => (
              <button
                type="button"
                key={healthRatio}
                onClick={() => onBossHealthChange(healthRatio)}
              >
                {Math.round(healthRatio * 100)}%
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Overlays</legend>
          <div className="boss-factory-debug__toggles">
            {OVERLAY_OPTIONS.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={overlays[key]}
                  onChange={(event) => onOverlayChange(key, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {overlays.safeRegions ? (
            <p className="boss-factory-debug__guide-status" aria-live="polite">
              {safeRegionGuide
                ? `Guide: ${SAFE_REGION_LABELS[safeRegionGuide]}`
                : 'No supported guide for the current attack.'}
            </p>
          ) : null}
        </fieldset>

        {referenceComparisonAvailable ? (
          <fieldset>
            <legend>Canonical reference</legend>
            <div className="boss-factory-debug__toggles">
              <label>
                <input
                  type="checkbox"
                  checked={referenceComparison.enabled}
                  onChange={(event) => onReferenceComparisonChange({
                    ...referenceComparison,
                    enabled: event.target.checked
                  })}
                />
                <span>Show neutral reference comparison</span>
              </label>
            </div>
            <label className="boss-factory-debug__range">
              <span>Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={referenceComparison.opacity}
                disabled={!referenceComparison.enabled}
                onChange={(event) => onReferenceComparisonChange({
                  ...referenceComparison,
                  opacity: Number(event.target.value)
                })}
              />
              <output>{Math.round(referenceComparison.opacity * 100)}%</output>
            </label>
            <div className="boss-factory-debug__button-row">
              {(['under', 'over'] as const).map((layer) => (
                <button
                  type="button"
                  key={layer}
                  aria-pressed={referenceComparison.layer === layer}
                  disabled={!referenceComparison.enabled}
                  onClick={() => onReferenceComparisonChange({
                    ...referenceComparison,
                    layer
                  })}
                >
                  {layer === 'under' ? 'Under rig' : 'Over rig'}
                </button>
              ))}
            </div>
            <div className="boss-factory-debug__toggles">
              <label>
                <input
                  type="checkbox"
                  checked={referenceComparison.landmarks}
                  disabled={!referenceComparison.enabled}
                  onChange={(event) => onReferenceComparisonChange({
                    ...referenceComparison,
                    landmarks: event.target.checked
                  })}
                />
                <span>Show paired landmarks</span>
              </label>
            </div>
          </fieldset>
        ) : null}

        <button
          type="button"
          className="boss-factory-debug__capture"
          onClick={onCapture}
        >
          Download Pixi frame (PNG)
        </button>
      </div>
    </details>
  );
}
