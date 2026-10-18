// Output-resolution transitions through real settings; no runtime mutation or FPS gate.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startStaticServer, REPO_ROOT } from '../qa/server.mjs';
import { appFrame, collectErrors, DEVICES, isolatedContext, launchChrome, redact, waitForMission } from '../qa/browser.mjs';

const DEVICES_TO_CHECK = ['360x640', 'mobile', 'desktop'];
const MODES = ['high', 'low', 'high'];
const WORLD = { width: 390, height: 844 };

export function options(argv) {
  const config = { dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa/L-raster-check' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i];
    if (!['--dist', '--output'].includes(key)) throw new Error(`Unknown option: ${key}`);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    config[key.slice(2)] = path.resolve(value);
  }
  return config;
}

async function snapshot(game) {
  const value = await game.evaluate(() => {
    const canvas = document.querySelector('.scicon-game-stage canvas');
    const rect = canvas?.getBoundingClientRect(), style = canvas && getComputedStyle(canvas);
    const renderer = window.__sciconPerf?.snapshot();
    return {
      devicePixelRatio: window.devicePixelRatio,
      state: window.__sciconQA?.state?.() ?? null,
      renderer: renderer ? { resolution: renderer.resolution, quality: renderer.quality } : null,
      canvas: canvas ? {
        backing: { width: canvas.width, height: canvas.height },
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        style: { width: canvas.style.width, height: canvas.style.height, left: canvas.style.left, top: canvas.style.top, imageRendering: canvas.style.imageRendering },
        computed: { width: style.width, height: style.height, imageRendering: style.imageRendering },
      } : null,
    };
  });
  if (value.state?.errors) value.state.errors = value.state.errors.map(redact);
  return value;
}

function validatePhase(phase, baseline, fullResolution, expectedDpr) {
  const check = (condition, message) => { if (!condition) phase.failures.push(message); };
  const { observed } = phase, canvas = observed?.canvas, state = observed?.state;
  check(Boolean(canvas), 'Gameplay canvas missing');
  check(observed?.devicePixelRatio === expectedDpr, 'Device DPR differs from its configured fixture');
  check(observed?.renderer?.resolution === phase.expectedResolution, 'Renderer resolution did not match the selected mode');
  check(observed?.renderer?.quality?.tier === phase.mode, 'Selected quality did not reach the renderer');
  check(state?.worldWidth === WORLD.width && state?.worldHeight === WORLD.height, 'Simulation world changed from 390x844');
  check(state?.gameActive === true && state?.frame > phase.frameBefore, 'Simulation did not remain active and advance');
  check(state?.god === false, 'Transition diagnostic unexpectedly enabled god mode');
  if (!canvas) return;
  check(canvas.backing.width === WORLD.width * phase.expectedResolution && canvas.backing.height === WORLD.height * phase.expectedResolution, 'Backing dimensions do not match world size times resolution');
  const reduced = phase.expectedResolution < fullResolution;
  check(reduced ? canvas.computed.imageRendering === 'pixelated' : canvas.computed.imageRendering !== 'pixelated', 'Pixelated canvas scaling must apply only below full resolution');
  if (!baseline?.canvas) return;
  for (const key of ['x', 'y', 'width', 'height']) check(Math.abs(canvas.rect[key] - baseline.canvas.rect[key]) < 0.05, `Canvas CSS rectangle ${key} changed across the quality transition`);
  for (const key of ['width', 'height', 'left', 'top']) check(canvas.style[key] === baseline.canvas.style[key], `Canvas inline ${key} changed across the quality transition`);
  check(state?.levelId === baseline.state?.levelId, 'Mission changed during the transition diagnostic');
  if (!reduced) check(canvas.style.imageRendering === baseline.canvas.style.imageRendering, 'Full resolution did not restore the original image-rendering style');
}

async function checkDevice(browser, server, config, device, missionId) {
  const result = { device, status: 'running', consoleErrors: [], pageErrors: [], failures: [], phases: [], network: [] };
  const directory = path.join(config.output, device);
  await mkdir(directory);
  const context = await isolatedContext(browser, server.origin, device, { network: result.network });
  try {
    const page = await context.newPage();
    collectErrors(page, result);
    const query = new URLSearchParams({ qa: '1', seed: '12345', autoplay: '1', skipIntro: '1', perf: '1', mission: missionId });
    await page.goto(`${server.origin}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const game = await appFrame(page, device);
    await waitForMission(game);
    await game.waitForFunction(() => Boolean(window.__sciconPerf), null, { timeout: 30000 });
    const expectedDpr = DEVICES[device].deviceScaleFactor, fullResolution = Math.min(2, expectedDpr);
    let baseline;
    for (const [index, mode] of MODES.entries()) {
      const phase = { mode, expectedResolution: mode === 'low' ? 1 : fullResolution, frameBefore: await game.evaluate(() => window.__sciconQA.state().frame), failures: [] };
      result.phases.push(phase);
      try {
        // QA has now installed its disposable storage. Exercise the persisted
        // preference and its real listener, just like the profile diagnostic.
        await game.evaluate(mode => {
          const key = 'scicon:render-quality:v1', newValue = JSON.stringify({ version: 1, mode });
          localStorage.setItem(key, newValue);
          window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
        }, mode);
        await game.waitForFunction(({ resolution, mode, frame }) => {
          const renderer = window.__sciconPerf?.snapshot(), state = window.__sciconQA?.state?.();
          return renderer?.resolution === resolution && renderer.quality?.tier === mode && state?.gameActive && state.frame > frame + 3;
        }, { resolution: phase.expectedResolution, mode, frame: phase.frameBefore }, { timeout: 30000, polling: 100 });
      } catch (error) { phase.failures.push(redact(error.message)); }
      phase.observed = await snapshot(game);
      phase.frameAdvance = (phase.observed.state?.frame ?? phase.frameBefore) - phase.frameBefore;
      validatePhase(phase, baseline, fullResolution, expectedDpr);
      baseline ??= phase.observed;
      phase.screenshot = `${device}/${String(index + 1).padStart(2, '0')}-${mode}${index === 2 ? '-restored' : ''}.png`;
      try { await page.screenshot({ path: path.join(config.output, phase.screenshot), timeout: 45000 }); }
      catch (error) { phase.failures.push(`Screenshot: ${redact(error.message)}`); }
      phase.status = phase.failures.length ? 'failed' : 'passed';
    }
  } catch (error) { result.failures.push(redact(error.message)); }
  finally { await context.close(); }
  result.runtimeErrors = [...new Set(result.phases.flatMap(phase => phase.observed?.state?.errors ?? []))];
  result.status = result.phases.length === MODES.length && result.phases.every(phase => phase.status === 'passed')
    && !result.failures.length && !result.pageErrors.length && !result.consoleErrors.length && !result.runtimeErrors.length ? 'passed' : 'failed';
  console.log(`${device}: ${result.status}; ${result.phases.map(phase => `${phase.mode}=${phase.observed?.renderer?.resolution ?? 'missing'}`).join(' → ')}`);
  return result;
}

async function writeReport(report, output) {
  const lines = ['# Raster transition diagnostic', '', `Status: **${report.status}**. Build index SHA-256: \`${report.indexSha256}\`.`, '',
    'Sequential High → Low → High through the real persisted setting, normal damage, offline QA, no simulation mutations. This checks resolution, CSS layout, world size and frame advancement; it is not an FPS benchmark or evidence for automatic fallback.', '',
    '| Device | Mode | Resolution | Backing | World | Frames advanced | Result | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const result of report.results) for (const phase of result.phases) {
    const { canvas, state, renderer } = phase.observed ?? {};
    lines.push(`| ${result.device} | ${phase.mode} | ${renderer?.resolution ?? 'missing'} | ${canvas ? `${canvas.backing.width}x${canvas.backing.height}` : 'missing'} | ${state ? `${state.worldWidth}x${state.worldHeight}` : 'missing'} | ${phase.frameAdvance ?? 0} | ${phase.status} | [image](${phase.screenshot}) |`);
  }
  lines.push('', '## Failures', '');
  const failures = [...report.failures, ...report.results.flatMap(result => [
    ...result.failures.map(message => `${result.device}: ${message}`),
    ...[...result.pageErrors, ...result.consoleErrors, ...(result.runtimeErrors ?? [])].map(message => `${result.device}: ${message}`),
    ...result.phases.flatMap(phase => phase.failures.map(message => `${result.device}/${phase.mode}: ${message}`)),
  ])];
  lines.push(...(failures.length ? failures.map(message => `- ${message.replaceAll('\n', ' ')}`) : ['None recorded.']), '');
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(output, 'report.md'), `${lines.join('\n')}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  const indexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
  const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
  const missionId = [...campaign.levels].sort((a, b) => a.order - b.order)[0].id;
  await mkdir(path.dirname(config.output), { recursive: true });
  await mkdir(config.output); // Preserve prior evidence; reruns need a new output directory.
  const report = { status: 'running', startedAt: new Date().toISOString(), dist: config.dist, indexSha256, missionId, results: [], failures: [] };
  let server, browser;
  try {
    server = await startStaticServer({ dist: config.dist });
    browser = await launchChrome();
    report.browserVersion = browser.version();
    for (const device of DEVICES_TO_CHECK) {
      report.results.push(await checkDevice(browser, server, config, device, missionId));
      await writeReport(report, config.output);
    }
    report.status = report.results.every(result => result.status === 'passed') ? 'passed' : 'failed';
  } catch (error) {
    report.failures.push(redact(error.message));
    report.status = 'failed';
  } finally {
    await browser?.close();
    await server?.close();
    if (report.status === 'running') report.status = 'failed';
    report.finishedAt = new Date().toISOString();
    await writeReport(report, config.output);
  }
  console.log(`Raster diagnostic: ${path.join(config.output, 'report.md')} (${report.status})`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(report => { if (report.status !== 'passed') process.exitCode = 1; })
    .catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
}
