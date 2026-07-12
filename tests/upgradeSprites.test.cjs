const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const spriteNames = ['rapid-fire.png', 'speed.png', 'extra-life.png'];

test('pixel upgrade sprites are optimized square PNG assets', () => {
  spriteNames.forEach((name) => {
    const spritePath = path.join(root, 'public', 'game-art', 'powerups', name);
    const png = fs.readFileSync(spritePath);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
    assert.ok(png.length < 100_000, `${name} should remain lightweight for mobile`);
  });
});

test('the HUD uses large sprite-only upgrade buttons with cost and level badges', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');
  spriteNames.forEach((name) => assert.match(source, new RegExp(`/game-art/powerups/${name.replace('.', '\\.')}`)));
  assert.match(source, /highlighted=\{highlighted\}/);
  assert.match(source, /h-\[4\.6rem\] w-\[4\.6rem\]/);
  assert.match(source, /h-14 w-14/);
  assert.match(source, /w-\[4\.6rem\] flex-col/);
  assert.match(source, /type === 'speed' \? '-rotate-90'/);
  assert.match(source, /h-6 min-w-6.*text-xs font-black/);
  assert.match(source, /x\{flaskCost\}/);
  assert.match(source, /isAtCap \? 'MAX' : `L\$\{displayedLevel\}`/);
  assert.match(source, /saturate-125 brightness-110/);
  assert.match(source, /grayscale opacity-35 brightness-50/);
  assert.match(source, /\[image-rendering:pixelated\]/);
  assert.doesNotMatch(source, /\{shortTitle\}/);
  assert.doesNotMatch(source, /style=\{\{ width: `\$\{Math\.min\(100, \(level \/ config\.maxLevel\)/);
});

test('the top HUD prioritizes hearts and flask progress while the upgrade rail shows only stored flasks', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');

  assert.doesNotMatch(source, /Wave \{stats\.wave\}/);
  assert.match(source, /Flasks \{flaskCount\}/);
  assert.match(source, /style=\{\{ width: `\$\{nextFlaskPct\}%` \}\}/);
  assert.match(source, /flex min-w-0 flex-1 items-center gap-1\.5 overflow-hidden/);
  assert.match(source, /h-3 w-full max-w-full overflow-hidden/);
  assert.doesNotMatch(source, /sm:w-32 sm:flex-none/);
  assert.match(source, /arcade-font text-sm font-black leading-none">x\{flaskCount\}/);
});
