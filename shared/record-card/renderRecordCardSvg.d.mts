export interface RecordCardRenderData {
  pilotName: string;
  score: number;
  wave: number;
  encounter: string;
  targetsDefeated: number;
  coinsCollected: number;
  durationLabel: string;
  completedLabel: string;
  gameVersion: string;
  integrity: 'server-verified' | 'review' | 'local-unverified' | string;
}

export interface RecordCardCopy {
  title: string;
  subtitle: string;
  callsignLabel: string;
  scoreLabel: string;
  verifiedLabel: string;
  reviewLabel: string;
  metricLabels: {
    wave: string;
    targets: string;
    coins: string;
    flight: string;
  };
}

export interface RecordCardColors {
  background: string;
  panel: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  text: string;
  muted: string;
}

export interface RecordCardArtRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface RecordCardPresentation {
  copy?: Partial<Omit<RecordCardCopy, 'metricLabels'>> & {
    metricLabels?: Partial<RecordCardCopy['metricLabels']>;
  };
  colors?: Partial<RecordCardColors>;
  showGrid?: boolean;
  art?: {
    ship?: Partial<RecordCardArtRegion>;
    encounter?: Partial<RecordCardArtRegion>;
  };
}

export interface ResolvedRecordCardPresentation {
  copy: RecordCardCopy;
  colors: RecordCardColors;
  showGrid: boolean;
  art: {
    ship: RecordCardArtRegion;
    encounter: RecordCardArtRegion;
  };
}

export interface RenderRecordCardSvgOptions {
  record: Partial<RecordCardRenderData>;
  shipImage?: string;
  encounterImage?: string;
  presentation?: RecordCardPresentation;
}

export const DEFAULT_RECORD_CARD_PRESENTATION: Readonly<ResolvedRecordCardPresentation>;
export function resolveRecordCardEncounterAssetKey(campaign: unknown, waveRef: unknown): string;
export function escapeRecordCardXml(value: unknown): string;
export function resolveRecordCardPresentation(presentation?: RecordCardPresentation): ResolvedRecordCardPresentation;
export function renderRecordCardSvg(options?: RenderRecordCardSvgOptions): string;
export default renderRecordCardSvg;
