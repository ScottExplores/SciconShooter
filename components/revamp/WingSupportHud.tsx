import React from 'react';
import type { WingHudSnapshot } from '../../services/revamp/wings/wingRuntime';
import type { WingSlot } from '../../services/revamp/wings/wingTuning';
import './WingSupportHud.css';

interface Props {
  snapshot: WingHudSnapshot;
  disabled?: boolean;
  onCast: (slot: WingSlot) => void;
  onAutoCastChange: (enabled: boolean) => void;
}

/** Two 58px thumb targets; the middle of the playfield remains transparent to steering. */
export default function WingSupportHud({ snapshot, disabled = false, onCast, onAutoCastChange }: Props) {
  if (!snapshot.enabled || snapshot.wings.length === 0) return null;
  return <aside className="revamp-wing-hud" aria-label="Wing support controls">
    {snapshot.wings.map(wing => {
      const ready = wing.ready && !disabled;
      const progress = Math.max(0, Math.min(1, 1 - wing.cooldownFrames / wing.cooldownMax));
      return <button type="button" key={wing.slot}
        className={`revamp-wing-button revamp-wing-button--${wing.slot}${ready ? ' is-ready' : ''}${wing.evolved ? ' is-evolved' : ''}`}
        disabled={!ready} onClick={() => onCast(wing.slot)}
        onPointerDown={event => event.stopPropagation()}
        aria-label={`${wing.slot === 'left' ? 'Offense' : 'Utility'} wing: ${wing.label}${wing.cooldownFrames > 0 ? `, ${Math.ceil(wing.cooldownFrames / 60)} seconds` : ready ? ', ready' : ', standby'}`}
        style={{ '--wing-charge': `${progress * 100}%` } as React.CSSProperties}>
        <span className="revamp-wing-button__role">{wing.slot === 'left' ? 'OFFENSE' : 'UTILITY'}</span>
        <img src={wing.image} alt="" draggable={false} />
        <strong>{wing.cooldownFrames > 0 ? `${Math.ceil(wing.cooldownFrames / 60)}s` : !ready ? 'STANDBY' : wing.evolved ? 'EVOLVED' : 'READY'}</strong>
        <span className="revamp-wing-button__name">{wing.label}</span>
      </button>;
    })}
    <button type="button" className="revamp-wing-auto" aria-pressed={snapshot.autoCast}
      aria-label="Auto-cast wing specials" disabled={disabled}
      onPointerDown={event => event.stopPropagation()} onClick={() => onAutoCastChange(!snapshot.autoCast)}>
      WINGS AUTO <strong>{snapshot.autoCast ? 'ON' : 'OFF'}</strong>
    </button>
  </aside>;
}
