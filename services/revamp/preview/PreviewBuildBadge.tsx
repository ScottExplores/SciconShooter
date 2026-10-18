import React from 'react';
import { isPreviewMode } from './previewMode';

export const PreviewBuildBadge: React.FC = () => isPreviewMode() ? (
  <div
    role="note"
    aria-label="Test build. Scores are not submitted."
    style={{
      position: 'fixed', top: 'max(5px, env(safe-area-inset-top))', left: '50%',
      transform: 'translateX(-50%)', zIndex: 10000, pointerEvents: 'none',
      padding: '4px 10px', border: '1px solid rgba(34, 211, 238, 0.45)',
      borderRadius: 999, background: 'rgba(8, 20, 35, 0.9)', color: '#a5f3fc',
      fontFamily: 'monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
      lineHeight: 1.3, whiteSpace: 'nowrap', boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)'
    }}
  >
    TEST BUILD — scores not submitted
  </div>
) : null;
