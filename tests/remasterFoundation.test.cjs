const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (...segments) => {
  const filePath = path.join(root, ...segments);
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object, String }
  );
  return module.exports;
};

test('campaign combat scales stay gentle and weekly intensity stays linear', () => {
  const scales = loadTypeScriptModule(
    'services',
    'gameplay',
    'difficulty',
    'CampaignCombatScale.ts'
  );
  const late = scales.resolveCampaignCombatScales(2.09);
  assert.ok(late.durability < 1.5);
  assert.ok(late.pressure <= 1.28);
  assert.ok(late.hazard <= 1.2);
  const major = scales.resolveCombatScales({
    difficulty: 2.09,
    eventId: 'stage-crownclaw-frontier-commander-major-boss'
  });
  assert.equal(major.durability, 1);
  assert.equal(major.pressure, 1);
  assert.equal(major.hazard, 1);
  assert.equal(scales.resolveCombatScales({
    difficulty: 3.4,
    levelId: 'weekly-run-stage-12'
  }).durability, 3.4);
});

test('fair arena is the same world on a phone and a desktop window', () => {
  const arena = loadTypeScriptModule('services', 'gameplay', 'fairArena.ts');
  const phone = arena.resolveFairArenaFrame(390, 844);
  const desktop = arena.resolveFairArenaFrame(1440, 900);
  assert.equal(phone.worldWidth, 390);
  assert.equal(phone.worldHeight, 844);
  assert.equal(desktop.worldWidth, phone.worldWidth);
  assert.equal(desktop.worldHeight, phone.worldHeight);
  assert.ok(desktop.scale < 1.2);
  assert.ok(desktop.offsetX > 0 || desktop.offsetY > 0);
});

test('unspecified squadrons rotate through existing swoop paths', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const base = formations.resolveFormationChoreography({
    id: 'loose-v',
    patternId: 'v'
  });
  const varied = formations.applyGalagaEntryVariety('loose-v', 'v', base);
  assert.ok(['paired-flank', 'mirrored-swoop', 'sweep-bank-reentry'].includes(varied.entryPathId));
  const repeated = formations.applyGalagaEntryVariety('loose-v', 'v', base);
  assert.equal(repeated.entryPathId, varied.entryPathId);
  const authored = formations.resolveFormationChoreography({
    id: 'authored',
    patternId: 'v',
    formationBehavior: { entryPathId: 'formation-drop' }
  });
  assert.equal(authored.entryPathId, 'formation-drop');
});

test('weekly funding approval never transfers and cannot skip the admin gate', () => {
  const approval = require('../shared/weeklyFundingApproval');
  const claimed = {
    status: 'claimed',
    week_key: '2026-W42',
    proposal_id: 'rh-1',
    proposal_title: 'Open replication',
    winner_run_id: 'run-1',
    winner_wallet: '0xabc',
    allocation_rsc: 1000
  };
  assert.throws(() => approval.recordManualFundingTransfer(claimed, `0x${'ab'.repeat(32)}`), /approved/);
  const approved = approval.approveClaimedSelection(claimed);
  assert.equal(approved.patch.status, 'pending-funding');
  assert.equal(approved.patch.allocation_tx_hash, null);
  const pending = { ...claimed, status: 'pending-funding' };
  assert.throws(() => approval.recordManualFundingTransfer(pending, 'not-a-hash'), /transaction hash/);
  const recorded = approval.recordManualFundingTransfer(pending, `0x${'ab'.repeat(32)}`);
  assert.equal(recorded.patch.status, 'funded');
  assert.match(recorded.patch.allocation_tx_hash, /^0x[a-f0-9]{64}$/i);
});
