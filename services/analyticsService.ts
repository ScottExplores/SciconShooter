import { GAME_VERSION } from './runReceiptService';
import { getClientSessionId } from './clientSession';
import { recordPlayerReportBreadcrumb } from './playerReportService';

export type ProductEventName =
  | 'app_opened'
  | 'mission_started'
  | 'mission_completed'
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

export const trackEvent = (
  eventName: ProductEventName,
  properties: Record<string, string | number | boolean> = {}
) => {
  const payload = JSON.stringify({
    eventName,
    sessionId: getClientSessionId(),
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

export const trackInitialVisit = () => {
  const firstSeen = localStorage.getItem(SEEN_KEY);
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  trackEvent('app_opened', {
    display_mode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    viewport: window.innerWidth < 560 ? 'compact' : 'wide',
    connection: String(connection?.effectiveType || 'unknown').slice(0, 24),
    save_data: Boolean(connection?.saveData),
    navigation_ms: navigation ? Math.max(0, Math.round(navigation.duration)) : 0
  });
  if (firstSeen) {
    trackEvent('returning_player', { days_since_first_seen: Math.max(0, Math.floor((Date.now() - Number(firstSeen)) / 86400000)) });
  } else {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  }
};
