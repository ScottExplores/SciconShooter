import type { RenderQualityMode } from './AdaptiveRenderQuality';

export const RENDER_QUALITY_SETTINGS_KEY = 'scicon:render-quality:v1';
export const DEFAULT_RENDER_QUALITY_MODE: RenderQualityMode = 'auto';

interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isQualityMode = (value: unknown): value is RenderQualityMode => value === 'auto' || value === 'high' || value === 'low';

/** Only the player's mode is persisted; measured tiers never trigger React work. */
export class RenderQualitySettingsStore {
  private mode: RenderQualityMode = DEFAULT_RENDER_QUALITY_MODE;
  private listeners = new Set<() => void>();

  constructor(private readonly storage?: SettingsStorage) { this.reload(); }

  getSnapshot = () => this.mode;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  set(mode: RenderQualityMode) {
    if (!isQualityMode(mode) || this.mode === mode) return;
    this.publish(mode);
    try {
      this.storage?.setItem(RENDER_QUALITY_SETTINGS_KEY, JSON.stringify({ version: 1, mode }));
    } catch { /* Privacy mode: the selected setting still works for this session. */ }
  }

  reload() {
    try {
      const raw = this.storage?.getItem(RENDER_QUALITY_SETTINGS_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      this.publish(saved?.version === 1 && isQualityMode(saved.mode) ? saved.mode : DEFAULT_RENDER_QUALITY_MODE);
    } catch { /* Unavailable or malformed storage preserves the current setting. */ }
  }

  private publish(mode: RenderQualityMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const listener of this.listeners) listener();
  }
}

let browserStore: RenderQualitySettingsStore | undefined;
const getStore = () => {
  if (browserStore) return browserStore;
  let storage: SettingsStorage | undefined;
  if (typeof window !== 'undefined') {
    try { storage = window.localStorage; } catch { /* Access itself may be denied. */ }
  }
  const store = browserStore = new RenderQualitySettingsStore(storage);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === RENDER_QUALITY_SETTINGS_KEY || event.key === null) store.reload();
    });
  }
  return store;
};

export const getRenderQualityMode = () => getStore().getSnapshot();
export const getServerRenderQualityMode = () => DEFAULT_RENDER_QUALITY_MODE;
export const subscribeRenderQualityMode = (listener: () => void) => getStore().subscribe(listener);
export const setRenderQualityMode = (mode: RenderQualityMode) => getStore().set(mode);
