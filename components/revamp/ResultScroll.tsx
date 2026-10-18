// REVAMP(Q): A quiet scroll cue keeps rewards discoverable without moving actions.
import React, { useLayoutEffect, useRef, useState } from 'react';

export function ResultScroll({ children }: { children: React.ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<'none' | 'more' | 'end'>('none');
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setEdge(element.scrollHeight <= (element.parentElement?.clientHeight ?? element.clientHeight) + 2 ? 'none'
      : element.scrollTop + element.clientHeight >= element.scrollHeight - 3 ? 'end' : 'more');
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => { observer.disconnect(); element.removeEventListener('scroll', measure); };
  }, []);
  return <div className="wave-record-scroll" data-scrollable={edge !== 'none'}>
    <div ref={viewport} className="result-scroll__viewport" tabIndex={0} role="region" aria-label="Mission details and rewards">
      {children}
    </div>
    <div className="result-scroll__hint" aria-hidden="true">{edge === 'end' ? '↑ Mission details' : 'Rewards below ↓'}</div>
  </div>;
}
