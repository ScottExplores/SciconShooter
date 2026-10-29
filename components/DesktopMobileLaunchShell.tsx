import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DONATION_CONFIG } from '../constants';
import { trackEvent } from '../services/analyticsService';
import { readSocialCampaignAttribution } from '../shared/socialCampaignAttribution.mjs';
import { isBossLabQueryEnabled } from '../services/gameplay/bossLabFlag.mjs';
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

// Keys the game reads. When focus sits on the desktop shell instead of the game
// frame (e.g. after clicking the side art), forward them so controls never go dead.
const FORWARDED_GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', ' ', 'Enter', 'b', 'B'
]);

const forwardKeyToFrame = (frame: HTMLIFrameElement | null, event: KeyboardEvent) => {
  if (!FORWARDED_GAME_KEYS.has(event.key)) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.('a, button, input, textarea, select')) return;
  const frameWindow = frame?.contentWindow as (Window & typeof globalThis) | null | undefined;
  if (!frameWindow) return;
  event.preventDefault();
  try {
    frameWindow.dispatchEvent(new frameWindow.KeyboardEvent(event.type, {
      key: event.key,
      code: event.code,
      repeat: event.repeat,
      bubbles: true
    }));
  } catch {
    // Cross-origin or detached frame: nothing to forward to.
  }
};

const readDesktopMediaMatch = () => window.matchMedia(DESKTOP_LAUNCH_MEDIA_QUERY).matches;

export interface DesktopMobileLaunchShellProps {
  readonly children: React.ReactNode;
}

const DesktopMobileLaunchShell: React.FC<DesktopMobileLaunchShellProps> = ({ children }) => {
  const bossLabRequested = isBossLabQueryEnabled(window.location.search);
  const framedDisplayRequested = hasMobileFrameDisplay(window.location.href);
  const topLevel = window.self === window.top;
  const [desktopMediaMatches, setDesktopMediaMatches] = useState(readDesktopMediaMatch);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
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
    if (bossLabRequested || !useDesktopShell) return undefined;
    // Desktop visitors go straight into the game frame. The old "choose
    // browser or Base App" landing lost ~90% of desktop visitors before play.
    trackDesktopLaunchView();
    rememberPlayHereSession();
    const handleKey = (event: KeyboardEvent) => forwardKeyToFrame(frameRef.current, event);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [bossLabRequested, useDesktopShell]);

  if (bossLabRequested || !useDesktopShell) return <>{children}</>;

  const frameStyle = {
    '--scicon-mobile-frame-scale': String(frameScale)
  } as React.CSSProperties;

  return (
    <main
      className="scicon-desktop-mobile-launch"
      data-launch-state="playing-here"
    >
      <div className="scicon-desktop-mobile-launch__shade" aria-hidden="true" />

      <section
        className="scicon-desktop-mobile-launch__play-area"
        aria-label="Scicon Shooter game frame"
        style={{ '--scicon-side-frame-scale': String(frameScale) } as React.CSSProperties}
      >
        <aside className="scicon-desktop-mobile-launch__controls" aria-label="Desktop controls">
          <span className="scicon-desktop-mobile-launch__eyebrow">Desktop flight controls</span>
          <dl>
            <div><dt><kbd>WASD</kbd> <kbd>Arrows</kbd></dt><dd>Steer and auto-fire</dd></div>
            <div><dt><kbd>Mouse</kbd></dt><dd>Hold and drag to steer and fire</dd></div>
            <div><dt><kbd>Space</kbd></dt><dd>Fire while standing still</dd></div>
            <div><dt><kbd>B</kbd></dt><dd>Drop a bomb</dd></div>
            <div><dt><kbd>Enter</kbd></dt><dd>Skip transmissions</dd></div>
          </dl>
        </aside>
        <div className="scicon-desktop-mobile-launch__frame" style={frameStyle}>
          <iframe
            ref={frameRef}
            className="scicon-desktop-mobile-launch__iframe"
            src={frameUrl}
            title="Scicon Shooter mobile game"
            allow="clipboard-write; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            data-testid="desktop-mobile-game-frame"
            onLoad={() => frameRef.current?.contentWindow?.focus()}
          />
        </div>
        <a
          className="scicon-desktop-mobile-launch__qr-card scicon-desktop-mobile-launch__side-qr"
          href={DONATION_CONFIG.BASE_APP_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the Scicon Shooter Base App invite"
          onClick={() => trackDesktopLaunchChoice('base_app', 'qr')}
        >
          <span>Play on your phone</span>
          <img src={BASE_APP_INVITE_QR} alt="QR code for the Scicon Shooter Base App invite" />
          <small>Scan for Base App</small>
        </a>
      </section>
    </main>
  );
};

export default DesktopMobileLaunchShell;
