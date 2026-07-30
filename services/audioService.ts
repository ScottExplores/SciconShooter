
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
export type MusicScene = 'silent' | 'home' | 'map' | 'mission' | 'boss' | 'results';
export type MissionMusicTrackId =
  | 'scicon-flight'
  | 'acid-clatter'
  | 'pressure'
  | 'exellent'
  | 'racing-asteroids'
  | 'final-hour';

export const MISSION_MUSIC_TRACKS: ReadonlyArray<{
  id: MissionMusicTrackId;
  title: string;
  artist: string;
  src: string | null;
  gain: number;
}> = [
  { id: 'scicon-flight', title: 'Scicon Flight Mix', artist: 'Scicon Shooter', src: null, gain: 1 },
  { id: 'acid-clatter', title: 'ACID CLATTER', artist: 'Phonk Killer', src: '/audio/music/acid-clatter.mp3', gain: 0.24 },
  { id: 'pressure', title: 'PRESSURE', artist: 'Mission Track', src: '/audio/music/pressure.mp3', gain: 0.23 },
  { id: 'exellent', title: 'Exellent', artist: 'Mission Track', src: '/audio/music/exellent.mp3', gain: 0.13 },
  { id: 'racing-asteroids', title: 'Racing Through Asteroids', artist: 'Leonardo Paz', src: '/audio/music/mission-racing.mp3', gain: 0.78 },
  { id: 'final-hour', title: 'Final Hour', artist: 'isaiah658', src: '/audio/music/final-hour.mp3', gain: 0.66 }
];

const SCENE_MUSIC_TRACKS: Readonly<Record<'home' | 'map' | 'boss', {
  title: string;
  artist: string;
  src: string;
  gain: number;
}>> = {
  home: {
    title: 'Stillness of Space',
    artist: 'Leonardo Paz',
    src: '/audio/music/home-stillness.mp3',
    gain: 1
  },
  map: {
    title: 'Building a Colony',
    artist: 'Leonardo Paz',
    src: '/audio/music/map-colony.mp3',
    gain: 0.46
  },
  boss: {
    title: 'Battle in Outer Space',
    artist: 'Leonardo Paz',
    src: '/audio/music/boss-battle.mp3',
    gain: 0.92
  }
};

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

const MISSION_BPM = 154;
const MISSION_STEP_MS = (60_000 / MISSION_BPM) / 2;
const SILENCE_GAIN = 0.0001;
const MAX_SFX_GAIN = 0.3;
// Player fire is intentionally shorter than the other combat cues, but it
// still needs enough level to survive small phone speakers and the shared SFX
// bus. The old 0.045 peak was effectively inaudible beside impacts and music.
const PLAYER_SHOT_GAIN = 0.12;
// Procedural music stays restrained; mastered file tracks use a separate
// ceiling plus per-track compensation from the measured source loudness.
const MAX_PROCEDURAL_MUSIC_GAIN = 0.014;
const MAX_MUSIC_ELEMENT_VOLUME = 0.04;
const MUSIC_CROSSFADE_STEPS = 12;
const MUSIC_CROSSFADE_STEP_MS = 50;
const MUSIC_PRELOAD_TIMEOUT_MS = 5_000;
const MAX_VOLUME_LEVEL = 5;
const DEFAULT_MUSIC_VOLUME_LEVEL = MAX_VOLUME_LEVEL;
const MUSIC_TRACK_STORAGE_KEY = 'scicon-shooter:mission-music-track:v1';
const SFX_VOLUME_STORAGE_KEY = 'scicon-shooter:sfx-volume:v1';
const LEGACY_MUSIC_VOLUME_STORAGE_KEY = 'scicon-shooter:music-volume:v1';
const MUSIC_VOLUME_STORAGE_KEY = 'scicon-shooter:music-volume:v2';
const UI_SAMPLE_KEYS: ReadonlyArray<SampleKey> = [
  'ui-click',
  'ui-confirm',
  'ui-back',
  'ui-error',
  'ui-open',
  'ui-close'
];
const ALL_SAMPLE_KEYS = Object.keys(SAMPLE_URLS) as SampleKey[];
// A real source gives WebKit a media load to authorize even when the first
// gesture happens before React has selected a music scene. It is never audible.
const MUSIC_UNLOCK_SOURCE = '/audio/music/home-stillness.mp3';
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
  private sfxVolumeLevel: number = MAX_VOLUME_LEVEL;
  private musicVolumeLevel: number = DEFAULT_MUSIC_VOLUME_LEVEL;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep: number = 0;
  private musicRequested: boolean = false;
  private musicPaused: boolean = false;
  private musicPlaybackEnabled: boolean = true;
  private selectedMusicTrackId: MissionMusicTrackId = 'racing-asteroids';
  private musicDecks: HTMLAudioElement[];
  private musicPlayer: HTMLAudioElement | null = null;
  private fadingMusicPlayer: HTMLAudioElement | null = null;
  private pendingMusicPlayer: HTMLAudioElement | null = null;
  private pendingMusicPlayerGain: number = 1;
  private pendingMusicRequestId: number = 0;
  private musicDeckPlayAttempts = new Map<HTMLAudioElement, Promise<void>>();
  private musicPlayerGain: number = 1;
  private fadingMusicPlayerGain: number = 1;
  private musicFadeProgress: number = 1;
  private musicFadeTimer: number | null = null;
  private musicUnlockTimer: number | null = null;
  private musicScene: MusicScene = 'silent';
  private musicPositions = new Map<string, number>();
  private activeMusicNodes = new Set<OscillatorNode>();
  private activeProceduralNodes = new Set<OscillatorNode>();
  private activeSampleNodes = new Set<AudioBufferSourceNode>();
  private sampleBuffers: Partial<Record<SampleKey, AudioBuffer>> = {};
  private preparedSampleData: Partial<Record<SampleKey, ArrayBuffer>> = {};
  private samplePreparePromises: Partial<Record<SampleKey, Promise<void>>> = {};
  private sampleLoadPromises: Partial<Record<SampleKey, Promise<void>>> = {};
  private pendingUiSound: UiSoundType | null = null;
  private musicTrackListeners = new Set<(trackId: MissionMusicTrackId) => void>();
  private pageActive: boolean = typeof document === 'undefined' ? true : !document.hidden;
  private lastSoundTime: Partial<Record<GameSoundType, number>> = {};
  private lastUiSoundTime: Partial<Record<UiSoundType, number>> = {};

  constructor() {
    this.selectedMusicTrackId = this.readStoredMusicTrack();
    this.sfxVolumeLevel = this.readStoredVolumeLevel(SFX_VOLUME_STORAGE_KEY, MAX_VOLUME_LEVEL);
    this.musicVolumeLevel = this.readInitialMusicVolumeLevel();

    // Reusing two stable media elements is materially more reliable on iOS
    // than allocating a new element after every scene transition. Runtime
    // balance tools import this service without browser media globals, so
    // leave the deck empty in that environment instead of constructing Audio.
    this.musicDecks = typeof Audio === 'undefined'
      ? []
      : [this.createMusicDeck(), this.createMusicDeck()];

    // Only tiny interface cues are fetched eagerly. Mission combat assets are
    // fetched and decoded by prepare() during the mission-loading gate.
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

  private createMusicDeck() {
    const player = new Audio();
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
    player.addEventListener?.('ended', () => {
      if (player !== this.musicPlayer || this.musicScene !== 'mission' || player.loop) return;
      this.musicPositions.delete(player.src);
      this.advanceMusicTrack();
    });
    player.addEventListener?.('playing', () => {
      this.commitPendingMusicPlayer(player, this.pendingMusicRequestId);
    });
    return player;
  }

  private ensureAudioContext() {
    if (this.ctx) return this.ctx;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
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
    return 'racing-asteroids';
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

  private readInitialMusicVolumeLevel() {
    try {
      const storedValue = window.localStorage?.getItem(MUSIC_VOLUME_STORAGE_KEY);
      if (storedValue !== null && storedValue !== undefined && storedValue !== '') {
        return this.readStoredVolumeLevel(MUSIC_VOLUME_STORAGE_KEY, DEFAULT_MUSIC_VOLUME_LEVEL);
      }

      const legacyLevel = this.readStoredVolumeLevel(
        LEGACY_MUSIC_VOLUME_STORAGE_KEY,
        DEFAULT_MUSIC_VOLUME_LEVEL
      );
      // Notch 2 was the old default. Move those players to the quieter 5/5
      // ceiling while preserving explicit mute and other custom notch choices.
      const migratedLevel = legacyLevel === 2 ? DEFAULT_MUSIC_VOLUME_LEVEL : legacyLevel;
      this.storeVolumeLevel(MUSIC_VOLUME_STORAGE_KEY, migratedLevel);
      return migratedLevel;
    } catch {
      return DEFAULT_MUSIC_VOLUME_LEVEL;
    }
  }

  private storeVolumeLevel(storageKey: string, level: number) {
    try {
      window.localStorage?.setItem(storageKey, String(level));
    } catch {
      // The level still applies for this session when storage is unavailable.
    }
  }

  private getSelectedMusicTrack() {
    return MISSION_MUSIC_TRACKS.find((track) => track.id === this.selectedMusicTrackId)
      || MISSION_MUSIC_TRACKS[0];
  }

  private getSceneMusicTrack(scene: MusicScene = this.musicScene): {
    src: string | null;
    gain: number;
    loop: boolean;
  } | null {
    if (scene === 'home' || scene === 'map' || scene === 'boss') {
      return { ...SCENE_MUSIC_TRACKS[scene], loop: true };
    }
    if (scene === 'mission') {
      return { ...this.getSelectedMusicTrack(), loop: false };
    }
    return null;
  }

  private clearMusicFade(pauseFadingPlayer: boolean = true) {
    if (this.musicFadeTimer !== null) {
      window.clearInterval(this.musicFadeTimer);
      this.musicFadeTimer = null;
    }
    if (pauseFadingPlayer && this.fadingMusicPlayer) {
      this.rememberMusicPosition(this.fadingMusicPlayer);
      this.fadingMusicPlayer.pause();
      this.fadingMusicPlayer = null;
    }
    this.musicFadeProgress = 1;
  }

  private rememberMusicPosition(player: HTMLAudioElement) {
    if (!player.src || !Number.isFinite(player.currentTime) || player.currentTime <= 0) return;
    this.musicPositions.set(player.src, player.currentTime);
  }

  private applyMusicPlayerVolume() {
    const baseVolume = this.muted || this.musicPaused || !this.pageActive || this.musicVolumeLevel === 0
      ? 0
      : MAX_MUSIC_ELEMENT_VOLUME * (this.musicVolumeLevel / MAX_VOLUME_LEVEL);
    if (this.musicPlayer) {
      this.musicPlayer.volume = Math.max(
        0,
        Math.min(1, baseVolume * this.musicPlayerGain * this.musicFadeProgress)
      );
    }
    if (this.fadingMusicPlayer) {
      this.fadingMusicPlayer.volume = Math.max(
        0,
        Math.min(1, baseVolume * this.fadingMusicPlayerGain * (1 - this.musicFadeProgress))
      );
    }
  }

  private pauseMusicPlayer(reset: boolean = false) {
    const players = new Set([
      this.musicPlayer,
      this.fadingMusicPlayer,
      this.pendingMusicPlayer
    ]);
    players.forEach((player) => {
      if (!player) return;
      if (!reset) this.rememberMusicPosition(player);
      player.pause();
      if (reset) {
        if (player.src) this.musicPositions.delete(player.src);
        try {
          player.currentTime = 0;
        } catch {
          // Some browsers reject seeking before media metadata is available.
        }
      }
    });
  }

  private beginMusicCrossfade() {
    if (!this.musicPlayer) return;

    this.clearMusicFade(false);
    this.musicFadeProgress = 0;
    this.applyMusicPlayerVolume();
    let step = 0;
    this.musicFadeTimer = window.setInterval(() => {
      step++;
      this.musicFadeProgress = Math.min(1, step / MUSIC_CROSSFADE_STEPS);
      this.applyMusicPlayerVolume();
      if (this.musicFadeProgress < 1) return;
      if (this.musicFadeTimer !== null) {
        window.clearInterval(this.musicFadeTimer);
        this.musicFadeTimer = null;
      }
      if (this.fadingMusicPlayer) {
        this.rememberMusicPosition(this.fadingMusicPlayer);
        this.fadingMusicPlayer.pause();
      }
      this.fadingMusicPlayer = null;
    }, MUSIC_CROSSFADE_STEP_MS);
  }

  private fadeMusicToSilence() {
    this.clearMusicFade();
    if (!this.musicPlayer) return;
    this.fadingMusicPlayer = this.musicPlayer;
    this.fadingMusicPlayerGain = this.musicPlayerGain;
    this.musicPlayer = null;
    this.musicFadeProgress = 0;
    this.applyMusicPlayerVolume();
    let step = 0;
    this.musicFadeTimer = window.setInterval(() => {
      step++;
      this.musicFadeProgress = Math.min(1, step / MUSIC_CROSSFADE_STEPS);
      this.applyMusicPlayerVolume();
      if (this.musicFadeProgress < 1) return;
      if (this.musicFadeTimer !== null) {
        window.clearInterval(this.musicFadeTimer);
        this.musicFadeTimer = null;
      }
      if (this.fadingMusicPlayer) {
        this.rememberMusicPosition(this.fadingMusicPlayer);
        this.fadingMusicPlayer.pause();
      }
      this.fadingMusicPlayer = null;
    }, MUSIC_CROSSFADE_STEP_MS);
  }

  private configureMusicDeck(player: HTMLAudioElement, src: string, loop: boolean) {
    const absoluteSrc = new URL(src, window.location.href).href;
    player.loop = loop;
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
    if (player.src === absoluteSrc) return absoluteSrc;

    player.pause();
    this.musicDeckPlayAttempts.delete(player);
    player.src = absoluteSrc;
    const resumeAt = this.musicPositions.get(absoluteSrc) ?? 0;
    if (resumeAt > 0) {
      const restorePosition = () => {
        if (player.src !== absoluteSrc) return;
        try {
          player.currentTime = resumeAt;
        } catch {
          // Metadata can still be unavailable in older mobile browsers.
        }
      };
      restorePosition();
      player.addEventListener?.('loadedmetadata', restorePosition, { once: true });
    }
    try {
      player.load?.();
    } catch {
      // Older embedded WebViews may begin loading on src assignment alone.
    }
    return absoluteSrc;
  }

  private cancelPendingMusicPlayback() {
    this.pendingMusicRequestId++;
    if (
      this.pendingMusicPlayer
      && this.pendingMusicPlayer !== this.musicPlayer
      && this.pendingMusicPlayer !== this.fadingMusicPlayer
    ) {
      this.pendingMusicPlayer.pause();
    }
    this.pendingMusicPlayer = null;
  }

  private preparePendingMusicPlayer(src: string, gain: number, loop: boolean) {
    const absoluteSrc = new URL(src, window.location.href).href;
    if (this.musicPlayer?.src === absoluteSrc) {
      this.musicPlayerGain = gain;
      this.musicPlayer.loop = loop;
      this.applyMusicPlayerVolume();
      return { player: this.musicPlayer, requestId: null as number | null };
    }
    if (this.pendingMusicPlayer?.src === absoluteSrc) {
      this.pendingMusicPlayerGain = gain;
      this.pendingMusicPlayer.loop = loop;
      return { player: this.pendingMusicPlayer, requestId: this.pendingMusicRequestId };
    }

    this.cancelPendingMusicPlayback();
    // Finish any prior transition before selecting the now-idle second deck.
    // The current deck stays audible at full level while the new source loads.
    this.clearMusicFade();
    this.applyMusicPlayerVolume();
    const player = this.musicDecks.find((deck) => deck !== this.musicPlayer)
      || this.musicDecks[0];
    if (!player) return null;
    this.configureMusicDeck(player, src, loop);
    player.volume = 0;
    this.pendingMusicPlayer = player;
    this.pendingMusicPlayerGain = gain;
    this.pendingMusicRequestId++;
    return { player, requestId: this.pendingMusicRequestId };
  }

  private commitPendingMusicPlayer(player: HTMLAudioElement, requestId: number) {
    if (player !== this.pendingMusicPlayer || requestId !== this.pendingMusicRequestId) {
      if (player !== this.musicPlayer && player !== this.fadingMusicPlayer) player.pause();
      return;
    }
    const previousPlayer = this.musicPlayer;
    const previousGain = this.musicPlayerGain;
    this.pendingMusicPlayer = null;
    this.fadingMusicPlayer = previousPlayer === player ? null : previousPlayer;
    this.fadingMusicPlayerGain = previousGain;
    this.musicPlayer = player;
    this.musicPlayerGain = this.pendingMusicPlayerGain;
    this.beginMusicCrossfade();
  }

  private requestMusicPlayback(player: HTMLAudioElement, requestId: number | null) {
    let attempt = this.musicDeckPlayAttempts.get(player);
    this.musicDeckPlayAttempts.delete(player);
    if (!attempt) {
      try {
        const playResult = player.play();
        if (!playResult || typeof playResult.then !== 'function') {
          // Older WebKit announces successful playback with the `playing`
          // event. Do not fade the outgoing deck before that signal.
          return;
        }
        attempt = Promise.resolve(playResult).then(() => undefined);
      } catch {
        return;
      }
    }

    void attempt.then(() => {
      if (requestId === null) {
        if (player === this.musicPlayer) this.applyMusicPlayerVolume();
        return;
      }
      this.commitPendingMusicPlayer(player, requestId);
    }).catch(() => {
      // Keep the pending deck and requested scene intact. The next user
      // interaction, volume change, or lifecycle resume retries play().
      if (player === this.pendingMusicPlayer) player.volume = 0;
    });
  }

  private attemptMusicDeckUnlockSynchronously() {
    const selectedTrack = this.getSceneMusicTrack();
    const unlockSrc = selectedTrack?.src || MUSIC_UNLOCK_SOURCE;
    const unlockLoop = selectedTrack?.loop ?? true;

    this.musicDecks.forEach((player) => {
      // A second tap can arrive while the previous scene is still fading.
      // That outgoing deck is already authorized and must remain untouched
      // until the crossfade completes.
      if (player === this.fadingMusicPlayer) return;
      const isCurrent = player === this.musicPlayer;
      if (!isCurrent && player !== this.pendingMusicPlayer) {
        this.configureMusicDeck(player, unlockSrc, unlockLoop);
        player.volume = 0;
      }
      try {
        const playResult = player.play();
        if (!playResult || typeof playResult.then !== 'function') return;
        const attempt = Promise.resolve(playResult).then(() => undefined);
        this.musicDeckPlayAttempts.set(player, attempt);
        void attempt.then(() => {
          if (player !== this.musicPlayer && player !== this.pendingMusicPlayer) player.pause();
        }).catch(() => undefined).finally(() => {
          if (this.musicDeckPlayAttempts.get(player) === attempt) {
            this.musicDeckPlayAttempts.delete(player);
          }
        });
      } catch {
        // A later gesture retries both persistent decks.
      }
    });
  }

  private beginSelectedMusic() {
    if (
      !this.musicPlaybackEnabled
      || !this.musicRequested
      || this.musicPaused
      || this.muted
      || !this.pageActive
      || this.musicVolumeLevel === 0
      || !this.ctx
    ) return;
    const selectedTrack = this.getSceneMusicTrack();
    if (!selectedTrack) return;

    if (!selectedTrack.src) {
      this.clearMusicFade();
      this.pauseMusicPlayer(true);
      this.musicPlayer = null;
      this.beginMusicTimer();
      return;
    }

    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    const pendingMusic = this.preparePendingMusicPlayer(
      selectedTrack.src,
      selectedTrack.gain,
      selectedTrack.loop
    );
    if (!pendingMusic) return;
    const { player, requestId } = pendingMusic;
    this.requestMusicPlayback(player, requestId);
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
    this.init(true);
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
      if (this.musicUnlockTimer !== null) {
        window.clearTimeout(this.musicUnlockTimer);
        this.musicUnlockTimer = null;
      }
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      this.cancelPendingMusicPlayback();
      this.clearMusicFade();
      this.pauseMusicPlayer();
      this.stopActiveSampleNodes();
      this.stopActiveProceduralNodes();
      void this.ctx?.suspend().catch(() => undefined);
      return;
    }

    if (this.muted) return;
    void this.ctx?.resume().catch(() => undefined);
    this.applyAudioLevels();
    this.applyMusicPlayerVolume();
    this.beginSelectedMusic();
  }

  private getScaledSfxVolume() {
    return MAX_SFX_GAIN * (this.sfxVolumeLevel / MAX_VOLUME_LEVEL);
  }

  private getScaledMusicVolume() {
    return MAX_PROCEDURAL_MUSIC_GAIN * (this.musicVolumeLevel / MAX_VOLUME_LEVEL);
  }

  private applyAudioLevels() {
    const active = !this.muted && this.pageActive;
    this.setGainVolume(this.masterGain, active ? 1 : 0);
    this.setGainVolume(this.sfxGain, this.getScaledSfxVolume());
    this.setGainVolume(this.musicGain, this.getScaledMusicVolume());
    this.applyMusicPlayerVolume();
  }

  private setGainVolume(gainNode: GainNode | null, volume: number) {
    if (!gainNode) return;
    const t = this.ctx?.currentTime || 0;
    gainNode.gain.setTargetAtTime(volume, t, 0.08);
  }

  public init(deferRequestedMusic: boolean = false) {
    this.ensureAudioContext();
    void this.preloadSamples(UI_SAMPLE_KEYS);
    // Both play() calls happen in this stack frame. On iPhone/WebKit that is
    // the difference between authorizing the persistent decks and a later
    // asynchronous scene change being rejected as autoplay.
    this.attemptMusicDeckUnlockSynchronously();
    if (this.pageActive && !this.muted && this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    this.applyAudioLevels();
    if (this.musicUnlockTimer !== null) {
      window.clearTimeout(this.musicUnlockTimer);
      this.musicUnlockTimer = null;
    }
    if (deferRequestedMusic) {
      this.musicUnlockTimer = window.setTimeout(() => {
        this.musicUnlockTimer = null;
        this.beginSelectedMusic();
      }, 80);
    } else {
      this.beginSelectedMusic();
    }
  }

  public async prepare() {
    this.init();
    await this.preloadSamples(ALL_SAMPLE_KEYS);
  }

  public toggleMute() {
    this.muted = !this.muted;

    this.applyAudioLevels();
    if (this.muted) {
      if (this.musicUnlockTimer !== null) {
        window.clearTimeout(this.musicUnlockTimer);
        this.musicUnlockTimer = null;
      }
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      this.cancelPendingMusicPlayback();
      this.clearMusicFade();
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
    } else if (wasMuted && this.pageActive && this.musicRequested && !this.musicPaused) {
      this.init();
    }
    return this.sfxVolumeLevel;
  }

  public getMusicVolumeLevel() {
    return this.musicVolumeLevel;
  }

  public setMusicVolumeLevel(level: number) {
    const nextLevel = Math.max(0, Math.min(MAX_VOLUME_LEVEL, Math.round(level)));
    const wasSilent = this.musicVolumeLevel === 0;
    const wasMuted = this.muted;
    this.musicVolumeLevel = nextLevel;
    this.storeVolumeLevel(MUSIC_VOLUME_STORAGE_KEY, nextLevel);
    if (nextLevel > 0) this.muted = false;
    this.applyAudioLevels();
    if (nextLevel === 0) {
      this.clearMusicTimer();
      this.stopActiveMusicNodes();
      this.cancelPendingMusicPlayback();
      this.clearMusicFade();
      this.pauseMusicPlayer();
    } else if ((wasSilent || wasMuted) && this.pageActive && this.musicRequested && !this.musicPaused) {
      this.init();
    }
    return this.musicVolumeLevel;
  }

  public startMusic() {
    if (!this.musicPlaybackEnabled) return;
    if (this.musicScene === 'silent' || this.musicScene === 'results') {
      this.musicScene = 'mission';
    }
    if (!this.musicRequested) {
      this.musicStep = 0;
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
    this.cancelPendingMusicPlayback();
    this.pauseMusicPlayer();
    this.applyMusicPlayerVolume();
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
    if (this.musicUnlockTimer !== null) {
      window.clearTimeout(this.musicUnlockTimer);
      this.musicUnlockTimer = null;
    }
    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    this.cancelPendingMusicPlayback();
    this.clearMusicFade();
    this.pauseMusicPlayer(true);
  }

  public getMusicScene() {
    return this.musicScene;
  }

  public prepareMusicScene(scene: MusicScene = this.musicScene): Promise<void> {
    const track = this.getSceneMusicTrack(scene);
    if (!track?.src) return Promise.resolve();

    const absoluteSrc = new URL(track.src, window.location.href).href;
    const player = this.musicDecks.find((deck) => deck.src === absoluteSrc)
      || this.musicDecks.find((deck) => (
        deck !== this.musicPlayer
        && deck !== this.fadingMusicPlayer
        && deck !== this.pendingMusicPlayer
      ));
    // During a rapid second transition both decks can briefly be occupied.
    // Normal scene playback still loads the requested source once one is free.
    if (!player) return Promise.resolve();

    if (player.src !== absoluteSrc) {
      this.configureMusicDeck(player, track.src, track.loop);
    } else {
      player.loop = track.loop;
    }
    if (player.readyState >= 2) return Promise.resolve();

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        player.removeEventListener?.('canplay', finish);
        player.removeEventListener?.('loadeddata', finish);
        player.removeEventListener?.('error', finish);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve();
      };
      player.addEventListener?.('canplay', finish, { once: true });
      player.addEventListener?.('loadeddata', finish, { once: true });
      player.addEventListener?.('error', finish, { once: true });
      timeoutId = window.setTimeout(finish, MUSIC_PRELOAD_TIMEOUT_MS);
    });
  }

  public setMusicScene(scene: MusicScene) {
    if (scene === this.musicScene) {
      if (scene !== 'silent' && scene !== 'results' && !this.musicRequested) {
        this.musicRequested = true;
        if (!this.musicPaused) this.beginSelectedMusic();
      }
      return this.musicScene;
    }

    this.musicScene = scene;
    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    if (scene === 'silent' || scene === 'results') {
      this.musicRequested = false;
      this.musicPaused = false;
      this.cancelPendingMusicPlayback();
      this.fadeMusicToSilence();
      return this.musicScene;
    }

    this.musicRequested = true;
    this.musicPaused = false;
    this.beginSelectedMusic();
    return this.musicScene;
  }

  public setMusicPlaybackEnabled(enabled: boolean) {
    if (this.musicPlaybackEnabled === enabled) return;
    this.musicPlaybackEnabled = enabled;
    if (!enabled) this.stopMusic();
  }

  public isMusicPlaybackEnabled() {
    return this.musicPlaybackEnabled;
  }

  public getMusicTrackId() {
    return this.selectedMusicTrackId;
  }

  public subscribeMusicTrack(listener: (trackId: MissionMusicTrackId) => void) {
    this.musicTrackListeners.add(listener);
    return () => {
      this.musicTrackListeners.delete(listener);
    };
  }

  private notifyMusicTrackChanged() {
    this.musicTrackListeners.forEach((listener) => {
      try {
        listener(this.selectedMusicTrackId);
      } catch {
        // A presentation listener cannot interrupt soundtrack progression.
      }
    });
  }

  public setMusicTrack(trackId: MissionMusicTrackId) {
    if (!MISSION_MUSIC_TRACKS.some((track) => track.id === trackId)) {
      return this.selectedMusicTrackId;
    }
    if (trackId === this.selectedMusicTrackId) return trackId;

    this.clearMusicTimer();
    this.stopActiveMusicNodes();
    this.selectedMusicTrackId = trackId;
    this.musicStep = 0;
    try {
      window.localStorage?.setItem(MUSIC_TRACK_STORAGE_KEY, trackId);
    } catch {
      // The selection still applies for this session when storage is unavailable.
    }
    this.notifyMusicTrackChanged();
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

  private beginMusicTimer() {
    if (
      !this.ctx
      || this.musicTimer !== null
      || !this.musicRequested
      || this.muted
      || this.musicPaused
      || !this.pageActive
      || this.musicVolumeLevel === 0
      || this.getSelectedMusicTrack().src
    ) return;

    const pulse = () => {
      if (
        !this.ctx
        || this.muted
        || !this.musicGain
        || !this.pageActive
        || this.musicVolumeLevel === 0
      ) return;

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
      if (
        this.musicStep >= 256
        && this.musicScene === 'mission'
        && this.selectedMusicTrackId === 'scicon-flight'
      ) {
        this.advanceMusicTrack();
      }
    };

    pulse();
    this.musicTimer = window.setInterval(pulse, MISSION_STEP_MS);
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
}

export const audioService = new AudioService();
