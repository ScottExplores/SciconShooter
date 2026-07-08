import React from 'react';
import { Stats, Upgrades } from '../types';

interface UpgradeShopProps {
  stats: Stats;
  onUpgrade: (type: keyof Upgrades | 'repair') => void;
  onClose: () => void;
}

type ModuleKind = 'fire' | 'speed' | 'lock' | 'repair';

const upgradeCopy: Record<keyof Upgrades, { title: string; tag: string; kind: ModuleKind; description: string }> = {
  fireRate: {
    title: 'Rapid Review',
    tag: 'Fire',
    kind: 'fire',
    description: 'Faster shots and tighter pressure.'
  },
  speed: {
    title: 'Velocity Grant',
    tag: 'Speed',
    kind: 'speed',
    description: 'Sharper movement and quicker dodges.'
  },
  missile: {
    title: 'Target Lock',
    tag: 'Lock',
    kind: 'lock',
    description: 'Auto-support missiles for heavy waves.'
  }
};

const ModuleIcon = ({ kind, className = 'h-10 w-10' }: { kind: ModuleKind; className?: string }) => {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {kind === 'fire' ? (
        <>
          <path {...common} d="M27 4 11 27h12l-2 17 16-24H25z" />
          <path {...common} d="M18 35h10" />
        </>
      ) : null}
      {kind === 'speed' ? (
        <>
          <path {...common} d="M24 5c7 3 12 10 12 18 0 9-6 16-12 20-6-4-12-11-12-20 0-8 5-15 12-18Z" />
          <path {...common} d="M19 24h10M16 38l-6 5 2-10M32 38l6 5-2-10" />
          <circle cx="24" cy="17" r="3" fill="currentColor" />
        </>
      ) : null}
      {kind === 'lock' ? (
        <>
          <circle {...common} cx="24" cy="24" r="13" />
          <circle {...common} cx="24" cy="24" r="4" />
          <path {...common} d="M24 5v7M24 36v7M5 24h7M36 24h7" />
        </>
      ) : null}
      {kind === 'repair' ? (
        <>
          <path {...common} d="M18 7h12v12h11v12H30v10H18V31H7V19h11z" />
          <path {...common} d="M18 19h12M18 31h12" />
        </>
      ) : null}
    </svg>
  );
};

const UpgradeShop: React.FC<UpgradeShopProps> = ({ stats, onUpgrade, onClose }) => {
  const moduleTypes = Object.keys(upgradeCopy) as Array<keyof Upgrades>;
  const availableUpgradeCount = moduleTypes.filter((type) => stats.upgrades[type] < 5).length;

  return (
    <div className="absolute inset-0 z-30 bg-black/82 backdrop-blur-md">
      <div className="mx-auto flex h-[100dvh] w-full max-w-6xl items-center justify-center overflow-y-auto px-3 py-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 sm:pb-5">
        <div className="relative flex min-h-[min(760px,calc(100dvh-1.5rem))] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-cyan-200/24 bg-slate-950/95 shadow-[0_28px_100px_rgba(0,0,0,0.68)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_24%,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,rgba(59,130,246,0.1),transparent_42%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/80 to-transparent" />

          <div className="relative z-10 flex flex-1 flex-col p-4 sm:p-6">
            <header className="grid gap-3 border-b border-white/10 pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/75">Upgrade Bay</div>
                <h2 className="arcade-font mt-1 text-3xl font-black uppercase leading-none tracking-widest text-white sm:text-5xl">Ship Modules</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                  Dock for a quick lab tune-up. Module upgrades are mission-only, reset each run, and do not require payment.
                </p>
              </div>

              <div className="rounded-[18px] border border-cyan-200/20 bg-cyan-950/28 px-4 py-3 text-right">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Modules Ready</div>
                <div className="mt-1 font-mono text-4xl font-black leading-none text-white">{availableUpgradeCount}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">
                  Free tune-up
                </div>
              </div>
            </header>

            <main className="mt-4 grid flex-1 grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-4">
              {moduleTypes.map((type) => {
                const level = stats.upgrades[type];
                const isMaxed = level >= 5;
                const isReady = !isMaxed;
                const copy = upgradeCopy[type];

                return (
                  <button
                    key={type}
                    disabled={!isReady}
                    onClick={() => onUpgrade(type)}
                    className={`group relative min-h-[172px] overflow-hidden rounded-[20px] border p-4 text-left transition active:scale-[0.98] sm:min-h-[210px] ${
                      isReady
                        ? 'border-cyan-200/60 bg-cyan-300/12 text-white shadow-[0_20px_70px_rgba(34,211,238,0.12)] hover:-translate-y-0.5 hover:bg-cyan-300/18'
                        : 'border-white/10 bg-black/28 text-slate-500'
                    }`}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-[16px] border p-3 ${isReady ? 'border-cyan-100/35 bg-cyan-300/14 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-500'}`}>
                        <ModuleIcon kind={copy.kind} />
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/24 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.14em]">
                        {isMaxed ? 'Max' : 'Free'}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">{copy.tag}</div>
                      <h3 className="mt-1 text-xl font-black uppercase leading-tight tracking-wide text-white">{copy.title}</h3>
                      <p className="mt-2 text-sm leading-snug text-slate-300">{copy.description}</p>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        <span>Level</span>
                        <span>{level}/5</span>
                      </div>
                      <div className="flex h-2 gap-1">
                        {[...Array(5)].map((_, index) => (
                          <span key={index} className={`flex-1 rounded-full ${index < level ? 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.5)]' : 'bg-slate-800'}`} />
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}

              <button
                disabled={stats.lives >= 3}
                onClick={() => onUpgrade('repair')}
                className={`group relative min-h-[172px] overflow-hidden rounded-[20px] border p-4 text-left transition active:scale-[0.98] sm:min-h-[210px] ${
                  stats.lives < 3
                    ? 'border-rose-200/60 bg-rose-300/12 text-white shadow-[0_20px_70px_rgba(251,113,133,0.12)] hover:-translate-y-0.5 hover:bg-rose-300/18'
                    : 'border-white/10 bg-black/28 text-slate-500'
                }`}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-[16px] border p-3 ${stats.lives < 3 ? 'border-rose-100/35 bg-rose-300/14 text-rose-100' : 'border-white/10 bg-white/[0.03] text-slate-500'}`}>
                    <ModuleIcon kind="repair" />
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/24 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.14em]">
                    {stats.lives >= 3 ? 'Full' : 'Free'}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/70">Repair</div>
                  <h3 className="mt-1 text-xl font-black uppercase leading-tight tracking-wide text-white">Field Repair</h3>
                  <p className="mt-2 text-sm leading-snug text-slate-300">Recover one heart and stay in the run.</p>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    <span>Hull</span>
                    <span>{stats.lives}</span>
                  </div>
                  <div className="flex h-2 gap-1">
                    {[...Array(5)].map((_, index) => (
                      <span key={index} className={`flex-1 rounded-full ${index < stats.lives ? 'bg-rose-300 shadow-[0_0_12px_rgba(253,164,175,0.5)]' : 'bg-slate-800'}`} />
                    ))}
                  </div>
                </div>
              </button>
            </main>
          </div>

          <div className="relative z-10 border-t border-white/10 bg-slate-950/96 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button onClick={onClose} className="scicon-btn w-full py-4 text-base font-bold tracking-widest">
              Return to mission
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeShop;
