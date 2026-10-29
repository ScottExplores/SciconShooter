/**
 * Extra signature attacks for Cinderjaw and Vesperglass.
 * They sit beside the serial volley clock. A busy timeline attack cancels
 * the telegraph instead of stacking a second pattern into it.
 * Both signatures resolve through the weave-wall gap, which already keeps
 * a lane at least 1.5 ship widths wide.
 */

export const LIVING_SIGNATURE_WARNING_FRAMES = 42;
export const LIVING_SIGNATURE_FIRE_POSE_FRAMES = 14;
export const LIVING_SIGNATURE_ARMING_FRAME = 120;
export const CINDERJAW_SIGNATURE_CYCLE_FRAMES = 540;
export const VESPERGLASS_SIGNATURE_CYCLE_FRAMES = 510;
export const VESPERGLASS_DESPERATION_CYCLE_FRAMES = 300;
export const VESPERGLASS_DESPERATION_HEALTH = 0.2;
export const LIVING_SIGNATURE_PROJECTILE_COUNT = 12;

export type LivingBossSignatureKey = 'cinderjaw' | 'vesperglass';

export type LivingBossSignaturePose = 'idle' | 'warning' | 'fire';

export type LivingBossSignatureLabel = 'FURNACE JAW' | 'GLASS VEIL' | 'LAST LIGHT';

export interface LivingBossSignatureMemory {
  mainStart: number;
  desperationStart: number;
  pose: LivingBossSignaturePose;
  poseUntil: number;
}

export interface LivingBossSignatureSpawn {
  pattern: 'weave-wall';
  sequence: number;
  projectileCount: number;
  label: LivingBossSignatureLabel;
}

export interface LivingBossSignatureStep {
  memory: LivingBossSignatureMemory;
  charging: boolean;
  announce: LivingBossSignatureLabel | null;
  spawn: LivingBossSignatureSpawn | null;
}

export const emptyLivingBossSignatureMemory = (): LivingBossSignatureMemory => ({
  mainStart: -1,
  desperationStart: -1,
  pose: 'idle',
  poseUntil: -1
});

const cycleFor = (key: LivingBossSignatureKey) => (
  key === 'cinderjaw'
    ? CINDERJAW_SIGNATURE_CYCLE_FRAMES
    : VESPERGLASS_SIGNATURE_CYCLE_FRAMES
);

const labelFor = (
  key: LivingBossSignatureKey,
  desperation: boolean
): LivingBossSignatureLabel => (
  desperation
    ? 'LAST LIGHT'
    : key === 'cinderjaw'
      ? 'FURNACE JAW'
      : 'GLASS VEIL'
);

interface WindowResult {
  start: number;
  charging: boolean;
  fire: boolean;
  opened: boolean;
}

const stepWindow = (
  start: number,
  timer: number,
  actionBusy: boolean,
  canOpen: boolean
): WindowResult => {
  if (start < 0) {
    if (!canOpen) return { start: -1, charging: false, fire: false, opened: false };
    return { start: timer, charging: true, fire: false, opened: true };
  }
  const elapsed = timer - start;
  if (elapsed < LIVING_SIGNATURE_WARNING_FRAMES) {
    if (actionBusy && elapsed > 0) {
      return { start: -1, charging: false, fire: false, opened: false };
    }
    return { start, charging: true, fire: false, opened: false };
  }
  if (elapsed === LIVING_SIGNATURE_WARNING_FRAMES && !actionBusy) {
    return { start: -1, charging: false, fire: true, opened: false };
  }
  return { start: -1, charging: false, fire: false, opened: false };
};

export const stepLivingBossSignature = ({
  bossKey,
  attackTimer,
  healthRatio,
  actionBusy,
  memory
}: {
  bossKey: LivingBossSignatureKey | null;
  attackTimer: number;
  healthRatio: number;
  actionBusy: boolean;
  memory: LivingBossSignatureMemory;
}): LivingBossSignatureStep => {
  const timer = Math.max(0, Math.floor(Number.isFinite(attackTimer) ? attackTimer : 0));
  if (!bossKey) {
    return {
      memory: emptyLivingBossSignatureMemory(),
      charging: false,
      announce: null,
      spawn: null
    };
  }

  const armed = timer >= LIVING_SIGNATURE_ARMING_FRAME;
  const mainDue = armed && timer % cycleFor(bossKey) === 0 && memory.mainStart < 0;
  const desperate = bossKey === 'vesperglass' && healthRatio < VESPERGLASS_DESPERATION_HEALTH;
  const desperationDue = desperate
    && armed
    && timer % VESPERGLASS_DESPERATION_CYCLE_FRAMES === 0
    && memory.desperationStart < 0
    && !mainDue
    && memory.mainStart < 0;

  const main = stepWindow(memory.mainStart, timer, actionBusy, mainDue && !actionBusy);
  const desperation = stepWindow(
    desperate ? memory.desperationStart : -1,
    timer,
    actionBusy || main.fire,
    desperationDue && !actionBusy && !main.opened && !main.charging
  );

  let pose: LivingBossSignaturePose = 'idle';
  let poseUntil = memory.poseUntil;
  if (memory.pose === 'fire' && timer <= memory.poseUntil) pose = 'fire';
  if (main.charging || desperation.charging) pose = 'warning';

  let announce: LivingBossSignatureLabel | null = null;
  let spawn: LivingBossSignatureSpawn | null = null;
  if (main.opened) announce = labelFor(bossKey, false);
  else if (desperation.opened) announce = labelFor(bossKey, true);

  if (main.fire || desperation.fire) {
    const desperationFire = desperation.fire && !main.fire;
    pose = 'fire';
    poseUntil = timer + LIVING_SIGNATURE_FIRE_POSE_FRAMES;
    spawn = {
      pattern: 'weave-wall',
      sequence: Math.floor(timer / 48) + (desperationFire ? 3 : 0),
      projectileCount: LIVING_SIGNATURE_PROJECTILE_COUNT,
      label: labelFor(bossKey, desperationFire)
    };
  }

  return {
    memory: {
      mainStart: main.start,
      desperationStart: desperate ? desperation.start : -1,
      pose,
      poseUntil
    },
    charging: main.charging || desperation.charging,
    announce,
    spawn
  };
};
