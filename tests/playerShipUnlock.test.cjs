const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const shipServiceSource = fs.readFileSync(path.join(root, 'services', 'playerShipService.ts'), 'utf8');
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

test('confirmed Mission Record ownership unlocks the ETH ship for the connected wallet only', () => {
  assert.match(shipServiceSource, /record\.walletAddress\?\.toLowerCase\(\) === normalizedWallet/);
  assert.match(shipServiceSource, /record\.recordType === 'mission'/);
  assert.match(shipServiceSource, /record\.status === 'confirmed'/);
  assert.match(shipServiceSource, /functionName: 'balanceOf'/);
  assert.match(shipServiceSource, /return balance > 0n/);
  assert.match(appSource, /ownsSciconRecordNft\(activeWalletAddress\)/);
  assert.match(appSource, /onchainRecordOwner === activeWalletAddress\.toLowerCase\(\)/);
  assert.match(appSource, /getUsablePlayerShip\(selectedShipId, ethShipUnlocked\)/);
});

test('title screen keeps BIO open and explains the locked ETH unlock', () => {
  assert.match(startScreenSource, /aria-label="Previous ship"/);
  assert.match(startScreenSource, /aria-label="Next ship"/);
  assert.match(startScreenSource, /PLAYER_SHIPS\[shipFocusId\]/);
  assert.match(startScreenSource, /sci-ship-carousel-item--locked/);
  assert.match(startScreenSource, /Mint a high score NFT to unlock this ship/);
  assert.match(startScreenSource, /\['researchhub', 'bio', 'eth'\]/);
  assert.match(startScreenSource, /if \(nextShipId !== 'eth' \|\| ethShipUnlocked\)/);
  assert.match(startScreenSource, /shipFocusId === 'eth' && !ethShipUnlocked/);
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
  assert.match(runtimeSource, /DOUBLE_GUN_POD_OFFSETS = \[42\]/);
  assert.match(runtimeSource, /TRIPLE_GUN_POD_OFFSETS = \[-42, 42\]/);
  assert.match(gunPodSource, /this\.drawGunPod\(ctx, size, isTriple, index\)/);
  assert.doesNotMatch(gunPodSource, /playerShipUrl/);
});
