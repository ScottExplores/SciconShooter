export interface PreviewBossVfxFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const PREVIEW_BOSS_VFX_FRAME_IDS = [
  'pinkDrop0',
  'pinkDrop1',
  'pinkDrop2',
  'pinkDrop3',
  'goldDrop0',
  'goldDrop1',
  'goldDrop2',
  'goldDrop3',
  'prismDrop0',
  'prismDrop1',
  'prismDrop2',
  'prismDrop3',
  'orbCharge',
  'orbMuzzle',
  'beamLive',
  'beamImpact'
] as const;

export type PreviewBossVfxFrameId = (typeof PREVIEW_BOSS_VFX_FRAME_IDS)[number];

export interface PreviewBossVfxAtlas {
  readonly url: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<PreviewBossVfxFrameId, PreviewBossVfxFrame>>;
}
