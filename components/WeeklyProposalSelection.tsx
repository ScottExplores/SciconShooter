import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import { sortProposalsByFunding } from '../services/proposalFunding';
import { WEEKLY_ALLOCATION_RSC } from '../shared/weeklyCompetitionBoundary.browser';

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';
type ProposalSelectionStatus = 'idle' | 'saving' | 'confirmed' | 'error';

interface WeeklyProposalSelectionProps {
  pilotName: string;
  score: number;
  allocationRsc?: number;
  proposals: ResearchHubProposal[];
  proposalStatus: ProposalFeedStatus;
  selectionStatus: ProposalSelectionStatus;
  selectionMessage?: string;
  initialProposalId?: string | null;
  dismissible?: boolean;
  onConfirm: (proposal: ResearchHubProposal) => void;
  onProposalChange?: () => void;
  onRetry: () => void;
  onClose?: () => void;
}

const WeeklyProposalSelection: React.FC<WeeklyProposalSelectionProps> = ({
  pilotName,
  score,
  allocationRsc = WEEKLY_ALLOCATION_RSC,
  proposals,
  proposalStatus,
  selectionStatus,
  selectionMessage = '',
  initialProposalId = null,
  dismissible = true,
  onConfirm,
  onProposalChange,
  onRetry,
  onClose
}) => {
  const [query, setQuery] = useState('');
  const [selectedProposalId, setSelectedProposalId] = useState(() => initialProposalId?.trim() ?? '');
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sortedProposals = useMemo(() => sortProposalsByFunding(proposals), [proposals]);
  const selectedProposal = useMemo(
    () => sortedProposals.find((proposal) => proposal.id === selectedProposalId) ?? null,
    [selectedProposalId, sortedProposals]
  );
  const filteredProposals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedProposals;
    return sortedProposals.filter((proposal) => (
      proposal.title.toLowerCase().includes(normalizedQuery)
      || proposal.author.toLowerCase().includes(normalizedQuery)
      || proposal.organization?.toLowerCase().includes(normalizedQuery)
    ));
  }, [query, sortedProposals]);
  const isSaving = selectionStatus === 'saving';

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    searchInputRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (dismissible && onClose && !isSaving) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 items-stretch justify-center overflow-hidden bg-[#020617]/96 p-3 backdrop-blur-xl sm:items-center sm:p-5">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-proposal-selection-title"
        aria-describedby="weekly-proposal-selection-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="relative flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-[8px] border border-yellow-200/45 bg-[#030a19] shadow-[0_0_70px_rgba(250,204,21,0.16),0_28px_100px_rgba(0,0,0,0.76)]"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative overflow-hidden border-b border-yellow-200/20 px-4 py-4 text-center sm:px-6">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-64 -translate-x-1/2 -translate-y-1/2 bg-yellow-300/10 blur-xl" />
          <p className="relative animate-pulse font-mono text-[10px] font-black uppercase tracking-[0.28em] text-yellow-200 drop-shadow-[0_0_12px_currentColor]">
            New weekly high score
          </p>
          <h2 id="weekly-proposal-selection-title" className="arcade-font relative mt-2 text-2xl font-black uppercase tracking-wider text-white sm:text-3xl">
            You&apos;re #1, {pilotName || 'Pilot'}
          </h2>
          <p className="relative mt-1 font-mono text-lg font-black text-cyan-100">
            {score.toLocaleString()} points
          </p>
          <p id="weekly-proposal-selection-description" className="relative mx-auto mt-2 max-w-sm text-[11px] font-semibold leading-relaxed text-slate-300">
            Choose the ResearchHub proposal that receives the {allocationRsc.toLocaleString('en-US')} RSC allocation if your score remains first at the weekly cutoff.
          </p>
          <p className="relative mx-auto mt-1 max-w-sm font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-cyan-200/70">
            Only proposals open past Sunday&apos;s noon-Pacific cutoff are eligible.
          </p>
          {dismissible && onClose ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label="Choose weekly proposal later"
              className="absolute right-3 top-3 h-8 w-8 rounded-[5px] border border-white/15 bg-black/35 text-base font-bold text-slate-300 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-45"
            >
              x
            </button>
          ) : null}
        </div>

        <div className="relative grid grid-cols-3 border-b border-cyan-200/15 bg-cyan-300/[0.03] text-center font-mono text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
          <div className="border-r border-cyan-200/15 px-2 py-2 text-emerald-200">1. Score saved</div>
          <div className="border-r border-cyan-200/15 bg-yellow-300/10 px-2 py-2 text-yellow-100">2. Choose research</div>
          <div className="px-2 py-2">3. Mint + share</div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-4">
          <label className="sr-only" htmlFor="weekly-proposal-search">Search eligible proposals</label>
          <input
            ref={searchInputRef}
            id="weekly-proposal-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search proposal, researcher, or topic"
            className="h-11 w-full rounded-[6px] border border-cyan-200/25 bg-slate-950/85 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-yellow-200/60"
          />

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            {proposalStatus === 'loading' ? (
              <div className="space-y-2" aria-label="Loading eligible proposals">
                {[0, 1, 2].map((index) => <div key={index} className="h-20 animate-pulse rounded-[6px] bg-white/[0.04]" />)}
              </div>
            ) : null}

            {proposalStatus === 'error' || proposalStatus === 'empty' ? (
              <div className="rounded-[6px] border border-red-200/25 bg-red-400/10 p-4 text-center">
                <p className="text-sm font-bold text-red-100">
                  {proposalStatus === 'error' ? 'Eligible proposals could not be loaded.' : 'No eligible proposals are open right now.'}
                </p>
                <button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-[6px] border border-white/25 bg-white/10 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                  Try again
                </button>
                <a href="https://www.researchhub.com/fund" target="_blank" rel="noopener noreferrer" className="mt-2 block min-h-11 p-3 text-sm font-bold text-cyan-100 underline">Browse ResearchHub funding ↗</a>
              </div>
            ) : null}

            {proposalStatus === 'ready' && filteredProposals.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-slate-400">No proposals match that search.</p>
            ) : null}

            {proposalStatus === 'ready' ? (
              <div className="space-y-2">
                {filteredProposals.map((proposal) => {
                  const selected = selectedProposal?.id === proposal.id;
                  return (
                    <button
                      key={proposal.id}
                      type="button"
                      disabled={isSaving || selectionStatus === 'confirmed'}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedProposalId(proposal.id);
                        onProposalChange?.();
                      }}
                      className={`grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-[6px] border p-2 text-left transition ${selected
                        ? 'border-yellow-200/70 bg-yellow-300/15 shadow-[0_0_18px_rgba(250,204,21,0.18)]'
                        : 'border-cyan-200/15 bg-cyan-300/[0.04] hover:border-cyan-200/40 hover:bg-cyan-300/10'}`}
                    >
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[5px] border border-white/15 bg-slate-900">
                        {proposal.imageUrl ? (
                          <img src={proposal.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="arcade-font text-lg font-black text-cyan-200">R</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-xs font-black leading-snug text-white">{proposal.title}</h3>
                          <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${selected ? 'border-yellow-100 bg-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.55)]' : 'border-slate-500'}`} />
                        </div>
                        <p className="mt-1 truncate text-[10px] font-semibold text-cyan-100/75">{proposal.author}</p>
                        <p className="mt-1 font-mono text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                          {proposal.votes.toLocaleString()} votes · {proposal.backers.toLocaleString()} backers
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-3 border-t border-cyan-200/15 pt-3">
            {selectionMessage ? (
              <div
                className={`mb-2 rounded-[6px] border px-3 py-2 text-center text-[10px] font-bold ${
                  selectionStatus === 'error'
                    ? 'border-red-200/30 bg-red-400/10 text-red-100'
                    : 'border-emerald-200/20 bg-emerald-300/5 text-emerald-200'
                }`}
                role={selectionStatus === 'error' ? 'alert' : 'status'}
                aria-live="polite"
              >
                <p>{selectionMessage}</p>
                {selectionStatus === 'error' && selectedProposal ? (
                  <p className="mt-1 text-[9px] font-semibold text-slate-300">
                    Your proposal is still selected. Tap retry below.
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={!selectedProposal || isSaving || selectionStatus === 'confirmed'}
              onClick={() => selectedProposal && onConfirm(selectedProposal)}
              className="min-h-12 w-full rounded-[6px] border border-yellow-100/40 bg-yellow-300/20 px-4 text-xs font-black uppercase tracking-[0.15em] text-yellow-50 shadow-[0_0_18px_rgba(250,204,21,0.18)] transition hover:bg-yellow-300/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500 disabled:shadow-none"
            >
              {selectionStatus === 'confirmed'
                ? 'Proposal saved'
                : isSaving
                  ? 'Saving weekly pick...'
                  : selectionStatus === 'error' && selectedProposal
                    ? 'Retry saving proposal'
                  : selectedProposal
                    ? `Confirm ${allocationRsc.toLocaleString('en-US')} RSC proposal`
                    : 'Select a proposal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyProposalSelection;
