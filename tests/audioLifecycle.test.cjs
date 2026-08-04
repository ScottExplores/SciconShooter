const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadAudioService = (options = {}) => {
  const source = fs.readFileSync(path.join(root, 'services', 'audioService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const audioContexts = [];
  const mediaElements = [];
  const fetchCalls = [];
  const decodedSampleData = [];
  const bufferSources = [];
  const storedValues = new Map(Object.entries(options.storedValues ?? {}));

  const addListener = (registry, type, listener) => {
    const listeners = registry.get(type) || [];
    listeners.push(listener);
    registry.set(type, listeners);
  };

  class FakeAudioParam {
    constructor() {
      this.targetValues = [];
      this.setValues = [];
      this.rampValues = [];
      this.cancelTimes = [];
    }
    cancelScheduledValues(time) { this.cancelTimes.push(time); }
    setTargetAtTime(value) { this.targetValues.push(value); }
    setValueAtTime(value) { this.setValues.push(value); }
    linearRampToValueAtTime(value) { this.rampValues.push(value); }
    exponentialRampToValueAtTime(value) { this.rampValues.push(value); }
  }

  class FakeAudioNode {
    connect() {}
  }

  class FakeGainNode extends FakeAudioNode {
    constructor() {
      super();
      this.gain = new FakeAudioParam();
    }
  }

  class FakeOscillatorNode extends FakeAudioNode {
    constructor() {
      super();
      this.frequency = new FakeAudioParam();
      this.detune = new FakeAudioParam();
      this.onended = null;
      this.stopCalls = 0;
    }
    start() {}
    stop() { this.stopCalls += 1; }
  }

  class FakeBufferSourceNode extends FakeAudioNode {
    constructor() {
      super();
      this.buffer = null;
      this.playbackRate = new FakeAudioParam();
      this.onended = null;
      this.loop = false;
      this.startCalls = 0;
      this.stopCalls = 0;
      bufferSources.push(this);
    }
    start() { this.startCalls += 1; }
    stop() { this.stopCalls += 1; }
  }

  class FakeAudioContext {
    constructor() {
      this.state = options.initialContextState || 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.suspendCalls = 0;
      this.resumeCalls = 0;
      audioContexts.push(this);
    }
    createGain() { return new FakeGainNode(); }
    createOscillator() { return new FakeOscillatorNode(); }
    createBufferSource() { return new FakeBufferSourceNode(); }
    async decodeAudioData(data) {
      decodedSampleData.push(data);
      if (options.decodeAudioData === 'reject') throw new Error('decode failed');
      return { duration: 1 };
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
    constructor() {
      mediaElements.push(this);
    }
    play() {
      throw new Error('background media playback must never be requested');
    }
  }

  const document = {
    hidden: false,
    addEventListener(type, listener) {
      addListener(documentListeners, type, listener);
    }
  };
  const window = {
    AudioContext: FakeAudioContext,
    localStorage: {
      getItem: (key) => storedValues.get(key) ?? null,
      setItem: (key, value) => storedValues.set(key, value)
    },
    addEventListener(type, listener) {
      addListener(windowListeners, type, listener);
    }
  };
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    performance: { now: () => 10_000 },
    document,
    window,
    ...(!options.withoutMediaElement ? { Audio: FakeAudio } : {}),
    ...(options.fetch ? {
      fetch: async (url) => {
        fetchCalls.push(url);
        return options.fetch(url);
      }
    } : {})
  };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context);

  const dispatchAll = (registry, type) => {
    (registry.get(type) || []).forEach((listener) => listener({ type }));
  };
  const flushPromises = async (rounds = 8) => {
    for (let round = 0; round < rounds; round++) await Promise.resolve();
  };

  return {
    audioService: context.module.exports.audioService,
    cycleMatchMusicTrackId: context.module.exports.cycleMatchMusicTrackId,
    getSectorMatchMusicTrackId: context.module.exports.getSectorMatchMusicTrackId,
    audioContexts,
    mediaElements,
    fetchCalls,
    decodedSampleData,
    bufferSources,
    storedValues,
    flushPromises,
    dispatchDocument: (type) => dispatchAll(documentListeners, type),
    dispatchWindow: (type) => dispatchAll(windowListeners, type),
    get audioContext() {
      return audioContexts.at(-1) || null;
    },
    get masterGainParam() {
      return context.module.exports.audioService.masterGain?.gain || null;
    },
    get sfxGainParam() {
      return context.module.exports.audioService.sfxGain?.gain || null;
    }
  };
};

test('match music arrows wrap and Campaign sectors advance from the selected track', () => {
  const harness = loadAudioService();
  const { cycleMatchMusicTrackId, getSectorMatchMusicTrackId } = harness;

  assert.equal(cycleMatchMusicTrackId('combat', -1), 'event-horizon-run');
  assert.equal(cycleMatchMusicTrackId('event-horizon-run', 1), 'combat');
  assert.equal(getSectorMatchMusicTrackId(1, 'open-orbit-relay'), 'open-orbit-relay');
  assert.equal(getSectorMatchMusicTrackId(2, 'open-orbit-relay'), 'ion-veil-pursuit');
  assert.equal(getSectorMatchMusicTrackId(5, 'open-orbit-relay'), 'open-orbit-relay');
});

test('UI interaction initializes only WebAudio and never creates or plays background media', async () => {
  const harness = loadAudioService();

  assert.equal(harness.audioContexts.length, 0);
  assert.equal(harness.mediaElements.length, 0);
  harness.audioService.playUiSound('click');
  await harness.flushPromises();

  assert.equal(harness.audioContexts.length, 1);
  assert.equal(harness.audioContext.resumeCalls, 1);
  assert.equal(harness.mediaElements.length, 0);
});

test('only interface samples fetch eagerly and full SFX preparation contains no music request', async () => {
  const harness = loadAudioService({
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16)
    })
  });
  await harness.flushPromises(12);

  assert.equal(harness.fetchCalls.length, 6);
  assert.ok(harness.fetchCalls.every((url) => url.startsWith('/audio/ui/')));

  await harness.audioService.prepare();
  await harness.flushPromises(12);
  assert.ok(harness.fetchCalls.some((url) => url === '/audio/sfx/boss-rotary-burst.wav'));
  assert.ok(harness.fetchCalls.some((url) => url.includes('victory-signet')));
  assert.ok(harness.fetchCalls.every((url) => !url.startsWith('/audio/music/')));
  assert.ok(harness.decodedSampleData.length >= 14);
  assert.deepEqual(Object.keys(harness.audioService.preparedSampleData), []);
});

test('decoded UI samples still produce immediate interface feedback', async () => {
  const harness = loadAudioService({
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16)
    })
  });
  harness.audioService.init();
  await harness.audioService.prepare();

  harness.audioService.playUiSound('confirm');
  assert.equal(harness.bufferSources.length, 1);
  assert.equal(harness.bufferSources[0].startCalls, 1);
  assert.equal(harness.mediaElements.length, 0);
});

test('sound-effects volume and global mute control the SFX bus', () => {
  const harness = loadAudioService();
  harness.audioService.init();

  assert.equal(harness.audioService.getSfxVolumeLevel(), 5);
  harness.audioService.setSfxVolumeLevel(3);
  assert.ok(Math.abs(harness.sfxGainParam.targetValues.at(-1) - 0.18) < 0.00001);

  assert.equal(harness.audioService.toggleMute(), true);
  assert.equal(harness.masterGainParam.targetValues.at(-1), 0);
  assert.equal(harness.audioService.toggleMute(), false);
  assert.equal(harness.masterGainParam.targetValues.at(-1), 1);
  assert.ok(Math.abs(harness.sfxGainParam.targetValues.at(-1) - 0.18) < 0.00001);
});

test('persisted match-track selection restores valid ids and rejects invalid ids', () => {
  const storageKey = 'scicon-shooter:match-music:v1';
  const restored = loadAudioService({
    storedValues: { [storageKey]: 'ion-veil-pursuit' }
  });
  const invalid = loadAudioService({
    storedValues: { [storageKey]: 'not-a-match-track' }
  });

  assert.equal(restored.audioService.getMatchMusicTrackId(), 'ion-veil-pursuit');
  assert.equal(invalid.audioService.getMatchMusicTrackId(), 'combat');
});

test('setting the match track updates the active selection and persisted value', () => {
  const storageKey = 'scicon-shooter:match-music:v1';
  const harness = loadAudioService();

  assert.equal(harness.audioService.setMatchMusicTrackId('event-horizon-run'), 'event-horizon-run');
  assert.equal(harness.audioService.getMatchMusicTrackId(), 'event-horizon-run');
  assert.equal(harness.storedValues.get(storageKey), 'event-horizon-run');
});

test('match music loops while the defeat stinger remains one-shot', async () => {
  const harness = loadAudioService({
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16)
    })
  });

  await harness.audioService.playMusic('open-orbit-relay', { fadeSeconds: 0 });
  assert.equal(harness.bufferSources.length, 1);
  assert.equal(harness.bufferSources[0].loop, true);

  await harness.audioService.playMusic('defeat', { fadeSeconds: 0 });
  assert.equal(harness.bufferSources.length, 2);
  assert.equal(harness.bufferSources[0].stopCalls, 1);
  assert.equal(harness.bufferSources[1].loop, false);
});

test('page lifecycle suspends and resumes the SFX context without media elements', async () => {
  const harness = loadAudioService();
  harness.audioService.init();
  await harness.flushPromises();

  harness.dispatchWindow('pagehide');
  await harness.flushPromises();
  assert.equal(harness.audioContext.suspendCalls, 1);

  harness.dispatchWindow('pageshow');
  await harness.flushPromises();
  assert.ok(harness.audioContext.resumeCalls >= 2);
  assert.equal(harness.mediaElements.length, 0);
});

test('server-side simulations can import and prepare audio without a media-element global', async () => {
  const harness = loadAudioService({ withoutMediaElement: true });

  assert.equal(harness.mediaElements.length, 0);
  assert.doesNotThrow(() => harness.audioService.init());
  await assert.doesNotReject(() => harness.audioService.prepare());
});
