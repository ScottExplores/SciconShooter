import { getPreviewReadPolicy, isApiPath, previewReadOnlyResponse } from './readOnlyPolicy.js';

export const PREVIEW_READ_ONLY_MESSAGE = 'Test build — scores and claims are not submitted. Play Weekly Run for practice.';

export const detectPreviewMode = (hostname: string, configuredValue?: unknown): boolean => (
  hostname.toLowerCase().replace(/\.$/, '').endsWith('.pages.dev')
  || configuredValue === true
  || /^(true|1)$/i.test(String(configuredValue ?? '').trim())
);

export const isPreviewMode = (): boolean => detectPreviewMode(
  typeof window === 'undefined' ? '' : window.location.hostname,
  import.meta.env?.VITE_PREVIEW_MODE
);

export const assertPreviewWritable = (): void => {
  if (!isPreviewMode()) return;
  throw Object.assign(new Error(PREVIEW_READ_ONLY_MESSAGE), {
    code: 'PREVIEW_READ_ONLY',
    statusCode: 503
  });
};

let installed = false;

/**
 * Install before mounting React. This final browser boundary also catches
 * analytics, wallet and future API writes on VITE_PREVIEW_MODE builds that are
 * hosted somewhere other than Pages. The Pages middleware is the server gate.
 */
export const installPreviewRequestGuard = (): void => {
  if (installed || !isPreviewMode() || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), window.location.href);
    if (!isApiPath(url.pathname)) return originalFetch(input, init);
    const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' || !getPreviewReadPolicy(url)) return previewReadOnlyResponse();

    // Ignore production URL overrides in preview. All approved public reads go
    // through the same-origin proxy; never forward wallet cookies or headers.
    const target = new URL(`${url.pathname}${url.search}`, window.location.origin);
    target.searchParams.set('previewReadOnly', '1');
    return originalFetch(target, {
      method: 'GET',
      headers: { Accept: new Headers(init?.headers ?? request?.headers).get('Accept') ?? 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: init?.signal ?? request?.signal,
      cache: init?.cache ?? request?.cache
    });
  };
};
