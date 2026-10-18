import React from 'react';
import { isPreviewMode } from './previewMode';
import './preview-build.css';

export const PreviewBuildBadge: React.FC = () => isPreviewMode() ? (
  <div
    role="note"
    aria-label="Test build. Scores are not submitted."
    data-preview-build-badge
    className="scicon-preview-badge"
  >
    TEST BUILD — scores not submitted
  </div>
) : null;

// REVAMP(T): A reserved preview rail cannot cover DOM HUD, Pixi HUD, or menus.
// Production retains the original element tree; the simulation world is unchanged.
export const PreviewBuildFrame: React.FC<React.PropsWithChildren> = ({ children }) => isPreviewMode() ? (
  <div className="scicon-preview-frame">
    <div className="scicon-preview-rail"><PreviewBuildBadge /></div>
    <div className="scicon-preview-content">{children}</div>
  </div>
) : <>{children}</>;
