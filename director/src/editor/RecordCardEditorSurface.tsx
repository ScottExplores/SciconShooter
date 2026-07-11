import { useState } from 'react';
import { MissionRecordCard } from '../../../components/MissionRecordCard';
import { ASSET_CATALOG } from '../../../game-config/catalog';
import { resolveRecordCardEncounterAssetKey } from '../../../shared/record-card/renderRecordCardSvg.mjs';
import type { AssetKey, RecordCardArtRegion, RecordCardConfig, WaveDefinition } from '../../../game-config/types';
import { SPRITE_ASSET_DRAG_MIME } from './SpriteWorkshop';

type ArtRegionId = 'ship' | 'encounter';

interface RecordCardEditorSurfaceProps {
  config: RecordCardConfig;
  wave: WaveDefinition;
  onChange: (config: RecordCardConfig) => void;
}

interface DragState {
  pointerId: number;
  regionId: ArtRegionId;
  offsetX: number;
  offsetY: number;
  region: RecordCardArtRegion;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

const getDesignPoint = (element: Element, clientX: number, clientY: number) => {
  const bounds = element.getBoundingClientRect();
  return {
    x: ((clientX - bounds.left) / Math.max(1, bounds.width)) * 1200,
    y: ((clientY - bounds.top) / Math.max(1, bounds.height)) * 1200
  };
};

export function RecordCardEditorSurface({ config, wave, onChange }: RecordCardEditorSurfaceProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const encounterKey = config.encounterAssetKey === 'AUTO'
    ? resolveRecordCardEncounterAssetKey(null, wave) as AssetKey
    : config.encounterAssetKey;
  const previewConfig = drag
    ? { ...config, art: { ...config.art, [drag.regionId]: drag.region } }
    : config;

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, regionId: ArtRegionId) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest('.le-card-editor__canvas');
    if (!canvas) return;
    const point = getDesignPoint(canvas, event.clientX, event.clientY);
    const region = config.art[regionId];
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      regionId,
      offsetX: point.x - region.x,
      offsetY: point.y - region.y,
      region: { ...region }
    });
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = getDesignPoint(event.currentTarget, event.clientX, event.clientY);
    setDrag({
      ...drag,
      region: {
        ...drag.region,
        x: Math.round(clamp(point.x - drag.offsetX, 0, 1200 - drag.region.width)),
        y: Math.round(clamp(point.y - drag.offsetY, 0, 1200 - drag.region.height))
      }
    });
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    onChange({ ...config, art: { ...config.art, [drag.regionId]: drag.region } });
    setDrag(null);
  };

  const dropAsset = (event: React.DragEvent<HTMLDivElement>, regionId: ArtRegionId) => {
    event.preventDefault();
    event.stopPropagation();
    const key = event.dataTransfer.getData(SPRITE_ASSET_DRAG_MIME) as AssetKey;
    if (!ASSET_CATALOG[key]) return;
    onChange(regionId === 'ship'
      ? { ...config, shipAssetKey: key }
      : { ...config, encounterAssetKey: key });
  };

  return (
    <div className="le-card-editor" aria-label="Shared mission and NFT scorecard editor">
      <div
        className="le-card-editor__canvas"
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => setDrag(null)}
      >
        <MissionRecordCard
          record={{
            pilotName: 'SCICON PILOT',
            encounterLabel: wave.name.toUpperCase(),
            encounterArt: ASSET_CATALOG[encounterKey].paths[0],
            score: 128400,
            wave: wave.order,
            targetsDefeated: 84,
            coinsCollected: 27,
            flightTimeLabel: '03:42',
            dateLabel: 'LOCAL PREVIEW',
            gameVersion: 'DIRECTOR',
            integrity: 'server-verified'
          }}
          shipArt={ASSET_CATALOG[config.shipAssetKey].paths[0]}
          presentation={previewConfig}
        />
        {(['ship', 'encounter'] as const).map((regionId) => {
          const region = previewConfig.art[regionId];
          return region.visible ? (
            <div
              key={regionId}
              className={`le-card-region le-card-region--${regionId}${drag?.regionId === regionId ? ' is-dragging' : ''}`}
              style={{
                left: `${(region.x / 1200) * 100}%`,
                top: `${(region.y / 1200) * 100}%`,
                width: `${(region.width / 1200) * 100}%`,
                height: `${(region.height / 1200) * 100}%`,
                transform: `rotate(${region.rotation}deg)`
              }}
              role="button"
              tabIndex={0}
              aria-label={`Drag ${regionId === 'ship' ? 'ship' : 'encounter'} artwork`}
              onPointerDown={(event) => startDrag(event, regionId)}
              onKeyDown={(event) => {
                const offsets: Record<string, { x: number; y: number }> = {
                  ArrowLeft: { x: -10, y: 0 },
                  ArrowRight: { x: 10, y: 0 },
                  ArrowUp: { x: 0, y: -10 },
                  ArrowDown: { x: 0, y: 10 }
                };
                const offset = offsets[event.key];
                if (!offset) return;
                event.preventDefault();
                onChange({
                  ...config,
                  art: {
                    ...config.art,
                    [regionId]: {
                      ...region,
                      x: Math.round(clamp(region.x + offset.x, 0, 1200 - region.width)),
                      y: Math.round(clamp(region.y + offset.y, 0, 1200 - region.height))
                    }
                  }
                });
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(SPRITE_ASSET_DRAG_MIME)) event.preventDefault();
              }}
              onDrop={(event) => dropAsset(event, regionId)}
            >
              <span>{regionId === 'ship' ? 'SHIP ART' : 'ENCOUNTER ART'}</span>
            </div>
          ) : null;
        })}
      </div>
      <p>Same SVG as the in-game record and NFT/share image · drag either art region</p>
    </div>
  );
}

export default RecordCardEditorSurface;
