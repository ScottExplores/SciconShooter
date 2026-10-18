import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { canvasVariance, collectErrors, isolatedContext, launchChrome, redact, samplePage, waitForMission } from './browser.mjs';

// REVAMP(R): Exercise browser lifecycle changes against real built gameplay.
// The only injected mutation is the standard WebGL context-loss extension;
// gameplay, quality and pause use their existing production paths.
export function lifecycleOptions(argv) {
  const config = { dist: path.join(REPO_ROOT, 'dist'), output: `/workspace/scicon-revamp/qa/R-themes/lifecycle-${Date.now()}`,
    mission: 'operation-open-galaxy', seed: 12345, result: true };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--no-result') config.result = false;
    else if (['--dist', '--output', '--mission', '--seed'].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      if (key === '--seed') config.seed = Number(value);
      else if (key === '--mission') config.mission = value;
      else config[key.slice(2)] = path.resolve(value);
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (!Number.isFinite(config.seed)) throw new Error('--seed must be finite');
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(config.mission)) throw new Error('Invalid authored mission ID');
  return config;
}

async function snapshot(page) {
  const game = await samplePage(page);
  return { ...game, ...await page.evaluate(() => ({
    sprites: window.__sciconSpriteThemeQA?.snapshot?.() ?? null,
    background: window.__sciconBackgroundQA?.snapshot?.() ?? null,
    shockwave: window.__sciconShockwaveQA?.snapshot?.() ?? null,
    prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    context: window.__sciconLifecycleContext ? {
      lost: window.__sciconLifecycleContext.lost, restored: window.__sciconLifecycleContext.restored,
    } : null,
  })), capturedAt: new Date().toISOString() };
}

/** A propagated setting is insufficient: optional visible quads must obey it. */
export function motionFailures(sample, quality, reduced) {
  const failures = [];
  if (sample.prefersReducedMotion !== reduced) failures.push('Browser media preference mismatch');
  if (sample.sprites?.quality !== quality) failures.push('Sprite quality preference mismatch');
  if (sample.sprites?.reducedMotion !== reduced) failures.push('Sprite reduced-motion preference mismatch');
  if (sample.background && sample.background.reducedMotion !== reduced) failures.push('Background reduced-motion preference mismatch');
  if (!sample.sprites?.optionalVisible) failures.push('Optional sprite visibility telemetry missing');
  if (quality === 'low') {
    for (const field of ['glow', 'outline', 'shimmer']) if (sample.sprites?.optionalVisible?.[field] !== 0) failures.push(`Low quality retained ${field}`);
  } else if (reduced && sample.sprites?.optionalVisible?.shimmer !== 0) failures.push('Reduced motion retained shimmer');
  if ((quality !== 'high' || reduced) && sample.shockwave?.active) failures.push('Gated shockwave stayed active');
  return failures;
}

async function setQuality(page, mode) {
  await page.evaluate(mode => {
    const key = 'scicon:render-quality:v1', newValue = JSON.stringify({ version: 1, mode });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  }, mode);
  await page.waitForFunction(expected => window.__sciconSpriteThemeQA?.snapshot?.().quality === expected, mode, { timeout: 10000 });
}

async function writeReports(report, config) {
  await writeFile(path.join(config.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lines = ['# R presentation lifecycle', '', `Status: **${report.status}**.`, '',
    `Existing build: \`${report.dist}\`; index SHA-256 \`${report.distIndexSha256 ?? 'unavailable'}\`. Mobile 390×844 / DPR 2, mission \`${config.mission}\`, seed ${config.seed}, autoplay and explicit god mode. Fresh disposable offline contexts; no external requests or API writes.`, '',
    'Real gameplay checks High atlas activation, live OS reduced-motion changes, Low visible-effect gates, pause/resume clocks, and an actual WEBGL_lose_context loss/restore. Result checks use the existing guarded production-component victory fixture. Short FPS samples are descriptive, not the full-duration performance acceptance gate.', '',
    '| Check | Status | Screenshot |', '| --- | --- | --- |'];
  for (const step of report.steps) lines.push(`| ${step.name} | ${step.status} | ${step.screenshot ? `[image](${step.screenshot})` : '—'} |`);
  for (const step of report.steps) if (step.failure) lines.push('', `- ${step.name}: ${step.failure}`);
  for (const note of report.notes) lines.push('', `- ${note}`);
  await writeFile(path.join(config.output, 'report.md'), `${lines.join('\n')}\n`);
}

async function step(report, config, page, name, run) {
  const result = { name, status: 'running', startedAt: new Date().toISOString(), screenshot: `${name}.png` };
  report.steps.push(result);
  try {
    await run(result);
    await page.screenshot({ path: path.join(config.output, result.screenshot), timeout: 20000 });
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.failure = redact(error.message);
    await page.screenshot({ path: path.join(config.output, result.screenshot), timeout: 10000 }).catch(() => {});
    throw error;
  } finally {
    result.finishedAt = new Date().toISOString();
    await writeReports(report, config);
    process.stdout.write(`${name}: ${result.status}\n`);
  }
}

async function gameplay(browser, server, report, config) {
  const context = await isolatedContext(browser, server.origin, 'mobile', { network: report.network });
  const page = await context.newPage();
  page.setDefaultTimeout(15000); collectErrors(page, report);
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const query = new URLSearchParams({ qa: '1', seed: String(config.seed), mission: config.mission, autoplay: '1', skipIntro: '1', god: '1' });
    await page.goto(`${server.origin}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForMission(page);
    await step(report, config, page, '01-high-atlas', async result => {
      await setQuality(page, 'high');
      await page.waitForFunction(() => {
        const state = window.__sciconSpriteThemeQA?.snapshot?.();
        return state?.atlas?.frames >= 4 && state.actorsAnimated > 0;
      }, null, { timeout: 15000 });
      await page.waitForTimeout(700);
      result.sample = await snapshot(page);
      assert.deepEqual(motionFailures(result.sample, 'high', false), []);
      assert.equal(result.sample.state?.worldWidth, 390); assert.equal(result.sample.state?.worldHeight, 844);
      assert.ok(result.sample.sprites.atlas.allocatedBytes > 0, 'No GPU atlas allocated');
      assert.equal(result.sample.sprites.atlas.disabled, false, 'Atlas already fell back before context-loss test');
    });
    await step(report, config, page, '02-live-reduced-motion', async result => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => window.__sciconSpriteThemeQA?.snapshot?.().reducedMotion === true, null, { timeout: 5000 });
      await page.waitForTimeout(400);
      result.sample = await snapshot(page);
      assert.deepEqual(motionFailures(result.sample, 'high', true), []);
    });
    await step(report, config, page, '03-live-motion-restored', async result => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => window.__sciconSpriteThemeQA?.snapshot?.().reducedMotion === false, null, { timeout: 5000 });
      result.sample = await snapshot(page);
      assert.deepEqual(motionFailures(result.sample, 'high', false), []);
    });
    await step(report, config, page, '04-low-effect-gate', async result => {
      await setQuality(page, 'low'); await page.waitForTimeout(400);
      result.sample = await snapshot(page);
      assert.deepEqual(motionFailures(result.sample, 'low', false), []);
      assert.ok(result.sample.sprites.atlas.frames >= 4, 'Low lost its baked source frames');
    });
    await step(report, config, page, '05-pause-clock-freeze', async result => {
      await setQuality(page, 'high');
      await page.locator('.scicon-pause-control').tap();
      await page.getByRole('heading', { name: 'Mission Paused' }).waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
      result.before = await snapshot(page);
      await page.waitForTimeout(850);
      result.after = await snapshot(page);
      assert.equal(result.after.state.frame, result.before.state.frame, 'Simulation advanced while paused');
      assert.equal(result.after.sprites.frame, result.before.sprites.frame, 'Sprite animation clock advanced while paused');
    });
    await step(report, config, page, '06-resume-advances', async result => {
      const before = await snapshot(page);
      await page.getByRole('button', { name: 'Resume Mission', exact: true }).tap();
      await page.locator('.scicon-resume-countdown').waitFor({ state: 'hidden', timeout: 15000 });
      await page.waitForFunction(frame => window.__sciconQA?.state?.().frame > frame + 10, before.state.frame, { timeout: 15000 });
      result.sample = await snapshot(page);
      assert.ok(result.sample.sprites.frame > before.sprites.frame, 'Sprite animation did not resume');
    });
    await step(report, config, page, '07-webgl-context-recovery', async result => {
      result.before = await snapshot(page);
      const supported = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        const state = window.__sciconLifecycleContext = { extension, lost: 0, restored: 0 };
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); state.lost++; });
        canvas.addEventListener('webglcontextrestored', () => { state.restored++; });
        extension.loseContext(); return true;
      });
      assert.ok(supported, 'WEBGL_lose_context unavailable: recovery coverage cannot pass');
      await page.waitForFunction(() => window.__sciconLifecycleContext?.lost === 1, null, { timeout: 5000 });
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__sciconLifecycleContext.extension.restoreContext());
      await page.waitForFunction(() => window.__sciconLifecycleContext?.restored === 1, null, { timeout: 15000 });
      await page.waitForTimeout(600);
      const restored = await snapshot(page);
      await page.waitForFunction(frame => window.__sciconQA?.state?.().frame > frame + 10, restored.state.frame, { timeout: 10000 });
      result.after = await snapshot(page);
      result.canvas = await canvasVariance(page);
      assert.ok(result.after.state.gameActive, 'Gameplay stopped after context restore');
      assert.ok(result.after.sprites.actorsAnimated > 0, 'Derived CPU-backed frames stopped after restore');
      assert.equal(result.after.sprites.atlas.disabled, true, 'Atlas did not invalidate its lost render-target copies');
      assert.ok(result.canvas.variance > 5 && result.canvas.nonBlackFraction > .01, 'Blank canvas after restore');
      assert.deepEqual(result.after.state.errors, []);
      assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.pageErrors, []);
    });
  } finally {
    await page.evaluate(() => {
      const state = window.__sciconLifecycleContext;
      if (state && state.lost > state.restored) state.extension.restoreContext();
    }).catch(() => {});
    await context.close();
  }
}

async function resultMotion(browser, server, report, config) {
  const context = await isolatedContext(browser, server.origin, 'mobile', { network: report.network });
  const page = await context.newPage(); collectErrors(page, report);
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${server.origin}/?qa=1&uiAudit=1&seed=${config.seed}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__sciconUIAudit), null, { timeout: 45000 });
    await page.evaluate(() => window.__sciconUIAudit.present('victory'));
    await page.locator('.wave-victory-overlay').waitFor({ state: 'visible' });
    const fixtureShownAt = Date.now();
    const read = () => page.evaluate(() => {
        const art = document.querySelector('.wave-record-art'), gem = document.querySelector('.result-reward__data');
        const plaque = document.querySelector('.wave-victory-plaque-art');
        return {
          shimmer: art ? { animation: getComputedStyle(art, '::after').animationName, opacity: getComputedStyle(art, '::after').opacity } : null,
          gem: gem ? { animation: getComputedStyle(gem).animationName, opacity: getComputedStyle(gem).opacity } : null,
          crown: plaque ? { animation: getComputedStyle(plaque, '::before').animationName, opacity: getComputedStyle(plaque, '::before').opacity } : null,
        };
      });
    await step(report, config, page, '08-result-metal-shimmer', async result => {
      await page.waitForTimeout(Math.max(0, 7650 - (Date.now() - fixtureShownAt)));
      result.before = await read();
      result.fixtureElapsedSeconds = (Date.now() - fixtureShownAt) / 1000;
      assert.equal(result.before.shimmer?.animation, 'revamp-theme-metal', 'Production result shimmer missing');
      assert.equal(result.before.gem?.animation, 'revamp-theme-gem', 'Production result gem pulse missing');
      assert.ok(Number(result.before.shimmer?.opacity) > .5, 'Metal sweep not visible in its live active window');
    });
    await step(report, config, page, '09-result-live-reduced-motion', async result => {
      result.before = await read();
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200);
      result.reduced = await read();
      assert.equal(result.reduced.shimmer?.animation, 'none'); assert.equal(Number(result.reduced.shimmer?.opacity), 0);
      assert.equal(result.reduced.gem?.animation, 'none'); assert.equal(Number(result.reduced.gem?.opacity), 1);
      assert.equal(result.reduced.crown?.animation, 'none'); assert.equal(Number(result.reduced.crown?.opacity), 1);
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(200);
      result.restored = await read();
      assert.equal(result.restored.shimmer?.animation, result.before.shimmer.animation);
      assert.equal(result.restored.gem?.animation, result.before.gem.animation);
      // Leave the captured fixture in the reduced state for visible proof.
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200);
    });
    await step(report, config, page, '10-crown-alignment-360', async result => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.locator('.wave-victory-crown').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      result.geometry = await page.evaluate(() => {
        const crown = document.querySelector('.wave-victory-crown');
        const plaque = document.querySelector('.wave-victory-plaque-art');
        const image = crown.getBoundingClientRect(), parent = plaque.getBoundingClientRect();
        const pseudo = getComputedStyle(plaque, '::before');
        return {
          viewport: { width: innerWidth, height: innerHeight },
          image: { x: image.x, y: image.y, width: image.width, height: image.height },
          overlay: { x: parent.x + parseFloat(pseudo.left), y: parent.y + parseFloat(pseudo.top), width: parseFloat(pseudo.width), height: parseFloat(pseudo.height) },
          imageFit: getComputedStyle(crown).objectFit, overlayFit: pseudo.backgroundSize,
          sourceSize: { width: crown.naturalWidth, height: crown.naturalHeight }, mask: pseudo.maskImage,
        };
      });
      assert.deepEqual(result.geometry.viewport, { width: 360, height: 640 });
      for (const field of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(result.geometry.image[field] - result.geometry.overlay[field]) < .6, `Crown ${field} misaligned`);
      assert.equal(result.geometry.imageFit, 'contain'); assert.equal(result.geometry.overlayFit, 'contain');
      assert.notEqual(result.geometry.mask, 'none', 'Crown crystal mask missing');
      assert.ok(result.geometry.image.x >= 0 && result.geometry.image.x + result.geometry.image.width <= 360, 'Crown outside phone width');
    });
  } finally { await context.close(); }
}

export async function main(argv = process.argv.slice(2)) {
  const config = lifecycleOptions(argv);
  await mkdir(path.dirname(config.output), { recursive: true }); await mkdir(config.output, { recursive: false });
  const report = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(), dist: config.dist,
    seed: config.seed, mission: config.mission, steps: [], notes: [], consoleErrors: [], pageErrors: [], network: [] };
  let server; let browser;
  try {
    const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
    assert.ok(campaign.levels.some(level => level.id === config.mission), 'Unknown authored mission');
    report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
    server = await startStaticServer({ dist: config.dist }); browser = await launchChrome(); report.browserVersion = browser.version();
    await gameplay(browser, server, report, config).catch(error => report.notes.push(`Gameplay lifecycle: ${redact(error.message)}`));
    if (config.result) await resultMotion(browser, server, report, config).catch(error => report.notes.push(`Result presentation fixture: ${redact(error.message)}`));
    report.apiRequests = server.requests;
    const expectedSteps = config.result ? 10 : 7;
    const observedPulse = report.steps.some(item => item.sample?.shockwave?.active || item.before?.shockwave?.active || item.after?.shockwave?.active);
    if (!observedPulse) report.notes.push('No natural High-quality shockwave pulse was sampled; Low/reduced gating was checked when telemetry was available. Pulse appearance remains gallery/playthrough visual coverage.');
    if (!report.steps.some(item => item.sample?.shockwave)) report.notes.push('Shockwave telemetry unavailable; only sprite effects were checked for High/Low/reduced gating.');
    if (report.steps.length !== expectedSteps) report.notes.push(`Incomplete lifecycle coverage: ${report.steps.length}/${expectedSteps} checks reached.`);
    report.status = report.steps.length === expectedSteps && report.steps.every(item => item.status === 'passed')
      && !report.consoleErrors.length && !report.pageErrors.length ? 'passed' : 'failed';
  } catch (error) { report.status = 'failed'; report.notes.push(redact(error.message)); }
  finally {
    await browser?.close().catch(() => {}); await server?.close(); report.finishedAt = new Date().toISOString();
    await writeReports(report, config); process.stdout.write(`Report: ${path.join(config.output, 'report.md')}\n`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(report => { if (report.status === 'failed') process.exitCode = 1; })
    .catch(error => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
}
