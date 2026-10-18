import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { appFrame, canvasVariance, collectErrors, DEVICES, dismissBaselineOverlays, isolatedContext, launchChrome, redact, samplePage, startBaselineMission, waitForMission } from './browser.mjs';

export function options(argv) {
  const result = { dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa', devices: ['mobile', 'desktop'], seed: 12345, baseline: false, video: true, god: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--baseline') result.baseline = true;
    else if (key === '--no-video') result.video = false;
    else if (key === '--god') result.god = true;
    else if (['--dist', '--output', '--run-id', '--devices', '--stages', '--seed', '--seconds'].includes(key)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      if (key === '--devices') result.devices = value.split(',');
      else if (key === '--stages') result.stages = value.split(',');
      else if (key === '--seed' || key === '--seconds') result[key.slice(2)] = Number(value);
      else result[key === '--run-id' ? 'runId' : key.slice(2)] = value;
    } else throw new Error(`Unknown option: ${key}`);
  }
  if (result.devices.some(device => !DEVICES[device])) throw new Error('--devices must be mobile, desktop, or mobile,desktop');
  if (result.stages?.some(stage => !['start-screen', 'mission-1', 'mid-campaign', 'boss'].includes(stage))) throw new Error('Unknown --stages scenario');
  if (result.baseline && result.stages?.some(stage => !['start-screen', 'mission-1'].includes(stage))) throw new Error('Baseline only supports start-screen and mission-1');
  if (!Number.isFinite(result.seed)) throw new Error('--seed must be finite');
  if (result.seconds !== undefined && (!Number.isFinite(result.seconds) || result.seconds < 1)) throw new Error('--seconds must be positive');
  if (result.runId && !/^[a-zA-Z0-9._-]+$/.test(result.runId)) throw new Error('--run-id must be a simple directory name');
  if (result.baseline && result.god) throw new Error('--god requires QA hooks and cannot be combined with --baseline');
  return result;
}

const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] : null;
const round = value => value == null ? null : Math.round(value * 10) / 10;
const hostSnapshot = () => ({ loadAverage: os.loadavg(), freeMemoryBytes: os.freemem(), totalMemoryBytes: os.totalmem() });

export function summarize(result) {
  const samples = result.samples;
  const fps = samples.filter(sample => sample.state?.gameActive && sample.state.lives > 0 && sample.fps > 0).map(sample => sample.fps);
  const observedFps = fps.length ? fps : samples.map(s => s.browserFps).filter(v => v > 0);
  let livesLost = 0; let deathEvents = 0;
  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1].state?.lives;
    const after = samples[i].state?.lives;
    if (typeof before === 'number' && typeof after === 'number' && before > after) {
      livesLost += before - after;
      if (after <= 0) deathEvents++;
    }
  }
  const times = [0, ...samples.map(sample => sample.seconds), result.actualSeconds ?? samples.at(-1)?.seconds ?? 0];
  const maxSampleGapSeconds = round(Math.max(0, ...times.slice(1).map((time, index) => time - times[index])));
  const shotTimes = (result.screenshots || []).map(shot => shot.capturedAt ? Date.parse(shot.capturedAt) / 1000 : shot.seconds);
  return {
    maxSampleGapSeconds,
    maxScreenshotGapSeconds: round(Math.max(0, ...shotTimes.slice(1).map((time, index) => time - shotTimes[index]))),
    maxSampleDurationSeconds: round(Math.max(0, ...samples.map(sample => sample.sampleDurationSeconds || 0))),
    fpsSource: fps.length ? 'game-render-loop' : 'browser-rAF (game telemetry unavailable)',
    fpsMedian: round(percentile(observedFps, 0.5)), fpsP10: round(percentile(observedFps, 0.1)), fpsMin: observedFps.length ? round(Math.min(...observedFps)) : null,
    maxEnemyBullets: samples.some(s => s.counts) ? Math.max(...samples.map(s => s.counts?.enemyBullets || 0)) : null,
    maxEnemies: samples.some(s => s.counts) ? Math.max(...samples.map(s => s.counts?.enemies || 0)) : null,
    livesLost: samples.some(s => s.state) ? livesLost : null,
    deaths: samples.some(s => s.state) ? deathEvents : null,
    firstGameOverSeconds: samples.find(s => s.state && s.state.lives <= 0)?.seconds ?? null,
    activeSamples: samples.filter(s => s.state?.gameActive && s.state.lives > 0).length,
    bossObserved: samples.some(s => s.state?.bossHp > 0),
    worldSizes: [...new Set(samples.filter(s => s.state?.worldWidth).map(s => `${s.state.worldWidth}x${s.state.worldHeight}`))],
  };
}

async function ffmpeg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', data => { error = (error + data).slice(-2000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${redact(error)}`)));
  });
}

async function clips(videoPath, directory, duration, result) {
  try {
    await access('/usr/bin/ffmpeg');
    const seconds = Math.min(10, Math.max(8, duration));
    const start = (result.videoGameplayStartSeconds || 0) + Math.max(0, Math.min(10, duration - seconds));
    const mp4 = path.join(directory, 'clip.mp4');
    const gif = path.join(directory, 'clip.gif');
    await ffmpeg(['-ss', String(start), '-i', videoPath, '-t', String(seconds), '-an', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    await ffmpeg(['-ss', String(start), '-i', videoPath, '-t', String(seconds), '-filter_complex_threads', '1', '-vf', 'fps=10,scale=390:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', gif]);
    result.video = { webm: path.relative(result.runDir, videoPath), mp4: path.relative(result.runDir, mp4), gif: path.relative(result.runDir, gif), clipStartSeconds: start, clipSeconds: seconds };
  } catch (error) { result.notes.push(`Clip conversion unavailable: ${redact(error.message)}`); }
}

async function capture(page, result, directory, label, seconds = 0) {
  const name = `${String(result.screenshots.length).padStart(3, '0')}-${label.replace(/[^a-z0-9-]/gi, '-').slice(0, 70)}.png`;
  const startedAt = Date.now();
  await page.screenshot({ path: path.join(directory, name), timeout: 15000 });
  result.screenshots.push({ path: path.relative(result.runDir, path.join(directory, name)), event: label, seconds: round(seconds), capturedAt: new Date().toISOString(), captureDurationSeconds: round((Date.now() - startedAt) / 1000) });
}

async function runStage(browser, server, report, config, device, stage) {
  const directory = path.join(report.artifactDir, device, stage.id);
  await mkdir(directory, { recursive: true });
  const result = { device, stage: stage.id, requestedSeconds: stage.seconds, query: stage.query, status: 'running', hostStart: hostSnapshot(), notes: [], samples: [], screenshots: [], consoleErrors: [], pageErrors: [], network: [], runDir: report.artifactDir };
  report.results.push(result);
  let context; let page; let video;
  try {
    context = await isolatedContext(browser, server.origin, device, { videoDir: config.video ? directory : undefined, network: result.network });
    const videoStartedAt = Date.now();
    page = await context.newPage(); video = page.video();
    collectErrors(page, result);
    const response = await page.goto(`${server.origin}/${stage.query}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (response?.status() !== 200) throw new Error(`Document returned ${response?.status()}`);
    const game = await appFrame(page, device);
    if (stage.id === 'start-screen') {
      await game.locator('[data-onboarding-target="campaign-start"]:visible').first().waitFor({ state: 'visible', timeout: 45000 });
      await capture(page, result, directory, 'start-screen');
      result.status = result.pageErrors.length || result.consoleErrors.length ? 'failed' : 'passed';
      return;
    }
    if (config.baseline) {
      await startBaselineMission(game);
      await page.keyboard.down('Space');
      result.notes.push('Baseline has no QA bridge: browser rAF and canvas evidence only. Input uses a held-pointer horizontal sweep with Space auto-fire; delayed story and guidance prompts are dismissed through their visible controls. Combat progress requires screenshot review; no enemy telemetry is available.');
    } else {
      const started = await waitForMission(game);
      const expectedMission = new URLSearchParams(stage.query).get('mission');
      if (expectedMission && started.state.levelId !== expectedMission) {
        throw new Error(`Expected mission ${expectedMission}, received ${started.state.levelId}`);
      }
    }
    result.started = true;
    result.videoGameplayStartSeconds = (Date.now() - videoStartedAt) / 1000;
    result.canvas = await canvasVariance(game);
    await capture(page, result, directory, 'mission-start');
    const start = Date.now(); let nextShot = 5; let lastKey = ''; let lastState = null;
    while (Date.now() - start < stage.seconds * 1000) {
      const elapsed = (Date.now() - start) / 1000;
      if (config.baseline) {
        if (await dismissBaselineOverlays(game)) {
          result.baselinePointerDown = false;
          await page.keyboard.down('Space');
        }
        // Baseline fallback is visibly different from the runtime dodge bot.
        const canvas = game.locator('canvas').first();
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width * (0.5 + Math.sin(elapsed * 0.8) * 0.33), box.y + box.height * 0.8);
          if (!result.baselinePointerDown) { await page.mouse.down(); result.baselinePointerDown = true; }
        }
      }
      const samplingStartedAt = Date.now();
      const observation = await samplePage(game);
      const observedSeconds = (Date.now() - start) / 1000;
      const sample = { seconds: round(observedSeconds), sampleDurationSeconds: round((Date.now() - samplingStartedAt) / 1000), ...observation };
      result.samples.push(sample);
      const state = sample.state;
      const key = state ? `${state.waveId ?? state.wave}:${state.lives}:${state.bossPhase}:${state.gameActive}` : 'bridge-unavailable';
      if (observedSeconds >= nextShot) { await capture(page, result, directory, `time-${Math.floor(observedSeconds)}s`, observedSeconds); nextShot = (Math.floor(observedSeconds / 5) + 1) * 5; }
      if (lastKey && key !== lastKey) {
        const label = !state || !lastState ? 'run-state' : state.lives < lastState.lives ? 'life-loss' : state.bossPhase !== lastState.bossPhase ? 'boss-phase' : state.gameActive !== lastState.gameActive ? 'run-state' : 'wave-change';
        await capture(page, result, directory, label, observedSeconds);
      }
      lastKey = key; lastState = state;
      await page.waitForTimeout(1000);
    }
    result.actualSeconds = round((Date.now() - start) / 1000);
    await capture(page, result, directory, 'mission-end', result.actualSeconds);
    Object.assign(result, summarize(result));
    if (result.firstGameOverSeconds !== null) result.notes.push(`Ship lost at observed ${result.firstGameOverSeconds}s; remaining capture shows the result screen.`);
    const errors = [...result.pageErrors, ...result.consoleErrors, ...result.samples.flatMap(s => s.state?.errors || [])];
    const failures = [];
    if (errors.length) failures.push('Browser/runtime errors observed');
    if (!(result.canvas.variance > 5 && result.canvas.nonBlackFraction > 0.01)) failures.push('Canvas appears blank');
    if (!config.baseline && (result.fpsSource !== 'game-render-loop' || !(result.fpsMedian >= 30))) failures.push('Median active-game FPS below 30 or game telemetry missing');
    if (result.maxSampleGapSeconds > 10 || result.maxSampleDurationSeconds > 10 || result.maxScreenshotGapSeconds > 10) failures.push('Capture stalled for more than 10 seconds; gameplay evidence is incomplete');
    const gameSamples = result.samples.filter(sample => sample.state);
    if (!config.baseline && !(gameSamples.at(-1)?.state.frame > gameSamples[0]?.state.frame)) failures.push('Simulation frame counter did not advance');
    if (!config.baseline && stage.id === 'boss' && !result.bossObserved) failures.push('No boss HP observed in boss scenario');
    result.failures = failures;
    result.status = failures.length ? 'failed' : config.baseline ? 'baseline-observation' : 'passed';
  } catch (error) {
    result.status = 'failed'; result.failure = redact(error.message);
    if (page) await capture(page, result, directory, 'failure').catch(() => {});
  } finally {
    if (!result.fpsSource && result.samples.length) Object.assign(result, summarize(result));
    if (result.baselinePointerDown) await page?.mouse.up().catch(() => {});
    if (config.baseline) await page?.keyboard.up('Space').catch(() => {});
    await context?.close().catch(() => {});
    if (video) {
      const videoPath = await video.path().catch(() => null);
      if (videoPath) {
        result.video = { webm: path.relative(report.artifactDir, videoPath) };
        if (stage.id !== 'start-screen' && result.actualSeconds >= 8) await clips(videoPath, directory, result.actualSeconds, result);
      }
    }
    delete result.runDir;
    result.hostEnd = hostSnapshot();
    process.stdout.write(`${device}/${stage.id}: ${result.status}${result.fpsMedian ? `, median ${result.fpsMedian} fps` : ''}\n`);
  }
}

async function writeReports(report) {
  const lines = ['# SciCon Shooter QA playthrough', '', `Run: \`${report.runId}\` · mode: **${report.mode}** · status: **${report.status}**`, '', `Seed: ${report.mode === 'baseline' ? 'uncontrolled (baseline)' : report.seed}. God mode: ${report.god}. Browser: playwright-core + system Chrome SwiftShader.`, '', 'Each scenario uses a fresh browser context. All remote requests are fulfilled offline; no external API writes occur. FPS is sampled once per second; screenshot/video overhead is included. Lives lost counts damage; deaths counts observed transitions from positive lives to zero. Counts are sampled lower bounds, especially when capture gaps occur.', '', '| Device | Scenario | Status | FPS median / p10 | Max enemy bullets | Lives lost / deaths | Max sample gap (s) | Errors |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const result of report.results) lines.push(`| ${result.device} | ${result.stage} | ${result.status} | ${result.fpsMedian ?? '—'} / ${result.fpsP10 ?? '—'} | ${result.maxEnemyBullets ?? '—'} | ${result.livesLost ?? '—'} / ${result.deaths ?? '—'} | ${result.maxSampleGapSeconds ?? '—'} | ${result.pageErrors.length + result.consoleErrors.length} |`);
  lines.push('', '## Coverage and observations', '');
  if (report.environment) lines.push(`- Host: ${report.environment.platform}/${report.environment.arch}, ${report.environment.cpuCount} logical CPUs (${report.environment.availableParallelism} available); Chrome ${report.environment.browserVersion ?? 'unavailable'}.`, `- Host load average (1/5/15m), start: ${report.environment.start.loadAverage.map(round).join(' / ')}; end: ${report.environment.end?.loadAverage.map(round).join(' / ') ?? 'running'}. Free memory at start: ${Math.round(report.environment.start.freeMemoryBytes / 1024 ** 2)} MiB. Load is recorded as context; it does not relax the FPS gate.`);
  for (const note of report.notes) lines.push(`- ${note}`);
  for (const result of report.results) {
    for (const note of [...result.notes, ...(result.failures || []), ...(result.failure ? [result.failure] : [])]) lines.push(`- ${result.device}/${result.stage}: ${note}`);
    for (const error of [...new Set([...result.pageErrors, ...result.consoleErrors])]) lines.push(`- ${result.device}/${result.stage} error: ${error.replaceAll('\n', ' ')}`);
  }
  lines.push('', '## Images and video', '');
  for (const result of report.results) {
    lines.push(`### ${result.device} / ${result.stage}`, '');
    if (result.video) lines.push(Object.entries(result.video).filter(([key]) => ['webm', 'mp4', 'gif'].includes(key)).map(([key, value]) => `[${key}](${value})`).join(' · '), '');
    for (const screenshot of result.screenshots) lines.push(`- [${screenshot.seconds}s ${screenshot.event}](${screenshot.path})`);
    lines.push('');
  }
  await writeFile(path.join(report.artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(report.artifactDir, 'report.md'), `${lines.join('\n')}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  const runId = config.runId || `${new Date().toISOString().replace(/[:.]/g, '-')}${config.baseline ? '-baseline' : ''}`;
  const artifactDir = path.resolve(config.output, runId);
  await mkdir(path.dirname(artifactDir), { recursive: true });
  await mkdir(artifactDir, { recursive: false });
  const report = { schemaVersion: 1, runId, artifactDir, startedAt: new Date().toISOString(), environment: { platform: os.platform(), arch: os.arch(), cpuCount: os.cpus().length, availableParallelism: os.availableParallelism(), start: hostSnapshot() }, mode: config.baseline ? 'baseline' : config.stages ? 'targeted-diagnostic' : config.seconds ? 'short-diagnostic' : 'full', seed: config.seed, god: config.god, recordVideo: config.video, dist: path.resolve(config.dist), devices: config.devices.map(name => ({ name, ...DEVICES[name] })), results: [], notes: [], status: 'running' };
  let server; let browser;
  try {
    const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
    const levels = [...campaign.levels].sort((a, b) => a.order - b.order);
    const first = levels[0]; const mid = levels[Math.floor((levels.length - 1) / 2)];
    const isMajorBoss = event => event.kind === 'boss' && Boolean(event.rigId);
    const bossLevel = levels.find(level => level.waves.some(wave => wave.events.some(isMajorBoss)))
      ?? levels.find(level => level.waves.some(wave => wave.events.some(event => event.kind === 'boss')));
    const bossEvents = bossLevel?.waves.flatMap(wave => wave.events) ?? [];
    const boss = bossEvents.find(isMajorBoss) ?? bossEvents.find(event => event.kind === 'boss');
    const query = extra => `?${new URLSearchParams({ qa: '1', seed: String(config.seed), autoplay: '1', skipIntro: '1', ...(config.god ? { god: '1' } : {}), ...extra })}`;
    const stages = [{ id: 'start-screen', seconds: 0, query: '' }, { id: 'mission-1', seconds: config.seconds || 60, query: config.baseline ? '' : query({ mission: first.id }) }];
    if (!config.baseline) stages.push({ id: 'mid-campaign', seconds: config.seconds || 45, query: query({ mission: mid.id }) }, { id: 'boss', seconds: config.seconds || 45, query: query({ bosslab: boss?.id || 'first', mission: bossLevel?.id || first.id }) });
    else report.notes.push('Untouched baseline has no deterministic flags or state bridge. Mid-campaign and boss jumps are unavailable and were not counted as passed.');
    if (config.seconds) report.notes.push(`Short diagnostic override: ${config.seconds}s per mission; this does not replace the full 60/45/45s run.`);
    if (config.stages) report.notes.push(`Targeted scenarios: ${config.stages.join(', ')}; this does not replace full scenario coverage.`);
    report.notes.push(`Mission 1: ${first.id}; midpoint: ${mid.id}; boss: ${boss?.id ?? 'first'} (mission fallback ${bossLevel?.id ?? first.id}).`);
    report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
    server = await startStaticServer({ dist: config.dist });
    browser = await launchChrome({ video: config.video });
    report.environment.browserVersion = browser.version();
    for (const device of config.devices) for (const stage of stages.filter(stage => !config.stages || config.stages.includes(stage.id))) { await runStage(browser, server, report, config, device, stage); await writeReports(report); }
    report.apiRequests = server.requests;
    report.status = report.results.some(r => r.status === 'failed') ? 'failed' : config.baseline ? 'baseline-observation' : 'passed';
    const worlds = report.results.flatMap(r => r.worldSizes || []);
    if (new Set(worlds).size > 1) { report.status = 'failed'; report.notes.push(`World-size mismatch: ${[...new Set(worlds)].join(', ')}`); }
  } catch (error) { report.status = 'failed'; report.notes.push(redact(error.message)); }
  finally {
    await browser?.close().catch(() => {}); await server?.close();
    report.finishedAt = new Date().toISOString();
    report.environment.end = hostSnapshot();
    await writeReports(report);
    process.stdout.write(`Report: ${path.join(artifactDir, 'report.md')}\n`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(report => { if (report.status === 'failed') process.exitCode = 1; }).catch(error => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
}
