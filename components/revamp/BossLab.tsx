import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Stats } from '../../types';
import GameCanvas from '../GameCanvas';
import { DEFAULT_GAME_CAMPAIGN } from '../../services/levelConfig';
import { createCombatLabLoadout, createCombatLabStats } from '../../services/combatLab';
import { PLAYER_SHIPS } from '../../services/playerShipService';
import { resolveCampaignBossArtwork } from '../../services/pixi/boss-rigs/CampaignBossArtworkRegistry';
import type { PreviewCommand, PreviewSnapshot } from '../../services/gameplay/previewSession';
import { BOSS_LAB_ROSTER as REVAMP_BOSSES } from '../../services/revamp/bosses/labRoster';
import { readQAConfig } from '../../services/revamp/qa/config';
import { BOSS_LAB_UPGRADES, BOSS_LAB_VIEWPORT, bossLabHealthCommandRatio, createBossLabEncounter, readBossLabRequest } from '../../services/revamp/bosses/bossLab';
import './boss-lab.css';

const QA_UPGRADES = Object.freeze({ fireRate: 3, ability: 1, speed: 2 });
const labUpgrades = () => readQAConfig().enabled ? QA_UPGRADES : BOSS_LAB_UPGRADES;
const fullPowerStats = (): Stats => ({ ...createCombatLabStats(), upgrades: { ...labUpgrades() } });

/** Isolated practice entry: no providers, account, rewards, or leaderboard callbacks. */
const BossLab: React.FC = () => {
  const qa = useMemo(() => readQAConfig(), []);
  const request = useMemo(() => readBossLabRequest(window.location.search, REVAMP_BOSSES), []);
  const [bossId, setBossId] = useState(request?.bossId ?? REVAMP_BOSSES[0].id);
  const [run, setRun] = useState(0);
  const [stats, setStats] = useState(fullPowerStats);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [watch, setWatch] = useState(request?.watch ?? false);
  // REVAMP(O): A normal-damage QA run must never inherit practice invincibility.
  const [shield, setShield] = useState(() => { const qa = readQAConfig(); return qa.enabled ? qa.god : true; });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [command, setCommand] = useState<PreviewCommand | null>(null);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const nonceRef = useRef(0);
  const initialHealthApplied = useRef(false);
  const pendingHealthRatio = useRef(request?.healthRatio ?? 1);
  const profile = REVAMP_BOSSES.find(boss => boss.id === bossId) ?? REVAMP_BOSSES[0];
  const encounter = useMemo(() => createBossLabEncounter(DEFAULT_GAME_CAMPAIGN, profile), [profile]);
  const artwork = useMemo(() => {
    const source = resolveCampaignBossArtwork(encounter.campaign, encounter.levelId, encounter.waveId);
    // The lab uses exactly the production phone world, including colossal source rigs.
    return source ? { ...source, encounterCamera: undefined } : undefined;
  }, [encounter]);
  const loadout = useMemo(() => createCombatLabLoadout('researchhub',
    labUpgrades().fireRate, labUpgrades().ability, labUpgrades().speed,
    watch || qa.enabled ? [] : ['archive-beetle', 'axiom-orbiter'], 5), [watch, qa.enabled]);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    const resize = () => setScale(Math.min(host.clientWidth / BOSS_LAB_VIEWPORT.width, host.clientHeight / BOSS_LAB_VIEWPORT.height));
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, []);

  const receiveSnapshot = useCallback((next: PreviewSnapshot) => {
    setSnapshot(next);
    if (!next.boss || initialHealthApplied.current) return;
    initialHealthApplied.current = true;
    if (pendingHealthRatio.current < 1) {
      setCommand({ type: 'set-boss-health', healthRatio: bossLabHealthCommandRatio(pendingHealthRatio.current, next.boss.maxHealth),
        eventId: encounter.eventId, nonce: ++nonceRef.current });
    }
  }, [encounter.eventId]);

  const restart = (nextBossId = bossId, nextWatch = watch, healthRatio = 1) => {
    setBossId(nextBossId);
    setRun(value => value + 1);
    setStats(fullPowerStats());
    setSnapshot(null);
    setCommand(null);
    setPaused(false);
    setReady(false);
    setError('');
    initialHealthApplied.current = false;
    pendingHealthRatio.current = healthRatio;
    const url = new URL(window.location.href);
    url.searchParams.set('bosslab', nextBossId);
    if (nextWatch) url.searchParams.set('bosswatch', '1');
    else url.searchParams.delete('bosswatch');
    if (healthRatio < 1) url.searchParams.set('bosshp', String(healthRatio));
    else url.searchParams.delete('bosshp');
    window.history.replaceState(null, '', url);
  };

  return <main className="revamp-boss-lab" data-bosslab={profile.id} data-ready={ready}
    data-boss-health={snapshot?.boss?.healthRatio ?? ''} data-boss-phase={snapshot?.boss?.phaseIndex ?? ''}
    data-frame={snapshot?.frame ?? 0}>
    <header className="revamp-boss-lab__header">
      <div><span className="revamp-boss-lab__eyebrow">SCICON / BOSS LAB</span><label htmlFor="boss-lab-encounter">Encounter</label></div>
      <select id="boss-lab-encounter" value={profile.id} onChange={event => restart(event.target.value)}>
        {REVAMP_BOSSES.map(boss => <option key={boss.id} value={boss.id}>{boss.name}</option>)}
      </select>
      <a href="/" aria-label="Return to SciCon Shooter">×</a>
    </header>
    <section className="revamp-boss-lab__arena" ref={stageRef} aria-label={`${profile.name} practice arena`}>
      <div className="revamp-boss-lab__world" style={{ width: BOSS_LAB_VIEWPORT.width, height: BOSS_LAB_VIEWPORT.height,
        transform: `translate(-50%, -50%) scale(${scale})` }}>
        <GameCanvas key={`${profile.id}:${run}`} stats={stats} onStatsChange={setStats} running={!paused}
          previewMode previewViewport={BOSS_LAB_VIEWPORT} previewContinuousWaves={false}
          previewInvincible={shield} previewStartingLives={qa.enabled ? 3 : 10} previewUnlimitedBombs
          autoFire={!watch} audioEnabled previewSeed={`revamp-boss:${profile.id}`}
          previewCommand={command} onPreviewSnapshot={receiveSnapshot}
          campaign={encounter.campaign} levelId={encounter.levelId} waveId={encounter.waveId}
          previewBossArtwork={artwork} playerShipId="researchhub" playerShipUrl={PLAYER_SHIPS.researchhub.assetUrl}
          squadLoadout={loadout} polishSettings={{ screenShake: true, highDensityParticles: true }}
          onReady={() => setReady(true)} onInitializationError={() => setError('The flight deck could not start. Restart to try again.')} />
      </div>
      {(!ready || error) && <div className="revamp-boss-lab__status" role="status">{error || 'Preparing flight deck…'}</div>}
      {paused && <div className="revamp-boss-lab__status">Paused</div>}
    </section>
    <footer className="revamp-boss-lab__controls">
      <div className="revamp-boss-lab__buttons">
        <button onClick={() => restart()}>Restart</button>
        <button onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
        <button onClick={() => { setWatch(!watch); restart(bossId, !watch); }} aria-pressed={watch}
          title="Restart in the other mode">{watch ? 'Watch' : 'Fight'}</button>
        <button onClick={() => setShield(value => !value)} aria-pressed={shield}>Shield {shield ? '∞' : 'off'}</button>
      </div>
      <div className="revamp-boss-lab__buttons revamp-boss-lab__phases" aria-label="Boss health controls">
        <span>HP</span>{[1, 0.6, 0.3, 0.15].map(ratio => <button key={ratio} disabled={!ready}
          title="Restart with fresh parts at this health" onClick={() => restart(bossId, watch, ratio)}>{Math.round(ratio * 100)}%</button>)}
        <span className="revamp-boss-lab__power">{qa.enabled ? 'POWER 4' : 'MAX POWER'}</span>
      </div>
      <p>{request?.unknownId && bossId === request.bossId ? 'Unknown boss ID; showing the first encounter. ' : ''}
        Practice · 390 × 844 · Drag to steer · No rewards</p>
    </footer>
  </main>;
};

export default BossLab;
