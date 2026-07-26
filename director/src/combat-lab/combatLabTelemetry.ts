import { GAME_CONFIG } from '@game/constants';
import type { GameplayTelemetrySnapshot } from '@game/services/gameplay/telemetry';

export const calculateCombatLabDps = (
  snapshot: GameplayTelemetrySnapshot | null
): number => {
  if (!snapshot || snapshot.aggregate.latestFrame <= 0) return 0;
  return snapshot.aggregate.damageDealt / (snapshot.aggregate.latestFrame / GAME_CONFIG.FPS);
};
