const { randomUUID } = require('node:crypto');
// ResearchHub retired backend.prod.researchhub.com. The public API that still
// serves the open preregistration funding feed (and the post lookup) is the
// same origin the RFP route already uses.
const RESEARCHHUB_API_ORIGIN = 'https://api.researchhub.com';
const RESEARCHHUB_FUNDING_FEED_PATH = '/api/funding_feed/';
const RESEARCHHUB_FUNDING_FEED =
  `${RESEARCHHUB_API_ORIGIN}${RESEARCHHUB_FUNDING_FEED_PATH}?fundraise_status=OPEN&ordering=best&page_size=100&content_type=PREREGISTRATION`;
const RESEARCHHUB_POST_API =
  `${RESEARCHHUB_API_ORIGIN}/api/researchhubpost`;
const MAX_PROPOSAL_PAGES = 12;
const MAX_PROPOSALS = 1200;
const FEED_PAGE_SIZE = 100;
const SPECULATIVE_PAGE_BATCH = 8;
const MAX_REFERENCED_PROPOSALS = 1;
const CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS = 61 * 60 * 1000;
const { fetchSupabaseJson, hasSupabaseConfig, supabaseHeaders } = require('./_lib/supabase');
const { handleResearchHubRfpRequest } = require('./_lib/researchHubRfps');
const { getCurrentWeekRange } = require('../shared/weeklyCompetitionBoundary.js');
const PROPOSAL_CACHE_TABLE = process.env.SUPABASE_PROPOSAL_CACHE_TABLE || 'scicon_proposal_cache';
const PROPOSAL_CACHE_KEY = 'researchhub-open-preregistrations';
const WEEKLY_PROPOSAL_CACHE_PREFIX = `${PROPOSAL_CACHE_KEY}:week:`;

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

const fetchResearchHubFeedPage = async (url, { missingOk = false } = {}) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SciconShooter/2.2 (+https://sciconshooter.xyz)'
    }
  });

  if (missingOk && (response.status === 404 || response.status === 400)) {
    return { results: [], next: null };
  }

  if (!response.ok) {
    throw new Error(`ResearchHub funding feed returned ${response.status}`);
  }

  return response.json();
};

const pageNumberFromFeedUrl = (value) => {
  try {
    const page = Number(new URL(value).searchParams.get('page'));
    return Number.isInteger(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
};

const feedUrlForPage = (value, page) => {
  const url = new URL(value);
  url.searchParams.set('page', String(page));
  return safeNextFeedUrl(url.toString());
};

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
    id: Number(id),
    content_type: 'RESEARCHHUBPOST',
    content_object: {
      id: Number(id),
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

const fetchReferencedProposal = async (proposalId) => {
  const response = await fetch(`${RESEARCHHUB_POST_API}/${proposalId}/`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SciconShooter/2.2 (+https://sciconshooter.xyz)'
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`ResearchHub proposal lookup returned ${response.status}`);
  }
  return normalizePostAsFundingEntry(await response.json());
};

const safeNextFeedUrl = (value) => {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try {
    parsed = new URL(value, RESEARCHHUB_API_ORIGIN);
  } catch {
    throw new Error('ResearchHub funding feed returned an invalid next-page URL');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'api.researchhub.com'
    || parsed.pathname !== RESEARCHHUB_FUNDING_FEED_PATH
  ) {
    throw new Error('ResearchHub funding feed returned an unsafe next-page URL');
  }
  return parsed.toString();
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

  if (stopWhenIdsFound.length > 0) {
    for (let page = 0; nextUrl && page < MAX_PROPOSAL_PAGES && results.length < maxResults; page += 1) {
      const payload = await fetchResearchHubFeedPage(nextUrl);
      if (!firstPayload) firstPayload = payload;
      if (Array.isArray(payload?.results)) {
        const pageResults = payload.results.slice(0, maxResults - results.length);
        results.push(...pageResults);
        pageResults.forEach((entry) => remainingIds.delete(proposalIdOf(entry)));
      }
      if (remainingIds.size === 0) {
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
  }

  let pagesFetched = 0;
  let waveStart = 1;
  while (pagesFetched < MAX_PROPOSAL_PAGES && results.length < maxResults) {
    const urls = [];
    const waveEnd = Math.min(waveStart + SPECULATIVE_PAGE_BATCH - 1, MAX_PROPOSAL_PAGES);
    for (let page = waveStart; page <= waveEnd; page += 1) {
      urls.push(page === 1 ? startUrl : feedUrlForPage(startUrl, page));
    }
    const payloads = await Promise.all(urls.map((url, index) => (
      fetchResearchHubFeedPage(url, { missingOk: !(waveStart === 1 && index === 0) })
    )));

    let reachedEnd = false;
    for (const payload of payloads) {
      if (!firstPayload) firstPayload = payload;
      pagesFetched += 1;
      const pageResults = Array.isArray(payload?.results) ? payload.results : [];
      if (results.length < maxResults && pageResults.length > 0) {
        results.push(...pageResults.slice(0, maxResults - results.length));
      }
      const following = safeNextFeedUrl(payload?.next);
      if (pageResults.length === 0 || !following || results.length >= maxResults) {
        nextUrl = results.length >= maxResults ? following : null;
        reachedEnd = true;
        break;
      }
      nextUrl = following;
    }

    if (reachedEnd) break;
    waveStart = waveEnd + 1;
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

const resolveReferencedProposals = async (openResults, proposalIds) => {
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
    const referencedProposal = await fetchReferencedProposal(missingProposalId);
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
  await fetchSupabaseJson(`${PROPOSAL_CACHE_TABLE}?on_conflict=cache_key`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({
      cache_key: PROPOSAL_CACHE_KEY,
      payload,
      fetched_at: fetchedAt
    })
  });

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

  await fetchSupabaseJson(PROPOSAL_CACHE_TABLE, {
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
  });
};

const readProposalCache = async () => {
  if (!hasSupabaseConfig()) return null;
  const rows = await fetchSupabaseJson(`${PROPOSAL_CACHE_TABLE}?select=payload,fetched_at&cache_key=eq.${PROPOSAL_CACHE_KEY}&limit=1`, {
    headers: supabaseHeaders()
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.payload ? { ...row.payload, cached: true, fetchedAt: row.fetched_at } : null;
};

const requestFeed = (req) => {
  const queryValue = req.query?.type || req.query?.feed;
  if (typeof queryValue === 'string' && queryValue.trim()) return queryValue.trim().toLowerCase();
  if (typeof req.url !== 'string') return '';
  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    return (params.get('type') || params.get('feed') || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

module.exports = async (req, res) => {
  const feed = requestFeed(req);
  if (feed === 'rfp' || feed === 'rfps') {
    return handleResearchHubRfpRequest(req, res);
  }

  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let referencedProposalIds;
  try {
    referencedProposalIds = parseReferencedProposalIds(req);
    const payload = await fetchResearchHubFeed();
    const referenced = await resolveReferencedProposals(payload.results, referencedProposalIds);
    const fetchedAtDate = new Date();
    await writeProposalCache(payload, { fetchedAtDate }).catch((error) => console.error('Proposal cache write failed:', error));
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
      fetchedAt: fetchedAtDate.toISOString()
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return sendJson(res, 400, { error: error.message });
    }
    console.error('ResearchHub proposals API error:', error);
    if (referencedProposalIds?.length > 0) {
      return sendJson(res, 502, {
        error: 'ResearchHub referenced proposal lookup is unavailable',
        details: error.message
      });
    }
    const cachedPayload = await readProposalCache().catch(() => null);
    if (cachedPayload) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=900');
      return sendJson(res, 200, {
        ...cachedPayload,
        referencedProposals: [],
        missingReferencedProposalIds: []
      });
    }
    return sendJson(res, 502, {
      error: 'ResearchHub proposal feed is unavailable',
      details: error.message
    });
  }
};

module.exports._test = {
  RESEARCHHUB_API_ORIGIN,
  RESEARCHHUB_FUNDING_FEED,
  RESEARCHHUB_POST_API,
  parseReferencedProposalIds,
  normalizePostAsFundingEntry,
  proposalIdOf,
  resolveReferencedProposals,
  safeNextFeedUrl,
  writeProposalCache
};
