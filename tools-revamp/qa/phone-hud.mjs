/** REVAMP(P): Offline touch-target/lane proof, separate from FPS/video acceptance runs. */
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startStaticServer, REPO_ROOT } from './server.mjs';
import { collectErrors, DEVICES, isolatedContext, launchChrome, waitForMission } from './browser.mjs';
import { auditTextGeometry } from './ui-geometry.mjs';

const config = { dist: path.join(REPO_ROOT, 'dist'), output: '/workspace/scicon-revamp/qa/P-alive', runId: `hud-${Date.now()}` };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!['--dist', '--output', '--run-id'].includes(key) || !value) throw new Error(`Unknown or incomplete option ${key}`);
  config[key === '--run-id' ? 'runId' : key.slice(2)] = value;
}
if (!/^[\w.-]+$/.test(config.runId)) throw new Error('--run-id must be a simple directory name');
const directory = path.join(config.output, config.runId);
await mkdir(directory, { recursive: false });
const report = { status: 'running', dist: path.resolve(config.dist), notes: ['Offline real gameplay uses explicit god mode for interaction coverage; this is not an FPS or fairness measurement.', 'Both-wing/large-counter scenes render production React components as labeled static presentation fixtures.'], results: [] };

function inspectHud() {
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
  const row = document.querySelector('.scicon-combat-toprow');
  const controls = [...document.querySelectorAll('.scicon-combat-hud button')].filter(el => el.getClientRects().length).map(el => ({ label: el.getAttribute('aria-label'), rect: rect(el), opacity: getComputedStyle(el).opacity }));
  const violations = [];
  const middle = { top: innerHeight * .1, bottom: innerHeight * .9 };
  for (const c of controls) {
    if (c.rect.width < 43.99 || c.rect.height < 43.99) violations.push(`Small touch target: ${c.label}`);
    if (c.rect.x < 0 || c.rect.right > innerWidth + .01 || c.rect.y < 0 || c.rect.bottom > innerHeight + .01) violations.push(`Outside viewport: ${c.label}`);
    if (c.rect.bottom > middle.top && c.rect.y < middle.bottom) violations.push(`Persistent control in middle 80%: ${c.label}`);
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x) > .1 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y) > .1) violations.push(`Controls overlap: ${a.label} / ${b.label}`);
  }
  if (!row || row.getBoundingClientRect().height > 48) violations.push('HUD is not a single thin row');
  return { viewport: { width: innerWidth, height: innerHeight }, topRow: row ? rect(row) : null, controls, violations };
}

function twoWingFixture() {
  const bundle = buildSync({ stdin: { contents: "export { default as UIOverlay } from './components/UIOverlay'; export { default as WingSupportHud } from './components/revamp/WingSupportHud';", resolveDir: REPO_ROOT, loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' }, logLevel: 'silent' });
  const compiled = { exports: {} };
  Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const { UIOverlay, WingSupportHud } = compiled.exports;
  const noop = () => {};
  const snapshot = { enabled: true, autoCast: false, wings: ['left', 'right'].map((slot, index) => ({ slot, id: slot, label: 'Long evolved wing special name', image: '/game-art/powerups/rapid-fire.png', level: 5, evolved: true, cooldownFrames: index * 90, cooldownMax: 1200, ready: index === 0 })) };
  return renderToStaticMarkup(React.createElement(UIOverlay, { stats: { wave: 1, lives: 10, coins: 999999999, score: 999999999, bombs: 99, bombCharge: 0, shipAbilityCooldown: 61, upgrades: { ability: 0 } }, showLabGlow: false, onDisableLabGlow: noop, onPause: noop, onUseBomb: noop, onUpgrade: noop, selectedShipId: 'researchhub', onUseShipAbility: noop, fieldUpgradesEnabled: false, wingControls: React.createElement(WingSupportHud, { snapshot, onCast: noop, onAutoCastChange: noop }) }));
}

const server = await startStaticServer({ dist: config.dist });
let browser;
try {
  browser = await launchChrome();
  const fixture = twoWingFixture();
  const styles = (await readdir(path.join(config.dist, 'assets'))).filter(file => file.endsWith('.css')).map(file => `<link rel="stylesheet" href="${server.origin}/assets/${file}">`).join('');
  for (const device of ['360x640', '390x844']) {
    const result = { device, status: 'running', consoleErrors: [], pageErrors: [], checks: [] };
    report.results.push(result);
    const context = await isolatedContext(browser, server.origin, device);
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      collectErrors(page, result);
      await page.goto(`${server.origin}/?qa=1&seed=12345&mission=operation-open-galaxy&skipIntro=1&god=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForMission(page);
      const auto = page.locator('.revamp-wing-auto');
      await auto.waitFor({ state: 'visible' });
      assert.equal(await auto.getAttribute('aria-pressed'), 'true');
      await auto.tap();
      await page.waitForFunction(() => document.querySelector('.revamp-wing-auto')?.getAttribute('aria-pressed') === 'false');
      await page.waitForFunction(() => document.querySelector('.revamp-wing-button--left')?.disabled === false, null, { timeout: 35000 });
      await page.locator('.revamp-wing-button--left').tap();
      await page.waitForFunction(() => /seconds/.test(document.querySelector('.revamp-wing-button--left')?.getAttribute('aria-label') || ''));
      await auto.tap();
      await page.waitForFunction(() => document.querySelector('.revamp-wing-auto')?.getAttribute('aria-pressed') === 'true');
      result.checks.push('wing manual special and auto preference both work');
      await page.locator('.scicon-thumb-button--ability').tap();
      await page.waitForFunction(() => document.querySelector('[data-onboarding-target="flight-special"]')?.getAttribute('data-ability-state') === 'recharging');
      const bombs = await page.locator('.scicon-thumb-button--bomb > span').textContent();
      await page.locator('.scicon-thumb-button--bomb').tap();
      await page.waitForFunction(before => document.querySelector('.scicon-thumb-button--bomb > span')?.textContent !== before, bombs);
      result.checks.push('bomb spends a bomb and ship special enters cooldown');
      result.live = await page.evaluate(inspectHud);
      assert.deepEqual(result.live.viewport, DEVICES[device].viewport);
      assert.deepEqual(result.live.violations, []);
      result.liveText = await page.evaluate(auditTextGeometry);
      assert.deepEqual(result.liveText.violations, []);
      await page.screenshot({ path: path.join(directory, `${device}-live.png`) });
      await page.locator('.scicon-pause-control').tap();
      await page.getByRole('heading', { name: 'Mission Paused' }).waitFor();
      await page.getByRole('button', { name: 'Resume Mission', exact: true }).tap();
      await waitForMission(page);
      await page.locator('.scicon-resume-countdown').waitFor({ state: 'hidden' });
      await auto.waitFor({ state: 'visible' });
      result.checks.push('pause and resume controls remain reachable');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reduced = await page.locator('.revamp-hud-counter').first().evaluate(el => getComputedStyle(el).animationName);
      assert.equal(reduced, 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const fullMotion = await page.locator('.revamp-hud-counter').first().evaluate(el => getComputedStyle(el).animationName);
      assert.equal(fullMotion, 'revamp-hud-tick');
      result.checks.push('live reduced-motion changes disable and restore counter ticks');
      result.world = await page.evaluate(() => { const state = window.__sciconQA.state(); return `${state.worldWidth}x${state.worldHeight}`; });
      assert.equal(result.world, '390x844');
      // Presentation-only notch probe. This is labeled simulated padding, not a device measurement.
      await page.addStyleTag({ content: '.scicon-game-stage .scicon-combat-hud{padding-top:47px!important}' });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(400);
      result.simulatedSafeTop = { pixels: 47, topRowBottom: await page.locator('.scicon-combat-toprow').evaluate(el => el.getBoundingClientRect().bottom) };
      await page.screenshot({ path: path.join(directory, `${device}-simulated-safe-top-47.png`) });
      const presentation = await context.newPage();
      await presentation.setContent(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${server.origin}/">${styles}<style>html,body,#root{margin:0;width:100%;height:100%}</style></head><body><main id="root"><div class="scicon-game-stage">${fixture}</div></main></body></html>`);
      await presentation.evaluate(() => document.fonts.ready);
      await presentation.waitForTimeout(250);
      result.twoWingFixture = await presentation.evaluate(inspectHud);
      assert.deepEqual(result.twoWingFixture.viewport, DEVICES[device].viewport);
      assert.deepEqual(result.twoWingFixture.violations, []);
      result.fixtureText = await presentation.evaluate(auditTextGeometry);
      assert.deepEqual(result.fixtureText.violations, []);
      await presentation.screenshot({ path: path.join(directory, `${device}-two-wings-large-counts-fixture.png`) });
      assert.deepEqual(result.pageErrors, []);
      assert.deepEqual(result.consoleErrors, []);
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      await context.pages().at(-1)?.screenshot({ path: path.join(directory, `${device}-failure.png`), timeout: 15000 }).catch(() => {});
      process.exitCode = 1;
    } finally { await context.close(); }
  }
  report.status = report.results.every(result => result.status === 'passed') ? 'passed' : 'failed';
} finally {
  await browser?.close();
  await server.close();
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ status: report.status, artifactDir: directory, results: report.results.map(({ device, status, error }) => ({ device, status, error })) }, null, 2));
