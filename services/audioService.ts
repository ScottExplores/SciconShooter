
type GameSoundType = 'shoot' | 'explode' | 'coin' | 'powerup' | 'hit' | 'boss_roar' | 'electricity' | 'siren' | 'launch' | 'wave' | 'gameover' | 'missile' | 'bomb';

const MISSION_BPM = 154;
const MISSION_STEP_MS = (60_000 / MISSION_BPM) / 2;
const SILENCE_GAIN = 0.0001;
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
  private masterGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep: number = 0;
  private musicRequested: boolean = false;
  private musicLaunchPending: boolean = false;
  private activeMusicNodes = new Set<OscillatorNode>();
  private pageActive: boolean = !document.hidden;
  private lastSoundTime: Partial<Record<GameSoundType, number>> = {};

  constructor() {
    try {
      // Initialize on first user interaction
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
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

  private setPageActive(active: boolean) {
    if (this.pageActive === active) return;
    this.pageActive = active;

    if (!active) {
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      void this.ctx?.suspend().catch(() => undefined);
      return;
    }

    if (this.muted) return;
    void this.ctx?.resume().catch(() => undefined);
    this.setMasterVolume(0.3);
    this.beginMusicTimer();
  }

  private setMasterVolume(volume: number) {
    if (!this.masterGain) return;
    const t = this.ctx?.currentTime || 0;
    this.masterGain.gain.setTargetAtTime(volume, t, 0.08);
  }

  public init() {
    if (this.pageActive && !this.muted && this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  public toggleMute() {
    this.muted = !this.muted;
    this.setMasterVolume(this.muted || !this.pageActive ? 0 : 0.3);
    if (this.muted) {
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
    } else if (this.pageActive) {
      this.init();
      this.beginMusicTimer();
    }
    return this.muted;
  }

  public startMusic() {
    if (!this.musicRequested) {
      this.musicStep = 0;
      this.musicLaunchPending = true;
    }
    this.musicRequested = true;
    this.beginMusicTimer();
  }

  public stopMusic() {
    this.musicRequested = false;
    this.musicStep = 0;
    this.musicLaunchPending = false;
    this.clearMusicTimer();
    this.stopActiveMusicNodes();
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
    if (!this.ctx || !this.masterGain) return;

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
    gain.connect(this.masterGain);
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
    if (!this.ctx || !this.masterGain) return;
    const startTime = this.ctx.currentTime + 0.015;
    [110, 146.83, 196, 293.66].forEach((note, index) => {
      this.scheduleMusicTone(note, 'triangle', startTime + (index * 0.085), 0.22, 0.024, note * 1.9, 0.008);
    });
  }

  private beginMusicTimer() {
    if (!this.ctx || this.musicTimer !== null || !this.musicRequested || this.muted || !this.pageActive) return;

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

  // Procedural Sound Generation
  public playSound(
    type: GameSoundType,
    intensity: number = 1,
    options: { pitchJitter?: number; pitchOffset?: number } = {}
  ) {
    if (!this.ctx || this.muted || !this.pageActive) return;

    const minSpacingMs: Partial<Record<GameSoundType, number>> = {
      shoot: 28,
      coin: 24,
      explode: 42,
      hit: 80,
      powerup: 80,
      missile: 70,
      electricity: 40,
      siren: 120,
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
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

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

      case 'siren':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.linearRampToValueAtTime(880, t + 0.18);
        osc.frequency.linearRampToValueAtTime(520, t + 0.36);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.44);
        osc.start(t);
        osc.stop(t + 0.44);
        break;

      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(880 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(110 * pitch, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
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
