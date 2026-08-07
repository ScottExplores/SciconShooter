import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildProductAnalyticsWindows,
  hasProductAnalyticsCredentials,
  readProductAnalyticsEvents,
  resolveProductAnalyticsEnvironment
} from './product-analytics-reader.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const sanitizeSource = (source = {}) => ({
  system: String(source.system || 'Supabase').slice(0, 40),
  table: String(source.table || 'scicon_product_events').replace(/[^a-z0-9_]/gi, '').slice(0, 80),
  host: String(source.host || '').replace(/[^a-z0-9.-]/gi, '').slice(0, 120),
  windowDays: Math.max(1, Math.min(365, Number(source.windowDays) || 90))
});

const normalizeWindows = (analytics) => {
  if (analytics && analytics[7] && analytics[30] && analytics[90]) return analytics;
  return { 7: analytics || {}, 30: analytics || {}, 90: analytics || {} };
};

const pageShell = ({ title, status = '', body, script = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
<style>
:root{--ink:#eafcff;--muted:#88a7bc;--panel:#071827e8;--line:#126984;--cyan:#19d8ff;--green:#42f0b2;--yellow:#ffd65a;--red:#ff6b7d;--violet:#8b7cff;--bg:#020813}*{box-sizing:border-box}html{min-height:100%;background:var(--bg)}body{margin:0;min-height:100vh;color:var(--ink);font-family:Inter,Segoe UI,Arial,sans-serif;background:radial-gradient(circle at 18% 8%,#123056 0,transparent 35%),radial-gradient(circle at 88% 34%,#081b47 0,transparent 33%),linear-gradient(145deg,#020711,#040d1c 56%,#01050d)}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.28;background-image:linear-gradient(#0ad7ff08 1px,transparent 1px),linear-gradient(90deg,#0ad7ff08 1px,transparent 1px);background-size:28px 28px}.wrap{position:relative;width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 56px}.top{display:flex;gap:24px;justify-content:space-between;align-items:flex-start;border:1px solid #1585a8;background:linear-gradient(135deg,#08223aee,#061523ee);padding:22px 24px;box-shadow:0 0 0 2px #04101c,0 0 28px #00c8ff20;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}.eyebrow{font:700 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--green);letter-spacing:.2em;text-transform:uppercase}.top h1{font-size:clamp(28px,5vw,48px);letter-spacing:.04em;margin:8px 0 5px;text-transform:uppercase}.sub,.fine{color:var(--muted);line-height:1.5}.source{min-width:220px;text-align:right}.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid #2bd6a4;color:#8effd4;background:#053326;padding:7px 10px;font:700 11px ui-monospace,monospace;letter-spacing:.08em}.pill:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green)}.controls{display:flex;gap:8px;margin:22px 0 14px}.range{cursor:pointer;border:1px solid #1f5c76;color:#91b8ce;background:#071828;padding:10px 17px;font-weight:800;letter-spacing:.08em}.range:hover,.range.active{color:#03111a;background:linear-gradient(135deg,var(--green),var(--cyan));border-color:#91fff0;box-shadow:0 0 20px #19d8ff33}.coverage{display:flex;justify-content:space-between;gap:18px;align-items:center;border:1px solid #5a4c18;background:#211c08cc;color:#f6e7a5;padding:10px 14px;margin-bottom:14px}.coverage strong{color:var(--yellow)}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.card,.panel{border:1px solid #0e5870;background:linear-gradient(155deg,#092035e8,#05121fe8);box-shadow:inset 0 1px #1ec6ec22,0 10px 28px #0005}.card{padding:15px;min-height:112px}.card span{display:block;color:#83a7bb;font:700 10px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.card b{display:block;margin:10px 0 5px;font-size:clamp(22px,3vw,32px);color:#f2feff}.card small{color:#6f92a8}.charts{display:grid;grid-template-columns:1.45fr 1fr;gap:12px;margin-top:12px}.panel{padding:18px}.panel h2{font-size:15px;letter-spacing:.09em;text-transform:uppercase;margin:0 0 4px}.panel .hint{font-size:12px;color:#7599ad;margin-bottom:15px}.chart{width:100%;height:240px;overflow:visible}.axis{stroke:#1f526b;stroke-width:1}.gridline{stroke:#12394d;stroke-width:1}.sessions-line{fill:none;stroke:var(--cyan);stroke-width:3;filter:drop-shadow(0 0 4px #19d8ff80)}.visitors-line{fill:none;stroke:var(--green);stroke-width:2}.dot-s{fill:var(--cyan)}.dot-v{fill:var(--green)}.legend{display:flex;gap:18px;color:#93afbf;font-size:12px}.legend i{display:inline-block;width:12px;height:3px;margin-right:6px;vertical-align:middle}.bars{height:240px;display:flex;align-items:flex-end;gap:3px;border-bottom:1px solid #1f526b;background:repeating-linear-gradient(to top,transparent 0,transparent 47px,#12394d 48px)}.bar{flex:1;min-width:2px;background:linear-gradient(to top,#355df0,#19d8ff);box-shadow:0 0 8px #19d8ff42}.modes{grid-column:1/-1}.mode-row{display:grid;grid-template-columns:170px 1fr 72px 72px;gap:12px;align-items:center;margin:10px 0;color:#a8c0cf}.mode-track{height:11px;border:1px solid #164c64;background:#03101a}.mode-fill{height:100%;background:linear-gradient(90deg,var(--violet),var(--cyan));box-shadow:0 0 8px #19d8ff55}.mode-n{text-align:right;color:#e9fdff;font:700 12px ui-monospace,monospace}.empty{color:#718ca0;padding:30px 0;text-align:center}.method{margin-top:12px;padding:18px;border:1px solid #173d50;background:#04101bd9}.method summary{cursor:pointer;color:#bdefff;font-weight:800}.method p,.method li{color:#86a5b7;line-height:1.55}.method code,.setup code{color:#9effdb;background:#03141a;padding:2px 5px}.setup{max-width:760px;margin:70px auto;border:1px solid #168aae;background:#061827ed;padding:30px;box-shadow:0 0 44px #19d8ff22}.setup h1{font-size:34px;margin:8px 0}.setup pre{white-space:pre-wrap;border:1px solid #1c5369;background:#020b12;padding:16px;color:#9effdb;overflow:auto}.steps{counter-reset:step;display:grid;gap:12px;margin:22px 0}.step{counter-increment:step;border-left:3px solid var(--cyan);padding:10px 14px;background:#082036}.step:before{content:counter(step);display:inline-grid;place-items:center;width:24px;height:24px;margin-right:9px;border-radius:50%;background:var(--cyan);color:#001018;font-weight:900}.error{border-color:#8a3342}.error .eyebrow{color:#ff8a9a}@media(max-width:900px){.grid{grid-template-columns:repeat(3,1fr)}.charts{grid-template-columns:1fr}.modes{grid-column:auto}.source{text-align:left}.top{display:block}.source{margin-top:14px}}@media(max-width:580px){.wrap{width:min(100% - 18px,1180px);padding-top:9px}.grid{grid-template-columns:repeat(2,1fr)}.top{padding:17px}.coverage{display:block}.coverage span{display:block;margin-top:6px}.mode-row{grid-template-columns:110px 1fr 45px}.mode-row .finish{display:none}.card{min-height:98px}.panel{padding:13px}}
</style>
</head>
<body><main class="wrap">${body}</main>${script ? `<script>${script}</script>` : ''}</body>
</html>`;

export const renderPlayerAnalyticsDashboard = ({ analytics, generatedAt, source } = {}) => {
  const windows = normalizeWindows(analytics);
  const cleanSource = sanitizeSource(source);
  const generated = Number.isFinite(Date.parse(generatedAt)) ? new Date(generatedAt).toISOString() : new Date().toISOString();
  const embedded = safeJson({ windows, generatedAt: generated, source: cleanSource });
  const body = `
  <header class="top"><div><div class="eyebrow">Scicon command telemetry</div><h1>Player Analytics</h1><div class="sub">Are players arriving, playing missions, and staying engaged?</div></div><div class="source"><div class="pill">PRIVATE AGGREGATES</div><div class="fine" style="margin-top:8px">Generated <span id="generated"></span><br>${escapeHtml(cleanSource.system)} · ${escapeHtml(cleanSource.table)}</div></div></header>
  <nav class="controls" aria-label="Reporting window"><button class="range" data-days="7">7 DAYS</button><button class="range active" data-days="30">30 DAYS</button><button class="range" data-days="90">90 DAYS</button></nav>
  <div class="coverage"><div><strong id="coverage">—</strong> stable-player coverage</div><span id="coverage-note">Older sessions without anonymous hashes are excluded from player counts.</span></div>
  <section class="grid" id="metrics"></section>
  <section class="charts">
    <article class="panel"><h2>Player &amp; session trend</h2><div class="hint">Daily hashed devices and app sessions</div><svg class="chart" id="trend" viewBox="0 0 720 240" role="img" aria-label="Daily player and session trend"></svg><div class="legend"><span><i style="background:var(--cyan)"></i>Sessions</span><span><i style="background:var(--green)"></i>Unique devices</span></div></article>
    <article class="panel"><h2>Measured active time</h2><div class="hint">Foreground minutes from monotonic session heartbeats</div><div class="bars" id="playtime" aria-label="Daily measured active minutes"></div></article>
    <article class="panel modes"><h2>Mission mode mix</h2><div class="hint">Starts and finishes by recorded run mode</div><div id="modes"></div></article>
  </section>
  <details class="method"><summary>Definitions, privacy, and known coverage</summary><ul><li><b>Unique, new, and returning players</b> count only one-way hashed anonymous device identifiers. No wallet, player name, IP address, or raw device/session identifier is placed in this file.</li><li><b>Active time</b> sums the maximum foreground-time heartbeat per session, avoiding duplicate-event overcounting. Average session uses only sessions with a heartbeat.</li><li><b>Run finish rate</b> is run-finish events divided by mission-start events. Owner tests, previews, sandboxes, and campaign-lab traffic are excluded.</li><li>Legacy traffic before stable hashes and playtime heartbeats remains visible in session and mission totals, but is excluded from stable-player and playtime metrics.</li><li>This is a local snapshot. Open the desktop shortcut again to rebuild it from <code>${escapeHtml(cleanSource.table)}</code>.</li></ul></details>`;

  const script = `
const DATA=${embedded};
const $=s=>document.querySelector(s),fmt=n=>new Intl.NumberFormat('en-US',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(Number(n)||0);
const pct=n=>Math.round((Number(n)||0)*100)+'%';
const duration=s=>{s=Math.max(0,Number(s)||0);if(s>=3600)return (s/3600).toFixed(s>=36000?0:1)+' hr';if(s>=60)return Math.round(s/60)+' min';return Math.round(s)+' sec'};
const card=(label,value,note)=>'<article class="card"><span>'+label+'</span><b>'+value+'</b><small>'+note+'</small></article>';
function poly(values,max,w=720,h=240,p=24){const step=(w-p*2)/Math.max(1,values.length-1);return values.map((v,i)=>(p+i*step)+','+(h-p-(v/max)*(h-p*2))).join(' ')}
function drawTrend(rows){const svg=$('#trend'),sessions=rows.map(r=>r.sessions),visitors=rows.map(r=>r.uniqueDevices),max=Math.max(1,...sessions,...visitors);let grid='';for(let i=0;i<5;i++){const y=24+i*48;grid+='<line class="gridline" x1="24" x2="696" y1="'+y+'" y2="'+y+'"/>'}svg.innerHTML=grid+'<polyline class="sessions-line" points="'+poly(sessions,max)+'"/><polyline class="visitors-line" points="'+poly(visitors,max)+'"/>'}
function drawTime(rows){const root=$('#playtime'),mins=rows.map(r=>r.activeSeconds/60),max=Math.max(1,...mins);root.innerHTML=mins.map((v,i)=>'<i class="bar" title="'+rows[i].date+': '+Math.round(v)+' min" style="height:'+Math.max(v?3:0,(v/max)*100)+'%"></i>').join('')}
function drawModes(rows){const root=$('#modes'),max=Math.max(1,...rows.map(r=>r.starts));root.innerHTML=rows.length?rows.map(r=>'<div class="mode-row"><b>'+r.mode+'</b><div class="mode-track"><div class="mode-fill" style="width:'+Math.max(r.starts?3:0,(r.starts/max)*100)+'%"></div></div><span class="mode-n">'+fmt(r.starts)+' starts</span><span class="mode-n finish">'+fmt(r.finishes)+' done</span></div>').join(''):'<div class="empty">No mission mode events in this window.</div>'}
function render(days){const a=DATA.windows[days]||DATA.windows[String(days)]||{};document.querySelectorAll('.range').forEach(b=>b.classList.toggle('active',b.dataset.days==days));$('#generated').textContent=new Date(DATA.generatedAt).toLocaleString();$('#coverage').textContent=pct(a.visitorCoverage);$('#coverage-note').textContent=a.legacySessionsExcluded?fmt(a.legacySessionsExcluded)+' legacy sessions are excluded from stable-player counts.':'All app sessions in this window carry stable anonymous hashes.';$('#metrics').innerHTML=[card('Unique devices',fmt(a.uniqueDevices),'Hashed, privacy-safe players'),card('New players',fmt(a.newDevices),'First status in this window'),card('Returning players',fmt(a.returningDevices),'Returning at first status'),card('App sessions',fmt(a.sessions),'Distinct app-open sessions'),card('Active playtime',duration(a.totalActiveSeconds),'Measured foreground time'),card('Avg active session',duration(a.averageActiveSessionSeconds),fmt(a.measuredActiveSessions)+' measured sessions'),card('Mission starts',fmt(a.missionStarts),'Campaign, weekly & boss runs'),card('Run finishes',fmt(a.runFinishes),pct(a.finishRate)+' of mission starts'),card('Scores submitted',fmt(a.scoreSubmissions),'Weekly score submissions')].join('');drawTrend(a.daily||[]);drawTime(a.daily||[]);drawModes(a.modes||[])}
document.querySelectorAll('.range').forEach(b=>b.addEventListener('click',()=>render(Number(b.dataset.days))));render(30);`;
  return pageShell({ title: 'Scicon Player Analytics', body, script });
};

export const renderPlayerAnalyticsSetup = ({ repositoryRoot = '' } = {}) => pageShell({
  title: 'Scicon Player Analytics — Setup',
  body: `<section class="setup"><div class="eyebrow">One-time desktop connection</div><h1>Player Analytics</h1><p class="sub">The private dashboard is installed, but this computer does not yet have read credentials for the production event table. No sample or invented player data is being shown.</p><div class="steps"><div class="step">Open the project root <code>.env.local</code>${repositoryRoot ? ` at <code>${escapeHtml(repositoryRoot)}</code>` : ''}.</div><div class="step">Add the Supabase project URL and a server-only key.</div><div class="step">Open the desktop shortcut again. It will build a fresh aggregate snapshot.</div></div><pre>SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET

# Optional when the table name differs:
SUPABASE_PRODUCT_EVENTS_TABLE=scicon_product_events</pre><p class="fine">You may use <code>SUPABASE_SERVICE_ROLE_KEY</code> instead of <code>SUPABASE_SECRET_KEY</code>. Keep the key only in <code>.env.local</code>; never commit it or place it in browser code. The generated dashboard contains aggregates only.</p></section>`
});

export const renderPlayerAnalyticsError = ({ message = 'The analytics source could not be read.' } = {}) => pageShell({
  title: 'Scicon Player Analytics — Connection Issue',
  body: `<section class="setup error"><div class="eyebrow">Connection issue</div><h1>Dashboard not refreshed</h1><p class="sub">${escapeHtml(message)}</p><p>The shortcut did not replace this with invented or stale metrics. Check the local Supabase values in <code>.env.local</code>, then open the shortcut again.</p><p class="fine">Server credentials remain local and are never written into this page.</p></section>`
});

const parseOutputPath = (argv) => {
  const index = argv.indexOf('--output');
  if (index >= 0 && argv[index + 1]) return path.resolve(argv[index + 1]);
  return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Scicon Player Analytics', 'player-analytics.html');
};

export const buildPlayerAnalyticsDashboard = async ({
  outputPath = parseOutputPath(process.argv.slice(2)),
  environment = process.env,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
} = {}) => {
  const config = resolveProductAnalyticsEnvironment(environment);
  let html;
  let state;
  let eventCount = 0;
  if (!hasProductAnalyticsCredentials(config)) {
    html = renderPlayerAnalyticsSetup({ repositoryRoot });
    state = 'setup-required';
  } else {
    try {
      const result = await readProductAnalyticsEvents({ ...config, days: 90, now, fetchImpl });
      eventCount = result.events.length;
      html = renderPlayerAnalyticsDashboard({
        analytics: buildProductAnalyticsWindows(result.events, { now }),
        generatedAt: result.fetchedAt,
        source: result.source
      });
      state = 'ready';
    } catch (error) {
      html = renderPlayerAnalyticsError({ message: error?.message });
      state = 'connection-error';
    }
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return { outputPath, state, eventCount };
};

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const receipt = await buildPlayerAnalyticsDashboard();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
