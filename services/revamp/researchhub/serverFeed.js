// Public ResearchHub transport shared by the feed and authoritative eligibility checks.
const RESEARCHHUB_ORIGIN = 'https://backend.prod.researchhub.com';
const FEED_URL = `${RESEARCHHUB_ORIGIN}/api/funding_feed/?fundraise_status=OPEN&ordering=best&page_size=100&content_type=PREREGISTRATION`;
const REQUEST_TIMEOUT_MS = 4_000;
const FEED_TIMEOUT_MS = 7_000;
const CACHE_TIMEOUT_MS = 1_000;
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const withDeadline = async (operation, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('ResearchHub request timed out.'), { statusCode: 502 }));
        }, Math.max(1, timeoutMs));
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const fetchResearchHubJson = (url, { timeoutMs = REQUEST_TIMEOUT_MS, allowNotFound = false } = {}) => (
  withDeadline(async (signal) => {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SciconShooter/2.2 (+https://sciconshooter.xyz)' },
      redirect: 'error',
      signal
    });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) {
      throw Object.assign(new Error(`ResearchHub returned ${response.status}.`), { statusCode: 502 });
    }
    // Keep the deadline active while consuming the body as well as receiving headers.
    return response.json();
  }, timeoutMs)
);

const assertFundingFeed = (payload) => {
  if (!payload || !Array.isArray(payload.results)) {
    throw Object.assign(new Error('ResearchHub returned an invalid funding feed.'), { statusCode: 502 });
  }
  return payload;
};

const safeNextFeedUrl = (value) => {
  if (value === null || value === undefined || value === '') return null;
  let parsed;
  try {
    if (typeof value !== 'string') throw new Error('Invalid URL');
    parsed = new URL(value, RESEARCHHUB_ORIGIN);
  } catch {
    throw Object.assign(new Error('ResearchHub returned an invalid next-page URL.'), { statusCode: 502 });
  }
  if (parsed.origin !== RESEARCHHUB_ORIGIN || parsed.username || parsed.password || parsed.pathname !== '/api/funding_feed/') {
    throw Object.assign(new Error('ResearchHub returned an unsafe next-page URL.'), { statusCode: 502 });
  }
  return parsed.toString();
};

const usableSnapshot = (payload, fetchedAt, now = Date.now()) => {
  const timestamp = Date.parse(fetchedAt);
  return Array.isArray(payload?.results) && Number.isFinite(timestamp)
    && timestamp <= now + 60_000 && now - timestamp <= SNAPSHOT_MAX_AGE_MS;
};

module.exports = {
  FEED_URL, FEED_TIMEOUT_MS, CACHE_TIMEOUT_MS, SNAPSHOT_MAX_AGE_MS,
  withDeadline, fetchResearchHubJson, assertFundingFeed, safeNextFeedUrl, usableSnapshot
};
