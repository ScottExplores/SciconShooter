import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import WatchAnatomy, { WatchAnatomyMetadata } from './WatchAnatomy';
import { api } from './api';
import { clockLabel, DIRECTIONS, EMPTY_FRAME, frameIndexAt, WatchCatalog, WatchFrame, WatchLive, WatchManifest } from './watchData';
import { InputSignalTrace, recentReward, signalIllustration, validateInputTrace } from './watchSignals';
import './watch.css';

const Anatomy = memo(WatchAnatomy);
function Glyph({ name }: { name: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'play' ? <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" /> : name === 'pause' ? <><path d="M8 5v14M16 5v14" strokeWidth="4" /></> : name === 'expand' ? <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /> : name === 'loop' ? <><path d="M4 10V8a3 3 0 0 1 3-3h13l-3-3m3 3-3 3M20 14v2a3 3 0 0 1-3 3H4l3 3m-3-3 3-3" /></> : name === 'leaf' ? <><path d="M20 3C10 3 3 7 5 14s13 7 15-11ZM5 20 15 9" /></> : name === 'arrow' ? <path d="M5 12h14m-5-5 5 5-5 5" /> : <><path d="M4 12h16M12 4v16" /></>}</svg>;
}
async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal: signal || AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Display data unavailable (${response.status}).`);
  return response.json();
}

function Movement({ frame, trail, available }: { frame: WatchFrame; trail: WatchFrame[]; available: boolean }) {
  const direction = DIRECTIONS[frame.movement];
  const points = trail.filter(item => item.player && Number.isFinite(item.player.x) && Number.isFinite(item.player.y));
  const path = points.map(item => `${(item.player!.x / 390 * 116 + 62).toFixed(1)},${(item.player!.y / 844 * 116 + 4).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]?.player;
  return <section className="watch-movement" aria-label="Recorded controls and movement">
    <div className={`watch-compass ${direction && available ? 'is-moving' : ''}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={available ? direction ? `Movement command: ${direction.label}` : 'Movement command: hold position' : 'No movement recorded'}>
        <circle cx="60" cy="60" r="47" /><circle cx="60" cy="60" r="34" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => <path key={angle} d="M60 6v7" transform={`rotate(${angle} 60 60)`} />)}
        {available && direction ? <g transform={`rotate(${direction.angle} 60 60)`}><path className="watch-direction-glow" d="M60 82V35M42 52l18-19 18 19" /><path className="watch-direction" d="M60 82V35M42 52l18-19 18 19" /></g> : <circle className="watch-direction" cx="60" cy="60" r="5" />}
      </svg>
    </div>
    <div className="watch-action-copy"><span className="watch-eyebrow">MOVEMENT COMMAND</span><h2>{!available ? 'Ready to watch' : direction ? <>Moving <span>{direction.label}</span></> : 'Holding position'}</h2><span className={`watch-fire ${available && frame.fire ? 'on' : ''}`}><i />{available && frame.fire ? 'Firing' : 'Fire released'}</span><p>Recorded control input</p></div>
    <div className="watch-trail"><span className="watch-eyebrow">FLIGHT PATH</span><svg viewBox="0 0 240 124" aria-label="Actual ship positions over the last three simulated seconds" role="img"><path className="watch-trail-grid" d="M62 4H178V120H62Z M62 62H178 M120 4V120" /><polyline points={path} />{last && <circle cx={last.x / 390 * 116 + 62} cy={last.y / 844 * 116 + 4} r="3.5" />}</svg><span className="watch-tiny">Last 3 seconds</span></div>
  </section>;
}

export default function Watch({ offline = false }: { offline?: boolean }) {
  const shell = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), vision = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'replay' | 'live'>('replay');
  const [catalog, setCatalog] = useState<WatchCatalog | null>(null), [selected, setSelected] = useState('');
  const [manifest, setManifest] = useState<WatchManifest | null>(null), [timeline, setTimeline] = useState<WatchFrame[]>([]);
  const [inputTrace, setInputTrace] = useState<InputSignalTrace | null>(null), [illustrate, setIllustrate] = useState(false);
  const [live, setLive] = useState<WatchLive | null>(null), [liveTrail, setLiveTrail] = useState<WatchFrame[]>([]);
  const [liveDisconnected, setLiveDisconnected] = useState(false);
  const [frame, setFrame] = useState<WatchFrame>(EMPTY_FRAME), [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true), [lowPower, setLowPower] = useState(offline), [visible, setVisible] = useState(!document.hidden);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [full, setFull] = useState(false);
  const [retry, setRetry] = useState(0);
  const [metadata, setMetadata] = useState<WatchAnatomyMetadata | null>(null);
  const resumeAfterHidden = useRef(false), displayedRun = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (offline) return;
    try { const next = await api<WatchCatalog>('/watch'); setCatalog(next); setSelected(old => old || next.runs.find(run => run.status === 'ready')?.runId || ''); }
    catch (e) { setError((e as Error).message); }
  }, [offline]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (offline || !visible || catalog?.job.status !== 'building') return;
    const timer = setInterval(() => { void refresh(); }, 1000); return () => clearInterval(timer);
  }, [offline, visible, catalog?.job.status, refresh]);
  useEffect(() => {
    const changed = () => { setVisible(!document.hidden); const player = video.current; if (document.hidden) { resumeAfterHidden.current = !!player && !player.paused; player?.pause(); } else { if (resumeAfterHidden.current) void player?.play().catch(() => undefined); void refresh(); } };
    const fullscreen = () => setFull(!!document.fullscreenElement);
    document.addEventListener('visibilitychange', changed); document.addEventListener('fullscreenchange', fullscreen);
    return () => { document.removeEventListener('visibilitychange', changed); document.removeEventListener('fullscreenchange', fullscreen); };
  }, [refresh]);
  const ready = offline || catalog?.runs.find(run => run.runId === selected)?.status === 'ready';
  useEffect(() => {
    setManifest(null); setTimeline([]); setFrame(EMPTY_FRAME); setTime(0);
    setInputTrace(null);
    vision.current?.getContext('2d')?.clearRect(0, 0, 96, 208);
    if (!ready || (!offline && !selected)) return;
    const abort = new AbortController(); let active = true; setLoading(true); setError('');
    const deadline = setTimeout(() => abort.abort(), 15000);
    const url = offline ? './watch-manifest.json' : `/lab-api/watch/${encodeURIComponent(selected)}`;
    readJson<WatchManifest>(url, abort.signal).then(async next => {
      const signalUrl = next.signals?.url || (!offline ? `/lab-api/watch/${encodeURIComponent(selected)}/signals` : null);
      const [frames, trace] = await Promise.all([
        readJson<WatchFrame[]>(next.timeline.url, abort.signal),
        signalUrl ? readJson<InputSignalTrace>(signalUrl, abort.signal).catch(() => null) : Promise.resolve(null),
      ]);
      if (!frames.length || frames.length !== next.timeline.entries || frames.some((row, index) => !Number.isFinite(row.videoTimeSeconds) || index > 0 && row.videoTimeSeconds < frames[index - 1].videoTimeSeconds)) throw new Error('The replay timeline is incomplete or invalid.');
      let checked: InputSignalTrace | null = null;
      if (trace) { try { checked = validateInputTrace(trace, frames); } catch { /* Playback remains usable; missing signals are explicitly shown. */ } }
      if (active) { setManifest(next); setTimeline(frames); setFrame(frames[0]); setInputTrace(checked); }
    }).catch(e => { if (active) setError(e.name === 'AbortError' ? 'Opening the recording timed out. Retry to load it again.' : e.message); }).finally(() => { clearTimeout(deadline); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(deadline); abort.abort(); };
  }, [offline, selected, ready, retry]);
  useEffect(() => {
    if (mode !== 'live' || !visible || offline) return;
    let active = true, timer: ReturnType<typeof setTimeout>; const abort = new AbortController();
    const poll = async () => {
      try { const next = await api<WatchLive>('/watch/live', undefined, AbortSignal.any([abort.signal, AbortSignal.timeout(5000)])); if (active) { setLive(next); setLiveDisconnected(false); setError(next.error || ''); } }
      catch (e) { if (active) { setLiveDisconnected(true); setLive(null); setFrame(EMPTY_FRAME); setLiveTrail([]); setTime(0); vision.current?.getContext('2d')?.clearRect(0, 0, 96, 208); setError((e as Error).message); } }
      if (active) timer = setTimeout(poll, lowPower ? 500 : 200);
    }; void poll(); return () => { active = false; clearTimeout(timer); abort.abort(); };
  }, [mode, visible, offline, lowPower]);
  const drawVision = useCallback((source: CanvasImageSource) => {
    const context = vision.current?.getContext('2d'); if (!context) return;
    context.filter = 'grayscale(1)'; context.drawImage(source, 0, 0, 96, 208);
  }, []);
  useEffect(() => {
    const player = video.current; if (!player || mode !== 'replay' || !timeline.length || !visible) return;
    let active = true, token = 0, seekPaint = 0, last = -1;
    const sync = (seconds: number, decodedFrame = false) => { if (!active) return; const index = frameIndexAt(timeline, seconds); const changed = index !== last; if (changed) { last = index; setFrame(timeline[index]); setTime(seconds); } if ((decodedFrame || changed && !('requestVideoFrameCallback' in player)) && player.readyState >= 2) drawVision(player); };
    // A seek can update time before the decoded frame is ready. Always refresh
    // the preview on the actual video callback, even if its index was just seen.
    const decoded = (_now: number, info: VideoFrameCallbackMetadata) => { sync(info.mediaTime, true); if (active) token = player.requestVideoFrameCallback(decoded); };
    const fallback = () => { sync(player.currentTime); if (active) token = requestAnimationFrame(fallback); };
    const seek = () => { sync(player.currentTime); cancelAnimationFrame(seekPaint); seekPaint = requestAnimationFrame(() => { seekPaint = 0; if (active && player.readyState >= 2) drawVision(player); }); };
    if ('requestVideoFrameCallback' in player) token = player.requestVideoFrameCallback(decoded); else token = requestAnimationFrame(fallback);
    player.addEventListener('seeked', seek); player.addEventListener('loadeddata', seek);
    return () => { active = false; cancelAnimationFrame(seekPaint); if ('cancelVideoFrameCallback' in player) player.cancelVideoFrameCallback(token); else cancelAnimationFrame(token); player.removeEventListener('seeked', seek); player.removeEventListener('loadeddata', seek); };
  }, [manifest, timeline, mode, visible, drawVision]);
  const acceptLiveFrame = (image: HTMLImageElement) => {
    if (!live) return; drawVision(image);
    const next = { ...live, ...live.action, videoTimeSeconds: live.simTimeMs / 1000 } as WatchFrame;
    setFrame(next); setTime(next.videoTimeSeconds);
    const runChanged = displayedRun.current !== live.runId; displayedRun.current = live.runId;
    setLiveTrail(old => { const clean = runChanged || old.length && (old[old.length - 1].seq > next.seq || old[old.length - 1].simTimeMs > next.simTimeMs) ? [] : old; return [...clean.filter(row => row.seq !== next.seq && row.simTimeMs >= next.simTimeMs - 3000), next]; });
  };
  function switchMode(next: 'replay' | 'live') { if (next === mode) return; video.current?.pause(); setMode(next); setLive(null); setLiveDisconnected(false); setFrame(EMPTY_FRAME); setTime(0); setLiveTrail([]); setError(''); vision.current?.getContext('2d')?.clearRect(0, 0, 96, 208); }
  function retryDisplay() { setError(''); setRetry(value => value + 1); void refresh(); }
  async function createDemo() { setBusy(true); setError(''); try { await api('/watch/demo', { timeLimitSeconds: 30 }); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function buildSelected() { setBusy(true); setError(''); try { await api('/watch/build', { runId: selected }); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const available = mode === 'replay' ? !!manifest : !!live?.frameUrl;
  const currentIndex = frameIndexAt(timeline, time);
  const trail = mode === 'replay' ? timeline.slice(Math.max(0, currentIndex - 60), currentIndex + 1) : liveTrail;
  const duration = manifest?.media.durationSeconds || 0, job = catalog?.job;
  const label = mode === 'replay' ? manifest?.controllerLabel : live?.controllerLabel;
  const chosen = catalog?.runs.find(run => run.runId === selected);
  const imageChange = mode === 'replay' ? inputTrace?.frames[currentIndex]?.inputChange ?? null : frame.inputChange ?? null;
  const rewardCue = mode === 'replay' ? recentReward(timeline, currentIndex) : recentReward(liveTrail, liveTrail.length - 1);
  const signals = signalIllustration(frame, imageChange, rewardCue.amount * rewardCue.strength, available);
  const liveLabel = liveDisconnected ? 'DISCONNECTED' : live?.running ? 'LIVE' : !live?.runId ? 'STANDBY' : ({ stopped: 'STOPPED', completed: 'FINISHED', error: 'ERROR', interrupted: 'INTERRUPTED', paused: 'PAUSED', ready: 'READY' }[live.status] || live.status.toUpperCase());
  return <div className="watch-shell" ref={shell}>
    <header className="watch-header"><a className="watch-brand" href={offline ? './watch.html' : '#watch'}><span className="watch-logo"><i /><i /><i /></span><span>SCICON <b>FLY LAB</b></span></a><span className="watch-header-divider" /><span className="watch-title">Watch</span><div className="watch-header-actions">{offline ? <span className="watch-tiny">DISPLAY EDITION</span> : <a className="watch-research" href="#live">Research controls <Glyph name="arrow" /></a>}<button className={`watch-icon ${lowPower ? 'selected' : ''}`} aria-label="Low power display" aria-pressed={lowPower} title="Low power: still anatomy and fewer live updates" onClick={() => setLowPower(value => !value)}><Glyph name="leaf" /></button><button className="watch-icon" aria-label={full ? 'Exit full screen' : 'Enter full screen'} onClick={() => { const request = document.fullscreenElement ? document.exitFullscreen() : shell.current?.requestFullscreen(); void request?.catch(() => setError('Full screen is unavailable in this browser.')); }}><Glyph name="expand" /></button></div></header>
    {error && <div className="watch-message" role="alert"><span>{error}</span><button onClick={retryDisplay}>Retry</button></div>}
    <main className="watch-grid">
      <section className="watch-game watch-panel" aria-label="Scicon Shooter game"><div className="watch-panel-head"><div><span className="watch-eyebrow">SCICON SHOOTER</span><h1>Orbit entry</h1></div><span className={`watch-state ${mode === 'live' && live?.running ? 'is-live' : ''}`}><i />{mode === 'live' ? liveLabel : 'REPLAY · DOES NOT TRAIN'}</span></div>
        <div className="watch-game-screen">
          {mode === 'replay' && manifest ? <video key={manifest.runId} ref={video} src={manifest.media.url} poster={manifest.media.posterUrl} muted playsInline autoPlay loop={loop} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError('The replay video could not be loaded. Refresh the display or choose another recording.')} aria-label="Recorded Scicon Shooter gameplay" /> : mode === 'live' && live?.frameUrl ? <img key={live.frameUrl} src={live.frameUrl} alt="Current Scicon Shooter game frame" onLoad={event => acceptLiveFrame(event.currentTarget)} /> : <div className="watch-empty"><div className="watch-empty-orbit"><span>✦</span></div><h2>{loading ? 'Opening the recording' : job?.status === 'building' ? 'Preparing a replay' : mode === 'live' ? 'Waiting for an episode' : 'A small fly. A big experiment.'}</h2><p>{mode === 'live' ? 'Start an episode in Research controls, then watch it here.' : job?.status === 'building' ? `${job.stage === 'recording' ? 'Recording the game' : 'Verifying and encoding'} · ${job.done} / ${job.total}` : 'Watch the real game, its controls, and the anatomy behind the experiment.'}</p>{mode === 'replay' && !offline && job?.status !== 'building' && <><button className="watch-primary" disabled={busy || !!chosen && !chosen.sourceMatched && chosen.status !== 'ready'} onClick={chosen?.status === 'ready' ? retryDisplay : selected ? buildSelected : createDemo}><Glyph name="play" />{chosen?.status === 'ready' ? 'Retry recording' : selected ? 'Prepare this recording' : 'Create baseline demo'}</button><small>A one-time capture; playback is lightweight.</small></>}</div>}
        </div>
        <div className="watch-scoreboard"><div><span>SCORE</span><strong>{available ? frame.score.toLocaleString() : '—'}</strong></div><div><span>LIVES</span><strong className="watch-lives">{available ? <><span aria-hidden="true">{'◆'.repeat(Math.max(0, Math.min(5, frame.lives)))}</span><span className="watch-sr-only">{frame.lives}</span></> : '—'}</strong></div><div><span>SIM TIME</span><strong>{available ? clockLabel(frame.simTimeMs / 1000) : '—'}</strong></div></div>
      </section>
      <section className="watch-brain watch-panel" aria-label="MaleCNS anatomical preview"><div className="watch-panel-head"><div><span className="watch-eyebrow">MALECNS · DROSOPHILA</span><h2>Inside the fly</h2></div><button className={`watch-signal-toggle ${illustrate ? 'selected' : ''}`} aria-label="Illustrated game cues" aria-pressed={illustrate} onClick={() => setIllustrate(value => !value)} title="Show image-change and control illustrations; these are not recorded neuron spikes"><i />{illustrate ? 'Illustration on' : 'Show cue illustration'}</button></div><div className="watch-truth-label" role="note"><strong>Source anatomy · no neuron activity overlay</strong><span>{illustrate ? 'Colored pulses illustrate game input and controls, not recorded neuron firing.' : 'Colors identify anatomical groups. Neural activity is not connected to this view.'}</span></div><div className="watch-brain-stage"><Anatomy active={!lowPower && visible && (playing || mode === 'live')} lowPower={lowPower} onMetadata={setMetadata} signals={signals} illustrate={illustrate} /><div className="watch-vision"><span className="watch-eyebrow">GAME PIXEL PREVIEW</span><canvas width="96" height="208" ref={vision} aria-label="Grayscale preview of the displayed gameplay" /><small>Grayscale preview</small></div></div><div className="watch-brain-caption"><div className="watch-signal-readouts" aria-label="Signal illustration sources"><div><span><i />IMAGE CHANGE</span><strong>{available && imageChange !== null ? `${Math.round(imageChange * 100)}%` : '—'}</strong><meter min="0" max="1" value={imageChange ?? 0} aria-label="Scaled change in recorded grayscale input" /></div><div><span><i />CONTROL OUTPUT</span><strong>{!available ? '—' : frame.movement !== 'idle' ? 'Moving' : frame.fire ? 'Firing' : 'Idle'}</strong></div><div className={`watch-reward-cue ${rewardCue.amount > 0 ? 'positive' : rewardCue.amount < 0 ? 'negative' : ''}`}><span><i />RECORDED REWARD</span><strong>{rewardCue.amount ? `${rewardCue.amount > 0 ? '+' : ''}${rewardCue.amount}` : '—'}</strong></div></div><p>{illustrate && !lowPower ? 'Illustrated game cues over source anatomy · not recorded neuron firing.' : `Actual cell locations${metadata ? ` · ${metadata.displayedSomaCount.toLocaleString()} shown` : ''}.`}{illustrate && lowPower ? ' Low power holds the anatomy still.' : ''}</p><details className="watch-signal-help"><summary>What do the lights and rewards mean?</summary><p>Cyan illustrates changes in the recorded grayscale frames; 100% is a scaled display level, not the percentage of neurons firing. Amber illustrates movement and fire commands on the nerve cord and selected descending anatomy. These colors do not establish which neurons caused an action.</p><p>Recorded reward: +1 per enemy destroyed, −5 per life lost. Coin pickups currently give 0 training reward. Score and reward are different. The random baseline has no neural worker and receives no dopamine-like reinforcement.</p>{imageChange === null && <p>Image-change recording is unavailable for this view; the cyan illustration remains off.</p>}</details></div></section>
      <Movement frame={frame} trail={trail} available={available} />
    </main>
    <div className="watch-transport"><div className="watch-modes" role="group" aria-label="Display source"><button className={mode === 'replay' ? 'active' : ''} aria-pressed={mode === 'replay'} onClick={() => switchMode('replay')}>Replay</button>{!offline && <button className={mode === 'live' ? 'active' : ''} aria-pressed={mode === 'live'} onClick={() => switchMode('live')}><i />Live</button>}</div><button className="watch-play" disabled={mode !== 'replay' || !manifest} aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { const player = video.current; if (!player) return; if (player.paused) void player.play().catch(e => setError(e.message)); else player.pause(); }}><Glyph name={playing ? 'pause' : 'play'} /></button><span className="watch-clock">{clockLabel(time)}<span> / {mode === 'replay' ? clockLabel(duration) : 'LIVE'}</span></span><input className="watch-seek" type="range" aria-label="Replay position" min="0" max={Math.max(duration, 0.05)} step="0.05" value={mode === 'replay' ? Math.min(time, duration) : 0} disabled={mode !== 'replay' || !manifest} onChange={event => { const next = Number(event.target.value); if (video.current) video.current.currentTime = next; setTime(next); setFrame(timeline[frameIndexAt(timeline, next)] || EMPTY_FRAME); }} /><button className={`watch-icon watch-loop ${loop ? 'selected' : ''}`} aria-label="Loop replay" aria-pressed={loop} disabled={mode !== 'replay'} onClick={() => setLoop(value => !value)}><Glyph name="loop" /></button>{!offline && <select aria-label="Replay recording" value={selected} disabled={mode !== 'replay' || busy} onChange={event => { setError(''); setSelected(event.target.value); }}><option value="">Choose a recording</option>{catalog?.runs.map(run => <option value={run.runId} key={run.runId}>{run.controllerLabel} · {run.runId.slice(0, 8)} {run.runId.slice(9, 15)}{run.status === 'ready' ? '' : run.sourceMatched ? ' · prepare' : ' · source changed'}</option>)}</select>}</div>
    <footer className="watch-footer"><span><i />{label || 'Connectome-based learning experiment'}{label ? mode === 'replay' ? ' replay' : ' live view' : ''}<b>·</b>Learning has not been demonstrated</span><span>{offline ? 'Offline replay · PC can be switched off' : mode === 'replay' ? 'Playback does not run the simulation' : 'Viewing does not control the experiment'}</span></footer>
    {job?.status === 'building' && <div className="watch-job" role="status"><span>{job.stage === 'recording' ? 'Recording baseline' : 'Preparing replay'} · {job.done}/{job.total}</span><button onClick={async () => { try { await api('/watch/cancel', {}); await refresh(); } catch (e) { setError((e as Error).message); } }}>Cancel</button></div>}
    {(job?.status === 'failed' || job?.status === 'cancelled') && <div className="watch-job" role="status">{job.status === 'failed' ? `Replay preparation failed: ${job.error || 'See Research controls.'}` : 'Replay preparation cancelled.'}</div>}
  </div>;
}
