const test = require('node:test');
const assert = require('node:assert/strict');

test('social health summary reports blockers and aggregate conversion without session identifiers', async () => {
  const { buildSocialHealthSummary } = await import('../tools/social-health-audit.mjs');
  const summary = buildSocialHealthSummary({
    checkedAt: new Date('2026-08-21T20:00:00.000Z'),
    since: new Date('2026-08-21T19:00:00.000Z'),
    queue: [
      {
        content_key: 'verified',
        post_text: 'Reply with your score:',
        link_url: 'https://www.sciconshooter.xyz/',
        not_before: '2026-08-21T20:15:00.000Z',
        not_after: '2026-08-21T20:45:00.000Z',
        requires_media: false,
        metadata: { claims_verified: true }
      },
      {
        content_key: 'blocked',
        post_text: 'Unsupported claim.',
        not_before: '2026-08-21T20:15:00.000Z',
        not_after: '2026-08-21T20:45:00.000Z',
        requires_media: false,
        metadata: { claims_verified: false }
      }
    ],
    actions: [{ status: 'published' }, { status: 'failed' }],
    events: [
      {
        event_name: 'app_opened',
        session_id: 'secret-session',
        properties: {
          campaign_source: 'x',
          campaign_medium: 'social',
          campaign_content: 'score-challenge'
        }
      },
      { event_name: 'mission_started', session_id: 'secret-session', properties: {} },
      { event_name: 'score_submitted', session_id: 'secret-session', properties: {} },
      {
        event_name: 'app_opened',
        session_id: 'owner-session',
        properties: {
          campaign_source: 'x',
          campaign_medium: 'social',
          campaign_content: 'score-challenge',
          owner_test: true
        }
      }
    ],
    leaderboard: { monthlyScores: [{ name: 'PILOT', score: 1234, wave: 3 }] }
  });

  assert.equal(summary.queue.queued, 2);
  assert.deepEqual(summary.queue.blockers, [{ contentKey: 'blocked', reason: 'claims_not_verified' }]);
  assert.deepEqual(summary.actions.byStatus, { published: 1, failed: 1 });
  assert.equal(summary.conversion.sessions, 1);
  assert.equal(summary.conversion.xSessions, 1);
  assert.deepEqual(summary.conversion.campaigns, [{
    content: 'score-challenge',
    attributedSessions: 1,
    missionStartedSessions: 1,
    scoreSubmittedSessions: 1
  }]);
  assert.equal(summary.weeklyLeaderboard.leader.score, 1234);
  assert.doesNotMatch(JSON.stringify(summary), /secret-session/);
});

test('social health summary rejects unbounded, inverted, and expired queue windows', async () => {
  const { buildSocialHealthSummary } = await import('../tools/social-health-audit.mjs');
  const baseEntry = {
    post_text: 'Reply with your score:',
    link_url: 'https://www.sciconshooter.xyz/',
    requires_media: false,
    metadata: { claims_verified: true }
  };
  const summary = buildSocialHealthSummary({
    checkedAt: new Date('2026-08-21T20:00:00.000Z'),
    queue: [
      {
        ...baseEntry,
        content_key: 'unbounded',
        not_before: '2026-08-21T20:15:00.000Z',
        not_after: null
      },
      {
        ...baseEntry,
        content_key: 'inverted',
        not_before: '2026-08-21T21:00:00.000Z',
        not_after: '2026-08-21T20:30:00.000Z'
      },
      {
        ...baseEntry,
        content_key: 'expired',
        not_before: '2026-08-21T18:00:00.000Z',
        not_after: '2026-08-21T19:00:00.000Z'
      }
    ]
  });

  assert.deepEqual(summary.queue.blockers, [
    { contentKey: 'unbounded', reason: 'schedule_window:invalid_not_after' },
    { contentKey: 'inverted', reason: 'schedule_window:inverted' },
    { contentKey: 'expired', reason: 'schedule_window:expired' }
  ]);
});

test('social health audit verifies queued media response type and bounded length', async () => {
  const { checkQueueMediaSources } = await import('../tools/social-health-audit.mjs');
  const queue = [
    {
      content_key: 'live-image',
      requires_media: true,
      metadata: {
        media: {
          source_url: 'https://www.sciconshooter.xyz/social-assets/live.png',
          alt_text: 'Current game screen'
        }
      }
    },
    {
      content_key: 'stale-video',
      requires_media: true,
      metadata: {
        media: {
          kind: 'video',
          claims_audited: true,
          source_url: 'https://www.sciconshooter.xyz/social-assets/stale.mp4',
          alt_text: 'Current product demo'
        }
      }
    }
  ];
  const blockers = await checkQueueMediaSources(queue, {
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'HEAD');
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            if (name === 'content-type') return String(url).endsWith('.mp4') ? 'text/html; charset=utf-8' : 'image/png';
            if (name === 'content-length') return String(url).endsWith('.mp4') ? '1000' : '2000';
            return null;
          }
        }
      };
    }
  });

  assert.deepEqual(blockers, [{ contentKey: 'stale-video', reason: 'media_source:content_type' }]);
});
