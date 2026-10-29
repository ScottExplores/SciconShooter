/**
 * Frame poses for campaign bosses that ship as one intact painting.
 * Parts are crops of that painting. Nothing here allocates art.
 */

export type IntactBossFamily = 'crescent-hunter' | 'siege-beetle' | 'glass-moth';

export type IntactBossPartId = 'left' | 'core' | 'right';

export type IntactBossActionPose = 'idle' | 'warning' | 'fire';

export interface IntactBossCrop {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface IntactBossPartPose {
  readonly id: IntactBossPartId;
  readonly crop: IntactBossCrop;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  readonly tint: number;
  readonly visible: boolean;
}

export interface IntactBossLivingPose {
  readonly family: IntactBossFamily;
  readonly parts: readonly IntactBossPartPose[];
}

const LEFT_BREAK_BIT = 1;
const RIGHT_BREAK_BIT = 2;

const CROPS: Record<IntactBossPartId, IntactBossCrop> = {
  left: { x: 0, y: 0, w: 0.4, h: 1 },
  core: { x: 0.34, y: 0.02, w: 0.32, h: 0.96 },
  right: { x: 0.6, y: 0, w: 0.4, h: 1 }
};

const WING_RADIANS: Record<IntactBossFamily, number> = {
  'siege-beetle': 0.11,
  'glass-moth': 0.15,
  'crescent-hunter': 0.07
};

const FLAP_SPEED: Record<IntactBossFamily, number> = {
  'siege-beetle': 0.07,
  'glass-moth': 0.16,
  'crescent-hunter': 0.055
};

export const intactBossFamilyForSprite = (
  spriteUrl: string | null | undefined
): IntactBossFamily | null => {
  if (!spriteUrl) return null;
  const url = spriteUrl.split('?')[0];
  if (url.includes('meridian-harrower')) return 'crescent-hunter';
  if (url.includes('cinderjaw-siege-beetle')) return 'siege-beetle';
  if (url.includes('vesperglass-mothmother')) return 'glass-moth';
  return null;
};

/** Left armor/claw breaks at 66% HP. The matching right piece breaks at 33%. */
export const intactBossBreakMask = (healthRatio: number) => {
  const ratio = Number.isFinite(healthRatio) ? healthRatio : 1;
  let mask = 0;
  if (ratio <= 0.66) mask |= LEFT_BREAK_BIT;
  if (ratio <= 0.33) mask |= RIGHT_BREAK_BIT;
  return mask;
};

export const intactBossPartBroken = (mask: number, id: IntactBossPartId) => (
  (id === 'left' && (mask & LEFT_BREAK_BIT) !== 0)
  || (id === 'right' && (mask & RIGHT_BREAK_BIT) !== 0)
);

const motionScale = (reducedMotion: boolean) => (reducedMotion ? 0.34 : 1);

export const sampleIntactBossLivingPose = ({
  spriteUrl,
  frame,
  healthRatio,
  actionPose = 'idle',
  hurt = false,
  reducedMotion = false
}: {
  spriteUrl: string | null | undefined;
  frame: number;
  healthRatio: number;
  actionPose?: IntactBossActionPose;
  hurt?: boolean;
  reducedMotion?: boolean;
}): IntactBossLivingPose | null => {
  const family = intactBossFamilyForSprite(spriteUrl);
  if (!family) return null;
  const tick = Math.max(0, Math.floor(Number.isFinite(frame) ? frame : 0));
  const amplitude = motionScale(reducedMotion);
  const breath = Math.sin(tick * 0.08) * amplitude;
  const flap = Math.sin(tick * FLAP_SPEED[family]) * amplitude;
  const wing = WING_RADIANS[family];
  const warning = actionPose === 'warning' ? 1 : 0;
  const firing = actionPose === 'fire' ? 1 : 0;
  const attack = warning + firing * 0.55;
  const glow = 0.5 + Math.sin(tick * 0.12) * 0.5;
  const breakMask = intactBossBreakMask(healthRatio);
  const hurtTint = hurt ? 0xffd2d2 : 0xffffff;
  const coreGlow = glow > 0.62;
  const coreTint = hurt
    ? 0xfff1f2
    : coreGlow
      ? family === 'siege-beetle'
        ? 0xfff4c2
        : family === 'glass-moth'
          ? 0xe9d5ff
          : 0xfecaca
      : 0xffffff;

  const part = (
    id: IntactBossPartId,
    rotation: number,
    offsetX: number,
    offsetY: number,
    scaleX: number,
    scaleY: number,
    alpha: number,
    tint: number
  ): IntactBossPartPose => ({
    id,
    crop: CROPS[id],
    offsetX,
    offsetY,
    rotation,
    scaleX,
    scaleY,
    alpha,
    tint,
    visible: !intactBossPartBroken(breakMask, id)
  });

  return {
    family,
    parts: [
      part(
        'left',
        -flap * wing - attack * wing * 1.35,
        -attack * 7 * amplitude,
        breath * 1.4 + firing * 3 * amplitude,
        1 + warning * 0.03,
        1,
        1,
        hurtTint
      ),
      part(
        'core',
        0,
        0,
        breath * 2.4,
        1 + breath * 0.02,
        1 + breath * 0.035 - firing * 0.04 - (hurt ? 0.03 : 0),
        0.92 + glow * 0.08 * amplitude,
        coreTint
      ),
      part(
        'right',
        flap * wing + attack * wing * 1.35,
        attack * 7 * amplitude,
        breath * 1.4 + firing * 3 * amplitude,
        1 + warning * 0.03,
        1,
        1,
        hurtTint
      )
    ]
  };
};
