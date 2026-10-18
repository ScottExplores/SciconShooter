import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundled = async (file) => (await build({
  entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false
})).outputFiles[0].text;
const [synthesisCode, serviceCode] = await Promise.all([
  bundled('services/revamp/feel/audioSynthesis.ts'), bundled('services/audioService.ts')
]);

class Param {
  value = 0;
  calls = [];
  setValueAtTime(value, time) { this.value = value; this.calls.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.calls.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.calls.push(['exponential', value, time]); }
  setTargetAtTime(value, time, constant) { this.calls.push(['target', value, time, constant]); }
  cancelScheduledValues(time) { this.calls.push(['cancel', time]); }
}

class Node {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  detune = new Param();
  connected = [];
  starts = [];
  stops = [];
  connect(target) { this.connected.push(target); }
  disconnect() { this.disconnected = true; }
  start(...args) { this.starts.push(args); }
  stop(...args) { this.stops.push(args); }
}

function makeContextClass() {
  return class Context {
    static instances = [];
    state = 'running';
    sampleRate = 48000;
    currentTime = 0;
    destination = new Node();
    nodes = [];
    buffers = [];
    constructor() { this.constructor.instances.push(this); }
    node(kind) { const node = new Node(); node.kind = kind; this.nodes.push(node); return node; }
    createGain() { return this.node('gain'); }
    createOscillator() { return this.node('oscillator'); }
    createBufferSource() { return this.node('source'); }
    createBiquadFilter() { return this.node('filter'); }
    createBuffer(_channels, count, rate) {
      const data = new Float32Array(count);
      const buffer = { duration: count / rate, getChannelData: () => data };
      this.buffers.push(buffer);
      return buffer;
    }
    async decodeAudioData() { return { duration: 30 }; }
    async suspend() { this.state = 'suspended'; }
    async resume() { this.state = 'running'; }
  };
}

function evaluate(code, extras = {}) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, ...extras });
  return module.exports;
}

const { createCueLayers, pickupPitch, PickupAudioLadder, FeelAudioSynth, FEEL_AUDIO_MAX_VOICES } = evaluate(synthesisCode);

test('pickup ladder rises through ten notes, caps, and resets after a pause', () => {
  const ladder = new PickupAudioLadder();
  for (let i = 1; i <= 15; i++) assert.equal(ladder.next(i * 30), Math.min(i, 10));
  assert.equal(ladder.next(1400), 1);
  assert.equal(ladder.next(1430, 7), 7);
  assert.equal(ladder.next(1460), 8);
  for (let i = 2; i <= 10; i++) assert.ok(pickupPitch(i) > pickupPitch(i - 1));
  assert.equal(pickupPitch(100), pickupPitch(10));
  assert.equal(pickupPitch(NaN), 1);
});

test('layered cues use short, finite, click-free envelopes and progressively deeper explosions', () => {
  const cues = ['shoot', 'impact', 'hit', 'armored_hit', 'explosion_small', 'explosion_elite',
    'explosion_boss_part', 'coin', 'powerup', 'boss_alert', 'siren', 'phase_change',
    'ui_click', 'ui_confirm', 'ui_back', 'ui_error', 'ui_open', 'ui_close'];
  for (const cue of cues) {
    const layers = createCueLayers(cue, { pitch: NaN, intensity: Infinity });
    assert.ok(layers.length > 0 && layers.length <= 4, cue);
    for (const layer of layers) {
      assert.ok(layer.duration > layer.attack && layer.duration < 1, cue);
      assert.ok(layer.gain > 0 && layer.gain <= 0.4, cue);
      if (layer.wave !== 'noise') assert.ok(layer.startHz > 0 && layer.endHz > 0, cue);
    }
  }
  const tiers = ['small', 'elite', 'boss_part'].map((tier) => createCueLayers(`explosion_${tier}`)[0]);
  assert.ok(tiers[0].duration < tiers[1].duration && tiers[1].duration < tiers[2].duration);
  assert.ok(tiers[0].endHz > tiers[1].endHz && tiers[1].endHz > tiers[2].endHz);
});

test('synth reuses noise buffer, caps voices, and prioritizes boss warnings over shots', () => {
  const Context = makeContextClass();
  const ctx = new Context();
  const synth = new FeelAudioSynth(ctx, ctx.createGain());
  for (let i = 0; i < 200; i++) synth.play('shoot');
  assert.equal(synth.activeVoiceCount, FEEL_AUDIO_MAX_VOICES);
  assert.equal(ctx.buffers.length, 1);
  assert.equal(synth.play('boss_alert'), true);
  assert.equal(synth.activeVoiceCount, FEEL_AUDIO_MAX_VOICES);
  synth.stop();
  assert.equal(synth.activeVoiceCount, 0);
  ctx.state = 'suspended';
  assert.equal(synth.play('shoot'), false);
});

function setupService() {
  const Context = makeContextClass();
  const listeners = new Map();
  let time = 1000;
  const window = {
    AudioContext: Context,
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener(type, handler) { const list = listeners.get(type) ?? []; list.push(handler); listeners.set(type, list); },
    removeEventListener(type, handler) { listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== handler)); }
  };
  const { audioService } = evaluate(serviceCode, {
    window, navigator: { userActivation: { hasBeenActive: false } },
    document: { hidden: false, addEventListener() {} },
    performance: { now: () => time },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
  });
  return {
    service: audioService, Context,
    gesture(trusted) { for (const handler of [...(listeners.get('pointerdown') ?? [])]) handler({ isTrusted: trusted }); },
    advance(ms) { time += ms; if (Context.instances[0]) Context.instances[0].currentTime += ms / 1000; }
  };
}

test('service creates no audio graph before first trusted gesture and respects mute/SFX zero', async () => {
  const { service, Context, gesture, advance } = setupService();
  service.init();
  await service.prepare();
  service.playSound('shoot');
  service.playUiSound('click');
  await service.playMusic('menu');
  gesture(false);
  assert.equal(Context.instances.length, 0);
  gesture(true);
  assert.equal(Context.instances.length, 1);
  const ctx = Context.instances[0];
  service.playSound('shoot');
  assert.equal(ctx.nodes.filter((node) => node.kind === 'oscillator').length, 1);
  service.setSfxVolumeLevel(0);
  advance(100);
  service.playSound('explosion_elite');
  service.playUiSound('click');
  assert.equal(ctx.nodes.filter((node) => node.kind === 'oscillator').length, 1);
  service.setSfxVolumeLevel(3);
  service.toggleMute();
  advance(100);
  service.playSound('phase_change');
  assert.equal(ctx.nodes.filter((node) => node.kind === 'oscillator').length, 1);
});

test('boss warning ducks existing music and schedules restoration at the selected volume', async () => {
  const { service, Context, gesture } = setupService();
  gesture(true);
  await service.playMusic('combat');
  service.setMusicVolumeLevel(3);
  const ctx = Context.instances[0];
  const musicSource = ctx.nodes.find((node) => node.kind === 'source' && node.loop);
  assert.ok(musicSource);
  const musicGain = musicSource.connected[0];
  service.playSound('boss_alert');
  const targets = musicGain.gain.calls.filter((call) => call[0] === 'target');
  assert.ok(targets.some((call) => Math.abs(call[1] - 0.14 * 0.6 * 0.32) < 1e-8));
  assert.ok(targets.some((call) => Math.abs(call[1] - 0.14 * 0.6) < 1e-8 && call[2] >= 1.05));
  service.setMusicVolumeLevel(0);
  assert.equal(musicGain.gain.calls.at(-1)[1], 0);
});
