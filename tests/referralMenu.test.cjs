const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

test('the Referral menu exposes ResearchHub and Base App links beside both QR codes', () => {
  const screen = read('components', 'StartScreen.tsx');
  const app = read('App.tsx');
  const constants = read('constants.ts');

  assert.match(screen, /Referral Links/);
  assert.match(screen, /ResearchHub referral/);
  assert.match(screen, /Base App referral/);
  assert.match(screen, /researchhub-referral-qr\.png/);
  assert.match(screen, /base-app-invite-qr\.png/);
  assert.match(screen, /url: ASSETS\.REFERRAL_LINK/);
  assert.match(screen, /url: DONATION_CONFIG\.BASE_APP_INVITE_URL/);
  assert.match(screen, /handleCopyReferral\(referral\.id, referral\.url\)/);
  assert.match(screen, /\{referral\.url\}/);
  assert.match(screen, /useDialogFocusRestoration\(showReferral, referralDialogRef, referralCloseRef\)/);
  assert.match(screen, /trapDialogFocus\(event, referralDialogRef\.current/);
  assert.match(screen, /href=\{referral\.url\}\s+className=/);
  assert.match(app, /onOpenBaseAppReferral=\{openBaseAppInvite\}/);
  assert.match(app, /window\.location\.assign\(ASSETS\.REFERRAL_LINK\)/);
  assert.match(app, /window\.location\.assign\(DONATION_CONFIG\.BASE_APP_INVITE_URL\)/);
  assert.match(constants, /researchhub\.com\/referral\/join\?refr=/);
  assert.match(constants, /base\.app\/invite\/scottexplores\//);
});

test('the RSC handoff dialog is focus-safe and scrolls inside short mobile viewports', () => {
  const screen = read('components', 'StartScreen.tsx');

  assert.match(screen, /useDialogFocusRestoration\(showRscAcquire, rscAcquireDialogRef, rscAcquirePrimaryRef\)/);
  assert.match(screen, /trapDialogFocus\(event, rscAcquireDialogRef\.current/);
  assert.match(screen, /max-h-\[calc\(100svh-2rem\)\][^"\n]*overflow-y-auto/);
});
