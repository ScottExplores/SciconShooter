const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getPublicPrizeState, SCICON_BIG_EVENT } = require('../shared/weeklyCompetitionBoundary.js');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the Umbra loading screen follows the 25K event window and the existing load timing', () => {
  const closesAt = new Date(SCICON_BIG_EVENT.closesAt);

  assert.equal(getPublicPrizeState(new Date('2026-10-27T15:00:00.000Z')).phase, 'big-event');
  assert.equal(getPublicPrizeState(new Date(closesAt.getTime() - 1)).phase, 'big-event');
  assert.notEqual(getPublicPrizeState(closesAt).phase, 'big-event');
  assert.notEqual(getPublicPrizeState(new Date('2026-12-07T20:00:00.000Z')).phase, 'big-event');
  assert.notEqual(getPublicPrizeState(new Date('2026-10-25T12:00:00.000Z')).phase, 'big-event');

  const app = read('App.tsx');
  const screen = read('components/MissionLoadingScreen.tsx');
  const styles = read('components/event-loading-screen.css');
  const startup = read('services/startupPreload.ts');
  const entry = read('index.tsx');
  const art = read('services/eventLoadingArt.ts');
  const html = read('index.html');
  const splashUrls = [
    '/game-art/generated/ui/scicon-mission-loading-v1/loading-emblem.png',
    '/game-art/generated/ui/scicon-mission-loading-v1/loading-bar-frame.png',
    '/game-art/generated/bosses/campaign-packages/umbra-needlewing/assembled.png',
    '/game-art/branding/researchhub-ship.png',
    '/game-art/branding/bio-ship.png',
    '/game-art/branding/nih-ship.png',
    '/game-art/branding/eth-ship.png',
    '/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png',
    '/game-art/generated/ui/scicon-mission-loading-v1/loading-background.png'
  ];

  assert.match(app, /const eventLoadingScreen = getPublicPrizeState\(\)\.phase === 'big-event'/);
  assert.equal(app.match(/presentation=\{eventLoadingScreen \? 'event' : 'standard'\}/g)?.length, 2);
  assert.match(app, /const STARTUP_LOADING_MINIMUM_MS = 650/);
  assert.match(app, /const STARTUP_LOADING_READY_HOLD_MS = 180/);
  assert.match(app, /EVENT_LOADING_ART_EXTRA_WAIT_MS/);
  assert.match(app, /Promise\.race\(\[\s*splashPromise/);
  assert.match(app, /preloadEventLoadingArt\(\)/);
  const startupBody = app.slice(app.indexOf('const finishStartup'), app.indexOf('void finishStartup'));
  assert.ok(startupBody.indexOf('preloadEventLoadingArt') < startupBody.indexOf('preloadStartupAssets'));
  assert.doesNotMatch(app, /EVENT_LOADING_MINIMUM|eventLoadingMinimum/);
  assert.doesNotMatch(entry, /event-loader=|EventLoadingMockup|helios-clawcarrier/);
  assert.match(entry, /getPublicPrizeState\(\)\.phase === 'big-event'/);
  assert.match(entry, /preloadEventLoadingArt\(\)/);
  assert.doesNotMatch(screen, /helios-clawcarrier|event-loader=/);
  assert.match(screen, /presentation === 'event' && !hasError/);
  assert.match(art, /umbra-needlewing\/assembled\.png/);
  assert.match(art, /nih-ship\.png/);
  assert.match(screen, /EVENT_LOADING_BOSS/);
  assert.match(screen, /EVENT_LOADING_SHIPS/);
  assert.match(screen, /25,000 <span>RSC<\/span>/);
  assert.match(screen, /Ends Nov 29/);
  assert.match(screen, /Play Campaign first to upgrade your ship\./);
  assert.match(screen, /data-event-loading-progress=\{safeProgress\}>\{safeProgress\}%/);
  assert.match(screen, /style=\{\{ width: `\$\{safeProgress\}%` \}\}/);
  assert.match(styles, /\.sci-event-loader__progress-track\s*\{[^}]*z-index:\s*4/);
  assert.match(styles, /\.sci-event-loader__progress > img\s*\{[^}]*z-index:\s*2/);
  assert.doesNotMatch(styles, /@keyframes sci-event-loader-fill/);
  assert.doesNotMatch(startup, /umbra-needlewing|nih-ship\.png|event-loading-screen/);
  assert.match(art, /EVENT_LOADING_ART_EXTRA_WAIT_MS = 1000/);
  assert.match(art, /fetchPriority = 'high'/);
  assert.match(html, new RegExp(SCICON_BIG_EVENT.startsAt));
  assert.match(html, new RegExp(SCICON_BIG_EVENT.closesAt));
  assert.match(html, /if \(!\(now >= startsAt && now < closesAt\)\) return;/);
  assert.match(html, /setAttribute\('fetchpriority', 'high'\)/);
  for (const url of splashUrls) {
    assert.match(art, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const htmlUrls = html.slice(html.indexOf('var urls = ['), html.indexOf('];', html.indexOf('var urls = [')));
  const backgroundAt = htmlUrls.indexOf('loading-background.png');
  const emblemAt = htmlUrls.indexOf('loading-emblem.png');
  assert.ok(emblemAt >= 0 && backgroundAt > emblemAt);
});
