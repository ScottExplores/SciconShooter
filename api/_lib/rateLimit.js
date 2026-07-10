const crypto = require('crypto');

const buckets = globalThis.__sciconRateLimitBuckets || new Map();
globalThis.__sciconRateLimitBuckets = buckets;

const clientKey = (req, scope) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
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

module.exports = { checkRateLimit };
