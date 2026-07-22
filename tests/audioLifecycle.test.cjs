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
  let oscillatorsCreated = 0;

  class FakeAudioParam {
    targetValues = [];
    setTargetAtTime(value) { this.targetValues.push(value); }
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
    onended = null;
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
    createOscillator() {
      oscillatorsCreated += 1;
      return new FakeOscillatorNode();
    }
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
    masterGainParam: context.module.exports.audioService.masterGain.gain,
    document: context.document,
    listeners,
    intervals,
    get oscillatorsCreated() {
      return oscillatorsCreated;
    }
  };
};

test('six-step volume scales the master gain and mute restores the last audible notch', () => {
  const harness = loadAudioService();

  assert.equal(harness.audioService.getVolumeLevel(), 5);
  harness.audioService.setVolumeLevel(3);
  assert.equal(harness.audioService.getVolumeLevel(), 3);
  assert.ok(Math.abs(harness.masterGainParam.targetValues.at(-1) - 0.18) < 0.00001);

  assert.equal(harness.audioService.toggleMute(), true);
  assert.equal(harness.audioService.getVolumeLevel(), 0);
  assert.equal(harness.masterGainParam.targetValues.at(-1), 0);

  assert.equal(harness.audioService.toggleMute(), false);
  assert.equal(harness.audioService.getVolumeLevel(), 3);
  assert.ok(Math.abs(harness.masterGainParam.targetValues.at(-1) - 0.18) < 0.00001);
});

test('the zero volume notch mutes while choosing a nonzero notch resumes at that level', () => {
  const harness = loadAudioService();

  assert.equal(harness.audioService.setVolumeLevel(0), 0);
  assert.equal(harness.audioService.isMuted(), true);
  assert.equal(harness.masterGainParam.targetValues.at(-1), 0);

  assert.equal(harness.audioService.setVolumeLevel(2), 2);
  assert.equal(harness.audioService.isMuted(), false);
  assert.ok(Math.abs(harness.masterGainParam.targetValues.at(-1) - 0.12) < 0.00001);
});

test('mission music opens with one launch cue and one progressive sequencer timer', () => {
  const harness = loadAudioService();
  harness.audioService.startMusic();

  assert.equal(harness.intervals.size, 1);
  assert.ok(harness.oscillatorsCreated >= 6);

  const afterFirstStart = harness.oscillatorsCreated;
  harness.audioService.startMusic();
  assert.equal(harness.intervals.size, 1);
  assert.equal(harness.oscillatorsCreated, afterFirstStart);

  const pulse = [...harness.intervals.values()][0];
  pulse();
  assert.ok(harness.oscillatorsCreated > afterFirstStart);
});

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
