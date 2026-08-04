import { runGameplayAssetPreloadQueue } from './gameplayAssetPreloadBudget';

const loadDecodedImage = async (url: string) => {
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const cleanup = () => {
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleLoad = () => {
      if (typeof image.decode !== 'function') {
        finish();
        return;
      }
      void image.decode().then(
        () => finish(),
        // A few embedded browsers reject decode() after a valid load. The
        // natural dimensions still prove the frame is usable.
        () => image.naturalWidth > 0
          ? finish()
          : finish(new Error(`Image decode failed: ${url}`))
      );
    };
    const handleError = () => finish(new Error(`Image preload failed: ${url}`));
    image.addEventListener('load', handleLoad, { once: true });
    image.addEventListener('error', handleError, { once: true });
    image.decoding = 'async';
    image.src = url;
    if (image.complete) {
      if (image.naturalWidth > 0) handleLoad();
      else handleError();
    }
  });
};

/** Browser-image warmup used by menus, with a small mobile-safe worker pool. */
export const preloadDecodedImageUrls = (
  urls: readonly string[],
  concurrency = 4
) => {
  if (typeof Image === 'undefined') return Promise.resolve();
  const failedUrls: string[] = [];
  return runGameplayAssetPreloadQueue(
    [...new Set(urls.filter(Boolean))],
    async (url) => {
      try {
        await loadDecodedImage(url);
      } catch {
        failedUrls.push(url);
      }
    },
    concurrency
  ).then(() => {
    if (failedUrls.length > 0) {
      throw new Error(`${failedUrls.length} menu image preload(s) failed.`);
    }
  });
};
