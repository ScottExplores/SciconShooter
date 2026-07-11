import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { ASSET_CATALOG } from '../../../game-config/catalog';
import type { AssetKey } from '../../../game-config/types';

export const SPRITE_ASSET_DRAG_MIME = 'application/x-scicon-asset-key';

/**
 * Compatible, local precursor to the campaign-level SpriteStyle model.
 * Every property is optional so an empty object preserves the game renderer's
 * existing presentation exactly.
 */
export interface SpriteStyle {
  scale?: number;
  rotationDegrees?: number;
  flipX?: boolean;
  opacity?: number;
  hueRotateDegrees?: number;
  saturation?: number;
  brightness?: number;
  glowColor?: string;
  glowBlur?: number;
}

export interface SpriteWorkshopProps {
  assetKey: AssetKey;
  allowedAssetKeys: readonly AssetKey[];
  style: SpriteStyle;
  onAssetChange: (assetKey: AssetKey) => void;
  onStyleChange: (style: SpriteStyle) => void;
  onClose: () => void;
}

type EffectiveSpriteStyle = Required<SpriteStyle>;
type NumberStyleKey = Exclude<keyof SpriteStyle, 'flipX' | 'glowColor'>;

const DEFAULT_STYLE: EffectiveSpriteStyle = {
  scale: 1,
  rotationDegrees: 0,
  flipX: false,
  opacity: 1,
  hueRotateDegrees: 0,
  saturation: 1,
  brightness: 1,
  glowColor: '#22D3EE',
  glowBlur: 0
};

const STYLE_RECIPES: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  value: SpriteStyle;
}> = [
  {
    id: 'original',
    label: 'Original',
    description: 'Use the untouched game art.',
    value: {}
  },
  {
    id: 'neon',
    label: 'Neon',
    description: 'Bright cyan research glow.',
    value: {
      scale: 1.04,
      opacity: 1,
      hueRotateDegrees: 0,
      saturation: 1.45,
      brightness: 1.12,
      glowColor: '#22D3EE',
      glowBlur: 18
    }
  },
  {
    id: 'threat',
    label: 'Threat',
    description: 'Hot warning treatment for dangerous encounters.',
    value: {
      scale: 1.08,
      opacity: 1,
      hueRotateDegrees: -18,
      saturation: 1.55,
      brightness: 1.06,
      glowColor: '#FB7185',
      glowBlur: 20
    }
  },
  {
    id: 'ghost',
    label: 'Ghost',
    description: 'Translucent violet phase variant.',
    value: {
      scale: 0.96,
      opacity: 0.66,
      hueRotateDegrees: 68,
      saturation: 0.82,
      brightness: 1.28,
      glowColor: '#A78BFA',
      glowBlur: 24
    }
  },
  {
    id: 'heavy',
    label: 'Heavy',
    description: 'Larger, darker armored presentation.',
    value: {
      scale: 1.22,
      opacity: 1,
      hueRotateDegrees: -8,
      saturation: 0.76,
      brightness: 0.8,
      glowColor: '#F59E0B',
      glowBlur: 12
    }
  }
];

const NUMBER_CONTROLS: ReadonlyArray<{
  key: NumberStyleKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  { key: 'scale', label: 'Size', min: 0.25, max: 3, step: 0.01, format: (value) => `${value.toFixed(2)}x` },
  { key: 'rotationDegrees', label: 'Rotation', min: -180, max: 180, step: 1, format: (value) => `${Math.round(value)}deg` },
  { key: 'opacity', label: 'Opacity', min: 0.1, max: 1, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'hueRotateDegrees', label: 'Hue', min: -180, max: 180, step: 1, format: (value) => `${Math.round(value)}deg` },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'brightness', label: 'Brightness', min: 0.25, max: 2, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'glowBlur', label: 'Glow', min: 0, max: 40, step: 1, format: (value) => `${Math.round(value)}px` }
];

const WORKSHOP_CSS = `
  .sw-scrim{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:24px;background:rgba(1,5,16,.86);backdrop-filter:blur(14px);font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#eefcff}
  .sw-dialog{width:min(1040px,100%);max-height:min(850px,calc(100vh - 48px));overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr);border:1px solid rgba(103,232,249,.28);border-radius:10px;background:#050b18;box-shadow:0 30px 100px rgba(0,0,0,.72),0 0 60px rgba(34,211,238,.09)}
  .sw-header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 18px;border-bottom:1px solid rgba(148,163,184,.14);background:linear-gradient(90deg,rgba(8,47,73,.38),rgba(5,11,24,.9))}
  .sw-header p,.sw-header h2{margin:0}.sw-header p{font:700 9px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9}.sw-header h2{margin-top:4px;font-size:18px;letter-spacing:.06em;text-transform:uppercase}
  .sw-close{width:36px;height:36px;border:1px solid rgba(148,163,184,.25);border-radius:7px;background:rgba(255,255,255,.04);color:#cbd5e1;font-size:22px;cursor:pointer}.sw-close:hover{border-color:#67e8f9;color:white}
  .sw-body{min-height:0;display:grid;grid-template-columns:minmax(360px,1.35fr) minmax(300px,.85fr)}
  .sw-stage-column{min-height:0;display:grid;grid-template-rows:minmax(310px,1fr) auto auto;border-right:1px solid rgba(148,163,184,.14)}
  .sw-stage{position:relative;display:grid;place-items:center;min-height:310px;overflow:hidden;background:radial-gradient(circle at 50% 48%,rgba(14,116,144,.2),transparent 35%),linear-gradient(rgba(34,211,238,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.035) 1px,transparent 1px),#020611;background-size:auto,24px 24px,24px 24px,auto}
  .sw-stage:after{content:'DROP A GAME SPRITE HERE';position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font:700 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em;color:#475569;white-space:nowrap}
  .sw-preview{position:relative;width:min(58%,300px);aspect-ratio:1;display:grid;place-items:center}
  .sw-preview:before{content:'';position:absolute;inset:10%;border:1px solid rgba(103,232,249,.12);border-radius:50%;box-shadow:0 0 50px rgba(34,211,238,.07)}
  .sw-preview img{position:relative;width:72%;height:72%;object-fit:contain;image-rendering:pixelated;will-change:transform,filter,opacity}
  .sw-frame-strip{display:flex;gap:8px;min-height:72px;overflow-x:auto;padding:10px 14px;border-top:1px solid rgba(148,163,184,.1);background:#030814}
  .sw-frame{flex:0 0 54px;height:54px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.16);border-radius:6px;background:rgba(255,255,255,.025)}.sw-frame.is-active{border-color:#22d3ee;background:rgba(34,211,238,.1)}.sw-frame img{width:44px;height:44px;object-fit:contain;image-rendering:pixelated}
  .sw-library{padding:12px 14px 15px;border-top:1px solid rgba(148,163,184,.12)}.sw-section-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 9px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8}.sw-section-label small{font:600 9px ui-monospace,SFMono-Regular,monospace;color:#475569}
  .sw-assets{display:flex;gap:9px;overflow-x:auto;padding-bottom:2px}.sw-asset{position:relative;flex:0 0 92px;min-height:88px;padding:7px;border:1px solid rgba(148,163,184,.16);border-radius:7px;background:rgba(255,255,255,.025);color:#cbd5e1;text-align:left;cursor:grab}.sw-asset:hover,.sw-asset.is-selected{border-color:#22d3ee;background:rgba(34,211,238,.09);color:white}.sw-asset:active{cursor:grabbing}.sw-asset img{display:block;width:44px;height:44px;margin:0 auto 6px;object-fit:contain;image-rendering:pixelated}.sw-asset strong{display:block;overflow:hidden;font-size:9px;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.sw-asset span{display:block;margin-top:2px;font:600 8px/1 ui-monospace,SFMono-Regular,monospace;color:#64748b}
  .sw-controls{min-height:0;overflow:auto;padding:15px 16px 20px}.sw-recipes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:18px}.sw-recipe{padding:9px 10px;border:1px solid rgba(148,163,184,.16);border-radius:7px;background:rgba(255,255,255,.025);color:#e2e8f0;text-align:left;cursor:pointer}.sw-recipe:hover{border-color:#67e8f9;background:rgba(34,211,238,.08)}.sw-recipe strong{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.sw-recipe span{display:block;margin-top:3px;font-size:9px;line-height:1.35;color:#64748b}
  .sw-control{display:grid;gap:6px;margin-bottom:13px}.sw-control>span{display:flex;justify-content:space-between;gap:10px;font-size:10px;font-weight:750;color:#cbd5e1}.sw-control output{font:700 9px ui-monospace,SFMono-Regular,monospace;color:#67e8f9}.sw-control input[type=range]{width:100%;accent-color:#22d3ee}.sw-control-row{display:grid;grid-template-columns:1fr 76px;align-items:end;gap:10px}.sw-color{width:100%;height:34px;padding:3px;border:1px solid rgba(148,163,184,.22);border-radius:6px;background:#020611}.sw-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 16px;padding:10px 11px;border:1px solid rgba(148,163,184,.14);border-radius:7px;background:rgba(255,255,255,.02);font-size:10px;font-weight:750;color:#cbd5e1}.sw-toggle input{accent-color:#22d3ee}
  .sw-reset{width:100%;padding:10px 12px;border:1px solid rgba(248,113,113,.28);border-radius:7px;background:rgba(127,29,29,.12);color:#fecaca;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.sw-reset:hover{background:rgba(127,29,29,.22);border-color:#fb7185}
  @media(max-width:760px){.sw-scrim{padding:0}.sw-dialog{height:100%;max-height:none;border-radius:0}.sw-body{grid-template-columns:1fr;overflow:auto}.sw-stage-column{border-right:0}.sw-controls{overflow:visible;border-top:1px solid rgba(148,163,184,.14)}.sw-stage{min-height:280px}.sw-header{padding:12px 14px}}
`;

const getEffectiveStyle = (style: SpriteStyle): EffectiveSpriteStyle => ({
  scale: style.scale ?? DEFAULT_STYLE.scale,
  rotationDegrees: style.rotationDegrees ?? DEFAULT_STYLE.rotationDegrees,
  flipX: style.flipX ?? DEFAULT_STYLE.flipX,
  opacity: style.opacity ?? DEFAULT_STYLE.opacity,
  hueRotateDegrees: style.hueRotateDegrees ?? DEFAULT_STYLE.hueRotateDegrees,
  saturation: style.saturation ?? DEFAULT_STYLE.saturation,
  brightness: style.brightness ?? DEFAULT_STYLE.brightness,
  glowColor: style.glowColor ?? DEFAULT_STYLE.glowColor,
  glowBlur: style.glowBlur ?? DEFAULT_STYLE.glowBlur
});

const getPreviewStyle = (style: EffectiveSpriteStyle): CSSProperties => {
  const glow = style.glowBlur > 0
    ? ` drop-shadow(0 0 ${style.glowBlur}px ${style.glowColor})`
    : '';
  return {
    opacity: style.opacity,
    transform: `rotate(${style.rotationDegrees}deg) scale(${style.flipX ? -style.scale : style.scale}, ${style.scale})`,
    filter: `hue-rotate(${style.hueRotateDegrees}deg) saturate(${style.saturation}) brightness(${style.brightness})${glow}`
  };
};

export function SpriteWorkshop({
  assetKey,
  allowedAssetKeys,
  style,
  onAssetChange,
  onStyleChange,
  onClose
}: SpriteWorkshopProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const allowedAssets = useMemo(() => (
    [...new Set(allowedAssetKeys)].filter((key) => Boolean(ASSET_CATALOG[key]))
  ), [allowedAssetKeys]);
  const selectedAsset = ASSET_CATALOG[assetKey] ?? ASSET_CATALOG[allowedAssets[0]];
  const frames = selectedAsset?.paths ?? [];
  const effectiveStyle = getEffectiveStyle(style);

  useEffect(() => {
    setFrameIndex(0);
    if (frames.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 110);
    return () => window.clearInterval(timer);
  }, [assetKey, frames.length]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const setNumber = (key: NumberStyleKey, value: number) => {
    onStyleChange({ ...style, [key]: value });
  };

  const startAssetDrag = (event: DragEvent<HTMLButtonElement>, key: AssetKey) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(SPRITE_ASSET_DRAG_MIME, key);
  };

  const acceptAssetDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const key = event.dataTransfer.getData(SPRITE_ASSET_DRAG_MIME) as AssetKey;
    if (allowedAssets.includes(key) && ASSET_CATALOG[key]) onAssetChange(key);
  };

  if (!selectedAsset) return null;

  return (
    <div className="sw-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <style>{WORKSHOP_CSS}</style>
      <section className="sw-dialog" role="dialog" aria-modal="true" aria-labelledby="sprite-workshop-title">
        <header className="sw-header">
          <div>
            <p>Local game artwork</p>
            <h2 id="sprite-workshop-title">Sprite Workshop</h2>
          </div>
          <button className="sw-close" type="button" aria-label="Close Sprite Workshop" onClick={onClose}>×</button>
        </header>

        <div className="sw-body">
          <div className="sw-stage-column">
            <div
              className="sw-stage"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(SPRITE_ASSET_DRAG_MIME)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={acceptAssetDrop}
            >
              <div className="sw-preview" aria-label={`Animated preview of ${selectedAsset.label}`}>
                <img
                  src={frames[frameIndex % Math.max(1, frames.length)]}
                  alt={selectedAsset.label}
                  draggable={false}
                  style={getPreviewStyle(effectiveStyle)}
                />
              </div>
            </div>

            <div className="sw-frame-strip" aria-label={`${selectedAsset.label} animation frames`}>
              {frames.map((path, index) => (
                <button
                  className={`sw-frame${index === frameIndex ? ' is-active' : ''}`}
                  key={path}
                  type="button"
                  aria-label={`Preview frame ${index + 1}`}
                  onClick={() => setFrameIndex(index)}
                >
                  <img src={path} alt="" draggable={false} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>

            <section className="sw-library" aria-labelledby="sprite-library-title">
              <p className="sw-section-label" id="sprite-library-title">
                <span>Game sprite library</span>
                <small>Click or drag to preview</small>
              </p>
              <div className="sw-assets">
                {allowedAssets.map((key) => {
                  const entry = ASSET_CATALOG[key];
                  return (
                    <button
                      className={`sw-asset${key === assetKey ? ' is-selected' : ''}`}
                      key={key}
                      type="button"
                      draggable
                      aria-pressed={key === assetKey}
                      onClick={() => onAssetChange(key)}
                      onDragStart={(event) => startAssetDrag(event, key)}
                    >
                      <img src={entry.paths[0]} alt="" draggable={false} loading="lazy" decoding="async" />
                      <strong title={entry.label}>{entry.label}</strong>
                      <span>{entry.paths.length > 1 ? `${entry.paths.length} frames` : 'single image'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="sw-controls" aria-label="Sprite appearance controls">
            <p className="sw-section-label"><span>Deterministic recipes</span><small>No AI or network</small></p>
            <div className="sw-recipes">
              {STYLE_RECIPES.map((recipe) => (
                <button className="sw-recipe" key={recipe.id} type="button" onClick={() => onStyleChange({ ...recipe.value })}>
                  <strong>{recipe.label}</strong>
                  <span>{recipe.description}</span>
                </button>
              ))}
            </div>

            {NUMBER_CONTROLS.map((control) => {
              const value = effectiveStyle[control.key];
              return (
                <label className="sw-control" key={control.key}>
                  <span>{control.label}<output>{control.format(value)}</output></span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={value}
                    onChange={(event) => setNumber(control.key, Number(event.target.value))}
                  />
                </label>
              );
            })}

            <div className="sw-control-row">
              <label className="sw-control">
                <span>Glow color<output>{effectiveStyle.glowColor.toUpperCase()}</output></span>
                <input
                  className="sw-color"
                  type="color"
                  value={effectiveStyle.glowColor}
                  onChange={(event) => onStyleChange({ ...style, glowColor: event.target.value.toUpperCase() })}
                />
              </label>
              <label className="sw-toggle">
                <span>Flip</span>
                <input
                  type="checkbox"
                  checked={effectiveStyle.flipX}
                  onChange={(event) => onStyleChange({ ...style, flipX: event.target.checked })}
                />
              </label>
            </div>

            <button className="sw-reset" type="button" onClick={() => onStyleChange({})}>Reset to game default</button>
          </aside>
        </div>
      </section>
    </div>
  );
}

export default SpriteWorkshop;
