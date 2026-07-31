export const GAMEPLAY_ASSET_PRELOAD_BUDGET_MS = 6_000;
export const GAMEPLAY_ASSET_PRELOAD_CONCURRENCY = 8;

type GameplayAssetPreloadStatus = 'ready' | 'timed-out';
type TimerHandle = ReturnType<typeof setTimeout>;

interface GameplayAssetPreloadBudgetOptions {
  timeoutMs?: number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
}

/**
 * Keeps texture decoding from flooding a phone's main thread. Individual art
 * failures are optional and therefore settle like Promise.allSettled.
 */
export const runGameplayAssetPreloadQueue = async <T>(
  items: readonly T[],
  load: (item: T) => Promise<unknown>,
  concurrency = GAMEPLAY_ASSET_PRELOAD_CONCURRENCY
) => {
  let cursor = 0;
  const workerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(concurrency))
  );
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await load(item);
      } catch {
        // Optional art is retried by the runtime if it is actually needed.
      }
    }
  });
  await Promise.all(workers);
};

/**
 * Lets optional art continue warming without allowing one slow decoder or
 * request to strand mission launch. Real preload failures still reject while
 * they are inside the launch budget.
 */
export const waitForGameplayAssetPreload = <T>(
  preload: Promise<T>,
  options: GameplayAssetPreloadBudgetOptions = {}
): Promise<GameplayAssetPreloadStatus> => {
  const timeoutMs = Math.max(
    0,
    options.timeoutMs ?? GAMEPLAY_ASSET_PRELOAD_BUDGET_MS
  );
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));

  return new Promise<GameplayAssetPreloadStatus>((resolve, reject) => {
    let settled = false;
    let timer: TimerHandle | undefined;

    const clearScheduledTimeout = () => {
      if (timer === undefined) return;
      cancel(timer);
      timer = undefined;
    };

    const finish = (status: GameplayAssetPreloadStatus) => {
      if (settled) return;
      settled = true;
      clearScheduledTimeout();
      resolve(status);
    };

    timer = schedule(() => finish('timed-out'), timeoutMs);
    if (settled) clearScheduledTimeout();
    preload.then(
      () => finish('ready'),
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearScheduledTimeout();
        reject(error);
      }
    );
  });
};
