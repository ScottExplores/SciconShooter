const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'missionFeedbackPrompt.ts'),
  'utf8'
);

const loadPrompt = () => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(id) {
      throw new Error(`Unexpected import: ${id}`);
    }
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  return context.module.exports;
};

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
};

const prompt = loadPrompt();

const play = (storage, state, event) => {
  const next = prompt.nextMissionFeedbackView(state, event);
  if (next.shown) prompt.markMissionFeedbackShown(storage);
  return {
    shown: prompt.readMissionFeedbackShown(storage),
    visible: next.visible
  };
};

test('the card is shown once after a win, including for players who already cleared missions', () => {
  const storage = memoryStorage();
  let state = { shown: false, visible: false };
  state = play(storage, state, { type: 'result', result: 'loss', priorMissionWins: 12 });
  assert.deepEqual(state, { shown: false, visible: false });
  state = play(storage, state, { type: 'result', result: 'win', priorMissionWins: 12 });
  assert.deepEqual(state, { shown: true, visible: true });
  state = play(storage, state, { type: 'result', result: 'win', priorMissionWins: 13 });
  assert.deepEqual(state, { shown: true, visible: false });
  assert.equal(storage.getItem(prompt.MISSION_FEEDBACK_SHOWN_KEY), '1');
});

test('a loss never shows the card and does not consume the one-time flag', () => {
  const storage = memoryStorage();
  const state = play(storage, { shown: false, visible: false }, {
    type: 'result',
    result: 'loss',
    priorMissionWins: 0
  });
  assert.deepEqual(state, { shown: false, visible: false });
  assert.equal(prompt.shouldShowMissionFeedback({
    result: 'loss',
    deviceShown: false,
    priorMissionWins: 4
  }), false);
});

test('dismiss hides the card and a later win does not show it again', () => {
  const storage = memoryStorage();
  let state = play(storage, { shown: false, visible: false }, {
    type: 'result',
    result: 'win',
    priorMissionWins: 3
  });
  assert.equal(state.visible, true);
  state = play(storage, state, { type: 'dismiss' });
  assert.deepEqual(state, { shown: true, visible: false });
  state = play(storage, state, { type: 'result', result: 'win' });
  assert.deepEqual(state, { shown: true, visible: false });
});

test('submit hides the card and a later win does not show it again', () => {
  const storage = memoryStorage();
  let state = play(storage, { shown: false, visible: false }, { type: 'result', result: 'win' });
  state = play(storage, state, { type: 'submit' });
  assert.deepEqual(state, { shown: true, visible: false });
  state = play(storage, state, { type: 'result', result: 'win', priorMissionWins: 1 });
  assert.equal(state.visible, false);
  assert.equal(state.shown, true);
});

test('the founder wallet is not blocked, and a profile flag hides the card on another device', () => {
  const fresh = play(memoryStorage(), { shown: false, visible: false }, {
    type: 'result',
    result: 'win',
    founderWallet: true,
    priorMissionWins: 40
  });
  assert.deepEqual(fresh, { shown: true, visible: true });

  const otherDevice = memoryStorage();
  const hidden = play(otherDevice, { shown: false, visible: false }, {
    type: 'result',
    result: 'win',
    profileShown: true,
    founderWallet: true
  });
  assert.deepEqual(hidden, { shown: true, visible: false });
  assert.equal(prompt.shouldShowMissionFeedback({
    result: 'win',
    deviceShown: false,
    profileShown: true,
    founderWallet: true,
    priorMissionWins: 9
  }), false);
});
