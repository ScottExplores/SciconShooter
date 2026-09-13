import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Panel } from './components';
import './teaching.css';

type Probe = { A: number; B: number };
type Frame = { timeSeconds: number; phase: string; cue: 'A' | 'B' | null; spikes: number[]; efficacy: number[] };
type Condition = { id: string; label: string; pre: Probe; post: Probe; frames: Frame[]; efficacyBefore: number[]; efficacyAfter: number[]; evaluationFrozen: boolean };
type Experiment = {
  schemaVersion: number; classification: string; seed: number; rewardedCue: 'A' | 'B';
  nodes: { id: string; label: string; role: string }[];
  edges: { source: string; target: string; kind: string }[];
  conditions: Condition[]; erased: { probe: Probe }; sham: { probe: Probe };
  criteria: { pass: boolean; results: { id: string; pass: boolean; observed: unknown; expected: unknown }[] };
  counterbalance: unknown; protocol: Record<string, any>; limitations: string[];
};
type Saved = { record: { status: string; config: { requestId: string }; resultSha256: string; resources: { wallSeconds: number; sampledPeakRssBytes: number } }; experiment: Experiment };

function accepted(value: Saved): Saved {
  const e = value?.experiment;
  if (value?.record?.status !== 'completed' || e?.classification !== 'SYNTHETIC_TEACHING_EXPERIMENT' || e.schemaVersion !== 1 ||
      !Array.isArray(e.nodes) || e.nodes.length !== 4 || !e.criteria || typeof e.criteria.pass !== 'boolean' ||
      !Array.isArray(e.edges) || !Array.isArray(e.limitations) || !e.erased?.probe || !e.sham?.probe ||
      !Array.isArray(e.conditions) || e.conditions.length !== 3 ||
      e.conditions.some(c => !c.evaluationFrozen || !c.frames.length || c.frames.some(f =>
        f.spikes.length !== e.nodes.length || f.efficacy.length !== 2 || ![f.timeSeconds, ...f.spikes, ...f.efficacy].every(Number.isFinite)) ||
        ![c.pre.A, c.pre.B, c.post.A, c.post.B].every(v => Number.isInteger(v) && v >= 0))) {
    throw new Error('The teaching result is incomplete or has an unsupported recording format.');
  }
  return value;
}
const cueName = (cue: string) => cue === 'A' ? 'Blue' : 'Amber';
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);

export default function Teaching() {
  const [saved, setSaved] = useState<Saved | null>(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState(42), [rewardedCue, setRewardedCue] = useState<'A' | 'B'>('A');
  const [conditionId, setConditionId] = useState('paired'), [index, setIndex] = useState(0), [playing, setPlaying] = useState(false);
  const request = useRef<{ requestId: string; seed: number; rewardedCue: 'A' | 'B' } | null>(null);
  const running = useRef(false);
  const experiment = saved?.experiment;
  const condition = experiment?.conditions.find(c => c.id === conditionId) || experiment?.conditions[0];
  const frame = condition?.frames[index];
  useEffect(() => {
    let active = true;
    api<Saved | null>('/teaching/latest').then(value => { if (active && value) setSaved(accepted(value)); })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!playing || !condition) return;
    const timer = setInterval(() => setIndex(i => Math.min(i + 1, condition.frames.length - 1)), 20);
    return () => clearInterval(timer);
  }, [playing, condition]);
  useEffect(() => { if (condition && index === condition.frames.length - 1) setPlaying(false); }, [index, condition]);
  function selectCondition(id: string) { setConditionId(id); setIndex(0); setPlaying(false); }
  async function run(retry = false) {
    if (running.current) return;
    running.current = true; setBusy(true); setPlaying(false); setError('');
    if (!retry || !request.current) request.current = { requestId: crypto.randomUUID().replaceAll('-', ''), seed, rewardedCue };
    try {
      const result = accepted(await api<Saved>('/teaching/run', request.current));
      setSaved(result); setConditionId('paired'); setIndex(0); setPlaying(true); request.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { running.current = false; setBusy(false); }
  }
  function download() {
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `scicon-teaching-${saved.record.config.requestId}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const phase = frame?.phase.replaceAll('_', ' ').replaceAll('-', ' ') || 'Ready';
  const positions = [[85, 80], [85, 240], [440, 155], [275, 285]];
  const locations = experiment?.nodes.map((node, i) => ({ ...node, x: positions[i][0], y: positions[i][1] })) || [];
  const maxProbe = condition ? Math.max(1, ...Object.values(condition.pre), ...Object.values(condition.post)) : 1;
  return <div className="lab-shell teaching-shell">
    <header className="topbar"><a className="brand" href="#learn"><span>SCICON <b>FLY LAB</b><small>LEARNING DEMONSTRATION</small></span></a>
      <nav aria-label="Demonstration navigation"><a href="#watch">Watch Scicon</a><a href="#live">Research controls</a></nav>
      <span className="teaching-local">Private · local</span></header>
    <main className="teaching-main">
      <div className="teaching-heading"><div><h1>Can a circuit remember a cue?</h1><p>Show a cue. Add a reward. Test what changed.</p></div>
        <button className="button primary" disabled={busy || loading || !Number.isInteger(seed) || seed < 0 || seed > 4294967295} onClick={() => void run()}>{busy ? 'Calculating experiment…' : 'Run learning experiment'}</button></div>
      <div className="teaching-scope"><strong>A small engineered circuit</strong><span>This experiment trains a synthetic model. It is not the MaleCNS brain or a Scicon game controller. Every activity mark below comes from its numerical recording.</span></div>
      {error && <div className="error-banner" role="alert"><span>{error}</span>{request.current && <button className="button" disabled={busy} onClick={() => void run(true)}>Retry same request</button>}</div>}
      <div className="teaching-settings"><label>Rewarded cue<select value={rewardedCue} disabled={busy} onChange={e => setRewardedCue(e.target.value as 'A' | 'B')}><option value="A">Blue</option><option value="B">Amber</option></select></label>
        <details><summary>Repeatable settings</summary><label>Seed<input type="number" min="0" max="4294967295" disabled={busy} value={seed} onChange={e => setSeed(Number(e.target.value))} /></label><p>Each new experiment starts without memory and checks both cue assignments. A repeated seed checks reproducibility; it is not a new biological experiment.</p></details>
        {saved && <span className="teaching-record-note">Saved experiment · seed {experiment!.seed} · rewarded {cueName(experiment!.rewardedCue).toLowerCase()}</span>}</div>
      {!experiment ? <div className="teaching-empty"><div className="teaching-cue-pair"><span className="cue-a">A</span><span className="cue-b">B</span></div><h2>{loading ? 'Opening saved experiment…' : 'Start with no memory'}</h2><p>We measure the circuit before training, pair one cue with reinforcement, then test again with learning switched off. Controls check whether timing and memory caused the change.</p><small>The calculation runs once. You can replay its measured activity afterward.</small></div> : <>
        <div className="teaching-result" role="status"><div><strong>{experiment.criteria.pass ? 'Cue-specific memory effect measured' : 'The demonstration criteria were not met'}</strong><p>{experiment.criteria.pass ? 'The paired cue changed the output response beyond the controls in both cue assignments. This result applies to the small engineered model.' : 'The result is saved as observed. Activity or changing weights alone does not establish the intended memory effect.'}</p></div><button className="button" onClick={download}>Download experiment</button></div>
        <div className="teaching-grid"><Panel title="INSIDE THE TEACHING CIRCUIT" note="Schematic · synthetic neurons">
          <div className="teaching-condition-tabs" role="group" aria-label="Recorded condition">{experiment.conditions.map(c => <button key={c.id} aria-pressed={condition?.id === c.id} onClick={() => selectCondition(c.id)}>{c.label}</button>)}</div>
          <div className="teaching-recording-label"><span>{playing ? 'Playing recorded calculation' : 'Recorded calculation paused'}</span><b>{phase}</b></div>
          <svg className="teaching-circuit" viewBox="0 0 550 360" role="img" aria-label="Synthetic circuit with recorded model spike counts">
            {experiment.edges.map((edge, i) => { const a = locations.find(n => n.id === edge.source), b = locations.find(n => n.id === edge.target); return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={edge.kind.includes('plastic') ? 'plastic-edge' : ''} /> : null; })}
            <path className="teaching-modulation" d="M 275 253 L 275 200 M 275 200 L 262 196 M 275 200 L 275 117 L 262 117" />
            <text x="298" y="233" className="cell-label">Modulates connections</text>
            {locations.map((node, i) => <g key={node.id} transform={`translate(${node.x},${node.y})`}><circle r={31} className={(frame?.spikes[i] || 0) > 0 ? 'cell-firing' : ''} /><text textAnchor="middle" y="5" className="cell-count">{frame ? fmt(frame.spikes[i]) : '—'}</text><text textAnchor="middle" y="53" className="cell-label">{node.label}</text></g>)}
          </svg>
          <div className="teaching-circuit-caption">Numbers are emitted spikes per 10 ms bin. Bright cells emitted spikes in that bin. The dashed line shows engineered reward coupling. Playback is slowed to reveal the recorded activity.</div>
          <div className="teaching-playback"><button className="button" onClick={() => { if (index >= condition!.frames.length - 1) setIndex(0); setPlaying(v => !v); }}>{playing ? 'Pause recording' : 'Play recording'}</button><input type="range" aria-label="Teaching recording position" min="0" max={condition!.frames.length - 1} value={index} onChange={e => { setIndex(Number(e.target.value)); setPlaying(false); }} /><span>{frame?.timeSeconds.toFixed(2)} s modeled</span></div>
        </Panel><div className="teaching-side"><Panel title="DID THE RESPONSE CHANGE?" note="Tested with learning off"><div className="padded"><p className="reading">Memory here means a selective reduction in output spikes for the rewarded cue. Both tests use the same cue input and no reward.</p>
          {(['A', 'B'] as const).map(cue => <div className={`teaching-probe cue-${cue.toLowerCase()}`} key={cue}><strong>{cueName(cue)} cue {experiment.rewardedCue === cue ? '· rewarded' : ''}</strong>{(['pre', 'post'] as const).map(stage => <div className="probe-row" key={stage}><span>{stage === 'pre' ? 'Before' : 'After'}</span><div><i style={{ width: `${condition![stage][cue] / maxProbe * 100}%` }} /></div><b>{fmt(condition![stage][cue])}</b></div>)}</div>)}<small className="reading">Spike counts over equal-duration, frozen probes.</small></div></Panel>
          <Panel title="MEMORY CONNECTIONS" note="Computed efficacy"><div className="padded">{(['A', 'B'] as const).map((cue, i) => <div className="teaching-weight" key={cue}><span>{cueName(cue)} pathway</span><strong>{(frame?.efficacy[i] ?? condition!.efficacyAfter[i]).toFixed(3)}<small> × baseline</small></strong></div>)}<p className="reading">Reinforcement changes these connections through the declared timing rule. The displayed values come from the saved calculation.</p></div></Panel></div></div>
        <Panel title="CHECK THE EXPLANATION" note="Controls are part of the experiment"><div className="teaching-controls"><div><strong>Separate cue and reward</strong><p>The unpaired condition uses the same inputs at different times.</p></div><div><strong>Turn learning off</strong><p>The frozen condition keeps its starting memory throughout training.</p></div><div><strong>Erase the memory</strong><p>After erasure, output is {fmt(experiment.erased.probe.A)} for blue and {fmt(experiment.erased.probe.B)} for amber. A matched transient reset preserves the learned memory.</p></div></div></Panel>
        <details className="teaching-methods"><summary>Methods, recorded checks, and limitations</summary><p>Computed in {saved!.record.resources.wallSeconds.toFixed(2)} wall-clock seconds. Playback speed does not change the experiment. A new run starts a fresh circuit; watching this recording does not add training.</p><p>Result fingerprint: <code>{saved!.record.resultSha256}</code></p><ul>{experiment.limitations.map(item => <li key={item}>{item}</li>)}</ul><pre>{JSON.stringify({ protocol: experiment.protocol, checks: experiment.criteria, counterbalance: experiment.counterbalance }, null, 2)}</pre></details>
      </>}
      <footer className="teaching-footer">Full-connectome study: vision and control validation remain incomplete. <a href="#live">View research status</a></footer>
    </main>
  </div>;
}
