import { useCallback, useMemo, useState } from 'react';
import type { GameEditorPreviewSettings } from '@game/components/GameEditorCanvas';
import type { PlayerShipId } from '@game/services/playerShipService';
import {
  MINI_SHIP_MAX_LEVEL,
  getMainShipUpgradeMaxLevel,
  type MiniShipId,
  type SquadSlotId
} from '@game/services/squadProgression';
import {
  buildCombatLabRuntimeSquadLoadout,
  type CombatLabLoadoutCompanionSelection
} from '@director/combat-lab/experimentModel';

export interface BossSandboxCompanionSelection {
  readonly id: MiniShipId | '';
  readonly level: number;
}

export const BOSS_SANDBOX_FIRE_RATE_MAX =
  getMainShipUpgradeMaxLevel('fireRate');
export const BOSS_SANDBOX_SPEED_MAX =
  getMainShipUpgradeMaxLevel('speed');
export const BOSS_SANDBOX_DEFAULT_FIRE_RATE_LEVEL = 1;
export const BOSS_SANDBOX_DEFAULT_SPEED_LEVEL = 1;

export const BOSS_SANDBOX_DEFAULT_COMPANIONS: Readonly<
  Record<SquadSlotId, BossSandboxCompanionSelection>
> = {
  left: { id: '', level: 1 },
  right: { id: '', level: 1 }
};

export const clampBossSandboxLevel = (value: number, maximum: number) => (
  Math.max(0, Math.min(maximum, Math.floor(value)))
);

const clampCompanionLevel = (value: number) => (
  Math.max(1, Math.min(MINI_SHIP_MAX_LEVEL, Math.floor(value)))
);

export const useBossSandboxLoadout = ({
  invincible,
  seed
}: {
  invincible: boolean;
  seed: string;
}) => {
  const [mainShipId, setMainShipId] = useState<PlayerShipId>('researchhub');
  const [fireRateLevel, setFireRateLevelState] = useState(
    BOSS_SANDBOX_DEFAULT_FIRE_RATE_LEVEL
  );
  const [speedLevel, setSpeedLevelState] = useState(
    BOSS_SANDBOX_DEFAULT_SPEED_LEVEL
  );
  const [companions, setCompanions] = useState<
    Readonly<Record<SquadSlotId, BossSandboxCompanionSelection>>
  >(BOSS_SANDBOX_DEFAULT_COMPANIONS);

  const setFireRateLevel = useCallback((level: number) => {
    setFireRateLevelState(clampBossSandboxLevel(level, BOSS_SANDBOX_FIRE_RATE_MAX));
  }, []);

  const setSpeedLevel = useCallback((level: number) => {
    setSpeedLevelState(clampBossSandboxLevel(level, BOSS_SANDBOX_SPEED_MAX));
  }, []);

  const setCompanion = useCallback((
    slot: SquadSlotId,
    selection: BossSandboxCompanionSelection
  ) => {
    setCompanions((current) => {
      const otherSlot: SquadSlotId = slot === 'left' ? 'right' : 'left';
      const normalized = {
        id: selection.id,
        level: clampCompanionLevel(selection.level)
      };
      return {
        ...current,
        [slot]: normalized,
        ...(normalized.id && normalized.id === current[otherSlot].id
          ? { [otherSlot]: { ...current[otherSlot], id: '' as const } }
          : {})
      };
    });
  }, []);

  const companionSelections = useMemo<CombatLabLoadoutCompanionSelection[]>(
    () => (['left', 'right'] as const).flatMap((slot) => {
      const companion = companions[slot];
      return companion.id
        ? [{ slot, miniShipId: companion.id, level: companion.level }]
        : [];
    }),
    [companions]
  );

  const squadLoadout = useMemo(
    () => buildCombatLabRuntimeSquadLoadout({
      mainShipId,
      upgrades: {
        fireRate: fireRateLevel,
        speed: speedLevel,
        startingHearts: 0
      },
      companions: companionSelections
    }),
    [companionSelections, fireRateLevel, mainShipId, speedLevel]
  );

  const previewSettings = useMemo<GameEditorPreviewSettings>(() => ({
    gameSpeed: 1,
    invinciblePlayer: invincible,
    playerShipId: mainShipId,
    squadLoadout,
    seed,
    unlimitedBombs: true,
    shipAbilityNoCooldown: true,
    upgrades: {
      fireRate: fireRateLevel,
      speed: speedLevel,
      missile: 0
    }
  }), [fireRateLevel, invincible, mainShipId, seed, speedLevel, squadLoadout]);

  return {
    companions,
    fireRateLevel,
    mainShipId,
    previewSettings,
    setCompanion,
    setFireRateLevel,
    setMainShipId,
    setSpeedLevel,
    speedLevel
  } as const;
};
