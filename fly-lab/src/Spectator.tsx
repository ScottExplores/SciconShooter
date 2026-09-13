import React, { memo, useEffect, useRef, useState } from 'react';
import WatchAnatomy from './WatchAnatomy';
import { clockLabel, DIRECTIONS, EMPTY_FRAME, frameIndexAt, WatchCatalog, WatchFrame, WatchManifest } from './watchData';
import { InputSignalTrace, signalIllustration, validateInputTrace } from './watchSignals';
import { sequenceAt, validateSequence, type ExhibitClip, type ExhibitSequence, recentPoints } from './spectatorData';
import './watch.css';
import './spectator.css';

const Anatomy = memo(WatchAnatomy);
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`The recording could not be loaded (${response.status}).`);
  return response.json();
}
export default function Spectator({ offline = false }: { offline?: boolean }) {
  const [sequence, setSequence] = useState<ExhibitSequence | null>(null);
  const [clipIndex, setClipIndex] = useState(0), [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false), [lowPower, setLowPower] = useState(false);
  const [visible, setVisible] = useState(!document.hidden), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [full, setFull] = useState(false);
  const shell = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), vision = useRef<HTMLCanvasElement>(null);
  const resume = useRef(false);
  useEffect(() => {
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 20000);
    let active = true; setError(''); setSequence(null); setClipIndex(0); setFrameIndex(0);
    (async () => {
      let entries: { runId: string; manifest: string }[];
      if (offline) {
        const playlist = await json<{ version: number; entries: typeof entries }>('./exhibit.json', abort.signal);
        if (playlist.version !== 1 || !Array.isArray(playlist.entries) || !playlist.entries.length || playlist.entries.length > 20) throw new Error('The showcase playlist is invalid.');
        entries = playlist.entries;
      } else {
        const catalog = await json<WatchCatalog>('/lab-api/watch', abort.signal);
        entries = catalog.runs.filter(run => run.status === 'ready').slice(0, 4).reverse().map(run => ({ runId: run.runId, manifest: `/lab-api/watch/${encodeURIComponent(run.runId)}` }));
        if (!entries.length) throw new Error('No verified recording is ready to show yet.');
      }
      if (new Set(entries.map(entry => entry.runId)).size !== entries.length) throw new Error('The showcase contains a duplicate recording.');
      const clips: ExhibitClip[] = await Promise.all(entries.map(async entry => {
        const manifest = await json<WatchManifest>(entry.manifest, abort.signal);
        if (manifest.runId !== entry.runId) throw new Error('A recording does not match its playlist.');
        const timeline = await json<WatchFrame[]>(manifest.timeline.url, abort.signal);
        let input: InputSignalTrace | null = null;
        if (manifest.signals?.url) {
          try { input = validateInputTrace(await json<InputSignalTrace>(manifest.signals.url, abort.signal), timeline); } catch { /* Unavailable input cues stay off. */ }
        } else if (!offline) {
          try { input = validateInputTrace(await json<InputSignalTrace>(`/lab-api/watch/${encodeURIComponent(entry.runId)}/signals`, abort.signal), timeline); } catch { /* Never fabricate missing measurements. */ }
        }
        return { manifest, timeline, input };
      }));
      const checked = validateSequence(clips);
      if (active) setSequence(checked);
    })().catch(e => { if (active) setError(e.name === 'AbortError' ? 'The recording took too long to load. Please retry.' : e.message); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); abort.abort(); };
  }, [offline, retry]);
  const clip = sequence?.clips[clipIndex];
  const frame = clip?.timeline[frameIndex] || EMPTY_FRAME;
  const progress = sequenceAt(sequence, clipIndex, frameIndex);
  const points = recentPoints(clip?.timeline || [], frameIndex);
  const inputChange = clip?.input?.frames[frameIndex]?.inputChange ?? null;
  const signals = signalIllustration(frame, inputChange, 0, !!clip);
  useEffect(() => {
    const change = () => { setVisible(!document.hidden); if (document.hidden) { resume.current = !!video.current && !video.current.paused; video.current?.pause(); } else if (resume.current) void video.current?.play().catch(() => setPlaying(false)); };
    const fullscreen = () => setFull(!!document.fullscreenElement);
    document.addEventListener('visibilitychange', change); document.addEventListener('fullscreenchange', fullscreen);
    return () => { document.removeEventListener('visibilitychange', change); document.removeEventListener('fullscreenchange', fullscreen); };
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!player || !clip || !visible) return;
    let active = true, token = 0;
    const paint = (seconds: number) => {
      if (!active) return;
      setFrameIndex(frameIndexAt(clip.timeline, seconds));
      const context = vision.current?.getContext('2d');
      if (context && player.readyState >= 2) { context.filter = 'grayscale(1)'; context.drawImage(player, 0, 0, 96, 208); }
    };
    const decoded = (_now: number, info: VideoFrameCallbackMetadata) => { paint(info.mediaTime); if (active) token = player.requestVideoFrameCallback(decoded); };
    const fallback = () => { paint(player.currentTime); if (active) token = requestAnimationFrame(fallback); };
    if ('requestVideoFrameCallback' in player) token = player.requestVideoFrameCallback(decoded); else token = requestAnimationFrame(fallback);
    const seek = () => paint(player.currentTime);
    player.addEventListener('seeked', seek); player.addEventListener('loadeddata', seek);
    return () => { active = false; if ('cancelVideoFrameCallback' in player) player.cancelVideoFrameCallback(token); else cancelAnimationFrame(token); player.removeEventListener('seeked', seek); player.removeEventListener('loadeddata', seek); };
  }, [clip, visible]);
  function nextClip() { setFrameIndex(0); setClipIndex(index => (index + 1) % (sequence?.clips.length || 1)); if (sequence?.clips.length === 1 && video.current) { video.current.currentTime = 0; void video.current.play().catch(() => setPlaying(false)); } }
  function togglePlayback() { const player = video.current; if (!player) return; if (player.paused) void player.play().catch(() => setError('Press play again to start the recording.')); else player.pause(); }
  const direction = DIRECTIONS[frame.movement];
  const trail = clip?.timeline.slice(Math.max(0, frameIndex - 60), frameIndex + 1).filter(row => row.player && Number.isFinite(row.player.x) && Number.isFinite(row.player.y)) || [];
  const path = trail.map(row => `${(row.player!.x / 390 * 116 + 62).toFixed(1)},${(row.player!.y / 844 * 116 + 4).toFixed(1)}`).join(' ');
  return <div className="watch-shell spectator" ref={shell}>
    <header className="watch-header"><a className="watch-brand" href={offline ? './' : '#watch'}><span className="watch-logo"><i /><i /><i /></span><span>SCICON <b>FLY LAB</b></span></a><div className="watch-header-actions"><a className="spectator-link" href="https://www.researchhub.com/" target="_blank" rel="noreferrer">ResearchHub ↗</a><a className="spectator-link" href="https://sciconshooter.xyz/" target="_blank" rel="noreferrer">Play Scicon ↗</a><button className={`watch-icon ${lowPower ? 'selected' : ''}`} aria-label="Low power display" aria-pressed={lowPower} onClick={() => setLowPower(value => !value)} title="Reduce animation">◒</button><button className="watch-icon" aria-label={full ? 'Exit full screen' : 'Enter full screen'} onClick={() => { void (document.fullscreenElement ? document.exitFullscreen() : shell.current?.requestFullscreen())?.catch(() => setError('Full screen is unavailable in this browser.')); }}>⛶</button></div></header>
    {error && <div className="watch-message" role="alert"><span>{error}</span><button onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    <main className="watch-grid">
      <section className="watch-game watch-panel" aria-label="Scicon Shooter recording"><div className="watch-panel-head"><div><span className="watch-eyebrow">SCICON SHOOTER</span><h1>Orbit entry</h1></div><span className="watch-state"><i />RECORDED</span></div><div className="watch-game-screen">
        {clip ? <video key={`${clip.manifest.runId}-${retry}`} ref={video} src={clip.manifest.media.url} poster={clip.manifest.media.posterUrl} muted playsInline autoPlay preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={nextClip} onError={() => setError('This recording could not play. Please retry.')} aria-label="Recorded Scicon Shooter gameplay" /> : <div className="watch-empty"><h2>{error ? 'Recording unavailable' : 'Opening the showcase'}</h2><p>Actual game footage, controls and points.</p></div>}
      </div><div className="watch-scoreboard"><div><span>SEQUENCE POINTS</span><strong>{clip ? progress.points.toLocaleString() : '—'}</strong></div><div><span>THIS RUN</span><strong>{clip ? frame.score.toLocaleString() : '—'}</strong></div><div><span>RUN</span><strong>{clip ? `${clipIndex + 1} / ${sequence!.clips.length}` : '—'}</strong></div></div></section>
      <section className={`watch-brain watch-panel ${points.amount > 0 && playing ? 'point-flash' : ''}`} aria-label="Fly anatomy with illustrated game cues" style={{ '--point-glow': points.strength } as React.CSSProperties}><div className="watch-panel-head"><div><span className="watch-eyebrow">REAL FLY ANATOMY</span><h2>Inside the fly</h2></div><span className="spectator-cue-label">Illustrated signals</span></div><div className="watch-brain-stage"><Anatomy active={visible && playing && !lowPower} lowPower={lowPower} signals={signals} illustrate /><div className="spectator-points" style={{ opacity: points.strength }} aria-label="Recent game points">+{points.amount} <small>POINTS</small></div><div className="watch-vision"><span className="watch-eyebrow">GAME VIEW</span><canvas ref={vision} width="96" height="208" aria-label="Grayscale preview of recorded gameplay" /></div></div><div className="spectator-legend"><span><i className="cyan" />Screen changes</span><span><i className="amber" />Movement + fire</span><span><i className="green" />Points earned</span></div><p className="spectator-truth">Real cell locations. Colored cues illustrate game events, not neuron recordings.</p></section>
      <section className="watch-movement" aria-label="Recorded movement"><div className={`watch-compass ${direction && clip ? 'is-moving' : ''}`}><svg viewBox="0 0 120 120" role="img" aria-label={direction ? `Movement command: ${direction.label}` : 'Holding position'}><circle cx="60" cy="60" r="47" /><circle cx="60" cy="60" r="34" />{[0,45,90,135,180,225,270,315].map(angle => <path key={angle} d="M60 6v7" transform={`rotate(${angle} 60 60)`} />)}{direction ? <g transform={`rotate(${direction.angle} 60 60)`}><path className="watch-direction-glow" d="M60 82V35M42 52l18-19 18 19" /><path className="watch-direction" d="M60 82V35M42 52l18-19 18 19" /></g> : <circle className="watch-direction" cx="60" cy="60" r="5" />}</svg></div><div className="watch-action-copy"><span className="watch-eyebrow">MOVEMENT</span><h2>{clip ? direction ? <>Moving <span>{direction.label}</span></> : 'Holding position' : 'Ready to watch'}</h2><span className={`watch-fire ${clip && frame.fire ? 'on' : ''}`}><i />{clip && frame.fire ? 'Firing' : 'Fire released'}</span></div><div className="watch-trail"><span className="watch-eyebrow">RECENT PATH</span><svg viewBox="0 0 240 124" role="img" aria-label="Recorded ship positions"><path className="watch-trail-grid" d="M62 4H178V120H62Z M62 62H178 M120 4V120" /><polyline points={path} /></svg></div></section>
    </main>
    <div className="spectator-playbar"><button className="watch-play" disabled={!clip} aria-label={playing ? 'Pause showcase' : 'Play showcase'} onClick={togglePlayback}>{playing ? 'Ⅱ' : '▶'}</button><div className="spectator-progress"><div className="spectator-progress-label"><span>Recorded sequence · repeats automatically</span><span>{clockLabel(progress.seconds)} / {clockLabel(sequence?.seconds || 0)}</span></div><progress aria-label="Recorded sequence progress" max={sequence?.seconds || 1} value={progress.seconds} /></div><span className="spectator-baseline">{clip?.manifest.controllerLabel || 'Comparison gameplay'}<small>Not learning</small></span></div>
    <details className="spectator-about"><summary>About this experiment <span>+</span></summary><div className="spectator-about-grid"><section><h3>Can practice make it better?</h3><p>We are investigating whether a model built from a fly’s brain wiring can learn to play Scicon Shooter. This first showcase uses recorded random-baseline gameplay while the fly model’s vision and movement are still being developed.</p></section><section><h3>What do the lights mean?</h3><p>The anatomy uses 43,864 released MaleCNS cell locations. Cyan and amber illustrate recorded screen changes and control commands. Green flashes show game points. These are not measured brain activity or simulated dopamine learning.</p></section><section><h3>Does it remember?</h3><p>This recording does not learn. A learning model can keep changed connection strengths between runs, but we have not demonstrated that in this game. Points add across the recorded sequence, then reset when it repeats. Replaying never creates new experimental scores.</p></section></div><p className="spectator-attribution">Anatomy: FlyEM / HHMI Janelia and collaborators · <a href="https://male-cns.janelia.org/download/" target="_blank" rel="noreferrer">MaleCNS v1.0</a> · CC BY 4.0. Independent project; no ResearchHub endorsement is implied.</p></details>
  </div>;
}
