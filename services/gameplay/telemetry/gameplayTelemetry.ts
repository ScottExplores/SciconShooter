export type GameplayTelemetryCompletionScope = 'wave' | 'mission' | 'campaign' | 'preview';
export type GameplayTelemetrySessionEndReason = 'disposed' | 'restart' | 'complete' | 'defeat';

interface GameplayTelemetryEventBase {
  readonly frame: number;
  readonly elapsedSeconds: number;
  readonly levelId: string;
  readonly waveId: string;
}

export type GameplayTelemetryEvent =
  | (GameplayTelemetryEventBase & {
    readonly type: 'session-start';
    readonly seed: number;
    readonly viewportWidth: number;
    readonly viewportHeight: number;
  })
  | (GameplayTelemetryEventBase & {
    readonly type: 'session-end';
    readonly reason: GameplayTelemetrySessionEndReason;
  })
  | (GameplayTelemetryEventBase & {
    readonly type: 'wave-start';
    readonly levelNumber: number;
    readonly waveNumber: number;
  })
  | (GameplayTelemetryEventBase & {
    readonly type: 'boss-phase';
    readonly bossId: string;
    readonly phaseId: string;
    readonly phaseIndex: number;
    readonly healthRatio: number;
  })
  | (GameplayTelemetryEventBase & {
    readonly type: 'entity-damage';
    readonly targetId: string;
    readonly targetKind: string;
    readonly sourceKind: 'player' | 'enemy' | 'environment';
    readonly amount: number;
    readonly remainingHealth: number;
    readonly fatal: boolean;
  })
  | (GameplayTelemetryEventBase & {
    readonly type: 'player-death';
    readonly livesRemaining: number;
  })
  | (GameplayTelemetryEventBase & {
    readonly type: 'completion';
    readonly scope: GameplayTelemetryCompletionScope;
    readonly score: number;
  });

export interface GameplayTelemetryAggregate {
  readonly recordedEventCount: number;
  readonly retainedEventCount: number;
  readonly droppedEventCount: number;
  readonly latestFrame: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly entitiesDestroyed: number;
  readonly playerDeaths: number;
  readonly wavesStarted: number;
  readonly wavesCompleted: number;
  readonly bossPhaseTransitions: number;
  readonly completions: number;
}

export interface GameplayTelemetrySnapshot {
  readonly events: readonly GameplayTelemetryEvent[];
  readonly aggregate: GameplayTelemetryAggregate;
}

export interface GameplayTelemetrySink {
  record(event: GameplayTelemetryEvent): void;
  getSnapshot(): GameplayTelemetrySnapshot;
  clear(): void;
}

export interface GameplayTelemetrySinkOptions {
  /** Oldest events are discarded after this cap; aggregate counters remain complete. */
  maxEvents?: number;
}

const normalizeFinite = (value: number, fallback = 0) => (
  Number.isFinite(value) ? value : fallback
);

const normalizeEvent = (event: GameplayTelemetryEvent): GameplayTelemetryEvent => Object.freeze({
  ...event,
  frame: Math.max(0, Math.floor(normalizeFinite(event.frame))),
  elapsedSeconds: Math.max(0, normalizeFinite(event.elapsedSeconds))
});

export const createBoundedGameplayTelemetrySink = (
  options: GameplayTelemetrySinkOptions = {}
): GameplayTelemetrySink => {
  const maxEvents = Math.max(1, Math.min(4096, Math.floor(options.maxEvents ?? 1024)));
  const events: GameplayTelemetryEvent[] = [];
  let recordedEventCount = 0;
  let droppedEventCount = 0;
  let latestFrame = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let entitiesDestroyed = 0;
  let playerDeaths = 0;
  let wavesStarted = 0;
  let wavesCompleted = 0;
  let bossPhaseTransitions = 0;
  let completions = 0;

  const clear = () => {
    events.length = 0;
    recordedEventCount = 0;
    droppedEventCount = 0;
    latestFrame = 0;
    damageDealt = 0;
    damageTaken = 0;
    entitiesDestroyed = 0;
    playerDeaths = 0;
    wavesStarted = 0;
    wavesCompleted = 0;
    bossPhaseTransitions = 0;
    completions = 0;
  };

  return Object.freeze({
    record: (candidate: GameplayTelemetryEvent) => {
      const event = normalizeEvent(candidate);
      recordedEventCount += 1;
      latestFrame = Math.max(latestFrame, event.frame);

      if (event.type === 'wave-start') wavesStarted += 1;
      if (event.type === 'boss-phase') bossPhaseTransitions += 1;
      if (event.type === 'player-death') playerDeaths += 1;
      if (event.type === 'completion') {
        completions += 1;
        if (event.scope === 'wave') wavesCompleted += 1;
      }
      if (event.type === 'entity-damage') {
        if (event.sourceKind === 'player') damageDealt += Math.max(0, event.amount);
        if (event.targetKind === 'player') damageTaken += Math.max(0, event.amount);
        if (event.fatal && event.targetKind !== 'player') entitiesDestroyed += 1;
      }

      events.push(event);
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
        droppedEventCount = recordedEventCount - events.length;
      }
    },
    getSnapshot: () => Object.freeze({
      events: Object.freeze(events.slice()),
      aggregate: Object.freeze({
        recordedEventCount,
        retainedEventCount: events.length,
        droppedEventCount,
        latestFrame,
        damageDealt,
        damageTaken,
        entitiesDestroyed,
        playerDeaths,
        wavesStarted,
        wavesCompleted,
        bossPhaseTransitions,
        completions
      })
    }),
    clear
  });
};
