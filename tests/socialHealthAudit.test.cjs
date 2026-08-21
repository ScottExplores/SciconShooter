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
        requires_media: false,
        metadata: { claims_verified: true }
      },
      {
        content_key: 'blocked',
        post_text: 'Unsupported claim.',
        requires_media: false,
        metadata: { claims_verified: false }
      }
    ],
    actions: [{ status: 'published' }, { status: 'failed' }],
    events: [
      { event_name: 'app_opened', session_id: 'secret-session', properties: { campaign_source: 'x' } },
      { event_name: 'mission_started', session_id: 'secret-session', properties: {} }
    ],
    leaderboard: { monthlyScores: [{ name: 'PILOT', score: 1234, wave: 3 }] }
  });

  assert.equal(summary.queue.queued, 2);
  assert.deepEqual(summary.queue.blockers, [{ contentKey: 'blocked', reason: 'claims_not_verified' }]);
  assert.deepEqual(summary.actions.byStatus, { published: 1, failed: 1 });
  assert.equal(summary.conversion.sessions, 1);
  assert.equal(summary.conversion.xSessions, 1);
  assert.equal(summary.weeklyLeaderboard.leader.score, 1234);
  assert.doesNotMatch(JSON.stringify(summary), /secret-session/);
});
