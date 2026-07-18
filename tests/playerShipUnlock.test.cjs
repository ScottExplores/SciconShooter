const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
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

test('BTC ship is a crisp square pixel spacecraft asset', () => {
  const spritePath = path.join(root, 'public', 'game-art', 'branding', 'btc-ship.svg');
  const svg = fs.readFileSync(spritePath, 'utf8');
  assert.match(svg, /viewBox="0 0 256 256"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /#fbbf24/);
  assert.ok(svg.length < 15_000);
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
  assert.match(appSource, /\[activeWalletAddress, isOwnerWallet, walletRecords\]/);
});

test('title screen keeps BIO open and explains score-tier ETH and BTC locks', () => {
  assert.match(startScreenSource, /aria-label="Previous ship"/);
  assert.match(startScreenSource, /aria-label="Next ship"/);
  assert.match(startScreenSource, /PLAYER_SHIPS\[shipFocusId\]/);
  assert.match(startScreenSource, /sci-ship-carousel-item--locked/);
  assert.match(startScreenSource, /Mint a \$\{focusedShipUnlockScore\.toLocaleString\(\)\}\+ score NFT to unlock this ship/);
  assert.match(startScreenSource, /\['researchhub', 'bio', 'eth', 'btc'\]/);
  assert.match(startScreenSource, /isPlayerShipUnlocked\(nextShipId, shipUnlocks\)/);
  assert.match(startScreenSource, /shipFocusId === 'btc'/);
  assert.doesNotMatch(startScreenSource, /sci-ship-carousel-item--behind-/);
  assert.match(startScreenSource, /setShipCycleRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(startScreenSource, /shipCycleRevision > 0 \? 'sci-ship-carousel-item--cycling'/);
  assert.doesNotMatch(indexSource, /\.sci-ship-carousel-item--active \{[^}]*animation:/s);
});

test('selected ship art is used by the player and afterimages', () => {
  assert.match(appSource, /playerShipUrl = PLAYER_SHIPS\[usableShipId\]\.assetUrl/);
  assert.match(appSource, /playerShipUrl/);
  assert.ok((runtimeSource.match(/this\.playerShipUrl/g) || []).length >= 4);
  assert.match(runtimeSource, /getReadyImage\(this\.playerShipUrl\)/);
  assert.match(runtimeSource, /imageCache\[this\.playerShipUrl\]/);
});

test('double and triple shot use floating gun pods instead of duplicate player ships', () => {
  const gunPodStart = runtimeSource.indexOf('  drawGunPods(ctx:');
  const gunPodEnd = runtimeSource.indexOf('  drawPlayerThrusters(', gunPodStart);
  const gunPodSource = runtimeSource.slice(gunPodStart, gunPodEnd);

  assert.ok(gunPodStart > 0 && gunPodEnd > gunPodStart);
  assert.match(runtimeSource, /TRIPLE_GUN_POD_OFFSETS = \[-42, 42\]/);
  assert.match(runtimeSource, /doubleGunPodSide: -1 \| 1 = -1/);
  assert.match(runtimeSource, /return clamp\(this\.width \* 0\.27, 88, 132\)/);
  assert.match(runtimeSource, /DOUBLE_GUN_POD_EDGE_ENTER_RATIO = 0\.38/);
  assert.match(runtimeSource, /DOUBLE_GUN_POD_EDGE_EXIT_RATIO = 0\.62/);
  assert.match(runtimeSource, /this\.doubleGunPodOffset \+= \(targetOffset - this\.doubleGunPodOffset\) \* DOUBLE_GUN_POD_EASING/);
  assert.match(runtimeSource, /return \[this\.doubleGunPodOffset\]/);
  assert.match(gunPodSource, /this\.drawGunPod\(ctx, size, isTriple, index\)/);
  assert.doesNotMatch(gunPodSource, /playerShipUrl/);
});
