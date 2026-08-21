import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { buildQueuedPostText, readQueueMedia, readQueuePoll } = require('../api/_lib/socialAgent');
const { validateOriginalPost } = require('../api/_lib/socialAgentPolicy');

const DEFAULT_SINCE_HOURS = 24;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const objectValue = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const boundedText = (value, maximum = 120) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .trim()
  .slice(0, maximum);

const readSinceHours = (argv = process.argv.slice(2)) => {
  const argument = argv.find((value) => value.startsWith('--hours='));
  const hours = Number(argument?.split('=', 2)[1]);
  return Number.isFinite(hours) ? Math.max(1, Math.min(168, Math.floor(hours))) : DEFAULT_SINCE_HOURS;
};

const normalizeSupabaseOrigin = (value) => {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Social audit requires a valid HTTPS Supabase URL.');
  }
  return url.origin;
};

const fetchJson = async (url, { headers = {}, fetchImpl = fetch } = {}) => {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Social audit request failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('Social audit response exceeded its safety limit.');
  }
  const payload = JSON.parse(text);
  if (!Array.isArray(payload) && (!payload || typeof payload !== 'object')) {
    throw new Error('Social audit received an unexpected response.');
  }
  return payload;
};

const queueBlocker = (entry) => {
  if (entry?.metadata?.claims_verified !== true) return 'claims_not_verified';
  const poll = readQueuePoll(entry);
  if (!poll.ok) return `poll_validation:${poll.reason}`;
  const media = readQueueMedia(entry);
  if (!media.ok) return `media_validation:${media.reason}`;
  if (poll.poll && media.media.length > 0) return 'media_validation:poll_conflict';
  const post = validateOriginalPost(buildQueuedPostText(entry), {
    allowResearchHubProposal: entry?.metadata?.allow_researchhub_proposal === true
  });
  return post.ok ? '' : `post_validation:${post.reason}`;
};

export const buildSocialHealthSummary = ({
  queue = [],
  actions = [],
  events = [],
  leaderboard = {},
  checkedAt = new Date(),
  since = new Date(checkedAt.getTime() - DEFAULT_SINCE_HOURS * 3_600_000)
} = {}) => {
  const blockers = queue.map((entry) => ({
    contentKey: boundedText(entry?.content_key, 100),
    reason: queueBlocker(entry)
  })).filter((entry) => entry.reason);
  const actionStatuses = {};
  for (const action of actions) {
    const status = boundedText(action?.status, 24) || 'unknown';
    actionStatuses[status] = (actionStatuses[status] || 0) + 1;
  }
  const eventCounts = {};
  const sessions = new Set();
  const xSessions = new Set();
  for (const event of events) {
    const eventName = boundedText(event?.event_name, 48) || 'unknown';
    const sessionId = boundedText(event?.session_id, 100);
    const properties = objectValue(event?.properties);
    eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;
    if (sessionId) sessions.add(sessionId);
    if (
      sessionId
      && (properties.campaign_source === 'x' || properties.utm_source === 'x')
    ) xSessions.add(sessionId);
  }
  const weeklyScores = Array.isArray(leaderboard?.monthlyScores) ? leaderboard.monthlyScores : [];
  const leader = weeklyScores[0];
  return {
    checkedAt: checkedAt.toISOString(),
    since: since.toISOString(),
    queue: {
      queued: queue.length,
      blockers,
      mediaPosts: queue.filter((entry) => entry?.requires_media === true).length,
      proposalPosts: queue.filter((entry) => entry?.metadata?.allow_researchhub_proposal === true).length
    },
    actions: {
      total: actions.length,
      byStatus: actionStatuses
    },
    conversion: {
      sessions: sessions.size,
      xSessions: xSessions.size,
      eventCounts
    },
    weeklyLeaderboard: {
      entries: weeklyScores.length,
      leader: leader ? {
        name: boundedText(leader.name, 15),
        score: Math.max(0, Math.floor(Number(leader.score) || 0)),
        wave: Math.max(1, Math.floor(Number(leader.wave) || 1))
      } : null
    }
  };
};

export const readSocialHealth = async ({
  environment = process.env,
  now = new Date(),
  hours = DEFAULT_SINCE_HOURS,
  fetchImpl = fetch
} = {}) => {
  const origin = normalizeSupabaseOrigin(environment.SUPABASE_URL);
  const secretKey = String(
    environment.SUPABASE_SECRET_KEY
    || environment.SUPABASE_SERVICE_ROLE_KEY
    || environment.SUPABASE_SERVICE_KEY
    || ''
  ).trim();
  if (!secretKey || secretKey.startsWith('sb_publishable_')) {
    throw new Error('Social audit requires a server-side Supabase key.');
  }
  const safeHours = Math.max(1, Math.min(168, Math.floor(Number(hours) || DEFAULT_SINCE_HOURS)));
  const since = new Date(now.getTime() - safeHours * 3_600_000);
  const headers = { apikey: secretKey };
  if (!secretKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secretKey}`;
  const rest = `${origin}/rest/v1`;
  const [queue, actions, events, leaderboard] = await Promise.all([
    fetchJson(`${rest}/scicon_social_content_queue?select=*&status=eq.queued&order=priority.desc,not_before.asc&limit=100`, { headers, fetchImpl }),
    fetchJson(`${rest}/scicon_social_actions?select=status,reason,published_at,created_at&created_at=gte.${encodeURIComponent(since.toISOString())}&order=created_at.desc&limit=500`, { headers, fetchImpl }),
    fetchJson(`${rest}/scicon_product_events?select=event_name,session_id,properties,occurred_at&occurred_at=gte.${encodeURIComponent(since.toISOString())}&order=occurred_at.asc&limit=5000`, { headers, fetchImpl }),
    fetchJson('https://www.sciconshooter.xyz/api/leaderboard', { fetchImpl })
  ]);
  return buildSocialHealthSummary({ queue, actions, events, leaderboard, checkedAt: now, since });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  readSocialHealth({ hours: readSinceHours() })
    .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${boundedText(error?.message || error, 300)}\n`);
      process.exitCode = 1;
    });
}
