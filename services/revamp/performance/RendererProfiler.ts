import { Graphics } from 'pixi.js';

type Timings = Record<string, { totalMs: number; maxMs: number; calls: number; graphicsClears: number }>;
type MethodHost = Record<string, any>;

/** Opt-in local diagnostics. No timers, wrappers or global state in ordinary play. */
export function installRendererProfiler(owner: object) {
  if (new URLSearchParams(location.search).get('perf') !== '1') return;
  const target = owner as MethodHost;
  let timings: Timings = {};
  let frames = 0;
  let clears = 0;
  let filterPasses = 0;
  let batches: Record<string, { draws: number; maxTextures: number; shaderSamplers: number }> = {};
  let active = false;
  const restore: Array<() => void> = [];
  const wrap = (host: MethodHost, key: string, callback: (original: (...args: any[]) => any, args: any[]) => any) => {
    const original = host[key];
    if (typeof original !== 'function') return;
    host[key] = function (...args: any[]) { return callback(original.bind(this), args); };
    restore.push(() => { host[key] = original; });
  };
  const timed = (name: string, host: MethodHost, key: string) => wrap(host, key, (original, args) => {
    const start = performance.now();
    const startClears = clears;
    try { return original(...args); }
    finally {
      const ms = performance.now() - start;
      const entry = timings[name] ??= { totalMs: 0, maxMs: 0, calls: 0, graphicsClears: 0 };
      entry.totalMs += ms; entry.maxMs = Math.max(entry.maxMs, ms); entry.calls++;
      entry.graphicsClears += clears - startClears;
    }
  });
  wrap(Graphics.prototype, 'clear', (original, args) => { if (active) clears++; return original(...args); });
  if (target.app.renderer.filter) wrap(target.app.renderer.filter, 'applyFilter', (original, args) => {
    if (active) filterPasses++;
    return original(...args);
  });
  wrap(target.app.renderer.renderPipes.batch, 'execute', (original, args) => {
    if (active) {
      const batch = args[0];
      const entry = batches[batch.batcher.name] ??= { draws: 0, maxTextures: 0, shaderSamplers: 0 };
      entry.draws++;
      entry.maxTextures = Math.max(entry.maxTextures, batch.textures.count);
      entry.shaderSamplers = batch.batcher.shader.maxTextures;
    }
    return original(...args);
  });
  for (const key of ['syncEntities', 'syncCombatImpacts', 'syncPlayerThrusters', 'syncGunPods', 'syncCombatLighting', 'syncBossHealthHud', 'updateWavePresentation', 'updateWarnings', 'updateBossPresentation']) timed(key, target, key);
  timed('environment', target.environment, 'update');
  timed('effects', target.effectPool, 'update');
  timed('feel', target.feelPresentation, 'beginFrame');
  timed('bossCues', target.bossPolishPresentation, 'sync');
  timed('pixiRenderSubmit', target.app.renderer, 'render');
  timed('syncTotal', target, 'sync');
  wrap(target, 'sync', (original, args) => {
    active = true;
    try { return original(...args); } finally { frames++; active = false; }
  });
  const bridge = {
    reset() { timings = {}; batches = {}; frames = clears = filterPasses = 0; },
    snapshot() {
      return {
        frames, graphicsClears: clears, filterPasses, batches,
        resolution: target.app.renderer.resolution,
        particles: target.effectPool.getStats(),
        atlas: target.textureBank.getAtlasStats(),
        views: target.views.size,
        quality: target.feelQuality.budget ?? { particleScale: target.feelQuality.scale },
        phases: Object.fromEntries(Object.entries(timings).map(([name, value]) => [name, { ...value, meanMs: value.totalMs / value.calls, clearsPerCall: value.graphicsClears / value.calls }]))
      };
    }
  };
  (window as any).__sciconPerf = bridge;
  wrap(target, 'destroy', (original, args) => {
    for (const undo of restore.reverse()) undo();
    if ((window as any).__sciconPerf === bridge) delete (window as any).__sciconPerf;
    return original(...args);
  });
}
