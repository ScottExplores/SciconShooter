import React, { useCallback, useMemo, useRef, useState } from 'react';
import GameStage from './GameStage';
import { DEFAULT_GAME_CAMPAIGN } from '../services/levelConfig';
import { PLAYER_SHIPS, PLAYABLE_PLAYER_SHIP_IDS, type PlayerShipId } from '../services/playerShipService';
import { MINI_SHIP_CATALOG, MINI_SHIP_BY_ID, type MiniShipId } from '../services/squadProgression';
import { COMBAT_LAB_ENCOUNTERS, COMBAT_LAB_HULLS, createCombatLabCampaign, createCombatLabLoadout, createCombatLabStats } from '../services/combatLab';
import { getShipAbilityDefinition } from '../services/shipAbilityService';
import { getFireRateTier } from '../services/weaponTierProgression';
import type { PreviewCommand, PreviewSnapshot } from '../services/gameplay/previewSession';
import type { GameRuntimeState } from '../services/gameLogic';
import './combat-lab.css';

const CombatLab: React.FC = () => {
  const [ship, setShip] = useState<PlayerShipId>('bio');
  const [fireRate, setFireRate] = useState(7);
  const [ability, setAbility] = useState(2);
  const [speed, setSpeed] = useState(0);
  const [supportLevel, setSupportLevel] = useState(3);
  const [left, setLeft] = useState<MiniShipId | ''>('quorum-crab');
  const [right, setRight] = useState<MiniShipId | ''>('axiom-orbiter');
  const [invincible, setInvincible] = useState(true);
  const [noCooldown, setNoCooldown] = useState(false);
  const [audio, setAudio] = useState(false);
  const [shake, setShake] = useState(true);
  const [watch, setWatch] = useState(false);
  const [panel, setPanel] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [targetId, setTargetId] = useState(`mission:${DEFAULT_GAME_CAMPAIGN.levels[0].id}`);
  const [run, setRun] = useState(0);
  const [stats, setStats] = useState(createCombatLabStats);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [runtime, setRuntime] = useState<GameRuntimeState | null>(null);
  const [finished, setFinished] = useState(false);
  const completedWave = useRef('');
  const [command, setCommand] = useState<PreviewCommand | null>(null);
  const [signature, setSignature] = useState<{ nonce: number } | null>(null);
  const [bomb, setBomb] = useState<{ nonce: number } | null>(null);
  const showcase = useMemo(createCombatLabCampaign, []);
  const campaign = targetId === 'showcase' ? showcase : DEFAULT_GAME_CAMPAIGN;
  const campaignMission = targetId.startsWith('mission:')
    ? DEFAULT_GAME_CAMPAIGN.levels.find(item => item.id === targetId.slice('mission:'.length))
    : undefined;
  const continuousMission = targetId === 'showcase' || Boolean(campaignMission);
  const encounter = COMBAT_LAB_ENCOUNTERS.find(item => item.id === targetId);
  const level = campaignMission ?? campaign.levels.find(level => level.id === encounter?.levelId) ?? campaign.levels[0];
  const wave = level.waves.find(wave => wave.id === encounter?.waveId) ?? level.waves[0];
  const loadout = useMemo(() => createCombatLabLoadout(ship, fireRate, ability, speed, watch ? [] : [left, right], supportLevel), [ship, fireRate, ability, speed, left, right, supportLevel, watch]);
  const hull = COMBAT_LAB_HULLS[ship];
  const flightStats = useMemo(() => ({ ...stats, upgrades: { fireRate, ability, speed } }), [stats, fireRate, ability, speed]);
  const signatureDefinition = getShipAbilityDefinition(ship);
  const controlsDisabled = !ready || paused || finished || stats.lives <= 0;
  const receiveRuntime = useCallback((state: GameRuntimeState) => {
    setRuntime(state);
    if (!state.complete) { completedWave.current = ''; return; }
    if (panel || paused || completedWave.current === state.waveId) return;
    completedWave.current = state.waveId;
    const next = continuousMission ? level.waves[state.waveNumber] : null;
    if (next) setCommand({ type: 'load-target', levelId: level.id, waveId: next.id, nonce: Date.now() });
    else { setFinished(true); setPaused(true); }
  }, [panel, paused, continuousMission, level]);
  const relaunch = () => { completedWave.current = ''; setCommand(null); setSignature(null); setBomb(null); setFinished(false); setReady(false); setError(''); setStats(createCombatLabStats()); setSnapshot(null); setRun(value => value + 1); setPanel(false); setPaused(false); };
  const supportSelector = (label: string, value: MiniShipId | '', setter: (id: MiniShipId | '') => void) => (
    <label className="combat-lab-field">{label}<select value={value} onChange={event => setter(event.target.value as MiniShipId | '')}>
      <option value="">No support</option>{MINI_SHIP_CATALOG.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
    </select>{value && <small>{MINI_SHIP_BY_ID[value].description}</small>}</label>
  );
  return <main className="combat-lab" style={{ '--lab-accent': hull.color } as React.CSSProperties}>
    <div className="combat-lab-stage">
      <GameStage key={run} canvas={{ stats: flightStats, onStatsChange: setStats, running: !panel && !paused,
        previewMode: true, previewContinuousWaves: continuousMission, autoFire: !watch, audioEnabled: audio,
        previewInvincible: invincible, previewUnlimitedBombs: true,
        previewShipAbilityNoCooldown: noCooldown, previewStartingLives: 10,
        previewSeed: 'neon-breakwater-2026', previewCommand: command,
        playerShipId: ship, playerShipUrl: PLAYER_SHIPS[ship].assetUrl, squadLoadout: loadout,
        campaign, levelId: level.id, waveId: wave.id, restartToken: run,
        polishSettings: { screenShake: shake, highDensityParticles: true },
        shipAbilityCommand: signature, bombCommand: bomb, onPreviewSnapshot: setSnapshot,
        onRuntimeState: receiveRuntime,
        onReady: () => setReady(true), onInitializationError: () => setError('Renderer could not start. Reload the lab and try again.')
      }} />
    </div>
    <header className="combat-lab-top">
      <div><span className="combat-lab-eyebrow">EXPERIMENTAL / NO SAVES</span><strong>COMBAT LAB <em>{hull.title}</em></strong></div>
      <button onClick={() => { setPanel(true); setPaused(false); }} aria-label="Open lab loadout">LOADOUT</button>
    </header>
    {!panel && <>
      <div className="combat-lab-telemetry" aria-live="off"><span>T{getFireRateTier(fireRate)} · {invincible ? 'SHIELD ∞' : `${stats.lives} HP`}<small>{runtime?.waveName}</small></span><span>{stats.enemiesDefeated} KILLS · {stats.coins} COINS</span></div>
      {(!ready || error) && <div className="combat-lab-status" role="status">{error || 'Warming sprites & flight systems…'}</div>}
      {(paused || stats.lives <= 0) && <div className="combat-lab-status">{finished ? 'TEST FLIGHT COMPLETE' : stats.lives <= 0 ? 'TEST FLIGHT ENDED' : 'PAUSED'}<button onClick={() => finished || stats.lives <= 0 ? setPanel(true) : setPaused(false)}>{finished || stats.lives <= 0 ? 'TRY ANOTHER LOADOUT' : 'RESUME FLIGHT'}</button></div>}
      <footer className="combat-lab-controls">
        <button disabled={controlsDisabled} onClick={() => setBomb({ nonce: Date.now() })}>CLEAR<br /><small>Bomb ∞</small></button>
        <button className="combat-lab-signature" disabled={controlsDisabled || (stats.shipAbilityCooldown > 0 && !noCooldown)} onClick={() => setSignature({ nonce: Date.now() })}>
          {stats.shipAbilityCooldown > 0 && !noCooldown ? `${Math.ceil(stats.shipAbilityCooldown / 60)}s` : signatureDefinition.name}<small>SIGNATURE</small>
        </button>
        <button onClick={() => finished ? setPanel(true) : setPaused(value => !value)}>{finished ? 'RESULT' : paused ? 'RESUME' : 'PAUSE'}</button>
      </footer>
    </>}
    {panel && <section className="combat-lab-panel" aria-label="Combat Lab loadout">
      <div className="combat-lab-panel-heading"><span className="combat-lab-eyebrow">FLIGHT SYSTEMS / 01</span><h1>Your fleet.<br /><em>Fully unlocked.</em></h1><p>Every hull. Every upgrade. Real combat.<br />Practice only — your account is untouched.</p></div>
      <div className="combat-lab-hulls">{PLAYABLE_PLAYER_SHIP_IDS.map(id => <button key={id} aria-pressed={ship === id} onClick={() => setShip(id)}>
        <img src={PLAYER_SHIPS[id].assetUrl} alt="" /><strong>{COMBAT_LAB_HULLS[id].title}</strong><small>UNLOCKED</small>
      </button>)}</div>
      <div className="combat-lab-identity"><strong>{hull.role}</strong><p>{hull.detail}</p></div>
      <div className="combat-lab-presets"><button onClick={() => { setFireRate(0); setAbility(0); setSpeed(0); setSupportLevel(1); }}>STOCK</button><button onClick={() => { setFireRate(21); setAbility(3); setSpeed(3); setSupportLevel(3); }}>EVOLVED</button><button onClick={() => { setFireRate(49); setAbility(6); setSpeed(7); setSupportLevel(5); }}>MAX OUT</button></div>
      <label className="combat-lab-field">Primary weapon <b>TIER {getFireRateTier(fireRate)} / LV {fireRate}</b><input aria-label="Primary weapon level" type="range" min="0" max="49" value={fireRate} onChange={event => setFireRate(Number(event.target.value))} /></label>
      <div className="combat-lab-grid">
        <label className="combat-lab-field">Signature · {ability}/6<input aria-label="Signature level" type="range" min="0" max="6" value={ability} onChange={event => setAbility(Number(event.target.value))} /></label>
        <label className="combat-lab-field">Movement · {speed}/7<input aria-label="Movement level" type="range" min="0" max="7" value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
      </div>
      <h2>Wing systems</h2>
      <p className="combat-lab-note">Three jobs worth testing: collect, protect, attack. Your existing fleet stays available below.</p>
      <div className="combat-lab-presets"><button onClick={() => { setLeft('quorum-crab'); setRight('axiom-orbiter'); }}>SALVAGE + GUARD</button><button onClick={() => { setLeft('archive-beetle'); setRight('axiom-orbiter'); }}>HUNTER + GUARD</button><button onClick={() => { setLeft(''); setRight(''); }}>SOLO</button></div>
      {supportSelector('Left wing', left, setLeft)}{supportSelector('Right wing', right, setRight)}
      <label className="combat-lab-field">Support level · {supportLevel}/5<input aria-label="Support level" type="range" min="1" max="5" value={supportLevel} onChange={event => setSupportLevel(Number(event.target.value))} /></label>
      <h2>Flight plan</h2><label className="combat-lab-field">Encounter<select value={targetId} onChange={event => setTargetId(event.target.value)}>
        {DEFAULT_GAME_CAMPAIGN.sectors[0].missionIds.map((id, index) => <option key={id} value={`mission:${id}`}>Breakwater · Mission {index + 1} · {DEFAULT_GAME_CAMPAIGN.levels.find(item => item.id === id)?.name}</option>)}
        <option value="showcase">Neon Breakwater · six-wave showcase</option>{COMBAT_LAB_ENCOUNTERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select><small>Breakwater Missions use the exact regular campaign. Test any ship here without changing your account. The older six-wave remix remains available below them.</small></label>
      <div className="combat-lab-toggles">{([
        ['Invincible', invincible, setInvincible], ['Instant signatures', noCooldown, setNoCooldown],
        ['Sound', audio, setAudio], ['Impact shake', shake, setShake], ['Watch squadrons', watch, setWatch]
      ] as const).map(([label, value, setter]) => <label key={label}><input type="checkbox" checked={value} onChange={event => setter(event.target.checked)} />{label}</label>)}</div>
      <p className="combat-lab-note">Drag to steer in the flight area; your ship flies above your finger. Use your signature to compare ship identities.</p>
      {watch && <p className="combat-lab-note">Hands-off choreography view: auto-fire and support ships are off. Watch squads arrive, signal attacks, dive and circle back. Drag to shoot; relaunch with this off for normal combat.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="combat-lab-launch"><button className="combat-lab-primary" onClick={relaunch}>LAUNCH TEST FLIGHT →</button>{run > 0 && !finished && stats.lives > 0 && <button onClick={() => setPanel(false)}>KEEP CURRENT FIGHT</button>}</div>
      {run > 0 && <div className="combat-lab-debug">{level.waves.map(item => <button key={item.id} onClick={() => { completedWave.current = ''; setFinished(false); setPaused(false); setCommand({ type: 'load-target', levelId: level.id, waveId: item.id, nonce: Date.now() }); setPanel(false); }}>Jump: {item.name}</button>)}<small>{snapshot ? 'Runtime connected · seeded 60 Hz simulation' : 'Waiting for runtime'}</small></div>}
      <a className="combat-lab-back" href="/?display=mobile-frame&view=hangar">← Regular experimental game</a>
    </section>}
  </main>;
};
export default CombatLab;
