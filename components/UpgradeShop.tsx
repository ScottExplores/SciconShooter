import React, { useEffect, useState } from 'react';
import { DonationStatus, PowerupType, Stats, Upgrades, WalletSession } from '../types';
import { ASSETS, DONATION_CONFIG, UPGRADE_BASE_COSTS } from '../constants';

interface UpgradeShopProps {
  stats: Stats;
  wallet: WalletSession;
  onUpgrade: (type: keyof Upgrades | 'repair') => void;
  onDeposit: (coins: number) => void;
  onBuyPowerup: (type: PowerupType) => void;
  onClose: () => void;
  onConnectWallet: (connectorId?: string) => void;
  onBuyMissionCredits: (rscAmount: number) => void;
  onOpenRscSwap: () => void;
  onClaimProfileCredits: (amount: number) => void;
  labFundingStatus: DonationStatus;
  labFundingHash: string;
  labFundingExplorerBaseUrl: string;
  labFundingError: string;
  gameId: number;
}

const fundingPackages = DONATION_CONFIG.PRESET_RSC_AMOUNTS.map((amount) => ({
  rsc: amount,
  credits: amount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC
}));

const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

type FounderPowerupType = Exclude<PowerupType, PowerupType.EXTRA_LIFE | PowerupType.RESEARCH_BEAM>;

const upgradeCopy: Record<keyof Upgrades, { title: string; tag: string; icon: string; description: string }> = {
  fireRate: {
    title: 'Rapid Review',
    tag: 'Fire',
    icon: '⚡',
    description: 'Faster shots'
  },
  speed: {
    title: 'Velocity Grant',
    tag: 'Speed',
    icon: '🚀',
    description: 'Sharper moves'
  },
  missile: {
    title: 'Proton Missiles',
    tag: 'Lock',
    icon: '🎯',
    description: 'Auto support'
  }
};

const powerupCopy: Record<FounderPowerupType, { title: string; tag: string; image: string }> = {
  [PowerupType.DOUBLE_SHOT]: {
    title: 'Double Shot',
    tag: 'Parallel fire',
    image: ASSETS.FOUNDER_4
  },
  [PowerupType.TRIPLE_SHOT]: {
    title: 'Triple Shot',
    tag: 'Spread fire',
    image: ASSETS.FOUNDER_BRIAN
  },
  [PowerupType.MAGNET]: {
    title: 'Credit Magnet',
    tag: 'Pull coins',
    image: ASSETS.FOUNDER_PATRICK
  },
  [PowerupType.SHIELD]: {
    title: 'Shield',
    tag: 'Block hits',
    image: ASSETS.FOUNDER_JEFFREY
  }
};

const purchasablePowerups: FounderPowerupType[] = [
  PowerupType.DOUBLE_SHOT,
  PowerupType.TRIPLE_SHOT,
  PowerupType.MAGNET,
  PowerupType.SHIELD
];

const labFundingToken = {
  symbol: 'RSC',
  chain: 'Base'
};

const getStatusText = (status: DonationStatus) => {
  const statusText: Record<DonationStatus, string> = {
    idle: 'Confirmed token transfers save wallet-linked credits.',
    switching_network: `Switching to ${labFundingToken.chain}...`,
    processing: 'Confirm the token transfer in your wallet.',
    confirming: `Waiting for ${labFundingToken.chain} confirmation...`,
    success: 'Credits added to your wallet bank.',
    error: ''
  };

  return statusText[status];
};

const UpgradeShop: React.FC<UpgradeShopProps> = ({
  stats,
  wallet,
  onUpgrade,
  onDeposit,
  onBuyPowerup,
  onClose,
  onConnectWallet,
  onBuyMissionCredits,
  onOpenRscSwap,
  onClaimProfileCredits,
  labFundingStatus,
  labFundingHash,
  labFundingExplorerBaseUrl,
  labFundingError,
  gameId
}) => {
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [deployAmountInput, setDeployAmountInput] = useState('');
  const [isDeployBankOpen, setIsDeployBankOpen] = useState(false);
  const profileCredits = stats.profileCredits || 0;
  const deployAmount = Math.max(0, Math.min(profileCredits, Math.floor(Number(deployAmountInput) || 0)));

  useEffect(() => {
    if (profileCredits <= 0) {
      setDeployAmountInput('');
      setIsDeployBankOpen(false);
      return;
    }

    setDeployAmountInput((current) => {
      const currentAmount = Math.floor(Number(current) || 0);
      if (currentAmount > 0 && currentAmount <= profileCredits) return current;
      return String(profileCredits);
    });
  }, [profileCredits]);

  const openDeployBank = () => {
    if (profileCredits <= 0) return;
    setDeployAmountInput((current) => {
      const currentAmount = Math.floor(Number(current) || 0);
      if (currentAmount > 0 && currentAmount <= profileCredits) return current;
      return String(profileCredits);
    });
    setIsDeployBankOpen(true);
  };

  const handleDeployCredits = () => {
    if (deployAmount <= 0) return;
    onClaimProfileCredits(deployAmount);
    setIsDeployBankOpen(false);
  };

  const getCost = (type: keyof Upgrades) => {
    const level = stats.upgrades[type];
    return UPGRADE_BASE_COSTS[type] + (5 * (Math.pow(2, level) - 1));
  };

  const getRepairCost = () => {
    const repairs = stats.repairsCount || 0;
    return UPGRADE_BASE_COSTS.repair + (repairs * 5);
  };

  const getPowerupCost = (type: PowerupType) => (
    UPGRADE_BASE_COSTS.powerup + ((stats.powerupUses?.[type] || 0) * 10)
  );

  const handlePromoCode = (event: React.FormEvent) => {
    event.preventDefault();
    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    if (code === 'EXPLORES') {
      const storageKey = `scicon_promo_explores_${gameId}`;
      if (sessionStorage.getItem(storageKey)) {
        setPromoMessage({ text: 'Already redeemed this mission', type: 'error' });
        setTimeout(() => setPromoMessage(null), 2000);
        return;
      }

      onDeposit(100);
      sessionStorage.setItem(storageKey, 'true');
      setPromoMessage({ text: '+100 mission credits', type: 'success' });
      setPromoCode('');
      setTimeout(() => setPromoMessage(null), 2500);
      return;
    }

    if (code === 'HUMANITY') {
      onDeposit(1000);
      setPromoMessage({ text: '+1000 mission credits', type: 'success' });
      setPromoCode('');
      setTimeout(() => setPromoMessage(null), 2500);
      return;
    }

    setPromoMessage({ text: 'Invalid access code', type: 'error' });
    setTimeout(() => setPromoMessage(null), 2000);
  };

  const isFundingBusy = labFundingStatus === 'switching_network' || labFundingStatus === 'processing' || labFundingStatus === 'confirming';
  const canBuyAnyUpgrade = (Object.keys(upgradeCopy) as Array<keyof Upgrades>).some((type) => stats.coins >= getCost(type) && stats.upgrades[type] < 5)
    || stats.coins >= getRepairCost()
    || purchasablePowerups.some((type) => stats.coins >= getPowerupCost(type));
  const txExplorerLabel = 'BaseScan';

  return (
    <div className="absolute inset-0 z-30 bg-black/82 backdrop-blur-md">
      <div className="mx-auto flex h-[100dvh] w-full max-w-5xl items-start justify-center overflow-y-auto px-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-2 sm:p-4">
        <div className="relative my-2 flex w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950/94 shadow-[0_26px_90px_rgba(0,0,0,0.6)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent"></div>

          <div className="relative z-10 flex max-h-[calc(100dvh-1rem)] flex-col">
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 pb-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="arcade-font text-2xl font-black leading-none tracking-widest text-white sm:text-3xl">LAB BAY</h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/75">Fund. Upgrade. Return.</p>
                </div>

                <div className={`min-w-[138px] rounded-2xl border px-3 py-2 ${canBuyAnyUpgrade ? 'border-yellow-300/40 bg-yellow-300/10' : 'border-cyan-300/20 bg-cyan-950/25'}`}>
                  <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200/70">Mission Credits</span>
                  <div className="mt-1 flex items-center gap-2">
                    <img src={ASSETS.RSC_TOKEN} className="h-5 w-5" alt="Credits" />
                    <span className="font-mono text-2xl font-bold text-white">{stats.coins}</span>
                  </div>
                  <button
                    type="button"
                    onClick={openDeployBank}
                    disabled={profileCredits <= 0}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/28 p-2 text-left transition hover:border-yellow-100/45 hover:bg-yellow-200/10 disabled:cursor-not-allowed disabled:opacity-65"
                    aria-label="Open wallet bank deploy controls"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-yellow-100/80">Wallet Bank</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <img src={ASSETS.RSC_TOKEN} className="h-4 w-4" alt="" />
                          <span className="font-mono text-base font-black text-yellow-50">{profileCredits}</span>
                          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">ready</span>
                        </div>
                      </div>
                      <span className="rounded-full border border-yellow-100/25 bg-yellow-200/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-yellow-100">
                        Deploy
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] font-semibold leading-tight text-slate-500">
                      {profileCredits > 0 ? 'Tap to choose how many enter this run.' : 'Buy credits below to fill the bank.'}
                    </div>
                  </button>
                </div>
              </div>

              <section className="mt-3 rounded-[22px] border border-cyan-300/15 bg-white/[0.04] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">Ship Modules</div>
                    <p className="mt-1 text-xs text-slate-400">Mission-only upgrades, condensed for mobile.</p>
                  </div>
                  {canBuyAnyUpgrade ? (
                    <div className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-yellow-100">
                      Ready
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(upgradeCopy) as Array<keyof Upgrades>).map((type) => {
                    const cost = getCost(type);
                    const level = stats.upgrades[type];
                    const isReady = stats.coins >= cost && level < 5;
                    const copy = upgradeCopy[type];

                    return (
                      <button
                        key={type}
                        disabled={!isReady}
                        onClick={() => onUpgrade(type)}
                        className={`min-h-[116px] rounded-2xl border p-2 text-left transition active:scale-95 ${isReady ? 'border-cyan-300/55 bg-cyan-300/12 text-white hover:bg-cyan-300/20' : 'border-white/8 bg-black/25 text-slate-500'}`}
                      >
                        <div className="text-2xl">{copy.icon}</div>
                        <div className="mt-2 text-[10px] font-black uppercase leading-tight tracking-wide">{copy.tag}</div>
                        <div className="mt-1 text-[9px] leading-tight text-slate-400">{copy.description}</div>
                        <div className="mt-2 flex h-1 gap-0.5">
                          {[...Array(5)].map((_, index) => (
                            <span key={index} className={`flex-1 rounded-full ${index < level ? 'bg-cyan-300' : 'bg-slate-800'}`}></span>
                          ))}
                        </div>
                        <div className="mt-2 font-mono text-[10px] font-black text-white">{level >= 5 ? 'MAX' : `${cost}`}</div>
                      </button>
                    );
                  })}

                  <button
                    disabled={stats.coins < getRepairCost()}
                    onClick={() => onUpgrade('repair')}
                    className={`min-h-[116px] rounded-2xl border p-2 text-left transition active:scale-95 ${stats.coins >= getRepairCost() ? 'border-red-300/55 bg-red-300/12 text-white hover:bg-red-300/20' : 'border-white/8 bg-black/25 text-slate-500'}`}
                  >
                    <div className="text-2xl">🧪</div>
                    <div className="mt-2 text-[10px] font-black uppercase leading-tight tracking-wide">Repair</div>
                    <div className="mt-1 text-[9px] leading-tight text-slate-400">Recover one life</div>
                    <div className="mt-2 flex gap-0.5">
                      {[...Array(Math.max(1, stats.lives))].slice(0, 5).map((_, index) => (
                        <span key={index} className="h-1 flex-1 rounded-full bg-red-300"></span>
                      ))}
                    </div>
                    <div className="mt-2 font-mono text-[10px] font-black text-white">{getRepairCost()}</div>
                  </button>
                </div>
              </section>

              <section className="mt-3 rounded-[22px] border border-indigo-300/15 bg-indigo-300/[0.06] p-3">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-200">Founder Powerups</div>
                    <p className="mt-1 text-xs text-slate-400">Four field drops. Starts at 10 credits and scales each use.</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="grid grid-cols-4 gap-2">
                  {purchasablePowerups.map((type) => {
                    const copy = powerupCopy[type];
                    const cost = getPowerupCost(type);
                    const canBuy = stats.coins >= cost;

                    return (
                      <button
                        key={type}
                        onClick={() => onBuyPowerup(type)}
                        disabled={!canBuy}
                        className={`min-h-[104px] rounded-2xl border p-2 text-left transition active:scale-95 ${canBuy ? 'border-indigo-200/45 bg-white/[0.08] text-white hover:bg-white/[0.12]' : 'border-white/8 bg-black/25 text-slate-500'}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/20 bg-slate-900">
                            <img src={copy.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </span>
                          <span className={`rounded-full px-1.5 py-1 text-[8px] font-black uppercase tracking-wide ${canBuy ? 'bg-white text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                            {cost}
                          </span>
                        </div>
                        <div className="mt-2 text-[9px] font-black uppercase leading-tight tracking-wide">{copy.title}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-400">{copy.tag}</div>
                      </button>
                    );
                  })}
                  </div>
                </div>
              </section>

              <section className="mt-3 rounded-[22px] border border-emerald-300/20 bg-emerald-300/8 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">RSC Funding</div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wide text-white">Mission credits</h3>
                    <p className="mt-1 text-xs text-slate-400">Buy wallet-linked credits, then deploy them into this run above.</p>
                  </div>

                  {wallet.address ? (
                    <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-right">
                      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-100">Base ready</div>
                      <div className="mt-1 text-[10px] font-bold text-white">{shortenAddress(wallet.address)}</div>
                    </div>
                  ) : null}
                </div>

                {!wallet.address ? (
                  <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-black/30 p-2">
                    <button
                      type="button"
                      onClick={() => onConnectWallet()}
                      className="w-full rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100 transition hover:border-cyan-100"
                    >
                      {wallet.status === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                    {wallet.error ? <div className="mt-2 px-1 text-[10px] leading-relaxed text-red-300">{wallet.error}</div> : null}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {fundingPackages.map((fundingPackage) => (
                    <button
                      key={fundingPackage.rsc}
                      onClick={() => {
                        if (wallet.address) {
                          onBuyMissionCredits(fundingPackage.rsc);
                        }
                      }}
                      disabled={!wallet.address || isFundingBusy}
                      className="rounded-2xl border border-emerald-300/20 bg-black/38 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-300/10 disabled:cursor-wait disabled:opacity-60"
                    >
                      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-200">{fundingPackage.rsc} {labFundingToken.symbol}</div>
                      <div className="mt-1 text-lg font-black text-white">{fundingPackage.credits}</div>
                      <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-slate-400">credits</div>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onOpenRscSwap}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/10"
                >
                  Need RSC? Buy ResearchCoin
                </button>

                <div className="mt-3 min-h-5 font-mono text-[10px] uppercase tracking-[0.14em]">
                  {labFundingStatus === 'error' ? (
                    <span className="text-red-300">{labFundingError}</span>
                  ) : (
                    <span className={labFundingStatus === 'success' ? 'text-emerald-200' : 'text-slate-400'}>
                      {getStatusText(labFundingStatus)}
                    </span>
                  )}
                </div>

                {labFundingHash ? (
                  <a
                    href={`${labFundingExplorerBaseUrl}/tx/${labFundingHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300 underline underline-offset-2 hover:text-white"
                  >
                    View tx on {txExplorerLabel}
                  </a>
                ) : null}

                <form onSubmit={handlePromoCode} className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(event) => {
                      setPromoCode(event.target.value);
                      setPromoMessage(null);
                    }}
                    placeholder="ACCESS CODE"
                    className="w-full border border-transparent bg-transparent px-2 py-2 text-center font-mono text-xs uppercase tracking-widest text-cyan-200 outline-none placeholder-slate-600 focus:border-cyan-400/40"
                  />
                  <button
                    type="submit"
                    className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-100 transition hover:border-cyan-100"
                  >
                    Redeem
                  </button>
                </form>

                {promoMessage ? (
                  <div className={`mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${promoMessage.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                    {promoMessage.text}
                  </div>
                ) : null}
              </section>
            </div>

            <div className="border-t border-white/10 bg-slate-950/96 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button onClick={onClose} className="scicon-btn w-full py-4 text-base font-bold tracking-widest">
                Return to mission
              </button>
            </div>
          </div>
        </div>
      </div>

      {isDeployBankOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-md">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setIsDeployBankOpen(false)}
            aria-label="Close deploy wallet bank"
          />

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleDeployCredits();
            }}
            className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-yellow-200/30 bg-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.7)]"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-100 to-transparent" />

            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-yellow-100/80">Wallet Bank</div>
                  <h3 className="arcade-font mt-1 text-xl font-black uppercase tracking-widest text-white">Deploy Credits</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    Move wallet-linked credits into this mission. Only deployed credits can be spent on upgrades during the run.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDeployBankOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs font-black text-white transition hover:border-yellow-100/60"
                  aria-label="Close deploy credits"
                >
                  X
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-yellow-100/15 bg-yellow-200/8 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Available</span>
                  <span className="flex items-center gap-2 font-mono text-lg font-black text-yellow-50">
                    <img src={ASSETS.RSC_TOKEN} className="h-5 w-5" alt="" />
                    {profileCredits}
                  </span>
                </div>

                <label className="mt-4 block">
                  <span className="sr-only">Credits to deploy</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={profileCredits}
                    step={1}
                    value={deployAmountInput}
                    onChange={(event) => setDeployAmountInput(event.target.value)}
                    autoFocus
                    className="w-full rounded-2xl border border-yellow-100/25 bg-black/45 px-4 py-4 text-center font-mono text-4xl font-black text-yellow-50 outline-none transition focus:border-yellow-100 focus:bg-black/70"
                  />
                </label>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[100, 500, profileCredits]
                    .filter((amount, index, list) => amount > 0 && amount <= profileCredits && list.indexOf(amount) === index)
                    .map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setDeployAmountInput(String(amount))}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-100 transition hover:border-yellow-100/50 hover:bg-yellow-200/10"
                      >
                        {amount === profileCredits ? 'All' : amount}
                      </button>
                    ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="submit"
                  disabled={deployAmount <= 0}
                  className="rounded-2xl border border-yellow-100/45 bg-yellow-200 px-4 py-4 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-500"
                >
                  Deploy {deployAmount > 0 ? deployAmount : ''} Credits
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeployBankOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/30"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default UpgradeShop;
