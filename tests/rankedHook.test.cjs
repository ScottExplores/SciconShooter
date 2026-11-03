const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
const start = fs.readFileSync(path.join(__dirname, '..', 'components', 'StartScreen.tsx'), 'utf8');

test('home hero shows the top score or a set-the-high-score fallback', () => {
  assert.match(start, /`Beat \$\{formatNumber\(heroTopScore\)\}`/);
  assert.match(start, /'Set the High Score'/);
  assert.match(start, /data-hero="true"/);
});

test('practice game over hook never shows for founder, weekly, archive or branch runs', () => {
  const block = app.slice(app.indexOf('const rankedHookPlacement'), app.indexOf('const [rankedHookBannerShown'));
  for (const guard of ['!isWeeklyCampaignRun', '!isFounderSandboxRun', '!isBossArchiveRun', '!isCampaignBranchRun', 'rankedBoardLoaded']) {
    assert.ok(block.includes(guard), guard);
  }
  assert.match(app, /Would&apos;ve placed/);
  assert.match(app, /Your score counts next run/);
  assert.match(app, /RANKED_HOOK_BANNER_KEY/);
});
