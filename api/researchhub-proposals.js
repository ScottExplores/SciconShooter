const RESEARCHHUB_FUNDING_FEED =
  'https://backend.prod.researchhub.com/api/funding_feed/?fundraise_status=OPEN&ordering=best&page_size=20&content_type=PREREGISTRATION';
const MAX_PROPOSAL_PAGES = 5;
const MAX_PROPOSALS = 100;
const { fetchSupabaseJson, hasSupabaseConfig, supabaseHeaders } = require('./_lib/supabase');
const PROPOSAL_CACHE_TABLE = process.env.SUPABASE_PROPOSAL_CACHE_TABLE || 'scicon_proposal_cache';
const PROPOSAL_CACHE_KEY = 'researchhub-open-preregistrations';

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
};

const fetchResearchHubFeedPage = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SciconShooter/2.2 (+https://sciconshooter.xyz)'
    }
  });

  if (!response.ok) {
    throw new Error(`ResearchHub funding feed returned ${response.status}`);
  }

  return response.json();
};

const fetchResearchHubFeed = async () => {
  let nextUrl = RESEARCHHUB_FUNDING_FEED;
  let firstPayload = null;
  const results = [];

  for (let page = 0; nextUrl && page < MAX_PROPOSAL_PAGES && results.length < MAX_PROPOSALS; page += 1) {
    const payload = await fetchResearchHubFeedPage(nextUrl);
    if (!firstPayload) {
      firstPayload = payload;
    }

    if (Array.isArray(payload?.results)) {
      results.push(...payload.results.slice(0, MAX_PROPOSALS - results.length));
    }

    nextUrl = typeof payload?.next === 'string' ? payload.next : null;
  }

  return {
    ...(firstPayload || {}),
    next: nextUrl,
    results
  };
};

const writeProposalCache = async (payload) => {
  if (!hasSupabaseConfig()) return;
  await fetchSupabaseJson(`${PROPOSAL_CACHE_TABLE}?on_conflict=cache_key`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ cache_key: PROPOSAL_CACHE_KEY, payload, fetched_at: new Date().toISOString() })
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

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const payload = await fetchResearchHubFeed();
    await writeProposalCache(payload).catch((error) => console.error('Proposal cache write failed:', error));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return sendJson(res, 200, payload);
  } catch (error) {
    console.error('ResearchHub proposals API error:', error);
    const cachedPayload = await readProposalCache().catch(() => null);
    if (cachedPayload) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=900');
      return sendJson(res, 200, cachedPayload);
    }
    return sendJson(res, 502, {
      error: 'ResearchHub proposal feed is unavailable',
      details: error.message
    });
  }
};
