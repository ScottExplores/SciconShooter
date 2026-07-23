import type { GameCampaignConfig, HudAssetsConfig, RecordCardConfig } from './types';

export const DEFAULT_RECORD_CARD_CONFIG: RecordCardConfig = {
  copy: {
    title: 'MISSION RECORD',
    subtitle: 'SCICON SHOOTER',
    callsignLabel: 'CALLSIGN',
    scoreLabel: 'FINAL SCORE',
    verifiedLabel: '',
    reviewLabel: 'REVIEWED RUN',
    metricLabels: { wave: 'MISSION', targets: 'TARGETS', coins: 'COINS', flight: 'FLIGHT' }
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
    encounter: { x: 755, y: 330, width: 273, height: 273, rotation: 0, opacity: 0.88, visible: true }
  }
};

export const DEFAULT_HUD_ASSETS_CONFIG: HudAssetsConfig = {
  bombIconAssetKey: 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F'
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Adds shared presentation defaults when opening immutable earlier schema-v1 revisions. */
export const normalizeGameCampaignRecordCard = <T extends GameCampaignConfig>(campaign: T): T => (
  campaign.recordCard && campaign.hudAssets
    ? campaign
    : {
        ...campaign,
        ...(!campaign.recordCard ? { recordCard: clone(DEFAULT_RECORD_CARD_CONFIG) } : {}),
        ...(!campaign.hudAssets ? { hudAssets: clone(DEFAULT_HUD_ASSETS_CONFIG) } : {})
      }
);
