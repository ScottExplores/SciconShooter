import type { GameEngine } from '../../gameLogic';
import { getAutoplayInput, isQAEnemy, isQAEnemyBullet, isQAOnScreen } from './autoplayBot';
import type { QAConfig } from './config';

export interface QACounts { enemies: number; enemyBullets: number }

export interface QAState extends QACounts {
  ready: boolean;
  gameActive: boolean;
  levelId: string | null;
  waveId: string | null;
  score: number;
  wave: number;
  lives: number;
  bossHp: number | null;
  bossPhase: string | number | null;
  fps: number;
  errors: string[];
  frame: number;
  simulationSteps: number;
  worldWidth: number;
  worldHeight: number;
  seed: number;
  autoplay: boolean;
  god: boolean;
  damageTaken: number;
  complete: boolean;
}

export interface QABridge {
  state(): QAState;
  fps(): number;
  counts(): QACounts;
}

declare global {
  interface Window { __sciconQA?: QABridge }
}

/** Bounded error and render samples live only for this explicitly opted-in canvas. */
export function attachQARuntime(config: QAConfig, getEngine: () => GameEngine | null, host: Window = window) {
  if (!config.enabled) return null;
  let ready = false;
  let simulationSteps = 0;
  const errors: string[] = [];
  const renderTimes: number[] = [];
  const rememberError = (value: unknown) => {
    const message = value instanceof Error ? value.message : String(value ?? 'Unknown error');
    errors.push(message.slice(0, 500));
    if (errors.length > 30) errors.shift();
  };
  const onError = (event: ErrorEvent) => rememberError(event.message || event.error);
  const onRejection = (event: PromiseRejectionEvent) => rememberError(event.reason);
  const fps = () => {
    if (renderTimes.length < 2) return 0;
    const elapsed = renderTimes[renderTimes.length - 1] - renderTimes[0];
    return elapsed > 0 ? Math.round((renderTimes.length - 1) * 10000 / elapsed) / 10 : 0;
  };
  const counts = (): QACounts => {
    const engine = getEngine();
    const counts = { enemies: 0, enemyBullets: 0 };
    if (!engine) return counts;
    for (const entity of engine.entities) {
      if (!isQAOnScreen(entity, engine.width, engine.height)) continue;
      if (isQAEnemy(entity) && entity.hp > 0) counts.enemies++;
      if (isQAEnemyBullet(entity)) counts.enemyBullets++;
    }
    return counts;
  };
  const bridge: QABridge = Object.freeze({
    fps,
    counts,
    state: () => {
      const engine = getEngine();
      const runtime = engine?.getRuntimeState();
      const boss = engine?.bossRef && !engine.bossRef.markedForDeletion
        ? engine.bossRef
        : engine?.miniBossRef && !engine.miniBossRef.markedForDeletion ? engine.miniBossRef : null;
      return {
        ready,
        gameActive: Boolean(engine?.gameActive),
        levelId: runtime?.levelId ?? null,
        waveId: runtime?.waveId ?? null,
        score: engine?.stats.score ?? 0,
        wave: engine?.wave ?? 0,
        lives: engine?.lives ?? 0,
        bossHp: boss?.hp ?? null,
        bossPhase: boss?.gatekeeperPrimePhaseId ?? boss?.bossTimelinePhaseId ?? boss?.activeBossPhaseId
          ?? (boss && boss.activeBossPhaseIndex >= 0 ? boss.activeBossPhaseIndex : null),
        fps: fps(),
        errors: [...errors],
        frame: engine?.frameCount ?? 0,
        simulationSteps,
        worldWidth: engine?.width ?? 0,
        worldHeight: engine?.height ?? 0,
        seed: config.seed,
        autoplay: config.autoplay,
        god: config.god,
        damageTaken: runtime?.damageTaken ?? 0,
        complete: runtime?.complete ?? false,
        ...counts()
      };
    }
  });
  host.__sciconQA = bridge;
  host.addEventListener('error', onError);
  host.addEventListener('unhandledrejection', onRejection);
  return {
    /** Runs immediately before one ordinary 60 Hz simulation step. */
    beforeStep(engine: GameEngine) {
      simulationSteps++;
      // Existing collision/ram invulnerability; no alternate simulation or damage rules.
      if (config.god) engine.invincibleTimer = Math.max(engine.invincibleTimer, 3600);
      if (config.autoplay) engine.handleInput(getAutoplayInput(engine, config.seed), null);
    },
    rendered(timestamp: number) {
      ready = true;
      renderTimes.push(timestamp);
      while (renderTimes.length > 2 && renderTimes[0] < timestamp - 2000) renderTimes.shift();
      if (renderTimes.length > 240) renderTimes.shift();
    },
    rememberError,
    dispose() {
      host.removeEventListener('error', onError);
      host.removeEventListener('unhandledrejection', onRejection);
      if (host.__sciconQA === bridge) delete host.__sciconQA;
    }
  };
}
