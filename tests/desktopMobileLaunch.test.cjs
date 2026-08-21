const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'desktopMobileLaunch.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    }
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module,
    exports: module.exports,
    URL,
    Number,
    Math
  });
  return module.exports;
};

const runtime = loadRuntime();
const componentSource = fs.readFileSync(
  path.join(root, 'components', 'DesktopMobileLaunchShell.tsx'),
  'utf8'
);
const indexSource = fs.readFileSync(path.join(root, 'index.tsx'), 'utf8');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const eventsSource = fs.readFileSync(path.join(root, 'api', 'events.js'), 'utf8');
const assetRoot = path.join(
  root,
  'public',
  'game-art',
  'generated',
  'ui',
  'scicon-desktop-mobile-launch-v1'
);
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'pack-manifest.json'), 'utf8'));

test('desktop launch shell is top-level only and mobile/frame requests bypass it', () => {
  assert.equal(runtime.shouldUseDesktopLaunchShell({
    topLevel: true,
    framedDisplayRequested: false,
    desktopMediaMatches: true
  }), true);
  assert.equal(runtime.shouldUseDesktopLaunchShell({
    topLevel: true,
    framedDisplayRequested: false,
    desktopMediaMatches: false
  }), false);
  assert.equal(runtime.shouldUseDesktopLaunchShell({
    topLevel: true,
    framedDisplayRequested: true,
    desktopMediaMatches: true
  }), false);
  assert.equal(runtime.shouldUseDesktopLaunchShell({
    topLevel: false,
    framedDisplayRequested: false,
    desktopMediaMatches: true
  }), false);
});

test('framed URL preserves routes while adding one recursive-frame guard', () => {
  const framed = new URL(runtime.buildMobileFrameUrl(
    'https://sciconshooter.xyz/?view=campaign-map&mission=20#current'
  ));

  assert.equal(framed.origin, 'https://sciconshooter.xyz');
  assert.equal(framed.searchParams.get('view'), 'campaign-map');
  assert.equal(framed.searchParams.get('mission'), '20');
  assert.equal(framed.searchParams.get('display'), 'mobile-frame');
  assert.equal(framed.searchParams.getAll('display').length, 1);
  assert.equal(framed.hash, '#current');
  assert.equal(runtime.hasMobileFrameDisplay(framed.toString()), true);
  assert.equal(runtime.hasMobileFrameDisplay('https://sciconshooter.xyz/?view=campaign-map'), false);
});

test('desktop frame stays logically 390x844 and scales to fit the screen', () => {
  assert.equal(runtime.MOBILE_FRAME_WIDTH, 390);
  assert.equal(runtime.MOBILE_FRAME_HEIGHT, 844);

  // A tall desktop screen grows the deck instead of leaving it as a small
  // window in the middle of the monitor.
  const roomyScale = runtime.resolveMobileFrameScale(1440, 900);
  assert.ok(roomyScale > 1, 'a 900px-tall screen uses more than 1x');
  assert.ok(Math.abs(roomyScale - (876 / 844)) < 1e-12);

  const tallScale = runtime.resolveMobileFrameScale(1920, 1440);
  assert.equal(tallScale, runtime.MOBILE_FRAME_MAX_SCALE, 'growth stays bounded');

  const shortScreenScale = runtime.resolveMobileFrameScale(1366, 768);
  assert.ok(shortScreenScale < 1);
  assert.ok(Math.abs(shortScreenScale - (744 / 844)) < 1e-12);

  // Whatever the scale, the frame always fits inside the viewport budget.
  for (const [width, height] of [[1440, 900], [1920, 1440], [1366, 768], [1280, 720]]) {
    const scale = runtime.resolveMobileFrameScale(width, height);
    assert.ok((390 * scale) <= (width - 48), `${width}x${height} fits horizontally`);
    assert.ok((844 * scale) <= (height - 24), `${width}x${height} fits vertically`);
  }
});

test('entrypoint wraps the existing canonical App instead of creating a second game implementation', () => {
  assert.match(indexSource, /<DesktopMobileLaunchShell>[\s\S]*?<AppProviders>[\s\S]*?<App \/>/);
  assert.match(componentSource, /<iframe[\s\S]*?src=\{frameUrl\}[\s\S]*?title="Scicon Shooter mobile game"/);
  assert.match(componentSource, /DONATION_CONFIG\.BASE_APP_INVITE_URL/);
  assert.match(componentSource, /window\.sessionStorage\.setItem\(DESKTOP_LAUNCH_SESSION_KEY, 'true'\)/);
  assert.match(componentSource, />\s*Start Browser Run\s*</);
  assert.match(
    componentSource,
    /scicon-desktop-mobile-launch__actions[\s\S]*?scicon-desktop-mobile-launch__play-action[\s\S]*?Start Browser Run[\s\S]*?scicon-desktop-mobile-launch__base-action[\s\S]*?Open in Base App/
  );
  assert.match(componentSource, /trackEvent\('desktop_launch_viewed'/);
  assert.match(componentSource, /trackEvent\('desktop_launch_selected'/);
  assert.match(componentSource, /readSocialCampaignAttribution\(window\.location\.search\)/);
  assert.match(eventsSource, /'desktop_launch_viewed'/);
  assert.match(eventsSource, /'desktop_launch_selected'/);
  assert.doesNotMatch(componentSource, /GameEngine|GameCanvas|GameStage|campaign\.json/);
});

test('local desktop launch art and QR manifest are hash-closed to the configured Base invite', () => {
  const inviteMatch = constantsSource.match(/BASE_APP_INVITE_URL:\s*"([^"]+)"/);
  assert.ok(inviteMatch);
  assert.equal(manifest.assets.baseAppInviteQr.encodedUrl, inviteMatch[1]);

  for (const asset of Object.values(manifest.assets)) {
    const filePath = path.join(root, 'public', asset.path.replace(/^\//, ''));
    const bytes = fs.readFileSync(filePath);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
});
