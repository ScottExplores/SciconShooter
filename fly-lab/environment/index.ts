import { Rectangle } from 'pixi.js';
import { ASSETS } from '../../constants';
import { DEFAULT_GAME_CAMPAIGN } from '../../services/levelConfig';
import { collectRuntimeTextureUrls } from '../../services/gameplayAssetManifest';
import { createSeededGameplayRandom } from '../../services/gameplay/random';
import { getEnvironmentWindowTextureUrls, resolveCampaignEnvironmentWindow } from '../../services/pixi/PixiEnvironment';
import { PixiGameRenderer } from '../../services/pixi/PixiGameRenderer';
import { ACTION_TICKS, EpisodeRuntime, SIMULATION_FPS, VIEWPORT, freezeSnapshot, resolveEpisode, validateAction, type Action, type ResetOptions } from './core';
import { OBSERVATION_SIZE, bytesToBase64, rgbaToGray } from './pixels';

if (!['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)) {
  throw new Error('The experiment environment requires a loopback host.');
}

const host = document.getElementById('arena');
if (!host) throw new Error('The experiment arena host is missing.');
let runtime: EpisodeRuntime | null = null;
let renderer: PixiGameRenderer | null = null;
let busy = false;
let lastSequence: number | null = null;
let lastAction = '';
let lastResult: Awaited<ReturnType<typeof result>> | null = null;
let cachedFrame: ReturnType<typeof capture> | null = null;
const freshTimings = () => ({ engineMs: 0, renderMs: 0, pixelReadbackMs: 0, grayscaleMs: 0, pngMs: 0, stateMs: 0, ticks: 0 });
let timings = freshTimings();
let operationStartedAt = 0;

const requireRuntime = () => {
  if (!runtime || !renderer || runtime.closed) throw new Error('Reset the environment before using it.');
  return { runtime, renderer };
};

const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
  if (busy) throw new Error('An environment operation is already in progress.');
  busy = true;
  try { return await operation(); } finally { busy = false; }
};

function capture() {
  const active = requireRuntime();
  active.renderer.assertTextureManifest();
  let started = performance.now();
  const extracted = active.renderer.app.renderer.extract.pixels({
    target: active.renderer.app.stage,
    frame: new Rectangle(0, 0, VIEWPORT.width, VIEWPORT.height),
    resolution: 1,
    antialias: false,
    clearColor: '#020617'
  });
  timings.pixelReadbackMs += performance.now() - started;
  if (extracted.width !== VIEWPORT.width || extracted.height !== VIEWPORT.height) {
    throw new Error('Renderer framebuffer dimensions differ from the pinned observation viewport.');
  }
  started = performance.now();
  const grayBase64 = bytesToBase64(rgbaToGray(extracted.pixels, extracted.width, extracted.height));
  timings.grayscaleMs += performance.now() - started;
  started = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = extracted.width;
  canvas.height = extracted.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG capture requires a 2D canvas context.');
  context.putImageData(new ImageData(new Uint8ClampedArray(extracted.pixels), extracted.width, extracted.height), 0, 0);
  const pngDataUrl = canvas.toDataURL('image/png');
  timings.pngMs += performance.now() - started;
  return freezeSnapshot({
    frame: { pngDataUrl, width: extracted.width, height: extracted.height },
    observation: { grayBase64, ...OBSERVATION_SIZE }
  });
}

async function result() {
  const active = requireRuntime();
  cachedFrame ??= capture();
  const stateStarted = performance.now();
  const state = active.runtime.getState();
  timings.stateMs += performance.now() - stateStarted;
  return freezeSnapshot({
    tick: active.runtime.tick,
    simTimeMs: active.runtime.tick * 1000 / SIMULATION_FPS,
    state,
    events: active.runtime.takeEvents(),
    terminated: active.runtime.terminated,
    truncated: active.runtime.truncated,
    // Wall-clock diagnostics are deliberately outside the reproducible simulation state.
    timings: { ...timings, totalMs: performance.now() - operationStartedAt },
    ...cachedFrame
  });
}

const dispose = () => {
  runtime?.close();
  renderer?.destroy();
  runtime = null;
  renderer = null;
  cachedFrame = null;
  lastSequence = null;
  lastAction = '';
  lastResult = null;
  host.replaceChildren();
};

export const sciconFlyEnvironment = {
  reset: (options: ResetOptions) => exclusive(async () => {
    const config = resolveEpisode(options);
    dispose();
    timings = freshTimings();
    operationStartedAt = performance.now();
    document.documentElement.dataset.status = 'loading';
    try {
      // Pixi creates text during construction, so await the native local font first.
      await document.fonts.load('700 16px Orbitron');
      await document.fonts.ready;
      if (!document.fonts.check('700 16px Orbitron')) throw new Error('Required local Orbitron font did not load.');
      const environmentWindow = resolveCampaignEnvironmentWindow(DEFAULT_GAME_CAMPAIGN, config.levelId, config.waveId);
      const level = DEFAULT_GAME_CAMPAIGN.levels.find(candidate => candidate.id === config.levelId)!;
      const wave = level.waves.find(candidate => candidate.id === config.waveId)!;
      // Component art is chosen by the canonical Pixi rig, not embedded in wave spriteKey.
      const componentTextures = wave.events.some(event => event.kind === 'boss' && event.rigId === 'open-orbit')
        ? [ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_LEFT, ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT] : [];
      const textureUrls = [...new Set([
        config.playerShipUrl,
        ...componentTextures,
        ...collectRuntimeTextureUrls(DEFAULT_GAME_CAMPAIGN.hudAssets, DEFAULT_GAME_CAMPAIGN.recordCard, { ...level, waves: [wave] }),
        ...getEnvironmentWindowTextureUrls(environmentWindow),
        ...ASSETS.POWERUP_PROJECTILE_UPGRADE_FRAMES,
        ASSETS.POWERUP_MAX_SHOT,
        ...ASSETS.POWERUP_MAGNET_FRAMES,
        ...ASSETS.POWERUP_SHIELD_FRAMES,
        ...ASSETS.POWERUP_RESEARCH_BEAM_FRAMES,
        '/game-art/powerups/extra-life.png'
      ])].sort();
      for (const url of textureUrls) {
        const resolved = new URL(url, location.href);
        if (resolved.origin !== location.origin) throw new Error(`A scenario asset is not local: ${url}`);
      }
      renderer = new PixiGameRenderer({
        startupTextureUrls: textureUrls,
        startupTexturePolicy: 'required',
        resolution: 1,
        reducedMotion: false,
        environmentRandom: createSeededGameplayRandom(`${config.presentationSeed}:environment`).next,
        effectRandom: createSeededGameplayRandom(`${config.presentationSeed}:effects`).next
      });
      await renderer.init(host, VIEWPORT.width, VIEWPORT.height, environmentWindow);
      renderer.sealTextureManifest();
      runtime = new EpisodeRuntime(options);
      renderer.sync(runtime.engine, 0);
      renderer.assertTextureManifest();
      document.documentElement.dataset.status = 'ready';
      return await result();
    } catch (error) {
      dispose();
      document.documentElement.dataset.status = 'error';
      throw error;
    }
  }),

  step: (input: Action, sequence?: number) => exclusive(async () => {
    const action = validateAction(input);
    const actionKey = JSON.stringify(action);
    const nextSequence = sequence ?? (lastSequence === null ? 0 : lastSequence + 1);
    if (!Number.isSafeInteger(nextSequence) || nextSequence < 0) throw new Error('Sequence must be a nonnegative safe integer.');
    if (lastSequence === nextSequence) {
      if (lastAction !== actionKey) throw new Error('A duplicate sequence cannot change its action.');
      return lastResult!;
    }
    if (lastSequence !== null && nextSequence !== lastSequence + 1) throw new Error('Step sequence must advance by exactly one.');
    const active = requireRuntime();
    timings = freshTimings();
    operationStartedAt = performance.now();
    try {
      for (let index = 0; index < ACTION_TICKS; index++) {
        let started = performance.now();
        if (!active.runtime.advanceTick(action)) break;
        timings.engineMs += performance.now() - started;
        timings.ticks++;
        started = performance.now();
        active.renderer.sync(active.runtime.engine, active.runtime.tick * 1000 / SIMULATION_FPS);
        active.renderer.assertTextureManifest();
        timings.renderMs += performance.now() - started;
      }
      cachedFrame = null;
      const nextResult = await result();
      lastSequence = nextSequence;
      lastAction = actionKey;
      lastResult = nextResult;
      return nextResult;
    } catch (error) {
      // An operation that failed after advancing cannot be retried as a new advance.
      active.runtime.close();
      document.documentElement.dataset.status = 'error';
      throw error;
    }
  }),

  getFrame: () => exclusive(async () => { requireRuntime(); return cachedFrame ??= capture(); }),
  getState: () => { if (busy) throw new Error('An environment operation is already in progress.'); return requireRuntime().runtime.getState(); },
  close: () => exclusive(async () => { dispose(); document.documentElement.dataset.status = 'closed'; })
};

declare global { interface Window { sciconFlyEnvironment: typeof sciconFlyEnvironment } }
window.sciconFlyEnvironment = sciconFlyEnvironment;
document.documentElement.dataset.status = 'idle';
