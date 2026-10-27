const loadDecodedImage = (url: string) => new Promise<boolean>((resolve) => {
  if (typeof Image === 'undefined') {
    resolve(false);
    return;
  }
  const image = new Image();
  let settled = false;
  const finish = (decoded: boolean) => {
    if (settled) return;
    settled = true;
    resolve(decoded);
  };
  const handleLoad = () => {
    if (image.naturalWidth <= 0) {
      finish(false);
      return;
    }
    if (typeof image.decode !== 'function') {
      finish(true);
      return;
    }
    void image.decode().then(
      () => finish(true),
      () => finish(image.naturalWidth > 0)
    );
  };
  image.addEventListener('load', handleLoad, { once: true });
  image.addEventListener('error', () => finish(false), { once: true });
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.src = url;
  if (image.complete) {
    if (image.naturalWidth > 0) handleLoad();
    else finish(false);
  }
});

export const EVENT_LOADING_BACKGROUND = '/game-art/generated/ui/scicon-mission-loading-v1/loading-background.png';
export const EVENT_LOADING_EMBLEM = '/game-art/generated/ui/scicon-mission-loading-v1/loading-emblem.png';
export const EVENT_LOADING_BAR_FRAME = '/game-art/generated/ui/scicon-mission-loading-v1/loading-bar-frame.png';
export const EVENT_LOADING_BOSS = '/game-art/generated/bosses/campaign-packages/umbra-needlewing/assembled.png';
export const EVENT_LOADING_SHIPS = [
  { key: 'researchhub', src: '/game-art/branding/researchhub-ship.png' },
  { key: 'bio', src: '/game-art/branding/bio-ship.png' },
  { key: 'nih', src: '/game-art/branding/nih-ship.png' },
  { key: 'eth', src: '/game-art/branding/eth-ship.png' },
  { key: 'btc', src: '/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png' }
] as const;

/** Small splash frames first, then the wide background, so a slow link paints the cast before the backdrop finishes. */
export const EVENT_LOADING_ART_URLS = [
  EVENT_LOADING_EMBLEM,
  EVENT_LOADING_BAR_FRAME,
  EVENT_LOADING_BOSS,
  ...EVENT_LOADING_SHIPS.map((ship) => ship.src),
  EVENT_LOADING_BACKGROUND
] as const;

/** Extra time the startup loader may wait for splash art after the game is ready. */
export const EVENT_LOADING_ART_EXTRA_WAIT_MS = 1000;

let pendingArt: Promise<boolean> | null = null;

/** Resolves true only when every splash image has decoded. A failure resolves false and never rejects. */
export const preloadEventLoadingArt = () => {
  if (!pendingArt) {
    pendingArt = Promise.all(EVENT_LOADING_ART_URLS.map(loadDecodedImage))
      .then((decoded) => decoded.every(Boolean));
  }
  return pendingArt;
};
