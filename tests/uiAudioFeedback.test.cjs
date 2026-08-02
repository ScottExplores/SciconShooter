const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('one delegated UI audio layer covers pointer and keyboard activation without hover noise', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'uiAudioFeedback.ts'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(source, /const INTERACTIVE_SELECTOR = \[/);
  assert.match(source, /'button'/);
  assert.match(source, /'a\[href\]'/);
  assert.match(source, /target\.closest<HTMLElement>\(INTERACTIVE_SELECTOR\)/);
  assert.match(source, /root\.addEventListener\('pointerdown', onPointerDown, true\)/);
  assert.match(source, /event\.detail !== 0/);
  assert.match(source, /root\.addEventListener\('click', onClick as EventListener, true\)/);
  assert.match(source, /root\.removeEventListener\('pointerdown', onPointerDown, true\)/);
  assert.match(source, /root\.removeEventListener\('click', onClick as EventListener, true\)/);
  assert.doesNotMatch(source, /pointerenter|pointerover|mouseover|mouseenter/);
  assert.match(appSource, /useEffect\(\(\) => installUiAudioFeedback\(document\), \[\]\)/);
});

test('UI cue resolution supports semantic actions, explicit overrides, and silent disabled controls', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'uiAudioFeedback.ts'), 'utf8');

  assert.match(source, /control\.dataset\.audioCue/);
  ['click', 'confirm', 'back', 'error', 'open', 'close'].forEach((cue) => {
    assert.match(source, new RegExp(`explicit === '${cue}'`));
  });
  assert.match(source, /BACK_ACTION\.test\(label\)/);
  assert.match(source, /CONFIRM_ACTION\.test\(label\)/);
  assert.match(source, /OPEN_ACTION\.test\(label\)/);
  assert.match(source, /control\.dataset\.audio === 'none'/);
  assert.match(source, /control\.getAttribute\('aria-disabled'\) === 'true'/);
  assert.match(source, /Boolean\(\(control as HTMLButtonElement\)\.disabled\)/);
  assert.match(source, /audioService\.playUiSound\(resolveUiSound\(control\)\)/);
});

test('gameplay actions with native effects opt out of delegated menu clicks', () => {
  const overlaySource = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');
  const silentControls = overlaySource.match(/data-audio="none"/g) ?? [];

  assert.equal(silentControls.length, 3, 'bomb, ship ability, and field upgrades should use native gameplay audio');
  assert.match(overlaySource, /data-audio="none"\s*\{\.\.\.bombActionHandlers\}/);
  assert.match(overlaySource, /data-audio="none"\s*\{\.\.\.shipAbilityActionHandlers\}/);
  assert.match(overlaySource, /data-audio="none"[\s\S]{0,300}onUpgrade\(type\)/);
});

test('audio settings acknowledge unmute and volume changes through the UI bus', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(appSource, /const nextMuted = audioService\.toggleMute\(\)/);
  assert.match(appSource, /if \(!nextMuted\) audioService\.playUiSound\('confirm'\)/);
  assert.match(appSource, /setGameSfxVolume[\s\S]{0,260}audioService\.playUiSound\('click'\)/);
  assert.match(appSource, /setGameMusicVolume[\s\S]{0,260}audioService\.playUiSound\('click'\)/);
});
