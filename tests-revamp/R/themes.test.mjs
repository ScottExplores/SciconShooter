import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export * from './services/revamp/theme/WorldTheme'; export * from './services/revamp/theme/themeUi'; export * from './services/revamp/theme/WorldBackdrop'; export { resolveMissionBackdrop } from './services/revamp/backgrounds/themes';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const theme = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const campaign = JSON.parse(await readFile(new URL('../../game-config/campaign.json', import.meta.url), 'utf8'));
const { WORLD_THEMES, WEEKLY_THEME, getWorldTheme, getSectorTheme, worldThemeStyle, applyWorldTheme } = theme;

function luminance(color) {
  const linear = [color >>> 16, (color >>> 8) & 255, color & 255].map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

test('all actual campaign sectors receive distinct immutable world identities derived from N', () => {
  assert.equal(WORLD_THEMES.length, 10);
  assert.deepEqual(new Set(WORLD_THEMES.map(item => item.sectorId)), new Set(campaign.sectors.map(item => item.id)));
  assert.equal(new Set(WORLD_THEMES.map(item => item.accent)).size, 10);
  for (const world of WORLD_THEMES) {
    assert.equal(getSectorTheme(world.sectorId), world);
    assert.equal(getSectorTheme(world.id), world);
    assert.ok(Object.isFrozen(world));
    assert.ok(Object.isFrozen(world.enemyPalette));
    assert.equal(world.glow, world.uiGlow);
    for (const field of ['accent','secondary','danger','uiGlow','pickupGlow','enemyDark','enemyMid','enemyLight']) {
      assert.ok(Number.isInteger(world[field]) && world[field] >= 0 && world[field] < 0xffffff, `${world.id}/${field}`);
    }
  }
});

test('mission, graph alias, boss and mastery branch share their authored sector palette', () => {
  for (const sector of campaign.sectors) {
    for (const id of sector.missionIds) assert.equal(getWorldTheme(campaign, id), getSectorTheme(sector.id), id);
  }
  for (const node of campaign.campaignGraph.nodes) {
    assert.equal(getWorldTheme(campaign, node.nodeId), getSectorTheme(node.sectorId), node.nodeId);
    assert.equal(getWorldTheme(campaign, node.missionDefinitionId), getSectorTheme(node.sectorId), node.missionDefinitionId);
  }
  for (const branch of campaign.campaignBranches) {
    assert.equal(getWorldTheme(campaign, branch.branchId), getWorldTheme(campaign, branch.sourceMissionId));
    assert.equal(getWorldTheme(campaign, branch.missionDefinitionId), getWorldTheme(campaign, branch.sourceMissionId));
  }
});

test('weekly broadcast overrides sampled campaign worlds without changing their palette', () => {
  for (const sector of campaign.sectors) {
    assert.equal(getWorldTheme(campaign, sector.missionIds[0], true), WEEKLY_THEME);
    assert.notEqual(getWorldTheme(campaign, sector.missionIds[0]), WEEKLY_THEME);
  }
  assert.ok(!WORLD_THEMES.some(item => item.accent === WEEKLY_THEME.accent));
  assert.equal(getSectorTheme('weekly-run'), WEEKLY_THEME);
  assert.equal(getWorldTheme(campaign, 'unmapped-level'), WORLD_THEMES[0]);
});

test('weekly scenery shares the broadcast palette and private stable seed; authored sector scenery is unchanged', () => {
  for (const level of campaign.levels) {
    assert.deepEqual(theme.resolveWorldBackdrop(campaign, level.id), theme.resolveMissionBackdrop(campaign, level.id));
  }
  const weekly = { ...campaign, id: 'weekly-run-2026-10-19' };
  const first = theme.resolveWorldBackdrop(weekly, 'weekly-run-stage-1');
  assert.equal(first.theme.palette, WEEKLY_THEME.palette);
  assert.equal(first.theme.id, WEEKLY_THEME.id);
  assert.equal(first.missionIndex, 0);
  assert.deepEqual(theme.resolveWorldBackdrop(weekly, 'weekly-run-stage-1'), first);
  const second = theme.resolveWorldBackdrop(weekly, 'weekly-run-stage-2');
  assert.notEqual(first.seed, second.seed); assert.notEqual(first.variant, second.variant);
  assert.equal(theme.resolveWorldBackdrop(campaign, 'unknown-scene'), null);
});

test('small text accents pass contrast on each world surface; enemy ramps preserve luminance order', () => {
  for (const world of [...WORLD_THEMES, WEEKLY_THEME]) {
    for (const field of ['accent','secondary','danger']) {
      const contrast = (luminance(world[field]) + .05) / (luminance(world.palette.base) + .05);
      assert.ok(contrast >= 4.5, `${world.id}/${field}: ${contrast}`);
    }
    assert.ok(luminance(world.enemyDark) < luminance(world.enemyMid));
    assert.ok(luminance(world.enemyMid) < luminance(world.enemyLight));
    assert.ok(luminance(world.enemyLight) < .8, 'projectile white remains brighter than energy details');
  }
});

test('style objects are cached; DOM adapter writes only theme attributes and custom properties', () => {
  const values = new Map();
  const element = { dataset: {}, style: { setProperty(key, value) { values.set(key, value); } } };
  for (const world of [...WORLD_THEMES, WEEKLY_THEME]) {
    const style = worldThemeStyle(world);
    assert.equal(worldThemeStyle(world), style);
    assert.ok(Object.isFrozen(style));
    applyWorldTheme(element, world);
    assert.equal(element.dataset.worldTheme, world.id);
    assert.deepEqual([...values.entries()], Object.entries(style));
    for (const [key, value] of Object.entries(style)) {
      assert.ok(key.startsWith('--world-'));
      assert.match(value, key.endsWith('-hue') ? /^-?\d+deg$/ : /^#[0-9a-f]{6}$/);
    }
  }
  assert.deepEqual(Object.keys(element.dataset), ['worldTheme']);
});

test('theme lookup consumes no gameplay randomness and leaves authored campaign untouched', () => {
  const initial = JSON.stringify(campaign);
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Theme touched gameplay RNG'); };
  try {
    for (const level of campaign.levels) {
      assert.equal(getWorldTheme(campaign, level.id), getWorldTheme(campaign, level.id));
      worldThemeStyle(getWorldTheme(campaign, level.id));
    }
  } finally { Math.random = originalRandom; }
  assert.equal(JSON.stringify(campaign), initial);
});
