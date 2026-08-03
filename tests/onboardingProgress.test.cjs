const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const servicePath = path.join(repositoryRoot, 'services', 'onboardingProgress.ts');

const source = fs.readFileSync(servicePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: servicePath,
}).outputText;

const serviceModule = { exports: {} };
new Function('require', 'module', 'exports', transpiled)(
  require,
  serviceModule,
  serviceModule.exports,
);

const {
  ONBOARDING_VERSION,
  ONBOARDING_STEP_IDS,
  ONBOARDING_STORAGE_PREFIX,
  acceptOnboarding,
  completeOnboardingStep,
  createOnboardingProgress,
  declineOnboarding,
  getNextOnboardingStepId,
  isOnboardingComplete,
  loadOnboardingProgress,
  normalizeOnboardingProfileId,
  onboardingStorageKey,
  resetOnboardingProgress,
  restartOnboarding,
  sanitizeOnboardingProgress,
  saveOnboardingProgress,
  skipOnboardingStep,
} = serviceModule.exports;

const EXPECTED_STEP_IDS = [
  'flight-steer',
  'flight-bomb',
  'flight-special',
  'mission-home',
  'rewards-open',
  'rewards-achievements',
  'rewards-daily',
  'rewards-daily-claim',
  'rewards-close',
  'hangar-nav',
  'hangar-wings',
];

const createMemoryStorage = (entries = []) => {
  const values = new Map(entries);
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

test('defines the opt-in v4 progression and profile-scoped storage keys', () => {
  assert.equal(ONBOARDING_VERSION, 4);
  assert.equal(ONBOARDING_STORAGE_PREFIX, 'scicon:onboarding:v4');
  assert.deepEqual([...ONBOARDING_STEP_IDS], EXPECTED_STEP_IDS);
  assert.equal(normalizeOnboardingProfileId(' 0xAbC '), '0xabc');
  assert.equal(normalizeOnboardingProfileId(''), 'guest');
  assert.equal(onboardingStorageKey('0xAbC'), 'scicon:onboarding:v4:0xabc');
  assert.notEqual(onboardingStorageKey('0xabc'), onboardingStorageKey('0xdef'));
});

test('sanitizes malformed, stale, foreign-profile, duplicate, and unknown data', () => {
  const fallback = createOnboardingProgress('pilot-a');
  assert.deepEqual(sanitizeOnboardingProgress(null, 'pilot-a'), fallback);
  assert.deepEqual(
    sanitizeOnboardingProgress({ ...fallback, version: 1 }, 'pilot-a'),
    fallback,
  );
  assert.deepEqual(
    sanitizeOnboardingProgress({ ...fallback, profileId: 'pilot-b' }, 'pilot-a'),
    fallback,
  );

  const repaired = sanitizeOnboardingProgress(
    {
      version: 4,
      profileId: 'PILOT-A',
      decision: 'active',
      completedStepIds: [
        'rewards-daily',
        'unknown-step',
        'flight-steer',
        'rewards-daily',
        42,
      ],
    },
    'pilot-a',
  );
  assert.deepEqual(repaired, {
    version: 4,
    profileId: 'pilot-a',
    decision: 'active',
    completedStepIds: ['flight-steer', 'rewards-daily'],
  });
});

test('new profiles stay dormant until the player accepts guidance', () => {
  const legacyKey = 'scicon_tutorial_seen_v1';
  const storage = createMemoryStorage([[legacyKey, 'true']]);

  const pilotAInitial = loadOnboardingProgress('pilot-a', storage);
  assert.deepEqual(pilotAInitial, createOnboardingProgress('pilot-a'));
  assert.equal(pilotAInitial.decision, 'unasked');
  assert.equal(getNextOnboardingStepId(pilotAInitial), null);

  const pilotAUpdated = completeOnboardingStep(acceptOnboarding(pilotAInitial), 'flight-steer');
  assert.equal(saveOnboardingProgress(pilotAUpdated, storage), true);
  assert.deepEqual(loadOnboardingProgress('pilot-a', storage), pilotAUpdated);
  assert.deepEqual(loadOnboardingProgress('pilot-b', storage), createOnboardingProgress('pilot-b'));
  assert.equal(storage.values.get(legacyKey), 'true');
});

test('accepted guidance completes real-action lessons idempotently in canonical order', () => {
  let state = acceptOnboarding(createOnboardingProgress('pilot-a'));
  state = completeOnboardingStep(state, 'flight-bomb');
  state = completeOnboardingStep(state, 'flight-steer');
  state = completeOnboardingStep(state, 'flight-bomb');

  assert.deepEqual(state.completedStepIds, ['flight-steer', 'flight-bomb']);
  assert.equal(getNextOnboardingStepId(state), 'flight-special');
  assert.equal(isOnboardingComplete(state), false);

  for (const stepId of ONBOARDING_STEP_IDS) {
    state = completeOnboardingStep(state, stepId);
  }
  assert.equal(getNextOnboardingStepId(state), null);
  assert.equal(isOnboardingComplete(state), true);
  assert.equal(state.decision, 'complete');
});

test('Skip advances one lesson without declining the remaining guide', () => {
  const active = acceptOnboarding(createOnboardingProgress('pilot-a'));
  const skipped = skipOnboardingStep(active, 'flight-steer');

  assert.equal(skipped.decision, 'active');
  assert.deepEqual(skipped.completedStepIds, ['flight-steer']);
  assert.equal(getNextOnboardingStepId(skipped), 'flight-bomb');
});

test('v3 terminal pilots stay terminal while active Hangar pilots resume safely', () => {
  const completeStorage = createMemoryStorage([[
    'scicon:onboarding:v3:pilot-a',
    JSON.stringify({
      version: 3,
      profileId: 'pilot-a',
      decision: 'complete',
      completedStepIds: [
        'flight-steer',
        'flight-bomb',
        'mission-hangar',
        'hangar-upgrades',
        'hangar-fleet',
        'hangar-wings',
      ],
    }),
  ]]);
  const migratedComplete = loadOnboardingProgress('pilot-a', completeStorage);
  assert.equal(migratedComplete.decision, 'complete');
  assert.deepEqual(migratedComplete.completedStepIds, EXPECTED_STEP_IDS);
  assert.notEqual(completeStorage.getItem(onboardingStorageKey('pilot-a')), null);

  const activeStorage = createMemoryStorage([[
    'scicon:onboarding:v3:pilot-b',
    JSON.stringify({
      version: 3,
      profileId: 'pilot-b',
      decision: 'active',
      completedStepIds: ['flight-steer', 'flight-bomb', 'mission-hangar'],
    }),
  ]]);
  const migratedActive = loadOnboardingProgress('pilot-b', activeStorage);
  assert.equal(migratedActive.decision, 'active');
  assert.equal(getNextOnboardingStepId(migratedActive), 'hangar-wings');
});

test('decline completes the guide while reset and restart affect only the active profile', () => {
  const storage = createMemoryStorage();
  const pilotA = completeOnboardingStep(acceptOnboarding(createOnboardingProgress('pilot-a')), 'flight-steer');
  const pilotB = completeOnboardingStep(acceptOnboarding(createOnboardingProgress('pilot-b')), 'flight-steer');
  assert.equal(saveOnboardingProgress(pilotA, storage), true);
  assert.equal(saveOnboardingProgress(pilotB, storage), true);

  const declined = declineOnboarding(pilotA);
  assert.deepEqual(declined.completedStepIds, EXPECTED_STEP_IDS);
  assert.equal(declined.decision, 'declined');
  assert.equal(isOnboardingComplete(declined), true);

  const reset = resetOnboardingProgress('pilot-a', storage);
  assert.deepEqual(reset, createOnboardingProgress('pilot-a'));
  assert.equal(storage.getItem(onboardingStorageKey('pilot-a')), null);
  assert.notEqual(storage.getItem(onboardingStorageKey('pilot-b')), null);

  const restarted = restartOnboarding('pilot-a', storage);
  assert.equal(restarted.decision, 'active');
  assert.deepEqual(restarted.completedStepIds, []);
  assert.equal(getNextOnboardingStepId(restarted), 'flight-steer');
  assert.deepEqual(loadOnboardingProgress('pilot-a', storage), restarted);
});

test('storage failures fall back safely without breaking in-memory progression', () => {
  const throwingStorage = {
    getItem() {
      throw new Error('read unavailable');
    },
    setItem() {
      throw new Error('write unavailable');
    },
    removeItem() {
      throw new Error('remove unavailable');
    },
  };

  const initial = loadOnboardingProgress('pilot-a', throwingStorage);
  assert.deepEqual(initial, createOnboardingProgress('pilot-a'));
  assert.equal(saveOnboardingProgress(initial, throwingStorage), false);
  assert.deepEqual(
    resetOnboardingProgress('pilot-a', throwingStorage),
    createOnboardingProgress('pilot-a'),
  );
});
