import { runGameplayAssetPreloadQueue } from './gameplayAssetPreloadBudget';

export type DecodedImagePreloadItemStatus = 'loaded' | 'failed' | 'unavailable';
export type DecodedImagePreloadItemListener = (
  url: string,
  status: DecodedImagePreloadItemStatus
) => void;

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
  concurrency = 4,
  onItemSettled?: DecodedImagePreloadItemListener
) => {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  const notifyItemSettled = (url: string, status: DecodedImagePreloadItemStatus) => {
    try {
      onItemSettled?.(url, status);
    } catch {
      // Progress presentation must never turn an optional image into a failure.
    }
  };
  if (typeof Image === 'undefined') {
    uniqueUrls.forEach((url) => notifyItemSettled(url, 'unavailable'));
    return Promise.resolve();
  }
  const failedUrls: string[] = [];
  return runGameplayAssetPreloadQueue(
    uniqueUrls,
    async (url) => {
      try {
        await loadDecodedImage(url);
        notifyItemSettled(url, 'loaded');
      } catch {
        failedUrls.push(url);
        notifyItemSettled(url, 'failed');
      }
    },
    concurrency
  ).then(() => {
    if (failedUrls.length > 0) {
      throw new Error(`${failedUrls.length} menu image preload(s) failed.`);
    }
  });
};
