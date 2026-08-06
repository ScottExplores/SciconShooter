const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');

const ACTIONS_TABLE = process.env.SUPABASE_SOCIAL_ACTIONS_TABLE || 'scicon_social_actions';
const CONTENT_TABLE = process.env.SUPABASE_SOCIAL_CONTENT_TABLE || 'scicon_social_content_queue';
const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';

const encode = (value) => encodeURIComponent(String(value));

const createSocialStore = ({ fetchJson = fetchSupabaseJson } = {}) => ({
  async getLatestProcessedMentionId() {
    const rows = await fetchJson(
      `${ACTIONS_TABLE}?select=source_post_id&source_post_id=not.is.null&order=source_post_id.desc&limit=1`,
      { headers: supabaseHeaders() }
    );
    return Array.isArray(rows) ? (rows[0]?.source_post_id || null) : null;
  },

  async countPublishedRepliesSince(sinceIso) {
    const rows = await fetchJson(
      `${ACTIONS_TABLE}?select=id&action_type=eq.reply&status=eq.published&published_at=gte.${encode(sinceIso)}`,
      { headers: supabaseHeaders({ Prefer: 'count=exact' }) }
    );
    return Array.isArray(rows) ? rows.length : 0;
  },

  async getAction(idempotencyKey) {
    const rows = await fetchJson(
      `${ACTIONS_TABLE}?select=*&idempotency_key=eq.${encode(idempotencyKey)}&limit=1`,
      { headers: supabaseHeaders() }
    );
    return Array.isArray(rows) ? (rows[0] || null) : null;
  },

  async reserveAction(action) {
    const rows = await fetchJson(`${ACTIONS_TABLE}?on_conflict=idempotency_key`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({
        idempotency_key: action.idempotencyKey,
        action_type: action.actionType,
        source_post_id: action.sourcePostId || null,
        source_author_id: action.sourceAuthorId || null,
        content: action.content || null,
        reason: action.reason || null,
        status: action.status || 'reserved',
        metadata: action.metadata || {}
      })
    });
    return Array.isArray(rows) ? (rows[0] || null) : null;
  },

  async updateAction(idempotencyKey, changes) {
    const rows = await fetchJson(`${ACTIONS_TABLE}?idempotency_key=eq.${encode(idempotencyKey)}`, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(changes)
    });
    return Array.isArray(rows) ? (rows[0] || null) : null;
  },

  async getQueuedPosts(nowIso, limit = 12) {
    const rows = await fetchJson([
      `${CONTENT_TABLE}?select=*`,
      'status=eq.queued',
      `not_before=lte.${encode(nowIso)}`,
      `or=${encode(`(not_after.is.null,not_after.gte.${nowIso})`)}`,
      'order=priority.desc,not_before.asc',
      `limit=${Math.max(1, Math.min(25, Number(limit) || 12))}`
    ].join('&'), { headers: supabaseHeaders() });
    return Array.isArray(rows) ? rows : [];
  },

  async getPublishedActionsSince(sinceIso) {
    const rows = await fetchJson([
      `${ACTIONS_TABLE}?select=idempotency_key,action_type,reason,x_post_id,published_at,metadata`,
      'status=eq.published',
      'x_post_id=not.is.null',
      `published_at=gte.${encode(sinceIso)}`,
      'order=published_at.desc',
      'limit=100'
    ].join('&'), { headers: supabaseHeaders() });
    return Array.isArray(rows) ? rows : [];
  },

  async markQueuedPostPublished(contentKey, actionId) {
    const rows = await fetchJson(`${CONTENT_TABLE}?content_key=eq.${encode(contentKey)}&status=eq.queued`, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        status: 'published',
        published_action_id: actionId || null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });
    return Array.isArray(rows) ? (rows[0] || null) : null;
  },

  async getLatestFinalizedCompetition() {
    const rows = await fetchJson([
      `${COMPETITIONS_TABLE}?select=*`,
      'status=in.(finalized,claimed,funded)',
      'order=ends_at.desc',
      'limit=1'
    ].join('&'), { headers: supabaseHeaders() });
    return Array.isArray(rows) ? (rows[0] || null) : null;
  }
});

module.exports = {
  ACTIONS_TABLE,
  CONTENT_TABLE,
  createSocialStore
};
