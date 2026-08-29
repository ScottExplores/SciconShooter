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

const pageShell = ({ title, body, script = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
<style>
:root{--ink:#eafcff;--muted:#88a7bc;--panel:#071827e8;--line:#126984;--cyan:#19d8ff;--green:#42f0b2;--yellow:#ffd65a;--red:#ff6b7d;--violet:#8b7cff;--bg:#020813}*{box-sizing:border-box}html{min-height:100%;background:var(--bg)}body{margin:0;min-height:100vh;color:var(--ink);font-family:Inter,Segoe UI,Arial,sans-serif;background:radial-gradient(circle at 18% 8%,#123056 0,transparent 35%),radial-gradient(circle at 88% 34%,#081b47 0,transparent 33%),linear-gradient(145deg,#020711,#040d1c 56%,#01050d)}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.28;background-image:linear-gradient(#0ad7ff08 1px,transparent 1px),linear-gradient(90deg,#0ad7ff08 1px,transparent 1px);background-size:28px 28px}.wrap{position:relative;width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 56px}.top{display:flex;gap:24px;justify-content:space-between;align-items:flex-start;border:1px solid #1585a8;background:linear-gradient(135deg,#08223aee,#061523ee);padding:22px 24px;box-shadow:0 0 0 2px #04101c,0 0 28px #00c8ff20;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}.eyebrow{font:700 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--green);letter-spacing:.2em;text-transform:uppercase}.top h1{font-size:clamp(28px,5vw,48px);letter-spacing:.04em;margin:8px 0 5px;text-transform:uppercase}.sub,.fine{color:var(--muted);line-height:1.5}.source{min-width:220px;text-align:right}.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid #2bd6a4;color:#8effd4;background:#053326;padding:7px 10px;font:700 11px ui-monospace,monospace;letter-spacing:.08em}.pill:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green)}.controls{display:flex;gap:8px;margin:22px 0 14px}.range{cursor:pointer;border:1px solid #1f5c76;color:#91b8ce;background:#071828;padding:10px 17px;font-weight:800;letter-spacing:.08em}.range:hover,.range.active{color:#03111a;background:linear-gradient(135deg,var(--green),var(--cyan));border-color:#91fff0;box-shadow:0 0 20px #19d8ff33}.coverage{display:flex;justify-content:space-between;gap:18px;align-items:center;border:1px solid #5a4c18;background:#211c08cc;color:#f6e7a5;padding:10px 14px;margin-bottom:14px}.coverage strong{color:var(--yellow)}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.card,.panel{border:1px solid #0e5870;background:linear-gradient(155deg,#092035e8,#05121fe8);box-shadow:inset 0 1px #1ec6ec22,0 10px 28px #0005}.card{padding:15px;min-height:112px}.card span{display:block;color:#83a7bb;font:700 10px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.card b{display:block;margin:10px 0 5px;font-size:clamp(22px,3vw,32px);color:#f2feff}.card small{color:#6f92a8}.charts{display:grid;grid-template-columns:1.45fr 1fr;gap:12px;margin-top:12px}.panel{padding:18px}.panel h2{font-size:15px;letter-spacing:.09em;text-transform:uppercase;margin:0 0 4px}.panel .hint{font-size:12px;color:#7599ad;margin-bottom:15px}.chart{width:100%;height:240px;overflow:visible}.axis{stroke:#1f526b;stroke-width:1}.gridline{stroke:#12394d;stroke-width:1}.sessions-line{fill:none;stroke:var(--cyan);stroke-width:3;filter:drop-shadow(0 0 4px #19d8ff80)}.visitors-line{fill:none;stroke:var(--green);stroke-width:2}.dot-s{fill:var(--cyan)}.dot-v{fill:var(--green)}.legend{display:flex;gap:18px;color:#93afbf;font-size:12px}.legend i{display:inline-block;width:12px;height:3px;margin-right:6px;vertical-align:middle}.bars{height:240px;display:flex;align-items:flex-end;gap:3px;border-bottom:1px solid #1f526b;background:repeating-linear-gradient(to top,transparent 0,transparent 47px,#12394d 48px)}.bar{flex:1;min-width:2px;background:linear-gradient(to top,#355df0,#19d8ff);box-shadow:0 0 8px #19d8ff42}.modes{grid-column:1/-1}.mode-row{display:grid;grid-template-columns:170px 1fr 72px 72px;gap:12px;align-items:center;margin:10px 0;color:#a8c0cf}.mode-track{height:11px;border:1px solid #164c64;background:#03101a}.mode-fill{height:100%;background:linear-gradient(90deg,var(--violet),var(--cyan));box-shadow:0 0 8px #19d8ff55}.mode-n{text-align:right;color:#e9fdff;font:700 12px ui-monospace,monospace}.empty{color:#718ca0;padding:30px 0;text-align:center}.method{margin-top:12px;padding:18px;border:1px solid #173d50;background:#04101bd9}.method summary{cursor:pointer;color:#bdefff;font-weight:800}.method p,.method li{color:#86a5b7;line-height:1.55}.method code,.setup code{color:#9effdb;background:#03141a;padding:2px 5px}.setup{max-width:760px;margin:70px auto;border:1px solid #168aae;background:#061827ed;padding:30px;box-shadow:0 0 44px #19d8ff22}.setup h1{font-size:34px;margin:8px 0}.setup pre{white-space:pre-wrap;border:1px solid #1c5369;background:#020b12;padding:16px;color:#9effdb;overflow:auto}.steps{counter-reset:step;display:grid;gap:12px;margin:22px 0}.step{counter-increment:step;border-left:3px solid var(--cyan);padding:10px 14px;background:#082036}.step:before{content:counter(step);display:inline-grid;place-items:center;width:24px;height:24px;margin-right:9px;border-radius:50%;background:var(--cyan);color:#001018;font-weight:900}.error{border-color:#8a3342}.error .eyebrow{color:#ff8a9a}@media(max-width:900px){.grid{grid-template-columns:repeat(3,1fr)}.charts{grid-template-columns:1fr}.modes{grid-column:auto}.source{text-align:left}.top{display:block}.source{margin-top:14px}}@media(max-width:580px){.wrap{width:min(100% - 18px,1180px);padding-top:9px}.grid{grid-template-columns:repeat(2,1fr)}.top{padding:17px}.coverage{display:block}.coverage span{display:block;margin-top:6px}.mode-row{grid-template-columns:110px 1fr 45px}.mode-row .finish{display:none}.card{min-height:98px}.panel{padding:13px}}
</style>
<style>
.healthbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 14px;padding:12px 14px;border:1px solid #236c80;background:#071b28}.healthbar.ok{border-color:#187857;background:#06241d}.healthbar.warn{border-color:#7d6420;background:#241d08}.healthbar strong{font:900 12px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}.healthbar span{color:#a9bfcb;font-size:12px;text-align:right}.facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.fact{border:1px solid #174b61;background:#04121e;padding:7px 10px;color:#91b1c2;font:700 11px ui-monospace,monospace}.fact b{color:#e9fdff}.span-all{grid-column:1/-1}.split{display:grid;grid-template-columns:1.15fr .85fr;gap:12px}.table-wrap{overflow:auto;border:1px solid #123f53}.data-table{width:100%;border-collapse:collapse;min-width:680px;font-size:12px}.data-table th{position:sticky;top:0;background:#082235;color:#70ddf5;font:800 10px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;text-align:right;padding:10px;border-bottom:1px solid #1a6078}.data-table th:first-child,.data-table td:first-child{text-align:left}.data-table td{padding:10px;text-align:right;border-bottom:1px solid #0c3040;color:#b7ccd7}.data-table tr:last-child td{border-bottom:0}.data-table tr:hover td{background:#0b2637}.positive{color:var(--green)!important}.warning{color:var(--yellow)!important}.negative{color:var(--red)!important}.mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}.mini-card{padding:12px;border:1px solid #164c62;background:#04131f}.mini-card span{display:block;color:#7f9faf;font:700 9px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.mini-card b{display:block;margin-top:7px;font-size:22px}.depth-row,.furthest-row{display:grid;grid-template-columns:70px 1fr 48px;gap:10px;align-items:center;margin:9px 0}.depth-track{height:11px;border:1px solid #194d61;background:#020d16}.depth-fill{height:100%;background:linear-gradient(90deg,#6052ed,var(--cyan));box-shadow:0 0 8px #19d8ff44}.depth-label,.depth-value{font:700 11px ui-monospace,monospace;color:#a8c5d3}.depth-value{text-align:right;color:#f0feff}.quality-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.quality{padding:11px;border:1px solid #16485c;background:#04131f}.quality span{display:block;color:#7e9dab;font:700 9px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.quality b{display:block;margin-top:7px;font-size:18px}.quality small{display:block;margin-top:4px;color:#6f8b9a;line-height:1.35}.tag{display:inline-flex;padding:3px 6px;border:1px solid currentColor;font:800 9px ui-monospace,monospace;letter-spacing:.08em}.tag.ok{color:var(--green)}.tag.warn{color:var(--yellow)}.tag.bad{color:var(--red)}
@media(max-width:900px){.split{grid-template-columns:1fr}.quality-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:580px){.healthbar{display:block}.healthbar span{display:block;text-align:left;margin-top:7px}.mini-grid{grid-template-columns:repeat(2,1fr)}.quality-grid{grid-template-columns:1fr}.charts{gap:9px}.facts{gap:5px}.fact{font-size:10px}}
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
  <header class="top"><div><div class="eyebrow">Scicon gameplay telemetry</div><h1>Player Analytics</h1><div class="sub">Confirmed production-only play health, Mission progression, and Weekly Run depth from Supabase. This is separate from the Base Dashboard.</div></div><div class="source"><div class="pill">PRIVATE AGGREGATES</div><div class="fine" style="margin-top:8px">Generated <span id="generated"></span><br>Latest live event <span id="freshness">—</span><br>${escapeHtml(cleanSource.system)} · ${escapeHtml(cleanSource.table)}</div></div></header>
  <nav class="controls" aria-label="Reporting window"><button class="range" data-days="7">7 DAYS</button><button class="range active" data-days="30">30 DAYS</button><button class="range" data-days="90">90 DAYS</button></nav>
  <div class="healthbar" id="health"><strong id="health-title">Checking measurement coverage</strong><span id="health-note">New tracking fields may need live production traffic before they fill in.</span></div>
  <section class="grid" id="metrics"></section>
  <div class="facts" id="facts"></div>
  <section class="charts">
    <article class="panel"><h2>Player &amp; session trend</h2><div class="hint">Daily privacy-safe devices and app sessions · UTC</div><svg class="chart" id="trend" viewBox="0 0 720 240" role="img" aria-label="Daily player and session trend"></svg><div class="legend"><span><i style="background:var(--cyan)"></i>Sessions</span><span><i style="background:var(--green)"></i>Unique devices</span></div></article>
    <article class="panel"><h2>Daily playtime</h2><div class="hint" id="playtime-hint">Actual in-flight minutes while the live simulation advances</div><div class="bars" id="playtime" aria-label="Daily measured playtime"></div></article>
    <article class="panel span-all"><h2>Daily performance</h2><div class="hint">The latest 14 UTC days in the selected window</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players</th><th>Sessions</th><th>Flight time</th><th>Avg flight</th><th>Run starts</th><th>Campaign clears</th></tr></thead><tbody id="daily"></tbody></table></div></article>
    <div class="split span-all">
      <article class="panel"><h2>Campaign Mission progress</h2><div class="hint">Attempts and outcomes by Mission in this reporting window</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Mission</th><th>Players reached</th><th>Starts</th><th>Clears</th><th>Defeats</th><th>No end</th><th>Clear rate</th></tr></thead><tbody id="missions"></tbody></table></div></article>
      <article class="panel"><h2>Furthest Mission observed</h2><div class="hint">Each hashed device appears once at its furthest observed Campaign Mission</div><div id="furthest"></div></article>
    </div>
    <div class="split span-all">
      <article class="panel"><h2>Weekly Run depth</h2><div class="hint">One attempt per run; exact depth uses the highest reached wave</div><div id="weekly"></div></article>
      <article class="panel"><h2>Mode health</h2><div class="hint">Starts, recorded endings, clears, defeats, and exits</div><div id="modes"></div></article>
    </div>
    <article class="panel span-all"><h2>Data health</h2><div class="hint">Coverage tells you which numbers are fully measured and which are still warming up</div><div class="quality-grid" id="quality"></div></article>
  </section>
  <details class="method"><summary>Definitions, privacy, and interpretation</summary><ul><li><b>Players</b> are one-way hashed, random device-local identifiers. No wallet, name, IP address, raw device ID, or raw session ID is included in this file.</li><li><b>Flight time</b> counts visible time while the live game simulation is advancing. <b>Foreground time</b> also includes menus and the Hangar. Both counters are monotonic per browser tab and are deduplicated by session.</li><li><b>Campaign clear rate</b> is cleared Campaign runs divided by Campaign starts. Weekly, Boss Archive, branch, owner-test, preview, and local-development runs do not enter that denominator.</li><li><b>No end recorded</b> is not automatically a quit: a run may still be active, cross the report boundary, lose connectivity, or predate the richer outcome tracking.</li><li>Headline KPIs include only rows explicitly tagged by the server as production. Older untagged history is excluded and shown only as mixed-history context because it may include owner testing.</li><li>Daily boundaries use UTC. This is a local aggregate snapshot; open the desktop shortcut again to rebuild it from <code>${escapeHtml(cleanSource.table)}</code>.</li></ul></details>`;

  const script = `
const DATA=${embedded};
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US',{notation:Math.abs(Number(n)||0)>=10000?'compact':'standard',maximumFractionDigits:1}).format(Number(n)||0);
const show=v=>typeof v==='string'&&!/^-?\\d+(?:\\.\\d+)?$/.test(v)?esc(v):fmt(v);
const pct=n=>Math.round((Number(n)||0)*100)+'%';
const duration=s=>{s=Math.max(0,Number(s)||0);if(s>=3600)return (s/3600).toFixed(s>=36000?0:1)+' hr';if(s>=60)return Math.round(s/60)+' min';return Math.round(s)+' sec'};
const card=(label,value,note)=>'<article class="card"><span>'+label+'</span><b>'+value+'</b><small>'+note+'</small></article>';
function poly(values,max,w=720,h=240,p=24){const step=(w-p*2)/Math.max(1,values.length-1);return values.map((v,i)=>(p+i*step)+','+(h-p-(v/max)*(h-p*2))).join(' ')}
function drawTrend(rows){const svg=$('#trend'),sessions=rows.map(r=>r.sessions),visitors=rows.map(r=>r.uniqueDevices),max=Math.max(1,...sessions,...visitors);let grid='';for(let i=0;i<5;i++){const y=24+i*48;grid+='<line class="gridline" x1="24" x2="696" y1="'+y+'" y2="'+y+'"/>'}svg.innerHTML=grid+'<polyline class="sessions-line" points="'+poly(sessions,max)+'"/><polyline class="visitors-line" points="'+poly(visitors,max)+'"/>'}
function drawTime(rows){const covered=rows.some(r=>(r.measuredGameplaySessions||0)>0),values=rows.map(r=>(r.gameplaySeconds||0)/60),max=Math.max(1,...values);$('#playtime-hint').textContent=covered?'Actual in-flight minutes; unmeasured pre-rollout days remain blank':'Actual flight-time tracking is waiting for production runs';$('#playtime').innerHTML=covered?values.map((v,i)=>'<i class="bar" title="'+esc(rows[i].date)+': '+((rows[i].measuredGameplaySessions||0)>0?Math.round(v)+' min':'not measured')+'" style="height:'+Math.max(v?3:0,(v/max)*100)+'%;opacity:'+((rows[i].measuredGameplaySessions||0)>0?1:.12)+'"></i>').join(''):'<div class="empty" style="width:100%;align-self:center">No confirmed production flight time yet.</div>'}
function drawDaily(rows){const latest=rows.slice(-14).reverse();$('#daily').innerHTML=latest.length?latest.map(r=>{const measured=(r.measuredGameplaySessions||0)>0;return '<tr><td>'+esc(r.date)+' UTC</td><td>'+fmt(r.uniqueDevices)+'</td><td>'+fmt(r.sessions)+'</td><td>'+(measured?duration(r.gameplaySeconds):'—')+'</td><td>'+((r.flightSessions||0)>0?duration(r.averageGameplaySessionSeconds):'—')+'</td><td>'+fmt(r.missionStarts)+'</td><td class="positive">'+fmt(r.campaignClears)+'</td></tr>'}).join(''):'<tr><td colspan="7" class="empty">No confirmed production gameplay events in this window.</td></tr>'}
function drawMissions(rows){$('#missions').innerHTML=rows.length?rows.map(r=>'<tr><td>Mission '+fmt(r.missionNumber)+'</td><td>'+fmt(r.reachedDevices)+'</td><td>'+fmt(r.starts)+'</td><td class="positive">'+fmt(r.clears)+'</td><td class="negative">'+fmt(r.defeats)+'</td><td class="warning">'+fmt(r.noEnd)+'</td><td>'+pct(r.clearRate)+'</td></tr>').join(''):'<tr><td colspan="7" class="empty">Mission progression will fill as the new run tracking reaches production traffic.</td></tr>'}
function drawFurthest(rows){const max=Math.max(1,...rows.map(r=>r.devices));$('#furthest').innerHTML=rows.length?rows.map(r=>'<div class="furthest-row"><span class="depth-label">Mission '+fmt(r.missionNumber)+'</span><div class="depth-track"><div class="depth-fill" style="width:'+Math.max(r.devices?5:0,(r.devices/max)*100)+'%"></div></div><span class="depth-value">'+fmt(r.devices)+'</span></div>').join(''):'<div class="empty">No stable-device Mission depth is available yet.</div>'}
function drawWeekly(w){const bands=w.depthBands||[],max=Math.max(1,...bands.map(r=>r.runs));$('#weekly').innerHTML='<div class="mini-grid">'+[['Attempts',w.attempts],['Measured',w.measuredRuns],['Average depth',w.measuredRuns?Number(w.averageDepth).toFixed(1):'—'],['Deepest wave',w.measuredRuns?w.deepestDepth:'—']].map(x=>'<div class="mini-card"><span>'+x[0]+'</span><b>'+show(x[1])+'</b></div>').join('')+'</div>'+(w.measuredRuns?bands.map(r=>'<div class="depth-row"><span class="depth-label">Wave '+esc(r.label)+'</span><div class="depth-track"><div class="depth-fill" style="width:'+Math.max(r.runs?5:0,(r.runs/max)*100)+'%"></div></div><span class="depth-value">'+fmt(r.runs)+'</span></div>').join(''):'<div class="empty">Exact Weekly depth begins filling with new production runs.</div>')}
function drawModes(rows){$('#modes').innerHTML=rows.length?'<div class="table-wrap"><table class="data-table"><thead><tr><th>Mode</th><th>Starts</th><th>Ended</th><th>Clears</th><th>Defeats</th><th>No end</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.mode)+'</td><td>'+fmt(r.starts)+'</td><td>'+fmt(r.finishes)+'</td><td class="positive">'+fmt(r.clears)+'</td><td class="negative">'+fmt(r.defeats)+'</td><td class="warning">'+fmt(r.noEnd)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">No run-mode events in this window.</div>'}
function qualityCard(label,value,note,state){return '<div class="quality"><span>'+label+'</span><b>'+value+' <i class="tag '+state+'">'+(state==='ok'?'GOOD':state==='bad'?'BLOCKED':'WARMING')+'</i></b><small>'+note+'</small></div>'}
function drawQuality(q={}){const items=[['Stable player IDs',q.visitorCoverage,'Hashed-device coverage across confirmed live sessions',.8],['Foreground time',q.activeTimeCoverage,'Observed live sessions with visible-time measurement',.6],['Actual flight time',q.gameplayTimeCoverage,'Observed live sessions with simulation-only measurement',.6],['Mission numbers',q.missionNumberCoverage,'Started runs assigned to a Campaign Mission',.8],['Wave checkpoints',q.progressCoverage,'Started runs with at least one reached-wave event',.8],['Detailed outcomes',q.outcomeDetailCoverage,'Ended runs with result and depth details',.8],['Confirmed live share',q.productionSourceCoverage,'Production-tagged sessions versus older mixed history',.8],['Current schema',q.schemaV3Coverage,'Confirmed live events using the richer contract',.8]];$('#quality').innerHTML=items.map(x=>qualityCard(x[0],pct(x[1]),x[2],x[1]>=x[3]?'ok':'warn')).join('')+(q.rowLimitHit?qualityCard('Reader limit','Reached','This window begins before the oldest retained row; recent events were preserved, but this total may be incomplete.','bad'):'')}
function render(days){const a=DATA.windows[days]||DATA.windows[String(days)]||{},q=a.dataQuality||{},mixed=a.mixedHistory||{};document.querySelectorAll('.range').forEach(b=>b.classList.toggle('active',b.dataset.days==days));$('#generated').textContent=new Date(DATA.generatedAt).toLocaleString();$('#freshness').textContent=q.latestEventAt?new Date(q.latestEventAt).toLocaleString():'waiting for v3 production traffic';const hasLive=(a.sessions||0)>0,blockers=q.rowLimitHit,coreReady=hasLive&&(q.visitorCoverage||0)>=.8,health=$('#health');health.className='healthbar '+(blockers||!coreReady?'warn':'ok');$('#health-title').textContent=blockers?'Selected history is truncated':!hasLive?'Waiting for confirmed live sessions':coreReady?'Confirmed production measurement is healthy':'Live measurement is warming up';$('#health-note').textContent=blockers?'Newest rows are preserved, but this window reaches beyond the bounded snapshot.':!hasLive?(fmt(mixed.sessions)+' older mixed sessions are excluded until production-tagged traffic arrives.'):(q.gameplayTimeCoverage||0)<.6?'Live player counts are clean; actual flight time and progression are still filling from new runs.':fmt(mixed.sessions)+' older mixed sessions stay excluded from every headline KPI.';$('#metrics').innerHTML=[card('Active devices',fmt(a.uniqueDevices),'Confirmed production players in '+days+' days'),card('App sessions',fmt(a.sessions),'Confirmed production game opens'),card('Avg flight time',a.flightSessions?duration(a.averageGameplaySessionSeconds):'—',fmt(a.flightSessions)+' sessions with actual flight time'),card('Campaign clear rate',a.campaignStarts?pct(a.campaignClearRate):'—',fmt(a.campaignClears)+' clears / '+fmt(a.campaignStarts)+' starts'),card('Weekly deepest wave',a.weeklyRun?.measuredRuns?fmt(a.weeklyRun.deepestDepth):'—',fmt(a.weeklyRun?.attempts)+' attempts')].join('');$('#facts').innerHTML=[['New devices',a.newDevices],['Returning devices',a.returningDevices],['Foreground time',duration(a.totalActiveSeconds)],['Run starts',a.missionStarts],['Recorded endings',a.runFinishes],['Scores submitted',a.scoreSubmissions],['Mixed sessions excluded',mixed.sessions||0]].map(x=>'<span class="fact">'+x[0]+': <b>'+show(x[1])+'</b></span>').join('');drawTrend(a.daily||[]);drawTime(a.daily||[]);drawDaily(a.daily||[]);drawMissions(a.missionProgress||[]);drawFurthest(a.furthestMissionDistribution||[]);drawWeekly(a.weeklyRun||{});drawModes(a.modes||[]);drawQuality(q)}
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
        analytics: buildProductAnalyticsWindows(result.events, {
          now,
          rowLimitHit: result.rowLimitHit
        }),
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
