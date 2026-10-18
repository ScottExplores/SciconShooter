// Shared by the browser guard and Pages middleware. New GET routes require an
// explicit audit: some production GET endpoints (cron/admin) perform writes.
export const PREVIEW_READ_ROUTES = Object.freeze({
  '/api/leaderboard': { ttl: 15, query: ['weekKey'] },
  '/api/weekly-competitions': { ttl: 30, query: [] },
  '/api/researchhub-proposals': { ttl: 120, query: ['includeProposalIds'] },
  '/api/record-metadata': { ttl: 300, query: ['runId', 'ship'] },
  '/api/record-card': { ttl: 300, query: ['runId', 'ship'] }
});

export function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function getPreviewReadPolicy(url) {
  const policy = Object.hasOwn(PREVIEW_READ_ROUTES, url.pathname)
    ? PREVIEW_READ_ROUTES[url.pathname]
    : null;
  if (!policy) return null;
  for (const key of url.searchParams.keys()) {
    if (key !== 'previewReadOnly' && !policy.query.includes(key)) return null;
  }
  return policy;
}

export function previewReadOnlyResponse() {
  return new Response(JSON.stringify({ error: 'PREVIEW_READ_ONLY' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
