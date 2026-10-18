// Optional local QA: start Vite, then node tests-revamp/A/browser-smoke.mjs.
// Requires playwright-core and a local Chrome. No API traffic leaves the browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.REVAMP_BASE_URL || 'http://127.0.0.1:5173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a local dev server');
const output = process.env.REVAMP_QA_DIR || '/tmp/scicon-feel-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const report = [];
try {
  for (const mobile of [true, false]) {
    const name = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(origin).origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const scene of ['explosions', 'hits', 'armor', 'muzzle', 'cancel', 'power', 'boss', 'projectiles', 'hud']) {
      await page.goto(`${origin}/?fxlab=1&effect=${scene}`, { waitUntil: 'networkidle' });
      await page.locator('canvas').waitFor();
      await page.waitForTimeout(scene === 'hud' ? 1300 : scene === 'boss' ? 900 : 120);
      await page.screenshot({ path: join(output, `${name}-${scene}.png`), fullPage: true });
      const dimensions = await page.locator('canvas').evaluate(canvas => ({
        width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight
      }));
      assert.ok(Math.abs(dimensions.clientWidth / dimensions.clientHeight - 390 / 580) < 0.01, 'Lab preserves its world aspect ratio');
    }
    if (mobile) {
      await page.goto(`${origin}/?lab=combat&display=mobile-frame`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'LAUNCH TEST FLIGHT' }).click();
      await page.waitForTimeout(8000);
      await page.screenshot({ path: join(output, 'mobile-combat.png') });
      assert.ok(!await page.getByText('Renderer could not start', { exact: false }).count());
    }
    assert.deepEqual(errors, [], `${name} browser errors`);
    report.push({ name, errors });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
}
console.log(`Mobile/desktop effects smoke passed. Captures: ${output}`);
