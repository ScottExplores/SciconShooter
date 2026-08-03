import React from 'react';
import type {
  CampaignCombatBranchRuntimeResult,
  PresentDropRuntimeResult
} from '../services/campaignBranchRuntime';
import PixelActionButton from './PixelActionButton';

type CampaignBranchResult = (
  | ({ kind: 'present-drop' } & PresentDropRuntimeResult)
  | ({ kind: 'combat' } & CampaignCombatBranchRuntimeResult)
) & {
  duplicate?: boolean;
  newlyAffordableUpgrade?: string | null;
};

interface CampaignBranchResultOverlayProps {
  branchName: string;
  result: CampaignBranchResult;
  onReturnToMap: () => void;
}

const CampaignBranchResultOverlay: React.FC<CampaignBranchResultOverlayProps> = ({
  branchName,
  result,
  onReturnToMap
}) => (
  <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/88 p-3 backdrop-blur-sm">
    <section
      className="relative w-full max-w-md overflow-hidden border border-cyan-200/45 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.18),transparent_38%),linear-gradient(180deg,rgba(8,30,52,0.98),rgba(2,6,23,0.99))] p-4 shadow-[0_0_40px_rgba(34,211,238,0.2)] [clip-path:polygon(16px_0,calc(100%_-_16px)_0,100%_16px,100%_calc(100%_-_16px),calc(100%_-_16px)_100%,16px_100%,0_calc(100%_-_16px),0_16px)]"
      aria-labelledby="campaign-branch-result-title"
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
      <header className="text-center">
        <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-yellow-200">Optional Mastery Route</p>
        <h2 id="campaign-branch-result-title" className="arcade-font mt-1 text-2xl font-black uppercase tracking-widest text-cyan-50">
          {result.kind === 'present-drop' ? 'Cache Recovered' : 'Route Secured'}
        </h2>
        <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-200">{branchName}</p>
      </header>

      {result.kind === 'present-drop' ? (
        <div className="mt-4 border border-cyan-200/20 bg-slate-950/55 p-3">
          <div className="flex items-end justify-between gap-3 border-b border-cyan-100/15 pb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Presents destroyed</span>
            <strong className="text-2xl font-black text-white">{result.destroyedTotal}</strong>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center">
            {([
              ['Standard', result.destroyed.standard, 'text-cyan-100'],
              ['Armored', result.destroyed.armored, 'text-slate-100'],
              ['Fast', result.destroyed.fast, 'text-emerald-200'],
              ['Golden', result.destroyed.golden, 'text-yellow-200']
            ] as const).map(([label, value, color]) => (
              <span key={label} className="border border-white/10 bg-white/[0.035] px-1 py-2">
                <small className="block text-[7px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</small>
                <b className={`mt-1 block text-lg ${color}`}>{value}</b>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 border border-cyan-200/20 bg-slate-950/55 p-3 text-center">
          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Combat objective</span>
          <strong className="mt-1 block text-2xl font-black text-white">
            {result.success ? 'Complete' : 'Incomplete'}
          </strong>
          <small className="mt-1 block font-mono text-[9px] uppercase tracking-widest text-cyan-200">
            {result.objectiveUnitsCompleted} authored units cleared
          </small>
        </div>
      )}

      <dl className="mt-3 grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">
        <div className="flex justify-between border-b border-white/8 px-1 py-1.5"><dt className="text-slate-400">Base route reward</dt><dd className="text-yellow-100">+{result.kind === 'present-drop' ? result.baseCacheReward : result.baseCompletionReward}</dd></div>
        {result.kind === 'present-drop' ? (
          <div className="flex justify-between border-b border-white/8 px-1 py-1.5"><dt className="text-slate-400">Present Tokens collected</dt><dd className="text-yellow-100">+{result.collectedPresentCoins}</dd></div>
        ) : null}
        <div className="flex justify-between border-b border-white/8 px-1 py-1.5"><dt className="text-slate-400">One-time completion bonus</dt><dd className="text-yellow-100">+{result.oneTimeCompletionBonus}</dd></div>
        <div className="mt-1 flex items-center justify-between border border-yellow-200/35 bg-yellow-300/10 px-3 py-2.5">
          <dt className="font-black text-yellow-100">Total Tokens earned</dt>
          <dd className="text-xl font-black text-yellow-200">{result.duplicate ? 0 : result.totalCoins}</dd>
        </div>
      </dl>

      <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-200">
        {result.duplicate ? 'Reward was already secured. No duplicate Tokens were added.' : 'Reward secured once / Main Mission checkpoint preserved'}
      </p>
      {result.newlyAffordableUpgrade ? (
        <p className="mt-2 border border-yellow-200/30 bg-yellow-300/10 px-3 py-2 text-center text-[9px] font-black uppercase tracking-[0.1em] text-yellow-100">
          Newly affordable: {result.newlyAffordableUpgrade}
        </p>
      ) : null}
      <PixelActionButton tone="green" ready shine className="mt-4 w-full" onClick={onReturnToMap}>
        Return to Campaign Map
      </PixelActionButton>
    </section>
  </div>
);

export default CampaignBranchResultOverlay;
