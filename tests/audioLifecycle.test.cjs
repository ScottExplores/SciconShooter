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
  const musicPlayers = [];
  const storedValues = new Map();

  class FakeAudioParam {
    targetValues = [];
    setValues = [];
    setTargetAtTime(value) { this.targetValues.push(value); }
    setValueAtTime(value) { this.setValues.push(value); }
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

  class FakeAudio {
    constructor(src) {
      this.src = new URL(src, 'http://localhost/').href;
      this.currentTime = 0;
      this.loop = false;
      this.preload = 'none';
      this.volume = 1;
      this.paused = true;
      this.playCalls = 0;
      this.pauseCalls = 0;
      musicPlayers.push(this);
    }
    setAttribute() {}
    play() {
      this.paused = false;
      this.playCalls += 1;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.pauseCalls += 1;
    }
  }

  const addListener = (type, listener) => listeners.set(type, listener);
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    Audio: FakeAudio,
    URL,
    performance: { now: () => 1000 },
    document: {
      hidden: false,
      addEventListener: addListener
    },
    window: {
      AudioContext: FakeAudioContext,
      location: { href: 'http://localhost/' },
      localStorage: {
        getItem: (key) => storedValues.get(key) || null,
        setItem: (key, value) => storedValues.set(key, value)
      },
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
    musicGainParam: context.module.exports.audioService.musicGain.gain,
    document: context.document,
    listeners,
    intervals,
    musicPlayers,
    storedValues,
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
  assert.equal(harness.musicGainParam.setValues.at(-1), 0.38);
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

test('mission music can switch to a supplied song and keeps master audio controls', async () => {
  const harness = loadAudioService();
  harness.audioService.startMusic();
  assert.equal(harness.intervals.size, 1);

  assert.equal(harness.audioService.setMusicTrack('acid-clatter'), 'acid-clatter');
  await Promise.resolve();
  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.musicPlayers.length, 1);
  assert.match(harness.musicPlayers[0].src, /\/audio\/music\/acid-clatter\.mp3$/);
  assert.equal(harness.musicPlayers[0].loop, true);
  assert.equal(harness.musicPlayers[0].playCalls, 1);
  assert.equal(harness.storedValues.get('scicon-shooter:mission-music-track:v1'), 'acid-clatter');

  harness.audioService.setVolumeLevel(2);
  assert.ok(Math.abs(harness.musicPlayers[0].volume - 0.056) < 0.00001);
  harness.audioService.toggleMute();
  assert.equal(harness.musicPlayers[0].paused, true);
  assert.equal(harness.musicPlayers[0].volume, 0);
});

test('pausing a mission pauses its song in place and resumes from the same position', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicTrack('pressure');
  harness.audioService.startMusic();
  await Promise.resolve();

  const player = harness.musicPlayers[0];
  player.currentTime = 18.5;
  assert.equal(player.playCalls, 1);

  harness.audioService.pauseMusic();
  assert.equal(player.paused, true);
  assert.equal(player.currentTime, 18.5);

  harness.audioService.resumeMusic();
  await Promise.resolve();
  assert.equal(player.playCalls, 2);
  assert.equal(player.currentTime, 18.5);
});

test('the procedural mix also stops its timer while paused and resumes without a new launch', () => {
  const harness = loadAudioService();
  harness.audioService.startMusic();
  assert.equal(harness.intervals.size, 1);
  const launchOscillators = harness.oscillatorsCreated;

  harness.audioService.pauseMusic();
  assert.equal(harness.intervals.size, 0);
  harness.audioService.resumeMusic();
  assert.equal(harness.intervals.size, 1);
  assert.ok(harness.oscillatorsCreated > launchOscillators);
});

test('playlist advancement wraps across the four mission tracks', () => {
  const harness = loadAudioService();
  assert.equal(harness.audioService.getMusicTrackId(), 'scicon-flight');
  assert.equal(harness.audioService.advanceMusicTrack(), 'acid-clatter');
  assert.equal(harness.audioService.advanceMusicTrack(2), 'exellent');
  assert.equal(harness.audioService.advanceMusicTrack(), 'scicon-flight');
});

test('switching back to the original mix resumes the procedural sequencer', () => {
  const harness = loadAudioService();
  harness.audioService.setMusicTrack('pressure');
  harness.audioService.startMusic();
  assert.equal(harness.musicPlayers.length, 1);
  assert.equal(harness.intervals.size, 0);

  harness.audioService.setMusicTrack('scicon-flight');
  assert.equal(harness.musicPlayers[0].paused, true);
  assert.equal(harness.intervals.size, 1);
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

test('the app pauses shared music and advances the playlist every two missions', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  assert.match(source, /gameState === GameState\.PAUSED[\s\S]*audioService\.pauseMusic\(\)/);
  assert.match(source, /gameState === GameState\.PLAYING[\s\S]*audioService\.resumeMusic\(\)/);
  assert.match(source, /Math\.floor\(\(mission - 1\) \/ 2\)/);
  assert.match(source, /audioService\.advanceMusicTrack\(advances\)/);
});
