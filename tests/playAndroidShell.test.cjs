const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const loadPlayBuild = () => {
  const compiled = ts.transpileModule(read('services/playBuild.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  Function('exports', 'module', compiled)(moduleBox.exports, moduleBox);
  return moduleBox.exports;
};

const loadShipService = () => {
  const compiled = ts.transpileModule(read('services/playerShipService.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  const localRequire = (request) => {
    if (request === '../constants') {
      return { ASSETS: { PLAYER_SHIP: 'a', NIH_SHIP: 'b', ETH_SHIP: 'c', BTC_SHIP: 'd' } };
    }
    if (request === './campaignProgression') {
      return {
        CAMPAIGN_STAR_TOTAL: 180,
    getCampaignMasteryStatus: (progress) => ({
      mastered: progress?.mastered === true,
      earnedStars: progress?.mastered ? 180 : 0,
      totalStars: 180
    })
      };
    }
    throw new Error(`unexpected require ${request}`);
  };
  Function('exports', 'require', 'module', compiled)(moduleBox.exports, localRequire, moduleBox);
  return moduleBox.exports;
};

test('the Play shell is the default on this branch', () => {
  const play = loadPlayBuild();
  assert.equal(play.PLAY_BUILD, true);
  assert.equal(play.PLAY_ANDROID_PACKAGE, 'xyz.sciconshooter.play');
  assert.equal(play.PLAY_ORIGIN, 'https://scicon-play.vercel.app');
  assert.equal(play.playShipLabel('researchhub', 'RSC ship'), 'Research ship');
  assert.equal(play.playShipLabel('eth', 'ETH ship'), 'Prism ship');
  assert.equal(play.playShipLabel('btc', 'BTC ship'), 'Solar ship');
  assert.equal(play.playShipLabel('bio', 'NIH'), 'NIH');
});

test('Play shell unlocks the violet hull without a payment and still gates the gold hull', () => {
  const ships = loadShipService();
  const locked = ships.getPlayerShipUnlocks({ accessStatus: 'ready' });
  assert.equal(locked.eth, false);
  const play = ships.getPlayerShipUnlocks({ playShell: true, accessStatus: 'idle' });
  assert.equal(play.eth, true);
  assert.equal(play.btc, false);
  assert.equal(ships.getPlayerShipUnlocks({
    playShell: true,
    campaignProgress: { mastered: true }
  }).btc, true);
});

test('wallet providers, runtime, purchases, and prizes stay off on the Play shell', () => {
  const providers = read('providers.tsx');
  const app = read('App.tsx');
  const start = read('components/StartScreen.tsx');
  const hangar = read('components/SquadHangar.tsx');
  const record = read('components/MissionRecordPreview.tsx');
  const reward = read('components/RewardCenter.tsx');
  const shell = read('components/DesktopMobileLaunchShell.tsx');
  const story = read('services/storyBeats.ts');

  assert.match(providers, /if \(PLAY_BUILD\) return <>\{children\}<\/>/);
  assert.match(app, /PLAY_BUILD \? null : readCachedBaseAccount/);
  assert.match(app, /const isOwnerWallet = !PLAY_BUILD &&/);
  assert.match(app, /if \(PLAY_BUILD\) return;/);
  assert.match(app, /\{!PLAY_BUILD && walletRuntimeEnabled \? \(/);
  assert.match(app, /walletControl=\{PLAY_BUILD \|\| activeStoryBeat \? null/);
  assert.match(app, /const gameOverContinueControls = !PLAY_BUILD &&/);
  assert.match(app, /playShell: PLAY_BUILD/);
  assert.match(start, /PLAY_BUILD \? \(\) => setDashboardTab\('proposals'\) : onOpenFund/);
  assert.match(start, /\{PLAY_BUILD \? null : \([\s\S]*label="Treasury"/);
  assert.match(start, /label="RSC on Base"/);
  assert.match(start, /\{showRscAcquire && !PLAY_BUILD && \(/);
  assert.match(start, /\{showTreasury && !PLAY_BUILD && \(/);
  assert.match(start, /const heroPrizeRsc = !PLAY_BUILD &&/);
  assert.match(start, /\{PLAY_BUILD \? null : \(\s*<PlayerShipAccessDialog/);
  assert.match(hangar, /PLAY_BUILD \? null : \([\s\S]*label="Research Coin"/);
  assert.match(hangar, /!founderSandbox && !PLAY_BUILD \? '10 RSC'/);
  assert.match(record, /\{!PLAY_BUILD && weeklyFunding \?/);
  assert.match(record, /\{PLAY_BUILD \? null : \(\s*<button type="button" onClick=\{onMint\}/);
  assert.match(reward, /PLAY_BUILD \? 'Gifts and achievements stay on this device\.' : 'Connect a wallet only for minted and onchain items\.'/);
  assert.match(shell, /\{PLAY_BUILD \? null : \(\s*<a[\s\S]*Scan for Base App/);
  assert.doesNotMatch(story, /RSC routes around it/);
});

test('Digital Asset Links and the Play host are wired for the new package', () => {
  const links = JSON.parse(read('public/.well-known/assetlinks.json'));
  const vercel = JSON.parse(read('vercel.json'));
  const privacy = read('public/android-privacy.html');
  const manifest = read('android-twa/app/src/main/AndroidManifest.xml');
  const gradle = read('android-twa/app/build.gradle');

  assert.equal(links.length, 1);
  assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(links[0].target.namespace, 'android_app');
  assert.equal(links[0].target.package_name, 'xyz.sciconshooter.play');
  assert.equal(links[0].target.sha256_cert_fingerprints.length, 1);
  assert.match(links[0].target.sha256_cert_fingerprints[0], /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/);
  assert.ok(vercel.rewrites[0].source === '/.well-known/assetlinks.json');
  assert.ok(vercel.headers.some((entry) => (
    entry.source === '/.well-known/assetlinks.json'
    && entry.headers.some((header) => header.key === 'Content-Type' && header.value === 'application/json')
  )));
  assert.match(privacy, /xyz\.sciconshooter\.play/);
  assert.match(privacy, /scicon-play\.vercel\.app/);
  assert.match(privacy, /sciconshooter@gmail\.com/);
  assert.match(privacy, /Trusted Web Activity/);
  assert.match(manifest, /xyz\.sciconshooter\.play/);
  assert.match(read('android-twa/app/src/main/res/values/strings.xml'), /https:\/\/scicon-play\.vercel\.app\//);
  assert.match(manifest, /android:host="scicon-play\.vercel\.app"/);
  assert.match(manifest, /android:pathPrefix="\/"/);
  assert.match(manifest, /android:screenOrientation="portrait"/);
  assert.match(gradle, /applicationId "xyz\.sciconshooter\.play"/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /versionCode 1/);
  assert.match(gradle, /versionName "1\.0\.0"/);
  assert.match(read('.gitignore'), /\*\.jks/);
  assert.match(read('.gitignore'), /android-twa\/keystore\.properties/);
  assert.equal(fs.existsSync(path.join(root, 'android-twa/keystore.properties')), false);
});
