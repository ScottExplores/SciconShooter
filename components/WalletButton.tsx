import React, { useState } from 'react';
import { ConnectButton } from 'thirdweb/react';
import { ASSETS, DONATION_CONFIG } from '../constants';
import { WalletSession } from '../types';
import type { FundingWidgetMode } from './FundingWidgetModal';
import {
  thirdwebAppMetadata,
  thirdwebBaseChain,
  thirdwebClient,
  thirdwebConnectModal,
  thirdwebPaymentConnectOptions,
  thirdwebRecommendedWallets,
  thirdwebSupportedTokens,
  thirdwebTheme,
  thirdwebWallets
} from '../services/thirdwebWallet';

interface WalletButtonProps {
  wallet: WalletSession;
  onConnect: (connectorId?: string) => void;
  onDisconnect: () => void;
  onOpenFunding: (mode: FundingWidgetMode, rscAmount?: number) => void;
  credits: number;
}

const WalletButton: React.FC<WalletButtonProps> = ({
  wallet,
  onConnect,
  onDisconnect,
  onOpenFunding,
  credits
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const shortAddress = wallet.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : '';
  const actionIconClass = 'grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-200/18 bg-cyan-300/10 text-cyan-100 shadow-[inset_0_0_18px_rgba(34,211,238,0.08)]';

  if (thirdwebClient && wallet.address) {
    return (
      <div className="absolute right-3 top-3 z-50 font-mono text-white">
        <button
          type="button"
          onClick={() => setIsMenuOpen((current) => !current)}
          className="flex items-center gap-2 rounded-full border border-emerald-300/35 bg-black/72 px-2 py-1.5 shadow-[0_0_24px_rgba(16,185,129,0.2)] backdrop-blur-md transition hover:border-emerald-100"
          aria-expanded={isMenuOpen}
          aria-label="Open wallet profile"
        >
          <span className="h-8 w-8 rounded-full border border-white/20 bg-[radial-gradient(circle_at_30%_20%,#ffe0c6_0,#50d1ff_42%,#083344_100%)]" />
          <span className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100 min-[420px]:inline">
            {shortAddress}
          </span>
          <span className={`text-xs text-slate-300 transition ${isMenuOpen ? 'rotate-180' : ''}`}>v</span>
        </button>

        {isMenuOpen ? (
          <div className="absolute right-0 mt-2 w-[244px] overflow-hidden rounded-[24px] border border-cyan-200/22 bg-[#06111f]/96 text-cyan-50 shadow-[0_22px_70px_rgba(0,0,0,0.55),0_0_36px_rgba(34,211,238,0.14)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(103,232,249,0.16),transparent_42%),linear-gradient(135deg,rgba(37,99,235,0.1),transparent_46%)]" />

            <div className="relative flex items-center gap-3 border-b border-cyan-200/14 p-3">
              <span className="h-10 w-10 shrink-0 rounded-full border border-cyan-100/35 bg-[radial-gradient(circle_at_30%_20%,#ffe0c6_0,#50d1ff_42%,#083344_100%)] shadow-[0_0_24px_rgba(80,209,255,0.3)]" />
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-white">{shortAddress}</div>
                <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">{wallet.connectorName || 'thirdweb wallet'}</div>
              </div>
            </div>

            <div className="relative divide-y divide-cyan-200/12 text-sm font-bold">
              <ConnectButton
                client={thirdwebClient}
                chain={thirdwebBaseChain}
                appMetadata={thirdwebAppMetadata}
                connectButton={{ label: 'Connect' }}
                connectModal={thirdwebConnectModal}
                detailsButton={{
                  render: () => (
                    <div className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-cyan-50 transition hover:bg-cyan-300/10">
                      <span className={actionIconClass}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                          <path d="M4 21a8 8 0 0 1 16 0" />
                        </svg>
                      </span>
                      <span>My account</span>
                    </div>
                  )
                }}
                detailsModal={{
                  showBalanceInFiat: 'USD',
                  assetTabs: ['token'],
                  manageWallet: { allowLinkingProfiles: true },
                  payOptions: {
                    mode: 'fund_wallet',
                    prefillBuy: {
                      chain: thirdwebBaseChain,
                      token: {
                        address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS,
                        name: 'ResearchCoin',
                        symbol: 'RSC'
                      },
                      amount: '5',
                      allowEdits: { amount: true, token: false, chain: false },
                      presetOptions: [5, 10, 20]
                    },
                    buyWithCrypto: {
                      prefillSource: {
                        chain: thirdwebBaseChain,
                        token: {
                          address: DONATION_CONFIG.USDC_CONTRACT_ADDRESS,
                          name: 'USD Coin',
                          symbol: 'USDC'
                        },
                        allowEdits: { token: true, chain: false }
                      }
                    },
                    buyWithFiat: {
                      onrampChainId: DONATION_CONFIG.BASE_CHAIN_ID,
                      onrampTokenAddress: DONATION_CONFIG.RSC_CONTRACT_ADDRESS
                    },
                    metadata: {
                      name: 'Fund SciCon Shooter',
                      description: 'Buy ResearchCoin on Base, then spend it on mission credits.'
                    },
                    showThirdwebBranding: false
                  }
                }}
                recommendedWallets={thirdwebRecommendedWallets}
                supportedTokens={thirdwebSupportedTokens}
                theme={thirdwebTheme}
                wallets={thirdwebWallets}
              />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenFunding('checkout', DONATION_CONFIG.PRESET_RSC_AMOUNTS[0]);
                }}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-cyan-50 transition hover:bg-cyan-300/10"
              >
                <span className={actionIconClass}>
                  <img src={ASSETS.RSC_TOKEN} alt="" className="h-4 w-4" />
                </span>
                <span>Buy Credits</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenFunding('swap');
                }}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-cyan-50 transition hover:bg-cyan-300/10"
              >
                <span className={actionIconClass}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 7h11l-3-3" />
                    <path d="M18 7l-3 3" />
                    <path d="M17 17H6l3 3" />
                    <path d="M6 17l3-3" />
                  </svg>
                </span>
                <span>Swap for RSC</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDisconnect();
                }}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left font-black text-red-200 transition hover:bg-red-500/10"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-red-200/18 bg-red-400/10 text-red-200">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v10" />
                    <path d="M6.4 6.4a8 8 0 1 0 11.2 0" />
                  </svg>
                </span>
                <span>Sign out</span>
              </button>
            </div>

            <div className="relative flex items-center justify-between border-t border-cyan-200/14 bg-cyan-300/[0.04] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100/80">
                <img src={ASSETS.RSC_TOKEN} alt="" className="h-4 w-4" />
                <span>{credits} credits</span>
              </div>
              <div className="flex gap-2">
                <a href={DONATION_CONFIG.X_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.08] text-xs font-black text-cyan-50 transition hover:bg-white/[0.14]">X</a>
                <a href={ASSETS.REFERRAL_LINK} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.08] text-xs font-black text-cyan-50 transition hover:bg-white/[0.14]">RH</a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return thirdwebClient ? (
    <div className="absolute right-3 top-3 z-50 font-mono">
      <ConnectButton
        client={thirdwebClient}
        chain={thirdwebBaseChain}
        appMetadata={thirdwebAppMetadata}
        connectButton={{
          label: 'Connect',
          className: 'scicon-wallet-connect',
          style: {
            borderRadius: '999px',
            border: '1px solid rgba(103, 232, 249, 0.38)',
            background: 'rgba(0, 0, 0, 0.74)',
            color: 'rgb(207, 250, 254)',
            fontFamily: 'monospace',
            fontSize: '11px',
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            minWidth: 'auto',
            height: '40px',
            padding: '0 14px',
            boxShadow: '0 0 24px rgba(34, 211, 238, 0.18)'
          }
        }}
        connectModal={thirdwebConnectModal}
        detailsModal={{
          showBalanceInFiat: 'USD',
          assetTabs: ['token'],
          manageWallet: { allowLinkingProfiles: true },
          payOptions: {
            mode: 'fund_wallet',
            prefillBuy: {
              chain: thirdwebBaseChain,
              token: {
                address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS,
                name: 'ResearchCoin',
                symbol: 'RSC'
              },
              amount: '5',
              allowEdits: { amount: true, token: false, chain: false },
              presetOptions: [5, 10, 20]
            },
            buyWithFiat: {
              onrampChainId: DONATION_CONFIG.BASE_CHAIN_ID,
              onrampTokenAddress: DONATION_CONFIG.RSC_CONTRACT_ADDRESS
            },
            showThirdwebBranding: false
          }
        }}
        recommendedWallets={thirdwebRecommendedWallets}
        supportedTokens={thirdwebSupportedTokens}
        theme={thirdwebTheme}
        wallets={thirdwebWallets}
      />
    </div>
  ) : (
    <div className="absolute right-3 top-3 z-50 font-mono text-white">
      <button
        onClick={() => onConnect()}
        className="rounded-full border border-cyan-300/40 bg-black/75 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md transition hover:border-cyan-100"
      >
        Connect
      </button>
      {wallet.error ? (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-red-300/25 bg-black/90 p-3 text-[10px] leading-relaxed text-red-100 shadow-xl">
          {wallet.error}
        </div>
      ) : null}
    </div>
  );
};

export default WalletButton;
