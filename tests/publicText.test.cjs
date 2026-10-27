const test = require('node:test');
const assert = require('node:assert/strict');
const { getClientAddress } = require('../api/_lib/rateLimit');
const { sanitizePilotName, sanitizeSearchQuery } = require('../shared/publicText.cjs');

test('search text drops controls and markup and keeps a bounded length', () => {
  assert.equal(sanitizeSearchQuery('  Airborne\n<script>Disease'), '  AirbornescriptDisease');
  assert.doesNotMatch(sanitizeSearchQuery('  Airborne\n<script>Disease'), /[<>\n]/);
  assert.equal(sanitizeSearchQuery('x'.repeat(200)).length, 80);
  assert.equal(sanitizePilotName(' ada\u0000<script> '), 'ADASCRIPT');
  assert.equal(sanitizePilotName('\n<>'), undefined);
});

test('rate limits trust the platform address ahead of a spoofed forward list', () => {
  assert.equal(getClientAddress({
    headers: {
      'x-forwarded-for': '198.51.100.9, 203.0.113.4',
      'x-vercel-forwarded-for': '203.0.113.8'
    },
    socket: { remoteAddress: '10.0.0.1' }
  }), '203.0.113.8');
  assert.equal(getClientAddress({
    headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.4' },
    socket: { remoteAddress: '10.0.0.1' }
  }), '203.0.113.4');
});
