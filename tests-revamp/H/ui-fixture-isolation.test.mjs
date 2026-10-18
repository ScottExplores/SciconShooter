import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, startStaticServer } from '../../tools-revamp/qa/server.mjs';
import { isolatedContext, launchChrome } from '../../tools-revamp/qa/browser.mjs';

const syntheticName = 'MMMMMMMMMMMMMMM';

// Use the Storage interface: QA storage is an in-memory implementation whose
// entries are deliberately not enumerable properties of the Storage object.
const readProfileStorage = page => page.evaluate(() => {
  const entries = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (/^(rh_player_stats(?::|$)|rh_highscore$|scicon_(?:weekly|permanent)_squad_v\d+:)/.test(key)) {
      entries[key] = localStorage.getItem(key);
    }
  }
  return entries;
});

test('built dist: UI fixtures remain unsaved after score entry and archive interaction', { timeout: 120000 }, async t => {
  const server = await startStaticServer({ dist: process.env.SCICON_QA_DIST || path.join(REPO_ROOT, 'dist') });
  let browser;
  let context;
  const cancel = () => { void browser?.close().catch(() => {}); void server.close(); };
  t.signal.addEventListener('abort', cancel, { once: true });
  try {
    browser = await launchChrome();
    context = await isolatedContext(browser, server.origin, 'mobile');
    await context.addInitScript(() => {
      // A real browser save remains separate from the disposable QA profile.
      window.__uiIsolationNativeStorage = window.localStorage;
      localStorage.setItem('scicon_pilot_profile_id', 'pilot:ui-isolation-native');
      localStorage.setItem('rh_player_stats:pilot:ui-isolation-native', JSON.stringify({
        highScore: 2468, totalCoins: 135, playerName: 'SAVED PILOT'
      }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`${server.origin}/?qa=1&uiAudit=1&seed=12345`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => Boolean(window.__sciconUIAudit), null, { timeout: 45000 });
    const original = await readProfileStorage(page);
    assert.ok(Object.keys(original).some(key => key.startsWith('rh_player_stats:pilot:')), 'the app must create a real guest profile before testing persistence');

    // Positive control: normal guest actions still save before a fixture starts.
    await page.getByRole('button', { name: 'Claim daily gift', exact: true }).click();
    await page.locator('.sci-daily-card.is-today button,button.sci-daily-card.is-today').filter({ visible: true }).first().click();
    await page.locator('.sci-reward-claim-celebration').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Close reward center', exact: true }).click();
    await page.locator('.sci-reward-center').waitFor({ state: 'hidden' });
    await page.waitForTimeout(250);
    const savedGuest = await readProfileStorage(page);
    const permanentKey = Object.keys(savedGuest).find(key => key.startsWith('scicon_permanent_squad_v'));
    assert.ok(permanentKey, 'claiming the gift must create a stored permanent profile');
    assert.notEqual(savedGuest[permanentKey], original[permanentKey], 'ordinary guest reward claims must remain persistent');

    await page.evaluate(() => window.__sciconUIAudit.present('weekly-score-entry'));
    await page.waitForFunction(name => document.querySelector('#pilot-score-name')?.value === name, syntheticName);
    assert.equal(await page.locator('#pilot-score-name').inputValue(), syntheticName, 'the synthetic value must actually reach the production input');
    await page.waitForTimeout(1000); // Includes the normal 650ms profile-sync debounce.
    assert.deepEqual(await readProfileStorage(page), savedGuest, 'synthetic name and finalized weekly state must not overwrite the saved guest');

    await page.evaluate(() => window.__sciconUIAudit.present('unlock-archive'));
    await page.getByRole('button', { name: /^Open Boss Archive/ }).filter({ visible: true }).first().click();
    await page.locator('[aria-labelledby="boss-archive-title"]').waitFor({ state: 'visible' });
    const skipReveal = page.getByRole('button', { name: /Skip reveal/ });
    if (await skipReveal.count()) await skipReveal.click();
    await page.locator('.boss-archive-intel[data-locked="false"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(1000);
    assert.deepEqual(await readProfileStorage(page), savedGuest, 'viewing/selecting the synthetic unlocked boss must not commit its unlock');

    const native = await page.evaluate(() => JSON.parse(window.__uiIsolationNativeStorage.getItem('rh_player_stats:pilot:ui-isolation-native')));
    assert.deepEqual(native, { highScore: 2468, totalCoins: 135, playerName: 'SAVED PILOT' }, 'the browser’s native player save must remain untouched');
    assert.ok(!(await readProfileStorage(page))[`rh_player_stats:pilot:ui-isolation-native`], 'QA must use a disposable guest profile, not the seeded native profile');
  } finally {
    t.signal.removeEventListener('abort', cancel);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server.close();
  }
});

test('UI fixture bridge excludes connected wallets and wallet autosync rejects synthetic state', async () => {
  const app = await readFile(path.join(REPO_ROOT, 'App.tsx'), 'utf8');
  assert.match(app, /useUIAuditBridge\([^,]*!activeWalletAddress\s*,/, 'connected-wallet profiles must not expose the fixture bridge');
  const syncStart = app.indexOf('let retryTimer: number | null = null;');
  assert.ok(syncStart >= 0, 'wallet autosync effect must be located');
  const syncEffect = app.slice(syncStart, app.indexOf('\n  useEffect(', syncStart));
  const guard = syncEffect.slice(0, syncEffect.indexOf('const snapshot: WalletProfileSnapshot'));
  assert.match(guard, /if\s*\(\s*uiAuditPresenting[\s\S]*?\) return undefined;/, 'synthetic presentation state must exit before constructing a wallet snapshot');
  assert.match(syncEffect, /\},\s*\[[\s\S]*?uiAuditPresenting[\s\S]*?\]\);/, 'entering fixture presentation must cancel pending autosync via effect cleanup');
});
