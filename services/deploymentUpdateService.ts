const ENTRY_ASSET_PATTERN = /(?:src|href)=["']([^"']*\/assets\/index-[^"']+\.js)["']/i;
const UPDATE_QUERY_KEY = '__scicon_build';

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
