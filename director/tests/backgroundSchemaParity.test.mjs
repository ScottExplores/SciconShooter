import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { validateGameCampaign as validateServerCampaign } from '../server/gameCampaignValidation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const load = (entry) => {
  const result = buildSync({ entryPoints: [path.join(root, entry)], bundle: true,
    platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};
const { BACKGROUND_CATALOG, ASSET_CATALOG } = load('game-config/catalog.ts');
const { validateGameCampaign: validateBrowserCampaign } = load('game-config/validate.ts');
const campaign = JSON.parse(readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));

test('Director and browser accept every catalog background at theme, Mission, and Wave boundaries', () => {
  for (const backgroundId of Object.keys(BACKGROUND_CATALOG)) {
    const candidate = structuredClone(campaign);
    candidate.visualThemes[0].backgroundId = backgroundId;
    candidate.levels[0].backgroundId = backgroundId;
    candidate.levels[0].waves[0].backgroundId = backgroundId;
    const server = validateServerCampaign(candidate);
    const browser = validateBrowserCampaign(candidate);
    assert.equal(server.valid, true, `${backgroundId}: ${server.errors.join('\n')}`);
    assert.equal(browser.valid, true, `${backgroundId}: ${JSON.stringify(browser.issues)}`);
  }
});

test('background schema parity still rejects an unregistered background', () => {
  const candidate = structuredClone(campaign);
  candidate.visualThemes[0].backgroundId = 'unregistered-background';
  candidate.levels[0].backgroundId = 'unregistered-background';
  candidate.levels[0].waves[0].backgroundId = 'unregistered-background';
  const server = validateServerCampaign(candidate);
  const browser = validateBrowserCampaign(candidate);
  assert.equal(server.valid, false);
  assert.equal(browser.valid, false);
  for (const location of ['/visualThemes/0/backgroundId', '/levels/0/backgroundId', '/levels/0/waves/0/backgroundId']) {
    assert.ok(server.errors.some((error) => error.startsWith(location)), location);
    assert.ok(browser.issues.some((issue) => issue.path === location), location);
  }
});

test('new background layer assets are registered in both built-in catalogs without broadening sprite roles', () => {
  const source = readFileSync(path.join(root, 'director/server/gameCampaignValidation.mjs'), 'utf8');
  const builtIns = source.slice(source.indexOf('const BUILT_IN_ASSET_KEYS = ['), source.indexOf('const GENERATED_ASSET_ID_PATTERN'));
  const expected = ['PIXI_BREAKWATER_FAR', 'PIXI_BREAKWATER_APPROACH', 'PIXI_BREAKWATER_WRECKFIELD', 'PIXI_BREAKWATER_GATE'];
  const layerKeys = new Set(Object.values(BACKGROUND_CATALOG)
    .filter((background) => background.id.startsWith('breakwater-'))
    .flatMap((background) => background.layerAssetKeys));
  assert.deepEqual([...layerKeys].sort(), [...expected].sort());
  for (const key of expected) {
    assert.ok(builtIns.includes(`'${key}'`), `${key} is a Director built-in`);
    assert.deepEqual(ASSET_CATALOG[key].roles, ['background']);
  }
});
