import { access, mkdir, readFile, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fixtureFor } from './server.mjs';

export const DEVICES = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
export const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];

export function redact(value) {
  return String(value).replace(/https?:\/\/[^\s"'<>]+/g, raw => {
    try { const u = new URL(raw); return `${u.origin}${u.pathname}`; } catch { return '[url]'; }
  }).replace(/(authorization|api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').replace(/\b0x[a-fA-F0-9]{40,}\b/g, '[hex redacted]').slice(0, 1500);
}

export async function launchChrome({ video = false } = {}) {
  // Playwright recordVideo expects a bundled ffmpeg path. Point its scratch cache
  // at the installed system binary; no browser downloads or package changes.
  if (video) {
    await access('/usr/bin/ffmpeg');
    const require = createRequire(import.meta.url);
    const packageRoot = path.dirname(require.resolve('playwright-core/package.json'));
    const { browsers } = JSON.parse(await readFile(path.join(packageRoot, 'browsers.json'), 'utf8'));
    const revision = browsers.find(b => b.name === 'ffmpeg').revision;
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.tmpdir(), 'scicon-qa-playwright');
    const directory = path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, `ffmpeg-${revision}`);
    await mkdir(directory, { recursive: true });
    await symlink('/usr/bin/ffmpeg', path.join(directory, 'ffmpeg-linux')).catch(error => { if (error.code !== 'EEXIST') throw error; });
  }
  const { chromium } = await import('playwright-core');
  return chromium.launch({ executablePath: process.env.SCICON_CHROME || '/usr/bin/google-chrome', headless: true, args: CHROME_ARGS });
}

export async function isolatedContext(browser, origin, device, { videoDir, network = [] } = {}) {
  const context = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block', ...(videoDir ? { recordVideo: { dir: videoDir, size: DEVICES[device].viewport } } : {}) });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    network.push({ method: request.method(), origin: url.origin, resourceType: request.resourceType(), action: 'fulfilled-offline' });
    // Nothing from the browser reaches remote services, even analytics POSTs.
    const payload = request.method() === 'GET' ? await fixtureFor(url) : { ok: true };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await context.routeWebSocket('**/*', ws => ws.close());
  await context.addInitScript(() => {
    const frameTimes = [];
    let previous = 0;
    const frame = now => {
      if (previous) { frameTimes.push(now - previous); if (frameTimes.length > 120) frameTimes.shift(); }
      previous = now;
      window.__qaBrowserFps = frameTimes.length ? 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) : 0;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  return context;
}

export function collectErrors(page, result) {
  page.on('console', event => { if (event.type() === 'error') result.consoleErrors.push(redact(event.text())); });
  page.on('pageerror', error => result.pageErrors.push(redact(error.message)));
}

export async function samplePage(page) {
  const sample = await page.evaluate(() => {
    const qa = window.__sciconQA;
    return { state: qa?.state?.() ?? null, counts: qa?.counts?.() ?? null, fps: qa?.fps?.() ?? null, browserFps: window.__qaBrowserFps ?? 0 };
  });
  if (sample.state?.errors) sample.state.errors = sample.state.errors.map(redact);
  return sample;
}

export async function appFrame(page, device) {
  if (device !== 'desktop') return page;
  const shellButton = page.getByRole('button', { name: /start browser run/i });
  await shellButton.waitFor({ state: 'visible', timeout: 45000 });
  await shellButton.click();
  const iframe = page.locator('iframe[title="Scicon Shooter mobile game"]');
  await iframe.waitFor({ state: 'visible', timeout: 45000 });
  return (await iframe.elementHandle()).contentFrame();
}

export async function waitForMission(page, timeout = 45000) {
  await page.waitForFunction(() => window.__sciconQA?.state?.()?.gameActive === true, null, { timeout });
  return samplePage(page);
}

export async function startBaselineMission(page) {
  const start = page.locator('[data-onboarding-target="campaign-start"]:visible').first();
  await start.waitFor({ state: 'visible', timeout: 45000 });
  await start.click();
  // The transmission opens after the canvas has mounted; keep servicing it
  // through the delayed introduction, then also check during each sample.
  for (let attempt = 0; attempt < 10; attempt++) {
    await dismissBaselineOverlays(page);
    await page.waitForTimeout(500);
  }
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
}

export async function dismissBaselineOverlays(page) {
  let dismissed = 0;
  for (const label of ['Skip', 'No thanks', 'End guide']) {
    const control = page.getByRole('button', { name: label, exact: true }).first();
    if (await control.isVisible().catch(() => false)) { await control.click({ timeout: 2000 }); dismissed++; }
  }
  return dismissed;
}

export async function canvasVariance(page) {
  // Screenshot decoding works for both WebGL and canvas2d without changing the
  // game's preserveDrawingBuffer / rendering configuration.
  const canvas = page.locator('canvas').first();
  const bytes = await canvas.screenshot({ timeout: 15000 });
  return page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = 64; probe.height = 64;
    const context = probe.getContext('2d');
    context.drawImage(image, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    let sum = 0; let squares = 0; let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += luminance; squares += luminance ** 2; if (luminance > 8) nonBlack++;
    }
    const count = data.length / 4;
    return { variance: squares / count - (sum / count) ** 2, mean: sum / count, nonBlackFraction: nonBlack / count, width: image.naturalWidth, height: image.naturalHeight };
  }, bytes.toString('base64'));
}
