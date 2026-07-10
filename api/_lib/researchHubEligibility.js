const FEED_URL = 'https://backend.prod.researchhub.com/api/funding_feed/?fundraise_status=OPEN&ordering=best&page_size=100&content_type=PREREGISTRATION';

const asText = (value, max = 500) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, max)
  : null;

const findEligibleProposal = async (proposalId) => {
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
  const slug = asText(content.slug, 180);
  const author = entry.author || fundraise.created_by?.author_profile || fundraise.created_by || {};
  const authorName = [asText(author.first_name, 50), asText(author.last_name, 50)].filter(Boolean).join(' ') || 'ResearchHub researcher';
  return {
    id: target,
    title: asText(content.title, 180) || 'ResearchHub proposal',
    url: slug ? `https://www.researchhub.com/post/${target}/${slug}` : `https://www.researchhub.com/fund`,
    author: authorName
  };
};

module.exports = { findEligibleProposal };
