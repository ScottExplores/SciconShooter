import React, { useEffect, useMemo, useState } from 'react';
import { DONATION_CONFIG } from '../constants';
import { trackEvent } from '../services/analyticsService';
import { readSocialCampaignAttribution } from '../shared/socialCampaignAttribution.mjs';
import {
  buildMobileFrameUrl,
  DESKTOP_LAUNCH_MEDIA_QUERY,
  DESKTOP_LAUNCH_SESSION_KEY,
  hasMobileFrameDisplay,
  resolveMobileFrameScale,
  shouldUseDesktopLaunchShell
} from '../services/desktopMobileLaunch';
import './desktop-mobile-launch-shell.css';

const DESKTOP_LAUNCH_ASSET_ROOT = '/game-art/generated/ui/scicon-desktop-mobile-launch-v1';
const BASE_APP_INVITE_QR = `${DESKTOP_LAUNCH_ASSET_ROOT}/base-app-invite-qr.png`;
const DESKTOP_LAUNCH_VIEWED_KEY = `${DESKTOP_LAUNCH_SESSION_KEY}:viewed`;

const readPlayHereSession = () => {
  try {
    return window.sessionStorage.getItem(DESKTOP_LAUNCH_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
};

const rememberPlayHereSession = () => {
  try {
    window.sessionStorage.setItem(DESKTOP_LAUNCH_SESSION_KEY, 'true');
  } catch {
    // Private browsing and embedded WebViews can deny storage. The current
    // in-memory choice still works for this page load.
  }
};

const trackDesktopLaunchView = () => {
  try {
    if (window.sessionStorage.getItem(DESKTOP_LAUNCH_VIEWED_KEY) === 'true') return;
    window.sessionStorage.setItem(DESKTOP_LAUNCH_VIEWED_KEY, 'true');
  } catch {
    // A blocked storage write should not block the launch screen or telemetry.
  }
  trackEvent('desktop_launch_viewed', {
    surface: 'desktop_shell',
    ...readSocialCampaignAttribution(window.location.search)
  });
};

const trackDesktopLaunchChoice = (
  choice: 'browser' | 'base_app',
  placement: 'landing' | 'qr' | 'side_link'
) => trackEvent('desktop_launch_selected', {
  choice,
  placement,
  ...readSocialCampaignAttribution(window.location.search)
});

const readDesktopMediaMatch = () => window.matchMedia(DESKTOP_LAUNCH_MEDIA_QUERY).matches;

export interface DesktopMobileLaunchShellProps {
  readonly children: React.ReactNode;
}

const DesktopMobileLaunchShell: React.FC<DesktopMobileLaunchShellProps> = ({ children }) => {
  const framedDisplayRequested = hasMobileFrameDisplay(window.location.href);
  const topLevel = window.self === window.top;
  const [desktopMediaMatches, setDesktopMediaMatches] = useState(readDesktopMediaMatch);
  const [playHereSelected, setPlayHereSelected] = useState(readPlayHereSession);
  const [frameScale, setFrameScale] = useState(() => resolveMobileFrameScale(
    window.innerWidth,
    window.visualViewport?.height ?? window.innerHeight
  ));
  const frameUrl = useMemo(() => buildMobileFrameUrl(window.location.href), []);
  const useDesktopShell = shouldUseDesktopLaunchShell({
    topLevel,
    framedDisplayRequested,
    desktopMediaMatches
  });

  useEffect(() => {
    if (framedDisplayRequested || !topLevel) return undefined;

    const media = window.matchMedia(DESKTOP_LAUNCH_MEDIA_QUERY);
    const handleMediaChange = () => setDesktopMediaMatches(media.matches);
    handleMediaChange();
    media.addEventListener('change', handleMediaChange);
    return () => media.removeEventListener('change', handleMediaChange);
  }, [framedDisplayRequested, topLevel]);

  useEffect(() => {
    if (!useDesktopShell) return undefined;

    const updateScale = () => setFrameScale(resolveMobileFrameScale(
      window.innerWidth,
      window.visualViewport?.height ?? window.innerHeight
    ));
    updateScale();
    window.addEventListener('resize', updateScale, { passive: true });
    window.visualViewport?.addEventListener('resize', updateScale, { passive: true });
    return () => {
      window.removeEventListener('resize', updateScale);
      window.visualViewport?.removeEventListener('resize', updateScale);
    };
  }, [useDesktopShell]);

  useEffect(() => {
    if (useDesktopShell && !playHereSelected) trackDesktopLaunchView();
  }, [playHereSelected, useDesktopShell]);

  if (!useDesktopShell) return <>{children}</>;

  const frameStyle = {
    '--scicon-mobile-frame-scale': String(frameScale)
  } as React.CSSProperties;

  return (
    <main
      className="scicon-desktop-mobile-launch"
      data-launch-state={playHereSelected ? 'playing-here' : 'recommend-mobile'}
    >
      <div className="scicon-desktop-mobile-launch__shade" aria-hidden="true" />

      {playHereSelected ? (
        <section className="scicon-desktop-mobile-launch__play-area" aria-label="Scicon Shooter mobile game frame">
          <div className="scicon-desktop-mobile-launch__frame" style={frameStyle}>
            <span className="scicon-desktop-mobile-launch__frame-label" aria-hidden="true">
              Mobile flight deck / 390 x 844
            </span>
            <iframe
              className="scicon-desktop-mobile-launch__iframe"
              src={frameUrl}
              title="Scicon Shooter mobile game"
              allow="clipboard-write; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              data-testid="desktop-mobile-game-frame"
            />
          </div>
          <a
            className="scicon-desktop-mobile-launch__side-link"
            href={DONATION_CONFIG.BASE_APP_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackDesktopLaunchChoice('base_app', 'side_link')}
          >
            Open in Base App
          </a>
        </section>
      ) : (
        <section
          className="scicon-desktop-mobile-launch__landing"
          role="dialog"
          aria-modal="true"
          aria-labelledby="desktop-mobile-launch-title"
          aria-describedby="desktop-mobile-launch-description"
        >
          <div className="scicon-desktop-mobile-launch__copy">
            <span className="scicon-desktop-mobile-launch__eyebrow">Browser mission ready</span>
            <img
              className="scicon-desktop-mobile-launch__icon"
              src="/icon.png"
              alt=""
              aria-hidden="true"
            />
            <h1 id="desktop-mobile-launch-title">Start a run. Your browser is enough.</h1>
            <p id="desktop-mobile-launch-description">
              Play here in a mobile-sized flight deck. No install or wallet required. For the full portrait experience, open it on your phone or in the Base App.
            </p>
            <div className="scicon-desktop-mobile-launch__actions">
              <button
                type="button"
                className="scicon-desktop-mobile-launch__play-action"
                onClick={() => {
                  trackDesktopLaunchChoice('browser', 'landing');
                  rememberPlayHereSession();
                  setPlayHereSelected(true);
                }}
              >
                Start Browser Run
              </button>
              <a
                className="scicon-desktop-mobile-launch__base-action"
                href={DONATION_CONFIG.BASE_APP_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackDesktopLaunchChoice('base_app', 'landing')}
              >
                Open in Base App
              </a>
            </div>
          </div>

          <a
            className="scicon-desktop-mobile-launch__qr-card"
            href={DONATION_CONFIG.BASE_APP_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the Scicon Shooter Base App invite"
            onClick={() => trackDesktopLaunchChoice('base_app', 'qr')}
          >
            <span>Or scan for Base App</span>
            <img src={BASE_APP_INVITE_QR} alt="QR code for the Scicon Shooter Base App invite" />
            <small>ScottExplores / Base</small>
          </a>
        </section>
      )}
    </main>
  );
};

export default DesktopMobileLaunchShell;
