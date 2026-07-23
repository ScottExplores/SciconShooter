import { useEffect, useRef, useState } from 'react';
import { ASSET_CATALOG, ENEMY_CATALOG, SPAWN_PATTERN_CATALOG } from '@game/game-config/catalog';
import type { FormationSlot, SpawnEvent, SpawnPatternId } from '@game/game-config/types';
import { EditorIcon } from '@director/editor/EditorIcon';
import {
  cloneFormationSlots,
  createFormationSlots,
  FORMATION_TEMPLATES,
  minimumFormationSpacing,
  mirrorFormationSlots,
  normalizeFormationSlots,
  rotateFormationSlots,
  scaleFormationWidth,
  type FormationTemplate
} from './formationWorkshopModel';

type WorkshopViewport = Readonly<{ width: number; height: number }>;

const GROUPED_CHOREOGRAPHIES = Object.values(SPAWN_PATTERN_CATALOG).filter((pattern) => (
  pattern.id !== 'single-random' && pattern.id !== 'asteroid-lanes'
));

const fallbackTemplate = (event: SpawnEvent) => (
  FORMATION_TEMPLATES.find((template) => template.choreography === event.patternId)
  ?? FORMATION_TEMPLATES[0]
);

const isGroupedChoreography = (patternId: SpawnPatternId): patternId is FormationTemplate['choreography'] => (
  patternId !== 'single-random' && patternId !== 'asteroid-lanes'
);

const starterSlotsFor = (event: SpawnEvent, template = fallbackTemplate(event)) => (
  createFormationSlots(template.id, event.count)
);

const sameSlots = (left: readonly FormationSlot[], right: readonly FormationSlot[]) => (
  left.length === right.length && left.every((slot, index) => slot.x === right[index].x && slot.y === right[index].y)
);

const updateSlotsOnEvent = (event: SpawnEvent, slots: readonly FormationSlot[]): SpawnEvent => {
  const normalized = normalizeFormationSlots(slots);
  return {
    ...event,
    count: normalized.length,
    durationSeconds: Math.max(event.durationSeconds, Math.max(0, normalized.length - 1) * event.spawnIntervalSeconds),
    formationSlots: normalized
  };
};

export function FormationTemplateRail({
  event,
  onApply
}: {
  event: SpawnEvent;
  onApply: (template: FormationTemplate) => void;
}) {
  return (
    <div className="cl-formation-library">
      <header className="cl-panel-heading">
        <div><p>Build</p><strong>Formation templates</strong></div>
        <span>{event.formationSlots ? 'Custom' : 'Built in'}</span>
      </header>
      <p className="cl-formation-library__intro">Start with a readable shape, then drag its numbered slots into your own attack pattern.</p>
      <button className="cl-button cl-button--cyan cl-formation-new" type="button" onClick={() => onApply(FORMATION_TEMPLATES[0])}><EditorIcon name="add" /> New formation</button>
      <div className="cl-formation-template-list">
        {FORMATION_TEMPLATES.map((template) => (
          <button
            type="button"
            key={template.id}
            className={event.formationSlots && sameSlots(event.formationSlots, template.slots) ? 'is-selected' : ''}
            aria-pressed={Boolean(event.formationSlots && sameSlots(event.formationSlots, template.slots))}
            onClick={() => onApply(template)}
          >
            <span className={`cl-formation-template-icon cl-formation-template-icon--${template.id}`} aria-hidden="true">
              {template.slots.slice(0, 12).map((slot, index) => <i key={index} style={{ left: `${slot.x * 100}%`, top: `${((slot.y - 0.08) / 0.38) * 100}%` }} />)}
            </span>
            <span><strong>{template.label}</strong><small>{template.slots.length} slots · {template.description}</small></span>
          </button>
        ))}
      </div>
      <div className="cl-formation-library__note">
        <strong>No coding required</strong>
        <span>Templates are copied into this encounter, so changing one never alters another mission by surprise.</span>
      </div>
    </div>
  );
}

export function FormationDesignBoard({
  event,
  viewport,
  onChange,
  onPlay
}: {
  event: SpawnEvent;
  viewport: WorkshopViewport;
  onChange: (event: SpawnEvent) => void;
  onPlay: () => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [undoStack, setUndoStack] = useState<FormationSlot[][]>([]);
  const [redoStack, setRedoStack] = useState<FormationSlot[][]>([]);
  const [dragSlots, setDragSlots] = useState<FormationSlot[] | null>(null);
  const dragOriginRef = useRef<FormationSlot[] | null>(null);
  const dragSlotsRef = useRef<FormationSlot[] | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const template = fallbackTemplate(event);
  const slots = event.formationSlots ?? starterSlotsFor(event, template);
  const visibleSlots = dragSlots ?? slots;
  const editable = Boolean(event.formationSlots);
  const enemyKey = event.enemies[0]?.spriteKey ?? 'ENEMY_DRONE_FRAMES';
  const enemyImage = ASSET_CATALOG[enemyKey]?.paths[0] ?? ASSET_CATALOG.ENEMY_DRONE_FRAMES.paths[0];
  const playerImage = ASSET_CATALOG.PLAYER_SHIP.paths[0];
  const backgroundImage = ASSET_CATALOG.GAME_BG_BACK.paths[0];

  useEffect(() => {
    setSelectedSlot(0);
    setUndoStack([]);
    setRedoStack([]);
    setDragSlots(null);
    dragSlotsRef.current = null;
  }, [event.id]);

  const applySlots = (nextSlots: readonly FormationSlot[], record = true) => {
    if (record) setUndoStack((history) => [...history.slice(-19), cloneFormationSlots(slots)]);
    setRedoStack([]);
    onChange(updateSlotsOnEvent(event, nextSlots));
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, cloneFormationSlots(slots)]);
    onChange(updateSlotsOnEvent(event, previous));
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, cloneFormationSlots(slots)]);
    onChange(updateSlotsOnEvent(event, next));
  };

  const moveSlot = (index: number, clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !editable) return;
    const next = cloneFormationSlots(dragSlotsRef.current ?? slots);
    next[index] = {
      x: (clientX - rect.left) / Math.max(1, rect.width),
      y: (clientY - rect.top) / Math.max(1, rect.height)
    };
    const normalized = normalizeFormationSlots(next);
    dragSlotsRef.current = normalized;
    setDragSlots(normalized);
  };

  const addSlot = () => {
    if (slots.length >= 48) return;
    const candidates = Array.from({ length: 96 }, (_, index) => ({
      x: 0.1 + (index % 12) * (0.8 / 11),
      y: 0.1 + Math.floor(index / 12) * (0.34 / 7)
    }));
    const candidate = candidates.find((point) => slots.every((slot) => (
      Math.hypot(point.x - slot.x, point.y - slot.y) > 0.018
    )));
    if (!candidate) return;
    applySlots([...slots, candidate]);
    setSelectedSlot(slots.length);
  };

  const deleteSlot = () => {
    if (!editable || slots.length <= 2) return;
    applySlots(slots.filter((_, index) => index !== selectedSlot));
    setSelectedSlot((index) => Math.max(0, Math.min(index, slots.length - 2)));
  };

  return (
    <>
      <div
        ref={boardRef}
        className={`cl-formation-board${editable ? ' is-editable' : ''}`}
        style={{
          aspectRatio: `${viewport.width} / ${viewport.height}`,
          backgroundImage: `linear-gradient(rgba(3, 14, 25, .2), rgba(3, 14, 25, .2)), url(${backgroundImage})`
        }}
        aria-label="Formation design board. Select a slot, then use the arrow keys or drag it."
        role="group"
      >
        <div className="cl-formation-safe-zone"><span>Safe upper combat zone</span></div>
        <div className="cl-formation-grid" aria-hidden="true" />
        {!editable ? (
          <div className="cl-formation-convert">
            <strong>{isGroupedChoreography(event.patternId) ? `${template.label} uses the built-in layout` : `${SPAWN_PATTERN_CATALOG[event.patternId].label} has no fixed slots`}</strong>
            <span>{isGroupedChoreography(event.patternId) ? 'Make a copy before moving individual enemy slots.' : `Converting keeps all ${event.count} enemies and changes their choreography to ${template.label}.`}</span>
            <button className="cl-button cl-button--cyan" type="button" onClick={() => {
              const nextEvent = isGroupedChoreography(event.patternId)
                ? event
                : { ...event, patternId: template.choreography };
              setUndoStack((history) => [...history.slice(-19), cloneFormationSlots(slots)]);
              setRedoStack([]);
              onChange(updateSlotsOnEvent(nextEvent, starterSlotsFor(event, template)));
            }}><EditorIcon name="edit" /> Make {event.count} slots editable</button>
          </div>
        ) : null}
        {visibleSlots.map((slot, index) => (
          <button
            type="button"
            key={index}
            className={`cl-formation-slot${selectedSlot === index ? ' is-selected' : ''}`}
            style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%` }}
            aria-label={`Formation slot ${index + 1}`}
            aria-pressed={selectedSlot === index}
            onPointerDown={(input) => {
              setSelectedSlot(index);
              if (!editable) return;
              dragOriginRef.current = cloneFormationSlots(slots);
              dragSlotsRef.current = cloneFormationSlots(slots);
              setDragSlots(cloneFormationSlots(slots));
              input.currentTarget.setPointerCapture(input.pointerId);
            }}
            onPointerMove={(input) => {
              if (!input.currentTarget.hasPointerCapture(input.pointerId)) return;
              input.preventDefault();
              moveSlot(index, input.clientX, input.clientY);
            }}
            onPointerUp={(input) => {
              if (input.currentTarget.hasPointerCapture(input.pointerId)) input.currentTarget.releasePointerCapture(input.pointerId);
              const origin = dragOriginRef.current;
              const next = dragSlotsRef.current;
              dragOriginRef.current = null;
              dragSlotsRef.current = null;
              setDragSlots(null);
              if (origin && next && !sameSlots(origin, next)) {
                setUndoStack((history) => [...history.slice(-19), origin]);
                setRedoStack([]);
                onChange(updateSlotsOnEvent(event, next));
              }
            }}
            onPointerCancel={(input) => {
              if (input.currentTarget.hasPointerCapture(input.pointerId)) input.currentTarget.releasePointerCapture(input.pointerId);
              dragOriginRef.current = null;
              dragSlotsRef.current = null;
              setDragSlots(null);
            }}
            onKeyDown={(input) => {
              if (!editable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(input.key)) return;
              input.preventDefault();
              const next = cloneFormationSlots(slots);
              const amount = input.shiftKey ? 0.025 : 0.01;
              if (input.key === 'ArrowLeft') next[index].x -= amount;
              if (input.key === 'ArrowRight') next[index].x += amount;
              if (input.key === 'ArrowUp') next[index].y -= amount;
              if (input.key === 'ArrowDown') next[index].y += amount;
              applySlots(next);
            }}
          >
            <img src={enemyImage} alt="" draggable={false} />
            <span>{index + 1}</span>
          </button>
        ))}
        <img className="cl-formation-player" src={playerImage} alt="Player start" draggable={false} />
      </div>
      <div className="cl-formation-tools" aria-label="Formation editing tools">
        <button className="cl-button" type="button" onClick={undo} disabled={!undoStack.length}><EditorIcon name="undo" /> Undo</button>
        <button className="cl-button" type="button" onClick={redo} disabled={!redoStack.length}><EditorIcon name="forward" /> Redo</button>
        <button className="cl-button" type="button" onClick={() => applySlots(mirrorFormationSlots(slots))}><EditorIcon name="mirror" /> Mirror</button>
        <button className="cl-button" type="button" onClick={() => applySlots(rotateFormationSlots(slots))}><EditorIcon name="restart" /> Rotate</button>
        <button className="cl-button" type="button" onClick={() => applySlots(scaleFormationWidth(slots, 1.12))}>Widen</button>
        <button className="cl-button" type="button" onClick={() => applySlots(scaleFormationWidth(slots, 0.88))}>Tighten</button>
        <button className="cl-button" type="button" onClick={addSlot} disabled={slots.length >= 48}><EditorIcon name="add" /> Add slot</button>
        <button className="cl-button" type="button" onClick={deleteSlot} disabled={!editable || slots.length <= 2}><EditorIcon name="delete" /> Remove</button>
        <button className="cl-button cl-button--cyan" type="button" onClick={onPlay}><EditorIcon name="play" /> Play formation</button>
      </div>
    </>
  );
}

export function FormationWorkshopInspector({
  event,
  viewport,
  onChange,
  onSave,
  onPromote,
  promotionMode,
  onPromotionModeChange
}: {
  event: SpawnEvent;
  viewport: WorkshopViewport;
  onChange: (event: SpawnEvent) => void;
  onSave: () => void;
  onPromote: () => void;
  promotionMode: 'event' | 'wave';
  onPromotionModeChange: (mode: 'event' | 'wave') => void;
}) {
  const slots = event.formationSlots ?? starterSlotsFor(event);
  const spacing = minimumFormationSpacing(slots, viewport);
  const safe = slots.every((slot) => slot.x >= 0.06 && slot.x <= 0.94 && slot.y >= 0.08 && slot.y <= 0.46);
  const spacingGood = spacing >= Math.max(32, viewport.width * 0.075);
  const enemyOptions = Object.values(ENEMY_CATALOG);
  const primaryEnemy = event.enemies[0];

  const updatePrimaryEnemy = (enemyId: string) => {
    const catalogEnemy = ENEMY_CATALOG[enemyId as keyof typeof ENEMY_CATALOG];
    if (!catalogEnemy || !primaryEnemy) return;
    onChange({
      ...event,
      enemies: event.enemies.map((enemy, index) => index === 0
        ? { ...enemy, enemyId: catalogEnemy.id, spriteKey: catalogEnemy.defaultSpriteKey }
        : enemy)
    });
  };

  return (
    <div className="cl-formation-inspector">
      <header className="cl-panel-heading"><div><p>Safe live edits</p><strong>Formation Workshop</strong></div><span>{slots.length} slots</span></header>
      <div className="cl-formation-inspector__fields">
        <label><span>Formation name</span><input value={event.label} maxLength={100} onChange={(input) => onChange({ ...event, label: input.target.value })} /></label>
        <label><span>Primary enemy</span><select value={primaryEnemy?.enemyId ?? enemyOptions[0].id} onChange={(input) => updatePrimaryEnemy(input.target.value)}>{enemyOptions.map((enemy) => <option key={enemy.id} value={enemy.id}>{enemy.label}</option>)}</select></label>
        <label><span>Entry & attack style</span><select value={event.patternId} onChange={(input) => onChange({ ...event, patternId: input.target.value as SpawnPatternId })}>{isGroupedChoreography(event.patternId) ? null : <option value={event.patternId}>{SPAWN_PATTERN_CATALOG[event.patternId].label} · convert to edit slots</option>}{GROUPED_CHOREOGRAPHIES.map((pattern) => <option value={pattern.id} key={pattern.id}>{pattern.label}</option>)}</select></label>
        <label><span>Spawn gap</span><div className="cl-formation-number"><input type="number" value={event.spawnIntervalSeconds} min={0.05} max={10} step={0.05} onChange={(input) => {
          const spawnIntervalSeconds = Number(input.target.value);
          onChange({
            ...event,
            spawnIntervalSeconds,
            durationSeconds: Math.max(event.durationSeconds, Math.max(0, slots.length - 1) * spawnIntervalSeconds)
          });
        }} /><b>s</b></div></label>
        <label><span>Encounter duration</span><div className="cl-formation-number"><input type="number" value={event.durationSeconds} min={1} max={3600} step={0.5} onChange={(input) => onChange({ ...event, durationSeconds: Number(input.target.value) })} /><b>s</b></div></label>
        <label><span>Attack order</span><button className="cl-button" type="button" onClick={() => onChange(updateSlotsOnEvent(event, [...slots].reverse()))}>Reverse numbered order</button></label>
      </div>

      <div className="cl-formation-validation" aria-label="Formation validation">
        <div className={safe ? 'is-good' : 'is-warning'}><i /> <strong>Safe zone</strong><span>{safe ? 'All slots fit the authored combat area.' : 'Move highlighted slots into the safe area.'}</span></div>
        <div className={spacingGood ? 'is-good' : 'is-warning'}><i /> <strong>Spacing</strong><span>Minimum {Number.isFinite(spacing) ? `${Math.round(spacing)}px` : '—'} at this device size.</span></div>
      </div>

      <div className="cl-formation-hierarchy">
        <EditorIcon name="review" />
        <span><strong>How this fits together</strong>A Mission contains Waves. A Wave contains Encounters. A Formation is one enemy encounter.</span>
      </div>

      <div className="cl-formation-handoff">
        <button className="cl-button" type="button" onClick={onSave}><EditorIcon name="save" /> Save experiment preset</button>
        <select value={promotionMode} onChange={(input) => onPromotionModeChange(input.target.value as 'event' | 'wave')} aria-label="Formation handoff scope"><option value="event">Add this encounter to the wave</option><option value="wave">Add the whole experiment as a wave</option></select>
        <button className="cl-button cl-button--amber" type="button" onClick={onPromote}><EditorIcon name="forward" /> Review draft in Mission Builder</button>
        <small>Draft only. The game file changes only after you choose Apply to game in Mission Builder.</small>
      </div>
    </div>
  );
}
