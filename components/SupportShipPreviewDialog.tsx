import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameStage from './GameStage';
import { PLAYER_SHIPS, type PlayerShipId } from '../services/playerShipService';
import { MINI_SHIP_BY_ID, type MiniShipId, type WeeklySquadState } from '../services/squadProgression';
import { createSupportPreviewCampaign, createSupportPreviewLoadout, createSupportPreviewStats } from '../services/supportShipPreview';
// REVAMP(D): Test either wing role with real cooldowns, without changing ownership.
import { getRevampBonuses, createRevampProgress } from '../services/revamp/progression';
import { EMPTY_WING_SNAPSHOT, type WingHudSnapshot } from '../services/revamp/wings/wingRuntime';
import { getWingSpecial, WING_SPECIAL_LABELS, WING_EVOLUTION_LABELS, type WingSlot } from '../services/revamp/wings/wingTuning';
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
  const [slot, setSlot] = useState<WingSlot>('left');
  const [wings, setWings] = useState<WingHudSnapshot>(EMPTY_WING_SNAPSHOT);
  const [wingCommand, setWingCommand] = useState<{ nonce: number; slot?: WingSlot; autoCast?: boolean } | null>(null);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [run, setRun] = useState(0);
  const [stats, setStats] = useState(createSupportPreviewStats);
  const campaign = useMemo(createSupportPreviewCampaign, []);
  const loadout = useMemo(() => {
    const base = createSupportPreviewLoadout(state, mainShipId, miniId, level);
    return { ...base, companions: base.companions.map(wing => ({ ...wing, slot })),
      revamp: { ...getRevampBonuses(createRevampProgress()), wingAutoCast: false } };
  }, [state, mainShipId, miniId, level, slot]);
  const special = getWingSpecial(slot, entry.ability);

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
    <p id="support-preview-description" className="support-preview__description">
      {slot === 'left' ? 'Offense wing' : 'Utility wing'} · {level >= 5 ? WING_EVOLUTION_LABELS[special] : WING_SPECIAL_LABELS[special]}.
      {' '}Passive fire: {Math.round((0.15 + (level - 1) * 0.0125) * 100)}% of main weapon damage.
      {level >= 5 ? ' Evolution active.' : ' Evolution unlocks at level 5.'}
    </p>
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
        wingCommand, onWingSupportState: setWings,
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
    <div className="support-preview__controls" style={{ marginBottom: 8 }}>
      <label>Formation <select aria-label="Wing preview role" value={slot} onChange={event => setSlot(event.target.value as WingSlot)}>
        <option value="left">Left · Offense</option><option value="right">Right · Utility</option>
      </select></label>
      <button type="button" disabled={paused || complete || !wings.wings[0]?.ready}
        onClick={() => setWingCommand({ nonce: performance.now(), slot })}>
        {wings.wings[0]?.cooldownFrames ? `${Math.ceil(wings.wings[0].cooldownFrames / 60)}s` : 'Cast special'}
      </button>
      <button type="button" aria-pressed={wings.autoCast} onClick={() => setWingCommand({ nonce: performance.now(), autoCast: !wings.autoCast })}>
        Auto {wings.autoCast ? 'on' : 'off'}
      </button>
    </div>
    <div className="support-preview__controls">
      <label>Test level <select aria-label="Support preview level" value={level} disabled={!ready || failed} onChange={event => setLevel(Number(event.target.value))}>
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
