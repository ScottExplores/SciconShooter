const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetRoot = path.join(
  root,
  'public',
  'game-art',
  'generated',
  'ui',
  'scicon-campaign-map-celestials-v1'
);
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'pack-manifest.json'), 'utf8'));

test('Campaign Map celestial pack contains four compact 128px RGBA sprites with verified hashes', () => {
  assert.equal(manifest.id, 'scicon-campaign-map-celestials-v1');
  assert.equal(manifest.assets.length, 4);
  assert.deepEqual(
    new Set(manifest.assets.map((asset) => asset.id)),
    new Set(['ocean', 'crater', 'ice', 'ringed'])
  );

  manifest.assets.forEach((asset) => {
    const filePath = path.join(root, 'public', asset.path.replace(/^\//, ''));
    const bytes = fs.readFileSync(filePath);
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 128);
    assert.equal(bytes.readUInt32BE(20), 128);
    assert.equal(bytes[24], 8, `${asset.id} must use 8-bit channels`);
    assert.equal(bytes[25], 6, `${asset.id} must be an RGBA PNG`);
    assert.ok(bytes.length < 50_000, `${asset.id} should remain below 50KB`);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  });
});

test('Campaign Map celestial component eagerly decodes the four allowlisted assets', () => {
  const component = fs.readFileSync(
    path.join(root, 'components', 'campaign-map', 'CampaignMapCelestial.tsx'),
    'utf8'
  );
  assert.match(component, /campaign-ocean-world\.png/);
  assert.match(component, /campaign-crater-moon\.png/);
  assert.match(component, /campaign-ice-moon\.png/);
  assert.match(component, /campaign-ringed-gas-dwarf\.png/);
  assert.match(component, /loading="eager"/);
  assert.match(component, /decoding="sync"/);
  assert.doesNotMatch(component, /loading="lazy"|filter:/);
});
