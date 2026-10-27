const { getPublicPrizeState } = require('../../shared/weeklyCompetitionBoundary.js');
const { isFundingDeadlineAfter } = require('../../shared/researchHubProposalEligibility.js');

const API_ORIGIN = 'https://api.researchhub.com';
const GRANT_FEED_URL = `${API_ORIGIN}/api/grant_feed/?content_type=GRANT&status=OPEN&ordering=newest&page_size=20`;
const MAX_PAGES = 3;
const POST_CONCURRENCY = 6;

const asText = (value, max = 500) => (
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
);

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

const deadlineFromPost = (payload) => {
  const grant = payload?.note?.post?.unified_document?.grant
    || payload?.unified_document?.grant
    || null;
  const endDate = asText(grant?.end_date, 80);
  return endDate && Number.isFinite(Date.parse(endDate)) ? endDate : null;
};

const inspectGrantEntry = (entry, endDate, requiredOpenUntil) => {
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
  return {
    id,
    poolId: String(pool.id || grant.id || ''),
    title: asText(content.title, 180) || 'ResearchHub RFP',
    url: `https://www.researchhub.com/rfp/${id}/${slug}`,
    organization: asText(grant.organization, 120) || 'ResearchHub',
    status,
    endDate,
    goalUsd: money(grant.amount, 'usd'),
    goalRsc: money(grant.amount, 'rsc'),
    raisedRsc: money(pool.amount_raised, 'rsc'),
    imageUrl: asText(content.image_url, 500)
  };
};

const eligibleRfpsFromEntries = (entries, deadlinesById, requiredOpenUntil) => (
  entries
    .map((entry) => {
      const id = String(entry?.content_object?.id ?? entry?.id ?? '');
      return inspectGrantEntry(entry, deadlinesById.get(id) || null, requiredOpenUntil);
    })
    .filter(Boolean)
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

const loadEligibleRfps = async (
  { requiredOpenUntil = getPublicPrizeState().proposalOpenUntil } = {}
) => {
  const entries = await fetchOpenGrantEntries();
  const ids = [...new Set(entries.map((entry) => String(entry?.content_object?.id ?? entry?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id)))];
  const deadlines = await mapWithConcurrency(ids, POST_CONCURRENCY, async (id) => {
    try {
      const post = await fetchJson(`${API_ORIGIN}/api/researchhubpost/${id}/`);
      return [id, deadlineFromPost(post)];
    } catch {
      return [id, null];
    }
  });
  return eligibleRfpsFromEntries(entries, new Map(deadlines), requiredOpenUntil);
};

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

module.exports = {
  deadlineFromPost,
  eligibleRfpsFromEntries,
  findEligibleRfp,
  inspectGrantEntry,
  loadEligibleRfps
};
