import React, { useEffect, useId, useRef, useState } from 'react';
import {
  DONATION_CONFIG,
  PLAYER_SHIP_PURCHASE_SKUS,
  type PlayerShipPurchaseSkuId
} from '../constants';
import {
  isPlayerShipUnlocked,
  PLAYER_SHIPS,
  type PlayerShipId,
  type PlayerShipUnlocks
} from '../services/playerShipService';
import {
  PLAYER_SHIP_MOTION,
  PLAYER_SHIP_SELECTION_FPS,
  preloadPlayerShipSelectionFrames
} from '../services/playerShipMotion';
import PixelActionButton from './PixelActionButton';
import type { PlayerShipPurchaseStatusUpdate } from './WalletRuntime';

export type PlayerShipAccessId = Exclude<PlayerShipId, 'researchhub'>;

interface PlayerShipAccessDialogProps {
  shipId: PlayerShipAccessId | null;
  shipUnlocks: PlayerShipUnlocks;
  walletConnected: boolean;
  playerShipPurchaseStatus: PlayerShipPurchaseStatusUpdate;
  onClose: () => void;
  onRefreshPlayerShipAccess: () => void;
  onPurchasePlayerShip: (skuId: PlayerShipPurchaseSkuId) => void;
  onUnlockedAction: (shipId: PlayerShipAccessId) => void;
  unlockedActionLabel: string;
}

const getShipPurchaseSkuId = (
  shipId: PlayerShipAccessId
): PlayerShipPurchaseSkuId | null => (
  shipId === 'eth'
    ? 'eth-ship'
    : shipId === 'btc'
      ? 'btc-ship'
      : null
);

const PlayerShipAccessDialog: React.FC<PlayerShipAccessDialogProps> = ({
  shipId,
  shipUnlocks,
  walletConnected,
  playerShipPurchaseStatus,
  onClose,
  onRefreshPlayerShipAccess: _onRefreshPlayerShipAccess,
  onPurchasePlayerShip,
  onUnlockedAction,
  unlockedActionLabel
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [selectionFrame, setSelectionFrame] = useState(0);
  const dialogOpen = shipId !== null;

  useEffect(() => {
    if (!shipId) return undefined;
    setSelectionFrame(0);
    void preloadPlayerShipSelectionFrames();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const frames = PLAYER_SHIP_MOTION[shipId].selectionIdleFrames;
    const timer = window.setInterval(() => {
      setSelectionFrame((current) => (current + 1) % frames.length);
    }, 1000 / PLAYER_SHIP_SELECTION_FPS);
    return () => window.clearInterval(timer);
  }, [shipId]);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, [dialogOpen]);

  useEffect(() => {
    if (!shipId) return undefined;
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute('aria-hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeyDown);
    return () => window.removeEventListener('keydown', handleDialogKeyDown);
  }, [onClose, shipId]);

  if (!shipId) return null;

  const ship = PLAYER_SHIPS[shipId];
  const shipNowUnlocked = isPlayerShipUnlocked(shipId, shipUnlocks);
  const purchaseSkuId = getShipPurchaseSkuId(shipId);
  const purchaseActive = Boolean(
    purchaseSkuId
    && playerShipPurchaseStatus.skuId === purchaseSkuId
  );
  const purchaseBusy = purchaseActive
    && !['idle', 'confirmed', 'error'].includes(playerShipPurchaseStatus.status);
  const purchaseMessage = !purchaseActive
    ? null
    : playerShipPurchaseStatus.status === 'error'
      ? playerShipPurchaseStatus.error || 'This ship purchase could not be completed.'
      : playerShipPurchaseStatus.status === 'confirmed'
        ? 'Payment verified on Base. This ship is permanently unlocked for this wallet.'
        : playerShipPurchaseStatus.status === 'connecting'
          ? 'Connecting your Base Account...'
          : playerShipPurchaseStatus.status === 'authorizing'
            ? 'Preparing a secure, wallet-bound purchase quote...'
            : playerShipPurchaseStatus.status === 'confirming' && purchaseSkuId
              ? `Confirm the exact ${PLAYER_SHIP_PURCHASE_SKUS[purchaseSkuId].amount} ${PLAYER_SHIP_PURCHASE_SKUS[purchaseSkuId].tokenSymbol} payment in Base.`
              : playerShipPurchaseStatus.status === 'settling'
                ? 'Payment submitted. Verifying the Base receipt...'
                : null;
  const selectionFrames = PLAYER_SHIP_MOTION[shipId].selectionIdleFrames;
  const selectionFrameUrl = selectionFrames[selectionFrame % selectionFrames.length];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close ship access details"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md overflow-hidden border border-cyan-200/35 bg-[#061126] p-4 shadow-[0_0_48px_rgba(34,211,238,0.24)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.58rem] font-black uppercase tracking-[0.16em] text-cyan-200">Base ship access</p>
            <h2 id={titleId} className="mt-1 text-xl font-black uppercase text-white">
              {ship.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center border border-cyan-200/30 bg-slate-950/75 font-black text-cyan-100"
            aria-label="Close ship access details"
          >
            X
          </button>
        </div>

        <div className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-4 border border-cyan-200/20 bg-slate-950/65 p-3">
          <img
            src={selectionFrameUrl}
            alt=""
            draggable={false}
            data-player-ship={shipId}
            data-selection-frame={selectionFrame % selectionFrames.length}
            className={`pointer-events-none h-24 w-24 object-contain drop-shadow-[0_0_14px_rgba(34,211,238,0.55)] ${shipNowUnlocked ? '' : 'grayscale'}`}
          />
          <div className="min-w-0">
            {shipId === 'bio' ? (
              <>
                <p className="text-sm font-black uppercase text-emerald-100">NIH ship</p>
                <p className="mt-1 text-[0.66rem] leading-relaxed text-slate-300">
                  This ship is unlocked. No token holding is required.
                </p>
              </>
            ) : shipId === 'eth' ? (
              <>
                <p className="text-sm font-black uppercase text-emerald-100">0.001 ETH</p>
                <p className="mt-1 text-[0.66rem] leading-relaxed text-slate-300">
                  One permanent ETH ship unlock for this Base Account after the payment receipt is verified.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-black uppercase text-yellow-100">Two ways to unlock</p>
                <p className="mt-1 text-[0.66rem] leading-relaxed text-slate-300">
                  Master every Campaign Mission and earn all {shipUnlocks.campaignStarsTotal} stars, or unlock permanently for 0.00008 cbBTC.
                </p>
                <p className="mt-2 font-mono text-[0.62rem] font-black uppercase text-cyan-100">
                  Campaign: {shipUnlocks.campaignStarsEarned}/{shipUnlocks.campaignStarsTotal} stars
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 border border-white/10 bg-black/25 px-3 py-2 text-[0.55rem] font-bold uppercase leading-relaxed text-slate-400">
          <p>Network: Base mainnet</p>
          {shipId === 'bio' ? null : purchaseSkuId ? (
            <>
              <p className="mt-1">Recipient: {DONATION_CONFIG.RECIPIENT_ADDRESS.slice(0, 8)}...{DONATION_CONFIG.RECIPIENT_ADDRESS.slice(-6)}</p>
              <p className="mt-1">Exact price: {PLAYER_SHIP_PURCHASE_SKUS[purchaseSkuId].amount} {PLAYER_SHIP_PURCHASE_SKUS[purchaseSkuId].tokenSymbol}</p>
            </>
          ) : null}
        </div>

        {shipNowUnlocked ? (
          <PixelActionButton
            type="button"
            tone="green"
            ready
            shine
            onClick={() => onUnlockedAction(shipId)}
            className="mt-3 min-h-12 w-full px-4 text-xs font-black uppercase"
          >
            {unlockedActionLabel}
          </PixelActionButton>
        ) : purchaseSkuId ? (
          <PixelActionButton
            type="button"
            tone="gold"
            ready={!purchaseBusy}
            shine
            disabled={purchaseBusy}
            onClick={() => onPurchasePlayerShip(purchaseSkuId)}
            className="mt-3 min-h-12 w-full px-4 text-xs font-black uppercase"
          >
            {purchaseBusy
              ? 'Purchase in progress...'
              : `${walletConnected ? 'Unlock' : 'Connect & unlock'} for ${PLAYER_SHIP_PURCHASE_SKUS[purchaseSkuId].amount} ${PLAYER_SHIP_PURCHASE_SKUS[purchaseSkuId].tokenSymbol}`}
          </PixelActionButton>
        ) : null}

        {purchaseMessage ? (
          <p className={`mt-2 border px-3 py-2 text-center text-[0.62rem] font-bold ${playerShipPurchaseStatus.status === 'error' ? 'border-red-300/30 bg-red-950/60 text-red-100' : playerShipPurchaseStatus.status === 'confirmed' ? 'border-emerald-300/30 bg-emerald-950/55 text-emerald-100' : 'border-cyan-300/25 bg-slate-950/70 text-cyan-100'}`} role="status">
            {purchaseMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
};

export default PlayerShipAccessDialog;
