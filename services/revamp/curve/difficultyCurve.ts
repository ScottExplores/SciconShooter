/** Shared, deterministic authoring/report model. No viewport, wallet or platform inputs. */
export const CURVE = Object.freeze({
  missionsPerSector: 5,
  firstMissionThreat: 24,
  missionGrowth: 1.07,
  sectorReset: 0.9,
  referenceFireIntervalSeconds: 3,
  expectedPowerGrowth: 1.045,
  expectedBasePower: 1000,
  expectedBaseDps: 4,
  regularTtkSeconds: { light: 0.48, standard: 0.65, armored: 0.95, elite: 1.1 },
});

const finitePositive = (n: number, fallback: number) => Number.isFinite(n) && n > 0 ? n : fallback;
export const roundCurve = (n: number, digits = 3) => Number(n.toFixed(digits));

export function missionCurve(missionNumber: number) {
  const mission = Math.max(1, Math.floor(finitePositive(missionNumber, 1)));
  const sector = Math.floor((mission - 1) / CURVE.missionsPerSector) + 1;
  const slot = (mission - 1) % CURVE.missionsPerSector + 1;
  // Four 7% steps then a 10% breath; no extra growth is added at sector boundaries.
  const threat = CURVE.firstMissionThreat
    * (CURVE.missionGrowth ** (CURVE.missionsPerSector - 1) * CURVE.sectorReset) ** (sector - 1)
    * CURVE.missionGrowth ** (slot - 1);
  const expectedPower = Math.round(CURVE.expectedBasePower * CURVE.expectedPowerGrowth ** (mission - 1));
  return {
    mission, sector, slot, threat,
    afterBoss: slot === 1 && sector > 1,
    expectedPower,
    expectedDps: CURVE.expectedBaseDps * expectedPower / CURVE.expectedBasePower,
    recommendedPower: {
      minimum: Math.round(expectedPower * 0.8),
      expected: expectedPower,
      comfortable: Math.round(expectedPower * 1.25),
    },
  };
}

export interface CurveRole { id: string; threatCost: number; fireBehavior: string; durabilityClass: string }
export interface CurveEnemy { roleId?: string; weight: number; health: number; attackIntervalSeconds?: number; burstCount?: number }
export interface CurveSpawn { kind: string; count?: number; enemies?: readonly CurveEnemy[] }

/** Threat is physical presence × cadence. A never-fire hull still has contact pressure. */
export function fireRateMultiplier(enemy: CurveEnemy, role?: CurveRole) {
  if (!role || role.fireBehavior === 'none') return 1;
  return Math.max(0.25, CURVE.referenceFireIntervalSeconds
    / finitePositive(enemy.attackIntervalSeconds ?? 3, 3)) * Math.max(1, enemy.burstCount ?? 1);
}

/** Weighted alternatives describe choices per spawn, not extra simultaneous enemies. */
export function spawnThreat(event: CurveSpawn, roles: readonly CurveRole[]) {
  if (event.kind !== 'spawn' || !event.enemies?.length) return 0;
  const weights = event.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.weight), 0);
  if (weights <= 0) return 0;
  return (event.count ?? 0) * event.enemies.reduce((sum, enemy) => {
    const role = roles.find((candidate) => candidate.id === enemy.roleId);
    return sum + Math.max(0, enemy.weight) / weights * (role?.threatCost ?? 1) * fireRateMultiplier(enemy, role);
  }, 0);
}

export function waveThreat(events: readonly CurveSpawn[], roles: readonly CurveRole[]) {
  return events.reduce((sum, event) => sum + spawnThreat(event, roles), 0);
}

/** Authored durability avoids stacking pressure, HP and contact-damage ramps. */
export function regularHealth(mission: number, durability: string) {
  const ttk = CURVE.regularTtkSeconds[durability as keyof typeof CURVE.regularTtkSeconds] ?? 0.65;
  return roundCurve(missionCurve(mission).expectedDps * ttk);
}
