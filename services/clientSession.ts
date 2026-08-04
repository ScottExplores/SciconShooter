const CLIENT_SESSION_KEY = 'scicon_analytics_session';

let memorySessionId = '';

const createSessionId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
};

/**
 * Anonymous, per-tab identifier shared by product analytics and player reports.
 * Storage access can be denied in embedded/private browser modes, so the game
 * always retains an in-memory fallback rather than breaking startup.
 */
export const getClientSessionId = () => {
  if (memorySessionId) return memorySessionId;

  try {
    const existing = globalThis.sessionStorage?.getItem(CLIENT_SESSION_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      memorySessionId = existing;
      return memorySessionId;
    }
  } catch {
    // Session storage is optional for embedded/private browser modes.
  }

  memorySessionId = createSessionId();
  try {
    globalThis.sessionStorage?.setItem(CLIENT_SESSION_KEY, memorySessionId);
  } catch {
    // The in-memory identifier remains valid for this tab.
  }
  return memorySessionId;
};
