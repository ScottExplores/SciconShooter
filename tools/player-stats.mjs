// Owner-only player counts. Needs SUPABASE_URL plus a server-side key
// (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY) in .env.local. Never commit keys.
// Usage: npm run analytics:stats            -> aggregate player/run counts
//        npm run analytics:stats -- --reports[=20] [--all] [--tests]
//                                            -> newest Feedback / Report a Bug submissions
const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env.local.');
  process.exit(1);
}
const args = process.argv.slice(2);
const reportsArg = args.find((arg) => arg.startsWith('--reports'));
const [fn, body] = reportsArg
  ? ['scicon_recent_player_reports', {
      p_limit: Number(reportsArg.split('=')[1]) || 20,
      p_include_automatic: args.includes('--all'),
      p_include_tests: args.includes('--tests')
    }]
  : ['scicon_player_stats', {}];
const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const text = await response.text();
if (!response.ok) {
  console.error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}
console.log(JSON.stringify(JSON.parse(text), null, 2));
