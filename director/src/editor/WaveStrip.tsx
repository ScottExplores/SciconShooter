import { useState } from 'react';
import type { WaveDefinition } from '../../../game-config/types';
import { EditorIcon } from './EditorIcon';

interface WaveStripProps {
  waves: WaveDefinition[];
  selectedWaveId: string;
  onSelect: (waveId: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onReorder: (sourceWaveId: string, targetWaveId: string) => void;
}

export function WaveStrip({
  waves,
  selectedWaveId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onReorder
}: WaveStripProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const selectedIndex = waves.findIndex((wave) => wave.id === selectedWaveId);

  return (
    <section className="le-waves" aria-label="Wave order">
      <div className="le-wave-list">
        {waves.map((wave, index) => (
          <div
            key={wave.id}
            draggable
            className={draggedId === wave.id ? 'is-dragging' : undefined}
            onDragStart={() => setDraggedId(wave.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggedId && draggedId !== wave.id) onReorder(draggedId, wave.id);
              setDraggedId(null);
            }}
          >
            <button
              type="button"
              className={`le-wave-card${wave.id === selectedWaveId ? ' is-selected' : ''}${draggedId === wave.id ? ' is-dragging' : ''}`}
              aria-current={wave.id === selectedWaveId ? 'true' : undefined}
              onClick={() => onSelect(wave.id)}
            >
              <span className="le-wave-card__number">{String(index + 1).padStart(2, '0')} · {Math.round(wave.durationSeconds)}s</span>
              <strong>{wave.name}</strong>
              <span className="le-wave-card__events" aria-label={`${wave.events.length} encounters`}>
                {wave.events.slice(0, 8).map((item) => (
                  <i
                    key={item.id}
                    className={item.kind === 'boss' ? 'is-boss' : item.kind === 'asteroid-belt' ? 'is-belt' : undefined}
                  />
                ))}
              </span>
              <small>Drag to reorder</small>
            </button>
          </div>
        ))}

        <button className="le-wave-card le-add-wave" type="button" onClick={onAdd}>
          <b aria-hidden="true">＋</b>
          <strong>Add wave</strong>
          <small>Starts with one formation encounter</small>
        </button>

        <div className="le-wave-actions" aria-label="Selected wave actions">
          <button className="le-icon-button" type="button" title="Duplicate wave" aria-label="Duplicate selected wave" disabled={selectedIndex < 0} onClick={onDuplicate}><EditorIcon name="copy" /></button>
          <button className="le-icon-button" type="button" title="Move wave earlier" aria-label="Move selected wave earlier" disabled={selectedIndex <= 0} onClick={() => onMove(-1)}><EditorIcon name="back" /></button>
          <button className="le-icon-button" type="button" title="Move wave later" aria-label="Move selected wave later" disabled={selectedIndex < 0 || selectedIndex >= waves.length - 1} onClick={() => onMove(1)}><EditorIcon name="forward" /></button>
          <button className="le-icon-button le-button--danger" type="button" title="Delete wave" aria-label="Delete selected wave" disabled={waves.length <= 1 || selectedIndex < 0} onClick={onDelete}><EditorIcon name="delete" /></button>
        </div>
      </div>
    </section>
  );
}
