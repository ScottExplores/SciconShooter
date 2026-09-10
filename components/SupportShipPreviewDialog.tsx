import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameStage from './GameStage';
import { PLAYER_SHIPS, type PlayerShipId } from '../services/playerShipService';
import { MINI_SHIP_BY_ID, type MiniShipId, type WeeklySquadState } from '../services/squadProgression';
import { createSupportPreviewCampaign, createSupportPreviewLoadout, createSupportPreviewStats } from '../services/supportShipPreview';
import './support-ship-preview.css';

interface Props {
  miniId: MiniShipId;
  mainShipId: PlayerShipId;
  state: WeeklySquadState;
  onClose: () => void;
}

const SupportShipPreviewDialog: React.FC<Props> = ({ miniId, mainShipId, state, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const entry = MINI_SHIP_BY_ID[miniId];
  const ownedLevel = state.ownedMiniShips[miniId] || 0;
  const [level, setLevel] = useState(Math.max(1, ownedLevel));
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [run, setRun] = useState(0);
  const [stats, setStats] = useState(createSupportPreviewStats);
  const campaign = useMemo(createSupportPreviewCampaign, []);
  const loadout = useMemo(() => createSupportPreviewLoadout(state, mainShipId, miniId, level), [state, mainShipId, miniId, level]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    // A closed native dialog measures 0x0. Mount Pixi only after it is visible
    // so its starting ship position uses the real preview area, not a fallback.
    setOpened(true);
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const replay = () => {
    setStats(createSupportPreviewStats());
    setReady(false);
    setFailed(false);
    setComplete(false);
    setPaused(false);
    setRun(value => value + 1);
  };

  return <dialog ref={dialogRef} className="support-preview" aria-labelledby="support-preview-title"
    aria-describedby="support-preview-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="support-preview__header">
      <div><small>SUPPORT TEST FLIGHT</small><h2 id="support-preview-title">{entry.name}</h2><p>{entry.role} · Level {level}</p></div>
      <button type="button" onClick={onClose} aria-label="Close support preview">✕</button>
    </header>
    <p id="support-preview-description" className="support-preview__description">{entry.description}</p>
    <div className="support-preview__stage" aria-label={`${entry.name} live support demonstration`}>
      {/* Passive demonstration: steering in the real engine also fires the main
          gun. Inert keeps pointer/keyboard input off this canvas only. */}
      <div style={{ height: '100%' }} {...{ inert: '' }}>
      {opened ? <GameStage key={run} canvas={{
        stats, onStatsChange: setStats, running: !paused && !complete && !failed,
        previewMode: true, autoFire: false, audioEnabled: false, previewInvincible: true,
        previewStartingLives: 10, previewSeed: 'hangar-support-preview',
        playerShipId: mainShipId, playerShipUrl: PLAYER_SHIPS[mainShipId].assetUrl,
        squadLoadout: loadout, campaign, levelId: campaign.levels[0].id, waveId: campaign.levels[0].waves[0].id,
        polishSettings: { screenShake: false, highDensityParticles: false },
        onReady: () => setReady(true), onInitializationError: () => setFailed(true),
        onRuntimeState: runtime => { if (runtime.complete) setComplete(true); }
      }} /> : null}
      </div>
      {(!ready || failed || complete || paused) ? <div className="support-preview__status" role="status">
        {failed ? 'Preview could not load. Tap Replay to retry.' : !ready ? 'Loading support flight…' : complete ? 'Flight complete · Replay to try again' : 'Preview paused'}
      </div> : null}
    </div>
    <p className="support-preview__hint">Support fires automatically · Main ship weapons off</p>
    <div className="support-preview__controls">
      <label>Test level <select aria-label="Support preview level" value={level} onChange={event => setLevel(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}{value === ownedLevel ? ' · Owned' : ''}</option>)}
      </select></label>
      <button type="button" disabled={!ready || failed || complete} onClick={() => setPaused(value => !value)}>{paused ? 'Play' : 'Pause'}</button>
      <button type="button" onClick={replay}>Replay</button>
    </div>
    <p className="support-preview__hint">Free preview · No Tokens spent or saved · Loadout unchanged</p>
    <button type="button" className="support-preview__back" onClick={onClose}>← Back to support ships</button>
  </dialog>;
};

export default SupportShipPreviewDialog;
