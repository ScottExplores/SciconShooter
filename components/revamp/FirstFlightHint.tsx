import React, { useEffect, useState } from 'react';
import { DEFAULT_GAME_CAMPAIGN } from '../../services/levelConfig';
import { FIRST_FLIGHT_HINT_MS, canShowFirstFlightHint, isSteeringKey } from '../../services/revamp/presentation/firstFlightHint';
import './FirstFlightHint.css';

type Props = { missionId?: string; waveId?: string; bossActive: boolean; active: boolean };

export default function FirstFlightHint({ missionId, waveId, bossActive, active }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const allowed = canShowFirstFlightHint(DEFAULT_GAME_CAMPAIGN, missionId, waveId, bossActive);

  // REVAMP(I): One hint per flight. The timer survives pause/boss visibility changes.
  useEffect(() => {
    const timer = window.setTimeout(() => setDismissed(true), FIRST_FLIGHT_HINT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (dismissed || !allowed || !active) return;
    const onSteer = (event: Event) => {
      // HUD taps and incidental mouse movement never dismiss a steering lesson.
      if (event.target instanceof Element
        && event.target.closest('[data-onboarding-target="flight-stage"] canvas')) setDismissed(true);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (isSteeringKey(event.key)) setDismissed(true);
    };
    window.addEventListener('pointerdown', onSteer, { passive: true });
    window.addEventListener('touchstart', onSteer, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onSteer);
      window.removeEventListener('touchstart', onSteer);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, allowed, dismissed]);

  if (dismissed || !allowed || !active) return null;
  return <p className="revamp-first-flight" role="status">Drag to steer <span aria-hidden="true">·</span> Auto-fire is on</p>;
}
