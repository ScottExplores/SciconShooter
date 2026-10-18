const { randomUUID } = require('node:crypto');
const {
  FEED_URL: RESEARCHHUB_FUNDING_FEED, FEED_TIMEOUT_MS, CACHE_TIMEOUT_MS,
  fetchResearchHubJson, assertFundingFeed, safeNextFeedUrl, withDeadline, usableSnapshot
} = require('../services/revamp/researchhub/serverFeed');
const RESEARCHHUB_POST_API =
  'https://backend.prod.researchhub.com/api/researchhubpost';
const MAX_PROPOSAL_PAGES = 5;
const MAX_PROPOSALS = 100;
const MAX_REFERENCED_PROPOSALS = 1;
const CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS = 61 * 60 * 1000;
const { fetchSupabaseJson, hasSupabaseConfig, supabaseHeaders } = require('./_lib/supabase');
const { getCurrentWeekRange } = require('../shared/weeklyCompetitionBoundary.js');
const PROPOSAL_CACHE_TABLE = process.env.SUPABASE_PROPOSAL_CACHE_TABLE || 'scicon_proposal_cache';
const PROPOSAL_CACHE_KEY = 'researchhub-open-preregistrations';
const WEEKLY_PROPOSAL_CACHE_PREFIX = `${PROPOSAL_CACHE_KEY}:week:`;
let memorySnapshot = null;

const buildWeeklyProposalSnapshotKey = (weekKey, fetchedAt) => (
  `${WEEKLY_PROPOSAL_CACHE_PREFIX}${weekKey}:snapshot:`
  + `${new Date(fetchedAt).getTime()}:${randomUUID()}`
);

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
};

const fetchResearchHubFeedPage = async (url, timeoutMs) => (
  assertFundingFeed(await fetchResearchHubJson(url, { timeoutMs }))
);

const proposalIdOf = (entry) => String(entry?.content_object?.id ?? entry?.id ?? '');

const normalizePostAsFundingEntry = (payload) => {
  const post = payload?.note?.post || payload;
  const fundraise = post?.unified_document?.fundraise
    || payload?.unified_document?.fundraise
    || payload?.fundraise;
  const id = String(payload?.id ?? post?.id ?? '');
  if (!/^\d{1,20}$/.test(id) || !fundraise) return null;

  const authors = Array.isArray(payload?.authors)
    ? payload.authors
    : Array.isArray(post?.authors)
      ? post.authors
      : [];

  return {
    id,
    content_type: 'RESEARCHHUBPOST',
    content_object: {
      id,
      slug: payload?.slug || post?.slug || '',
      title: payload?.title || post?.title || 'ResearchHub proposal',
      type: payload?.document_type || post?.document_type || 'PREREGISTRATION',
      image_url: payload?.image_url || post?.image_url || null,
      authors,
      fundraise
    },
    author: authors[0] || null,
    associated_grants: Array.isArray(payload?.grants) ? payload.grants : []
  };
};

const fetchReferencedProposal = async (proposalId, timeoutMs) => {
  const payload = await fetchResearchHubJson(`${RESEARCHHUB_POST_API}/${proposalId}/`, { allowNotFound: true, timeoutMs });
  return payload ? normalizePostAsFundingEntry(payload) : null;
};

const fetchResearchHubFeed = async ({
  startUrl = RESEARCHHUB_FUNDING_FEED,
  maxResults = MAX_PROPOSALS,
  stopWhenIdsFound = []
} = {}) => {
  let nextUrl = startUrl;
  let firstPayload = null;
  const results = [];
  const remainingIds = new Set(stopWhenIdsFound);
  const deadline = Date.now() + FEED_TIMEOUT_MS;

  for (let page = 0; nextUrl && page < MAX_PROPOSAL_PAGES && results.length < maxResults; page += 1) {
    const payload = await fetchResearchHubFeedPage(nextUrl, Math.min(4_000, deadline - Date.now()));
    if (!firstPayload) {
      firstPayload = payload;
    }

    if (Array.isArray(payload?.results)) {
      const pageResults = payload.results.slice(0, maxResults - results.length);
      results.push(...pageResults);
      pageResults.forEach((entry) => remainingIds.delete(proposalIdOf(entry)));
    }

    if (stopWhenIdsFound.length > 0 && remainingIds.size === 0) {
      nextUrl = null;
      break;
    }
    nextUrl = safeNextFeedUrl(payload?.next);
  }

  return {
    ...(firstPayload || {}),
    next: nextUrl,
    results
  };
};

const parseReferencedProposalIds = (req) => {
  const queryValue = req.query?.includeProposalIds;
  let rawValue = queryValue;
  if (rawValue === undefined && typeof req.url === 'string') {
    rawValue = new URL(req.url, 'http://localhost').searchParams.get('includeProposalIds') ?? undefined;
  }
  if (rawValue === undefined) return [];
  if (
    typeof rawValue !== 'string'
    || rawValue.length === 0
    || rawValue.length > 20
    || !/^\d{1,20}$/.test(rawValue)
  ) {
    throw Object.assign(new Error(
      `includeProposalIds must contain exactly ${MAX_REFERENCED_PROPOSALS} numeric proposal ID.`
    ), { statusCode: 400 });
  }

  return [rawValue];
};

const resolveReferencedProposals = async (openResults, proposalIds, { deadline = Date.now() + 4_000 } = {}) => {
  if (proposalIds.length === 0) {
    return { referencedProposals: [], missingReferencedProposalIds: [] };
  }

  const byId = new Map(
    openResults
      .map((entry) => [proposalIdOf(entry), entry])
      .filter(([id]) => proposalIds.includes(id))
  );
  const missingProposalId = proposalIds.find((id) => !byId.has(id));
  if (missingProposalId) {
    const referencedProposal = await fetchReferencedProposal(missingProposalId, Math.min(4_000, deadline - Date.now()));
    if (referencedProposal) byId.set(missingProposalId, referencedProposal);
  }

  return {
    referencedProposals: proposalIds.flatMap((id) => byId.has(id) ? [byId.get(id)] : []),
    missingReferencedProposalIds: proposalIds.filter((id) => !byId.has(id))
  };
};

const writeProposalCache = async (payload, { fetchedAtDate = new Date() } = {}) => {
  if (!hasSupabaseConfig()) return;
  if (!(fetchedAtDate instanceof Date) || !Number.isFinite(fetchedAtDate.getTime())) {
    throw new Error('Invalid proposal cache timestamp');
  }
  const fetchedAt = fetchedAtDate.toISOString();
  await withDeadline((signal) => fetchSupabaseJson(`${PROPOSAL_CACHE_TABLE}?on_conflict=cache_key`, {
    signal,
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({
      cache_key: PROPOSAL_CACHE_KEY,
      payload,
      fetched_at: fetchedAt
    })
  }), CACHE_TIMEOUT_MS);

  const currentWeek = getCurrentWeekRange(fetchedAtDate);
  const millisecondsUntilCutoff = currentWeek.end.getTime() - fetchedAtDate.getTime();
  const feedIsComplete = Array.isArray(payload?.results) && !payload?.next;
  if (
    !feedIsComplete
    || millisecondsUntilCutoff < 0
    || millisecondsUntilCutoff > CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS
  ) {
    return;
  }

  await withDeadline((signal) => fetchSupabaseJson(PROPOSAL_CACHE_TABLE, {
    signal,
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      cache_key: buildWeeklyProposalSnapshotKey(currentWeek.weekKey, fetchedAt),
      payload: {
        complete: true,
        source: 'weekly-cutoff-capture',
        results: payload.results
      },
      fetched_at: fetchedAt
    })
  }), CACHE_TIMEOUT_MS);
};

const readProposalCache = async () => {
  if (!hasSupabaseConfig()) return null;
  const rows = await withDeadline((signal) => fetchSupabaseJson(`${PROPOSAL_CACHE_TABLE}?select=payload,fetched_at&cache_key=eq.${PROPOSAL_CACHE_KEY}&limit=1`, {
    signal,
    headers: supabaseHeaders()
  }), CACHE_TIMEOUT_MS);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row && usableSnapshot(row.payload, row.fetched_at)
    ? { ...row.payload, cached: true, fetchedAt: row.fetched_at } : null;
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let referencedProposalIds;
  try {
    referencedProposalIds = parseReferencedProposalIds(req);
    const deadline = Date.now() + 8_000;
    const payload = await fetchResearchHubFeed();
    // REVAMP(G): Explicit identity lookups must fail closed; ordinary feed reads retain cache fallback.
    const referenced = await resolveReferencedProposals(payload.results, referencedProposalIds, { deadline });
    const fetchedAt = new Date().toISOString();
    memorySnapshot = { ...payload, cached: true, fetchedAt };
    // REVAMP(E): Pages previews may read live proposals without persisting to production.
    const previewReadOnly = req.query?.previewReadOnly === '1'
      || new URL(req.url || '/', 'http://localhost').searchParams.get('previewReadOnly') === '1';
    if (!previewReadOnly) {
      await writeProposalCache(payload, { fetchedAtDate: new Date(fetchedAt) })
        .catch(() => console.warn('ResearchHub proposal cache write unavailable.'));
    }
    res.setHeader(
      'Cache-Control',
      referencedProposalIds.length > 0
        ? 's-maxage=60, stale-while-revalidate=300'
        : 's-maxage=300, stale-while-revalidate=1800'
    );
    return sendJson(res, 200, {
      ...payload,
      ...referenced,
      cached: false,
      fetchedAt
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return sendJson(res, 400, { error: error.message });
    }
    console.warn('ResearchHub live proposal feed unavailable.');
    if (referencedProposalIds?.length > 0) {
      return sendJson(res, 502, {
        error: 'ResearchHub referenced proposal lookup is unavailable',
        // Only expose a bounded upstream status, never arbitrary transport/credential text.
        details: /returned \d{3}/.exec(String(error.message))?.[0] || 'Referenced lookup failed.'
      });
    }
    const persistedSnapshot = await readProposalCache().catch(() => null);
    const cachedPayload = [persistedSnapshot, memorySnapshot]
      .filter((snapshot) => snapshot && usableSnapshot(snapshot, snapshot.fetchedAt))
      .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0];
    if (cachedPayload) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=900');
      return sendJson(res, 200, {
        ...cachedPayload,
        referencedProposals: [],
        missingReferencedProposalIds: []
      });
    }
    return sendJson(res, 502, {
      error: 'ResearchHub proposal feed is unavailable'
    });
  }
};

module.exports._test = {
  fetchResearchHubFeed,
  readProposalCache,
  resetMemorySnapshot: () => { memorySnapshot = null; },
  parseReferencedProposalIds,
  normalizePostAsFundingEntry,
  proposalIdOf,
  resolveReferencedProposals,
  safeNextFeedUrl,
  writeProposalCache
};
