const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const readSource = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const findCampaignLevel = (campaign, levelId) => {
  const level = campaign.levels.find((candidate) => candidate.id === levelId);
  assert.ok(level, `campaign stage ${levelId} exists`);
  return level;
};

const findCampaignWave = (campaign, waveId) => {
  const wave = campaign.levels
    .flatMap((level) => level.waves)
    .find((candidate) => candidate.id === waveId);
  assert.ok(wave, `campaign wave ${waveId} exists`);
  return wave;
};

const loadTypeScriptModule = (...segments) => {
  const filePath = path.join(root, ...segments);
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText;
  const loaded = { exports: {} };
  Function('exports', 'module', 'require', '__filename', '__dirname', output)(
    loaded.exports,
    loaded,
    require,
    filePath,
    path.dirname(filePath)
  );
  return loaded.exports;
};

test('custom formation templates stay normalized, unique, and reversible', () => {
  const workshop = loadTypeScriptModule('director', 'src', 'combat-lab', 'formationWorkshopModel.ts');

  assert.ok(workshop.FORMATION_TEMPLATES.length >= 8);
  workshop.FORMATION_TEMPLATES.forEach((template) => {
    assert.ok(template.slots.length >= 2 && template.slots.length <= 48, template.id);
    const positions = new Set();
    template.slots.forEach((slot) => {
      assert.ok(slot.x >= 0.06 && slot.x <= 0.94, `${template.id} x safe zone`);
      assert.ok(slot.y >= 0.08 && slot.y <= 0.46, `${template.id} y safe zone`);
      positions.add(`${slot.x.toFixed(4)}:${slot.y.toFixed(4)}`);
    });
    assert.equal(positions.size, template.slots.length, `${template.id} has no overlapping slots`);

    const mirroredTwice = workshop.mirrorFormationSlots(workshop.mirrorFormationSlots(template.slots));
    assert.deepEqual(mirroredTwice, template.slots, `${template.id} can be mirrored without drift`);
    assert.ok(workshop.minimumFormationSpacing(template.slots, { width: 390, height: 844 }) > 0);
  });
});

test('shared schema and both validators recognize the same optional formation slot contract', () => {
  const types = readSource('game-config', 'types.ts');
  const browserValidator = readSource('game-config', 'validate.ts');
  const serverValidator = readSource('director', 'server', 'gameCampaignValidation.mjs');

  assert.match(types, /export interface FormationSlot\s*{\s*x: number;\s*y: number;/s);
  assert.match(types, /formationSlots\?: FormationSlot\[\]/);
  [browserValidator, serverValidator].forEach((source) => {
    assert.match(source, /formationSlots/);
    assert.match(source, /0\.06/);
    assert.match(source, /0\.94/);
    assert.match(source, /0\.08/);
    assert.match(source, /0\.46/);
    assert.match(source, /48/);
  });
});

test('the shared engine consumes authored slots before falling back to built-in formations', () => {
  const runtime = readSource('services', 'gameLogic.ts');
  const start = runtime.indexOf('  getConfiguredFormationTarget(\n');
  const end = runtime.indexOf('  getConfiguredSpawnPoint(', start);
  const targetFunction = runtime.slice(start, end);

  assert.ok(start >= 0 && end > start, 'configured formation target function remains available');
  assert.match(targetFunction, /const authoredSlot = event\.formationSlots\?\.\[index\]/);
  assert.match(targetFunction, /authoredSlot\.x \* this\.width/);
  assert.match(targetFunction, /authoredSlot\.y \* this\.height/);
  assert.ok(
    targetFunction.indexOf('const authoredSlot') < targetFunction.indexOf('resolveConfiguredFormationMode'),
    'authored coordinates take precedence over the legacy pattern layout'
  );
});

test('clean wave authoring creates one valid opening formation beyond wave five', () => {
  const campaign = JSON.parse(readSource('game-config', 'campaign.json'));
  const operations = loadTypeScriptModule('director', 'src', 'editor', 'editorOperations.ts');
  const sourceWave = findCampaignWave(campaign, 'bastion-protocol-crownclaw');
  const originalSource = structuredClone(sourceWave);
  const nextOrder = sourceWave.order + 1;
  const starter = operations.createStarterWave(sourceWave, nextOrder);

  assert.ok(nextOrder > 5);
  assert.equal(starter.name, `New Wave ${nextOrder}`);
  assert.equal(starter.order, nextOrder);
  assert.notEqual(starter.id, sourceWave.id);
  assert.equal(starter.events.length, 1, 'new wave starts clean instead of cloning every encounter');
  assert.equal(starter.events[0].kind, 'spawn');
  assert.equal(starter.events[0].label, 'Opening formation');
  assert.equal(starter.events[0].startSeconds, 0);
  assert.ok(
    Math.max(0, starter.events[0].count - 1) * starter.events[0].spawnIntervalSeconds
      <= starter.events[0].durationSeconds,
    'the opening formation can finish spawning inside its authored duration'
  );
  assert.ok(starter.events[0].durationSeconds <= starter.durationSeconds);
  assert.deepEqual(sourceWave, originalSource, 'creating a wave never mutates the selected source');
});

test('clean mission authoring retains presentation choices but resets gameplay goals', () => {
  const campaign = JSON.parse(readSource('game-config', 'campaign.json'));
  const operations = loadTypeScriptModule('director', 'src', 'editor', 'editorOperations.ts');
  const source = findCampaignLevel(campaign, 'operation-open-galaxy');
  const originalSource = structuredClone(source);
  const starter = operations.createStarterLevel(source, 2);

  assert.equal(starter.name, 'New Mission 2');
  assert.equal(starter.order, 2);
  assert.notEqual(starter.id, source.id);
  assert.equal(starter.startingDifficulty, 1);
  assert.equal(starter.scoreTarget, 0);
  assert.equal(starter.durationSeconds, null);
  assert.equal(starter.loopWaves, false);
  assert.equal(starter.backgroundId, source.backgroundId);
  assert.equal(starter.musicId, source.musicId);
  assert.deepEqual(starter.availablePowerupIds, source.availablePowerupIds);
  assert.deepEqual(starter.scorecard, source.scorecard);
  assert.equal(starter.waves.length, 1);
  assert.equal(starter.waves[0].events.length, 1);
  assert.deepEqual(source, originalSource, 'creating a mission never mutates the selected source');
});
