import { useMemo, useState } from 'react';
import type { LevelDefinition, WaveDefinition } from '../../../game-config/types';
import type { ReviewRequest } from '@director/domain/types';
import { EditorIcon } from './EditorIcon';

type ReviewFilter = 'open' | 'resolved' | 'all';

interface ReviewNotesPanelProps {
  level: LevelDefinition;
  wave: WaveDefinition;
  reviews: ReviewRequest[];
  configVersion: string | null;
  updatingReviewId: string | null;
  onToggleStatus: (review: ReviewRequest) => void;
}

const formatReviewTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Saved locally';
};

export function ReviewNotesPanel({
  level,
  wave,
  reviews,
  configVersion,
  updatingReviewId,
  onToggleStatus
}: ReviewNotesPanelProps) {
  const [filter, setFilter] = useState<ReviewFilter>('open');
  const visibleReviews = useMemo(() => reviews.filter((review) => (
    filter === 'all' || review.status === filter
  )), [filter, reviews]);

  return (
    <aside className="le-inspector le-review-panel" aria-label="Review notes">
      <header className="le-review-panel__header">
        <p>Actual game preview</p>
        <h2>Review notes</h2>
        <span>{level.name} / {wave.name}</span>
      </header>

      <div className="le-review-panel__instructions">
        <EditorIcon name="review" />
        <p><strong>Click anywhere on the game</strong> to pin a visual change request to this exact wave and configuration.</p>
      </div>

      <div className="le-review-panel__version">
        <span>Configuration</span>
        <code>{configVersion ?? 'Preparing draft fingerprint…'}</code>
      </div>

      <div className="le-review-filters" role="tablist" aria-label="Review note status">
        {(['open', 'resolved', 'all'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={filter === item}
            className={filter === item ? 'is-selected' : ''}
            onClick={() => setFilter(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <div className="le-review-list">
        {visibleReviews.map((review) => (
          <article key={review.id} className={`le-review-note le-review-note--${review.status}`}>
            <header>
              <span className="le-review-note__number">{review.sequence}</span>
              <strong>{review.target}</strong>
              <time>{formatReviewTime(review.createdAt)}</time>
            </header>
            <p>{review.note}</p>
            <div className="le-review-note__meta">
              <span>{Math.round(review.anchor.x * 100)}%, {Math.round(review.anchor.y * 100)}%</span>
              {review.context ? <span>{review.context.elapsedSeconds.toFixed(1)}s</span> : null}
              {review.context?.draft ? <span>Draft</span> : null}
            </div>
            <button
              className="le-button"
              type="button"
              disabled={updatingReviewId === review.id}
              onClick={() => onToggleStatus(review)}
            >
              <EditorIcon name="review" />
              {updatingReviewId === review.id
                ? 'Saving…'
                : review.status === 'open' ? 'Resolve note' : 'Reopen note'}
            </button>
          </article>
        ))}
        {visibleReviews.length === 0 ? (
          <div className="le-review-empty">
            <EditorIcon name="review" />
            <strong>No {filter === 'all' ? '' : `${filter} `}notes for this wave</strong>
            <p>Use the real game preview to place the first pin.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default ReviewNotesPanel;
