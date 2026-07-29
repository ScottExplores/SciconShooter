export type DirectorSection = 'scorecard' | 'waves' | 'review';
export type ConfigKind = 'scorecard' | 'wave-campaign';

export interface RunSnapshot {
  source: 'sample' | 'production-readonly' | 'imported';
  runId?: string;
  pilotName: string;
  score: number;
  wave: number;
  targetsDefeated: number;
  coinsCollected: number;
  durationLabel: string;
  finishedAt?: string;
  gameVersion: string;
  integrity: 'server-verified' | 'review' | 'local-unverified';
}

export type ScorecardMetricKey = 'wave' | 'targets' | 'coins' | 'flight';

export interface ScorecardMetric {
  key: ScorecardMetricKey;
  label: string;
  visible: boolean;
  accent: string;
}

export interface EncounterPresentation {
  id: string;
  minWave: number;
  maxWave?: number;
  label: string;
  assetPath: string;
}

export interface ScorecardConfig {
  schemaVersion: 1;
  canvas: {
    size: number;
    background: string;
    borderGlow: string;
    vignette: number;
  };
  theme: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    text: string;
    muted: string;
  };
  typography: {
    displayFont: 'Orbitron';
    uiFont: 'Inter';
    titleScale: number;
    numberScale: number;
  };
  copy: {
    title: string;
    subtitle: string;
    callsignLabel: string;
    scoreLabel: string;
    verifiedLabel: string;
    reviewLabel: string;
  };
  metrics: ScorecardMetric[];
  encounters: EncounterPresentation[];
  layout: {
    artScale: number;
    panelOpacity: number;
    showGrid: boolean;
  };
}

export type WaveSegmentType =
  | 'launch'
  | 'phase'
  | 'mini-boss'
  | 'asteroid-belt'
  | 'boss'
  | 'recovery'
  | 'inter-wave';

export type FormationPattern = 'row' | 'v' | 'sine' | 'pincer' | 'grid' | 'diamond' | 'spiral';
export type EnemyType = 'drone' | 'swarm' | 'brick' | 'journal';
export type BossType = 'mini-boss' | 'wall' | 'asteroid-belt' | 'gatekeeper';

export interface EnemyWeights {
  drone: number;
  swarm: number;
  brick: number;
  journal: number;
}

export interface WaveSegment {
  id: string;
  label: string;
  type: WaveSegmentType;
  durationSeconds: number;
  description: string;
  formation?: FormationPattern;
  formationCount?: number;
  spawnIntervalSeconds?: number;
  enemyWeights?: EnemyWeights;
  bossType?: BossType;
  warningSeconds?: number;
  hpMultiplier?: number;
  density?: number;
}

export interface PowerupWeight {
  id: 'shield' | 'double-shot' | 'triple-shot' | 'magnet' | 'research-beam' | 'extra-life';
  label: string;
  weight: number;
}

export interface WaveDefinition {
  id: string;
  name: string;
  accent: string;
  backgroundId: string;
  difficultyMultiplier: number;
  segments: WaveSegment[];
  betweenWaves: WaveSegment[];
}

export interface BackgroundPreset {
  id: string;
  label: string;
  layers: string[];
  tint: string;
  starDensity: number;
}

export interface WaveCampaignConfig {
  schemaVersion: 1;
  fps: 60;
  seed: string;
  waves: WaveDefinition[];
  backgrounds: BackgroundPreset[];
  powerups: PowerupWeight[];
}

export interface LevelEditorReviewContext {
  source: 'level-editor';
  campaignId: string;
  campaignRevision: number;
  campaignContentHash: string;
  draftContentHash?: string;
  levelId: string;
  levelName: string;
  waveId: string;
  waveName: string;
  eventId?: string;
  eventLabel?: string;
  eventKind?: 'spawn' | 'boss' | 'asteroid-belt' | 'supply-drop' | 'powerup' | 'recovery';
  elapsedSeconds: number;
  draft: boolean;
}

export interface ReviewRequest {
  id: string;
  sequence: number;
  surface: 'scorecard' | 'wave';
  configVersion: string;
  target: string;
  note: string;
  status: 'open' | 'resolved';
  anchor: { x: number; y: number };
  context?: LevelEditorReviewContext;
  createdAt: string;
  resolvedAt?: string;
}

export interface VersionEnvelope<T> {
  schemaVersion: 1;
  kind: ConfigKind;
  id: string;
  revision: number;
  parentId: string | null;
  rollbackOf: string | null;
  createdAt: string;
  changeNote: string;
  contentHash: string;
  payload: T;
}

export interface DirectorBootstrap {
  scorecard: ScorecardConfig;
  waveCampaign: WaveCampaignConfig;
  runs: RunSnapshot[];
  reviews: ReviewRequest[];
  activeVersions: Record<ConfigKind, string>;
  drafts?: Partial<Record<ConfigKind, { payload: unknown }>>;
  versions?: Partial<Record<ConfigKind, Array<{
    id: string;
    revision: number;
    createdAt: string;
    changeNote: string;
    contentHash: string;
    active: boolean;
  }>>>;
  safety?: {
    localOnly: boolean;
    productionWrites: boolean;
    mainnetTransactions: boolean;
  };
}

export interface SaveResult<T> {
  ok: boolean;
  message: string;
  envelope?: VersionEnvelope<T>;
  errors?: string[];
}
