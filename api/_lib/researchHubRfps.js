const { getPublicPrizeState } = require('../../shared/weeklyCompetitionBoundary.js');
const { isFundingDeadlineAfter } = require('../../shared/researchHubProposalEligibility.js');
const { fetchSupabaseJson, hasSupabaseConfig, supabaseHeaders } = require('./supabase');

const RFP_CACHE_TABLE = process.env.SUPABASE_PROPOSAL_CACHE_TABLE || 'scicon_proposal_cache';
const RFP_CACHE_KEY = 'researchhub-open-rfps';
// ResearchHub publishes a $1 USD amount on uncapped community pools. Treating
// that placeholder as the goal would hide active RFPs as fully funded.
const OPEN_ENDED_GOAL_USD = 1;

const API_ORIGIN = 'https://api.researchhub.com';
const GRANT_FEED_URL = `${API_ORIGIN}/api/grant_feed/?content_type=GRANT&status=OPEN&ordering=newest&page_size=20`;
const MAX_PAGES = 3;
const POST_CONCURRENCY = 6;

const { stripUnsafePublicText } = require('../../shared/publicText.cjs');

const asText = (value, max = 500) => {
  const cleaned = stripUnsafePublicText(value).trim();
  return cleaned ? cleaned.slice(0, max) : null;
};

const asNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const money = (value, currency) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return asNumber(value[currency]) ?? asNumber(value.amount);
  }
  return asNumber(value);
};

const safeNextGrantUrl = (value) => {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try {
    parsed = new URL(value, API_ORIGIN);
  } catch {
    throw Object.assign(new Error('ResearchHub RFP feed returned an invalid next-page URL.'), { statusCode: 502 });
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'api.researchhub.com'
    || parsed.pathname !== '/api/grant_feed/'
  ) {
    throw Object.assign(new Error('ResearchHub RFP feed returned an unsafe next-page URL.'), { statusCode: 502 });
  }
  return parsed.toString();
};

const fundingProgress = (rfp) => {
  const raised = rfp?.raisedRsc;
  const goal = rfp?.goalRsc;
  if (typeof raised !== 'number' || typeof goal !== 'number' || !(goal > 0)) return null;
  return raised / goal;
};

// Best eligible RFP: furthest toward its RSC goal, then the most RSC raised,
// then the deadline that stays open longest past payout. Ties break by title, then id.
const compareEligibleRfps = (left, right) => {
  const leftProgress = fundingProgress(left);
  const rightProgress = fundingProgress(right);
  if (leftProgress !== null || rightProgress !== null) {
    if (leftProgress === null) return 1;
    if (rightProgress === null) return -1;
    if (leftProgress !== rightProgress) return rightProgress - leftProgress;
  }
  const leftRaised = typeof left?.raisedRsc === 'number' ? left.raisedRsc : null;
  const rightRaised = typeof right?.raisedRsc === 'number' ? right.raisedRsc : null;
  if (leftRaised !== null || rightRaised !== null) {
    if (leftRaised === null) return 1;
    if (rightRaised === null) return -1;
    if (leftRaised !== rightRaised) return rightRaised - leftRaised;
  }
  const leftEnd = Date.parse(left?.endDate || '');
  const rightEnd = Date.parse(right?.endDate || '');
  if (leftEnd !== rightEnd) {
    return (Number.isFinite(rightEnd) ? rightEnd : 0) - (Number.isFinite(leftEnd) ? leftEnd : 0);
  }
  const titleOrder = String(left?.title || '').localeCompare(String(right?.title || ''), 'en', { sensitivity: 'base' });
  return titleOrder || String(left?.id || '').localeCompare(String(right?.id || ''));
};

const featureBestEligibleRfp = (rfps) => {
  const eligible = Array.isArray(rfps) ? rfps.filter(Boolean) : [];
  if (eligible.length === 0) return [];
  const best = [...eligible].sort(compareEligibleRfps)[0];
  const rest = eligible.filter((rfp) => rfp.id !== best.id);
  return [
    { ...best, featured: true },
    ...rest.map((rfp) => ({ ...rfp, featured: false }))
  ];
};

const plainDescription = (value) => {
  const text = asText(value, 2000);
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > 280 ? `${cleaned.slice(0, 279).trimEnd()}…` : cleaned;
};

const postDetails = (value) => {
  if (typeof value === 'string') return { endDate: value, description: null };
  if (value && typeof value === 'object') {
    return {
      endDate: typeof value.endDate === 'string' ? value.endDate : null,
      description: typeof value.description === 'string' ? value.description : null
    };
  }
  return { endDate: null, description: null };
};

const detailsFromPost = (payload) => {
  const grant = payload?.note?.post?.unified_document?.grant
    || payload?.unified_document?.grant
    || null;
  const endDate = asText(grant?.end_date, 80);
  return {
    endDate: endDate && Number.isFinite(Date.parse(endDate)) ? endDate : null,
    description: plainDescription(
      payload?.renderable_text
      || payload?.note?.post?.renderable_text
      || grant?.description
    )
  };
};

const deadlineFromPost = (payload) => detailsFromPost(payload).endDate;

const publishGrantAmounts = (grant, pool) => {
  const goalUsd = money(grant?.amount, 'usd');
  const goalRsc = money(grant?.amount, 'rsc');
  const raisedUsd = money(pool?.amount_raised, 'usd');
  const raisedRsc = money(pool?.amount_raised, 'rsc');
  const openEnded = typeof goalUsd === 'number' && goalUsd <= OPEN_ENDED_GOAL_USD;
  const publishedGoalUsd = openEnded ? null : goalUsd;
  const publishedGoalRsc = openEnded ? null : goalRsc;
  const usdFullyFunded = typeof publishedGoalUsd === 'number'
    && publishedGoalUsd > 0
    && typeof raisedUsd === 'number'
    && raisedUsd >= publishedGoalUsd;
  const rscFullyFunded = publishedGoalUsd == null
    && !openEnded
    && typeof publishedGoalRsc === 'number'
    && publishedGoalRsc > OPEN_ENDED_GOAL_USD
    && typeof raisedRsc === 'number'
    && raisedRsc >= publishedGoalRsc;

  return {
    fullyFunded: usdFullyFunded || rscFullyFunded,
    goalUsd: publishedGoalUsd,
    goalRsc: publishedGoalRsc,
    raisedUsd,
    raisedRsc
  };
};

const inspectGrantEntry = (entry, endDate, requiredOpenUntil, description = null) => {
  const content = entry?.content_object || {};
  const grant = content.grant || {};
  const id = String(content.id ?? entry?.id ?? '');
  const status = String(grant.status || '').trim().toUpperCase();
  const slug = asText(content.slug, 180);

  if (!/^\d{1,20}$/.test(id)) return null;
  if (content.type && String(content.type).toUpperCase() !== 'GRANT') return null;
  if (status !== 'OPEN' || grant.is_active === false || grant.is_expired === true) return null;
  if (!endDate || !isFundingDeadlineAfter(endDate, requiredOpenUntil)) return null;
  if (!slug) return null;

  const pool = grant.funding_pool || {};
  const poolStatus = String(pool.status || '').trim().toUpperCase();
  if (poolStatus && poolStatus !== 'OPEN') return null;
  const amounts = publishGrantAmounts(grant, pool);
  if (amounts.fullyFunded) return null;

  return {
    id,
    poolId: String(pool.id || grant.id || ''),
    title: asText(content.title, 180) || 'ResearchHub RFP',
    url: `https://www.researchhub.com/rfp/${id}/${slug}`,
    organization: asText(grant.organization, 120) || 'ResearchHub',
    status,
    endDate,
    goalUsd: amounts.goalUsd,
    goalRsc: amounts.goalRsc,
    raisedUsd: amounts.raisedUsd,
    raisedRsc: amounts.raisedRsc,
    description: plainDescription(description),
    imageUrl: asText(content.image_url, 500)
  };
};

const rfpFromEntry = (entry, deadlinesById, requiredOpenUntil) => {
  const id = String(entry?.content_object?.id ?? entry?.id ?? '');
  const details = postDetails(deadlinesById.get(id) || null);
  return inspectGrantEntry(entry, details.endDate, requiredOpenUntil, details.description);
};

const openRfpsFromEntries = (entries, deadlinesById, now = new Date()) => (
  entries
    .map((entry) => rfpFromEntry(entry, deadlinesById, now))
    .filter(Boolean)
);

const eligibleRfpsFromEntries = (entries, deadlinesById, requiredOpenUntil, now = new Date()) => (
  featureBestEligibleRfp(
    openRfpsFromEntries(entries, deadlinesById, now)
      .filter((rfp) => isFundingDeadlineAfter(rfp.endDate, requiredOpenUntil))
  )
);

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SciconShooter/2.2 (+https://sciconshooter.xyz)'
    }
  });
  if (!response.ok) {
    throw Object.assign(new Error(`ResearchHub returned ${response.status} for ${new URL(url).pathname}`), {
      statusCode: 502
    });
  }
  return response.json();
};

const fetchOpenGrantEntries = async () => {
  const entries = [];
  let nextUrl = GRANT_FEED_URL;
  for (let page = 0; nextUrl && page < MAX_PAGES; page += 1) {
    const payload = await fetchJson(nextUrl);
    const pageEntries = Array.isArray(payload?.results) ? payload.results : [];
    entries.push(...pageEntries);
    nextUrl = pageEntries.length > 0 ? safeNextGrantUrl(payload?.next) : null;
  }
  return entries;
};

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
};

const loadGrantEntriesWithDeadlines = async () => {
  const entries = await fetchOpenGrantEntries();
  const ids = [...new Set(entries.map((entry) => String(entry?.content_object?.id ?? entry?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id)))];
  const deadlines = await mapWithConcurrency(ids, POST_CONCURRENCY, async (id) => {
    try {
      const post = await fetchJson(`${API_ORIGIN}/api/researchhubpost/${id}/`);
      return [id, detailsFromPost(post)];
    } catch {
      return [id, null];
    }
  });
  return { entries, deadlinesById: new Map(deadlines) };
};

const loadOpenRfps = async ({ now = new Date() } = {}) => {
  const { entries, deadlinesById } = await loadGrantEntriesWithDeadlines();
  return openRfpsFromEntries(entries, deadlinesById, now);
};

const loadEligibleRfps = async (
  { requiredOpenUntil = getPublicPrizeState().proposalOpenUntil, now = new Date() } = {}
) => {
  const openRfps = await loadOpenRfps({ now });
  return featureBestEligibleRfp(
    openRfps.filter((rfp) => isFundingDeadlineAfter(rfp.endDate, requiredOpenUntil))
  );
};

const writeRfpCache = async (openRfps, fetchedAtDate = new Date()) => {
  if (!hasSupabaseConfig()) return;
  if (!(fetchedAtDate instanceof Date) || !Number.isFinite(fetchedAtDate.getTime())) {
    throw new Error('Invalid RFP cache timestamp');
  }
  await fetchSupabaseJson(`${RFP_CACHE_TABLE}?on_conflict=cache_key`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({
      cache_key: RFP_CACHE_KEY,
      payload: { results: openRfps },
      fetched_at: fetchedAtDate.toISOString()
    })
  });
};

const readRfpCache = async () => {
  if (!hasSupabaseConfig()) return null;
  const rows = await fetchSupabaseJson(
    `${RFP_CACHE_TABLE}?select=payload,fetched_at&cache_key=eq.${encodeURIComponent(RFP_CACHE_KEY)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  const results = Array.isArray(row?.payload?.results) ? row.payload.results : null;
  return results ? { results, fetchedAt: row.fetched_at } : null;
};

const stillOpenCachedRfps = (results, now) => (
  results.filter((rfp) => (
    rfp
    && typeof rfp.id === 'string'
    && typeof rfp.endDate === 'string'
    && isFundingDeadlineAfter(rfp.endDate, now)
  ))
);

const findEligibleRfp = async (
  rfpId,
  { requiredOpenUntil = getPublicPrizeState().proposalOpenUntil } = {}
) => {
  const target = String(rfpId || '');
  if (!/^\d{1,20}$/.test(target)) {
    throw Object.assign(new Error('Invalid ResearchHub RFP ID.'), { statusCode: 400 });
  }
  const rfps = await loadEligibleRfps({ requiredOpenUntil });
  const rfp = rfps.find((candidate) => candidate.id === target);
  if (!rfp) {
    throw Object.assign(new Error('That RFP is not open past the payout date.'), { statusCode: 409 });
  }
  return {
    id: rfp.id,
    title: rfp.title,
    url: rfp.url,
    author: rfp.organization,
    imageUrl: rfp.imageUrl && /^https:\/\//i.test(rfp.imageUrl) ? rfp.imageUrl : null,
    endDate: rfp.endDate,
    fundingTargetKind: 'rfp'
  };
};

const sendJson = (res, status, payload, cacheControl = 'no-store') => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
};

const rfpPayload = (openRfps, requiredOpenUntil, { cached, fetchedAt }) => ({
  source: 'researchhub-grant-feed',
  funding: 'manual-record-only',
  rfps: featureBestEligibleRfp(
    openRfps.filter((rfp) => isFundingDeadlineAfter(rfp.endDate, requiredOpenUntil))
  ),
  openRfps,
  cached,
  fetchedAt
});

const handleResearchHubRfpRequest = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  const now = new Date();
  const requiredOpenUntil = getPublicPrizeState(now).proposalOpenUntil;
  try {
    const openRfps = await loadOpenRfps({ now });
    const fetchedAt = now.toISOString();
    await writeRfpCache(openRfps, now).catch((error) => console.error('RFP cache write failed:', error));
    return sendJson(res, 200, rfpPayload(openRfps, requiredOpenUntil, {
      cached: false,
      fetchedAt
    }), 's-maxage=300, stale-while-revalidate=1800');
  } catch (error) {
    console.error('ResearchHub RFP feed failed:', error);
    const cached = await readRfpCache().catch(() => null);
    if (cached) {
      const openRfps = stillOpenCachedRfps(cached.results, now);
      return sendJson(res, 200, rfpPayload(openRfps, requiredOpenUntil, {
        cached: true,
        fetchedAt: cached.fetchedAt
      }), 's-maxage=60, stale-while-revalidate=900');
    }
    return sendJson(res, error.statusCode || 502, {
      error: 'Open ResearchHub RFPs could not be loaded.'
    });
  }
};

module.exports = {
  RFP_CACHE_KEY,
  deadlineFromPost,
  detailsFromPost,
  compareEligibleRfps,
  eligibleRfpsFromEntries,
  featureBestEligibleRfp,
  findEligibleRfp,
  handleResearchHubRfpRequest,
  inspectGrantEntry,
  loadEligibleRfps,
  loadOpenRfps,
  openRfpsFromEntries,
  publishGrantAmounts
};
