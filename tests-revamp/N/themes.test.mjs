import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export * from './services/revamp/backgrounds/themes'; export * from './services/revamp/backgrounds/layout';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const backgrounds = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const campaign = JSON.parse(await readFile(new URL('../../game-config/campaign.json', import.meta.url), 'utf8'));
const { BACKGROUND_THEMES, resolveMissionBackdrop, createMissionBackdropLayout, createBackdropRandom, hashBackdropSeed } = backgrounds;

test('ten distinct low-exposure themes cover the real campaign sector identities', () => {
  assert.equal(BACKGROUND_THEMES.length, 10);
  assert.deepEqual(new Set(BACKGROUND_THEMES.map(theme => theme.sectorId)), new Set(campaign.sectors.map(sector => sector.id)));
  assert.equal(new Set(BACKGROUND_THEMES.map(theme => theme.signature)).size, 10);
  assert.equal(new Set(BACKGROUND_THEMES.map(theme => JSON.stringify(theme.palette))).size, 10);
  for (const theme of BACKGROUND_THEMES) {
    for (const key of ['ink', 'base', 'nebula']) {
      const color = theme.palette[key];
      assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
      assert.ok(Math.max(color >>> 16, (color >>> 8) & 255, color & 255) < 85, `${theme.name}/${key}: large planes remain dark`);
    }
    assert.ok(!Object.values(theme.palette).includes(0xffffff), 'background never claims projectile white');
  }
});

test('every authored mission and alternate graph route resolves to its actual sector', () => {
  for (const sector of campaign.sectors) {
    sector.missionIds.forEach((id, index) => {
      const selection = resolveMissionBackdrop(campaign, id);
      assert.equal(selection?.sectorId, sector.id, id);
      assert.equal(selection?.missionIndex, index);
      assert.equal(selection?.isBranch, false);
    });
  }
  for (const node of campaign.campaignGraph.nodes) {
    const byMission = resolveMissionBackdrop(campaign, node.missionDefinitionId);
    const byNode = resolveMissionBackdrop(campaign, node.nodeId);
    assert.equal(byMission?.sectorId, node.sectorId, node.nodeId);
    assert.deepEqual(byNode, byMission, 'graph node aliases produce the same recipe');
  }
  for (const branch of campaign.campaignBranches) {
    const source = resolveMissionBackdrop(campaign, branch.sourceMissionId);
    const selection = resolveMissionBackdrop(campaign, branch.missionDefinitionId);
    assert.equal(selection?.sectorId, source?.sectorId, branch.branchId);
    assert.equal(selection?.isBranch, true);
    assert.notEqual(selection?.seed, source?.seed);
    assert.deepEqual(resolveMissionBackdrop(campaign, branch.branchId), selection);
  }
});

test('unknown special and unmapped weekly missions retain their authored fallback', () => {
  assert.equal(resolveMissionBackdrop(campaign, undefined), null);
  assert.equal(resolveMissionBackdrop(campaign, 'weekly-unmapped-2026-W42'), null);
  assert.equal(resolveMissionBackdrop({ levels: [], sectors: [] }, 'any-level'), null);
  const unknown = structuredClone(campaign);
  unknown.sectors[0].id = 'new-unmapped-sector';
  assert.equal(resolveMissionBackdrop(unknown, unknown.sectors[0].missionIds[0]), null);
});

test('layouts and private RNG are stable without consuming gameplay randomness', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Backgrounds consumed gameplay randomness'); };
  try {
    assert.equal(hashBackdropSeed('hello'), 0x4f9f2cab, 'FNV-1a reference vector');
    const a = createBackdropRandom(123);
    const b = createBackdropRandom(123);
    for (let i = 0; i < 100; i += 1) {
      const value = a();
      assert.equal(value, b());
      assert.ok(value >= 0 && value < 1);
    }
    for (const level of campaign.levels) {
      const selection = resolveMissionBackdrop(campaign, level.id);
      if (!selection) continue;
      const layout = createMissionBackdropLayout(selection);
      assert.deepEqual(layout, createMissionBackdropLayout(selection), level.id);
      assert.ok(layout.planets.length <= 1);
      for (const item of [...layout.nebulae, ...layout.signatures, ...layout.planets, ...layout.debris]) {
        assert.ok(item.x >= 0 && item.x <= 1, `${level.id}: normalized x`);
        assert.ok(item.y >= 0 && item.y <= 1, `${level.id}: normalized y`);
        assert.ok(item.scale > 0 && item.scale < 1.5);
      }
      for (const item of [...layout.signatures, ...layout.debris]) assert.ok(item.x < 0.25 || item.x > 0.75, 'detail stays out of central attack lane');
      assert.ok(layout.setPieces[0].atSeconds >= 5 && layout.setPieces[0].atSeconds < 8);
      assert.ok(layout.setPieces[1].atSeconds >= 16 && layout.setPieces[1].atSeconds < 23);
    }
  } finally { Math.random = originalRandom; }
});

test('consecutive missions alternate structure side, silhouettes and events; planets stay rare', () => {
  let planetMissions = 0;
  let total = 0;
  const planetKinds = new Set();
  for (const sector of campaign.sectors) {
    let previous;
    for (const id of sector.missionIds) {
      const selection = resolveMissionBackdrop(campaign, id);
      const layout = createMissionBackdropLayout(selection);
      total += 1;
      planetMissions += layout.planets.length;
      layout.planets.forEach(planet => planetKinds.add(planet.kind));
      if (previous) {
        assert.notEqual(layout.seed, previous.seed);
        assert.notEqual(layout.variant, previous.variant);
        assert.notEqual(layout.signatures[0].x < 0.5, previous.signatures[0].x < 0.5);
        assert.notEqual(layout.setPieces[0].kind, previous.setPieces[0].kind);
        assert.notEqual(layout.setPieces[0].atSeconds, previous.setPieces[0].atSeconds);
      }
      previous = layout;
    }
  }
  assert.ok(planetMissions <= total / 3, 'planets are occasional landmarks, not the repeated subject');
  assert.equal(planetKinds.size, 4, 'ringed, cratered, gas and shattered worlds all occur');
});

test('graph order and campaign revision do not shuffle a mission backdrop', () => {
  const reordered = structuredClone(campaign);
  reordered.campaignGraph.nodes.reverse();
  reordered.campaignBranches.reverse();
  reordered.levels.reverse();
  reordered.revision += 1;
  for (const node of campaign.campaignGraph.nodes) {
    assert.deepEqual(resolveMissionBackdrop(reordered, node.missionDefinitionId), resolveMissionBackdrop(campaign, node.missionDefinitionId));
  }
});
