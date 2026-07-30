const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HELIOS_ASSET_KEY = 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER';
const HELIOS_ASSET_URL = '/game-art/generated/bosses/helios-clawcarrier/helios-clawcarrier-neutral.png';
const HELIOS_ASSET_PATH = path.join(root, 'public', HELIOS_ASSET_URL.replace(/^\//, ''));

const executeTypeScriptModule = (relativePath) => {
  const source = read(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, exports: moduleBox.exports, Math, Number }
  );
  return { source, ...moduleBox.exports };
};

test('M25 Helios art stays aligned across Campaign, constants, catalog, and record cards', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const constants = read('constants.ts');
  const catalog = read('game-config/catalog.ts');
  const recordCard = read('api/record-card.js');
  const mission = campaign.levels.find((level) => level.order === 25);
  const bossEvents = mission.waves
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss');

  assert.equal(bossEvents.length, 1);
  assert.equal(bossEvents[0].bossId, 'helios-clawcarrier');
  assert.equal(bossEvents[0].rigId, 'crown-claw');
  assert.equal(bossEvents[0].spriteKey, HELIOS_ASSET_KEY);
  assert.equal(mission.scorecard.encounterAssetKey, HELIOS_ASSET_KEY);

  assert.match(
    constants,
    new RegExp(`${HELIOS_ASSET_KEY}:\\s*"${escapeRegExp(HELIOS_ASSET_URL)}"`)
  );
  assert.match(
    catalog,
    new RegExp(`${HELIOS_ASSET_KEY}: asset\\('${HELIOS_ASSET_KEY}'[^\\n]+ASSETS\\.${HELIOS_ASSET_KEY}`)
  );
  assert.match(
    catalog,
    /'helios-clawcarrier':\s*\{[\s\S]*?defaultSpriteKey:\s*'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER'/
  );
  assert.match(
    recordCard,
    new RegExp(`${HELIOS_ASSET_KEY}:\\s*'${escapeRegExp(HELIOS_ASSET_URL)}'`)
  );
});

test('the promoted Helios asset is a non-empty PNG in the production public tree', () => {
  assert.equal(fs.existsSync(HELIOS_ASSET_PATH), true);
  const image = fs.readFileSync(HELIOS_ASSET_PATH);

  assert.ok(image.length > 1024, 'Helios art must not be an empty placeholder');
  assert.deepEqual(
    Array.from(image.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
});

test('Helios owns an immutable, non-rectangular generated alpha collision mask', () => {
  const masks = executeTypeScriptModule(
    'services/gameplay/bosses/generatedBossCollisionMasks.ts'
  );
  const mask = masks.getCampaignBossCollisionMask(HELIOS_ASSET_URL);

  assert.match(
    masks.source,
    new RegExp(`"${escapeRegExp(HELIOS_ASSET_URL)}"\\s*:\\s*Object\\.freeze`)
  );
  assert.ok(mask, 'the exact promoted Helios URL must resolve to a collision mask');
  assert.equal(mask.width, 64);
  assert.equal(mask.height, 64);
  assert.equal(mask.rowWords.length, 128);
  assert.ok(mask.rowWords.some((word) => word !== 0), 'the mask must contain opaque art');
  assert.ok(mask.rowWords.some((word) => word === 0), 'the mask must retain transparent sprite space');
  assert.equal(Object.isFrozen(mask), true);
  assert.equal(Object.isFrozen(mask.rowWords), true);
});

test('Pixi keeps promoted Helios standalone art ahead of the generic Crownclaw rig', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const standaloneHelperStart = renderer.indexOf('const usesStandaloneBossArt');
  const standaloneHelperEnd = renderer.indexOf('export interface PixiGameRendererOptions', standaloneHelperStart);
  const standaloneHelper = renderer.slice(standaloneHelperStart, standaloneHelperEnd);
  const drawStart = renderer.indexOf('private drawBossComponents');
  const standaloneBranch = renderer.indexOf('if (usesStandaloneBossArt(', drawStart);
  const crownClawBranch = renderer.indexOf("if (entity.bossRigId === 'crown-claw')", drawStart);
  const setupAndStandaloneBranch = renderer.slice(drawStart, crownClawBranch);

  assert.ok(standaloneHelperStart >= 0);
  assert.match(
    standaloneHelper,
    /entity\.spriteUrl === ASSETS\.CAMPAIGN_BOSS_HELIOS_CLAWCARRIER/
  );
  assert.ok(standaloneBranch > drawStart);
  assert.ok(
    standaloneBranch < crownClawBranch,
    'standalone art must return before crown-claw component artwork can replace it'
  );
  assert.match(setupAndStandaloneBranch, /rig\.crownClaw\.root\.visible = false/);
  assert.match(
    setupAndStandaloneBranch,
    /if \(usesStandaloneBossArt\([\s\S]*?\)\) \{[\s\S]*?return;\s*\}/
  );
});
