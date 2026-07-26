import { useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react';
import type { WaveEvent } from '../../../game-config/types';
import { EditorIcon } from './EditorIcon';
import {
  buildEventTimelineTicks,
  clampEventTimelineStart,
  EVENT_TIMELINE_LANES,
  getEventTimelineClipPercent,
  getEventTimelineStartRange,
  layoutEventTimelineLane,
  moveEventTimelineStart,
  type EventTimelineMoveCommand
} from './eventTimelineModel';

interface EventTimelineProps {
  events: WaveEvent[];
  waveDurationSeconds: number;
  selectedEventId: string;
  onSelect: (event: WaveEvent) => void;
  onChangeStartSeconds: (event: WaveEvent, startSeconds: number) => void;
}

interface DragSession {
  eventId: string;
  pointerId: number;
  pointerStartX: number;
  authoredStartSeconds: number;
  trackWidth: number;
}

interface DragPreview {
  eventId: string;
  startSeconds: number;
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.max(0, seconds - minutes * 60);
  const precision = Math.abs(remaining - Math.round(remaining)) > 0.001 ? 1 : 0;
  return `${minutes}:${remaining.toFixed(precision).padStart(precision ? 4 : 2, '0')}`;
};

const iconForEvent = (event: WaveEvent) => (
  event.kind === 'boss'
    ? 'boss'
    : event.kind === 'asteroid-belt'
      ? 'asteroid'
      : 'spawn'
);

const commandForKey = (key: string): EventTimelineMoveCommand | null => {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return 'backward';
  if (key === 'ArrowRight' || key === 'ArrowUp') return 'forward';
  if (key === 'Home') return 'start';
  if (key === 'End') return 'end';
  return null;
};

export function EventTimeline({
  events,
  waveDurationSeconds,
  selectedEventId,
  onSelect,
  onChangeStartSeconds
}: EventTimelineProps) {
  const dragSessionRef = useRef<DragSession | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const ticks = useMemo(
    () => buildEventTimelineTicks(waveDurationSeconds),
    [waveDurationSeconds]
  );
  const laneLayouts = useMemo(
    () => EVENT_TIMELINE_LANES.map((lane) => ({
      ...lane,
      layout: layoutEventTimelineLane(events, lane.id)
    })),
    [events]
  );
  const selectedEvent = events.find((event) => event.id === selectedEventId);

  const startDrag = (pointerEvent: ReactPointerEvent<HTMLButtonElement>, event: WaveEvent) => {
    if (pointerEvent.button !== 0) return;
    const track = pointerEvent.currentTarget.parentElement;
    if (!track) return;
    const trackWidth = track.getBoundingClientRect().width;
    if (trackWidth <= 0) return;

    pointerEvent.preventDefault();
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    dragSessionRef.current = {
      eventId: event.id,
      pointerId: pointerEvent.pointerId,
      pointerStartX: pointerEvent.clientX,
      authoredStartSeconds: event.startSeconds,
      trackWidth
    };
    setDragPreview({ eventId: event.id, startSeconds: event.startSeconds });
    onSelect(event);
  };

  const proposedDragStart = (pointerEvent: ReactPointerEvent<HTMLButtonElement>, event: WaveEvent) => {
    const session = dragSessionRef.current;
    if (!session || session.eventId !== event.id || session.pointerId !== pointerEvent.pointerId) {
      return null;
    }
    const deltaSeconds = (
      (pointerEvent.clientX - session.pointerStartX)
      / session.trackWidth
      * waveDurationSeconds
    );
    return clampEventTimelineStart(
      event,
      waveDurationSeconds,
      session.authoredStartSeconds + deltaSeconds
    );
  };

  const moveDrag = (pointerEvent: ReactPointerEvent<HTMLButtonElement>, event: WaveEvent) => {
    const startSeconds = proposedDragStart(pointerEvent, event);
    if (startSeconds === null) return;
    pointerEvent.preventDefault();
    setDragPreview({ eventId: event.id, startSeconds });
  };

  const finishDrag = (
    pointerEvent: ReactPointerEvent<HTMLButtonElement>,
    event: WaveEvent,
    commit: boolean
  ) => {
    const startSeconds = proposedDragStart(pointerEvent, event);
    if (startSeconds === null) return;
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    }
    dragSessionRef.current = null;
    setDragPreview(null);
    if (commit && startSeconds !== event.startSeconds) {
      onChangeStartSeconds(event, startSeconds);
    }
  };

  const moveWithKeyboard = (
    keyboardEvent: ReactKeyboardEvent<HTMLButtonElement>,
    event: WaveEvent
  ) => {
    const command = commandForKey(keyboardEvent.key);
    if (!command) return;
    keyboardEvent.preventDefault();
    const stepSeconds = keyboardEvent.shiftKey ? 1 : keyboardEvent.altKey ? 0.1 : 0.5;
    const startSeconds = moveEventTimelineStart(
      event,
      waveDurationSeconds,
      event.startSeconds,
      command,
      stepSeconds
    );
    onSelect(event);
    if (startSeconds !== event.startSeconds) onChangeStartSeconds(event, startSeconds);
  };

  return (
    <section className="le-event-timeline" aria-labelledby="wave-timeline-title">
      <header className="le-event-timeline__header">
        <div>
          <strong id="wave-timeline-title">Wave timeline</strong>
          <span>{formatTime(waveDurationSeconds)} active clock</span>
        </div>
        <span aria-live="polite">
          {selectedEvent
            ? `${selectedEvent.label} at ${formatTime(selectedEvent.startSeconds)}`
            : 'Select an encounter clip'}
        </span>
      </header>
      <p id="wave-timeline-help" className="le-visually-hidden">
        Drag a clip horizontally, or use arrow keys to change its start time.
        Hold Shift for one-second keyboard steps. Home and End move to the allowed limits.
      </p>
      <div className="le-event-timeline__scroll">
        <div className="le-event-timeline__canvas">
          <div className="le-event-timeline__ruler" aria-hidden="true">
            <span>Active time</span>
            <div>
              {ticks.map((tick) => (
                <i
                  key={tick.seconds}
                  style={{ '--timeline-tick-left': `${tick.percent}%` } as CSSProperties}
                >
                  {formatTime(tick.seconds)}
                </i>
              ))}
            </div>
          </div>
          <div className="le-event-timeline__lanes">
            {laneLayouts.map(({ id, label, layout }) => (
              <div
                key={id}
                className="le-event-timeline__lane"
                data-lane={id}
                style={{ '--timeline-row-count': layout.rowCount } as CSSProperties}
              >
                <span>{label}</span>
                <div className="le-event-timeline__lane-track">
                  {ticks.map((tick) => (
                    <i
                      key={tick.seconds}
                      className="le-event-timeline__gridline"
                      style={{ '--timeline-tick-left': `${tick.percent}%` } as CSSProperties}
                    />
                  ))}
                  {layout.items.map(({ event, row }) => {
                    const displayedStart = dragPreview?.eventId === event.id
                      ? dragPreview.startSeconds
                      : event.startSeconds;
                    const position = getEventTimelineClipPercent(
                      event,
                      waveDurationSeconds,
                      displayedStart
                    );
                    const range = getEventTimelineStartRange(event, waveDurationSeconds);
                    const selected = event.id === selectedEventId;
                    const dragging = dragPreview?.eventId === event.id;
                    const style = {
                      '--timeline-clip-left': `${position.left}%`,
                      '--timeline-clip-width': `${position.width}%`,
                      '--timeline-clip-row': row
                    } as CSSProperties;

                    return (
                      <button
                        key={event.id}
                        type="button"
                        role="slider"
                        className={`le-event-timeline__clip le-event-timeline__clip--${event.kind}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
                        style={style}
                        aria-label={`${event.label} start time`}
                        aria-describedby="wave-timeline-help"
                        aria-valuemin={range.minimum}
                        aria-valuemax={range.maximum}
                        aria-valuenow={displayedStart}
                        aria-valuetext={`${formatTime(displayedStart)}; duration ${formatTime(event.durationSeconds)}`}
                        aria-orientation="horizontal"
                        title={`${event.label} · ${formatTime(displayedStart)} · ${event.blocksWaveClock ? 'blocks the wave clock' : 'runs on the active clock'}`}
                        onClick={() => onSelect(event)}
                        onKeyDown={(keyboardEvent) => moveWithKeyboard(keyboardEvent, event)}
                        onPointerDown={(pointerEvent) => startDrag(pointerEvent, event)}
                        onPointerMove={(pointerEvent) => moveDrag(pointerEvent, event)}
                        onPointerUp={(pointerEvent) => finishDrag(pointerEvent, event, true)}
                        onPointerCancel={(pointerEvent) => finishDrag(pointerEvent, event, false)}
                      >
                        <EditorIcon name={iconForEvent(event)} />
                        <span>
                          <strong>{event.label}</strong>
                          <small>{formatTime(displayedStart)}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
