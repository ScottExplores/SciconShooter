import { readQAConfig } from './config';

/** A fresh, disposable profile for each QA page load; never read or mutate player saves. */
export const createQAStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(String(key)) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => { entries.delete(String(key)); },
    setItem: (key, value) => { entries.set(String(key), String(value)); }
  };
};

export const installQAStorage = (target: Window) => {
  if (!readQAConfig(target.location.search).enabled) return;
  // This import runs before App/services initialize. Replacing the window property
  // leaves the browser's real Storage object and all normal profile keys untouched.
  Object.defineProperty(target, 'localStorage', {
    configurable: true,
    value: createQAStorage()
  });
};

if (typeof window !== 'undefined') installQAStorage(window);
