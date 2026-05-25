import React, { useState } from 'react';
import { BuyWidget, SwapWidget } from 'thirdweb/react';
import { ASSETS, DONATION_CONFIG } from '../constants';
import {
  rscTokenInfo,
  thirdwebBaseChain,
  thirdwebClient,
  thirdwebPaymentConnectOptions,
  thirdwebTheme
} from '../services/thirdwebWallet';

export type FundingWidgetMode = 'checkout' | 'swap' | 'buy';

interface FundingWidgetModalProps {
  mode: FundingWidgetMode;
  rscAmount?: number;
  walletAddress?: string | null;
  onClose: () => void;
  onModeChange: (mode: FundingWidgetMode, rscAmount?: number) => void;
  onCreditPayment: (rscAmount: number) => Promise<string>;
  onWidgetError: (message: string) => void;
}

const usdcAddress = DONATION_CONFIG.USDC_CONTRACT_ADDRESS as `0x${string}`;
const rscAddress = DONATION_CONFIG.RSC_CONTRACT_ADDRESS as `0x${string}`;

const fundingTabs: Array<{ mode: FundingWidgetMode; label: string; copy: string }> = [
  { mode: 'checkout', label: 'Buy Credits', copy: 'Spend RSC on Base to add mission credits.' },
  { mode: 'swap', label: 'Swap for RSC', copy: 'Swap Base USDC into ResearchCoin, or open Aerodrome if routing is unavailable.' },
  { mode: 'buy', label: 'Buy RSC', copy: 'Buy ResearchCoin on Base, then use Buy Credits to fund the mission.' }
];

const FundingWidgetModal: React.FC<FundingWidgetModalProps> = ({
  mode,
  rscAmount = DONATION_CONFIG.PRESET_RSC_AMOUNTS[0],
  walletAddress,
  onClose,
  onModeChange,
  onCreditPayment,
  onWidgetError
}) => {
  const [selectedRscAmount, setSelectedRscAmount] = useState(rscAmount);
  const [widgetMessage, setWidgetMessage] = useState('');
  const [confirmedTxHash, setConfirmedTxHash] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const missionCredits = selectedRscAmount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC;

  const updateMode = (nextMode: FundingWidgetMode) => {
    setWidgetMessage('');
    onModeChange(nextMode, selectedRscAmount);
  };

  const handlePackageChange = (amount: number) => {
    setSelectedRscAmount(amount);
    onModeChange(mode, amount);
  };

  const handleCreditSuccess = () => {
    setWidgetMessage(`Confirmed. ${missionCredits} mission credits added.`);
  };

  const handleWidgetError = (error: Error) => {
    const message = error.message || 'Payment flow could not complete.';
    setWidgetMessage(message);
    onWidgetError(message);
  };

  const handleDirectCreditPayment = async () => {
    setIsSubmittingPayment(true);
    setConfirmedTxHash('');
    setWidgetMessage('Confirm the RSC transfer in your wallet. Credits are only added after the Base transaction confirms.');

    try {
      const txHash = await onCreditPayment(selectedRscAmount);
      setConfirmedTxHash(txHash);
      handleCreditSuccess();
    } catch (error: any) {
      handleWidgetError(error);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/78 p-3 backdrop-blur-md">
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 shadow-[0_28px_100px_rgba(0,0,0,0.68)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />

        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">RSC Funding</div>
            <h2 className="arcade-font mt-1 text-xl font-black tracking-widest text-white">Mission Wallet</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Pay with RSC directly, or get RSC before funding.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs font-black text-white transition hover:border-cyan-200/60"
            aria-label="Close funding wallet"
          >
            X
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {fundingTabs.map((tab) => (
              <button
                key={tab.mode}
                type="button"
                onClick={() => updateMode(tab.mode)}
                className={`min-h-[48px] rounded-2xl border px-2 py-3 text-center shadow-[inset_0_0_18px_rgba(255,255,255,0.02)] transition ${
                  mode === tab.mode
                    ? 'border-cyan-100/70 bg-gradient-to-br from-emerald-300/26 to-cyan-300/12 text-white shadow-[0_0_24px_rgba(34,211,238,0.18)]'
                    : 'border-white/12 bg-white/[0.06] text-slate-300 hover:border-cyan-200/45 hover:bg-cyan-300/10'
                }`}
              >
                <div className="font-mono text-[9px] font-black uppercase leading-tight tracking-[0.12em] min-[390px]:text-[10px]">
                  {tab.label}
                </div>
              </button>
            ))}
          </div>

          <p className="mt-3 rounded-2xl border border-white/10 bg-black/28 p-3 text-xs leading-relaxed text-slate-300">
            {fundingTabs.find((tab) => tab.mode === mode)?.copy}
          </p>

          {mode === 'checkout' ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {DONATION_CONFIG.PRESET_RSC_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => handlePackageChange(amount)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selectedRscAmount === amount
                      ? 'border-yellow-200 bg-yellow-200 text-slate-950'
                      : 'border-white/10 bg-black/30 text-white hover:border-yellow-200/50'
                  }`}
                >
                  <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em]">{amount} RSC</div>
                  <div className="mt-1 text-lg font-black">{amount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC}</div>
                  <div className="text-[9px] uppercase tracking-[0.12em] opacity-70">credits</div>
                </button>
              ))}
            </div>
          ) : null}

          {!thirdwebClient ? (
            <div className="mt-4 rounded-2xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
              Add <span className="font-mono">VITE_THIRDWEB_CLIENT_ID</span> to enable thirdweb wallet and payment widgets.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-2">
              {mode === 'checkout' ? (
                <div className="rounded-[22px] border border-emerald-300/20 bg-black/32 p-4">
                  <div className="flex items-center gap-3">
                    <img src={ASSETS.REAL_RSC_ICON} alt="" className="h-11 w-11 rounded-full border border-white/10 bg-white" />
                    <div>
                      <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Direct Base transfer</div>
                      <div className="mt-1 text-sm font-black text-white">{selectedRscAmount} RSC &rarr; {missionCredits} credits</div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-300">
                    This sends ResearchCoin from your connected wallet to the SciCon treasury on Base. No Bridge catalog needed, so RSC works as a normal ERC-20 token.
                  </p>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-[10px] leading-relaxed text-slate-400">
                    <div><span className="font-black text-slate-200">Wallet:</span> {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect on confirm'}</div>
                    <div><span className="font-black text-slate-200">Token:</span> {DONATION_CONFIG.RSC_CONTRACT_ADDRESS.slice(0, 6)}...{DONATION_CONFIG.RSC_CONTRACT_ADDRESS.slice(-4)}</div>
                    <div><span className="font-black text-slate-200">Treasury:</span> {DONATION_CONFIG.RECIPIENT_ADDRESS.slice(0, 6)}...{DONATION_CONFIG.RECIPIENT_ADDRESS.slice(-4)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDirectCreditPayment}
                    disabled={isSubmittingPayment}
                    className="mt-4 w-full rounded-2xl border border-emerald-200/50 bg-emerald-300 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSubmittingPayment ? 'Confirming...' : `Send ${selectedRscAmount} RSC`}
                  </button>
                </div>
              ) : null}

              {mode === 'swap' ? (
                <div className="space-y-3">
                  <SwapWidget
                    client={thirdwebClient}
                    prefill={{
                      sellToken: {
                        chainId: thirdwebBaseChain.id,
                        tokenAddress: usdcAddress,
                        amount: '1'
                      },
                      buyToken: {
                        chainId: thirdwebBaseChain.id,
                        tokenAddress: rscAddress
                      }
                    }}
                    showThirdwebBranding={false}
                    theme={thirdwebTheme}
                  />

                  <div className="rounded-[22px] border border-cyan-300/20 bg-black/32 p-4">
                    <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Fallback route</div>
                    <h3 className="mt-1 text-base font-black text-white">Aerodrome USDC &rarr; RSC</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                      If thirdweb cannot route ResearchCoin yet, use Aerodrome on Base. Swap USDC to RSC there, return here, then use the Credits tab.
                    </p>
                    <a
                      href={DONATION_CONFIG.RSC_SWAP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 block rounded-2xl border border-cyan-200/45 bg-cyan-300 px-4 py-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white"
                    >
                      Open Aerodrome swap
                    </a>
                  </div>
                </div>
              ) : null}

              {mode === 'buy' ? (
                <BuyWidget
                  key={`buy-${selectedRscAmount}`}
                  client={thirdwebClient}
                  chain={thirdwebBaseChain}
                  amount={Math.max(5, selectedRscAmount).toString()}
                  tokenAddress={rscAddress}
                  title="Buy ResearchCoin"
                  description="Buy RSC on Base, then use Buy Credits to fund mission credits."
                  currency="USD"
                  paymentMethods={['crypto', 'card']}
                  showThirdwebBranding={false}
                  theme={thirdwebTheme}
                  connectOptions={thirdwebPaymentConnectOptions}
                  presetOptions={[5, 10, 20]}
                  onSuccess={() => setWidgetMessage('RSC purchase complete. Use Buy Credits to fund mission credits.')}
                  onError={(error) => handleWidgetError(error)}
                  onCancel={() => setWidgetMessage('Buy flow cancelled.')}
                />
              ) : null}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="font-mono font-black uppercase tracking-[0.14em] text-cyan-200">Receives</div>
              <div className="mt-1">{rscTokenInfo.symbol} on Base</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="font-mono font-black uppercase tracking-[0.14em] text-cyan-200">Credit rate</div>
              <div className="mt-1">1 {rscTokenInfo.symbol} = {DONATION_CONFIG.MISSION_CREDITS_PER_RSC} credits</div>
            </div>
          </div>

          {widgetMessage ? (
            <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs font-bold text-cyan-100">
              {widgetMessage}
              {confirmedTxHash ? (
                <a
                  href={`${DONATION_CONFIG.EXPLORER_BASE_URL}/tx/${confirmedTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200 underline underline-offset-2"
                >
                  View transfer
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default FundingWidgetModal;
