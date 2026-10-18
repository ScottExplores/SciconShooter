import React, { useId, useMemo, useState } from 'react';
import type { ResearchHubProposal, ResearchHubProposalFeedResult } from '../../services/researchHubProposals';
import { formatFundingAmount, formatFundingPercent, getProposalFundingMetrics, sortProposalsByFunding } from '../../services/proposalFunding';
import { fundingTimeRemaining } from '../../services/revamp/researchhub/feedSnapshot';

export interface SignalsPanelProps {
  proposals: ResearchHubProposal[];
  proposalStatus: 'loading' | 'ready' | 'empty' | 'error';
  source?: ResearchHubProposalFeedResult['source'];
  fetchedAt?: string;
  onRetry?: () => void;
  onSelectProposal?: (proposal: ResearchHubProposal) => void;
  selectedProposalId?: string;
  selectionDisabled?: boolean;
  compact?: boolean;
  maxVisible?: number;
}

const ExternalArrow = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M6 3h7v7M13 3 5 11M10 13H3V6" />
  </svg>
);

const SignalsPanel: React.FC<SignalsPanelProps> = ({
  proposals, proposalStatus, source, fetchedAt, onRetry, onSelectProposal,
  selectedProposalId, selectionDisabled = false, compact = false, maxVisible = 6
}) => {
  const id = useId();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const sortedProposals = useMemo(() => sortProposalsByFunding(proposals), [proposals]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => sortedProposals.filter((proposal) => !normalizedQuery
    || `${proposal.title} ${proposal.author} ${proposal.organization || ''}`.toLowerCase().includes(normalizedQuery)), [normalizedQuery, sortedProposals]);
  const visible = expanded || normalizedQuery ? filtered : filtered.slice(0, maxVisible);
  const cached = source === 'local-cache' || source === 'server-cache';
  const timestamp = Date.parse(fetchedAt || '');
  const updatedLabel = Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(timestamp)
    : null;

  return (
    <section aria-labelledby={`${id}-heading`} className="relative overflow-hidden rounded-[8px] border border-cyan-200/20 bg-[#030a19]/95 text-slate-200 shadow-[inset_0_1px_0_rgba(103,232,249,0.08)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
      <div className={compact ? 'p-3' : 'p-4 sm:p-5'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">Research uplink</p>
            <h2 id={`${id}-heading`} className="arcade-font mt-1 text-xl font-black uppercase tracking-wider text-white sm:text-2xl">Signals</h2>
          </div>
          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${cached || source === 'dev-fixture' ? 'border-amber-200/25 bg-amber-300/10 text-amber-100' : 'border-cyan-200/20 bg-cyan-300/5 text-cyan-100'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cached ? 'bg-amber-200' : 'bg-cyan-200'}`} aria-hidden="true" />
            {cached ? 'Saved snapshot' : source === 'dev-fixture' ? 'Sample feed' : proposalStatus === 'loading' ? 'Connecting' : source === 'live' ? 'Live feed' : 'ResearchHub'}
          </span>
        </div>
        <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300">
          Real research. Your next mission matters. The Weekly Run champion chooses which eligible proposal receives the prize.
        </p>
        {cached ? (
          <p role="status" className="mt-3 rounded-[5px] border border-amber-200/15 bg-amber-300/5 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
            Showing the last saved signal{updatedLabel ? ` from ${updatedLabel}` : ''}. Funding and eligibility are checked again when you choose.
          </p>
        ) : null}

        {!compact && proposals.length > 0 ? (
          <label className="mt-4 block">
            <span className="sr-only">Search research proposals</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search research, author, or organization"
              className="min-h-11 w-full rounded-[6px] border border-cyan-200/20 bg-slate-950/80 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/70" />
          </label>
        ) : null}

        <div className="mt-4 space-y-3" aria-busy={proposalStatus === 'loading'}>
          {proposalStatus === 'loading' && proposals.length === 0 ? (
            <div role="status" className="rounded-[6px] border border-cyan-200/10 bg-cyan-300/[0.03] p-4">
              <p className="text-xs font-semibold text-cyan-100">Listening for research signals…</p>
              <div aria-hidden="true" className="mt-3 space-y-2 motion-safe:animate-pulse">
                <div className="h-3 w-4/5 rounded bg-cyan-200/10" /><div className="h-3 w-3/5 rounded bg-cyan-200/10" /><div className="mt-4 h-1.5 rounded bg-cyan-200/10" />
              </div>
            </div>
          ) : visible.length > 0 ? visible.map((proposal) => {
            const funding = getProposalFundingMetrics(proposal);
            const selected = selectedProposalId === proposal.id;
            return (
              <article key={proposal.id} className={`overflow-hidden rounded-[6px] border p-3 sm:p-4 ${selected ? 'border-yellow-200/60 bg-yellow-300/10' : 'border-cyan-200/15 bg-cyan-300/[0.025]'}`}>
                <div className="flex items-start gap-3">
                  {proposal.imageUrl && !compact && !failedImages.has(proposal.imageUrl) ? (
                    <img onError={() => setFailedImages((current) => new Set([...current, proposal.imageUrl!]))} src={proposal.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-[5px] border border-cyan-200/15 bg-slate-900 object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-3 break-words text-sm font-bold leading-snug text-white">{proposal.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-cyan-100/75">{proposal.author}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <p className="text-xs font-bold text-white">
                    {formatFundingAmount(funding.raisedAmount, funding.currency)}
                    {funding.currency ? <span className="ml-1 font-normal text-slate-400">of {formatFundingAmount(funding.goalAmount, funding.currency)}</span> : null}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] font-bold text-cyan-200">{formatFundingPercent(funding.progressPercent)}</span>
                </div>
                <div role="progressbar" aria-label={`${proposal.title} funding progress`} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={funding.progressPercent === null ? undefined : Math.round(funding.barPercent)}
                  aria-valuetext={funding.progressPercent === null ? 'Funding progress not reported' : `${formatFundingAmount(funding.raisedAmount, funding.currency)} raised of ${formatFundingAmount(funding.goalAmount, funding.currency)}`}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-400" style={{ width: `${funding.barPercent}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  <span>{proposal.backers.toLocaleString()} backer{proposal.backers === 1 ? '' : 's'}</span>
                  <span className="text-cyan-100/80">{fundingTimeRemaining(proposal.endDate)}</span>
                </div>
                <div className={`mt-3 flex flex-wrap gap-2 border-t border-cyan-200/10 pt-2 ${onSelectProposal ? 'justify-between' : 'justify-end'}`}>
                  {onSelectProposal ? (
                    <button type="button" disabled={selectionDisabled} aria-pressed={selected} onClick={() => onSelectProposal(proposal)} className="min-h-11 rounded-[5px] border border-yellow-200/35 bg-yellow-300/10 px-3 text-[10px] font-black uppercase tracking-wider text-yellow-100 disabled:opacity-40">
                      {selected ? 'Proposal selected' : 'Choose this proposal'}
                    </button>
                  ) : null}
                  <a href={proposal.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${proposal.title} on ResearchHub, new tab`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] px-2 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200">
                    Open in ResearchHub <ExternalArrow />
                  </a>
                </div>
              </article>
            );
          }) : (
            <div className="rounded-[6px] border border-cyan-200/15 bg-cyan-300/[0.03] px-4 py-5 text-center">
              <p className="text-sm font-bold text-white">{normalizedQuery ? 'No matching signals' : proposalStatus === 'error' ? 'Research uplink is taking a break' : 'New research signals are on the way'}</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">{normalizedQuery ? 'Try another title, author, or organization.' : 'Explore ResearchHub while we wait for proposals eligible for this week’s prize.'}</p>
              {onRetry && !normalizedQuery ? <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-[5px] border border-cyan-200/25 bg-cyan-300/10 px-4 text-xs font-bold text-cyan-100">Reconnect signals</button> : null}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!expanded && !normalizedQuery && filtered.length > maxVisible ? <button type="button" onClick={() => setExpanded(true)} className="min-h-11 px-1 text-[11px] font-bold text-cyan-100">Show all {filtered.length} signals</button> : <span className="text-[10px] text-slate-500">{proposals.length > 0 ? `${proposals.length} eligible signal${proposals.length === 1 ? '' : 's'}` : 'Science keeps moving.'}</span>}
          <a href="https://www.researchhub.com/fund" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 px-1 text-[11px] font-bold text-cyan-100">Explore ResearchHub <ExternalArrow /></a>
        </div>
      </div>
    </section>
  );
};

export default SignalsPanel;
