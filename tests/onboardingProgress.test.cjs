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
  completeOnboardingStep,
  createOnboardingProgress,
  getNextOnboardingStepId,
  isOnboardingComplete,
  loadOnboardingProgress,
  normalizeOnboardingProfileId,
  onboardingStorageKey,
  resetOnboardingProgress,
  sanitizeOnboardingProgress,
  saveOnboardingProgress,
  skipOnboarding,
} = serviceModule.exports;

const EXPECTED_STEP_IDS = [
  'welcome-home',
  'campaign-entry',
  'campaign-mission',
  'campaign-launch',
  'flight-controls',
  'campaign-reward',
  'hangar-entry',
  'hangar-upgrades',
  'hangar-ships',
  'hangar-wings',
  'return-home',
  'weekly-run',
  'weekly-funding',
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

test('defines the complete v2 progression and profile-scoped storage keys', () => {
  assert.equal(ONBOARDING_VERSION, 2);
  assert.equal(ONBOARDING_STORAGE_PREFIX, 'scicon:onboarding:v2');
  assert.deepEqual([...ONBOARDING_STEP_IDS], EXPECTED_STEP_IDS);
  assert.equal(normalizeOnboardingProfileId(' 0xAbC '), '0xabc');
  assert.equal(normalizeOnboardingProfileId(''), 'guest');
  assert.equal(onboardingStorageKey('0xAbC'), 'scicon:onboarding:v2:0xabc');
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
      version: 2,
      profileId: 'PILOT-A',
      completedStepIds: [
        'hangar-ships',
        'unknown-step',
        'welcome-home',
        'hangar-ships',
        42,
      ],
      skipped: 'yes',
    },
    'pilot-a',
  );
  assert.deepEqual(repaired, {
    version: 2,
    profileId: 'pilot-a',
    completedStepIds: ['welcome-home', 'hangar-ships'],
    skipped: false,
  });
});

test('loads and saves independently for each profile without consulting the legacy tutorial flag', () => {
  const legacyKey = 'scicon_tutorial_seen_v1';
  const storage = createMemoryStorage([[legacyKey, 'true']]);

  const pilotAInitial = loadOnboardingProgress('pilot-a', storage);
  assert.deepEqual(pilotAInitial, createOnboardingProgress('pilot-a'));
  assert.equal(getNextOnboardingStepId(pilotAInitial), 'welcome-home');

  const pilotAUpdated = completeOnboardingStep(pilotAInitial, 'welcome-home');
  assert.equal(saveOnboardingProgress(pilotAUpdated, storage), true);
  assert.deepEqual(loadOnboardingProgress('pilot-a', storage), pilotAUpdated);
  assert.deepEqual(loadOnboardingProgress('pilot-b', storage), createOnboardingProgress('pilot-b'));
  assert.equal(storage.values.get(legacyKey), 'true');
});

test('completes steps idempotently in canonical order and reports the next step', () => {
  let state = createOnboardingProgress('pilot-a');
  state = completeOnboardingStep(state, 'campaign-entry');
  state = completeOnboardingStep(state, 'welcome-home');
  state = completeOnboardingStep(state, 'campaign-entry');

  assert.deepEqual(state.completedStepIds, ['welcome-home', 'campaign-entry']);
  assert.equal(getNextOnboardingStepId(state), 'campaign-mission');
  assert.equal(isOnboardingComplete(state), false);

  for (const stepId of ONBOARDING_STEP_IDS) {
    state = completeOnboardingStep(state, stepId);
  }
  assert.equal(getNextOnboardingStepId(state), null);
  assert.equal(isOnboardingComplete(state), true);
  assert.equal(state.skipped, false);
});

test('skip marks the whole tour complete and reset clears only the active profile', () => {
  const storage = createMemoryStorage();
  const pilotA = completeOnboardingStep(createOnboardingProgress('pilot-a'), 'welcome-home');
  const pilotB = completeOnboardingStep(createOnboardingProgress('pilot-b'), 'welcome-home');
  assert.equal(saveOnboardingProgress(pilotA, storage), true);
  assert.equal(saveOnboardingProgress(pilotB, storage), true);

  const skipped = skipOnboarding(pilotA);
  assert.deepEqual(skipped.completedStepIds, EXPECTED_STEP_IDS);
  assert.equal(skipped.skipped, true);
  assert.equal(isOnboardingComplete(skipped), true);

  const reset = resetOnboardingProgress('pilot-a', storage);
  assert.deepEqual(reset, createOnboardingProgress('pilot-a'));
  assert.equal(storage.getItem(onboardingStorageKey('pilot-a')), null);
  assert.notEqual(storage.getItem(onboardingStorageKey('pilot-b')), null);
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
