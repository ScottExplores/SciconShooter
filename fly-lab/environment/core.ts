import { ASSETS } from '../../constants';
import { EntityType, PowerupType, type Stats } from '../../types';
import { GameEngine, type Entity, type GameEngineRuntimeEvent } from '../../services/gameLogic';
import { DEFAULT_GAME_CAMPAIGN } from '../../services/levelConfig';
import { createSeededGameplayRandom, type GameplayRandomSeed } from '../../services/gameplay/random';
import { createBoundedGameplayTelemetrySink, type GameplayTelemetryEvent } from '../../services/gameplay/telemetry';

export const ENVIRONMENT_VERSION = 'scicon-fly-environment-v1';
export const VIEWPORT = Object.freeze({ width: 390, height: 844 });
export const SIMULATION_FPS = 60;
export const ACTION_TICKS = 3;
export const MOVEMENTS = ['idle', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Movement = typeof MOVEMENTS[number];
export interface Action { movement: Movement; fire: boolean }
export interface EpisodeOptions {
  levelId?: string;
  waveId?: string;
  task?: 'boss-practice-v1';
  practicePhase?: 'boss' | 'wave';
  timeLimitSeconds?: number;
  presentationSeed?: GameplayRandomSeed;
}
export interface ResetOptions { seed: GameplayRandomSeed; episode?: EpisodeOptions }
type EpisodeEvent = (GameplayTelemetryEvent | GameEngineRuntimeEvent | {
  type: 'primary-fire-input'; held: boolean; frame: number
}) & { tick: number; simTimeMs: number };

export const freezeSnapshot = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
  return value;
};

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const validateSeed = (seed: unknown): GameplayRandomSeed => {
  if (typeof seed === 'string' && seed.length > 0 && seed.length <= 256) return seed;
  if (typeof seed === 'number' && Number.isSafeInteger(seed)) return seed;
  throw new Error('Seed must be a finite safe integer or a nonempty string of at most 256 characters.');
};

export const resolveEpisode = (input: ResetOptions) => {
  if (!input || typeof input !== 'object') throw new Error('A reset configuration is required.');
  const seed = validateSeed(input.seed);
  const episode = input.episode ?? {};
  if (episode.task !== undefined && episode.task !== 'boss-practice-v1') throw new Error('Unknown research task.');
  if (episode.practicePhase !== undefined && (!episode.task || !['boss', 'wave'].includes(episode.practicePhase))) {
    throw new Error('practicePhase requires the boss-practice-v1 task and boss or wave.');
  }
  const practicePhase = episode.task ? episode.practicePhase ?? 'boss' : null;
  const practiceLevelId = practicePhase === 'boss' ? 'stage-bastion-protocol' : 'operation-open-galaxy';
  if (episode.task && episode.levelId !== undefined && episode.levelId !== practiceLevelId) {
    throw new Error('Boss Practice uses its frozen Mission configuration.');
  }
  const levelId = episode.task ? practiceLevelId : episode.levelId ?? 'operation-open-galaxy';
  const level = DEFAULT_GAME_CAMPAIGN.levels.find(candidate => candidate.id === levelId);
  if (!level) throw new Error(`Unknown campaign Mission: ${levelId}`);
  const practiceWaveId = practicePhase === 'boss' ? 'stage-bastion-protocol-wave-4' : level.waves[0].id;
  if (episode.task && episode.waveId !== undefined && episode.waveId !== practiceWaveId) {
    throw new Error('Boss Practice uses its frozen wave configuration.');
  }
  const waveId = episode.task ? practiceWaveId : episode.waveId ?? level.waves[0].id;
  if (!level.waves.some(wave => wave.id === waveId)) throw new Error(`Unknown wave in selected Mission: ${waveId}`);
  const timeLimitSeconds = episode.timeLimitSeconds ?? (practicePhase === 'wave' ? 30 : practicePhase === 'boss' ? 180 : 90);
  const maximumDuration = episode.task ? 180 : 90;
  if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds <= 0 || timeLimitSeconds > maximumDuration) {
    throw new Error(`timeLimitSeconds must be greater than zero and at most ${maximumDuration}.`);
  }
  return freezeSnapshot({
    seed,
    presentationSeed: validateSeed(episode.presentationSeed ?? `${seed}:presentation`),
    levelId,
    levelName: level.name,
    waveId,
    task: episode.task ?? null,
    practicePhase,
    practicePolicy: episode.task ? {
      playerInvulnerable: true, pickupsEnabled: false, constantFire: true,
      allowedMovements: ['W', 'idle', 'E'], playerTopY: Math.round(VIEWPORT.height * 0.82),
      bossBehavior: 'Canonical Gatekeeper patrol, shielding, components and health-dependent phases are preserved.',
      comparisonStatus: 'Engineered aiming assay; no claim of neural learning.'
    } : null,
    timeLimitSeconds,
    maxTicks: Math.max(1, Math.floor(timeLimitSeconds * SIMULATION_FPS)),
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    startingLives: 3,
    playerShipId: 'researchhub' as const,
    playerShipUrl: ASSETS.PLAYER_SHIP,
    actionTicks: ACTION_TICKS,
    simulationFps: SIMULATION_FPS
  });
};

export const validateAction = (input: Action): Action => {
  if (!input || typeof input !== 'object' || !MOVEMENTS.includes(input.movement) || typeof input.fire !== 'boolean') {
    throw new Error('Action requires movement idle/N/NE/E/SE/S/SW/W/NW and a Boolean fire value.');
  }
  return Object.freeze({ movement: input.movement, fire: input.fire });
};

export const actionKeys = (action: Action): Record<string, boolean> => ({
  ArrowUp: action.movement.includes('N'),
  ArrowDown: action.movement.includes('S'),
  ArrowLeft: action.movement.includes('W'),
  ArrowRight: action.movement.includes('E'),
  ' ': action.fire
});

const createStats = (): Stats => ({
  score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
  bombs: 0, bombCharge: 0, bombChargeMax: 100, lives: 3, repairsCount: 0,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960,
  upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: Object.fromEntries(Object.values(PowerupType).map(type => [type, 0])) as Stats['powerupUses'],
  bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100
});

/** Privileged diagnostics; these are never a biological controller's sensory input. */
const observeEntity = (engine: GameEngine, entity: Entity) => ({
  id: entity.id, type: entity.type, x: entity.x, y: entity.y,
  width: entity.width, height: entity.height, vx: entity.vx, vy: entity.vy,
  hp: entity.hp, maxHp: entity.maxHp,
  collisionBounds: engine.getCollisionBox(entity),
  damage: entity.damage, contactDamage: entity.contactDamage, projectileDamage: entity.projectileDamage,
  isPlayerShot: Boolean(entity.isPlayerShot), isBeam: Boolean(entity.isBeam),
  beamAxis: entity.beamAxis ?? null, bossOwnerId: entity.bossOwnerId ?? null,
  sourceEventId: entity.sourceEventId ?? null, sourceItemId: entity.sourceItemId ?? null,
  roleId: entity.campaignRoleId ?? null, powerup: entity.type === EntityType.POWERUP ? entity.text : null,
  life: entity.life, bossComponents: copy(entity.bossComponents ?? [])
});

/** The production engine, manually clocked; constructing a new instance is the reset boundary. */
export class EpisodeRuntime {
  readonly config: ReturnType<typeof resolveEpisode>;
  readonly engine: GameEngine;
  readonly telemetry = createBoundedGameplayTelemetrySink({ maxEvents: 4096 });
  tick = 0;
  closed = false;
  private readonly pendingEvents: EpisodeEvent[] = [];
  private readonly offeredEvents = new Set<string>();
  private previousFire = false;
  private appliedAction: Action = { movement: 'idle', fire: false };
  private bossDefeated = false;

  constructor(options: ResetOptions) {
    this.config = resolveEpisode(options);
    const presentation = createSeededGameplayRandom(this.config.presentationSeed);
    // Canvas fallback assets are unused by Pixi. This inert object starts no image request.
    const absentCanvasImage = Object.freeze({ complete: false, naturalWidth: 0, naturalHeight: 0 }) as HTMLImageElement;
    this.engine = new GameEngine(createStats(), {
      campaign: DEFAULT_GAME_CAMPAIGN,
      initialLevelId: this.config.levelId,
      initialWaveId: this.config.waveId,
      playerShipId: this.config.playerShipId,
      playerShipUrl: this.config.playerShipUrl,
      randomSeed: this.config.seed,
      previewMode: false,
      previewInvincible: false,
      audioEnabled: false,
      preloadCanvasAssets: false,
      refillLivesAtMissionBoundary: false,
      runtimeHooks: {
        nowMs: () => this.tick * 1000 / SIMULATION_FPS,
        presentationRandom: presentation.next,
        loadCanvasImage: () => absentCanvasImage,
        emitDomainEvent: () => {},
        recordRuntimeEvent: event => {
          if (event.type === 'enemy-spawn-offer') {
            const key = `${event.campaignIndex}:${event.sourceEventId}`;
            if (this.offeredEvents.has(key)) return;
            this.offeredEvents.add(key);
          }
          this.recordEvent(event);
        },
        fixedPerformanceMode: false,
        stableEntityIds: true,
        playerInvulnerable: Boolean(this.config.task),
        disablePickups: Boolean(this.config.task)
      },
      telemetrySink: {
        record: event => { this.telemetry.record(event); this.recordEvent(event); },
        getSnapshot: () => this.telemetry.getSnapshot(),
        clear: () => { this.telemetry.clear(); this.pendingEvents.length = 0; }
      }
    });
    this.engine.init(VIEWPORT.width, VIEWPORT.height);
    if (this.config.task) {
      this.engine.stats.bombs = 0;
      this.engine.stats.bombCharge = 0;
    }
    // The engine initializes native bomb inventory; v1 deliberately exposes neither bombs nor abilities.
    this.engine.handleInput({}, null);
  }

  get terminated() {
    return this.engine.lives <= 0 || this.engine.waveVictoryReady || this.engine.campaignComplete || !this.engine.gameActive;
  }

  get truncated() { return !this.terminated && this.tick >= this.config.maxTicks; }

  private recordEvent(event: GameplayTelemetryEvent | GameEngineRuntimeEvent | { type: 'primary-fire-input'; held: boolean; frame: number }) {
    if (event.type === 'entity-damage' && event.targetKind === EntityType.BOSS && event.fatal) this.bossDefeated = true;
    this.pendingEvents.push(copy({ ...event, tick: this.tick, simTimeMs: this.tick * 1000 / SIMULATION_FPS }));
  }

  advanceTick(action: Action) {
    if (this.closed) throw new Error('Episode is closed.');
    if (this.terminated || this.truncated) return false;
    const requested = validateAction(action);
    if (this.config.task && !['W', 'idle', 'E'].includes(requested.movement)) {
      throw new Error('Boss Practice accepts only W, idle or E movement.');
    }
    const accepted = this.config.task ? { ...requested, fire: true } : requested;
    this.appliedAction = accepted;
    this.constrainPracticePosition();
    this.engine.handleInput(actionKeys(accepted), null);
    this.tick++;
    if (accepted.fire !== this.previousFire) {
      this.previousFire = accepted.fire;
      this.recordEvent({ type: 'primary-fire-input', held: accepted.fire, frame: this.engine.frameCount });
    }
    this.engine.update(false);
    this.constrainPracticePosition();
    return true;
  }

  private constrainPracticePosition() {
    if (!this.config.practicePolicy || this.engine.introFlightFrames > 0 || this.engine.waveDepartureFrames > 0) return;
    this.engine.player.y = this.config.practicePolicy.playerTopY;
    this.engine.playerVel.y = 0;
  }

  takeEvents() {
    return freezeSnapshot(this.pendingEvents.splice(0));
  }

  getState() {
    const engine = this.engine;
    return freezeSnapshot({
      version: ENVIRONMENT_VERSION,
      tick: this.tick,
      simTimeMs: this.tick * 1000 / SIMULATION_FPS,
      terminated: this.terminated, truncated: this.truncated,
      appliedAction: copy(this.appliedAction),
      practice: this.config.task ? {
        phase: this.config.practicePhase, bossDefeated: this.bossDefeated,
        outcome: this.bossDefeated ? 'boss-defeated' : this.truncated ? 'time-limit' : this.terminated ? 'wave-complete' : 'in-progress'
      } : null,
      score: engine.stats.score, lives: engine.lives, coins: engine.stats.coins,
      totalCoins: engine.stats.totalCoins, enemiesDefeated: engine.stats.enemiesDefeated,
      runtime: engine.getRuntimeState(),
      stats: copy(engine.stats),
      player: { ...observeEntity(engine, engine.player), vx: engine.playerVel.x, vy: engine.playerVel.y, invincibleFrames: engine.invincibleTimer },
      entities: engine.entities
        .filter(entity => !entity.markedForDeletion && entity.type !== EntityType.PARTICLE && entity.type !== EntityType.EFFECT)
        .map(entity => observeEntity(engine, entity)),
      activePowerups: Object.fromEntries(engine.activePowerups),
      timers: { intro: engine.introFlightFrames, hitStop: engine.hitStopFrames, death: engine.deathSequenceFrames, departure: engine.waveDepartureFrames, waveProgress: engine.waveProgressFrames, combatFrames: engine.waveFlightFrames },
      performance: { fixed: true, performanceMode: engine.performanceMode, heavySceneLoad: engine.heavySceneLoad, mobileProfile: engine.mobileProfile },
      telemetry: copy(this.telemetry.getSnapshot().aggregate),
      completion: copy(engine.getWaveVictorySummary()),
      config: this.config
    });
  }

  close() {
    if (this.closed) return;
    this.engine.stopTelemetrySession('disposed');
    this.engine.handleInput({}, null);
    this.engine.clearQueuedPrimaryBursts();
    this.engine.gameActive = false;
    this.closed = true;
  }
}
