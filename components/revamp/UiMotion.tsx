import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const motionSubscribers = new Set<() => void>();
let motionMedia: MediaQueryList | undefined;

const getMotionMedia = () => {
  if (typeof window === 'undefined') return undefined;
  return motionMedia ??= window.matchMedia(REDUCED_MOTION_QUERY);
};
const notifyMotionSubscribers = () => motionSubscribers.forEach((notify) => notify());
const subscribeMotion = (notify: () => void) => {
  const media = getMotionMedia();
  if (motionSubscribers.size === 0) media?.addEventListener('change', notifyMotionSubscribers);
  motionSubscribers.add(notify);
  return () => {
    motionSubscribers.delete(notify);
    if (motionSubscribers.size === 0) media?.removeEventListener('change', notifyMotionSubscribers);
  };
};

/** Shared live preference: no window listeners or animation loops survive unmount. */
export const useReducedMotion = () => useSyncExternalStore(
  subscribeMotion,
  () => getMotionMedia()?.matches ?? true,
  () => true
);

const defaultNumberFormat = (value: number) => value.toLocaleString();

interface AnimatedNumberProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number;
  duration?: number;
  delay?: number;
  format?: (value: number) => string;
}

/** Count only while mounted. Assistive technology always reads the final amount. */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 850,
  delay = 0,
  format = defaultNumberFormat,
  className = '',
  ...props
}) => {
  const target = Math.round(Number.isFinite(value) ? value : 0);
  const reducedMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(reducedMotion ? target : 0);
  const displayedRef = useRef(displayed);

  useEffect(() => {
    if (reducedMotion || duration <= 0) {
      displayedRef.current = target;
      setDisplayed(target);
      return;
    }
    const from = displayedRef.current;
    const start = performance.now() + Math.max(0, delay);
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / duration));
      const next = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration, delay, reducedMotion]);

  return (
    <span className={`revamp-ui-number ${className}`.trim()} {...props}>
      <span className="sr-only">{format(target)}</span>
      <span aria-hidden="true">{format(reducedMotion ? target : displayed)}</span>
    </span>
  );
};

interface UiPresenceProps extends React.HTMLAttributes<HTMLDivElement> {
  show: boolean;
  exitMs?: number;
}

/** Optional panel wrapper retains its child for the short closing transition. */
export const UiPresence: React.FC<UiPresenceProps> = ({ show, exitMs = 150, children, className = '', ...props }) => {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), reducedMotion ? 0 : exitMs);
    return () => window.clearTimeout(timeout);
  }, [show, exitMs, reducedMotion]);
  if (!show && (!mounted || reducedMotion)) return null;
  return (
    <div {...props} {...(!show ? { inert: '' } : {})} className={`revamp-ui-presence ${className}`.trim()} data-state={show ? 'open' : 'closed'}>
      {children}
    </div>
  );
};
