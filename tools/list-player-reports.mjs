const configuredUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const serviceKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
).trim();
const table = String(process.env.SUPABASE_PRODUCT_EVENTS_TABLE || 'scicon_product_events').trim();

if (!configuredUrl || !serviceKey) {
  console.error('Player report review requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exitCode = 1;
} else if (!/^[a-z0-9_]{1,80}$/i.test(table)) {
  console.error('SUPABASE_PRODUCT_EVENTS_TABLE is invalid.');
  process.exitCode = 1;
} else {
  const requestedLimit = process.argv
    .map((entry) => /^--limit=(\d+)$/.exec(entry)?.[1])
    .find(Boolean);
  const limit = Math.max(1, Math.min(100, Number(requestedLimit || 25)));
  const query = new URLSearchParams({
    select: 'event_name,session_id,game_version,properties,occurred_at',
    event_name: 'in.(player_bug_report,player_feedback)',
    order: 'occurred_at.desc',
    limit: String(limit)
  });
  const response = await fetch(`${configuredUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    console.error(`Player report review failed with HTTP ${response.status}.`);
    process.exitCode = 1;
  } else {
    const reports = (await response.json());
    const visibleReports = Array.isArray(reports)
      ? reports.filter((report) => (
          report?.event_name === 'player_bug_report'
          || report?.event_name === 'player_feedback'
        )).map((report) => {
          const properties = report?.properties && typeof report.properties === 'object'
            ? { ...report.properties }
            : {};
          delete properties.limiter_key;
          return { ...report, properties };
        })
      : [];
    console.log(JSON.stringify({
      count: visibleReports.length,
      reports: visibleReports
    }, null, 2));
  }
}
