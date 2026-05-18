import React, { useEffect, useState } from 'react';
import { audioService } from '../services/audioService';
import { StoryBeat } from '../services/storyBeats';

interface StoryTransmissionProps {
  beat: StoryBeat;
  onComplete: () => void;
}

const StoryTransmission: React.FC<StoryTransmissionProps> = ({ beat, onComplete }) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const isComplete = visibleCount >= beat.text.length;

  useEffect(() => {
    setVisibleCount(0);
  }, [beat.phase]);

  useEffect(() => {
    if (isComplete) return;

    const timer = window.setTimeout(() => {
      setVisibleCount((count) => {
        const next = Math.min(beat.text.length, count + 1);
        const char = beat.text[next - 1];
        if (char && char.trim() && next % 2 === 0) {
          audioService.playDialogBlip();
        }
        return next;
      });
    }, 24);

    return () => window.clearTimeout(timer);
  }, [beat.text, isComplete, visibleCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();

      if (!isComplete) {
        setVisibleCount(beat.text.length);
        return;
      }

      onComplete();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [beat.text.length, isComplete, onComplete]);

  const handleAdvance = () => {
    if (!isComplete) {
      setVisibleCount(beat.text.length);
      return;
    }

    onComplete();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/35 px-3 pb-5 pt-24 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button
        type="button"
        onClick={handleAdvance}
        className="group relative grid w-full max-w-3xl grid-cols-[92px_1fr] gap-3 overflow-hidden border border-cyan-200/25 bg-slate-950/92 p-3 text-left shadow-[0_22px_90px_rgba(0,0,0,0.62)] [clip-path:polygon(16px_0,100%_0,100%_92%,96%_100%,0_100%,0_16px)] sm:grid-cols-[132px_1fr] sm:gap-4 sm:p-4"
      >
        <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${beat.accent}`}></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.04)_1px,transparent_1px)] bg-[size:100%_8px] opacity-50"></div>

        <div className="relative">
          <div className={`absolute -inset-1 bg-gradient-to-br ${beat.accent} opacity-30 blur-xl ${!isComplete ? 'animate-pulse' : ''}`}></div>
          <div className="relative aspect-square overflow-hidden border border-cyan-200/30 bg-blue-700/20 [clip-path:polygon(10px_0,100%_0,100%_88%,88%_100%,0_100%,0_10px)]">
            <img
              src={beat.portrait}
              alt={beat.speaker}
              className={`h-full w-full object-cover ${!isComplete ? 'scicon-talk-portrait' : ''}`}
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_48%,rgba(255,255,255,0.12)_50%,transparent_52%)] bg-[size:100%_6px] mix-blend-screen"></div>
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="arcade-font text-sm font-black uppercase tracking-[0.18em] text-white sm:text-lg">
              {beat.speaker}
            </span>
            <span className="border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-100">
              {beat.role}
            </span>
          </div>

          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-200/80">
            Phase {beat.phase}: {beat.title}
          </div>

          <p className="mt-3 min-h-[112px] font-mono text-sm leading-relaxed text-cyan-50 sm:min-h-[120px] sm:text-base">
            {beat.text.slice(0, visibleCount)}
            {!isComplete ? <span className="animate-pulse text-cyan-200">_</span> : null}
          </p>

          <div className="mt-3 border-l-2 border-emerald-300/60 bg-emerald-300/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-100">
            {beat.objective}
          </div>

          <div className="mt-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/60">
            {isComplete ? 'Tap to deploy' : 'Receiving transmission'}
          </div>
        </div>
      </button>
    </div>
  );
};

export default StoryTransmission;
