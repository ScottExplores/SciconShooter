/** REVAMP(T): Presentation barrier only. Combat/Weekly clocks and rewards stay authoritative. */
type Engine = { frameCount: number; feel?: { resetGeneration: number } };
type Death = { started: number; frame: number; finished?: number };
type RewardText = { x: number; y: number; text: string; color: string; fontSize: number };
type Banner = { label: string; color: string; rewardText?: RewardText };
type State = { generation: number; deaths: Map<object, Death>; banner?: Banner };
const states = new WeakMap<Engine, State>();
export const BOSS_COMPLETION_BEAT_MS = 300;
export const BOSS_COMPLETION_CAP_MS = 4000;

function stateFor(engine: Engine): State {
  let state = states.get(engine);
  const generation = engine.feel?.resetGeneration ?? 0;
  if (!state || state.generation !== generation) {
    state = { generation, deaths: new Map() };
    states.set(engine, state);
  }
  return state;
}

export function registerBossDeath(engine: Engine, request: object, now = performance.now()) {
  const state = stateFor(engine);
  // Same bound as S's queue; dropped visual requests must not leak ownership.
  if (state.deaths.size >= 4) state.deaths.delete(state.deaths.keys().next().value!);
  state.deaths.set(request, { started: now, frame: engine.frameCount });
}

export function finishBossDeath(engine: Engine, request: object, now = performance.now()) {
  const death = stateFor(engine).deaths.get(request);
  if (death && death.finished === undefined) death.finished = now;
}

function waiting(engine: Engine, state: State, now: number) {
  for (const [request, death] of state.deaths) {
    // Wall clock handles a stalled/missing presenter; fixed ticks also bound headless runs.
    const elapsed = Math.max(now - death.started, (engine.frameCount - death.frame) * 1000 / 60);
    if (elapsed >= BOSS_COMPLETION_CAP_MS
      || (death.finished !== undefined && now - death.finished >= BOSS_COMPLETION_BEAT_MS)) {
      state.deaths.delete(request);
    }
  }
  return state.deaths.size > 0;
}

export function deferBossCompletion(engine: Engine, label: string, color: string, now = performance.now()) {
  const state = stateFor(engine);
  if (!waiting(engine, state, now)) return false;
  state.banner = { label, color };
  return true;
}

export function takeBossCompletion(engine: Engine, now = performance.now()): Banner | undefined {
  const state = stateFor(engine);
  if (!state.banner || waiting(engine, state, now)) return;
  const banner = state.banner;
  state.banner = undefined;
  return banner;
}

export function hasDeferredBossCompletion(engine: Engine) {
  const state = states.get(engine);
  return Boolean(state && state.generation === (engine.feel?.resetGeneration ?? 0) && state.banner);
}

/** Coalesce the flask notification only; charge/coin credit happens immediately as before. */
export function deferBossRewardText(engine: Engine, x: number, y: number, text: string, color: string, fontSize: number) {
  if (!text.startsWith('FLASK +') || !hasDeferredBossCompletion(engine)) return false;
  stateFor(engine).banner!.rewardText = { x, y, text, color, fontSize };
  return true;
}
