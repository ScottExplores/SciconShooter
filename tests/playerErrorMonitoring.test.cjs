const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

test('the app installs bounded global monitoring and a React recovery boundary before rendering', () => {
  const entry = read('index.tsx');
  const boundary = read('components', 'AppErrorBoundary.tsx');
  assert.match(entry, /installPlayerReportMonitoring\(\)/);
  assert.match(entry, /<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /capturePlayerRuntimeError/);
  assert.match(boundary, /this\.state\.reportId[\s\S]*bounded diagnostic report was queued for delivery/i);
  assert.doesNotMatch(boundary, /diagnostic report was saved automatically/i);
  assert.match(boundary, /Reload game/);
  assert.match(boundary, /reloadFromLastSafeState/);
  assert.doesNotMatch(boundary, /window\.location\.reload\(\)/);
});

test('flight lifecycle diagnostics cover launch, preload, first frame, wave, and disposal without frame-loop uploads', () => {
  const app = read('App.tsx');
  const canvas = read('components', 'GameCanvas.tsx');
  const service = read('services', 'playerReportService.ts');
  for (const eventName of [
    'launch_requested',
    'preload_started',
    'preload_ready',
    'preload_failed',
    'runtime_ready',
    'runtime_failed',
    'wave_started'
  ]) {
    assert.match(app, new RegExp(`['"]${eventName}['"]`));
  }
  for (const eventName of ['runtime_mounted', 'runtime_first_frame', 'runtime_disposed']) {
    assert.match(canvas, new RegExp(`['"]${eventName}['"]`));
  }
  assert.match(canvas, /if \(!previewMode\)/);
  assert.doesNotMatch(canvas, /fetch\(['"]\/api\/player-reports/);
  assert.match(service, /MAX_AUTOMATIC_REPORTS_PER_SESSION = 5/);
  assert.match(service, /AUTOMATIC_DEDUPE_WINDOW_MS = 60_000/);
});

test('privacy disclosure documents automatic diagnostics, redaction, and owner-only review', () => {
  const legal = read('components', 'StartScreen.tsx');
  const docs = read('docs', 'analytics-and-security.md');
  assert.match(legal, /bounded crash diagnostics/);
  assert.match(legal, /never intentionally include wallet addresses/);
  assert.match(docs, /npm run reports:list/);
  assert.match(docs, /raw IP is never stored or logged/i);
  assert.match(docs, /developer crash text is never proxied/i);
  assert.match(docs, /honors server `Retry-After`/);
  assert.match(docs, /untrusted player input/);
});
