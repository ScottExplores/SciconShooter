import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import type { ReviewRequest } from '../domain/types';
import './review.css';

interface NewReviewInput {
  surface: ReviewRequest['surface'];
  configVersion: string;
  target: string;
  note: string;
  status: 'open';
  anchor: ReviewRequest['anchor'];
}

export interface ReviewBoardProps {
  reviews: ReviewRequest[];
  versions: Record<ReviewRequest['surface'], string>;
  status?: string;
  onCreate: (request: NewReviewInput) => Promise<void> | void;
  onUpdate: (id: string, updates: Partial<Pick<ReviewRequest, 'note' | 'status' | 'target'>>) => Promise<void> | void;
}

type ReviewFilter = 'open' | 'resolved' | 'all';
type Tool = 'pointer' | 'pin';
type ReviewViewport = 'desktop' | 'mobile';

const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Local';
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const WaveSnapshot = () => (
  <div className="review-snapshot review-snapshot--wave" aria-label="Wave preview snapshot">
    <div className="snapshot-command-row">
      <strong>Wave Director</strong>
      <span>Wave 1 · Open Orbit</span>
      <span>01:06 / 02:52</span>
    </div>
    <div className="snapshot-timeline">
      <div className="snapshot-lane-labels" aria-hidden="true">
        <span>Alerts</span><span>Mini-boss</span><span>Enemies</span><span>Asteroid belt</span><span>Boss</span>
      </div>
      <div className="snapshot-lanes">
        <div className="snapshot-lane"><i className="alert-mark alert-mark--one" /><i className="alert-mark alert-mark--two" /></div>
        <div className="snapshot-lane"><span className="snapshot-event snapshot-event--mini">Replication drone</span></div>
        <div className="snapshot-lane snapshot-enemy-lane" />
        <div className="snapshot-lane"><span className="snapshot-event snapshot-event--asteroids">Asteroid belt</span></div>
        <div className="snapshot-lane"><span className="snapshot-event snapshot-event--boss">Gatekeeper</span></div>
        <i className="snapshot-playhead" />
      </div>
    </div>
    <div className="snapshot-game-window">
      <img className="snapshot-planet" src="/game-art/backgrounds/parallax-big-planet.png" alt="" />
      <img className="snapshot-boss" src="/game-art/bosses/final-boss-sentinel.png" alt="Gatekeeper boss" />
      <div className="snapshot-asteroids" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <img key={index} src={`/game-art/enemies/asteroid-${(index % 5) + 1}.png`} alt="" />
        ))}
      </div>
      <img className="snapshot-ship" src="/game-art/branding/researchhub-ship.png" alt="Player ship" />
    </div>
  </div>
);

const ScorecardSnapshot = () => (
  <div className="review-snapshot review-snapshot--scorecard" aria-label="Scorecard preview snapshot">
    <div className="review-card-mini">
      <p>SCICON SHOOTER</p>
      <h2>MISSION RECORD</h2>
      <img className="review-card-boss" src="/game-art/bosses/final-boss-sentinel.png" alt="Gatekeeper boss" />
      <img className="review-card-ship" src="/game-art/branding/researchhub-ship.png" alt="Player ship" />
      <div className="review-card-score"><span>FINAL SCORE</span><strong>12,450</strong></div>
      <div className="review-card-metrics"><span>WAVE <strong>3</strong></span><span>TARGETS <strong>84</strong></span><span>COINS <strong>26</strong></span><span>FLIGHT <strong>02:18</strong></span></div>
      <div className="review-card-footer">GATEKEEPER SECTOR · SERVER VERIFIED</div>
    </div>
  </div>
);

export const ReviewBoard = ({ reviews, versions, status, onCreate, onUpdate }: ReviewBoardProps) => {
  const [surface, setSurface] = useState<ReviewRequest['surface']>('wave');
  const [filter, setFilter] = useState<ReviewFilter>('open');
  const [tool, setTool] = useState<Tool>('pin');
  const [viewport, setViewport] = useState<ReviewViewport>('desktop');
  const [zoom, setZoom] = useState(1);
  const [anchor, setAnchor] = useState({ x: 0.66, y: 0.52 });
  const [target, setTarget] = useState('Wave preview');
  const [note, setNote] = useState('');
  const [snapshotAt, setSnapshotAt] = useState(() => new Date().toISOString());
  const version = versions[surface];

  const visibleReviews = useMemo(() => reviews.filter((review) => (
    review.surface === surface && (filter === 'all' || review.status === filter)
  )), [filter, reviews, surface]);

  const canvasReviews = useMemo(() => reviews.filter((review) => (
    review.surface === surface && review.context?.source !== 'level-editor'
  )), [reviews, surface]);

  const setSurfaceAndTarget = (nextSurface: ReviewRequest['surface']) => {
    setSurface(nextSurface);
    setTarget(nextSurface === 'wave' ? 'Wave preview' : 'Scorecard preview');
  };

  const placeAnnotation = (event: React.MouseEvent<HTMLDivElement>) => {
    if (tool === 'pointer') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnchor({
      x: clamp((event.clientX - bounds.left) / bounds.width, 0.02, 0.98),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0.02, 0.98)
    });
  };

  const addRequest = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    await onCreate({ surface, configVersion: version, target: target.trim() || 'Visual review', note: trimmed, status: 'open', anchor });
    setNote('');
  };

  const exportPacket = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), version, snapshotAt, surface, viewport, reviews }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `scicon-review-${surface}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="review-workspace" aria-labelledby="review-title">
      <header className="workspace-heading review-heading">
        <div>
          <h1 id="review-title">Review &amp; Annotation</h1>
          <p>Pin visual change requests to a versioned Director preview.</p>
        </div>
      </header>

      <div className="review-sourcebar panel-line">
        <div className="segmented-control" aria-label="Review source">
          <button className={surface === 'scorecard' ? 'is-selected' : ''} type="button" onClick={() => setSurfaceAndTarget('scorecard')}>Scorecard preview</button>
          <button className={surface === 'wave' ? 'is-selected' : ''} type="button" onClick={() => setSurfaceAndTarget('wave')}>Wave preview</button>
        </div>
        <label>Version<select value={version} disabled><option>{version}</option></select></label>
        <label>Viewport<select value={viewport} onChange={(event) => setViewport(event.target.value as ReviewViewport)}><option value="desktop">1920 × 1080</option><option value="mobile">390 × 844</option></select></label>
        <button className="button button--cyan" type="button" onClick={() => setSnapshotAt(new Date().toISOString())}><Icon name="camera" />Capture current view</button>
      </div>

      <div className="review-layout">
        <div className="review-canvas-panel">
          <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
            {(['pointer', 'pin'] as Tool[]).map((item) => (
              <button key={item} className={tool === item ? 'is-selected' : ''} type="button" aria-label={item} onClick={() => setTool(item)}>
                <Icon name={item === 'pointer' ? 'review' : 'pin'} />
              </button>
            ))}
            <span className="toolbar-divider" />
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => clamp(value + 0.1, 0.7, 1.4))}><Icon name="zoom-in" /></button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => clamp(value - 0.1, 0.7, 1.4))}><Icon name="zoom-out" /></button>
            <button type="button" aria-label="Fit view" onClick={() => setZoom(1)}><Icon name="fit" /></button>
            <output>{Math.round(zoom * 100)}%</output>
          </div>
          <div className="annotation-stage" onClick={placeAnnotation}>
            <div className={`annotation-content annotation-content--${viewport}`} style={{ transform: `scale(${zoom})` }}>
              {surface === 'wave' ? <WaveSnapshot /> : <ScorecardSnapshot />}
              {canvasReviews.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  className={`annotation-pin annotation-pin--${review.status}`}
                  style={{ left: `${review.anchor.x * 100}%`, top: `${review.anchor.y * 100}%` }}
                  title={review.note}
                  onClick={(event) => event.stopPropagation()}
                >
                  {review.sequence}
                </button>
              ))}
              {tool !== 'pointer' && note ? <span className="annotation-pending" style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}>+</span> : null}
            </div>
          </div>
        </div>

        <aside className="change-requests" aria-label="Change requests">
          <h2>Change requests</h2>
          <div className="request-filters" role="tablist" aria-label="Request status">
            {(['open', 'resolved', 'all'] as ReviewFilter[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? 'is-selected' : ''} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
            ))}
          </div>
          <div className="request-list">
            {visibleReviews.map((review) => (
              <article key={review.id} className={`request-row request-row--${review.status}`}>
                <div className="request-meta">
                  <span className="request-number">{review.sequence}</span>
                  <strong>{review.target}</strong>
                  <time>{formatTime(review.createdAt)}</time>
                </div>
                {review.context?.source === 'level-editor' ? (
                  <div className="request-context">
                    <span>Live level preview</span>
                    <strong>{review.context.levelName} / {review.context.waveName}{review.context.eventLabel ? ` / ${review.context.eventLabel}` : ''}</strong>
                    <small>r{review.context.campaignRevision} · {review.context.elapsedSeconds.toFixed(1)}s{review.context.draft ? ` · draft ${review.context.draftContentHash?.slice(7, 15) ?? ''}` : ''}</small>
                  </div>
                ) : null}
                <p>{review.note}</p>
                <button type="button" onClick={() => void onUpdate(review.id, { status: review.status === 'open' ? 'resolved' : 'open' })}>
                  <Icon name="resolve" />{review.status === 'open' ? 'Resolve' : 'Reopen'}
                </button>
              </article>
            ))}
            {visibleReviews.length === 0 ? <p className="empty-copy">No {filter === 'all' ? '' : `${filter} `}requests for this preview.</p> : null}
          </div>
          <div className="new-request">
            <h3>New request</h3>
            <label>Target<input value={target} maxLength={80} onChange={(event) => setTarget(event.target.value)} /></label>
            <label>Note<textarea value={note} maxLength={500} placeholder="Describe the visual change…" onChange={(event) => setNote(event.target.value)} /></label>
            <p>Pin at {Math.round(anchor.x * 100)}%, {Math.round(anchor.y * 100)}%</p>
            <button className="button button--cyan" type="button" disabled={!note.trim()} onClick={() => void addRequest()}><Icon name="plus" />Add request</button>
          </div>
        </aside>
      </div>

      <footer className="review-statusbar">
        <span>Config version <strong>{version}</strong></span>
        <span>Snapshot <strong>{new Date(snapshotAt).toLocaleString()}</strong></span>
        <span className="status-success"><Icon name="check" />{status || 'Saved locally'}</span>
        <button type="button" onClick={exportPacket}><Icon name="download" />Export review packet</button>
      </footer>
    </section>
  );
};
