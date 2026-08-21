const { isAuthorized, sendJson } = require('./weeklyCompetitionService');
const { createXClient } = require('./xApi');
const { generateReply } = require('./socialAgentModel');
const {
  addDateKeyDays,
  buildEvergreenCandidates,
  pacificParts
} = require('./socialAgentEvergreen');
const {
  classifyMention,
  deterministicReply,
  validateOriginalPost,
  validateReply
} = require('./socialAgentPolicy');
const { createSocialStore } = require('./socialAgentStore');

const ACCOUNT_HANDLE = 'SciconShooter';
const GAME_URL = 'https://www.sciconshooter.xyz/';
const MAX_WEEKLY_POST_AGE_MS = 72 * 60 * 60 * 1000;
const METRICS_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_LEARNING_SAMPLES = 3;
const MIN_ATTRIBUTED_SESSIONS = 3;
const MIN_POLL_DURATION_MINUTES = 5;
const MAX_POLL_DURATION_MINUTES = 10_080;
const MAX_POLL_OPTION_LENGTH = 25;
const EVERGREEN_REFILL_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const EVERGREEN_REFILL_DAYS = 8;

const comparePostIds = (left, right) => {
  try {
    const leftId = BigInt(left?.id || 0);
    const rightId = BigInt(right?.id || 0);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  } catch {
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  }
};

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const getPacificWeekday = (date) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short'
}).format(date);

const getPacificHour = (date) => Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: '2-digit',
  hourCycle: 'h23'
}).format(date));

const getPacificMinute = (date) => Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  minute: '2-digit'
}).format(date));

const isWeeklyPostingWindow = (environment, date) => (
  getPacificWeekday(date) === 'Sun'
  && getPacificHour(date) === Number(environment.X_AGENT_WEEKLY_HOUR || 14)
  && getPacificMinute(date) === Number(environment.X_AGENT_WEEKLY_MINUTE || 15)
);

const configuredOriginalDays = (environment) => new Set(
  String(environment.X_AGENT_ORIGINAL_DAYS || 'Tue,Wed,Thu')
    .split(',')
    .map((value) => value.trim().slice(0, 3))
    .filter(Boolean)
);

const configuredOriginalHours = (environment) => new Set(
  String(environment.X_AGENT_ORIGINAL_HOURS || '9,16')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23)
);

const buildQueuedPostText = (entry) => {
  const text = String(entry?.post_text || '').trim();
  const link = String(entry?.link_url || '').trim();
  return link && !text.includes(link) ? `${text}\n${link}` : text;
};

const readQueuePoll = (entry) => {
  const raw = entry?.metadata?.poll;
  if (raw === undefined || raw === null) return { ok: true, poll: null };
  if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 4) {
    return { ok: false, reason: 'option_count' };
  }
  if (raw.options.some((option) => typeof option !== 'string')) {
    return { ok: false, reason: 'option_type' };
  }
  const options = raw.options.map((option) => option.trim());
  if (options.some((option) => !option || option.length > MAX_POLL_OPTION_LENGTH)) {
    return { ok: false, reason: 'option_length' };
  }
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    return { ok: false, reason: 'duplicate_options' };
  }
  const durationMinutes = Number(raw.duration_minutes);
  if (
    !Number.isInteger(durationMinutes)
    || durationMinutes < MIN_POLL_DURATION_MINUTES
    || durationMinutes > MAX_POLL_DURATION_MINUTES
  ) {
    return { ok: false, reason: 'duration' };
  }
  return { ok: true, poll: { options, duration_minutes: durationMinutes } };
};

const metricNumber = (metrics, key) => Math.max(0, Number(metrics?.[key]) || 0);

const engagementRate = (metrics, pollVotes = 0) => {
  const impressions = metricNumber(metrics, 'impression_count');
  if (impressions === 0) return null;
  const weightedEngagement = metricNumber(metrics, 'like_count')
    + (2 * metricNumber(metrics, 'reply_count'))
    + (3 * metricNumber(metrics, 'retweet_count'))
    + (3 * metricNumber(metrics, 'quote_count'))
    + Math.max(0, Math.floor(Number(pollVotes) || 0));
  return weightedEngagement / impressions;
};

const readPollSnapshot = (post, pollsById) => {
  const pollId = String(post?.attachments?.poll_ids?.[0] || '');
  const poll = pollId ? pollsById.get(pollId) : null;
  if (!poll) return null;
  const options = Array.isArray(poll.options)
    ? poll.options.slice(0, 4).map((option, index) => ({
      position: Math.max(1, Math.floor(Number(option?.position) || index + 1)),
      label: String(option?.label || '').trim().slice(0, MAX_POLL_OPTION_LENGTH),
      votes: Math.max(0, Math.floor(Number(option?.votes) || 0))
    })).filter((option) => option.label)
    : [];
  return {
    id: pollId,
    durationMinutes: Math.max(0, Math.floor(Number(poll.duration_minutes) || 0)),
    endDatetime: String(poll.end_datetime || '').slice(0, 40) || null,
    votingStatus: ['active', 'closed'].includes(poll.voting_status) ? poll.voting_status : 'unknown',
    options,
    totalVotes: options.reduce((total, option) => total + option.votes, 0)
  };
};

const buildLearningSummary = (actions = []) => {
  const groups = new Map();
  for (const action of actions) {
    const metrics = action?.metadata?.latestMetrics;
    const rate = engagementRate(metrics, action?.metadata?.latestPoll?.totalVotes);
    if (rate === null) continue;
    const kind = String(action?.metadata?.contentKind || action?.reason || action?.action_type || 'unknown');
    const current = groups.get(kind) || { kind, samples: 0, totalRate: 0 };
    current.samples += 1;
    current.totalRate += rate;
    groups.set(kind, current);
  }
  return [...groups.values()]
    .map((group) => ({
      kind: group.kind,
      samples: group.samples,
      averageEngagementRate: group.totalRate / group.samples,
      eligible: group.samples >= MIN_LEARNING_SAMPLES
    }))
    .sort((left, right) => right.averageEngagementRate - left.averageEngagementRate);
};

const safeCampaignContent = (value) => {
  const content = String(value || '').trim();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(content) ? content : '';
};

const readCampaignContent = (entry) => {
  const configured = safeCampaignContent(entry?.metadata?.campaign_content);
  if (configured) return configured;
  try {
    return safeCampaignContent(new URL(String(entry?.link_url || '')).searchParams.get('utm_content'));
  } catch {
    return '';
  }
};

const isTestProductEvent = (event) => {
  const properties = event?.properties && typeof event.properties === 'object'
    ? event.properties
    : {};
  return properties.test_run === true
    || properties.owner_test === true
    || properties.test_mode === true
    || /(?:^|[-_ ])(?:test|owner|sandbox|preview|director|lab)(?:$|[-_ ])/i.test(
      String(properties.run_mode || properties.mode || '')
    );
};

const buildConversionLearningSummary = (actions = [], events = []) => {
  const contentKinds = new Map();
  for (const action of actions) {
    const content = safeCampaignContent(action?.metadata?.campaignContent);
    if (!content) continue;
    contentKinds.set(
      content,
      String(action?.metadata?.contentKind || action?.reason || action?.action_type || 'unknown')
    );
  }
  if (contentKinds.size === 0) return [];

  const testSessions = new Set(events.filter(isTestProductEvent).map((event) => (
    String(event?.session_id || '').trim()
  )).filter(Boolean));
  const attributedSessions = new Map();
  for (const event of events) {
    if (event?.event_name !== 'app_opened' || isTestProductEvent(event)) continue;
    const properties = event?.properties && typeof event.properties === 'object'
      ? event.properties
      : {};
    const content = safeCampaignContent(properties.campaign_content);
    const sessionId = String(event?.session_id || '').trim();
    if (
      !sessionId
      || testSessions.has(sessionId)
      || attributedSessions.has(sessionId)
      || properties.campaign_source !== 'x'
      || properties.campaign_medium !== 'social'
      || !contentKinds.has(content)
    ) continue;
    attributedSessions.set(sessionId, { content, kind: contentKinds.get(content) });
  }

  const groups = new Map();
  for (const attribution of attributedSessions.values()) {
    const current = groups.get(attribution.kind) || {
      kind: attribution.kind,
      attributedSessions: new Set(),
      missionStartedSessions: new Set(),
      scoreSubmittedSessions: new Set()
    };
    groups.set(attribution.kind, current);
  }
  for (const [sessionId, attribution] of attributedSessions) {
    groups.get(attribution.kind).attributedSessions.add(sessionId);
  }
  for (const event of events) {
    if (isTestProductEvent(event)) continue;
    const sessionId = String(event?.session_id || '').trim();
    const attribution = attributedSessions.get(sessionId);
    if (!attribution) continue;
    const group = groups.get(attribution.kind);
    if (event.event_name === 'mission_started') group.missionStartedSessions.add(sessionId);
    if (event.event_name === 'score_submitted') group.scoreSubmittedSessions.add(sessionId);
  }

  return [...groups.values()].map((group) => {
    const sessions = group.attributedSessions.size;
    const missionStarts = group.missionStartedSessions.size;
    const scoreSubmissions = group.scoreSubmittedSessions.size;
    return {
      kind: group.kind,
      attributedSessions: sessions,
      missionStartedSessions: missionStarts,
      scoreSubmittedSessions: scoreSubmissions,
      conversionScore: sessions > 0 ? (missionStarts + (2 * scoreSubmissions)) / sessions : 0,
      eligible: sessions >= MIN_ATTRIBUTED_SESSIONS
    };
  }).sort((left, right) => (
    right.conversionScore - left.conversionScore
    || right.scoreSubmittedSessions - left.scoreSubmittedSessions
    || right.missionStartedSessions - left.missionStartedSessions
    || right.attributedSessions - left.attributedSessions
  ));
};

const chooseQueuedPost = (entries = [], learning = [], conversionLearning = []) => {
  if (entries.length < 2) return entries[0] || null;
  const engagementRanks = new Map(
    learning.filter((item) => item.eligible).map((item, index) => [item.kind, index])
  );
  const conversionRanks = new Map(
    conversionLearning.filter((item) => item.eligible).map((item, index) => [item.kind, index])
  );
  if (engagementRanks.size === 0 && conversionRanks.size === 0) return entries[0];
  const topPriority = Number(entries[0]?.priority) || 0;
  const candidates = entries.filter((entry) => topPriority - (Number(entry?.priority) || 0) <= 5);
  return [...candidates].sort((left, right) => {
    const leftKind = String(left?.content_kind || '');
    const rightKind = String(right?.content_kind || '');
    const conversionDifference = (
      conversionRanks.get(leftKind) ?? Number.MAX_SAFE_INTEGER
    ) - (
      conversionRanks.get(rightKind) ?? Number.MAX_SAFE_INTEGER
    );
    if (conversionDifference !== 0) return conversionDifference;
    return (
      engagementRanks.get(leftKind) ?? Number.MAX_SAFE_INTEGER
    ) - (
      engagementRanks.get(rightKind) ?? Number.MAX_SAFE_INTEGER
    );
  })[0] || entries[0];
};

const safeDisplayName = (value) => String(value || '')
  .replace(/[\r\n@#]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 40);

const buildWeeklyThread = (competition) => {
  const winner = safeDisplayName(competition?.winner_name);
  const score = Number(competition?.winning_score);
  const wave = Number(competition?.winning_wave || 1);
  const proposalUrl = String(competition?.proposal_url || '').trim();
  if (!winner || !Number.isFinite(score) || score < 0 || !Number.isFinite(wave) || wave < 1) return null;
  try {
    if (new URL(proposalUrl).hostname !== 'www.researchhub.com') return null;
  } catch {
    return null;
  }
  const formattedScore = Math.floor(score).toLocaleString('en-US');
  return {
    main: [
      `${winner} wins this week's Scicon Shooter competition with ${formattedScore} points on Wave ${Math.floor(wave)}.`,
      'They selected this proposal for the round\'s RSC funding-credit allocation. New ships, mini-ship upgrades and bosses are live.',
      proposalUrl
    ].join('\n\n'),
    reply: `Think you can beat ${formattedScore}?\n\nPlay Scicon Shooter and reply with your score:\n${GAME_URL}`
  };
};

const ensureEvergreenQueue = async ({ store, environment = process.env, now = new Date() }) => {
  if (String(environment.X_AGENT_EVERGREEN_ENABLED || 'true').toLowerCase() === 'false') {
    return { enabled: false, inserted: 0, paused: 0, reason: 'disabled' };
  }
  if (
    typeof store?.getQueueHorizon !== 'function'
    || typeof store?.pauseExpiredQueuedPosts !== 'function'
    || typeof store?.insertQueuedPosts !== 'function'
  ) {
    return { enabled: false, inserted: 0, paused: 0, reason: 'store_unsupported' };
  }

  const nowIso = now.toISOString();
  const paused = await store.pauseExpiredQueuedPosts(nowIso);
  const horizon = await store.getQueueHorizon(nowIso);
  const horizonTime = Date.parse(horizon?.not_before || '');
  if (
    Number.isFinite(horizonTime)
    && horizonTime > now.getTime() + EVERGREEN_REFILL_THRESHOLD_MS
  ) {
    return {
      enabled: true,
      inserted: 0,
      paused,
      reason: 'horizon_healthy',
      horizon: new Date(horizonTime).toISOString()
    };
  }

  const startParts = pacificParts(Number.isFinite(horizonTime) ? new Date(horizonTime) : now);
  const baseDateKey = `${startParts.year}-${startParts.month}-${startParts.day}`;
  const startDateKey = Number.isFinite(horizonTime) ? addDateKeyDays(baseDateKey, 1) : baseDateKey;
  const candidates = buildEvergreenCandidates({
    startDateKey,
    days: EVERGREEN_REFILL_DAYS
  });
  const invalidCandidate = candidates.find((candidate) => (
    candidate?.metadata?.claims_verified !== true
    || !validateOriginalPost(buildQueuedPostText(candidate)).ok
  ));
  if (invalidCandidate) {
    throw new Error(`Evergreen candidate failed validation: ${invalidCandidate.content_key || 'unknown'}`);
  }
  const inserted = await store.insertQueuedPosts(candidates);
  return {
    enabled: true,
    inserted: inserted.length,
    attempted: candidates.length,
    paused,
    reason: inserted.length > 0 ? 'refilled' : 'already_seeded',
    startDateKey
  };
};

const publishReservedAction = async ({ client, store, key, text, replyToId, poll, metadata }) => {
  try {
    const post = await client.createPost({ text, replyToId, poll });
    if (!post?.id) throw new Error('X did not return a post ID.');
    const action = await store.updateAction(key, {
      status: 'published',
      x_post_id: post.id,
      published_at: new Date().toISOString(),
      metadata: metadata || {}
    });
    return { published: true, postId: post.id, action };
  } catch (error) {
    await store.updateAction(key, {
      status: 'failed',
      reason: String(error?.message || error).slice(0, 500),
      metadata: metadata || {}
    }).catch(() => null);
    throw error;
  }
};

const processMentions = async ({
  client,
  store,
  environment = process.env,
  now = new Date(),
  generateReplyFn = generateReply
}) => {
  const maxReplies = positiveInteger(environment.X_AGENT_MAX_REPLIES_PER_DAY, 3, 10);
  const publishedSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  let available = Math.max(0, maxReplies - await store.countPublishedRepliesSince(publishedSince));
  if (available === 0) return { checked: 0, published: 0, skipped: 0, reason: 'daily_reply_limit' };

  const account = String(environment.X_ACCOUNT_USER_ID || '').trim()
    ? { id: String(environment.X_ACCOUNT_USER_ID).trim(), username: ACCOUNT_HANDLE }
    : await client.getMe();
  if (!account?.id) throw new Error('The X account user ID could not be resolved.');

  const sinceId = await store.getLatestProcessedMentionId();
  const payload = await client.getMentions(account.id, { sinceId, maxResults: 25 });
  const authors = new Map((payload?.includes?.users || []).map((user) => [String(user.id), user]));
  const mentions = [...(payload?.data || [])].sort(comparePostIds);
  const result = { checked: mentions.length, published: 0, skipped: 0, actions: [] };

  for (const mention of mentions) {
    const sourcePostId = String(mention?.id || '');
    const sourceAuthorId = String(mention?.author_id || '');
    const directContact = String(mention?.in_reply_to_user_id || '') === String(account.id)
      || new RegExp(`@${ACCOUNT_HANDLE}\\b`, 'i').test(String(mention?.text || ''));
    if (!sourcePostId || !sourceAuthorId || sourceAuthorId === String(account.id) || !directContact) {
      result.skipped += 1;
      continue;
    }

    const key = `mention:${sourcePostId}`;
    if (await store.getAction(key)) {
      result.skipped += 1;
      continue;
    }

    const classification = classifyMention(mention.text);
    if (classification.action === 'skip' || available === 0) {
      await store.reserveAction({
        idempotencyKey: key,
        actionType: 'reply',
        sourcePostId,
        sourceAuthorId,
        reason: available === 0 ? 'daily_reply_limit' : classification.reason,
        status: 'skipped',
        metadata: { sourceUsername: authors.get(sourceAuthorId)?.username || null }
      });
      result.skipped += 1;
      continue;
    }

    let replyText = deterministicReply(classification.reason, mention.text);
    if (classification.action === 'reply' && String(environment.OPENAI_API_KEY || '').trim()) {
      try {
        const generated = await generateReplyFn({
          mentionText: mention.text,
          reason: classification.reason,
          environment
        });
        if (generated?.action === 'skip') {
          await store.reserveAction({
            idempotencyKey: key,
            actionType: 'reply',
            sourcePostId,
            sourceAuthorId,
            reason: `model_skip:${String(generated.reason || '').slice(0, 120)}`,
            status: 'skipped'
          });
          result.skipped += 1;
          continue;
        }
        if (generated?.action === 'reply') replyText = generated.text;
      } catch (error) {
        console.error('X reply generation failed; using the policy fallback:', error);
      }
    }

    const validation = validateReply(replyText);
    if (!validation.ok) {
      await store.reserveAction({
        idempotencyKey: key,
        actionType: 'reply',
        sourcePostId,
        sourceAuthorId,
        reason: `reply_validation:${validation.reason}`,
        status: 'skipped'
      });
      result.skipped += 1;
      continue;
    }

    const reserved = await store.reserveAction({
      idempotencyKey: key,
      actionType: 'reply',
      sourcePostId,
      sourceAuthorId,
      content: validation.text,
      reason: classification.reason,
      metadata: {
        sourceUsername: authors.get(sourceAuthorId)?.username || null,
        conversationId: mention.conversation_id || null
      }
    });
    if (!reserved) {
      result.skipped += 1;
      continue;
    }

    const published = await publishReservedAction({
      client,
      store,
      key,
      text: validation.text,
      replyToId: sourcePostId,
      metadata: reserved.metadata
    });
    result.published += 1;
    available -= 1;
    result.actions.push({ sourcePostId, postId: published.postId, reason: classification.reason });
  }
  return result;
};

const processQueuedOriginal = async ({ client, store, environment = process.env, now = new Date() }) => {
  if (!configuredOriginalDays(environment).has(getPacificWeekday(now))) {
    return { published: false, reason: 'not_an_original_post_day' };
  }
  if (!configuredOriginalHours(environment).has(getPacificHour(now))) {
    return { published: false, reason: 'not_an_original_post_hour' };
  }
  const lookback = new Date(now.getTime() - METRICS_LOOKBACK_MS).toISOString();
  const [entries, history, productEvents] = await Promise.all([
    store.getQueuedPosts(now.toISOString()),
    store.getPublishedActionsSince(lookback),
    typeof store.getProductEventsSince === 'function'
      ? store.getProductEventsSince(lookback).catch((error) => {
        console.error('X conversion learning failed; using engagement-only selection:', error);
        return [];
      })
      : []
  ]);
  const learning = buildLearningSummary(history);
  const conversionLearning = buildConversionLearningSummary(history, productEvents);
  const entry = chooseQueuedPost(entries, learning, conversionLearning);
  if (!entry) return { published: false, reason: 'queue_empty' };
  if (entry?.metadata?.claims_verified !== true) {
    return { published: false, reason: 'claims_not_verified', contentKey: entry.content_key };
  }
  if (entry.requires_media) {
    return { published: false, reason: 'media_requires_review', contentKey: entry.content_key };
  }
  const pollValidation = readQueuePoll(entry);
  if (!pollValidation.ok) {
    return { published: false, reason: `poll_validation:${pollValidation.reason}`, contentKey: entry.content_key };
  }
  const text = buildQueuedPostText(entry);
  const validation = validateOriginalPost(text);
  if (!validation.ok) {
    return { published: false, reason: `post_validation:${validation.reason}`, contentKey: entry.content_key };
  }
  const key = `queue:${entry.content_key}`;
  const existing = await store.getAction(key);
  if (existing) return { published: false, reason: `already_${existing.status}`, contentKey: entry.content_key };
  const reserved = await store.reserveAction({
    idempotencyKey: key,
    actionType: 'original',
    content: validation.text,
    reason: entry.content_kind || 'queued_update',
    metadata: {
      contentKey: entry.content_key,
      contentKind: entry.content_kind || 'queued_update',
      campaignContent: readCampaignContent(entry) || null,
      learningApplied: conversionLearning.some((item) => item.eligible)
        || learning.some((item) => item.eligible),
      learningSource: conversionLearning.some((item) => item.eligible)
        ? 'product_conversion'
        : learning.some((item) => item.eligible) ? 'x_engagement' : 'none',
      poll: pollValidation.poll
    }
  });
  if (!reserved) return { published: false, reason: 'duplicate_reservation', contentKey: entry.content_key };

  const published = await publishReservedAction({
    client,
    store,
    key,
    text: validation.text,
    poll: pollValidation.poll,
    metadata: reserved.metadata
  });
  await store.markQueuedPostPublished(entry.content_key, published.action?.id || reserved.id);
  return { published: true, postId: published.postId, contentKey: entry.content_key };
};

const syncPublishedMetrics = async ({ client, store, environment = process.env, now = new Date() }) => {
  const account = String(environment.X_ACCOUNT_USER_ID || '').trim()
    ? { id: String(environment.X_ACCOUNT_USER_ID).trim() }
    : await client.getMe();
  if (!account?.id) throw new Error('The X account user ID could not be resolved.');
  const sinceIso = new Date(now.getTime() - METRICS_LOOKBACK_MS).toISOString();
  const actions = await store.getPublishedActionsSince(sinceIso);
  if (actions.length === 0) return { checked: 0, updated: 0, learning: [] };
    const timeline = await client.getOwnPosts(account.id, { maxResults: 100 });
    const posts = new Map((timeline?.data || []).map((post) => [String(post.id), post]));
    const polls = new Map((timeline?.includes?.polls || []).map((poll) => [String(poll.id), poll]));
  let updated = 0;
  const observedAt = now.toISOString();
  for (const action of actions) {
      const post = posts.get(String(action.x_post_id || ''));
      if (!post?.public_metrics) continue;
      const latestPoll = readPollSnapshot(post, polls);
      await store.updateAction(action.idempotency_key, {
        metadata: {
          ...(action.metadata || {}),
          latestMetrics: post.public_metrics,
          ...(latestPoll ? { latestPoll } : {}),
          metricsObservedAt: observedAt,
          engagementRate: engagementRate(
            post.public_metrics,
            latestPoll?.totalVotes || action?.metadata?.latestPoll?.totalVotes
          )
      }
    });
    updated += 1;
  }
    const refreshed = actions.map((action) => {
      const post = posts.get(String(action.x_post_id || ''));
      const latestPoll = readPollSnapshot(post, polls);
      return post?.public_metrics
        ? {
          ...action,
          metadata: {
            ...(action.metadata || {}),
            latestMetrics: post.public_metrics,
            ...(latestPoll ? { latestPoll } : {})
          }
        }
        : action;
  });
  return { checked: actions.length, updated, learning: buildLearningSummary(refreshed) };
};

const processWeeklyWinner = async ({ client, store, now = new Date() }) => {
  const competition = await store.getLatestFinalizedCompetition();
  if (!competition) return { published: false, reason: 'no_finalized_competition' };
  const endedAt = new Date(competition.ends_at || '');
  if (
    !Number.isFinite(endedAt.getTime())
    || endedAt.getTime() > now.getTime()
    || now.getTime() - endedAt.getTime() > MAX_WEEKLY_POST_AGE_MS
  ) {
    return { published: false, reason: 'competition_not_current', weekKey: competition.week_key };
  }
  if (!competition.proposal_id || !competition.proposal_url) {
    return { published: false, reason: 'proposal_selection_pending', weekKey: competition.week_key };
  }
  const thread = buildWeeklyThread(competition);
  if (!thread) return { published: false, reason: 'invalid_competition_details', weekKey: competition.week_key };
  const mainValidation = validateOriginalPost(thread.main, { allowResearchHubProposal: true });
  const replyValidation = validateReply(thread.reply);
  if (!mainValidation.ok || !replyValidation.ok) {
    return {
      published: false,
      reason: `thread_validation:${mainValidation.reason || replyValidation.reason}`,
      weekKey: competition.week_key
    };
  }

  const mainKey = `weekly:${competition.week_key}:main`;
  let mainAction = await store.getAction(mainKey);
  let mainPostId = mainAction?.status === 'published' ? mainAction.x_post_id : null;
  if (!mainAction) {
    mainAction = await store.reserveAction({
      idempotencyKey: mainKey,
      actionType: 'weekly_winner',
      content: mainValidation.text,
      reason: 'finalized_winner_with_proposal_selection',
      metadata: {
        weekKey: competition.week_key,
        competitionStatus: competition.status,
        fundingStatus: competition.allocation_tx_hash ? 'transaction_confirmed' : 'selection_only'
      }
    });
    if (!mainAction) return { published: false, reason: 'duplicate_main_reservation', weekKey: competition.week_key };
    const publishedMain = await publishReservedAction({
      client,
      store,
      key: mainKey,
      text: mainValidation.text,
      metadata: mainAction.metadata
    });
    mainPostId = publishedMain.postId;
  }
  if (!mainPostId) {
    return { published: false, reason: `main_${mainAction?.status || 'unavailable'}`, weekKey: competition.week_key };
  }

  const replyKey = `weekly:${competition.week_key}:reply`;
  const existingReply = await store.getAction(replyKey);
  if (existingReply) {
    return {
      published: mainAction?.status === 'published',
      mainPostId,
      replyPostId: existingReply.x_post_id || null,
      reason: `reply_${existingReply.status}`,
      weekKey: competition.week_key
    };
  }
  const reservedReply = await store.reserveAction({
    idempotencyKey: replyKey,
    actionType: 'weekly_reply',
    sourcePostId: mainPostId,
    content: replyValidation.text,
    reason: 'score_challenge',
    metadata: { weekKey: competition.week_key }
  });
  if (!reservedReply) return { published: true, mainPostId, reason: 'duplicate_reply_reservation' };
  const publishedReply = await publishReservedAction({
    client,
    store,
    key: replyKey,
    text: replyValidation.text,
    replyToId: mainPostId,
    metadata: reservedReply.metadata
  });
  return {
    published: true,
    mainPostId,
    replyPostId: publishedReply.postId,
    weekKey: competition.week_key
  };
};

const runSocialAgent = async ({
  mode = 'daily',
  environment = process.env,
  now = new Date(),
  client,
  store
} = {}) => {
  if (String(environment.X_AUTONOMY_ENABLED || '').toLowerCase() !== 'true') {
    return { enabled: false, mode, reason: 'kill_switch_disabled' };
  }
  const activeClient = client || createXClient({ environment });
  const activeStore = store || createSocialStore();
  const output = { enabled: true, mode };
  if (mode === 'daily' || mode === 'all') {
    try {
      output.refill = await ensureEvergreenQueue({ store: activeStore, environment, now });
    } catch (error) {
      console.error('X evergreen refill failed; continuing with the existing queue:', error);
      output.refill = { enabled: true, inserted: 0, reason: 'refill_failed' };
    }
    output.mentions = await processMentions({ client: activeClient, store: activeStore, environment, now });
    output.original = await processQueuedOriginal({ client: activeClient, store: activeStore, environment, now });
    output.metrics = await syncPublishedMetrics({ client: activeClient, store: activeStore, environment, now });
  }
  if (mode === 'weekly' || mode === 'all') {
    output.weekly = isWeeklyPostingWindow(environment, now)
      ? await processWeeklyWinner({ client: activeClient, store: activeStore, now })
      : { published: false, reason: 'not_weekly_posting_window' };
  }
  if (!['daily', 'weekly', 'all'].includes(mode)) throw Object.assign(new Error('Unknown social-agent mode.'), { statusCode: 400 });
  return output;
};

const socialAgentHandler = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  try {
    const mode = String(req.query?.mode || 'daily').trim().toLowerCase();
    const result = await runSocialAgent({ mode });
    return sendJson(res, 200, result);
  } catch (error) {
    console.error('Autonomous X agent failed:', error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Autonomous X agent failed' });
  }
};

module.exports = {
  ACCOUNT_HANDLE,
  GAME_URL,
  buildConversionLearningSummary,
  buildQueuedPostText,
  buildLearningSummary,
  buildWeeklyThread,
  chooseQueuedPost,
  ensureEvergreenQueue,
  isWeeklyPostingWindow,
  processMentions,
  processQueuedOriginal,
  processWeeklyWinner,
  readPollSnapshot,
  readQueuePoll,
  runSocialAgent,
  socialAgentHandler,
  syncPublishedMetrics
};
