// Same-session A/B: ordinary QA, sequential alternating builds, no profiler or video.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = path.join(REPO_ROOT, 'tools-revamp/qa/playthrough.mjs');
const STAGES = ['mission-1', 'boss'];
const MIN_RATIO = 0.9;
const hostSnapshot = () => ({ loadAverage: os.loadavg(), freeMemoryBytes: os.freemem() });
const hashFile = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = value => value == null ? null : Math.round(value * 1000) / 1000;

export function options(argv) {
  const config = { output: '/workspace/scicon-revamp/qa', runs: 2 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--reference', '--current', '--run-id', '--runs', '--output'].includes(key)) throw new Error(`Unknown option: ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    config[key === '--run-id' ? 'runId' : key.slice(2)] = key === '--runs' ? Number(value) : value;
  }
  if (!config.reference || !config.current || !config.runId) throw new Error('Required: --reference <dist> --current <dist> --run-id <name>');
  if (!/^[a-zA-Z0-9._-]+$/.test(config.runId) || ['.', '..'].includes(config.runId)) throw new Error('--run-id must be a simple directory name');
  if (!Number.isSafeInteger(config.runs) || config.runs < 2) throw new Error('--runs must be an integer of at least 2 per build');
  config.reference = path.resolve(config.reference);
  config.current = path.resolve(config.current);
  config.output = path.resolve(config.output);
  return config;
}

function scenarioSummary(result) {
  const errors = {
    page: [...new Set(result.pageErrors ?? [])],
    console: [...new Set(result.consoleErrors ?? [])],
    runtime: [...new Set((result.samples ?? []).flatMap(sample => sample.state?.errors ?? []))]
  };
  return {
    stage: result.stage, status: result.status, fpsSource: result.fpsSource,
    fpsMedian: result.fpsMedian ?? null, fpsP10: result.fpsP10 ?? null,
    activeSamples: result.activeSamples ?? 0,
    requestedSeconds: result.requestedSeconds, actualSeconds: result.actualSeconds ?? null,
    maxSampleGapSeconds: result.maxSampleGapSeconds ?? null,
    maxSampleDurationSeconds: result.maxSampleDurationSeconds ?? null,
    maxScreenshotGapSeconds: result.maxScreenshotGapSeconds ?? null,
    firstGameOverSeconds: result.firstGameOverSeconds ?? null,
    bossObserved: result.bossObserved, worldSizes: result.worldSizes ?? [],
    hostStart: result.hostStart, hostEnd: result.hostEnd,
    failures: [...(result.failures ?? []), ...(result.failure ? [result.failure] : [])], errors
  };
}

export function aggregate(legs, runs) {
  return STAGES.map(stage => {
    const groups = Object.fromEntries(['reference', 'current'].map(build => {
      const scenarios = legs.filter(leg => leg.build === build).map(leg => leg.scenarios.find(result => result.stage === stage)).filter(Boolean);
      const medians = scenarios.filter(result => result.fpsSource === 'game-render-loop' && Number.isFinite(result.fpsMedian) && result.fpsMedian > 0).map(result => result.fpsMedian);
      return [build, {
        runMedians: medians, fpsMedian: median(medians), runsMeasured: medians.length,
        qaPassed: scenarios.length === runs && scenarios.every(result => result.status === 'passed'),
        browserRuntimeErrors: scenarios.reduce((sum, result) => sum + Object.values(result.errors).reduce((count, errors) => count + errors.length, 0), 0)
      }];
    }));
    const ratio = groups.reference.fpsMedian > 0 && groups.current.fpsMedian > 0 ? groups.current.fpsMedian / groups.reference.fpsMedian : null;
    const complete = groups.reference.runsMeasured === runs && groups.current.runsMeasured === runs;
    return {
      stage, ...groups, currentReferenceRatio: round(ratio), changePercent: round(ratio == null ? null : (ratio - 1) * 100),
      withinTenPercent: complete && ratio !== null && ratio >= MIN_RATIO,
      mission45Target: stage === 'mission-1' ? complete && groups.current.fpsMedian >= 45 : null
    };
  });
}

async function runChild(args, logPath) {
  const log = createWriteStream(logPath, { flags: 'wx' });
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    let spawnError;
    child.once('error', error => { spawnError = error.message; });
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, ...(spawnError ? { spawnError } : {}) }));
  });
  log.end();
  await finished(log);
  return result;
}

async function writeSummary(report) {
  report.stages = aggregate(report.legs, report.runsPerBuild);
  const fmt = value => value == null ? '—' : String(round(value));
  const lines = [
    '# SciCon same-session performance comparison', '',
    `Run: \`${report.runId}\` · status: **${report.status}** · alternating reference/current, ${report.runsPerBuild} runs each.`, '',
    'Each leg uses ordinary mobile QA, normal damage, 60-second Mission 1 and 45-second boss, seed 12345, screenshots, no video, no profiling. The existing ≥30 FPS and coverage/error gates are unchanged. Aggregate FPS is the median of all measured run medians (the mean of the middle pair for an even count); failed legs remain included and visible. A ratio ≥0.9 meets the relative target. Host load is context, not a waiver or proof of quiet-host performance.', '',
    '| Stage | Reference run medians | Current run medians | Reference / current aggregate | Current/reference | Relative target | All QA legs passed |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const stage of report.stages) lines.push(`| ${stage.stage} | ${stage.reference.runMedians.join(', ') || '—'} | ${stage.current.runMedians.join(', ') || '—'} | ${fmt(stage.reference.fpsMedian)} / ${fmt(stage.current.fpsMedian)} | ${fmt(stage.currentReferenceRatio)} | ${stage.withinTenPercent ? 'pass' : 'fail/incomplete'} | ${stage.reference.qaPassed && stage.current.qaPassed ? 'yes' : 'no'} |`);
  lines.push('', `Current Mission 1 aggregate ≥45 FPS: **${report.stages.find(stage => stage.stage === 'mission-1')?.mission45Target ? 'yes' : 'no/incomplete'}**. This does not assert that the host was quiet.`, '', '| Leg | Exit / QA status | Load 1m start → end | Report |', '| --- | --- | --- | --- |');
  for (const leg of report.legs) {
    lines.push(`| ${leg.id} | ${leg.exitCode ?? leg.signal ?? 'error'} / ${leg.qaStatus ?? 'missing'} | ${fmt(leg.hostStart.loadAverage[0])} → ${fmt(leg.hostEnd.loadAverage[0])} | [report](${leg.id}/report.md), [log](${leg.id}.log) |`);
  }
  lines.push('', '## Failures and errors', '');
  const failures = [];
  for (const leg of report.legs) {
    for (const error of leg.errors) failures.push(`${leg.id}: ${error}`);
    if (leg.exitCode !== 0) failures.push(`${leg.id}: subprocess exit ${leg.exitCode}, signal ${leg.signal ?? 'none'}`);
    for (const result of leg.scenarios) {
      for (const failure of result.failures) failures.push(`${leg.id}/${result.stage}: ${failure}`);
      for (const [kind, errors] of Object.entries(result.errors)) for (const error of errors) failures.push(`${leg.id}/${result.stage} ${kind}: ${error}`);
    }
  }
  lines.push(...(failures.length ? failures.map(failure => `- ${String(failure).replaceAll('\n', ' ')}`) : ['None recorded.']));
  lines.push('', '## Reproduction metadata', '', 'Executable/argument arrays, working directory, Node version, input index hashes, harness/campaign hashes, per-stage host loads and browser versions are retained in [compare.json](compare.json). No environment variables or request bodies are recorded.', '', '```json', JSON.stringify(report.invocation, null, 2), '```', '');
  await writeFile(path.join(report.artifactDir, 'compare.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(report.artifactDir, 'compare.md'), `${lines.join('\n')}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  const inputs = Object.fromEntries(await Promise.all(['reference', 'current'].map(async build => [build, { dist: config[build], indexSha256: await hashFile(path.join(config[build], 'index.html')) }])));
  const artifactDir = path.join(config.output, config.runId);
  await mkdir(config.output, { recursive: true });
  await mkdir(artifactDir, { recursive: false });
  const report = {
    schemaVersion: 1, runId: config.runId, artifactDir, runsPerBuild: config.runs,
    startedAt: new Date().toISOString(), status: 'running', inputs,
    invocation: { executable: process.execPath, args: [fileURLToPath(import.meta.url), ...argv], cwd: process.cwd() },
    environment: { platform: os.platform(), arch: os.arch(), cpuCount: os.cpus().length, availableParallelism: os.availableParallelism(), nodeVersion: process.version, start: hostSnapshot() },
    harnessSha256: await hashFile(HARNESS), campaignSha256: await hashFile(path.join(REPO_ROOT, 'game-config/campaign.json')),
    legs: []
  };
  await writeSummary(report);
  for (let iteration = 1; iteration <= config.runs; iteration++) for (const build of ['reference', 'current']) {
    const id = `${build}-${iteration}`;
    const args = [HARNESS, '--dist', config[build], '--devices', 'mobile', '--stages', STAGES.join(','), '--no-video', '--output', artifactDir, '--run-id', id];
    const leg = { id, build, iteration, startedAt: new Date().toISOString(), command: { executable: process.execPath, args, cwd: REPO_ROOT }, hostStart: hostSnapshot(), errors: [], scenarios: [] };
    console.log(`A/B ${id}: ${config[build]}`);
    Object.assign(leg, await runChild(args, path.join(artifactDir, `${id}.log`)));
    leg.finishedAt = new Date().toISOString();
    leg.hostEnd = hostSnapshot();
    if (leg.spawnError) leg.errors.push(leg.spawnError);
    try {
      const qa = JSON.parse(await readFile(path.join(artifactDir, id, 'report.json'), 'utf8'));
      leg.qaStatus = qa.status;
      leg.distIndexSha256 = qa.distIndexSha256;
      leg.browserVersion = qa.environment?.browserVersion;
      leg.notes = qa.notes ?? [];
      leg.scenarios = qa.results.filter(result => result.device === 'mobile' && STAGES.includes(result.stage)).map(scenarioSummary);
      if (qa.distIndexSha256 !== inputs[build].indexSha256) leg.errors.push('Built index changed during comparison or QA did not record its hash');
      if (leg.scenarios.length !== STAGES.length) leg.errors.push('QA report is missing a requested scenario');
    } catch (error) { leg.errors.push(`Cannot read QA report: ${error.message}`); }
    report.legs.push(leg);
    await writeSummary(report);
  }
  report.finishedAt = new Date().toISOString();
  report.environment.end = hostSnapshot();
  report.status = report.legs.every(leg => leg.exitCode === 0 && leg.qaStatus === 'passed' && !leg.errors.length)
    && report.stages.every(stage => stage.withinTenPercent) ? 'passed' : 'failed';
  await writeSummary(report);
  console.log(`Comparison: ${path.join(artifactDir, 'compare.md')} (${report.status})`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(report => { if (report.status !== 'passed') process.exitCode = 1; })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
