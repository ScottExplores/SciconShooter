import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createPlayerReportCacheEnvelope,
  DEFAULT_PLAYER_REPORT_DASHBOARD_URL,
  PlayerReportCacheRepository,
  resolveDefaultPlayerReportCachePath
} from '../director/server/playerReportCacheRepository.mjs';
import {
  hasPlayerReportCredentials,
  readPlayerReports,
  resolvePlayerReportEnvironment
} from './player-report-reader.mjs';

const safeDashboardUrl = (environment) => (
  String(environment.PLAYER_REPORT_DASHBOARD_URL || '').trim()
  || DEFAULT_PLAYER_REPORT_DASHBOARD_URL
);

export const parsePlayerReportCacheArguments = (argumentsList = process.argv.slice(2)) => {
  let outputPath = resolveDefaultPlayerReportCachePath();
  let limit = 100;
  for (const argument of argumentsList) {
    if (argument.startsWith('--output=')) {
      const value = argument.slice('--output='.length).trim();
      if (!value) throw new Error('Player report cache output path is empty.');
      outputPath = path.resolve(value);
    } else if (argument.startsWith('--limit=')) {
      const value = Number(argument.slice('--limit='.length));
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error('Player report cache limit must be between 1 and 100.');
      }
      limit = value;
    } else {
      throw new Error(`Unknown player report cache option: ${argument}`);
    }
  }
  return { outputPath, limit };
};

export const writePlayerReportCacheAtomic = async (outputPath, envelope) => {
  const resolvedOutput = path.resolve(outputPath);
  const directory = path.dirname(resolvedOutput);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(resolvedOutput)}.${process.pid}.${randomUUID()}.tmp`
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await rename(temporaryPath, resolvedOutput);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return resolvedOutput;
};

export const refreshPlayerReportCache = async ({
  environment = process.env,
  outputPath = resolveDefaultPlayerReportCachePath(),
  limit = 100,
  fetchImpl = globalThis.fetch,
  clock = () => new Date()
} = {}) => {
  const configuration = resolvePlayerReportEnvironment(environment);
  const generatedAt = clock().toISOString();
  let envelope;

  if (!hasPlayerReportCredentials(configuration)) {
    envelope = createPlayerReportCacheEnvelope({
      state: 'unconfigured',
      generatedAt,
      dashboardUrl: safeDashboardUrl(environment),
      message: 'Player report review is not connected on this desktop yet.',
      reports: []
    });
  } else {
    try {
      const reports = await readPlayerReports({
        ...configuration,
        limit,
        fetchImpl
      });
      envelope = createPlayerReportCacheEnvelope({
        state: 'ready',
        generatedAt,
        dashboardUrl: safeDashboardUrl(environment),
        message: reports.length === 0
          ? 'The report inbox is connected and currently empty.'
          : `Loaded ${reports.length} player report${reports.length === 1 ? '' : 's'}.`,
        reports
      });
    } catch {
      const previous = await new PlayerReportCacheRepository({ cachePath: outputPath }).readSnapshot();
      const hasSafePreviousReports = previous.state === 'ready' && previous.reports.length > 0;
      envelope = createPlayerReportCacheEnvelope({
        state: 'error',
        generatedAt: hasSafePreviousReports ? previous.generatedAt : generatedAt,
        dashboardUrl: safeDashboardUrl(environment),
        message: hasSafePreviousReports
          ? 'The refresh failed, so the last safe player-report cache is still shown.'
          : 'The player-report refresh failed. Check the desktop connection and try again.',
        reports: hasSafePreviousReports ? previous.reports : []
      });
    }
  }

  const writtenPath = await writePlayerReportCacheAtomic(outputPath, envelope);
  return { envelope, outputPath: writtenPath };
};

export const runPlayerReportCacheCli = async ({
  argumentsList = process.argv.slice(2),
  environment = process.env,
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  stdout = console.log,
  stderr = console.error
} = {}) => {
  try {
    const { outputPath, limit } = parsePlayerReportCacheArguments(argumentsList);
    const result = await refreshPlayerReportCache({
      environment,
      outputPath,
      limit,
      fetchImpl,
      clock
    });
    stdout(`Player report cache: ${result.envelope.state} (${result.envelope.reports.length} reports).`);
    return 0;
  } catch {
    stderr('Player report cache could not be written.');
    return 1;
  }
};

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await runPlayerReportCacheCli();
