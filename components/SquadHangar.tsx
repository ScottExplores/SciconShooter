import React, { useEffect, useMemo, useState } from 'react';
import {
  ASSETS,
  RSC_PURCHASE_SKUS,
  type PlayerShipPurchaseSkuId,
  type RscPurchaseSkuId
} from '../constants';
import type { RscBalanceSnapshot } from '../services/baseAccountWallet';
import { formatWholeRscBalance } from '../services/rscBalancePresentation';
import type {
  PlayerShipPurchaseStatusUpdate,
  WalletPurchaseStatusUpdate
} from './WalletRuntime';
import {
  isPlayerShipUnlocked,
  PLAYABLE_PLAYER_SHIP_IDS,
  PLAYER_SHIPS,
  type PlayerShipId,
  type PlayerShipUnlocks
} from '../services/playerShipService';
import {
  PLAYER_SHIP_MOTION,
  PLAYER_SHIP_SELECTION_FPS,
  preloadPlayerShipSelectionFrames
} from '../services/playerShipMotion';
import {
  getMainShipFireRateTier,
  getMainShipFireRateTierProgress,
  getMainShipUpgradeCost,
  getMainShipUpgradeMaxLevel,
  getMiniShipUpgradeCost,
  MAIN_SHIP_ABILITY_MAX_LEVEL,
  MAIN_SHIP_UPGRADE_MAX_LEVEL,
  MAIN_SHIP_UPGRADES,
  MINI_SHIP_BY_ID,
  MINI_SHIP_CATALOG,
  MINI_SHIP_MAX_LEVEL,
  preloadMiniShipTextures,
  SQUAD_SLOT_UNLOCK_COST,
  type MainShipUpgradeId,
  type MiniShipCatalogEntry,
  type MiniShipId,
  type SquadSlotId,
  type WeeklySquadState
} from '../services/squadProgression';
import {
  getShipAbilityDefinition,
  getShipAbilityUpgradeProfile
} from '../services/shipAbilityService';
import {
  getPlayerWeaponPreviewFrames,
  PLAYER_SHIP_WEAPON_PREVIEW_SPECS
} from '../services/playerWeaponPreview';
import { calculateSquadPowerRating } from '../services/squadPowerRating';
import { FIRE_RATE_TIER_COUNT } from '../services/weaponTierProgression';
import PixelActionButton from './PixelActionButton';
import PlayerShipAccessDialog, { type PlayerShipAccessId } from './PlayerShipAccessDialog';
import ShipWeaponPreviewDialog from './ShipWeaponPreviewDialog';
import { preloadDecodedImageUrls } from '../services/browserImagePreload';

type HangarPosition = 'main' | SquadSlotId;
type HangarMode = 'catalog' | 'upgrades';
const TOKEN_EXCHANGE_SKU_IDS = [
  'tokens-500',
  'tokens-2500',
  'tokens-5000'
] as const satisfies ReadonlyArray<RscPurchaseSkuId>;

interface SquadHangarProps {
  state: WeeklySquadState;
  mainShipId: PlayerShipId;
  mainShipName: string;
  shipUnlocks: PlayerShipUnlocks;
  walletConnected: boolean;
  rscBalance: RscBalanceSnapshot | null;
  rscBalanceStatus: 'idle' | 'loading' | 'ready' | 'error';
  walletPurchaseStatus: WalletPurchaseStatusUpdate;
  playerShipPurchaseStatus: PlayerShipPurchaseStatusUpdate;
  founderSandbox?: boolean;
  onSelectMainShip: (id: PlayerShipId) => void;
  onUnlockSlot: (slot: SquadSlotId) => void;
  onPurchaseWithRsc: (skuId: RscPurchaseSkuId) => void;
  onPurchasePlayerShip: (skuId: PlayerShipPurchaseSkuId) => void;
  onRefreshPlayerShipAccess: () => void;
  onOpenRscSwap: () => void;
  onPurchaseMini: (id: MiniShipId) => void;
  onUpgradeMini: (id: MiniShipId) => void;
  onDowngradeMini: (id: MiniShipId) => void;
  onEquipMini: (slot: SquadSlotId, id: MiniShipId | null) => void;
  onUpgradeMainShip: (id: MainShipUpgradeId) => void;
  onDowngradeMainShip: (id: MainShipUpgradeId) => void;
}

const UI_ROOT = '/game-art/generated/ui/scicon-simple-arcade-kit-v1';
const HANGAR_STARFIELD = '/game-art/generated/backgrounds/scicon-sparse-pixel-starfield-v1/scicon-sparse-pixel-starfield-twinkle.gif';
const MINI_COST_ICON = '/game-art/generated/rsc-coin-flip-v1/rsc-coin-pixel-front.png';
const MAIN_UPGRADE_SPRITE: Readonly<Record<MainShipUpgradeId, string>> = Object.freeze({
  fireRate: '/game-art/powerups/rapid-fire.png',
  speed: '/game-art/powerups/speed.png',
  // Overridden per hull below; this is the fallback only.
  ability: '/game-art/powerups/research-beam.png',
  startingHearts: '/game-art/powerups/extra-life.png'
});

/**
 * Signature Move is the one track whose art depends on which hull is selected,
 * so it shows that hull's actual move rather than a shared placeholder. Every
 * other track means the same thing on every ship.
 */
const getMainUpgradeSprite = (
  upgradeId: MainShipUpgradeId,
  shipId: PlayerShipId,
  abilityLevel: number
) => (
  upgradeId === 'ability'
    ? shipId === 'researchhub'
      ? getShipAbilityUpgradeProfile(abilityLevel).projectileIconUrl
      : getShipAbilityDefinition(shipId).iconUrl
    : MAIN_UPGRADE_SPRITE[upgradeId]
);
const PLAYER_SHIP_ORDER: PlayerShipId[] = [...PLAYABLE_PLAYER_SHIP_IDS];
const MINI_ANIMATION_SEQUENCE = [0, 1, 2, 1] as const;
const PLAYER_SELECTION_FRAME_COUNT = Math.max(
  ...Object.values(PLAYER_SHIP_MOTION).map((motion) => motion.selectionIdleFrames.length)
);
const TRACE_LABEL_FRAME_COUNT = 24;
const TRACE_LABEL_FRAME_DELAY_MS = 45;

const formatMainUpgradeLevel = (id: MainShipUpgradeId, level: number) => (
  id === 'fireRate'
    ? `Tier ${getMainShipFireRateTier(level)} - ${getMainShipFireRateTierProgress(level)}/${MAIN_SHIP_UPGRADE_MAX_LEVEL}`
    : `Level ${level}`
);
const SQUAD_CONNECTOR_POSITION: Record<HangarPosition, string> = {
  main: 'left-[9%] h-[48%] w-[23%] border-b-2 border-l-2 sm:left-[8%] sm:w-[19%]',
  left: 'left-[9%] h-[72%] w-[14%] border-b-2 border-l-2 sm:left-[8%]',
  right: 'right-[9%] h-[72%] w-[14%] border-b-2 border-r-2 sm:right-[8%]'
};

const selectorFrames = (size: 'ship' | 'mini', color: 'lime' | 'gold') => (
  Array.from({ length: 8 }, (_, index) => (
    `${UI_ROOT}/selectors/diamond/${size}/${color}/frames/diamond-selector-${size}-${color}-${String(index + 1).padStart(2, '0')}.png`
  ))
);

const traceFrames = Array.from({ length: TRACE_LABEL_FRAME_COUNT }, (_, index) => (
  `${UI_ROOT}/trace-boxes/label/cyan/frames/trace-box-label-cyan-${String(index + 1).padStart(2, '0')}.png`
));

const useAnimationFrame = (frameCount: number, delay = 120) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % frameCount);
    }, delay);
    return () => window.clearInterval(timer);
  }, [delay, frameCount]);

  return frame;
};

const AnimatedSelector = ({
  size,
  color,
  className = ''
}: {
  size: 'ship' | 'mini';
  color: 'lime' | 'gold';
  className?: string;
}) => {
  const frames = useMemo(() => selectorFrames(size, color), [color, size]);
  const frame = useAnimationFrame(frames.length);
  return <img src={frames[frame]} alt="" draggable={false} className={`pointer-events-none select-none object-contain ${className}`} />;
};

const AnimatedTraceLabel = ({ children }: { children: React.ReactNode }) => {
  const frame = useAnimationFrame(traceFrames.length, TRACE_LABEL_FRAME_DELAY_MS);
  return (
    <div className="relative mx-auto h-14 w-full max-w-[24rem]">
      <img src={traceFrames[frame]} alt="" draggable={false} className="absolute inset-0 h-full w-full object-fill" />
      <div className="relative flex h-full items-center justify-center px-9 pb-1 text-center text-sm font-black uppercase tracking-[0.08em] text-cyan-100 sm:text-base">
        {children}
      </div>
    </div>
  );
};

const AnimatedMiniShip = ({
  entry,
  className = ''
}: {
  entry: MiniShipCatalogEntry;
  className?: string;
}) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let sequenceIndex = 0;
    const timer = window.setInterval(() => {
      sequenceIndex = (sequenceIndex + 1) % MINI_ANIMATION_SEQUENCE.length;
      setFrame(MINI_ANIMATION_SEQUENCE[sequenceIndex]);
    }, 210);
    return () => window.clearInterval(timer);
  }, [entry.id]);

  return <img src={entry.frames[frame]} alt="" draggable={false} className={`pointer-events-none object-contain ${className}`} />;
};

const AnimatedPlayerShip = ({
  shipId,
  frame,
  className = ''
}: {
  shipId: PlayerShipId;
  frame: number;
  className?: string;
}) => {
  const frames = PLAYER_SHIP_MOTION[shipId].selectionIdleFrames;
  return (
    <img
      src={frames[frame % frames.length]}
      alt=""
      draggable={false}
      data-player-ship={shipId}
      data-selection-frame={frame % frames.length}
      className={`pointer-events-none object-contain ${className}`}
    />
  );
};

const LevelPips = ({ level, max = 7 }: { level: number; max?: number }) => (
  <div className="flex items-center gap-1" aria-label={`Level ${level} of ${max}`}>
    {Array.from({ length: max }, (_, index) => (
      <span
        key={index}
        className={`h-1.5 flex-1 skew-x-[-18deg] ${index < level ? 'bg-yellow-200 shadow-[0_0_7px_rgba(250,204,21,0.7)]' : 'bg-slate-700/80'}`}
      />
    ))}
  </div>
);

const CurrencyRail = ({
  icon,
  value,
  label,
  tone,
  onOptions,
  optionsLabel
}: {
  icon: string;
  value: number | string;
  label: string;
  tone: 'gold' | 'blue';
  onOptions: () => void;
  optionsLabel: string;
}) => (
  <div className={`grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2rem] items-center border px-1.5 py-1 ${tone === 'gold' ? 'border-yellow-200/35 bg-yellow-300/10' : 'border-cyan-200/35 bg-cyan-300/10'}`}>
    <img src={icon} alt="" className="h-8 w-8 object-contain" />
    <div className="min-w-0 px-1 text-center">
      <p className="truncate text-base font-black leading-none text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="truncate text-[0.5rem] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
    </div>
    <button type="button" onClick={onOptions} aria-label={optionsLabel} className={`flex h-7 w-7 items-center justify-center border text-xl font-black ${tone === 'gold' ? 'border-yellow-200/45 bg-yellow-300 text-slate-950' : 'border-cyan-200/45 bg-cyan-300 text-slate-950'}`}>
      <span aria-hidden="true">+</span>
    </button>
  </div>
);

const SquadHangar: React.FC<SquadHangarProps> = ({
  state,
  mainShipId,
  mainShipName,
  shipUnlocks,
  walletConnected,
  rscBalance,
  rscBalanceStatus,
  walletPurchaseStatus,
  playerShipPurchaseStatus,
  founderSandbox = false,
  onSelectMainShip,
  onUnlockSlot,
  onPurchaseWithRsc,
  onPurchasePlayerShip,
  onRefreshPlayerShipAccess,
  onOpenRscSwap,
  onPurchaseMini,
  onUpgradeMini,
  onDowngradeMini,
  onEquipMini,
  onUpgradeMainShip,
  onDowngradeMainShip
}) => {
  const [activePosition, setActivePosition] = useState<HangarPosition>('main');
  const [mode, setMode] = useState<HangarMode>('catalog');
  const [selectedMiniId, setSelectedMiniId] = useState<MiniShipId | null>(null);
  const [showTokenExchange, setShowTokenExchange] = useState(false);
  const [weaponPreviewShipId, setWeaponPreviewShipId] = useState<PlayerShipId | null>(null);
  const [lockedPlayerShipId, setLockedPlayerShipId] = useState<PlayerShipAccessId | null>(null);
  const [upgradeFeedback, setUpgradeFeedback] = useState<{ target: string; label: string; nonce: number } | null>(null);
  const playerSelectionFrame = useAnimationFrame(
    PLAYER_SELECTION_FRAME_COUNT,
    1000 / PLAYER_SHIP_SELECTION_FPS
  );

  useEffect(() => {
    preloadMiniShipTextures();
    preloadPlayerShipSelectionFrames();
    const assets = [
      ...selectorFrames('ship', 'lime'),
      ...selectorFrames('ship', 'gold'),
      ...selectorFrames('mini', 'lime'),
      ...selectorFrames('mini', 'gold'),
      ...traceFrames,
      ...Object.values(MAIN_UPGRADE_SPRITE),
      // Preload every hull's signature-move icon, not just the fallback.
      ...PLAYER_SHIP_ORDER.map((id) => getShipAbilityDefinition(id).iconUrl),
      ...PLAYER_SHIP_ORDER.flatMap((id) => getPlayerWeaponPreviewFrames(id)),
      ...Array.from(
        { length: MAIN_SHIP_ABILITY_MAX_LEVEL + 1 },
        (_, level) => getShipAbilityUpgradeProfile(level).projectileIconUrl
      )
    ];
    void preloadDecodedImageUrls(assets).catch(() => undefined);
  }, []);

  useEffect(() => {
    setMode('catalog');
  }, [activePosition]);

  useEffect(() => {
    setSelectedMiniId(activePosition === 'main' ? null : state.equipped[activePosition]);
  }, [activePosition, state.equipped.left, state.equipped.right]);

  const activeMiniId = activePosition === 'main' ? null : (selectedMiniId || state.equipped[activePosition]);
  const activeMini = activeMiniId ? MINI_SHIP_BY_ID[activeMiniId] : null;
  const activeMiniLevel = activeMiniId ? state.ownedMiniShips[activeMiniId] || 0 : 0;
  const activeMiniOwned = activeMiniLevel > 0;
  const activeMiniEquipped = activePosition !== 'main'
    && Boolean(activeMiniId)
    && state.equipped[activePosition] === activeMiniId;
  const activeMainShipUpgrades = state.shipUpgrades[mainShipId];
  const equippedPowerSupports = (['left', 'right'] as const).flatMap((slot) => {
    const id = state.equipped[slot];
    if (!state.unlockedSlots[slot] || !id) return [];
    return [{ id, level: state.ownedMiniShips[id] ?? 1 }];
  });
  const power = calculateSquadPowerRating(activeMainShipUpgrades, equippedPowerSupports);
  const tier = getMainShipFireRateTier(activeMainShipUpgrades.fireRate);
  const fireRateTierProgress = getMainShipFireRateTierProgress(activeMainShipUpgrades.fireRate);
  const activeTier = activePosition === 'main'
    ? tier
    : Math.min(3, Math.max(1, Math.ceil(activeMiniLevel / 2)));
  const canAffordMainUpgrade = (shipId: PlayerShipId, upgradeId: MainShipUpgradeId) => {
    const shipUpgrades = state.shipUpgrades[shipId];
    const level = shipUpgrades[upgradeId];
    const maxLevel = getMainShipUpgradeMaxLevel(upgradeId);
    const cost = getMainShipUpgradeCost(upgradeId, level);
    return level < maxLevel && (founderSandbox || (Number.isFinite(cost) && state.coins >= cost));
  };
  const activeMainUpgradeReady = MAIN_SHIP_UPGRADES.some((upgrade) => (
    canAffordMainUpgrade(mainShipId, upgrade.id)
  ));
  const activeMiniUpgradeCost = activeMini && activeMiniOwned && activeMiniLevel < MINI_SHIP_MAX_LEVEL
    ? getMiniShipUpgradeCost(activeMini.id, activeMiniLevel)
    : Number.POSITIVE_INFINITY;
  const activeMiniUpgradeReady = Boolean(
    activeMini
    && activeMiniOwned
    && activeMiniLevel < MINI_SHIP_MAX_LEVEL
    && (founderSandbox || state.coins >= activeMiniUpgradeCost)
  );
  const activeMiniUnlockReady = Boolean(
    activeMini
    && !activeMiniOwned
    && (founderSandbox || state.coins >= activeMini.purchaseCost)
  );

  const activeName = activePosition === 'main'
    ? mainShipName.replace(/ ship$/i, '')
    : activeMini?.name || `${activePosition} wing`;
  const isTokenExchangePurchase = Boolean(
    walletPurchaseStatus.skuId
    && (TOKEN_EXCHANGE_SKU_IDS as ReadonlyArray<RscPurchaseSkuId>)
      .includes(walletPurchaseStatus.skuId)
  );

  const isRightSupportPurchase = walletPurchaseStatus.skuId === 'right-support'
    && walletPurchaseStatus.status !== 'idle';
  const rightSupportMessage = walletPurchaseStatus.status === 'error'
    ? walletPurchaseStatus.error || 'The right support purchase could not be completed. Try again.'
    : walletPurchaseStatus.status === 'confirmed'
      ? 'Right support unlocked and saved to this wallet profile.'
      : walletPurchaseStatus.status === 'connecting'
        ? 'Connecting your Base wallet for the right support purchase...'
        : walletPurchaseStatus.status === 'authorizing'
          ? 'Preparing the secure right support quote...'
          : walletPurchaseStatus.status === 'confirming'
            ? 'Confirm the 10 RSC right support transfer in your wallet.'
            : 'Verifying the right support payment on Base...';

  const choosePosition = (position: HangarPosition) => {
    if (position !== 'main' && !state.unlockedSlots[position]) {
      if (position === 'right' && !founderSandbox) {
        onPurchaseWithRsc('right-support');
      } else {
        onUnlockSlot(position);
      }
      return;
    }
    if (position === activePosition && mode === 'upgrades') {
      setMode('catalog');
      return;
    }
    setActivePosition(position);
  };

  const showUpgradeFeedback = (target: string, label: string) => {
    setUpgradeFeedback((current) => ({ target, label, nonce: (current?.nonce ?? 0) + 1 }));
  };

  const renderSquadMini = (slot: SquadSlotId) => {
    const unlocked = state.unlockedSlots[slot];
    const unlockCost = SQUAD_SLOT_UNLOCK_COST[slot];
    const miniId = state.equipped[slot];
    const entry = miniId ? MINI_SHIP_BY_ID[miniId] : null;
    const active = activePosition === slot;
    const purchaseBusy = walletPurchaseStatus.status !== 'idle'
      && walletPurchaseStatus.status !== 'confirmed'
      && walletPurchaseStatus.status !== 'error';
    const rightPurchaseStatus = slot === 'right' && walletPurchaseStatus.skuId === 'right-support'
      ? walletPurchaseStatus.status
      : 'idle';
    const rightPurchaseStage = rightPurchaseStatus === 'connecting'
      ? 'CONNECTING'
      : rightPurchaseStatus === 'authorizing'
        ? 'AUTHORIZE'
        : rightPurchaseStatus === 'confirming'
          ? 'CONFIRM RSC'
          : rightPurchaseStatus === 'settling'
            ? 'VERIFYING'
            : rightPurchaseStatus === 'error'
              ? 'TRY AGAIN'
              : 'LOCK';
    const rightPurchaseBusy = slot === 'right'
      && walletPurchaseStatus.skuId === 'right-support'
      && purchaseBusy;
    const rightSupportCostRaw = BigInt(RSC_PURCHASE_SKUS['right-support'].rscAmountRaw);
    const hasRightSupportRsc = Boolean(
      rscBalance && rscBalance.raw >= rightSupportCostRaw
    );
    const slotUnlockReady = !unlocked && (
      founderSandbox
      || (slot === 'right' ? hasRightSupportRsc : state.coins >= unlockCost)
    );
    const unlockLabel = slot === 'right' && !founderSandbox ? '10 RSC' : `${unlockCost} Tokens`;

    return (
      <button
        type="button"
        onClick={() => choosePosition(slot)}
        disabled={!unlocked && slot === 'right' && purchaseBusy}
        data-onboarding-target={slot === 'left' ? 'hangar-wings' : undefined}
        data-upgrade-ready={slotUnlockReady ? 'true' : 'false'}
        className="sci-upgrade-ready-frame relative flex aspect-square w-[5.25rem] shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-55 sm:w-[6.25rem]"
        aria-label={unlocked
          ? `${slot} wing${entry ? `, ${entry.name}` : ', empty'}`
          : rightPurchaseBusy
            ? `${rightPurchaseStage.toLowerCase()} for right wing purchase`
            : `Unlock ${slot} wing for ${unlockLabel}`}
      >
        <span className={`absolute inset-[13%] ${active ? 'sci-hangar-active-light' : ''}`}>
          {active ? <AnimatedSelector size="ship" color="lime" className="absolute inset-0 h-full w-full scale-[1.8]" /> : <span className="absolute inset-0 rotate-45 border border-cyan-300/35 bg-cyan-300/5" />}
        </span>
        {!unlocked ? (
          <span className="relative z-10 flex min-h-14 min-w-16 flex-col items-center justify-center border border-slate-400/55 bg-slate-800/90 px-2 text-slate-200" aria-hidden="true">
            <span className={`${rightPurchaseBusy ? 'text-[0.58rem]' : 'text-sm'} font-black`}>{slot === 'right' ? rightPurchaseStage : 'LOCK'}</span>
            <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[0.5rem] font-black uppercase text-yellow-200">
              {slot === 'right' && !founderSandbox ? <img src={ASSETS.REAL_RSC_ICON} alt="" className="h-4 w-4 object-contain" /> : null}
              {unlockLabel}
            </span>
          </span>
        ) : entry ? (
          <AnimatedMiniShip entry={entry} className="relative z-10 h-[62%] w-[62%] object-contain drop-shadow-[0_0_10px_rgba(103,232,249,0.6)]" />
        ) : (
          <span className="relative z-10 text-2xl font-black text-cyan-200/70" aria-hidden="true">+</span>
        )}
      </button>
    );
  };

  const renderMainCatalog = () => (
    <div className="grid grid-cols-4 gap-2 sm:gap-3" data-onboarding-target="hangar-ships">
      {PLAYER_SHIP_ORDER.map((shipId) => {
        const ship = PLAYER_SHIPS[shipId];
        const shipUpgrades = state.shipUpgrades[shipId];
        const shipTier = getMainShipFireRateTier(shipUpgrades.fireRate);
        const unlocked = isPlayerShipUnlocked(shipId, shipUnlocks);
        const selected = mainShipId === shipId;
        return (
          <button
            key={shipId}
            type="button"
            onClick={() => {
              if (!unlocked) {
                if (shipId !== 'researchhub') setLockedPlayerShipId(shipId);
                return;
              }
              if (selected) {
                setMode('upgrades');
                return;
              }
              setWeaponPreviewShipId(shipId);
            }}
            aria-label={!unlocked
              ? `View ${ship.name} unlock requirements`
              : selected
                ? `Open ${ship.name} upgrades`
                : `Preview ${ship.name} primary weapon before equipping`}
            className={`relative aspect-[0.78] min-w-0 overflow-hidden border bg-slate-950/72 p-1.5 transition hover:border-cyan-200/70 ${selected ? 'border-yellow-200/70' : 'border-cyan-200/22'} ${unlocked ? '' : 'grayscale'}`}
          >
            {selected ? <AnimatedSelector size="ship" color="gold" className="absolute inset-0 h-full w-full scale-[1.17]" /> : null}
            <span className="absolute left-1.5 top-1 text-[0.52rem] font-black uppercase text-white/85">T{shipTier}</span>
            {!unlocked ? (
              <span className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/66 px-1 text-center text-[0.54rem] font-black uppercase text-slate-200">
                <span>Locked</span>
                <span className="mt-1 text-[0.46rem] text-yellow-200">View access</span>
              </span>
            ) : null}
            <AnimatedPlayerShip shipId={shipId} frame={playerSelectionFrame} className="relative z-10 mx-auto mt-4 h-[52%] w-[86%] drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
            <span className={`relative z-10 mt-1 block truncate text-[0.52rem] font-black uppercase ${selected ? 'text-yellow-200' : 'text-slate-300'}`}>{ship.name.replace(/ ship$/i, '')}</span>
            <div className="relative z-10 mt-1"><LevelPips level={shipTier} max={FIRE_RATE_TIER_COUNT} /></div>
          </button>
        );
      })}
    </div>
  );

  const renderMiniCatalog = () => {
    if (activePosition === 'main') return null;
    return (
      <div className="grid grid-cols-4 gap-2 pr-1 sm:max-h-[24rem] sm:gap-3 sm:overflow-y-auto custom-scrollbar">
        {MINI_SHIP_CATALOG.map((entry) => {
          const level = state.ownedMiniShips[entry.id] || 0;
          const owned = level > 0;
          const equippedHere = state.equipped[activePosition] === entry.id;
          const selectedHere = selectedMiniId === entry.id;
          const atMax = level >= MINI_SHIP_MAX_LEVEL;
          const nextCost = atMax ? 0 : owned ? getMiniShipUpgradeCost(entry.id, level) : entry.purchaseCost;
          const costLabel = founderSandbox ? 'TEST' : atMax ? 'MAX' : nextCost === 0 ? 'FREE' : nextCost.toLocaleString();
          const actionLabel = atMax
            ? `Select ${entry.name}, level ${level} of ${MINI_SHIP_MAX_LEVEL}, maximum level`
            : `Select ${entry.name}, level ${level} of ${MINI_SHIP_MAX_LEVEL}, ${owned ? 'next upgrade' : 'unlock'} costs ${nextCost} Tokens`;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                if (selectedHere) {
                  setMode('upgrades');
                  return;
                }
                setSelectedMiniId(entry.id);
              }}
              aria-label={actionLabel}
              className={`relative aspect-[0.78] min-w-0 overflow-hidden border bg-slate-950/72 p-1.5 transition hover:border-cyan-200/70 ${equippedHere ? 'border-yellow-200/75' : selectedHere ? 'border-lime-300/75' : 'border-cyan-200/22'}`}
            >
              {selectedHere ? <AnimatedSelector size="mini" color={equippedHere ? 'gold' : 'lime'} className="absolute inset-0 h-full w-full scale-[1.17]" /> : null}
              <span className="absolute left-1.5 top-1 text-[0.52rem] font-black uppercase text-white/85">{owned ? `${level}/${MINI_SHIP_MAX_LEVEL}` : '0/5'}</span>
              <span className="pointer-events-none absolute right-1 top-1 z-30 flex min-h-4 items-center gap-0.5 border border-yellow-200/60 bg-slate-950/95 px-1 py-0.5 text-[0.55rem] font-black leading-none tabular-nums text-yellow-100 shadow-[0_0_8px_rgba(250,204,21,0.2)]" aria-hidden="true">
                {!atMax ? <img src={MINI_COST_ICON} alt="" className="h-3.5 w-3.5 object-contain [image-rendering:pixelated]" /> : null}
                <span>{costLabel}</span>
              </span>
              <AnimatedMiniShip entry={entry} className={`relative z-10 mx-auto mt-4 h-[50%] w-[86%] ${owned ? '' : 'opacity-45 grayscale'}`} />
              <span className={`relative z-10 mt-1 block truncate text-[0.48rem] font-black uppercase sm:text-[0.52rem] ${equippedHere ? 'text-yellow-200' : selectedHere ? 'text-lime-200' : 'text-slate-300'}`}>{entry.name}</span>
              <div className="relative z-10 mt-1"><LevelPips level={level} max={MINI_SHIP_MAX_LEVEL} /></div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="relative mx-auto min-h-full w-full max-w-3xl overflow-hidden border border-cyan-300/20 bg-[#020817] text-white shadow-[0_0_32px_rgba(8,145,178,0.18)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(34,211,238,0.15),transparent_30%),radial-gradient(circle_at_12%_44%,rgba(16,185,129,0.08),transparent_22%),linear-gradient(rgba(103,232,249,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.025)_1px,transparent_1px)] bg-[size:auto,auto,28px_28px,28px_28px]" />

      <header className="relative z-10 border-b border-cyan-200/18 bg-slate-950/88 p-2">
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <CurrencyRail
            icon="/game-art/tokens/rsc-coin-pixel.png"
            value={state.coins}
            label="Tokens"
            tone="gold"
            onOptions={() => setShowTokenExchange(true)}
            optionsLabel="Buy Tokens with Research Coin"
          />
          <CurrencyRail
            icon={ASSETS.REAL_RSC_ICON}
            value={rscBalanceStatus === 'loading'
              ? '...'
              : rscBalance
                ? formatWholeRscBalance(rscBalance)
                : walletConnected
                  ? '--'
                  : 'Connect'}
            label="Research Coin"
            tone="blue"
            onOptions={onOpenRscSwap}
            optionsLabel="Open Aerodrome to get Research Coin"
          />
        </div>
        {showTokenExchange ? (
          <section className="mt-2 border border-cyan-200/30 bg-[#07152a]/98 p-2 shadow-[0_0_20px_rgba(34,211,238,0.16)]" aria-label="Token exchange">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-cyan-100">Token Exchange</p>
                <p className="mt-0.5 text-[0.55rem] text-slate-400">Exchange Research Coin for permanent Tokens at 500 Tokens per RSC.</p>
              </div>
              <button type="button" onClick={() => setShowTokenExchange(false)} className="h-7 w-7 border border-cyan-200/30 text-sm font-black text-cyan-100" aria-label="Close Token exchange">X</button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {TOKEN_EXCHANGE_SKU_IDS.map((skuId) => {
                const sku = RSC_PURCHASE_SKUS[skuId];
                const busy = walletPurchaseStatus.status !== 'idle'
                  && walletPurchaseStatus.status !== 'confirmed'
                  && walletPurchaseStatus.status !== 'error';
                return (
                  <PixelActionButton
                    key={skuId}
                    type="button"
                    tone="cyan"
                    disabled={busy || !sku.enabled}
                    onClick={() => onPurchaseWithRsc(skuId)}
                    className="min-h-12 px-1 text-[0.55rem] font-black uppercase"
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span>{sku.tokenReward.toLocaleString()} Tokens</span>
                      {sku.enabled ? (
                        <span className="mt-1 flex items-center gap-1 text-emerald-200"><img src={ASSETS.REAL_RSC_ICON} alt="" className="h-4 w-4 object-contain" />{sku.rscAmount} RSC</span>
                      ) : (
                        <span className="mt-1 text-yellow-200">Coming soon</span>
                      )}
                    </span>
                  </PixelActionButton>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[0.52rem] font-bold uppercase text-cyan-100/70">Every pack grants 500 Tokens per 1 RSC after its Base receipt is verified.</p>
            {isTokenExchangePurchase && walletPurchaseStatus.status !== 'idle' ? (
              <p className={`mt-2 text-center text-[0.56rem] font-bold ${walletPurchaseStatus.status === 'error' ? 'text-red-200' : walletPurchaseStatus.status === 'confirmed' ? 'text-emerald-200' : 'text-cyan-100'}`} role="status">
                {walletPurchaseStatus.status === 'error'
                  ? walletPurchaseStatus.error
                  : walletPurchaseStatus.status === 'confirmed'
                    ? 'Purchase confirmed. Your wallet profile is updated.'
                    : walletPurchaseStatus.status === 'connecting'
                      ? 'Connecting wallet...'
                      : walletPurchaseStatus.status === 'authorizing'
                        ? 'Preparing secure quote...'
                        : walletPurchaseStatus.status === 'confirming'
                          ? 'Confirm the RSC transfer...'
                          : 'Verifying purchase...'}
              </p>
            ) : null}
          </section>
        ) : null}
        {founderSandbox ? (
          <p className="mt-2 border border-cyan-300/35 bg-cyan-300/10 px-2 py-1 text-center text-[0.55rem] font-black uppercase tracking-[0.12em] text-cyan-100">
            Founder test loadout - changes are temporary
          </p>
        ) : null}
      </header>

      <main className="relative z-10">
        <p className="sr-only" aria-live="polite">{upgradeFeedback?.label ?? ''}</p>
        <section className="relative overflow-hidden border-b border-cyan-200/18 bg-[#03081c] px-3 pb-3 pt-3 sm:px-6 sm:pb-4">
          <div className="sci-hangar-starfield pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="sci-hangar-starfield-track">
              <img src={HANGAR_STARFIELD} alt="" draggable={false} />
              <img src={HANGAR_STARFIELD} alt="" draggable={false} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(14,165,233,0.1),transparent_38%),linear-gradient(180deg,rgba(3,8,28,0.18),rgba(3,8,28,0.58))]" />
          <AnimatedTraceLabel>{activeName}</AnimatedTraceLabel>

          <div className="relative mx-auto mt-1 h-[12.75rem] w-full max-w-[26rem] sm:h-[16rem]">
            <div
              className={`pointer-events-none absolute top-[-0.25rem] border-cyan-300/65 drop-shadow-[0_0_7px_rgba(34,211,238,0.55)] transition-all duration-300 ${SQUAD_CONNECTOR_POSITION[activePosition]}`}
              data-connector-target={activePosition}
              aria-hidden="true"
            />
            <div className="absolute bottom-0 left-[8%] sm:left-[10%]">
              {renderSquadMini('left')}
            </div>
            <div className="absolute left-1/2 top-0 -translate-x-1/2">
              <button
                type="button"
                onClick={() => choosePosition('main')}
                className="relative flex aspect-square w-[9.5rem] shrink-0 items-center justify-center sm:w-[12rem]"
                aria-label={`${mainShipName}, main squad ship`}
              >
                <span className={`absolute inset-[14%] ${activePosition === 'main' ? 'sci-hangar-active-light' : ''}`}>
                  {activePosition === 'main' ? <AnimatedSelector size="ship" color="lime" className="absolute inset-0 h-full w-full scale-[1.8]" /> : <span className="absolute inset-0 rotate-45 border border-cyan-300/35 bg-cyan-300/5" />}
                </span>
                <AnimatedPlayerShip shipId={mainShipId} frame={playerSelectionFrame} className="relative z-10 h-[58%] w-[58%] drop-shadow-[0_0_16px_rgba(34,211,238,0.6)]" />
              </button>
            </div>
            <div className="absolute bottom-0 right-[8%] sm:right-[10%]">
              {renderSquadMini('right')}
            </div>
          </div>

          {isRightSupportPurchase ? (
            <p
              className={`relative mx-auto mt-1 max-w-[24rem] border px-2 py-1.5 text-center text-[0.58rem] font-bold ${walletPurchaseStatus.status === 'error' ? 'border-red-300/35 bg-red-950/70 text-red-100' : walletPurchaseStatus.status === 'confirmed' ? 'border-emerald-300/35 bg-emerald-950/65 text-emerald-100' : 'border-cyan-300/30 bg-slate-950/75 text-cyan-100'}`}
              role="status"
            >
              {rightSupportMessage}
            </p>
          ) : null}

        </section>

        <section className="border-b border-violet-200/18 bg-[#24234d]/95">
          <div className="flex items-center justify-between gap-3 border-b border-violet-100/16 bg-[#171834] px-3 py-2 sm:px-5">
            <p className="min-w-0 truncate text-sm font-black uppercase text-white">
              {activePosition === 'main' ? 'Starship' : `${activePosition} wing`}: <span className="text-yellow-200">{activeName}</span>
            </p>
            <p className="shrink-0 text-sm font-black uppercase text-white">Power <span className="text-yellow-200">{power}</span></p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase text-white">Tier {activeTier}</p>
              <div className="mt-1 max-w-[13rem]"><LevelPips level={activePosition === 'main' ? fireRateTierProgress : activeMiniLevel} max={activePosition === 'main' ? MAIN_SHIP_UPGRADE_MAX_LEVEL : MINI_SHIP_MAX_LEVEL} /></div>
              <p className="mt-1 text-[0.58rem] font-bold uppercase text-cyan-100/70">
                {walletConnected
                  ? 'Saved on this device · onchain items linked'
                  : 'Saved on this device · connect for minted/onchain items'}
              </p>
            </div>
            {activePosition === 'main' ? (
              <PixelActionButton
                data-onboarding-target="hangar-upgrades"
                onClick={() => setMode('upgrades')}
                tone="gold"
                ready={activeMainUpgradeReady}
                className="min-h-11 min-w-[7rem] px-4 text-xs font-black uppercase"
              >
                Upgrade
              </PixelActionButton>
            ) : activeMini && activeMiniId ? activeMiniOwned ? (
              <div className="grid grid-cols-2 gap-2">
                <PixelActionButton
                  onClick={() => onEquipMini(activePosition, activeMiniId)}
                  disabled={activeMiniEquipped}
                  tone="cyan"
                  aria-label={activeMiniEquipped ? `${activeMini.name} is equipped` : `Equip ${activeMini.name}`}
                  className="min-h-11 min-w-[5rem] px-3 text-[0.65rem] font-black uppercase"
                >
                  {activeMiniEquipped ? 'Equipped' : 'Equip'}
                </PixelActionButton>
                <PixelActionButton
                  onClick={() => setMode('upgrades')}
                  tone="gold"
                  ready={activeMiniUpgradeReady}
                  aria-label={`Open ${activeMini.name} upgrades`}
                  className="min-h-11 min-w-[5rem] px-3 text-[0.65rem] font-black uppercase"
                >
                  Upgrade
                </PixelActionButton>
              </div>
            ) : (
              <PixelActionButton
                onClick={() => onPurchaseMini(activeMiniId)}
                disabled={!founderSandbox && state.coins < activeMini.purchaseCost}
                tone="gold"
                ready={activeMiniUnlockReady}
                aria-label={activeMini.purchaseCost === 0 ? `Unlock ${activeMini.name} for free` : `Unlock ${activeMini.name} for ${activeMini.purchaseCost} Tokens`}
                className="min-h-11 min-w-[7.5rem] px-3 text-[0.65rem] font-black uppercase"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <span>Unlock</span>
                  {activeMini.purchaseCost > 0 ? <img src={MINI_COST_ICON} alt="" className="h-5 w-5 object-contain [image-rendering:pixelated]" /> : null}
                  <span>{activeMini.purchaseCost === 0 ? 'Free' : activeMini.purchaseCost.toLocaleString()}</span>
                </span>
              </PixelActionButton>
            ) : (
              <span className="text-[0.6rem] font-black uppercase text-slate-500">Select a mini ship</span>
            )}
          </div>
        </section>

        <section className="bg-[#080f2c] px-3 pb-4 pt-3 sm:px-5">
          {mode === 'upgrades' ? (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                data-onboarding-target="hangar-fleet"
                onClick={() => setMode('catalog')}
                className="min-h-9 border border-cyan-200/30 bg-cyan-300/8 px-3 text-[0.62rem] font-black uppercase text-cyan-100"
              >
                Fleet
              </button>
            </div>
          ) : null}
          {/* Patterns belong to the selected hull, and Overdrive amplifies them
              without replacing that ship's primary-weapon identity. */}
          <div className="sci-weapon-spec-row">
            <p className="sci-weapon-spec">
              Weapon: {PLAYER_SHIP_WEAPON_PREVIEW_SPECS[mainShipId]}
            </p>
            <PixelActionButton
              type="button"
              tone="cyan"
              onClick={() => setWeaponPreviewShipId(mainShipId)}
              aria-label={`Preview ${PLAYER_SHIPS[mainShipId].name} primary weapon`}
              className="min-h-10 shrink-0 px-2 text-[0.58rem] font-black uppercase"
            >
              Preview fire
            </PixelActionButton>
          </div>

          {mode === 'catalog' ? (
            <>
              {activePosition === 'main' ? renderMainCatalog() : renderMiniCatalog()}
              <p className="mt-3 text-center text-[0.55rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                {activePosition === 'main'
                  ? 'Tap a new ship to preview it · Tap the selected ship for upgrades'
                  : 'Tap the selected mini ship again to view details'}
              </p>
            </>
          ) : activePosition === 'main' ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {MAIN_SHIP_UPGRADES.map((upgrade) => {
                const level = activeMainShipUpgrades[upgrade.id];
                const maxLevel = getMainShipUpgradeMaxLevel(upgrade.id);
                const cost = getMainShipUpgradeCost(upgrade.id, level);
                const atMax = level >= maxLevel;
                const displayedProgress = upgrade.id === 'fireRate'
                  ? getMainShipFireRateTierProgress(level)
                  : level;
                return (
                  <article key={upgrade.id} className="relative overflow-hidden border border-cyan-200/22 bg-slate-950/65 p-3">
                    {upgradeFeedback?.target === `main:${upgrade.id}` ? (
                      <span key={upgradeFeedback.nonce} className="sci-hangar-upgrade-pulse" aria-hidden="true">
                        {upgradeFeedback.label}
                      </span>
                    ) : null}
                    <div className="flex items-center gap-2.5">
                      <img
                        src={getMainUpgradeSprite(upgrade.id, mainShipId, level)}
                        alt=""
                        className="h-12 w-12 shrink-0 object-contain drop-shadow-[0_0_8px_rgba(34,211,238,0.42)] [image-rendering:pixelated]"
                      />
                      <div className="min-w-0">
                        <h3 className="text-xs font-black uppercase text-white">
                          {upgrade.name}{upgrade.id === 'fireRate' ? ` - Tier ${getMainShipFireRateTier(level)}` : ''}
                        </h3>
                        <p className="mt-1 min-h-10 text-[0.62rem] leading-relaxed text-slate-400">{upgrade.description}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <LevelPips
                        level={displayedProgress}
                        max={upgrade.id === 'fireRate' ? MAIN_SHIP_UPGRADE_MAX_LEVEL : maxLevel}
                      />
                    </div>
                    {founderSandbox ? (
                      <div className="mt-3 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] gap-1.5">
                        <button
                          type="button"
                          aria-label={`Reduce ${upgrade.name} to level ${Math.max(0, level - 1)}`}
                          onClick={() => {
                            onDowngradeMainShip(upgrade.id);
                            showUpgradeFeedback(`main:${upgrade.id}`, `${upgrade.name} level ${Math.max(0, level - 1)}`);
                          }}
                          disabled={level <= 0}
                          className="min-h-9 border border-cyan-200/35 bg-cyan-300/10 text-lg font-black text-cyan-100 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-600"
                        >
                          -
                        </button>
                        <span className="flex min-h-9 items-center justify-center border border-cyan-200/20 bg-slate-950/70 px-1 text-[0.58rem] font-black uppercase text-cyan-100">
                          Test level {level}
                        </span>
                        <PixelActionButton
                          aria-label={`Increase ${upgrade.name} to ${formatMainUpgradeLevel(upgrade.id, Math.min(maxLevel, level + 1))}`}
                          onClick={() => {
                            onUpgradeMainShip(upgrade.id);
                            showUpgradeFeedback(`main:${upgrade.id}`, `${upgrade.name} ${formatMainUpgradeLevel(upgrade.id, Math.min(maxLevel, level + 1))}`);
                          }}
                          disabled={atMax}
                          tone="gold"
                          ready={!atMax}
                          className="min-h-9 text-lg font-black"
                        >
                          +
                        </PixelActionButton>
                      </div>
                    ) : (
                      <PixelActionButton
                        onClick={() => {
                          onUpgradeMainShip(upgrade.id);
                          showUpgradeFeedback(`main:${upgrade.id}`, `${upgrade.name} ${formatMainUpgradeLevel(upgrade.id, level + 1)}`);
                        }}
                        disabled={atMax || state.coins < cost}
                        tone="gold"
                        ready={!atMax && state.coins >= cost}
                        className="mt-3 min-h-9 w-full px-2 text-[0.58rem] font-black uppercase"
                      >
                        {atMax ? 'Max level' : `${cost} Tokens`}
                      </PixelActionButton>
                    )}
                  </article>
                );
              })}
            </div>
          ) : activeMini ? (
            <div className="relative mx-auto grid max-w-md grid-cols-[6rem_minmax(0,1fr)] items-center gap-4 overflow-hidden border border-cyan-200/22 bg-slate-950/65 p-3">
              {upgradeFeedback?.target === `mini:${activeMini.id}` ? (
                <span key={upgradeFeedback.nonce} className="sci-hangar-upgrade-pulse" aria-hidden="true">
                  {upgradeFeedback.label}
                </span>
              ) : null}
              <AnimatedMiniShip entry={activeMini} className="h-24 w-24" />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black uppercase text-white">{activeMini.name}</h3>
                <p className="mt-1 text-[0.65rem] text-slate-400">{activeMini.description}</p>
                <div className="mt-2"><LevelPips level={activeMiniLevel} max={MINI_SHIP_MAX_LEVEL} /></div>
                {founderSandbox ? (
                  <div className="mt-3 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] gap-1.5">
                    <button
                      type="button"
                      aria-label={`Reduce ${activeMini.name} to level ${Math.max(1, activeMiniLevel - 1)}`}
                      onClick={() => {
                        onDowngradeMini(activeMini.id);
                        showUpgradeFeedback(`mini:${activeMini.id}`, `${activeMini.name} level ${Math.max(1, activeMiniLevel - 1)}`);
                      }}
                      disabled={activeMiniLevel <= 1}
                      className="min-h-9 border border-cyan-200/35 bg-cyan-300/10 text-lg font-black text-cyan-100 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-600"
                    >
                      -
                    </button>
                    <span className="flex min-h-9 items-center justify-center border border-cyan-200/20 bg-slate-950/70 px-1 text-[0.58rem] font-black uppercase text-cyan-100">
                      Test level {activeMiniLevel}
                    </span>
                    <PixelActionButton
                      aria-label={`Increase ${activeMini.name} to level ${Math.min(MINI_SHIP_MAX_LEVEL, activeMiniLevel + 1)}`}
                      onClick={() => {
                        onUpgradeMini(activeMini.id);
                        showUpgradeFeedback(`mini:${activeMini.id}`, `${activeMini.name} level ${Math.min(MINI_SHIP_MAX_LEVEL, activeMiniLevel + 1)}`);
                      }}
                      disabled={activeMiniLevel >= MINI_SHIP_MAX_LEVEL}
                      tone="gold"
                      ready={activeMiniLevel < MINI_SHIP_MAX_LEVEL}
                      className="min-h-9 text-lg font-black"
                    >
                      +
                    </PixelActionButton>
                  </div>
                ) : activeMiniOwned ? (
                  <PixelActionButton
                    onClick={() => {
                      onUpgradeMini(activeMini.id);
                      showUpgradeFeedback(`mini:${activeMini.id}`, `${activeMini.name} level ${activeMiniLevel + 1}`);
                    }}
                    disabled={!activeMiniOwned || activeMiniLevel >= MINI_SHIP_MAX_LEVEL || state.coins < getMiniShipUpgradeCost(activeMini.id, activeMiniLevel)}
                    tone="gold"
                    ready={activeMiniUpgradeReady}
                    className="mt-3 min-h-9 w-full px-2 text-[0.58rem] font-black uppercase"
                  >
                    {activeMiniLevel >= MINI_SHIP_MAX_LEVEL ? 'Max level' : `Upgrade ${getMiniShipUpgradeCost(activeMini.id, activeMiniLevel)} Tokens`}
                  </PixelActionButton>
                ) : (
                  <PixelActionButton
                    onClick={() => {
                      onPurchaseMini(activeMini.id);
                      showUpgradeFeedback(`mini:${activeMini.id}`, `${activeMini.name} unlocked`);
                    }}
                    disabled={!founderSandbox && state.coins < activeMini.purchaseCost}
                    tone="gold"
                    ready={activeMiniUnlockReady}
                    className="mt-3 min-h-9 w-full px-2 text-[0.58rem] font-black uppercase"
                  >
                    {activeMini.purchaseCost === 0 ? 'Unlock free' : `Unlock ${activeMini.purchaseCost.toLocaleString()} Tokens`}
                  </PixelActionButton>
                )}
              </div>
            </div>
          ) : (
            <p className="border border-cyan-200/20 bg-slate-950/60 p-4 text-center text-xs uppercase text-slate-400">Choose or purchase a mini ship first.</p>
          )}
        </section>
        </main>
      </div>
      <PlayerShipAccessDialog
        shipId={lockedPlayerShipId}
        shipUnlocks={shipUnlocks}
        walletConnected={walletConnected}
        playerShipPurchaseStatus={playerShipPurchaseStatus}
        onClose={() => setLockedPlayerShipId(null)}
        onRefreshPlayerShipAccess={onRefreshPlayerShipAccess}
        onPurchasePlayerShip={onPurchasePlayerShip}
        onUnlockedAction={(shipId) => {
          setLockedPlayerShipId(null);
          setWeaponPreviewShipId(shipId);
        }}
        unlockedActionLabel="Unlocked - preview fire"
      />
      <ShipWeaponPreviewDialog
        shipId={weaponPreviewShipId}
        fireRateLevel={weaponPreviewShipId ? state.shipUpgrades[weaponPreviewShipId].fireRate : 0}
        selected={weaponPreviewShipId === mainShipId}
        onClose={() => setWeaponPreviewShipId(null)}
        onSelect={onSelectMainShip}
      />
    </>
  );
};

export default SquadHangar;
