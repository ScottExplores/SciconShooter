const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  X_MEDIA_METADATA_URL,
  X_MEDIA_UPLOAD_URL,
  createOAuthHeader,
  createXClient
} = require('../api/_lib/xApi');
const {
  classifyMention,
  deterministicReply,
  isApprovedOfficialUrl,
  isApprovedResearchHubProposalUrl,
  validateOriginalPost,
  validateReply,
  weightedLength
} = require('../api/_lib/socialAgentPolicy');
const {
  buildConversionLearningSummary,
  buildLearningSummary,
  buildWeeklyThread,
  chooseQueuedPost,
  ensureEvergreenQueue,
  isWeeklyPostingWindow,
  processMentions,
  processQueuedOriginal,
  processWeeklyWinner,
  readPollSnapshot,
  readQueueMedia,
  readQueuePoll,
  runSocialAgent,
  syncPublishedMetrics
} = require('../api/_lib/socialAgent');
const { createSocialStore } = require('../api/_lib/socialAgentStore');
const { generateReply } = require('../api/_lib/socialAgentModel');
const {
  THEMES,
  buildEvergreenCandidates,
  pacificDateTimeToUtc
} = require('../api/_lib/socialAgentEvergreen');

const TEST_X_ENV = {
  X_API_KEY: 'api-key',
  X_API_SECRET: 'api-secret',
  X_ACCESS_TOKEN: 'access-token',
  X_ACCESS_TOKEN_SECRET: 'access-secret'
};

const createMemoryStore = ({ queuedPost, queuedPosts, competition } = {}) => {
  const actions = new Map();
  const queue = queuedPosts || (queuedPost ? [queuedPost] : []);
  return {
    actions,
    queuedPost,
    queuedPosts: queue,
    competition,
    publishedContent: [],
    pausedContent: [],
    async getLatestProcessedMentionId() { return null; },
    async countPublishedRepliesSince() {
      return [...actions.values()].filter((action) => action.action_type === 'reply' && action.status === 'published').length;
    },
    async getAction(key) { return actions.get(key) || null; },
    async reserveAction(action) {
      if (actions.has(action.idempotencyKey)) return null;
      const stored = {
        id: `action-${actions.size + 1}`,
        idempotency_key: action.idempotencyKey,
        action_type: action.actionType,
        source_post_id: action.sourcePostId || null,
        source_author_id: action.sourceAuthorId || null,
        content: action.content || null,
        reason: action.reason || null,
        status: action.status || 'reserved',
        metadata: action.metadata || {}
      };
      actions.set(action.idempotencyKey, stored);
      return stored;
    },
    async updateAction(key, changes) {
      const action = actions.get(key);
      if (!action) return null;
      Object.assign(action, changes);
      return action;
    },
    async getNextQueuedPost() { return this.queuedPost || null; },
    async getQueuedPosts() { return this.queuedPosts.filter((entry) => entry.status === 'queued'); },
    async getPublishedActionsSince() {
      return [...actions.values()].filter((action) => action.status === 'published');
    },
    async markQueuedPostPublished(contentKey, actionId) {
      this.publishedContent.push({ contentKey, actionId });
      const entry = this.queuedPosts.find((candidate) => candidate.content_key === contentKey) || null;
      if (entry) entry.status = 'published';
      return entry;
    },
    async markQueuedPostPaused(contentKey, metadata, reason) {
      const entry = this.queuedPosts.find((candidate) => candidate.content_key === contentKey) || null;
      if (entry) {
        entry.status = 'paused';
        entry.metadata = { ...(metadata || {}), automation_pause_reason: reason };
      }
      this.pausedContent.push({ contentKey, reason });
      return entry;
    },
    async getLatestFinalizedCompetition() { return this.competition || null; }
  };
};

test('X OAuth signatures are deterministic for fixed nonce and timestamp and cover query parameters', () => {
  const base = {
    method: 'GET',
    url: 'https://api.x.com/2/users/123/mentions?max_results=25',
    apiKey: 'key',
    apiSecret: 'secret',
    accessToken: 'token',
    accessTokenSecret: 'token-secret',
    nonce: 'fixed-nonce',
    timestamp: 1_700_000_000
  };
  const first = createOAuthHeader(base);
  const second = createOAuthHeader(base);
  const changedQuery = createOAuthHeader({ ...base, url: `${base.url}&since_id=999` });
  assert.equal(first, second);
  assert.notEqual(first, changedQuery);
  assert.match(first, /^OAuth /);
  assert.match(first, /oauth_signature=/);
  assert.doesNotMatch(first, /secret|token-secret/);
});

test('X client uses the official API with OAuth user context and creates replies and polls', async () => {
  const calls = [];
  const client = createXClient({
    environment: TEST_X_ENV,
    nonceFactory: () => 'nonce',
    now: () => 1_700_000_000_000,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        async text() { return JSON.stringify({ data: { id: 'post-2', text: 'reply' } }); }
      };
    }
  });
  await client.createPost({ text: 'A safe reply', replyToId: 'post-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.x.com/2/tweets');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers.Authorization, /^OAuth /);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    text: 'A safe reply',
    reply: { in_reply_to_tweet_id: 'post-1' }
  });
  await client.createPost({
    text: 'Pick a build',
    poll: { options: ['Damage', 'Speed'], duration_minutes: 1_440 }
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    text: 'Pick a build',
    poll: { options: ['Damage', 'Speed'], duration_minutes: 1_440 }
  });
  await client.getOwnPosts('123');
  const timelineUrl = new URL(calls[2].url);
  assert.equal(timelineUrl.searchParams.get('expansions'), 'attachments.poll_ids');
  assert.match(timelineUrl.searchParams.get('tweet.fields'), /attachments/);
  assert.match(timelineUrl.searchParams.get('poll.fields'), /options/);
});

test('X client uploads an allowlisted image with alt text and attaches its media ID', async () => {
  const calls = [];
  const responses = [
    {
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'image/png' : name === 'content-length' ? '4' : null },
      async arrayBuffer() { return Uint8Array.from([1, 2, 3, 4]).buffer; }
    },
    {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ media_id_string: '1234567890' }); }
    },
    { ok: true, status: 200, async text() { return ''; } },
    {
      ok: true,
      status: 201,
      async text() { return JSON.stringify({ data: { id: 'post-with-media', text: 'Hangar update' } }); }
    }
  ];
  const client = createXClient({
    environment: TEST_X_ENV,
    nonceFactory: () => 'nonce',
    now: () => 1_700_000_000_000,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return responses.shift();
    }
  });

  const mediaId = await client.uploadImageFromUrl({
    sourceUrl: 'https://www.sciconshooter.xyz/social-assets/hangar.png',
    altText: 'Scicon Shooter Hangar showing the RSC ship and mini-ship slots.'
  });
  await client.createPost({ text: 'Hangar update', mediaIds: [mediaId] });

  assert.equal(mediaId, '1234567890');
  assert.equal(calls[1].url, X_MEDIA_UPLOAD_URL);
  assert.equal(calls[1].options.body instanceof FormData, true);
  assert.match(calls[1].options.headers.Authorization, /^OAuth /);
  assert.equal(calls[2].url, X_MEDIA_METADATA_URL);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    media_id: '1234567890',
    alt_text: { text: 'Scicon Shooter Hangar showing the RSC ship and mini-ship slots.' }
  });
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    text: 'Hangar update',
    media: { media_ids: ['1234567890'] }
  });
});

test('X client uploads an allowlisted MP4 through the bounded chunked workflow', async () => {
  const calls = [];
  const waits = [];
  const responses = [
    {
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'video/mp4' : name === 'content-length' ? '4' : null },
      async arrayBuffer() { return Uint8Array.from([1, 2, 3, 4]).buffer; }
    },
    { ok: true, status: 200, async text() { return JSON.stringify({ media_id_string: '2234567890' }); } },
    { ok: true, status: 204, async text() { return ''; } },
    {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ processing_info: { state: 'pending', check_after_secs: 1 } }); }
    },
    {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ processing_info: { state: 'succeeded' } }); }
    },
    { ok: true, status: 200, async text() { return ''; } },
    {
      ok: true,
      status: 201,
      async text() { return JSON.stringify({ data: { id: 'post-with-video', text: 'Boss run' } }); }
    }
  ];
  const client = createXClient({
    environment: TEST_X_ENV,
    nonceFactory: () => 'nonce',
    now: () => 1_700_000_000_000,
    sleep: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return responses.shift();
    }
  });

  const mediaId = await client.uploadVideoFromUrl({
    sourceUrl: 'https://www.sciconshooter.xyz/social-assets/gameplay.mp4',
    altText: 'Scicon Shooter gameplay showing a ship fighting through an arcade wave.'
  });
  await client.createPost({ text: 'Boss run', mediaIds: [mediaId] });

  assert.equal(mediaId, '2234567890');
  assert.deepEqual(waits, [1_000]);
  assert.equal(calls[1].url, X_MEDIA_UPLOAD_URL);
  assert.equal(calls[1].options.body.get('command'), 'INIT');
  assert.equal(calls[1].options.body.get('media_category'), 'tweet_video');
  assert.equal(calls[2].options.body.get('command'), 'APPEND');
  assert.equal(calls[2].options.body.get('segment_index'), '0');
  assert.equal(calls[2].options.body instanceof FormData, true);
  assert.equal(calls[3].options.body.get('command'), 'FINALIZE');
  assert.equal(new URL(calls[4].url).searchParams.get('command'), 'STATUS');
  assert.equal(calls[5].url, X_MEDIA_METADATA_URL);
  assert.deepEqual(JSON.parse(calls[6].options.body), {
    text: 'Boss run',
    media: { media_ids: ['2234567890'] }
  });
});

test('queue media accepts only bounded first-party images or one MP4 with alt text', () => {
  assert.deepEqual(readQueueMedia({ requires_media: false }), { ok: true, media: [] });
  assert.equal(readQueueMedia({
    requires_media: true,
    metadata: { media: { claims_audited: true, source_url: 'https://example.com/image.png', alt_text: 'Nope' } }
  }).reason, 'source_url');
  assert.equal(readQueueMedia({
    requires_media: true,
    metadata: { media: { claims_audited: true, source_url: 'https://www.sciconshooter.xyz/social-assets/hangar.png' } }
  }).reason, 'alt_text');
  assert.equal(readQueueMedia({
    requires_media: true,
    metadata: {
      media: {
        claims_audited: true,
        source_url: 'https://www.sciconshooter.xyz/social-assets/hangar.png',
        alt_text: 'Scicon Shooter Hangar'
      }
    }
  }).ok, true);
  assert.equal(readQueueMedia({
    requires_media: true,
    metadata: {
      media: {
        source_url: 'https://www.sciconshooter.xyz/social-assets/hangar.png',
        alt_text: 'Scicon Shooter Hangar'
      }
    }
  }).reason, 'image_claims');
  const video = readQueueMedia({
    requires_media: true,
    metadata: {
      media: {
        kind: 'video',
        claims_audited: true,
        source_url: 'https://www.sciconshooter.xyz/social-assets/gameplay.mp4',
        alt_text: 'Scicon Shooter gameplay'
      }
    }
  });
  assert.deepEqual(video, {
    ok: true,
    media: [{
      kind: 'video',
      sourceUrl: 'https://www.sciconshooter.xyz/social-assets/gameplay.mp4',
      altText: 'Scicon Shooter gameplay',
      claimsAudited: true
    }]
  });
  assert.equal(readQueueMedia({
    requires_media: true,
    metadata: {
      media: {
        kind: 'video',
        source_url: 'https://www.sciconshooter.xyz/social-assets/gameplay.mp4',
        alt_text: 'Scicon Shooter gameplay'
      }
    }
  }).reason, 'video_claims');
  assert.equal(readQueueMedia({
    requires_media: true,
    metadata: {
      media: [
        { kind: 'video', claims_audited: true, source_url: 'https://www.sciconshooter.xyz/social-assets/gameplay.mp4', alt_text: 'Gameplay' },
        { claims_audited: true, source_url: 'https://www.sciconshooter.xyz/social-assets/hangar.png', alt_text: 'Hangar' }
      ]
    }
  }).reason, 'video_count');
});

test('queued social screenshots are bounded PNG campaign assets', () => {
  const assetNames = [
    'scicon-home-hangar-upgrade-2026-08.png',
    'scicon-hangar-main-ships-2026-08.png',
    'scicon-hangar-mini-ships-2026-08.png',
    'scicon-boss-archive-lineup-2026-08.png'
  ];

  for (const assetName of assetNames) {
    const publicAsset = path.join(__dirname, '..', 'public', 'social-assets', assetName);
    const archiveAsset = path.join(__dirname, '..', 'marketing', 'campaign-assets', assetName);
    const publicBytes = fs.readFileSync(publicAsset);
    const archiveBytes = fs.readFileSync(archiveAsset);

    assert.deepEqual(publicBytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.ok(publicBytes.length > 0 && publicBytes.length <= 5 * 1024 * 1024);
    assert.deepEqual(publicBytes, archiveBytes);
  }
});

test('learning waits for enough samples and only reorders similarly prioritized content', () => {
  const actions = [1, 2, 3].map((index) => ({
    reason: 'upgrade',
    metadata: { latestMetrics: { impression_count: 100, like_count: index, reply_count: 1 } }
  }));
  const learning = buildLearningSummary(actions);
  assert.equal(learning[0].eligible, true);
  assert.equal(learning[0].samples, 3);
  const selected = chooseQueuedPost([
    { content_key: 'question', content_kind: 'question', priority: 20 },
    { content_key: 'upgrade', content_kind: 'upgrade', priority: 18 }
  ], learning);
  assert.equal(selected.content_key, 'upgrade');
  const protectedPriority = chooseQueuedPost([
    { content_key: 'question', content_kind: 'question', priority: 30 },
    { content_key: 'upgrade', content_kind: 'upgrade', priority: 18 }
  ], learning);
  assert.equal(protectedPriority.content_key, 'question');
});

test('conversion learning favors themes that produce real play after enough attributed sessions', () => {
  const actions = [
    {
      reason: 'upgrade',
      metadata: { contentKind: 'upgrade', campaignContent: 'hangar' }
    },
    {
      reason: 'challenge',
      metadata: { contentKind: 'challenge', campaignContent: 'beat-score' }
    }
  ];
  const campaignTouch = (sessionId, content, eventName = 'app_opened') => ({
    event_name: eventName,
    session_id: sessionId,
    properties: {
      campaign_source: 'x',
      campaign_medium: 'social',
      campaign_content: content
    }
  });
  const events = [
    campaignTouch('upgrade-1', 'hangar'),
    campaignTouch('upgrade-2', 'hangar'),
    campaignTouch('upgrade-3', 'hangar'),
    { event_name: 'mission_started', session_id: 'upgrade-1', properties: {} },
    campaignTouch('challenge-1', 'beat-score', 'desktop_launch_viewed'),
    campaignTouch('challenge-2', 'beat-score', 'desktop_launch_viewed'),
    campaignTouch('challenge-2', 'beat-score'),
    campaignTouch('challenge-3', 'beat-score'),
    { event_name: 'mission_started', session_id: 'challenge-1', properties: {} },
    { event_name: 'mission_started', session_id: 'challenge-2', properties: {} },
    { event_name: 'score_submitted', session_id: 'challenge-2', properties: {} },
    // Duplicate outcomes and owner tests must not inflate conversion evidence.
    { event_name: 'mission_started', session_id: 'challenge-2', properties: {} },
    campaignTouch('owner-1', 'beat-score'),
    { event_name: 'mission_started', session_id: 'owner-1', properties: { run_mode: 'owner-test' } },
    campaignTouch('unattributed-1', 'unknown')
  ];
  const learning = buildConversionLearningSummary(actions, events);
  assert.equal(learning[0].kind, 'challenge');
  assert.deepEqual(learning[0], {
    kind: 'challenge',
    attributedSessions: 3,
    missionStartedSessions: 2,
    scoreSubmittedSessions: 1,
    conversionScore: 4 / 3,
    eligible: true
  });
  assert.equal(learning[1].conversionScore, 1 / 3);

  const selected = chooseQueuedPost([
    { content_key: 'upgrade-next', content_kind: 'upgrade', priority: 30 },
    { content_key: 'challenge-next', content_kind: 'challenge', priority: 27 }
  ], [{ kind: 'upgrade', eligible: true }], learning);
  assert.equal(selected.content_key, 'challenge-next');

  const protectedPriority = chooseQueuedPost([
    { content_key: 'upgrade-now', content_kind: 'upgrade', priority: 40 },
    { content_key: 'challenge-later', content_kind: 'challenge', priority: 27 }
  ], [], learning);
  assert.equal(protectedPriority.content_key, 'upgrade-now');
});

test('conversion learning reads only bounded product-funnel events', async () => {
  const calls = [];
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  try {
    const store = createSocialStore({
      async fetchJson(path, options) {
        calls.push({ path, options });
        return [];
      }
    });
    await store.getProductEventsSince('2026-08-01T00:00:00.000Z', 99_999);
    assert.equal(calls.length, 1);
    assert.match(calls[0].path, /^scicon_product_events\?select=event_name,session_id,properties,occurred_at&/);
    assert.match(calls[0].path, /event_name=in\.\(app_opened,desktop_launch_viewed,mission_started,score_submitted\)/);
    assert.match(calls[0].path, /occurred_at=gte\.2026-08-01T00%3A00%3A00\.000Z/);
    assert.match(calls[0].path, /order=occurred_at\.desc/);
    assert.match(calls[0].path, /limit=5000$/);
  } finally {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('evergreen candidates cover two Pacific slots with verified bounded alternatives', () => {
  const entries = buildEvergreenCandidates({ startDateKey: '2026-08-31', days: 8 });
  assert.equal(entries.length, 42);
  assert.equal(new Set(entries.map((entry) => entry.content_key)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.metadata.campaign_content)).size, entries.length);
  assert.deepEqual(
    entries.slice(0, 3).map((entry) => entry.not_before),
    Array(3).fill('2026-08-31T16:00:00.000Z')
  );
  assert.deepEqual(entries.slice(0, 3).map((entry) => entry.priority), [10, 9, 8]);
  assert.deepEqual(
    entries.slice(3, 6).map((entry) => entry.not_before),
    Array(3).fill('2026-08-31T23:00:00.000Z')
  );
  assert.ok(entries.every((entry) => entry.metadata.claims_verified === true));
  assert.ok(entries.every((entry) => validateOriginalPost(`${entry.post_text}\n${entry.link_url}`).ok));
  assert.ok(entries.every((entry) => new Date(entry.not_after) > new Date(entry.not_before)));
  assert.ok(entries.some((entry) => entry.content_kind === 'community'));
  assert.equal(pacificDateTimeToUtc('2026-08-31', 9).toISOString(), '2026-08-31T16:00:00.000Z');
  assert.equal(pacificDateTimeToUtc('2026-11-02', 9).toISOString(), '2026-11-02T17:00:00.000Z');
});

test('evergreen variant selection covers every verified angle without correlated repetition', () => {
  const entries = buildEvergreenCandidates({ startDateKey: '2026-09-01', days: 14 });
  for (const theme of THEMES) {
    const variants = new Set(entries
      .filter((entry) => entry.content_kind === theme)
      .map((entry) => Number(entry.content_key.split(':').at(-1))));
    assert.deepEqual([...variants].sort(), [1, 2, 3, 4], `${theme} should use all four variants`);
  }
});

test('evergreen refill respects a healthy horizon and seeds only after a low horizon', async () => {
  const calls = { paused: 0, inserted: [] };
  const store = {
    async pauseExpiredQueuedPosts() { calls.paused += 1; return 2; },
    async getQueueHorizon() { return { not_before: '2026-08-31T23:00:00.000Z' }; },
    async insertQueuedPosts(entries) { calls.inserted = entries; return entries; }
  };
  const healthy = await ensureEvergreenQueue({
    store,
    now: new Date('2026-08-21T17:00:00.000Z')
  });
  assert.equal(healthy.reason, 'horizon_healthy');
  assert.equal(calls.inserted.length, 0);

  const refilled = await ensureEvergreenQueue({
    store,
    now: new Date('2026-08-29T17:00:00.000Z')
  });
  assert.equal(refilled.reason, 'refilled');
  assert.equal(refilled.startDateKey, '2026-09-01');
  assert.equal(refilled.inserted, calls.inserted.length);
  assert.ok(calls.inserted.length > 0);
  assert.ok(calls.inserted.every((entry) => entry.not_before >= '2026-09-01'));

  store.getQueueHorizon = async () => ({ not_before: '2026-09-01T16:00:00.000Z' });
  const partialDay = await ensureEvergreenQueue({
    store,
    now: new Date('2026-08-30T17:00:00.000Z')
  });
  assert.equal(partialDay.reason, 'refilled');
  assert.equal(partialDay.startDateKey, '2026-09-01');
  assert.equal(calls.inserted[0].not_before, '2026-09-01T23:00:00.000Z');
  assert.ok(calls.inserted.every((entry) => entry.not_before > '2026-09-01T16:00:00.000Z'));

  const disabled = await ensureEvergreenQueue({
    store,
    environment: { X_AGENT_EVERGREEN_ENABLED: 'false' },
    now: new Date('2026-08-29T17:00:00.000Z')
  });
  assert.equal(disabled.reason, 'disabled');
});

test('evergreen store operations stay service-only, bounded, and idempotent', async () => {
  const calls = [];
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  try {
    const store = createSocialStore({
      async fetchJson(path, options = {}) {
        calls.push({ path, options });
        if (options.method === 'POST') return JSON.parse(options.body);
        if (options.method === 'PATCH') return [{ content_key: 'expired' }];
        return [{ not_before: '2026-09-01T16:00:00.000Z', not_after: '2026-09-01T21:59:00.000Z' }];
      }
    });
    const horizon = await store.getQueueHorizon('2026-08-29T17:00:00.000Z');
    assert.equal(horizon.not_before, '2026-09-01T16:00:00.000Z');
    assert.match(calls[0].path, /status=eq\.queued/);
    assert.match(calls[0].path, /order=not_before\.desc/);

    const paused = await store.pauseExpiredQueuedPosts('2026-08-29T17:00:00.000Z');
    assert.equal(paused, 1);
    assert.equal(calls[1].options.method, 'PATCH');
    assert.match(calls[1].path, /not_after=lt\.2026-08-29T17%3A00%3A00\.000Z/);
    assert.deepEqual(JSON.parse(calls[1].options.body).status, 'paused');

    const candidate = buildEvergreenCandidates({ startDateKey: '2026-09-01', days: 1 })[0];
    const inserted = await store.insertQueuedPosts([candidate]);
    assert.equal(inserted.length, 1);
    assert.equal(calls[2].options.method, 'POST');
    assert.match(calls[2].path, /on_conflict=content_key/);
    assert.match(calls[2].options.headers.Prefer, /resolution=ignore-duplicates/);

    await store.markQueuedPostPaused('bad-post', { claims_verified: false }, 'claims_not_verified');
    assert.equal(calls[3].options.method, 'PATCH');
    assert.match(calls[3].path, /content_key=eq\.bad-post&status=eq\.queued/);
    assert.deepEqual(JSON.parse(calls[3].options.body).metadata.claims_verified, false);
    assert.equal(
      JSON.parse(calls[3].options.body).metadata.automation_pause_reason,
      'claims_not_verified'
    );
  } finally {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('metrics sync records public performance without mutating post content', async () => {
  const store = createMemoryStore();
  await store.reserveAction({
    idempotencyKey: 'queue:upgrade',
    actionType: 'original',
    reason: 'upgrade',
    status: 'published',
    metadata: { contentKind: 'upgrade' }
  });
  await store.updateAction('queue:upgrade', { x_post_id: 'post-1', published_at: '2026-08-06T15:00:00.000Z' });
  const result = await syncPublishedMetrics({
    client: {
      async getOwnPosts() {
        return {
          data: [{
            id: 'post-1',
            attachments: { poll_ids: ['poll-1'] },
            public_metrics: { impression_count: 200, like_count: 8, reply_count: 2 }
          }],
          includes: {
            polls: [{
              id: 'poll-1',
              duration_minutes: 1_440,
              end_datetime: '2026-08-27T23:00:00.000Z',
              voting_status: 'active',
              options: [
                { position: 1, label: 'Damage', votes: 7 },
                { position: 2, label: 'Speed', votes: 5 }
              ]
            }]
          }
        };
      }
    },
    store,
    environment: { X_ACCOUNT_USER_ID: 'scicon-id' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });
  assert.equal(result.updated, 1);
  assert.equal(store.actions.get('queue:upgrade').metadata.latestMetrics.impression_count, 200);
  assert.equal(store.actions.get('queue:upgrade').metadata.latestPoll.totalVotes, 12);
  assert.equal(store.actions.get('queue:upgrade').metadata.latestPoll.options[0].label, 'Damage');
  assert.equal(store.actions.get('queue:upgrade').metadata.engagementRate, 0.12);
  assert.equal(store.actions.get('queue:upgrade').content, null);
});

test('poll snapshots bound external labels and vote totals', () => {
  const snapshot = readPollSnapshot(
    { attachments: { poll_ids: ['poll-1'] } },
    new Map([['poll-1', {
      id: 'poll-1',
      voting_status: 'unexpected',
      options: [{ position: 1, label: 'x'.repeat(100), votes: -5 }]
    }]])
  );
  assert.equal(snapshot.votingStatus, 'unknown');
  assert.equal(snapshot.options[0].label.length, 25);
  assert.equal(snapshot.options[0].votes, 0);
  assert.equal(snapshot.totalVotes, 0);
});

test('policy routes sensitive support, ignores hostility, and validates X length rules', () => {
  assert.deepEqual(classifyMention('My wallet transaction did not go through'), {
    action: 'route_support',
    reason: 'sensitive_support'
  });
  assert.equal(classifyMention('fuck off bot').action, 'skip');
  assert.equal(classifyMention('I scored 42000 on wave 8').reason, 'score');
  assert.doesNotMatch(deterministicReply('score'), /(?:received|verified|winner|champion)/i);
  assert.match(deterministicReply('sensitive_support'), /Never send anyone a recovery phrase/);
  assert.equal(classifyMention('Where can I play?').reason, 'play_question');
  assert.equal(classifyMention('How do the RSC Funding Credits work?').reason, 'funding_question');
  assert.equal(classifyMention('When does the weekly leaderboard reset?').reason, 'competition_question');
  assert.match(deterministicReply('play_question'), /sciconshooter\.xyz/);
  assert.match(deterministicReply('funding_question'), /100 RSC Funding Credits/);
  assert.match(
    deterministicReply('sensitive_support', 'Was funding sent?'),
    /transaction evidence is verified/
  );
  assert.match(deterministicReply('feedback', 'The boss attack pattern felt broken'), /Which boss or attack/);
  assert.match(deterministicReply('feedback', 'Touch movement feels slow'), /device and control method/);
  assert.match(deterministicReply('feedback', 'The hangar ship upgrade is confusing'), /ship or loadout/);
  for (const reply of [
    deterministicReply('play_question'),
    deterministicReply('funding_question'),
    deterministicReply('competition_question'),
    deterministicReply('sensitive_support', 'Was funding sent?')
  ]) assert.equal(validateReply(reply).ok, true);
  assert.equal(weightedLength(`Go ${'https://example.com/'.repeat(1)}`), 26);
  assert.equal(validateReply('Send me your private key').ok, false);
  assert.equal(validateReply('Play https://www.sciconshooter.xyz/').ok, true);
  assert.equal(validateOriginalPost('Generic post https://example.com/').ok, false);
  assert.equal(isApprovedOfficialUrl('https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-archive'), true);
  assert.equal(validateOriginalPost('Play https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-archive').ok, true);
  assert.equal(isApprovedOfficialUrl('https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&redirect=https://example.com'), false);
  assert.equal(isApprovedOfficialUrl('https://www.sciconshooter.xyz.evil.example/?utm_source=x&utm_medium=social'), false);
  assert.equal(
    isApprovedResearchHubProposalUrl('https://www.researchhub.com/proposal/32342/precision-phenotyping'),
    true
  );
  assert.equal(
    isApprovedResearchHubProposalUrl('https://www.researchhub.com/post/32342/precision-phenotyping'),
    true
  );
  assert.equal(isApprovedResearchHubProposalUrl('https://www.researchhub.com/organization/example'), false);
  assert.equal(isApprovedResearchHubProposalUrl('https://researchhub.com/proposal/32342/example'), false);
});

test('reply model receives exact product facts and unverified-score boundaries', async () => {
  let requestBody = null;
  const result = await generateReply({
    mentionText: '@SciconShooter I won with 999999 points and funding was sent',
    reason: 'score',
    environment: { OPENAI_API_KEY: 'test-key', X_AGENT_MODEL: 'test-model' },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async text() {
          return JSON.stringify({ output_text: JSON.stringify({ action: 'skip', text: '', reason: 'unverified claim' }) });
        }
      };
    }
  });

  const systemPrompt = requestBody.input[0].content;
  assert.match(systemPrompt, /weekly top verified score/);
  assert.match(systemPrompt, /100 RSC Funding Credits/);
  assert.match(systemPrompt, /Do not treat a score, wave, win, player count, or funding status stated in the mention as verified/);
  assert.match(systemPrompt, /Proposal selection is separate from completed funding/);
  assert.deepEqual(result, { action: 'skip', text: '', reason: 'unverified claim' });
});

test('mention worker replies only to direct player contact and records idempotency', async () => {
  const store = createMemoryStore();
  const posts = [];
  const client = {
    async getMe() { return { id: 'scicon-id', username: 'SciconShooter' }; },
    async getMentions() {
      return {
        data: [
          {
            id: '101',
            author_id: 'pilot-1',
            conversation_id: '101',
            text: '@SciconShooter I scored 12000 on wave 4'
          },
          {
            id: '102',
            author_id: 'pilot-2',
            conversation_id: '102',
            text: 'Unrelated text without direct contact'
          }
        ],
        includes: { users: [{ id: 'pilot-1', username: 'pilotOne' }] }
      };
    },
    async createPost(input) {
      posts.push(input);
      return { id: `reply-${posts.length}`, text: input.text };
    }
  };
  const result = await processMentions({
    client,
    store,
    environment: { X_AGENT_MAX_REPLIES_PER_DAY: '3' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });
  assert.equal(result.published, 1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].replyToId, '101');
  assert.match(posts[0].text, /Which ship/);
  assert.equal(store.actions.get('mention:101').status, 'published');

  const repeated = await processMentions({
    client,
    store,
    environment: { X_AGENT_MAX_REPLIES_PER_DAY: '3' },
    now: new Date('2026-08-06T17:00:00.000Z')
  });
  assert.equal(repeated.published, 0);
  assert.equal(posts.length, 1);
});

test('queued original posts require verified claims and publish at most once', async () => {
  const queueEntry = {
    content_key: 'verified-upgrade',
    content_kind: 'upgrade',
    post_text: 'New ships and squad upgrades are live. Tell us what we should build next:',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    requires_media: false,
    metadata: { claims_verified: true, campaign_content: 'verified-upgrade' }
  };
  const store = createMemoryStore({ queuedPost: queueEntry });
  const posts = [];
  const client = {
    async createPost(input) { posts.push(input); return { id: 'queued-post', text: input.text }; }
  };
  const first = await processQueuedOriginal({
    client,
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });
  assert.equal(first.published, true);
  assert.equal(posts.length, 1);
  assert.equal(store.publishedContent.length, 1);
  assert.equal(store.actions.get('queue:verified-upgrade').metadata.campaignContent, 'verified-upgrade');
  assert.equal(store.actions.get('queue:verified-upgrade').metadata.learningSource, 'none');

  const second = await processQueuedOriginal({
    client,
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu' },
    now: new Date('2026-08-06T17:00:00.000Z')
  });
  assert.equal(second.published, false);
  assert.equal(posts.length, 1);
});

test('invalid or previously failed queue rows cannot starve the next verified post', async () => {
  const invalid = {
    content_key: 'invalid-high-priority',
    content_kind: 'upgrade',
    post_text: 'Unverified claim.',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    priority: 90,
    requires_media: false,
    metadata: { claims_verified: false }
  };
  const previouslyFailed = {
    content_key: 'failed-high-priority',
    content_kind: 'challenge',
    post_text: 'Previously failed challenge.',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    priority: 80,
    requires_media: false,
    metadata: { claims_verified: true }
  };
  const verified = {
    content_key: 'verified-fallback',
    content_kind: 'challenge',
    post_text: 'Beat this run and reply with your score:',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    priority: 70,
    requires_media: false,
    metadata: { claims_verified: true }
  };
  const store = createMemoryStore({ queuedPosts: [invalid, previouslyFailed, verified] });
  await store.reserveAction({
    idempotencyKey: 'queue:failed-high-priority',
    actionType: 'original',
    status: 'failed'
  });
  const posts = [];
  const result = await processQueuedOriginal({
    client: {
      async createPost(input) { posts.push(input); return { id: 'fallback-post', text: input.text }; }
    },
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu', X_AGENT_ORIGINAL_HOURS: '9' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });

  assert.equal(result.published, true);
  assert.equal(result.contentKey, 'verified-fallback');
  assert.equal(posts.length, 1);
  assert.deepEqual(store.pausedContent.map((entry) => entry.contentKey), [
    'invalid-high-priority',
    'failed-high-priority'
  ]);
  assert.equal(invalid.metadata.automation_pause_reason, 'claims_not_verified');
  assert.equal(previouslyFailed.metadata.automation_pause_reason, 'action_failed');
});

test('a publish failure pauses its queue row before surfacing the error', async () => {
  const queueEntry = {
    content_key: 'publish-failure',
    content_kind: 'challenge',
    post_text: 'Reply with your score:',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    priority: 50,
    requires_media: false,
    metadata: { claims_verified: true }
  };
  const store = createMemoryStore({ queuedPost: queueEntry });

  await assert.rejects(processQueuedOriginal({
    client: { async createPost() { throw new Error('temporary X outage'); } },
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu', X_AGENT_ORIGINAL_HOURS: '9' },
    now: new Date('2026-08-06T16:00:00.000Z')
  }), /temporary X outage/);
  assert.equal(queueEntry.status, 'paused');
  assert.match(queueEntry.metadata.automation_pause_reason, /^publish_failed:temporary X outage/);
  assert.equal(store.actions.get('queue:publish-failure').status, 'failed');
});

test('queued originals upload verified native media before publishing', async () => {
  const queueEntry = {
    content_key: 'verified-media-upgrade',
    content_kind: 'upgrade',
    post_text: 'The Hangar is open. Pick a ship and bring two mini-ships:',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    requires_media: true,
    metadata: {
      claims_verified: true,
      media: {
        claims_audited: true,
        source_url: 'https://www.sciconshooter.xyz/social-assets/hangar.png',
        alt_text: 'Scicon Shooter Hangar'
      }
    }
  };
  const store = createMemoryStore({ queuedPost: queueEntry });
  const uploads = [];
  const posts = [];
  const client = {
    async uploadImageFromUrl(input) { uploads.push(input); return '1234567890'; },
    async createPost(input) { posts.push(input); return { id: 'media-post', text: input.text }; }
  };
  const result = await processQueuedOriginal({
    client,
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu', X_AGENT_ORIGINAL_HOURS: '9' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });

  assert.equal(result.published, true);
  assert.equal(uploads.length, 1);
  assert.deepEqual(posts[0].mediaIds, ['1234567890']);
  assert.equal(store.actions.get('queue:verified-media-upgrade').metadata.nativeMediaCount, 1);
});

test('queued originals route one claim-audited video through native video upload', async () => {
  const queueEntry = {
    content_key: 'verified-demo-clip',
    content_kind: 'demo',
    post_text: 'One browser game. One weekly board. Put up a score:',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    requires_media: true,
    metadata: {
      claims_verified: true,
      media: {
        kind: 'video',
        claims_audited: true,
        source_url: 'https://www.sciconshooter.xyz/social-assets/current-demo.mp4',
        alt_text: 'Current Scicon Shooter product demo with verified feature claims.'
      }
    }
  };
  const store = createMemoryStore({ queuedPost: queueEntry });
  const uploads = [];
  const posts = [];
  const client = {
    async uploadVideoFromUrl(input) { uploads.push(input); return '2234567890'; },
    async createPost(input) { posts.push(input); return { id: 'video-post', text: input.text }; }
  };
  const result = await processQueuedOriginal({
    client,
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu', X_AGENT_ORIGINAL_HOURS: '9' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });

  assert.equal(result.published, true);
  assert.equal(uploads.length, 1);
  assert.deepEqual(posts[0].mediaIds, ['2234567890']);
  assert.equal(store.actions.get('queue:verified-demo-clip').metadata.nativeVideo, true);
});

test('original publication follows Pacific hours across daylight-saving boundaries', async () => {
  const queueEntry = {
    content_key: 'dst-safe-post',
    content_kind: 'challenge',
    post_text: 'DST-safe arcade challenge.',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    requires_media: false,
    metadata: { claims_verified: true }
  };
  const earlyStore = createMemoryStore({ queuedPost: { ...queueEntry } });
  const posts = [];
  const client = {
    async createPost(input) { posts.push(input); return { id: `post-${posts.length}`, text: input.text }; }
  };
  const early = await processQueuedOriginal({
    client,
    store: earlyStore,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Mon', X_AGENT_ORIGINAL_HOURS: '9,16' },
    now: new Date('2026-11-02T16:00:00.000Z')
  });
  assert.equal(early.reason, 'not_an_original_post_hour');
  assert.equal(posts.length, 0);

  const onTimeStore = createMemoryStore({ queuedPost: { ...queueEntry } });
  const onTime = await processQueuedOriginal({
    client,
    store: onTimeStore,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Mon', X_AGENT_ORIGINAL_HOURS: '9,16' },
    now: new Date('2026-11-02T17:00:00.000Z')
  });
  assert.equal(onTime.published, true);
  assert.equal(posts.length, 1);
});

test('original publication defaults to Monday through Saturday and reserves Sunday', async () => {
  const queueEntry = {
    content_key: 'default-cadence-post',
    content_kind: 'challenge',
    post_text: 'Default cadence arcade challenge.',
    link_url: 'https://www.sciconshooter.xyz/',
    status: 'queued',
    requires_media: false,
    metadata: { claims_verified: true }
  };
  const posts = [];
  const client = {
    async createPost(input) { posts.push(input); return { id: `post-${posts.length}`, text: input.text }; }
  };
  const friday = await processQueuedOriginal({
    client,
    store: createMemoryStore({ queuedPost: { ...queueEntry } }),
    environment: {},
    now: new Date('2026-08-21T23:00:00.000Z')
  });
  assert.equal(friday.published, true);

  const sunday = await processQueuedOriginal({
    client,
    store: createMemoryStore({ queuedPost: { ...queueEntry, content_key: 'sunday-post' } }),
    environment: {},
    now: new Date('2026-08-23T23:00:00.000Z')
  });
  assert.equal(sunday.reason, 'not_an_original_post_day');
  assert.equal(posts.length, 1);
});

test('weekly publication stays at 2:15 PM Pacific across daylight-saving boundaries', () => {
  const environment = { X_AGENT_WEEKLY_HOUR: '14', X_AGENT_WEEKLY_MINUTE: '15' };
  assert.equal(isWeeklyPostingWindow(environment, new Date('2026-08-23T21:15:00.000Z')), true);
  assert.equal(isWeeklyPostingWindow(environment, new Date('2026-08-23T22:15:00.000Z')), false);
  assert.equal(isWeeklyPostingWindow(environment, new Date('2026-11-08T21:15:00.000Z')), false);
  assert.equal(isWeeklyPostingWindow(environment, new Date('2026-11-08T22:15:00.000Z')), true);
  assert.equal(isWeeklyPostingWindow(environment, new Date('2026-11-09T22:15:00.000Z')), false);
});

test('queued polls require bounded unique options and publish through the audited original-post path', async () => {
  assert.deepEqual(readQueuePoll({ metadata: {} }), { ok: true, poll: null });
  assert.equal(readQueuePoll({ metadata: { poll: { options: ['Damage'], duration_minutes: 60 } } }).reason, 'option_count');
  assert.equal(readQueuePoll({ metadata: { poll: { options: ['Damage', 2], duration_minutes: 60 } } }).reason, 'option_type');
  assert.equal(readQueuePoll({ metadata: { poll: { options: ['Damage', 'damage'], duration_minutes: 60 } } }).reason, 'duplicate_options');
  assert.equal(readQueuePoll({ metadata: { poll: { options: ['Damage', 'Speed'], duration_minutes: 1 } } }).reason, 'duration');

  const queueEntry = {
    content_key: 'squad-poll',
    content_kind: 'gameplay',
    post_text: 'Squad draft. What are you optimizing?',
    link_url: null,
    status: 'queued',
    requires_media: false,
    metadata: {
      claims_verified: true,
      poll: { options: ['Damage', 'Speed', 'Survival', 'Maximum chaos'], duration_minutes: 1_440 }
    }
  };
  const store = createMemoryStore({ queuedPost: queueEntry });
  const posts = [];
  const client = {
    async createPost(input) { posts.push(input); return { id: 'poll-post', text: input.text }; }
  };
  const result = await processQueuedOriginal({
    client,
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Wed' },
    now: new Date('2026-08-26T23:00:00.000Z')
  });
  assert.equal(result.published, true);
  assert.deepEqual(posts[0].poll, queueEntry.metadata.poll);
  assert.deepEqual(store.actions.get('queue:squad-poll').metadata.poll, queueEntry.metadata.poll);
});

test('verified proposal spotlights require an explicit ResearchHub queue flag', async () => {
  const proposalUrl = 'https://www.researchhub.com/proposal/32342/precision-phenotyping';
  const baseEntry = {
    content_key: 'proposal-spotlight',
    content_kind: 'funding',
    post_text: 'A prior Scicon Shooter winner selected this proposal. Completed funding is not confirmed. What stands out?',
    link_url: proposalUrl,
    status: 'queued',
    requires_media: false,
    metadata: { claims_verified: true, funding_status_wording: 'selection_only' }
  };
  const blockedPosts = [];
  const blocked = await processQueuedOriginal({
    client: {
      async createPost(input) { blockedPosts.push(input); return { id: 'blocked', text: input.text }; }
    },
    store: createMemoryStore({ queuedPost: { ...baseEntry } }),
    environment: { X_AGENT_ORIGINAL_DAYS: 'Tue', X_AGENT_ORIGINAL_HOURS: '9' },
    now: new Date('2026-09-01T16:00:00.000Z')
  });
  assert.equal(blocked.reason, 'post_validation:unapproved_url');
  assert.equal(blockedPosts.length, 0);

  const allowedStore = createMemoryStore({
    queuedPost: {
      ...baseEntry,
      metadata: { ...baseEntry.metadata, allow_researchhub_proposal: true }
    }
  });
  const allowedPosts = [];
  const allowed = await processQueuedOriginal({
    client: {
      async createPost(input) { allowedPosts.push(input); return { id: 'proposal-post', text: input.text }; }
    },
    store: allowedStore,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Tue', X_AGENT_ORIGINAL_HOURS: '9' },
    now: new Date('2026-09-01T16:00:00.000Z')
  });
  assert.equal(allowed.published, true);
  assert.equal(allowedPosts.length, 1);
  assert.equal(allowedStore.actions.get('queue:proposal-spotlight').metadata.proposalSpotlight, true);
  assert.equal(allowedStore.actions.get('queue:proposal-spotlight').metadata.fundingStatus, 'selection_only');
});

test('weekly worker publishes a verified winner post and its direct score-challenge reply', async () => {
  const competition = {
    week_key: '2026-07-27',
    ends_at: '2026-08-02T19:00:00.000Z',
    status: 'claimed',
    winner_name: 'PILOT ONE',
    winning_score: 98_765,
    winning_wave: 9,
    proposal_id: '32342',
    proposal_url: 'https://www.researchhub.com/proposal/32342/precision-phenotyping',
    allocation_tx_hash: null
  };
  const store = createMemoryStore({ competition });
  const posts = [];
  const client = {
    async createPost(input) {
      posts.push(input);
      return { id: `weekly-${posts.length}`, text: input.text };
    }
  };
  const thread = buildWeeklyThread(competition);
  assert.equal(validateOriginalPost(thread.main, { allowResearchHubProposal: true }).ok, true);
  assert.equal(validateReply(thread.reply).ok, true);

  const result = await processWeeklyWinner({
    client,
    store,
    now: new Date('2026-08-03T20:00:00.000Z')
  });
  assert.equal(result.published, true);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].replyToId, 'weekly-1');
  assert.match(posts[0].text, /selected this proposal/);
  assert.doesNotMatch(posts[0].text, /funded|funding (?:was )?sent/i);
  assert.match(posts[1].text, /Think you can beat 98,765/);
  assert.equal(store.actions.get('weekly:2026-07-27:main').metadata.fundingStatus, 'selection_only');
});

test('weekly worker never publishes a preselected proposal before the champion signs its claim', async () => {
  const competition = {
    week_key: '2026-08-03',
    ends_at: '2026-08-09T19:00:00.000Z',
    status: 'finalized',
    winner_name: 'GUEST PILOT',
    winning_score: 12_345,
    winning_wave: 4,
    proposal_id: '32342',
    proposal_url: 'https://www.researchhub.com/proposal/32342/precision-phenotyping',
    allocation_tx_hash: null
  };
  const posts = [];
  const result = await processWeeklyWinner({
    client: {
      async createPost(input) { posts.push(input); return { id: 'must-not-post', text: input.text }; }
    },
    store: createMemoryStore({ competition }),
    now: new Date('2026-08-10T20:00:00.000Z')
  });

  assert.equal(result.published, false);
  assert.equal(result.reason, 'champion_claim_pending');
  assert.equal(buildWeeklyThread(competition), null);
  assert.equal(posts.length, 0);
});

test('global kill switch prevents all X and database activity', async () => {
  const result = await runSocialAgent({
    mode: 'all',
    environment: { X_AUTONOMY_ENABLED: 'false' },
    client: { createPost() { throw new Error('must not run'); } },
    store: { getAction() { throw new Error('must not run'); } }
  });
  assert.deepEqual(result, { enabled: false, mode: 'all', reason: 'kill_switch_disabled' });
});

test('deployment configuration keeps the worker private, scheduled, and disabled by default', () => {
  const root = path.resolve(__dirname, '..');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const environment = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const installMigration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20260806054000_install_social_agent.sql'),
    'utf8'
  );
  const hardeningMigration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20260806060000_harden_social_agent_tables.sql'),
    'utf8'
  );
  const taxonomyMigration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20260821103000_expand_social_content_taxonomy.sql'),
    'utf8'
  );
  const xClientSource = fs.readFileSync(path.join(root, 'api', '_lib', 'xApi.js'), 'utf8');

  const dailyCrons = vercel.crons.filter((entry) => entry.path === '/api/social-agent?mode=daily');
  assert.deepEqual(
    dailyCrons.map((entry) => entry.schedule).sort(),
    ['0 0 * * *', '0 16 * * *', '0 17 * * *', '0 23 * * *'].sort()
  );
  assert.deepEqual(
    vercel.crons
      .filter((entry) => entry.path === '/api/social-agent?mode=weekly')
      .map((entry) => entry.schedule)
      .sort(),
    ['15 21 * * 0', '15 22 * * 0'].sort()
  );
  assert.match(environment, /^X_AUTONOMY_ENABLED=false$/m);
  assert.match(installMigration, /alter table public\.scicon_social_actions enable row level security/i);
  assert.match(installMigration, /revoke all on table public\.scicon_social_actions from public, anon, authenticated/i);
  assert.match(installMigration, /grant select, insert, update, delete on table public\.scicon_social_actions to service_role/i);
  assert.match(hardeningMigration, /to service_role[\s\S]*using \(true\)[\s\S]*with check \(true\)/i);
  for (const kind of ['funding', 'competition', 'challenge', 'boss', 'loadout', 'progression', 'onboarding']) {
    assert.match(taxonomyMigration, new RegExp(`'${kind}'`));
  }
  assert.doesNotMatch(xClientSource, /\/likes|\/following|\/dm_conversations|\/retweets|DELETE/);
});
