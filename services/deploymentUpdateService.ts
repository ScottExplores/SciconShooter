const ENTRY_ASSET_PATTERN = /(?:src|href)=["']([^"']*\/assets\/index-[^"']+\.js)["']/i;
const UPDATE_QUERY_KEY = '__scicon_build';
const MODULE_RECOVERY_QUERY_KEY = '__scicon_module_retry';
const MODULE_RECOVERY_STORAGE_KEY = 'scicon:module-preload-recovery';
const MODULE_RECOVERY_COOLDOWN_MS = 60_000;
const APP_RECOVERY_QUERY_KEY = '__scicon_recovery';
const TRANSIENT_WALLET_STORAGE_KEY = 'scicon_wallet_address';

const normalizeAssetPath = (assetUrl: string, baseUrl: string) => {
  try {
    return new URL(assetUrl, baseUrl).pathname;
  } catch {
    return '';
  }
};

export const extractEntryAssetPath = (html: string, baseUrl: string) => {
  const match = html.match(ENTRY_ASSET_PATTERN);
  return match ? normalizeAssetPath(match[1], baseUrl) : '';
};

export const getCurrentEntryAssetPath = (
  documentRef: Pick<Document, 'querySelector'> = document
) => {
  const entryScript = documentRef.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/index-"]'
  );
  return entryScript?.src
    ? normalizeAssetPath(entryScript.src, window.location.href)
    : '';
};

export const checkForDeploymentUpdate = async (
  fetchImpl: typeof fetch = fetch,
  documentRef: Pick<Document, 'querySelector'> = document,
  locationRef: Pick<Location, 'href' | 'origin'> = window.location
) => {
  const currentEntryAsset = getCurrentEntryAssetPath(documentRef);
  if (!currentEntryAsset) return null;

  try {
    const checkUrl = new URL('/', locationRef.origin);
    checkUrl.searchParams.set('__scicon_update_check', String(Date.now()));
    const response = await fetchImpl(checkUrl.toString(), {
      cache: 'no-store',
      headers: {
        Accept: 'text/html',
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) return null;

    const deployedEntryAsset = extractEntryAssetPath(await response.text(), locationRef.href);
    return deployedEntryAsset && deployedEntryAsset !== currentEntryAsset
      ? deployedEntryAsset
      : null;
  } catch {
    // Network loss should never interrupt an active session.
    return null;
  }
};

export const reloadForDeploymentUpdate = (
  entryAsset: string,
  locationRef: Pick<Location, 'href' | 'replace'> = window.location
) => {
  const nextUrl = new URL(locationRef.href);
  nextUrl.searchParams.set(UPDATE_QUERY_KEY, entryAsset.split('/').pop() || String(Date.now()));
  locationRef.replace(nextUrl.toString());
};

/**
 * Recover from an application render failure without replaying a stale wallet
 * session or reusing the exact same cached document URL. Persistent pilot,
 * campaign, purchase, and dirty-profile data deliberately remain untouched.
 */
export const reloadFromLastSafeState = ({
  locationRef = window.location,
  storageRef = window.localStorage,
  now = Date.now()
}: {
  locationRef?: Pick<Location, 'href' | 'replace'>;
  storageRef?: Pick<Storage, 'removeItem'>;
  now?: number;
} = {}) => {
  try {
    storageRef.removeItem(TRANSIENT_WALLET_STORAGE_KEY);
  } catch {
    // Private storage restrictions must not prevent recovery.
  }

  const nextUrl = new URL(locationRef.href);
  nextUrl.searchParams.set(APP_RECOVERY_QUERY_KEY, String(now));
  locationRef.replace(nextUrl.toString());
};

export const isModulePreloadFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script/i.test(
    message
  );
};

/**
 * Recover once from an outdated Vite/production chunk without trapping an
 * offline player in a reload loop. The query parameter bypasses a stale HTML
 * document while session storage coordinates duplicate preload error events.
 */
export const recoverFromModulePreloadFailure = (
  error: unknown,
  {
    locationRef = window.location,
    storageRef = window.sessionStorage,
    now = Date.now()
  }: {
    locationRef?: Pick<Location, 'href' | 'replace'>;
    storageRef?: Pick<Storage, 'getItem' | 'setItem'>;
    now?: number;
  } = {}
) => {
  if (!isModulePreloadFailure(error)) return false;

  const nextUrl = new URL(locationRef.href);
  const queryAttempt = Number(nextUrl.searchParams.get(MODULE_RECOVERY_QUERY_KEY));
  let storedAttempt = 0;
  try {
    storedAttempt = Number(storageRef.getItem(MODULE_RECOVERY_STORAGE_KEY)) || 0;
  } catch {
    // The URL guard still prevents a reload loop when storage is unavailable.
  }
  const lastAttempt = Math.max(
    Number.isFinite(queryAttempt) ? queryAttempt : 0,
    Number.isFinite(storedAttempt) ? storedAttempt : 0
  );
  if (lastAttempt > 0 && now - lastAttempt < MODULE_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  try {
    storageRef.setItem(MODULE_RECOVERY_STORAGE_KEY, String(now));
  } catch {
    // Cache-busting the URL remains sufficient for this recovery attempt.
  }
  nextUrl.searchParams.set(MODULE_RECOVERY_QUERY_KEY, String(now));
  locationRef.replace(nextUrl.toString());
  return true;
};
