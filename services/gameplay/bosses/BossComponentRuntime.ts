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
  components: readonly Pick<BossComponentLifecycleState, 'id' | 'destroyed'>[]
) => components.some((component) => component.id === 'helmet' && !component.destroyed);
