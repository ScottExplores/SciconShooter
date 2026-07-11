export const BASE_FLASK_CHARGE_MAX = 58;
export const FLASK_CHARGE_PER_COIN = 5;

const FLASK_REQUIREMENT_GROWTH = 0.15;

export type FlaskProgress = {
  storedFlasks: number;
  nextFlaskCharge: number;
  nextFlaskMax: number;
  nextFlaskPct: number;
};

export const getFlaskRequirement = (flaskIndex: number, baseMax: number = BASE_FLASK_CHARGE_MAX) => {
  const safeIndex = Math.max(0, Math.floor(flaskIndex));
  const safeBase = Math.max(1, baseMax || BASE_FLASK_CHARGE_MAX);
  return Math.round(safeBase * (1 + (safeIndex * FLASK_REQUIREMENT_GROWTH)));
};

export const getFlaskProgress = (
  charge: number = 0,
  baseMax: number = BASE_FLASK_CHARGE_MAX
): FlaskProgress => {
  let remainingCharge = Math.max(0, charge || 0);
  let storedFlasks = 0;
  let nextFlaskMax = getFlaskRequirement(storedFlasks, baseMax);

  while (remainingCharge >= nextFlaskMax && storedFlasks < 99) {
    remainingCharge -= nextFlaskMax;
    storedFlasks++;
    nextFlaskMax = getFlaskRequirement(storedFlasks, baseMax);
  }

  return {
    storedFlasks,
    nextFlaskCharge: remainingCharge,
    nextFlaskMax,
    nextFlaskPct: Math.max(0, Math.min(100, (remainingCharge / nextFlaskMax) * 100))
  };
};

export const spendStoredFlasks = (
  charge: number = 0,
  flaskCount: number = 1,
  baseMax: number = BASE_FLASK_CHARGE_MAX
) => {
  const progress = getFlaskProgress(charge, baseMax);
  const spendCount = Math.min(progress.storedFlasks, Math.max(0, Math.floor(flaskCount)));
  if (spendCount <= 0) return Math.max(0, charge || 0);

  let spentCharge = 0;
  for (let index = 0; index < spendCount; index++) {
    spentCharge += getFlaskRequirement(progress.storedFlasks - 1 - index, baseMax);
  }

  return Math.max(0, (charge || 0) - spentCharge);
};

export const spendStoredFlask = (
  charge: number = 0,
  baseMax: number = BASE_FLASK_CHARGE_MAX
) => spendStoredFlasks(charge, 1, baseMax);
