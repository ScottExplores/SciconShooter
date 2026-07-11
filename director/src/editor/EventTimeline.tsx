import type { WaveEvent } from '../../../game-config/types';
import { EditorIcon } from './EditorIcon';

interface EventTimelineProps {
  events: WaveEvent[];
  selectedEventId: string;
  onSelect: (event: WaveEvent) => void;
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remaining.toFixed(remaining % 1 ? 1 : 0).padStart(2, '0')}`;
};

export function EventTimeline({ events, selectedEventId, onSelect }: EventTimelineProps) {
  const ordered = [...events].sort((left, right) => left.startSeconds - right.startSeconds);

  return (
    <div className="le-event-timeline" aria-label="Selected wave phases and encounters">
      {ordered.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`le-event le-event--${item.kind}${item.id === selectedEventId ? ' is-selected' : ''}`}
          aria-pressed={item.id === selectedEventId}
          onClick={() => onSelect(item)}
        >
          <EditorIcon name={item.kind === 'boss' ? 'boss' : item.kind === 'asteroid-belt' ? 'asteroid' : 'spawn'} />
          <span>
            <strong>{item.label}</strong>
            <small>{formatTime(item.startSeconds)} · {item.kind === 'boss' ? 'Boss' : item.kind === 'asteroid-belt' ? 'Asteroid belt' : item.kind === 'spawn' ? 'Enemy phase' : item.kind}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
