import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { canvasVariance, collectErrors, isolatedContext, launchChrome, redact, samplePage, waitForMission } from './browser.mjs';

// REVAMP(N): real campaign launches; the gallery never changes gameplay or calls remote APIs.
export function options(argv) {
  const config = { dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa/N-backgrounds/after', before: false, seed: 12345, seconds: 4, sectors: null, missions: null, quality: 'auto', reducedMotion: false, setPiecesOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--before') config.before = true;
    else if (key === '--set-pieces-only') config.setPiecesOnly = true;
    else if (key === '--reduced-motion') config.reducedMotion = true;
    else if (['--dist', '--output', '--seed', '--seconds', '--sectors', '--missions', '--quality'].includes(key)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      if (key === '--seed' || key === '--seconds') config[key.slice(2)] = Number(value);
      else if (key === '--sectors' || key === '--missions') config[key.slice(2)] = value.split(',');
      else if (key === '--quality') config.quality = value;
      else config[key.slice(2)] = path.resolve(value);
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (!Number.isFinite(config.seed)) throw new Error('--seed must be finite');
  if (!Number.isFinite(config.seconds) || config.seconds < 1) throw new Error('--seconds must be positive');
  if (!['auto', 'high', 'low'].includes(config.quality)) throw new Error('--quality must be auto, high, or low');
  if (config.before && config.setPiecesOnly) throw new Error('--set-pieces-only requires the new background bridge');
  if (config.sectors && config.setPiecesOnly) throw new Error('--set-pieces-only cannot be combined with --sectors');
  if (config.missions && (config.setPiecesOnly || config.sectors)) throw new Error('--missions cannot be combined with --sectors or --set-pieces-only');
  return config;
}

export function sectorScenarios(campaign, config) {
  const ids = new Set(campaign.levels.map(level => level.id));
  const query = mission => `?${new URLSearchParams({ qa: '1', seed: String(config.seed), mission, autoplay: '1', skipIntro: '1', god: '1' })}`;
  if (config.missions) return config.missions.map(mission => {
    const sector = campaign.sectors.find(item => item.missionIds.includes(mission));
    if (!ids.has(mission) || !sector) throw new Error(`Unknown authored mission: ${mission}`);
    return { id: mission, sectorId: sector.id, name: `${sector.name}: ${mission}`, mission, query: query(mission) };
  });
  return [...campaign.sectors].sort((a, b) => a.order - b.order)
    .filter(sector => !config.sectors || config.sectors.includes(sector.id) || config.sectors.includes(String(sector.order)))
    .map(sector => {
      const mission = sector.missionIds.find(id => ids.has(id));
      if (!mission) throw new Error(`No authored mission found for ${sector.id}`);
      return { id: `${String(sector.order).padStart(2, '0')}-${sector.id}`, sectorId: sector.id, name: sector.name, mission,
        query: query(mission) };
    });
}

async function backgroundState(page) {
  return page.evaluate(() => {
    const bridge = window.__sciconBackgroundQA;
    return typeof bridge?.snapshot === 'function' ? bridge.snapshot() : null;
  });
}

async function captureScenario(browser, server, report, scenario, config) {
  const result = { ...scenario, status: 'running', consoleErrors: [], pageErrors: [], network: [], samples: [], screenshot: `${scenario.id}.png` };
  report.results.push(result);
  let context;
  let page;
  try {
    context = await isolatedContext(browser, server.origin, 'mobile', { network: result.network });
    page = await context.newPage();
    await page.emulateMedia({ reducedMotion: config.reducedMotion ? 'reduce' : 'no-preference' });
    collectErrors(page, result);
    const response = await page.goto(`${server.origin}/${scenario.query}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (response?.status() !== 200) throw new Error(`Document returned ${response?.status()}`);
    const started = await waitForMission(page);
    if (started.state.levelId !== scenario.mission) throw new Error(`Expected ${scenario.mission}, received ${started.state.levelId}`);
    // The QA storage shim is installed during app boot. Set the real preference
    // after boot and notify its existing storage listener, using disposable data.
    await page.evaluate(mode => {
      const key = 'scicon:render-quality:v1';
      const newValue = JSON.stringify({ version: 1, mode });
      localStorage.setItem(key, newValue);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
    }, config.quality);
    result.title = await page.title();
    const startedAt = Date.now();
    const events = [];
    let eventCaptured = false;
    const seconds = scenario.eventOrdinal ? 60 : config.seconds;
    while (Date.now() - startedAt < seconds * 1000) {
      result.samples.push({ seconds: (Date.now() - startedAt) / 1000, ...await samplePage(page) });
      if (scenario.eventOrdinal) {
        const snapshot = await backgroundState(page);
        if (snapshot?.event && !events.includes(snapshot.event)) events.push(snapshot.event);
        if (snapshot?.event && events.indexOf(snapshot.event) === scenario.eventOrdinal - 1 && snapshot.eventProgress >= 0.25 && snapshot.eventProgress <= 0.85) {
          eventCaptured = true;
          result.eventSnapshot = snapshot;
          break;
        }
      }
      await page.waitForTimeout(scenario.eventOrdinal ? 150 : 500);
    }
    result.background = await backgroundState(page);
    result.finalState = await samplePage(page);
    result.canvas = await canvasVariance(page);
    await page.screenshot({ path: path.join(config.output, result.screenshot), timeout: 15000 });
    result.capturedAt = new Date().toISOString();
    result.actualSeconds = (Date.now() - startedAt) / 1000;
    const fps = result.samples.filter(sample => sample.state?.gameActive && sample.fps > 0).map(sample => sample.fps).sort((a, b) => a - b);
    result.fpsMedian = fps.length ? Math.round(fps[Math.floor(fps.length / 2)] * 10) / 10 : null;
    result.failures = [];
    if (scenario.eventOrdinal && !eventCaptured) result.failures.push(`Natural set piece ${scenario.eventOrdinal} did not reach capture range`);
    if (result.consoleErrors.length || result.pageErrors.length || result.samples.some(sample => sample.state?.errors?.length)) result.failures.push('Browser/runtime errors');
    if (!(result.canvas.variance > 5 && result.canvas.nonBlackFraction > 0.01)) result.failures.push('Blank canvas');
    if (!(result.finalState.state.frame > started.state.frame)) result.failures.push('Simulation did not advance');
    if (!result.finalState.state.gameActive) result.failures.push('Mission ended before capture');
    if (result.finalState.state.worldWidth !== 390 || result.finalState.state.worldHeight !== 844) result.failures.push('Unexpected world dimensions');
    if (!config.before && result.background?.reducedMotion !== config.reducedMotion) result.failures.push('Reduced motion preference did not reach the background');
    const expectedQuality = config.quality === 'high' ? 1 : config.quality === 'low' ? .5 : null;
    if (!config.before && expectedQuality !== null && result.background?.quality !== expectedQuality) result.failures.push('Quality preference did not reach the background');
    result.status = result.failures.length ? 'failed' : 'passed';
  } catch (error) {
    result.status = 'failed';
    result.failure = redact(error.message);
    if (page) await page.screenshot({ path: path.join(config.output, result.screenshot), timeout: 15000 }).catch(() => {});
  } finally {
    await context?.close().catch(() => {});
    process.stdout.write(`${scenario.id}: ${result.status}${result.fpsMedian ? `, ${result.fpsMedian} FPS` : ''}\n`);
  }
}

async function writeReports(report, config) {
  await writeFile(path.join(config.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lines = ['# N background gallery', '', `Mode: **${report.mode}**. Status: **${report.status}**.`, '',
    `Real authored campaign missions, mobile 390×844 / DPR 2, seed ${config.seed}, autoplay and explicit god mode. Each mission uses a fresh disposable offline browser context. Browser plugin not available; existing Playwright + system Chrome helpers used. No remote requests are sent.`, '',
    'The flow under test is: QA campaign mission URL → real mission startup and advancing simulation → visible sector background with readable combat. Short gallery FPS samples are descriptive; the dedicated playthrough is the performance gate.', '',
    `Build: \`${report.dist}\` (index SHA-256 \`${report.distIndexSha256}\`). Quality preference: **${config.quality}**. Reduced motion: **${config.reducedMotion}**.`, '',
    '| Sector | Mission | Status | Median FPS | Screenshot |', '| --- | --- | --- | --- | --- |'];
  for (const result of report.results) lines.push(`| ${result.name} | ${result.mission} | ${result.status} | ${result.fpsMedian ?? '—'} | [image](${result.screenshot}) |`);
  for (const result of report.results) for (const failure of [...(result.failures || []), ...(result.failure ? [result.failure] : [])]) lines.push('', `- ${result.id}: ${failure}`);
  for (const note of report.notes) lines.push('', `- ${note}`);
  await writeFile(path.join(config.output, 'report.md'), `${lines.join('\n')}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  await mkdir(path.dirname(config.output), { recursive: true });
  await mkdir(config.output, { recursive: false });
  const report = { schemaVersion: 1, mode: config.before ? 'before' : 'after', status: 'running', startedAt: new Date().toISOString(), dist: config.dist, seed: config.seed, quality: config.quality, reducedMotion: config.reducedMotion, results: [], notes: [] };
  let server;
  let browser;
  try {
    const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
    const scenarios = sectorScenarios(campaign, config);
    if (!scenarios.length) throw new Error('No sectors selected');
    if (config.sectors) report.notes.push(`Partial sector selection: ${config.sectors.join(', ')}.`);
    if (config.missions) report.notes.push(`Explicit mission selection: ${config.missions.join(', ')}.`);
    report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
    server = await startStaticServer({ dist: config.dist });
    browser = await launchChrome();
    report.browserVersion = browser.version();
    const captures = config.setPiecesOnly ? [] : [...scenarios];
    if (!config.before && !config.sectors && !config.missions) {
      for (const eventOrdinal of [1, 2]) captures.push({ ...scenarios[0], id: `${10 + eventOrdinal}-set-piece-${eventOrdinal}`, name: `Natural set piece ${eventOrdinal}`, eventOrdinal });
    }
    for (const scenario of captures) {
      await captureScenario(browser, server, report, scenario, config);
      await writeReports(report, config);
    }
    report.apiRequests = server.requests;
    report.status = report.results.some(result => result.status === 'failed') ? 'failed' : 'passed';
  } catch (error) {
    report.status = 'failed'; report.notes.push(redact(error.message));
  } finally {
    await browser?.close().catch(() => {});
    await server?.close();
    report.finishedAt = new Date().toISOString();
    await writeReports(report, config);
    process.stdout.write(`Report: ${path.join(config.output, 'report.md')}\n`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(report => { if (report.status === 'failed') process.exitCode = 1; }).catch(error => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
}
