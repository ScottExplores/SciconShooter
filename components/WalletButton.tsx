import React, { useState } from 'react';
import type { Connector } from 'wagmi';
import { DONATION_CONFIG } from '../constants';
import { WalletSession } from '../types';

interface WalletButtonProps {
  wallet: WalletSession;
  connectors: readonly Connector[];
  onConnect: (connectorId?: string) => void;
  onDisconnect: () => void;
  onDonate: (amount: number) => void;
  onOpenSwap: () => void;
}

const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const getConnectorLabel = (connector: Connector) => {
  if (connector.id === 'injected') return 'Browser Wallet';
  if (connector.id === 'coinbaseWalletSDK') return 'Coinbase Wallet';
  if (connector.id === 'baseAccount') return 'Base Account';
  if (connector.id === 'walletConnect') return 'WalletConnect';
  if (connector.id === 'farcaster') return 'Farcaster';
  return connector.name;
};

const sortConnectors = (connectors: readonly Connector[]) => {
  const priority = ['baseAccount', 'coinbaseWalletSDK', 'walletConnect', 'injected'];
  return [...connectors]
    .filter((connector) => connector.id !== 'farcaster')
    .sort((a, b) => {
      const aIndex = priority.indexOf(a.id);
      const bIndex = priority.indexOf(b.id);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
};

const WalletButton: React.FC<WalletButtonProps> = ({
  wallet,
  connectors,
  onConnect,
  onDisconnect,
  onDonate,
  onOpenSwap
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isConnected = wallet.status === 'connected' && !!wallet.address;
  const visibleConnectors = sortConnectors(connectors);

  return (
    <div className="absolute right-3 top-3 z-50 font-mono text-white">
      <button
        onClick={() => setIsOpen((value) => !value)}
        className={`rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md transition ${
          isConnected
            ? 'border-emerald-300/40 bg-emerald-950/80 text-emerald-100'
            : 'border-cyan-300/40 bg-black/75 text-cyan-100 hover:border-cyan-100'
        }`}
      >
        {isConnected ? (
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]"></span>
            {shortenAddress(wallet.address!)}
            {wallet.hasDonated ? <span className="text-yellow-300">RSC</span> : null}
          </span>
        ) : wallet.status === 'connecting' ? (
          'Connecting...'
        ) : (
          'Connect'
        )}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-2 w-[min(88vw,320px)] rounded-2xl border border-cyan-400/20 bg-[#040812]/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {isConnected ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Wallet</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white">
                  <span>{shortenAddress(wallet.address!)}</span>
                  <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${wallet.chainId === 8453 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-200'}`}>
                    {wallet.chainId === 8453 ? 'Base' : 'Switch needed'}
                  </span>
                  {wallet.connectorName ? <span className="text-gray-500">{wallet.connectorName}</span> : null}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {DONATION_CONFIG.PRESET_RSC_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => onDonate(amount)}
                    className="rounded-xl border border-yellow-300/25 bg-yellow-500/10 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-100 transition hover:border-yellow-200 hover:bg-yellow-400/15"
                  >
                    Tip {amount}
                  </button>
                ))}
              </div>

              <button
                onClick={onOpenSwap}
                className="w-full rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-400/15"
              >
                Swap USDC to RSC
              </button>

              {wallet.hasDonated ? (
                <div className="rounded-xl border border-yellow-300/20 bg-yellow-500/10 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-yellow-200">
                  RSC supporter badge active
                </div>
              ) : null}

              <button
                onClick={onDisconnect}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-300 transition hover:border-white/30 hover:text-white"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.22em] text-gray-500">Choose wallet</div>
              {visibleConnectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => onConnect(connector.id)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-[12px] font-bold uppercase tracking-[0.14em] text-gray-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
                >
                  {getConnectorLabel(connector)}
                </button>
              ))}
              {wallet.error ? <div className="px-1 pt-1 text-[11px] leading-relaxed text-red-300">{wallet.error}</div> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default WalletButton;
