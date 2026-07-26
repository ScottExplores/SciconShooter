const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const compilerUrl = pathToFileURL(path.join(root, 'game-config', 'compiler', 'index.mjs')).href;
const serverValidatorUrl = pathToFileURL(
  path.join(root, 'director', 'server', 'gameCampaignValidation.mjs')
).href;

const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const runtimeIds = (campaign) => campaign.levels.flatMap((mission) => [
  mission.id,
  ...mission.waves.flatMap((wave) => [
    wave.id,
    ...wave.events.map((event) => event.id)
  ])
]);

test('schema-v1 decompile and compile are byte-order and behavior preserving for the current campaign', async () => {
  const compiler = await import(compilerUrl);
  const { validateGameCampaign } = await import(serverValidatorUrl);
  const sourceText = fs.readFileSync(campaignPath, 'utf8');
  const campaign = JSON.parse(sourceText);
  const before = structuredClone(campaign);

  const contentPackage = compiler.decompileSchemaV1Campaign(campaign);
  assert.equal(contentPackage.missions.length, 20);
  assert.equal(contentPackage.waves.length, 62);
  assert.equal(contentPackage.bosses.length, 37);
  assert.equal(
    contentPackage.waves.reduce((count, wave) => count + wave.events.length, 0)
      + contentPackage.bosses.length,
    193
  );
  assert.deepEqual(compiler.diagnoseContentPackage(contentPackage), []);

  const compiled = compiler.compileContentPackage(contentPackage);
  assert.deepEqual(compiled, campaign);
  assert.equal(JSON.stringify(compiled), JSON.stringify(campaign));
  assert.deepEqual(runtimeIds(compiled), runtimeIds(campaign));
  assert.equal(compiler.hashJson(compiled), compiler.hashJson(campaign));
  assert.deepEqual(validateGameCampaign(compiled), { valid: true, errors: [] });
  assert.deepEqual(campaign, before, 'decompile and compile must not mutate the source object');
  assert.equal(fs.readFileSync(campaignPath, 'utf8'), sourceText, 'compiler APIs never write campaign.json');
});

test('explicit reference order makes compilation deterministic when resource arrays are shuffled', async () => {
  const compiler = await import(compilerUrl);
  const campaign = readCampaign();
  const contentPackage = compiler.decompileSchemaV1Campaign(campaign);
  const shuffled = structuredClone(contentPackage);
  shuffled.missions.reverse();
  shuffled.waves.reverse();
  shuffled.bosses.reverse();

  const first = compiler.compileContentPackage(contentPackage);
  const second = compiler.compileContentPackage(shuffled);
  assert.deepEqual(second, first);
  assert.equal(compiler.hashJson(second), compiler.hashJson(first));
  assert.equal(
    compiler.serializeCompiledCampaign(second),
    compiler.serializeCompiledCampaign(first)
  );
  assert.deepEqual(JSON.parse(compiler.serializeCompiledCampaign(second)), campaign);
  assert.deepEqual(
    compiler.decompileSchemaV1Campaign(campaign),
    compiler.decompileSchemaV1Campaign(campaign),
    'decompilation must not add clock- or filesystem-dependent fields'
  );
});

test('compiler diagnostics close references and reject duplicate or multiply owned IDs', async () => {
  const compiler = await import(compilerUrl);
  const baseline = compiler.decompileSchemaV1Campaign(readCampaign());

  const duplicateMission = structuredClone(baseline);
  duplicateMission.missions.push(structuredClone(duplicateMission.missions[0]));
  assert.ok(
    compiler.diagnoseContentPackage(duplicateMission)
      .some((item) => item.code === 'duplicate-resource-id' && item.path.startsWith('/missions/'))
  );

  const missingWave = structuredClone(baseline);
  const missingWaveId = missingWave.missions[0].waveIds[0];
  missingWave.waves = missingWave.waves.filter((wave) => wave.id !== missingWaveId);
  const missingWaveDiagnostics = compiler.diagnoseContentPackage(missingWave);
  assert.ok(missingWaveDiagnostics.some((item) => (
    item.code === 'missing-resource-reference' && item.message.includes(missingWaveId)
  )));

  const missingBoss = structuredClone(baseline);
  const removedBoss = missingBoss.bosses.shift();
  const missingBossDiagnostics = compiler.diagnoseContentPackage(missingBoss);
  assert.ok(missingBossDiagnostics.some((item) => (
    item.code === 'missing-resource-reference' && item.message.includes(removedBoss.id)
  )));

  const wrongParent = structuredClone(baseline);
  wrongParent.bosses[0].missionId = wrongParent.missions[1].id;
  assert.ok(
    compiler.diagnoseContentPackage(wrongParent)
      .some((item) => item.code === 'parent-mismatch' && item.message.includes(wrongParent.bosses[0].id))
  );

  const orphan = structuredClone(baseline);
  orphan.waves.push({
    schemaVersion: 1,
    kind: 'wave',
    id: 'orphan-compiler-wave',
    missionId: orphan.missions[0].id,
    payload: { id: 'orphan-compiler-wave' },
    eventIds: [],
    events: []
  });
  assert.ok(
    compiler.diagnoseContentPackage(orphan)
      .some((item) => item.code === 'orphan-resource' && item.message.includes('orphan-compiler-wave'))
  );

  assert.throws(
    () => compiler.compileContentPackage(missingWave),
    (error) => (
      error instanceof compiler.ContentPackageCompilationError
      && error.diagnostics.some((item) => item.code === 'missing-resource-reference')
    )
  );
});

test('schema-v1 migration rejects unsupported source shapes without partially converting them', async () => {
  const compiler = await import(compilerUrl);
  const unsupported = readCampaign();
  unsupported.schemaVersion = 2;
  assert.throws(
    () => compiler.decompileSchemaV1Campaign(unsupported),
    /campaign schemaVersion must be 1/
  );

  const incomplete = readCampaign();
  delete incomplete.levels[0].waves[0].events;
  assert.throws(
    () => compiler.decompileSchemaV1Campaign(incomplete),
    /events must be an array/
  );
});

test('game-content manifest remains an inactive package skeleton outside runtime authority', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'game-content', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    kind: 'scicon-game-content-package',
    status: 'inactive-foundation',
    authority: 'game-config/campaign.json',
    sourceCampaign: {
      path: 'game-config/campaign.json',
      schemaVersion: 1
    },
    resources: {
      missions: 'missions',
      waves: 'waves',
      bosses: 'bosses'
    },
    compiler: 'game-config/compiler/index.mjs'
  });

  const runtimeLoader = fs.readFileSync(path.join(root, 'services', 'levelConfig.ts'), 'utf8');
  assert.match(runtimeLoader, /game-config\/campaign\.json/);
  assert.doesNotMatch(runtimeLoader, /game-content/);
  assert.equal(fs.existsSync(path.join(root, 'game-content', 'missions')), false);
  assert.equal(fs.existsSync(path.join(root, 'game-content', 'waves')), false);
  assert.equal(fs.existsSync(path.join(root, 'game-content', 'bosses')), false);
});
