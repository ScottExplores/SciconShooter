import type { GameCampaign } from '../../../game-config/types';

/** Cosmetic identities only: no background seed enters the gameplay RNG. */
export type BackgroundSignatureKind =
  | 'station' | 'refinery' | 'rift' | 'wreck' | 'crystal'
  | 'rails' | 'singularity' | 'rings' | 'fortress' | 'archive';
export type BackgroundPlanetKind = 'ringed' | 'cratered' | 'gas' | 'shattered';

export interface BackgroundPalette {
  ink: number;
  base: number;
  nebula: number;
  shadow: number;
  hull: number;
  detail: number;
  accent: number;
  boss: number;
}

export interface BackgroundTheme {
  id: string;
  sectorId: string;
  name: string;
  palette: Readonly<BackgroundPalette>;
  signature: BackgroundSignatureKind;
  secondarySignature: BackgroundSignatureKind;
  nebulaStyle: 'cloud' | 'ribbon' | 'vortex' | 'wisps';
  debrisStyle: 'rock' | 'metal' | 'crystal';
}

/**
 * Sector IDs are the campaign's actual identities, not the story outline's
 * illustrative names. Warm/cool accents stay muted; live projectiles own white.
 * Ink/base/nebula supply the large planes, detail/accent only tiny edge pixels.
 */
export const BACKGROUND_THEMES: readonly BackgroundTheme[] = [
  {
    id: 'breakwater-docks', sectorId: 'sector-open-orbit', name: 'Breakwater Docks',
    palette: { ink: 0x040a10, base: 0x08121e, nebula: 0x173a4b, shadow: 0x0b1b27, hull: 0x234253, detail: 0x486673, accent: 0x568f99, boss: 0x352441 },
    signature: 'station', secondarySignature: 'wreck', nebulaStyle: 'cloud', debrisStyle: 'metal',
  },
  {
    id: 'redline-furnaces', sectorId: 'sector-redline', name: 'Redline Furnaces',
    palette: { ink: 0x10070b, base: 0x1a0d15, nebula: 0x4a202c, shadow: 0x24131b, hull: 0x513032, detail: 0x795344, accent: 0xad7855, boss: 0x501b3e },
    signature: 'refinery', secondarySignature: 'rails', nebulaStyle: 'ribbon', debrisStyle: 'metal',
  },
  {
    id: 'gravity-fracture', sectorId: 'sector-gravity', name: 'Gravity Fracture',
    palette: { ink: 0x0a0715, base: 0x130f24, nebula: 0x38294f, shadow: 0x201630, hull: 0x3d3258, detail: 0x665475, accent: 0x9680b0, boss: 0x442752 },
    signature: 'rift', secondarySignature: 'rings', nebulaStyle: 'vortex', debrisStyle: 'rock',
  },
  {
    id: 'terminus-graveyard', sectorId: 'sector-terminus', name: 'Terminus Graveyard',
    palette: { ink: 0x0e0c09, base: 0x191810, nebula: 0x3b3823, shadow: 0x24251a, hull: 0x3e4836, detail: 0x69704c, accent: 0x969064, boss: 0x3b3125 },
    signature: 'wreck', secondarySignature: 'fortress', nebulaStyle: 'wisps', debrisStyle: 'metal',
  },
  {
    id: 'prism-gardens', sectorId: 'sector-prism-expanse', name: 'Prism Gardens',
    palette: { ink: 0x080b15, base: 0x101628, nebula: 0x24394c, shadow: 0x182333, hull: 0x314b60, detail: 0x626b84, accent: 0x7b91ae, boss: 0x3b2855 },
    signature: 'crystal', secondarySignature: 'rift', nebulaStyle: 'ribbon', debrisStyle: 'crystal',
  },
  {
    id: 'meridian-railway', sectorId: 'sector-rail-meridian', name: 'Meridian Railway',
    palette: { ink: 0x0f0c06, base: 0x1c170d, nebula: 0x42321c, shadow: 0x292218, hull: 0x4d412c, detail: 0x776346, accent: 0xa28a54, boss: 0x452322 },
    signature: 'rails', secondarySignature: 'station', nebulaStyle: 'wisps', debrisStyle: 'metal',
  },
  {
    id: 'singularity-tide', sectorId: 'sector-singularity-reach', name: 'Singularity Tide',
    palette: { ink: 0x08060e, base: 0x110c1c, nebula: 0x36203f, shadow: 0x1a1226, hull: 0x382c47, detail: 0x66496f, accent: 0x916986, boss: 0x48222e },
    signature: 'singularity', secondarySignature: 'archive', nebulaStyle: 'vortex', debrisStyle: 'rock',
  },
  {
    id: 'gyroscope-orbits', sectorId: 'sector-gyroscope-array', name: 'Gyroscope Orbits',
    palette: { ink: 0x060f0f, base: 0x0c1b1b, nebula: 0x1b403c, shadow: 0x132825, hull: 0x2d5147, detail: 0x527568, accent: 0x77a28b, boss: 0x26394c },
    signature: 'rings', secondarySignature: 'refinery', nebulaStyle: 'vortex', debrisStyle: 'metal',
  },
  {
    id: 'hammerhead-bastions', sectorId: 'sector-hammerhead-line', name: 'Hammerhead Bastions',
    palette: { ink: 0x101016, base: 0x1a1823, nebula: 0x393344, shadow: 0x242330, hull: 0x484456, detail: 0x706473, accent: 0xa17d81, boss: 0x4b252c },
    signature: 'fortress', secondarySignature: 'wreck', nebulaStyle: 'cloud', debrisStyle: 'metal',
  },
  {
    id: 'crownclaw-vaults', sectorId: 'sector-crownclaw-frontier', name: 'Crownclaw Vaults',
    palette: { ink: 0x100811, base: 0x1d1020, nebula: 0x442641, shadow: 0x29172b, hull: 0x513652, detail: 0x78566d, accent: 0xa3808e, boss: 0x452541 },
    signature: 'archive', secondarySignature: 'crystal', nebulaStyle: 'ribbon', debrisStyle: 'crystal',
  },
];

export interface MissionBackdropSelection {
  theme: BackgroundTheme;
  missionId: string;
  sectorId: string;
  /** Zero based within a sector; alternate routes follow the five main slots. */
  missionIndex: number;
  sectorIndex: number;
  seed: number;
  variant: number;
  isBranch: boolean;
}

/** FNV-1a is stable across engines, refreshes, campaign revisions and devices. */
export function hashBackdropSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

/** Small private cosmetic RNG; never replaces or consumes Math.random. */
export function createBackdropRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Use the engine's active campaign, including editor/weekly copies. A level can
 * belong through sector.missionIds, graph alternatives, progression metadata or
 * mastery branch source. Unknown special/weekly scenes retain authored art.
 */
export function resolveMissionBackdrop(
  campaign: GameCampaign,
  missionId: string | undefined,
): MissionBackdropSelection | null {
  if (!missionId) return null;
  const sectors = campaign.sectors ?? [];
  const graphNodes = campaign.campaignGraph?.nodes ?? [];
  const branch = campaign.campaignBranches?.find(item => item.missionDefinitionId === missionId || item.branchId === missionId);
  const canonicalId = branch?.missionDefinitionId ?? missionId;
  const graphNode = graphNodes.find(node => node.missionDefinitionId === canonicalId || node.nodeId === canonicalId);
  const levelId = graphNode?.missionDefinitionId ?? canonicalId;
  const level = campaign.levels.find(item => item.id === levelId);
  const sector = sectors.find(item => item.missionIds.includes(levelId))
    ?? sectors.find(item => item.id === graphNode?.sectorId)
    ?? sectors.find(item => item.id === level?.campaignProgression?.sectorId)
    ?? sectors.find(item => branch && (item.branchIds.includes(branch.branchId) || item.missionIds.includes(branch.sourceMissionId)));
  if (!sector) return null;
  const theme = BACKGROUND_THEMES.find(item => item.sectorId === sector.id);
  if (!theme) return null;

  let missionIndex = sector.missionIds.indexOf(levelId);
  const isBranch = missionIndex < 0;
  if (isBranch) {
    // Stable lexical order means graph serialization order cannot change a view.
    const alternatives = new Set<string>();
    for (const node of graphNodes) {
      if (node.sectorId === sector.id && !sector.missionIds.includes(node.missionDefinitionId)) alternatives.add(node.missionDefinitionId);
    }
    for (const item of campaign.levels) {
      if (item.campaignProgression?.sectorId === sector.id && !sector.missionIds.includes(item.id)) alternatives.add(item.id);
    }
    for (const item of campaign.campaignBranches ?? []) {
      if (sector.branchIds.includes(item.branchId) || sector.missionIds.includes(item.sourceMissionId)) alternatives.add(item.missionDefinitionId);
    }
    alternatives.add(levelId);
    missionIndex = sector.missionIds.length + [...alternatives].sort().indexOf(levelId);
  }
  return {
    theme,
    missionId: levelId,
    sectorId: sector.id,
    missionIndex,
    sectorIndex: Math.max(0, sector.order - 1),
    seed: hashBackdropSeed(`${sector.id}/${levelId}`),
    variant: missionIndex % 4,
    isBranch,
  };
}
