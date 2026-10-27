import React, { useEffect, useMemo, useState } from 'react';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import { formatFundingAmount, getProposalFundingMetrics, sortProposalsByFunding } from '../services/proposalFunding';
import type { ResearchHubRfp } from '../services/researchHubRfps';
import { fetchEligibleRfps } from '../services/researchHubRfps';
import { getPublicPrizeState } from '../shared/weeklyCompetitionBoundary.browser';

type FeedStatus = 'loading' | 'ready' | 'empty' | 'error';
type Step = 'win' | 'pick' | 'confirm' | 'receipt';
type Tab = 'proposals' | 'rfps';

export interface PrizeSelectionTarget {
  kind: 'proposal' | 'rfp';
  proposal?: ResearchHubProposal;
  rfp?: ResearchHubRfp;
}

interface PrizeWinnerFlowProps {
  pilotName: string;
  score: number;
  allocationRsc?: number;
  proposals: ResearchHubProposal[];
  proposalStatus: FeedStatus;
  preview?: boolean;
  previewRfps?: ResearchHubRfp[];
  initialProposalId?: string | null;
  selectionStatus?: 'idle' | 'saving' | 'confirmed' | 'error';
  selectionMessage?: string;
  dismissible?: boolean;
  onConfirm: (target: PrizeSelectionTarget) => void;
  onRetryProposals?: () => void;
  onClose?: () => void;
}

const formatDeadline = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Deadline not published';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(time);
};

const formatRsc = (value: number | null) => (
  value === null || !Number.isFinite(value) ? 'Not published' : `${Math.round(value).toLocaleString('en-US')} RSC`
);

const PREVIEW_RFPS: ResearchHubRfp[] = [
  {
    id: '33131',
    poolId: '424',
    title: 'Request for Proposals: Airborne Disease Resilience',
    url: 'https://www.researchhub.com/rfp/33131/request-for-proposals-airborne-disease-resilience',
    organization: 'ResearchHub Foundation',
    status: 'OPEN',
    endDate: '2029-12-31T00:00:00.000Z',
    goalUsd: 10000,
    goalRsc: 204657,
    raisedRsc: 20551
  },
  {
    id: '32931',
    poolId: '392',
    title: 'Lost Light: The Sky Before Satellites',
    url: 'https://www.researchhub.com/rfp/32931/lost-light',
    organization: 'ResearchHub',
    status: 'OPEN',
    endDate: '2027-06-30T00:00:00.000Z',
    goalUsd: null,
    goalRsc: 240000,
    raisedRsc: 237974
  }
];

const PrizeWinnerFlow: React.FC<PrizeWinnerFlowProps> = ({
  pilotName,
  score,
  allocationRsc = getPublicPrizeState().allocationRsc,
  proposals,
  proposalStatus,
  preview = false,
  previewRfps = PREVIEW_RFPS,
  initialProposalId = null,
  selectionStatus = 'idle',
  selectionMessage = '',
  dismissible = true,
  onConfirm,
  onRetryProposals,
  onClose
}) => {
  const [step, setStep] = useState<Step>('win');
  const [tab, setTab] = useState<Tab>('proposals');
  const [selected, setSelected] = useState<PrizeSelectionTarget | null>(null);
  const [rfps, setRfps] = useState<ResearchHubRfp[]>(preview ? previewRfps : []);
  const [rfpStatus, setRfpStatus] = useState<FeedStatus>(preview ? 'ready' : 'loading');
  const bigEvent = getPublicPrizeState().phase !== 'weekly';
  const payoutNote = bigEvent
    ? 'Only items still open after November 30, 2026 are listed.'
    : 'Only items still open after this week\'s noon-Pacific cutoff are listed.';

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    setRfpStatus('loading');
    fetchEligibleRfps()
      .then((loaded) => {
        if (cancelled) return;
        setRfps(loaded);
        setRfpStatus(loaded.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setRfpStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  useEffect(() => {
    if (!initialProposalId || selected) return;
    const proposal = proposals.find((item) => item.id === initialProposalId);
    if (proposal) setSelected({ kind: 'proposal', proposal });
  }, [initialProposalId, proposals, selected]);

  useEffect(() => {
    if (selectionStatus === 'confirmed') setStep('receipt');
  }, [selectionStatus]);

  const selectedLabel = selected?.kind === 'rfp' ? selected.rfp?.title : selected?.proposal?.title;
  const selectedUrl = selected?.kind === 'rfp' ? selected.rfp?.url : selected?.proposal?.url;
  const receiptCopy = selected?.kind === 'rfp'
    ? 'Recorded for manual funding by Scott. This did not contribute RSC to the ResearchHub pool, and there is no transaction yet.'
    : 'Recorded as the proposal choice. This did not send RSC. Funding is confirmed only after a Base transaction reference is recorded.';

  const proposalRows = useMemo(() => sortProposalsByFunding(proposals), [proposals]);

  const confirmChoice = () => {
    if (!selected) return;
    if (preview) {
      setStep('receipt');
      return;
    }
    onConfirm(selected);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-stretch justify-center overflow-hidden bg-[#020617]/96 p-3 backdrop-blur-xl">
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && dismissible && onClose && selectionStatus !== 'saving') onClose();
        }}
        className="relative flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-[8px] border border-yellow-200/45 bg-[#030a19] shadow-[0_0_70px_rgba(250,204,21,0.16)]"
      >
        <div className="border-b border-yellow-200/20 px-4 py-4 text-center">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-yellow-200">
            {preview ? 'Preview winner · no payout' : bigEvent ? 'SciCon Big Event' : 'Weekly prize'}
          </p>
          <h2 id="prize-winner-title" className="arcade-font mt-2 text-2xl font-black uppercase tracking-wider text-white">
            {pilotName || 'Pilot'}
          </h2>
          <p className="mt-1 font-mono text-lg font-black text-cyan-100">{score.toLocaleString()} pts · {allocationRsc.toLocaleString('en-US')} RSC</p>
          {dismissible && onClose ? (
            <button type="button" onClick={onClose} disabled={selectionStatus === 'saving'} aria-label="Close prize picker" className="absolute right-5 top-5 h-8 w-8 rounded-[5px] border border-white/15 text-slate-300">x</button>
          ) : null}
        </div>

        {step === 'win' ? (
          <div className="flex flex-1 flex-col justify-between p-4">
            <div>
              <p className="text-sm font-semibold leading-relaxed text-slate-200">
                You are first. Choose a ResearchHub proposal or an RFP funding pool. The next screen lists what is still open. Confirming records the choice here. It does not move RSC.
              </p>
              <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-200/80">{payoutNote}</p>
            </div>
            <button type="button" onClick={() => setStep('pick')} className="mt-6 min-h-12 rounded-[6px] border border-yellow-100/40 bg-yellow-300/20 text-xs font-black uppercase tracking-[0.14em] text-yellow-50">
              Choose a proposal or RFP
            </button>
          </div>
        ) : null}

        {step === 'pick' ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div role="tablist" aria-label="Prize destination" className="grid grid-cols-2 gap-2">
              {(['proposals', 'rfps'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`min-h-11 rounded-[6px] border text-[11px] font-black uppercase tracking-[0.14em] ${tab === id ? 'border-yellow-200/70 bg-yellow-300/15 text-yellow-50' : 'border-cyan-200/20 text-slate-300'}`}
                >
                  {id === 'proposals' ? 'Proposals' : 'RFPs'}
                </button>
              ))}
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {tab === 'proposals' && proposalStatus === 'loading' ? <p className="text-sm text-slate-300">Loading open proposals...</p> : null}
              {tab === 'proposals' && proposalStatus === 'error' ? (
                <button type="button" onClick={onRetryProposals} className="text-sm font-bold text-red-100">Proposals could not be loaded. Try again.</button>
              ) : null}
              {tab === 'proposals' && proposalStatus === 'ready' ? proposalRows.map((proposal) => {
                const funding = getProposalFundingMetrics(proposal);
                const active = selected?.kind === 'proposal' && selected.proposal?.id === proposal.id;
                return (
                  <button key={proposal.id} type="button" aria-pressed={active} onClick={() => setSelected({ kind: 'proposal', proposal })} className={`w-full rounded-[6px] border p-3 text-left ${active ? 'border-yellow-200/70 bg-yellow-300/10' : 'border-cyan-200/15 bg-cyan-300/[0.04]'}`}>
                    <p className="text-sm font-black text-white">{proposal.title}</p>
                    <p className="mt-1 text-[11px] text-cyan-100">{proposal.author}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-slate-300">
                      Goal {formatFundingAmount(funding.goalAmount, funding.currency)} · {proposal.endDate ? formatDeadline(proposal.endDate) : 'Deadline not published'}
                    </p>
                    <a href={proposal.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="mt-1 inline-block text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200 underline">Open proposal</a>
                  </button>
                );
              }) : null}
              {tab === 'rfps' && rfpStatus === 'loading' ? <p className="text-sm text-slate-300">Loading open RFPs...</p> : null}
              {tab === 'rfps' && rfpStatus === 'error' ? <p className="text-sm font-bold text-red-100">RFPs could not be loaded.</p> : null}
              {tab === 'rfps' && rfpStatus === 'empty' ? <p className="text-sm text-slate-300">No RFP is still open after the payout date.</p> : null}
              {tab === 'rfps' && rfpStatus === 'ready' ? rfps.map((rfp) => {
                const active = selected?.kind === 'rfp' && selected.rfp?.id === rfp.id;
                const pool = rfp.goalUsd ? `$${Math.round(rfp.goalUsd).toLocaleString('en-US')} budget` : `${formatRsc(rfp.goalRsc)} budget`;
                return (
                  <button key={rfp.id} type="button" aria-pressed={active} onClick={() => setSelected({ kind: 'rfp', rfp })} className={`w-full rounded-[6px] border p-3 text-left ${active ? 'border-yellow-200/70 bg-yellow-300/10' : 'border-cyan-200/15 bg-cyan-300/[0.04]'}`}>
                    <p className="text-sm font-black text-white">{rfp.title}</p>
                    <p className="mt-1 text-[11px] text-cyan-100">{rfp.organization} · {rfp.status}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-slate-300">
                      {pool} · {formatRsc(rfp.raisedRsc)} raised · {formatDeadline(rfp.endDate)}
                    </p>
                    <a href={rfp.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="mt-1 inline-block text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200 underline">Open RFP</a>
                  </button>
                );
              }) : null}
            </div>
            <button type="button" disabled={!selected} onClick={() => setStep('confirm')} className="mt-3 min-h-12 rounded-[6px] border border-yellow-100/40 bg-yellow-300/20 text-xs font-black uppercase tracking-[0.14em] text-yellow-50 disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500">
              {selected ? 'Review this choice' : 'Select a proposal or RFP'}
            </button>
          </div>
        ) : null}

        {step === 'confirm' ? (
          <div className="flex flex-1 flex-col justify-between p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">Confirm the record</p>
              <p className="mt-2 text-lg font-black text-white">{selectedLabel}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">
                {selected?.kind === 'rfp'
                  ? 'This records the RFP so Scott can fund its pool manually. It does not call ResearchHub and it does not contribute RSC.'
                  : 'This records the proposal. It does not send RSC. A Base transaction reference is required before funding is confirmed.'}
              </p>
              {selectionMessage ? <p className="mt-3 text-xs font-bold text-cyan-100">{selectionMessage}</p> : null}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep('pick')} className="min-h-12 rounded-[6px] border border-white/15 text-[11px] font-black uppercase tracking-[0.12em] text-slate-200">Back</button>
              <button type="button" disabled={selectionStatus === 'saving'} onClick={confirmChoice} className="min-h-12 rounded-[6px] border border-yellow-100/40 bg-yellow-300/20 text-[11px] font-black uppercase tracking-[0.12em] text-yellow-50 disabled:opacity-60">
                {selectionStatus === 'saving' ? 'Recording...' : 'Record this choice'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'receipt' ? (
          <div className="flex flex-1 flex-col justify-between p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Choice recorded</p>
              <p className="mt-2 text-lg font-black text-white">{selectedLabel}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">
                {preview ? `Preview only. ${receiptCopy}` : receiptCopy}
              </p>
              {selectedUrl ? (
                <a href={selectedUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs font-black uppercase tracking-[0.12em] text-cyan-200 underline">
                  Open the {selected?.kind === 'rfp' ? 'RFP' : 'proposal'}
                </a>
              ) : null}
            </div>
            {onClose ? (
              <button type="button" onClick={onClose} className="mt-6 min-h-12 rounded-[6px] border border-cyan-200/30 text-xs font-black uppercase tracking-[0.14em] text-cyan-50">Done</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PrizeWinnerFlow;
