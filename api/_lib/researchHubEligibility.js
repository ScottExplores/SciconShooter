const {
  FEED_URL, FEED_TIMEOUT_MS, fetchResearchHubJson, assertFundingFeed, safeNextFeedUrl
} = require('../../services/revamp/researchhub/serverFeed');
const MAX_OPEN_FEED_PAGES = 5;
const MAX_OPEN_PROPOSALS = 500;
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

const proposalIdOf = (entry) => String(entry?.content_object?.id ?? entry?.id ?? '');

const fetchOpenProposalEntries = async () => {
  const entries = [];
  let nextUrl = FEED_URL;
  let resultLimitExceeded = false;
  const deadline = Date.now() + FEED_TIMEOUT_MS;

  for (
    let page = 0;
    nextUrl && page < MAX_OPEN_FEED_PAGES && entries.length < MAX_OPEN_PROPOSALS;
    page += 1
  ) {
    const payload = assertFundingFeed(await fetchResearchHubJson(nextUrl, {
      timeoutMs: Math.min(4_000, deadline - Date.now())
    }));
    if (Array.isArray(payload?.results)) {
      const remainingCapacity = MAX_OPEN_PROPOSALS - entries.length;
      if (payload.results.length > remainingCapacity) {
        resultLimitExceeded = true;
      }
      entries.push(...payload.results.slice(0, remainingCapacity));
    }
    nextUrl = safeNextFeedUrl(payload?.next);
  }

  if (nextUrl || resultLimitExceeded) {
    throw Object.assign(new Error(
      'ResearchHub eligibility feed exceeds the safe pagination limit; refusing to use an incomplete proposal set.'
    ), {
      statusCode: 502,
      code: 'RESEARCHHUB_FEED_INCOMPLETE'
    });
  }

  return entries;
};

const inspectProposalEntry = (entry, requiredOpenUntil) => {
  const id = proposalIdOf(entry);
  const content = entry?.content_object || entry;
  const fundraise = content?.fundraise || entry?.fundraise || {};
  const status = String(fundraise.status || 'OPEN').trim().toUpperCase();
  const goalCurrency = String(fundraise.goal_currency || 'USD').trim().toUpperCase();
  const fundingCurrency = goalCurrency === 'RSC' ? 'rsc' : 'usd';
  const goalAmount = getMoneyAmount(fundraise.goal_amount, fundingCurrency);
  const raisedAmount = getMoneyAmount(fundraise.amount_raised, fundingCurrency);
  const endDate = asText(fundraise.end_date, 80);

  if (!/^\d{1,20}$/.test(id)) {
    return { eligible: false, error: 'That proposal does not publish a valid ResearchHub ID.' };
  }
  if (status !== 'OPEN') {
    return { eligible: false, error: 'That proposal is no longer open.' };
  }
  if (goalAmount !== null && goalAmount > 0 && raisedAmount !== null && raisedAmount >= goalAmount) {
    return { eligible: false, error: 'That proposal is already fully funded.' };
  }
  if (!endDate || !Number.isFinite(Date.parse(endDate))) {
    return { eligible: false, error: 'That proposal does not publish a reliable funding deadline.' };
  }
  if (!isFundingDeadlineAfter(endDate, requiredOpenUntil)) {
    return { eligible: false, error: 'That proposal closes before the weekly cutoff and cannot be selected.' };
  }

  const slug = asText(content.slug, 180);
  const author = entry.author || fundraise.created_by?.author_profile || fundraise.created_by || {};
  const firstGrant = Array.isArray(entry.associated_grants) ? entry.associated_grants[0] : null;
  const contributors = fundraise.contributors && typeof fundraise.contributors === 'object'
    ? fundraise.contributors
    : {};
  const authorName = [asText(author.first_name, 50), asText(author.last_name, 50)]
    .filter(Boolean)
    .join(' ') || 'ResearchHub researcher';
  const fundingPercent = goalAmount !== null && goalAmount > 0 && raisedAmount !== null && raisedAmount >= 0
    ? (raisedAmount / goalAmount) * 100
    : null;

  return {
    eligible: true,
    proposal: {
      id,
      title: asText(content.title, 180) || 'ResearchHub proposal',
      url: slug ? `https://www.researchhub.com/post/${id}/${slug}` : 'https://www.researchhub.com/fund',
      author: authorName,
      imageUrl: asHttpUrl(content.image_url) || asHttpUrl(firstGrant?.image) || asHttpUrl(author.profile_image),
      endDate,
      goalCurrency: goalCurrency === 'RSC' ? 'RSC' : 'USD',
      goalAmount,
      raisedAmount,
      fundingPercent,
      backers: Math.max(0, Math.floor(asNumber(contributors.total) || 0))
    }
  };
};

const compareEligibleProposalsByFunding = (left, right) => {
  const leftKnown = left.fundingPercent !== null;
  const rightKnown = right.fundingPercent !== null;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (left.fundingPercent !== right.fundingPercent) {
    return (right.fundingPercent ?? 0) - (left.fundingPercent ?? 0);
  }
  if (left.goalCurrency === right.goalCurrency && left.raisedAmount !== right.raisedAmount) {
    return (right.raisedAmount ?? 0) - (left.raisedAmount ?? 0);
  }
  if (left.backers !== right.backers) return right.backers - left.backers;
  const titleOrder = left.title.localeCompare(right.title, 'en', { sensitivity: 'base' });
  return titleOrder || left.id.localeCompare(right.id);
};

const eligibleProposalsFromEntries = (entries, requiredOpenUntil) => (
  entries
    .map((entry) => inspectProposalEntry(entry, requiredOpenUntil))
    .filter((result) => result.eligible)
    .map((result) => result.proposal)
);

const findEligibleProposal = async (
  proposalId,
  { requiredOpenUntil = getCurrentWeekRange().end } = {}
) => {
  const target = String(proposalId || '');
  if (!/^\d{1,20}$/.test(target)) {
    throw Object.assign(new Error('Invalid ResearchHub proposal ID.'), { statusCode: 400 });
  }

  const entries = await fetchOpenProposalEntries();
  const entry = entries.find((candidate) => proposalIdOf(candidate) === target);
  if (!entry) {
    throw Object.assign(new Error('That proposal is not in the current eligible funding feed.'), { statusCode: 409 });
  }
  const inspected = inspectProposalEntry(entry, requiredOpenUntil);
  if (!inspected.eligible) {
    throw Object.assign(new Error(inspected.error), { statusCode: 409 });
  }
  return inspected.proposal;
};

const findHighestFundedEligibleProposal = async (
  { requiredOpenUntil = getCurrentWeekRange().end } = {}
) => {
  const entries = await fetchOpenProposalEntries();
  const proposal = eligibleProposalsFromEntries(entries, requiredOpenUntil)
    .sort(compareEligibleProposalsByFunding)[0];
  if (!proposal) {
    throw Object.assign(new Error('No eligible ResearchHub proposal is available for the weekly fallback.'), {
      statusCode: 409
    });
  }
  return proposal;
};

const resolveEligibleProposalForFinalization = async (
  proposalId,
  { requiredOpenUntil, proposalEntries } = {}
) => {
  const cutoff = requiredOpenUntil || getCurrentWeekRange().end;
  const entries = Array.isArray(proposalEntries)
    ? proposalEntries
    : await fetchOpenProposalEntries();
  const eligible = eligibleProposalsFromEntries(entries, cutoff);
  const target = String(proposalId || '');
  const manualProposal = /^\d{1,20}$/.test(target)
    ? eligible.find((proposal) => proposal.id === target)
    : null;
  if (manualProposal) {
    return { proposal: manualProposal, selectionSource: 'manual' };
  }

  const fallbackProposal = eligible.sort(compareEligibleProposalsByFunding)[0];
  if (!fallbackProposal) {
    throw Object.assign(new Error('No eligible ResearchHub proposal is available for the weekly fallback.'), {
      statusCode: 409
    });
  }
  return {
    proposal: fallbackProposal,
    selectionSource: 'automatic_fallback',
    replacedProposalId: target || null
  };
};

module.exports = {
  compareEligibleProposalsByFunding,
  fetchOpenProposalEntries,
  findEligibleProposal,
  findHighestFundedEligibleProposal,
  eligibleProposalsFromEntries,
  resolveEligibleProposalForFinalization
};
