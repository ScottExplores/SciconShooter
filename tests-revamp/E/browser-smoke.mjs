// Run after VITE_PREVIEW_MODE=true npx vite build and serving dist locally.
// All API data is synthetic; external traffic is blocked, including telemetry.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getWeeklyBoundaryMeta } = require('../../shared/weeklyCompetitionBoundary.js');
const boundary = getWeeklyBoundaryMeta();
const base = process.env.E_SMOKE_URL || 'http://127.0.0.1:5197';
const output = process.env.E_SMOKE_OUTPUT || '/tmp/revamp-E-browser';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('tests-revamp/E/fixtures/funding_feed.json', 'utf8'));
for (const row of fixture.results) row.content_object.fundraise.end_date = new Date(+boundary.endsAt + 14 * 86400000).toISOString();
const scores = Array.from({ length: 7 }, (_, i) => ({ name: ['VEGA', 'ORBIT', 'NOVA', 'SCOTT', 'QUARK', 'LUMEN', 'EXPLORER'][i], score: 10000 - i * 620, wave: 10 - i, date: new Date(+boundary.startsAt + (i + 1) * 60000).toISOString(), runId: `10000000-0000-4000-8000-00000000000${i}`, verified: true }));
const previous = getWeeklyBoundaryMeta(+boundary.startsAt - 1000).weekKey;
const browser = await chromium.launch({ executablePath: process.env.E_CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 1000 }]]) {
    if (process.env.E_SMOKE_DEVICE && process.env.E_SMOKE_DEVICE !== label) continue;
    const context = await browser.newContext({ viewport, deviceScaleFactor: label === 'mobile' ? 2 : 1, isMobile: label === 'mobile', hasTouch: label === 'mobile', reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('scicon:onboarding:v4:guest', JSON.stringify({ version: 4, profileId: 'guest', decision: 'skipped', completedStepIds: [] }));
    });
    let offline = false;
    const writes = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET') { writes.push(url.pathname); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"PREVIEW_READ_ONLY"}' }); }
      if (url.pathname === '/api/researchhub-proposals') return offline ? route.abort() : route.fulfill({ json: { ...fixture, fetchedAt: new Date().toISOString() } });
      if (url.pathname === '/api/leaderboard') return route.fulfill({ json: url.searchParams.has('weekKey') ? { weekKey: url.searchParams.get('weekKey'), weekScores: scores } : { scores, monthlyScores: scores } });
      if (url.pathname === '/api/weekly-competitions') return route.fulfill({ json: { competitions: [], completedWeekKeys: [previous] } });
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.log('page error:', error.message); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    if (label === 'desktop') await page.getByRole('button', { name: 'Start Browser Run' }).click();
    const surface = label === 'desktop' ? page.frameLocator('[data-testid=desktop-mobile-game-frame]') : page;
    await surface.getByText('TEST BUILD — scores not submitted', { exact: true }).waitFor({ timeout: 60000 }).catch(async (error) => { await page.screenshot({ path: `${output}/${label}-failure.png` }); console.log(await page.locator('body').innerText()); throw error; });
    // REVAMP(K): The expanded competition briefing now lives behind More.
    await surface.locator('button[data-dashboard-tab="more"]:visible').click();
    const card = surface.locator('.revamp-weekly-card:visible');
    await card.getByText('Live weekly board', { exact: true }).click();
    await card.locator('ol li').first().waitFor({ timeout: 20000 });
    assert.equal(await card.locator('ol li').count(), 5);
    assert.match(await card.innerText(), /Reset Sunday, 12 PM PT/);
    await page.screenshot({ path: `${output}/${label}-weekly.png`, fullPage: true });
    await surface.locator('button[data-dashboard-tab="proposals"]:visible').click();
    const search = surface.getByRole('searchbox', { name: 'Search research proposals' }).filter({ visible: true });
    await search.fill('water');
    await surface.getByText('Low-cost water quality sensors', { exact: true }).filter({ visible: true }).waitFor();
    await page.screenshot({ path: `${output}/${label}-signals.png`, fullPage: true });
    await search.fill('');
    assert.ok(await surface.getByRole('link', { name: /ResearchHub/ }).count());
    offline = true;
    await page.reload({ waitUntil: 'networkidle' });
    await surface.locator('button[data-dashboard-tab="proposals"]:visible').click();
    await surface.getByText('Saved snapshot', { exact: true }).filter({ visible: true }).waitFor({ timeout: 30000 }).catch(async (error) => { await page.screenshot({ path: `${output}/${label}-offline-failure.png` }); console.log('frames', page.frames().map((frame) => frame.url())); for (const frame of page.frames()) console.log(await frame.evaluate(() => ({ text: document.body.innerText, snapshot: Boolean(localStorage.getItem('scicon.researchhub.snapshot.v1')) }))); throw error; });
    await page.screenshot({ path: `${output}/${label}-offline.png`, fullPage: true });
    // Local preview admission must bypass the production receipt/quota endpoint.
    await surface.locator('button[data-dashboard-tab="home"]:visible').click();
    await surface.locator('[data-onboarding-target="weekly-run"]:visible').click();
    await surface.locator('canvas:visible').first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${output}/${label}-practice.png`, fullPage: true });
    assert.deepEqual(writes, [], 'preview must skip all outgoing API writes');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(`${label}: top5/countdown, Signals search, saved snapshot, practice admission, zero API writes, no runtime errors`);
    await context.close();
  }
} finally { await browser.close(); }
