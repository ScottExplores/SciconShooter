import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { launchChrome } from '../../tools-revamp/qa/browser.mjs';
import { auditTextGeometry } from '../../tools-revamp/qa/ui-geometry.mjs';
import { options } from '../../tools-revamp/qa/ui-audit.mjs';

const require = createRequire(import.meta.url);
function frameComponent(preview) {
  const built = buildSync({ entryPoints: ['services/revamp/preview/PreviewBuildBadge.tsx'], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['react'], loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_PREVIEW_MODE: preview }) }, logLevel: 'silent' });
  const compiled = { exports: {} };
  Function('require', 'module', 'exports', built.outputFiles[0].text)(require, compiled, compiled.exports);
  return compiled.exports.PreviewBuildFrame;
}
const Frame = frameComponent(true);
const css = await readFile('services/revamp/preview/preview-build.css', 'utf8');
const content = '<main class="scicon-game-stage" style="height:100%;position:relative"><canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas><div class="scicon-hud-shell"><div class="scicon-combat-toprow" style="position:absolute;inset:4px 6px auto;height:44px">Score · lives · coins · pause · auto</div><button style="position:absolute;bottom:24px;left:16px;height:44px">Ability</button></div><div id="modal" style="position:fixed;inset:0;visibility:hidden">Fixed menu content</div></main>';
const markup = () => renderToStaticMarkup(React.createElement(Frame, null,
  React.createElement('div', { style: { height: '100%' }, dangerouslySetInnerHTML: { __html: content } })));

test('preview flag/Pages hostname reserve a rail; production keeps the exact child tree', () => {
  const child = React.createElement('main', null, 'Production');
  const production = frameComponent(false);
  assert.equal(renderToStaticMarkup(React.createElement(production, null, child)), '<main>Production</main>');
  assert.match(markup(), /data-preview-build-badge/);
  assert.match(markup(), /TEST BUILD — scores not submitted/);
  const oldWindow = globalThis.window;
  globalThis.window = { location: { hostname: 'branch.scicon.pages.dev' } };
  try { assert.match(renderToStaticMarkup(React.createElement(production, null, child)), /scicon-preview-content/); }
  finally { globalThis.window = oldWindow; }
});

test('preview rail clears HUD/canvas and fixed menus at phone sizes with real safe-area insets; audit catches a regressed overlay', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    const cdp = await page.context().newCDPSession(page);
    for (const width of [320, 360, 390, 430]) for (const inset of [0, 44]) {
      await page.setViewportSize({ width, height: 568 });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: inset, left: inset ? 12 : 0, right: inset ? 12 : 0, bottom: inset ? 24 : 0 } });
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body,#root{margin:0;height:100%;width:100%;font:12px/16px monospace}*{box-sizing:border-box}${css}</style><div id="root">${markup()}</div>`);
      const audit = await page.evaluate(auditTextGeometry);
      assert.equal(audit.checkedPreviewHudRects, 3);
      assert.deepEqual(audit.violations.filter(item => item.type.startsWith('preview-badge')), [], `${width}/${inset}: ${JSON.stringify(audit)}`);
      const bounds = await page.evaluate(() => {
        const badge = document.querySelector('[data-preview-build-badge]');
        const menu = document.querySelector('#modal'); menu.style.visibility = 'visible';
        const badgeBox = badge.getBoundingClientRect(), menuBox = menu.getBoundingClientRect();
        return { badgeTop: badgeBox.top, badgeBottom: badgeBox.bottom, menuTop: menuBox.top, menuBottom: menuBox.bottom, pointerEvents: getComputedStyle(badge).pointerEvents };
      });
      assert.ok(bounds.badgeTop >= inset);
      assert.ok(bounds.menuTop >= bounds.badgeBottom, 'fixed menus remain inside the reserved content area');
      assert.equal(bounds.menuBottom, 568);
      assert.equal(bounds.pointerEvents, 'none');
    }
    await page.locator('[data-preview-build-badge]').evaluate(badge => {
      badge.style.position = 'fixed';
      badge.style.top = `${document.querySelector('.scicon-combat-toprow').getBoundingClientRect().top + 1}px`;
      badge.style.left = '30px';
    });
    const regressed = await page.evaluate(auditTextGeometry);
    assert.ok(regressed.violations.some(item => item.type === 'preview-badge-overlaps-hud' && item.related.includes('scicon-combat-toprow')), 'the old score-covering position must fail');
    assert.ok(regressed.violations.some(item => item.type === 'preview-badge-overlaps-hud' && item.related === 'canvas'), 'Pixi-only timers/boss bars are protected by the canvas bounds');
    assert.ok(regressed.violations.some(item => item.type === 'preview-badge-overlaps-content'));
  } finally { await browser.close(); }
});

test('live HUD fixtures can be selected without running the complete UI matrix', () => {
  const selected = options(['--screens', 'gameplay-hud,boss-hud', '--devices', '390x844', '--no-natural-victory']);
  assert.deepEqual(selected.screens, ['gameplay-hud', 'boss-hud']);
  assert.equal(selected.naturalVictory, false);
});
