// REVAMP(Q): Offline result evidence, including short screens, live resize and safe areas.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { launchChrome, isolatedContext, DEVICES, appFrame, redact } from './browser.mjs';
import { uiFixture } from './ui-fixtures.mjs';
import { auditTextGeometry } from './ui-geometry.mjs';

export const RESULT_VIEWPORTS = {
  '360x560': { width: 360, height: 560 },
  '390x664': { width: 390, height: 664 },
  '412x700': { width: 412, height: 700 },
  '430x932': { width: 430, height: 932 },
  desktop: { width: 1280, height: 800 },
};
const RESULT_ROOT = '.wave-victory-overlay,.sci-gameover-overlay';

export function captureOptions(argv) {
  const options = { phase: 'after', dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa/Q-results', extras: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-extras') { options.extras = false; continue; }
    if (!['--phase', '--dist', '--output', '--devices', '--scenes'].includes(argv[i])) throw new Error(`Unknown option: ${argv[i]}`);
    const key = argv[i].slice(2), value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing ${key}`);
    options[key] = ['devices', 'scenes'].includes(key) ? value.split(',') : value;
  }
  if (!['before', 'after'].includes(options.phase)) throw new Error('Phase must be before or after');
  options.devices ??= Object.keys(RESULT_VIEWPORTS);
  if (options.devices.some(device => !RESULT_VIEWPORTS[device])) throw new Error('Unknown viewport');
  options.scenes ??= options.phase === 'before' ? ['victory', 'defeat', 'weekly-result'] : ['victory', 'victory-long', 'boss-result', 'campaign-complete', 'defeat', 'boss-defeat', 'weekly-result'];
  return options;
}

/** Independently verify every result control at every scroll position. */
export function resultGeometry() {
  const root = document.querySelector('.wave-victory-overlay,.sci-gameover-overlay');
  if (!root) throw new Error('Result fixture is absent');
  const vv = window.visualViewport;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const safeArea = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  const viewport = { x: vv?.offsetLeft || 0, y: vv?.offsetTop || 0, width: vv?.width || innerWidth, height: vv?.height || innerHeight };
  const violations = [];
  const controls = [...root.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')].filter(element => element.getClientRects().length).map(element => {
    const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
    const label = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || element.tagName).trim().replace(/\s+/g, ' ');
    const box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const record = { label, box, opacity: Number(css.opacity), disabled: Boolean(element.disabled), clipped: false };
    if (rect.height < 43.99) violations.push({ type: 'touch-target-height', label, box });
    if (rect.left < viewport.x + safeArea.left - 0.5 || rect.right > viewport.x + viewport.width - safeArea.right + 0.5 || rect.top < viewport.y + safeArea.top - 0.5 || rect.bottom > viewport.y + viewport.height - safeArea.bottom + 0.5) violations.push({ type: 'control-outside-safe-viewport', label, box, viewport, safeArea });
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const parentCss = getComputedStyle(parent), parentRect = parent.getBoundingClientRect();
      if ((/hidden|clip|auto|scroll/.test(parentCss.overflowY) && (rect.top < parentRect.top - 0.5 || rect.bottom > parentRect.bottom + 0.5)) || (/hidden|clip|auto|scroll/.test(parentCss.overflowX) && (rect.left < parentRect.left - 0.5 || rect.right > parentRect.right + 0.5))) record.clipped = true;
    }
    if (record.clipped) violations.push({ type: 'clipped-control', label, box });
    return record;
  });
  // Archive victories intentionally offer only Return to Boss Archive.
  if (controls.length < 1) violations.push({ type: 'missing-result-controls', count: controls.length });
  return { viewport, safeArea, controls, violations, medals: root.querySelectorAll('.result-medal').length, unlockCards: root.querySelectorAll('.result-unlock').length, text: root.textContent.replace(/\s+/g, ' ').trim() };
}

async function captureSlices(page, game, directory, name) {
  const captures = [], violations = [], dedupe = new Set();
  const capture = async suffix => {
    const geometry = await game.evaluate(resultGeometry);
    const textGeometry = await game.evaluate(auditTextGeometry);
    // Playwright maps iframe transforms into outer CSS pixels. A 44px control
    // inside the desktop's scaled mobile world may be smaller on the screen.
    const screenSpaceControls = [];
    const outerViewport = await page.evaluate(() => ({x:visualViewport?.offsetLeft||0,y:visualViewport?.offsetTop||0,width:visualViewport?.width||innerWidth,height:visualViewport?.height||innerHeight}));
    const controls = game.locator(RESULT_ROOT).locator('button,a[href],input,select,textarea,[role="button"]');
    for (let index = 0; index < await controls.count(); index++) {
      const control = controls.nth(index), box = await control.boundingBox();
      if (!box) continue;
      const label = (await control.getAttribute('aria-label') || await control.textContent() || await control.getAttribute('placeholder') || 'control').trim().replace(/\s+/g,' ');
      screenSpaceControls.push({label,box});
      if (box.height < 43.99) geometry.violations.push({type:'screen-space-touch-target-height',label,box});
      if (box.x < outerViewport.x - 0.5 || box.y < outerViewport.y - 0.5 || box.x + box.width > outerViewport.x + outerViewport.width + 0.5 || box.y + box.height > outerViewport.y + outerViewport.height + 0.5) geometry.violations.push({type:'control-outside-outer-viewport',label,box,outerViewport});
    }
    const filename = `${name}${suffix ? `-${suffix}` : ''}.png`;
    await page.screenshot({ path: path.join(directory, filename), timeout: 30000 });
    captures.push({ filename, ...geometry, outerViewport, screenSpaceControls, textGeometry });
    for (const violation of [...geometry.violations, ...textGeometry.violations]) {
      const key = `${violation.type}:${violation.label || violation.selector || ''}:${violation.text || ''}`;
      if (!dedupe.has(key)) { dedupe.add(key); violations.push({ ...violation, screenshot: filename }); }
    }
  };
  await capture('');
  const scrollers = await game.evaluate(() => {
    const root = document.querySelector('.wave-victory-overlay,.sci-gameover-overlay');
    return [root, ...root.querySelectorAll('*')].filter(element => {
      const css = getComputedStyle(element), rect = element.getBoundingClientRect();
      return /auto|scroll/.test(css.overflowY) && element.scrollHeight > element.clientHeight + 2 && rect.height > 15 && rect.width > 15;
    }).map((element, index) => {
      element.dataset.resultCaptureScroll = String(index);
      return { index, height: element.clientHeight, max: element.scrollHeight - element.clientHeight, original: element.scrollTop };
    });
  });
  for (const scroller of scrollers) {
    const positions = new Set([0, scroller.max]);
    for (let position = Math.max(1, Math.floor(scroller.height * 0.75)); position < scroller.max; position += Math.max(1, Math.floor(scroller.height * 0.75))) positions.add(position);
    for (const [index, position] of [...positions].sort((a,b) => a-b).entries()) {
      await game.locator(`[data-result-capture-scroll="${scroller.index}"]`).evaluate((element, value) => { element.scrollTop = value; }, position);
      await page.waitForTimeout(100);
      await capture(`scroll-${scroller.index}-${index}`);
    }
    await game.locator(`[data-result-capture-scroll="${scroller.index}"]`).evaluate((element, value) => { element.scrollTop = value; delete element.dataset.resultCaptureScroll; }, scroller.original);
  }
  return { captures, violations, scrollers };
}

async function captureHeldTargets(page,game,directory,scene) {
  const controls=game.locator(RESULT_ROOT).locator('button');
  const proof={controls:[],violations:[],screenshots:[]};
  for(let index=0;index<await controls.count();index++) {
    const control=controls.nth(index), initial=await control.boundingBox();
    if(!initial) continue;
    const label=(await control.textContent()||'control').trim().replace(/\s+/g,' ');
    await page.mouse.move(initial.x+initial.width/2,initial.y+initial.height/2);
    try {
      await page.mouse.down(); await page.waitForTimeout(180);
      const box=await control.boundingBox();
      const active=await control.evaluate(element=>element.matches(':active'));
      const geometry=await game.evaluate(resultGeometry);
      proof.controls.push({label,initial,held:box,active});
      if(!active) proof.violations.push({type:'press-state-not-observed',label});
      if(!box||box.height<43.99) proof.violations.push({type:'held-touch-target-height',label,box});
      proof.violations.push(...geometry.violations.map(violation=>({...violation,interaction:'held-press',pressedLabel:label})));
      if(index<2) {
        const filename=`${scene}-held-${index}.png`;
        await page.screenshot({path:path.join(directory,filename),timeout:30000});
        proof.screenshots.push(filename);
      }
    } finally {
      // Release away from the button so this proof never navigates or submits.
      await page.mouse.move(0,0); await page.mouse.up();
    }
  }
  return proof;
}

async function reset(page, server, device) {
  // Desktop launch state is session-backed; every case must exercise its real shell.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
  await page.goto(`${server.origin}/?qa=1&uiAudit=1&seed=12345`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const game = await appFrame(page, device === 'desktop' ? 'desktop' : 'mobile');
  await game.waitForFunction(() => Boolean(window.__sciconUIAudit), null, { timeout: 60000 });
  await game.evaluate(async () => { await document.fonts.ready; });
  return game;
}
async function present(game, scene) {
  await game.evaluate(name => window.__sciconUIAudit.present(name), scene);
  await game.locator(RESULT_ROOT).first().waitFor({ state: 'attached', timeout: 10000 });
}
async function animationState(game) {
  return game.evaluate(() => {
    const root = document.querySelector('.wave-victory-overlay,.sci-gameover-overlay');
    return { now: performance.now(), text: root.textContent.replace(/\s+/g, ' ').trim(), counters: [...root.querySelectorAll('.revamp-ui-number')].map(element => ({target:element.querySelector('.sr-only')?.textContent,displayed:element.querySelector('[aria-hidden]')?.textContent})), animations: root.getAnimations({subtree:true}).map(animation => ({ name: animation.animationName || '', state: animation.playState, currentTime: animation.currentTime, duration: animation.effect?.getComputedTiming().duration, iterations: animation.effect?.getComputedTiming().iterations === Infinity ? 'infinite' : animation.effect?.getComputedTiming().iterations })) };
  });
}

/** Timers run in the page independently of screenshot readback latency. */
export async function resultEntryTimeline() {
  const startedAt = performance.now(), samples = [];
  for (const targetMs of [0,100,400,900,1500]) {
    await new Promise(resolve => setTimeout(resolve,Math.max(0,startedAt+targetMs-performance.now())));
    const root = document.querySelector('.sci-gameover-overlay');
    const viewport = {width:visualViewport?.width||innerWidth,height:visualViewport?.height||innerHeight,x:visualViewport?.offsetLeft||0,y:visualViewport?.offsetTop||0};
    const controls = [...root.querySelectorAll('button')].map(element => {
      const rect = element.getBoundingClientRect();
      let effectiveOpacity = 1, clipped = false;
      for (let parent = element; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        effectiveOpacity *= Number(css.opacity);
        if (css.display === 'none' || css.visibility !== 'visible') effectiveOpacity = 0;
        if ((/hidden|clip|auto|scroll/.test(css.overflowY) && (rect.top < bounds.top-.5 || rect.bottom > bounds.bottom+.5)) || (/hidden|clip|auto|scroll/.test(css.overflowX) && (rect.left < bounds.left-.5 || rect.right > bounds.right+.5))) clipped = true;
      }
      return {label:element.textContent.trim().replace(/\s+/g,' '),box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},effectiveOpacity,clipped,disabled:Boolean(element.disabled),insideViewport:rect.left>=viewport.x-.5&&rect.top>=viewport.y-.5&&rect.right<=viewport.x+viewport.width+.5&&rect.bottom<=viewport.y+viewport.height+.5};
    });
    samples.push({targetMs,elapsedMs:performance.now()-startedAt,viewport,controls});
  }
  return samples;
}

async function captureEntry(page,server,device,directory,report,scene) {
  const game = await reset(page,server,device);
  await present(game,scene);
  const startedAt=Date.now(), sampling=game.evaluate(resultEntryTimeline), screenshots=[];
  for(const targetMs of [0,900,1500]) {
    await page.waitForTimeout(Math.max(0,startedAt+targetMs-Date.now()));
    const filename=`entry-${scene}-${targetMs}ms.png`;
    await page.screenshot({path:path.join(directory,filename),timeout:30000});
    screenshots.push({filename,targetMs,finishedElapsedMs:Date.now()-startedAt});
  }
  const entry={device,scene,samples:await sampling,screenshots,violations:[]};
  for(const sample of entry.samples) {
    if(sample.controls.length<3) entry.violations.push({targetMs:sample.targetMs,type:'missing-entry-controls',count:sample.controls.length});
    for(const control of sample.controls) {
      if(control.box.height<43.99||control.effectiveOpacity<=0||control.clipped||!control.insideViewport) entry.violations.push({targetMs:sample.targetMs,type:'unavailable-entry-control',...control});
      const initial=entry.samples[0].controls.find(item=>item.label===control.label);
      if(initial&&Object.keys(control.box).some(key=>Math.abs(control.box[key]-initial.box[key])>.5)) entry.violations.push({targetMs:sample.targetMs,type:'moving-entry-control',label:control.label,initial:initial.box,box:control.box});
    }
  }
  report.entry.push(entry);
  if(entry.violations.length) report.failures.push({device,scene,type:'entry-control-proof',violations:entry.violations});
}

async function extras(page, game, server, device, directory, report) {
  game = await reset(page, server, device);
  const motion = { device, scene: 'victory-long', samples: [] };
  const start = Date.now();
  await present(game, motion.scene);
  for (const time of [0, 450, 900, 1500, 2800]) {
    await page.waitForTimeout(Math.max(0, start + time - Date.now()));
    const filename = `motion-${time}ms.png`;
    const state = await animationState(game);
    const sampledElapsedMs = Date.now() - start;
    await page.screenshot({path:path.join(directory, filename),timeout:30000});
    motion.samples.push({ targetMs: time, sampledElapsedMs, screenshotFinishedElapsedMs: Date.now() - start, filename, ...state });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(250);
  motion.reduced = await animationState(game);
  motion.reduced.running = motion.reduced.animations.filter(animation => animation.state === 'running');
  motion.reduced.livePreferenceObserved = await game.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  motion.reduced.filename = 'reduced-motion.png';
  await page.screenshot({path:path.join(directory,motion.reduced.filename),timeout:30000});
  report.motion.push(motion);
  if (motion.reduced.running.length) report.failures.push({ device, type:'running-reduced-motion', animations:motion.reduced.running });
  if (motion.samples.at(-1).counters.some(counter => counter.displayed !== counter.target)) report.failures.push({device,type:'unsettled-count-up',counters:motion.samples.at(-1).counters});
  if (motion.reduced.counters.some(counter => counter.displayed !== counter.target)) report.failures.push({device,type:'reduced-motion-count-up',counters:motion.reduced.counters});
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.setViewportSize({ width:412, height:560 });
  await page.waitForTimeout(500);
  const shrink = await captureSlices(page,game,directory,'live-resize-412x560');
  report.results.push({device:'412x560-live-resize',scene:'victory-long',...shrink});
  await page.setViewportSize(RESULT_VIEWPORTS[device]);
  await page.waitForTimeout(300);

  const session = await page.context().newCDPSession(page);
  const insets = { top:24, right:16, bottom:28, left:16 };
  try {
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await page.waitForTimeout(350);
    const safe = await captureSlices(page,game,directory,'safe-area-victory-long');
    const observed = safe.captures[0].safeArea;
    const supported = Object.entries(insets).every(([key,value]) => observed[key] === value);
    report.safeArea = { supported, insets, observed };
    if (!supported) report.failures.push({type:'safe-area-override-not-observed',insets,observed});
    report.results.push({device:`${device}-safe-area`,scene:'victory-long',...safe});
    for (const scene of ['defeat','weekly-result','boss-defeat']) {
      game = await reset(page,server,device);
      await present(game,scene); await page.waitForTimeout(2800);
      report.results.push({device:`${device}-safe-area`,scene,...await captureSlices(page,game,directory,`safe-area-${scene}`)});
    }
  } catch (error) { report.safeArea = {supported:false,error:redact(error.message)}; report.failures.push({type:'safe-area-emulation-unavailable'}); }
  finally { await session.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,right:0,bottom:0,left:0}}).catch(()=>{}); await session.detach(); }
  for(const scene of ['defeat','weekly-result']) await captureEntry(page,server,device,directory,report,scene);
}

export async function runCapture(config) {
  const directory = path.join(config.output, config.phase);
  await mkdir(directory, {recursive:true});
  const report = { phase:config.phase, build:config.dist, startedAt:new Date().toISOString(), results:[], motion:[], entry:[], failures:[], browserErrors:[], unsupportedScenes:config.phase === 'before' ? ['victory-long','boss-result','boss-defeat','campaign-complete'] : [], notes:['Production result components presented through guarded offline QA fixtures.', 'Screenshots include every result scroll slice; no hidden elements, restyling, or disabled CSS animations.', 'Motion filenames name scheduled sample times; recorded actual sample and screenshot-completion times expose capture overhead.'] };
  report.geometryEngineHash=createHash('sha256').update(await readFile(new URL('./ui-geometry.mjs',import.meta.url))).digest('hex');
  report.geometryEngineHashAlgorithm='SHA-256 of ui-geometry.mjs file bytes';
  const server = await startStaticServer({dist:config.dist});
  const browser = await launchChrome();
  try {
    for (const device of config.devices) {
      DEVICES[device] = {viewport:RESULT_VIEWPORTS[device],deviceScaleFactor:device==='desktop'?1:2,isMobile:device!=='desktop',hasTouch:device!=='desktop'};
      const context = await isolatedContext(browser,server.origin,device);
      await context.route(`${server.origin}/api/**`,async route => {
        if(route.request().method() !== 'GET') return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
        const fixture = uiFixture(new URL(route.request().url()));
        return fixture ? route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}) : route.fallback();
      });
      const page = await context.newPage();
      page.on('pageerror',error=>report.browserErrors.push({device,error:redact(error.message)}));
      const deviceDir = path.join(directory,device); await mkdir(deviceDir,{recursive:true});
      try {
        for (const scene of config.scenes) {
          try {
            const game = await reset(page,server,device);
            await present(game,scene); await page.waitForTimeout(3300);
            const result = {device,scene,...await captureSlices(page,game,deviceDir,scene)};
            if(config.phase==='after'&&['360x560','desktop'].includes(device)) {
              result.heldPress=await captureHeldTargets(page,game,deviceDir,scene);
              result.violations.push(...result.heldPress.violations);
            }
            if (['victory-long','campaign-complete'].includes(scene)) {
              const receipt = result.captures[0];
              if (receipt.medals !== 3 || receipt.unlockCards < 1 || !receipt.text.includes('Campaign reward') || !receipt.text.includes('Research Data')) report.failures.push({device,scene,type:'incomplete-long-result-fixture'});
            }
            report.results.push(result);
            process.stdout.write(`${config.phase} ${device} ${scene}: ${result.captures.length} images, ${result.violations.length} geometry violations\n`);
          } catch(error) {report.failures.push({device,scene,error:redact(error.message)});process.stderr.write(`${device} ${scene}: ${redact(error.message)}\n`);}
        }
        if(config.extras && config.phase==='after' && device==='412x700') await extras(page,null,server,device,deviceDir,report);
      } finally {await context.close();}
      await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
    }
  } finally {await browser.close();await server.close();}
  report.finishedAt=new Date().toISOString();
  report.geometryViolations=report.results.reduce((sum,result)=>sum+result.violations.length,0);
  report.controlViolations=report.results.reduce((sum,result)=>sum+result.violations.filter(violation=>['touch-target-height','screen-space-touch-target-height','held-touch-target-height','press-state-not-observed','control-outside-safe-viewport','control-outside-outer-viewport','clipped-control','missing-result-controls'].includes(violation.type)).length,0);
  report.status=report.failures.length||report.browserErrors.length||(config.phase==='after'&&report.geometryViolations)?'failed':'passed';
  await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  const lines=[`# Result ${config.phase} capture`,'',`Status: ${report.status}. ${report.results.length} result cases; ${report.geometryViolations} geometry violations; ${report.browserErrors.length} browser errors.`, '',...report.notes,'','| Viewport | Scene | Geometry violations | Screenshots |','| --- | --- | ---: | --- |'];
  for(const result of report.results) lines.push(`| ${result.device} | ${result.scene} | ${result.violations.length} | ${result.captures.map(capture=>`[${capture.filename}](${result.device.replace('-safe-area','').replace('412x560-live-resize','412x700')}/${capture.filename})`).join(' · ')} |`);
  for(const result of report.results.filter(result=>result.heldPress)) lines.push('',`${result.device} ${result.scene} held targets: ${result.heldPress.violations.length} violations across ${result.heldPress.controls.length} controls. ${result.heldPress.screenshots.map(filename=>`[${filename}](${result.device}/${filename})`).join(' · ')}`);
  if(report.unsupportedScenes.length) lines.push('',`Baseline fixtures do not support: ${report.unsupportedScenes.join(', ')}. These are additional after coverage, not identical before/after comparisons.`);
  if(report.safeArea) lines.push('',`Safe-area emulation: ${JSON.stringify(report.safeArea)}`);
  for(const motion of report.motion) lines.push('',`Motion: ${motion.samples.map(sample=>`[${sample.targetMs}ms](${motion.device}/${sample.filename})`).join(' · ')} · [Reduced motion](${motion.device}/${motion.reduced.filename}); ${motion.reduced.running.length} running animations after live preference change.`);
  for(const entry of report.entry) lines.push('',`${entry.scene} entry targets: ${entry.violations.length} violations across ${entry.samples.length} timed samples. ${entry.screenshots.map(screenshot=>`[${screenshot.targetMs}ms](${entry.device}/${screenshot.filename})`).join(' · ')}`);
  await writeFile(path.join(directory,'report.md'),lines.join('\n')+'\n');
  return report;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runCapture(captureOptions(process.argv.slice(2))).then(report=>{if(report.status==='failed')process.exitCode=1;}).catch(error=>{process.stderr.write(`${redact(error.stack||error.message)}\n`);process.exitCode=1;});
}
