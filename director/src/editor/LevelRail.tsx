import type { LevelDefinition } from '../../../game-config/types';
import { EditorIcon } from './EditorIcon';

interface LevelRailProps {
  levels: LevelDefinition[];
  selectedLevelId: string;
  onSelect: (levelId: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function LevelRail({
  levels,
  selectedLevelId,
  onSelect,
  onAdd,
  onDuplicate,
  onRename,
  onDelete,
  onMove
}: LevelRailProps) {
  const selectedIndex = levels.findIndex((level) => level.id === selectedLevelId);

  return (
    <aside className="le-levels" aria-label="Campaign levels">
      <header className="le-panel-heading">
        <h2>Levels</h2>
        <button type="button" onClick={onAdd}><span aria-hidden="true">＋</span> New level</button>
      </header>

      <div className="le-level-list">
        {levels.map((level, index) => (
          <button
            key={level.id}
            type="button"
            className={`le-level-card${level.id === selectedLevelId ? ' is-selected' : ''}`}
            aria-current={level.id === selectedLevelId ? 'true' : undefined}
            onClick={() => onSelect(level.id)}
          >
            <span className="le-level-card__number">{String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong>{level.name}</strong>
              <small>{level.waves.length} wave{level.waves.length === 1 ? '' : 's'}</small>
            </span>
            <i className="le-level-card__dot" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="le-level-tools" aria-label="Selected level actions">
        <button className="le-icon-button" type="button" title="Rename level" aria-label="Rename selected level" disabled={selectedIndex < 0} onClick={onRename}><EditorIcon name="edit" /></button>
        <button className="le-icon-button" type="button" title="Duplicate level" aria-label="Duplicate selected level" disabled={selectedIndex < 0} onClick={onDuplicate}><EditorIcon name="copy" /></button>
        <button className="le-icon-button" type="button" title="Move level up" aria-label="Move selected level up" disabled={selectedIndex <= 0} onClick={() => onMove(-1)}><EditorIcon name="up" /></button>
        <button className="le-icon-button" type="button" title="Move level down" aria-label="Move selected level down" disabled={selectedIndex < 0 || selectedIndex >= levels.length - 1} onClick={() => onMove(1)}><EditorIcon name="down" /></button>
        <button className="le-icon-button le-button--danger" type="button" title="Delete level" aria-label="Delete selected level" disabled={levels.length <= 1 || selectedIndex < 0} onClick={onDelete}><EditorIcon name="delete" /></button>
      </div>

      <div className="le-local-note"><i aria-hidden="true" /><span>Applies only to the local game configuration until you approve a release.</span></div>
    </aside>
  );
}
