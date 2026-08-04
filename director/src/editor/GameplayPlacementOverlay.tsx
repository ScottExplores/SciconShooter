import { useMemo, useState } from 'react';
import type { GameEditorEntitySnapshot } from '../../../components/GameEditorCanvas';
import { ASSET_CATALOG } from '../../../game-config/catalog';
import type { AssetKey, WaveDefinition, WaveEvent } from '../../../game-config/types';

export const SCICON_ASSET_DRAG_TYPE = 'application/x-scicon-asset-key';

interface NormalizedPoint {
  x: number;
  y: number;
}

interface GameplayPlacementOverlayProps {
  enabled: boolean;
  wave: WaveDefinition;
  entities: readonly Readonly<GameEditorEntitySnapshot>[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  onCommitAnchor: (eventId: string, anchor: NormalizedPoint) => void;
  onDropAsset: (eventId: string, assetKey: string, anchor: NormalizedPoint) => void;
}

const clamp = (value: number, minimum = 0.04, maximum = 0.96) => (
  Math.max(minimum, Math.min(maximum, value))
);

const defaultAnchor = (event: WaveEvent): NormalizedPoint => {
  if (event.spawnAnchor) return event.spawnAnchor;
  if (event.kind === 'boss') return { x: 0.5, y: 0.22 };
  if (event.kind === 'asteroid-belt') return { x: 0.5, y: 0.17 };
  if (event.kind === 'supply-drop') return { x: 0.5, y: 0.08 };
  if (event.kind === 'powerup' || event.kind === 'recovery') return { x: 0.5, y: 0.48 };
  return { x: 0.5, y: 0.16 };
};

const eventAssetKey = (event: WaveEvent): AssetKey => {
  if (event.kind === 'spawn') return event.enemies[0]?.spriteKey ?? 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES';
  if (event.kind === 'boss' || event.kind === 'asteroid-belt' || event.kind === 'supply-drop') return event.spriteKey;
  return event.kind === 'powerup' ? 'REAL_RSC_ICON' : 'RSC_TOKEN';
};

const pointFromClient = (element: Element, clientX: number, clientY: number): NormalizedPoint => {
  const bounds = element.getBoundingClientRect();
  return {
    x: clamp((clientX - bounds.left) / Math.max(1, bounds.width)),
    y: clamp((clientY - bounds.top) / Math.max(1, bounds.height))
  };
};

export function GameplayPlacementOverlay({
  enabled,
  wave,
  entities,
  selectedEventId,
  onSelectEvent,
  onCommitAnchor,
  onDropAsset
}: GameplayPlacementOverlayProps) {
  const [drag, setDrag] = useState<{ pointerId: number; eventId: string; point: NormalizedPoint } | null>(null);

  const groups = useMemo(() => {
    const result = new Map<string, { left: number; top: number; width: number; height: number }>();
    entities.forEach((entity) => {
      const current = result.get(entity.sourceEventId);
      const next = {
        left: entity.bounds.x,
        top: entity.bounds.y,
        width: entity.bounds.width,
        height: entity.bounds.height
      };
      if (!current) {
        result.set(entity.sourceEventId, next);
        return;
      }
      const right = Math.max(current.left + current.width, next.left + next.width);
      const bottom = Math.max(current.top + current.height, next.top + next.height);
      current.left = Math.min(current.left, next.left);
      current.top = Math.min(current.top, next.top);
      current.width = right - current.left;
      current.height = bottom - current.top;
    });
    return result;
  }, [entities]);

  if (!enabled) return null;

  const startDrag = (pointerEvent: React.PointerEvent<HTMLDivElement>, eventId: string) => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    onSelectEvent(eventId);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    const overlay = pointerEvent.currentTarget.closest('.le-placement');
    if (!overlay) return;
    setDrag({
      pointerId: pointerEvent.pointerId,
      eventId,
      point: pointFromClient(overlay, pointerEvent.clientX, pointerEvent.clientY)
    });
  };

  const moveDrag = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
    pointerEvent.preventDefault();
    setDrag({ ...drag, point: pointFromClient(pointerEvent.currentTarget, pointerEvent.clientX, pointerEvent.clientY) });
  };

  const finishDrag = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
    pointerEvent.preventDefault();
    try {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    } catch {
      // Pointer capture can already be released when the browser loses focus.
    }
    onCommitAnchor(drag.eventId, drag.point);
    setDrag(null);
  };

  const dropAsset = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const assetKey = event.dataTransfer.getData(SCICON_ASSET_DRAG_TYPE);
    if (!assetKey || !selectedEventId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: clamp((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp((event.clientY - bounds.top) / Math.max(1, bounds.height))
    };
    onDropAsset(selectedEventId, assetKey, anchor);
  };

  return (
    <div
      className="le-placement"
      aria-label="Place mode. Select and drag real game objects to set their spawn position."
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={() => setDrag(null)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(SCICON_ASSET_DRAG_TYPE)) event.preventDefault();
      }}
      onDrop={dropAsset}
    >
      <div className="le-placement__hint">Paused place mode · drag a phase handle or drop a compatible sprite</div>

      {wave.events.map((event, index) => {
        const liveBounds = groups.get(event.id);
        const fallback = defaultAnchor(event);
        const point = drag?.eventId === event.id
          ? drag.point
          : event.spawnAnchor ?? (liveBounds
            ? { x: liveBounds.left + liveBounds.width / 2, y: liveBounds.top + liveBounds.height / 2 }
            : fallback);
        const asset = ASSET_CATALOG[eventAssetKey(event)];
        const selected = event.id === selectedEventId;
        const showHandle = selected || Boolean(liveBounds) || Boolean(event.spawnAnchor);
        return (
          <div key={event.id}>
            {liveBounds ? (
              <button
                className={`le-placement__bounds${selected ? ' is-selected' : ''}`}
                type="button"
                style={{
                  left: `${liveBounds.left * 100}%`,
                  top: `${liveBounds.top * 100}%`,
                  width: `${liveBounds.width * 100}%`,
                  height: `${liveBounds.height * 100}%`
                }}
                aria-label={`Select ${event.label} in the live game`}
                onClick={() => onSelectEvent(event.id)}
              />
            ) : null}
            {showHandle ? (
              <div
                className={`le-placement__handle le-placement__handle--${event.kind}${selected ? ' is-selected' : ''}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                role="button"
                tabIndex={0}
                aria-label={`${selected ? 'Move' : 'Select'} ${event.label}`}
                title={`${event.label} · ${Math.round(point.x * 100)}%, ${Math.round(point.y * 100)}%`}
                onPointerDown={(pointerEvent) => startDrag(pointerEvent, event.id)}
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  onSelectEvent(event.id);
                }}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === 'Enter' || keyEvent.key === ' ') onSelectEvent(event.id);
                  const offsets: Record<string, NormalizedPoint> = {
                    ArrowLeft: { x: -0.01, y: 0 },
                    ArrowRight: { x: 0.01, y: 0 },
                    ArrowUp: { x: 0, y: -0.01 },
                    ArrowDown: { x: 0, y: 0.01 }
                  };
                  const offset = offsets[keyEvent.key];
                  if (offset) {
                    keyEvent.preventDefault();
                    onCommitAnchor(event.id, {
                      x: clamp(point.x + offset.x),
                      y: clamp(point.y + offset.y)
                    });
                  }
                }}
              >
                <img src={asset.paths[0]} alt="" draggable={false} />
                <span>{index + 1}</span>
                {selected ? <strong>{event.label}</strong> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default GameplayPlacementOverlay;
