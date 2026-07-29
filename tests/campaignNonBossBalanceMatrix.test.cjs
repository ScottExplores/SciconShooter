const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const artifactPath = path.join(root, 'artifacts', 'campaign-balance', 'nonboss-runtime-matrix.json');
const reportPath = path.join(root, 'docs', 'CAMPAIGN_NONBOSS_BALANCE_MATRIX.md');
const toolPath = path.join(root, 'tools', 'simulate-campaign-nonboss-balance.mjs');

const loadTool = () => import(pathToFileURL(toolPath).href);
const readArtifact = () => JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

test('checked-in non-boss runtime matrix covers every non-boss graph Mission and requested axis cell', async () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const artifact = readArtifact();
  const nonBossNodes = campaign.campaignGraph.nodes.filter((node) => {
    const level = campaign.levels.find(({ id }) => id === node.missionDefinitionId);
    return !node.bossId && level?.campaignProgression?.missionRole !== 'major-boss';
  });

  assert.equal(artifact.metadata.schemaVersion, 1);
  assert.equal(artifact.metadata.runtime, 'GameEngine');
  assert.equal(artifact.metadata.campaignRevision, campaign.revision);
  assert.equal(artifact.coverage.sectorCount, 10);
  assert.equal(artifact.coverage.nonBossMissionCount, 50);
  assert.equal(artifact.coverage.mainPathMissionCount, 40);
  assert.equal(artifact.coverage.routeAlternativeCount, 10);
  assert.deepEqual(artifact.coverage.tierIds, ['low', 'expected', 'upgraded']);
  assert.deepEqual(artifact.coverage.supportIds, ['none', 'paired']);
  assert.deepEqual(artifact.coverage.viewportIds, ['mobile', 'desktop']);
  assert.equal(artifact.summary.attempts, 600);
  assert.equal(artifact.results.length, 600);
  assert.deepEqual(
    new Set(artifact.results.map(({ missionId }) => missionId)),
    new Set(nonBossNodes.map(({ missionDefinitionId }) => missionDefinitionId))
  );
  assert.equal(new Set(artifact.results.map((row) => (
    `${row.missionId}:${row.tier}:${row.support}:${row.viewport}`
  ))).size, 600);
  assert.equal(artifact.detailedCheckpoints.filter(({ missionLabel }) => missionLabel === 'M2').length, 12);
  assert.equal(artifact.detailedCheckpoints.filter(({ missionLabel }) => missionLabel === 'M7').length, 12);

  const clearCount = (tier, support, viewport) => artifact.results.filter((row) => (
    row.tier === tier
    && row.support === support
    && row.viewport === viewport
    && row.outcome === 'clear'
  )).length;
  assert.ok(clearCount('expected', 'paired', 'mobile') >= 40);
  assert.ok(clearCount('expected', 'paired', 'desktop') >= 40);
  assert.ok(clearCount('upgraded', 'paired', 'mobile') >= 45);
  assert.ok(clearCount('upgraded', 'paired', 'desktop') >= 45);
  assert.equal(artifact.results.filter((row) => (
    ['M2', 'M7'].includes(row.missionLabel)
    && row.tier === 'expected'
    && row.support === 'paired'
    && row.outcome !== 'clear'
  )).length, 0);
  assert.equal(artifact.findings.zeroClearMissionLabels.length, 0);
  assert.equal(artifact.findings.powerInversionMissionLabels.length, 0);
  assert.equal(artifact.findings.supportInversionMissionLabels.length, 0);
  assert.equal(artifact.findings.projectileCeilingBreaches, 0);
  assert.equal(artifact.findings.performanceModeCells, 0);
  assert.ok(artifact.summary.maximumHostileProjectiles <= 80);
  assert.ok(Math.max(...artifact.results
    .filter(({ viewport }) => viewport === 'mobile')
    .map(({ maximumPerformanceBudgetRatio }) => maximumPerformanceBudgetRatio)) <= 1);
  assert.ok(artifact.results.some((row) => (
    row.tier === 'low' && row.support === 'none' && row.outcome !== 'clear'
  )));

  for (const row of artifact.results) {
    assert.ok(['clear', 'death', 'timeout'].includes(row.outcome));
    assert.ok(Number.isFinite(row.damage) && row.damage >= 0);
    assert.ok(Number.isFinite(row.coinsCollected) && row.coinsCollected >= 0);
    assert.ok(Number.isFinite(row.weeklyPoints) && row.weeklyPoints >= 0);
    assert.ok(Number.isInteger(row.bombsUsed) && row.bombsUsed >= 0);
    assert.ok(Number.isInteger(row.abilitiesUsed) && row.abilitiesUsed >= 0);
    assert.equal(typeof row.damageSourceCounts, 'object');
    assert.ok(Array.isArray(row.damageEvents));
    assert.ok(row.damageEvents.length <= 12);
    assert.ok(Number.isFinite(row.maximumHostileProjectiles) && row.maximumHostileProjectiles >= 0);
    assert.ok(Number.isFinite(row.maximumActiveEntities) && row.maximumActiveEntities >= 0);
    assert.ok(Number.isFinite(row.maximumPerformanceBudgetRatio) && row.maximumPerformanceBudgetRatio >= 0);
    if (row.outcome === 'clear') {
      assert.equal(row.deathWave, null);
      assert.ok(row.weeklyPoints > 0);
    }
    if (row.outcome === 'death') assert.ok(Number.isInteger(row.deathWave));
  }
});

test('non-boss matrix artifact and Markdown remain tied to the current runtime source digest', async () => {
  const artifact = readArtifact();
  const tool = await loadTool();
  assert.equal(artifact.metadata.sourceDigest, tool.computeCampaignNonBossSourceDigest(root));
  assert.equal(
    fs.readFileSync(reportPath, 'utf8'),
    tool.renderCampaignNonBossBalanceMarkdown(artifact)
  );
  assert.doesNotMatch(fs.readFileSync(reportPath, 'utf8'), /Ã¢|Â·|ï¿½/);
});

test('focused M2/M7 smoke executes actual GameEngine runtime rather than config-only analysis', () => {
  const stdout = childProcess.execFileSync(
    process.execPath,
    [
      toolPath,
      '--missions=2,7',
      '--tiers=expected',
      '--supports=none',
      '--viewports=mobile',
      '--json'
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  );
  const runtime = JSON.parse(stdout);
  assert.equal(runtime.metadata.runtime, 'GameEngine');
  assert.equal(runtime.summary.attempts, 2);
  assert.deepEqual(runtime.missionSummaries.map(({ missionLabel }) => missionLabel), ['M2', 'M7']);
  assert.equal(runtime.results.every(({ maximumActiveEntities }) => maximumActiveEntities > 0), true);
  assert.equal(runtime.results.every(({ wavesCleared }) => wavesCleared >= 0), true);
});
