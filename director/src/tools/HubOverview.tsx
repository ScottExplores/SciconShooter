import {
  AUTHORING_DESCRIPTORS,
  type AuthoringDescriptor,
  type HubToolStatus
} from '../app/authoringRegistry';

const statusCopy: Record<HubToolStatus, string> = {
  live: 'Available now',
  'shared-surface': 'Shared tool',
  foundation: 'Foundation',
  legacy: 'Read only'
};

const visibleTools = AUTHORING_DESCRIPTORS.filter((descriptor) => (
  descriptor.navigation && descriptor.id !== 'overview' && descriptor.id !== 'legacy'
));

function ToolCard({ descriptor }: { descriptor: AuthoringDescriptor }) {
  return (
    <a className="hub-tool-card" href={descriptor.path}>
      <span className="hub-tool-card__glyph" aria-hidden="true">{descriptor.glyph}</span>
      <span className="hub-tool-card__copy">
        <span className="hub-tool-card__meta">
          <small>{descriptor.eyebrow}</small>
          <em data-status={descriptor.status}>{statusCopy[descriptor.status]}</em>
        </span>
        <strong>{descriptor.label}</strong>
        <span>{descriptor.description}</span>
      </span>
      <span className="hub-tool-card__arrow" aria-hidden="true">→</span>
    </a>
  );
}

export function HubOverview() {
  return (
    <div className="hub-overview">
      <section className="hub-hero" aria-labelledby="hub-overview-title">
        <div>
          <p>One local authoring environment</p>
          <h1 id="hub-overview-title">Build the game from here.</h1>
          <span>
            Mission Builder and Combat Lab now live behind one stable Developer Hub.
            Every playable preview continues through the real SciCon Shooter stage.
          </span>
        </div>
        <dl aria-label="Developer Hub safety boundary">
          <div><dt>Runtime</dt><dd>Canonical game stage</dd></div>
          <div><dt>Workspace</dt><dd>Local checkout</dd></div>
          <div><dt>Shipping gate</dt><dd>Git + Apply to game</dd></div>
        </dl>
      </section>

      <section className="hub-overview__section" aria-labelledby="hub-tools-title">
        <header>
          <div>
            <p>Authoring registry</p>
            <h2 id="hub-tools-title">Tools</h2>
          </div>
          <span>{visibleTools.length} stable routes</span>
        </header>
        <div className="hub-tool-grid">
          {visibleTools.map((descriptor) => <ToolCard key={descriptor.id} descriptor={descriptor} />)}
        </div>
      </section>

      <aside className="hub-workflow" aria-label="Recommended content workflow">
        <span>Idea</span><i aria-hidden="true">→</i>
        <span>Author</span><i aria-hidden="true">→</i>
        <span>Preview</span><i aria-hidden="true">→</i>
        <span>Sandbox</span><i aria-hidden="true">→</i>
        <span>Review</span><i aria-hidden="true">→</i>
        <span>Apply</span>
      </aside>
    </div>
  );
}
