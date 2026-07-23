
type GameSoundType = 'shoot' | 'boss_shoot' | 'impact' | 'explode' | 'coin' | 'powerup' | 'hit' | 'boss_roar' | 'electricity' | 'siren' | 'launch' | 'wave' | 'gameover' | 'missile' | 'bomb';
type SampleKey = 'player-shot' | 'boss-shot' | 'hit' | 'explosion';

export type MissionMusicTrackId = 'scicon-flight' | 'acid-clatter' | 'pressure' | 'exellent';

export const MISSION_MUSIC_TRACKS: ReadonlyArray<{
  id: MissionMusicTrackId;
  title: string;
  artist: string;
  src: string | null;
}> = [
  { id: 'scicon-flight', title: 'Scicon Flight Mix', artist: 'Scicon Shooter', src: null },
  { id: 'acid-clatter', title: 'ACID CLATTER', artist: 'Phonk Killer', src: '/audio/music/acid-clatter.mp3' },
  { id: 'pressure', title: 'PRESSURE', artist: 'Mission Track', src: '/audio/music/pressure.mp3' },
  { id: 'exellent', title: 'Exellent', artist: 'Mission Track', src: '/audio/music/exellent.mp3' }
];

type SampleProfile = {
  sample: SampleKey;
  volume: number;
  maxDuration: number;
};

const SAMPLE_URLS: Record<SampleKey, string> = {
  'player-shot': '/audio/sfx/player-shot.wav',
  'boss-shot': '/audio/sfx/boss-shot.wav',
  hit: '/audio/sfx/hit.wav',
  explosion: '/audio/sfx/explosion.wav'
};

const SAMPLE_PROFILES: Partial<Record<GameSoundType, SampleProfile>> = {
  boss_shoot: { sample: 'boss-shot', volume: 0.24, maxDuration: 0.38 },
  impact: { sample: 'hit', volume: 0.075, maxDuration: 0.16 },
  hit: { sample: 'hit', volume: 0.23, maxDuration: 0.42 },
  explode: { sample: 'explosion', volume: 0.2, maxDuration: 0.82 }
};

const MISSION_BPM = 154;
const MISSION_STEP_MS = (60_000 / MISSION_BPM) / 2;
const SILENCE_GAIN = 0.0001;
const MAX_MASTER_GAIN = 0.3;
const MUSIC_BUS_GAIN = 0.38;
const MAX_MUSIC_ELEMENT_VOLUME = 0.14;
const MAX_VOLUME_LEVEL = 5;
const MUSIC_TRACK_STORAGE_KEY = 'scicon-shooter:mission-music-track:v1';
const MISSION_BASS_PATTERN = [
  73.42, 55, 73.42, 65.41,
  73.42, 87.31, 73.42, 77.78,
  73.42, 55, 65.41, 73.42,
  87.31, 77.78, 65.41, 55
];
const MISSION_LEAD_PATTERN = [
  293.66, 0, 349.23, 0,
  261.63, 0, 311.13, 0,
  293.66, 0, 392, 0,
  349.23, 311.13, 261.63, 0
];
const MISSION_RISE_PATTERN = [146.83, 174.61, 196, 220, 261.63, 293.66, 349.23, 392];

class AudioService {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private volumeLevel: number = MAX_VOLUME_LEVEL;
  private lastNonZeroVolumeLevel: number = MAX_VOLUME_LEVEL;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep: number = 0;
  private musicRequested: boolean = false;
  private musicPaused: boolean = false;
  private musicLaunchPending: boolean = false;
  private selectedMusicTrackId: MissionMusicTrackId = 'scicon-flight';
  private musicPlayer: HTMLAudioElement | null = null;
  private activeMusicNodes = new Set<OscillatorNode>();
  private activeProceduralNodes = new Set<OscillatorNode>();
  private activeSampleNodes = new Set<AudioBufferSourceNode>();
  private sampleBuffers: Partial<Record<SampleKey, AudioBuffer>> = {};
  private sampleLoadPromise: Promise<void> | null = null;
  private pageActive: boolean = !document.hidden;
  private lastSoundTime: Partial<Record<GameSoundType, number>> = {};

  constructor() {
    this.selectedMusicTrackId = this.readStoredMusicTrack();

    try {
      // Initialize on first user interaction
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(MUSIC_BUS_GAIN, this.ctx.currentTime);
        this.musicGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.applyMasterVolume();
        void this.preloadSamples();
      }
    } catch {
      console.error("WebAudio not supported");
    }

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
    window.addEventListener('pageshow', this.handlePageShow);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('focus', this.handleFocus);
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

  private clearMusicTimer() {
    if (this.musicTimer === null) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private stopActiveMusicNodes() {
    this.activeMusicNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // The node may already have reached its scheduled stop time.
      }
    });
    this.activeMusicNodes.clear();
  }

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

  private readStoredMusicTrack(): MissionMusicTrackId {
    try {
      const storedTrack = window.localStorage?.getItem(MUSIC_TRACK_STORAGE_KEY);
      if (MISSION_MUSIC_TRACKS.some((track) => track.id === storedTrack)) {
        return storedTrack as MissionMusicTrackId;
      }
    } catch {
      // Storage can be unavailable in embedded or privacy-restricted browsers.
    }
    return 'scicon-flight';
  }

  private getSelectedMusicTrack() {
    return MISSION_MUSIC_TRACKS.find((track) => track.id === this.selectedMusicTrackId)
      || MISSION_MUSIC_TRACKS[0];
  }

  private applyMusicPlayerVolume() {
    if (!this.musicPlayer) return;
    this.musicPlayer.volume = this.muted || !this.pageActive
      ? 0
      : MAX_MUSIC_ELEMENT_VOLUME * (this.volumeLevel / MAX_VOLUME_LEVEL);
  }

  private pauseMusicPlayer(reset: boolean = false) {
    if (!this.musicPlayer) return;
    this.musicPlayer.pause();
    if (reset) {
      try {
        this.musicPlayer.currentTime = 0;
      } catch {
        // Some browsers reject seeking before media metadata is available.
      }
    }
  }

  private ensureMusicPlayer(src: string) {
    const absoluteSrc = new URL(src, window.location.href).href;
    if (this.musicPlayer?.src === absoluteSrc) return this.musicPlayer;

    this.pauseMusicPlayer(true);
    const player = new Audio(src);
    player.loop = true;
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
    this.musicPlayer = player;
    this.applyMusicPlayerVolume();
    return player;
  }

  private beginSelectedMusic() {
    if (!this.musicRequested || this.musicPaused || this.muted || !this.pageActive) return;
    const selectedTrack = this.getSelectedMusicTrack();

    if (!selectedTrack.src) {
      this.pauseMusicPlayer();
      this.beginMusicTimer();
      return;
    }

    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    const player = this.ensureMusicPlayer(selectedTrack.src);
    this.applyMusicPlayerVolume();
    void player.play().catch(() => {
      // A future user interaction or lifecycle resume can retry playback.
    });
  }

  private preloadSamples() {
    if (
      !this.ctx
      || this.sampleLoadPromise
      || typeof fetch !== 'function'
      || typeof this.ctx.decodeAudioData !== 'function'
    ) {
      return this.sampleLoadPromise;
    }

    const context = this.ctx;
    const loads = (Object.entries(SAMPLE_URLS) as Array<[SampleKey, string]>).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        this.sampleBuffers[key] = await context.decodeAudioData(data);
      } catch {
        // Procedural sounds remain available when a sample cannot be decoded.
      }
    });
    this.sampleLoadPromise = Promise.all(loads).then(() => undefined);
    return this.sampleLoadPromise;
  }

  private playSample(type: GameSoundType, intensity: number, pitch: number) {
    if (!this.ctx || !this.masterGain) return false;
    const profile = SAMPLE_PROFILES[type];
    if (!profile) return false;
    const buffer = this.sampleBuffers[profile.sample];
    if (!buffer || typeof this.ctx.createBufferSource !== 'function') return false;

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
    gain.connect(this.masterGain);
    source.onended = () => this.activeSampleNodes.delete(source);
    this.activeSampleNodes.add(source);
    source.start(now);
    source.stop(now + duration + 0.02);
    return true;
  }

  private setPageActive(active: boolean) {
    if (this.pageActive === active) return;
    this.pageActive = active;

    if (!active) {
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      this.pauseMusicPlayer();
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
      void this.ctx?.suspend().catch(() => undefined);
      return;
    }

    if (this.muted) return;
    void this.ctx?.resume().catch(() => undefined);
    this.applyMasterVolume();
    this.applyMusicPlayerVolume();
    this.beginSelectedMusic();
  }

  private getScaledMasterVolume() {
    return MAX_MASTER_GAIN * (this.volumeLevel / MAX_VOLUME_LEVEL);
  }

  private applyMasterVolume() {
    this.setMasterVolume(this.muted || !this.pageActive ? 0 : this.getScaledMasterVolume());
    this.applyMusicPlayerVolume();
  }

  private setMasterVolume(volume: number) {
    if (!this.masterGain) return;
    const t = this.ctx?.currentTime || 0;
    this.masterGain.gain.setTargetAtTime(volume, t, 0.08);
  }

  public init() {
    void this.preloadSamples();
    if (this.pageActive && !this.muted && this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    this.applyMasterVolume();
  }

  public toggleMute() {
    if (this.muted) {
      this.muted = false;
      this.volumeLevel = this.lastNonZeroVolumeLevel;
    } else {
      if (this.volumeLevel > 0) this.lastNonZeroVolumeLevel = this.volumeLevel;
      this.muted = true;
    }

    this.applyMasterVolume();
    if (this.muted) {
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      this.pauseMusicPlayer();
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
    } else if (this.pageActive) {
      this.init();
      this.beginSelectedMusic();
    }
    return this.muted;
  }

  public isMuted() {
    return this.muted;
  }

  public getVolumeLevel() {
    return this.muted ? 0 : this.volumeLevel;
  }

  public setVolumeLevel(level: number) {
    const nextLevel = Math.max(0, Math.min(MAX_VOLUME_LEVEL, Math.round(level)));

    if (nextLevel === 0) {
      if (this.volumeLevel > 0) this.lastNonZeroVolumeLevel = this.volumeLevel;
      this.muted = true;
      this.applyMasterVolume();
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      this.pauseMusicPlayer();
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
      return 0;
    }

    const wasMuted = this.muted;
    this.volumeLevel = nextLevel;
    this.lastNonZeroVolumeLevel = nextLevel;
    this.muted = false;
    this.applyMasterVolume();

    if (this.pageActive && wasMuted) {
      this.init();
      this.beginSelectedMusic();
    }

    return this.volumeLevel;
  }

  public startMusic() {
    if (!this.musicRequested) {
      this.musicStep = 0;
      this.musicLaunchPending = true;
    }
    this.musicRequested = true;
    this.musicPaused = false;
    this.beginSelectedMusic();
  }

  public pauseMusic() {
    if (!this.musicRequested || this.musicPaused) return;
    this.musicPaused = true;
    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    this.pauseMusicPlayer();
  }

  public resumeMusic() {
    if (!this.musicRequested || !this.musicPaused) return;
    this.musicPaused = false;
    this.beginSelectedMusic();
  }

  public stopMusic() {
    this.musicRequested = false;
    this.musicPaused = false;
    this.musicStep = 0;
    this.musicLaunchPending = false;
    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    this.pauseMusicPlayer(true);
  }

  public getMusicTrackId() {
    return this.selectedMusicTrackId;
  }

  public setMusicTrack(trackId: MissionMusicTrackId) {
    if (!MISSION_MUSIC_TRACKS.some((track) => track.id === trackId)) {
      return this.selectedMusicTrackId;
    }
    if (trackId === this.selectedMusicTrackId) return trackId;

    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    this.pauseMusicPlayer(true);
    this.selectedMusicTrackId = trackId;
    this.musicStep = 0;
    this.musicLaunchPending = trackId === 'scicon-flight';
    try {
      window.localStorage?.setItem(MUSIC_TRACK_STORAGE_KEY, trackId);
    } catch {
      // The selection still applies for this session when storage is unavailable.
    }
    this.beginSelectedMusic();
    return trackId;
  }

  public advanceMusicTrack(steps: number = 1) {
    const currentIndex = Math.max(
      0,
      MISSION_MUSIC_TRACKS.findIndex((track) => track.id === this.selectedMusicTrackId)
    );
    const normalizedSteps = Math.max(0, Math.floor(steps));
    const nextIndex = (currentIndex + normalizedSteps) % MISSION_MUSIC_TRACKS.length;
    return this.setMusicTrack(MISSION_MUSIC_TRACKS[nextIndex].id);
  }

  private scheduleMusicTone(
    frequency: number,
    type: OscillatorType,
    startTime: number,
    duration: number,
    volume: number,
    endFrequency: number = frequency,
    attack: number = 0.004
  ) {
    if (!this.ctx || !this.musicGain) return;

    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const attackEnd = startTime + Math.min(attack, duration * 0.35);
    const stopTime = startTime + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), startTime);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), stopTime);
    }
    gain.gain.setValueAtTime(SILENCE_GAIN, startTime);
    gain.gain.linearRampToValueAtTime(volume, attackEnd);
    gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, stopTime);

    oscillator.connect(gain);
    gain.connect(this.musicGain);
    oscillator.onended = () => this.activeMusicNodes.delete(oscillator);
    this.activeMusicNodes.add(oscillator);
    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.01);
  }

  private scheduleKick(startTime: number, accent: boolean) {
    this.scheduleMusicTone(168, 'sine', startTime, 0.16, accent ? 0.2 : 0.16, 43, 0.002);
    if (accent) {
      this.scheduleMusicTone(62, 'triangle', startTime, 0.2, 0.045, 34, 0.002);
    }
  }

  private scheduleHat(startTime: number, open: boolean) {
    this.scheduleMusicTone(
      open ? 7_100 : 8_600,
      'square',
      startTime,
      open ? 0.11 : 0.035,
      open ? 0.012 : 0.008,
      open ? 5_200 : 7_400,
      0.001
    );
  }

  private scheduleClap(startTime: number) {
    this.scheduleMusicTone(1_350, 'square', startTime, 0.07, 0.014, 460, 0.001);
    this.scheduleMusicTone(210, 'triangle', startTime, 0.1, 0.022, 92, 0.001);
  }

  private scheduleBass(startTime: number, step: number, underKick: boolean) {
    const note = MISSION_BASS_PATTERN[step % MISSION_BASS_PATTERN.length];
    this.scheduleMusicTone(note, 'sawtooth', startTime, 0.17, underKick ? 0.024 : 0.043, note * 0.97, 0.003);
  }

  private scheduleLead(startTime: number, step: number, elevated: boolean) {
    const note = MISSION_LEAD_PATTERN[step % MISSION_LEAD_PATTERN.length];
    if (!note) return;

    const frequency = elevated ? note * 2 : note;
    this.scheduleMusicTone(frequency, 'triangle', startTime, 0.15, elevated ? 0.018 : 0.026, frequency * 0.995, 0.008);
    if (!elevated) {
      this.scheduleMusicTone(frequency * 0.5, 'square', startTime, 0.11, 0.008, frequency * 0.49, 0.004);
    }
  }

  private playMissionLaunchCue() {
    if (!this.ctx || !this.musicGain) return;
    const startTime = this.ctx.currentTime + 0.015;
    [110, 146.83, 196, 293.66].forEach((note, index) => {
      this.scheduleMusicTone(note, 'triangle', startTime + (index * 0.085), 0.22, 0.024, note * 1.9, 0.008);
    });
  }

  private beginMusicTimer() {
    if (
      !this.ctx
      || this.musicTimer !== null
      || !this.musicRequested
      || this.muted
      || this.musicPaused
      || !this.pageActive
      || this.getSelectedMusicTrack().src
    ) return;

    if (this.musicLaunchPending) {
      this.musicLaunchPending = false;
      this.playMissionLaunchCue();
    }

    const pulse = () => {
      if (!this.ctx || this.muted || !this.masterGain || !this.pageActive) return;

      const startTime = this.ctx.currentTime + 0.01;
      const cycleStep = this.musicStep % 128;
      const section = Math.floor(cycleStep / 32);
      const sectionStep = cycleStep % 32;
      const beatStep = this.musicStep % 16;
      const breakdown = section === 3 && sectionStep >= 24;
      const kickStep = this.musicStep % 2 === 0;

      if (!breakdown || sectionStep % 4 === 0) {
        if (kickStep) this.scheduleKick(startTime, this.musicStep % 8 === 0);
        this.scheduleBass(startTime, beatStep, kickStep);
      }

      if (!breakdown || sectionStep % 2 === 1) {
        this.scheduleHat(startTime, this.musicStep % 8 === 7);
      }

      if (!breakdown && (this.musicStep % 8 === 2 || this.musicStep % 8 === 6)) {
        this.scheduleClap(startTime);
      }

      if ((!breakdown && (section > 0 || sectionStep >= 8)) && this.musicStep % 2 === 0) {
        this.scheduleLead(startTime, beatStep, section === 2 && this.musicStep % 4 === 0);
      }

      if (breakdown) {
        const riseNote = MISSION_RISE_PATTERN[sectionStep - 24];
        this.scheduleMusicTone(riseNote, 'sawtooth', startTime, 0.16, 0.018, riseNote * 1.45, 0.01);
      }

      this.musicStep++;
    };

    pulse();
    this.musicTimer = window.setInterval(pulse, MISSION_STEP_MS);
  }

  public playDialogBlip() {
    if (!this.ctx || this.muted || !this.pageActive) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(420 + Math.random() * 180, t);
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.045);
  }

  private playBossWarningSiren(startTime: number) {
    if (!this.ctx || !this.masterGain) return;

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
    bus.connect(this.masterGain);
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
    if (!this.ctx || this.muted || !this.pageActive) return;

    const minSpacingMs: Partial<Record<GameSoundType, number>> = {
      shoot: 28,
      boss_shoot: 95,
      impact: 58,
      coin: 24,
      explode: 72,
      hit: 80,
      powerup: 80,
      missile: 70,
      electricity: 40,
      siren: 620,
      boss_roar: 180,
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
    if (type === 'siren') {
      this.playBossWarningSiren(t);
      return;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.onended = () => this.activeProceduralNodes.delete(osc);
    this.activeProceduralNodes.add(osc);

    osc.connect(gain);
    gain.connect(this.masterGain!);

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
        gain.gain.setValueAtTime(0.045, t);
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
}

export const audioService = new AudioService();
