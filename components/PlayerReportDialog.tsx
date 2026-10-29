import React, { useEffect, useRef, useState } from 'react';
import {
  submitPlayerReport,
  type PlayerReportCategory,
  type PlayerReportKind
} from '../services/playerReportService';
import { DONATION_CONFIG } from '../constants';

interface PlayerReportDialogProps {
  kind: PlayerReportKind | null;
  onClose: () => void;
}

interface PlayerReportDraft {
  category: PlayerReportCategory;
  summary: string;
  details: string;
  contact: string;
  includeDiagnostics: boolean;
  status: 'idle' | 'sending' | 'sent' | 'queued' | 'error';
  reportId: string | null;
}

const categoryOptions = [
  { value: 'gameplay', label: 'Gameplay or waves', kinds: ['feedback', 'bug'] },
  { value: 'loading-performance', label: 'Loading or performance', kinds: ['feedback', 'bug'] },
  { value: 'wallet-purchase', label: 'Wallet or purchase', kinds: ['feedback', 'bug'] },
  { value: 'visual-audio', label: 'Visual or audio', kinds: ['feedback', 'bug'] },
  { value: 'other', label: 'Something else', kinds: ['feedback', 'bug'] }
] as const;

const createDraft = (kind: PlayerReportKind): PlayerReportDraft => ({
  category: (kind === 'bug' ? 'gameplay' : 'other') as PlayerReportCategory,
  summary: '',
  details: '',
  contact: '',
  includeDiagnostics: true,
  status: 'idle',
  reportId: null
});

const getFocusableElements = (dialog: HTMLElement | null) => Array.from(
  dialog?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  ) ?? []
);

const PlayerReportDialog: React.FC<PlayerReportDialogProps> = ({ kind, onClose }) => {
  const [drafts, setDrafts] = useState<Record<PlayerReportKind, PlayerReportDraft>>(() => ({
    feedback: createDraft('feedback'),
    bug: createDraft('bug')
  }));
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  const open = kind !== null;
  const draft = kind ? drafts[kind] : null;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previousFocus && document.body.contains(previousFocus)) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || (draft?.status !== 'sent' && draft?.status !== 'queued')) return undefined;
    const focusFrame = window.requestAnimationFrame(() => receiptHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [draft?.status, open]);

  if (!kind || !draft) return null;

  const updateDraft = (update: Partial<PlayerReportDraft>) => {
    setDrafts((current) => ({
      ...current,
      [kind]: { ...current[kind], ...update }
    }));
  };

  const close = () => {
    if (draft.status === 'sending') return;
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const summary = draft.summary.trim();
    if (!summary || draft.status === 'sending') return;

    updateDraft({ status: 'sending', reportId: null });
    try {
      const result = await submitPlayerReport({
        kind,
        category: draft.category,
        summary,
        details: draft.details.trim(),
        contact: draft.contact.trim(),
        includeDiagnostics: draft.includeDiagnostics
      });
      updateDraft({ status: result.delivery, reportId: result.reportId });
    } catch {
      updateDraft({ status: 'error', reportId: null });
    }
  };

  const resetDraft = () => {
    setDrafts((current) => ({ ...current, [kind]: createDraft(kind) }));
  };

  const isBug = kind === 'bug';
  const title = isBug ? 'Report a Bug' : 'Feedback';
  const availableCategories = categoryOptions.filter((option) => (
    (option.kinds as readonly string[]).includes(kind)
  ));
  const hasReceipt = draft.status === 'sent' || draft.status === 'queued';
  const supportSubject = draft.reportId
    ? `Scicon Shooter support - ${draft.reportId}`
    : 'Scicon Shooter support';
  const supportMailto = `mailto:${DONATION_CONFIG.SUPPORT_EMAIL}?subject=${encodeURIComponent(supportSubject)}`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/82 backdrop-blur-sm"
        onClick={close}
        aria-label={`Close ${title}`}
        disabled={draft.status === 'sending'}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sci-player-report-title"
        aria-describedby="sci-player-report-description"
        aria-busy={draft.status === 'sending'}
        onKeyDown={handleKeyDown}
        className="custom-scrollbar relative z-10 max-h-[calc(100svh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[8px] border border-cyan-200/35 bg-slate-950 p-4 shadow-[0_0_52px_rgba(34,211,238,0.24)] sm:max-h-[calc(100svh-2.5rem)] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-cyan-200/15 pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[0.62rem] font-black uppercase tracking-[0.16em] text-cyan-200">
              Player communications
            </p>
            <h2 id="sci-player-report-title" className="mt-1 text-xl font-black text-white">{title}</h2>
            <p id="sci-player-report-description" className="mt-1 text-xs leading-relaxed text-slate-300">
              {isBug
                ? 'Tell us what went wrong. Your report goes straight to the Scicon team\'s report log.'
                : 'Share an idea or tell us what would make Scicon Shooter better. It goes straight to the Scicon team.'}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            disabled={draft.status === 'sending'}
            className="sci-icon-button min-h-11 min-w-11 shrink-0 disabled:cursor-wait disabled:opacity-50"
            aria-label={`Close ${title}`}
          >
            <span aria-hidden="true" className="text-lg leading-none">X</span>
          </button>
        </div>

        {hasReceipt ? (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-300/45 bg-emerald-400/12 text-2xl text-emerald-100" aria-hidden="true">
              OK
            </div>
            <h3
              ref={receiptHeadingRef}
              tabIndex={-1}
              className="mt-4 text-lg font-black text-white outline-none"
            >
              {draft.status === 'sent'
                ? (isBug ? 'Thanks, pilot. Bug logged.' : 'Thanks, pilot. Feedback received.')
                : 'Thanks, pilot. Report queued.'}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-300">
              {draft.status === 'sent'
                ? 'Thank you for helping improve Scicon Shooter. The team has it, saved under the Report ID below.'
                : 'Delivery is temporarily unavailable, so the report will retry automatically with bounded backoff. Your draft remains queued until delivery.'}
            </p>
            <p className="mt-4 text-[0.65rem] font-black uppercase tracking-[0.12em] text-cyan-200">
              Report ID
            </p>
            <code className="mt-1 block select-all break-all rounded-[6px] border border-cyan-300/20 bg-slate-900 px-3 py-2 text-xs text-cyan-50">
              {draft.reportId}
            </code>
            <p className="mx-auto mt-4 max-w-sm text-xs leading-relaxed text-slate-300">
              For follow-up, email{' '}
              <a className="font-bold text-cyan-200 underline decoration-cyan-400/50 underline-offset-2" href={supportMailto}>
                {DONATION_CONFIG.SUPPORT_EMAIL}
              </a>{' '}
              with this Report ID. For wallet or transaction issues, include the public transaction hash. Never send a recovery phrase or private key.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={resetDraft} className="min-h-11 rounded-[6px] border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/20">
                Send another
              </button>
              <button type="button" onClick={onClose} className="min-h-11 rounded-[6px] border border-emerald-300/40 bg-emerald-400/14 px-3 py-2 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/20">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-xs font-bold text-slate-200" htmlFor="sci-player-report-category">
              Category
              <select
                id="sci-player-report-category"
                value={draft.category}
                onChange={(event) => updateDraft({
                  category: event.target.value as PlayerReportCategory,
                  status: 'idle'
                })}
                className="min-h-11 w-full rounded-[6px] border border-cyan-300/25 bg-slate-900 px-3 text-sm text-white outline-none transition focus:border-cyan-200/70"
              >
                {availableCategories.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-slate-200" htmlFor="sci-player-report-summary">
              {isBug ? 'What happened?' : 'What would you like us to know?'}
              <textarea
                id="sci-player-report-summary"
                value={draft.summary}
                maxLength={600}
                required
                onChange={(event) => updateDraft({ summary: event.target.value, status: 'idle' })}
                placeholder={isBug
                  ? 'Example: The Weekly Run restarted while I was on wave 14.'
                  : 'Share your idea or feedback.'}
                className="min-h-28 w-full resize-y rounded-[6px] border border-cyan-300/25 bg-slate-900 p-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/70"
              />
              <span className="text-right font-mono text-[0.6rem] text-slate-500">{draft.summary.length} / 600</span>
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-slate-200" htmlFor="sci-player-report-details">
              {isBug ? 'What were you doing? (optional)' : 'Anything else? (optional)'}
              <textarea
                id="sci-player-report-details"
                value={draft.details}
                maxLength={1600}
                onChange={(event) => updateDraft({ details: event.target.value, status: 'idle' })}
                placeholder={isBug
                  ? 'What did you press, what did you expect, and did it happen more than once?'
                  : 'Add any details that would help us understand.'}
                className="min-h-24 w-full resize-y rounded-[6px] border border-cyan-300/25 bg-slate-900 p-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/70"
              />
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-slate-200" htmlFor="sci-player-report-contact">
              How can we reach you? (optional)
              <input
                id="sci-player-report-contact"
                type="text"
                value={draft.contact}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => updateDraft({ contact: event.target.value, status: 'idle' })}
                placeholder="X handle, Discord, or email. Leave blank to stay anonymous."
                className="min-h-11 w-full rounded-[6px] border border-cyan-300/25 bg-slate-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/70"
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[6px] border border-cyan-300/18 bg-cyan-400/5 p-3 text-xs leading-relaxed text-slate-200">
              <input
                type="checkbox"
                checked={draft.includeDiagnostics}
                onChange={(event) => updateDraft({ includeDiagnostics: event.target.checked, status: 'idle' })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-cyan-400"
              />
              <span>
                <strong className="block text-cyan-100">Include technical diagnostics</strong>
                Adds the game version, screen, mission/wave, device size, connection state, and recent technical events. Manual reports are saved to the Scicon report log and sent through Resend to the Scicon team's Gmail inbox. Technical diagnostics do not read wallet secrets or browser storage. Never type a recovery phrase or private key into a report.
              </span>
            </label>

            <p className="rounded-[6px] border border-cyan-300/18 bg-slate-900/70 p-3 text-xs leading-relaxed text-slate-300">
              No email address or wallet is required. You can also email{' '}
              <a className="font-bold text-cyan-200 underline decoration-cyan-400/50 underline-offset-2" href={supportMailto}>
                {DONATION_CONFIG.SUPPORT_EMAIL}
              </a>{' '}
              with the Report ID. For wallet or transaction issues, include the public transaction hash.
            </p>

            <div className="min-h-5" role="status" aria-live="polite">
              {draft.status === 'error' ? (
                <p className="text-xs leading-relaxed text-red-200">
                  We could not save the report yet. Your draft is still here. Check your connection and try again.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] gap-3">
              <button
                type="button"
                onClick={close}
                disabled={draft.status === 'sending'}
                className="min-h-11 rounded-[6px] border border-slate-500/40 bg-slate-800/80 px-3 py-2 text-sm font-black text-slate-200 transition hover:border-cyan-200/45 disabled:cursor-wait disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!draft.summary.trim() || draft.status === 'sending'}
                className="min-h-11 rounded-[6px] border border-emerald-300/40 bg-emerald-400/14 px-3 py-2 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {draft.status === 'sending' ? 'Sending report...' : isBug ? 'Submit bug report' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};

export default PlayerReportDialog;
