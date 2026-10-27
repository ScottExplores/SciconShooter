const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('event loading mockup stays off unless the preview query names a variant', async () => {
  const { eventLoaderVariant } = await import('../services/gameplay/eventLoaderFlag.mjs');
  assert.equal(eventLoaderVariant(''), null);
  assert.equal(eventLoaderVariant('?view=home'), null);
  assert.equal(eventLoaderVariant('?event-loader'), null);
  assert.equal(eventLoaderVariant('?event-loader='), null);
  assert.equal(eventLoaderVariant('?event-loader=on'), null);
  assert.equal(eventLoaderVariant('?event-loader=umbra'), 'umbra');
  assert.equal(eventLoaderVariant('?event-loader=helios'), 'helios');
  assert.equal(eventLoaderVariant('?display=mobile-frame&event-loader=umbra'), 'umbra');
});

test('the event loading mockup replaces the app only behind its query flag', () => {
  const entry = read('index.tsx');
  const screen = read('components/EventLoadingMockup.tsx');
  assert.match(entry, /eventLoaderVariant\(window\.location\.search\)/);
  assert.match(entry, /eventLoaderVariantId && EventLoadingMockup/);
  assert.match(entry, /<DesktopMobileLaunchShell>[\s\S]*?<AppProviders>[\s\S]*?<App \/>/);
  assert.doesNotMatch(entry, /25,000 RSC|Ends Nov 29/);
  assert.match(screen, /25,000 <span>RSC<\/span>/);
  assert.match(screen, /25K High Score/);
  assert.match(screen, /Ends Nov 29/);
  assert.match(screen, /Play Campaign first to upgrade your ship\./);
  assert.match(screen, /umbra-needlewing\/assembled\.png/);
  assert.match(screen, /helios-clawcarrier\/assembled\.png/);
  assert.match(screen, /nih-ship\.png/);
  assert.doesNotMatch(screen, /<button/);
});
