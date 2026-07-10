import { GAME_VERSION } from './runReceiptService';

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

const SESSION_KEY = 'scicon_analytics_session';
const SEEN_KEY = 'scicon_first_seen_at';

const getSessionId = () => {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, next);
  return next;
};

export const trackEvent = (
  eventName: ProductEventName,
  properties: Record<string, string | number | boolean> = {}
) => {
  const payload = JSON.stringify({
    eventName,
    sessionId: getSessionId(),
    gameVersion: GAME_VERSION,
    properties
  });
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => undefined);
};

export const trackInitialVisit = () => {
  const firstSeen = localStorage.getItem(SEEN_KEY);
  trackEvent('app_opened', { display_mode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser' });
  if (firstSeen) {
    trackEvent('returning_player', { days_since_first_seen: Math.max(0, Math.floor((Date.now() - Number(firstSeen)) / 86400000)) });
  } else {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  }
};
