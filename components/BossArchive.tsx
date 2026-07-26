import React, { useEffect, useMemo, useRef } from 'react';
import type { BossArchiveEntry } from '../services/bossArchive';
import PixelActionButton from './PixelActionButton';

const ARCHIVE_EMBLEM = '/game-art/bosses/final-boss-sentinel.png';
const TARGET_RING = '/game-art/generated/ui/animations/boss-alert-banners-v1/effects/warning-ring-red.png';

export interface BossArchiveProps {
  entries: readonly BossArchiveEntry[];
  newEncounterIds: ReadonlySet<string> | readonly string[];
  onClose: () => void;
  onChallenge: (entry: BossArchiveEntry) => void;
}

const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => (
  Array.from(root?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) ?? []).filter((element) => (
    element.getAttribute('aria-hidden') !== 'true'
    && !element.hasAttribute('hidden')
  ))
);

/**
 * Full-screen practice archive for boss encounters the current profile has
 * already cleared. Launch behavior and progression remain owned by App.
 */
const BossArchive: React.FC<BossArchiveProps> = ({
  entries,
  newEncounterIds,
  onClose,
  onChallenge
}) => {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const orderedEntries = useMemo(() => (
    [...entries].sort((left, right) => (
      left.missionNumber - right.missionNumber
      || left.waveName.localeCompare(right.waveName)
      || left.label.localeCompare(right.label)
    ))
  ), [entries]);
  const newIdSet = useMemo(() => new Set(Array.from(newEncounterIds)), [newEncounterIds]);
  const newCount = orderedEntries.reduce(
    (count, entry) => count + (newIdSet.has(entry.eventId) ? 1 : 0),
    0
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-0 items-stretch justify-center overflow-hidden bg-[#01040d]/95 p-2 backdrop-blur-lg sm:items-center sm:p-5"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_16%_14%,rgba(34,211,238,0.14),transparent_27%),radial-gradient(circle_at_86%_82%,rgba(248,113,113,0.1),transparent_30%),linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] [background-size:auto,auto,18px_18px,18px_18px]"
        aria-hidden="true"
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="boss-archive-title"
        aria-describedby="boss-archive-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="sci-neon-frame-window relative flex min-h-0 w-full max-w-3xl flex-col overflow-hidden border border-cyan-200/45 bg-[#030919] shadow-[0_0_0_2px_rgba(8,47,73,0.8),0_0_48px_rgba(34,211,238,0.2),0_28px_90px_rgba(0,0,0,0.82)] outline-none [clip-path:polygon(12px_0,calc(100%_-_12px)_0,100%_12px,100%_calc(100%_-_12px),calc(100%_-_12px)_100%,12px_100%,0_calc(100%_-_12px),0_12px)] sm:max-h-[min(880px,92dvh)]"
      >
        <div
          className="pointer-events-none absolute inset-[3px] border border-cyan-300/15 [clip-path:polygon(9px_0,calc(100%_-_9px)_0,100%_9px,100%_calc(100%_-_9px),calc(100%_-_9px)_100%,9px_100%,0_calc(100%_-_9px),0_9px)]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(transparent_50%,rgba(34,211,238,0.08)_50%)] [background-size:100%_4px]"
          aria-hidden="true"
        />

        <header className="relative grid shrink-0 grid-cols-[4.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-cyan-200/25 bg-[linear-gradient(135deg,rgba(8,47,73,0.9),rgba(3,9,25,0.96)_52%,rgba(69,10,10,0.55))] px-4 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_3rem] sm:px-6 sm:py-4">
          <div className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center sm:h-20 sm:w-20" aria-hidden="true">
            <img
              src={TARGET_RING}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain opacity-75 [image-rendering:pixelated]"
            />
            <img
              src={ARCHIVE_EMBLEM}
              alt=""
              draggable={false}
              className="relative z-10 h-[72%] w-[72%] object-contain drop-shadow-[0_0_12px_rgba(248,113,113,0.72)] [image-rendering:pixelated]"
            />
          </div>

          <div className="min-w-0">
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.24em] text-red-200/85 sm:text-[10px]">
              Research Command // Combat Records
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 id="boss-archive-title" className="arcade-font text-2xl font-black uppercase tracking-[0.06em] text-white drop-shadow-[0_0_14px_rgba(34,211,238,0.48)] sm:text-3xl">
                Boss Archive
              </h2>
              {newCount > 0 ? (
                <span className="rounded-sm border border-yellow-200/60 bg-yellow-300/15 px-2 py-1 font-mono text-[8px] font-black uppercase tracking-[0.14em] text-yellow-100 shadow-[0_0_14px_rgba(250,204,21,0.22)]" role="status">
                  {newCount} new
                </span>
              ) : null}
            </div>
            <p id="boss-archive-description" className="mt-1 max-w-xl text-[10px] font-semibold leading-relaxed text-cyan-50/70 sm:text-xs">
              Challenge defeated threats in a practice rematch. Archive simulations do not affect the weekly score.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close Boss Archive"
            className="grid h-10 w-10 place-items-center justify-self-end border border-cyan-100/35 bg-slate-950/75 font-mono text-xl font-black leading-none text-cyan-100 shadow-[inset_0_0_12px_rgba(34,211,238,0.1),0_0_12px_rgba(34,211,238,0.08)] transition hover:border-cyan-100/70 hover:bg-cyan-300/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 [clip-path:polygon(6px_0,100%_0,100%_calc(100%_-_6px),calc(100%_-_6px)_100%,0_100%,0_6px)]"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-cyan-200/15 bg-cyan-300/[0.035] px-4 py-2 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-cyan-100/65 sm:px-6">
            <span>{orderedEntries.length} encounter{orderedEntries.length === 1 ? '' : 's'} recovered</span>
            <span className="text-emerald-200/75">Practice channel online</span>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [touch-action:pan-y] sm:p-5">
            {orderedEntries.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {orderedEntries.map((entry, index) => {
                  const isNew = newIdSet.has(entry.eventId);
                  const titleId = `boss-archive-entry-${index}`;
                  return (
                    <article
                      key={entry.eventId}
                      aria-labelledby={titleId}
                      data-new={isNew ? 'true' : 'false'}
                      className={`group relative isolate grid min-h-[12.5rem] grid-cols-[7.25rem_minmax(0,1fr)] overflow-hidden border bg-[#061020]/95 shadow-[inset_0_0_24px_rgba(8,47,73,0.38)] transition sm:grid-cols-[8rem_minmax(0,1fr)] ${
                        isNew
                          ? 'border-yellow-200/65 shadow-[inset_0_0_24px_rgba(113,63,18,0.3),0_0_20px_rgba(250,204,21,0.13)]'
                          : 'border-cyan-200/25 hover:border-cyan-200/50'
                      } [clip-path:polygon(8px_0,100%_0,100%_calc(100%_-_8px),calc(100%_-_8px)_100%,0_100%,0_8px)]`}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background-image:linear-gradient(135deg,rgba(34,211,238,0.08),transparent_45%),linear-gradient(rgba(34,211,238,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.025)_1px,transparent_1px)] [background-size:auto,12px_12px,12px_12px]"
                        aria-hidden="true"
                      />
                      {isNew ? (
                        <span className="absolute right-2 top-2 z-20 border border-yellow-100/60 bg-[#2c2105]/90 px-2 py-1 font-mono text-[7px] font-black uppercase tracking-[0.16em] text-yellow-100 shadow-[0_0_12px_rgba(250,204,21,0.24)]">
                          New target
                        </span>
                      ) : null}

                      <div className="relative m-2 mr-0 flex min-h-[11rem] items-center justify-center overflow-hidden border border-red-200/20 bg-[radial-gradient(circle_at_50%_45%,rgba(239,68,68,0.18),rgba(2,6,23,0.92)_64%)] [clip-path:polygon(7px_0,100%_0,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,0_100%,0_7px)]">
                        <div className="absolute inset-x-1 bottom-2 h-px bg-gradient-to-r from-transparent via-red-300/45 to-transparent" aria-hidden="true" />
                        <img
                          src={entry.artUrl}
                          alt=""
                          draggable={false}
                          loading="lazy"
                          className="relative z-10 max-h-28 w-[90%] object-contain drop-shadow-[0_8px_8px_rgba(0,0,0,0.75)] transition duration-300 [image-rendering:pixelated] group-hover:scale-[1.04] group-hover:drop-shadow-[0_0_12px_rgba(248,113,113,0.42)] sm:max-h-32"
                        />
                      </div>

                      <div className="flex min-w-0 flex-col px-3 py-3">
                        <div className="pr-8">
                          <p className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-cyan-200/70">
                            Mission {String(entry.missionNumber).padStart(2, '0')}
                          </p>
                          <h3 id={titleId} className="arcade-font mt-1 line-clamp-2 text-base font-black uppercase leading-tight tracking-[0.04em] text-white sm:text-lg">
                            {entry.label}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-[9px] font-semibold leading-snug text-slate-300 sm:text-[10px]">
                            {entry.missionName}
                          </p>
                          <p className="mt-1 truncate font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-red-200/65 sm:text-[8px]">
                            {entry.waveName}
                          </p>
                        </div>

                        <div className="mt-auto pt-3">
                          <PixelActionButton
                            tone="cyan"
                            shine={isNew}
                            ready={isNew}
                            className="min-h-11 w-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.13em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100"
                            onClick={() => onChallenge(entry)}
                            aria-label={`Challenge ${entry.label} from Mission ${entry.missionNumber}`}
                          >
                            Challenge
                          </PixelActionButton>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mx-auto flex min-h-[18rem] max-w-md flex-col items-center justify-center px-6 text-center">
                <div className="relative flex h-28 w-28 items-center justify-center opacity-55" aria-hidden="true">
                  <img src={TARGET_RING} alt="" className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]" />
                  <img src={ARCHIVE_EMBLEM} alt="" className="relative z-10 h-16 w-16 object-contain grayscale [image-rendering:pixelated]" />
                </div>
                <h3 className="arcade-font mt-3 text-xl font-black uppercase tracking-wider text-cyan-50">No records recovered</h3>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-400">
                  Defeat your first mission boss to unlock its practice challenge here.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default BossArchive;
