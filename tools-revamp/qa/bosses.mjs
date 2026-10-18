import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { canvasVariance, collectErrors, isolatedContext, launchChrome, redact, samplePage } from './browser.mjs';

// REVAMP(O): Production GameCanvas evidence only; never contacts remote services.
export const MAJOR_BOSSES = Object.freeze([
  'gatekeeper-prime', 'prism-moth', 'frontier-crownclaw', 'helios-clawcarrier',
  'nullwake-revenant', 'singularity-crab', 'orbit-gyroscope', 'hammerhead-siege',
  'paywall-decimator', 'umbra-needlewing', 'peer-reviewer', 'impact-factor',
  'grant-reaper', 'citation-hydra', 'replication-crisis',
]);
export const CLIP_BOSSES = Object.freeze(['gatekeeper-prime', 'prism-moth', 'frontier-crownclaw', 'helios-clawcarrier']);

export function options(argv) {
  const config = { dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa/O-bosses', runId: new Date().toISOString().replace(/[:.]/g, '-'), seconds: 30, modes: ['normal', 'god'], video: true, baseline: false, forced: false, device: 'mobile' };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--no-video') config.video = false;
    else if (key === '--baseline') config.baseline = true;
    else if (key === '--forced') config.forced = true;
    else if (['--dist', '--output', '--run-id', '--seconds', '--bosses', '--modes', '--device'].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      config[key === '--run-id' ? 'runId' : key.slice(2)] = key === '--seconds' ? Number(value) : ['--bosses', '--modes'].includes(key) ? value.split(',') : value;
    } else throw new Error(`Unknown option ${key}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(config.runId)) throw new Error('Use a simple run directory name');
  if (!Number.isFinite(config.seconds) || config.seconds < 3) throw new Error('--seconds must be at least 3');
  if (config.modes.some(mode => !['normal', 'god'].includes(mode))) throw new Error('--modes accepts normal,god');
  if (!['mobile', 'desktop'].includes(config.device)) throw new Error('--device accepts mobile or desktop');
  if (config.forced && (config.baseline || config.modes.includes('normal'))) throw new Error('Forced lifecycle requires --modes god and cannot be baseline');
  if (config.bosses?.some(id => !/^[a-z0-9-]+$/.test(id))) throw new Error('Boss IDs must be simple lowercase IDs');
  return config;
}

const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] : null;
const round = value => value == null ? null : Math.round(value * 10) / 10;
const interaction = sample => sample?.state?.interactiveBoss ?? null;

export function observePhaseEvidence(history, boss, seconds) {
  if (!boss || boss.phase == null) return;
  const previous = history[boss.phase] ?? { firstSeconds: seconds };
  const arenaActive = boss.arena?.activeFrames > 0;
  const escortActive = boss.escorts?.some(escort => escort.stage === 'active') ?? false;
  const remember = (key, observed) => previous[key] ?? (observed ? seconds : null);
  history[boss.phase] = {
    ...previous,
    arenaActiveAt: remember('arenaActiveAt', arenaActive),
    arenaFinishedAt: remember('arenaFinishedAt', previous.arenaActiveAt != null && !arenaActive),
    escortActiveAt: remember('escortActiveAt', escortActive),
    escortsRetiredAt: remember('escortsRetiredAt', previous.escortActiveAt != null && boss.escorts?.length === 0),
    coreOpenAt: remember('coreOpenAt', boss.coreOpen >= 0.99),
    hangarOpenAt: remember('hangarOpenAt', boss.hatchOpen >= 0.99 || boss.hatchStage === 'open'),
  };
}

export function forcedDamageReady(boss, history) {
  if (boss?.scale !== 'major' || boss.phase < 2) return true;
  const phase = history[boss.phase];
  if (phase?.arenaFinishedAt == null) return false;
  if (boss.phase === 2) return phase.escortsRetiredAt != null;
  return phase.coreOpenAt != null;
}

export function summarize(result) {
  const frames = result.samples.filter(sample => sample.state);
  const active = frames.filter(sample => sample.state.ready && sample.state.gameActive && sample.state.lives > 0
    && (sample.state.bossHp > 0 || interaction(sample)?.hp > 0) && sample.fps > 0);
  const fps = active.map(sample => sample.fps);
  const interactions = frames.map(interaction).filter(Boolean);
  const phases = [...new Set(interactions.map(boss => boss.phase ?? boss.phaseIndex).filter(value => value != null))];
  const partStates = [...new Set(interactions.flatMap(boss => boss.parts ?? []).map(part => part.state ?? part.damageState).filter(Boolean))];
  const destroyed = new Set(interactions.flatMap(boss => boss.parts ?? []).filter(part => part.destroyed || part.hp <= 0 || part.state === 'destroyed').map(part => part.id));
  const events = [...new Map(frames.flatMap(sample => sample.state.bossEvents ?? [])
    .map(event => [`${event.type}:${event.entityId}:${event.frame}:${event.partId ?? ''}`, event])).values()];
  let livesLost = 0;
  for (let index = 1; index < frames.length; index++) livesLost += Math.max(0, frames[index - 1].state.lives - frames[index].state.lives);
  const sampleTimes = [0, ...result.samples.map(sample => sample.seconds), result.actualSeconds ?? 0];
  const phaseEvidence = {};
  for (const sample of result.samples) observePhaseEvidence(phaseEvidence, interaction(sample), sample.seconds);
  return {
    fpsMedian: round(percentile(fps, 0.5)), fpsP10: round(percentile(fps, 0.1)), fpsMin: fps.length ? round(Math.min(...fps)) : null,
    activeSamples: active.length, livesLost, bossObserved: frames.some(sample => sample.state.bossHp > 0 || interaction(sample)?.hp > 0),
    frameAdvance: (frames.at(-1)?.state.frame ?? 0) - (frames[0]?.state.frame ?? 0),
    maxSampleGapSeconds: round(Math.max(0, ...sampleTimes.slice(1).map((value, index) => value - sampleTimes[index]))),
    worldSizes: [...new Set(frames.map(sample => `${sample.state.worldWidth}x${sample.state.worldHeight}`))],
    maxEnemyBullets: Math.max(0, ...frames.map(sample => sample.counts?.enemyBullets ?? 0)),
    phases, partStates, destroyedParts: [...destroyed],
    hatchObservedOpen: interactions.some(boss => boss.hatchOpen >= 0.99 || boss.hatchStage === 'open'),
    coreObservedOpen: interactions.some(boss => boss.coreOpen >= 0.99),
    phaseEvidence,
    transformationObserved: interactions.some(boss => boss.transformed || boss.transform >= 0.5 || boss.transformation > 0 || boss.form > 0),
    summonObserved: interactions.some(boss => boss.escorts?.length > 0 || boss.summons?.length > 0 || boss.summonCount > 0 || boss.minions > 0),
    deathSequenceObserved: interactions.some(boss => ['dying', 'defeated', 'death'].includes(boss.status) || boss.deathFrames > 0),
    defeatEventObserved: events.some(event => ['boss:defeat', 'boss:member-defeat'].includes(event.type)),
    bossEvents: events,
    complete: frames.some(sample => sample.state.complete),
  };
}

async function capture(page, result, directory, label, seconds) {
  const name = `${String(result.screenshots.length).padStart(3, '0')}-${label.replace(/[^a-z0-9-]/gi, '-').slice(0, 70)}.png`;
  await page.screenshot({ path: path.join(directory, name), timeout: 15000 });
  result.screenshots.push({ path: path.join(result.id, name), label, seconds: round(seconds) });
}

async function makeClip(video, directory, result) {
  const source = await video.path();
  result.video = { webm: path.join(result.id, path.basename(source)) };
  const transformation = result.samples.find(sample => {
    const boss = interaction(sample);
    return boss && (boss.transform >= 0.5 || boss.transformed || boss.form > 0);
  });
  const clipOffset = transformation ? Math.max(0, Math.min(transformation.seconds - 2, (result.actualSeconds ?? 12) - 12)) : 0;
  result.video.clipStartSeconds = round((result.videoStartSeconds ?? 0) + clipOffset);
  result.video.context = transformation ? 'transformation and following combat' : 'entrance and opening combat';
  const encode = (start, seconds, filename) => new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', source, '-t', String(seconds), '-an', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(directory, filename)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', value => { stderr = (stderr + value).slice(-1000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${redact(stderr)}`)));
  });
  await encode(result.video.clipStartSeconds, 12, 'clip.mp4');
  result.video.mp4 = path.join(result.id, 'clip.mp4');
  const defeat = result.samples.find(sample => sample.state?.bossEvents?.some(event => ['boss:defeat', 'boss:member-defeat'].includes(event.type)));
  if (defeat) {
    result.video.defeatStartSeconds = round((result.videoStartSeconds ?? 0) + Math.max(0, defeat.seconds - 2));
    await encode(result.video.defeatStartSeconds, 8, 'defeat.mp4');
    result.video.defeatMp4 = path.join(result.id, 'defeat.mp4');
  }
  result.video.featureClips = [];
  for (const [feature, predicate] of [
    ['arena', boss => boss.arena?.activeFrames > 0],
    ['escort', boss => boss.escorts?.some(escort => escort.stage === 'active')],
  ]) {
    const sample = result.samples.find(sample => predicate(interaction(sample) ?? {}));
    if (!sample) continue;
    const filename = `${feature}.mp4`;
    const start = round((result.videoStartSeconds ?? 0) + Math.max(0, sample.seconds - 1));
    await encode(start, 10, filename);
    result.video.featureClips.push({ feature, startSeconds: start, path: path.join(result.id, filename) });
  }
}

async function forceNextDamage(page, sample) {
  const boss = interaction(sample);
  if (!boss) throw new Error('Forced lifecycle requires interactiveBoss telemetry');
  const part = (boss.parts ?? []).find(part => part.active !== false && !part.destroyed && part.hp > 0 && part.state !== 'locked' && part.state !== 'destroyed');
  // Existing guardian/paired encounters retain their damage gates. Remove a live
  // secondary member through its own hull authority before exposing the primary.
  const member = boss.members?.find(member => member.id !== boss.entityId && member.hp > 0);
  const command = member ? { type: 'damage-hull', entityId: member.id, amount: 1e6 }
    : part ? { type: 'damage-part', partId: part.id, amount: Math.max(1, (part.maxHp ?? part.hp) * 0.4) }
      : { type: 'damage-hull', amount: 1e6 };
  const receipt = await page.evaluate(command => {
    if (typeof window.__sciconQA?.bossCommand !== 'function') throw new Error('QA bossCommand is unavailable');
    return window.__sciconQA.bossCommand(command);
  }, command);
  return { command, receipt };
}

async function runBoss(browser, server, report, config, bossId, mode) {
  const id = `${bossId}-${mode}${config.forced ? '-forced' : ''}`;
  const directory = path.join(report.artifactDir, id);
  await mkdir(directory, { recursive: true });
  const result = { id, bossId, mode, lifecycle: config.forced ? 'forced damage through actual gates; not natural completion' : 'natural autoplay', requestedSeconds: config.seconds, hostStart: { loadAverage: os.loadavg() }, status: 'running', samples: [], phaseEvidence: {}, screenshots: [], commands: [], consoleErrors: [], pageErrors: [], network: [], failures: [] };
  report.results.push(result);
  let context; let page; let video;
  const recorded = config.video && CLIP_BOSSES.includes(bossId) && mode === config.modes[0];
  try {
    context = await isolatedContext(browser, server.origin, config.device, { videoDir: recorded ? directory : undefined, network: result.network });
    const openedAt = Date.now();
    page = await context.newPage(); video = page.video();
    collectErrors(page, result);
    const query = new URLSearchParams({ qa: '1', bosslab: bossId, autoplay: '1', skipIntro: '1', seed: '12345', ...(config.forced ? { bosswatch: '1' } : {}), ...(mode === 'god' ? { god: '1' } : {}) });
    result.query = `?${query}`;
    await page.goto(`${server.origin}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__sciconQA?.state?.()?.ready, null, { timeout: 45000 });
    result.videoStartSeconds = (Date.now() - openedAt) / 1000;
    const start = Date.now();
    let nextPeriodic = 5; let lastKey = ''; let lastCapture = -10; let nextDamage = 8; let forcedPhase = 1; let defeatAt = null;
    result.samples.push({ ...(await samplePage(page)), seconds: 0 });
    await capture(page, result, directory, 'entrance', 0);
    while ((Date.now() - start) / 1000 < config.seconds) {
      const sample = { ...(await samplePage(page)), seconds: round((Date.now() - start) / 1000) };
      result.samples.push(sample);
      const boss = interaction(sample);
      observePhaseEvidence(result.phaseEvidence, boss, sample.seconds);
      if (config.forced && sample.state?.bossEvents?.some(event => event.type === 'boss:defeat')) {
        defeatAt ??= sample.seconds;
        if (sample.seconds - defeatAt >= 6) {
          result.earlyStopReason = 'Authoritative boss:defeat receipt followed by six seconds of death and reward recording';
          break;
        }
      }
      if (config.forced && boss?.phase > forcedPhase) {
        forcedPhase = boss.phase;
        // Minis receive a bounded phase hold. Majors additionally wait for
        // observed arena and escort lifecycles below, regardless of wall time.
        nextDamage = Math.max(nextDamage, sample.seconds + 12);
      }
      const key = JSON.stringify([sample.state?.bossPhase, boss?.status, boss?.hatchStage, boss?.coreOpen >= 0.99,
        boss?.attackMode, boss?.arena?.activeFrames > 0, boss?.escorts?.length ?? 0,
        boss?.transform >= 0.5, (boss?.parts ?? []).map(part => part.state ?? part.damageState)]);
      if ((key !== lastKey && sample.seconds - lastCapture >= (config.forced ? 1.5 : 3)) || sample.seconds >= nextPeriodic) {
        await capture(page, result, directory, boss ? `${boss.status ?? 'combat'}-phase-${boss.phase ?? boss.phaseIndex ?? sample.state.bossPhase}` : `combat-${sample.seconds}s`, sample.seconds);
        lastCapture = sample.seconds; lastKey = key; nextPeriodic = sample.seconds + 5;
      }
      if (config.forced && sample.seconds >= nextDamage && forcedDamageReady(boss, result.phaseEvidence) && (sample.state?.bossHp > 0 || boss?.hp > 0)) {
        result.commands.push({ seconds: sample.seconds, ...(await forceNextDamage(page, sample)) });
        nextDamage = sample.seconds + 0.5;
      }
      await page.waitForTimeout(450);
    }
    result.actualSeconds = round((Date.now() - start) / 1000);
    // Canvas decoding is a post-observation check, not an unsampled combat gap.
    result.canvas = await canvasVariance(page);
    await capture(page, result, directory, 'end', result.actualSeconds);
    result.captureFinishedSeconds = round((Date.now() - start) / 1000);
    Object.assign(result, summarize(result));
    if (!(result.fpsMedian >= 30)) result.failures.push('Median game-render FPS below 30 or missing');
    if (result.activeSamples < 8) result.failures.push('Fewer than eight active-boss FPS observations');
    if (!result.bossObserved) result.failures.push('No boss HP observed');
    if (!(result.frameAdvance > 0)) result.failures.push('Simulation did not advance');
    if (result.maxSampleGapSeconds > 10) result.failures.push('Sample gap exceeds 10 seconds');
    if (!result.canvas || result.canvas.variance <= 5) result.failures.push('Blank canvas');
    if (result.worldSizes.some(size => size !== '390x844')) result.failures.push('World differs from canonical 390x844');
    if (!config.baseline && !result.samples.some(sample => interaction(sample))) result.failures.push('Interactive boss telemetry missing');
    if (!config.baseline && result.samples.some(sample => interaction(sample)?.id && interaction(sample).id !== bossId)) result.failures.push('Launched boss identity differs from requested boss');
    if (result.samples.some(sample => sample.state && (sample.state.god !== (mode === 'god') || !sample.state.autoplay))) result.failures.push('Observed god/autoplay flags differ from requested mode');
    if (config.forced && !result.complete && !result.deathSequenceObserved && !result.defeatEventObserved) result.failures.push('Forced lifecycle did not reach defeat');
    if (config.forced && result.samples.some(sample => interaction(sample)?.scale === 'major')) {
      if (result.phaseEvidence[2]?.arenaFinishedAt == null) result.failures.push('Phase 2 arena lifecycle was not observed');
      if (result.phaseEvidence[2]?.escortsRetiredAt == null) result.failures.push('Phase 2 active escorts did not retire during observation');
      if (result.phaseEvidence[3]?.arenaFinishedAt == null) result.failures.push('Phase 3 arena lifecycle was not observed');
      if (result.phaseEvidence[3]?.coreOpenAt == null) result.failures.push('Phase 3 open core was not observed');
    }
    if ([...result.pageErrors, ...result.consoleErrors, ...result.samples.flatMap(sample => sample.state?.errors ?? [])].length) result.failures.push('Browser/runtime errors observed');
    result.status = result.failures.length ? 'failed' : config.baseline ? 'baseline-observation' : 'passed';
  } catch (error) {
    result.failures.push(redact(error.message)); result.status = 'failed';
    if (page) await capture(page, result, directory, 'failure', 0).catch(() => {});
  } finally {
    if (result.fpsMedian === undefined && result.samples.length) {
      result.actualSeconds = result.samples.at(-1).seconds;
      Object.assign(result, summarize(result));
    }
    await context?.close().catch(() => {});
    if (video) await makeClip(video, directory, result).catch(error => result.failures.push(`Clip conversion: ${redact(error.message)}`));
    if (result.failures.length) result.status = 'failed';
    result.hostEnd = { loadAverage: os.loadavg() };
    process.stdout.write(`${id}: ${result.status}, ${result.fpsMedian ?? '—'} FPS\n`);
  }
}

async function writeReport(report) {
  await writeFile(path.join(report.artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const rows = report.results.map(result => `| ${result.bossId} | ${result.mode}${report.forced ? ' / forced' : ''} | ${result.status} | ${result.fpsMedian ?? '—'} / ${result.fpsP10 ?? '—'} | ${result.livesLost ?? '—'} | ${(result.phases ?? []).join(', ')} | ${result.destroyedParts?.length ?? 0} | ${result.defeatEventObserved ? 'yes' : 'no'} / ${result.deathSequenceObserved ? 'yes' : 'no'} |`);
  const lines = ['# Boss interaction QA', '', `Status: **${report.status}**. Context: ${report.baseline ? 'Pre-O real campaign encounter' : 'Canonical BossLab GameCanvas practice encounter'}.`, '', 'Sequential Chrome SwiftShader, fixed 390×844 world, seed 12345. All external requests are fulfilled offline and WebSockets closed. Game render FPS includes screenshot/video overhead and excludes post-defeat frames. Normal mode retains damage; god mode is coverage only. Forced runs are explicit lifecycle fixtures and cannot establish natural completion or player fairness.', '', `Build index SHA256: \`${report.distIndexSha256 ?? 'unavailable'}\`. Source: \`${report.dist}\`.`, '', '| Boss | Mode | Result | FPS median / p10 | Lives lost | Phases | Parts destroyed | Defeat receipt / sequence |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, '', '## Evidence and limits', ''];
  for (const result of report.results) {
    lines.push(`### ${result.id}`, '', `Lifecycle: ${result.lifecycle}. Captured ${result.actualSeconds ?? 0}s; this is bounded observation, not proof of human survivability.`, '');
    if (result.earlyStopReason) lines.push(`- Recording ended early: ${result.earlyStopReason}.`);
    for (const failure of result.failures) lines.push(`- Failure: ${failure}`);
    if (result.video?.mp4) lines.push(`- [12-second clip](${result.video.mp4}) · [full WebM](${result.video.webm})`);
    if (result.video?.defeatMp4) lines.push(`- [Defeat sequence clip](${result.video.defeatMp4})`);
    for (const clip of result.video?.featureClips ?? []) lines.push(`- [${clip.feature} action clip](${clip.path})`);
    for (const shot of result.screenshots) lines.push(`- [${shot.seconds}s ${shot.label}](${shot.path})`);
    lines.push('');
  }
  for (const note of report.notes) lines.push(`- ${note}`);
  await writeFile(path.join(report.artifactDir, 'report.md'), `${lines.join('\n')}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  const artifactDir = path.resolve(config.output, config.runId);
  await mkdir(path.dirname(artifactDir), { recursive: true });
  await mkdir(artifactDir, { recursive: false });
  const report = { schemaVersion: 1, artifactDir, startedAt: new Date().toISOString(), ...config, dist: path.resolve(config.dist), environment: { loadAverage: os.loadavg(), availableParallelism: os.availableParallelism() }, notes: [], results: [], status: 'running' };
  let server; let browser;
  try {
    const campaign = JSON.parse(await readFile(path.join(REPO_ROOT, 'game-config/campaign.json'), 'utf8'));
    const roster = [...MAJOR_BOSSES, ...campaign.miniBosses.map(boss => boss.id.replace(/^mini-boss-/, ''))];
    const selected = config.bosses ?? roster;
    if (selected.some(id => !roster.includes(id))) throw new Error('Unknown boss selection');
    report.roster = selected;
    report.distIndexSha256 = createHash('sha256').update(await readFile(path.join(config.dist, 'index.html'))).digest('hex');
    server = await startStaticServer({ dist: config.dist });
    browser = await launchChrome({ video: config.video });
    report.environment.browserVersion = browser.version();
    for (const bossId of selected) for (const mode of config.modes) {
      await runBoss(browser, server, report, config, bossId, mode);
      await writeReport(report);
      if (await readFile(path.join(artifactDir, 'STOP'), 'utf8').then(() => true, () => false)) {
        report.status = 'interrupted';
        report.apiRequests = server.requests;
        report.notes.push('Operator STOP file requested a graceful pause after the current case; remaining roster was not run.');
        return report;
      }
    }
    report.apiRequests = server.requests;
    report.status = report.results.some(result => result.status === 'failed') ? 'failed' : config.baseline ? 'baseline-observation' : 'passed';
  } catch (error) { report.status = 'failed'; report.notes.push(redact(error.message)); }
  finally {
    await browser?.close().catch(() => {}); await server?.close();
    report.finishedAt = new Date().toISOString();
    await writeReport(report);
    process.stdout.write(`Report: ${path.join(artifactDir, 'report.md')}\n`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(report => { if (['failed', 'interrupted'].includes(report.status)) process.exitCode = 1; }).catch(error => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
