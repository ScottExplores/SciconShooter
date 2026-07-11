import { useEffect, useRef, useState } from 'react';
import type { ReviewRequest } from '@director/domain/types';

type Anchor = ReviewRequest['anchor'];

export interface LivePreviewAnnotationsProps {
  enabled: boolean;
  reviews: ReviewRequest[];
  contextLabel: string;
  disabled?: boolean;
  onCreate: (anchor: Anchor, note: string) => Promise<void> | void;
}

const clamp = (value: number) => Math.max(0.02, Math.min(0.98, value));

export function LivePreviewAnnotations({
  enabled,
  reviews,
  contextLabel,
  disabled = false,
  onCreate
}: LivePreviewAnnotationsProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      setNote('');
    }
  }, [enabled]);

  useEffect(() => {
    if (anchor) noteRef.current?.focus();
  }, [anchor]);

  const placePin = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || saving) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnchor({
      x: clamp((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp((event.clientY - bounds.top) / Math.max(1, bounds.height))
    });
    setNote('');
  };

  const save = async () => {
    const trimmed = note.trim();
    if (!anchor || !trimmed || saving) return;
    setSaving(true);
    try {
      await onCreate(anchor, trimmed);
      setAnchor(null);
      setNote('');
    } catch {
      // The owning editor surfaces the API error and keeps this draft for retry.
    } finally {
      setSaving(false);
    }
  };

  return enabled ? (
    <div className="le-annotations" aria-label="Click the game preview to place a review note" onClick={placePin}>
          <div className="le-annotations__hint">Preview paused · click anywhere to pin a visual note</div>
          {reviews.map((review) => (
            <button
              key={review.id}
              className={`le-annotation-pin le-annotation-pin--${review.status}`}
              type="button"
              style={{ left: `${review.anchor.x * 100}%`, top: `${review.anchor.y * 100}%` }}
              title={`${review.target}: ${review.note}`}
              aria-label={`Review ${review.sequence}: ${review.note}`}
              onClick={(event) => event.stopPropagation()}
            >
              {review.sequence}
            </button>
          ))}

          {anchor ? (
            <>
              <span className="le-annotation-pin le-annotation-pin--pending" style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}>+</span>
              <div
                className={`le-annotation-composer${anchor.x > 0.62 ? ' is-left' : ''}${anchor.y > 0.6 ? ' is-up' : ''}`}
                style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
                role="dialog"
                aria-label="New visual review note"
                onClick={(event) => event.stopPropagation()}
              >
                <strong>New visual note</strong>
                <span>{contextLabel}</span>
                <textarea
                  ref={noteRef}
                  value={note}
                  maxLength={2000}
                  rows={3}
                  placeholder="What should change here?"
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void save();
                    if (event.key === 'Escape') setAnchor(null);
                  }}
                />
                <div>
                  <button type="button" disabled={saving} onClick={() => setAnchor(null)}>Cancel</button>
                  <button className="is-primary" type="button" disabled={!note.trim() || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save pin'}</button>
                </div>
              </div>
            </>
          ) : null}
    </div>
  ) : null;
}

export default LivePreviewAnnotations;
