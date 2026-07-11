import React from 'react';
import { ASSETS } from '../constants';
import {
  renderRecordCardSvg,
  type RecordCardPresentation
} from '../shared/record-card/renderRecordCardSvg.mjs';

export interface MissionRecordCardData {
  pilotName: string;
  encounterLabel: string;
  encounterArt: string;
  score: number;
  wave: number;
  targetsDefeated: number;
  coinsCollected: number;
  flightTimeLabel: string;
  dateLabel: string;
  gameVersion?: string;
  integrity?: 'server-verified' | 'review' | 'local-unverified';
}

export interface MissionRecordCardProps {
  record: MissionRecordCardData;
  shipArt?: string;
  presentation?: RecordCardPresentation;
}

/**
 * The reusable, presentation-only mission record surface.
 *
 * It intentionally owns no modal controls, network calls, wallet behavior,
 * analytics, sharing, or minting so the exact game card can be rendered in
 * local visual tools with plain data.
 */
export function MissionRecordCard({
  record,
  shipArt = ASSETS.PLAYER_SHIP,
  presentation
}: MissionRecordCardProps) {
  const svg = renderRecordCardSvg({
    record: {
      pilotName: (record.pilotName || 'Pilot').slice(0, 15).toUpperCase(),
      score: record.score,
      wave: record.wave,
      encounter: record.encounterLabel,
      targetsDefeated: record.targetsDefeated,
      coinsCollected: record.coinsCollected,
      durationLabel: record.flightTimeLabel,
      completedLabel: record.dateLabel.toUpperCase(),
      gameVersion: record.gameVersion ?? 'unknown',
      integrity: record.integrity ?? 'server-verified'
    },
    encounterImage: record.encounterArt,
    shipImage: shipArt,
    presentation
  });

  return (
    <div
      className="relative overflow-hidden"
      aria-label={`Mission record for ${record.pilotName || 'Pilot'}`}
      // The renderer escapes every record/presentation value before creating markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default MissionRecordCard;
