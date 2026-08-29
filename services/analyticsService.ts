import { GAME_VERSION } from './runReceiptService';
import { getClientSessionId } from './clientSession';
import { recordPlayerReportBreadcrumb } from './playerReportService';
import { readSocialCampaignAttribution } from '../shared/socialCampaignAttribution.mjs';

export type ProductEventName =
  | 'app_opened'
  | 'desktop_launch_viewed'
  | 'desktop_launch_selected'
  | 'session_activity'
  | 'mission_started'
  | 'mission_completed'
  | 'run_progress'
  | 'run_ended'
  | 'score_submitted'
  | 'returning_player'
  | 'wallet_connected'
  | 'mint_preview_opened'
  | 'mission_record_minted'
  | 'weekly_champion_claimed'
  | 'proposal_selected'
  | 'funding_transaction_confirmed'
  | 'share_action_used';

const SEEN_KEY = 'scicon_first_seen_at';
const ANONYMOUS_PLAYER_KEY = 'scicon_anonymous_player_id';
const ACTIVITY_STATE_KEY = 'scicon_product_activity_state';
const ACTIVITY_INTERVAL_MS = 60_000;

let memoryAnonymousPlayerId = '';
let updateGameplayActivity: ((active: boolean) => void) | null = null;

const isLoopbackAnalyticsHost = () => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
};

const readActivityState = (sessionId: string) => {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem(ACTIVITY_STATE_KEY) || '{}');
    if (parsed?.sessionId !== sessionId) return { activeSecondsTotal: 0, gameplaySecondsTotal: 0 };
    const activeSecondsTotal = Number(parsed.activeSecondsTotal);
    const gameplaySecondsTotal = Number(parsed.gameplaySecondsTotal);
    return {
      activeSecondsTotal: Number.isFinite(activeSecondsTotal)
        ? Math.max(0, Math.min(604_800, Math.floor(activeSecondsTotal)))
        : 0,
      gameplaySecondsTotal: Number.isFinite(gameplaySecondsTotal)
        ? Math.max(0, Math.min(604_800, Math.floor(gameplaySecondsTotal)))
        : 0
    };
  } catch {
    return { activeSecondsTotal: 0, gameplaySecondsTotal: 0 };
  }
};

const writeActivityState = (
  sessionId: string,
  activeSecondsTotal: number,
  gameplaySecondsTotal: number
) => {
  try {
    globalThis.sessionStorage?.setItem(ACTIVITY_STATE_KEY, JSON.stringify({
      sessionId,
      activeSecondsTotal,
      gameplaySecondsTotal
    }));
  } catch {
    // Activity remains measurable for this page even when session storage is unavailable.
  }
};

const createAnonymousPlayerId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
};

/**
 * A random device-local identifier used only to estimate new and returning
 * players. It is not derived from a wallet, account, name, IP address, or other
 * personal value. The server stores only a keyed hash of this identifier.
 */
export const getAnonymousPlayerId = () => {
  if (memoryAnonymousPlayerId) return memoryAnonymousPlayerId;

  try {
    const existing = globalThis.localStorage?.getItem(ANONYMOUS_PLAYER_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      memoryAnonymousPlayerId = existing;
      return memoryAnonymousPlayerId;
    }
  } catch {
    // Embedded and private browser modes may deny local storage.
  }

  memoryAnonymousPlayerId = createAnonymousPlayerId();
  try {
    globalThis.localStorage?.setItem(ANONYMOUS_PLAYER_KEY, memoryAnonymousPlayerId);
  } catch {
    // The in-memory identifier remains valid for this tab.
  }
  return memoryAnonymousPlayerId;
};

export const trackEvent = (
  eventName: ProductEventName,
  properties: Record<string, string | number | boolean> = {}
) => {
  // Local Codex/Claude/Vite playtests must never inflate production player counts.
  if (isLoopbackAnalyticsHost()) return;
  const payload = JSON.stringify({
    eventName,
    sessionId: getClientSessionId(),
    anonymousPlayerId: getAnonymousPlayerId(),
    gameVersion: GAME_VERSION,
    properties
  });
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => {
    recordPlayerReportBreadcrumb('analytics_delivery_failed', { event_name: eventName });
  });
};

/**
 * Marks whether the live simulation is actually advancing. The activity sampler
 * flushes before each transition, so gameplay time excludes menus, pause screens,
 * transmissions, loading, and result screens without emitting frame-level events.
 */
export const setAnalyticsGameplayActive = (active: boolean) => {
  updateGameplayActivity?.(Boolean(active));
};

/**
 * Starts one bounded foreground-time sampler for the app lifetime. Activity is
 * sampled once per minute and whenever the tab hides or closes; no telemetry is
 * emitted from the Pixi frame loop.
 */
export const trackInitialVisit = () => {
  if (isLoopbackAnalyticsHost()) return () => undefined;
  let firstSeen: string | null = null;
  try {
    firstSeen = localStorage.getItem(SEEN_KEY);
  } catch {
    // A first-seen timestamp is optional in restricted browser modes.
  }
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  trackEvent('app_opened', {
    display_mode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    viewport: window.innerWidth < 560 ? 'compact' : 'wide',
    connection: String(connection?.effectiveType || 'unknown').slice(0, 24),
    save_data: Boolean(connection?.saveData),
    navigation_ms: navigation ? Math.max(0, Math.round(navigation.duration)) : 0,
    player_status: firstSeen ? 'returning' : 'new',
    ...readSocialCampaignAttribution(window.location.search)
  });
  if (firstSeen) {
    trackEvent('returning_player', {
      days_since_first_seen: Math.max(0, Math.floor((Date.now() - Number(firstSeen)) / 86400000))
    });
  } else {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      // The app remains playable without persistent browser storage.
    }
  }

  const sessionId = getClientSessionId();
  const restoredActivity = readActivityState(sessionId);
  let visible = document.visibilityState === 'visible';
  let gameplayActive = false;
  let lastSampleAt = Date.now();
  let activeSecondsTotal = restoredActivity.activeSecondsTotal;
  let gameplaySecondsTotal = restoredActivity.gameplaySecondsTotal;
  let lastEmittedActiveSeconds = activeSecondsTotal;
  let lastEmittedGameplaySeconds = gameplaySecondsTotal;
  let stopped = false;

  const flushActivity = (
    reason: 'interval' | 'visibility' | 'pagehide' | 'unmount' | 'gameplay_state'
  ) => {
    const sampledAt = Date.now();
    if (visible) {
      const elapsedSeconds = Math.max(
        0,
        Math.min(75, Math.floor((sampledAt - lastSampleAt) / 1000))
      );
      activeSecondsTotal += elapsedSeconds;
      if (gameplayActive) gameplaySecondsTotal += elapsedSeconds;
    }
    lastSampleAt = sampledAt;
    if (
      activeSecondsTotal < 1
      || (
        activeSecondsTotal === lastEmittedActiveSeconds
        && gameplaySecondsTotal === lastEmittedGameplaySeconds
      )
    ) return;
    lastEmittedActiveSeconds = activeSecondsTotal;
    lastEmittedGameplaySeconds = gameplaySecondsTotal;
    writeActivityState(sessionId, activeSecondsTotal, gameplaySecondsTotal);
    trackEvent('session_activity', {
      active_seconds_total: activeSecondsTotal,
      gameplay_seconds_total: gameplaySecondsTotal,
      reason
    });
  };

  const handleVisibilityChange = () => {
    flushActivity('visibility');
    visible = document.visibilityState === 'visible';
    lastSampleAt = Date.now();
  };
  const handlePageHide = () => flushActivity('pagehide');
  const handleGameplayActivity = (active: boolean) => {
    if (stopped || gameplayActive === active) return;
    flushActivity('gameplay_state');
    gameplayActive = active;
    lastSampleAt = Date.now();
  };
  updateGameplayActivity = handleGameplayActivity;
  const activityTimer = window.setInterval(() => flushActivity('interval'), ACTIVITY_INTERVAL_MS);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  return () => {
    if (stopped) return;
    stopped = true;
    flushActivity('unmount');
    if (updateGameplayActivity === handleGameplayActivity) updateGameplayActivity = null;
    window.clearInterval(activityTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
  };
};
