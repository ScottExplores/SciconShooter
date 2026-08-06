const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const dialogSource = fs.readFileSync(path.join(root, 'components', 'PlayerReportDialog.tsx'), 'utf8');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');

test('More menu offers separate feedback and bug-report actions through one durable dialog', () => {
  assert.match(startScreenSource, /label="Feedback"[\s\S]*?setPlayerReportKind\('feedback'\)/);
  assert.match(startScreenSource, /label="Report a Bug"[\s\S]*?support\.png[\s\S]*?setPlayerReportKind\('bug'\)/);
  assert.match(startScreenSource, /<PlayerReportDialog[\s\S]*?kind=\{playerReportKind\}[\s\S]*?setPlayerReportKind\(null\)/);
  assert.doesNotMatch(startScreenSource, /mailto:/);
});

test('More menu Social action opens the official Scicon Shooter X account', () => {
  assert.match(startScreenSource, /label="Social"[\s\S]*?href=\{DONATION_CONFIG\.X_PROFILE_URL\}/);
  assert.doesNotMatch(startScreenSource, /label="Updates"/);
  assert.match(constantsSource, /X_PROFILE_URL:\s*"https:\/\/x\.com\/SciconShooter"/);
});

test('player report dialog exposes labeled fields and the approved report categories', () => {
  assert.match(dialogSource, /'gameplay'/);
  assert.match(dialogSource, /'loading-performance'/);
  assert.match(dialogSource, /'wallet-purchase'/);
  assert.match(dialogSource, /'visual-audio'/);
  assert.match(dialogSource, /'other'/);
  assert.match(dialogSource, /htmlFor="sci-player-report-category"/);
  assert.match(dialogSource, /htmlFor="sci-player-report-summary"/);
  assert.match(dialogSource, /htmlFor="sci-player-report-details"/);
  assert.match(dialogSource, /maxLength=\{600\}/);
  assert.match(dialogSource, /maxLength=\{1600\}/);
});

test('technical diagnostics are consented by an enabled-by-default control with a privacy explanation', () => {
  assert.match(dialogSource, /includeDiagnostics: true/);
  assert.match(dialogSource, /type="checkbox"[\s\S]*?checked=\{draft\.includeDiagnostics\}/);
  assert.match(dialogSource, /Include technical diagnostics/);
  assert.match(dialogSource, /never includes recovery phrases or wallet keys/i);
});

test('dialog submission uses the player-report service and retains drafts unless the player explicitly resets them', () => {
  assert.match(
    dialogSource,
    /submitPlayerReport\(\{[\s\S]*?kind,[\s\S]*?category: draft\.category,[\s\S]*?summary,[\s\S]*?details: draft\.details\.trim\(\),[\s\S]*?includeDiagnostics: draft\.includeDiagnostics/
  );
  assert.match(dialogSource, /status: result\.delivery, reportId: result\.reportId/);
  assert.match(dialogSource, /catch \{[\s\S]*?status: 'error', reportId: null/);
  assert.match(dialogSource, /Your draft is still here/);
  assert.match(dialogSource, /const resetDraft = \(\) =>/);
  const catchStart = dialogSource.indexOf('    } catch {');
  const catchEnd = dialogSource.indexOf('\n    }\n  };', catchStart);
  assert.ok(catchStart >= 0 && catchEnd > catchStart);
  assert.doesNotMatch(dialogSource.slice(catchStart, catchEnd), /createDraft|summary: ''|details: ''/);
});

test('successful and queued submissions show a stable report receipt', () => {
  assert.match(dialogSource, /draft\.status === 'sent' \|\| draft\.status === 'queued'/);
  assert.match(dialogSource, /Report received/);
  assert.match(dialogSource, /Report safely queued/);
  assert.match(dialogSource, /Report ID/);
  assert.match(dialogSource, /\{draft\.reportId\}/);
  assert.match(dialogSource, /Send another/);
});

test('support escalation uses the dedicated Scicon account and email without requesting wallet secrets', () => {
  assert.match(constantsSource, /X_PROFILE_URL:\s*"https:\/\/x\.com\/SciconShooter"/);
  assert.match(constantsSource, /SUPPORT_EMAIL:\s*"Sciconshooter@gmail\.com"/);
  assert.match(dialogSource, /mailto:\$\{DONATION_CONFIG\.SUPPORT_EMAIL\}/);
  assert.match(dialogSource, /public transaction hash/);
  assert.match(dialogSource, /Never send a recovery phrase or private key/);
});

test('report dialog is keyboard accessible, restores focus, and fits the mobile viewport', () => {
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /aria-labelledby="sci-player-report-title"/);
  assert.match(dialogSource, /aria-describedby="sci-player-report-description"/);
  assert.match(dialogSource, /aria-live="polite"/);
  assert.match(dialogSource, /event\.key === 'Escape'/);
  assert.match(dialogSource, /event\.key !== 'Tab'/);
  assert.match(dialogSource, /previousFocus\.focus\(\)/);
  assert.match(dialogSource, /requestAnimationFrame/);
  assert.match(dialogSource, /draft\?\.status !== 'sent'[\s\S]*draft\?\.status !== 'queued'/);
  assert.match(dialogSource, /receiptHeadingRef\.current\?\.focus\(\)/);
  assert.match(dialogSource, /ref=\{receiptHeadingRef\}[\s\S]*?tabIndex=\{-1\}/);
  assert.match(dialogSource, /max-h-\[calc\(100svh-1\.5rem\)\]/);
  assert.match(dialogSource, /overflow-y-auto/);
  assert.match(dialogSource, /min-h-11/);
});
