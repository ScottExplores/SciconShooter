import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from '../../tools-revamp/qa/browser.mjs';
import { auditTextGeometry } from '../../tools-revamp/qa/ui-geometry.mjs';

test('geometry audit detects real box, border, clipping and control collisions', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<style>body{margin:20px;font:16px monospace}p{margin:0}.case{margin:24px 0}.narrow{width:80px;white-space:nowrap}.panel{border:2px solid;width:100px}.escape{position:relative;left:70px;width:100px}.clip{width:90px;overflow:hidden}.clip span{display:block;width:250px}.row{position:relative;width:300px;height:50px}.row button{position:absolute;left:70px;top:0}button{font:16px monospace}.fine{width:250px;border:1px solid;padding:10px}</style><div class="case narrow">Long overflowing label</div><div class="case panel"><p class="escape">Escaped</p></div><div class="case clip"><span>Clipped content at the right</span></div><div class="case row"><span>Sibling control collision</span><button>Button</button></div><div class="fine">Text wraps safely inside its real bordered panel.</div>`);
    const result = await page.evaluate(auditTextGeometry);
    const types = new Set(result.violations.map(item => item.type));
    for (const type of ['text-outside-own-box', 'text-outside-panel', 'text-clipped', 'text-overlaps-control', 'horizontal-scroll-overflow']) assert.ok(types.has(type), `missing ${type}: ${JSON.stringify(result)}`);
    assert.equal(result.violations.some(item => item.selector.includes('fine')), false);
  } finally { await browser.close(); }
});

test('geometry audit permits readable wrapping, scrolling, hidden screens and screen-reader labels', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<style>body{margin:20px;font:16px sans-serif}.panel{width:220px;border:1px solid;padding:12px;overflow-wrap:anywhere}.scroll{height:60px;overflow:auto}.sr{position:absolute;width:1px;height:1px;clip:rect(0,0,0,0);overflow:hidden}.hidden{display:none}.scroll p{margin:0}</style><div style="position:relative;width:220px;height:30px;overflow:hidden"><div aria-hidden="true" style="position:absolute;left:220px;width:220px">Inactive carousel slide</div></div><details><summary>Closed details</summary><p style="width:10px;white-space:nowrap">Hidden long details text must not be audited before opening</p></details><section class="panel"><p>Readable text wraps onto several lines inside this narrow panel.</p><div class="scroll"><p>${'Normal scroll content. '.repeat(30)}</p></div><span class="sr">Screen reader accessible label</span><p class="hidden">${'hidden'.repeat(100)}</p></section>`);
    const result = await page.evaluate(auditTextGeometry);
    assert.equal(result.violations.length, 0, JSON.stringify(result.violations));
    assert.ok(result.checkedTextNodes >= 2);
  } finally { await browser.close(); }
});


test('visible aria-hidden counters and entirely clipped lines are not ignored', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<style>body{margin:20px;font:16px/20px monospace}.counter{display:block;width:40px;white-space:nowrap}.clip{width:250px;height:20px;overflow:hidden;margin-top:40px}</style><span class="counter" aria-hidden="true">123456789</span><div class="clip"><span>First line<br>Entire second line is clipped</span></div>`);
    const result = await page.evaluate(auditTextGeometry);
    assert.ok(result.violations.some(item => item.type === 'text-outside-own-box' && item.text === '123456789'));
    assert.ok(result.violations.some(item => item.type === 'text-clipped' && item.text.includes('Entire second')));
  } finally { await browser.close(); }
});


test('checks native field text and fully obscured sibling controls while excluding modal background', async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent(`<style>body{margin:0;font:16px monospace}.background{width:20px;white-space:nowrap}section{position:absolute;inset:0;background:white;padding:20px}input{width:70px;font:16px monospace}button{position:absolute;top:70px;left:20px;width:100px;height:44px}</style><div class="background">Intentionally obscured background</div><section role="dialog" aria-modal="true"><input placeholder="Clipped field label"><button>Hidden</button><button>Cover</button></section>`);
    const result = await page.evaluate(auditTextGeometry);
    assert.ok(result.violations.some(item=>item.type==='input-text-clipped'));
    assert.ok(result.violations.some(item=>item.type==='controls-overlap'));
    assert.equal(result.violations.some(item=>item.selector.includes('background')),false);
  } finally { await browser.close(); }
});

test('SVG audit catches overlapping labels and bounded-column overflow inside image cards', async () => {
  const { auditSvgTextGeometry } = await import('../../tools-revamp/qa/ui-svg-geometry.mjs');
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="140" viewBox="0 0 300 140"><text x="10" y="35" font-size="24" data-ui-text-bounds="10,5,60,40">MMMMMMMM</text><text x="50" y="35" font-size="24">123456789</text><text x="10" y="95" font-size="16" data-ui-text-bounds="10,70,200,30">Safe label</text></svg>';
    await page.setContent(`${svg}<img alt="SVG fixture" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:block;width:300px;height:140px">`);
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete));
    const result = await page.evaluate(auditSvgTextGeometry);
    assert.equal(result.checkedSvgTexts,6);
    for(const source of ['inline-svg','svg-image(record-card)']) {
      assert.ok(result.violations.some(item=>item.selector.startsWith(source)&&item.type==='svg-text-outside-column'));
      assert.ok(result.violations.some(item=>item.selector.startsWith(source)&&item.type==='svg-text-overlap'));
    }
    assert.equal(result.violations.some(item=>item.text==='Safe label'),false);
  } finally {await browser.close();}
});

test('coachmark layering excludes only its intentional overlay collisions and keeps HUD defects',async()=>{
  const browser=await launchChrome();
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<style>body{margin:20px;font:16px/22px sans-serif}.hud-label{width:30px;white-space:nowrap}button{position:absolute;width:90px;height:44px;top:90px;left:20px}.bad{top:190px;left:20px}.other{top:190px;left:60px}aside{position:absolute;top:90px;left:20px;background:white}p{margin:0}</style><p class="hud-label">Underlying overflow</p><button>Covered</button><button class="bad">First</button><button class="other">Second</button><aside data-onboarding-step="flight-steer"><p>Coachmark instruction</p></aside>');
    const result=await page.evaluate(auditTextGeometry);
    assert.ok(result.violations.some(item=>item.type==='text-outside-own-box'&&item.text==='Underlying overflow'));
    assert.ok(result.violations.some(item=>item.type==='controls-overlap'));
    assert.equal(result.violations.some(item=>item.text==='Coachmark instruction'),false);
  }finally{await browser.close();}
});
