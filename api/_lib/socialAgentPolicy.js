const OFFICIAL_URLS = new Set([
  'https://www.sciconshooter.xyz/',
  'https://sciconshooter.xyz/',
  'https://x.com/SciconShooter'
]);
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const HOSTILE_PATTERN = /\b(?:fuck|fucking|shit|bitch|cunt|retard|kys|kill yourself)\b/i;
const SPAM_PATTERN = /\b(?:guaranteed followers|free crypto|airdrop|send me crypto|promo service|dm for promo)\b/i;
const SENSITIVE_PATTERN = /\b(?:wallet|transaction|tx hash|payment|purchase|refund|charge|private key|seed phrase|recovery phrase|password|one[- ]time code|hacked|hack|scam|security|legal|lawsuit|funding sent|funded)\b/i;
const SCORE_PATTERN = /\b(?:score|points?|wave|high score|leaderboard|beat)\b|\b\d{3,}\b/i;
const FEEDBACK_PATTERN = /\b(?:feedback|bug|issue|broken|controls?|movement|boss|ship|upgrade|hangar|gameplay|fun|difficult|hard|easy)\b/i;
const QUESTION_PATTERN = /\?|\b(?:how|what|when|where|why|can|does|is|are)\b/i;
const SECRET_REQUEST_PATTERN = /\b(?:send|share|provide|post|dm)\b.{0,24}\b(?:password|private key|seed phrase|recovery phrase|one[- ]time code)\b/i;
const UNVERIFIED_CLAIM_PATTERN = /\b(?:official (?:researchhub|base)|partner(?:ed|ship)? with (?:researchhub|base)|guaranteed prize|funding (?:was )?sent|funded successfully|you(?:'re| are) (?:the )?(?:winner|champion)|weekly (?:winner|champion))\b/i;

const weightedLength = (text) => {
  const source = String(text || '');
  let length = 0;
  let cursor = 0;
  for (const match of source.matchAll(URL_PATTERN)) {
    length += Array.from(source.slice(cursor, match.index)).length;
    length += 23;
    cursor = match.index + match[0].length;
  }
  return length + Array.from(source.slice(cursor)).length;
};

const classifyMention = (text) => {
  const value = String(text || '').trim();
  if (!value || HOSTILE_PATTERN.test(value) || SPAM_PATTERN.test(value)) {
    return { action: 'skip', reason: 'hostile_or_spam' };
  }
  if (SENSITIVE_PATTERN.test(value)) return { action: 'route_support', reason: 'sensitive_support' };
  if (SCORE_PATTERN.test(value)) return { action: 'reply', reason: 'score' };
  if (FEEDBACK_PATTERN.test(value)) return { action: 'reply', reason: 'feedback' };
  if (QUESTION_PATTERN.test(value)) return { action: 'reply', reason: 'question' };
  return { action: 'skip', reason: 'no_clear_player_intent' };
};

const deterministicReply = (reason) => {
  if (reason === 'sensitive_support') {
    return 'For wallet or transaction help, submit More -> Report a Bug in Scicon Shooter and keep the Report ID. Never send anyone a recovery phrase or private key.';
  }
  if (reason === 'score') {
    return 'Nice run. Which ship did you use, and where did the run start getting difficult?';
  }
  if (reason === 'feedback') {
    return 'Thanks for the feedback. What device were you playing on, and what should we change first?';
  }
  if (reason === 'question') {
    return 'Thanks for checking out Scicon Shooter. Which part of the game are you asking about?';
  }
  return '';
};

const validateReply = (text) => {
  const value = String(text || '').trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (weightedLength(value) > 260) return { ok: false, reason: 'too_long' };
  if (/#\w/.test(value)) return { ok: false, reason: 'hashtags_not_allowed' };
  if (/@[a-z0-9_]+/i.test(value)) return { ok: false, reason: 'mentions_not_allowed' };
  if (SECRET_REQUEST_PATTERN.test(value)) return { ok: false, reason: 'requests_secret' };
  if (UNVERIFIED_CLAIM_PATTERN.test(value)) return { ok: false, reason: 'unverified_claim' };
  const urls = value.match(URL_PATTERN) || [];
  if (urls.some((url) => !OFFICIAL_URLS.has(url.replace(/[),.!?]+$/, '')))) {
    return { ok: false, reason: 'unapproved_url' };
  }
  return { ok: true, text: value };
};

const validateOriginalPost = (text, { allowResearchHubProposal = false } = {}) => {
  const value = String(text || '').trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (weightedLength(value) > 280) return { ok: false, reason: 'too_long' };
  if (/#\w/.test(value)) return { ok: false, reason: 'hashtags_not_allowed' };
  if ((value.match(/@[a-z0-9_]+/gi) || []).length > 1) return { ok: false, reason: 'too_many_mentions' };
  if (SECRET_REQUEST_PATTERN.test(value) || UNVERIFIED_CLAIM_PATTERN.test(value)) {
    return { ok: false, reason: 'unsafe_claim' };
  }
  const urls = value.match(URL_PATTERN) || [];
  const invalidUrl = urls.find((rawUrl) => {
    const url = rawUrl.replace(/[),.!?]+$/, '');
    if (OFFICIAL_URLS.has(url)) return false;
    if (allowResearchHubProposal) {
      try {
        return new URL(url).hostname !== 'www.researchhub.com';
      } catch {
        return true;
      }
    }
    return true;
  });
  return invalidUrl ? { ok: false, reason: 'unapproved_url' } : { ok: true, text: value };
};

module.exports = {
  classifyMention,
  deterministicReply,
  validateOriginalPost,
  validateReply,
  weightedLength
};
