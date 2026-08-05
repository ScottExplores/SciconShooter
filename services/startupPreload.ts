import { ASSETS } from '../constants';
import { PLAYER_SHIP_MOTION } from './playerShipMotion';
import type { PlayerShipId } from './playerShipService';
import {
  preloadDecodedImageUrls,
  type DecodedImagePreloadItemStatus
} from './browserImagePreload';
import { waitForGameplayAssetPreload } from './gameplayAssetPreloadBudget';

export const STARTUP_PRELOAD_BUDGET_MS = 6_000;
export const STARTUP_PRELOAD_INITIAL_PROGRESS = 5;

export const STARTUP_FONT_SPECS = Object.freeze([
  '400 1em Inter',
  '900 1em Orbitron'
] as const);

/**
 * Art required for a complete first Home frame. This deliberately excludes
 * wallet, leaderboard, proposal, audio, Campaign, and Pixi gameplay assets.
 * Those systems already have independent loading and fallback behavior.
 */
export const STARTUP_HOME_SHELL_IMAGE_URLS = Object.freeze([
  ASSETS.HOME_SPARSE_STARFIELD_BASE,
  ASSETS.HOME_SPARSE_STARFIELD,
  ASSETS.HOME_ASTEROID_FIELD,
  ASSETS.GAME_PARALLAX_BIG_PLANET,
  ASSETS.GAME_PARALLAX_RING_PLANET,
  ASSETS.PLAYER_SHIP,
  '/game-art/generated/ui/scicon-neon-dashboard-icons-v2/dashboard-nav-icons-static.png',
  '/game-art/generated/ui/scicon-neon-dashboard-icons-v2/boss-archive-defeated-emblem-v1.png',
  '/game-art/generated/ui/scicon-interface-pack-v1/buttons/navigation/map.png',
  '/game-art/generated/ui/scicon-pixel-action-buttons-v1/start-mission-panel.png',
  '/game-art/generated/ui/scicon-interface-pack-v1/resources/trophy.png',
  '/game-art/generated/ui/scicon-dashboard-icons-v1/selected/weekly-calendar-selected.png',
  '/game-art/generated/ui/scicon-reward-edge-v1/reward-arrow.png',
  '/game-art/generated/ui/scicon-ui-system-v2/base/achievements-more/achievement-unlocked-card.png'
]);

export type StartupPreloadPhase =
  | 'flight-systems'
  | 'mission-interface'
  | 'mission-art'
  | 'ready';

export interface StartupPreloadSnapshot {
  readonly progress: number;
  readonly phase: StartupPreloadPhase;
  readonly completedItems: number;
  readonly totalItems: number;
  readonly failedItems: number;
  readonly status: 'loading' | 'ready' | 'timed-out';
}

export interface StartupPreloadResult {
  readonly status: 'ready' | 'timed-out';
  readonly failedItems: readonly string[];
}

export interface StartupPreloadOptions {
  readonly selectedShipId?: PlayerShipId;
  readonly onProgress?: (snapshot: StartupPreloadSnapshot) => void;
  readonly timeoutMs?: number;
}

const STARTUP_PRELOAD_PROGRESS_SPAN = 94;
const STARTUP_IMAGE_CONCURRENCY = 4;

let startupPreloadPromise: Promise<StartupPreloadResult> | null = null;
let startupPreloadResult: StartupPreloadResult | null = null;
let startupPreloadSnapshot: StartupPreloadSnapshot = Object.freeze({
  progress: STARTUP_PRELOAD_INITIAL_PROGRESS,
  phase: 'flight-systems',
  completedItems: 0,
  totalItems: 0,
  failedItems: 0,
  status: 'loading'
});
const startupPreloadListeners = new Set<(snapshot: StartupPreloadSnapshot) => void>();

const notifyStartupPreloadListeners = () => {
  startupPreloadListeners.forEach((listener) => {
    try {
      listener(startupPreloadSnapshot);
    } catch {
      // A presentation listener cannot interfere with the shared preload.
    }
  });
};

const resolveStartupPhase = (
  completedItems: number,
  fontCount: number,
  status: StartupPreloadSnapshot['status']
): StartupPreloadPhase => {
  if (status === 'ready') return 'ready';
  if (completedItems <= 0) return 'flight-systems';
  if (completedItems < fontCount) return 'mission-interface';
  return 'mission-art';
};

const updateStartupPreloadSnapshot = (
  update: Partial<StartupPreloadSnapshot>,
  fontCount: number
) => {
  const completedItems = Math.max(
    startupPreloadSnapshot.completedItems,
    Math.min(update.totalItems ?? startupPreloadSnapshot.totalItems, update.completedItems ?? 0)
  );
  const totalItems = Math.max(
    completedItems,
    update.totalItems ?? startupPreloadSnapshot.totalItems
  );
  const status = update.status ?? startupPreloadSnapshot.status;
  const measuredProgress = totalItems > 0
    ? STARTUP_PRELOAD_INITIAL_PROGRESS
      + Math.round((completedItems / totalItems) * STARTUP_PRELOAD_PROGRESS_SPAN)
    : STARTUP_PRELOAD_INITIAL_PROGRESS;
  const progress = status === 'ready'
    ? 100
    : Math.max(
        startupPreloadSnapshot.progress,
        Math.min(99, update.progress ?? measuredProgress)
      );

  startupPreloadSnapshot = Object.freeze({
    progress,
    phase: update.phase ?? resolveStartupPhase(completedItems, fontCount, status),
    completedItems,
    totalItems,
    failedItems: Math.max(startupPreloadSnapshot.failedItems, update.failedItems ?? 0),
    status
  });
  notifyStartupPreloadListeners();
};

export const getStartupCriticalImageUrls = (
  selectedShipId: PlayerShipId = 'researchhub'
) => [...new Set([
  ...STARTUP_HOME_SHELL_IMAGE_URLS,
  ...PLAYER_SHIP_MOTION[selectedShipId].selectionIdleFrames
])];

const loadStartupFont = async (fontSpec: string) => {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  await document.fonts.load(fontSpec);
};

const runStartupPreload = async (
  selectedShipId: PlayerShipId,
  timeoutMs: number
): Promise<StartupPreloadResult> => {
  const imageUrls = getStartupCriticalImageUrls(selectedShipId);
  const totalItems = imageUrls.length + STARTUP_FONT_SPECS.length;
  const failedItems: string[] = [];
  let completedItems = 0;
  let acceptingProgress = true;

  startupPreloadSnapshot = Object.freeze({
    progress: STARTUP_PRELOAD_INITIAL_PROGRESS,
    phase: 'flight-systems',
    completedItems: 0,
    totalItems,
    failedItems: 0,
    status: 'loading'
  });
  notifyStartupPreloadListeners();

  const settleItem = (item: string, failed: boolean) => {
    if (!acceptingProgress) return;
    completedItems += 1;
    if (failed) failedItems.push(item);
    updateStartupPreloadSnapshot({
      completedItems,
      totalItems,
      failedItems: failedItems.length
    }, STARTUP_FONT_SPECS.length);
  };

  const fontWarmup = Promise.all(STARTUP_FONT_SPECS.map(async (fontSpec) => {
    try {
      await loadStartupFont(fontSpec);
      settleItem(`font:${fontSpec}`, false);
    } catch {
      settleItem(`font:${fontSpec}`, true);
    }
  }));
  const imageWarmup = preloadDecodedImageUrls(
    imageUrls,
    STARTUP_IMAGE_CONCURRENCY,
    (url: string, status: DecodedImagePreloadItemStatus) => {
      settleItem(url, status === 'failed');
    }
  ).catch(() => undefined);

  const preloadStatus = await waitForGameplayAssetPreload(
    Promise.all([fontWarmup, imageWarmup]),
    { timeoutMs }
  );
  acceptingProgress = false;

  if (preloadStatus === 'ready') {
    updateStartupPreloadSnapshot({
      completedItems: totalItems,
      totalItems,
      failedItems: failedItems.length,
      progress: 100,
      status: 'ready'
    }, STARTUP_FONT_SPECS.length);
  } else {
    updateStartupPreloadSnapshot({
      completedItems,
      totalItems,
      failedItems: failedItems.length,
      status: 'timed-out'
    }, STARTUP_FONT_SPECS.length);
  }

  return Object.freeze({
    status: preloadStatus,
    failedItems: Object.freeze([...failedItems])
  });
};

const ensureStartupPreload = (
  selectedShipId: PlayerShipId,
  timeoutMs: number
) => {
  if (startupPreloadResult) return Promise.resolve(startupPreloadResult);
  if (startupPreloadPromise) return startupPreloadPromise;

  startupPreloadPromise = runStartupPreload(selectedShipId, timeoutMs)
    .catch(() => {
      const result: StartupPreloadResult = Object.freeze({
        status: 'timed-out',
        failedItems: Object.freeze(['startup-preload'])
      });
      updateStartupPreloadSnapshot({
        failedItems: 1,
        status: 'timed-out'
      }, STARTUP_FONT_SPECS.length);
      return result;
    })
    .then((result) => {
      startupPreloadResult = result;
      return result;
    });

  return startupPreloadPromise;
};

/**
 * Warms one small, shared Home-shell request set. Calls made by React's
 * development StrictMode join the same promise, while failures and the hard
 * optional budget always resolve to a usable fallback result.
 */
export const preloadStartupAssets = (
  options: StartupPreloadOptions = {}
) => {
  const listener = options.onProgress;
  if (listener) {
    startupPreloadListeners.add(listener);
    listener(startupPreloadSnapshot);
  }
  const timeoutMs = Math.max(0, options.timeoutMs ?? STARTUP_PRELOAD_BUDGET_MS);
  const preload = ensureStartupPreload(
    options.selectedShipId ?? 'researchhub',
    timeoutMs
  );

  return listener
    ? preload.finally(() => startupPreloadListeners.delete(listener))
    : preload;
};

export const getStartupPreloadSnapshot = () => startupPreloadSnapshot;
