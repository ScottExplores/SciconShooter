import type { GameCampaignConfig, RecordCardConfig } from './types';

export const DEFAULT_RECORD_CARD_CONFIG: RecordCardConfig = {
  copy: {
    title: 'MISSION RECORD',
    subtitle: 'SCICON SHOOTER',
    callsignLabel: 'CALLSIGN',
    scoreLabel: 'FINAL SCORE',
    verifiedLabel: 'SERVER VERIFIED',
    reviewLabel: 'REVIEWED RUN',
    metricLabels: { wave: 'WAVE', targets: 'TARGETS', coins: 'COINS', flight: 'FLIGHT' }
  },
  colors: {
    background: '#020617',
    panel: '#07152A',
    primary: '#67E8F9',
    secondary: '#2563EB',
    success: '#6EE7B7',
    warning: '#FACC15',
    text: '#FFFFFF',
    muted: '#94A3B8'
  },
  showGrid: true,
  shipAssetKey: 'PLAYER_SHIP',
  encounterAssetKey: 'AUTO',
  art: {
    ship: { x: 290, y: 370, width: 260, height: 260, rotation: 0, opacity: 1, visible: true },
    encounter: { x: 800, y: 292, width: 260, height: 260, rotation: 0, opacity: 0.72, visible: true }
  }
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Adds the shared card defaults when opening an immutable pre-card schema-v1 revision. */
export const normalizeGameCampaignRecordCard = <T extends GameCampaignConfig>(campaign: T): T => (
  campaign.recordCard
    ? campaign
    : { ...campaign, recordCard: clone(DEFAULT_RECORD_CARD_CONFIG) }
);
