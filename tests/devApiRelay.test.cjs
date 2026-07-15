const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viteConfig = fs.readFileSync(path.join(__dirname, '..', 'vite.config.ts'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('local development relays persistent APIs when server credentials are absent', () => {
  assert.match(viteConfig, /const useRemotePersistence = !hasLocalLeaderboardStorage \|\| !hasLocalReceiptSecret/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/leaderboard'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/run-receipts'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/player-runs'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/record-card'/);
  assert.doesNotMatch(viteConfig, /scicon-local-development-receipt-secret/);
});

test('the dev command loads an optional ignored environment file before Vite starts', () => {
  assert.match(packageJson.scripts.dev, /--env-file-if-exists=\.env\.local/);
  assert.match(packageJson.scripts.dev, /--use-system-ca/);
});
