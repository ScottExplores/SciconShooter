const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const campaign = JSON.parse(read('game-config/campaign.json'));

const spaceRuns = [
  {
    backgroundId: 'helix-redline',
    label: 'Helix Redline',
    assetKey: 'PIXI_SPACE_RUN_HELIX_REDLINE_PROPS',
    assetPath: '/game-art/generated/backgrounds/scicon-space-runs-v1/helix-redline/landmarks-atlas-3x3.png',
    firstStage: 6,
    lastStage: 7
  },
  {
    backgroundId: 'shattered-void',
    label: 'Shattered Void',
    assetKey: 'PIXI_SPACE_RUN_SHATTERED_VOID_PROPS',
    assetPath: '/game-art/generated/backgrounds/scicon-space-runs-v1/shattered-void/landmarks-atlas-3x3.png',
    firstStage: 8,
    lastStage: 11
  },
  {
    backgroundId: 'gravity-rift',
    label: 'Gravity Rift',
    assetKey: 'PIXI_SPACE_RUN_GRAVITY_RIFT_PROPS',
    assetPath: '/game-art/generated/backgrounds/scicon-space-runs-v1/gravity-rift/landmarks-atlas-3x3.png',
    firstStage: 12,
    lastStage: 14
  },
  {
    backgroundId: 'ion-eclipse',
    label: 'Ion Eclipse',
    assetKey: 'PIXI_SPACE_RUN_ION_ECLIPSE_PROPS',
    assetPath: '/game-art/generated/backgrounds/scicon-space-runs-v1/ion-eclipse/landmarks-atlas-3x3.png',
    firstStage: 15,
    lastStage: 17
  },
  {
    backgroundId: 'terminus-frontier',
    label: 'Terminus Frontier',
    assetKey: 'PIXI_SPACE_RUN_TERMINUS_FRONTIER_PROPS',
    assetPath: '/game-art/generated/backgrounds/scicon-space-runs-v1/terminus-frontier/landmarks-atlas-3x3.png',
    firstStage: 18,
    lastStage: 20
  }
];

test('campaign revision 19 maps stages and every internal wave to five continuous space runs', () => {
  assert.equal(campaign.revision, 19);
  assert.deepEqual(
    campaign.levels.slice(0, 5).map((level) => level.backgroundId),
    ['open-orbit', 'citation-storm', 'paywall-siege', 'open-galaxy', 'bastion-protocol']
  );

  for (const run of spaceRuns) {
    for (let order = run.firstStage; order <= run.lastStage; order += 1) {
      const level = campaign.levels.find((candidate) => candidate.order === order);
      assert.ok(level, `Stage ${order} exists`);
      assert.equal(level.backgroundId, run.backgroundId, `Stage ${order} uses ${run.backgroundId}`);
      assert.ok(level.waves.length > 0, `Stage ${order} contains waves`);
      assert.ok(
        level.waves.every((wave) => wave.backgroundId === run.backgroundId),
        `Every wave in Stage ${order} uses ${run.backgroundId}`
      );
    }
  }
});

test('space-run constants and catalogs expose exact curated background paths', () => {
  const constants = read('constants.ts');
  const types = read('game-config/types.ts');
  const catalog = read('game-config/catalog.ts');

  for (const run of spaceRuns) {
    assert.ok(constants.includes(`${run.assetKey}: "${run.assetPath}"`), `${run.assetKey} resolves to its atlas`);
    assert.ok(
      fs.existsSync(path.join(root, 'public', run.assetPath.slice(1))),
      `${run.label} atlas exists at its catalog path`
    );
    const atlas = fs.readFileSync(path.join(root, 'public', run.assetPath.slice(1)));
    assert.equal(atlas.subarray(1, 4).toString('ascii'), 'PNG', `${run.label} atlas is a PNG`);
    assert.equal(atlas.readUInt32BE(16), 768, `${run.label} atlas is exactly three 256px columns`);
    assert.equal(atlas.readUInt32BE(20), 768, `${run.label} atlas is exactly three 256px rows`);
    assert.equal(atlas[25], 6, `${run.label} atlas preserves RGBA transparency`);
    assert.ok(types.includes(`| '${run.assetKey}'`), `${run.assetKey} is a built-in asset key`);
    assert.ok(types.includes(`| '${run.backgroundId}'`), `${run.backgroundId} is a BackgroundId`);
    assert.ok(
      catalog.includes(`${run.assetKey}: asset('${run.assetKey}', '${run.label} landmarks', ASSETS.${run.assetKey}, ['background'])`),
      `${run.assetKey} is registered for the background role`
    );
    assert.ok(
      catalog.includes(`'${run.backgroundId}': { id: '${run.backgroundId}', label: '${run.label}', layerAssetKeys: [...commonBackgroundLayers, '${run.assetKey}']`),
      `${run.backgroundId} adds its own landmark atlas`
    );
  }
});

test('browser, Director server, and Director editor recognize the same background IDs', async () => {
  const browserValidator = read('game-config/validate.ts');
  const directorValidator = read('director/server/gameCampaignValidation.mjs');
  const directorEditor = read('director/src/editor/EditorInspector.tsx');

  assert.match(browserValidator, /checkCatalogRef\(candidate\.backgroundId, BACKGROUND_CATALOG/);
  for (const run of spaceRuns) {
    assert.ok(directorValidator.includes(`'${run.backgroundId}'`), `Director server recognizes ${run.backgroundId}`);
    assert.ok(directorValidator.includes(`'${run.assetKey}'`), `Director server recognizes ${run.assetKey}`);
    assert.ok(
      directorEditor.includes(`{ value: '${run.backgroundId}', label: '${run.label}' }`),
      `Director editor lists ${run.label}`
    );
  }

  const validatorUrl = pathToFileURL(path.join(root, 'director/server/gameCampaignValidation.mjs')).href;
  const { validateGameCampaign } = await import(validatorUrl);
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });

  const invalid = structuredClone(campaign);
  invalid.levels[5].backgroundId = 'unknown-space-run';
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/backgroundId')));
});
