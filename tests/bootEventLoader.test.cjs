const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'components/event-loading-screen.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

test('boot shell inlines the current event loader styles verbatim', () => {
  const match = html.match(/boot-event-loader:start[^\n]*\n([\s\S]*?)\n\s*\/\* boot-event-loader:end \*\//);
  assert.ok(match, 'inline event loader css block missing');
  assert.equal(match[1].trim(), css.trim(), 'index.html copy of event-loading-screen.css is out of date');
});

test('boot shell paints the event loader before JS and keeps the old shell hidden', () => {
  const rootStart = html.indexOf('<div id="root">');
  assert.ok(html.indexOf('id="sci-boot-event"', rootStart) > rootStart);
  assert.match(html, /id="sci-boot-standard"\s+hidden/);
  assert.match(html, /serviceWorker\?\.getRegistrations/);
});

test('React loaders use the event presentation without waiting on decode', () => {
  assert.doesNotMatch(app, /eventLoadingScreen && eventSplashReady/);
  assert.equal((app.match(/presentation=\{eventLoadingScreen \? 'event' : 'standard'\}/g) || []).length, 2);
});
