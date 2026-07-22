const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const carouselSource = fs.readFileSync(path.join(root, 'components', 'ShipCarousel.tsx'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const shipServiceSource = fs.readFileSync(path.join(root, 'services', 'playerShipService.ts'), 'utf8');
const mintRecordsSource = fs.readFileSync(path.join(root, 'api', 'mint-records.js'), 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'api', 'record-metadata.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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

test('confirmed Mission Record scores cumulatively unlock ETH and BTC ships', () => {
  assert.match(shipServiceSource, /record\.walletAddress\?\.toLowerCase\(\) === normalizedWallet/);
  assert.match(shipServiceSource, /record\.recordType === 'mission'/);
  assert.match(shipServiceSource, /record\.status === 'confirmed'/);
  assert.match(shipServiceSource, /ETH_SHIP_SCORE_THRESHOLD = 1_000/);
  assert.match(shipServiceSource, /BTC_SHIP_SCORE_THRESHOLD = 10_000/);
  assert.match(shipServiceSource, /eth: options\.unlockAll === true \|\| highestMintedScore >= ETH_SHIP_SCORE_THRESHOLD/);
  assert.match(shipServiceSource, /btc: options\.unlockAll === true \|\| highestMintedScore >= BTC_SHIP_SCORE_THRESHOLD/);
  assert.match(mintRecordsSource, /select=run_id,score/);
  assert.match(mintRecordsSource, /functionName: 'ownerOf'/);
  assert.match(appSource, /getPlayerShipUnlocks\(activeWalletAddress, walletRecords, \{ unlockAll: isOwnerWallet \}\)/);
  assert.match(appSource, /getUsablePlayerShip\(selectedShipId, shipUnlocks\)/);
  assert.match(metadataSource, /Bitcoin Ace/);
  assert.match(metadataSource, /Ethereum Pilot/);
});

test('project wallet bypasses every score-gated ship lock', () => {
  assert.match(shipServiceSource, /export interface PlayerShipUnlockOptions/);
  assert.match(shipServiceSource, /unlockAll\?: boolean/);
  assert.match(appSource, /\[activeWalletAddress, isOwnerWallet, permanentSquadState\.unlockedPlayerShips, walletRecords\]/);
});

test('title screen keeps the updated BTC ship in the playable roster', () => {
  assert.match(carouselSource, /aria-label="Previous ship"/);
  assert.match(carouselSource, /aria-label="Next ship"/);
  assert.match(startScreenSource, /PLAYER_SHIPS\[shipFocusId\]/);
  assert.match(carouselSource, /sci-ship-carousel-item--locked/);
  assert.match(startScreenSource, /Mint a \$\{getShipUnlockScore\(shipId\)\.toLocaleString\(\)\}\+ score NFT to unlock this ship/);
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
  assert.match(appSource, /playerShipUrl = PLAYER_SHIPS\[usableShipId\]\.assetUrl/);
  assert.match(appSource, /playerShipUrl/);
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
  assert.match(runtimeSource, /const sideAngle = sampleTripleShotSideAngleRadians\(side, Math\.random\(\)\)/);
  assert.match(runtimeSource, /angleBias: sideAngle/);
});
