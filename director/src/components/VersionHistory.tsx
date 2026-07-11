import { Icon } from './Icon';
import type { ConfigKind, VersionEnvelope } from '../domain/types';

interface VersionHistoryProps {
  open: boolean;
  kind: ConfigKind;
  activeId: string;
  versions: VersionEnvelope<unknown>[];
  busy?: boolean;
  onClose: () => void;
  onRollback: (versionId: string) => void | Promise<void>;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Local revision';
};

export const VersionHistory = ({ open, kind, activeId, versions, busy, onClose, onRollback }: VersionHistoryProps) => {
  if (!open) return null;
  return (
    <div className="version-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="version-drawer" role="dialog" aria-modal="true" aria-labelledby="version-title">
        <header>
          <div><p>{kind === 'scorecard' ? 'Scorecard config' : 'Wave campaign'}</p><h2 id="version-title">Version history</h2></div>
          <button type="button" aria-label="Close version history" onClick={onClose}>×</button>
        </header>
        <p className="version-explainer">Rollback creates a new local revision. Existing history is never rewritten.</p>
        <div className="version-list">
          {versions.map((version) => {
            const active = version.id === activeId;
            return (
              <article key={version.id} className={active ? 'is-active' : ''}>
                <div className="version-row-heading"><strong>Revision {version.revision}</strong>{active ? <span>Active</span> : null}</div>
                <p>{version.changeNote || 'Local Director publish'}</p>
                <dl><div><dt>Created</dt><dd>{formatDate(version.createdAt)}</dd></div><div><dt>Hash</dt><dd>{version.contentHash.replace('sha256:', '').slice(0, 10)}</dd></div></dl>
                <button className="button button--ghost" type="button" disabled={active || busy} onClick={() => void onRollback(version.id)}><Icon name="reset" />Rollback into new revision</button>
              </article>
            );
          })}
          {versions.length === 0 ? <p className="empty-copy">No local versions found.</p> : null}
        </div>
      </aside>
    </div>
  );
};
