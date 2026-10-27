const EVENT_LOADER_VARIANTS = new Set(['umbra', 'helios']);

/**
 * Preview-only event loading mockup. Absent, empty, and unknown values stay
 * off so the normal game never shows this screen.
 */
export const eventLoaderVariant = (search = '') => {
  const query = String(search).startsWith('?') ? String(search).slice(1) : String(search);
  const value = new URLSearchParams(query).get('event-loader');
  return EVENT_LOADER_VARIANTS.has(value) ? value : null;
};
