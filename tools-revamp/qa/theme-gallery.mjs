import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { canvasVariance, collectErrors, isolatedContext, launchChrome, redact, samplePage, waitForMission } from './browser.mjs';
import { auditTextGeometry } from './ui-geometry.mjs';

// REVAMP(R): authored combat plus clearly labeled result presentation fixtures.
// Reuse the offline transport so no browser request or socket reaches a service.
export function options(argv) {
  const config = { dist: path.join(REPO_ROOT, 'dist'), output: null, before: false, seed: 12345, seconds: 6,
    sectors: ['1', '2', '3', '8'], kinds: ['mission', 'boss', 'result', 'weekly-result'], quality: 'auto', reducedMotion: false };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--before') config.before = true;
    else if (key === '--reduced-motion') config.reducedMotion = true;
    else if (['--dist', '--output', '--seed', '--seconds', '--sectors', '--kinds', '--quality'].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      if (key === '--seed' || key === '--seconds') config[key.slice(2)] = Number(value);
      else if (key === '--sectors' || key === '--kinds') config[key.slice(2)] = [...new Set(value.split(',').map(item => item.trim()))];
      else if (key === '--quality') config.quality = value;
      else config[key.slice(2)] = path.resolve(value);
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (!Number.isFinite(config.seed)) throw new Error('--seed must be finite');
  if (!Number.isFinite(config.seconds) || config.seconds < 1 || config.seconds > 60) throw new Error('--seconds must be between 1 and 60');
  if (!['auto', 'high', 'low'].includes(config.quality)) throw new Error('--quality must be auto, high, or low');
  if (config.kinds.some(kind => !['mission', 'boss', 'result', 'weekly-result'].includes(kind))) throw new Error('Unknown capture kind');
  if (config.sectors.some(id => !id)) throw new Error('Empty sector selection');
  config.output ??= `/workspace/scicon-revamp/qa/R-themes/${config.before ? 'before' : 'after'}`;
  return config;
}

export function themeScenarios(campaign, config) {
  const sectors = [...campaign.sectors].sort((a, b) => a.order - b.order);
  const selected = config.sectors.map(id => {
    const sector = sectors.find(item => item.id === id || String(item.order) === id);
    if (!sector) throw new Error(`Unknown authored sector: ${id}`);
    return sector;
  }).filter((sector, index, items) => items.indexOf(sector) === index);
  const scenarios = [];
  for (const sector of selected) {
    const levels = campaign.levels.filter(level => sector.missionIds.includes(level.id)).sort((a, b) => a.order - b.order);
    if (!levels[0]) throw new Error(`No authored mission in ${sector.id}`);
    const base = { sectorId: sector.id, name: sector.name, mission: levels[0].id };
    const prefix = `${String(sector.order).padStart(2, '0')}-${sector.id}`;
    for (const kind of config.kinds.filter(item => item !== 'weekly-result')) {
      const scenario = { ...base, kind, id: `${prefix}-${kind}` };
      if (kind === 'boss') {
        const bosses = levels.flatMap(level => level.waves.flatMap(wave => wave.events
          .filter(event => event.kind === 'boss').map(event => ({ mission: level.id, event }))));
        const boss = bosses.find(item => item.event.bossId === sector.majorBossId)
          ?? bosses.find(item => item.event.rigId);
        if (!boss) throw new Error(`No authored major boss in ${sector.id}`);
        Object.assign(scenario, { mission: boss.mission, bossEvent: boss.event.id, bossId: boss.event.bossId });
      }
      scenarios.push(scenario);
    }
  }
  if (config.kinds.includes('weekly-result')) scenarios.push({ id: 'weekly-result', sectorId: 'weekly-run', name: 'Weekly Run', kind: 'weekly-result', mission: null });
  return scenarios;
}

function scenarioQuery(scenario, config) {
  const fixture = scenario.kind.endsWith('result');
  return `?${new URLSearchParams({ qa: '1', seed: String(config.seed), ...(fixture
    ? { uiAudit: '1' }
    : { mission: scenario.mission, autoplay: '1', skipIntro: '1', god: '1', ...(scenario.bossEvent ? { bosslab: scenario.bossEvent } : {}) }) })}`;
}

async function themeState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-world-theme]');
    const css = root ? getComputedStyle(root) : null;
    return {
      renderer: window.__sciconThemeQA?.snapshot?.() ?? null,
      sprites: window.__sciconSpriteThemeQA?.snapshot?.() ?? null,
      presentation: window.__sciconThemePreview?.snapshot?.() ?? null,
      background: window.__sciconBackgroundQA?.snapshot?.() ?? null,
      root: root ? { themeId: root.getAttribute('data-world-theme'), sectorId: root.getAttribute('data-world-sector'),
        accent: css.getPropertyValue('--world-accent').trim(), secondary: css.getPropertyValue('--world-secondary').trim(),
        glow: css.getPropertyValue('--world-glow').trim() } : null,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

export function gameplayFailures(result, started) {
  const failures = [];
  if (!(result.canvas?.variance > 5 && result.canvas?.nonBlackFraction > 0.01)) failures.push('Blank canvas');
  if (!(result.finalState?.state?.frame > started?.state?.frame)) failures.push('Simulation did not advance');
  if (!result.finalState?.state?.gameActive) failures.push('Mission ended before capture');
  if (result.finalState?.state?.worldWidth !== 390 || result.finalState?.state?.worldHeight !== 844) failures.push('Unexpected world dimensions');
  if (result.kind === 'boss' && !result.samples.some(sample => sample.state?.bossHp > 0)) failures.push('No live boss observed');
  if (result.samples.some(sample => sample.state?.errors?.length)) failures.push('Game runtime errors');
  return failures;
}

async function captureScenario(browser, server, report, scenario, config) {
  const fixture = scenario.kind.endsWith('result');
  const result = { ...scenario, status: 'running', source: fixture ? 'production result component with synthetic settlement; theme preview only' : 'real authored campaign mission',
    consoleErrors: [], pageErrors: [], network: [], samples: [], failures: [], screenshot: `${scenario.id}.png`,
    query: scenarioQuery(scenario, config) };
  report.results.push(result);
  let context; let page;
  try {
    context = await isolatedContext(browser, server.origin, 'mobile', { network: result.network });
    page = await context.newPage();
    await page.emulateMedia({ reducedMotion: config.reducedMotion ? 'reduce' : 'no-preference' });
    collectErrors(page, result);
    const response = await page.goto(`${server.origin}/${result.query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (response?.status() !== 200) throw new Error(`Document returned ${response?.status()}`);
    if (fixture) {
      await page.waitForFunction(() => Boolean(window.__sciconUIAudit), null, { timeout: 45000 });
      await page.evaluate(kind => window.__sciconUIAudit.present(kind === 'weekly-result' ? kind : 'victory'), scenario.kind);
      if (!config.before) {
        // Fixture presentation can change the active mission/mode. Let React
        // install that scene's theme hook before selecting its cosmetic preview.
        await page.waitForTimeout(250);
        await page.waitForFunction(() => typeof window.__sciconThemePreview?.previewSector === 'function', null, { timeout: 10000 });
        await page.evaluate(sectorId => window.__sciconThemePreview.previewSector(sectorId), scenario.sectorId);
      }
      // Let the production result's staged counters and controls finish entering.
      await page.waitForTimeout(3200);
      if (scenario.kind === 'result') {
        await page.locator('.wave-victory-overlay').waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(() => {
          const controls = [...document.querySelectorAll('.wave-victory-overlay button')];
          return controls.length >= 3 && controls.every(button => button.disabled || Number(getComputedStyle(button).opacity) >= .99);
        }, null, { timeout: 15000 });
      }
      await page.evaluate(async () => { await document.fonts.ready; });
      result.geometry = await page.evaluate(auditTextGeometry);
      if (result.geometry.violations.length) result.failures.push('Result text/control geometry violations');
      if (result.geometry.checkedTextNodes < 8 || result.geometry.checkedControls < 2) result.failures.push('Result fixture missing visible content');
    } else {
      const started = await waitForMission(page);
      if (started.state.levelId !== scenario.mission) throw new Error(`Expected ${scenario.mission}, received ${started.state.levelId}`);
      // The disposable QA storage shim installs at boot. Use the normal quality
      // preference and its listener, never a renderer-only bypass.
      await page.evaluate(mode => {
        const key = 'scicon:render-quality:v1', newValue = JSON.stringify({ version: 1, mode });
        localStorage.setItem(key, newValue);
        window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
      }, config.quality);
      if (scenario.kind === 'boss') await page.waitForFunction(() => window.__sciconQA?.state?.().bossHp > 0, null, { timeout: 45000 });
      const startedAt = Date.now();
      while (Date.now() - startedAt < config.seconds * 1000) {
        result.samples.push({ seconds: (Date.now() - startedAt) / 1000, ...await samplePage(page), theme: await themeState(page) });
        await page.waitForTimeout(500);
      }
      result.actualSeconds = (Date.now() - startedAt) / 1000;
      result.finalState = await samplePage(page);
      result.canvas = await canvasVariance(page);
      const fps = result.samples.filter(sample => sample.state?.gameActive && sample.fps > 0).map(sample => sample.fps).sort((a, b) => a - b);
      result.fpsMedian = fps.length ? Math.round(fps[Math.floor(fps.length / 2)] * 10) / 10 : null;
      result.failures.push(...gameplayFailures(result, started));
    }
    result.theme = await themeState(page);
    if (!config.before && !result.theme.root?.themeId) result.failures.push('World theme root missing');
    if (!config.before && fixture && !result.theme.presentation) result.failures.push('Theme preview snapshot missing');
    if (!config.before && fixture && result.theme.presentation?.sectorId !== scenario.sectorId) result.failures.push('Result preview used the wrong sector');
    if (!config.before && fixture && result.theme.presentation?.id !== result.theme.root?.themeId) result.failures.push('Result root did not apply the preview theme');
    if (!config.before && result.theme.root && !result.theme.root.accent) result.failures.push('World accent CSS variable missing');
    if (!config.before && !fixture && result.theme.sprites?.themeId && result.theme.sprites.themeId !== result.theme.root?.themeId) result.failures.push('Sprite and UI themes disagree');
    if (result.theme.reducedMotion !== config.reducedMotion) result.failures.push('Reduced motion preference mismatch');
    if (result.consoleErrors.length || result.pageErrors.length) result.failures.push('Browser errors');
    await page.screenshot({ path: path.join(config.output, result.screenshot), timeout: 20000 });
    result.capturedAt = new Date().toISOString();
    result.status = result.failures.length ? 'failed' : 'passed';
  } catch (error) {
    result.status = 'failed'; result.failure = redact(error.message);
    if (page) await page.screenshot({ path: path.join(config.output, result.screenshot), timeout: 15000 }).catch(() => {});
  } finally {
    await context?.close().catch(() => {});
    process.stdout.write(`${scenario.id}: ${result.status}${result.fpsMedian ? `, ${result.fpsMedian} FPS (short sample)` : ''}\n`);
  }
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function writeReports(report, config) {
  await writeFile(path.join(config.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lines = ['# R world theme gallery', '', `Mode: **${report.mode}**. Status: **${report.status}**.`, '',
    'Mobile 390×844 / DPR 2. Real authored missions and major bosses use autoplay and explicit god mode, with a fresh disposable offline context per capture. Result images use existing guarded production-component fixtures with a synthetic first-mission settlement; only their theme is previewed through the production theme resolver. They do not prove campaign completion.', '',
    `Seed: ${config.seed}. Quality: ${config.quality}. Reduced motion: ${config.reducedMotion}. Build: \`${report.dist}\` (index SHA-256 \`${report.distIndexSha256 ?? 'unavailable'}\`).`, '',
    'Gallery FPS samples describe short captures and are not the ≥30 FPS acceptance gate. Run the separate full-duration mobile mission-1/boss playthrough. This gallery includes result text/control geometry; the complete UI audit remains required.', '',
    '| Sector | Scene | Mission | Status | Median FPS | Screenshot |', '| --- | --- | --- | --- | --- | --- |'];
  for (const result of report.results) lines.push(`| ${result.name} | ${result.kind} | ${result.mission ?? 'fixture'} | ${result.status} | ${result.fpsMedian ?? '—'} | [image](${result.screenshot}) |`);
  for (const result of report.results) for (const failure of [...result.failures, ...(result.failure ? [result.failure] : [])]) lines.push('', `- ${result.id}: ${failure}`);
  for (const note of report.notes) lines.push('', `- ${note}`);
  await writeFile(path.join(config.output, 'report.md'), `${lines.join('\n')}\n`);
  await writeFile(path.join(config.output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>R theme gallery</title><style>body{margin:24px;background:#080b13;color:#e7ebf5;font:15px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,390px));gap:20px}figure{margin:0}img{width:100%;height:auto;image-rendering:pixelated}figcaption{padding:10px 0}a{color:#b5dcff}</style><h1>R themes — ${escapeHtml(report.mode)}</h1><p>${escapeHtml(report.status)} · ${escapeHtml(config.quality)} · reduced motion ${config.reducedMotion} · <a href="report.md">provenance and limitations</a></p><main>${report.results.map(result => `<figure><a href="${escapeHtml(result.screenshot)}"><img loading="lazy" src="${escapeHtml(result.screenshot)}" alt="${escapeHtml(`${result.name}: ${result.kind}`)}"></a><figcaption>${escapeHtml(result.name)} · ${escapeHtml(result.kind)} · ${escapeHtml(result.status)}</figcaption></figure>`).join('')}</main></html>\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  await mkdir(path.dirname(config.output), { recursive: true });
  // Never silently replace before/after evidence from another run.
  await mkdir(config.output, { recursive: false });
  const report = { schemaVersion: 1, mode: config.before ? 'before' : 'after', status: 'running', startedAt: new Date().toISOString(),
    dist: config.dist, seed: config.seed, quality: config.quality, reducedMotion: config.reducedMotion,
    environment: { platform: os.platform(), cpuCount: os.cpus().length, loadAverage: os.loadavg() }, results: [], notes: [] };
  let server; let browser;
  try {
    const campaignBytes = await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'));
    report.campaignSha256 = createHash('sha256').update(campaignBytes).digest('hex');
    const scenarios = themeScenarios(JSON.parse(campaignBytes.toString()), config);
    report.expectedCaptures = scenarios.map(scenario => scenario.id);
    report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
    server = await startStaticServer({ dist: config.dist });
    browser = await launchChrome(); report.browserVersion = browser.version();
    for (const scenario of scenarios) { await captureScenario(browser, server, report, scenario, config); await writeReports(report, config); }
    report.apiRequests = server.requests;
    report.status = report.results.some(result => result.status === 'failed') ? 'failed' : 'passed';
  } catch (error) { report.status = 'failed'; report.notes.push(redact(error.message)); }
  finally {
    await browser?.close().catch(() => {}); await server?.close();
    report.finishedAt = new Date().toISOString(); await writeReports(report, config);
    process.stdout.write(`Report: ${path.join(config.output, 'report.md')}\n`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(report => { if (report.status === 'failed') process.exitCode = 1; })
    .catch(error => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
}
