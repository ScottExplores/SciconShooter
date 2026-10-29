const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, Array, Set, Map }
  );
  return moduleBox.exports;
};

test('portrait bosses stay inside the screen and pattern gaps stay readable', () => {
  const motion = loadTypeScriptModule('services/gameplay/serialQuietBeatMotion.ts');
  const patterns = loadTypeScriptModule('services/gameplay/bosses/BossPatternRuntime.ts');
  const span = motion.serialQuietBeatHorizontalSpan(412, 338);
  assert.ok(span.minX >= 0, span);
  assert.ok(span.maxX + 338 <= 412, span);

  const wall = patterns.resolveBossWeaveWallLayout(390, true, 1);
  const gap = wall.safeGapRightX - wall.safeGapLeftX;
  assert.ok(gap + 0.01 >= patterns.bossPatternSafeGapPixels(), `gap ${gap}`);
});

test('Nullwake phase 1 survives the opening of the health bar', () => {
  const { resolveBossPhaseConfig } = loadTypeScriptModule('services/bossPhaseConfig.ts');
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.bossId === 'nullwake-revenant');
  const opening = resolveBossPhaseConfig(2500, 2500, event.phases, event.weapons);
  const stillOpening = resolveBossPhaseConfig(2000, 2500, event.phases, event.weapons);
  const crown = resolveBossPhaseConfig(1200, 2500, event.phases, event.weapons);
  assert.equal(opening.phaseId, 'sandbox-nullwake-borrowed-charge');
  assert.equal(stillOpening.phaseId, 'sandbox-nullwake-borrowed-charge');
  assert.equal(crown.phaseId, 'sandbox-nullwake-backplane-crown');
  assert.ok(event.phases[1].triggerHealthRatio <= 0.7);
});
