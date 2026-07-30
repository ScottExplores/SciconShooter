export type BossComponentLifecycleState = {
  id: string;
  destroyed: boolean;
  exposed: boolean;
};

export type DamageableBossComponentState = BossComponentLifecycleState & {
  hp: number;
  maxHp: number;
};

export type BossComponentDamageResult = Readonly<{
  applied: boolean;
  previousHealth: number;
  remainingHealth: number;
  destroyedNow: boolean;
}>;

export const PAYWALL_HELMET_DETACH_HEALTH_RATIO = 0.9;

export const isBossComponentTargetable = (
  component: BossComponentLifecycleState
) => component.exposed && !component.destroyed;

export const setBossComponentExposure = (
  component: BossComponentLifecycleState,
  exposed: boolean
) => {
  if (component.destroyed) {
    component.exposed = false;
    return false;
  }
  component.exposed = Boolean(exposed);
  return component.exposed;
};

export const applyBossComponentDamage = (
  component: DamageableBossComponentState,
  damage: number,
  multiplier: number = 1
): BossComponentDamageResult => {
  const previousHealth = component.hp;
  if (!isBossComponentTargetable(component)) {
    return {
      applied: false,
      previousHealth,
      remainingHealth: Math.max(0, previousHealth),
      destroyedNow: false
    };
  }

  const normalizedDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  const normalizedMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  component.hp = Math.max(0, previousHealth - normalizedDamage * normalizedMultiplier);
  const destroyedNow = component.hp <= 0;
  if (destroyedNow) {
    component.destroyed = true;
    component.exposed = false;
  }

  return {
    applied: true,
    previousHealth,
    remainingHealth: component.hp,
    destroyedNow
  };
};

export const isBossHullProtectedByComponents = (
  components: readonly Pick<BossComponentLifecycleState, 'id' | 'destroyed'>[],
  hullLinkedHelmet: boolean = false
) => !hullLinkedHelmet
  && components.some((component) => component.id === 'helmet' && !component.destroyed);

/**
 * Converts the Paywall Decimator helmet into a hull-health presentation beat.
 *
 * The helmet remains a component so collision and the Pixi detached-part
 * presentation can use its authored geometry, but it never owns a separate
 * damage budget. The first hull update at or below 90% marks it destroyed;
 * subsequent updates are no-ops so the detached sprite can only be emitted
 * once by the renderer's component transition tracking.
 */
export const syncHullLinkedHelmetToHullHealth = <TComponent extends DamageableBossComponentState>(
  components: readonly TComponent[],
  hullHealth: number,
  maxHullHealth: number,
  detachHealthRatio: number = PAYWALL_HELMET_DETACH_HEALTH_RATIO
): TComponent | undefined => {
  const helmet = components.find((component) => component.id === 'helmet');
  if (!helmet || helmet.destroyed) return undefined;

  const normalizedMaxHealth = Number.isFinite(maxHullHealth)
    ? Math.max(1, maxHullHealth)
    : 1;
  const normalizedHealth = Number.isFinite(hullHealth)
    ? Math.max(0, hullHealth)
    : normalizedMaxHealth;
  const normalizedDetachRatio = Number.isFinite(detachHealthRatio)
    ? Math.min(1, Math.max(0, detachHealthRatio))
    : PAYWALL_HELMET_DETACH_HEALTH_RATIO;
  if ((normalizedHealth / normalizedMaxHealth) > normalizedDetachRatio) {
    return undefined;
  }

  helmet.hp = 0;
  helmet.destroyed = true;
  helmet.exposed = false;
  return helmet;
};
