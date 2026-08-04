export const GAMEPLAY_ASSET_PRELOAD_BUDGET_MS = 6_000;
export const GAMEPLAY_ASSET_PRELOAD_CONCURRENCY = 8;
export const REQUIRED_GAMEPLAY_ASSET_PRELOAD_DEADLINE_MS = 45_000;

type GameplayAssetPreloadStatus = 'ready' | 'timed-out';
type TimerHandle = ReturnType<typeof setTimeout>;

interface GameplayAssetPreloadBudgetOptions {
  timeoutMs?: number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
}

export class GameplayAssetPreloadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Mission assets did not finish loading within ${timeoutMs}ms.`);
    this.name = 'GameplayAssetPreloadTimeoutError';
  }
}

/**
 * Required art may keep the loader visible, but it may not strand every later
 * launch behind one stalled mobile request. The deadline rejects into the
 * existing Retry UI; unlike the optional budget below, it never reports a
 * timed-out preload as ready.
 */
export const waitForRequiredGameplayAssetPreload = <T>(
  preload: Promise<T>,
  options: GameplayAssetPreloadBudgetOptions = {}
): Promise<T> => {
  const timeoutMs = Math.max(
    0,
    options.timeoutMs ?? REQUIRED_GAMEPLAY_ASSET_PRELOAD_DEADLINE_MS
  );
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = schedule(() => {
      if (settled) return;
      settled = true;
      reject(new GameplayAssetPreloadTimeoutError(timeoutMs));
    }, timeoutMs);

    preload.then(
      (value) => {
        if (settled) return;
        settled = true;
        cancel(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cancel(timer);
        reject(error);
      }
    );
  });
};

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
 * Loads launch-critical art with the same mobile-safe concurrency ceiling while
 * preserving failures. A required asset must never be converted into a
 * successful timeout: the Mission loader stays up until it is decoded or the
 * player is shown the retry screen.
 */
export const runRequiredGameplayAssetPreloadQueue = async <T>(
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
      await load(item);
    }
  });
  await waitForRequiredGameplayAssetPreload(Promise.all(workers));
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
