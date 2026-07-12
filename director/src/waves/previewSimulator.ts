import type {
  BackgroundPreset,
  FormationPattern,
  WaveDefinition,
  WaveSegment
} from '../domain/types';

export interface ScheduledSegment {
  segment: WaveSegment;
  startSeconds: number;
  endSeconds: number;
  betweenWaves: boolean;
}

export type PreviewEntityKind = 'enemy' | 'boss' | 'asteroid' | 'pickup';

export interface PreviewEntity {
  id: string;
  kind: PreviewEntityKind;
  assetPath: string;
  x: number;
  y: number;
  size: number;
  drift: number;
  phase: number;
  rotation: number;
}

const ENEMY_ASSETS = [
  '/game-art/enemies/enemy-drone-1.png',
  '/game-art/enemies/enemy-drone-2.png',
  '/game-art/enemies/enemy-drone-3.png',
  '/game-art/enemies/enemy-drone-4.png',
  '/game-art/enemies/enemy-drone-5.png',
  '/game-art/enemies/swarm-1.png',
  '/game-art/enemies/swarm-2.png',
  '/game-art/enemies/swarm-3.png',
  '/game-art/enemies/swarm-4.png',
  '/game-art/enemies/journal-ace.png'
] as const;

const ASTEROID_ASSETS = [
  '/game-art/enemies/asteroid-1.png',
  '/game-art/enemies/asteroid-2.png',
  '/game-art/enemies/asteroid-3.png',
  '/game-art/enemies/asteroid-4.png',
  '/game-art/enemies/asteroid-5.png'
] as const;

const BOSS_ASSETS = {
  'mini-boss': '/game-art/bosses/mini-boss-drone.png',
  wall: '/game-art/bosses/wall-segment.png',
  'asteroid-belt': '/game-art/enemies/asteroid-5.png',
  gatekeeper: '/game-art/bosses/final-boss-sentinel.png'
} as const;

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed: string): (() => number) => {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const getWaveSchedule = (wave: WaveDefinition): ScheduledSegment[] => {
  let cursor = 0;
  const schedule: ScheduledSegment[] = [];

  for (const segment of wave.segments) {
    const startSeconds = cursor;
    cursor += segment.durationSeconds;
    schedule.push({ segment, startSeconds, endSeconds: cursor, betweenWaves: false });
  }

  for (const segment of wave.betweenWaves) {
    const startSeconds = cursor;
    cursor += segment.durationSeconds;
    schedule.push({ segment, startSeconds, endSeconds: cursor, betweenWaves: true });
  }

  return schedule;
};

export const getSegmentAtTime = (
  schedule: ScheduledSegment[],
  elapsedSeconds: number
): ScheduledSegment | undefined => {
  if (schedule.length === 0) return undefined;
  const bounded = Math.max(0, elapsedSeconds);
  return schedule.find((item) => bounded < item.endSeconds) ?? schedule[schedule.length - 1];
};

export const formatTimelineTime = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
};

const getFormationPoint = (
  pattern: FormationPattern,
  index: number,
  count: number,
  random: () => number
): { x: number; y: number } => {
  const midpoint = (count - 1) / 2;
  const normalized = count <= 1 ? 0 : (index - midpoint) / midpoint;
  switch (pattern) {
    case 'v':
      return { x: 50 + normalized * 31, y: 27 + Math.abs(normalized) * 14 };
    case 'sine':
      return { x: 14 + (index / Math.max(1, count - 1)) * 72, y: 30 + Math.sin(index * 1.35) * 11 };
    case 'pincer':
      return {
        x: index % 2 === 0 ? 25 + random() * 13 : 62 + random() * 13,
        y: 22 + Math.floor(index / 2) * 7
      };
    case 'grid': {
      const columns = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(count * 1.4))));
      const row = Math.floor(index / columns);
      const column = index % columns;
      return { x: 22 + column * 14, y: 23 + row * 10 };
    }
    case 'diamond': {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
      const denominator = Math.max(0.001, Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
      return {
        x: 50 + (Math.cos(angle) / denominator) * 27,
        y: 34 + (Math.sin(angle) / denominator) * 16
      };
    }
    case 'spiral': {
      const progress = index / Math.max(1, count - 1);
      const angle = progress * Math.PI * 3.5;
      const radius = 6 + progress * 25;
      return { x: 50 + Math.cos(angle) * radius, y: 34 + Math.sin(angle) * radius * 0.62 };
    }
    case 'row':
    default:
      return { x: 14 + (index / Math.max(1, count - 1)) * 72, y: 31 + (random() - 0.5) * 4 };
  }
};

export const buildPreviewEntities = (
  seed: string,
  segment: WaveSegment,
  viewport: 'desktop' | 'mobile'
): PreviewEntity[] => {
  const random = createRandom(`${seed}:${segment.id}:${viewport}`);
  const isAsteroidBelt =
    segment.type === 'asteroid-belt' ||
    (segment.type === 'inter-wave' && segment.bossType === 'asteroid-belt');
  const isBoss =
    segment.type === 'boss' ||
    segment.type === 'mini-boss' ||
    (segment.type === 'inter-wave' && segment.bossType !== 'asteroid-belt');

  if (isAsteroidBelt) {
    const density = segment.density ?? 0.7;
    const count = Math.round((viewport === 'mobile' ? 11 : 18) * density);
    return Array.from({ length: Math.max(7, count) }, (_, index) => ({
      id: `asteroid-${index}`,
      kind: 'asteroid' as const,
      assetPath: ASTEROID_ASSETS[index % ASTEROID_ASSETS.length],
      x: 5 + random() * 90,
      y: 8 + random() * 66,
      size: 4.5 + random() * 7,
      drift: (random() - 0.5) * 16,
      phase: random(),
      rotation: random() * 360
    }));
  }

  if (isBoss) {
    const bossType = segment.bossType ?? (segment.type === 'boss' ? 'gatekeeper' : 'mini-boss');
    const escorts = segment.type === 'boss' ? 6 : 4;
    const entities: PreviewEntity[] = [
      {
        id: 'boss',
        kind: 'boss',
        assetPath: BOSS_ASSETS[bossType],
        x: 50,
        y: 23,
        size: bossType === 'wall' ? 24 : bossType === 'gatekeeper' ? 17 : 14,
        drift: 5,
        phase: random(),
        rotation: 0
      }
    ];
    for (let index = 0; index < escorts; index += 1) {
      const point = getFormationPoint('v', index, escorts, random);
      entities.push({
        id: `escort-${index}`,
        kind: 'enemy',
        assetPath: ENEMY_ASSETS[index % 5],
        x: point.x,
        y: point.y + 17,
        size: 4.2,
        drift: (random() - 0.5) * 7,
        phase: random(),
        rotation: 0
      });
    }
    return entities;
  }

  if (segment.type === 'recovery') {
    return Array.from({ length: 6 }, (_, index) => ({
      id: `pickup-${index}`,
      kind: 'pickup' as const,
      assetPath:
        index % 2 === 0
          ? '/game-art/tokens/rsc-coin.svg'
          : '/game-art/tokens/rsc-bottle.png',
      x: 20 + random() * 60,
      y: 18 + random() * 48,
      size: index % 2 === 0 ? 3.4 : 4.8,
      drift: (random() - 0.5) * 8,
      phase: random(),
      rotation: random() * 22 - 11
    }));
  }

  const count = Math.min(viewport === 'mobile' ? 8 : 12, Math.max(4, segment.formationCount ?? 7));
  const formation = segment.formation ?? 'v';
  return Array.from({ length: count }, (_, index) => {
    const point = getFormationPoint(formation, index, count, random);
    return {
      id: `enemy-${index}`,
      kind: 'enemy' as const,
      assetPath: ENEMY_ASSETS[(index + Math.floor(random() * ENEMY_ASSETS.length)) % ENEMY_ASSETS.length],
      x: point.x,
      y: point.y,
      size: 4 + random() * 2,
      drift: (random() - 0.5) * 9,
      phase: random(),
      rotation: 0
    };
  });
};

export const getBackgroundStyle = (preset: BackgroundPreset): React.CSSProperties => ({
  '--preview-tint': preset.tint,
  '--star-opacity': Math.min(1, Math.max(0.18, preset.starDensity))
}) as React.CSSProperties;
