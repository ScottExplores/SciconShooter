import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from '../../tools-revamp/qa/browser.mjs';
import { auditTextGeometry } from '../../tools-revamp/qa/ui-geometry.mjs';
import { UI_DEVICES } from '../../tools-revamp/qa/ui-audit.mjs';

test('Q matrix includes short real visual viewports and retained tall / desktop sizes', () => {
  for (const size of ['360x560', '390x664', '412x700', '360x640', '390x844', '430x932', 'desktop']) assert.ok(UI_DEVICES[size], size);
});

test('centering detects shifted labels in both axes without rejecting icon groups or wrapped copy', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    await page.setContent(`<style>
      body{margin:20px;font:16px/20px Arial} .box{width:260px;height:44px;display:flex;align-items:center;justify-content:center}
      .bad-x span{transform:translateX(7px)} .bad-y span{transform:translateY(8px)}
      button{font:inherit;gap:12px} p{width:260px;text-align:center} .badge{text-align:center;width:260px}
      .badge span{position:relative;left:6px}
    </style>
    <div class="box bad-x" data-ui-center="both"><span>Campaign reward</span></div>
    <div class="box bad-y" data-ui-center="both"><span>Research Data +2</span></div>
    <button class="box inferred-y bad-y"><span>Centered flex label shifted</span></button>
    <button class="box good"><svg width="20" height="20"><rect width="20" height="20"/></svg><span>Campaign Map</span></button>
    <button class="box good"><span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:green"><svg width="20" height="20" style="transform:translateX(2px)"><rect width="20" height="20"/></svg></span><span>PLAY</span></button>
    <button class="box good" style="position:relative"><span>Centered control</span><span style="position:absolute;right:0;top:0;width:24px;text-align:center">✓</span></button>
    <button class="good" style="width:260px;height:44px;display:grid;grid-template-columns:1fr 68px;align-items:center"><span style="text-align:left">Audio</span><span style="position:relative;display:block;height:24px"><span style="position:absolute;left:4px;top:2px">ON</span></span></button>
    <p class="good">A long mission name that wraps onto multiple centered lines without moving either line.</p>
    <div class="badge"><span>Badge</span></div>
    <button class="good" style="position:relative;width:260px;height:60px"><span style="position:absolute;left:2px;top:0;width:32px;text-align:center">05</span><span style="position:absolute;left:80px;bottom:0;width:100px;text-align:center">Boss</span></button>
    <div data-ui-center="x" style="width:260px;text-align:center"><div>Long centered stat label</div><div style="position:relative;left:8px">+2</div></div>`);
    const result = await page.evaluate(auditTextGeometry);
    for (const target of ['bad-x', 'bad-y', 'badge', 'inferred-y']) assert.ok(result.violations.some(item => item.type === 'text-off-center' && item.selector.includes(target)), `${target}: ${JSON.stringify(result)}`);
    assert.equal(result.violations.some(item => item.selector.includes('good')), false, JSON.stringify(result.violations));
    assert.ok(result.checkedCenters >= 5);
    assert.ok(result.violations.some(item => item.type === 'text-off-center' && item.text.includes('Long centered stat label')), 'a wider centered label must not mask its shifted stat value');
    await page.setContent('<style>body{margin:20px;font:16px/20px Arial}.scroll{width:240px;height:90px;overflow:auto}button{font:inherit;display:flex;align-items:center;justify-content:center;width:220px;height:160px;padding:0;border:0;text-align:center}span{display:block}</style><div class="scroll"><button><span>First line<br>Second line<br>Third line<br>Fourth line</span></button></div>');
    const partial = await page.evaluate(auditTextGeometry);
    assert.equal(partial.violations.filter(item=>item.type==='text-off-center').length,0,JSON.stringify(partial.violations));
    await page.locator('button span').evaluate(element=>{element.style.transform='translateY(8px)';});
    const shiftedPartial = await page.evaluate(auditTextGeometry);
    assert.ok(shiftedPartial.violations.some(item=>item.type==='text-off-center' && item.selector==='button'), 'a partially exposed centered card still detects a true vertical label shift');
  } finally { await browser.close(); }
});

test('SVG centered labels use declared columns and displayed CSS-pixel offsets', async () => {
  const { auditSvgTextGeometry } = await import('../../tools-revamp/qa/ui-svg-geometry.mjs');
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 600 200"><text id="shifted" x="316" y="45" text-anchor="middle" font-size="36" data-ui-text-bounds="100,5,400,50">SHIFTED</text><text id="scaled-safe" x="308" y="110" text-anchor="middle" font-size="36" data-ui-text-bounds="100,70,400,50">SAFE</text><text id="left-aligned" x="110" y="175" font-size="36" data-ui-text-bounds="100,135,400,50">LEFT</text></svg>';
    await page.setContent(`${svg}<img alt="Centered SVG fixture" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:block;width:150px;height:50px">`);
    await page.waitForFunction(() => [...document.images].every(image => image.complete));
    const result = await page.evaluate(auditSvgTextGeometry);
    assert.equal(result.checkedSvgTexts,6);
    assert.equal(result.checkedSvgCenters,4);
    assert.equal(result.violations.length,2,JSON.stringify(result.violations));
    for (const source of ['inline-svg','svg-image(record-card)']) {
      const violation=result.violations.find(item=>item.selector===`${source} text#shifted`);
      assert.equal(violation?.type,'svg-text-off-center');
      assert.ok(Math.abs(violation?.centerOffset.x-4)<0.3, 'glyph bearing remains within subpixel tolerance');
    }
    // Eight SVG units are only two CSS pixels at this display size.
    assert.equal(result.violations.some(item=>item.selector.includes('scaled-safe')),false);
    assert.equal(result.violations.some(item=>item.selector.includes('left-aligned')),false);
  } finally { await browser.close(); }
});

test('declared image inner rectangle catches painted border intrusions, respects nested banner and scroll slices', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    await page.setContent(`<style>
      body{margin:20px;font:16px/20px Arial} .frame{position:relative;width:300px;height:300px}
      .safe{position:absolute;left:40px;top:60px;width:220px} .bad{position:absolute;left:10px;top:180px}
      .banner{position:absolute;left:0;top:0;width:300px;height:40px;text-align:center}
      .scroll{position:absolute;left:40px;top:100px;width:220px;height:60px;overflow:auto} p{margin:0}
    </style><section class="frame" data-frame-inner-rect="10 15 90 90">
      <div class="banner" data-frame-inner-rect="10 0 90 100">Nested banner</div>
      <div class="safe">Safe content</div><div class="bad">Hits gold border</div>
      <div class="scroll"><p>${'Scrollable reward details. '.repeat(15)}</p></div>
    </section><button class="framed-button" data-frame-inner-rect="10 10 90 70" data-ui-center="both" style="display:flex;align-items:center;justify-content:center;width:300px;height:100px;padding:0;border:0"><span style="transform:translateY(-10px)">Frame-centered label</span></button>`);
    const result = await page.evaluate(auditTextGeometry);
    assert.ok(result.violations.some(item => item.type === 'text-in-frame-border' && item.text === 'Hits gold border'));
    assert.equal(result.violations.some(item => item.type === 'text-in-frame-border' && item.text !== 'Hits gold border'), false, JSON.stringify(result.violations));
    assert.ok(result.checkedFrameTexts >= 4);
    assert.equal(result.violations.some(item => item.text.includes('Frame-centered')), false, JSON.stringify(result.violations));
    await page.locator('.framed-button span').evaluate(element => { element.style.transform = 'translateY(-4px)'; });
    const shifted = await page.evaluate(auditTextGeometry);
    assert.ok(shifted.violations.some(item => item.type === 'text-off-center' && item.text === 'Frame-centered label'));
  } finally { await browser.close(); }
});

test('interactive targets outside visual viewport or env safe area fail, scroll content remains reachable', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 24, left: 8, right: 8, bottom: 20 } });
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
      body{margin:0;font:16px Arial}button{width:120px;height:44px;position:absolute}
      .top{top:0;left:20px}.bottom{top:640px;left:20px}.outside{left:420px;top:80px}.safe{left:20px;top:80px}
      .scroll{position:absolute;left:180px;top:80px;width:180px;height:100px;overflow:auto}.scroll button{position:relative;display:block}
    </style><button class="top">Under notch</button><button class="bottom">Below view</button><button class="outside">Offscreen</button>
    <button class="safe">Safe target</button><div tabindex="0" style="position:absolute;left:420px;top:170px;width:120px;height:60px">Focusable region</div><div data-ui-min-target="44"><button class="small" style="left:20px;top:140px;height:40px">Too small</button></div><div class="scroll">${'<button>Scroll target</button>'.repeat(5)}</div>`);
    const result = await page.evaluate(auditTextGeometry);
    assert.deepEqual(result.safeInsets, { top:24, right:8, bottom:20, left:8 });
    assert.ok(result.violations.some(item => item.type === 'control-under-safe-area' && item.selector.includes('top')));
    for (const target of ['bottom','outside']) assert.ok(result.violations.some(item => item.type === 'control-outside-visual-viewport' && item.selector.includes(target)), JSON.stringify(result.violations));
    assert.ok(result.violations.some(item => item.type === 'control-below-min-target' && item.text === 'Too small'));
    assert.ok(result.violations.some(item => item.type === 'control-outside-visual-viewport' && item.text === 'Focusable region'));
    assert.equal(result.violations.some(item => item.selector.includes('safe') || item.text === 'Scroll target'), false, JSON.stringify(result.violations));
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><button style="position:absolute;left:330px;top:80px;width:50px;height:44px">Zoom</button>');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
    const zoomed = await page.evaluate(auditTextGeometry);
    assert.ok(zoomed.viewport.right < 390, 'visual viewport must be narrower than layout viewport in the zoomed test');
    assert.ok(zoomed.violations.some(item => item.type === 'control-outside-visual-viewport' && item.text === 'Zoom'));
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.setContent(`<iframe style="width:390px;height:664px;transform:scale(.75);transform-origin:0 0" srcdoc='<div data-ui-min-target="44"><button style="height:44px">Scaled too small</button><button style="height:60px">Scaled safe</button></div>'></iframe>`);
    const frame = page.frames().find(frame => frame !== page.mainFrame());
    await frame.waitForSelector('button');
    const scaled = await frame.evaluate(auditTextGeometry);
    assert.equal(scaled.frameScale, .75);
    assert.ok(scaled.violations.some(item => item.type === 'control-below-min-target' && item.text === 'Scaled too small'));
    assert.equal(scaled.violations.some(item => item.type === 'control-below-min-target' && item.text === 'Scaled safe'), false);
  } finally { await browser.close(); }
});
