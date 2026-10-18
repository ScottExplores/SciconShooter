import {
  getPreviewReadPolicy,
  isApiPath,
  previewReadOnlyResponse
} from '../../../services/revamp/preview/readOnlyPolicy.js';

const PRODUCTION_ORIGIN = 'https://www.sciconshooter.xyz';
const UPSTREAM_TIMEOUT_MS = 8000;

const unavailable = () => new Response(JSON.stringify({ error: 'PREVIEW_UPSTREAM_UNAVAILABLE' }), {
  status: 502,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // Art, audio, fonts and the application itself are included in dist.
  if (!isApiPath(url.pathname)) return context.next();
  if (context.request.method !== 'GET') return previewReadOnlyResponse();
  const policy = getPreviewReadPolicy(url);
  if (!policy) return previewReadOnlyResponse();

  // The flag suppresses proposal-cache writes on the production read handler.
  url.searchParams.set('previewReadOnly', '1');
  url.searchParams.sort();
  const cacheKey = new Request(url, { method: 'GET' });
  const cache = globalThis.caches?.default;
  try {
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;
  } catch {
    // A cache outage must not prevent a public read.
  }

  const upstreamUrl = new URL(`${url.pathname}${url.search}`, PRODUCTION_ORIGIN);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { Accept: url.pathname === '/api/record-card' ? 'image/svg+xml' : 'application/json' },
      credentials: 'omit',
      redirect: 'manual',
      signal: controller.signal
    });
    // Do not follow redirects to a non-audited route or forward private data.
    if (upstream.status >= 300 && upstream.status < 400) return unavailable();
    const cacheControl = upstream.headers.get('Cache-Control') ?? '';
    const vary = upstream.headers.get('Vary') ?? '';
    const privateResponse = upstream.headers.has('Set-Cookie')
      || /(?:private|no-store|no-cache)/i.test(cacheControl)
      || /(?:cookie|authorization|\*)/i.test(vary);
    const cacheable = upstream.status === 200 && !privateResponse;
    // Keep the deadline active while reading the body, not just the headers.
    const body = await upstream.arrayBuffer();
    const response = new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': cacheable ? `public, max-age=${policy.ttl}` : 'no-store',
        'X-Preview-Read-Only': '1',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    if (cacheable && cache) {
      context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    }
    return response;
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timeout);
  }
}
