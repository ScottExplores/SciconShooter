// REVAMP(S): Observe real kills; video extraction keeps PNG readback out of the death sequence.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { collectErrors, isolatedContext, launchChrome, redact, samplePage, waitForMission } from './browser.mjs';

export function captureOptions(argv) {
  const config = { phase: 'after', dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa/S-explosions', timeout: 180, reducedMotion: false, quality: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i];
    if (option === '--reduced-motion') { config.reducedMotion = true; continue; }
    if (!['--phase', '--dist', '--output', '--timeout', '--stages', '--quality'].includes(option)) throw new Error(`Unknown option: ${option}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    config[option.slice(2)] = option === '--timeout' ? Number(value) : option === '--stages' ? value.split(',') : value;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(config.phase)) throw new Error('Phase must be a simple directory name');
  if (!Number.isFinite(config.timeout) || config.timeout < 10) throw new Error('Timeout must be at least 10 seconds');
  if (!['auto', 'high', 'low'].includes(config.quality)) throw new Error('Quality must be auto, high, or low');
  config.stages ??= ['boss', 'regular'];
  if (config.stages.some(stage => !['boss', 'regular', 'mini'].includes(stage))) throw new Error('Stages must be boss,regular,mini');
  return config;
}

async function ffmpeg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', data => { error = (error + data).slice(-2000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${redact(error)}`)));
  });
}

/** Stable snapshot identity includes lazy chunks and every art/font/audio file. */
export async function writeBuildManifest(dist, destination) {
  const files = [];
  const walk = async relative => {
    const entries = await readdir(path.join(dist, relative), { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) continue;
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of createReadStream(path.join(dist, file))) { hash.update(chunk); bytes += chunk.length; }
      files.push({ file, bytes, sha256: hash.digest('hex') });
    }
  };
  await walk('');
  const sha256 = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  await writeFile(destination, `${JSON.stringify({ dist: path.resolve(dist), sha256, files }, null, 2)}\n`);
  return sha256;
}

async function videoDuration(video) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]);
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.once('error', reject);
    child.once('exit', code => code === 0 && Number.isFinite(Number(output.trim()))
      ? resolve(Number(output.trim())) : reject(new Error('Cannot read recorded video duration')));
  });
}

export async function extractSequence(video, directory, eventSeconds, kind, recordingEndWallSeconds) {
  const recordedDurationSeconds = await videoDuration(video);
  // Playwright recordings can drift from wall time under CPU pressure. The
  // nearby recording end is a better anchor than page creation for this window.
  const clockOffsetSeconds = Number.isFinite(recordingEndWallSeconds)
    ? recordedDurationSeconds - recordingEndWallSeconds : 0;
  const estimatedEventVideoSeconds = eventSeconds + clockOffsetSeconds;
  // Preserve the approach/ignition despite video-clock drift on a contended host.
  const startSeconds = Math.max(0, estimatedEventVideoSeconds - 1.5);
  const durationSeconds = kind === 'regular' ? 3.2 : 5.5;
  await ffmpeg(['-ss', String(startSeconds), '-i', video, '-t', String(durationSeconds), '-vf', 'fps=20/3', '-start_number', '0', path.join(directory, 'frame-%03d.png')]);
  await ffmpeg(['-ss', String(startSeconds), '-i', video, '-t', String(durationSeconds), '-an', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(directory, 'sequence.mp4')]);
  const files = (await readdir(directory)).filter(file => /^frame-\d+\.png$/.test(file)).sort();
  await ffmpeg(['-framerate', '20/3', '-i', path.join(directory, 'frame-%03d.png'), '-vf', `crop=390:330:0:90,scale=195:165:flags=neighbor,tile=6x${Math.ceil(files.length / 6)}`, '-frames:v', '1', path.join(directory, 'contact-sheet.png')]);
  return { startSeconds, durationSeconds, recordedDurationSeconds, recordingEndWallSeconds,
    clockOffsetSeconds, estimatedEventVideoSeconds, alignment: 'End-aligned video-clock estimate; inspect frames to verify coverage',
    frameIntervalMs: 150, frames: files.map((file, index) => ({ file, videoSeconds: Math.round((startSeconds + index * 0.15) * 1000) / 1000, relativeToEstimatedDeathMs: Math.round((startSeconds + index * 0.15 - estimatedEventVideoSeconds) * 1000) })), clip: 'sequence.mp4', contactSheet: 'contact-sheet.png' };
}

async function captureStage(browser, server, config, stage, directory, mission) {
  await mkdir(directory, { recursive: true });
  const result = { stage, query: `?qa=1&${stage === 'boss' ? 'bosslab=first' : `mission=${mission}`}&autoplay=1&skipIntro=1&god=1&seed=12345`, samples: [], consoleErrors: [], pageErrors: [], network: [], status: 'running' };
  const context = await isolatedContext(browser, server.origin, 'mobile', { videoDir: directory, network: result.network });
  let video; let page; let videoStart;
  try {
    videoStart = Date.now();
    page = await context.newPage();
    if (config.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    video = page.video();
    collectErrors(page, result);
    await page.goto(`${server.origin}/${result.query}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForMission(page);
    await page.evaluate(mode => {
      // Only a presentation preference changes; QA storage is disposable.
      const key = 'scicon:render-quality:v1';
      localStorage.setItem(key, JSON.stringify({ version: 1, mode }));
      dispatchEvent(new StorageEvent('storage', { key }));
    }, config.quality);
    await page.screenshot({ path: path.join(directory, 'mission-start.png') });
    const started = Date.now();
    let previous; let seenBoss = false; let lastLog = 0;
    while (Date.now() - started < config.timeout * 1000) {
      const samplingStartedAt = Date.now();
      const observation = await samplePage(page);
      const sample = { videoSeconds: (Date.now() - videoStart) / 1000,
        collectionDurationMs: Date.now() - samplingStartedAt, ...observation };
      result.samples.push(sample);
      const state = sample.state;
      if (state?.bossHp > 0) seenBoss = true;
      // The read-only bridge falls back to miniBossRef during Mission 1's finale.
      const bossDeath = stage !== 'regular' && seenBoss && (state?.bossHp === null || state?.bossHp <= 0);
      const regularDeath = stage === 'regular' && previous?.state && state?.score > previous.state.score && state.enemies < previous.state.enemies;
      if (!result.event && (bossDeath || regularDeath)) {
        result.event = { videoSeconds: sample.videoSeconds, timestampClock: 'wall time since page creation; see sequence alignment for estimated video timestamp', observation: bossDeath ? 'boss HP reached zero or boss removed after positive HP' : 'score increased while enemy count decreased', previous: previous?.state, state };
        process.stdout.write(`${stage}: natural defeat observed at wall ${sample.videoSeconds.toFixed(2)}s\n`);
      }
      if (result.event && sample.videoSeconds >= result.event.videoSeconds + (stage === 'regular' ? 1.7 : 4)) break;
      previous = sample;
      if (Date.now() - lastLog > 10000) {
        process.stdout.write(`${stage}: HP ${state?.bossHp ?? 'none'}, score ${state?.score}, FPS ${sample.fps}\n`);
        lastLog = Date.now();
      }
      await page.waitForTimeout(75);
    }
    await page.screenshot({ path: path.join(directory, 'sequence-end.png') });
    if (!result.event) throw new Error(`No natural ${stage} defeat observed in ${config.timeout}s`);
    const fps = result.samples.filter(sample => sample.state?.gameActive && sample.fps > 0).map(sample => sample.fps).sort((a, b) => a - b);
    result.fpsMedian = fps.length ? fps[Math.floor(fps.length / 2)] : null;
    result.status = result.pageErrors.length || result.consoleErrors.length ? 'failed' : 'passed';
  } catch (error) {
    result.status = 'failed'; result.failure = redact(error.message);
    await page?.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
  } finally {
    result.recordingEndWallSeconds = (Date.now() - videoStart) / 1000;
    await context.close();
    if (video) {
      result.video = path.basename(await video.path());
      if (result.event) result.sequence = await extractSequence(path.join(directory, result.video), directory, result.event.videoSeconds, stage, result.recordingEndWallSeconds);
    }
    await writeFile(path.join(directory, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

export async function runCapture(config) {
  const directory = path.join(config.output, config.phase);
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  const report = { phase: config.phase, dist: path.resolve(config.dist), reducedMotion: config.reducedMotion, quality: config.quality, startedAt: new Date().toISOString(), status: 'running', results: [], notes: ['Natural seeded campaign kills, observed through the read-only QA bridge; no HP, simulation-clock, or reward mutations.', 'All external browser traffic is fulfilled offline by the existing QA fixture helpers.', 'PNG frames are extracted from Playwright video at 150 ms intervals. Death observations use elapsed wall time with a 75 ms polling interval plus recorded collection latency. Extraction aligns to video end and includes 1.5 seconds of lead-in; estimated event timestamps still require visual coverage review.', 'Capture FPS includes video overhead. Use qa:playthrough for the standard performance gate.'] };
  report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
  report.distManifestSha256 = await writeBuildManifest(config.dist, path.join(directory, 'build-manifest.json'));
  const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
  const firstMission = [...campaign.levels].sort((a, b) => a.order - b.order)[0];
  const mission = firstMission.id;
  const miniEvent = firstMission.waves.flatMap(wave => wave.events).find(event => event.kind === 'boss' && !event.rigId);
  if (config.stages.includes('mini') && !miniEvent) throw new Error('First mission has no authored mini-boss; select an authored encounter before capturing');
  report.mission = mission;
  if (config.stages.includes('mini')) report.miniBossEvent = { id: miniEvent.id, bossId: miniEvent.bossId };
  const server = await startStaticServer({ dist: config.dist });
  const browser = await launchChrome({ video: true });
  try {
    for (const stage of config.stages) report.results.push(await captureStage(browser, server, config, stage, path.join(directory, stage), mission));
  } finally { await browser.close(); await server.close(); }
  report.finishedAt = new Date().toISOString();
  report.status = report.results.some(result => result.status === 'failed') ? 'failed' : 'passed';
  await writeFile(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lines = [`# Explosion ${config.phase} capture`, '', `Status: ${report.status}. Reduced motion: ${report.reducedMotion}.`, '', ...report.notes, '', '| Stage | Status | Median FPS | Sequence |', '| --- | --- | ---: | --- |'];
  for (const result of report.results) lines.push(`| ${result.stage} | ${result.status} | ${result.fpsMedian ?? '—'} | [MP4](${result.stage}/sequence.mp4) · [first frame](${result.stage}/frame-000.png) · [contact sheet](${result.stage}/contact-sheet.png) |`);
  await writeFile(path.join(directory, 'report.md'), `${lines.join('\n')}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCapture(captureOptions(process.argv.slice(2))).then(report => { process.stdout.write(`Explosion capture ${report.phase}: ${report.status}\n`); if (report.status === 'failed') process.exitCode = 1; }).catch(error => { process.stderr.write(`${redact(error.stack || error.message)}\n`); process.exitCode = 1; });
}
