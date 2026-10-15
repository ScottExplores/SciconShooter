import { ASSETS } from '../constants';
import { DEFAULT_GAME_CAMPAIGN } from '../services/levelConfig';
import { collectRuntimeTextureUrls } from '../services/gameplayAssetManifest';
import { PixiGameRenderer } from '../services/pixi/PixiGameRenderer';
import { resolveCampaignEnvironmentWindow, getEnvironmentWindowTextureUrls } from '../services/pixi/PixiEnvironment';
import { createSeededGameplayRandom } from '../services/gameplay/random';
import { LIMITS, QUESTIONS, REVIEW_QUESTIONS, MOVEMENTS, validateAnswers } from '../tools/jev/protocol.mjs';
import { VIEWPORT, LEVEL, createTrialEngine, observe, applyMovement, applySpecial, baselineAction, idle, type Action } from './runtime';

if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) throw new Error('Local development only.');
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const status = (text: string) => { el('status').textContent = text; };
let configured = false;
let preparing = false;
let active = false;
let finishing = false;
let inFlight = false;
let generation = 0;
let engine: ReturnType<typeof createTrialEngine> | null = null;
let renderer: PixiGameRenderer | null = null;
let tick = 0;
let action: Action = idle;
let lastDecision = 0;
let nextRequest = 0;
let started = 0;
let previousFrame = 0;
let accumulator = 0;
let raf = 0;
let controller: AbortController | null = null;
let report: any = null;
const history: any[] = [];

async function api(route: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/__jev/${route}`, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Playtest request failed.');
  return result;
}
function controls() {
  const locked = active || preparing || finishing;
  button('start').disabled = locked || !configured || !el<HTMLInputElement>('allow').checked;
  button('baseline').disabled = locked;
  button('connect').disabled = locked;
  button('stop').disabled = !active;
  button('review').disabled = locked || report?.controller !== 'jev' || !report?.decisions?.length || Boolean(report?.reviewRequested) || report?.failed || !el<HTMLInputElement>('allow').checked;
  button('download').disabled = locked || !report?.endedAt;
}
function hud() {
  if (!engine) return;
  el('score').textContent = String(engine.stats.score);
  el('lives').textContent = String(engine.lives);
  el('time').textContent = `${Math.floor(tick / 60)}s`;
}
function usage() {
  if (!report?.accounting) return;
  const { calls, inputTokens } = report.accounting;
  el('usage').textContent = `${calls} API calls · ${inputTokens.toLocaleString()} input tokens · estimated $${(inputTokens * 0.042 / 1e6).toFixed(5)} at listed price`;
}
async function finish(reason: string, failed = false) {
  if (!active) return;
  active = false; finishing = true; generation++; cancelAnimationFrame(raf);
  controller?.abort(); controller = null;
  for (const request of report.requests ?? []) if (request.status === 'pending') request.status = 'cancelled; provider usage may be incomplete';
  engine?.handleInput({}, null);
  report.endedAt = new Date().toISOString();
  report.reason = reason; report.failed = failed;
  report.simulationSeconds = tick / 60; report.wallSeconds = (performance.now() - started) / 1000;
  report.final = engine ? observe(engine, tick) : null;
  status(`${report.controller === 'jev' ? 'Jev' : 'Scripted baseline'} finished: ${reason}`);
  el('decision').textContent = `Final score: ${report.final?.score ?? 0} · ${report.decisions.length} ${report.controller === 'jev' ? 'Jev' : 'scripted'} decisions`;
  history.unshift({ controller: report.controller, seed: report.seed, score: report.final?.score ?? 0, reason });
  el('history').replaceChildren(...history.slice(0, 8).map(run => {
    const item = document.createElement('li'); item.textContent = `${run.controller === 'jev' ? 'Jev' : 'Scripted baseline'} · ${run.score} points · seed ${run.seed} · ${run.reason}`; return item;
  }));
  if (report.runId) {
    try { report.stop = await api('stop', { runId: report.runId }); } catch { report.stop = { confirmed: false }; }
  }
  finishing = false; controls(); hud();
}
async function decide() {
  if (!active || inFlight || !engine || report.controller !== 'jev') return;
  inFlight = true;
  const current = generation;
  const state = observe(engine, tick);
  const observedTick = tick;
  const requestedAt = performance.now();
  const currentReport = report;
  const request: any = { observedTick, state, requestedWallMs: requestedAt - started, status: 'pending' };
  currentReport.requests.push(request);
  nextRequest = requestedAt + LIMITS.intervalMs + 10;
  controller = new AbortController();
  try {
    const response = validateAnswers(await api('decision', { runId: report.runId, state }, controller.signal));
    request.response = response; request.receivedWallMs = performance.now() - started;
    currentReport.accounting = (response as any).accounting;
    if (!active || current !== generation) return;
    const latency = performance.now() - requestedAt;
    if (latency > 1000) { request.status = 'discarded: stale'; await finish('Decision arrived over one second late', true); return; }
    action = { movement: response.answers.movement.choice, special: response.answers.special.choice };
    lastDecision = performance.now();
    const specialApplied = applySpecial(engine, action);
    request.status = 'applied'; request.appliedTick = tick;
    report.decisions.push({ observedTick, appliedTick: tick, state, action, specialApplied, latencyMs: latency, response });
    report.accounting = (response as any).accounting;
    report.model = response.model;
    el('decision').textContent = `${MOVEMENTS[action.movement]} · ${action.special} · ${Math.round(latency)}ms · confidence ${(response.answers.movement.confidence * 100).toFixed(0)}%`;
    usage();
  } catch (error) {
    if (request.status === 'pending') { request.status = 'error'; request.error = (error as Error).message; }
    if (active && current === generation) await finish((error as Error).message, true);
  } finally { if (current === generation) inFlight = false; }
}
function frame(now: number) {
  if (!active || !engine || !renderer) return;
  try {
    if (now - started >= LIMITS.seconds * 1000) { void finish('60-second trial limit'); return; }
    if (report.controller === 'jev' && now - lastDecision > 1250) { void finish('No fresh Jev decision for 1.25 seconds', true); return; }
    const delta = now - previousFrame;
    if (delta > 1000) { void finish('Browser stalled; trial stopped', true); return; }
    accumulator += Math.min(delta, 100); previousFrame = now;
    while (accumulator >= 1000 / 60 && active) {
      if (report.controller === 'scripted' && tick % 15 === 0) {
        action = baselineAction(engine);
        report.decisions.push({ appliedTick: tick, action, state: observe(engine, tick) });
      }
      applyMovement(engine, action); engine.update(false); tick++; accumulator -= 1000 / 60;
      if (engine.lives <= 0 || !engine.gameActive) { void finish('Game over'); break; }
      if (engine.waveVictoryReady && !engine.continueToNextWave()) { void finish('Mission complete'); break; }
    }
    renderer.sync(engine, tick * 1000 / 60); hud();
    if (active && report.controller === 'jev' && now >= nextRequest) void decide();
    if (active) raf = requestAnimationFrame(frame);
  } catch (error) { void finish(`Runtime error: ${(error as Error).message}`, true); }
}
async function start(mode: 'jev' | 'scripted') {
  if (active || preparing || finishing || (mode === 'jev' && (!configured || !el<HTMLInputElement>('allow').checked))) return;
  const seed = Number(el<HTMLInputElement>('seed').value);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 999999999) { status('Enter a seed from 0 to 999999999.'); return; }
  preparing = true; controls(); status('Loading Scicon gameplay and artwork…');
  try {
    engine?.handleInput({}, null); renderer?.destroy(); renderer = null; engine = null;
    el('arena').replaceChildren();
    await document.fonts.load('700 16px Orbitron');
    const environment = resolveCampaignEnvironmentWindow(DEFAULT_GAME_CAMPAIGN, LEVEL.id, LEVEL.waves[0].id);
    const textureUrls = [...new Set([ASSETS.PLAYER_SHIP, ...collectRuntimeTextureUrls(DEFAULT_GAME_CAMPAIGN.hudAssets, DEFAULT_GAME_CAMPAIGN.recordCard, LEVEL), ...getEnvironmentWindowTextureUrls(environment)])];
    renderer = new PixiGameRenderer({ startupTextureUrls: textureUrls, startupTexturePolicy: 'required', resolution: 1,
      environmentRandom: createSeededGameplayRandom(`${seed}:environment`).next, effectRandom: createSeededGameplayRandom(`${seed}:effects`).next });
    await renderer.init(el('arena'), VIEWPORT.width, VIEWPORT.height, environment);
    engine = createTrialEngine(seed); tick = 0; action = idle; renderer.sync(engine, 0); hud();
    report = {
      version: 1, controller: mode, seed, createdAt: new Date().toISOString(),
      engine: 'Canonical Scicon GameEngine', levelId: LEVEL.id, campaignRevision: DEFAULT_GAME_CAMPAIGN.revision,
      policy: { normalDamage: true, startingLives: 3, upgrades: 0, autoFire: true, observation: 'structured visible state', decisionHz: 4, leaderboardSubmission: false },
      limits: LIMITS, questions: mode === 'jev' ? QUESTIONS : null, requests: [], decisions: [], feedback: null
    };
    if (mode === 'jev') {
      const result = await api('start', {}); report.runId = result.runId;
    }
    generation++; inFlight = false; active = true; preparing = false;
    started = performance.now(); previousFrame = started; accumulator = 0; nextRequest = started; lastDecision = started;
    el('feedback').textContent = mode === 'jev' ? 'Run in progress. An assessment can be requested after it ends.' : 'Scripted baseline only. No Jev model has been called.';
    el('usage').textContent = mode === 'jev' ? 'Waiting for the first Jev decision…' : 'Free scripted baseline · no model calls.';
    el('decision').textContent = mode === 'jev' ? 'Waiting for Jev…' : 'Scripted pilot running · this is not Jev.';
    status(mode === 'jev' ? 'Jev trial running' : 'Scripted baseline running'); controls(); raf = requestAnimationFrame(frame);
  } catch (error) {
    preparing = false; status(`Could not start: ${(error as Error).message}`); controls();
  }
}
button('connect').onclick = async () => {
  const input = el<HTMLInputElement>('key');
  const key = input.value; input.value = '';
  try { await api('key', { key }); configured = true; status('Key loaded locally. Access will be verified on the first Jev call.'); }
  catch (error) { status((error as Error).message); }
  controls();
};
button('start').onclick = () => void start('jev');
button('baseline').onclick = () => void start('scripted');
button('stop').onclick = () => void finish('Stopped by user');
el('allow').onchange = controls;
button('review').onclick = async () => {
  if (!report?.runId || !el<HTMLInputElement>('allow').checked) return;
  finishing = true; report.reviewRequested = true; controls();
  try {
    const stride = Math.max(1, Math.ceil(report.decisions.length / 6));
    const samples = report.decisions.filter((_: unknown, index: number) => index % stride === 0).slice(0, 6).map((entry: any) => ({
      seconds: entry.state.seconds, score: entry.state.score, lives: entry.state.lives, enemiesDefeated: entry.state.enemiesDefeated,
      threats: entry.state.threats.slice(0, 5), pickups: entry.state.pickups.slice(0, 2), action: entry.action, latencyMs: entry.latencyMs
    }));
    report.reviewQuestions = REVIEW_QUESTIONS;
    report.reviewState = { reason: report.reason, final: { score: report.final.score, lives: report.final.lives, enemiesDefeated: report.final.enemiesDefeated }, samples, limitation: 'Structured-state playtest only; no images, audio, human enjoyment, or training. Limited controller skill can confound difficulty.' };
    const result = await api('review', { runId: report.runId, state: report.reviewState });
    report.feedback = result; report.accounting = result.accounting;
    usage();
    el('feedback').textContent = `Jev assessment (not feelings):\nStrongest mechanic: ${result.answers.strongest.choice}\nPossible concern: ${result.answers.concern.choice}\nConfidence: ${(result.answers.strongest.confidence * 100).toFixed(0)}% / ${(result.answers.concern.confidence * 100).toFixed(0)}%`;
  } catch (error) { report.reviewError = (error as Error).message; el('feedback').textContent = report.reviewError; }
  finishing = false; controls();
};
button('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `scicon-${report.controller}-${report.seed}-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener('visibilitychange', () => { if (document.hidden && active) void finish('Tab hidden'); });
void api('status').then(result => {
  configured = result.configured;
  status(configured ? 'Server key is loaded. Ready for a Jev access check.' : 'Jev disconnected · TypeSafe API access required'); controls();
}).catch(error => { status(error.message); controls(); });
