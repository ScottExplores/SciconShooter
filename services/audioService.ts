
type GameSoundType = 'shoot' | 'explode' | 'coin' | 'powerup' | 'hit' | 'boss_roar' | 'electricity' | 'siren' | 'launch' | 'wave' | 'gameover' | 'missile' | 'bomb';

class AudioService {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private masterGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep: number = 0;
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
  }

  public init() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      // Smooth fade to avoid pops
      const t = this.ctx?.currentTime || 0;
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.3, t, 0.1);
    }
    return this.muted;
  }

  public startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;

    const pulse = () => {
      if (!this.ctx || this.muted || !this.masterGain) return;

      const t = this.ctx.currentTime;
      const bassNotes = [55, 55, 82.41, 73.42, 55, 98, 82.41, 73.42];
      const leadNotes = [220, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 196];
      const bass = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      const lead = this.ctx.createOscillator();
      const leadGain = this.ctx.createGain();
      const beat = this.musicStep % bassNotes.length;

      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(bassNotes[beat], t);
      bassGain.gain.setValueAtTime(beat % 2 === 0 ? 0.045 : 0.026, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      bass.connect(bassGain);
      bassGain.connect(this.masterGain);
      bass.start(t);
      bass.stop(t + 0.24);

      if (this.musicStep % 2 === 0) {
        lead.type = 'triangle';
        lead.frequency.setValueAtTime(leadNotes[beat], t);
        leadGain.gain.setValueAtTime(0.018, t);
        leadGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        lead.connect(leadGain);
        leadGain.connect(this.masterGain);
        lead.start(t);
        lead.stop(t + 0.2);
      }

      this.musicStep++;
    };

    pulse();
    this.musicTimer = window.setInterval(pulse, 260);
  }

  public playDialogBlip() {
    if (!this.ctx || this.muted) return;

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
    if (!this.ctx || this.muted) return;

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
