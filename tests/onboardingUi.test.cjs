const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const readSource = (...segments) => fs.readFileSync(path.join(repositoryRoot, ...segments), 'utf8');

const appSource = readSource('App.tsx');
const onboardingSource = readSource('components', 'SciconOnboarding.tsx');
const startScreenSource = readSource('components', 'StartScreen.tsx');
const canvasSource = readSource('components', 'GameCanvas.tsx');
const hudSource = readSource('components', 'UIOverlay.tsx');
const victorySource = readSource('components', 'WaveVictoryOverlay.tsx');

const EXPECTED_MILESTONES = [
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

const extractMilestoneIds = (source) => {
  const start = source.indexOf('export const SCICON_ONBOARDING_STEPS');
  const end = source.indexOf('] as const;', start);
  assert.notEqual(start, -1, 'SciconOnboarding must export its milestone definitions');
  assert.notEqual(end, -1, 'SciconOnboarding milestone array must have a stable end marker');
  return [...source.slice(start, end).matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
};

const loadOnboardingModule = () => {
  const componentPath = path.join(repositoryRoot, 'components', 'SciconOnboarding.tsx');
  const transpiled = ts.transpileModule(onboardingSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: componentPath,
  }).outputText;

  const moduleUnderTest = { exports: {} };
  const mockRequire = (request) => {
    if (request === 'react') {
      return {
        __esModule: true,
        default: {},
        useCallback: () => undefined,
        useEffect: () => undefined,
        useLayoutEffect: () => undefined,
        useMemo: () => undefined,
        useRef: () => undefined,
        useState: () => undefined,
      };
    }
    if (request === 'react/jsx-runtime') {
      return {
        Fragment: Symbol('Fragment'),
        jsx: () => null,
        jsxs: () => null,
      };
    }
    if (request === './PixelActionButton') {
      return { __esModule: true, default: () => null };
    }
    if (request === '../services/onboardingProgress') {
      return {
        acceptOnboarding: (state) => state,
        completeOnboardingStep: (state) => state,
        declineOnboarding: (state) => state,
        getNextOnboardingStepId: () => null,
        loadOnboardingProgress: () => ({ decision: 'unasked' }),
        ONBOARDING_GAMEPLAY_ACTION_EVENT: 'scicon:onboarding-gameplay-action',
        restartOnboarding: () => ({ decision: 'active' }),
        saveOnboardingProgress: () => true,
        skipOnboardingStep: (state) => state,
      };
    }
    return require(request);
  };

  new Function('require', 'module', 'exports', transpiled)(
    mockRequire,
    moduleUnderTest,
    moduleUnderTest.exports,
  );
  return moduleUnderTest.exports;
};

test('App owns one progressive guide and preserves gameplay freeze wiring', () => {
  assert.match(
    appSource,
    /import\s+SciconOnboarding(?:,\s*\{[^}]+\})?\s+from\s+'\.\/components\/SciconOnboarding'/,
  );
  assert.equal((appSource.match(/<SciconOnboarding\b/g) ?? []).length, 1);
  assert.match(appSource, /onGameplayFreezeChange=\{handleOnboardingGameplayFreezeChange\}/);
  assert.match(appSource, /onInvitationDecision=\{handleOnboardingInvitationDecision\}/);
  assert.match(appSource, /onboardingRunSessionPendingRef\.current = \{ testRun, runMode \}/);
  assert.match(appSource, /beginRunSession\(pendingRun\.testRun, pendingRun\.runMode\)/);
  assert.match(appSource, /running:\s*[\s\S]{0,220}!onboardingGameplayFreeze/);
  assert.match(appSource, /onRestartOnboarding=\{\(\)\s*=>\s*setOnboardingRestartNonce/);
  assert.doesNotMatch(startScreenSource, /SciconOnboarding/);
});

test('first-flight guide is opt-in, concise, action-driven, and never clicks for the player', () => {
  assert.deepEqual(extractMilestoneIds(onboardingSource), EXPECTED_MILESTONES);
  assert.match(onboardingSource, /Want quick guidance\?/);
  assert.match(onboardingSource, />\s*No thanks\s*</i);
  assert.match(onboardingSource, />\s*Guide me\s*</i);
  assert.match(onboardingSource, /addEventListener\(currentStep\.activationEvent/);
  assert.equal((onboardingSource.match(/activationEvent: ONBOARDING_GAMEPLAY_ACTION_EVENT/g) ?? []).length, 2);
  assert.match(hudSource, /dispatchEvent\(new CustomEvent\(ONBOARDING_GAMEPLAY_ACTION_EVENT,[\s\S]*?target: button\.dataset\.onboardingTarget/);
  assert.match(onboardingSource, /target === currentStep\.target[\s\S]*?window\.addEventListener\(ONBOARDING_GAMEPLAY_ACTION_EVENT/);
  assert.match(onboardingSource, /currentStep\.id === 'flight-steer' \? 'Skip movement' : 'Skip step'/);
  assert.match(onboardingSource, /skipOnboardingStep\(progress, currentStep\.id\)/);
  assert.match(onboardingSource, />\s*End guide\s*</i);
  assert.match(onboardingSource, /completion: 'daily-gift-confirmed'/);
  assert.match(onboardingSource, /completion: 'left-wing-confirmed'/);
  assert.match(onboardingSource, /dailyGiftClaimedToday \|\| skipRewardEconomy/);
  assert.match(onboardingSource, /\? leftWingUnlocked/);
  assert.doesNotMatch(onboardingSource, /targetElement\?\.click\(|\.click\(\)/);
  assert.match(onboardingSource, /onGameplayFreezeChange\?\.\(inviteOpen\)/);
  assert.match(onboardingSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(onboardingSource, /data-reduced-motion=/);
});

test('all action anchors remain mounted on the surfaces that own them', () => {
  const contracts = [
    ['components/GameCanvas.tsx', ['flight-stage']],
    ['components/UIOverlay.tsx', ['flight-bomb', 'flight-special']],
    ['components/WaveVictoryOverlay.tsx', ['mission-home']],
    ['components/StartScreen.tsx', ['hangar-nav']],
    // REVAMP(K): Daily Gift returns to the ship-stage side tab.
    ['components/revamp/HomeDailyGift.tsx', ['rewards-open']],
    ['components/RewardCenter.tsx', ['rewards-achievements', 'rewards-daily', 'rewards-daily-claim', 'rewards-close']],
    ['components/SquadHangar.tsx', ['hangar-wings']],
  ];

  for (const [relativePath, targets] of contracts) {
    const source = readSource(...relativePath.split('/'));
    assert.match(source, /data-onboarding-target=/, `${relativePath} must expose onboarding anchors`);
    for (const target of targets) {
      assert.ok(source.includes(`'${target}'`) || source.includes(`"${target}"`), `${relativePath} is missing ${target}`);
    }
  }
});

test('flight controls remain ordered and Mission completion routes the guide Home', () => {
  assert.match(appSource, /onboardingBombLocked = onboardingStepId === 'flight-steer'/);
  assert.match(appSource, /onboardingAbilityLocked = onboardingStepId === 'flight-steer'[\s\S]*?onboardingStepId === 'flight-bomb'/);
  assert.match(appSource, /guideRequiresHome=\{onboardingStepId === 'mission-home'\}/);
  assert.match(appSource, /dailyGiftClaimedToday=\{onboardingDailyGiftStatus\.claimedToday\}/);
  assert.match(appSource, /leftWingUnlocked=\{weeklySquadState\.unlockedSlots\.left\}/);
  assert.match(appSource, /bombLocked: onboardingGameplayFreeze[\s\S]*?onboardingBombLocked[\s\S]*?introMissionLocked/);
  assert.match(canvasSource, /!bombLockedRef\.current[\s\S]*?engine\.triggerBomb\(\)/);
  assert.match(canvasSource, /engine\.triggerBomb\(\)[\s\S]*?ONBOARDING_GAMEPLAY_ACTION_EVENT[\s\S]*?target: 'flight-bomb'/);
  assert.doesNotMatch(onboardingSource, /Number\(style\.opacity \|\| 1\) > 0/);
  assert.match(onboardingSource, /data-onboarding-active-target/);
  assert.match(onboardingSource, /Press the bright Return Home button below/);
  assert.match(victorySource, /data-guide-required=\{guideRequiresHome \? 'true' : 'false'\}/);
});

test('More still exposes a Flight Guide replay that returns Home before restarting', () => {
  assert.match(startScreenSource, /label="Flight Guide"/);
  assert.match(
    startScreenSource,
    /label="Flight Guide"[\s\S]{0,260}setDashboardTab\('home'\);[\s\S]{0,120}onRestartOnboarding\(\)/,
  );
});

test('placement helper keeps compact panels and pointers inside narrow phone bounds', () => {
  const { computeOnboardingPlacement } = loadOnboardingModule();
  assert.equal(typeof computeOnboardingPlacement, 'function');

  const root = { width: 320, height: 568 };
  const nearTop = computeOnboardingPlacement(root, {
    left: 0,
    top: 8,
    width: 50,
    height: 40,
    right: 50,
    bottom: 48,
  }, 210);
  assert.deepEqual(nearTop, {
    left: 10,
    top: 60,
    width: 300,
    pointerLeft: 22,
    pointerDirection: 'up',
  });

  const nearBottomRight = computeOnboardingPlacement(root, {
    left: 274,
    top: 470,
    width: 38,
    height: 40,
    right: 312,
    bottom: 510,
  }, 210);
  assert.equal(nearBottomRight.pointerDirection, 'down');
  assert.equal(nearBottomRight.left, 10);
  assert.equal(nearBottomRight.width, 300);
  assert.ok(nearBottomRight.top >= 10 && nearBottomRight.top + 210 <= root.height - 10);
  assert.ok(nearBottomRight.pointerLeft >= 22 && nearBottomRight.pointerLeft <= 278);

  const centered = computeOnboardingPlacement(root, null, 210);
  assert.deepEqual(centered, {
    left: 10,
    top: 179,
    width: 300,
    pointerLeft: 150,
    pointerDirection: 'up',
  });
});

test('legacy one-shot Tutorial remains removed from StartScreen', () => {
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'components', 'Tutorial.tsx')), false);
  assert.doesNotMatch(startScreenSource, /(?:import\s+Tutorial|<Tutorial\b|showTutorial|TUTORIAL_SEEN)/);
});
