
type GameSoundType = 'shoot' | 'boss_shoot' | 'boss_cannon' | 'boss_machinegun' | 'boss_alert' | 'impact' | 'explode' | 'coin' | 'powerup' | 'hit' | 'boss_roar' | 'electricity' | 'siren' | 'launch' | 'wave' | 'mission_victory' | 'gameover' | 'missile' | 'bomb';
type SampleKey =
  | 'player-shot'
  | 'boss-shot'
  | 'boss-rotary-burst'
  | 'boss-warning'
  | 'mission-launch'
  | 'mission-victory'
  | 'hit'
  | 'explosion'
  | 'ui-click'
  | 'ui-confirm'
  | 'ui-back'
  | 'ui-error'
  | 'ui-open'
  | 'ui-close';

export type UiSoundType = 'click' | 'confirm' | 'back' | 'error' | 'open' | 'close';

type SampleProfile = {
  sample: SampleKey;
  volume: number;
  maxDuration: number;
};

const SAMPLE_URLS: Record<SampleKey, string> = {
  'player-shot': '/audio/sfx/player-shot.wav',
  'boss-shot': '/audio/sfx/boss-shot.wav',
  'boss-rotary-burst': '/audio/sfx/boss-rotary-burst.wav',
  'boss-warning': '/audio/sfx/boss-warning.wav',
  'mission-launch': '/audio/sfx/mission-launch.wav',
  'mission-victory': '/audio/ui/victory-signet/victory-signet-preview-mix.wav',
  hit: '/audio/sfx/hit.wav',
  explosion: '/audio/sfx/explosion.wav',
  'ui-click': '/audio/ui/click.wav',
  'ui-confirm': '/audio/ui/confirm.wav',
  'ui-back': '/audio/ui/back.wav',
  'ui-error': '/audio/ui/error.wav',
  'ui-open': '/audio/ui/open.wav',
  'ui-close': '/audio/ui/close.wav'
};

const SAMPLE_PROFILES: Partial<Record<GameSoundType, SampleProfile>> = {
  boss_shoot: { sample: 'boss-shot', volume: 0.24, maxDuration: 0.38 },
  boss_cannon: { sample: 'boss-shot', volume: 0.3, maxDuration: 0.48 },
  boss_machinegun: { sample: 'boss-rotary-burst', volume: 0.24, maxDuration: 0.62 },
  boss_alert: { sample: 'boss-warning', volume: 0.22, maxDuration: 2.6 },
  siren: { sample: 'boss-warning', volume: 0.18, maxDuration: 0.95 },
  launch: { sample: 'mission-launch', volume: 0.2, maxDuration: 2.1 },
  mission_victory: { sample: 'mission-victory', volume: 0.24, maxDuration: 2.8 },
  impact: { sample: 'hit', volume: 0.075, maxDuration: 0.16 },
  hit: { sample: 'hit', volume: 0.23, maxDuration: 0.42 },
  explode: { sample: 'explosion', volume: 0.2, maxDuration: 0.82 }
};

const SILENCE_GAIN = 0.0001;
const MAX_SFX_GAIN = 0.3;
// Player fire is intentionally shorter than the other combat cues, but it
// still needs enough level to survive small phone speakers and the shared SFX
// bus. The old 0.045 peak was effectively inaudible beside impact cues.
const PLAYER_SHOT_GAIN = 0.12;
const MAX_VOLUME_LEVEL = 5;
/**
 * Background music. Menu is the home-screen bed, combat runs under normal
 * waves, and boss swaps in for encounters -- the swap is the cue that a boss
 * has arrived, before the player has even seen it.
 */
export type MusicTrack = 'menu' | 'combat' | 'boss';

const MUSIC_ROOT = '/audio/scicon-audio-v1';
const MUSIC_URLS: Record<MusicTrack, string> = {
  menu: `${MUSIC_ROOT}/music-menu.wav`,
  combat: `${MUSIC_ROOT}/music-combat.wav`,
  boss: `${MUSIC_ROOT}/music-boss.wav`
};

/**
 * Music sits UNDER the effects, set by measurement rather than taste: at 0.34
 * the combat bed's effective RMS (0.051) overpowered every SFX cue (hit 0.006,
 * player shot 0.024, boss shot 0.043). 0.14 lands it at ~0.021 -- beneath the
 * player's own fire -- and the pause-menu slider owns it from there.
 */
const MUSIC_BASE_GAIN = 0.14;
const MUSIC_VOLUME_STORAGE_KEY = 'scicon-shooter:music-volume:v1';

const SFX_VOLUME_STORAGE_KEY = 'scicon-shooter:sfx-volume:v1';
const UI_SAMPLE_KEYS: ReadonlyArray<SampleKey> = [
  'ui-click',
  'ui-confirm',
  'ui-back',
  'ui-error',
  'ui-open',
  'ui-close'
];
const ALL_SAMPLE_KEYS = Object.keys(SAMPLE_URLS) as SampleKey[];

class AudioService {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private sfxVolumeLevel: number = MAX_VOLUME_LEVEL;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private activeProceduralNodes = new Set<OscillatorNode>();
  private activeSampleNodes = new Set<AudioBufferSourceNode>();
  private sampleBuffers: Partial<Record<SampleKey, AudioBuffer>> = {};
  private preparedSampleData: Partial<Record<SampleKey, ArrayBuffer>> = {};
  private samplePreparePromises: Partial<Record<SampleKey, Promise<void>>> = {};
  private sampleLoadPromises: Partial<Record<SampleKey, Promise<void>>> = {};
  private pendingUiSound: UiSoundType | null = null;
  private pageActive: boolean = typeof document === 'undefined' ? true : !document.hidden;
  private lastSoundTime: Partial<Record<GameSoundType, number>> = {};
  private lastUiSoundTime: Partial<Record<UiSoundType, number>> = {};

  constructor() {
    this.sfxVolumeLevel = this.readStoredVolumeLevel(SFX_VOLUME_STORAGE_KEY, MAX_VOLUME_LEVEL);

    // Only tiny interface cues are fetched eagerly. Mission combat assets warm
    // in the background and are never allowed to block gameplay launch.
    void this.prepareSamples(UI_SAMPLE_KEYS);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handlePageHide);
      window.addEventListener('pageshow', this.handlePageShow);
      window.addEventListener('blur', this.handleBlur);
      window.addEventListener('focus', this.handleFocus);
    }
  }

  private ensureAudioContext() {
    if (this.ctx) return this.ctx;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyAudioLevels();
      void this.preloadSamples(UI_SAMPLE_KEYS);
    } catch {
      console.error('WebAudio not supported');
    }
    return this.ctx;
  }

  private handleVisibilityChange = () => {
    this.setPageActive(!document.hidden);
  };

  private handlePageHide = () => {
    this.setPageActive(false);
  };

  private handlePageShow = () => {
    this.setPageActive(!document.hidden);
  };

  private handleBlur = () => {
    this.setPageActive(false);
  };

  private handleFocus = () => {
    if (!document.hidden) this.setPageActive(true);
  };

  private stopActiveSampleNodes() {
    this.activeSampleNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // The sample may already have reached its scheduled stop time.
      }
    });
    this.activeSampleNodes.clear();
  }

  private stopActiveProceduralNodes() {
    this.activeProceduralNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // The short procedural cue may already have ended.
      }
    });
    this.activeProceduralNodes.clear();
  }

  private readStoredVolumeLevel(storageKey: string, fallback: number) {
    try {
      const storedValue = window.localStorage?.getItem(storageKey);
      if (storedValue === null || storedValue === undefined || storedValue === '') return fallback;
      const storedLevel = Number(storedValue);
      if (Number.isFinite(storedLevel)) {
        return Math.max(0, Math.min(MAX_VOLUME_LEVEL, Math.round(storedLevel)));
      }
    } catch {
      // Embedded browsers can restrict local storage.
    }
    return fallback;
  }

  private storeVolumeLevel(storageKey: string, level: number) {
    try {
      window.localStorage?.setItem(storageKey, String(level));
    } catch {
      // The level still applies for this session when storage is unavailable.
    }
  }

  private prepareSamples(keys: ReadonlyArray<SampleKey> = ALL_SAMPLE_KEYS) {
    if (typeof fetch !== 'function') return Promise.resolve();

    const loads = keys.map((key) => {
      if (this.sampleBuffers[key] || this.preparedSampleData[key]) return Promise.resolve();
      const existing = this.samplePreparePromises[key];
      if (existing) return existing;

      const load = (async () => {
        try {
          const response = await fetch(SAMPLE_URLS[key]);
          if (!response.ok) return;
          this.preparedSampleData[key] = await response.arrayBuffer();
        } catch {
          // A missing optional cue never prevents the game from loading.
        }
      })();
      this.samplePreparePromises[key] = load;
      void load.finally(() => {
        if (!this.preparedSampleData[key] && !this.sampleBuffers[key]) {
          delete this.samplePreparePromises[key];
        }
      });
      return load;
    });
    return Promise.all(loads).then(() => undefined);
  }

  private preloadSamples(keys: ReadonlyArray<SampleKey> = ALL_SAMPLE_KEYS) {
    if (!this.ctx || typeof this.ctx.decodeAudioData !== 'function') {
      return Promise.resolve();
    }

    const context = this.ctx;
    const loads = keys.map((key) => {
      if (this.sampleBuffers[key]) return Promise.resolve();
      const existing = this.sampleLoadPromises[key];
      if (existing) return existing;

      const load = this.prepareSamples([key]).then(async () => {
        const data = this.preparedSampleData[key];
        if (!data) return;
        try {
          this.sampleBuffers[key] = await context.decodeAudioData(data);
        } catch {
          // Procedural gameplay fallbacks remain available if decode fails.
        } finally {
          // decodeAudioData may detach its input. Either way, do not retain a
          // second full copy of every combat sample for the rest of the run.
          delete this.preparedSampleData[key];
          delete this.samplePreparePromises[key];
        }
      });
      this.sampleLoadPromises[key] = load;
      void load.finally(() => {
        if (!this.sampleBuffers[key]) delete this.sampleLoadPromises[key];
      });
      return load;
    });

    return Promise.all(loads).then(() => {
      const pending = this.pendingUiSound;
      if (!pending || !this.sampleBuffers[`ui-${pending}` as SampleKey]) return;
      this.pendingUiSound = null;
      this.playUiSound(pending);
    });
  }

  private playSample(type: GameSoundType, intensity: number, pitch: number) {
    if (!this.ctx || !this.sfxGain || this.sfxVolumeLevel === 0) return false;
    const profile = SAMPLE_PROFILES[type];
    if (!profile) return false;
    const buffer = this.sampleBuffers[profile.sample];
    if (!buffer || typeof this.ctx.createBufferSource !== 'function') {
      void this.preloadSamples([profile.sample]);
      return false;
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const playbackRate = Math.max(0.72, Math.min(1.38, pitch));
    const intensityScale = type === 'explode'
      ? Math.max(0.5, Math.min(1.5, 0.62 + intensity * 0.3))
      : Math.max(0.65, Math.min(1.25, 0.82 + intensity * 0.12));
    const volume = profile.volume * intensityScale;
    const durationScale = type === 'explode'
      ? Math.max(0.72, Math.min(1.75, intensity))
      : 1;
    const duration = Math.max(0.06, Math.min(buffer.duration / playbackRate, profile.maxDuration * durationScale));
    const fadeStart = now + Math.max(0.01, duration - Math.min(0.14, duration * 0.35));

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.setValueAtTime(volume, fadeStart);
    gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, now + duration);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.onended = () => this.activeSampleNodes.delete(source);
    this.activeSampleNodes.add(source);
    source.start(now);
    source.stop(now + duration + 0.02);
    return true;
  }

  private playDirectSample(
    sample: SampleKey,
    volume: number,
    maxDuration: number,
    pitch: number = 1
  ) {
    if (!this.ctx || !this.sfxGain || this.sfxVolumeLevel === 0) return false;
    const buffer = this.sampleBuffers[sample];
    if (!buffer || typeof this.ctx.createBufferSource !== 'function') return false;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const playbackRate = Math.max(0.88, Math.min(1.12, pitch));
    const duration = Math.max(0.035, Math.min(buffer.duration / playbackRate, maxDuration));
    const fadeDuration = Math.min(0.08, duration * 0.3);

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.setValueAtTime(volume, now + Math.max(0.01, duration - fadeDuration));
    gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, now + duration);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.onended = () => this.activeSampleNodes.delete(source);
    this.activeSampleNodes.add(source);
    source.start(now);
    source.stop(now + duration + 0.02);
    return true;
  }

  public playUiSound(type: UiSoundType) {
    if (!this.ctx) {
      this.init();
    } else if (this.pageActive && !this.muted && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    if (!this.ctx || this.muted || !this.pageActive || this.sfxVolumeLevel === 0) return;

    const nowMs = performance.now();
    const cooldownMs = type === 'click' ? 45 : 70;
    if (nowMs - (this.lastUiSoundTime[type] || 0) < cooldownMs) return;
    const sample = `ui-${type}` as SampleKey;
    if (!this.sampleBuffers[sample]) {
      this.pendingUiSound = type;
      void this.preloadSamples([sample]);
      return;
    }

    this.lastUiSoundTime[type] = nowMs;
    const volume = type === 'confirm'
      ? 0.16
      : type === 'error'
        ? 0.14
        : 0.105;
    const maxDuration = type === 'open' || type === 'close' ? 0.42 : 0.28;
    this.playDirectSample(sample, volume, maxDuration);
  }

  private setPageActive(active: boolean) {
    if (this.pageActive === active) return;
    this.pageActive = active;

    if (!active) {
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
      void this.ctx?.suspend().catch(() => undefined);
      return;
    }

    if (this.muted) return;
    void this.ctx?.resume().catch(() => undefined);
    this.applyAudioLevels();
  }

  private getScaledSfxVolume() {
    return MAX_SFX_GAIN * (this.sfxVolumeLevel / MAX_VOLUME_LEVEL);
  }

  private applyAudioLevels() {
    const active = !this.muted && this.pageActive;
    this.setGainVolume(this.masterGain, active ? 1 : 0);
    this.setGainVolume(this.sfxGain, this.getScaledSfxVolume());
  }

  private setGainVolume(gainNode: GainNode | null, volume: number) {
    if (!gainNode) return;
    const t = this.ctx?.currentTime || 0;
    gainNode.gain.setTargetAtTime(volume, t, 0.08);
  }

  public init() {
    this.ensureAudioContext();
    void this.preloadSamples(UI_SAMPLE_KEYS);
    if (this.pageActive && !this.muted && this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    this.applyAudioLevels();
  }

  public async prepare() {
    this.ensureAudioContext();
    await this.preloadSamples(ALL_SAMPLE_KEYS);
  }

  public toggleMute() {
    this.muted = !this.muted;

    this.applyAudioLevels();
    if (this.muted) {
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
    } else if (this.pageActive) {
      this.init();
    }
    return this.muted;
  }

  public isMuted() {
    return this.muted;
  }

  public getVolumeLevel() {
    return this.sfxVolumeLevel;
  }

  public setVolumeLevel(level: number) {
    return this.setSfxVolumeLevel(level);
  }

  public getSfxVolumeLevel() {
    return this.sfxVolumeLevel;
  }

  public setSfxVolumeLevel(level: number) {
    const nextLevel = Math.max(0, Math.min(MAX_VOLUME_LEVEL, Math.round(level)));
    const wasMuted = this.muted;
    this.sfxVolumeLevel = nextLevel;
    this.storeVolumeLevel(SFX_VOLUME_STORAGE_KEY, nextLevel);
    if (nextLevel > 0) this.muted = false;
    this.applyAudioLevels();
    if (nextLevel === 0) {
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
    } else if (wasMuted && this.pageActive) {
      this.init();
    }
    return this.sfxVolumeLevel;
  }

  public playDialogBlip() {
    if (!this.ctx || this.muted || !this.pageActive || this.sfxVolumeLevel === 0) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(420 + Math.random() * 180, t);
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.045);
  }

  private playBossWarningSiren(startTime: number) {
    if (!this.ctx || !this.sfxGain || this.sfxVolumeLevel === 0) return;

    const bus = this.ctx.createGain();
    const lowAlarm = this.ctx.createOscillator();
    const highAlarm = this.ctx.createOscillator();
    const stopTime = startTime + 0.72;

    lowAlarm.type = 'sawtooth';
    lowAlarm.frequency.setValueAtTime(172, startTime);
    lowAlarm.frequency.linearRampToValueAtTime(236, startTime + 0.22);
    lowAlarm.frequency.linearRampToValueAtTime(172, startTime + 0.36);
    lowAlarm.frequency.linearRampToValueAtTime(248, startTime + 0.58);
    lowAlarm.frequency.linearRampToValueAtTime(180, stopTime);

    highAlarm.type = 'square';
    highAlarm.detune.setValueAtTime(-9, startTime);
    highAlarm.frequency.setValueAtTime(690, startTime);
    highAlarm.frequency.linearRampToValueAtTime(510, startTime + 0.24);
    highAlarm.frequency.linearRampToValueAtTime(760, startTime + 0.48);
    highAlarm.frequency.linearRampToValueAtTime(540, stopTime);

    bus.gain.setValueAtTime(SILENCE_GAIN, startTime);
    bus.gain.linearRampToValueAtTime(0.16, startTime + 0.035);
    bus.gain.exponentialRampToValueAtTime(0.045, startTime + 0.29);
    bus.gain.linearRampToValueAtTime(0.15, startTime + 0.38);
    bus.gain.exponentialRampToValueAtTime(SILENCE_GAIN, stopTime);

    lowAlarm.connect(bus);
    highAlarm.connect(bus);
    bus.connect(this.sfxGain);
    for (const oscillator of [lowAlarm, highAlarm]) {
      oscillator.onended = () => this.activeProceduralNodes.delete(oscillator);
      this.activeProceduralNodes.add(oscillator);
      oscillator.start(startTime);
      oscillator.stop(stopTime + 0.01);
    }
  }

  // Procedural Sound Generation
  public playSound(
    type: GameSoundType,
    intensity: number = 1,
    options: { pitchJitter?: number; pitchOffset?: number } = {}
  ) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.muted || !this.pageActive || this.sfxVolumeLevel === 0) return;

    const minSpacingMs: Partial<Record<GameSoundType, number>> = {
      shoot: 28,
      boss_shoot: 95,
      boss_cannon: 160,
      boss_machinegun: 620,
      boss_alert: 2_600,
      impact: 58,
      coin: 24,
      explode: 72,
      hit: 80,
      powerup: 80,
      missile: 70,
      electricity: 40,
      siren: 620,
      boss_roar: 180,
      mission_victory: 2_000,
      bomb: 140
    };
    const nowMs = performance.now();
    const spacing = minSpacingMs[type] || 0;
    const lastTime = this.lastSoundTime[type] || 0;
    if (spacing > 0 && nowMs - lastTime < spacing) return;
    this.lastSoundTime[type] = nowMs;

    const t = this.ctx.currentTime;
    const pitchJitter = options.pitchJitter ?? 0.12;
    const pitchOffset = options.pitchOffset ?? 0;
    const pitch = (1 - (pitchJitter / 2)) + (Math.random() * pitchJitter) + pitchOffset;
    const comboLift = Math.min(Math.max(intensity - 1, 0), 8) * 0.07;
    if (this.playSample(type, intensity, pitch)) return;
    if (type === 'boss_alert') {
      this.playBossWarningSiren(t);
      return;
    }
    if (type === 'siren') {
      this.playBossWarningSiren(t);
      return;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.onended = () => this.activeProceduralNodes.delete(osc);
    this.activeProceduralNodes.add(osc);

    osc.connect(gain);
    gain.connect(this.sfxGain!);

    switch (type) {
      case 'electricity':
        // Sawtooth with rapid frequency modulation for "ZAP"
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(1000, t + 0.1);
        osc.frequency.linearRampToValueAtTime(200, t + 0.2);
        osc.frequency.linearRampToValueAtTime(1000, t + 0.3);
        
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        
        osc.start(t);
        osc.stop(t + 0.5);
        break;

      case 'shoot':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(170 * pitch, t + 0.075);
        gain.gain.setValueAtTime(PLAYER_SHOT_GAIN, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.075);
        osc.start(t);
        osc.stop(t + 0.08);
        break;

      case 'boss_shoot':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(74 * pitch, t + 0.22);
        gain.gain.setValueAtTime(0.19, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.24);
        osc.start(t);
        osc.stop(t + 0.25);
        break;

      case 'boss_cannon':
        // The checked-in boss-shot sample is preferred. This short fallback is
        // only used while that sample is unavailable or still decoding.
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.32);
        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.34);
        osc.start(t);
        osc.stop(t + 0.35);
        break;

      case 'boss_machinegun':
        // The checked-in rotary burst is preferred. This short fallback avoids
        // a silent warning if the authored sample is still decoding.
        osc.type = 'square';
        osc.frequency.setValueAtTime(760 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(190 * pitch, t + 0.065);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.075);
        osc.start(t);
        osc.stop(t + 0.08);
        break;

      case 'impact':
        osc.type = 'square';
        osc.frequency.setValueAtTime(260 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(70 * pitch, t + 0.055);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
        osc.start(t);
        osc.stop(t + 0.065);
        break;

      case 'missile':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(190 * pitch, t);
        osc.frequency.linearRampToValueAtTime(760 * pitch, t + 0.12);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.22);
        break;

      case 'launch':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(88 * pitch, t);
        osc.frequency.linearRampToValueAtTime(420 * pitch, t + 0.5);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.75);
        osc.start(t);
        osc.stop(t + 0.78);
        break;

      case 'wave':
      case 'mission_victory':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240 * pitch, t);
        osc.frequency.linearRampToValueAtTime(720 * pitch, t + 0.18);
        osc.frequency.linearRampToValueAtTime(960 * pitch, t + 0.34);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.52);
        osc.start(t);
        osc.stop(t + 0.55);
        break;

      case 'gameover':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(36 * pitch, t + 0.72);
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.82);
        osc.start(t);
        osc.stop(t + 0.85);
        break;

      case 'bomb':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90 * pitch, t);
        osc.frequency.linearRampToValueAtTime(46 * pitch, t + 0.16);
        osc.frequency.linearRampToValueAtTime(220 * pitch, t + 0.44);
        gain.gain.setValueAtTime(0.42, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.72);
        osc.start(t);
        osc.stop(t + 0.75);
        break;

      case 'explode':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.3);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
        break;

      case 'coin':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 * (1 + comboLift) * pitch, t);
        osc.frequency.setValueAtTime(1600 * (1 + comboLift) * pitch, t + 0.05);
        gain.gain.setValueAtTime(0.1 + Math.min(comboLift, 0.22), t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
        break;
      
      case 'powerup':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 * pitch, t);
        osc.frequency.linearRampToValueAtTime(600 * pitch, t + 0.2);
        osc.frequency.linearRampToValueAtTime(1200 * pitch, t + 0.4);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
        break;

      case 'boss_roar':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(50, t);
        osc.frequency.linearRampToValueAtTime(80, t + 1.0);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
        osc.start(t);
        osc.stop(t + 1.5);
        break;
        
       case 'hit':
        osc.type = 'square';
        osc.frequency.setValueAtTime(150 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
        break;
    }
  }

  // ---------------------------------------------------------------- music
  //
  // The game shipped with no music at all. These loops run on their own gain
  // bus so music can be balanced against, or silenced independently of, the
  // sound effects.

  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffers: Partial<Record<MusicTrack, AudioBuffer>> = {};
  private musicLoadPromises: Partial<Record<MusicTrack, Promise<AudioBuffer | null>>> = {};
  private currentMusic: MusicTrack | null = null;
  private musicVolumeLevel: number = MAX_VOLUME_LEVEL;
  private musicVolumeLoaded = false;

  private async loadMusic(track: MusicTrack): Promise<AudioBuffer | null> {
    const cached = this.musicBuffers[track];
    if (cached) return cached;
    const inFlight = this.musicLoadPromises[track];
    if (inFlight) return inFlight;

    const promise = (async () => {
      const ctx = this.ensureAudioContext();
      if (!ctx) return null;
      try {
        const response = await fetch(MUSIC_URLS[track]);
        if (!response.ok) return null;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        this.musicBuffers[track] = buffer;
        return buffer;
      } catch {
        // Music is ambience. A failed fetch must never take gameplay with it.
        return null;
      }
    })();
    this.musicLoadPromises[track] = promise;
    return promise;
  }

  private ensureMusicVolumeLoaded() {
    if (this.musicVolumeLoaded) return;
    this.musicVolumeLoaded = true;
    this.musicVolumeLevel = this.readStoredVolumeLevel(MUSIC_VOLUME_STORAGE_KEY, MAX_VOLUME_LEVEL);
  }

  private ensureMusicGain(): GainNode | null {
    const ctx = this.ensureAudioContext();
    if (!ctx) return null;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.masterGain ?? ctx.destination);
    }
    return this.musicGain;
  }

  private get musicTargetGain() {
    this.ensureMusicVolumeLoaded();
    return this.muted ? 0 : (this.musicVolumeLevel / MAX_VOLUME_LEVEL) * MUSIC_BASE_GAIN;
  }

  /**
   * Crossfades to a track, or does nothing if it is already playing. Safe to
   * call every render.
   */
  async playMusic(track: MusicTrack | null, { fadeSeconds = 0.6 } = {}) {
    if (track === this.currentMusic) return;
    const ctx = this.ensureAudioContext();
    const gain = this.ensureMusicGain();
    if (!ctx || !gain) return;

    const now = ctx.currentTime;
    const previous = this.musicSource;
    if (previous) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      previous.stop(now + fadeSeconds + 0.05);
    }
    this.musicSource = null;
    this.currentMusic = track;
    if (!track) return;

    const buffer = await this.loadMusic(track);
    // A late-arriving buffer must not hijack a track the game has since
    // switched away from.
    if (!buffer || this.currentMusic !== track) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    const startAt = ctx.currentTime;
    source.start(startAt);
    this.musicSource = source;

    gain.gain.cancelScheduledValues(startAt);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(this.musicTargetGain, startAt + fadeSeconds);
  }

  stopMusic(fadeSeconds = 0.4) {
    void this.playMusic(null, { fadeSeconds });
  }

  setMusicVolumeLevel(level: number) {
    this.ensureMusicVolumeLoaded();
    this.musicVolumeLevel = Math.max(0, Math.min(MAX_VOLUME_LEVEL, Math.round(level)));
    this.storeVolumeLevel(MUSIC_VOLUME_STORAGE_KEY, this.musicVolumeLevel);
    const ctx = this.ctx;
    if (this.musicGain && ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicTargetGain, ctx.currentTime, 0.05);
    }
    return this.musicVolumeLevel;
  }

  getMusicVolumeLevel() {
    this.ensureMusicVolumeLoaded();
    return this.musicVolumeLevel;
  }

  getCurrentMusic() {
    return this.currentMusic;
  }
}

export const audioService = new AudioService();
