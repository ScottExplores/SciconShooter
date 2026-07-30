const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const SAMPLE_BOSSES = [
  {
    eventId: 'boss-one',
    label: 'Boss One',
    missionNumber: 1
  },
  {
    eventId: 'boss-two',
    label: 'Boss Two',
    missionNumber: 5
  }
];

const bossArchiveStub = {
  BOSS_ARCHIVE_CATALOG: SAMPLE_BOSSES,
  BOSS_ARCHIVE_DIFFICULTIES: [
    { id: 'easy' },
    { id: 'medium' },
    { id: 'heroic' }
  ],
  getBossArchiveChallengeRewardCoins: (missionNumber) => 100 + 25 * (missionNumber - 1),
  getBossArchiveSpeedTargetSeconds: (missionNumber) => 75 + 2.5 * (missionNumber - 1),
  getBossArchiveEntry: (value) => SAMPLE_BOSSES.find((entry) => entry.eventId === String(value).trim().toLowerCase()) ?? null,
  normalizeBossArchiveEventId: (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'legacy-boss-one' || normalized === 'legacy-boss-one-b') return 'boss-one';
    return SAMPLE_BOSSES.find((entry) => entry.eventId === normalized)?.eventId ?? null;
  },
  normalizeBossArchiveEventIds: (value) => {
    const requested = new Set(Array.isArray(value)
      ? value.map((item) => {
          const normalized = String(item).trim().toLowerCase();
          return normalized === 'legacy-boss-one' || normalized === 'legacy-boss-one-b'
            ? 'boss-one'
            : normalized;
        })
      : []);
    return SAMPLE_BOSSES.filter((entry) => requested.has(entry.eventId)).map((entry) => entry.eventId);
  },
  normalizeBossArchiveDifficultyId: (value) => (
    ['easy', 'medium', 'heroic'].includes(String(value).trim().toLowerCase())
      ? String(value).trim().toLowerCase()
      : 'medium'
  )
};

const compileService = (name, requires = {}) => {
  const source = fs.readFileSync(path.join(root, 'services', name), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => requires[request] ?? require(request);
  Function('exports', 'require', 'module', compiled)(module.exports, localRequire, module);
  return module.exports;
};

const progression = compileService('bossArchiveProgression.ts', {
  './bossArchive': bossArchiveStub
});

const unlockedState = (now = new Date('2026-07-26T10:00:00.000Z')) => (
  progression.createBossArchiveProgress(['boss-one'], [], now)
);

test('every data-driven boss receives three mastery objectives and an existing-coin reward', () => {
  assert.equal(progression.DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT, 3);
  assert.equal(progression.BOSS_ARCHIVE_PROGRESSION_CATALOG.length, SAMPLE_BOSSES.length);
  for (const config of progression.BOSS_ARCHIVE_PROGRESSION_CATALOG) {
    assert.equal(config.masteryObjectives.length, 3);
    assert.deepEqual(
      Array.from(config.masteryObjectives, (objective) => objective.id),
      ['challenge-clear', 'no-hit-clear', 'timed-clear']
    );
    assert.ok(config.challengeRewardCoins > 0);
    assert.ok(config.masteryObjectives.every((objective) => objective.rewardCoins > 0));
    assert.ok(config.masteryObjectives.every((objective) => (
      objective.rewardCosmeticId.startsWith(`boss-archive:${config.eventId}:`)
    )));
  }
  assert.ok(
    progression.getBossArchiveProgressionConfig('boss-two').challengeRewardCoins
      > progression.getBossArchiveProgressionConfig('boss-one').challengeRewardCoins
  );
});

test('reselecting the current boss is idempotent and cannot create a render-save loop', () => {
  const initial = unlockedState();
  const selected = progression.selectBossArchiveEntry(initial, 'boss-one');
  assert.notEqual(selected, initial);
  assert.equal(selected.lastSelectedEventId, 'boss-one');
  assert.equal(progression.selectBossArchiveEntry(selected, 'boss-one'), selected);
});

test('legacy boss event aliases migrate unlocks, selection, and record history to the canonical boss', () => {
  const migrated = progression.sanitizeBossArchiveProgress({
    unlockedEventIds: ['legacy-boss-one'],
    seenEventIds: ['legacy-boss-one'],
    lastSelectedEventId: 'legacy-boss-one',
    records: {
      'boss-one': {
        attempts: 1,
        practiceAttempts: 1,
        practiceClears: 1,
        totalClears: 1,
        bestClearTimeMs: 45_000,
        processedResultIds: ['canonical-clear']
      },
      'legacy-boss-one': {
        attempts: 3,
        practiceAttempts: 3,
        practiceClears: 2,
        totalClears: 2,
        bestClearTimeMs: 42_000,
        processedResultIds: ['legacy-clear']
      },
      'legacy-boss-one-b': {
        attempts: 2,
        challengeAttempts: 2,
        challengeClears: 1,
        totalClears: 1,
        bestClearTimeMs: 40_000,
        processedResultIds: ['legacy-clear-b']
      }
    }
  });

  assert.deepEqual(migrated.unlockedEventIds, ['boss-one']);
  assert.deepEqual(migrated.seenEventIds, ['boss-one']);
  assert.equal(migrated.lastSelectedEventId, 'boss-one');
  assert.equal(migrated.records['boss-one'].attempts, 6);
  assert.equal(migrated.records['boss-one'].totalClears, 4);
  assert.equal(migrated.records['boss-one'].bestClearTimeMs, 40_000);
  assert.deepEqual(
    migrated.records['boss-one'].processedResultIds,
    ['canonical-clear', 'legacy-clear', 'legacy-clear-b']
  );
});

test('every launched boss fight consumes one charge, including a loss', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  const launched = progression.beginBossArchiveFight(unlockedState(now), {
    eventId: 'boss-one',
    difficultyId: 'heroic',
    attemptId: 'boss-archive:failed-1'
  }, { now });
  assert.equal(launched.accepted, true);
  assert.equal(launched.chargeConsumed, true);
  assert.equal(launched.chargesRemaining, 2);
  assert.equal(launched.state.dailyAttempts.attemptsUsed, 1);
  assert.equal(launched.state.records['boss-one'].attempts, 1);
  assert.equal(launched.state.records['boss-one'].difficultyRecords.heroic.attempts, 1);

  const failed = progression.recordBossArchiveFightResult(launched.state, {
    eventId: 'boss-one',
    mode: 'challenge',
    difficultyId: 'heroic',
    victory: false,
    damageTaken: 2,
    resultId: 'boss-archive:failed-1'
  }, { now });
  assert.equal(failed.accepted, true);
  assert.equal(failed.challengeChargeConsumed, false);
  assert.equal(failed.challengeRewardCoins, 0);
  assert.equal(failed.state.dailyAttempts.attemptsUsed, 1);
  assert.equal(failed.state.records['boss-one'].difficultyRecords.heroic.clears, 0);

  const secondLaunch = progression.beginBossArchiveFight(failed.state, {
    eventId: 'boss-one',
    difficultyId: 'easy',
    attemptId: 'boss-archive:clear-1'
  }, { now });
  assert.equal(secondLaunch.chargeConsumed, true);
  assert.equal(secondLaunch.state.dailyAttempts.attemptsUsed, 2);

  const challenge = progression.recordBossArchiveFightResult(secondLaunch.state, {
    eventId: 'boss-one',
    mode: 'challenge',
    difficultyId: 'easy',
    victory: true,
    clearTimeMs: 50_000,
    damageTaken: 0,
    resultId: 'boss-archive:clear-1'
  }, { now });
  assert.equal(challenge.accepted, true);
  assert.equal(challenge.challengeChargeConsumed, false);
  assert.ok(challenge.challengeRewardCoins > 0);
  assert.equal(challenge.state.dailyAttempts.attemptsUsed, 2);
  assert.equal(challenge.state.records['boss-one'].difficultyRecords.easy.clears, 1);
  assert.deepEqual(
    Array.from(challenge.newlyCompletedObjectiveIds),
    ['challenge-clear', 'no-hit-clear', 'timed-clear']
  );
});

test('a fourth launch is rejected before combat without mutating records', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  const state = unlockedState(now);
  state.dailyAttempts.attemptsUsed = 3;
  const before = JSON.stringify(state);
  const result = progression.beginBossArchiveFight(state, {
    eventId: 'boss-one',
    difficultyId: 'medium',
    attemptId: 'boss-archive:blocked-launch'
  }, { now });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'no-charges');
  assert.equal(result.chargeConsumed, false);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.records['boss-one'], undefined);
  assert.deepEqual(Array.from(result.state.dailyAttempts.processedAttemptIds), []);
});

test('duplicate result IDs cannot consume a second charge or duplicate records', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  const launched = progression.beginBossArchiveFight(unlockedState(now), {
    eventId: 'boss-one',
    difficultyId: 'medium',
    attemptId: 'boss-archive:receipt-123'
  }, { now });
  const input = {
    eventId: 'boss-one',
    mode: 'challenge',
    difficultyId: 'medium',
    victory: true,
    clearTimeMs: 60_000,
    damageTaken: 1,
    resultId: 'boss-archive:receipt-123'
  };
  const first = progression.recordBossArchiveFightResult(launched.state, input, { now });
  const duplicate = progression.recordBossArchiveFightResult(first.state, input, { now });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, 'duplicate-result');
  assert.equal(duplicate.state.dailyAttempts.attemptsUsed, 1);
  assert.equal(duplicate.state.records['boss-one'].challengeClears, 1);
});

test('daily charges reset at the next UTC date and expose the next UTC boundary', () => {
  const dayOne = new Date('2026-07-26T23:59:00.000Z');
  const state = unlockedState(dayOne);
  state.dailyChallenge.successfulClearsUsed = 2;
  const status = progression.getBossArchiveDailyChargeStatus(
    state,
    new Date('2026-07-27T00:01:00.000Z')
  );
  assert.equal(status.utcDateKey, '2026-07-27');
  assert.equal(status.used, 0);
  assert.equal(status.remaining, 3);
  assert.equal(status.resetsAt, '2026-07-28T00:00:00.000Z');
});

test('a fight launched before UTC midnight can settle after reset without spending the new day', () => {
  const launchTime = new Date('2026-07-26T23:59:50.000Z');
  const resultTime = new Date('2026-07-27T00:00:10.000Z');
  const launch = progression.beginBossArchiveFight(unlockedState(launchTime), {
    eventId: 'boss-one',
    difficultyId: 'heroic',
    attemptId: 'boss-archive:midnight-run'
  }, { now: launchTime });
  assert.equal(launch.state.dailyAttempts.attemptsUsed, 1);

  const result = progression.recordBossArchiveFightResult(launch.state, {
    eventId: 'boss-one',
    mode: 'challenge',
    difficultyId: 'heroic',
    victory: true,
    clearTimeMs: 45_000,
    damageTaken: 1,
    resultId: 'boss-archive:midnight-run'
  }, { now: resultTime });
  assert.equal(result.accepted, true);
  const nextDay = progression.getBossArchiveDailyChargeStatus(result.state, resultTime);
  assert.equal(nextDay.used, 0);
  assert.equal(nextDay.remaining, 3);
  assert.equal(result.state.records['boss-one'].difficultyRecords.heroic.clears, 1);
});

test('mastery rewards are one-time claims and do not consume another charge', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');
  const launch = progression.beginBossArchiveFight(unlockedState(now), {
    eventId: 'boss-one',
    difficultyId: 'medium',
    attemptId: 'boss-archive:mastery-clear'
  }, { now });
  const clear = progression.recordBossArchiveFightResult(launch.state, {
    eventId: 'boss-one',
    mode: 'challenge',
    difficultyId: 'medium',
    victory: true,
    clearTimeMs: 50_000,
    damageTaken: 0,
    resultId: 'boss-archive:mastery-clear'
  }, { now });
  const usedBeforeClaim = clear.state.dailyAttempts.attemptsUsed;
  const claim = progression.claimBossArchiveMasteryReward(
    clear.state,
    'boss-one',
    'no-hit-clear',
    new Date('2026-07-26T10:01:00.000Z')
  );
  assert.equal(claim.claimed, true);
  assert.ok(claim.rewardCoins > 0);
  assert.equal(claim.rewardCosmeticId, 'boss-archive:boss-one:frame');
  assert.equal(claim.state.dailyAttempts.attemptsUsed, usedBeforeClaim);
  const secondClaim = progression.claimBossArchiveMasteryReward(
    claim.state,
    'boss-one',
    'no-hit-clear'
  );
  assert.equal(secondClaim.claimed, false);
  assert.equal(secondClaim.reason, 'already-claimed');
  assert.equal(secondClaim.rewardCoins, 0);
  assert.equal(secondClaim.rewardCosmeticId, null);
});

test('persistence prefers trusted primary time and safely falls back to local state', async () => {
  const persistence = compileService('bossArchivePersistence.ts', {
    './bossArchiveProgression': progression
  });
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const localState = unlockedState(new Date('2026-07-26T10:00:00.000Z'));
  storage.setItem(
    persistence.getBossArchiveProgressStorageKey('wallet:0x1'),
    JSON.stringify(localState)
  );
  const adapter = persistence.createBossArchivePersistenceAdapter({
    profileId: 'wallet:0x1',
    storage,
    primary: {
      load: async () => { throw new Error('offline'); },
      save: async () => { throw new Error('offline'); }
    }
  });
  const fallback = await adapter.load({ now: new Date('2026-07-26T11:00:00.000Z') });
  assert.equal(fallback.source, 'local');
  assert.equal(fallback.primaryError.message, 'offline');

  const trustedAdapter = persistence.createBossArchivePersistenceAdapter({
    profileId: 'wallet:0x2',
    storage,
    primary: {
      load: async () => ({
        state: localState,
        serverNow: '2026-07-27T00:05:00.000Z'
      }),
      save: async () => undefined
    }
  });
  const trusted = await trustedAdapter.load({ now: new Date('2026-07-26T20:00:00.000Z') });
  assert.equal(trusted.source, 'primary');
  assert.equal(trusted.state.dailyChallenge.utcDateKey, '2026-07-27');
});

test('developer simulation helpers are unavailable unless explicitly enabled', () => {
  assert.equal(progression.createBossArchiveDeveloperControls(false), null);
  const controls = progression.createBossArchiveDeveloperControls(true);
  const unlocked = controls.unlockAll(unlockedState());
  assert.deepEqual(Array.from(unlocked.unlockedEventIds), ['boss-one', 'boss-two']);
  const reset = controls.resetDailyCharges({
    ...unlocked,
    dailyChallenge: {
      utcDateKey: '2026-07-26',
      successfulClearsUsed: 3,
      processedClearIds: ['one']
    }
  }, new Date('2026-07-27T08:00:00.000Z'));
  assert.equal(reset.dailyChallenge.successfulClearsUsed, 0);
});

test('developer simulation helpers become inert immediately after founder authorization is revoked', () => {
  let authorized = true;
  const controls = progression.createBossArchiveDeveloperControls(() => authorized);
  assert.ok(controls);

  const state = unlockedState();
  const allUnlocked = controls.unlockAll(state);
  assert.notEqual(allUnlocked, state);
  authorized = false;

  assert.equal(controls.unlockAll(state), state);
  assert.equal(controls.resetProgress(state), state);
  assert.equal(controls.resetDailyCharges(state), state);
  assert.equal(controls.simulateNewUnlock(state, 'boss-two'), state);
  assert.equal(controls.simulateMasteryComplete(state, 'boss-one'), state);

  const preview = controls.previewResult(state, 'boss-one', true);
  assert.equal(preview.state, state);
  assert.equal(preview.accepted, false);
  assert.equal(preview.challengeRewardCoins, 0);
});

test('economy integration delegates rewards to the existing weekly coin ledger', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'rewardProgression.ts'), 'utf8');
  assert.match(source, /beginBossArchiveFightEconomy/);
  assert.match(source, /beginBossArchiveFight\(/);
  assert.match(source, /recordBossArchiveFightResult\(/);
  assert.match(source, /awardWeeklySquadCoins\([\s\S]*result\.challengeRewardCoins/);
  assert.match(source, /`boss-archive:\$\{input\.eventId\}`/);
  assert.match(source, /claimBossArchiveMasteryReward\(/);
  assert.match(source, /`boss-mastery:\$\{eventId\}:\$\{objectiveId\}`/);
  assert.match(source, /claim\.rewardCosmeticId[\s\S]*permanentState\.cosmetics/);
});
