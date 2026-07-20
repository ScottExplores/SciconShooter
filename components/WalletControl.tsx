import React, { useEffect, useId, useRef, useState } from 'react';
import type { WalletSession } from '../types';

interface WalletControlProps {
  wallet: WalletSession;
  onConnect: () => void;
  onSwitchAccount: () => void;
  onDisconnect: () => void;
  onOpenSwap: () => void;
  placement?: 'floating' | 'mission';
}

export const WalletControl: React.FC<WalletControlProps> = ({
  wallet,
  onConnect,
  onSwitchAccount,
  onDisconnect,
  onOpenSwap,
  placement = 'mission'
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const wrapperClassName = placement === 'mission'
    ? 'relative z-30 inline-flex justify-center font-mono text-white'
    : 'absolute right-3 top-3 z-50 font-mono text-white';
  const walletMenuClassName = placement === 'mission'
    ? 'absolute bottom-full left-1/2 mb-2 w-[224px] -translate-x-1/2 overflow-hidden rounded-[20px] border border-cyan-200/22 bg-[#06111f]/96 text-cyan-50 shadow-[0_22px_70px_rgba(0,0,0,0.55),0_0_36px_rgba(34,211,238,0.14)] backdrop-blur-xl'
    : 'absolute right-0 top-full mt-2 w-[224px] overflow-hidden rounded-[20px] border border-cyan-200/22 bg-[#06111f]/96 text-cyan-50 shadow-[0_22px_70px_rgba(0,0,0,0.55),0_0_36px_rgba(34,211,238,0.14)] backdrop-blur-xl';
  const walletErrorClassName = placement === 'mission'
    ? 'absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-2xl border border-red-300/25 bg-black/90 p-3 text-[10px] leading-relaxed text-red-100 shadow-xl'
    : 'absolute left-1/2 top-full mt-2 w-56 -translate-x-1/2 rounded-2xl border border-red-300/25 bg-black/90 p-3 text-[10px] leading-relaxed text-red-100 shadow-xl';
  const isConnected = Boolean(wallet.address);
  const label = isConnected
    ? `${wallet.address!.slice(0, 6)}...${wallet.address!.slice(-4)}`
    : wallet.status === 'connecting'
      ? 'Loading'
      : 'Connect';

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [wallet.address]);

  return (
    <div ref={wrapperRef} className={wrapperClassName} data-testid="wallet-control">
      <button
        type="button"
        onClick={() => {
          if (!isConnected) {
            onConnect();
            return;
          }
          setIsMenuOpen((current) => !current);
        }}
        className="rounded-full border border-cyan-300/40 bg-black/75 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md transition hover:border-cyan-100 disabled:cursor-wait disabled:opacity-70"
        disabled={wallet.status === 'connecting'}
        aria-label={isConnected ? `Base Account ${wallet.address}. Open wallet menu` : 'Connect Base Account'}
        aria-controls={isConnected ? menuId : undefined}
        aria-expanded={isConnected ? isMenuOpen : undefined}
        aria-haspopup={isConnected ? 'menu' : undefined}
      >
        {label}
      </button>

      {isMenuOpen && isConnected ? (
        <div id={menuId} role="menu" aria-label="Base Account actions" className={walletMenuClassName} data-testid="wallet-account-menu">
          <div className="border-b border-cyan-200/14 p-3">
            <div className="truncate text-sm font-black text-white">{label}</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">{wallet.connectorName || 'Base wallet'}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsMenuOpen(false);
              onSwitchAccount();
            }}
            className="block w-full px-3.5 py-3 text-left text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/10"
          >
            Choose Base Account
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsMenuOpen(false);
              onOpenSwap();
            }}
            className="block w-full border-t border-cyan-200/12 px-3.5 py-3 text-left text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/10"
          >
            Swap for RSC
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsMenuOpen(false);
              onDisconnect();
            }}
            className="block w-full border-t border-cyan-200/12 px-3.5 py-3 text-left text-sm font-black text-red-200 transition hover:bg-red-500/10"
          >
            Disconnect wallet
          </button>
        </div>
      ) : null}

      {wallet.error && !isMenuOpen ? (
        <div role="status" className={walletErrorClassName}>
          {wallet.error}
        </div>
      ) : null}
    </div>
  );
};
