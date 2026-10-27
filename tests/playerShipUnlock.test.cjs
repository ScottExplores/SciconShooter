const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const carouselSource = fs.readFileSync(path.join(root, 'components', 'ShipCarousel.tsx'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const shipServiceSource = fs.readFileSync(path.join(root, 'services', 'playerShipService.ts'), 'utf8');
const mintRecordsSource = fs.readFileSync(path.join(root, 'api', 'mint-records.js'), 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'api', 'record-metadata.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const campaignConfig = require('../game-config/campaign.json');

const compilePlayerShipService = () => {
  const compiled = ts.transpileModule(shipServiceSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  const localRequire = (request) => {
    if (request === '../constants') {
      return {
        ASSETS: {
          PLAYER_SHIP: 'researchhub.png',
          BIO_SHIP: 'bio.png',
          NIH_SHIP: 'nih.png',
          ETH_SHIP: 'eth.png',
          BTC_SHIP: 'btc.png'
        }
      };
    }
    if (request === './campaignProgression') {
      return {
        CAMPAIGN_STAR_TOTAL: 180,
        getCampaignMasteryStatus: (progress) => ({
          completedMissions: progress?.mastered ? 60 : 0,
          totalMissions: 60,
          earnedStars: progress?.mastered ? 180 : 0,
          totalStars: 180,
          mastered: progress?.mastered === true
        })
      };
    }
    return require(request);
  };
  Function('exports', 'require', 'module', compiled)(moduleBox.exports, localRequire, moduleBox);
  return moduleBox.exports;
};

test('BIO ship is a compact square RGBA pixel sprite', () => {
  const spritePath = path.join(root, 'public', 'game-art', 'branding', 'bio-ship.png');
  const png = fs.readFileSync(spritePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6);
  assert.ok(png.length < 150_000);
});

test('ResearchHub ship is a compact square RGBA pixel spacecraft', () => {
  const spritePath = path.join(root, 'public', 'game-art', 'branding', 'researchhub-ship.png');
  const png = fs.readFileSync(spritePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6);
  assert.ok(png.length < 150_000);
  assert.match(shipServiceSource, /name: 'RSC ship'/);
});

test('ETH ship is a compact square RGBA pixel spacecraft', () => {
  const spritePath = path.join(root, 'public', 'game-art', 'branding', 'eth-ship.png');
  const png = fs.readFileSync(spritePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6);
  assert.ok(png.length < 150_000);
});

test('BTC ship uses the updated neutral RGBA motion-pack frame', () => {
  const spritePath = path.join(root, 'public', 'game-art', 'generated', 'scicon-flight-motion-pack-v1', 'ships', 'btc-token-ship', 'frames', 'btc-token-ship-03-neutral.png');
  const png = fs.readFileSync(spritePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6);
});

test('token access, paid entitlements, and perfect Campaign mastery are the only ship gates', () => {
  const ships = compilePlayerShipService();
  const locked = ships.getPlayerShipUnlocks({
    accessStatus: 'ready',
    permanentUnlockIds: ['bio', 'eth', 'btc']
  });
  assert.equal(ships.isPlayerShipUnlocked('researchhub', locked), true);
  assert.equal(locked.bio, true, 'the NIH ship does not require a token holding');
  assert.equal(ships.isPlayerShipUnlocked('bio', locked), true);
  assert.equal(locked.eth, false, 'a legacy local ETH flag is not payment proof');
  assert.equal(locked.btc, false, 'a legacy local BTC flag is not payment or mastery proof');
  assert.match(shipServiceSource, /name: 'NIH'/);

  const loadingPaidAccess = ships.getPlayerShipUnlocks({
    accessStatus: 'loading',
    authoritativePaidUnlockIds: ['eth', 'btc']
  });
  assert.equal(loadingPaidAccess.eth, false, 'wallet access fails closed until verification completes');
  assert.equal(loadingPaidAccess.btc, false);

  const paidAccess = ships.getPlayerShipUnlocks({
    accessStatus: 'ready',
    authoritativePaidUnlockIds: ['eth', 'btc']
  });
  assert.equal(paidAccess.eth, true);
  assert.equal(paidAccess.btc, true);

  const campaignAccess = ships.getPlayerShipUnlocks({ campaignProgress: { mastered: true } });
  assert.equal(campaignAccess.eth, false);
  assert.equal(campaignAccess.btc, true);
  assert.equal(campaignAccess.campaignStarsEarned, 180);
  assert.equal(campaignAccess.campaignStarsTotal, 180);

  const localState = { unlockedPlayerShips: ['researchhub'] };
  const unchanged = ships.addCampaignMasteryBtcUnlock(localState, { mastered: false });
  assert.equal(unchanged, localState);
  const awarded = ships.addCampaignMasteryBtcUnlock(localState, { mastered: true });
  assert.deepEqual(awarded.unlockedPlayerShips, ['researchhub', 'btc']);
  assert.equal(ships.addCampaignMasteryBtcUnlock(awarded, { mastered: true }), awarded);

  assert.equal(campaignConfig.levels.length, 60);
  assert.equal(
    campaignConfig.levels.reduce((total, level) => (
      total + level.campaignProgression.masteryObjectives.length
    ), 0),
    180
  );
  assert.doesNotMatch(shipServiceSource, /MintRecord|SCORE_THRESHOLD|highestMintedScore/);
  assert.match(mintRecordsSource, /select=run_id,score/);
  assert.match(mintRecordsSource, /functionName: 'ownerOf'/);
  assert.match(appSource, /getUsablePlayerShip\(selectedShipId, shipUnlocks\)/);
  assert.doesNotMatch(metadataSource, /Ship Unlocks|Mission Record unlocks/);
});

test('project wallet can bypass every ship lock for owner testing', () => {
  const ships = compilePlayerShipService();
  const unlocks = ships.getPlayerShipUnlocks({ unlockAll: true });
  assert.equal(unlocks.bio, true);
  assert.equal(unlocks.eth, true);
  assert.equal(unlocks.btc, true);
  assert.match(shipServiceSource, /export interface PlayerShipUnlockOptions/);
  assert.match(shipServiceSource, /unlockAll\?: boolean/);
});

test('title screen keeps the updated BTC ship in the playable roster', () => {
  assert.match(carouselSource, /aria-label="Previous ship"/);
  assert.match(carouselSource, /aria-label="Next ship"/);
  assert.match(startScreenSource, /PLAYER_SHIPS\[shipFocusId\]/);
  assert.match(carouselSource, /sci-ship-carousel-item--locked/);
  assert.match(startScreenSource, /NIH is unlocked\./);
  assert.doesNotMatch(startScreenSource, /Hold at least 100 BIO on Base/);
  assert.match(startScreenSource, /Unlock permanently for 0\.001 ETH on Base/);
  assert.match(startScreenSource, /0\.00008 cbBTC on Base/);
  assert.doesNotMatch(startScreenSource, /score NFT to unlock this ship/);
  assert.match(startScreenSource, /\[\.\.\.PLAYABLE_PLAYER_SHIP_IDS\]/);
  assert.match(shipServiceSource, /PLAYABLE_PLAYER_SHIP_IDS = \['researchhub', 'bio', 'eth', 'btc'\]/);
  assert.match(startScreenSource, /onSettleShip=\{\(shipId\) => \{[\s\S]*isPlayerShipUnlocked\(shipId, shipUnlocks\)/);
  assert.match(startScreenSource, /shipId === 'btc'/);
  assert.doesNotMatch(carouselSource, /sci-ship-carousel-item--behind-/);
  assert.match(carouselSource, /const nextRevision = revisionRef\.current \+ 1;[\s\S]*revisionRef\.current = nextRevision/);
  assert.match(carouselSource, /transition \? `sci-ship-carousel-item--incoming/);
  assert.doesNotMatch(indexSource, /\.sci-ship-carousel-item--active \{[^}]*animation:/s);
});

test('selected ship art is used by the player and afterimages', () => {
  assert.match(appSource, /activeMissionPlayerShipUrl = PLAYER_SHIPS\[activeMissionShipId\]\.assetUrl/);
  assert.match(appSource, /playerShipUrl: activeMissionPlayerShipUrl/);
  assert.match(appSource, /playerShipId: activeMissionShipId/);
  assert.ok((runtimeSource.match(/this\.playerShipUrl/g) || []).length >= 4);
  assert.match(runtimeSource, /getReadyImage\(this\.playerShipUrl\)/);
  assert.match(runtimeSource, /imageCache\[this\.playerShipUrl\]/);
});

test('equipped mini-ships replace the old duplicate-player gun pods', () => {
  assert.match(runtimeSource, /getSquadCompanionVisuals\(\): SquadCompanionVisual\[\]/);
  assert.match(runtimeSource, /private updateSquadCompanions\(\)/);
  assert.match(runtimeSource, /private spawnSquadCompanionBullet\(companion: ActiveSquadCompanion\)/);
  assert.match(runtimeSource, /return EMPTY_GUN_POD_OFFSETS/);
  assert.match(runtimeSource, /sampleTripleShotSideAngleRadians/);
  assert.match(runtimeSource, /const sideAngle = sampleTripleShotSideAngleRadians\(side, this\.nextGameplayRandom\(\)\)/);
  assert.match(runtimeSource, /angleBias: sideAngle/);
});
