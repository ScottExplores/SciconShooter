const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const MUSIC_STORAGE_KEY = 'scicon-shooter:mission-music-track:v1';

const loadAudioService = (initialStoredValues = {}, options = {}) => {
  const source = fs.readFileSync(path.join(root, 'services', 'audioService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const musicPlayers = [];
  const audioContexts = [];
  const fetchCalls = [];
  const decodedSampleData = [];
  const storedValues = new Map(Object.entries(initialStoredValues));
  let nextTimerId = 1;
  let oscillatorsCreated = 0;

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
    }
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

  class FakeAudioContext {
    constructor() {
      this.state = options.initialContextState || 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.suspendCalls = 0;
      this.resumeCalls = 0;
      if (options.decodeAudioData) {
        this.decodeAudioData = async (data) => {
          decodedSampleData.push(data);
          if (options.decodeAudioData === 'reject') throw new Error('decode failed');
          return { duration: 1 };
        };
      }
      audioContexts.push(this);
    }
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
    constructor(src = '') {
      this.src = src ? new URL(src, 'http://localhost/').href : '';
      this.currentTime = 0;
      this.loop = false;
      this.preload = 'none';
      this.volume = 1;
      this.paused = true;
      this.readyState = options.initialMediaReadyState ?? 4;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.loadCalls = 0;
      this.listeners = new Map();
      musicPlayers.push(this);
    }
    setAttribute() {}
    addEventListener(type, listener, listenerOptions = {}) {
      const listeners = this.listeners.get(type) || [];
      listeners.push({ listener, once: Boolean(listenerOptions?.once) });
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      this.listeners.set(type, listeners.filter((entry) => entry.listener !== listener));
    }
    dispatch(type) {
      if (type === 'ended') this.paused = true;
      const listeners = [...(this.listeners.get(type) || [])];
      listeners.forEach(({ listener }) => listener({ type, target: this }));
      this.listeners.set(type, listeners.filter(({ once }) => !once));
    }
    play() {
      this.playCalls += 1;
      const outcome = options.playOutcome?.(this, this.playCalls, musicPlayers.indexOf(this));
      if (outcome === 'reject') {
        this.paused = true;
        return Promise.reject(new Error('play rejected'));
      }
      if (outcome && typeof outcome.then === 'function') {
        return outcome.then(() => {
          this.paused = false;
        });
      }
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.pauseCalls += 1;
    }
    load() { this.loadCalls += 1; }
  }

  const document = {
    hidden: false,
    addEventListener(type, listener) {
      addListener(documentListeners, type, listener);
    }
  };
  const window = {
    AudioContext: FakeAudioContext,
    location: { href: 'http://localhost/' },
    localStorage: {
      getItem: (key) => storedValues.get(key) ?? null,
      setItem: (key, value) => storedValues.set(key, value)
    },
    addEventListener(type, listener) {
      addListener(windowListeners, type, listener);
    },
    setInterval(callback) {
      const id = nextTimerId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback) {
      const id = nextTimerId++;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    }
  };
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    URL,
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
  const runIntervals = (rounds = 1) => {
    for (let round = 0; round < rounds; round++) {
      [...intervals.values()].forEach((callback) => callback());
    }
  };
  const runTimeouts = () => {
    const pending = [...timeouts.entries()];
    pending.forEach(([id, callback]) => {
      if (!timeouts.has(id)) return;
      timeouts.delete(id);
      callback();
    });
  };
  const flushPromises = async (rounds = 6) => {
    for (let round = 0; round < rounds; round++) await Promise.resolve();
  };

  return {
    audioService: context.module.exports.audioService,
    missionTracks: context.module.exports.MISSION_MUSIC_TRACKS,
    document,
    intervals,
    timeouts,
    musicPlayers,
    audioContexts,
    storedValues,
    fetchCalls,
    decodedSampleData,
    runIntervals,
    runTimeouts,
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
    },
    get musicGainParam() {
      return context.module.exports.audioService.musicGain?.gain || null;
    },
    get currentMusicPlayer() {
      return context.module.exports.audioService.musicPlayer || null;
    },
    get pendingMusicPlayer() {
      return context.module.exports.audioService.pendingMusicPlayer || null;
    },
    get oscillatorsCreated() {
      return oscillatorsCreated;
    }
  };
};

test('two reusable music decks are precreated but playback stays locked until a user gesture', async () => {
  const harness = loadAudioService();

  assert.equal(harness.audioContexts.length, 0);
  assert.equal(harness.musicPlayers.length, 2);
  assert.deepEqual(harness.musicPlayers.map((player) => player.playCalls), [0, 0]);
  assert.equal(harness.audioService.getMusicScene(), 'silent');

  harness.audioService.setMusicScene('home');
  assert.equal(harness.audioService.getMusicScene(), 'home');
  assert.equal(harness.audioContexts.length, 0);
  assert.equal(harness.musicPlayers.length, 2);

  harness.audioService.init();
  assert.deepEqual(
    harness.musicPlayers.map((player) => player.playCalls),
    [1, 1],
    'both persistent decks must receive play() synchronously in the gesture stack'
  );
  await harness.flushPromises();

  assert.equal(harness.audioContexts.length, 1);
  assert.equal(harness.audioContext.resumeCalls, 1);
  assert.equal(harness.musicPlayers.length, 2, 'scene changes must reuse the same two decks');
  assert.match(harness.currentMusicPlayer.src, /\/audio\/music\/home-stillness\.mp3$/);
  assert.equal(harness.currentMusicPlayer.loop, true);
});

test('ordinary UI cues reuse the first successful media authorization without replaying both decks', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicScene('home');

  harness.audioService.playUiSound('click');
  await harness.flushPromises();
  const authorizedPlayCalls = harness.musicPlayers.map((player) => player.playCalls);
  const authorizedSources = harness.musicPlayers.map((player) => player.src);
  const authorizedLoadCalls = harness.musicPlayers.map((player) => player.loadCalls);

  harness.audioService.playUiSound('open');
  await harness.flushPromises();

  assert.deepEqual(harness.musicPlayers.map((player) => player.playCalls), authorizedPlayCalls);
  assert.deepEqual(harness.musicPlayers.map((player) => player.src), authorizedSources);
  assert.deepEqual(harness.musicPlayers.map((player) => player.loadCalls), authorizedLoadCalls);
});

test('a rejected first media authorization remains retryable on the next UI gesture', async () => {
  let rejectUnlock = true;
  const harness = loadAudioService({}, {
    playOutcome: () => rejectUnlock ? 'reject' : undefined
  });
  harness.audioService.setMusicScene('home');

  harness.audioService.playUiSound('click');
  await harness.flushPromises();
  assert.deepEqual(harness.musicPlayers.map((player) => player.playCalls), [1, 1]);

  rejectUnlock = false;
  harness.audioService.playUiSound('open');
  await harness.flushPromises();
  assert.deepEqual(harness.musicPlayers.map((player) => player.playCalls), [2, 2]);
});

test('home, mission, and boss scenes use dedicated tracks with a dual-player crossfade', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();

  const home = harness.currentMusicPlayer;
  harness.runIntervals(12);
  assert.ok(home.volume > 0);

  harness.audioService.setMusicScene('mission');
  await harness.flushPromises();
  const mission = harness.currentMusicPlayer;
  assert.match(mission.src, /\/audio\/music\/mission-racing\.mp3$/);
  assert.equal(mission.loop, false);
  assert.equal(home.paused, false);
  assert.equal(mission.paused, false);
  assert.equal(mission.volume, 0);

  harness.runIntervals(6);
  assert.ok(home.volume > 0, 'outgoing music should still be audible halfway through the fade');
  assert.ok(mission.volume > 0, 'incoming music should be audible halfway through the fade');
  harness.runIntervals(6);
  assert.equal(home.paused, true);
  assert.ok(Math.abs(mission.volume - (0.04 * 0.78)) < 0.00001);

  harness.audioService.setMusicScene('boss');
  await harness.flushPromises();
  const boss = harness.currentMusicPlayer;
  assert.match(boss.src, /\/audio\/music\/boss-battle\.mp3$/);
  assert.equal(boss.loop, true);
  assert.equal(boss.volume, 0);
  assert.equal(mission.paused, false);
  harness.runIntervals(12);
  assert.equal(mission.paused, true);
  assert.ok(Math.abs(boss.volume - (0.04 * 0.92)) < 0.00001);

  harness.audioService.setMusicScene('results');
  assert.equal(harness.audioService.getMusicScene(), 'results');
  harness.runIntervals(12);
  assert.equal(boss.paused, true);
  assert.equal(harness.intervals.size, 0);
});

test('a rapid second gesture leaves the outgoing crossfade deck intact', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();
  harness.runIntervals(12);

  const home = harness.currentMusicPlayer;
  harness.audioService.setMusicScene('mission');
  await harness.flushPromises();
  const homeSrc = home.src;
  const homePauseCalls = home.pauseCalls;

  harness.audioService.init();
  await harness.flushPromises();

  assert.equal(home.src, homeSrc);
  assert.equal(home.pauseCalls, homePauseCalls);
  assert.equal(home.paused, false);
  harness.runIntervals(12);
  assert.equal(home.paused, true);
});

test('a rejected incoming deck leaves outgoing music audible and retries on the next gesture', async () => {
  let rejectMission = true;
  const harness = loadAudioService({}, {
    playOutcome: (player) => (
      rejectMission && /mission-racing\.mp3$/.test(player.src) ? 'reject' : undefined
    )
  });
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();
  harness.runIntervals(12);
  const home = harness.currentMusicPlayer;
  const homeVolume = home.volume;

  harness.audioService.setMusicScene('mission');
  await harness.flushPromises();
  assert.equal(harness.currentMusicPlayer, home);
  assert.equal(home.paused, false);
  assert.equal(home.volume, homeVolume);
  assert.equal(harness.intervals.size, 0, 'no crossfade starts until incoming play succeeds');
  assert.match(harness.pendingMusicPlayer.src, /mission-racing\.mp3$/);

  rejectMission = false;
  harness.audioService.init();
  await harness.flushPromises();
  assert.match(harness.currentMusicPlayer.src, /mission-racing\.mp3$/);
  assert.equal(home.paused, false);
  harness.runIntervals(12);
  assert.equal(home.paused, true);
  assert.equal(harness.musicPlayers.length, 2);
});

test('results cancel a slow incoming deck so combat music cannot commit after the run ends', async () => {
  let resolveMission;
  let delayMission = false;
  const missionPlayback = new Promise((resolve) => { resolveMission = resolve; });
  const harness = loadAudioService({}, {
    playOutcome: (player) => (
      delayMission && /mission-racing\.mp3$/.test(player.src) ? missionPlayback : undefined
    )
  });
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();
  harness.runIntervals(12);

  delayMission = true;
  harness.audioService.setMusicScene('mission');
  const mission = harness.pendingMusicPlayer;
  harness.audioService.setMusicScene('results');
  resolveMission();
  await harness.flushPromises();
  harness.runIntervals(12);

  assert.equal(harness.audioService.getMusicScene(), 'results');
  assert.equal(harness.currentMusicPlayer, null);
  assert.equal(mission.paused, true);
});

test('the six-track mission playlist advances on ended events and wraps after its procedural track', async () => {
  const harness = loadAudioService({
    [MUSIC_STORAGE_KEY]: 'acid-clatter'
  });
  assert.deepEqual(
    Array.from(harness.missionTracks, (track) => track.id),
    ['scicon-flight', 'acid-clatter', 'pressure', 'exellent', 'racing-asteroids', 'final-hour']
  );

  harness.audioService.setMusicScene('mission');
  harness.audioService.init();
  await harness.flushPromises();

  const expectedFileSequence = [
    ['acid-clatter', /acid-clatter\.mp3$/],
    ['pressure', /pressure\.mp3$/],
    ['exellent', /exellent\.mp3$/],
    ['racing-asteroids', /mission-racing\.mp3$/],
    ['final-hour', /final-hour\.mp3$/]
  ];

  for (let index = 0; index < expectedFileSequence.length; index++) {
    const [trackId, sourcePattern] = expectedFileSequence[index];
    const player = harness.currentMusicPlayer;
    assert.equal(harness.audioService.getMusicTrackId(), trackId);
    assert.match(player.src, sourcePattern);
    assert.equal(player.loop, false);
    player.dispatch('ended');
    await harness.flushPromises();
    harness.runIntervals(12);
  }

  assert.equal(harness.audioService.getMusicTrackId(), 'scicon-flight');
  assert.equal(harness.intervals.size, 1, 'the procedural playlist entry should start its sequencer');
  assert.equal(harness.audioService.advanceMusicTrack(), 'acid-clatter');
  await harness.flushPromises();
  assert.equal(harness.audioService.getMusicTrackId(), 'acid-clatter');
  assert.equal(harness.storedValues.get(MUSIC_STORAGE_KEY), 'acid-clatter');
  assert.match(harness.currentMusicPlayer.src, /acid-clatter\.mp3$/);
});

test('the licensed mission track is the new-user fallback while stored legacy selections remain honored', () => {
  const freshHarness = loadAudioService();
  const legacyHarness = loadAudioService({ [MUSIC_STORAGE_KEY]: 'pressure' });
  const invalidHarness = loadAudioService({ [MUSIC_STORAGE_KEY]: 'not-a-track' });

  assert.equal(freshHarness.audioService.getMusicTrackId(), 'racing-asteroids');
  assert.equal(legacyHarness.audioService.getMusicTrackId(), 'pressure');
  assert.equal(invalidHarness.audioService.getMusicTrackId(), 'racing-asteroids');
});

test('pause and visibility changes preserve the current scene track position', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();

  const home = harness.currentMusicPlayer;
  home.currentTime = 18.5;
  harness.audioService.pauseMusic();
  assert.equal(home.paused, true);
  assert.equal(home.currentTime, 18.5);

  harness.audioService.resumeMusic();
  await harness.flushPromises();
  assert.equal(home.playCalls, 2);
  assert.equal(home.currentTime, 18.5);

  harness.document.hidden = true;
  harness.dispatchDocument('visibilitychange');
  await harness.flushPromises();
  assert.equal(home.paused, true);
  assert.equal(home.currentTime, 18.5);
  assert.equal(harness.audioContext.suspendCalls, 1);

  harness.document.hidden = false;
  harness.dispatchDocument('visibilitychange');
  await harness.flushPromises();
  assert.equal(harness.audioContext.resumeCalls, 2);
  assert.equal(home.playCalls, 3);
  assert.equal(home.currentTime, 18.5);
});

test('pagehide silences requested music and stopped music does not restart on pageshow', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();
  const home = harness.currentMusicPlayer;

  harness.dispatchWindow('pagehide');
  await harness.flushPromises();
  assert.equal(home.paused, true);

  harness.audioService.stopMusic();
  harness.dispatchWindow('pageshow');
  await harness.flushPromises();
  assert.equal(home.playCalls, 1);
});

test('sound-effects controls remain independent while global mute gates both buses', () => {
  const harness = loadAudioService();
  harness.audioService.init();

  assert.equal(harness.audioService.getSfxVolumeLevel(), 5);
  assert.equal(harness.audioService.getMusicVolumeLevel(), 5);
  harness.audioService.setSfxVolumeLevel(3);
  assert.ok(Math.abs(harness.sfxGainParam.targetValues.at(-1) - 0.18) < 0.00001);
  assert.ok(Math.abs(harness.musicGainParam.targetValues.at(-1) - 0.014) < 0.00001);

  assert.equal(harness.audioService.toggleMute(), true);
  assert.equal(harness.audioService.getSfxVolumeLevel(), 3);
  assert.equal(harness.masterGainParam.targetValues.at(-1), 0);

  assert.equal(harness.audioService.toggleMute(), false);
  assert.equal(harness.masterGainParam.targetValues.at(-1), 1);
  assert.ok(Math.abs(harness.sfxGainParam.targetValues.at(-1) - 0.18) < 0.00001);
});

test('raising a volume control unmutes and resumes requested music', async () => {
  const harness = loadAudioService();
  harness.audioService.setMusicScene('home');
  harness.audioService.init();
  await harness.flushPromises();
  harness.runIntervals(12);
  const home = harness.currentMusicPlayer;

  assert.equal(harness.audioService.toggleMute(), true);
  const playsBefore = home.playCalls;
  harness.audioService.setMusicVolumeLevel(4);
  await harness.flushPromises();

  assert.equal(harness.audioService.isMuted(), false);
  assert.ok(home.playCalls > playsBefore);
  assert.equal(home.paused, false);
});

test('mission track subscribers receive manual and automatic playlist changes', async () => {
  const harness = loadAudioService();
  const changes = [];
  const unsubscribe = harness.audioService.subscribeMusicTrack((trackId) => changes.push(trackId));

  harness.audioService.setMusicTrack('pressure');
  harness.audioService.setMusicScene('mission');
  harness.audioService.init();
  await harness.flushPromises();
  harness.currentMusicPlayer.dispatch('ended');
  await harness.flushPromises();

  assert.deepEqual(changes, ['pressure', 'exellent']);
  unsubscribe();
  harness.audioService.setMusicTrack('final-hour');
  assert.deepEqual(changes, ['pressure', 'exellent']);
});

test('only UI samples fetch eagerly and decoded ArrayBuffers are released', async () => {
  const harness = loadAudioService({}, {
    decodeAudioData: true,
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
  assert.ok(harness.decodedSampleData.length >= 14);
  assert.deepEqual(Object.keys(harness.audioService.preparedSampleData), []);
});

test('the old notch-two default migrates while explicit mute and custom levels remain respected', () => {
  const migratedHarness = loadAudioService({ 'scicon-shooter:music-volume:v1': '2' });
  const mutedHarness = loadAudioService({ 'scicon-shooter:music-volume:v1': '0' });
  const customHarness = loadAudioService({ 'scicon-shooter:music-volume:v1': '3' });

  assert.equal(migratedHarness.audioService.getMusicVolumeLevel(), 5);
  assert.equal(migratedHarness.storedValues.get('scicon-shooter:music-volume:v2'), '5');
  assert.equal(mutedHarness.audioService.getMusicVolumeLevel(), 0);
  assert.equal(customHarness.audioService.getMusicVolumeLevel(), 3);
});

test('server-side game simulations can import audio without a media element global', async () => {
  const harness = loadAudioService({}, { withoutMediaElement: true });

  assert.equal(harness.musicPlayers.length, 0);
  assert.doesNotThrow(() => harness.audioService.setMusicScene('home'));
  await assert.doesNotReject(() => harness.audioService.prepareMusicScene('home'));
});

test('App owns scene music and GameCanvas teardown does not stop the global soundtrack', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const canvasSource = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');

  assert.match(appSource, /audioService\.setMusicScene\(isBossArchiveRun \|\| majorBossMusicActive \? 'boss' : 'mission'\)/);
  assert.match(appSource, /audioService\.setMusicScene\('results'\)/);
  assert.match(appSource, /audioService\.setMusicScene\(campaignMapOpen \? 'map' : 'home'\)/);
  assert.match(appSource, /gameState === GameState\.PAUSED[\s\S]*audioService\.pauseMusic\(\)/);
  assert.match(appSource, /gameState === GameState\.PLAYING[\s\S]*audioService\.resumeMusic\(\)/);
  assert.doesNotMatch(canvasSource, /audioService\.stopMusic\(\)/);
});
