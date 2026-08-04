import { useCallback, useEffect, useState } from 'react';
import { fetchProjectStatus, type ProjectStatus } from '@director/api/controlCenter';
import './project-guide.css';

const CANONICAL_BRANCH = 'codex/scicon-experimental';
const PROJECT_ROOT = 'C:\\Users\\scott\\Documents\\Scicon Shooter';
const LOCAL_GAME_URL = 'http://127.0.0.1:5179/?display=mobile-frame';
const LIVE_GAME_URL = 'https://sciconshooter.xyz';
const SUPABASE_REPORTS_URL = 'https://supabase.com/dashboard/project/ktdruljunithwopizorq/editor/18079?schema=public';
const SUPABASE_KEYS_URL = 'https://supabase.com/dashboard/project/ktdruljunithwopizorq/settings/api';

const EMPTY_STATUS: ProjectStatus = {
  state: 'unavailable',
  branch: null,
  head: null,
  subject: null,
  changedFileCount: 0,
  untrackedFileCount: 0,
  aheadOfMain: 0,
  behindMain: 0,
  mainContainsHead: null,
  checkedAt: null,
  message: null
};

const formatTimestamp = (value: string | null) => {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const buildProjectHandoff = (status: ProjectStatus) => [
  'Scicon Shooter handoff context',
  `Project root: ${PROJECT_ROOT}`,
  `Canonical work branch: ${CANONICAL_BRANCH}`,
  `Current branch: ${status.branch ?? 'unavailable'}`,
  `Current commit: ${status.head ?? 'unavailable'}${status.subject ? ` / ${status.subject}` : ''}`,
  `Working changes: ${status.changedFileCount}`,
  `Untracked files: ${status.untrackedFileCount}`,
  `Ahead/behind main: +${status.aheadOfMain} / -${status.behindMain}`,
  `Local game preview: ${LOCAL_GAME_URL}`,
  'Read docs/AI_COLLAB_WORKFLOW.md before changing files, starting servers, or using Git.'
].join('\n');

function GuideArrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function QuickLink({
  href,
  title,
  description,
  external = false
}: {
  href: string;
  title: string;
  description: string;
  external?: boolean;
}) {
  return (
    <a
      className="project-quick-link"
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <GuideArrow />
    </a>
  );
}

function StatusValue({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function ProjectGuide() {
  const [status, setStatus] = useState<ProjectStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchProjectStatus());
    } catch (reason) {
      setStatus(EMPTY_STATUS);
      setError(reason instanceof Error ? reason.message : 'Could not read local project status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const copyHandoff = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(buildProjectHandoff(status));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1_800);
    } catch {
      setCopyState('error');
    }
  };

  const onCanonicalBranch = status.branch === CANONICAL_BRANCH;
  const changeCount = status.changedFileCount;
  const trackedChangeCount = Math.max(0, status.changedFileCount - status.untrackedFileCount);
  const releaseLabel = status.aheadOfMain > 0 || status.behindMain > 0
    ? `+${status.aheadOfMain} / -${status.behindMain} vs main`
    : 'Aligned with main';

  return (
    <section className="project-guide" aria-labelledby="project-guide-title">
      <header className="project-guide__header">
        <div>
          <p>Owner guide and live local status</p>
          <h1 id="project-guide-title">Come back to the project without retracing every step.</h1>
          <span>
            This page keeps the important addresses, tool map, branch rules, and restart sequence
            in one place. Local Git status is read only.
          </span>
        </div>
        <div className="project-guide__actions">
          <button type="button" onClick={() => void copyHandoff()}>
            {copyState === 'copied' ? 'Handoff copied' : 'Copy context for Codex'}
          </button>
          <button type="button" onClick={() => void loadStatus()} disabled={loading}>
            {loading ? 'Checking...' : 'Refresh status'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="project-guide__notice" role="status">
          <strong>Live Git status is unavailable, but the guide still works.</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {copyState === 'error' ? (
        <div className="project-guide__notice" role="alert">
          Clipboard access was blocked. You can still copy the values below individually.
        </div>
      ) : null}

      <section className="project-status" aria-labelledby="project-status-title">
        <header>
          <div>
            <p>Where the code is now</p>
            <h2 id="project-status-title">Project status</h2>
          </div>
          <span data-state={error ? 'unavailable' : onCanonicalBranch ? 'ready' : 'attention'}>
            {error ? 'Status unavailable' : onCanonicalBranch ? 'Canonical worktree' : 'Check branch'}
          </span>
        </header>
        <div className="project-status__values">
          <StatusValue
            label="Branch"
            value={status.branch ?? CANONICAL_BRANCH}
            detail={onCanonicalBranch || !status.branch ? 'Experimental implementation branch' : 'Expected codex/scicon-experimental'}
          />
          <StatusValue
            label="Current commit"
            value={status.head ? status.head.slice(0, 10) : 'Unavailable'}
            detail={status.subject ?? 'Refresh status when the local service is running'}
          />
          <StatusValue
            label="Working copy"
            value={changeCount === 0 ? 'Clean' : `${changeCount} change${changeCount === 1 ? '' : 's'}`}
            detail={`${trackedChangeCount} tracked / ${status.untrackedFileCount} untracked`}
          />
          <StatusValue
            label="Release relationship"
            value={releaseLabel}
            detail="Main remains the deployment branch"
          />
        </div>
        <footer>Checked {formatTimestamp(status.checkedAt)}</footer>
      </section>

      <div className="project-guide__layout">
        <section className="project-return" aria-labelledby="project-return-title">
          <header>
            <p>Start here next time</p>
            <h2 id="project-return-title">Four steps to get oriented</h2>
          </header>
          <ol>
            <li>
              <span>01</span>
              <div><strong>Open the Control Center</strong><p>Use the desktop shortcut. This overview is the permanent starting point.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>Read Project status</strong><p>Confirm the experimental branch and note any unfinished working changes.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>Review player reports</strong><p>Open the report inbox before starting new feature work.</p></div>
            </li>
            <li>
              <span>04</span>
              <div><strong>Open the right workshop</strong><p>Boss Sandbox for bosses, Missions for campaign content, or Combat Lab for isolated tests.</p></div>
            </li>
          </ol>
        </section>

        <section className="project-addresses" aria-labelledby="project-addresses-title">
          <header>
            <p>Known addresses</p>
            <h2 id="project-addresses-title">Open the correct copy</h2>
          </header>
          <dl>
            <div><dt>Project folder</dt><dd><code>{PROJECT_ROOT}</code></dd></div>
            <div><dt>Local Control Center</dt><dd><a href="/">127.0.0.1:5174</a></dd></div>
            <div><dt>Shared local game</dt><dd><a href={LOCAL_GAME_URL} target="_blank" rel="noreferrer">127.0.0.1:5179 / mobile frame</a></dd></div>
            <div><dt>Live game</dt><dd><a href={LIVE_GAME_URL} target="_blank" rel="noreferrer">sciconshooter.xyz</a></dd></div>
          </dl>
        </section>
      </div>

      <section className="project-tools" aria-labelledby="project-tools-title">
        <header>
          <div>
            <p>Tool map</p>
            <h2 id="project-tools-title">Choose by the job you are doing</h2>
          </div>
          <span>Every Director tool stays local</span>
        </header>
        <div>
          <QuickLink href="/reports" title="Player Reports" description="Review bugs, feedback, crash context, and copy a clean report for Codex." />
          <QuickLink href="/bosses" title="Boss Sandbox" description="Preview and tune bosses on the canonical game stage." />
          <QuickLink href="/missions" title="Mission Builder" description="Author campaign Missions, Waves, and review surfaces." />
          <QuickLink href="/sandbox" title="Combat Lab" description="Run focused encounter, formation, loadout, and balance tests." />
          <QuickLink href="/assets" title="Asset Library" description="Inspect safe catalog artwork and generated game assets." />
          <QuickLink href="/analytics" title="Playtest Analytics" description="Compare bounded local playtest sessions and balance metrics." />
        </div>
      </section>

      <aside className="project-report-help" aria-labelledby="project-report-help-title">
        <div>
          <p>One-time report inbox setup</p>
          <h2 id="project-report-help-title">If reports say "not connected"</h2>
          <span>
            Put the project URL and a server-only Supabase secret in the root <code>.env.local</code>.
            Never paste a secret into the browser or commit it to Git. Reopen the Control Center
            after setup so its trusted local cache can refresh.
          </span>
        </div>
        <div>
          <a href={SUPABASE_KEYS_URL} target="_blank" rel="noreferrer">Open API keys in Supabase (external)</a>
          <a href={SUPABASE_REPORTS_URL} target="_blank" rel="noreferrer">Open reports table in Supabase (external)</a>
        </div>
      </aside>
    </section>
  );
}
