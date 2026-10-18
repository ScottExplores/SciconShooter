import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const p = require('../../services/revamp/progression/core.js');
const today = new Date(2026, 9, 17, 12);
const initial = () => p.createRevampProgress(today);
const mission = (overrides = {}) => ({
  runId: 'run-1', missionId: 'mission-1', cleared: true,
  kills: 90, spawned: 100, damageTaken: 0, durationMs: 60_000, scienceCreditsEarned: 1000, ...overrides
});
const finish = (state, overrides) => p.settleRevampMission(state, mission(overrides), today);

test('shared browser/server schema is versioned, JSON-stable, and rejects non-finite counters', () => {
  const state = p.sanitizeRevampProgress({
    version: 1, researchData: Infinity, playTimeMs: NaN,
    upgrades: { firepower: 99 }, purchasedNodeIds: ['firepower:99', 'survival:-1'],
    events: [{ id: 'bad', kind: 'kills', amount: Infinity, dateKey: '2026-10-17' }],
    equippedCosmeticId: 'revamp-trail-aurora', missionMedals: { broken: ['noHit'] }
  });
  assert.equal(state.version, 1);
  assert.equal(state.researchData, 0);
  assert.equal(state.playTimeMs, 0);
  assert.equal(state.upgrades.firepower, 0);
  assert.equal(state.equippedCosmeticId, null);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.missionMedals, {});
  assert.deepEqual(p.sanitizeRevampProgress(JSON.parse(JSON.stringify(state))), state);
  const migrated = p.sanitizeRevampProgress({ researchData: 7 });
  assert.equal(migrated.researchData, 7);
  assert.equal(p.sanitizeRevampProgress(migrated).researchData, 7);
  assert.equal(p.sanitizeRevampProgress({ version: 1, researchData: 7 }).researchData, 0);
  const brokenChain = p.sanitizeRevampProgress({ version: 1, legacyResearchData: 7, purchasedNodeIds: ['firepower:2'] });
  assert.equal(brokenChain.upgrades.firepower, 0);
  assert.equal(brokenChain.researchData, 5, 'a missing predecessor never refunds an existing debit');
});

test('medals pay Research Data once per mission and duplicate results do nothing', () => {
  const result = finish(initial());
  assert.deepEqual(result.medals, ['clear', 'kills', 'noHit']);
  assert.equal(result.researchAwarded, 4);
  assert.equal(result.state.researchData, 4);
  assert.deepEqual(result.unlocks.map((entry) => entry.id), ['wing-right']);
  assert.equal(result.state.playTimeMs, 60_000);
  const duplicate = finish(result.state);
  assert.equal(duplicate.accepted, false);
  assert.deepEqual(duplicate.state, result.state);
  const replay = finish(result.state, { runId: 'run-2' });
  assert.equal(replay.researchAwarded, 0);
  assert.equal(replay.state.researchData, 4);
  assert.equal(replay.state.playTimeMs, 120_000);
  const weekly = p.getRevampGoals(replay.state, today).weekly;
  assert.equal(weekly.find((goal) => goal.kind === 'clears').progress, 2);
  assert.equal(weekly.find((goal) => goal.kind === 'noHitClears').progress, 2);
  assert.equal(weekly.find((goal) => goal.kind === 'kills').progress, 0, 'combat totals are flushed separately by default');
});

test('medal thresholds require a clear and actual targets; failed missions still count playtime', () => {
  assert.deepEqual(finish(initial(), { kills: 89, damageTaken: 1 }).medals, ['clear']);
  assert.deepEqual(finish(initial(), { kills: 0, spawned: 0 }).medals, ['clear', 'noHit']);
  assert.deepEqual(finish(initial(), { kills: 101, spawned: 100, damageTaken: 1 }).medals, ['clear']);
  const failed = finish(initial(), { cleared: false });
  assert.equal(failed.state.playTimeMs, 60_000);
  assert.equal(failed.state.researchData, 0);
  assert.equal(failed.state.unlockIds.includes('wing-right'), false);
  assert.equal(finish(initial(), { damageTaken: NaN }).accepted, false);
  assert.equal(finish(initial(), { durationMs: -1 }).accepted, false);
  assert.equal(finish(initial(), { damageTaken: undefined }).accepted, false);
});

test('all five branches have five nodes, purchases debit both currencies and rank gates matter', () => {
  let state = p.sanitizeRevampProgress({ ...finish(initial(), { scienceCreditsEarned: 100_000 }).state, legacyResearchData: 100, playTimeMs: 60 * 60_000 });
  let credits = 100_000;
  const nodes = p.getUpgradeNodes(state);
  assert.equal(nodes.length, 25);
  for (const branch of p.REVAMP_BRANCHES) {
    assert.equal(nodes.filter((node) => node.branch === branch).length, 5);
    for (let level = 1; level <= 5; level += 1) {
      const before = state.researchData;
      const result = p.purchaseRevampUpgrade(state, branch, credits);
      assert.equal(result.accepted, true);
      assert.equal(result.state.upgrades[branch], level);
      assert.equal(before - result.state.researchData, p.REVAMP_RESEARCH_COSTS[level - 1]);
      assert.equal(credits - result.credits, p.REVAMP_CREDIT_COSTS[level - 1]);
      state = result.state;
      credits = result.credits;
    }
    assert.equal(p.purchaseRevampUpgrade(state, branch, credits).reason, 'max-level');
  }
  const bonuses = p.getRevampBonuses(state);
  assert.equal(bonuses.extraProjectiles, 1);
  assert.equal(bonuses.extraLives, 1);
  assert.equal(bonuses.shieldBonus, 2);
  assert.ok(bonuses.wingCooldownMultiplier >= 0.85);
  assert.ok(bonuses.creditGainMultiplier <= 1.15);
  assert.equal(p.getRevampCreditLedger(state).spent, 5 * p.REVAMP_CREDIT_COSTS.reduce((a, b) => a + b, 0));
  const first = p.purchaseRevampUpgrade(finish(initial()).state, 'firepower', 1000);
  assert.equal(first.accepted, true);
  assert.equal(p.purchaseRevampUpgrade(first.state, 'firepower', first.credits).reason, 'locked');
  const noResearch = finish(initial(), { cleared: false }).state;
  assert.equal(p.purchaseRevampUpgrade(noResearch, 'firepower', 1000).reason, 'research');
  assert.equal(p.purchaseRevampUpgrade(finish(initial()).state, 'firepower', 0).reason, 'credits');
  assert.equal(p.purchaseRevampUpgrade(state, 'unknown', 9999).reason, 'invalid');
});

test('receipt merge deduplicates rewards and retains concurrent purchase debt', () => {
  const base = finish(initial(), { kills: 50, damageTaken: 1 }).state;
  assert.equal(base.researchData, 1);
  const left = p.purchaseRevampUpgrade(base, 'firepower', 100).state;
  const right = p.purchaseRevampUpgrade(base, 'survival', 100).state;
  const merged = p.mergeRevampProgress(left, right);
  assert.equal(merged.upgrades.firepower, 1);
  assert.equal(merged.upgrades.survival, 1);
  assert.equal(merged.researchData, 0);
  assert.equal(merged.researchDebt, 1);
  assert.equal(p.getRevampCreditLedger(merged).spent, 80);
  assert.equal(p.purchaseRevampUpgrade(merged, 'fortune', 100).reason, 'research');
  assert.deepEqual(p.mergeRevampProgress(merged, merged), merged);
  assert.deepEqual(p.mergeRevampProgress(left, right), p.mergeRevampProgress(right, left));
  assert.equal(p.mergeRevampProgress(base, base).playTimeMs, base.playTimeMs);
  assert.equal(finish(merged, { runId: 'run-2', missionId: 'mission-2' }).state.researchData, 3);
});

test('purchased or unproven legacy coin balances cannot fund the combat tree', () => {
  const richUnproven = p.sanitizeRevampProgress({ ...initial(), legacyResearchData: 100, scienceCreditsEarned: 100000 });
  assert.equal(richUnproven.scienceCreditsEarned, 0, 'a derived counter cannot fabricate gameplay earnings');
  assert.equal(p.getRevampSpendableCredits(richUnproven, 100000), 0);
  assert.equal(p.purchaseRevampUpgrade(richUnproven, 'firepower', 100000).reason, 'credits');
  const earned = finish(richUnproven, { scienceCreditsEarned: 55 }).state;
  assert.equal(p.getRevampSpendableCredits(earned, 100000), 55);
  assert.equal(p.getRevampSpendableCredits(earned, 12), 12);
  const purchase = p.purchaseRevampUpgrade(earned, 'firepower', 100000);
  assert.equal(purchase.accepted, true);
  assert.equal(purchase.credits, 99960);
  assert.equal(purchase.state.scienceCreditsSpent, 40);
  assert.equal(p.getRevampSpendableCredits(purchase.state, purchase.credits), 15);
  assert.equal(p.purchaseRevampUpgrade(purchase.state, 'survival', purchase.credits).reason, 'credits');
  assert.equal(finish(earned).accepted, false);
  assert.equal(p.mergeRevampProgress(earned, earned).scienceCreditsEarned, 55);
});

test('earned-credit merge preserves distinct receipts and conservatively resolves conflicting duplicates', () => {
  const a = finish(initial(), { runId: 'left', scienceCreditsEarned: 90 }).state;
  const b = finish(initial(), { runId: 'right', missionId: 'mission-2', scienceCreditsEarned: 60 }).state;
  const both = p.mergeRevampProgress(a, b);
  assert.equal(both.scienceCreditsEarned, 150);
  assert.equal(p.mergeRevampProgress(both, a).scienceCreditsEarned, 150);
  const conflicting = p.sanitizeRevampProgress({ ...a, earnedCreditsByRunId: { left: 110 } });
  assert.equal(p.mergeRevampProgress(a, conflicting).scienceCreditsEarned, 90);
  assert.equal(p.sanitizeRevampProgress({ ...initial(), earnedCreditsByRunId: { missing: 1000 } }).scienceCreditsEarned, 0);
  assert.equal(finish(initial(), { scienceCreditsEarned: Infinity }).accepted, false);
});

test('the authoritative paid reserve prevents paid refills from reactivating spent earnings', () => {
  const earned = finish(initial(), { scienceCreditsEarned: 100 }).state;
  const withPaidTokens = p.sanitizeRevampProgress({ ...earned, paidCreditReserve: 500 });
  assert.equal(p.getRevampSpendableCredits(withPaidTokens, 600), 100);
  // The pilot spent all 100 earned coins in the legacy hangar. The 500 paid
  // Tokens remain, while the historical earnings allowance is still 100.
  assert.equal(p.getRevampSpendableCredits(withPaidTokens, 500), 0);
  assert.equal(p.purchaseRevampUpgrade(withPaidTokens, 'firepower', 500).accepted, false);
  // A purchase adds equally to balance and its signed, server-owned reserve.
  const refilled = p.sanitizeRevampProgress({ ...withPaidTokens, paidCreditReserve: 1000 });
  assert.equal(p.getRevampSpendableCredits(refilled, 1000), 0);
  assert.equal(p.purchaseRevampUpgrade(refilled, 'firepower', 1000).accepted, false);
  const nextFlight = finish(refilled, { runId: 'run-2', scienceCreditsEarned: 40 }).state;
  assert.equal(p.getRevampSpendableCredits(nextFlight, 1040), 40);
  const bought = p.purchaseRevampUpgrade(nextFlight, 'firepower', 1040);
  assert.equal(bought.accepted, true);
  assert.equal(bought.credits, 1000, 'purchase preserves all paid Tokens');
  assert.equal(p.getRevampSpendableCredits(bought.state, bought.credits), 0);
  assert.equal(p.mergeRevampProgress(refilled, withPaidTokens).paidCreditReserve, 1000);
  assert.equal(p.sanitizeRevampProgress({ paidCreditReserve: Infinity }).paidCreditReserve, 0);
});

test('daily goals seed by local date, weekly goals use ISO week across years and DST', () => {
  assert.deepEqual(p.getRevampGoals(initial(), today), p.getRevampGoals(initial(), new Date(2026, 9, 17, 23, 59)));
  assert.equal(p.getRevampGoals(initial(), today).daily.length, 3);
  assert.equal(p.getRevampGoals(initial(), today).weekly.length, 5);
  const dayKinds = p.getRevampGoals(initial(), today).daily.map((goal) => goal.kind);
  assert.equal(new Set(dayKinds).size, 3);
  assert.notDeepEqual(p.getRevampGoals(initial(), today).daily.map((goal) => goal.id), p.getRevampGoals(initial(), new Date(2026, 9, 18)).daily.map((goal) => goal.id));
  assert.equal(p.getRevampIsoWeekKey(new Date(2021, 0, 1)), '2020-W53');
  assert.equal(p.getRevampIsoWeekKey(new Date(2021, 0, 4)), '2021-W01');
  assert.equal(p.getRevampIsoWeekKey(new Date(2026, 11, 31)), '2026-W53');
  const script = `const p=require('./services/revamp/progression/core.js'); console.log(p.getRevampLocalDateKey(new Date('2026-03-09T02:00:00Z')),p.getRevampIsoWeekKey(new Date('2026-03-09T02:00:00Z')))`;
  const output = execFileSync(process.execPath, ['-e', script], { cwd: new URL('../../', import.meta.url), env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' }).trim();
  assert.equal(output, '2026-03-08 2026-W10');
});

test('cumulative gameplay receipts are idempotent, weekly and daily claims cannot repeat', () => {
  let state = initial();
  const goal = p.getRevampGoals(state, today).daily[0];
  const event = { id: `run-live:${goal.kind}`, runId: 'run-live', mode: 'total', kind: goal.kind, amount: 2 };
  state = p.recordRevampEvent(state, event, today);
  state = p.recordRevampEvent(state, event, today);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].amount, 2);
  state = p.recordRevampEvent(state, { ...event, amount: goal.target }, today);
  assert.equal(state.events[0].amount, goal.target);
  const claimed = p.claimRevampGoal(state, goal.id, 12, today);
  assert.equal(claimed.accepted, true);
  assert.equal(claimed.credits, 12 + goal.creditReward);
  assert.equal(claimed.state.researchData, goal.researchReward);
  assert.equal(p.claimRevampGoal(claimed.state, goal.id, claimed.credits, today).accepted, false);
  assert.equal(p.claimRevampGoal(claimed.state, goal.id, claimed.credits, new Date(2026, 9, 18)).accepted, false);
  const merged = p.mergeRevampProgress(claimed.state, claimed.state);
  assert.equal(merged.researchData, goal.researchReward);
  assert.equal(p.getRevampCreditLedger(merged).earned, goal.creditReward);
});

test('all five weekly claims unlock an equipable cosmetic, never a combat bonus', () => {
  let state = initial();
  let credits = 0;
  const before = p.getRevampBonuses(state);
  const goals = p.getRevampGoals(state, today);
  let reward;
  for (const goal of goals.weekly) {
    state = p.recordRevampEvent(state, { id: `weekly-${goal.kind}`, kind: goal.kind, amount: goal.target }, today);
    const claim = p.claimRevampGoal(state, goal.id, credits, today);
    assert.equal(claim.accepted, true);
    state = claim.state;
    credits = claim.credits;
    reward = claim.reward;
  }
  assert.equal(reward.cosmeticId, goals.weeklyCosmeticId);
  assert.deepEqual(p.getRevampBonuses(state), before);
  assert.equal(p.sanitizeRevampProgress({ ...state, equippedCosmeticId: reward.cosmeticId }).equippedCosmeticId, reward.cosmeticId);
  assert.equal(p.claimRevampGoal(state, goals.weekly[4].id, credits, today).accepted, false);
});

test('event pruning keeps durable claim/run receipts and prevents settled-run replay', () => {
  let state = p.recordRevampEvent(initial(), { id: 'run-1:kills', runId: 'run-1', kind: 'kills', amount: 5 }, today);
  state = finish(state).state;
  const later = new Date(2026, 10, 15, 12);
  state = p.recordRevampEvent(state, { id: 'later:kills', kind: 'kills', amount: 1 }, later);
  assert.equal(state.events.some((entry) => entry.id === 'run-1:kills'), false);
  assert.deepEqual(p.recordRevampEvent(state, { id: 'run-1:kills', runId: 'run-1', kind: 'kills', amount: 5 }, later), state);
  assert.equal(finish(state).accepted, false);
});

test('login streak survives DST; missing a day never removes earned rewards', () => {
  let state = p.createRevampProgress(new Date(2026, 2, 7));
  state = p.touchRevampLogin(state, new Date(2026, 2, 8));
  state = p.touchRevampLogin(state, new Date(2026, 2, 9));
  state = p.touchRevampLogin(state, new Date(2026, 2, 9));
  assert.equal(state.login.currentStreak, 3);
  state = finish(state).state;
  const data = state.researchData;
  state = p.touchRevampLogin(state, new Date(2026, 2, 12));
  assert.equal(state.login.currentStreak, 1);
  assert.equal(state.login.longestStreak, 3);
  assert.equal(state.researchData, data);
});

test('cadence covers the first hour every five minutes, without requiring payment', () => {
  let state = initial();
  const observed = new Set(state.unlockIds);
  for (let minute = 5; minute <= 60; minute += 5) {
    const result = finish(state, { runId: `run-${minute}`, missionId: `mission-${minute}`, durationMs: 5 * 60_000 });
    assert.ok(result.unlocks.length > 0, `new entitlement at minute ${minute}`);
    result.unlocks.forEach((entry) => observed.add(entry.id));
    state = result.state;
  }
  assert.equal(observed.size, p.REVAMP_UNLOCK_CADENCE.length);
  assert.equal(state.upgrades.firepower, 0, 'cadence unlocks the choice; never silently buys combat strength');
});
