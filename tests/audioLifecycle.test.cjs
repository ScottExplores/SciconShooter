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
  const oscillators = [];
  const gainNodes = [];
  let clockMs = 10_000;
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
      gainNodes.push(this);
    }
  }

  class FakeOscillatorNode extends FakeAudioNode {
    constructor() {
      super();
      this.frequency = new FakeAudioParam();
      this.detune = new FakeAudioParam();
      this.onended = null;
      this.stopCalls = 0;
      this.stopTimes = [];
      oscillators.push(this);
    }
    start() {}
    stop(time) { this.stopCalls += 1; this.stopTimes.push(time); }
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
    performance: { now: () => clockMs },
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
    oscillators,
    gainNodes,
    advanceTime: (milliseconds) => {
      clockMs += milliseconds;
      for (const ctx of audioContexts) ctx.currentTime += milliseconds / 1000;
    },
    playerWeaponVoiceProfiles: context.module.exports.PLAYER_WEAPON_VOICE_PROFILES,
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

test('non-RSC primary voice identity uses one click-safe oscillator per existing event', () => {
  for (const family of ['bio', 'eth', 'btc']) {
    const harness = loadAudioService();
    harness.dispatchWindow('pointerdown');
    const release = harness.audioService.bindPlayerWeaponFamily(family);
    harness.audioService.playSound('shoot', 1, { pitchJitter: 0, pitchOffset: 0 });
    const profile = harness.playerWeaponVoiceProfiles[family];
    assert.equal(harness.oscillators.length, 1);
    assert.equal(harness.bufferSources.length, 0);
    assert.equal(harness.oscillators[0].type, profile.waveform);
    assert.equal(harness.oscillators[0].frequency.setValues[0], profile.startHz);
    const envelope = harness.gainNodes.at(-1).gain;
    assert.equal(envelope.setValues[0], 0.0001, 'no abrupt full-volume attack');
    assert.equal(envelope.rampValues[0], profile.gain);
    assert.equal(envelope.rampValues.at(-1), 0.0001, 'release reaches silence before stop');
    assert.ok(profile.gain <= 0.13);
    assert.ok(harness.oscillators[0].stopTimes[0] <= 0.096);
    harness.oscillators[0].onended();
    assert.equal(harness.audioService.activeProceduralNodes.size, 0);
    release();
  }
});

test('voice ownership restores RSC and older preview cleanup cannot clobber a new canvas', () => {
  const harness = loadAudioService();
  harness.dispatchWindow('pointerdown');
  const releaseBio = harness.audioService.bindPlayerWeaponFamily('bio');
  const releaseEth = harness.audioService.bindPlayerWeaponFamily('eth');
  releaseBio();
  harness.audioService.playSound('shoot', 1, { pitchJitter: 0, pitchOffset: 0 });
  assert.equal(harness.oscillators.at(-1).frequency.setValues[0], 1320);
  releaseEth();
  harness.advanceTime(100);
  harness.audioService.playSound('shoot', 1, { pitchJitter: 0, pitchOffset: 0 });
  assert.equal(harness.oscillators.at(-1).frequency.setValues[0], 520);
  assert.equal(harness.oscillators.at(-1).type, 'triangle');
  assert.equal(harness.gainNodes.at(-1).gain.setValues[0], 0.12, 'original RSC attack remains unchanged');
});

test('primary voice polish preserves rapid-fire throttling, mute, and hidden-page silence', () => {
  const harness = loadAudioService();
  harness.dispatchWindow('pointerdown');
  harness.audioService.bindPlayerWeaponFamily('btc');
  for (let millisecond = 0; millisecond < 280; millisecond++) {
    harness.audioService.playSound('shoot');
    harness.advanceTime(1);
  }
  assert.equal(harness.oscillators.length, 10, 'same one-event-per-28ms admission');
  harness.audioService.toggleMute();
  harness.advanceTime(100);
  harness.audioService.playSound('shoot');
  assert.equal(harness.oscillators.length, 10);
  harness.audioService.toggleMute();
  harness.audioService.setSfxVolumeLevel(0);
  harness.advanceTime(100);
  harness.audioService.playSound('shoot');
  assert.equal(harness.oscillators.length, 10);
  harness.audioService.setSfxVolumeLevel(5);
  harness.dispatchWindow('blur');
  harness.advanceTime(100);
  harness.audioService.playSound('shoot');
  assert.equal(harness.oscillators.length, 10);
});

test('only audio-enabled canvases bind a voice and React cleanup releases the owned scope', () => {
  const canvas = fs.readFileSync(path.join(root, 'components/GameCanvas.tsx'), 'utf8');
  assert.match(canvas, /useEffect\(\(\) => \{\s*if \(!audioEnabled\) return undefined;\s*return audioService\.bindPlayerWeaponFamily\(playerShipId\);\s*\}, \[audioEnabled, playerShipId\]\)/);
});

test('UI interaction initializes only WebAudio and never creates or plays background media', async () => {
  const harness = loadAudioService();

  assert.equal(harness.audioContexts.length, 0);
  assert.equal(harness.mediaElements.length, 0);
  harness.audioService.playUiSound('click');
  await harness.flushPromises();
  assert.equal(harness.audioContexts.length, 0, 'a scripted UI call is not a user gesture');
  harness.dispatchWindow('pointerdown');
  await harness.flushPromises();

  assert.equal(harness.audioContexts.length, 1);
  assert.equal(harness.audioContext.resumeCalls, 1);
  harness.audioService.playUiSound('click');
  assert.equal(harness.audioContexts.length, 1);
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
  harness.dispatchWindow('pointerdown');

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
  harness.dispatchWindow('pointerdown');
  harness.audioService.init();
  await harness.audioService.prepare();

  harness.audioService.playUiSound('confirm');
  assert.equal(harness.bufferSources.length, 1);
  assert.equal(harness.bufferSources[0].startCalls, 1);
  assert.equal(harness.mediaElements.length, 0);
});

test('sound-effects volume and global mute control the SFX bus', () => {
  const harness = loadAudioService();
  harness.dispatchWindow('pointerdown');
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

  harness.dispatchWindow('pointerdown');
  await harness.flushPromises();
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
  harness.dispatchWindow('pointerdown');
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

test('music requested before the first gesture starts on that gesture and does not construct early', async () => {
  const harness = loadAudioService({
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16)
    })
  });

  const pending = harness.audioService.playMusic('combat', { fadeSeconds: 0 });
  await harness.flushPromises();
  assert.equal(harness.audioContexts.length, 0);
  await pending;
  assert.equal(harness.bufferSources.length, 0);

  harness.dispatchWindow('pointerdown');
  await harness.flushPromises(12);
  assert.equal(harness.audioContexts.length, 1);
  assert.equal(harness.bufferSources.length, 1);
  assert.equal(harness.bufferSources[0].loop, true);
});

test('server-side simulations can import and prepare audio without a media-element global', async () => {
  const harness = loadAudioService({ withoutMediaElement: true });

  assert.equal(harness.mediaElements.length, 0);
  assert.doesNotThrow(() => harness.audioService.init());
  await assert.doesNotReject(() => harness.audioService.prepare());
});
