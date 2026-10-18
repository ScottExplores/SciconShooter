import { useEffect, useState } from 'react';

/** One animation per result value; honors reduced motion and cancels on dismissal. */
export const useCountUp = (target: number, duration = 900): number => {
  const safeTarget = Math.max(0, Math.floor(Number.isFinite(target) ? target : 0));
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || duration <= 0) {
      setValue(safeTarget);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    setValue(0);
    const tick = (time: number) => {
      if (start === null) start = time;
      const progress = Math.min(1, (time - start) / duration);
      setValue(Math.round(safeTarget * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [safeTarget, duration]);
  return value;
};
