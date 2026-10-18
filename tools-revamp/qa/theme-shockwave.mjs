import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { startStaticServer } from './server.mjs';
import { launchChrome, isolatedContext, collectErrors, waitForMission, samplePage, canvasVariance } from './browser.mjs';

// Actual shader proof from a natural boss receipt; no injected gameplay event.
const dist = path.resolve(process.argv[2] ?? 'dist');
const output = path.resolve(process.argv[3] ?? `/workspace/scicon-revamp/qa/R-themes/shockwave-${Date.now()}`);
await mkdir(output, { recursive: false });
const report = { status: 'running', dist, source: 'authored first boss, High quality, autoplay/god coverage, offline transport; natural active-frame canvas readback with unchanged game/browser clocks', consoleErrors: [], pageErrors: [], network: [] };
let server, browser, context;
try {
  report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(dist, 'index.html'))).digest('hex');
  server = await startStaticServer({ dist }); browser = await launchChrome();
  context = await isolatedContext(browser, server.origin, 'mobile', { network: report.network });
  const page = await context.newPage(); collectErrors(page, report);
  await page.goto(`${server.origin}/?qa=1&seed=12345&bosslab=first&autoplay=1&skipIntro=1&god=1`, { waitUntil: 'domcontentloaded' });
  await waitForMission(page);
  await page.evaluate(() => {
    const key = 'scicon:render-quality:v1', newValue = JSON.stringify({ version: 1, mode: 'high' });
    localStorage.setItem(key, newValue); window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
  await page.waitForFunction(() => window.__sciconSpriteThemeQA?.snapshot().quality === 'high');
  await page.screenshot({ path: path.join(output, 'before.png') });
  await page.waitForFunction(() => window.__sciconShockwaveQA?.snapshot().active, null, { timeout: 90000 });
  report.active = await page.evaluate(() => ({ shockwave: window.__sciconShockwaveQA.snapshot(), sprites: window.__sciconSpriteThemeQA.snapshot() }));
  assert.equal(report.active.shockwave.active, true); assert.equal(report.active.shockwave.sourceBytes, 16384);
  // Capture within the next animation callback, after the game's queued render
  // and before WebGL discards its drawing buffer. Screenshot helpers can wait
  // through the whole short pulse/camera shake. No production readback is added.
  const captured = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('canvas');
    const frame = { shockwave: window.__sciconShockwaveQA.snapshot(), sprites: window.__sciconSpriteThemeQA.snapshot() };
    const png = canvas.toDataURL('image/png').split(',')[1];
    const probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
    const context = probe.getContext('2d'); context.drawImage(canvas, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    let sum = 0, squares = 0, nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += value; squares += value * value; if (value > 8) nonBlack++;
    }
    const count = data.length / 4;
    resolve({ png, ...frame, variance: squares / count - (sum / count) ** 2, nonBlackFraction: nonBlack / count });
  })));
  const { png, ...frame } = captured; report.filteredFrame = frame;
  await writeFile(path.join(output, 'natural-high-pulse.png'), Buffer.from(png, 'base64'));
  assert.equal(report.filteredFrame.shockwave.active, true, 'Pulse expired before the filtered screenshot completed');
  assert.ok(report.filteredFrame.sprites.frame > report.active.sprites.frame, 'Captured the zero-strength attachment frame');
  assert.ok(report.filteredFrame.variance > 5 && report.filteredFrame.nonBlackFraction > .01, 'Filtered canvas is blank');
  await page.waitForFunction(() => !window.__sciconShockwaveQA.snapshot().active, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  report.settled = await samplePage(page); report.canvas = await canvasVariance(page);
  await page.screenshot({ path: path.join(output, 'settled.png') });
  assert.ok(report.canvas.variance > 5 && report.canvas.nonBlackFraction > .01);
  assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.settled.state.errors, []);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.message; process.exitCode = 1; }
finally {
  await context?.close(); await browser?.close(); await server?.close();
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${report.status}: ${path.join(output, 'report.json')}\n`);
}
