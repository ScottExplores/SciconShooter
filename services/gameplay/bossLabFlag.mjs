const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when the page URL asks for the hidden boss lab. Presence is enough. */
export const isBossLabQueryEnabled = (search = '') => {
  const query = String(search).startsWith('?') ? String(search).slice(1) : String(search);
  return new URLSearchParams(query).has('bosslab');
};

/**
 * Ctrl+Shift+B opens the lab. Plain B, and the chord while typing, do not.
 * Alt and meta stay out so browser and OS shortcuts keep their keys.
 */
export const isBossLabDevKey = (event) => {
  if (!event || event.altKey || event.metaKey || !event.ctrlKey || !event.shiftKey) return false;
  if (event.code !== 'KeyB' && event.key !== 'b' && event.key !== 'B') return false;
  const target = event.target;
  if (target && typeof target === 'object') {
    if (TYPING_TAGS.has(target.tagName)) return false;
    if (target.isContentEditable) return false;
  }
  return true;
};
