import {
  ABYSSAL_OCTARCH_TENTACLE_IDS,
  type AbyssalOctarchTentacleId
} from '../../gameplay/bosses/AbyssalOctarchRuntime';

export type AbyssalOctarchLimbVisualState = (
  | 'healthy'
  | 'damaged'
  | 'critical'
  | 'severed'
);

export type AbyssalOctarchLimbHealthInput = Readonly<{
  id: string;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}>;

export type AbyssalOctarchLimbPresentation = Readonly<{
  id: AbyssalOctarchTentacleId;
  ratio: number;
  state: AbyssalOctarchLimbVisualState;
  spriteTint: string;
  indicatorFill: string;
  indicatorStroke: string;
}>;

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

export const ABYSSAL_OCTARCH_LIMB_HUD_ORDER = ABYSSAL_OCTARCH_TENTACLE_IDS;

export const resolveAbyssalOctarchLimbPresentation = (
  component: AbyssalOctarchLimbHealthInput
): AbyssalOctarchLimbPresentation | null => {
  if (!ABYSSAL_OCTARCH_TENTACLE_IDS.includes(component.id as AbyssalOctarchTentacleId)) {
    return null;
  }
  const ratio = component.destroyed
    ? 0
    : clampUnit(Number.isFinite(component.hp / component.maxHp)
      ? component.hp / Math.max(1, component.maxHp)
      : 0);
  const state: AbyssalOctarchLimbVisualState = component.destroyed
    ? 'severed'
    : ratio <= 0.25
      ? 'critical'
      : ratio <= 0.55
        ? 'damaged'
        : 'healthy';
  const port = component.id.endsWith('-port');

  return Object.freeze({
    id: component.id as AbyssalOctarchTentacleId,
    ratio,
    state,
    spriteTint: state === 'healthy'
      ? '#ffffff'
      : state === 'damaged'
        ? '#ffd08a'
        : state === 'critical'
          ? '#ff668a'
          : '#6b2940',
    indicatorFill: state === 'healthy'
      ? '#22d3ee'
      : state === 'damaged'
        ? '#f59e0b'
        : state === 'critical'
          ? '#fb7185'
          : '#25152f',
    indicatorStroke: port ? '#67e8f9' : '#e879f9'
  });
};
