import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { launchChrome, isolatedContext, DEVICES, appFrame, redact } from './browser.mjs';
import { auditTextGeometry } from './ui-geometry.mjs';
import { auditSvgTextGeometry } from './ui-svg-geometry.mjs';
import { uiFixture, uiRecordCardFixture } from './ui-fixtures.mjs';

// Reports cannot silently combine captures made with weaker geometry checks.
export const UI_GEOMETRY_ENGINE_HASH = createHash('sha256').update(auditTextGeometry.toString()).update(auditSvgTextGeometry.toString()).digest('hex');

export const UI_SCREEN_NAMES = ["home", "weekly-pilot", "weekly-proposal", "campaign-map", "mission-briefing", "campaign-locked-mission", "frontier-daily", "frontier-weekly", "research-tree", "research-node-locked", "weekly-briefing", "weekly-live-board", "weekly-entry", "daily-gift", "gift-reveal", "achievements", "hangar", "main-upgrades", "weapon-preview", "token-exchange", "wings", "support-preview", "ship-access", "signals", "signals-empty", "trophies-empty", "signals-search-empty", "trophies-weekly", "leaderboard-record", "trophies-all-time", "trophies-past-picks", "trophies-records", "trophies-campaign", "more", "settings", "treasury", "research-coin", "referral", "feedback", "bug-report", "legal", "flight-guide", "boss-archive", "boss-archive-index", "story", "story-vault", "mission-help", "loading", "pause", "victory", "victory-long", "boss-result", "campaign-complete", "defeat", "boss-defeat", "weekly-result", "weekly-score-entry", "record-preview", "proposal-selection", "proposal-selected", "proposal-search-empty", "victory-gameplay"];
export const UI_DEVICES = {
  // REVAMP(Q): actual short visual viewports after mobile browser/install chrome.
  '360x560': { viewport: { width: 360, height: 560 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '390x664': { viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '412x700': { viewport: { width: 412, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '360x640': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '390x844': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  '430x932': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: DEVICES.desktop,
};
export function options(argv) {
  const result = { dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa', devices: Object.keys(UI_DEVICES), baseline: false, naturalVictory: true };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--baseline') result.baseline = true;
    else if (key === '--no-natural-victory') result.naturalVictory = false;
    else if (['--dist', '--output', '--run-id', '--devices', '--screens'].includes(key)) {
      const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      result[key === '--run-id' ? 'runId' : key.slice(2)] = ['--devices', '--screens'].includes(key) ? value.split(',') : value;
    } else throw new Error(`Unknown option ${key}`);
  }
  if (result.devices.some(device => !UI_DEVICES[device])) throw new Error('Unknown device');
  if (result.runId && !/^[a-zA-Z0-9._-]+$/.test(result.runId)) throw new Error('Invalid run id');
  return result;
}

async function click(game, name, { exact = true } = {}) {
  const target = game.getByRole('button', { name, exact }).filter({ visible: true }).first();
  await target.click({ timeout: 12000 });
  await game.waitForTimeout(380);
}
async function tab(game, id) {
  await game.locator(`button[data-dashboard-tab="${id}"]:visible`).first().click({ timeout: 12000 });
  await game.locator(`.scicon-start-screen[data-dashboard-tab="${id}"]:visible`).waitFor({timeout:8000});
  await game.waitForTimeout(500);
}
async function settleVictory(game, minButtons = 3) {
  await game.locator('.wave-victory-overlay').waitFor({state:'visible',timeout:15000});
  await game.waitForFunction(minimum => {
    const buttons = [...document.querySelectorAll('.wave-victory-overlay button')];
    return buttons.length >= minimum && buttons.every(button => button.disabled || Number(getComputedStyle(button).opacity) >= 0.99);
  }, minButtons, {timeout:15000});
  await game.waitForTimeout(150);
}
async function close(game, name) { await click(game, name, { exact: typeof name === 'string' }); }
async function expand(game, selector) { const control = game.locator(selector).filter({ visible: true }).first(); await control.click({ timeout: 12000 }); await game.waitForTimeout(400); }

/** Capture every vertical scroll slice; never hide genuine overflow with an audit stylesheet. */
async function inspectScreen(page, game, directory, name, result) {
  await game.evaluate(async () => { await document.fonts.ready; });
  await game.waitForTimeout(350);
  const carousel = game.locator('.sci-weekly-winner-card:visible button').first();
  if (await carousel.count() && !await game.locator('[aria-modal="true"]:visible,dialog[open]').count()) { await carousel.evaluate(element => element.focus({preventScroll:true})); await game.waitForTimeout(400); }
  const captures = [];
  const dedupe = new Set();
  const capture = async label => {
    const geometry = await game.evaluate(auditTextGeometry);
    const svgGeometry = await game.evaluate(auditSvgTextGeometry);
    geometry.violations.push(...svgGeometry.violations);
    result.checkedSvgTexts = (result.checkedSvgTexts || 0) + svgGeometry.checkedSvgTexts;
    result.checkedSvgCenters = (result.checkedSvgCenters || 0) + svgGeometry.checkedSvgCenters;
    const filename = `${name}${label ? `-${label}` : ''}.png`;
    await page.screenshot({ path: path.join(directory, filename), timeout: 30000 });
    captures.push(filename);
    result.checkedTextNodes += geometry.checkedTextNodes;
    result.checkedControls += geometry.checkedControls;
    for (const key of ['checkedCenters', 'checkedFrameTexts', 'checkedSafeControls']) result[key] = (result[key] || 0) + geometry[key];
    result.visualViewport = geometry.viewport; result.safeInsets = geometry.safeInsets; result.frameScale = geometry.frameScale;
    for (const violation of geometry.violations) {
      const key = `${violation.type}|${violation.selector}|${violation.text}|${violation.related}`;
      if (!dedupe.has(key)) { dedupe.add(key); result.violations.push({ ...violation, screenshot: filename }); }
    }
  };
  await capture('');
  const scrollers = await game.evaluate(screenName => {
    const dialogs = [...document.querySelectorAll('[aria-modal="true"],dialog[open]')].filter(element => element.getClientRects().length);
    const scope = dialogs.at(-1) || document.body;
    return [scope, ...scope.querySelectorAll('*')].filter(element => {
      const css = getComputedStyle(element), box = element.getBoundingClientRect();
      return !(screenName !== 'campaign-map' && element.matches('.campaign-map-route-scroll')) && /auto|scroll/.test(css.overflowY) && element.scrollHeight > element.clientHeight + 4 && box.width > 30 && box.height > 30;
    }).map((element, index) => { element.setAttribute('data-ui-audit-scroll', String(index)); return { index, height: element.clientHeight, max: element.scrollHeight - element.clientHeight, original: element.scrollTop }; });
  }, name);
  for (const scroller of scrollers) {
    let step = 0;
    for (let top = 0; top <= scroller.max; top += Math.max(1, Math.floor(scroller.height * 0.8))) {
      const value = Math.min(scroller.max, top);
      await game.locator(`[data-ui-audit-scroll="${scroller.index}"]`).evaluate((element, y) => { element.scrollTop = y; }, value);
      await game.waitForTimeout(120);
      await capture(`scroll-${scroller.index}-${step++}`);
    }
    await game.locator(`[data-ui-audit-scroll="${scroller.index}"]`).evaluate((element, y) => { element.scrollTop = y; }, scroller.max);
    await game.waitForTimeout(100); await capture(`scroll-${scroller.index}-end`);
    await game.locator(`[data-ui-audit-scroll="${scroller.index}"]`).evaluate((element, y) => { element.scrollTop = y; element.removeAttribute('data-ui-audit-scroll'); }, scroller.original);
  }
  result.screenshots = captures;
}

async function runDevice(browser, server, config, report, device) {
  const directory = path.join(report.artifactDir, device); await mkdir(directory, { recursive: true });
  DEVICES[device] = UI_DEVICES[device];
  const network = [], context = await isolatedContext(browser, server.origin, device, { network });
  let emptyFixtures = false;
  await context.route(`${server.origin}/api/**`, async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const url = new URL(route.request().url());
    if (url.pathname === '/api/record-card') return route.fulfill({status:200,contentType:'image/svg+xml',body:await uiRecordCardFixture()});
    const fixture = uiFixture(url, { empty: emptyFixtures });
    return fixture ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }) : route.fallback();
  });
  const page = await context.newPage(); let game;
  const errors = [];
  page.on('pageerror', error => errors.push(redact(error.message)));
  const reset = async (query = '?qa=1&uiAudit=1&seed=12345') => {
    await page.goto(`${server.origin}/${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    game = await appFrame(page, device === 'desktop' ? 'desktop' : 'mobile');
    await game.locator('[data-onboarding-target="campaign-start"]:visible').first().waitFor({ state: 'visible', timeout: 60000 });
    await game.waitForTimeout(700);
  };
  const screen = async (name, setup, { fixture = false, capture = true, outer = false } = {}) => {
    const selected = !config.screens || config.screens.includes(name);
    if (!selected) return;
    const result = { device, screen: name, build:config.dist, geometryEngineHash: UI_GEOMETRY_ENGINE_HASH, source: fixture ? 'guarded presentation fixture using production component' : 'visible UI navigation', status: 'running', violations: [], screenshots: [], checkedTextNodes: 0, checkedControls: 0 };
    report.results.push(result);
    try {
      emptyFixtures = ['signals-empty','trophies-empty'].includes(name);
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
      await reset(name === 'flight-guide' ? '?seed=12345' : undefined); await setup(game);
      if (capture) await inspectScreen(page, outer ? page : game, directory, name, result);
      if (['victory','victory-long','boss-result','campaign-complete','defeat','boss-defeat','weekly-result','weekly-score-entry','record-preview','proposal-selection'].includes(name) && (result.checkedTextNodes < 8 || result.checkedControls < (name === 'boss-result' ? 1 : 2))) throw new Error('Result did not reveal enough text and controls to validate');
      if (result.checkedTextNodes === 0) throw new Error('Screen contains no auditable text');
      result.status = result.violations.length ? 'failed' : 'passed';
    } catch (error) {
      result.status = 'failed'; result.error = redact(error.message);
      await page.screenshot({ path: path.join(directory, `${name}-error.png`), timeout: 10000 }).then(() => result.screenshots.push(`${name}-error.png`)).catch(() => {});
    }
    process.stdout.write(`${device} ${name}: ${result.status} (${result.violations.length} overflows)${result.error ? ` ${result.error.split('\n')[0]}` : ''}\n`);
    await writeReport(report);
  };
  try {
    await screen('home', async () => {});
    await screen('weekly-pilot', async g => { await g.locator('.sci-weekly-winner-card:visible').scrollIntoViewIfNeeded(); await g.locator('.sci-weekly-winner-card:visible button').first().focus(); });
    await screen('weekly-proposal', async g => { await g.locator('.sci-weekly-winner-card:visible').scrollIntoViewIfNeeded(); await click(g,'Show selected proposal'); });
    await screen('campaign-map', async g => { await click(g, /^Open Campaign Map/,{exact:false}); await g.locator('.campaign-map-selection').waitFor({timeout:15000}); });
    await screen('mission-briefing', async g => { await click(g, /^Open Campaign Map/,{exact:false}); await g.locator('[data-onboarding-target="campaign-mission"]').filter({ visible: true }).first().click({ force: true }); });
    await screen('campaign-locked-mission', async g => { await click(g, /^Open Campaign Map/,{exact:false}); await g.locator('.campaign-map-node:not([data-map-current="true"]):not([disabled])').filter({visible:true}).first().click({force:true}); });
    await screen('frontier-daily', async g => { await expand(g,'.revamp-progression > summary'); });
    await screen('frontier-weekly', async g => { await expand(g,'.revamp-progression > summary'); await click(g,'Weekly · 5'); });
    await screen('research-tree', async g => { await expand(g,'.revamp-progression > summary'); await click(g,'Research'); });
    await screen('research-node-locked', async g => { await expand(g,'.revamp-progression > summary'); await click(g,'Research'); await g.locator('.revamp-tree__branch--overdrive button').filter({visible:true}).last().click({force:true}); });
    await screen('weekly-briefing', async g => { await g.locator('.revamp-weekly-card:visible').first().scrollIntoViewIfNeeded(); });
    await screen('weekly-live-board', async g => { await expand(g,'.revamp-weekly-board > summary'); });
    await screen('weekly-entry', async g => { await click(g,/^Play Weekly Run/,{exact:false}); });
    await screen('daily-gift', async g => { await click(g,'Claim daily gift'); });
    await screen('gift-reveal', async g => { await click(g,'Claim daily gift'); await g.locator('.sci-daily-card.is-today button,button.sci-daily-card.is-today').first().filter({ visible: true }).first().click({ force: true }); });
    await screen('achievements', async g => { await click(g,'Claim daily gift'); await g.getByRole('tab',{name:/Achievements/}).filter({ visible: true }).first().click({ force: true }); });
    await screen('hangar', async g => { await tab(g,'hangar'); });
    await screen('main-upgrades', async g => { await tab(g,'hangar'); await g.locator('[data-onboarding-target="hangar-upgrades"]').filter({ visible: true }).first().click({ force: true }); });
    await screen('weapon-preview', async g => { await tab(g,'hangar'); await click(g,/^Preview .* primary weapon/,{exact:false}); });
    await screen('token-exchange', async g => { await tab(g,'hangar'); await click(g,'Buy Tokens with Research Coin'); });
    await screen('wings', async g => { await tab(g,'hangar'); await g.locator('[data-onboarding-target="hangar-wings"]').filter({ visible: true }).first().click({ force: true }); });
    await screen('support-preview', async g => { await tab(g,'hangar'); await g.locator('[data-onboarding-target="hangar-wings"]').filter({ visible: true }).first().click({ force: true }); await click(g,/^Preview .* support ability/,{exact:false}); });
    await screen('ship-access', async g => { await tab(g,'hangar'); await g.locator('[data-onboarding-target="hangar-ships"]:visible button').last().filter({ visible: true }).first().click({ force: true }); });
    await screen('signals', async g => { await tab(g,'proposals'); });
    await screen('signals-empty', async g => { await tab(g,'proposals'); });
    await screen('trophies-empty', async g => { await tab(g,'trophies'); });
    await screen('signals-search-empty', async g => { await tab(g,'proposals'); await g.getByRole('searchbox').fill('no matching proposal 1701'); });
    await screen('trophies-weekly', async g => { await tab(g,'trophies'); });
    await screen('leaderboard-record', async g => { await tab(g,'trophies'); await click(g,/MMMMMMMMMMMMMMM, first place/,{exact:false}); await g.locator('[aria-labelledby="leaderboard-record-title"]').waitFor(); });
    await screen('trophies-all-time', async g => { await tab(g,'trophies'); await click(g,'All-time'); });
    await screen('trophies-past-picks', async g => { await tab(g,'trophies'); await click(g,'Past picks'); });
    await screen('trophies-records', async g => { await tab(g,'trophies'); await click(g,'My records'); });
    await screen('trophies-campaign', async g => { await tab(g,'trophies'); await g.getByRole('tab',{name:'Campaign',exact:true}).filter({visible:true}).first().click({force:true}); });
    await screen('more', async g => { await tab(g,'more'); });
    await screen('settings', async g => { await tab(g,'more'); await click(g,/Audio Settings/,{exact:false}); });
    for (const [name,label] of [['treasury','Treasury'],['research-coin','RSC on Base'],['referral','Referral'],['feedback','Feedback'],['bug-report','Report a Bug'],['legal','Terms of Use & Privacy']]) {
      await screen(name, async g => { await tab(g,'more'); await click(g,label); });
    }
    await screen('flight-guide', async g => { await tab(g,'more'); await click(g,'Flight Guide'); await g.locator('[data-onboarding-target="campaign-start"]:visible').first().click(); await g.locator('[data-onboarding-step="flight-steer"]').waitFor({timeout:45000}); });
    const openArchive = async g => {
      if (!await g.getByRole('button',{name:/^Open Boss Archive/}).count()) {
        await g.waitForFunction(() => Boolean(window.__sciconUIAudit), null, {timeout:10000});
        await g.evaluate(() => window.__sciconUIAudit.present('unlock-archive'));
        await g.waitForTimeout(300);
      }
      await click(g,/^Open Boss Archive/,{exact:false});
      const skip = g.getByRole('button',{name:/Skip reveal/});
      if (await skip.count()) await skip.click({force:true});
    };
    if (!config.baseline) {
      await screen('boss-archive', openArchive, { fixture: true });
      await screen('boss-archive-index', async g => { await openArchive(g); await click(g,/Archive Index|Open.*index/i,{exact:false}); }, { fixture: true });
    }
    for (const scene of ['story','story-vault','mission-help','loading','pause','victory','victory-long','boss-result','campaign-complete','defeat','boss-defeat','weekly-result','weekly-score-entry','record-preview','proposal-selection','proposal-selected','proposal-search-empty']) {
      if (config.baseline) continue;
      await screen(scene, async g => {
        await g.waitForFunction(() => Boolean(window.__sciconUIAudit), null, {timeout:10000});
        await g.evaluate(name => window.__sciconUIAudit.present(name), scene.startsWith('proposal-') ? 'proposal-selection' : scene);
        await g.waitForTimeout(['victory','victory-long','boss-result','campaign-complete','defeat','boss-defeat','weekly-result','weekly-score-entry','record-preview','proposal-selection','proposal-selected','proposal-search-empty'].includes(scene) ? 2800 : scene === 'story-vault' ? 6500 : 800);
        if (['victory','victory-long','boss-result','campaign-complete'].includes(scene)) await settleVictory(g, scene === 'boss-result' ? 1 : 3);
        if (scene === 'proposal-selected') await g.locator('[aria-labelledby="weekly-proposal-selection-title"] button[aria-pressed]').first().click();
        if (scene === 'proposal-search-empty') await g.locator('#weekly-proposal-search').fill('no matching research 1701');
        if (scene === 'story-vault') await g.locator('.sci-funding-vault__transmission:visible').waitFor({timeout:10000});
        if (scene === 'story') await g.locator('.frontier-transmission:visible').waitFor({timeout:10000});
      }, { fixture: true });
    }
    if (config.naturalVictory && (!config.screens || config.screens.includes('victory-gameplay'))) {
      await screen('victory-gameplay', async () => {
        await page.evaluate(() => sessionStorage.clear());
        await page.goto(`${server.origin}/?qa=1&mission=operation-open-galaxy&autoplay=1&skipIntro=1&god=1&seed=12345`,{waitUntil:'domcontentloaded',timeout:60000});
        game = await appFrame(page, device === 'desktop' ? 'desktop' : 'mobile');
        await game.locator('.wave-victory-overlay').waitFor({state:'visible',timeout:600000});
        // REVAMP(Q): actions are usable immediately; count-ups/rewards still
        // need the same settling window as the result presentation fixtures.
        await game.waitForTimeout(2800);
        await settleVictory(game);
      });
    }
    if (device === 'desktop') await screen('desktop-playing-shell', async () => {}, {outer:true});
    if (device === 'desktop' && (!config.screens || config.screens.includes('desktop-shell'))) {
      await page.evaluate(() => sessionStorage.clear());
      await page.goto(server.origin, { waitUntil: 'domcontentloaded' }); await page.getByRole('button',{name:/Start Browser Run/}).waitFor();
      const result = { device, screen:'desktop-shell', build:config.dist, geometryEngineHash: UI_GEOMETRY_ENGINE_HASH, source:'real desktop launcher',status:'running',violations:[],screenshots:[],checkedTextNodes:0,checkedControls:0 }; report.results.push(result);
      await inspectScreen(page,page,directory,'desktop-shell',result); result.status=result.violations.length?'failed':'passed';
    }
    report.browserErrors.push(...errors.map(error=>({device,error})));
    report.network.push(...network);
  } finally { await context.close(); }
}
export async function writeReport(report) {
  report.overflowCount = report.results.reduce((sum,result)=>sum+result.violations.length,0);
  report.failedScreens = report.results.filter(result=>result.status==='failed').length;
  report.navigationFailures = report.results.filter(result => result.error && !result.error.includes('auditable text') && !result.error.includes('reveal enough')).length;
  report.blankScreens = report.results.filter(result => result.error?.includes('auditable text') || result.error?.includes('reveal enough')).length;
  report.capturedScreens = report.results.filter(result => result.checkedTextNodes > 0 && !result.error).length;
  report.status = report.failedScreens || report.browserErrors.length ? 'failed' : report.finishedAt ? 'passed' : 'running';
  await writeFile(path.join(report.artifactDir,'report.json'),JSON.stringify(report,null,2));
  const lines = ['# SciCon UI geometry audit','',`Status: **${report.status.toUpperCase()}** · ${report.overflowCount} overflows · ${report.results.length} screen/device cases · ${report.failedScreens} failed cases · ${report.navigationFailures} navigation failures · ${report.blankScreens} blank cases.`, '',
    'Mobile sizes: 360×560, 390×664, 412×700, 360×640, 390×844 (DPR 2), 430×932 (DPR 3). Desktop: 1280×800, real mobile-game iframe. All network activity is fulfilled offline; no wallet connection or external write is attempted.', '',
    'Checks text-node Range rectangles against their own element and nearest bordered panel, overflow clipping, scrollWidth, sibling control collisions, >3px centering deviations, declared frame inner rectangles, and interactive visual-viewport / env safe-area bounds. Every scroll panel is sampled from top to bottom; screenshots preserve the actual motion and styling. Normal scroll boundaries and intentional modal backdrops are excluded; covered sibling controls are still checked.', '',
    `Coverage: ${report.partial ? 'PARTIAL diagnostic; do not treat as a full UI pass.' : 'Full requested device/screen matrix.'} Fixture result screens use production React components with in-memory data. Gameplay victory is separately identified.`, '',
    '| Device | Screen | Source | Text / controls / SVG / centers / frame / safe controls checked | Overflows | Status |','|---|---|---|---:|---:|---|',
    ...report.results.map(result=>`| ${result.device} | [${result.screen}](${result.device}/${result.screenshots[0]||''}) | ${result.source} | ${result.checkedTextNodes} / ${result.checkedControls} / ${result.checkedSvgTexts||0} / ${result.checkedCenters||0} / ${result.checkedFrameTexts||0} / ${result.checkedSafeControls||0} | ${result.violations.length} | ${result.status} |`)];
  if(report.provenance)lines.push('','## Batch provenance','', 'This complete matrix combines isolated browser batches. Later runs replace only the same device/screen case; every original report is retained. Unchanged cases from an earlier build are identified individually in JSON.', '', ...report.provenance.map(item=>`- ${item.runId}: ${item.dist || 'see source report'} — ${item.reportPath}`));
  for(const result of report.results.filter(item=>item.violations.length||item.error)){
    lines.push('',`## ${result.device} / ${result.screen}`,'');
    if(result.error)lines.push(`Navigation/capture failure: ${result.error}`,'');
    for(const item of result.violations) lines.push(`- **${item.type}** — \`${item.selector}\`: “${item.text.replaceAll('|','/')}”${item.related?` against \`${item.related}\``:''}. [Screenshot](${result.device}/${item.screenshot})`);
  }
  if(report.browserErrors.length)lines.push('','## Browser errors','',...report.browserErrors.map(item=>`- ${item.device}: ${item.error}`));
  await writeFile(path.join(report.artifactDir,'report.md'),lines.join('\n')+'\n');
}
export async function run(argv=process.argv.slice(2)){
  const config=options(argv),runId=config.runId||`Q-ui-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  const artifactDir=path.join(config.output,runId);await mkdir(artifactDir,{recursive:false});
  const report={runId,artifactDir,dist:config.dist,geometryEngineHash:UI_GEOMETRY_ENGINE_HASH,startedAt:new Date().toISOString(),devices:config.devices,partial:Boolean(config.screens||config.devices.length!==Object.keys(UI_DEVICES).length||!config.naturalVictory||config.baseline),baseline:config.baseline,results:[],browserErrors:[],network:[],status:'running'};
  let server,browser;
  try{server=await startStaticServer({dist:config.dist});browser=await launchChrome();for(const device of config.devices)await runDevice(browser,server,config,report,device);}
  catch(error){report.browserErrors.push({device:'harness',error:redact(error.message)});}
  finally{
    for (const requested of config.screens || []) if (!report.results.some(result => result.screen === requested)) report.browserErrors.push({device:'harness',error:`Requested screen was not visited: ${requested}`});
    if (!report.results.length) report.browserErrors.push({device:'harness',error:'No screens audited'});
    await browser?.close();await server?.close();report.finishedAt=new Date().toISOString();await writeReport(report);}
  console.log(`${report.status.toUpperCase()}: ${report.overflowCount} overflows; ${path.join(artifactDir,'report.md')}`);
  return report.status==='passed'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await run();
