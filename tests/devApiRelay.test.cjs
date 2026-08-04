const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viteConfig = fs.readFileSync(path.join(__dirname, '..', 'vite.config.ts'), 'utf8');
const eventsApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'events.js'), 'utf8');
const vercelConfig = fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('local development relays persistent APIs when server credentials are absent', () => {
  assert.match(viteConfig, /const useRemotePersistence = !hasLocalLeaderboardStorage \|\| !hasLocalReceiptSecret/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/leaderboard'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/run-receipts'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/player-runs'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/wallet-purchases'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/continue-payments'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/wallet-token-spends'/);
  assert.match(viteConfig, /proxyPublicApi\('\/api\/record-card'/);
  assert.match(viteConfig, /const playerReportsHandler = require\('\.\/api\/_lib\/playerReportsRoute\.js'\)/);
  const reportRouteStart = viteConfig.indexOf("mount('/api/player-reports'");
  const reportRouteEnd = viteConfig.indexOf("mount('/api/run-claims'", reportRouteStart);
  assert.ok(reportRouteStart >= 0 && reportRouteEnd > reportRouteStart);
  const reportRoute = viteConfig.slice(reportRouteStart, reportRouteEnd);
  assert.match(reportRoute, /return playerReportsHandler\(req, res\)/);
  assert.doesNotMatch(reportRoute, /proxyPublicApi/);
  assert.doesNotMatch(viteConfig, /scicon-local-development-receipt-secret/);
});

test('player reports share the events Vercel function and keep the Hobby function budget', () => {
  const apiFunctions = fs.readdirSync(path.join(__dirname, '..', 'api'))
    .filter((name) => name.endsWith('.js'));

  assert.match(eventsApi, /const playerReportsHandler = require\('\.\/_lib\/playerReportsRoute'\)/);
  assert.match(eventsApi, /req\.query\?\.route === 'player-reports'/);
  assert.match(
    vercelConfig,
    /"source": "\/api\/player-reports"[\s\S]*?"destination": "\/api\/events\?route=player-reports"/
  );
  assert.equal(apiFunctions.length, 12, 'Vercel Hobby allows at most 12 top-level functions');
});

test('the dev command loads an optional ignored environment file before Vite starts', () => {
  assert.match(packageJson.scripts.dev, /--env-file-if-exists=\.env\.local/);
  assert.match(packageJson.scripts.dev, /--use-system-ca/);
});
