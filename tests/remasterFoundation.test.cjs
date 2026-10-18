const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// REVAMP(G): B's extracted formation modules execute with their real dependencies.
const { loadService } = require('./helpers/loadService.cjs');
const loadTypeScriptModule = (...segments) => loadService(path.join(root, ...segments));

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

test('sector signatures change by sector and stay stable for an event', () => {
  const sector = loadTypeScriptModule(
    'services',
    'gameplay',
    'enemyBehaviors',
    'sectorSignature.ts'
  );
  const first = sector.resolveSectorSignature(2, 'stage-wave-4', 0);
  const again = sector.resolveSectorSignature(2, 'stage-wave-4', 0);
  assert.equal(first, 'shielded');
  assert.equal(again, first);
  assert.equal(sector.resolveSectorSignature(5, 'stage-wave-4', 0), 'turret');
  assert.equal(sector.resolveSectorIndex('weekly-run-stage-7', 1), 7);
  assert.equal(sector.signatureAppliesTo('splitter', 'holder'), true);
  assert.equal(sector.signatureAppliesTo('splitter', 'diver'), false);
  const steered = sector.steerCommittedDive(0, 3.2, 10, 0);
  assert.ok(steered.vx > 0.5);
  assert.ok(steered.vy > 0);
});

test('untimed bosses change pattern by health and telegraph the fan', () => {
  const bosses = loadTypeScriptModule(
    'services',
    'gameplay',
    'bossEncounters',
    'untimedBossSupport.ts'
  );
  assert.equal(bosses.resolveUntimedBossBand(0.9), 0);
  assert.equal(bosses.resolveUntimedBossBand(0.5), 1);
  assert.equal(bosses.resolveUntimedBossBand(0.2), 2);
  assert.equal(bosses.untimedBossPatternLabel('paywall-decimator', 2), 'BREACH');
  assert.equal(bosses.untimedBossShouldSummon(0, 1), true);
  assert.equal(bosses.untimedBossShouldSummon(-1, 0), false);
  assert.equal(bosses.untimedBossWeakPointOpen(0, 50), false);
  assert.equal(bosses.untimedBossWeakPointOpen(1, 40), true);
  assert.equal(bosses.resolveUntimedFan(220), 'telegraph');
  assert.equal(bosses.resolveUntimedFan(244), 'fire');
  assert.equal(bosses.readableBossPhaseLabel('sandbox-moth-crystal-nursery'), 'CRYSTAL NURSERY');
});

test('midnight hour 24 rolls the weekly calendar forward one day', () => {
  const boundary = require('../shared/weeklyCompetitionBoundary');
  const rolled = boundary.normalizeZonedClockParts({
    year: 2026,
    month: 10,
    day: 18,
    hour: 24,
    minute: 0,
    second: 0,
    weekday: 'Sun'
  });
  assert.equal(rolled.hour, 0);
  assert.equal(rolled.day, 19);
  assert.equal(rolled.weekdayIndex, 1);
  assert.equal(rolled.weekday, 'Mon');
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
