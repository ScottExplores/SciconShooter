import { randomUUID } from 'node:crypto';
import { LIMITS, QUESTIONS, REVIEW_QUESTIONS, validateAnswers } from './protocol.mjs';

const send = (res, status, value) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
};
const readBody = async req => {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > LIMITS.bodyBytes) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

// A dev-server-only relay. No keys enter Vite client env, storage, logs or exports.
export function createJevMiddleware({ apiKey = process.env.TYPESAFE_API_KEY || '', fetchImpl = fetch, now = Date.now } = {}) {
  let key = apiKey;
  let run = null;
  let busy = false;
  return async (req, res, next) => {
    const route = new URL(req.url || '/', 'http://localhost').pathname;
    if (!route.startsWith('/__jev/')) return next();
    const host = req.headers.host || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)
      || (req.headers.origin && req.headers.origin !== `http://${host}`)
      || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
      return send(res, 403, { error: 'This playtest accepts loopback, same-origin requests only.' });
    }
    if (route === '/__jev/status' && req.method === 'GET') return send(res, 200, { configured: Boolean(key), limits: LIMITS });
    if (req.method !== 'POST' || req.headers.origin !== `http://${host}` || !req.headers['content-type']?.startsWith('application/json')) {
      return send(res, 403, { error: 'A same-origin JSON request is required.' });
    }
    try {
      const body = await readBody(req);
      if (route === '/__jev/key') {
        if (busy || (run && !run.stopped)) return send(res, 409, { error: 'Stop the run before changing the key.' });
        if (typeof body.key !== 'string' || body.key.trim().length < 10 || body.key.length > 512 || /\s/.test(body.key.trim())) {
          return send(res, 400, { error: 'Enter a valid TypeSafe API key in the masked field.' });
        }
        key = body.key.trim();
        return send(res, 200, { configured: true });
      }
      if (route === '/__jev/start') {
        if (!key) return send(res, 428, { error: 'TypeSafe API access is required. No Jev run has started.' });
        if (busy || (run && !run.stopped && now() - run.started < 70000)) return send(res, 409, { error: 'A run is already active.' });
        run = { id: randomUUID(), started: now(), calls: 0, inputTokens: 0, outputTokens: 0, lastCall: -Infinity, stopped: false, reviewed: false };
        return send(res, 200, { runId: run.id, limits: LIMITS });
      }
      if (!run || body.runId !== run.id) return send(res, 409, { error: 'This run is no longer active.' });
      if (route === '/__jev/stop') {
        run.stopped = true;
        return send(res, 200, { stopped: true, calls: run.calls, inputTokens: run.inputTokens, usageMayBeIncomplete: busy });
      }
      const review = route === '/__jev/review';
      if (!review && route !== '/__jev/decision') return send(res, 404, { error: 'Unknown playtest operation.' });
      if (busy) return send(res, 409, { error: 'A Jev request is still in flight.' });
      if ((!review && (run.stopped || now() - run.started >= LIMITS.seconds * 1000))
        || (review && (!run.stopped || run.reviewed || run.calls === 0 || now() - run.started > 120000))
        || run.calls >= LIMITS.calls) return send(res, 429, { error: 'Trial limit reached. Run stopped.' });
      if (now() - run.lastCall < LIMITS.intervalMs) return send(res, 429, { error: 'Decision rate limit reached.' });
      if (!body.state || typeof body.state !== 'object') return send(res, 400, { error: 'Game state is required.' });
      const activeRun = run;
      const questions = review ? REVIEW_QUESTIONS : QUESTIONS;
      const payload = JSON.stringify({ model: 'jev-latest', state: body.state, questions });
      if (Buffer.byteLength(payload) > LIMITS.bodyBytes) return send(res, 413, { error: 'Game state exceeds the trial size limit.' });
      busy = true;
      activeRun.calls++;
      activeRun.lastCall = now();
      if (review) activeRun.reviewed = true;
      const began = now();
      try {
        const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: payload, signal: AbortSignal.timeout(4000), redirect: 'error'
        });
        if (!response.ok) {
          // Do not relay provider error bodies, which can contain submitted data.
          const message = response.status === 401 || response.status === 403 ? 'TypeSafe rejected access. Check your key and early-access approval.'
            : response.status === 429 ? 'TypeSafe rate or credit limit reached.' : `TypeSafe returned HTTP ${response.status}.`;
          throw new Error(message);
        }
        const result = validateAnswers(await response.json(), questions);
        activeRun.inputTokens += result.usage.input_tokens;
        activeRun.outputTokens += result.usage.output_tokens;
        return send(res, 200, { ...result, elapsedMs: now() - began, accounting: { calls: activeRun.calls, inputTokens: activeRun.inputTokens, outputTokens: activeRun.outputTokens } });
      } catch (error) {
        activeRun.stopped = true;
        return send(res, 502, { error: error.name === 'TimeoutError' ? 'Jev timed out. Run stopped; no automatic retry.' : error.message.startsWith('TypeSafe') || error.message.startsWith('Invalid Jev') || error.message.startsWith('Missing Jev') ? error.message : 'Jev connection failed. Run stopped; no automatic retry.' });
      } finally { busy = false; }
    } catch {
      return send(res, 400, { error: 'Invalid or oversized playtest request.' });
    }
  };
}
/** @returns {import('vite').Plugin} */
export const jevPlaytestPlugin = () => ({
  name: 'scicon-jev-local-playtest', apply: 'serve',
  configureServer(server) { server.middlewares.use(createJevMiddleware()); }
});
