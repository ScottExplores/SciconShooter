import React, { useEffect, useRef, useState } from 'react';
import { audioService } from '../services/audioService';
import { StoryBeat } from '../services/storyBeats';
import FundingVaultUnseal, { FUNDING_VAULT_UNSEAL_DURATION_MS } from './FundingVaultUnseal';
import { getInlineTransmissionDurationMs } from '../services/revamp/story/campaignStory';
import './story-transmission.css';

interface StoryTransmissionProps {
  beat: StoryBeat;
  onComplete: () => void;
}

const InlineStoryTransmission: React.FC<StoryTransmissionProps> = ({ beat, onComplete }) => {
  const completionRef = useRef(onComplete);
  completionRef.current = onComplete;
  const duration = getInlineTransmissionDurationMs(beat.text);
  useEffect(() => {
    const timer = window.setTimeout(() => completionRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [beat.id, beat.title, beat.text, duration]);

  return (
    <aside className={`frontier-transmission${beat.kind === 'boss' ? ' frontier-transmission--hostile' : ''}${beat.kind === 'victory' ? ' frontier-transmission--victory' : ''}`} aria-label="Campaign transmission">
      <div className="frontier-transmission__channel" aria-hidden="true">
        {beat.portrait ? <img src={beat.portrait} alt="" /> : <span>{beat.kind === 'boss' ? 'PS' : 'V'}</span>}
      </div>
      <div className="frontier-transmission__body" role="status" aria-live="polite">
        <div className="frontier-transmission__heading"><strong>{beat.speaker}</strong><span>{beat.title}</span></div>
        <p>{beat.text}</p>
      </div>
      <button type="button" className="frontier-transmission__skip" onClick={onComplete} aria-label="Skip transmission">Skip</button>
      <span className="frontier-transmission__timer" style={{ animationDuration: `${duration}ms` }} key={beat.id ?? beat.text} aria-hidden="true" />
    </aside>
  );
};

const VaultStoryTransmission: React.FC<StoryTransmissionProps> = ({ beat, onComplete }) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [vaultUnsealed, setVaultUnsealed] = useState(false);
  const isComplete = visibleCount >= beat.text.length;

  useEffect(() => {
    setVisibleCount(0);
    setVaultUnsealed(false);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => setVaultUnsealed(true),
      reducedMotion ? 320 : FUNDING_VAULT_UNSEAL_DURATION_MS
    );

    return () => window.clearTimeout(timer);
  }, [beat.id, beat.phase, beat.title, beat.text]);

  useEffect(() => {
    if (!vaultUnsealed || isComplete) return;

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
  }, [beat.text, isComplete, vaultUnsealed, visibleCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();

      if (!vaultUnsealed) return;

      if (!isComplete) {
        setVisibleCount(beat.text.length);
        return;
      }

      onComplete();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [beat.text.length, isComplete, onComplete, vaultUnsealed]);

  const handleAdvance = () => {
    if (!vaultUnsealed) return;

    if (!isComplete) {
      setVisibleCount(beat.text.length);
      return;
    }

    onComplete();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/45 p-2 backdrop-blur-[2px] sm:p-4">
      <FundingVaultUnseal open={vaultUnsealed}>
        <button
          type="button"
          onClick={handleAdvance}
          className="sci-funding-vault__transmission group"
        >
          <div className="flex min-w-0 items-center gap-2.5 border-b border-cyan-200/20 pb-2">
            <div className="relative h-[76px] w-[76px] shrink-0">
              <div className={`absolute -inset-1 bg-gradient-to-br ${beat.accent} opacity-25 blur-lg ${!isComplete ? 'animate-pulse' : ''}`}></div>
              <div className="relative h-full w-full overflow-hidden border border-cyan-200/30 bg-blue-700/20 [clip-path:polygon(9px_0,100%_0,100%_86%,86%_100%,0_100%,0_9px)]">
                <img
                  src={beat.portrait}
                  alt={beat.speaker}
                  className={`h-full w-full object-cover ${!isComplete ? 'scicon-talk-portrait' : ''}`}
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_48%,rgba(255,255,255,0.12)_50%,transparent_52%)] bg-[size:100%_6px] mix-blend-screen"></div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="arcade-font text-[15px] font-black uppercase leading-tight tracking-[0.1em] text-white">
                {beat.speaker}
              </div>
              <div className="mt-1.5 font-mono text-[9px] uppercase leading-[1.3] tracking-[0.12em] text-yellow-200/85">
                {beat.kicker ?? `Sector ${beat.phase}`}: {beat.title}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-start overflow-y-auto py-2 custom-scrollbar">
            <p className="sci-funding-vault__copy max-w-full font-mono text-[12px] leading-[1.38] text-cyan-50">
              {beat.text.slice(0, visibleCount)}
              {!isComplete ? <span className="animate-pulse text-cyan-200">_</span> : null}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-cyan-200/20 pt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-200/65">
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onComplete();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onComplete();
              }}
            >
              Skip
            </span>
            <span>{isComplete ? 'Tap to deploy' : 'Tap to finish the line'}</span>
          </div>
        </button>
      </FundingVaultUnseal>
    </div>
  );
};

const StoryTransmission: React.FC<StoryTransmissionProps> = (props) => (
  props.beat.presentation === 'inline'
    ? <InlineStoryTransmission {...props} />
    : <VaultStoryTransmission {...props} />
);

export default StoryTransmission;
