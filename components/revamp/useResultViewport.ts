// REVAMP(Q): The desktop shell scales its fixed game iframe. Preserve a visible
// 44px target on results without changing that shell or the simulation world.
import { useLayoutEffect, useState, type CSSProperties } from 'react';

export function useResultViewport(): CSSProperties {
  const [targetSize, setTargetSize] = useState(44);
  useLayoutEffect(() => {
    let frame: HTMLElement | null = null;
    try { frame = window.frameElement as HTMLElement | null; } catch { /* Standalone/cross-origin defaults to 44px. */ }
    if (!frame) return;
    const update = () => {
      const scale = frame!.getBoundingClientRect().height / frame!.offsetHeight;
      if (scale > 0) setTargetSize(Math.ceil(44 / Math.min(1, scale)));
    };
    const parentWindow = frame.ownerDocument.defaultView;
    parentWindow?.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(frame.ownerDocument.documentElement);
    update();
    return () => { observer.disconnect(); parentWindow?.removeEventListener('resize', update); };
  }, []);
  return { '--result-target-size': `${targetSize}px` } as CSSProperties;
}
