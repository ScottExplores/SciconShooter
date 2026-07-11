import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearDraft, fetchBootstrap, fetchRealRuns, fetchVersions, createReview, publishConfig, rollbackConfig, saveDraft, updateReview } from './api/directorClient';
import { Icon } from './components/Icon';
import { VersionHistory } from './components/VersionHistory';
import { cloneValue, defaultScorecard, defaultWaveCampaign, sampleRuns } from './domain/defaults';
import type {
  ConfigKind,
  DirectorSection,
  ReviewRequest,
  RunSnapshot,
  ScorecardConfig,
  VersionEnvelope,
  WaveCampaignConfig
} from './domain/types';
import { useUndoableState } from './hooks/useUndoableState';
import { ReviewBoard } from './review/ReviewBoard';
import { ScorecardStudio } from './scorecard/ScorecardStudio';
import { WaveDirector } from './waves/WaveDirector';

const sections: Array<{ id: DirectorSection; label: string; icon: 'scorecard' | 'waves' | 'review' }> = [
  { id: 'scorecard', label: 'Scorecard', icon: 'scorecard' },
  { id: 'waves', label: 'Waves', icon: 'waves' },
  { id: 'review', label: 'Review', icon: 'review' }
];

const getRevisionLabel = (versionId: string) => {
  const match = /-(\d{6})-/.exec(versionId);
  return match ? `r${Number(match[1])}` : 'local';
};

const mergeRuns = (current: RunSnapshot[], incoming: RunSnapshot[]) => {
  const map = new Map<string, RunSnapshot>();
  for (const run of [...current, ...incoming]) map.set(run.runId || `${run.pilotName}-${run.score}`, run);
  return [...map.values()];
};

const DirectorMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 3 43 14v20L24 45 5 34V14L24 3Z" />
    <path d="m24 9 12 8v14l-12 8-12-8V17l12-8Z" />
    <path d="m24 13 5 11-5 11-5-11 5-11Z" />
  </svg>
);

export default function App() {
  const [section, setSection] = useState<DirectorSection>(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return requested === 'scorecard' || requested === 'review' || requested === 'waves'
      ? requested
      : 'waves';
  });
  const scorecard = useUndoableState<ScorecardConfig>(cloneValue(defaultScorecard));
  const waves = useUndoableState<WaveCampaignConfig>(cloneValue(defaultWaveCampaign));
  const [runs, setRuns] = useState<RunSnapshot[]>(() => cloneValue(sampleRuns));
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [activeVersions, setActiveVersions] = useState<Record<ConfigKind, string>>({
    scorecard: 'scorecard-local',
    'wave-campaign': 'wave-campaign-local'
  });
  const [versions, setVersions] = useState<VersionEnvelope<unknown>[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [lastAction, setLastAction] = useState('Local workspace ready');
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const activeKind: ConfigKind = section === 'scorecard' ? 'scorecard' : 'wave-campaign';
  const activeVersion = activeVersions[activeKind];
  const canUndo = section === 'scorecard' ? scorecard.canUndo : section === 'waves' ? waves.canUndo : false;

  const showToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
    setLastAction(message);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), toast.error ? 6000 : 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const bootstrap = await fetchBootstrap();
        if (cancelled) return;
        scorecard.replace(bootstrap.scorecard);
        waves.replace(bootstrap.waveCampaign);
        const scoreDraft = bootstrap.drafts?.scorecard?.payload as ScorecardConfig | undefined;
        const waveDraft = bootstrap.drafts?.['wave-campaign']?.payload as WaveCampaignConfig | undefined;
        if (scoreDraft) scorecard.set(scoreDraft);
        if (waveDraft) waves.set(waveDraft);
        setRuns(mergeRuns(cloneValue(sampleRuns), bootstrap.runs || []));
        setReviews(bootstrap.reviews || []);
        setActiveVersions(bootstrap.activeVersions);
        setLastAction(scoreDraft || waveDraft ? 'Recovered local draft' : 'Local workspace ready');
      } catch (error) {
        if (cancelled) return;
        showToast(error instanceof Error ? `${error.message}; using local defaults` : 'Using local defaults', true);
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [showToast]);

  const handleUndo = () => {
    if (section === 'scorecard') scorecard.undo();
    if (section === 'waves') waves.undo();
  };

  const handleReset = async () => {
    if (section === 'review') {
      setLastAction('Review requests save automatically');
      return;
    }
    setSaving(true);
    setValidationErrors([]);
    try {
      const kind = section === 'scorecard' ? 'scorecard' : 'wave-campaign';
      const result = await clearDraft(kind, activeVersions[kind]);
      if (section === 'scorecard') scorecard.reset();
      else waves.reset();
      showToast(result.message || 'Reset to the active local revision');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Configuration could not be reset';
      setValidationErrors([message]);
      showToast(message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (section === 'review') {
      showToast('Review requests save automatically');
      return;
    }
    setSaving(true);
    setValidationErrors([]);
    try {
      const result = section === 'scorecard'
        ? await saveDraft('scorecard', scorecard.value, activeVersions.scorecard)
        : await saveDraft('wave-campaign', waves.value, activeVersions['wave-campaign']);
      showToast(result.message || 'Draft saved locally');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Draft could not be saved';
      setValidationErrors([message]);
      showToast(message, true);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (section === 'review') return;
    setSaving(true);
    setValidationErrors([]);
    try {
      if (section === 'scorecard') {
        const result = await publishConfig('scorecard', scorecard.value, 'Published from Scorecard Studio', activeVersions.scorecard);
        if (result.envelope) {
          scorecard.replace(result.envelope.payload);
          setActiveVersions((current) => ({ ...current, scorecard: result.envelope!.id }));
        }
        showToast(result.message || 'Scorecard published locally');
      } else {
        const result = await publishConfig('wave-campaign', waves.value, 'Published from Wave Director', activeVersions['wave-campaign']);
        if (result.envelope) {
          waves.replace(result.envelope.payload);
          setActiveVersions((current) => ({ ...current, 'wave-campaign': result.envelope!.id }));
        }
        showToast(result.message || 'Wave campaign published locally');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Configuration could not be published';
      setValidationErrors([message]);
      showToast(message, true);
    } finally {
      setSaving(false);
    }
  };

  const loadVersionHistory = async () => {
    const kind = activeKind;
    setHistoryOpen(true);
    try {
      const result = await fetchVersions<unknown>(kind);
      setVersions(result.versions);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Version history is unavailable', true);
    }
  };

  const handleRollback = async (versionId: string) => {
    setSaving(true);
    try {
      const result = await rollbackConfig<unknown>(activeKind, versionId, activeVersions[activeKind]);
      const envelope = result.envelope;
      if (!envelope) throw new Error('Rollback did not return a version');
      if (activeKind === 'scorecard') scorecard.replace(envelope.payload as ScorecardConfig);
      else waves.replace(envelope.payload as WaveCampaignConfig);
      setActiveVersions((current) => ({ ...current, [activeKind]: envelope.id }));
      const refreshed = await fetchVersions<unknown>(activeKind);
      setVersions(refreshed.versions);
      showToast(result.message || 'Rollback published as a new local revision');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Rollback failed', true);
    } finally {
      setSaving(false);
    }
  };

  const handleRealRuns = async () => {
    if (loadingRuns) return;
    setLoadingRuns(true);
    try {
      const result = await fetchRealRuns();
      setRuns((current) => mergeRuns(current, result.runs));
      showToast(`Loaded ${result.runs.length} read-only run${result.runs.length === 1 ? '' : 's'}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Real runs are unavailable', true);
    } finally {
      setLoadingRuns(false);
    }
  };

  const handleCreateReview = async (request: Omit<ReviewRequest, 'id' | 'sequence' | 'createdAt'>) => {
    try {
      const result = await createReview(request);
      setReviews((current) => [...current, result.review]);
      showToast('Visual change request saved locally');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Change request could not be saved', true);
    }
  };

  const handleUpdateReview = async (id: string, updates: Partial<Pick<ReviewRequest, 'note' | 'status' | 'target'>>) => {
    try {
      const result = await updateReview(id, updates);
      setReviews((current) => current.map((review) => review.id === id ? result.review : review));
      showToast(result.review.status === 'resolved' ? 'Change request resolved' : 'Change request reopened');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Change request could not be updated', true);
    }
  };

  const revisionLabel = useMemo(() => getRevisionLabel(activeVersion), [activeVersion]);

  return (
    <div className="director-shell">
      <aside className="director-rail" aria-label="Director sections">
        <div className="director-mark"><DirectorMark /></div>
        <nav className="director-nav">
          {sections.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'is-selected' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-safety"><i />No chain<br />No production writes</div>
      </aside>

      <header className="director-topbar">
        <div className="director-brand"><strong>Scicon Director</strong><span className="director-local-state"><i />Local only · 127.0.0.1:5174</span></div>
        <button className="version-trigger" type="button" title="Open version history" aria-label={`${revisionLabel} · open version history`} onClick={() => void loadVersionHistory()}>
          <span className="version-trigger__full">{revisionLabel} · history</span>
          <span className="version-trigger__short" aria-hidden="true">{revisionLabel}</span>
        </button>
        <div className="director-actions">
          <button className="button button--ghost" type="button" aria-label="Undo" disabled={!canUndo || saving || section === 'review'} onClick={handleUndo}><Icon name="undo" /><span>Undo</span></button>
          <button className="button button--ghost" type="button" aria-label="Reset" disabled={saving} onClick={() => void handleReset()}><Icon name="reset" /><span>Reset</span></button>
          <span className="action-divider" />
          <button className="button" type="button" aria-label="Save draft" disabled={saving} onClick={() => void handleSaveDraft()}><Icon name="save" /><span>{saving ? 'Saving…' : 'Save draft'}</span></button>
          <button className="button button--primary" type="button" aria-label="Publish" disabled={saving || section === 'review'} title={section === 'review' ? 'Review requests save automatically' : 'Publish a local configuration revision'} onClick={() => void handlePublish()}><Icon name="publish" /><span>Publish</span></button>
        </div>
      </header>

      <main className="director-main">
        {!ready ? <div className="director-loading">Opening local workspace</div> : null}
        {ready && section === 'scorecard' ? (
          <ScorecardStudio
            config={scorecard.value}
            runs={runs}
            onChange={scorecard.set}
            version={activeVersions.scorecard}
            status={lastAction}
            isDirty={scorecard.isDirty}
            isSaving={saving || loadingRuns}
            validationErrors={validationErrors}
            onRequestRealRuns={handleRealRuns}
          />
        ) : null}
        {ready && section === 'waves' ? (
          <WaveDirector config={waves.value} onChange={waves.set} version={activeVersions['wave-campaign']} status={lastAction} />
        ) : null}
        {ready && section === 'review' ? (
          <ReviewBoard
            reviews={reviews}
            versions={{ scorecard: activeVersions.scorecard, wave: activeVersions['wave-campaign'] }}
            status={lastAction}
            onCreate={handleCreateReview}
            onUpdate={handleUpdateReview}
          />
        ) : null}
      </main>

      <VersionHistory open={historyOpen} kind={activeKind} activeId={activeVersion} versions={versions} busy={saving} onClose={() => setHistoryOpen(false)} onRollback={handleRollback} />
      {toast ? <div className={`director-toast${toast.error ? ' director-toast--error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.message}</div> : null}
    </div>
  );
}
