import { applyShareCardMeta, shareCardForTime } from './shared/socialShareCard.mjs';

export const config = {
  matcher: '/'
};

export default async function middleware(request) {
  const indexUrl = new URL('/index.html', request.url);
  const response = await fetch(indexUrl, { headers: { accept: 'text/html' } });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) {
    return response;
  }
  const html = applyShareCardMeta(await response.text(), shareCardForTime(Date.now()));
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.delete('content-length');
  return new Response(html, { status: response.status, headers });
}
