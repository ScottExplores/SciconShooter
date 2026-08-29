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
  assert.match(viteConfig, /proxyPublicApi\('\/api\/player-ship-access'/);
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

test('local product telemetry is accepted without storage or a production relay', () => {
  const eventsRouteStart = viteConfig.indexOf("mount('/api/events'");
  const eventsRouteEnd = viteConfig.indexOf("mount('/api/player-reports'", eventsRouteStart);
  assert.ok(eventsRouteStart >= 0 && eventsRouteEnd > eventsRouteStart);

  const eventsRoute = viteConfig.slice(eventsRouteStart, eventsRouteEnd);
  const localGuard = eventsRoute.indexOf("if (!req.query?.route)");
  const optionalRouteRelay = eventsRoute.indexOf("proxyPublicApi('/api/events'");
  assert.ok(localGuard >= 0, 'local product events need an explicit no-storage guard');
  assert.ok(optionalRouteRelay > localGuard, 'only routed non-product handlers may use remote persistence');
  assert.match(eventsRoute, /accepted: true, stored: false, environment: 'development'/);
  assert.match(eventsRoute, /res\.statusCode = 202/);
  assert.match(eventsRoute, /return;[\s\S]*proxyPublicApi\('\/api\/events'/);
});

test('player reports share the events Vercel function and keep the Hobby function budget', () => {
  const apiFunctions = fs.readdirSync(path.join(__dirname, '..', 'api'))
    .filter((name) => name.endsWith('.js'));

  assert.match(eventsApi, /const playerReportsHandler = require\('\.\/_lib\/playerReportsRoute'\)/);
  assert.match(eventsApi, /req\.query\?\.route === 'player-reports'/);
  assert.match(eventsApi, /req\.query\?\.route === 'social-agent'/);
  assert.match(
    vercelConfig,
    /"source": "\/api\/player-reports"[\s\S]*?"destination": "\/api\/events\?route=player-reports"/
  );
  assert.match(
    vercelConfig,
    /"source": "\/api\/social-agent"[\s\S]*?"destination": "\/api\/events\?route=social-agent"/
  );
  assert.equal(apiFunctions.length, 12, 'Vercel Hobby allows at most 12 top-level functions');
});

test('the dev command loads an optional ignored environment file before Vite starts', () => {
  assert.match(packageJson.scripts.dev, /--env-file-if-exists=\.env\.local/);
  assert.match(packageJson.scripts.dev, /--use-system-ca/);
});
