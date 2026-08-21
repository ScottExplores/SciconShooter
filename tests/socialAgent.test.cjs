const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createOAuthHeader, createXClient } = require('../api/_lib/xApi');
const {
  classifyMention,
  deterministicReply,
  isApprovedOfficialUrl,
  validateOriginalPost,
  validateReply,
  weightedLength
} = require('../api/_lib/socialAgentPolicy');
const {
  buildLearningSummary,
  buildWeeklyThread,
  chooseQueuedPost,
  processMentions,
  processQueuedOriginal,
  processWeeklyWinner,
  readQueuePoll,
  runSocialAgent,
  syncPublishedMetrics
} = require('../api/_lib/socialAgent');

const TEST_X_ENV = {
  X_API_KEY: 'api-key',
  X_API_SECRET: 'api-secret',
  X_ACCESS_TOKEN: 'access-token',
  X_ACCESS_TOKEN_SECRET: 'access-secret'
};

const createMemoryStore = ({ queuedPost, competition } = {}) => {
  const actions = new Map();
  return {
    actions,
    queuedPost,
    competition,
    publishedContent: [],
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
    async getQueuedPosts() { return this.queuedPost ? [this.queuedPost] : []; },
    async getPublishedActionsSince() {
      return [...actions.values()].filter((action) => action.status === 'published');
    },
    async markQueuedPostPublished(contentKey, actionId) {
      this.publishedContent.push({ contentKey, actionId });
      if (this.queuedPost?.content_key === contentKey) this.queuedPost.status = 'published';
      return this.queuedPost;
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
        return { data: [{ id: 'post-1', public_metrics: { impression_count: 200, like_count: 8, reply_count: 2 } }] };
      }
    },
    store,
    environment: { X_ACCOUNT_USER_ID: 'scicon-id' },
    now: new Date('2026-08-06T16:00:00.000Z')
  });
  assert.equal(result.updated, 1);
  assert.equal(store.actions.get('queue:upgrade').metadata.latestMetrics.impression_count, 200);
  assert.equal(store.actions.get('queue:upgrade').content, null);
});

test('policy routes sensitive support, ignores hostility, and validates X length rules', () => {
  assert.deepEqual(classifyMention('My wallet transaction did not go through'), {
    action: 'route_support',
    reason: 'sensitive_support'
  });
  assert.equal(classifyMention('fuck off bot').action, 'skip');
  assert.equal(classifyMention('I scored 42000 on wave 8').reason, 'score');
  assert.match(deterministicReply('sensitive_support'), /Never send anyone a recovery phrase/);
  assert.equal(weightedLength(`Go ${'https://example.com/'.repeat(1)}`), 26);
  assert.equal(validateReply('Send me your private key').ok, false);
  assert.equal(validateReply('Play https://www.sciconshooter.xyz/').ok, true);
  assert.equal(validateOriginalPost('Generic post https://example.com/').ok, false);
  assert.equal(isApprovedOfficialUrl('https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-archive'), true);
  assert.equal(validateOriginalPost('Play https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-archive').ok, true);
  assert.equal(isApprovedOfficialUrl('https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&redirect=https://example.com'), false);
  assert.equal(isApprovedOfficialUrl('https://www.sciconshooter.xyz.evil.example/?utm_source=x&utm_medium=social'), false);
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
    metadata: { claims_verified: true }
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

  const second = await processQueuedOriginal({
    client,
    store,
    environment: { X_AGENT_ORIGINAL_DAYS: 'Thu' },
    now: new Date('2026-08-06T17:00:00.000Z')
  });
  assert.equal(second.published, false);
  assert.equal(posts.length, 1);
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
  const xClientSource = fs.readFileSync(path.join(root, 'api', '_lib', 'xApi.js'), 'utf8');

  const dailyCrons = vercel.crons.filter((entry) => entry.path === '/api/social-agent?mode=daily');
  assert.deepEqual(dailyCrons.map((entry) => entry.schedule), ['0 16 * * *', '0 23 * * *']);
  assert.ok(vercel.crons.some((entry) => entry.path === '/api/social-agent?mode=weekly'));
  assert.match(environment, /^X_AUTONOMY_ENABLED=false$/m);
  assert.match(installMigration, /alter table public\.scicon_social_actions enable row level security/i);
  assert.match(installMigration, /revoke all on table public\.scicon_social_actions from public, anon, authenticated/i);
  assert.match(installMigration, /grant select, insert, update, delete on table public\.scicon_social_actions to service_role/i);
  assert.match(hardeningMigration, /to service_role[\s\S]*using \(true\)[\s\S]*with check \(true\)/i);
  assert.doesNotMatch(xClientSource, /\/likes|\/following|\/dm_conversations|\/retweets|DELETE/);
});
