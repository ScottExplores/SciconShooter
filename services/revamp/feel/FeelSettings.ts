export const FEEL_SETTINGS_KEY = 'scicon:feel-settings:v1';

export interface FeelSettings {
  readonly reduceScreenShake: boolean;
  readonly showScoreNumbers: boolean;
  /** System accessibility preference; intentionally not overridden by storage. */
  readonly reducedMotion: boolean;
}

export type FeelSettingKey = 'reduceScreenShake' | 'showScoreNumbers';
interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_FEEL_SETTINGS: FeelSettings = Object.freeze({
  reduceScreenShake: false,
  showScoreNumbers: true,
  reducedMotion: false
});

/** Small injectable store keeps storage failures and browser globals out of tests. */
export class FeelSettingsStore {
  private snapshot: FeelSettings;
  private listeners = new Set<() => void>();

  constructor(private storage?: SettingsStorage, reducedMotion = false) {
    this.snapshot = Object.freeze({ ...DEFAULT_FEEL_SETTINGS, reducedMotion });
    this.reload();
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  set(key: FeelSettingKey, enabled: boolean) {
    if (this.snapshot[key] === enabled) return;
    this.publish({ ...this.snapshot, [key]: enabled });
    try {
      this.storage?.setItem(FEEL_SETTINGS_KEY, JSON.stringify({
        version: 1,
        reduceScreenShake: this.snapshot.reduceScreenShake,
        showScoreNumbers: this.snapshot.showScoreNumbers
      }));
    } catch { /* Privacy mode: preferences remain effective for this session. */ }
  }

  setReducedMotion(reducedMotion: boolean) {
    this.publish({ ...this.snapshot, reducedMotion });
  }

  reload() {
    try {
      const raw = this.storage?.getItem(FEEL_SETTINGS_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      this.publish({
        reducedMotion: this.snapshot.reducedMotion,
        reduceScreenShake: typeof saved?.reduceScreenShake === 'boolean' ? saved.reduceScreenShake : DEFAULT_FEEL_SETTINGS.reduceScreenShake,
        showScoreNumbers: typeof saved?.showScoreNumbers === 'boolean' ? saved.showScoreNumbers : DEFAULT_FEEL_SETTINGS.showScoreNumbers
      });
    } catch { /* Malformed or unavailable storage keeps the current safe snapshot. */ }
  }

  private publish(next: FeelSettings) {
    if (next.reduceScreenShake === this.snapshot.reduceScreenShake
      && next.showScoreNumbers === this.snapshot.showScoreNumbers
      && next.reducedMotion === this.snapshot.reducedMotion) return;
    this.snapshot = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
}

let browserStore: FeelSettingsStore | undefined;
const getStore = () => {
  if (browserStore) return browserStore;
  let storage: SettingsStorage | undefined;
  let media: MediaQueryList | undefined;
  if (typeof window !== 'undefined') {
    try { storage = window.localStorage; } catch { /* Storage can throw on access. */ }
    if (typeof window.matchMedia === 'function') media = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  const store = browserStore = new FeelSettingsStore(storage, media?.matches ?? false);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === FEEL_SETTINGS_KEY || event.key === null) store.reload();
    });
    media?.addEventListener?.('change', (event) => store.setReducedMotion(event.matches));
  }
  return store;
};

export const getFeelSettings = () => getStore().getSnapshot();
export const getServerFeelSettings = () => DEFAULT_FEEL_SETTINGS;
export const subscribeFeelSettings = (listener: () => void) => getStore().subscribe(listener);
export const setFeelSetting = (key: FeelSettingKey, enabled: boolean) => getStore().set(key, enabled);
