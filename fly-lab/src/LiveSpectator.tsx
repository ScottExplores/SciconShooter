import React,{memo,useEffect,useRef,useState} from 'react';
import WatchAnatomy from './WatchAnatomy';
import { DIRECTIONS, clockLabel } from './watchData';
import { feedIsLive, LiveSnapshot, validateLive } from './liveData';
import './watch.css';
import './spectator.css';
import './live-spectator.css';
const Anatomy=memo(WatchAnatomy);
export default function LiveSpectator({endpoint='/api/live'}:{endpoint?:string}) {
  const [snapshot,setSnapshot]=useState<LiveSnapshot|null>(null),[error,setError]=useState('');
  const [now,setNow]=useState(Date.now()),[received,setReceived]=useState(0),[lowPower,setLowPower]=useState(false);
  const [hit,setHit]=useState(0),[reward,setReward]=useState(0),[flashUntil,setFlashUntil]=useState(0);
  const previous=useRef<LiveSnapshot|null>(null),shell=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let disposed=false, timer:ReturnType<typeof setTimeout>,abort:AbortController|null=null;
    async function poll(){
      abort=new AbortController();const deadline=setTimeout(()=>abort?.abort(),10000);
      try{
        const response=await fetch(endpoint,{signal:abort.signal,cache:'no-store'});
        if(!response.ok)throw new Error(response.status===503?'Waiting for the experiment computer.':'The live connection is unavailable.');
        const value=validateLive(await response.json());if(disposed)return;
        if(previous.current?.sessionId===value.sessionId && value.sequence<previous.current.sequence)throw new Error('An older update was ignored.');
        const before=previous.current;
        if(before?.sessionId===value.sessionId){
          const damage=value.totals.bossDamage-before.totals.bossDamage;
          if(damage>0){setHit(damage);setFlashUntil(Date.now()+1300);}
          if(value.feedback.deliveryStatus==='delivered'&&value.feedback.deliveredReward>0)setReward(value.feedback.deliveredReward);else setReward(0);
        }
        previous.current=value;setSnapshot(value);setReceived(Date.now());setError('');
      }catch(e){if(!disposed)setError((e as Error).name==='AbortError'?'The live connection timed out.':(e as Error).message);}
      finally{clearTimeout(deadline);if(!disposed)timer=setTimeout(poll,document.hidden?5000:500);}
    }
    void poll();const clock=setInterval(()=>setNow(Date.now()),250);
    return()=>{disposed=true;clearTimeout(timer);clearInterval(clock);abort?.abort();};
  },[endpoint]);
  const live=feedIsLive(snapshot,received,now)&&!error,flash=live&&now<flashUntil;
  const direction=snapshot?DIRECTIONS[snapshot.action.movement as keyof typeof DIRECTIONS]:null;
  const training=snapshot?.controller.learningStatus==='training';
  return <div className="watch-shell spectator live-spectator" ref={shell}>
    <header className="watch-header"><a className="watch-brand" href="./"><span className="watch-logo"><i/><i/><i/></span><span>SCICON <b>FLY LAB</b></span></a><div className="watch-header-actions"><a className="spectator-link" href="https://www.researchhub.com/" target="_blank" rel="noreferrer">ResearchHub ↗</a><a className="spectator-link" href="https://sciconshooter.xyz/" target="_blank" rel="noreferrer">Play Scicon ↗</a><button className="watch-icon" aria-label="Reduce display animation" aria-pressed={lowPower} onClick={()=>setLowPower(v=>!v)}>◒</button><button className="watch-icon" aria-label="Full screen" onClick={()=>void (document.fullscreenElement?document.exitFullscreen():shell.current?.requestFullscreen())?.catch(()=>{})}>⛶</button></div></header>
    <main className="watch-grid">
      <section className="watch-game watch-panel" aria-label="Live Scicon Shooter experiment"><div className="watch-panel-head"><div><span className="watch-eyebrow">BOSS PRACTICE · CONTINUOUS SESSION</span><h1>{snapshot?.phase.kind==='wave'?'Enemy intermission':'Gatekeeper Prime'}</h1></div><span className={`watch-state ${live?'is-live':''}`}><i/>{live?'LIVE':'OFFLINE'}</span></div>
        <div className="watch-game-screen">{snapshot?<img src={snapshot.image} alt="Latest captured frame from the ongoing game"/>:<div className="watch-empty"><h2>Connecting to the arena</h2><p>The experiment runs on its own computer.</p></div>}{!live&&<div className="live-disconnected" role="status">{snapshot?'Feed paused · last captured frame':'Waiting for the experiment'}<small>{snapshot?.error||error||'No live update yet.'}</small></div>}</div>
        <div className="watch-scoreboard"><div><span>TOTAL POINTS</span><strong>{snapshot?.totals.score.toLocaleString()??'—'}</strong></div><div><span>BOSS DAMAGE</span><strong>{snapshot?Math.round(snapshot.totals.bossDamage).toLocaleString():'—'}</strong></div><div><span>PLAY TIME</span><strong>{snapshot?clockLabel(snapshot.totals.simulatedSeconds):'—'}</strong></div></div>
      </section>
      <section className={`watch-brain watch-panel ${flash?'point-flash':''}`} style={{'--point-glow':flash?1:0} as React.CSSProperties} aria-label="Released fly anatomy and measured experiment events">
        <div className="watch-panel-head"><div><span className="watch-eyebrow">MALECNS · RELEASED CELL LOCATIONS</span><h2>Inside the fly</h2></div><span className="spectator-cue-label">{snapshot?.neural?'Sampled model activity':'Anatomy · no neural feed'}</span></div>
        <div className="watch-brain-stage"><Anatomy active={live&&!lowPower} lowPower={lowPower} illustrate={false} activity={live?snapshot?.neural?.sampledNeurons:undefined}/><div className="live-anatomy-label optic">Optic lobes</div><div className="live-anatomy-label brain">Central brain</div><div className="live-anatomy-label cord">Nerve cord</div><div className={`live-hit ${flash?'active':''}`}><strong>+{Math.round(hit*100)/100}</strong><span>CONFIRMED BOSS DAMAGE</span></div></div>
        <div className="live-event-strip"><div className={live&&snapshot?.action.fire?'firing':''}><i/><span>Fire command</span><strong>{live&&snapshot?.action.fire?'ON':'—'}</strong></div><div className={flash?'hit':''}><i/><span>Boss hit</span><strong>{flash?`+${Math.round(hit*100)/100} HP`:'—'}</strong></div><div className={live&&reward>0?'reward':''}><i/><span>Neural reward</span><strong>{snapshot?.neural?(reward>0?`+${reward.toFixed(2)}`:'0'):'Not connected'}</strong></div></div>
        <p className="spectator-truth">{snapshot?.neural?'Only recorded neuron IDs light up. The display samples up to 12 active cells; unseen cells may also be active.':'The anatomy is real. Event lights show game telemetry; brain activity is unavailable. No decorative electrical pulses.'}</p>
      </section>
      <section className="watch-movement" aria-label="Current movement"><div className={`watch-compass ${live&&direction?'is-moving':''}`}><svg viewBox="0 0 120 120" role="img" aria-label={live&&direction?`Movement ${direction.label}`:'Holding position'}><circle cx="60" cy="60" r="47"/><circle cx="60" cy="60" r="34"/>{[0,45,90,135,180,225,270,315].map(angle=><path key={angle} d="M60 6v7" transform={`rotate(${angle} 60 60)`}/>)}{live&&direction?<g transform={`rotate(${direction.angle} 60 60)`}><path className="watch-direction-glow" d="M60 82V35M42 52l18-19 18 19"/><path className="watch-direction" d="M60 82V35M42 52l18-19 18 19"/></g>:<circle className="watch-direction" cx="60" cy="60" r="5"/>}</svg></div><div className="watch-action-copy"><span className="watch-eyebrow">MOVEMENT COMMAND</span><h2>{!live?'Awaiting feed':direction?`Moving ${direction.label}`:'Holding position'}</h2><span className={`watch-fire ${live&&snapshot?.action.fire?'on':''}`}><i/>{live&&snapshot?.action.fire?'Firing continuously':'No current command'}</span></div><div className="live-aim"><span className="watch-eyebrow">THIS ENCOUNTER</span><strong>{snapshot?.phase.kind==='boss'?snapshot.phase.damagePerSecond.toFixed(2):'—'}<small>damage / simulated second</small></strong></div></section>
    </main>
    <div className="live-session"><div><span className={`live-dot ${live?'connected':''}`}/><strong>{live?'One live session':'Connection unavailable'}</strong><span>Boss → enemy wave → same boss</span></div><span className="live-controller">{snapshot?.controller.name||'Controller status pending'}<b>{training?'Training · improvement unproven':'Not learning · validation in progress'}</b></span></div>
    <details className="spectator-about"><summary>What are we testing? <span>+</span></summary><div className="spectator-about-grid"><section><h3>Can reward improve aim?</h3><p>We are building a test of whether a fly-connectome model can learn to line up beneath a boss. Only confirmed hull damage earns the proposed reward. Today’s random baseline establishes comparison data while the fly’s vision and movement interfaces are being validated.</p></section><section><h3>One session, everyone watching</h3><p>The same game runs on the experiment computer. Boss encounters alternate with enemy waves; the display carries points forward. The ship is invulnerable in this practice arena. Visits, refreshes and display settings never change the experiment. The image feed is sampled; full event records stay on the experiment computer.</p></section><section><h3>What counts as learning?</h3><p>More total points means more play, not necessarily better play. Learning needs improved damage per second against comparable frozen controls. Calculating a reward does not mean dopamine was delivered. The neural reward indicator stays disconnected until an actual neural worker receives it.</p></section></div><p className="spectator-attribution">Anatomy: FlyEM / HHMI Janelia and collaborators · <a href="https://male-cns.janelia.org/download/" target="_blank" rel="noreferrer">MaleCNS v1.0</a> · CC BY 4.0. Independent project. Public controls cannot pause or reset the experiment.</p></details>
  </div>;
}
