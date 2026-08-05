import {
  hasPlayerReportCredentials,
  readPlayerReports,
  resolvePlayerReportEnvironment
} from './player-report-reader.mjs';

const configuration = resolvePlayerReportEnvironment();
const requestedLimit = process.argv
  .map((entry) => /^--limit=(\d+)$/.exec(entry)?.[1])
  .find(Boolean);

if (!hasPlayerReportCredentials(configuration)) {
  console.error(
    'Player report review requires SUPABASE_URL and a server-side Supabase key in .env.local.'
  );
  process.exitCode = 1;
} else {
  try {
    const reports = await readPlayerReports({
      ...configuration,
      limit: Number(requestedLimit || 25)
    });
    console.log(JSON.stringify({ count: reports.length, reports }, null, 2));
  } catch (error) {
    console.error(error?.message || 'Player report review failed.');
    process.exitCode = 1;
  }
}
