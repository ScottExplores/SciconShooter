const test = require('node:test');
const assert = require('node:assert/strict');
const route = require('../api/_lib/playerReportsRoute');

const { validateReport, buildStoredProperties } = route._test;

const baseReport = (overrides = {}) => ({
  reportId: '11111111-1111-4111-8111-111111111111',
  kind: 'feedback',
  category: 'other',
  source: 'manual',
  summary: 'Love the bosses',
  sessionId: '22222222-2222-4222-8222-222222222222',
  gameVersion: '2.1.0',
  createdAt: '2026-10-29T02:00:00.000Z',
  ...overrides
});

test('optional contact, coarse browser, and hashed device id are stored; raw id is not', () => {
  const previous = process.env.RUN_RECEIPT_SECRET;
  process.env.RUN_RECEIPT_SECRET = 'test-secret';
  try {
    const report = validateReport(baseReport({
      contact: '@pilot',
      browser: 'Chrome / Android<script>',
      anonymousPlayerId: '33333333-3333-4333-8333-333333333333'
    }));
    const stored = buildStoredProperties(report, 'limiter');
    assert.equal(stored.contact, '@pilot');
    assert.equal(stored.browser, 'Chrome / Androidscript');
    assert.match(stored.visitor_hash, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(stored).includes('33333333-3333'));
    assert.equal(stored.email_notification.status, 'pending');
  } finally {
    if (previous === undefined) delete process.env.RUN_RECEIPT_SECRET;
    else process.env.RUN_RECEIPT_SECRET = previous;
  }
});

test('contact is length-capped and test reports are marked and never emailed', () => {
  assert.throws(() => validateReport(baseReport({ contact: 'x'.repeat(121) })));
  const report = validateReport(baseReport({ testReport: true }));
  const stored = buildStoredProperties(report, 'limiter');
  assert.equal(stored.test_run, true);
  assert.equal(stored.email_notification, undefined);
  assert.equal(stored.contact, undefined);
});

test('automatic crash reports ignore contact', () => {
  const report = validateReport(baseReport({
    kind: 'bug', category: 'crash', source: 'automatic', contact: 'me@example.com'
  }));
  assert.equal(report.contact, '');
});
