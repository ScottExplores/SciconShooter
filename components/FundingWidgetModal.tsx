import React, { useEffect, useState } from 'react';
import { BuyWidget, SwapWidget } from 'thirdweb/react';
import { ASSETS, DONATION_CONFIG } from '../constants';
import {
  karmaTokenInfo,
  rscTokenInfo,
  thirdwebBaseChain,
  thirdwebBscChain,
  thirdwebClient,
  thirdwebPaymentConnectOptions,
  thirdwebTheme
} from '../services/thirdwebWallet';

export type FundingWidgetMode = 'checkout' | 'swap' | 'buy';
export type FundingCreditToken = 'RSC' | 'KRMA';

interface FundingWidgetModalProps {
  mode: FundingWidgetMode;
  rscAmount?: number;
  initialCreditToken?: FundingCreditToken;
  walletAddress?: string | null;
  onClose: () => void;
  onModeChange: (mode: FundingWidgetMode, rscAmount?: number) => void;
  onCreditPayment: (rscAmount: number, token: FundingCreditToken) => Promise<string>;
  onWidgetError: (message: string) => void;
}

const usdcAddress = DONATION_CONFIG.USDC_CONTRACT_ADDRESS as `0x${string}`;
const rscAddress = DONATION_CONFIG.RSC_CONTRACT_ADDRESS as `0x${string}`;

const fundingTabs: Array<{ mode: FundingWidgetMode; label: string; copy: string }> = [
  { mode: 'checkout', label: 'Buy Credits', copy: 'Spend RSC on Base or promotional KRMA on BSC to add mission credits.' },
  { mode: 'swap', label: 'Swap for RSC', copy: 'Swap Base USDC into ResearchCoin, or open Aerodrome if routing is unavailable.' },
  { mode: 'buy', label: 'Buy RSC', copy: 'Buy ResearchCoin on Base, then use Buy Credits to fund the mission.' }
];

const creditTokenMeta: Record<FundingCreditToken, {
  label: string;
  symbol: string;
  name: string;
  chainLabel: string;
  chain: typeof thirdwebBaseChain;
  tokenAddress: `0x${string}`;
  explorerBaseUrl: string;
  icon: string;
  confirmationCopy: string;
}> = {
  RSC: {
    label: 'Use RSC',
    symbol: rscTokenInfo.symbol,
    name: rscTokenInfo.name,
    chainLabel: 'Base',
    chain: thirdwebBaseChain,
    tokenAddress: rscAddress,
    explorerBaseUrl: DONATION_CONFIG.EXPLORER_BASE_URL,
    icon: ASSETS.REAL_RSC_ICON,
    confirmationCopy: 'This sends ResearchCoin from your connected wallet to the SciCon treasury on Base. No Bridge catalog needed, so RSC works as a normal ERC-20 token.'
  },
  KRMA: {
    label: 'Use KARMA',
    symbol: karmaTokenInfo.symbol,
    name: karmaTokenInfo.name,
    chainLabel: 'BNB Smart Chain',
    chain: thirdwebBscChain,
    tokenAddress: DONATION_CONFIG.KARMA_CONTRACT_ADDRESS as `0x${string}`,
    explorerBaseUrl: DONATION_CONFIG.EXPLORER_BSC_BASE_URL,
    icon: ASSETS.KARMA_TOKEN,
    confirmationCopy: 'Promotional credits use KARMA on BNB Smart Chain. Confirm the KRMA transfer to the same SciCon treasury wallet, then credits are saved to your connected profile.'
  }
};

const FundingWidgetModal: React.FC<FundingWidgetModalProps> = ({
  mode,
  rscAmount = DONATION_CONFIG.PRESET_RSC_AMOUNTS[0],
  initialCreditToken = 'RSC',
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
  const [selectedCreditToken, setSelectedCreditToken] = useState<FundingCreditToken>(initialCreditToken);
  const [paymentHelpToken, setPaymentHelpToken] = useState<FundingCreditToken | null>(null);
  const creditToken = creditTokenMeta[selectedCreditToken];
  const missionCredits = selectedRscAmount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC;

  useEffect(() => {
    setSelectedCreditToken(initialCreditToken);
  }, [initialCreditToken]);

  const updateMode = (nextMode: FundingWidgetMode) => {
    setWidgetMessage('');
    setPaymentHelpToken(null);
    onModeChange(nextMode, selectedRscAmount);
  };

  const handlePackageChange = (amount: number) => {
    setSelectedRscAmount(amount);
    onModeChange(mode, amount);
  };

  const handleCreditSuccess = () => {
    setPaymentHelpToken(null);
    setWidgetMessage(`Confirmed. ${missionCredits} wallet-linked credits saved to your profile.`);
  };

  const handleWidgetError = (error: Error) => {
    const message = error.message || 'Payment flow could not complete.';
    setPaymentHelpToken(selectedCreditToken);
    setWidgetMessage(message);
    onWidgetError(message);
  };

  const handleDirectCreditPayment = async () => {
    setIsSubmittingPayment(true);
    setConfirmedTxHash('');
    setPaymentHelpToken(null);
    setWidgetMessage(`Confirm the ${creditToken.symbol} transfer in your wallet. Credits are only added after the ${creditToken.chainLabel} transaction confirms.`);

    try {
      const txHash = await onCreditPayment(selectedRscAmount, selectedCreditToken);
      setConfirmedTxHash(txHash);
      handleCreditSuccess();
    } catch (error: any) {
      handleWidgetError(error);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex touch-pan-y items-center justify-center bg-black/78 p-3 backdrop-blur-md">
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 shadow-[0_28px_100px_rgba(0,0,0,0.68)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />

        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">RSC Funding</div>
            <h2 className="arcade-font mt-1 text-xl font-black tracking-widest text-white">Mission Wallet</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Pay with RSC, or use promotional KARMA on BSC.
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

        <div className="custom-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">
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
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(['RSC', 'KRMA'] as FundingCreditToken[]).map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => {
                      setSelectedCreditToken(token);
                      setWidgetMessage('');
                      setPaymentHelpToken(null);
                    }}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                      selectedCreditToken === token
                        ? 'border-yellow-200 bg-yellow-200 text-slate-950'
                        : 'border-white/10 bg-black/30 text-white hover:border-yellow-200/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {token === 'KRMA' ? (
                        <img src={ASSETS.KARMA_TOKEN} alt="" className="h-7 w-7 rounded-full border border-purple-200/35 bg-slate-950 object-cover" />
                      ) : (
                        <img src={ASSETS.REAL_RSC_ICON} alt="" className="h-7 w-7 rounded-full border border-white/10 bg-white" />
                      )}
                      <div>
                        <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em]">{creditTokenMeta[token].label}</div>
                        <div className="text-[9px] font-semibold opacity-70">{creditTokenMeta[token].chainLabel}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedCreditToken === 'KRMA' ? (
                <div className="mt-2 rounded-2xl border border-purple-200/20 bg-purple-400/10 p-3 text-[11px] font-semibold leading-relaxed text-purple-100">
                  Promotional period: KARMA is on BNB Smart Chain. 1 KRMA gets the same 100 mission credits as 1 RSC.
                </div>
              ) : null}

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
                    <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em]">{amount} {creditToken.symbol}</div>
                    <div className="mt-1 text-lg font-black">{amount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC}</div>
                    <div className="text-[9px] uppercase tracking-[0.12em] opacity-70">credits</div>
                  </button>
                ))}
              </div>

              {selectedCreditToken === 'KRMA' ? (
                <a
                  href={DONATION_CONFIG.KARMA_SWAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block rounded-2xl border border-purple-200/35 bg-purple-300/15 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-purple-100 transition hover:border-purple-100 hover:bg-purple-300/25"
                >
                  Get KARMA on PancakeSwap
                </a>
              ) : null}
            </>
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
                    {selectedCreditToken === 'KRMA' ? (
                      <img src={ASSETS.KARMA_TOKEN} alt="" className="h-11 w-11 shrink-0 rounded-full border border-purple-200/35 bg-slate-950 object-cover" />
                    ) : (
                      <img src={creditToken.icon} alt="" className="h-11 w-11 rounded-full border border-white/10 bg-white" />
                    )}
                    <div>
                      <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Direct {creditToken.chainLabel} transfer</div>
                      <div className="mt-1 text-sm font-black text-white">{selectedRscAmount} {creditToken.symbol} &rarr; {missionCredits} credits</div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-300">
                    {creditToken.confirmationCopy}
                  </p>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-[10px] leading-relaxed text-slate-400">
                    <div><span className="font-black text-slate-200">Wallet:</span> {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect on confirm'}</div>
                    <div><span className="font-black text-slate-200">Token:</span> {creditToken.tokenAddress.slice(0, 6)}...{creditToken.tokenAddress.slice(-4)}</div>
                    <div><span className="font-black text-slate-200">Network:</span> {creditToken.chainLabel}</div>
                    <div><span className="font-black text-slate-200">Treasury:</span> {DONATION_CONFIG.RECIPIENT_ADDRESS.slice(0, 6)}...{DONATION_CONFIG.RECIPIENT_ADDRESS.slice(-4)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDirectCreditPayment}
                    disabled={isSubmittingPayment}
                    className="mt-4 w-full rounded-2xl border border-emerald-200/50 bg-emerald-300 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSubmittingPayment ? 'Confirming...' : `Send ${selectedRscAmount} ${creditToken.symbol}`}
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
              <div className="mt-1">{selectedCreditToken === 'KRMA' ? `${karmaTokenInfo.symbol} on BSC` : `${rscTokenInfo.symbol} on Base`}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="font-mono font-black uppercase tracking-[0.14em] text-cyan-200">Credit rate</div>
              <div className="mt-1">1 {creditToken.symbol} = {DONATION_CONFIG.MISSION_CREDITS_PER_RSC} credits</div>
            </div>
          </div>

          {widgetMessage ? (
            <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs font-bold text-cyan-100">
              {widgetMessage}
              {confirmedTxHash ? (
                <a
                  href={`${creditToken.explorerBaseUrl}/tx/${confirmedTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200 underline underline-offset-2"
                >
                  View transfer
                </a>
              ) : null}
              {paymentHelpToken === 'RSC' && !confirmedTxHash ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateMode('swap')}
                    className="rounded-xl border border-cyan-200/45 bg-cyan-300 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-white"
                  >
                    Swap for RSC
                  </button>
                  <button
                    type="button"
                    onClick={() => updateMode('buy')}
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:border-cyan-200/60 hover:bg-cyan-300/15"
                  >
                    Buy RSC
                  </button>
                  <a
                    href={DONATION_CONFIG.RSC_SWAP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="col-span-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200/60"
                  >
                    Open Aerodrome route
                  </a>
                </div>
              ) : null}
              {paymentHelpToken === 'KRMA' && !confirmedTxHash ? (
                <a
                  href={DONATION_CONFIG.KARMA_SWAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block rounded-xl border border-purple-200/45 bg-purple-300 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-white"
                >
                  Get KARMA on PancakeSwap
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
