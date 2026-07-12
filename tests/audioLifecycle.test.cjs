const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadAudioService = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'audioService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const listeners = new Map();
  const intervals = new Map();
  let nextIntervalId = 1;

  class FakeAudioParam {
    setTargetAtTime() {}
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }

  class FakeAudioNode {
    connect() {}
  }

  class FakeGainNode extends FakeAudioNode {
    gain = new FakeAudioParam();
  }

  class FakeOscillatorNode extends FakeAudioNode {
    frequency = new FakeAudioParam();
    start() {}
    stop() {}
  }

  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    suspendCalls = 0;
    resumeCalls = 0;
    createGain() { return new FakeGainNode(); }
    createOscillator() { return new FakeOscillatorNode(); }
    suspend() {
      this.state = 'suspended';
      this.suspendCalls += 1;
      return Promise.resolve();
    }
    resume() {
      this.state = 'running';
      this.resumeCalls += 1;
      return Promise.resolve();
    }
  }

  const addListener = (type, listener) => listeners.set(type, listener);
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    performance: { now: () => 1000 },
    document: {
      hidden: false,
      addEventListener: addListener
    },
    window: {
      AudioContext: FakeAudioContext,
      addEventListener: addListener,
      setInterval(callback) {
        const id = nextIntervalId++;
        intervals.set(id, callback);
        return id;
      },
      clearInterval(id) {
        intervals.delete(id);
      }
    }
  };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context);

  return {
    audioService: context.module.exports.audioService,
    audioContext: context.module.exports.audioService.ctx,
    document: context.document,
    listeners,
    intervals
  };
};

test('backgrounding clears music and suspends Web Audio until the page is visible again', async () => {
  const harness = loadAudioService();
  harness.audioService.startMusic();
  assert.equal(harness.intervals.size, 1);

  harness.document.hidden = true;
  harness.listeners.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.audioContext.suspendCalls, 1);

  harness.document.hidden = false;
  harness.listeners.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(harness.audioContext.resumeCalls, 1);
  assert.equal(harness.intervals.size, 1);
});

test('pagehide silences the app and stopped music does not restart on pageshow', async () => {
  const harness = loadAudioService();
  harness.audioService.startMusic();
  harness.listeners.get('pagehide')();
  await Promise.resolve();
  assert.equal(harness.intervals.size, 0);

  harness.audioService.stopMusic();
  harness.listeners.get('pageshow')();
  await Promise.resolve();
  assert.equal(harness.intervals.size, 0);
});

test('the game canvas stops shared music when its engine unmounts', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
  assert.match(source, /if \(audioEnabled\) audioService\.stopMusic\(\)/);
});
