// Local-only Chrome trace and renderer counters. Uses the QA network isolation,
// never a different renderer/quality path. Run after building the requested dist.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startStaticServer } from '../qa/server.mjs';
import { launchChrome, isolatedContext, waitForMission, samplePage, collectErrors } from '../qa/browser.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const directory = path.resolve(option('--output', '/workspace/scicon-revamp/qa/J-profile'));
await mkdir(directory, { recursive: true });
const server = await startStaticServer({ dist: path.resolve(option('--dist', 'dist')) });
const browser = await launchChrome();
const report = { consoleErrors: [], pageErrors: [], samples: [], environment: { cpuCount: os.cpus().length, loadStart: os.loadavg() } };
try {
  const context = await isolatedContext(browser, server.origin, 'mobile');
  // Works on the untouched baseline too. Counters do not force GPU readback.
  await context.addInitScript(() => {
    const counts = { draws: 0, uploads: 0, framebuffers: 0 };
    window.__sciconGL = counts;
    for (const Class of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Class) continue;
      for (const [name, key] of Object.entries({ drawElements: 'draws', drawArrays: 'draws', drawElementsInstanced: 'draws', drawArraysInstanced: 'draws', texImage2D: 'uploads', texSubImage2D: 'uploads', bindFramebuffer: 'framebuffers' })) {
        const original = Class.prototype[name];
        if (!original) continue;
        Class.prototype[name] = function (...args) { counts[key]++; return original.apply(this, args); };
      }
    }
  });
  const page = await context.newPage();
  collectErrors(page, report);
  const stage = option('--stage', 'mission-1');
  await page.goto(`${server.origin}/?qa=1&seed=12345&autoplay=1&skipIntro=1&perf=1&${stage === 'boss' ? 'bosslab=first' : 'mission=operation-open-galaxy'}`, { waitUntil: 'domcontentloaded' });
  await waitForMission(page);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__sciconPerf?.reset(); for (const key in window.__sciconGL) window.__sciconGL[key] = 0; });
  await browser.startTracing(page, { path: path.join(directory, 'chrome-trace.json'), screenshots: false, categories: ['devtools.timeline', 'v8', 'blink', 'gpu', 'cc', 'disabled-by-default-devtools.timeline', 'disabled-by-default-v8.cpu_profiler'] });
  for (let i = 0; i < Number(option('--seconds', '12')); i++) {
    await page.waitForTimeout(1000);
    report.samples.push(await samplePage(page));
  }
  await browser.stopTracing();
  const events = JSON.parse(await readFile(path.join(directory, 'chrome-trace.json'), 'utf8')).traceEvents;
  const threadNames = new Map(events.filter(event => event.name === 'thread_name').map(event => [`${event.pid}:${event.tid}`, event.args.name]));
  const durations = new Map();
  for (const event of events) {
    if (event.ph !== 'X' || !event.dur) continue;
    const key = `${threadNames.get(`${event.pid}:${event.tid}`) ?? event.tid} / ${event.name}`;
    const entry = durations.get(key) ?? { inclusiveMs: 0, calls: 0, maxMs: 0 };
    entry.inclusiveMs += event.dur / 1000; entry.calls++; entry.maxMs = Math.max(entry.maxMs, event.dur / 1000);
    durations.set(key, entry);
  }
  await writeFile(path.join(directory, 'trace-summary.json'), JSON.stringify([...durations].sort((a, b) => b[1].inclusiveMs - a[1].inclusiveMs).slice(0, 40), null, 2));
  report.renderer = await page.evaluate(() => window.__sciconPerf?.snapshot() ?? null);
  report.environment.loadEnd = os.loadavg();
  report.gl = await page.evaluate(() => window.__sciconGL);
  report.canvas = await page.locator('canvas').first().evaluate(canvas => ({ width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight }));
  report.cssEffects = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().width && (style.filter !== 'none' || style.backdropFilter !== 'none');
  }).map(el => ({ tag: el.tagName, className: el.className, filter: getComputedStyle(el).filter, backdropFilter: getComputedStyle(el).backdropFilter })));
  await page.screenshot({ path: path.join(directory, 'profile.png') });
  await writeFile(path.join(directory, 'profile.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ directory, fps: report.samples.map(sample => sample.fps), gl: report.gl, renderer: report.renderer, canvas: report.canvas, errors: [...report.pageErrors, ...report.consoleErrors] }));
  await context.close();
} finally { await browser.close(); await server.close(); }
