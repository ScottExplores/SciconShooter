const crypto = require('crypto');
const net = require('net');

const buckets = globalThis.__sciconRateLimitBuckets || new Map();
globalThis.__sciconRateLimitBuckets = buckets;

const validIps = (value) => String(value || '')
  .split(',')
  .map((part) => part.trim())
  .filter((part) => net.isIP(part));

const lastValidIp = (value) => {
  const ips = validIps(value);
  return ips.length > 0 ? ips[ips.length - 1] : null;
};

const getClientAddress = (req) => {
  // Platform headers are overwritten by the edge. A client-supplied
  // x-forwarded-for list keeps the spoofed address on the left, so the last
  // hop is the one appended by the nearest proxy.
  const platformIp = lastValidIp(req.headers['x-vercel-forwarded-for'])
    || lastValidIp(req.headers['x-real-ip']);
  if (platformIp) return platformIp;
  const forwarded = lastValidIp(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded;
  const socketIp = req.socket?.remoteAddress;
  return net.isIP(socketIp || '') ? socketIp : 'unknown';
};

const clientKey = (req, scope) => {
  const ip = getClientAddress(req);
  return crypto.createHash('sha256').update(`${scope}:${ip}`).digest('hex').slice(0, 32);
};

const checkRateLimit = (req, { scope, limit, windowMs }) => {
  const now = Date.now();
  const key = clientKey(req, scope);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  current.count += 1;
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
};

module.exports = { checkRateLimit, getClientAddress };
