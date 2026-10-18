import {
  createBackdropRandom,
  type BackgroundPlanetKind,
  type BackgroundSignatureKind,
  type MissionBackdropSelection,
} from './themes';
import { SET_PIECE_DURATION } from './timeline';

export interface BackdropPlacement {
  /** Normalized world positions, independent of viewport and render quality. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  seed: number;
}
export interface BackdropSignature extends BackdropPlacement { kind: BackgroundSignatureKind }
export interface BackdropPlanet extends Omit<BackdropPlacement, 'rotation'> { kind: BackgroundPlanetKind }
export interface BackdropDebris extends BackdropPlacement { speed: number }
export type BackdropSetPieceKind = 'capital-flyby' | 'asteroid-shower' | 'station-flythrough';
export interface BackdropSetPiece {
  kind: BackdropSetPieceKind;
  atSeconds: number;
  side: -1 | 1;
  seed: number;
}
export interface MissionBackdropLayout {
  seed: number;
  variant: number;
  nebulae: BackdropPlacement[];
  signatures: BackdropSignature[];
  planets: BackdropPlanet[];
  debris: BackdropDebris[];
  battle: { side: -1 | 1; y: number; seed: number };
  setPieces: BackdropSetPiece[];
}

const PLANET_KINDS: readonly BackgroundPlanetKind[] = ['ringed', 'cratered', 'gas', 'shattered'];
const SET_PIECES: readonly BackdropSetPieceKind[] = ['capital-flyby', 'station-flythrough', 'asteroid-shower'];

/**
 * Six presentation layers consume this one immutable recipe. Large silhouettes
 * sit near the shoulders, leaving the central attack lane visually quiet.
 * All counts and coordinates are fixed before quality culling, so Low and High
 * cannot accidentally produce different destinations or consume gameplay RNG.
 */
export function createMissionBackdropLayout(selection: MissionBackdropSelection): MissionBackdropLayout {
  const { seed, variant, missionIndex, sectorIndex, theme } = selection;
  const random = createBackdropRandom(seed);
  const nextSeed = () => Math.floor(random() * 0x100000000) >>> 0;
  const side: -1 | 1 = variant % 2 === 0 ? -1 : 1;
  const shoulder = side < 0 ? 0.12 : 0.88;
  const otherShoulder = 1 - shoulder;
  const nebulae = Array.from({ length: 3 }, (_, index): BackdropPlacement => ({
    x: index % 2 === 0 ? 0.12 + random() * 0.18 : 0.7 + random() * 0.18,
    y: 0.1 + index * 0.29 + random() * 0.08,
    scale: 0.85 + random() * 0.4,
    rotation: (variant % 2 === 0 ? -1 : 1) * (0.1 + random() * 0.35),
    seed: nextSeed(),
  }));
  const signatures: BackdropSignature[] = [
    {
      kind: theme.signature,
      x: shoulder + (random() - 0.5) * 0.08,
      y: 0.21 + variant * 0.045 + random() * 0.06,
      scale: variant < 2 ? 1.18 : 0.91,
      rotation: (random() - 0.5) * 0.34,
      seed: nextSeed(),
    },
    {
      kind: variant < 2 ? theme.secondarySignature : theme.signature,
      x: otherShoulder + (random() - 0.5) * 0.06,
      y: 0.62 + random() * 0.12,
      scale: 0.56 + random() * 0.17,
      rotation: (random() - 0.5) * 0.5,
      seed: nextSeed(),
    },
  ];
  const planets: BackdropPlanet[] = [];
  if ((missionIndex + sectorIndex) % 4 === 2) {
    planets.push({
      kind: PLANET_KINDS[(Math.floor(missionIndex / 4) + sectorIndex) % PLANET_KINDS.length],
      x: otherShoulder,
      y: 0.12 + random() * 0.13,
      scale: 0.58 + random() * 0.21,
      seed: nextSeed(),
    });
  }
  const debris = Array.from({ length: 12 }, (_, index): BackdropDebris => ({
    x: index % 2 === 0 ? random() * 0.24 : 0.76 + random() * 0.24,
    y: random(),
    scale: 0.28 + random() * 0.58,
    rotation: random() * Math.PI * 2,
    speed: 0.45 + random() * 0.7,
    seed: nextSeed(),
  }));
  const battle = { side: (side === -1 ? 1 : -1) as -1 | 1, y: 0.12 + random() * 0.22, seed: nextSeed() };
  let previousEnd = -1;
  const setPieces = [5, 16, 36].map((atSeconds, index): BackdropSetPiece => {
    const kind = SET_PIECES[(missionIndex + index) % SET_PIECES.length];
    // A longer station transit must finish before the next entrance begins.
    // Leave one calm second between silhouettes rather than skipping entrances.
    const start = Math.max(previousEnd + 1, atSeconds + variant * (index === 0 ? 0.65 : 1.15) + random() * 0.3);
    previousEnd = start + SET_PIECE_DURATION[kind];
    return {
      kind,
      atSeconds: start,
      side: index % 2 === 0 ? side : side === -1 ? 1 : -1,
      seed: nextSeed(),
    };
  });
  return { seed, variant, nebulae, signatures, planets, debris, battle, setPieces };
}
