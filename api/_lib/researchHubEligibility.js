const FEED_URL = 'https://backend.prod.researchhub.com/api/funding_feed/?fundraise_status=OPEN&ordering=best&page_size=100&content_type=PREREGISTRATION';
const { getCurrentWeekRange } = require('../../shared/weeklyCompetitionBoundary.js');
const { isFundingDeadlineAfter } = require('../../shared/researchHubProposalEligibility.js');

const asText = (value, max = 500) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, max)
  : null;

const asHttpUrl = (value) => {
  const url = asText(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
};

const asNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[$,]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getMoneyAmount = (value, currency) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return asNumber(value[currency]) ?? asNumber(value.amount);
  }
  return asNumber(value);
};

const findEligibleProposal = async (
  proposalId,
  { requiredOpenUntil = getCurrentWeekRange().end } = {}
) => {
  const target = String(proposalId || '');
  if (!/^\d{1,20}$/.test(target)) throw Object.assign(new Error('Invalid ResearchHub proposal ID.'), { statusCode: 400 });
  const response = await fetch(FEED_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'SciconShooter/2.2 (+https://sciconshooter.xyz)' }
  });
  if (!response.ok) throw Object.assign(new Error('ResearchHub eligibility check is unavailable.'), { statusCode: 502 });
  const payload = await response.json();
  const entries = Array.isArray(payload?.results) ? payload.results : [];
  const entry = entries.find((candidate) => String(candidate?.content_object?.id ?? candidate?.id ?? '') === target);
  if (!entry) throw Object.assign(new Error('That proposal is not in the current eligible funding feed.'), { statusCode: 409 });
  const content = entry.content_object || entry;
  const fundraise = content.fundraise || entry.fundraise || {};
  const status = String(fundraise.status || 'OPEN').toUpperCase();
  if (status !== 'OPEN') throw Object.assign(new Error('That proposal is no longer open.'), { statusCode: 409 });
  const goalCurrency = String(fundraise.goal_currency || 'USD').trim().toUpperCase();
  const fundingCurrency = goalCurrency === 'RSC' ? 'rsc' : 'usd';
  const goalAmount = getMoneyAmount(fundraise.goal_amount, fundingCurrency);
  const raisedAmount = getMoneyAmount(fundraise.amount_raised, fundingCurrency);
  if (goalAmount !== null && goalAmount > 0 && raisedAmount !== null && raisedAmount >= goalAmount) {
    throw Object.assign(new Error('That proposal is already fully funded.'), { statusCode: 409 });
  }
  const endDate = asText(fundraise.end_date, 80);
  if (!endDate || !Number.isFinite(Date.parse(endDate))) {
    throw Object.assign(new Error('That proposal does not publish a reliable funding deadline.'), { statusCode: 409 });
  }
  if (!isFundingDeadlineAfter(endDate, requiredOpenUntil)) {
    throw Object.assign(new Error('That proposal closes before the weekly cutoff and cannot be selected.'), { statusCode: 409 });
  }
  const slug = asText(content.slug, 180);
  const author = entry.author || fundraise.created_by?.author_profile || fundraise.created_by || {};
  const firstGrant = Array.isArray(entry.associated_grants) ? entry.associated_grants[0] : null;
  const authorName = [asText(author.first_name, 50), asText(author.last_name, 50)].filter(Boolean).join(' ') || 'ResearchHub researcher';
  return {
    id: target,
    title: asText(content.title, 180) || 'ResearchHub proposal',
    url: slug ? `https://www.researchhub.com/post/${target}/${slug}` : `https://www.researchhub.com/fund`,
    author: authorName,
    imageUrl: asHttpUrl(content.image_url) || asHttpUrl(firstGrant?.image) || asHttpUrl(author.profile_image),
    endDate
  };
};

module.exports = { findEligibleProposal };
