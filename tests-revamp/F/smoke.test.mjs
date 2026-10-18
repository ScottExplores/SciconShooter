import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { REPO_ROOT, startStaticServer } from '../../tools-revamp/qa/server.mjs';
import { canvasVariance, collectErrors, isolatedContext, launchChrome, samplePage, waitForMission } from '../../tools-revamp/qa/browser.mjs';

test('built dist: mobile start screen, live mission, rendering, frame rate, and offline API', { timeout: 180000 }, async t => {
  const artifacts = path.join('/workspace/scicon-revamp/qa', `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(artifacts, { recursive: true });
  const result = { consoleErrors: [], pageErrors: [], samples: [], artifacts, environment: { cpuCount: os.cpus().length, availableParallelism: os.availableParallelism(), hostLoadAverageStart: os.loadavg(), freeMemoryBytesStart: os.freemem() } };
  const server = await startStaticServer({ dist: process.env.SCICON_QA_DIST || path.join(REPO_ROOT, 'dist') });
  let browser; let context; let page;
  const cancel = () => { void browser?.close().catch(() => {}); void server.close(); };
  t.signal.addEventListener('abort', cancel, { once: true });
  try {
    browser = await launchChrome();
    result.environment.browserVersion = browser.version();
    context = await isolatedContext(browser, server.origin, 'mobile');
    page = await context.newPage();
    page.setDefaultNavigationTimeout(45000);
    collectErrors(page, result);
    await t.test('index.html loads and start screen has no page errors for 10 seconds', async () => {
      const response = await page.goto(`${server.origin}/?qa=1&seed=12345`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /text\/html/);
      await page.locator('[data-onboarding-target="campaign-start"]:visible').first().waitFor({ state: 'visible', timeout: 45000 });
      await page.waitForTimeout(10000);
      await page.screenshot({ path: path.join(artifacts, 'start-screen.png') });
      assert.deepEqual(result.pageErrors, []);
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      result.startScreenPassed = true;
    });
    assert.ok(result.startScreenPassed, 'mission checks require a working start screen; see retained smoke artifacts');
    await t.test('QA flags start the authored mission with live simulation and nonblank canvas', async () => {
      const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
      const first = [...campaign.levels].sort((a, b) => a.order - b.order)[0];
      await page.goto(`${server.origin}/?qa=1&seed=12345&mission=${encodeURIComponent(first.id)}&autoplay=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
      const started = await waitForMission(page);
      assert.equal(started.state.levelId, first.id);
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);
        result.samples.push(await samplePage(page));
      }
      const final = result.samples.at(-1);
      assert.ok(final.state.frame > started.state.frame, 'simulation frame counter advances');
      assert.ok(result.samples.some(sample => sample.counts?.enemies > 0), 'authored wave spawned enemies');
      result.canvas = await canvasVariance(page);
      assert.ok(result.canvas.variance > 5, `canvas luminance variance ${result.canvas.variance} must exceed 5`);
      assert.ok(result.canvas.nonBlackFraction > 0.01, 'more than 1% of canvas pixels contain visible content');
      await page.screenshot({ path: path.join(artifacts, 'mission.png') });
      assert.deepEqual(result.pageErrors, []);
      assert.deepEqual(final.state.errors, []);
    });
    await t.test('active game median FPS is at least 30 in headless SwiftShader', () => {
      const fps = result.samples.filter(sample => sample.state?.gameActive && sample.state.lives > 0 && sample.fps > 0).map(sample => sample.fps).sort((a, b) => a - b);
      assert.ok(fps.length >= 8, `expected at least eight active-game samples, got ${fps.length}`);
      const median = fps[Math.floor(fps.length / 2)];
      result.fpsMedian = median;
      result.fpsMinimum = fps[0];
      assert.ok(median >= 30, `median render-loop FPS ${median.toFixed(1)} is below 30 (minimum ${fps[0].toFixed(1)})`);
    });
    await t.test('GET and POST API calls return local fixtures successfully', async () => {
      const responses = await page.evaluate(async () => {
        const get = await fetch('/api/leaderboard');
        const post = await fetch('/api/events?route=qa-probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixture: true }) });
        return { get: { status: get.status, body: await get.json() }, post: { status: post.status, body: await post.json() } };
      });
      assert.equal(responses.get.status, 200);
      assert.ok(Array.isArray(responses.get.body.scores));
      assert.equal(responses.post.status, 200);
      assert.deepEqual(responses.post.body, { ok: true });
      assert.ok(server.requests.some(request => request.method === 'POST' && request.route === 'qa-probe'));
      assert.deepEqual(result.consoleErrors, [], 'browser console errors must be investigated');
    });
  } finally {
    t.signal.removeEventListener('abort', cancel);
    result.apiRequests = server.requests;
    result.environment.hostLoadAverageEnd = os.loadavg();
    result.environment.freeMemoryBytesEnd = os.freemem();
    await writeFile(path.join(artifacts, 'smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
    t.diagnostic(`Artifacts: ${artifacts}`);
    await context?.close().catch(() => {}); await browser?.close().catch(() => {}); await server.close();
  }
});
