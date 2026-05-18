import React from 'react';
import { ASSETS } from '../constants';

interface UpgradeCoachProps {
  credits: number;
  onOpenLab: () => void;
  onContinue: () => void;
}

const UpgradeCoach: React.FC<UpgradeCoachProps> = ({ credits, onOpenLab, onContinue }) => (
  <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/35 p-4 backdrop-blur-[2px]">
    <div className="relative mb-24 w-full max-w-sm border border-yellow-200/30 bg-slate-950/94 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)] [clip-path:polygon(14px_0,100%_0,100%_90%,96%_100%,0_100%,0_14px)]">
      <div className="absolute -bottom-10 right-8 h-10 w-px bg-yellow-200/45"></div>
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center border border-yellow-200/30 bg-yellow-300/10">
          <img src={ASSETS.RSC_TOKEN} className="h-7 w-7" alt="RSC" />
        </div>
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100">Upgrade ready</div>
          <div className="mt-1 text-sm font-bold uppercase tracking-wide text-white">{credits} mission credits available</div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        Open the lab to convert credits into faster fire, tighter handling, missiles, or repairs.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onOpenLab}
          className="border border-yellow-200 bg-yellow-200 px-3 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white"
        >
          Open lab
        </button>
        <button
          onClick={onContinue}
          className="border border-white/15 bg-white/5 px-3 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/35"
        >
          Keep flying
        </button>
      </div>
    </div>
  </div>
);

export default UpgradeCoach;
