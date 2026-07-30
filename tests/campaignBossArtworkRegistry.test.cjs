const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);
const registry = JSON.parse(
  fs.readFileSync(
    path.join(root, 'game-config', 'generated', 'campaign-boss-artwork.json'),
    'utf8'
  )
);

const expectedPackages = Object.freeze({
  15: Object.freeze({
    bossId: 'prism-moth',
    rigId: 'prism-moth-broodkeeper'
  }),
  20: Object.freeze({
    bossId: 'frontier-crownclaw',
    rigId: 'frontier-crownclaw'
  }),
  25: Object.freeze({
    bossId: 'helios-clawcarrier',
    rigId: 'helios-clawcarrier-v2'
  }),
  30: Object.freeze({
    bossId: 'nullwake-revenant',
    rigId: 'nullwake-revenant-articulated'
  })
});

test('promoted campaign boss packages contain checked-in, hash-verified runtime art', () => {
  assert.equal(registry.schemaVersion, 1);

  for (const [bossId, packageDefinition] of Object.entries(registry.packages)) {
    const artwork = packageDefinition.artwork;
    const urls = [
      artwork.url,
      artwork.modularRigManifest?.atlas?.url,
      ...Object.values(
        artwork.modularRigManifest?.supplementalAtlases ?? {}
      ).map((atlas) => atlas.url),
      artwork.articulatedAtlas?.url,
      artwork.vfxAtlas?.url,
      ...Object.values(artwork.projectileAnimations ?? {})
        .map((animation) => animation.atlasUrl)
    ].filter(Boolean);

    assert.match(
      artwork.url,
      /^\/game-art\/generated\/bosses\/campaign-packages\//
    );
    assert.match(
      artwork.modularRigManifest?.atlas?.url ?? '',
      /^\/game-art\/generated\/bosses\/campaign-packages\//
    );
    assert.ok(urls.length >= 2, `${bossId} must include assembled and modular art`);
    for (const url of new Set(urls)) {
      assert.match(url, /^\/game-art\//);
      assert.doesNotMatch(url, /director|__director|boss-test-runner/);
      const assetPath = path.join(root, 'public', url.replace(/^\//, ''));
      assert.equal(fs.existsSync(assetPath), true, `${url} must be checked in`);
      assert.ok(fs.statSync(assetPath).size > 1024, `${url} must be non-empty`);
    }

    const assembledPath = path.join(
      root,
      'public',
      artwork.url.replace(/^\//, '')
    );
    assert.equal(
      createHash('sha256').update(fs.readFileSync(assembledPath)).digest('hex'),
      artwork.contentHash,
      `${bossId} assembled art hash must be fresh`
    );
  }
});

test('campaign missions resolve the same promoted modular packages used by Test Bosses', async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });

  try {
    const module = await vite.ssrLoadModule(
      '/services/pixi/boss-rigs/CampaignBossArtworkRegistry.ts'
    );
    for (const [orderText, expectation] of Object.entries(expectedPackages)) {
      const order = Number(orderText);
      const level = campaign.levels.find((candidate) => candidate.order === order);
      assert.ok(level, `Mission ${order} must exist`);
      const boss = level.waves
        .flatMap((wave) => wave.events)
        .find((event) => event.kind === 'boss');
      assert.ok(boss, `Mission ${order} must contain a boss`);
      assert.equal(boss.bossId, expectation.bossId);

      const artwork = module.resolveCampaignBossArtwork(
        campaign,
        level.id
      );
      assert.ok(artwork, `Mission ${order} must resolve promoted artwork`);
      assert.equal(artwork.eventId, boss.id);
      assert.equal(artwork.modularRig.manifest.id, expectation.rigId);
      assert.equal(typeof artwork.sampleModularPose, 'function');
      assert.match(
        artwork.url,
        new RegExp(`/campaign-packages/${expectation.bossId}/assembled\\.png$`)
      );
    }
  } finally {
    await vite.close();
  }
});
