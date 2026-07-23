import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { BackgroundPreset, WaveDefinition, WaveSegment } from '../domain/types';
import {
  buildPreviewEntities,
  formatTimelineTime,
  getBackgroundStyle,
  getSegmentAtTime,
  getWaveSchedule,
  type ScheduledSegment
} from './previewSimulator';

interface LevelPreviewProps {
  wave: WaveDefinition;
  segment: WaveSegment;
  background: BackgroundPreset;
  seed: string;
  onSelectSegment: (segmentId: string) => void;
}

type ViewportMode = 'desktop' | 'mobile';

const Icon = ({ name }: { name: 'play' | 'pause' | 'desktop' | 'mobile' | 'seed' }) => {
  if (name === 'play') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>;
  }
  if (name === 'pause') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>;
  }
  if (name === 'desktop') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></svg>;
  }
  if (name === 'mobile') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m8.5 9 3.5-2 3.5 2v4L12 15l-3.5-2V9Z" /></svg>;
};

const getLocalProgress = (elapsed: number, item: ScheduledSegment): number =>
  Math.min(1, Math.max(0, (elapsed - item.startSeconds) / Math.max(0.001, item.segment.durationSeconds)));

const PlayerShip = ({ progress }: { progress: number }) => (
  <img
    className="wd-preview__player"
    src="/game-art/branding/researchhub-ship.png"
    alt="Player ship"
    style={{ transform: `translate3d(${Math.sin(progress * Math.PI * 4) * 12}px, ${Math.cos(progress * Math.PI * 2) * 5}px, 0)` }}
  />
);

export const LevelPreview = memo(function LevelPreview({
  wave,
  segment,
  background,
  seed,
  onSelectSegment
}: LevelPreviewProps) {
  const schedule = useMemo(() => getWaveSchedule(wave), [wave]);
  const totalDuration = schedule.at(-1)?.endSeconds ?? 0;
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [elapsed, setElapsed] = useState(() =>
    schedule.find((item) => item.segment.id === segment.id)?.startSeconds ?? 0
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const elapsedRef = useRef(elapsed);
  const lastFrameRef = useRef<number | null>(null);
  const lastPaintRef = useRef(0);
  const accumulatedDeltaRef = useRef(0);
  const previewSelectionRef = useRef<string | null>(null);

  const currentItem = getSegmentAtTime(schedule, elapsed) ?? schedule[0];
  const currentSegment = currentItem?.segment ?? segment;
  const localProgress = currentItem ? getLocalProgress(elapsed, currentItem) : 0;
  const entities = useMemo(
    () => buildPreviewEntities(seed, currentSegment, viewport),
    [currentSegment, seed, viewport]
  );

  useEffect(() => {
    if (previewSelectionRef.current === segment.id) {
      previewSelectionRef.current = null;
      return;
    }
    const selected = schedule.find((item) => item.segment.id === segment.id);
    if (selected) {
      elapsedRef.current = selected.startSeconds;
      setElapsed(selected.startSeconds);
    }
  }, [schedule, segment.id]);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = null;
      accumulatedDeltaRef.current = 0;
      return undefined;
    }

    let frameId = 0;
    const tick = (now: number) => {
      const previous = lastFrameRef.current ?? now;
      const delta = Math.min(0.1, (now - previous) / 1000);
      lastFrameRef.current = now;
      accumulatedDeltaRef.current += delta;
      if (now - lastPaintRef.current >= 33) {
        lastPaintRef.current = now;
        const elapsedDelta = accumulatedDeltaRef.current;
        accumulatedDeltaRef.current = 0;
        const next = Math.min(totalDuration, elapsedRef.current + elapsedDelta);
        elapsedRef.current = next;
        setElapsed(next);
        const nextSegmentId = getSegmentAtTime(schedule, next)?.segment.id;
        if (
          nextSegmentId &&
          nextSegmentId !== segment.id &&
          previewSelectionRef.current !== nextSegmentId
        ) {
          previewSelectionRef.current = nextSegmentId;
          onSelectSegment(nextSegmentId);
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, onSelectSegment, schedule, segment.id, totalDuration]);

  useEffect(() => {
    if (isPlaying && elapsed >= totalDuration) setIsPlaying(false);
  }, [elapsed, isPlaying, totalDuration]);

  const handleScrub = (nextElapsed: number) => {
    elapsedRef.current = nextElapsed;
    setElapsed(nextElapsed);
    const next = getSegmentAtTime(schedule, nextElapsed);
    if (next && next.segment.id !== segment.id) {
      previewSelectionRef.current = next.segment.id;
      onSelectSegment(next.segment.id);
    }
  };

  const previewStyle = getBackgroundStyle(background);
  const playerVisible = currentSegment.type !== 'launch' || localProgress > 0.15;

  return (
    <section className="wd-preview" aria-label="Interactive mission preview">
      <div className="wd-preview__label">
        <span>Preview: {wave.name} / {currentSegment.label}</span>
        <span>{Math.round(localProgress * 100)}%</span>
      </div>
      <div className="wd-preview__mat">
        <div
          className={`wd-preview__viewport wd-preview__viewport--${viewport}`}
          style={previewStyle}
          data-segment={currentSegment.type}
        >
          {background.layers.map((layer, index) => (
            <img
              key={layer}
              className={`wd-preview__background wd-preview__background--${index}${index === 2 ? (layer.includes('/bg-planet.') ? ' wd-preview__background--horizon' : ' wd-preview__background--prop') : ''}`}
              src={layer}
              alt=""
              draggable={false}
            />
          ))}
          <div className="wd-preview__tint" aria-hidden="true" />
          <div className="wd-preview__scan" aria-hidden="true" />
          {entities.map((entity) => {
            const travel = ((localProgress + entity.phase) % 1) * (entity.kind === 'asteroid' ? 46 : 16);
            const x = entity.x + Math.sin((localProgress + entity.phase) * Math.PI * 2) * entity.drift;
            const y = entity.kind === 'asteroid' ? entity.y + travel : entity.y + travel * 0.3;
            return (
              <img
                key={entity.id}
                className={`wd-preview__entity wd-preview__entity--${entity.kind}`}
                src={entity.assetPath}
                alt=""
                draggable={false}
                style={{
                  width: `${entity.size}%`,
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: `translate(-50%, -50%) rotate(${entity.rotation + localProgress * (entity.kind === 'asteroid' ? 80 : 0)}deg)`
                }}
              />
            );
          })}
          {playerVisible ? <PlayerShip progress={localProgress} /> : null}
          <div className="wd-preview__reticle" aria-hidden="true"><span /><span /></div>
          <div className="wd-preview__hud">
            <span>{currentSegment.label}</span>
            <span>{formatTimelineTime(currentItem?.startSeconds ?? 0)}–{formatTimelineTime(currentItem?.endSeconds ?? 0)}</span>
          </div>
        </div>
      </div>

      <div className="wd-preview__controls">
        <div className="wd-preview__transport">
          <button
            type="button"
            className={`wd-button wd-button--transport ${isPlaying ? '' : 'is-active'}`}
            onClick={() => {
              if (elapsed >= totalDuration) {
                elapsedRef.current = 0;
                setElapsed(0);
                const firstSegmentId = schedule[0]?.segment.id;
                if (firstSegmentId && firstSegmentId !== segment.id) {
                  previewSelectionRef.current = firstSegmentId;
                  onSelectSegment(firstSegmentId);
                }
              }
              setIsPlaying(true);
            }}
            disabled={isPlaying}
          >
            <Icon name="play" /> Play
          </button>
          <button
            type="button"
            className={`wd-button wd-button--transport ${isPlaying ? 'is-active' : ''}`}
            onClick={() => setIsPlaying(false)}
            disabled={!isPlaying}
          >
            <Icon name="pause" /> Pause
          </button>
        </div>
        <div className="wd-preview__scrub">
          <output aria-live="off">{formatTimelineTime(elapsed)} / {formatTimelineTime(totalDuration)}</output>
          <input
            type="range"
            min={0}
            max={Math.max(0.01, totalDuration)}
            step={0.05}
            value={Math.min(elapsed, totalDuration)}
            onChange={(event) => handleScrub(Number(event.target.value))}
            aria-label="Wave preview position"
            style={{ '--scrub-progress': `${totalDuration ? (elapsed / totalDuration) * 100 : 0}%` } as React.CSSProperties}
          />
          <div className="wd-preview__markers" aria-hidden="true">
            {schedule.slice(0, -1).map((item) => (
              <span key={item.segment.id} style={{ left: `${(item.endSeconds / totalDuration) * 100}%` }} />
            ))}
          </div>
        </div>
      </div>

      <footer className="wd-preview__footer">
        <div className="wd-seed"><Icon name="seed" /><span>Seed</span><code>{seed}</code></div>
        <fieldset className="wd-viewport-switcher">
          <legend>Viewport</legend>
          <button type="button" className={viewport === 'desktop' ? 'is-active' : ''} onClick={() => setViewport('desktop')} aria-pressed={viewport === 'desktop'}><Icon name="desktop" />Desktop</button>
          <button type="button" className={viewport === 'mobile' ? 'is-active' : ''} onClick={() => setViewport('mobile')} aria-pressed={viewport === 'mobile'}><Icon name="mobile" />Mobile</button>
        </fieldset>
      </footer>
    </section>
  );
});
