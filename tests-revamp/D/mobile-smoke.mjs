// Optional visual smoke: run after `npx vite build`. All API/external requests are intercepted.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.REVAMP_PLAYWRIGHT_MODULE || '@playwright/test');
const scratch = await mkdtemp(join(tmpdir(), 'revamp-D-visual-'));
const output = resolve(process.env.REVAMP_QA_DIR || '/workspace/scicon-revamp/qa');
await mkdir(output, { recursive: true });
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import WaveVictoryOverlay from './components/WaveVictoryOverlay';
import {createRevampProgress,settleRevampMission} from './services/revamp/progression';
const summary={id:'visual-test',stage:1,stageName:'Launch Bay',finalWaveName:'Open Science',waveNumber:3,waveTotal:3,scoreEarned:1250,totalScore:1250,enemiesDefeated:42,coinsCollected:84,remainingLives:3,elapsedSeconds:58,nextStage:2,hasNextStage:true,campaignComplete:false};
const result=settleRevampMission(createRevampProgress(),{runId:'visual-test',missionId:'level-1',cleared:true,kills:42,spawned:44,damageTaken:0,durationMs:58000,scienceCreditsEarned:124});
createRoot(document.getElementById('root')!).render(<WaveVictoryOverlay summary={summary as any} revampSettlement={result} onContinue={()=>{document.body.dataset.continued='true'}} onReturnHome={()=>{}}/>);
` }, bundle: true, outfile: join(scratch, 'result.js'), format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/visual-result') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/visual-result.css"><style>body{margin:0;background:#071020;color:white;font-family:system-ui}button{cursor:pointer}</style><div id="root"></div><script type="module" src="/visual-result.js"></script>'); return; }
    const file = path === '/visual-result.js' ? join(scratch, 'result.js') : path === '/visual-result.css' ? join(scratch, 'result.css') : resolve('dist', path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(resolve('dist')) && !file.startsWith(scratch)) throw new Error('invalid path');
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.REVAMP_CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
const report = { errors: [], firstPlayMs: 0, researchNodes: 0, resultReachable: false };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], winners: [], proposals: [], records: [], runs: [], status: 'offline' }) });
    return url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:') ? route.continue() : route.abort();
  });
  await page.goto(origin);
  await page.locator('[data-onboarding-target="campaign-start"]:visible').waitFor({ timeout: 60000 });
  await page.locator('.sci-mission-loader').waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: join(output, 'D-home.png') });
  // REVAMP(K): Progression lives behind More; the original home deck stays compact.
  await page.locator('button[data-dashboard-tab="more"]:visible').click();
  await page.locator('.revamp-progression summary:visible').click();
  await page.locator('.revamp-progression:visible button').filter({ hasText: /^Research$/ }).click();
  report.researchNodes = await page.locator('.revamp-tree:visible button').count();
  if (report.researchNodes !== 25) throw new Error('Expected 25 research nodes');
  await page.locator('.revamp-tree:visible').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'D-tree.png') });
  // REVAMP(K): Return to the existing campaign launch control before timing entry.
  await page.locator('button[data-dashboard-tab="home"]:visible').click();
  await page.locator('[data-onboarding-target="campaign-start"]:visible').waitFor();
  const start = Date.now();
  await page.locator('[data-onboarding-target="campaign-start"]:visible').click();
  await page.locator('.revamp-first-flight').waitFor({ timeout: 30000 });
  report.firstPlayMs = Date.now() - start;
  await page.screenshot({ path: join(output, 'D-flight.png') });
  await page.waitForTimeout(14000);
  await page.screenshot({ path: join(output, 'D-wings.png') });
  await page.goto(`${origin}/visual-result`);
  await page.locator('.revamp-medals').waitFor(); await page.waitForTimeout(2100);
  await page.screenshot({ path: join(output, 'D-results.png') });
  await page.locator('.wave-victory-actions button').first().click();
  report.resultReachable = await page.evaluate(() => document.body.dataset.continued === 'true');
  await page.setViewportSize({ width: 320, height: 568 }); await page.screenshot({ path: join(output, 'D-results-small.png') });
  if (report.errors.length || !report.resultReachable) throw new Error(JSON.stringify(report));
  await writeFile(join(output, 'D-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(scratch, { recursive: true, force: true });
}
