import path from 'node:path';

export const DIRECTOR_MUTATION_HEADER = 'x-scicon-director';
export const DIRECTOR_MUTATION_VALUE = 'local';
export const DEFAULT_BODY_LIMIT = 256 * 1024;

export class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

const parseHostHeader = (value) => {
  if (typeof value !== 'string' || value.length > 255 || /[\\/?#@\s]/.test(value)) return null;
  try {
    const url = new URL(`http://${value}`);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!LOOPBACK_HOSTNAMES.has(hostname)) return null;
    const port = url.port || '80';
    return { hostname, port, host: `${hostname}:${port}` };
  } catch {
    return null;
  }
};

const parseOriginHeader = (value) => {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!LOOPBACK_HOSTNAMES.has(hostname)) return null;
    const port = url.port || '80';
    return { hostname, port, host: `${hostname}:${port}` };
  } catch {
    return null;
  }
};

export const assertLoopbackRequest = (request) => {
  const host = parseHostHeader(request.headers.host);
  if (!host) throw new HttpError(403, 'Director requests must use a loopback Host header');

  const originValue = request.headers.origin;
  if (originValue !== undefined) {
    const origin = parseOriginHeader(originValue);
    if (!origin || origin.host !== host.host) {
      throw new HttpError(403, 'Director requests must be same-origin on loopback');
    }
  }
  return host;
};

export const assertMutationRequest = (request) => {
  assertLoopbackRequest(request);
  const header = request.headers[DIRECTOR_MUTATION_HEADER];
  if (header !== DIRECTOR_MUTATION_VALUE) {
    throw new HttpError(403, `Mutations require ${DIRECTOR_MUTATION_HEADER}: ${DIRECTOR_MUTATION_VALUE}`);
  }
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'Mutations require Content-Type: application/json');
  }
};

export const readJsonBody = async (request, { limit = DEFAULT_BODY_LIMIT } = {}) => {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new HttpError(413, `JSON request body exceeds the ${limit}-byte limit`);
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > limit) throw new HttpError(413, `JSON request body exceeds the ${limit}-byte limit`);
    chunks.push(buffer);
  }
  if (length === 0) throw new HttpError(400, 'A JSON request body is required');

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body must be a JSON object');
    }
    return parsed;
  } catch (error) {
    throw new HttpError(400, 'Request body must be valid JSON', [error.message]);
  }
};

export const resolveWithin = (root, ...segments) => {
  const resolvedRoot = path.resolve(root);
  for (const segment of segments) {
    if (typeof segment !== 'string' || segment.includes('\0')) {
      throw new HttpError(400, 'Invalid filesystem path segment');
    }
  }
  const candidate = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new HttpError(400, 'Filesystem path escapes the Director data directory');
  }
  return candidate;
};

export const sendJson = (response, statusCode, payload, extraHeaders = {}) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
};
