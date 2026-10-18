import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(REPO_ROOT, 'tools-revamp/qa/fixtures');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm' };

export async function fixtureFor(url) {
  const endpoint = url.searchParams.get('route') || url.pathname.split('/').pop();
  const name = /^[a-z0-9-]+$/.test(endpoint) ? endpoint : 'default';
  try { return JSON.parse(await readFile(path.join(FIXTURES, `${name}.json`), 'utf8')); }
  catch { return JSON.parse(await readFile(path.join(FIXTURES, 'default.json'), 'utf8')); }
}

// Local only. Request bodies, headers, query values, wallet addresses, and credentials are never logged.
export async function startStaticServer({ dist = path.join(REPO_ROOT, 'dist'), port = 0 } = {}) {
  const root = await realpath(dist);
  await stat(path.join(root, 'index.html'));
  const requests = [];
  const server = createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const route = url.searchParams.get('route');
        requests.push({ method: req.method, path: url.pathname, ...(route && /^[a-z0-9-]+$/.test(route) ? { route } : {}), status: 200 });
        req.resume();
        return json(200, req.method === 'GET' ? await fixtureFor(url) : { ok: true });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'Static server accepts GET and HEAD only' });
      const decoded = decodeURIComponent(url.pathname);
      let target = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!target.startsWith(`${root}${path.sep}`)) return json(403, { error: 'Forbidden' });
      try { target = await realpath(target); } catch { return json(404, { error: 'Not found' }); }
      if (!target.startsWith(`${root}${path.sep}`)) return json(403, { error: 'Forbidden' });
      const info = await stat(target);
      if (!info.isFile()) return json(404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch { json(400, { error: 'Invalid request' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
